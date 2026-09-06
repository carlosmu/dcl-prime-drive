import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * Protocolo cliente ↔ servidor autoritativo.
 *
 * El cliente simula la carrera (es single player), pero el servidor es el único
 * que otorga monedas, valida tiempos y guarda récords. Nada de lo que reporta
 * el cliente se acepta sin pasar por `server/validation.ts`.
 */
export const Messages = {
  // ── Cliente → Servidor ────────────────────────────────────────────────────
  /** Handshake al entrar a la escena. Devuelve perfil, ghost y leaderboard. */
  hello: Schemas.Map({
    displayName: Schemas.String
  }),
  /** Arranca una carrera. El servidor sella el tiempo de inicio de su lado. */
  raceStart: Schemas.Map({
    trackId: Schemas.String,
    skinId: Schemas.String
  }),
  /** Se envía cada 100 m recorridos. */
  checkpoint: Schemas.Map({
    /** 1-based: el checkpoint 1 son los primeros 100 m. */
    index: Schemas.Int,
    /** ms transcurridos desde el arranque, según el cliente. */
    elapsedMs: Schemas.Int,
    coins: Schemas.Int,
    crashes: Schemas.Int
  }),
  /** Fin de carrera: meta alcanzada o carrera abandonada por choques. */
  raceFinish: Schemas.Map({
    completed: Schemas.Boolean,
    elapsedMs: Schemas.Int,
    distanceM: Schemas.Int,
    coins: Schemas.Int,
    crashes: Schemas.Int
  }),
  /** El jugador salió de la escena o reinició sin terminar. */
  raceAbort: Schemas.Map({
    reason: Schemas.String
  }),
  buySkin: Schemas.Map({ skinId: Schemas.String }),
  equipSkin: Schemas.Map({ skinId: Schemas.String }),

  // ── Servidor → Cliente ────────────────────────────────────────────────────
  /** Estado persistido de la wallet. Única fuente de verdad del saldo. */
  profileSync: Schemas.Map({
    coins: Schemas.Int,
    /** Ids de skin separados por coma. */
    ownedSkins: Schemas.String,
    equippedSkin: Schemas.String,
    bestTimeMs: Schemas.Int,
    racesFinished: Schemas.Int
  }),
  /** Récord de la pista, para reproducirlo como ghost. */
  ghostSync: Schemas.Map({
    available: Schemas.Boolean,
    ownerName: Schemas.String,
    totalMs: Schemas.Int,
    /** ms acumulados en cada checkpoint. `splits[i]` = llegada al metro (i+1)*100. */
    splits: Schemas.Array(Schemas.Int)
  }),
  /** Progreso en vivo del resto de corredores en la escena. */
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
  /** El servidor rechazó un checkpoint: la carrera queda invalidada. */
  checkpointRejected: Schemas.Map({
    index: Schemas.Int,
    reason: Schemas.String
  }),
  /** Resultado final validado por el servidor. */
  raceResult: Schemas.Map({
    accepted: Schemas.Boolean,
    reason: Schemas.String,
    elapsedMs: Schemas.Int,
    coinsAwarded: Schemas.Int,
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
