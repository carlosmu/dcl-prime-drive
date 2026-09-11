import { AudioSource, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { TRACK } from '../../shared/config'
import { state } from '../state'

/**
 * Background music.
 *
 * Loops from the moment the scene loads and lowers in volume outside of a
 * race, so clicks can be heard in the menu and coins and crashes aren't
 * drowned out on the track.
 */

const MUSIC = 'assets/sounds/music.mp3'

/** Volume in menu / results. */
const IDLE_VOLUME = 0.22
/** Volume while racing. */
const RACE_VOLUME = 1
/** How fast it crosses from one volume to the other. */
const FADE_RESPONSE = 1.5
/**
 * Changing `volume` marks the component as dirty and resends it. Below this
 * delta it's not worth writing it every frame.
 */
const VOLUME_EPSILON = 0.004

let entity: Entity = engine.RootEntity
let volume = IDLE_VOLUME

export function buildMusic() {
  entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(TRACK.centerX, 2, TRACK.playerZ) })
  AudioSource.create(entity, {
    audioClipUrl: MUSIC,
    loop: true,
    playing: true,
    global: true,
    volume: IDLE_VOLUME
  })
}

/** Interpolates toward the volume for the current phase. */
export function updateMusic(dt: number) {
  const target = musicTarget()
  if (Math.abs(target - volume) < VOLUME_EPSILON) return

  volume += (target - volume) * Math.min(1, FADE_RESPONSE * dt)
  AudioSource.getMutable(entity).volume = volume
}

function musicTarget(): number {
  if (!state.musicOn) return 0
  return state.phase === 'racing' || state.phase === 'countdown' ? RACE_VOLUME : IDLE_VOLUME
}

/**
 * Mutes without stopping playback: `playing = false` doesn't guarantee
 * resuming where it left off. The toggle is instant; only phase changes fade.
 */
export function toggleMusic() {
  state.musicOn = !state.musicOn
  volume = musicTarget()
  AudioSource.getMutable(entity).volume = volume
}
