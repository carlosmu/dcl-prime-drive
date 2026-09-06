import { AvatarBase, AvatarEquippedData, AvatarShape, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getBikeRoot } from './bike'

/**
 * The rider sitting on the bike.
 *
 * It is NOT the real Decentraland avatar: that one is engine-controlled, so
 * it can't be parented to anything and every reposition interrupts its
 * animation. This is an `AvatarShape` — an avatar rendered as a plain scene
 * entity — cloned from the player's own look and parented to the bike, so it
 * inherits the lean for free. The real avatar stays hidden and parked (see
 * `lockPlayer` in race.ts).
 */

/**
 * Id of the rider's shape.
 *
 * Deliberately not the player's address: the avatar-hiding area covers the
 * whole track, and it's excluded by this id so the rider stays visible while
 * the real avatar — which carries the wallet address — stays hidden.
 */
export const RIDER_ID = 'prime-drive-rider'

/** Seated pose. Same file the real avatar used to play as a scene emote. */
const RIDE_EMOTE = 'assets/models/player_emote.glb'
/** Local offset from the bike's origin. Raise it if the rider sinks into the seat. */
const SEAT_OFFSET = Vector3.create(0, 0, 0)
/**
 * How often the pose is replayed, in seconds.
 *
 * `AvatarShape` has no loop flag, so a finished emote drops the avatar back
 * to idle. This has to stay just under the clip's own length — 12.5 s as
 * exported — so the next play starts before the current one runs out. Keep
 * both in step if the clip is re-exported.
 */
const POSE_REFRESH = 12

let rider: Entity = engine.RootEntity
/** Look currently drawn, to tell a real profile change from a repeated read. */
let appliedLook = ''
let poseTimer = 0
let poseTick = 0

export function buildRider() {
  rider = engine.addEntity()
  Transform.create(rider, { parent: getBikeRoot(), position: SEAT_OFFSET })
}

/**
 * Keeps the rider wearing the player's current outfit and holding the pose.
 *
 * The profile lands in pieces — the first wearable list the scene sees is
 * usually short, and the rest (a helmet, say) shows up later — so the look is
 * re-read every frame rather than captured once. The shape itself is only
 * rewritten when something actually changed: every write rebuilds the avatar
 * in the client, which is what made the rider blink in and out.
 */
export function updateRider(dt: number) {
  refreshLook()

  if (appliedLook === '') return
  poseTimer -= dt
  if (poseTimer > 0) return
  poseTimer = POSE_REFRESH
  poseTick += 1
  // Only the timestamp: replaying the same id needs it bumped, and touching
  // nothing else keeps the client from rebuilding the whole avatar.
  AvatarShape.getMutable(rider).expressionTriggerTimestamp = poseTick
}

/**
 * Turns an equipped urn into the item urn `AvatarShape` expects.
 *
 * The profile reports which NFT the player owns
 * (`...:collections-v2:<contract>:<item>:<tokenId>`), but the shape only
 * resolves the item itself (`...:<contract>:<item>`) and silently skips
 * anything else — which is why on-chain wearables were missing while
 * base-avatar ones rendered. Third-party urns are left alone: their seventh
 * part is the item, not a token id.
 */
function toItemUrn(urn: string): string {
  const parts = urn.split(':')
  if (parts.length !== 7) return urn
  if (parts[3] !== 'collections-v2' && parts[3] !== 'collections-v1') return urn
  return parts.slice(0, 6).join(':')
}

function refreshLook() {
  // Read straight off the player entity: these components are the live
  // profile, while a cached lookup can keep handing back the first snapshot.
  const equipped = AvatarEquippedData.getOrNull(engine.PlayerEntity)
  const base = AvatarBase.getOrNull(engine.PlayerEntity)
  // Both halves are required: every wearable ships one mesh per body shape,
  // so a rider built before the body shape lands has nothing to pick from.
  if (!equipped || equipped.wearableUrns.length === 0 || !base?.bodyShapeUrn) return

  const wearables = equipped.wearableUrns.map(toItemUrn)
  const look = `${base.bodyShapeUrn}|${wearables.join(',')}`
  if (look === appliedLook) return
  appliedLook = look
  console.log(`[Rider] ${base.bodyShapeUrn} wearing ${wearables.length}: ${wearables.join(', ')}`)

  AvatarShape.createOrReplace(rider, {
    id: RIDER_ID,
    // Empty on purpose: the name tag would follow the bike around the track.
    name: '',
    bodyShape: base.bodyShapeUrn,
    skinColor: base.skinColor,
    hairColor: base.hairColor,
    eyeColor: base.eyesColor,
    wearables,
    emotes: [],
    expressionTriggerId: RIDE_EMOTE,
    expressionTriggerTimestamp: poseTick
  })
  poseTimer = POSE_REFRESH
}
