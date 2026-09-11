import { Animator, AudioSource, Entity, GltfContainer, Material, MeshRenderer, Transform, engine } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { LANE_COUNT, RACE, SPAWN, TRACK, laneToX } from '../../shared/config'
import { getWorldRoot } from './track'
import { duckMusic } from './music'

/**
 * Coins, obstacles, and checkpoint arches.
 *
 * Everything comes from pools created at startup: during the race only
 * Transforms move. Inactive pieces are parked at Y = -200, out of camera view.
 */

const COIN_MODEL = 'assets/models/coin.glb'
const COIN_IDLE_CLIP = '0. idle'
const COIN_CATCH_CLIP = '1. catch'
const CONE_MODEL = 'assets/models/obstacle_cone.glb'
const ARCH_MODEL = 'assets/models/obstacle_gate.glb'

const COIN_SFX = 'assets/sounds/coin.mp3'
const CRASH_SFX = 'assets/sounds/lose_a_chance.mp3'
const WIN_SFX = 'assets/sounds/won.mp3'
/** Length of WIN_SFX: the background track stays silent for exactly that long. */
const WIN_SFX_SECONDS = 9

/** Meters of track visible ahead of the player. */
const LOOKAHEAD_M = TRACK.spawnZ - TRACK.playerZ

const PARKED_Y = -200
const COIN_Y = 0.4
const COIN_POOL_SIZE = 44
const OBSTACLE_POOL_SIZE = 20
const ARCH_POOL_SIZE = 4

const ARCH_SCALE_Y = 1.1
/** The arch's origin is 0.92 m above the mesh's base. */
const ARCH_BASE_Y = 0.92 * ARCH_SCALE_Y

/**
 * Barrier width, in meters.
 *
 * The barrier is a primitive rather than a GLB on purpose: the catalog model
 * carried its own transform on its nodes (+14 m in Y, -17 m in Z) that left
 * the mesh far from the entity's position. Collision is calculated against
 * the entity, so the player would crash into nothing. With a box, what's
 * seen and what collides are the same size by construction.
 */
const BARRIER_WIDTH = 2.9
const BARRIER_HEIGHT = 1.1
const BARRIER_DEPTH = 0.4

/** Half-width of the bike, for the collision test. */
const BIKE_HALF_WIDTH = 0.55
/** Extra margin to grab coins: rewards the attempt, doesn't punish the pixel. */
const COIN_GRAB_HALF_WIDTH = 1.5

type PoolItem = {
  entity: Entity
  active: boolean
  /** Already crossed the player and was grabbed/hit: keeps traveling but no longer scores. */
  consumed: boolean
  /** Effective half-width of the obstacle. */
  halfWidth: number
  /**
   * Y at which the piece is activated.
   *
   * Each model's origin sits in a different spot relative to its base, so
   * without this some would float and others would end up buried.
   */
  spawnY: number
  /**
   * Seconds left pinned on the bike playing the catch clip. While it runs the
   * piece no longer travels with the track.
   */
  catchTimer?: number
}

/** How long a grabbed coin stays on the bike playing its catch clip. */
const COIN_CATCH_SECONDS = 0.6
/** Height a grabbed coin is lifted to, so the rider doesn't cover it. */
const COIN_CATCH_Y = 1.8

const coins: PoolItem[] = []
const obstacles: PoolItem[] = []
const arches: PoolItem[] = []

let coinSfx: Entity[] = []
let coinSfxIndex = 0
let crashSfx: Entity = engine.RootEntity
let winSfx: Entity = engine.RootEntity

/** Meters until the next coin wave / next obstacle / next arch. */
let nextCoinWaveAtM = 0
let nextObstacleAtM = 0
let nextArchAtM = 0

export type SpawnEvents = {
  onCoin: () => void
  onCrash: () => void
}

export function buildSpawner() {
  for (let i = 0; i < COIN_POOL_SIZE; i++) {
    const entity = engine.addEntity()
    GltfContainer.create(entity, { src: COIN_MODEL })
    Transform.create(entity, {
      parent: getWorldRoot(),
      position: Vector3.create(TRACK.centerX, PARKED_Y, 0),
      scale: Vector3.create(2.4, 2.4, 2.4)
    })
    Animator.create(entity, {
      states: [
        { clip: COIN_IDLE_CLIP, playing: true, loop: true },
        { clip: COIN_CATCH_CLIP, playing: false, loop: false }
      ]
    })
    coins.push({ entity, active: false, consumed: false, halfWidth: COIN_GRAB_HALF_WIDTH, spawnY: COIN_Y })
  }

  for (let i = 0; i < OBSTACLE_POOL_SIZE; i++) {
    obstacles.push(i % 2 === 0 ? buildBarrier() : buildCone())
  }

  for (let i = 0; i < ARCH_POOL_SIZE; i++) {
    const entity = engine.addEntity()
    GltfContainer.create(entity, { src: ARCH_MODEL })
    Transform.create(entity, {
      parent: getWorldRoot(),
      position: Vector3.create(TRACK.centerX, PARKED_Y, 0),
      rotation: Quaternion.fromEulerDegrees(0, 90, 0),
      scale: Vector3.create(1, ARCH_SCALE_Y, 3.2)
    })
    arches.push({ entity, active: false, consumed: false, halfWidth: 0, spawnY: ARCH_BASE_Y })
  }

  coinSfx = []
  for (let i = 0; i < 5; i++) {
    const entity = engine.addEntity()
    Transform.create(entity, { position: Vector3.create(TRACK.centerX, 2, TRACK.playerZ) })
    AudioSource.create(entity, { audioClipUrl: COIN_SFX, loop: false, playing: false, global: true, volume: 1 })
    coinSfx.push(entity)
  }

  crashSfx = engine.addEntity()
  Transform.create(crashSfx, { position: Vector3.create(TRACK.centerX, 2, TRACK.playerZ) })
  AudioSource.create(crashSfx, { audioClipUrl: CRASH_SFX, loop: false, playing: false, global: true, volume: 0.8 })

  winSfx = engine.addEntity()
  Transform.create(winSfx, { position: Vector3.create(TRACK.centerX, 2, TRACK.playerZ) })
  AudioSource.create(winSfx, { audioClipUrl: WIN_SFX, loop: false, playing: false, global: true, volume: 1 })
}

/**
 * Barrier: dark box with an emissive stripe on top, matching the same visual
 * language as the track rails. Measures exactly what its collision measures.
 */
function buildBarrier(): PoolItem {
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent: getWorldRoot(),
    position: Vector3.create(TRACK.centerX, PARKED_Y, 0),
    scale: Vector3.create(BARRIER_WIDTH, BARRIER_HEIGHT, BARRIER_DEPTH)
  })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(0.16, 0.06, 0.04, 1),
    roughness: 0.7,
    metallic: 0
  })

  const stripe = engine.addEntity()
  Transform.create(stripe, {
    parent: entity,
    position: Vector3.create(0, 0.42, 0),
    scale: Vector3.create(1.04, 0.22, 1.15)
  })
  MeshRenderer.setBox(stripe)
  Material.setPbrMaterial(stripe, {
    albedoColor: Color4.create(1, 0.45, 0.1, 1),
    emissiveColor: Color3.create(1, 0.4, 0.05),
    emissiveIntensity: 3,
    roughness: 0.3,
    metallic: 0
  })

  return {
    entity,
    active: false,
    consumed: false,
    halfWidth: BARRIER_WIDTH / 2,
    // DCL's box is centered on its origin: half its height rests it on the ground.
    spawnY: BARRIER_HEIGHT / 2
  }
}

function buildCone(): PoolItem {
  const entity = engine.addEntity()
  GltfContainer.create(entity, { src: CONE_MODEL })
  Transform.create(entity, {
    parent: getWorldRoot(),
    position: Vector3.create(TRACK.centerX, PARKED_Y, 0),
    scale: Vector3.create(3, 3, 3)
  })
  return { entity, active: false, consumed: false, halfWidth: 0.7, spawnY: 0 }
}

/** Finish-line jingle. */
export function playWinSfx() {
  duckMusic(WIN_SFX_SECONDS)
  AudioSource.createOrReplace(winSfx, {
    audioClipUrl: WIN_SFX,
    loop: false,
    playing: true,
    global: true,
    volume: 1,
    currentTime: 0
  })
}

/** Returns everything to the pool and resets the spawn counters. */
export function resetSpawner() {
  for (const pool of [coins, obstacles, arches]) {
    for (const item of pool) park(item)
  }
  nextCoinWaveAtM = 60
  nextObstacleAtM = SPAWN.obstacleEveryStartM
  nextArchAtM = RACE.checkpointIntervalM
}

/**
 * Populates the track before the start, so the countdown doesn't run over
 * empty asphalt.
 */
export function prefillSpawner() {
  spawnDue(0)
}

/**
 * One simulation frame.
 *
 * @param delta meters traveled this frame
 * @param distanceM total distance traveled
 * @param bikeX bike's current X
 * @param canBeHit false during post-crash invulnerability
 */
export function updateSpawner(
  dt: number,
  delta: number,
  distanceM: number,
  bikeX: number,
  canBeHit: boolean,
  events: SpawnEvents
) {
  spawnDue(distanceM)

  moveAndTest(coins, dt, delta, bikeX, (item, dx) => {
    if (dx > COIN_GRAB_HALF_WIDTH) return false
    // Pinned on the bike instead of traveling on toward the camera: on narrow
    // (mobile) screens the coin left the frame before the clip could be seen.
    const transform = Transform.getMutable(item.entity)
    transform.position.x = bikeX
    transform.position.y = COIN_CATCH_Y
    transform.position.z = TRACK.playerZ
    item.catchTimer = COIN_CATCH_SECONDS
    Animator.playSingleAnimation(item.entity, COIN_CATCH_CLIP, true)
    playCoinSfx()
    events.onCoin()
    return true
  })

  moveAndTest(obstacles, dt, delta, bikeX, (item, dx) => {
    if (!canBeHit) return false
    if (dx > item.halfWidth + BIKE_HALF_WIDTH) return false
    AudioSource.createOrReplace(crashSfx, {
      audioClipUrl: CRASH_SFX,
      loop: false,
      playing: true,
      global: true,
      volume: 0.8,
      currentTime: 0
    })
    events.onCrash()
    return true
  })

  moveAndTest(arches, dt, delta, bikeX, () => false)
}

/**
 * Moves a pool and notifies when a piece crosses the player's plane.
 *
 * The test is crossing-based, not proximity-based: at 60 m/s and 30 fps a
 * piece advances 2 m per frame and a distance window would skip right over it.
 *
 * Consumed pieces aren't parked immediately: obstacles keep traveling until
 * out of camera view, and a grabbed coin stays pinned on the bike (see
 * `catchTimer`) until its catch animation has played.
 */
function moveAndTest(
  pool: PoolItem[],
  dt: number,
  delta: number,
  bikeX: number,
  onCross: (item: PoolItem, dx: number) => boolean
) {
  for (const item of pool) {
    if (!item.active) continue

    if (item.catchTimer !== undefined && item.catchTimer > 0) {
      item.catchTimer -= dt
      // Follows the bike across lanes so it doesn't hang where it was grabbed.
      Transform.getMutable(item.entity).position.x = bikeX
      if (item.catchTimer <= 0) park(item)
      continue
    }

    const transform = Transform.getMutable(item.entity)
    const previousZ = transform.position.z
    const z = previousZ - delta
    transform.position.z = z

    if (!item.consumed && previousZ > TRACK.playerZ && z <= TRACK.playerZ) {
      if (onCross(item, Math.abs(transform.position.x - bikeX))) item.consumed = true
    }

    if (z < TRACK.despawnZ) park(item)
  }
}

function park(item: PoolItem) {
  item.active = false
  item.consumed = false
  item.catchTimer = 0
  const transform = Transform.getMutable(item.entity)
  transform.position.y = PARKED_Y
  transform.position.z = 0
}

// --- Spawns -----------------------------------------------------------------

/**
 * Schedules what enters the scene.
 *
 * Each spawn has a scheduled track distance: the exact meter at which the
 * piece passes in front of the player. It's placed at
 * `playerZ + (scheduled - traveled)`, which at steady state lands exactly at
 * `spawnZ`, and at startup leaves the track already populated instead of 10
 * seconds of empty asphalt.
 */
function spawnDue(distanceM: number) {
  const horizonM = distanceM + LOOKAHEAD_M

  while (nextCoinWaveAtM <= horizonM) {
    spawnCoinWave(zForSchedule(nextCoinWaveAtM, distanceM))
    nextCoinWaveAtM += SPAWN.coinWaveEveryM
  }

  while (nextObstacleAtM <= horizonM) {
    spawnObstacleGroup(zForSchedule(nextObstacleAtM, distanceM))
    nextObstacleAtM += obstacleIntervalAt(nextObstacleAtM)
  }

  while (nextArchAtM <= horizonM) {
    spawnArch(zForSchedule(nextArchAtM, distanceM))
    nextArchAtM += RACE.checkpointIntervalM
  }
}

function zForSchedule(scheduledAtM: number, distanceM: number): number {
  return TRACK.playerZ + (scheduledAtM - distanceM)
}

/** The track gets harder: obstacles get closer together as it progresses. */
function obstacleIntervalAt(distanceM: number): number {
  const progress = Math.max(0, Math.min(1, distanceM / RACE.distanceM))
  return SPAWN.obstacleEveryStartM + (SPAWN.obstacleEveryEndM - SPAWN.obstacleEveryStartM) * progress
}

function spawnCoinWave(z: number) {
  const lane = randomInt(0, LANE_COUNT - 1)
  const count = SPAWN.coinsPerWave[randomInt(0, SPAWN.coinsPerWave.length - 1)]
  const x = laneToX(lane)
  for (let i = 0; i < count; i++) {
    const item = takeFree(coins)
    if (!item) return
    activate(item, x, z + i * SPAWN.coinSpacingZ)
    Animator.playSingleAnimation(item.entity, COIN_IDLE_CLIP, true)
  }
}

/**
 * Blocks one or two lanes, never all three: there's always a way through.
 */
function spawnObstacleGroup(z: number) {
  const blocked = Math.random() < 0.35 ? 2 : 1
  const lanes = shuffledLanes().slice(0, blocked)
  for (const lane of lanes) {
    const item = takeFree(obstacles)
    if (!item) return
    activate(item, laneToX(lane), z)
  }
}

function spawnArch(z: number) {
  const item = takeFree(arches)
  if (!item) return
  activate(item, TRACK.centerX, z)
}

function takeFree(pool: PoolItem[]): PoolItem | null {
  for (const item of pool) {
    if (!item.active) return item
  }
  return null
}

function activate(item: PoolItem, x: number, z: number) {
  item.active = true
  item.consumed = false
  const transform = Transform.getMutable(item.entity)
  transform.position.x = x
  transform.position.y = item.spawnY
  transform.position.z = z
}

function playCoinSfx() {
  const entity = coinSfx[coinSfxIndex]
  coinSfxIndex = (coinSfxIndex + 1) % coinSfx.length
  AudioSource.createOrReplace(entity, {
    audioClipUrl: COIN_SFX,
    loop: false,
    playing: true,
    global: true,
    volume: 1,
    currentTime: 0
  })
}

// --- Helpers ----------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffledLanes(): number[] {
  const lanes: number[] = []
  for (let i = 0; i < LANE_COUNT; i++) lanes.push(i)
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    const tmp = lanes[i]
    lanes[i] = lanes[j]
    lanes[j] = tmp
  }
  return lanes
}
