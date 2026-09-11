import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * Client ↔ authoritative server protocol.
 *
 * The client simulates the race (it's single player), but the server is the
 * only one that grants coins, validates times, and saves records. Nothing
 * the client reports is accepted without going through `server/validation.ts`.
 */
export const Messages = {
  // ── Client → Server ────────────────────────────────────────────────────
  /** Handshake on entering the scene. Returns profile, ghost, and leaderboard. */
  hello: Schemas.Map({
    displayName: Schemas.String
  }),
  /** Starts a race. The server timestamps the start time on its side. */
  raceStart: Schemas.Map({
    trackId: Schemas.String,
    skinId: Schemas.String
  }),
  /** Sent every 100 m traveled. */
  checkpoint: Schemas.Map({
    /** 1-based: checkpoint 1 is the first 100 m. */
    index: Schemas.Int,
    /** ms elapsed since the start, according to the client. */
    elapsedMs: Schemas.Int,
    coins: Schemas.Int,
    crashes: Schemas.Int
  }),
  /** End of race: finish line reached or race abandoned due to crashes. */
  raceFinish: Schemas.Map({
    completed: Schemas.Boolean,
    elapsedMs: Schemas.Int,
    distanceM: Schemas.Int,
    coins: Schemas.Int,
    crashes: Schemas.Int
  }),
  /** Pause menu opened/closed. The server stops counting race time while paused. */
  racePause: Schemas.Map({
    paused: Schemas.Boolean
  }),
  /** The player left the scene or restarted without finishing. */
  raceAbort: Schemas.Map({
    reason: Schemas.String
  }),
  buySkin: Schemas.Map({ skinId: Schemas.String }),
  equipSkin: Schemas.Map({ skinId: Schemas.String }),

  // ── Server → Client ────────────────────────────────────────────────────
  /** Persisted wallet state. Single source of truth for the balance. */
  profileSync: Schemas.Map({
    coins: Schemas.Int,
    /** Comma-separated skin ids. */
    ownedSkins: Schemas.String,
    equippedSkin: Schemas.String,
    bestTimeMs: Schemas.Int,
    racesFinished: Schemas.Int
  }),
  /** Track record, to replay it as a ghost. */
  ghostSync: Schemas.Map({
    available: Schemas.Boolean,
    ownerName: Schemas.String,
    totalMs: Schemas.Int,
    /** ms accumulated at each checkpoint. `splits[i]` = arrival at meter (i+1)*100. */
    splits: Schemas.Array(Schemas.Int)
  }),
  /** Live progress of the rest of the racers in the scene. */
  standings: Schemas.Map({
    entries: Schemas.Array(
      Schemas.Map({
        address: Schemas.String,
        name: Schemas.String,
        distanceM: Schemas.Int,
        elapsedMs: Schemas.Int,
        finished: Schemas.Boolean
      })
    )
  }),
  /** The server rejected a checkpoint: the race is now invalidated. */
  checkpointRejected: Schemas.Map({
    index: Schemas.Int,
    reason: Schemas.String
  }),
  /** Final result validated by the server. */
  raceResult: Schemas.Map({
    accepted: Schemas.Boolean,
    reason: Schemas.String,
    elapsedMs: Schemas.Int,
    coinsAwarded: Schemas.Int,
    /** Breakdown of `coinsAwarded`, to show where each coin came from. */
    coinsPicked: Schemas.Int,
    finishBonus: Schemas.Int,
    recordBonus: Schemas.Int,
    livesBonus: Schemas.Int,
    newRecord: Schemas.Boolean,
    totalCoins: Schemas.Int
  }),
  shopResult: Schemas.Map({
    ok: Schemas.Boolean,
    reason: Schemas.String,
    skinId: Schemas.String,
    coins: Schemas.Int,
    ownedSkins: Schemas.String,
    equippedSkin: Schemas.String
  }),
  leaderboardSync: Schemas.Map({
    entries: Schemas.Array(
      Schemas.Map({
        name: Schemas.String,
        timeMs: Schemas.Int
      })
    )
  })
}

export const room = registerMessages(Messages)
