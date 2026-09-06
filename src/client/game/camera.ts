import { Entity, MainCamera, Transform, VirtualCamera, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { TRACK } from '../../shared/config'

/**
 * Chase camera.
 *
 * It's a VirtualCamera: Decentraland's normal camera follows the avatar,
 * which is sitting frozen on the bike. The bike is nailed to the center of
 * the road and the world slides under it, so the camera moves *against* the
 * lane change: the bike still drifts off-center in the frame — which is what
 * makes the change feel tangible — without anything having to move it.
 */

const HEIGHT = 4
const BEHIND = 10
const LOOK_AHEAD = 16
const LOOK_HEIGHT = 1.4
/** How much of the bike's X the camera copies: 1 follows it exactly, 0 doesn't move. */
const X_FOLLOW = 0.55
/** Smoothing of the lateral follow. */
const X_RESPONSE = 4
/** How far back the camera pulls with full boost, in meters. */
const BOOST_PULLBACK = 2.6
/** Smoothing of that pullback. */
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

/** Engages the virtual camera. Called once, after scene startup. */
export function activateCamera() {
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraEntity })
}

/**
 * @param boost 0 = normal speed, 1 = full boost. The camera pulls back so
 * the acceleration is felt, not just read off the speedometer.
 */
export function updateCamera(dt: number, bikeX: number, boost = 0) {
  // `X_FOLLOW - 1` because the bike doesn't move: to leave it off-center by
  // the same amount as following its X would, the camera has to travel the
  // remainder in the opposite direction.
  const targetX = TRACK.centerX + (bikeX - TRACK.centerX) * (X_FOLLOW - 1)
  cameraX += (targetX - cameraX) * Math.min(1, X_RESPONSE * dt)

  const targetBoost = Math.max(0, Math.min(1, boost))
  boostBlend += (targetBoost - boostBlend) * Math.min(1, BOOST_RESPONSE * dt)

  const camera = Transform.getMutable(cameraEntity)
  camera.position.x = cameraX
  camera.position.z = TRACK.playerZ - BEHIND - BOOST_PULLBACK * boostBlend
}
