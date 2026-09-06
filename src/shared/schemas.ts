import { Entity, engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/**
 * Récord vigente de la pista, sincronizado a todos los clientes.
 *
 * Va como componente en vez de mensaje para que un cliente que entra tarde lo
 * reciba con el snapshot de estado inicial, sin pedirlo.
 */
export const TrackRecord = engine.defineComponent('primedrive:TrackRecord', {
  trackId: Schemas.String,
  holderName: Schemas.String,
  timeMs: Schemas.Int,
  /** Corredores activos ahora mismo en la pista. */
  activeRacers: Schemas.Int
})

// Solo el servidor puede tocarlo. Un cliente que intente escribirlo es ignorado.
TrackRecord.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

type ComponentWithEntityValidation = {
  validateBeforeChange: (entity: Entity, cb: (value: { senderAddress: string }) => boolean) => void
}

/**
 * Blinda componentes built-in (Transform, GltfContainer…) de una entidad que
 * gestiona el servidor. Es por entidad a propósito: una validación global
 * bloquearía también las entidades locales del cliente.
 */
export function protectServerEntity(entity: Entity, components: ComponentWithEntityValidation[]) {
  for (const component of components) {
    component.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  }
}
