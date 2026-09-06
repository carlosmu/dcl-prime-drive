import {
  AvatarModifierArea,
  AvatarModifierType,
  InputAction,
  InputModifier,
  PointerEventType,
  TouchScreenControls,
  Transform,
  engine,
  inputSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { CHECKPOINT_COUNT, RACE, TRACK, boostedSpeedAt, targetSpeedAt } from '../shared/config'
import { ghostDistanceAt, isOnline, resetRunState, showToast, state } from './state'
import { getBikeX, moveLane, playGo, playIdle, resetBike, updateBike } from './game/bike'
import { activateCamera, updateCamera } from './game/camera'
import { hideGhost, updateGhost } from './game/ghost'
import { updateMusic } from './game/music'
import { playWinSfx, prefillSpawner, resetSpawner, updateSpawner } from './game/spawner'
import { scrollTrack } from './game/track'
import { sendCheckpoint, sendRaceAbort, sendRaceFinish, sendRaceStart } from './net'

/**
 * Bucle de la carrera.
 *
 * El jugador nunca avanza: la moto solo se desplaza en X y es el mundo el que
 * viene hacia ella. `state.distanceM` es la unica nocion de avance, y es lo que
 * se reporta al servidor cada 100 m.
 */

/** El avatar real se aparca aca, oculto y congelado. */
const ANCHOR = Vector3.create(TRACK.centerX, 0, TRACK.playerZ - 3)
/** Si el avatar se aleja mas que esto, se lo devuelve al ancla. */
const ANCHOR_TOLERANCE = 5
const ANCHOR_COOLDOWN = 1.5
/** Segundos que la pantalla de resultados espera el veredicto del servidor. */
const RESULT_TIMEOUT = 10

let anchorCooldown = 0
/** Boost pedido desde el boton de la HUD (mobile y clic). */
let uiBoost = false

export function initRace() {
  lockPlayer()
  activateCamera()
  engine.addSystem(raceSystem)
}

/**
 * Congela y oculta el avatar de Decentraland.
 *
 * `InputModifier` alcanza en el cliente de escritorio; el area de avatares
 * cubre la escena entera para que tampoco se vean los avatares de los demas
 * corriendo por la pista. El re-anclaje de mas abajo es la red de seguridad
 * para los explorers donde `InputModifier` no tiene efecto.
 */
function lockPlayer() {
  // El salto queda habilitado a proposito: la barra espaciadora es el boost, y
  // un explorer que bloquea el salto puede no reportar IA_JUMP a la escena. El
  // avatar esta oculto y anclado, asi que a lo sumo pega un salto que nadie ve.
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({
      disableWalk: true,
      disableJog: true,
      disableRun: true,
      disableJump: false,
      disableEmote: true
    })
  })

  const hideArea = engine.addEntity()
  Transform.create(hideArea, { position: Vector3.create(TRACK.centerX, 10, TRACK.roadLength / 2) })
  AvatarModifierArea.create(hideArea, {
    area: Vector3.create(70, 40, TRACK.roadLength + 20),
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS, AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: []
  })

  // Mobile: el joystick nativo no sirve con la locomocion desactivada, y los
  // carriles se cambian con los botones de la UI. No-op en escritorio.
  TouchScreenControls.hideJoystick()
  TouchScreenControls.hideCrosshair()
  TouchScreenControls.hideAll()

  void movePlayerTo({ newRelativePosition: ANCHOR })
}

// --- Ciclo de vida ----------------------------------------------------------

export function startRace() {
  resetRunState()
  resetSpawner()
  prefillSpawner()
  resetBike()
  hideGhost()
  uiBoost = false
  state.phase = 'countdown'
  state.countdown = RACE.countdownSeconds
  state.screen = 'home'
  playGo()
}

export function abortRace() {
  if (state.phase === 'countdown') {
    state.phase = 'menu'
    sendRaceAbort('cancelada en la cuenta regresiva')
    playIdle()
    return
  }
  if (state.phase !== 'racing') return
  sendRaceAbort('abandono')
  state.phase = 'menu'
  playIdle()
  hideGhost()
}

export function backToMenu() {
  state.phase = 'menu'
  state.result = null
  state.screen = 'home'
  resetRunState()
  resetSpawner()
  resetBike()
  hideGhost()
  playIdle()
}

function endRun(completed: boolean) {
  const online = isOnline()
  state.phase = completed ? 'finished' : 'wrecked'
  state.result = {
    completed,
    accepted: false,
    reason: '',
    elapsedMs: state.elapsedMs,
    coinsAwarded: 0,
    newRecord: false,
    // Sin servidor no hay veredicto que esperar: el resultado ya es final.
    pending: online,
    offline: !online
  }
  state.resultWaitFor = online ? RESULT_TIMEOUT : 0

  if (!online && completed && (state.bestTimeMs === 0 || state.elapsedMs < state.bestTimeMs)) {
    // Mejor marca local, para que una carrera offline no sea del todo en vano.
    state.bestTimeMs = Math.round(state.elapsedMs)
  }

  sendRaceFinish(completed)
  if (completed) playWinSfx()
  playIdle()
  hideGhost()
}

/**
 * Si el veredicto no llega, la pantalla de resultados no puede quedarse en
 * "validando" para siempre.
 */
function tickResultWait(dt: number) {
  if (state.resultWaitFor <= 0) return
  state.resultWaitFor -= dt
  if (state.resultWaitFor > 0) return
  if (state.result && state.result.pending) {
    state.result.pending = false
    state.result.accepted = false
    state.result.reason = 'el servidor no respondio a tiempo'
  }
}

// --- Sistema ----------------------------------------------------------------

function raceSystem(dt: number) {
  state.clock += dt
  keepPlayerAnchored(dt)
  tickToast(dt)
  tickResultWait(dt)
  updateMusic(dt)

  if (state.phase === 'countdown') {
    tickCountdown(dt)
    updateBike(dt)
    updateCamera(dt, getBikeX())
    return
  }

  if (state.phase !== 'racing') {
    // Fuera de carrera nadie esta acelerando: si el boton de la HUD se quedo
    // apretado porque la UI desaparecio bajo el dedo, se suelta aca.
    state.boosting = false
    uiBoost = false
    updateBike(dt)
    updateCamera(dt, getBikeX())
    return
  }

  readLaneInput()
  readBoostInput()
  updateBike(dt)

  if (state.invulnerableFor > 0) state.invulnerableFor -= dt

  // Velocidad: sube hacia la curva objetivo, que solo depende de la distancia.
  // Con el boost apretado el objetivo es esa misma curva multiplicada; al
  // soltarlo la moto baja frenando, no de un frame al otro.
  const target = state.boosting ? boostedSpeedAt(state.distanceM) : targetSpeedAt(state.distanceM)
  if (state.speed < target) {
    const rate = state.boosting ? RACE.boostRate : RACE.recoverRate
    state.speed = Math.min(target, state.speed + rate * dt)
  } else {
    state.speed = Math.max(target, state.speed - RACE.boostFalloffRate * dt)
  }

  const delta = state.speed * dt
  state.distanceM += delta
  state.elapsedMs += dt * 1000

  scrollTrack(delta)
  updateSpawner(delta, state.distanceM, getBikeX(), state.invulnerableFor <= 0, {
    onCoin: () => {
      state.runCoins += 1
    },
    onCrash: onCrash
  })

  updateCamera(dt, getBikeX(), boostAmount())
  updateGhostPosition()
  reportCheckpoints()

  if (state.distanceM >= RACE.distanceM) {
    state.distanceM = RACE.distanceM
    // La meta cierra el ultimo checkpoint antes del reporte final: sin el, el
    // servidor ve la carrera incompleta y la rechaza.
    reportCheckpoints()
    endRun(true)
  }
}

function tickCountdown(dt: number) {
  state.countdown -= dt
  if (state.countdown > 0) return
  state.countdown = 0
  state.phase = 'racing'
  state.speed = RACE.baseSpeed
  playGo()
  // El reloj del servidor arranca aca, no al abrir la cuenta regresiva: si no,
  // los 3 segundos de countdown se veran como desfase de reloj en cada checkpoint.
  sendRaceStart()
}

function readLaneInput() {
  if (inputSystem.isTriggered(InputAction.IA_LEFT, PointerEventType.PET_DOWN)) {
    state.lane = moveLane(-1)
  } else if (inputSystem.isTriggered(InputAction.IA_RIGHT, PointerEventType.PET_DOWN)) {
    state.lane = moveLane(1)
  }
}

/**
 * Boost mantenido con la barra espaciadora.
 *
 * `isPressed` y no `isTriggered`: interesa el estado de la tecla en este frame,
 * no el flanco de bajada. `uiBoost` es lo mismo desde el boton de la HUD, que
 * en mobile es la unica via.
 */
function readBoostInput() {
  state.boosting = uiBoost || inputSystem.isPressed(InputAction.IA_JUMP)
}

/** Boost desde el boton de la HUD: vale mientras el boton siga apretado. */
export function setBoost(active: boolean) {
  uiBoost = active
}

/**
 * Cuanto boost hay ahora, de 0 a 1.
 *
 * Se deriva de la velocidad y no del estado de la tecla, asi que sube y baja
 * con la rampa: la camara y la HUD acompanan en vez de saltar.
 */
export function boostAmount(): number {
  const base = targetSpeedAt(state.distanceM)
  if (base <= 0) return 0
  const over = state.speed / base - 1
  return Math.max(0, Math.min(1, over / (RACE.boostMultiplier - 1)))
}

/** Cambio de carril desde los botones de la UI (y desde mobile). */
export function changeLane(direction: number) {
  if (state.phase !== 'racing' && state.phase !== 'countdown') return
  state.lane = moveLane(direction)
}

function onCrash() {
  state.crashes += 1
  state.speed = RACE.crashSpeed
  state.invulnerableFor = RACE.crashInvulnerability
  if (state.crashes >= RACE.lives) {
    endRun(false)
    return
  }
  showToast(`Choque - te quedan ${RACE.lives - state.crashes}`, 2)
}

/**
 * Manda un checkpoint por cada tramo de 100 m cruzado.
 *
 * El bucle cubre el caso de un frame largo que cruza mas de un tramo: el
 * servidor exige indices consecutivos y saltarse uno invalida la carrera.
 */
function reportCheckpoints() {
  const reached = Math.min(CHECKPOINT_COUNT, Math.floor(state.distanceM / RACE.checkpointIntervalM))
  while (state.lastCheckpointSent < reached) {
    state.lastCheckpointSent += 1
    sendCheckpoint(state.lastCheckpointSent)
  }
}

function updateGhostPosition() {
  if (!state.ghostAvailable || state.ghostSplits.length === 0) {
    state.ghostDistanceM = 0
    hideGhost()
    return
  }
  state.ghostDistanceM = ghostDistanceAt(state.elapsedMs, state.ghostSplits, RACE.checkpointIntervalM)
  updateGhost(state.distanceM, state.ghostDistanceM)
}

function tickToast(dt: number) {
  if (state.toastTimer <= 0) return
  state.toastTimer -= dt
  if (state.toastTimer <= 0) state.toast = ''
}

/**
 * Devuelve al avatar al ancla si se alejo.
 *
 * En los explorers donde `InputModifier` no surte efecto el jugador camina
 * libre y se sale de la pista; el cooldown evita teletransportarlo cada frame.
 */
function keepPlayerAnchored(dt: number) {
  if (anchorCooldown > 0) {
    anchorCooldown -= dt
    return
  }
  const position = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!position) return
  if (Vector3.distance(position, ANCHOR) <= ANCHOR_TOLERANCE) return

  anchorCooldown = ANCHOR_COOLDOWN
  void movePlayerTo({ newRelativePosition: ANCHOR })
}
