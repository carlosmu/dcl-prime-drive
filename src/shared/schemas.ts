import { Entity, engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/**
 * Current track record, synced to all clients.
 *
 * It's a component instead of a message so that a client joining late
 * receives it with the initial state snapshot, without having to ask for it.
 */
export const TrackRecord = engine.defineComponent('primedrive:TrackRecord', {
  trackId: Schemas.String,
  holderName: Schemas.String,
  timeMs: Schemas.Int,
  /** Racers currently active on the track right now. */
  activeRacers: Schemas.Int
})

// Only the server can touch it. A client trying to write it is ignored.
TrackRecord.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/**
 * Server heartbeat, for diagnostics.
 *
 * It's a synced component on purpose: if `tick` advances on the client, then
 * the authoritative server is alive AND the CRDT channel is arriving. It's
 * the signal that distinguishes "no server" from "there's a server but it's
 * not syncing", which look the same from the UI.
 */
export const ServerHeartbeat = engine.defineComponent('primedrive:ServerHeartbeat', {
  /** Incremented once per second. */
  tick: Schemas.Int,
  /** Seconds since the server started. */
  uptimeSeconds: Schemas.Int,
  /** Players the server sees connected. */
  connectedPlayers: Schemas.Int
})

ServerHeartbeat.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

type ComponentWithEntityValidation = {
  validateBeforeChange: (entity: Entity, cb: (value: { senderAddress: string }) => boolean) => void
}

/**
 * Shields the built-in components (Transform, GltfContainer…) of an entity
 * managed by the server. It's done per-entity on purpose: a global validation
 * would also block the client's own local entities.
 */
export function protectServerEntity(entity: Entity, components: ComponentWithEntityValidation[]) {
  for (const component of components) {
    component.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  }
}
