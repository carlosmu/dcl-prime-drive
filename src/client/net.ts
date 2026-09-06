import { engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { isStateSyncronized } from '@dcl/sdk/network'
import { DEFAULT_SKIN_ID, RACE, TRACK_ID, formatTime } from '../shared/config'
import { room } from '../shared/messages'
import { ServerHeartbeat, TrackRecord } from '../shared/schemas'
import { isOnline, showToast, state } from './state'
import { setGhostLabel } from './game/ghost'
import { setSkin } from './game/bike'

/**
 * Capa de red del cliente.
 *
 * El cliente simula la carrera, pero no decide nada: monedas, records y
 * compras entran solo por lo que devuelve el servidor. Todo lo que sale de aca
 * es un reporte, no una orden.
 *
 * El servidor es **opcional para jugar**. Si no aparece, la escena pasa a
 * `offline` y la carrera se corre igual, sin acreditar nada. Cualquier otra
 * cosa dejaria el juego colgado en "conectando" en un preview sin servidor
 * autoritativo, que es exactamente lo que pasa cuando el binario headless no
 * arranca.
 */

/** Segundos esperando el primer sync antes de declarar la escena offline. */
const HANDSHAKE_TIMEOUT = 6

let waited = 0
let helloSent = false

export function initNet() {
  registerHandlers()
  engine.addSystem(handshakeSystem)
  engine.addSystem(trackRecordSystem)
  engine.addSystem(heartbeatSystem)
}

/**
 * Espera el sync inicial y manda el `hello`.
 *
 * No se auto-remueve al declarar offline: si el servidor aparece mas tarde
 * —arranca tarde, o se reconecta— el handshake se completa solo y la escena
 * pasa a online sin recargar.
 */
function handshakeSystem(dt: number) {
  if (helloSent) return

  if (!isStateSyncronized()) {
    if (state.netStatus === 'connecting') {
      waited += dt
      if (waited >= HANDSHAKE_TIMEOUT) {
        state.netStatus = 'offline'
        console.log('[Client] sin servidor autoritativo: se juega en local, sin acreditar monedas')
      }
    }
    return
  }

  const player = getPlayer()
  state.myAddress = player?.userId ?? ''
  state.myName = player?.name ?? ''
  helloSent = true
  state.netStatus = 'online'
  room.send('hello', { displayName: state.myName })
  engine.removeSystem(handshakeSystem)
}

/**
 * Lee el latido del servidor.
 *
 * Es la unica senal que separa "no hay servidor" de "hay servidor pero el CRDT
 * no llega": si el tick avanza, las dos mitades estan vivas y conectadas.
 */
function heartbeatSystem() {
  state.stateSynced = isStateSyncronized()
  for (const [, heartbeat] of engine.getEntitiesWith(ServerHeartbeat)) {
    if (heartbeat.tick === state.serverTick) continue
    state.serverTick = heartbeat.tick
    state.serverUptimeSeconds = heartbeat.uptimeSeconds
    state.serverConnectedPlayers = heartbeat.connectedPlayers
    state.serverTickAtClock = state.clock
  }
}

/** El record vive en un componente sincronizado, no en un mensaje. */
function trackRecordSystem() {
  for (const [, record] of engine.getEntitiesWith(TrackRecord)) {
    if (record.trackId !== TRACK_ID) continue
    state.recordHolder = record.holderName
    state.recordTimeMs = record.timeMs
  }
}

/** Sello de recepcion: alimenta el "ultimo mensaje" del panel de debug. */
function markMessage() {
  state.messagesReceived += 1
  state.lastMessageAtClock = state.clock
}

function registerHandlers() {
  room.onMessage('profileSync', (data) => {
    markMessage()
    state.coins = data.coins
    state.ownedSkins = data.ownedSkins.length > 0 ? data.ownedSkins.split(',') : [DEFAULT_SKIN_ID]
    state.equippedSkin = data.equippedSkin || DEFAULT_SKIN_ID
    state.bestTimeMs = data.bestTimeMs
    state.racesFinished = data.racesFinished
    setSkin(state.equippedSkin)
  })

  room.onMessage('ghostSync', (data) => {
    markMessage()
    state.ghostAvailable = data.available
    state.ghostName = data.ownerName
    state.ghostTotalMs = data.totalMs
    state.ghostSplits = data.splits.slice()
    if (data.available) setGhostLabel(data.ownerName, data.totalMs)
  })

  room.onMessage('standings', (data) => {
    markMessage()
    state.standings = data.entries.filter((entry) => entry.address !== state.myAddress)
  })

  room.onMessage('leaderboardSync', (data) => {
    markMessage()
    state.leaderboard = data.entries.map((entry) => ({ name: entry.name, timeMs: entry.timeMs }))
  })

  room.onMessage('checkpointRejected', (data) => {
    markMessage()
    state.invalidated = true
    state.invalidReason = data.reason
    showToast(`Carrera invalidada: ${data.reason}`, 6)
    console.log(`[Client] checkpoint ${data.index} rechazado: ${data.reason}`)
  })

  room.onMessage('raceResult', (data) => {
    markMessage()
    state.resultWaitFor = 0
    if (state.result) {
      state.result.pending = false
      state.result.accepted = data.accepted
      state.result.reason = data.reason
      state.result.coinsAwarded = data.coinsAwarded
      state.result.newRecord = data.newRecord
    }
    state.coins = data.totalCoins
    if (data.accepted && data.newRecord) {
      showToast(`Nuevo record: ${formatTime(data.elapsedMs)}`, 6)
    } else if (!data.accepted) {
      showToast(`El servidor rechazo la carrera: ${data.reason}`, 6)
    }
  })

  room.onMessage('shopResult', (data) => {
    markMessage()
    if (!data.ok) {
      showToast(data.reason, 3)
      return
    }
    state.coins = data.coins
    state.ownedSkins = data.ownedSkins.length > 0 ? data.ownedSkins.split(',') : [DEFAULT_SKIN_ID]
    state.equippedSkin = data.equippedSkin || DEFAULT_SKIN_ID
    setSkin(state.equippedSkin)
  })
}

// --- Envios -----------------------------------------------------------------
// Sin servidor no se encola nada: `room.send` guarda los mensajes hasta que el
// room este listo, y una carrera entera son 100 checkpoints que no van a
// entregarse nunca.

export function sendRaceStart() {
  if (!isOnline()) return
  room.send('raceStart', { trackId: TRACK_ID, skinId: state.equippedSkin })
}

export function sendCheckpoint(index: number) {
  if (!isOnline()) return
  room.send('checkpoint', {
    index,
    elapsedMs: Math.round(state.elapsedMs),
    coins: state.runCoins,
    crashes: state.crashes
  })
}

export function sendRaceFinish(completed: boolean) {
  if (!isOnline()) return
  room.send('raceFinish', {
    completed,
    elapsedMs: Math.round(state.elapsedMs),
    distanceM: Math.round(Math.min(state.distanceM, RACE.distanceM)),
    coins: state.runCoins,
    crashes: state.crashes
  })
}

export function sendRaceAbort(reason: string) {
  if (!isOnline()) return
  room.send('raceAbort', { reason })
}

export function requestBuySkin(skinId: string) {
  if (!isOnline()) return showToast('El garage necesita el servidor', 3)
  room.send('buySkin', { skinId })
}

export function requestEquipSkin(skinId: string) {
  if (!isOnline()) return showToast('El garage necesita el servidor', 3)
  room.send('equipSkin', { skinId })
}
