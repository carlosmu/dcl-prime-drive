import {
  Animator,
  Billboard,
  Entity,
  GltfContainer,
  GltfNodeModifiers,
  MaterialTransparencyMode,
  TextShape,
  Transform,
  VisibilityComponent,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { LANE_COUNT, RACE, TRACK, findSkin, laneToX } from '../../shared/config'
import { BIKE_YAW_DEG } from './bike'
import { getWorldRoot } from './track'

/**
 * Track record ghost.
 *
 * The server sends the splits of the best time (ms at each 100 m checkpoint).
 * The client interpolates them to know what meter the record was at at this
 * same moment of the race, and places the ghost bike ahead or behind
 * depending on the gap with the player. It's a clock, not a simulation: the
 * ghost doesn't dodge anything or collect coins.
 *
 * Its lane isn't part of the record either, so it's chosen to stay out of
 * the player's way: always the lane farthest from theirs, which keeps the two
 * bikes from overlapping when they ride side by side.
 */

const GHOST_SKIN = findSkin('obsidian')
/** How far ahead/behind the player it's drawn before hiding it. */
const VISIBLE_AHEAD = 90
const VISIBLE_BEHIND = 25
/** Lane change speed, in m/s: one lane (4 m) in ~0.6 s, the full road in ~1.1 s. */
const GHOST_LANE_SPEED = 7

/** The player starts in the middle lane, so the ghost starts on the right. */
const START_LANE = LANE_COUNT - 1
let ghostLane = START_LANE
let ghostX = laneToX(START_LANE)

let root: Entity = engine.RootEntity
let label: Entity = engine.RootEntity
let visible = false

export function buildGhost() {
  root = engine.addEntity()
  Transform.create(root, {
    parent: getWorldRoot(),
    position: Vector3.create(ghostX, TRACK.roadY + 0.25, TRACK.playerZ),
    rotation: Quaternion.fromEulerDegrees(0, BIKE_YAW_DEG, 0)
  })
  GltfContainer.create(root, { src: GHOST_SKIN.model })
  GltfNodeModifiers.create(root, {
    modifiers: [
      {
        path: '',
        material: {
          material: {
            $case: 'pbr',
            pbr: {
              albedoColor: Color4.create(0, 1, 1, 0.1),
              transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
              emissiveColor: Color4.create(0, 1, 1, 0.1),
              emissiveIntensity: 0.1
            }
          }
        }
      }
    ]
  })
  Animator.create(root, {
    states: [{ clip: GHOST_SKIN.goClip, playing: true, loop: true }]
  })
  VisibilityComponent.create(root, { visible: false })

  label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(0, 2.6, 0), parent: root })
  TextShape.create(label, {
    text: 'GHOST',
    fontSize: 2.6,
    textColor: Color4.create(0.6, 0.9, 1, 0.9),
    outlineWidth: 0.15,
    outlineColor: Color4.create(0, 0, 0, 1)
  })
  Billboard.create(label, {})
  VisibilityComponent.create(label, { visible: false })
}

export function setGhostLabel(ownerName: string, totalMs: number) {
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  // Records saved without a display name carry the short wallet address: never show it.
  const name = ownerName && !ownerName.startsWith('0x') ? ownerName : 'RECORD'
  TextShape.getMutable(label).text = `${name}\n${minutes}:${String(seconds).padStart(2, '0')}`
}

export function hideGhost() {
  if (!visible) return
  visible = false
  VisibilityComponent.getMutable(root).visible = false
  VisibilityComponent.getMutable(label).visible = false
}

/**
 * The lane farthest from the player's. On a tie (player in the middle) the
 * ghost keeps its lane unless it's the player's own.
 */
function pickLane(playerLane: number): number {
  let best = ghostLane
  let bestDistance = ghostLane === playerLane ? -1 : Math.abs(ghostLane - playerLane)
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const distance = Math.abs(lane - playerLane)
    if (distance > bestDistance) {
      best = lane
      bestDistance = distance
    }
  }
  return best
}

/**
 * Places the ghost based on the distance gap with the player, in the lane
 * that keeps it clear of them.
 */
export function updateGhost(playerDistanceM: number, ghostDistanceM: number, playerLane: number, dt: number) {
  ghostLane = pickLane(playerLane)
  const targetX = laneToX(ghostLane)

  const gap = ghostDistanceM - playerDistanceM
  if (gap > VISIBLE_AHEAD || gap < -VISIBLE_BEHIND || ghostDistanceM >= RACE.distanceM) {
    // Out of sight it just snaps: there's no one to see it slide.
    ghostX = targetX
    hideGhost()
    return
  }

  const diff = targetX - ghostX
  const step = GHOST_LANE_SPEED * dt
  ghostX = Math.abs(diff) <= step ? targetX : ghostX + Math.sign(diff) * step

  if (!visible) {
    visible = true
    VisibilityComponent.getMutable(root).visible = true
    VisibilityComponent.getMutable(label).visible = true
  }

  const transform = Transform.getMutable(root)
  transform.position.x = ghostX
  transform.position.z = TRACK.playerZ + gap
}
