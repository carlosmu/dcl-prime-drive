import { PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { EnvVar } from '@dcl/sdk/server'
import { CHECKPOINT_COUNT, ECONOMY, SKINS, TRACK_ID, findSkin } from '../shared/config'
import { room } from '../shared/messages'
import { ServerHeartbeat, TrackRecord, protectServerEntity } from '../shared/schemas'
import {
  GhostRecord,
  loadGhost,
  loadLeaderboard,
  loadProfile,
  peekProfile,
  saveGhost,
  saveProfile,
  submitLeaderboardTime
} from './profiles'
import {
  RunState,
  applyCheckpoint,
  confirmedDistanceM,
  createRun,
  validateCheckpoint,
  validateFinish
} from './validation'

/** Carreras en curso, por wallet. */
const runs = new Map<string, RunState>()
/** Nombre visible reportado en el `hello`, por wallet. */
const names = new Map<string, string>()

let recordEntity = engine.RootEntity
let heartbeatEntity = engine.RootEntity
let uptimeSeconds = 0
let standingsTimer = 0
let presenceTimer = 0

/** Multiplicador de monedas configurable por entorno (eventos, dobles, etc.). */
let coinMultiplier = 1

const STANDINGS_INTERVAL = 1
const PRESENCE_INTERVAL = 5

export async function initServer() {
  console.log(`[Server] Prime Drive - pista ${TRACK_ID} - ${CHECKPOINT_COUNT} checkpoints`)

  const rawMultiplier = await EnvVar.get('COIN_MULTIPLIER')
  const parsed = parseFloat(rawMultiplier || '1')
  coinMultiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 1

  recordEntity = engine.addEntity()
  Transform.create(recordEntity, { position: { x: 0, y: -10, z: 0 } })
  TrackRecord.create(recordEntity, {
    trackId: TRACK_ID,
    holderName: '',
    timeMs: 0,
    activeRacers: 0
  })
  protectServerEntity(recordEntity, [Transform])
  syncEntity(recordEntity, [Transform.componentId, TrackRecord.componentId], 1)

  heartbeatEntity = engine.addEntity()
  Transform.create(heartbeatEntity, { position: { x: 0, y: -10, z: 0 } })
  ServerHeartbeat.create(heartbeatEntity, { tick: 0, uptimeSeconds: 0, connectedPlayers: 0 })
  protectServerEntity(heartbeatEntity, [Transform])
  syncEntity(heartbeatEntity, [Transform.componentId, ServerHeartbeat.componentId], 2)

  const ghost = await loadGhost()
  if (ghost) {
    const record = TrackRecord.getMutable(recordEntity)
    record.holderName = ghost.name
    record.timeMs = ghost.totalMs
  }

  registerHandlers()
  engine.addSystem(serverTick)
}

// --- Handlers ---------------------------------------------------------------

function registerHandlers() {
  room.onMessage('hello', (data, context) => {
    if (!context) return
    const address = context.from
    names.set(address, sanitizeName(data.displayName, address))
    void sendProfile(address)
    void sendGhost(address)
    void sendLeaderboard(address)
  })

  room.onMessage('raceStart', (data, context) => {
    if (!context) return
    const address = context.from
    if (data.trackId !== TRACK_ID) {
      console.log(`[Server] ${address} arranco una pista desconocida: ${data.trackId}`)
      return
    }
    const profile = peekProfile(address)
    const skinId = profile && profile.ownedSkins.includes(data.skinId) ? data.skinId : findSkin(data.skinId).id
    runs.set(address, createRun(address, names.get(address) ?? shortAddress(address), skinId, Date.now()))
    console.log(`[Server] ${address} arranco carrera con ${skinId}`)
  })

  room.onMessage('checkpoint', (data, context) => {
    if (!context) return
    const run = runs.get(context.from)
    if (!run || run.invalidated) return

    const result = validateCheckpoint(run, data, Date.now())
    if (!result.ok) {
      run.invalidated = true
      run.invalidReason = result.reason
      console.log(`[Server] checkpoint rechazado de ${context.from}: ${result.reason}`)
      room.send('checkpointRejected', { index: data.index, reason: result.reason }, { to: [context.from] })
      return
    }
    applyCheckpoint(run, data)
  })

  room.onMessage('raceFinish', (data, context) => {
    if (!context) return
    void finishRace(context.from, data)
  })

  room.onMessage('raceAbort', (data, context) => {
    if (!context) return
    runs.delete(context.from)
    console.log(`[Server] ${context.from} abandono: ${data.reason}`)
  })

  room.onMessage('buySkin', (data, context) => {
    if (!context) return
    void buySkin(context.from, data.skinId)
  })

  room.onMessage('equipSkin', (data, context) => {
    if (!context) return
    void equipSkin(context.from, data.skinId)
  })
}

// --- Carrera ----------------------------------------------------------------

type FinishPayload = {
  completed: boolean
  elapsedMs: number
  distanceM: number
  coins: number
  crashes: number
}

async function finishRace(address: string, report: FinishPayload) {
  const run = runs.get(address)
  if (!run) return
  runs.delete(address)

  const result = validateFinish(run, report, Date.now())
  const profile = await loadProfile(address)

  if (!result.ok) {
    console.log(`[Server] carrera rechazada de ${address}: ${result.reason}`)
    room.send(
      'raceResult',
      {
        accepted: false,
        reason: result.reason,
        elapsedMs: report.elapsedMs,
        coinsAwarded: 0,
        newRecord: false,
        totalCoins: profile.coins
      },
      { to: [address] }
    )
    return
  }

  run.finished = true

  let awarded = Math.floor(report.coins * coinMultiplier)
  if (report.completed) awarded += ECONOMY.finishBonus

  let newRecord = false
  if (report.completed) {
    profile.racesFinished += 1
    if (profile.bestTimeMs === 0 || report.elapsedMs < profile.bestTimeMs) {
      profile.bestTimeMs = report.elapsedMs
    }

    const ghost = await loadGhost()
    if (!ghost || report.elapsedMs < ghost.totalMs) {
      newRecord = true
      awarded += ECONOMY.recordBonus
      const nextGhost: GhostRecord = {
        address,
        name: run.name,
        totalMs: report.elapsedMs,
        splits: run.splits.slice()
      }
      await saveGhost(nextGhost)
      const record = TrackRecord.getMutable(recordEntity)
      record.holderName = nextGhost.name
      record.timeMs = nextGhost.totalMs
      broadcastGhost(nextGhost)
    }

    const board = await submitLeaderboardTime({ address, name: run.name, timeMs: report.elapsedMs })
    room.send('leaderboardSync', { entries: board.map((e) => ({ name: e.name, timeMs: e.timeMs })) })
  }

  profile.coins += awarded
  profile.totalCoinsEarned += awarded
  await saveProfile(address, profile)

  console.log(
    `[Server] ${address} ${report.completed ? 'termino' : 'abandono'} en ${report.elapsedMs} ms - +${awarded} monedas`
  )

  room.send(
    'raceResult',
    {
      accepted: true,
      reason: '',
      elapsedMs: report.elapsedMs,
      coinsAwarded: awarded,
      newRecord,
      totalCoins: profile.coins
    },
    { to: [address] }
  )
  await sendProfile(address)
}

// --- Tienda -----------------------------------------------------------------

async function buySkin(address: string, skinId: string) {
  const profile = await loadProfile(address)
  const skin = SKINS.find((s) => s.id === skinId)

  if (!skin) return sendShopResult(address, false, 'skin desconocida', skinId)
  if (profile.ownedSkins.includes(skin.id)) return sendShopResult(address, false, 'ya la tenes', skinId)
  if (profile.coins < skin.price) return sendShopResult(address, false, 'monedas insuficientes', skinId)

  profile.coins -= skin.price
  profile.ownedSkins.push(skin.id)
  profile.equippedSkin = skin.id
  await saveProfile(address, profile)
  console.log(`[Server] ${address} compro ${skin.id} por ${skin.price}`)
  sendShopResult(address, true, '', skinId)
  await sendProfile(address)
}

async function equipSkin(address: string, skinId: string) {
  const profile = await loadProfile(address)
  if (!profile.ownedSkins.includes(skinId)) return sendShopResult(address, false, 'no la tenes', skinId)
  profile.equippedSkin = skinId
  await saveProfile(address, profile)
  sendShopResult(address, true, '', skinId)
  await sendProfile(address)
}

function sendShopResult(address: string, ok: boolean, reason: string, skinId: string) {
  const profile = peekProfile(address)
  room.send(
    'shopResult',
    {
      ok,
      reason,
      skinId,
      coins: profile ? profile.coins : 0,
      ownedSkins: profile ? profile.ownedSkins.join(',') : '',
      equippedSkin: profile ? profile.equippedSkin : ''
    },
    { to: [address] }
  )
}

// --- Envios -----------------------------------------------------------------

async function sendProfile(address: string) {
  const profile = await loadProfile(address)
  room.send(
    'profileSync',
    {
      coins: profile.coins,
      ownedSkins: profile.ownedSkins.join(','),
      equippedSkin: profile.equippedSkin,
      bestTimeMs: profile.bestTimeMs,
      racesFinished: profile.racesFinished
    },
    { to: [address] }
  )
}

async function sendGhost(address: string) {
  const ghost = await loadGhost()
  room.send(
    'ghostSync',
    ghost
      ? { available: true, ownerName: ghost.name, totalMs: ghost.totalMs, splits: ghost.splits }
      : { available: false, ownerName: '', totalMs: 0, splits: [] },
    { to: [address] }
  )
}

function broadcastGhost(ghost: GhostRecord) {
  room.send('ghostSync', {
    available: true,
    ownerName: ghost.name,
    totalMs: ghost.totalMs,
    splits: ghost.splits
  })
}

async function sendLeaderboard(address: string) {
  const board = await loadLeaderboard()
  room.send('leaderboardSync', { entries: board.map((e) => ({ name: e.name, timeMs: e.timeMs })) }, { to: [address] })
}

// --- Loop -------------------------------------------------------------------

function serverTick(dt: number) {
  standingsTimer += dt
  if (standingsTimer >= STANDINGS_INTERVAL) {
    standingsTimer = 0
    uptimeSeconds += STANDINGS_INTERVAL
    beat()
    broadcastStandings()
  }

  presenceTimer += dt
  if (presenceTimer >= PRESENCE_INTERVAL) {
    presenceTimer = 0
    dropDisconnectedRacers()
  }
}

/** Un latido por segundo. Es lo que el panel de debug del cliente muestra. */
function beat() {
  const heartbeat = ServerHeartbeat.getMutableOrNull(heartbeatEntity)
  if (!heartbeat) return
  heartbeat.tick += 1
  heartbeat.uptimeSeconds = uptimeSeconds
  let connected = 0
  for (const [] of engine.getEntitiesWith(PlayerIdentityData)) connected += 1
  heartbeat.connectedPlayers = connected
}

type StandingEntry = {
  address: string
  name: string
  distanceM: number
  elapsedMs: number
  finished: boolean
}

function broadcastStandings() {
  const now = Date.now()
  const entries: StandingEntry[] = []
  for (const run of runs.values()) {
    if (run.invalidated) continue
    entries.push({
      address: run.address,
      name: run.name,
      distanceM: confirmedDistanceM(run),
      elapsedMs: now - run.startedAtMs,
      finished: run.finished
    })
  }
  entries.sort((a, b) => b.distanceM - a.distanceM)

  const record = TrackRecord.getMutableOrNull(recordEntity)
  if (record) record.activeRacers = entries.length

  room.send('standings', { entries: entries.slice(0, 8) })
}

/** Un jugador que se fue sin mandar `raceAbort` deja una carrera colgada. */
function dropDisconnectedRacers() {
  if (runs.size === 0) return
  const connected = new Set<string>()
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    connected.add(identity.address)
  }
  for (const address of Array.from(runs.keys())) {
    if (!connected.has(address)) {
      runs.delete(address)
      console.log(`[Server] ${address} se desconecto a mitad de carrera`)
    }
  }
}

// --- Helpers ----------------------------------------------------------------

function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address
}

function sanitizeName(raw: string, address: string): string {
  const trimmed = (raw || '').trim().slice(0, 24)
  return trimmed.length > 0 ? trimmed : shortAddress(address)
}
