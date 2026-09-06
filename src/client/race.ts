import {
  AvatarModifierArea,
  AvatarModifierType,
  Entity,
  InputAction,
  InputModifier,
  PointerEventType,
  TouchScreenControls,
  Transform,
  engine,
  inputSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { movePlayerTo, triggerSceneEmote } from '~system/RestrictedActions'
import { CHECKPOINT_COUNT, RACE, TRACK, boostedSpeedAt, targetSpeedAt } from '../shared/config'
import { ghostDistanceAt, isOnline, resetRunState, showToast, state } from './state'
import { getBikeX, getBikeY, moveLane, playGo, playIdle, resetBike, updateBike } from './game/bike'
import { activateCamera, updateCamera } from './game/camera'
import { hideGhost, updateGhost } from './game/ghost'
import { updateMusic } from './game/music'
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

/** Looping ride animation played on the real avatar while it rides the bike. */
const PLAYER_EMOTE_SRC = 'assets/models/player_emote.glb'
/** How far ahead the avatar is aimed so it ends up facing down the track. */
const FACING_AHEAD = 10
/** How far the avatar may drift off the seat before it's put back, in meters. */
const DRIFT_TOLERANCE = 1.5
const RESEAT_COOLDOWN = 1
/** Seconds the results screen waits for the server's verdict. */
const RESULT_TIMEOUT = 10

let hideAreaEntity: Entity = engine.RootEntity
let ownAvatarExcluded = false
let reseatCooldown = 0
/** Boost requested from the HUD button (mobile and click). */
let uiBoost = false

export function initRace() {
  lockPlayer()
  activateCamera()
  engine.addSystem(raceSystem)
}

/** Where the avatar sits: on the bike, which never leaves the center of the road. */
function bikeSeat(): Vector3 {
  return Vector3.create(TRACK.centerX, getBikeY(), TRACK.playerZ)
}

/**
 * Puts the avatar on the seat facing down the track, and starts the looping
 * ride emote.
 *
 * `avatarTarget` is what settles the facing: without it the avatar keeps
 * whatever yaw it walked into the scene with. The emote carries no rotation
 * of its own — its single keyframe is a plain seated pose — so this is the
 * only thing pointing the rider forward.
 */
function snapPlayerToSeat() {
  const seat = bikeSeat()
  void movePlayerTo({
    newRelativePosition: seat,
    // The world travels toward -Z, so forward for the bike is +Z.
    avatarTarget: Vector3.create(seat.x, seat.y, seat.z + FACING_AHEAD)
  }).then(() => triggerSceneEmote({ src: PLAYER_EMOTE_SRC, loop: true }))
}

/**
 * Freezes the real Decentraland avatar on top of the active bike, instead of
 * hiding it: the bike models have no rider of their own, so this is what the
 * player actually sees riding.
 *
 * The avatar's `Transform` is engine-controlled and can't be parented to the
 * bike entity directly (writes to it are silently ignored), so it's kept in
 * place with `movePlayerTo` instead — sliding to the new seat on every lane
 * change (see `syncPlayerToBike`), over roughly the bike's own lane time.
 * `InputModifier` blocks walking, jogging, running and jumping so the avatar
 * never wanders off the seat on its own; the re-anchoring in
 * `syncPlayerToBike` is the safety net for explorers where `InputModifier`
 * has no effect.
 */
function lockPlayer() {
  // `disableWalk`/`disableJog`/`disableRun` alone still let the avatar
  // sidestep with A/D (it ran visibly toward the bike instead of staying
  // seated) — `disableAll` is the only flag combination that fully locks the
  // avatar in place. The boost key (spacebar) still works: `isPressed(IA_JUMP)`
  // reads raw input regardless of what InputModifier blocks.
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
    // Other visitors' avatars stay hidden so they don't clutter the track;
    // the local player is excluded once its address is known (see
    // `excludeOwnAvatarFromHiding`) since it must stay visible on the bike.
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS, AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: []
  })
  hideAreaEntity = hideArea

  // Mobile: the native joystick doesn't work with locomotion disabled, and
  // lanes are changed with the UI buttons. No-op on desktop.
  TouchScreenControls.hideJoystick()
  TouchScreenControls.hideCrosshair()
  TouchScreenControls.hideAll()

  snapPlayerToSeat()
}

/**
 * Excludes the local player from the avatar-hiding area as soon as its
 * address is known. `getPlayer()` can return nothing on the very first
 * frames, so this keeps checking every tick until it succeeds, then stops.
 */
function excludeOwnAvatarFromHiding() {
  if (ownAvatarExcluded) return
  const player = getPlayer()
  if (!player) return
  AvatarModifierArea.getMutable(hideAreaEntity).excludeIds = [player.userId]
  ownAvatarExcluded = true
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
  excludeOwnAvatarFromHiding()
  keepPlayerSeated(dt)
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
 * Safety net, and nothing else.
 *
 * The avatar is seated once and then never moved again: every reposition
 * interrupts the ride emote and makes the client play a walk or run cycle,
 * which is exactly why lane changes move the world instead of the bike. This
 * only ever fires in explorers where `InputModifier` has no effect and the
 * player can still walk off the seat.
 *
 * Y is left out of the comparison: the client grounds the avatar at its own
 * height, so it never matches the seat exactly and would re-seat forever.
 */
function keepPlayerSeated(dt: number) {
  if (reseatCooldown > 0) {
    reseatCooldown -= dt
    return
  }
  const position = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!position) return
  const seat = bikeSeat()
  if (Math.abs(position.x - seat.x) <= DRIFT_TOLERANCE && Math.abs(position.z - seat.z) <= DRIFT_TOLERANCE) return

  reseatCooldown = RESEAT_COOLDOWN
  snapPlayerToSeat()
}
