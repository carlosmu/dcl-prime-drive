import { DEFAULT_SKIN_ID, RACE } from '../shared/config'

export type Phase =
  /** Menu principal / garage. */
  | 'menu'
  /** Cuenta regresiva antes de largar. */
  | 'countdown'
  /** Corriendo. */
  | 'racing'
  /** Meta cruzada, esperando la validacion del servidor. */
  | 'finished'
  /** Se acabaron las vidas. */
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
  newRecord: boolean
  pending: boolean
  /** La carrera se corrio sin servidor: no hubo nada que acreditar. */
  offline: boolean
}

/**
 * Estado de la conexion con el servidor autoritativo.
 *
 * `offline` no es un error fatal: la carrera se juega igual, solo que no se
 * acreditan monedas ni se guardan records. Se sigue reintentando de fondo.
 */
export type NetStatus = 'connecting' | 'online' | 'offline'

/**
 * Todo el estado que la UI lee y los sistemas escriben.
 *
 * Es un objeto plano mutable a proposito: React-ECS re-renderiza cada frame
 * leyendo de aca, sin hooks ni suscripciones.
 */
export const state = {
  phase: 'menu' as Phase,

  // --- Perfil (autoridad del servidor) ---
  netStatus: 'connecting' as NetStatus,
  myAddress: '',
  myName: '',
  coins: 0,
  ownedSkins: [DEFAULT_SKIN_ID] as string[],
  equippedSkin: DEFAULT_SKIN_ID,
  bestTimeMs: 0,
  racesFinished: 0,

  // --- Carrera en curso ---
  distanceM: 0,
  speed: 0,
  runCoins: 0,
  crashes: 0,
  elapsedMs: 0,
  lane: 1,
  /** La barra espaciadora (o el boton de la HUD) esta apretada ahora mismo. */
  boosting: false,
  countdown: 0,
  invulnerableFor: 0,
  lastCheckpointSent: 0,
  /** Segundos que queda esperando el veredicto del servidor tras la meta. */
  resultWaitFor: 0,
  /** El servidor rechazo un checkpoint: la carrera ya no paga. */
  invalidated: false,
  invalidReason: '',

  // --- Comparacion ---
  ghostAvailable: false,
  ghostName: '',
  ghostTotalMs: 0,
  ghostSplits: [] as number[],
  /** Distancia del ghost ahora mismo, en metros. */
  ghostDistanceM: 0,
  standings: [] as StandingEntry[],
  leaderboard: [] as { name: string; timeMs: number }[],
  recordHolder: '',
  recordTimeMs: 0,

  // --- Diagnostico ---
  /** Reloj monotono del cliente en segundos. Avanza siempre, aun en el menu. */
  clock: 0,
  /** Ultimo `tick` recibido del servidor. -1 = nunca llego ninguno. */
  serverTick: -1,
  serverUptimeSeconds: 0,
  serverConnectedPlayers: 0,
  /** Valor de `clock` cuando el tick cambio por ultima vez. */
  serverTickAtClock: 0,
  /** Valor de `clock` cuando llego el ultimo mensaje del servidor. */
  lastMessageAtClock: -1,
  messagesReceived: 0,
  stateSynced: false,

  // --- UI ---
  screen: 'home' as 'home' | 'garage' | 'ranking',
  musicOn: true,
  debugOn: true,
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
  state.invulnerableFor = 0
  state.lastCheckpointSent = 0
  state.resultWaitFor = 0
  state.invalidated = false
  state.invalidReason = ''
  state.ghostDistanceM = 0
  state.result = null
}

/**
 * Distancia del ghost en un instante dado, interpolando sus splits.
 *
 * `splits[i]` es el ms en que el ghost llego al metro (i+1)*100, asi que la
 * distancia entre dos splits se interpola lineal: dentro de 100 m la velocidad
 * es practicamente constante.
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
