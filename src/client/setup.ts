import { buildBike } from './game/bike'
import { buildCamera } from './game/camera'
import { buildGhost } from './game/ghost'
import { buildMusic } from './game/music'
import { buildRider } from './game/rider'
import { buildSpawner, prefillSpawner, resetSpawner } from './game/spawner'
import { buildTrack } from './game/track'
import { initNet } from './net'
import { initRace } from './race'
import { setupUi } from './ui'

/**
 * Client startup.
 *
 * Order matters: everything that instantiates entities runs before the
 * systems, so the loop's first pass already finds the scene fully set up.
 */
export function initClient() {
  buildTrack()
  buildSpawner()
  buildBike()
  buildRider()
  buildGhost()
  buildCamera()
  buildMusic()

  resetSpawner()
  prefillSpawner()
  initNet()
  initRace()
  setupUi()
}
