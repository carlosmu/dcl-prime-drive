import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { UiCanvasInformation, engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { CRASH_FLASH, state } from '../state'

const CRASH_IMAGE = 'assets/images/crash.png'
/** Width / height of crash.png (512x512). */
const CRASH_IMAGE_RATIO = 1

/**
 * Splash drawn over the race when the player crashes: full screen height,
 * width kept to the image's ratio, centered. It holds and then fades out by
 * lowering the tint's alpha.
 */
export const CrashFlash = () => {
  const remaining = state.crashFlash
  const alpha = Math.min(1, remaining / CRASH_FLASH.fade)
  return (
    <UiEntity
      uiTransform={{
        width: `${imageWidthPercent()}%`,
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: `${(100 - imageWidthPercent()) / 2}%` }
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: CRASH_IMAGE },
        color: Color4.create(1, 1, 1, alpha)
      }}
    />
  )
}

/**
 * Image width as a percentage of the screen width, so that at 100% height
 * it keeps its ratio on any screen shape.
 */
function imageWidthPercent(): number {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  if (!canvas || canvas.width <= 0) return (1080 / 1920) * CRASH_IMAGE_RATIO * 100
  return (canvas.height / canvas.width) * CRASH_IMAGE_RATIO * 100
}
