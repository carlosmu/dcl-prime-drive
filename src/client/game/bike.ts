import { Animator, Entity, GltfContainer, Transform, VisibilityComponent, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { LANE_COUNT, SKINS, TRACK, findSkin, laneToX } from '../../shared/config'

/**
 * La moto del jugador.
 *
 * El avatar de Decentraland esta oculto y congelado: lo que se ve y se maneja
 * es esta entidad. Se mueve solo en X entre los tres carriles; el avance es del
 * mundo, que viene hacia ella.
 *
 * Las cuatro skins se instancian al arrancar y se alternan con
 * `VisibilityComponent`: cambiar `GltfContainer.src` en caliente recargaria el
 * GLB y cortaria la animacion en plena carrera.
 */

/**
 * Giro en Y del modelo para que mire hacia +Z, que es hacia donde corre.
 *
 * Los GLB de moto ya vienen mirando hacia adelante, asi que no hace falta girarlos.
 * El ghost usa los mismos modelos y lee esta misma constante.
 */
export const BIKE_YAW_DEG = 0

/** Velocidad del cambio de carril, en m/s. */
const LANE_SPEED = 14
/** Inclinacion maxima al cambiar de carril, en grados. */
const MAX_LEAN_DEG = 22
/** Que tan rapido la inclinacion sigue al movimiento lateral. */
const LEAN_RESPONSE = 8

let root: Entity = engine.RootEntity
const skinEntities = new Map<string, Entity>()

let currentSkinId = SKINS[0].id
let targetLane = 1
let currentX = laneToX(1)
let lean = 0

export function buildBike() {
  root = engine.addEntity()
  Transform.create(root, {
    position: Vector3.create(currentX, TRACK.roadY + 0.1, TRACK.playerZ),
    rotation: Quaternion.fromEulerDegrees(0, BIKE_YAW_DEG, 0)
  })

  for (const skin of SKINS) {
    const entity = engine.addEntity()
    GltfContainer.create(entity, { src: skin.model })
    Transform.create(entity, { parent: root })
    Animator.create(entity, {
      states: [
        { clip: skin.idleClip, playing: true, loop: true },
        { clip: skin.goClip, playing: false, loop: true }
      ]
    })
    VisibilityComponent.create(entity, { visible: skin.id === currentSkinId })
    skinEntities.set(skin.id, entity)
  }
}

export function setSkin(skinId: string) {
  const skin = findSkin(skinId)
  if (skin.id === currentSkinId) return
  currentSkinId = skin.id
  for (const [id, entity] of skinEntities) {
    VisibilityComponent.getMutable(entity).visible = id === skin.id
  }
}

export function getSkinId(): string {
  return currentSkinId
}

/** Clip de marcha en loop. */
export function playGo() {
  const skin = findSkin(currentSkinId)
  const entity = skinEntities.get(skin.id)
  if (entity) Animator.playSingleAnimation(entity, skin.goClip, false)
}

export function playIdle() {
  const skin = findSkin(currentSkinId)
  const entity = skinEntities.get(skin.id)
  if (entity) Animator.playSingleAnimation(entity, skin.idleClip, false)
}

export function setLane(lane: number) {
  targetLane = Math.max(0, Math.min(LANE_COUNT - 1, lane))
}

export function moveLane(direction: number): number {
  setLane(targetLane + direction)
  return targetLane
}

export function getLane(): number {
  return targetLane
}

export function getBikeX(): number {
  return currentX
}

export function resetBike() {
  targetLane = 1
  currentX = laneToX(1)
  lean = 0
  applyTransform()
}

/** Interpola el deslizamiento lateral y la inclinacion. */
export function updateBike(dt: number) {
  const targetX = laneToX(targetLane)
  const diff = targetX - currentX
  const step = LANE_SPEED * dt

  let velocity = 0
  if (Math.abs(diff) <= step) {
    velocity = diff / Math.max(dt, 0.0001)
    currentX = targetX
  } else {
    const move = Math.sign(diff) * step
    velocity = move / Math.max(dt, 0.0001)
    currentX += move
  }

  const targetLean = Math.max(-1, Math.min(1, velocity / LANE_SPEED)) * MAX_LEAN_DEG
  lean += (targetLean - lean) * Math.min(1, LEAN_RESPONSE * dt)
  applyTransform()
}

function applyTransform() {
  const transform = Transform.getMutable(root)
  transform.position.x = currentX
  // El roll se aplica sobre el yaw base: inclina la moto hacia el lado al que va.
  transform.rotation = Quaternion.fromEulerDegrees(0, BIKE_YAW_DEG, -lean)
}
