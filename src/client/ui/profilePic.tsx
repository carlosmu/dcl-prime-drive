import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

/** Shown instead of a profile picture when there isn't one (guests, offline). */
const FALLBACK_AVATAR = 'assets/images/fallback_profile_pic.png'
/**
 * Panel-colored square with a transparent circle, laid over each picture.
 * Desktop doesn't clip textures to `borderRadius` (mobile does), so this
 * crops them to a circle on every platform.
 */
export const AVATAR_MASK = 'assets/images/avatar_mask.png'

/**
 * Round profile picture with a colored ring. An empty `userId` falls back to
 * the generic picture. `mask` must match the color behind the picture: its
 * corners are opaque.
 */
export const ProfilePic = (props: { userId: string; size: number; ringColor: Color4; mask?: string }) => (
  <UiEntity
    uiTransform={{ width: props.size, height: props.size, flexShrink: 0, borderRadius: props.size / 2 }}
    uiBackground={
      props.userId
        ? { textureMode: 'stretch', avatarTexture: { userId: props.userId } }
        : { textureMode: 'stretch', texture: { src: FALLBACK_AVATAR } }
    }
  >
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}
      uiBackground={{ textureMode: 'stretch', texture: { src: props.mask ?? AVATAR_MASK } }}
    />
    {/* The ring goes over the mask, so the mask's antialiased edge never shows. */}
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        borderRadius: props.size / 2,
        borderWidth: 2,
        borderColor: props.ringColor
      }}
    />
  </UiEntity>
)
