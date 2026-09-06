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
 * it. It does roll, though: a rotation is the one thing the rider can match,
 * through an animation on its own rig.
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
/** Maximum lean angle when changing lanes, in degrees. */
const MAX_LEAN_DEG = 30
/** How fast the lean follows the lateral movement. */
const LEAN_RESPONSE = 8

let root: Entity = engine.RootEntity
const skinEntities = new Map<string, Entity>()

let currentSkinId = SKINS[0].id
let targetLane = 1
let currentX = laneToX(1)
let lean = 0

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
        { clip: skin.goClip, playing: false, loop: true }
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
  targetLane = Math.max(0, Math.min(LANE_COUNT - 1, lane))
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

/** Current roll in degrees, positive when sliding toward +X. Drives the rider's pose. */
export function getBikeLean(): number {
  return lean
}

export function resetBike() {
  targetLane = 1
  currentX = laneToX(1)
  lean = 0
  applyTransform()
}

/** Interpolates the lateral slide and the lean. */
export function updateBike(dt: number) {
  const targetX = laneToX(targetLane)
  const diff = targetX - currentX
  const step = LANE_SPEED * dt

  let velocity = 0
  if (Math.abs(diff) <= step) {
    velocity = diff / Math.max(dt, 0.0001)
    currentX = targetX
  } else {
    const move = Math.sign(diff) * step
    velocity = move / Math.max(dt, 0.0001)
    currentX += move
  }

  const targetLean = Math.max(-1, Math.min(1, velocity / LANE_SPEED)) * MAX_LEAN_DEG
  lean += (targetLean - lean) * Math.min(1, LEAN_RESPONSE * dt)
  applyTransform()
}

function applyTransform() {
  // Only the roll: the bike never leaves the center of the road, since
  // `currentX` is the lane it logically occupies and the world is what slides
  // sideways (see `setWorldOffset` in track.ts). The rider matches this angle
  // through its own animation — see `RIDE_POSES` in race.ts.
  Transform.getMutable(root).rotation = Quaternion.fromEulerDegrees(0, BIKE_YAW_DEG, -lean)
}
