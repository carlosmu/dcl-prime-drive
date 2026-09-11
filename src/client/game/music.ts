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

const MUSIC = 'assets/sounds/music_01.mp3'

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
/** Seconds left of the win jingle: the track stays silent until it runs out. */
let duckRemaining = 0

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

/**
 * Silences the track for `seconds` so a one-shot jingle plays on its own, then
 * lets it fade back in. Cuts instantly; the return is the usual fade.
 */
export function duckMusic(seconds: number) {
  duckRemaining = Math.max(duckRemaining, seconds)
  volume = 0
  AudioSource.getMutable(entity).volume = 0
}

/** Interpolates toward the volume for the current phase. */
export function updateMusic(dt: number) {
  // A new race cancels the jingle's silence: the track comes back right away.
  if (state.phase === 'racing' || state.phase === 'countdown') duckRemaining = 0
  else if (duckRemaining > 0) duckRemaining = Math.max(0, duckRemaining - dt)
  const target = musicTarget()
  if (Math.abs(target - volume) < VOLUME_EPSILON) return

  volume += (target - volume) * Math.min(1, FADE_RESPONSE * dt)
  AudioSource.getMutable(entity).volume = volume
}

function musicTarget(): number {
  if (!state.musicOn || duckRemaining > 0) return 0
  return state.phase === 'racing' || state.phase === 'countdown' ? RACE_VOLUME : IDLE_VOLUME
}

/**
 * Mutes without stopping playback: `playing = false` doesn't guarantee
 * resuming where it left off. The toggle is instant; only phase changes fade.
 */
export function toggleMusic() {
  state.musicOn = !state.musicOn
  duckRemaining = 0
  volume = musicTarget()
  AudioSource.getMutable(entity).volume = volume
}
