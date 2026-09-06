import { Animator, AudioSource, Entity, GltfContainer, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { LANE_COUNT, RACE, SPAWN, TRACK, laneToX } from '../../shared/config'

/**
 * Monedas, obstaculos y arcos de checkpoint.
 *
 * Todo sale de pools creados al arrancar: durante la carrera solo se mueven
 * Transforms. Lo inactivo se aparca en Y = -200, fuera de camara.
 */

const COIN_MODEL = 'assets/models/coin.glb'
const COIN_IDLE_CLIP = '0. idle'
const COIN_CATCH_CLIP = '1. catch'
const CONE_MODEL = 'assets/models/obstacle_cone.glb'
const BARRIER_MODEL = 'assets/models/obstacle_barrier.glb'
const ARCH_MODEL = 'assets/models/obstacle_gate.glb'

const COIN_SFX = 'assets/sounds/coin.mp3'
const CRASH_SFX = 'assets/sounds/losetrumpet.mp3'
const WIN_SFX = 'assets/sounds/won.mp3'

/** Metros de pista visibles por delante del jugador. */
const LOOKAHEAD_M = TRACK.spawnZ - TRACK.playerZ

const PARKED_Y = -200
const COIN_Y = 1.4
const COIN_POOL_SIZE = 44
const OBSTACLE_POOL_SIZE = 20
const ARCH_POOL_SIZE = 4

/** Medio ancho de la moto para el test de colision. */
const BIKE_HALF_WIDTH = 0.55
/** Margen extra para agarrar monedas: recompensa el intento, no castiga el pixel. */
const COIN_GRAB_HALF_WIDTH = 1.5

type PoolItem = {
  entity: Entity
  active: boolean
  /** Ya cruzo al jugador y fue agarrada/chocada: sigue viajando pero no puntua. */
  consumed: boolean
  /** Medio ancho efectivo del obstaculo. */
  halfWidth: number
}

const coins: PoolItem[] = []
const obstacles: PoolItem[] = []
const arches: PoolItem[] = []

let coinSfx: Entity[] = []
let coinSfxIndex = 0
let crashSfx: Entity = engine.RootEntity
let winSfx: Entity = engine.RootEntity

/** Metros hasta la proxima oleada de monedas / proximo obstaculo / proximo arco. */
let nextCoinWaveAtM = 0
let nextObstacleAtM = 0
let nextArchAtM = 0

export type SpawnEvents = {
  onCoin: () => void
  onCrash: () => void
}

export function buildSpawner() {
  for (let i = 0; i < COIN_POOL_SIZE; i++) {
    const entity = engine.addEntity()
    GltfContainer.create(entity, { src: COIN_MODEL })
    Transform.create(entity, {
      position: Vector3.create(TRACK.centerX, PARKED_Y, 0),
      scale: Vector3.create(2.4, 2.4, 2.4)
    })
    Animator.create(entity, {
      states: [
        { clip: COIN_IDLE_CLIP, playing: true, loop: true },
        { clip: COIN_CATCH_CLIP, playing: false, loop: false }
      ]
    })
    coins.push({ entity, active: false, consumed: false, halfWidth: COIN_GRAB_HALF_WIDTH })
  }

  for (let i = 0; i < OBSTACLE_POOL_SIZE; i++) {
    const entity = engine.addEntity()
    const isBarrier = i % 2 === 0
    GltfContainer.create(entity, { src: isBarrier ? BARRIER_MODEL : CONE_MODEL })
    Transform.create(entity, {
      position: Vector3.create(TRACK.centerX, PARKED_Y, 0),
      scale: isBarrier ? Vector3.create(2.6, 1.6, 1.4) : Vector3.create(3, 3, 3)
    })
    obstacles.push({ entity, active: false, consumed: false, halfWidth: isBarrier ? 1.45 : 0.75 })
  }

  for (let i = 0; i < ARCH_POOL_SIZE; i++) {
    const entity = engine.addEntity()
    GltfContainer.create(entity, { src: ARCH_MODEL })
    Transform.create(entity, {
      position: Vector3.create(TRACK.centerX, PARKED_Y, 0),
      rotation: Quaternion.fromEulerDegrees(0, 90, 0),
      scale: Vector3.create(1, 1.1, 3.2)
    })
    arches.push({ entity, active: false, consumed: false, halfWidth: 0 })
  }

  coinSfx = []
  for (let i = 0; i < 5; i++) {
    const entity = engine.addEntity()
    Transform.create(entity, { position: Vector3.create(TRACK.centerX, 2, TRACK.playerZ) })
    AudioSource.create(entity, { audioClipUrl: COIN_SFX, loop: false, playing: false, global: true, volume: 1 })
    coinSfx.push(entity)
  }

  crashSfx = engine.addEntity()
  Transform.create(crashSfx, { position: Vector3.create(TRACK.centerX, 2, TRACK.playerZ) })
  AudioSource.create(crashSfx, { audioClipUrl: CRASH_SFX, loop: false, playing: false, global: true, volume: 0.8 })

  winSfx = engine.addEntity()
  Transform.create(winSfx, { position: Vector3.create(TRACK.centerX, 2, TRACK.playerZ) })
  AudioSource.create(winSfx, { audioClipUrl: WIN_SFX, loop: false, playing: false, global: true, volume: 1 })
}

/** Jingle de meta. */
export function playWinSfx() {
  AudioSource.createOrReplace(winSfx, {
    audioClipUrl: WIN_SFX,
    loop: false,
    playing: true,
    global: true,
    volume: 1,
    currentTime: 0
  })
}

/** Devuelve todo al pool y reinicia los contadores de spawn. */
export function resetSpawner() {
  for (const pool of [coins, obstacles, arches]) {
    for (const item of pool) park(item)
  }
  nextCoinWaveAtM = 60
  nextObstacleAtM = SPAWN.obstacleEveryStartM
  nextArchAtM = RACE.checkpointIntervalM
}

/**
 * Puebla la pista antes de largar, para que la cuenta regresiva no transcurra
 * mirando asfalto vacio.
 */
export function prefillSpawner() {
  spawnDue(0)
}

/**
 * Un frame de simulacion.
 *
 * @param delta metros recorridos en este frame
 * @param distanceM distancia total recorrida
 * @param bikeX X actual de la moto
 * @param canBeHit false durante la invulnerabilidad post-choque
 */
export function updateSpawner(
  delta: number,
  distanceM: number,
  bikeX: number,
  canBeHit: boolean,
  events: SpawnEvents
) {
  spawnDue(distanceM)

  moveAndTest(coins, delta, bikeX, (item, dx) => {
    if (dx > COIN_GRAB_HALF_WIDTH) return false
    Animator.playSingleAnimation(item.entity, COIN_CATCH_CLIP, true)
    playCoinSfx()
    events.onCoin()
    return true
  })

  moveAndTest(obstacles, delta, bikeX, (item, dx) => {
    if (!canBeHit) return false
    if (dx > item.halfWidth + BIKE_HALF_WIDTH) return false
    AudioSource.createOrReplace(crashSfx, {
      audioClipUrl: CRASH_SFX,
      loop: false,
      playing: true,
      global: true,
      volume: 0.8,
      currentTime: 0
    })
    events.onCrash()
    return true
  })

  moveAndTest(arches, delta, bikeX, () => false)
}

/**
 * Mueve un pool y avisa cuando una pieza cruza el plano del jugador.
 *
 * El test es de cruce, no de proximidad: a 60 m/s y 30 fps una pieza avanza 2 m
 * por frame y una ventana de distancia se la saltaria por completo.
 *
 * Lo consumido no se aparca en el acto: sigue viajando hasta salir de camara,
 * para que se vea la animacion de la moneda al agarrarla.
 */
function moveAndTest(
  pool: PoolItem[],
  delta: number,
  bikeX: number,
  onCross: (item: PoolItem, dx: number) => boolean
) {
  for (const item of pool) {
    if (!item.active) continue
    const transform = Transform.getMutable(item.entity)
    const previousZ = transform.position.z
    const z = previousZ - delta
    transform.position.z = z

    if (!item.consumed && previousZ > TRACK.playerZ && z <= TRACK.playerZ) {
      if (onCross(item, Math.abs(transform.position.x - bikeX))) item.consumed = true
    }

    if (z < TRACK.despawnZ) park(item)
  }
}

function park(item: PoolItem) {
  item.active = false
  item.consumed = false
  const transform = Transform.getMutable(item.entity)
  transform.position.y = PARKED_Y
  transform.position.z = 0
}

// --- Spawns -----------------------------------------------------------------

/**
 * Programa lo que entra en escena.
 *
 * Cada spawn tiene una distancia de pista agendada: el metro exacto en el que
 * la pieza pasa por delante del jugador. Se la coloca a
 * `playerZ + (agendada - recorrida)`, que en regimen da justo `spawnZ` y al
 * arrancar deja la pista ya poblada en vez de 10 segundos de asfalto vacio.
 */
function spawnDue(distanceM: number) {
  const horizonM = distanceM + LOOKAHEAD_M

  while (nextCoinWaveAtM <= horizonM) {
    spawnCoinWave(zForSchedule(nextCoinWaveAtM, distanceM))
    nextCoinWaveAtM += SPAWN.coinWaveEveryM
  }

  while (nextObstacleAtM <= horizonM) {
    spawnObstacleGroup(zForSchedule(nextObstacleAtM, distanceM))
    nextObstacleAtM += obstacleIntervalAt(nextObstacleAtM)
  }

  while (nextArchAtM <= horizonM) {
    spawnArch(zForSchedule(nextArchAtM, distanceM))
    nextArchAtM += RACE.checkpointIntervalM
  }
}

function zForSchedule(scheduledAtM: number, distanceM: number): number {
  return TRACK.playerZ + (scheduledAtM - distanceM)
}

/** La pista se endurece: los obstaculos se acercan a medida que avanza. */
function obstacleIntervalAt(distanceM: number): number {
  const progress = Math.max(0, Math.min(1, distanceM / RACE.distanceM))
  return SPAWN.obstacleEveryStartM + (SPAWN.obstacleEveryEndM - SPAWN.obstacleEveryStartM) * progress
}

function spawnCoinWave(z: number) {
  const lane = randomInt(0, LANE_COUNT - 1)
  const count = SPAWN.coinsPerWave[randomInt(0, SPAWN.coinsPerWave.length - 1)]
  const x = laneToX(lane)
  for (let i = 0; i < count; i++) {
    const item = takeFree(coins)
    if (!item) return
    activate(item, x, COIN_Y, z + i * SPAWN.coinSpacingZ)
    Animator.playSingleAnimation(item.entity, COIN_IDLE_CLIP, true)
  }
}

/**
 * Bloquea uno o dos carriles, nunca los tres: siempre queda una salida.
 */
function spawnObstacleGroup(z: number) {
  const blocked = Math.random() < 0.35 ? 2 : 1
  const lanes = shuffledLanes().slice(0, blocked)
  for (const lane of lanes) {
    const item = takeFree(obstacles)
    if (!item) return
    activate(item, laneToX(lane), 0, z)
  }
}

function spawnArch(z: number) {
  const item = takeFree(arches)
  if (!item) return
  activate(item, TRACK.centerX, 0, z)
}

function takeFree(pool: PoolItem[]): PoolItem | null {
  for (const item of pool) {
    if (!item.active) return item
  }
  return null
}

function activate(item: PoolItem, x: number, y: number, z: number) {
  item.active = true
  item.consumed = false
  const transform = Transform.getMutable(item.entity)
  transform.position.x = x
  transform.position.y = y
  transform.position.z = z
}

function playCoinSfx() {
  const entity = coinSfx[coinSfxIndex]
  coinSfxIndex = (coinSfxIndex + 1) % coinSfx.length
  AudioSource.createOrReplace(entity, {
    audioClipUrl: COIN_SFX,
    loop: false,
    playing: true,
    global: true,
    volume: 1,
    currentTime: 0
  })
}

// --- Helpers ----------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffledLanes(): number[] {
  const lanes: number[] = []
  for (let i = 0; i < LANE_COUNT; i++) lanes.push(i)
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    const tmp = lanes[i]
    lanes[i] = lanes[j]
    lanes[j] = tmp
  }
  return lanes
}
