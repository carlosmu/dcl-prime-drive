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
import { RIDER_ID, updateRider } from './game/rider'
import { playWinSfx, prefillSpawner, resetSpawner, updateSpawner } from './game/spawner'
import { scrollTrack, setWorldOffset } from './game/track'
import { sendCheckpoint, sendRaceAbort, sendRaceFinish, sendRaceStart } from './net'

/**
 * Race loop.
 *
 * The player never advances: the bike only moves along X, and it's the world
 * that comes toward it. `state.distanceM` is the only notion of progress, and
 * it's what gets reported to the server every 100 m.
 */

/** The real avatar is parked here, hidden and frozen. */
const PARK = Vector3.create(TRACK.centerX, 0, TRACK.playerZ - 3)
/** If the avatar drifts further than this, it's sent back to the park spot. */
const PARK_TOLERANCE = 5
const PARK_COOLDOWN = 1.5
/** Seconds the results screen waits for the server's verdict. */
const RESULT_TIMEOUT = 10

let parkCooldown = 0
/** Boost requested from the HUD button (mobile and click). */
let uiBoost = false

export function initRace() {
  lockPlayer()
  activateCamera()
  engine.addSystem(raceSystem)
}

/**
 * Freezes and hides the real Decentraland avatar.
 *
 * What the player sees riding is not this avatar but the `AvatarShape` clone
 * parented to the bike (see rider.ts): the real one is engine-controlled, so
 * it can't be parented to the bike and every reposition would interrupt its
 * animation. It's parked out of the way instead.
 *
 * The avatar area covers the whole scene so other players' avatars don't show
 * up running down the track either. The re-parking below is the safety net
 * for explorers where `InputModifier` has no effect.
 */
function lockPlayer() {
  // The whole avatar is frozen, not just walking: `disableWalk`/`disableJog`/
  // `disableRun` still leave A/D sidestepping enabled. The boost key still
  // works — `isPressed(IA_JUMP)` reads raw input regardless of what
  // InputModifier blocks.
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({
      disableAll: true,
      disableEmote: true
    })
  })

  const hideArea = engine.addEntity()
  Transform.create(hideArea, { position: Vector3.create(TRACK.centerX, 10, TRACK.roadLength / 2) })
  AvatarModifierArea.create(hideArea, {
    area: Vector3.create(70, 40, TRACK.roadLength + 20),
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS, AvatarModifierType.AMT_DISABLE_PASSPORTS],
    // The rider on the bike is an AvatarShape and sits inside this area too.
    excludeIds: [RIDER_ID]
  })

  // Mobile: the native joystick doesn't work with locomotion disabled, and
  // lanes are changed with the UI buttons. No-op on desktop.
  TouchScreenControls.hideJoystick()
  TouchScreenControls.hideCrosshair()
  TouchScreenControls.hideAll()

  void movePlayerTo({ newRelativePosition: PARK })
}

// --- Lifecycle ----------------------------------------------------------

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
    sendRaceAbort('cancelled during countdown')
    playIdle()
    return
  }
  if (state.phase !== 'racing') return
  sendRaceAbort('quit')
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
    // Without a server there's no verdict to wait for: the result is already final.
    pending: online,
    offline: !online
  }
  state.resultWaitFor = online ? RESULT_TIMEOUT : 0

  if (!online && completed && (state.bestTimeMs === 0 || state.elapsedMs < state.bestTimeMs)) {
    // Local best time, so an offline race isn't entirely for nothing.
    state.bestTimeMs = Math.round(state.elapsedMs)
  }

  sendRaceFinish(completed)
  if (completed) playWinSfx()
  playIdle()
  hideGhost()
}

/**
 * If the verdict never arrives, the results screen can't stay stuck on
 * "validating" forever.
 */
function tickResultWait(dt: number) {
  if (state.resultWaitFor <= 0) return
  state.resultWaitFor -= dt
  if (state.resultWaitFor > 0) return
  if (state.result && state.result.pending) {
    state.result.pending = false
    state.result.accepted = false
    state.result.reason = 'the server did not respond in time'
  }
}

// --- System ----------------------------------------------------------------

/** The bike's lane is drawn by sliding the world, not by moving the bike. */
function updateBikeAndWorld(dt: number) {
  updateBike(dt)
  setWorldOffset(getBikeX())
}

function raceSystem(dt: number) {
  state.clock += dt
  keepPlayerParked(dt)
  updateRider(dt)
  tickToast(dt)
  tickResultWait(dt)
  updateMusic(dt)

  if (state.phase === 'countdown') {
    tickCountdown(dt)
    updateBikeAndWorld(dt)
    updateCamera(dt, getBikeX())
    return
  }

  if (state.phase !== 'racing') {
    // Nobody's accelerating outside of a race: if the HUD button got stuck
    // pressed because the UI disappeared under the finger, release it here.
    state.boosting = false
    uiBoost = false
    updateBikeAndWorld(dt)
    updateCamera(dt, getBikeX())
    return
  }

  readLaneInput()
  readBoostInput()
  updateBikeAndWorld(dt)

  if (state.invulnerableFor > 0) state.invulnerableFor -= dt

  // Speed: rises toward the target curve, which only depends on distance.
  // With boost held the target is that same curve multiplied; releasing it
  // brings the bike down by braking, not from one frame to the next.
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
    // The finish line closes the last checkpoint before the final report:
    // without it, the server sees the race as incomplete and rejects it.
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
  // The server's clock starts here, not when the countdown opens: otherwise
  // the 3 seconds of countdown would look like clock drift on every checkpoint.
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
 * Boost held with the spacebar.
 *
 * `isPressed`, not `isTriggered`: what matters is the key's state on this
 * frame, not the falling edge. `uiBoost` is the same thing from the HUD
 * button, which on mobile is the only way to trigger it.
 */
function readBoostInput() {
  state.boosting = uiBoost || inputSystem.isPressed(InputAction.IA_JUMP)
}

/** Boost from the HUD button: stays active while the button is held. */
export function setBoost(active: boolean) {
  uiBoost = active
}

/**
 * How much boost there is right now, from 0 to 1.
 *
 * It's derived from speed rather than the key's state, so it rises and falls
 * along the ramp: the camera and HUD follow along instead of snapping.
 */
export function boostAmount(): number {
  const base = targetSpeedAt(state.distanceM)
  if (base <= 0) return 0
  const over = state.speed / base - 1
  return Math.max(0, Math.min(1, over / (RACE.boostMultiplier - 1)))
}

/** Lane change from the UI buttons (and from mobile). */
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
  showToast(`Crash - ${RACE.lives - state.crashes} lives left`, 2)
}

/**
 * Sends a checkpoint for each 100 m segment crossed.
 *
 * The loop covers the case of a long frame that crosses more than one
 * segment: the server requires consecutive indices, and skipping one
 * invalidates the race.
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
 * Returns the hidden avatar to the park spot if it drifted away.
 *
 * In explorers where `InputModifier` has no effect the player walks freely
 * and leaves the track; the cooldown avoids teleporting them every frame.
 */
function keepPlayerParked(dt: number) {
  if (parkCooldown > 0) {
    parkCooldown -= dt
    return
  }
  const position = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!position) return
  if (Vector3.distance(position, PARK) <= PARK_TOLERANCE) return

  parkCooldown = PARK_COOLDOWN
  void movePlayerTo({ newRelativePosition: PARK })
}
