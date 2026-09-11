import { engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { isStateSyncronized } from '@dcl/sdk/network'
import { DEFAULT_SKIN_ID, RACE, TRACK_ID, formatTime, isCompleteGhost } from '../shared/config'
import { room } from '../shared/messages'
import { ServerHeartbeat, TrackRecord } from '../shared/schemas'
import { isOnline, showToast, state } from './state'
import { setGhostLabel } from './game/ghost'
import { setSkin } from './game/bike'

/**
 * Client network layer.
 *
 * The client simulates the race, but decides nothing: coins, records, and
 * purchases only come in through what the server returns. Everything that
 * goes out from here is a report, not an order.
 *
 * The server is **optional to play**. If it doesn't show up, the scene
 * switches to `offline` and the race still runs, without crediting anything.
 * Doing anything else would leave the game stuck on "connecting" in a preview
 * without an authoritative server, which is exactly what happens when the
 * headless binary fails to start.
 */

/** Seconds waiting for the first sync before declaring the scene offline. */
const HANDSHAKE_TIMEOUT = 6

let waited = 0
let helloSent = false

export function initNet() {
  registerHandlers()
  engine.addSystem(handshakeSystem)
  engine.addSystem(trackRecordSystem)
  engine.addSystem(heartbeatSystem)
}

/** Seconds to wait for the player's name before sending `hello` without it. */
const NAME_TIMEOUT = 10
let nameWaited = 0

/**
 * Waits for the initial sync and sends `hello`.
 *
 * It doesn't auto-remove itself when declaring offline: if the server shows
 * up later — starts late, or reconnects — the handshake completes on its own
 * and the scene switches to online without reloading.
 */
function handshakeSystem(dt: number) {
  if (helloSent) return

  if (!isStateSyncronized()) {
    if (state.netStatus === 'connecting') {
      waited += dt
      if (waited >= HANDSHAKE_TIMEOUT) {
        state.netStatus = 'offline'
        console.log('[Client] no authoritative server: playing locally, coins will not be credited')
      }
    }
    return
  }

  // The profile can arrive several frames after the state sync (noticeably on
  // mobile). Sending `hello` without a name makes the server fall back to the
  // short address, which then shows in the ranking and on the ghost.
  const player = getPlayer()
  if (!player || player.name.trim().length === 0) {
    nameWaited += dt
    if (nameWaited < NAME_TIMEOUT) return
  }

  state.myAddress = player?.userId ?? ''
  state.myName = player?.name ?? ''
  helloSent = true
  state.netStatus = 'online'
  room.send('hello', { displayName: state.myName })
  engine.removeSystem(handshakeSystem)
}

/**
 * Reads the server's heartbeat.
 *
 * It's the only signal that separates "no server" from "there's a server but
 * the CRDT isn't arriving": if the tick advances, both halves are alive and
 * connected.
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

/** The record lives in a synced component, not a message. */
function trackRecordSystem() {
  for (const [, record] of engine.getEntitiesWith(TrackRecord)) {
    if (record.trackId !== TRACK_ID) continue
    state.recordHolder = record.holderName
    state.recordTimeMs = record.timeMs
  }
}

/** Reception stamp: feeds the debug panel's "last message". */
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
    // A ghost without every split would freeze mid-track: ignore it.
    const available = data.available && isCompleteGhost(data.splits)
    state.ghostAvailable = available
    state.ghostName = data.ownerName
    state.ghostTotalMs = data.totalMs
    state.ghostSplits = available ? data.splits.slice() : []
    if (available) setGhostLabel(data.ownerName, data.totalMs)
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
    showToast(`Race invalidated: ${data.reason}`, 6)
    console.log(`[Client] checkpoint ${data.index} rejected: ${data.reason}`)
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
      showToast(`New record: ${formatTime(data.elapsedMs)}`, 6)
    } else if (!data.accepted) {
      showToast(`The server rejected the race: ${data.reason}`, 6)
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

// --- Sends -----------------------------------------------------------------
// Nothing is queued without a server: `room.send` holds messages until the
// room is ready, and a whole race is 100 checkpoints that would never be
// delivered.

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

export function sendRacePause(paused: boolean) {
  if (!isOnline()) return
  room.send('racePause', { paused })
}

export function sendRaceAbort(reason: string) {
  if (!isOnline()) return
  room.send('raceAbort', { reason })
}

export function requestBuySkin(skinId: string) {
  if (!isOnline()) return showToast('The garage needs the server', 3)
  room.send('buySkin', { skinId })
}

export function requestEquipSkin(skinId: string) {
  if (!isOnline()) return showToast('The garage needs the server', 3)
  room.send('equipSkin', { skinId })
}
