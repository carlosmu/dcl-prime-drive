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
  distanceM: 10000,
  /** How often, in meters, a checkpoint is reported to the server. */
  checkpointIntervalM: 100,
  /** Speed at the start, in m/s. */
  baseSpeed: 26,
  /** Speed at the finish line, in m/s. */
  topSpeed: 62,
  /** Speed the bike drops to after crashing. */
  crashSpeed: 14,
  /** Acceleration recovering the target speed, in m/s². */
  recoverRate: 14,
  /** Speed multiplier while boost is held (spacebar). */
  boostMultiplier: 1.4,
  /** Acceleration entering boost, in m/s². */
  boostRate: 30,
  /** Deceleration when releasing boost, in m/s². */
  boostFalloffRate: 24,
  /** Crashes that end the race. */
  lives: 3,
  /** Seconds of invulnerability after a crash. */
  crashInvulnerability: 1.6,
  /** Countdown before starting. */
  countdownSeconds: 3
} as const

export const CHECKPOINT_COUNT = Math.floor(RACE.distanceM / RACE.checkpointIntervalM)

/** Slope of the speed ramp: v(d) = baseSpeed + SPEED_SLOPE * d. */
const SPEED_SLOPE = (RACE.topSpeed - RACE.baseSpeed) / RACE.distanceM

/** Target speed at a given distance. Deterministic: the server replicates it. */
export function targetSpeedAt(distanceM: number): number {
  const d = Math.max(0, Math.min(RACE.distanceM, distanceM))
  return RACE.baseSpeed + SPEED_SLOPE * d
}

/**
 * Target speed with boost held. It's the bike's absolute ceiling:
 * `idealTimeMs` integrates this curve, not `targetSpeedAt`'s.
 */
export function boostedSpeedAt(distanceM: number): number {
  return targetSpeedAt(distanceM) * RACE.boostMultiplier
}

/**
 * Theoretical minimum time to cover `distanceM`, in ms.
 *
 * With v(d) = (a + k·d)·m, integrating dt = dd/v(d) gives t = ln((a + k·d)/a) / (k·m).
 * The `m` factor is the boost: the floor assumes the perfect race with the
 * spacebar held down from end to end, which is the fastest the scene can go.
 * Without it, a legitimate race with boost would fall below the floor and
 * the server would reject it.
 */
export function idealTimeMs(distanceM: number): number {
  const d = Math.max(0, distanceM)
  const a = RACE.baseSpeed
  const m = RACE.boostMultiplier
  if (SPEED_SLOPE <= 0) return (d / (a * m)) * 1000
  return (Math.log((a + SPEED_SLOPE * d) / a) / (SPEED_SLOPE * m)) * 1000
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
  trackEdgeEveryM: 4
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
    price: 1500,
    ...BIKE_CLIPS,
    tint: { r: 0.6, g: 1, b: 0.35 }
  },
  {
    id: 'crimson',
    name: 'Crimson',
    model: BIKE_MODEL,
    price: 4000,
    ...BIKE_CLIPS,
    tint: { r: 1, g: 0.35, b: 0.35 }
  },
  {
    id: 'obsidian',
    name: 'Obsidian Strike',
    model: BIKE_MODEL,
    price: 9000,
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
export const TRACK_ID = 'neon-mile-v2'

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
