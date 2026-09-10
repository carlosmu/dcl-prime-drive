import { Animator, Entity, GltfContainer, Transform, VisibilityComponent, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { LANE_COUNT, SKINS, TRACK, findSkin, laneToX } from '../../shared/config'

/**
 * The player's bike.
 *
 * The avatar rides it frozen on top and can't be moved from scene code, so
 * the bike doesn't travel either: it stays planted at the center of the road
 * and the world slides around it (see `setWorldOffset` in track.ts).
 * `currentX` is the lane it logically occupies — obstacles are tested against
 * it. It doesn't roll from code either: the lean lives in the model's own
 * `Bike_turn_L`/`Bike_turn_R` clips, fired once per lane change.
 *
 * The four skins are instantiated at startup and toggled with
 * `VisibilityComponent`: swapping `GltfContainer.src` on the fly would
 * reload the GLB and cut the animation mid-race.
 */

/**
 * Y rotation of the model so it faces +Z, which is the direction it runs.
 *
 * The bike GLBs already face forward, so no rotation is needed. The ghost
 * uses the same models and reads this same constant.
 */
export const BIKE_YAW_DEG = 0

/** Lane change speed, in m/s. */
const LANE_SPEED = 14
/**
 * Length of `Bike_turn_L`/`Bike_turn_R`, in seconds.
 *
 * The clips are one-shot, and nothing reports back when one ends, so the
 * bike counts the time down itself and returns to idle. Keep this in sync
 * with the GLB if the animations are re-exported.
 */
const TURN_DURATION = 0.484

let root: Entity = engine.RootEntity
const skinEntities = new Map<string, Entity>()

let currentSkinId = SKINS[0].id
let targetLane = 1
let currentX = laneToX(1)
/** Direction of the turn clip currently playing: 1 right, -1 left, 0 none. */
let turnDirection = 0
let turnRemaining = 0

export function buildBike() {
  root = engine.addEntity()
  Transform.create(root, {
    position: Vector3.create(TRACK.centerX, TRACK.roadY + 0.1, TRACK.playerZ),
    rotation: Quaternion.fromEulerDegrees(0, BIKE_YAW_DEG, 0)
  })

  for (const skin of SKINS) {
    const entity = engine.addEntity()
    GltfContainer.create(entity, { src: skin.model })
    Transform.create(entity, { parent: root })
    Animator.create(entity, {
      states: [
        { clip: skin.idleClip, playing: true, loop: true },
        // `goClip` may be the idle one (see `BIKE_CLIPS`): declaring the same
        // clip twice would give the Animator two states with one name.
        ...(skin.goClip === skin.idleClip ? [] : [{ clip: skin.goClip, playing: false, loop: true }]),
        { clip: skin.turnLClip, playing: false, loop: false },
        { clip: skin.turnRClip, playing: false, loop: false }
      ]
    })
    VisibilityComponent.create(entity, { visible: skin.id === currentSkinId })
    skinEntities.set(skin.id, entity)
  }
}

export function setSkin(skinId: string) {
  const skin = findSkin(skinId)
  if (skin.id === currentSkinId) return
  currentSkinId = skin.id
  for (const [id, entity] of skinEntities) {
    VisibilityComponent.getMutable(entity).visible = id === skin.id
  }
}

export function getSkinId(): string {
  return currentSkinId
}

/** Looping run clip. */
export function playGo() {
  const skin = findSkin(currentSkinId)
  const entity = skinEntities.get(skin.id)
  if (entity) Animator.playSingleAnimation(entity, skin.goClip, false)
}

export function playIdle() {
  const skin = findSkin(currentSkinId)
  const entity = skinEntities.get(skin.id)
  if (entity) Animator.playSingleAnimation(entity, skin.idleClip, false)
}

export function setLane(lane: number) {
  const clamped = Math.max(0, Math.min(LANE_COUNT - 1, lane))
  if (clamped === targetLane) return
  const direction = Math.sign(clamped - targetLane)
  targetLane = clamped
  playTurn(direction)
}

/**
 * Plays the lean for a lane change, once.
 *
 * The clip runs ~0.97 s while the slide itself takes ~0.29 s, so the bike is
 * already in its new lane by the time it finishes straightening up. That's
 * intentional: the animation is the whole lean, and it's restarted from the
 * top when a second lane change comes in before it ends.
 */
function playTurn(direction: number) {
  turnDirection = direction
  turnRemaining = TURN_DURATION
  const skin = findSkin(currentSkinId)
  const entity = skinEntities.get(skin.id)
  if (entity) Animator.playSingleAnimation(entity, direction > 0 ? skin.turnRClip : skin.turnLClip, true)
}

export function moveLane(direction: number): number {
  setLane(targetLane + direction)
  return targetLane
}

export function getLane(): number {
  return targetLane
}

export function getBikeX(): number {
  return currentX
}

export function getBikeY(): number {
  return Transform.get(root).position.y
}

/**
 * Which way the bike is leaning: 1 right, -1 left, 0 while upright.
 *
 * Follows the turn clip rather than the lateral slide, so the rider banks on
 * the frame the key is pressed and stands back up when the bike's own
 * animation does.
 */
export function getTurnDirection(): number {
  return turnDirection
}

export function resetBike() {
  targetLane = 1
  currentX = laneToX(1)
  turnDirection = 0
  turnRemaining = 0
  playIdle()
}

/** Interpolates the lateral slide and runs down the turn clip. */
export function updateBike(dt: number) {
  const targetX = laneToX(targetLane)
  const diff = targetX - currentX
  const step = LANE_SPEED * dt
  if (Math.abs(diff) <= step) currentX = targetX
  else currentX += Math.sign(diff) * step

  if (turnRemaining > 0) {
    turnRemaining -= dt
    if (turnRemaining <= 0) {
      turnRemaining = 0
      turnDirection = 0
      playIdle()
    }
  }
}
