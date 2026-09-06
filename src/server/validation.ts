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
  /** Reloj del servidor al recibir `raceStart`. */
  startedAtMs: number
  /** Último checkpoint aceptado (0 = ninguno). */
  lastCheckpoint: number
  /** elapsedMs del último checkpoint aceptado. */
  lastElapsedMs: number
  /** Splits acumulados, en ms, uno por checkpoint aceptado. */
  splits: number[]
  coins: number
  crashes: number
  /** Se pone en true al primer rechazo: la carrera ya no otorga nada. */
  invalidated: boolean
  invalidReason: string
  finished: boolean
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
    finished: false
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
 * Valida un checkpoint contra el reloj del servidor y contra el tiempo mínimo
 * físicamente posible.
 *
 * El servidor no puede ver la posición real del jugador —en esta escena el
 * avatar está quieto y es el mundo el que se mueve—, así que la autoridad se
 * apoya en tres cosas que sí controla: su propio reloj, la curva de velocidad
 * determinista de `shared/config` y el techo de monedas por tramo.
 */
export function validateCheckpoint(run: RunState, report: CheckpointReport, nowMs: number): ValidationResult {
  if (run.finished) return reject('carrera ya finalizada')
  if (report.index !== run.lastCheckpoint + 1) {
    return reject(`checkpoint fuera de orden (esperaba ${run.lastCheckpoint + 1}, llegó ${report.index})`)
  }
  if (report.index > CHECKPOINT_COUNT) return reject('checkpoint más allá de la meta')
  if (report.elapsedMs <= run.lastElapsedMs) return reject('el tiempo no avanzó entre checkpoints')

  const distanceM = report.index * RACE.checkpointIntervalM
  const floorMs = idealTimeMs(distanceM) * (1 - TIME_TOLERANCE)
  if (report.elapsedMs < floorMs) {
    return reject(`tiempo imposible: ${Math.round(report.elapsedMs)} ms para ${distanceM} m`)
  }

  // El reloj del cliente no puede correr más rápido que el del servidor.
  const serverElapsed = nowMs - run.startedAtMs
  if (report.elapsedMs > serverElapsed + CLOCK_DRIFT_TOLERANCE_MS) {
    return reject('reloj del cliente adelantado')
  }
  if (serverElapsed > report.elapsedMs + CLOCK_DRIFT_TOLERANCE_MS) {
    return reject('reloj del cliente atrasado')
  }

  if (report.coins < run.coins) return reject('el contador de monedas retrocedió')
  if (report.coins > maxCoinsAt(distanceM)) return reject('más monedas de las que la pista genera')

  if (report.crashes < run.crashes) return reject('el contador de choques retrocedió')
  if (report.crashes > RACE.lives) return reject('más choques de los que permite la carrera')

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

/** Valida el cierre de carrera. Una carrera invalidada antes no se rescata acá. */
export function validateFinish(run: RunState, report: FinishReport, nowMs: number): ValidationResult {
  if (run.invalidated) return reject(run.invalidReason || 'carrera invalidada')
  if (run.finished) return reject('carrera ya finalizada')

  if (report.elapsedMs < run.lastElapsedMs) return reject('el tiempo final es menor al último checkpoint')
  if (report.coins < run.coins) return reject('el contador de monedas retrocedió')
  if (report.coins > maxCoinsAt(report.distanceM)) return reject('más monedas de las que la pista genera')

  const serverElapsed = nowMs - run.startedAtMs
  if (Math.abs(serverElapsed - report.elapsedMs) > CLOCK_DRIFT_TOLERANCE_MS) {
    return reject('reloj del cliente desincronizado')
  }

  if (report.completed) {
    if (run.lastCheckpoint < CHECKPOINT_COUNT) {
      return reject(`meta reportada con ${run.lastCheckpoint}/${CHECKPOINT_COUNT} checkpoints`)
    }
    if (report.elapsedMs < idealTimeMs(RACE.distanceM) * (1 - TIME_TOLERANCE)) {
      return reject('tiempo final imposible')
    }
  } else {
    // Carrera abandonada: la distancia no puede superar lo que confirman los checkpoints.
    const maxDistance = (run.lastCheckpoint + 1) * RACE.checkpointIntervalM
    if (report.distanceM > maxDistance) return reject('distancia no respaldada por checkpoints')
  }

  return OK
}

/** Distancia confirmada por checkpoints. Es lo que se muestra a los rivales. */
export function confirmedDistanceM(run: RunState): number {
  return run.lastCheckpoint * RACE.checkpointIntervalM
}
