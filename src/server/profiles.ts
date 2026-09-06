import { Storage } from '@dcl/sdk/server'
import { DEFAULT_SKIN_ID, ECONOMY, SKINS, TRACK_ID } from '../shared/config'

export type PlayerProfile = {
  coins: number
  ownedSkins: string[]
  equippedSkin: string
  bestTimeMs: number
  racesFinished: number
  totalCoinsEarned: number
}

export type GhostRecord = {
  address: string
  name: string
  totalMs: number
  /** ms acumulados al llegar a cada checkpoint (100 m, 200 m, ...). */
  splits: number[]
}

export type LeaderboardEntry = {
  address: string
  name: string
  timeMs: number
}

const PROFILE_KEY = 'profile'
const GHOST_KEY = `ghost:${TRACK_ID}`
const LEADERBOARD_KEY = `leaderboard:${TRACK_ID}`
const LEADERBOARD_SIZE = 10

/**
 * Cache en memoria de los perfiles.
 *
 * Storage es asincrono y los handlers de mensaje responden en el acto, asi que
 * el estado vivo de la partida sale de aca; Storage es solo la persistencia.
 */
const cache = new Map<string, PlayerProfile>()

function emptyProfile(): PlayerProfile {
  return {
    coins: ECONOMY.startingCoins,
    ownedSkins: [DEFAULT_SKIN_ID],
    equippedSkin: DEFAULT_SKIN_ID,
    bestTimeMs: 0,
    racesFinished: 0,
    totalCoinsEarned: 0
  }
}

/** Descarta ids de skin que ya no existen en el catalogo tras un rebalanceo. */
function sanitize(profile: PlayerProfile): PlayerProfile {
  const known = new Set(SKINS.map((s) => s.id))
  const owned = (profile.ownedSkins || []).filter((id) => known.has(id))
  if (!owned.includes(DEFAULT_SKIN_ID)) owned.push(DEFAULT_SKIN_ID)
  const equipped = owned.includes(profile.equippedSkin) ? profile.equippedSkin : DEFAULT_SKIN_ID
  return {
    coins: Math.max(0, Math.floor(profile.coins || 0)),
    ownedSkins: owned,
    equippedSkin: equipped,
    bestTimeMs: Math.max(0, Math.floor(profile.bestTimeMs || 0)),
    racesFinished: Math.max(0, Math.floor(profile.racesFinished || 0)),
    totalCoinsEarned: Math.max(0, Math.floor(profile.totalCoinsEarned || 0))
  }
}

export async function loadProfile(address: string): Promise<PlayerProfile> {
  const cached = cache.get(address)
  if (cached) return cached

  let profile = emptyProfile()
  try {
    const stored = await Storage.player.get<Partial<PlayerProfile>>(address, PROFILE_KEY)
    if (stored) profile = sanitize({ ...emptyProfile(), ...stored })
  } catch (error) {
    console.log(`[Server] no se pudo leer el perfil de ${address}:`, error)
  }
  // Otra llamada concurrente puede haber cargado el perfil mientras esperabamos.
  const raced = cache.get(address)
  if (raced) return raced
  cache.set(address, profile)
  return profile
}

/** Perfil ya cargado en memoria, sin ir a Storage. */
export function peekProfile(address: string): PlayerProfile | undefined {
  return cache.get(address)
}

export async function saveProfile(address: string, profile: PlayerProfile): Promise<void> {
  const clean = sanitize(profile)
  cache.set(address, clean)
  try {
    await Storage.player.set(address, PROFILE_KEY, clean)
  } catch (error) {
    console.log(`[Server] no se pudo guardar el perfil de ${address}:`, error)
  }
}

// --- Ghost y leaderboard (scene storage, compartidos) -----------------------

let ghostCache: GhostRecord | null = null
let ghostLoaded = false

export async function loadGhost(): Promise<GhostRecord | null> {
  if (ghostLoaded) return ghostCache
  try {
    ghostCache = await Storage.get<GhostRecord>(GHOST_KEY)
  } catch (error) {
    console.log('[Server] no se pudo leer el ghost:', error)
    ghostCache = null
  }
  ghostLoaded = true
  return ghostCache
}

export async function saveGhost(record: GhostRecord): Promise<void> {
  ghostCache = record
  ghostLoaded = true
  try {
    await Storage.set(GHOST_KEY, record)
  } catch (error) {
    console.log('[Server] no se pudo guardar el ghost:', error)
  }
}

let leaderboardCache: LeaderboardEntry[] | null = null

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  if (leaderboardCache) return leaderboardCache
  try {
    const stored = await Storage.get<LeaderboardEntry[]>(LEADERBOARD_KEY)
    leaderboardCache = Array.isArray(stored) ? stored : []
  } catch (error) {
    console.log('[Server] no se pudo leer el leaderboard:', error)
    leaderboardCache = []
  }
  return leaderboardCache
}

/** Inserta un tiempo y devuelve el top ordenado. Un jugador ocupa una sola fila. */
export async function submitLeaderboardTime(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  const board = await loadLeaderboard()
  const existing = board.find((e) => e.address === entry.address)
  if (existing) {
    if (entry.timeMs >= existing.timeMs) return board
    existing.timeMs = entry.timeMs
    existing.name = entry.name
  } else {
    board.push({ ...entry })
  }
  board.sort((a, b) => a.timeMs - b.timeMs)
  leaderboardCache = board.slice(0, LEADERBOARD_SIZE)
  try {
    await Storage.set(LEADERBOARD_KEY, leaderboardCache)
  } catch (error) {
    console.log('[Server] no se pudo guardar el leaderboard:', error)
  }
  return leaderboardCache
}
