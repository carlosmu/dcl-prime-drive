/**
 * Configuration shared between client and server.
 *
 * Everything the server needs to validate a race lives here: if the client
 * and the server don't share exactly the same numbers, anti-cheat validation
 * rejects legitimate races.
 */

// ─── Track ───────────────────────────────────────────────────────────────────

/**
 * The scene is 32x32 parcels with base 16,0.
 *
 * Scene coordinates are relative to the base parcel, so X runs from -256 to
 * 256 and Z from 0 to 512: the origin is NOT a corner. Anything that has to
 * span the whole scene must be anchored on `SCENE_CENTER`, not on a half-size.
 */
export const SCENE = {
  /** Scene size in X (32 parcels). */
  widthM: 512,
  /** Scene size in Z (32 parcels). */
  depthM: 512,
  /** Local X of the west edge (base parcel is 16 columns from the west one). */
  minX: -256,
  /** Local Z of the south edge. */
  minZ: 0
} as const

/** Center of the scene, where the ground and the backdrop are anchored. */
export const SCENE_CENTER = {
  x: SCENE.minX + SCENE.widthM / 2,
  z: SCENE.minZ + SCENE.depthM / 2
} as const

export const TRACK = {
  /** Center of the road in X. */
  centerX: 32,
  /** Offsets of the 3 lanes relative to `centerX`. */
  laneOffsets: [-4, 0, 4],
  /** Fixed Z of the player. The world moves toward them, the player never advances. */
  playerZ: 24,
  /** Z where buildings, coins, and obstacles are born. */
  spawnZ: 300,
  /** Z where they get recycled (behind the player). */
  despawnZ: 6,
  /** Road width. */
  roadWidth: 14,
  /** Length of the drawn road segment. */
  roadLength: 320,
  /** X of the two rows of buildings. */
  buildingX: [16, 48],
  /** Height of the road surface. */
  roadY: 0.05
} as const

export const LANE_COUNT = TRACK.laneOffsets.length

export function laneToX(lane: number): number {
  const clamped = Math.max(0, Math.min(LANE_COUNT - 1, lane))
  return TRACK.centerX + TRACK.laneOffsets[clamped]
}

// ─── Race ─────────────────────────────────────────────────────────────────

export const RACE = {
  /** Total race distance, in meters. */
  distanceM: 8000,
  /** How often, in meters, a checkpoint is reported to the server. */
  checkpointIntervalM: 100,
  /** Cruise speed with the throttle released, in m/s (108 km/h). */
  baseSpeed: 30,
  /** Speed ceiling with the throttle held (spacebar), in m/s (180 km/h). */
  maxSpeed: 50,
  /** Seconds to cover 95% of the gap up to the target speed when accelerating. */
  accelTime: 2.5,
  /** Seconds to cover 95% of the gap back down to `baseSpeed` after releasing. */
  decelTime: 1.5,
  /** Braking with S, in m/s². Constant, like a brake: it does reach a stop. */
  brakeDecel: 20,
  /** Speed the bike drops to after crashing. Recovers along the accel curve. */
  crashSpeed: 14,
  /** Blue diamond: added on top of the target speed, in m/s (+50 km/h). */
  padBoostSpeed: 50 / 3.6,
  /** Seconds the blue diamond lasts. Grabbing another one restarts it. */
  padBoostSeconds: 10,
  /** Oil slick: the speed is multiplied by this on contact, then recovers along the accel curve. */
  oilSpeedFactor: 0.6,
  /** Crashes that end the race. */
  lives: 3,
  /** Seconds of invulnerability after a crash. */
  crashInvulnerability: 1.6,
  /** Countdown before starting. */
  countdownSeconds: 3
} as const

export const CHECKPOINT_COUNT = Math.floor(RACE.distanceM / RACE.checkpointIntervalM)

/**
 * Speed after `dt` seconds chasing `target`.
 *
 * Exponential approach: the bike gains (or sheds) speed fast while far from
 * the target and eases off as it closes in, so the curve never snaps. The
 * time constant is derived so that `accelTime` / `decelTime` cover 95% of the
 * gap (e^-3 ≈ 5%, hence ln 20). Rising toward the target always uses the
 * accel curve, which is also what recovers the bike after a crash.
 */
export function approachSpeed(speed: number, target: number, dt: number): number {
  const time = speed < target ? RACE.accelTime : RACE.decelTime
  const tau = time / Math.log(20)
  return target + (speed - target) * Math.exp(-dt / tau)
}

/** The fastest the bike can ever go: full throttle with a blue diamond active. */
export const TOP_SPEED = RACE.maxSpeed + RACE.padBoostSpeed

/**
 * Theoretical minimum time to cover `distanceM`, in ms.
 *
 * Nothing can outrun `TOP_SPEED`, so the floor assumes the bike sits at it
 * from the first meter, as if diamonds were chained end to end. The real race
 * is slower (it starts at `baseSpeed` and has to accelerate), which keeps
 * legitimate races safely above the floor.
 */
export function idealTimeMs(distanceM: number): number {
  return (Math.max(0, distanceM) / TOP_SPEED) * 1000
}

/** Tolerance margin over `idealTimeMs` (lag, frame jitter). */
export const TIME_TOLERANCE = 0.03

/** Maximum allowed drift between the client's clock and the server's, in ms. */
export const CLOCK_DRIFT_TOLERANCE_MS = 8000

// ─── Economy ────────────────────────────────────────────────────────────────

export const ECONOMY = {
  /** Cap on coins the spawner can generate every 100 m. */
  maxCoinsPerCheckpoint: 14,
  /** Bonus for reaching the finish line. */
  finishBonus: 100,
  /** Extra bonus for beating the track record. */
  recordBonus: 200,
  /** Paid per life left at the finish line: crashes don't subtract, surviving them clean pays. */
  livesBonus: 25,
  /** Starting coins for a new wallet. */
  startingCoins: 0
} as const

/** Cap on collectible coins up to a given distance. Anti-cheat ceiling. */
export function maxCoinsAt(distanceM: number): number {
  const checkpoints = Math.ceil(Math.max(0, distanceM) / RACE.checkpointIntervalM)
  return checkpoints * ECONOMY.maxCoinsPerCheckpoint
}

// ─── Spawner ─────────────────────────────────────────────────────────────────

export const SPAWN = {
  /** Meters between coin waves. */
  coinWaveEveryM: 46,
  /** Coins per wave. */
  coinsPerWave: [3, 4, 5, 6],
  /** Z spacing within a wave. */
  coinSpacingZ: 4,
  /** Meters between obstacles at the start. */
  obstacleEveryStartM: 90,
  /** Meters between obstacles at the end (the track gets harder). */
  obstacleEveryEndM: 38,
  /** Meters between buildings per side. */
  buildingEveryM: 26,
  /** Meters between lane divider stripes. */
  laneStripeEveryM: 8,
  /** Meters between track edge pieces. */
  trackEdgeEveryM: 4,
  /** Meters between pads (oil slick or blue diamond), give or take `padJitterM`. */
  padEveryM: 80,
  padJitterM: 25,
  /** Share of pads that are oil slicks; the rest are blue diamonds. */
  oilChance: 0.5
} as const

// ─── Skins ───────────────────────────────────────────────────────────────────

export type SkinDef = {
  id: string
  name: string
  model: string
  price: number
  /** Name of the running animation clip inside the .glb. */
  goClip: string
  idleClip: string
  /** One-shot clips played on a lane change, one per direction. */
  turnLClip: string
  turnRClip: string
  tint: { r: number; g: number; b: number }
}

/**
 * The only bike model so far: every skin points at it until the rest are
 * authored. Its rig carries the turn animations, so the lean is played
 * rather than rolled from code — see `bike.ts`.
 */
const BIKE_MODEL = 'assets/models/newbike_01.glb'

/**
 * Clip names inside `newbike_01.glb`.
 *
 * It has no separate running clip, so `goClip` reuses the idle one; a future
 * model can override any of these per skin.
 */
const BIKE_CLIPS = {
  goClip: 'Bike_idle',
  idleClip: 'Bike_idle',
  turnLClip: 'Bike_turn_L',
  turnRClip: 'Bike_turn_R'
} as const

export const SKINS: SkinDef[] = [
  {
    id: 'nomad',
    name: 'Nomad',
    model: BIKE_MODEL,
    price: 0,
    ...BIKE_CLIPS,
    tint: { r: 0.35, g: 0.85, b: 1 }
  },
  {
    id: 'volt',
    name: 'Volt',
    model: BIKE_MODEL,
    price: 10000,
    ...BIKE_CLIPS,
    tint: { r: 0.6, g: 1, b: 0.35 }
  },
  {
    id: 'crimson',
    name: 'Crimson',
    model: BIKE_MODEL,
    price: 20000,
    ...BIKE_CLIPS,
    tint: { r: 1, g: 0.35, b: 0.35 }
  },
  {
    id: 'obsidian',
    name: 'Obsidian Strike',
    model: BIKE_MODEL,
    price: 30000,
    ...BIKE_CLIPS,
    tint: { r: 1, g: 0.82, b: 0.3 }
  }
]

export const DEFAULT_SKIN_ID = SKINS[0].id

export function findSkin(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

// ─── Track identifier ──────────────────────────────────────────────────

/** Changing this id invalidates saved records and ghosts (useful when rebalancing). */
export const TRACK_ID = 'neon-mile-v3'

// ─── Utilities ──────────────────────────────────────────────────────────────

/** A ghost is only replayable if it has one split per checkpoint up to the finish line. */
export function isCompleteGhost(splits: number[]): boolean {
  return splits.length === CHECKPOINT_COUNT
}

export function formatTime(totalMs: number): string {
  const safe = Math.max(0, Math.floor(totalMs))
  const minutes = Math.floor(safe / 60000)
  const seconds = Math.floor((safe % 60000) / 1000)
  const centis = Math.floor((safe % 1000) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.floor(meters)} m`
}
