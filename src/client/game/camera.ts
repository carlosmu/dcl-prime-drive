import { Entity, MainCamera, Transform, VirtualCamera, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { TRACK } from '../../shared/config'

/**
 * Camara persecutora.
 *
 * Es una VirtualCamera: la camara normal de Decentraland sigue al avatar, que
 * aca esta oculto y quieto. Sigue la X de la moto con retraso, de modo que al
 * cambiar de carril la moto se despega del centro del encuadre y el cambio se
 * siente.
 */

const HEIGHT = 4
const BEHIND = 10
const LOOK_AHEAD = 16
const LOOK_HEIGHT = 1.4
/** Cuanto de la X de la moto copia la camara: 1 la sigue clavada, 0 no se mueve. */
const X_FOLLOW = 0.55
/** Suavizado del seguimiento lateral. */
const X_RESPONSE = 4
/** Cuanto se despega la camara hacia atras con el boost a fondo, en metros. */
const BOOST_PULLBACK = 2.6
/** Suavizado de ese retroceso. */
const BOOST_RESPONSE = 3

let cameraEntity: Entity = engine.RootEntity
let lookTarget: Entity = engine.RootEntity
let cameraX = TRACK.centerX
let boostBlend = 0

export function buildCamera() {
  lookTarget = engine.addEntity()
  Transform.create(lookTarget, {
    position: Vector3.create(TRACK.centerX, LOOK_HEIGHT, TRACK.playerZ + LOOK_AHEAD)
  })

  cameraEntity = engine.addEntity()
  Transform.create(cameraEntity, {
    position: Vector3.create(TRACK.centerX, HEIGHT, TRACK.playerZ - BEHIND)
  })
  VirtualCamera.create(cameraEntity, {
    lookAtEntity: lookTarget,
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(1.2) }
  })
}

/** Engancha la camara virtual. Se llama una vez pasado el arranque de escena. */
export function activateCamera() {
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraEntity })
}

/**
 * @param boost 0 = velocidad normal, 1 = boost a fondo. La camara se abre hacia
 * atras para que la aceleracion se vea, no solo se lea en el marcador.
 */
export function updateCamera(dt: number, bikeX: number, boost = 0) {
  const targetX = TRACK.centerX + (bikeX - TRACK.centerX) * X_FOLLOW
  cameraX += (targetX - cameraX) * Math.min(1, X_RESPONSE * dt)

  const targetBoost = Math.max(0, Math.min(1, boost))
  boostBlend += (targetBoost - boostBlend) * Math.min(1, BOOST_RESPONSE * dt)

  const camera = Transform.getMutable(cameraEntity)
  camera.position.x = cameraX
  camera.position.z = TRACK.playerZ - BEHIND - BOOST_PULLBACK * boostBlend
  Transform.getMutable(lookTarget).position.x = bikeX
}
