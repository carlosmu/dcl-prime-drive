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
 * Leaderboard ghosts, one bike per replayable time.
 *
 * The server sends the splits of each leaderboard time (ms at each 100 m
 * checkpoint). The client interpolates them to know what meter each run was
 * at at this same moment of the race, and places its bike ahead or behind
 * depending on the gap with the player. It's a clock, not a simulation: the
 * ghosts don't dodge anything or collect coins.
 *
 * Their lanes aren't part of the runs either, so they're chosen to stay out
 * of the player's way: a ghost leaves the player's lane for the one farthest
 * from it, which keeps the bikes from overlapping when they ride side by side.
 */

/** A ghost run as the race feeds it to `updateGhosts`. */
export type GhostRunView = { name: string; totalMs: number; distanceM: number }

const GHOST_SKIN = findSkin('obsidian')
/** How far ahead/behind the player a ghost is drawn before hiding it. */
const VISIBLE_AHEAD = 90
const VISIBLE_BEHIND = 25
/** Lane change speed, in m/s: one lane (4 m) in ~0.6 s, the full road in ~1.1 s. */
const GHOST_LANE_SPEED = 7

type GhostBike = {
  root: Entity
  label: Entity
  lane: number
  x: number
  visible: boolean
}

/** Grows on demand: one bike per ghost the server has sent so far. */
const bikes: GhostBike[] = []

/**
 * The player starts in the middle lane, so ghosts start on the sides,
 * alternating, to spread out rather than stack on one.
 */
function startLane(index: number): number {
  return index % 2 === 0 ? LANE_COUNT - 1 : 0
}

function buildGhostBike(index: number): GhostBike {
  const lane = startLane(index)
  const x = laneToX(lane)

  const root = engine.addEntity()
  Transform.create(root, {
    parent: getWorldRoot(),
    position: Vector3.create(x, TRACK.roadY + 0.25, TRACK.playerZ),
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

  const label = engine.addEntity()
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

  return { root, label, lane, x, visible: false }
}

function labelText(ownerName: string, totalMs: number): string {
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  // Times saved without a display name carry the short wallet address: never show it.
  const name = ownerName && !ownerName.startsWith('0x') ? ownerName : 'RECORD'
  return `${name}\n${minutes}:${String(seconds).padStart(2, '0')}`
}

function setVisible(bike: GhostBike, visible: boolean) {
  if (bike.visible === visible) return
  bike.visible = visible
  VisibilityComponent.getMutable(bike.root).visible = visible
  VisibilityComponent.getMutable(bike.label).visible = visible
}

export function hideGhosts() {
  for (const bike of bikes) setVisible(bike, false)
}

/**
 * The lane farthest from the player's. On a tie (player in the middle) the
 * ghost keeps its lane unless it's the player's own; then the index breaks
 * the tie, so ghosts leaving together split to both sides.
 */
function pickLane(bike: GhostBike, index: number, playerLane: number): number {
  if (bike.lane !== playerLane) {
    const farthest = Math.max(playerLane, LANE_COUNT - 1 - playerLane)
    if (Math.abs(bike.lane - playerLane) === farthest) return bike.lane
  }
  const left = playerLane
  const right = LANE_COUNT - 1 - playerLane
  if (left === right) return startLane(index)
  return left > right ? 0 : LANE_COUNT - 1
}

/**
 * Places every ghost based on its distance gap with the player, in the lane
 * that keeps it clear of them. Bikes beyond `ghosts.length` stay hidden.
 */
export function updateGhosts(ghosts: GhostRunView[], playerDistanceM: number, playerLane: number, dt: number) {
  while (bikes.length < ghosts.length) bikes.push(buildGhostBike(bikes.length))

  for (let i = 0; i < bikes.length; i++) {
    const bike = bikes[i]
    const ghost = ghosts[i]
    if (!ghost) {
      setVisible(bike, false)
      continue
    }

    bike.lane = pickLane(bike, i, playerLane)
    const targetX = laneToX(bike.lane)

    const gap = ghost.distanceM - playerDistanceM
    if (gap > VISIBLE_AHEAD || gap < -VISIBLE_BEHIND || ghost.distanceM >= RACE.distanceM) {
      // Out of sight it just snaps: there's no one to see it slide.
      bike.x = targetX
      setVisible(bike, false)
      continue
    }

    const text = labelText(ghost.name, ghost.totalMs)
    if (TextShape.get(bike.label).text !== text) TextShape.getMutable(bike.label).text = text
    setVisible(bike, true)

    const diff = targetX - bike.x
    const step = GHOST_LANE_SPEED * dt
    bike.x = Math.abs(diff) <= step ? targetX : bike.x + Math.sign(diff) * step

    const transform = Transform.getMutable(bike.root)
    transform.position.x = bike.x
    transform.position.z = TRACK.playerZ + gap
  }
}
