import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { COLORS, Text } from './theme'

/** Size of one key at `scale` 1, in px of the 1920x1080 virtual screen. */
const KEY_WIDTH = 104
const KEY_HEIGHT = 76
const KEY_GAP = 8
const KEY_FILL = Color4.create(0.04, 0.05, 0.09, 0.6)
/** Blue-grey shared by every key's outline and label. */
const KEY_GREY = Color4.create(0.5, 0.57, 0.7, 1)

/** Width of the A S D row at a given scale. */
export function keyboardGuideWidth(scale: number): number {
  return (3 * KEY_WIDTH + 2 * KEY_GAP) * scale
}

/** Height of the W row plus the A S D row at a given scale. */
export function keyboardGuideHeight(scale: number): number {
  return (2 * KEY_HEIGHT + KEY_GAP) * scale
}

/**
 * Desktop controls drawn as a WASD cluster: W on top, A S D below. Shared by
 * the menu tutorial and the race HUD. Read-only indicators, so no pointer
 * handlers and no hover look.
 */
export const KeyboardGuide = (props: { scale?: number }) => {
  const scale = props.scale ?? 1
  return (
    <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
      <KeyHint letter="W" label="SPEED UP" scale={scale} />
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: KEY_GAP * scale } }}>
        <KeyHint letter="A" label="LEFT" scale={scale} />
        <KeyHint letter="S" label="BRAKE" scale={scale} gap />
        <KeyHint letter="D" label="RIGHT" scale={scale} gap />
      </UiEntity>
    </UiEntity>
  )
}

const KeyHint = (props: { letter: string; label: string; scale: number; gap?: boolean }) => (
  <UiEntity
    uiTransform={{
      width: KEY_WIDTH * props.scale,
      height: KEY_HEIGHT * props.scale,
      margin: { left: props.gap ? KEY_GAP * props.scale : 0 },
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 10 * props.scale,
      borderWidth: 1,
      borderColor: KEY_GREY
    }}
    uiBackground={{ color: KEY_FILL }}
  >
    <Text value={props.letter} size={34 * props.scale} height={40 * props.scale} align="middle-center" />
    <Text
      value={props.label}
      size={14 * props.scale}
      height={18 * props.scale}
      align="middle-center"
      color={KEY_GREY}
    />
  </UiEntity>
)
