import { AudioSource, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { TRACK } from '../../shared/config'
import { state } from '../state'

/**
 * Musica de fondo.
 *
 * Suena en loop desde que carga la escena y baja de volumen fuera de carrera,
 * para que en el menu se escuchen los clics y en la pista no tape las monedas
 * ni los choques.
 */

const MUSIC = 'assets/sounds/music.mp3'

/** Volumen en menu / resultados. */
const IDLE_VOLUME = 0.22
/** Volumen mientras se corre. */
const RACE_VOLUME = 0.4
/** Que tan rapido cruza de un volumen al otro. */
const FADE_RESPONSE = 1.5
/**
 * Cambiar `volume` marca el componente como sucio y lo reenvia. Por debajo de
 * este delta no vale la pena escribirlo todos los frames.
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

/** Interpola hacia el volumen que corresponde a la fase actual. */
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
 * Silencia sin parar la reproduccion: `playing = false` no garantiza retomar
 * donde iba, y un corte seco en mitad del tema se nota.
 */
export function toggleMusic() {
  state.musicOn = !state.musicOn
}
