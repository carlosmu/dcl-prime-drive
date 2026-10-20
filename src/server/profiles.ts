import { Storage } from '@dcl/sdk/server'
import { DEFAULT_SKIN_ID, ECONOMY, LEADERBOARD_SIZE, SKINS, TRACK_ID, isCompleteGhost } from '../shared/config'

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
  /** ms accumulated on reaching each checkpoint (100 m, 200 m, ...). */
  splits: number[]
}

export type LeaderboardEntry = {
  address: string
  name: string
  timeMs: number
  /** Splits of that time, to replay it as a ghost. Missing on rows saved before ghosts were kept per row. */
  splits?: number[]
}

const PROFILE_KEY = 'profile'
const GHOST_KEY = `ghost:${TRACK_ID}`
const LEADERBOARD_KEY = `leaderboard:${TRACK_ID}`

/**
 * In-memory cache of profiles.
 *
 * Storage is async and message handlers respond immediately, so the live
 * game state comes from here; Storage is only the persistence layer.
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

/** Discards skin ids that no longer exist in the catalog after a rebalance. */
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
    console.log(`[Server] could not read profile for ${address}:`, error)
  }
  // Another concurrent call may have loaded the profile while we were waiting.
  const raced = cache.get(address)
  if (raced) return raced
  cache.set(address, profile)
  return profile
}

/** Profile already loaded in memory, without hitting Storage. */
export function peekProfile(address: string): PlayerProfile | undefined {
  return cache.get(address)
}

export async function saveProfile(address: string, profile: PlayerProfile): Promise<void> {
  const clean = sanitize(profile)
  cache.set(address, clean)
  try {
    const ok = await Storage.player.set(address, PROFILE_KEY, clean)
    if (!ok) console.log(`[Server] profile for ${address} was not persisted`)
  } catch (error) {
    console.log(`[Server] could not save profile for ${address}:`, error)
  }
}

// --- Ghost and leaderboard (shared scene storage) -----------------------
//
// `Storage.get` answers `null` both for "no value" and for a failed read, so a
// null is never cached as a confirmed empty state: it's asked again next time.
// Caching it would let the next finished race overwrite the stored board (or
// ghost) with just that one time, wiping everyone else's.

let ghostCache: GhostRecord | null = null

export async function loadGhost(): Promise<GhostRecord | null> {
  if (ghostCache) return ghostCache
  try {
    const stored = await Storage.get<GhostRecord>(GHOST_KEY)
    // Only a race that covered every checkpoint can be replayed: a partial
    // ghost freezes on the track once its splits run out.
    if (stored && isCompleteGhost(stored.splits)) ghostCache = stored
    else if (stored) console.log(`[Server] discarding incomplete ghost (${stored.splits.length} splits)`)
  } catch (error) {
    console.log('[Server] could not read ghost:', error)
  }
  return ghostCache
}

export async function saveGhost(record: GhostRecord): Promise<void> {
  ghostCache = record
  try {
    const ok = await Storage.set(GHOST_KEY, record)
    if (!ok) console.log('[Server] ghost was not persisted')
  } catch (error) {
    console.log('[Server] could not save ghost:', error)
  }
}

let leaderboardCache: LeaderboardEntry[] | null = null

async function readLeaderboard(fresh: boolean): Promise<LeaderboardEntry[] | null> {
  try {
    const stored = await Storage.get<LeaderboardEntry[]>(LEADERBOARD_KEY, { fresh })
    return Array.isArray(stored) ? stored : null
  } catch (error) {
    console.log('[Server] could not read leaderboard:', error)
    return null
  }
}

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  if (leaderboardCache) return leaderboardCache
  const stored = await readLeaderboard(false)
  if (!stored) return []
  leaderboardCache = mergeBoards(leaderboardCache ?? [], stored)
  return leaderboardCache
}

/** Union of two boards: one row per wallet, keeping its best time. */
function mergeBoards(a: LeaderboardEntry[], b: LeaderboardEntry[]): LeaderboardEntry[] {
  const byAddress = new Map<string, LeaderboardEntry>()
  for (const entry of [...a, ...b]) {
    const key = entry.address.toLowerCase()
    const existing = byAddress.get(key)
    if (!existing || entry.timeMs < existing.timeMs) byAddress.set(key, { ...entry })
  }
  return Array.from(byAddress.values())
    .sort((x, y) => x.timeMs - y.timeMs)
    .slice(0, LEADERBOARD_SIZE)
}

async function persistLeaderboard(board: LeaderboardEntry[]): Promise<LeaderboardEntry[]> {
  // Merged against a fresh read so a board missed at startup (or written by
  // another server instance) is never overwritten by a shorter one.
  const stored = await readLeaderboard(true)
  leaderboardCache = mergeBoards(board, stored ?? [])
  try {
    const ok = await Storage.set(LEADERBOARD_KEY, leaderboardCache)
    if (!ok) console.log('[Server] leaderboard was not persisted')
  } catch (error) {
    console.log('[Server] could not save leaderboard:', error)
  }
  return leaderboardCache
}

/** Inserts a time and returns the sorted top. A player occupies a single row. */
export async function submitLeaderboardTime(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  const board = (await loadLeaderboard()).slice()
  const existing = board.find((e) => e.address.toLowerCase() === entry.address.toLowerCase())
  if (existing && entry.timeMs >= existing.timeMs) {
    // Not faster, but the name may have changed since that row was saved.
    if (existing.name === entry.name) return board
    existing.name = entry.name
  } else if (existing) {
    existing.timeMs = entry.timeMs
    existing.name = entry.name
    existing.splits = entry.splits
  } else {
    board.push({ ...entry })
  }
  return persistLeaderboard(board)
}

/**
 * Updates the name shown for a wallet's leaderboard row and track record, for
 * rows saved before the name was known (they show the short address).
 * Returns whether anything changed.
 */
export async function renameRacer(address: string, name: string): Promise<boolean> {
  const key = address.toLowerCase()
  let changed = false

  const board = (await loadLeaderboard()).map((e) => ({ ...e }))
  const row = board.find((e) => e.address.toLowerCase() === key)
  if (row && row.name !== name) {
    row.name = name
    await persistLeaderboard(board)
    changed = true
  }

  const ghost = await loadGhost()
  if (ghost && ghost.address.toLowerCase() === key && ghost.name !== name) {
    await saveGhost({ ...ghost, name })
    changed = true
  }
  return changed
}

/**
 * Leaderboard rows that can be replayed, fastest first. A row saved without
 * splits borrows the track record's when it's that same run.
 */
export async function loadGhosts(): Promise<GhostRecord[]> {
  const board = await loadLeaderboard()
  const record = await loadGhost()
  const ghosts: GhostRecord[] = []
  for (const entry of board) {
    let splits = entry.splits
    if (!splits && record && record.address === entry.address && record.totalMs === entry.timeMs) {
      splits = record.splits
    }
    if (splits && isCompleteGhost(splits)) {
      ghosts.push({ address: entry.address, name: entry.name, totalMs: entry.timeMs, splits })
    }
  }
  return ghosts
}
