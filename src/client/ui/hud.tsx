import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { RACE, formatTime } from '../../shared/config'
import { livesLeft, state } from '../state'
import { boostAmount, changeLane, pauseRace, setBoost } from '../race'
import { PauseMenu } from './pause'
import { PRIME_FONT } from './bitmapFont'
import { COLORS, PANEL_RADIUS, ProgressBar, Text } from './theme'

/** Race HUD: time, coins, lives, and comparison with rivals. */
export const Hud = () => {
  const boost = boostAmount()
  const mobile = isMobile()
  const progress = state.distanceM / RACE.distanceM
  const ghostProgress = state.ghostDistanceM / RACE.distanceM

  const markers = [] as { progress: number; color: Color4 }[]
  if (state.ghostAvailable && state.ghostSplits.length > 0) {
    markers.push({ progress: ghostProgress, color: COLORS.ghost })
  }
  for (const rival of state.standings) {
    markers.push({ progress: rival.distanceM / RACE.distanceM, color: COLORS.gold })
  }

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {/* Top bar */}
      <UiEntity
        uiTransform={{
          width: '50%',
          height: 142,
          positionType: 'absolute',
          position: { top: 0, left: '25%' },
          flexDirection: 'column',
          padding: { left: 24, right: 24, top: 12, bottom: 12 },
          // Flush with the top edge of the screen: only the bottom corners are rounded.
          borderRadius: { bottomLeft: PANEL_RADIUS, bottomRight: PANEL_RADIUS }
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <HudStat icon={[0, 0]} label="TIME" value={formatTime(state.elapsedMs)} width={170} highlight />
          <HudStat
            icon={[2, 0]}
            label="KM/H"
            value={`${Math.round(state.speed * 3.6)}`}
            highlight={boost > 0.05}
          />
          <HudStat icon={[4, 0]} label="COINS" value={`${state.runCoins}`} highlight />
          <UiEntity
            uiTransform={{ width: 52, height: 52 }}
            uiBackground={atlasIcon(6, 0)}
            onMouseDown={() => pauseRace()}
          />
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: 5, margin: { top: 6 } }}>
          <ProgressBar progress={progress} markers={markers} height={4.5} />
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: 34, flexDirection: 'row', margin: { top: 6 } }}>
          <Text
            value={`Lives ${'#'.repeat(livesLeft())}${'.'.repeat(RACE.lives - livesLeft())}`}
            size={22}
            width="30%"
            color={livesLeft() > 1 ? COLORS.text : COLORS.danger}
          />
          <Text value={ghostLine()} size={22} width="40%" align="middle-center" color={COLORS.ghost} />
          <Text
            value={state.standings.length > 0 ? `${state.standings.length} racing` : 'solo run'}
            size={22}
            width="30%"
            align="middle-right"
            color={COLORS.textDim}
          />
        </UiEntity>
      </UiEntity>

      {state.invalidated ? (
        <UiEntity
          uiTransform={{
            width: 720,
            height: 52,
            positionType: 'absolute',
            position: { top: 172, left: '50%' },
            margin: { left: -360 }
          }}
          uiBackground={{ color: Color4.create(0.4, 0.05, 0.05, 0.9) }}
          uiText={{
            value: `Race invalidated by server: ${state.invalidReason}`,
            fontSize: 22,
            color: COLORS.text,
            textAlign: 'middle-center'
          }}
        />
      ) : null}

      {state.phase === 'countdown' ? (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 200,
            positionType: 'absolute',
            position: { top: '38%', left: '0%' }
          }}
          uiText={{
            value: state.countdown > 1 ? `${Math.ceil(state.countdown)}` : 'GO',
            fontSize: 160,
            color: COLORS.accent,
            textAlign: 'middle-center'
          }}
        />
      ) : null}

      {/* Touch / click controls */}
      <UiEntity
        uiTransform={{
          width: 360,
          height: 150,
          positionType: 'absolute',
          position: { bottom: CONTROLS_BOTTOM, left: 60 },
          flexDirection: 'row',
          justifyContent: 'space-between'
        }}
      >
        <LaneButton label="<" direction={-1} />
        <LaneButton label=">" direction={1} />
      </UiEntity>

      {/* Boost: held down. onMouseLeave releases it if the finger slides off. */}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: CONTROLS_BOTTOM, right: 60 } }}>
        <TouchButton
          label="BOOST"
          size={mobile ? 30 : 22}
          // On mobile it's a thumb target like the lane buttons.
          width={mobile ? 150 : 200}
          height={mobile ? 150 : 56}
          active={boost > 0.05}
          onDown={() => setBoost(true)}
          onUp={() => setBoost(false)}
        />
      </UiEntity>

      {/* Keyboard hints: meaningless on a touch screen. */}
      {mobile ? null : <KeyHints boosting={boost > 0.05} />}

      {state.paused ? <PauseMenu /> : null}
    </UiEntity>
  )
}

/** Bottom offset of the touch controls: 60 px + 5vh (54 px of the 1080 virtual height). */
const CONTROLS_BOTTOM = 60 + 54

const ATLAS = 'assets/images/atlas_01.png'
const ATLAS_GRID = 8

/** 2x2-cell icon from the 8x8 atlas; col/row are 0-based from the top-left (A1 = 0,0). */
export function atlasIcon(col: number, row: number, size = 2) {
  const s = 1 / ATLAS_GRID
  const u0 = col * s
  const u1 = (col + size) * s
  const v1 = 1 - row * s
  const v0 = 1 - (row + size) * s
  return {
    textureMode: 'stretch' as const,
    texture: { src: ATLAS },
    uvs: [u0, v0, u0, v1, u1, v1, u1, v0]
  }
}

/** `width` must fit the widest value: a text that overflows makes the row jump. */
const HudStat = (props: {
  icon: [number, number]
  label: string
  value: string
  color?: Color4
  width?: number
  highlight?: boolean
}) => (
  <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center' }}>
    <UiEntity uiTransform={{ width: 52, height: 52, margin: { right: 8 } }} uiBackground={atlasIcon(...props.icon)} />
    <UiEntity
      uiTransform={{ width: props.width ?? 110, height: '100%', flexDirection: 'column', justifyContent: 'center' }}
    >
      <Text value={props.label} size={16} height={20} color={COLORS.textDim} />
      <Text value={props.value} size={28} height={32} color={props.color ?? COLORS.text} highlight={props.highlight} />
    </UiEntity>
  </UiEntity>
)

/**
 * Only as big as its two lines (not a full-screen wrapper), so it never sits
 * on top of the BOOST or lane buttons and steals their clicks.
 */
const KeyHints = (props: { boosting: boolean }) => (
  <UiEntity
    uiTransform={{
      width: 380,
      height: 82,
      positionType: 'absolute',
      position: { bottom: CONTROLS_BOTTOM + 70, right: 60 },
      flexDirection: 'column-reverse'
    }}
  >
    <UiEntity
      uiTransform={{ width: '100%', height: 44 }}
      uiText={{
        value: 'A / D to change lanes',
        fontSize: 20,
        color: COLORS.textDim,
        textAlign: 'middle-right'
      }}
    />
    <UiEntity
      uiTransform={{ width: '100%', height: 38 }}
      uiText={{
        value: 'HOLD SPACE to boost',
        fontSize: 20,
        color: props.boosting ? COLORS.gold : COLORS.textDim,
        textAlign: 'middle-right'
      }}
    />
  </UiEntity>
)

function ghostLine(): string {
  if (!state.ghostAvailable || state.ghostSplits.length === 0) return 'no ghost yet'
  const gap = state.distanceM - state.ghostDistanceM
  const sign = gap >= 0 ? '+' : '-'
  return `${state.ghostName || 'record'}  ${sign}${Math.abs(Math.round(gap))} m`
}

const LaneButton = (props: { label: string; direction: number }) => (
  <TouchButton label={props.label} size={56} width={150} height={150} onDown={() => changeLane(props.direction)} />
)

/** Fill of the touch controls: 40% so the track shows through. */
const TOUCH_FILL = Color4.create(0, 0, 0, 0.4)
const TOUCH_FILL_ACTIVE = Color4.create(0.15, 0.75, 1, 0.4)

/** Rounded, white-bordered, see-through button for the on-screen controls. */
const TouchButton = (props: {
  label: string
  size: number
  width: number
  height: number
  active?: boolean
  onDown: () => void
  onUp?: () => void
}) => (
  <UiEntity
    uiTransform={{
      width: props.width,
      height: props.height,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 24,
      borderWidth: 4,
      borderColor: Color4.White()
    }}
    uiBackground={{ color: props.active ? TOUCH_FILL_ACTIVE : TOUCH_FILL }}
    onMouseDown={props.onDown}
    onMouseUp={props.onUp}
    onMouseLeave={props.onUp}
  >
    {hasAllGlyphs(props.label) ? (
      <Text value={props.label} size={props.size} width="100%" align="middle-center" highlight={props.active} />
    ) : (
      // The bitmap font has no `<` / `>`: the lane arrows fall back to the system font.
      <UiEntity
        uiTransform={{ width: '100%', height: '100%' }}
        uiText={{ value: props.label, fontSize: props.size, color: COLORS.text, textAlign: 'middle-center' }}
      />
    )}
  </UiEntity>
)

function hasAllGlyphs(text: string): boolean {
  return Array.from(text).every((char) => PRIME_FONT.glyphs.has(char.codePointAt(0) ?? 0))
}
