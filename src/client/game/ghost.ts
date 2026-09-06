import {
  Animator,
  Billboard,
  Entity,
  GltfContainer,
  TextShape,
  Transform,
  VisibilityComponent,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { RACE, TRACK, findSkin } from '../../shared/config'
import { BIKE_YAW_DEG } from './bike'

/**
 * Ghost del record de la pista.
 *
 * El servidor manda los splits del mejor tiempo (ms en cada checkpoint de
 * 100 m). El cliente los interpola para saber en que metro iba el record a
 * este mismo instante de carrera, y coloca la moto fantasma adelante o atras
 * segun la diferencia con el jugador. Es un reloj, no una simulacion: el ghost
 * no esquiva nada ni junta monedas.
 */

const GHOST_SKIN = findSkin('obsidian')
/** Cuanto adelante/atras del jugador se dibuja antes de esconderlo. */
const VISIBLE_AHEAD = 90
const VISIBLE_BEHIND = 25

let root: Entity = engine.RootEntity
let label: Entity = engine.RootEntity
let visible = false

export function buildGhost() {
  root = engine.addEntity()
  Transform.create(root, {
    position: Vector3.create(TRACK.centerX, TRACK.roadY + 0.25, TRACK.playerZ),
    rotation: Quaternion.fromEulerDegrees(0, BIKE_YAW_DEG, 0)
  })
  GltfContainer.create(root, { src: GHOST_SKIN.model })
  Animator.create(root, {
    states: [{ clip: GHOST_SKIN.goClip, playing: true, loop: true }]
  })
  VisibilityComponent.create(root, { visible: false })

  label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(0, 2.6, 0), parent: root })
  TextShape.create(label, {
    text: 'GHOST',
    fontSize: 2.6,
    textColor: Color4.create(0.6, 0.9, 1, 0.9),
    outlineWidth: 0.15,
    outlineColor: Color4.create(0, 0, 0, 1)
  })
  Billboard.create(label, {})
  VisibilityComponent.create(label, { visible: false })
}

export function setGhostLabel(ownerName: string, totalMs: number) {
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  TextShape.getMutable(label).text = `${ownerName || 'RECORD'}\n${minutes}:${String(seconds).padStart(2, '0')}`
}

export function hideGhost() {
  if (!visible) return
  visible = false
  VisibilityComponent.getMutable(root).visible = false
  VisibilityComponent.getMutable(label).visible = false
}

/**
 * Coloca el ghost segun la diferencia de metros con el jugador.
 */
export function updateGhost(playerDistanceM: number, ghostDistanceM: number) {
  const gap = ghostDistanceM - playerDistanceM
  if (gap > VISIBLE_AHEAD || gap < -VISIBLE_BEHIND || ghostDistanceM >= RACE.distanceM) {
    hideGhost()
    return
  }

  if (!visible) {
    visible = true
    VisibilityComponent.getMutable(root).visible = true
    VisibilityComponent.getMutable(label).visible = true
  }

  const transform = Transform.getMutable(root)
  transform.position.z = TRACK.playerZ + gap
}
