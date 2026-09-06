/**
 * Configuración compartida entre cliente y servidor.
 *
 * Todo lo que el servidor necesita para validar una carrera vive acá: si el
 * cliente y el servidor no comparten exactamente los mismos números, la
 * validación anti-cheat rechaza carreras legítimas.
 */

// ─── Pista ───────────────────────────────────────────────────────────────────

/** La escena es de 4x20 parcelas: 64 m en X, 320 m en Z. */
export const TRACK = {
  /** Centro de la calzada en X. */
  centerX: 32,
  /** Offsets de los 3 carriles respecto a `centerX`. */
  laneOffsets: [-4, 0, 4],
  /** Z fijo del jugador. El mundo se mueve hacia él, el jugador nunca avanza. */
  playerZ: 24,
  /** Z donde nacen edificios, monedas y obstáculos. */
  spawnZ: 300,
  /** Z donde se reciclan (detrás del jugador). */
  despawnZ: 6,
  /** Ancho de la calzada. */
  roadWidth: 14,
  /** Largo del tramo de calzada dibujado. */
  roadLength: 320,
  /** X de las dos hileras de edificios. */
  buildingX: [16, 48],
  /** Altura del suelo de la calzada. */
  roadY: 0.05
} as const

export const LANE_COUNT = TRACK.laneOffsets.length

export function laneToX(lane: number): number {
  const clamped = Math.max(0, Math.min(LANE_COUNT - 1, lane))
  return TRACK.centerX + TRACK.laneOffsets[clamped]
}

// ─── Carrera ─────────────────────────────────────────────────────────────────

export const RACE = {
  /** Distancia total de una carrera, en metros. */
  distanceM: 10000,
  /** Cada cuántos metros se reporta un checkpoint al servidor. */
  checkpointIntervalM: 100,
  /** Velocidad al arrancar, en m/s. */
  baseSpeed: 26,
  /** Velocidad al cruzar la meta, en m/s. */
  topSpeed: 62,
  /** Velocidad a la que cae la moto tras chocar. */
  crashSpeed: 14,
  /** Aceleración con la que recupera la velocidad objetivo, en m/s². */
  recoverRate: 14,
  /** Multiplicador de velocidad mientras se mantiene el boost (barra espaciadora). */
  boostMultiplier: 1.4,
  /** Aceleración al entrar en boost, en m/s². */
  boostRate: 30,
  /** Desaceleración al soltar el boost, en m/s². */
  boostFalloffRate: 24,
  /** Choques que terminan la carrera. */
  lives: 3,
  /** Segundos de invulnerabilidad tras un choque. */
  crashInvulnerability: 1.6,
  /** Cuenta regresiva antes de arrancar. */
  countdownSeconds: 3
} as const

export const CHECKPOINT_COUNT = Math.floor(RACE.distanceM / RACE.checkpointIntervalM)

/** Pendiente de la rampa de velocidad: v(d) = baseSpeed + SPEED_SLOPE * d. */
const SPEED_SLOPE = (RACE.topSpeed - RACE.baseSpeed) / RACE.distanceM

/** Velocidad objetivo a una distancia dada. Determinista: el servidor la replica. */
export function targetSpeedAt(distanceM: number): number {
  const d = Math.max(0, Math.min(RACE.distanceM, distanceM))
  return RACE.baseSpeed + SPEED_SLOPE * d
}

/**
 * Velocidad objetivo con el boost mantenido. Es el techo absoluto de la moto:
 * `idealTimeMs` integra esta curva, no la de `targetSpeedAt`.
 */
export function boostedSpeedAt(distanceM: number): number {
  return targetSpeedAt(distanceM) * RACE.boostMultiplier
}

/**
 * Tiempo mínimo teórico para recorrer `distanceM`, en ms.
 *
 * Con v(d) = (a + k·d)·m, integrar dt = dd/v(d) da t = ln((a + k·d)/a) / (k·m).
 * El factor `m` es el boost: el piso asume la carrera perfecta con la barra
 * espaciadora apretada de punta a punta, que es lo más rápido que la escena
 * puede ir. Sin él, una carrera legítima con boost caería por debajo del piso
 * y el servidor la rechazaría.
 */
export function idealTimeMs(distanceM: number): number {
  const d = Math.max(0, distanceM)
  const a = RACE.baseSpeed
  const m = RACE.boostMultiplier
  if (SPEED_SLOPE <= 0) return (d / (a * m)) * 1000
  return (Math.log((a + SPEED_SLOPE * d) / a) / (SPEED_SLOPE * m)) * 1000
}

/** Margen de tolerancia sobre `idealTimeMs` (lag, jitter de frames). */
export const TIME_TOLERANCE = 0.03

/** Desfase máximo permitido entre el reloj del cliente y el del servidor, en ms. */
export const CLOCK_DRIFT_TOLERANCE_MS = 8000

// ─── Economía ────────────────────────────────────────────────────────────────

export const ECONOMY = {
  /** Techo de monedas que el spawner puede generar cada 100 m. */
  maxCoinsPerCheckpoint: 14,
  /** Bonus por terminar los 10 km. */
  finishBonus: 250,
  /** Bonus extra por batir el récord de la pista. */
  recordBonus: 500,
  /** Monedas de arranque para una wallet nueva. */
  startingCoins: 0
} as const

/** Techo de monedas recolectables hasta cierta distancia. Tope anti-cheat. */
export function maxCoinsAt(distanceM: number): number {
  const checkpoints = Math.ceil(Math.max(0, distanceM) / RACE.checkpointIntervalM)
  return checkpoints * ECONOMY.maxCoinsPerCheckpoint
}

// ─── Spawner ─────────────────────────────────────────────────────────────────

export const SPAWN = {
  /** Metros entre oleadas de monedas. */
  coinWaveEveryM: 46,
  /** Monedas por oleada. */
  coinsPerWave: [3, 4, 5, 6],
  /** Separación en Z dentro de una oleada. */
  coinSpacingZ: 4,
  /** Metros entre obstáculos al empezar. */
  obstacleEveryStartM: 90,
  /** Metros entre obstáculos al final (la pista se endurece). */
  obstacleEveryEndM: 38,
  /** Metros entre edificios por lado. */
  buildingEveryM: 26,
  /** Metros entre líneas divisorias de carril. */
  laneStripeEveryM: 8,
  /** Metros entre piezas de borde de pista. */
  trackEdgeEveryM: 4
} as const

// ─── Skins ───────────────────────────────────────────────────────────────────

export type SkinDef = {
  id: string
  name: string
  model: string
  price: number
  /** Nombre del clip de animación de marcha dentro del .glb. */
  goClip: string
  idleClip: string
  tint: { r: number; g: number; b: number }
}

export const SKINS: SkinDef[] = [
  {
    id: 'nomad',
    name: 'Nomad',
    model: 'assets/models/bike_01.glb',
    price: 0,
    goClip: 'go',
    idleClip: 'idle',
    tint: { r: 0.35, g: 0.85, b: 1 }
  },
  {
    id: 'volt',
    name: 'Volt',
    model: 'assets/models/bike_02.glb',
    price: 1500,
    goClip: 'go',
    idleClip: 'idle',
    tint: { r: 0.6, g: 1, b: 0.35 }
  },
  {
    id: 'crimson',
    name: 'Crimson',
    model: 'assets/models/bike_03.glb',
    price: 4000,
    goClip: 'go',
    idleClip: 'idle',
    tint: { r: 1, g: 0.35, b: 0.35 }
  },
  {
    id: 'obsidian',
    name: 'Obsidian Strike',
    model: 'assets/models/bike_04.glb',
    price: 9000,
    goClip: 'go',
    idleClip: 'idle',
    tint: { r: 1, g: 0.82, b: 0.3 }
  }
]

export const DEFAULT_SKIN_ID = SKINS[0].id

export function findSkin(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

// ─── Identificador de pista ──────────────────────────────────────────────────

/** Cambiar este id invalida récords y ghosts guardados (útil al rebalancear). */
export const TRACK_ID = 'neon-mile-v1'

// ─── Utilidades ──────────────────────────────────────────────────────────────

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
