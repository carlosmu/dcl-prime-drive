import { DEFAULT_SKIN_ID, RACE } from '../shared/config'

export type Phase =
  /** Main menu / garage. */
  | 'menu'
  /** Countdown before starting. */
  | 'countdown'
  /** Racing. */
  | 'racing'
  /** Finish line crossed, waiting for the server's validation. */
  | 'finished'
  /** Out of lives. */
  | 'wrecked'

export type StandingEntry = {
  address: string
  name: string
  distanceM: number
  elapsedMs: number
  finished: boolean
}

export type RaceResult = {
  completed: boolean
  accepted: boolean
  reason: string
  elapsedMs: number
  coinsAwarded: number
  /** Breakdown of `coinsAwarded`, as the server computed it. */
  coinsPicked: number
  finishBonus: number
  recordBonus: number
  livesBonus: number
  newRecord: boolean
  pending: boolean
  /** The race ran without a server: there was nothing to credit. */
  offline: boolean
}

/**
 * Connection state with the authoritative server.
 *
 * `offline` is not a fatal error: the race is still playable, it just doesn't
 * credit coins or save records. It keeps retrying in the background.
 */
export type NetStatus = 'connecting' | 'online' | 'offline'

/**
 * All the state the UI reads and the systems write.
 *
 * It's a plain mutable object on purpose: React-ECS re-renders every frame
 * reading straight from here, with no hooks or subscriptions.
 */
export const state = {
  phase: 'menu' as Phase,

  // --- Profile (server authority) ---
  netStatus: 'connecting' as NetStatus,
  myAddress: '',
  myName: '',
  coins: 0,
  ownedSkins: [DEFAULT_SKIN_ID] as string[],
  equippedSkin: DEFAULT_SKIN_ID,
  bestTimeMs: 0,
  racesFinished: 0,

  // --- Race in progress ---
  distanceM: 0,
  speed: 0,
  runCoins: 0,
  crashes: 0,
  elapsedMs: 0,
  lane: 1,
  /** The spacebar (or the HUD button) is held down right now. */
  boosting: false,
  countdown: 0,
  /** Pause menu open: the race simulation is frozen. */
  paused: false,
  invulnerableFor: 0,
  lastCheckpointSent: 0,
  /** Seconds left waiting for the server's verdict after the finish line. */
  resultWaitFor: 0,
  /** The server rejected a checkpoint: the race no longer pays out. */
  invalidated: false,
  invalidReason: '',

  // --- Comparison ---
  ghostAvailable: false,
  ghostName: '',
  ghostTotalMs: 0,
  ghostSplits: [] as number[],
  /** Ghost's current distance, in meters. */
  ghostDistanceM: 0,
  standings: [] as StandingEntry[],
  leaderboard: [] as { name: string; timeMs: number }[],
  recordHolder: '',
  recordTimeMs: 0,

  // --- Diagnostics ---
  /** Client's monotonic clock, in seconds. Always advances, even in the menu. */
  clock: 0,
  /** Last `tick` received from the server. -1 = none ever arrived. */
  serverTick: -1,
  serverUptimeSeconds: 0,
  serverConnectedPlayers: 0,
  /** Value of `clock` when the tick last changed. */
  serverTickAtClock: 0,
  /** Value of `clock` when the last message from the server arrived. */
  lastMessageAtClock: -1,
  messagesReceived: 0,
  stateSynced: false,

  // --- UI ---
  screen: 'home' as 'home' | 'garage' | 'ranking' | 'tutorial',
  /** Index into LEVELS: what the Race tab's selector is showing. */
  selectedLevel: 0,
  musicOn: true,
  /** Hidden by default: opened by tapping the menu logo 10 times. */
  debugOn: false,
  result: null as RaceResult | null,
  toast: '',
  toastTimer: 0
}

export function isOnline(): boolean {
  return state.netStatus === 'online'
}

export function livesLeft(): number {
  return Math.max(0, RACE.lives - state.crashes)
}

export function showToast(message: string, seconds = 3) {
  state.toast = message
  state.toastTimer = seconds
}

export function resetRunState() {
  state.distanceM = 0
  state.speed = 0
  state.runCoins = 0
  state.crashes = 0
  state.elapsedMs = 0
  state.lane = 1
  state.boosting = false
  state.paused = false
  state.invulnerableFor = 0
  state.lastCheckpointSent = 0
  state.resultWaitFor = 0
  state.invalidated = false
  state.invalidReason = ''
  state.ghostDistanceM = 0
  state.result = null
}

/**
 * Ghost's distance at a given instant, interpolating its splits.
 *
 * `splits[i]` is the ms at which the ghost reached meter (i+1)*100, so the
 * distance between two splits is interpolated linearly: within 100 m the
 * speed is practically constant.
 */
export function ghostDistanceAt(elapsedMs: number, splits: number[], intervalM: number): number {
  if (splits.length === 0) return 0
  if (elapsedMs <= 0) return 0
  if (elapsedMs >= splits[splits.length - 1]) return splits.length * intervalM

  let low = 0
  let high = splits.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (splits[mid] < elapsedMs) low = mid + 1
    else high = mid
  }

  const upperMs = splits[low]
  const lowerMs = low === 0 ? 0 : splits[low - 1]
  const span = upperMs - lowerMs
  const progress = span > 0 ? (elapsedMs - lowerMs) / span : 0
  return (low + progress) * intervalM
}
