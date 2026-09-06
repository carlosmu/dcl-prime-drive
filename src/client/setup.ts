import { buildBike } from './game/bike'
import { buildCamera } from './game/camera'
import { buildGhost } from './game/ghost'
import { buildSpawner, prefillSpawner, resetSpawner } from './game/spawner'
import { buildTrack } from './game/track'
import { initNet } from './net'
import { initRace } from './race'
import { setupUi } from './ui'

/**
 * Arranque del cliente.
 *
 * El orden importa: todo lo que instancia entidades corre antes que los
 * sistemas, para que la primera pasada del bucle ya encuentre la escena armada.
 */
export function initClient() {
  buildTrack()
  buildSpawner()
  buildBike()
  buildGhost()
  buildCamera()

  resetSpawner()
  prefillSpawner()
  initNet()
  initRace()
  setupUi()
}
