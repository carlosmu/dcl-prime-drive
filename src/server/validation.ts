import {
  CHECKPOINT_COUNT,
  CLOCK_DRIFT_TOLERANCE_MS,
  RACE,
  TIME_TOLERANCE,
  idealTimeMs,
  maxCoinsAt
} from '../shared/config'

export type RunState = {
  address: string
  name: string
  skinId: string
  /** Server clock when `raceStart` was received. */
  startedAtMs: number
  /** Last accepted checkpoint (0 = none). */
  lastCheckpoint: number
  /** elapsedMs of the last accepted checkpoint. */
  lastElapsedMs: number
  /** Accumulated splits, in ms, one per accepted checkpoint. */
  splits: number[]
  coins: number
  crashes: number
  /** Set to true on the first rejection: the race no longer grants anything. */
  invalidated: boolean
  invalidReason: string
  finished: boolean
  /** Server clock when the current pause began (0 = not paused). */
  pausedAtMs: number
  /** Total ms spent in already-closed pauses. */
  pausedTotalMs: number
}

/** Race time according to the server: wall clock since the start, minus pauses. */
export function activeElapsedMs(run: RunState, nowMs: number): number {
  const openPause = run.pausedAtMs > 0 ? nowMs - run.pausedAtMs : 0
  return nowMs - run.startedAtMs - run.pausedTotalMs - openPause
}

export function setPaused(run: RunState, paused: boolean, nowMs: number) {
  if (paused && run.pausedAtMs === 0) {
    run.pausedAtMs = nowMs
  } else if (!paused && run.pausedAtMs > 0) {
    run.pausedTotalMs += nowMs - run.pausedAtMs
    run.pausedAtMs = 0
  }
}

export function createRun(address: string, name: string, skinId: string, nowMs: number): RunState {
  return {
    address,
    name,
    skinId,
    startedAtMs: nowMs,
    lastCheckpoint: 0,
    lastElapsedMs: 0,
    splits: [],
    coins: 0,
    crashes: 0,
    invalidated: false,
    invalidReason: '',
    finished: false,
    pausedAtMs: 0,
    pausedTotalMs: 0
  }
}

export type CheckpointReport = {
  index: number
  elapsedMs: number
  coins: number
  crashes: number
}

export type ValidationResult = { ok: true } | { ok: false; reason: string }

const OK: ValidationResult = { ok: true }

function reject(reason: string): ValidationResult {
  return { ok: false, reason }
}

/**
 * Validates a checkpoint against the server's clock and the physically
 * minimum possible time.
 *
 * The server can't see the player's real position — in this scene the avatar
 * stays still and it's the world that moves — so authority relies on three
 * things it does control: its own clock, the deterministic speed curve from
 * `shared/config`, and the coin cap per segment.
 */
export function validateCheckpoint(run: RunState, report: CheckpointReport, nowMs: number): ValidationResult {
  if (run.finished) return reject('race already finished')
  if (report.index !== run.lastCheckpoint + 1) {
    return reject(`checkpoint out of order (expected ${run.lastCheckpoint + 1}, got ${report.index})`)
  }
  if (report.index > CHECKPOINT_COUNT) return reject('checkpoint beyond the finish line')
  if (report.elapsedMs <= run.lastElapsedMs) return reject('time did not advance between checkpoints')

  const distanceM = report.index * RACE.checkpointIntervalM
  const floorMs = idealTimeMs(distanceM) * (1 - TIME_TOLERANCE)
  if (report.elapsedMs < floorMs) {
    return reject(`impossible time: ${Math.round(report.elapsedMs)} ms for ${distanceM} m`)
  }

  // The client's clock can't run faster than the server's.
  const serverElapsed = activeElapsedMs(run, nowMs)
  if (report.elapsedMs > serverElapsed + CLOCK_DRIFT_TOLERANCE_MS) {
    return reject('client clock ahead')
  }
  if (serverElapsed > report.elapsedMs + CLOCK_DRIFT_TOLERANCE_MS) {
    return reject('client clock behind')
  }

  if (report.coins < run.coins) return reject('coin counter went backwards')
  if (report.coins > maxCoinsAt(distanceM)) return reject('more coins than the track can generate')

  if (report.crashes < run.crashes) return reject('crash counter went backwards')
  if (report.crashes > RACE.lives) return reject('more crashes than the race allows')

  return OK
}

export function applyCheckpoint(run: RunState, report: CheckpointReport) {
  run.lastCheckpoint = report.index
  run.lastElapsedMs = report.elapsedMs
  run.splits.push(report.elapsedMs)
  run.coins = report.coins
  run.crashes = report.crashes
}

export type FinishReport = {
  completed: boolean
  elapsedMs: number
  distanceM: number
  coins: number
  crashes: number
}

/** Validates the race finish. A race already invalidated is not rescued here. */
export function validateFinish(run: RunState, report: FinishReport, nowMs: number): ValidationResult {
  if (run.invalidated) return reject(run.invalidReason || 'race invalidated')
  if (run.finished) return reject('race already finished')

  if (report.elapsedMs < run.lastElapsedMs) return reject('final time is less than the last checkpoint')
  if (report.coins < run.coins) return reject('coin counter went backwards')
  if (report.coins > maxCoinsAt(report.distanceM)) return reject('more coins than the track can generate')

  const serverElapsed = activeElapsedMs(run, nowMs)
  if (Math.abs(serverElapsed - report.elapsedMs) > CLOCK_DRIFT_TOLERANCE_MS) {
    return reject('client clock out of sync')
  }

  if (report.completed) {
    if (run.lastCheckpoint < CHECKPOINT_COUNT) {
      return reject(`finish reported with ${run.lastCheckpoint}/${CHECKPOINT_COUNT} checkpoints`)
    }
    if (report.elapsedMs < idealTimeMs(RACE.distanceM) * (1 - TIME_TOLERANCE)) {
      return reject('impossible final time')
    }
  } else {
    // Abandoned race: distance can't exceed what the checkpoints confirm.
    const maxDistance = (run.lastCheckpoint + 1) * RACE.checkpointIntervalM
    if (report.distanceM > maxDistance) return reject('distance not backed by checkpoints')
  }

  return OK
}

/** Distance confirmed by checkpoints. This is what's shown to rivals. */
export function confirmedDistanceM(run: RunState): number {
  return run.lastCheckpoint * RACE.checkpointIntervalM
}
