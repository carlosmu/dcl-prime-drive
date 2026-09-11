import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { RACE, formatTime } from '../../shared/config'
import { livesLeft, state } from '../state'
import { boostAmount, changeLane, pauseRace, setBoost } from '../race'
import { PauseMenu } from './pause'
import { COLORS, ProgressBar, Text } from './theme'

/** Race HUD: time, coins, lives, and comparison with rivals. */
export const Hud = () => {
  const boost = boostAmount()
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
          position: { top: 24, left: '25%' },
          flexDirection: 'column',
          padding: { left: 24, right: 24, top: 12, bottom: 12 }
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

        <UiEntity uiTransform={{ width: '100%', height: 20, margin: { top: 6 } }}>
          <ProgressBar progress={progress} markers={markers} />
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
          position: { bottom: 60, left: 60 },
          flexDirection: 'row',
          justifyContent: 'space-between'
        }}
      >
        <LaneButton label="<" direction={-1} />
        <LaneButton label=">" direction={1} />
      </UiEntity>

      {/* Boost: held down. onMouseLeave releases it if the finger slides off. */}
      <Button
        value="BOOST"
        variant={boost > 0.05 ? 'primary' : 'secondary'}
        fontSize={22}
        onMouseDown={() => setBoost(true)}
        onMouseUp={() => setBoost(false)}
        onMouseLeave={() => setBoost(false)}
        uiTransform={{
          width: 200,
          height: 56,
          positionType: 'absolute',
          position: { bottom: 60, right: 60 }
        }}
      />

      <UiEntity
        uiTransform={{
          width: 380,
          height: 44,
          positionType: 'absolute',
          position: { bottom: 130, right: 60 }
        }}
        uiText={{
          value: 'A / D to change lanes',
          fontSize: 20,
          color: COLORS.textDim,
          textAlign: 'middle-right'
        }}
      />

      <UiEntity
        uiTransform={{
          width: 380,
          height: 44,
          positionType: 'absolute',
          position: { bottom: 168, right: 60 }
        }}
        uiText={{
          value: 'HOLD SPACE to boost',
          fontSize: 20,
          color: boost > 0.05 ? COLORS.gold : COLORS.textDim,
          textAlign: 'middle-right'
        }}
      />

      {state.paused ? <PauseMenu /> : null}
    </UiEntity>
  )
}

const ATLAS = 'assets/images/atlas_01.png'
const ATLAS_GRID = 8

/** 2x2-cell icon from the 8x8 atlas; col/row are 0-based from the top-left (A1 = 0,0). */
function atlasIcon(col: number, row: number, size = 2) {
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

function ghostLine(): string {
  if (!state.ghostAvailable || state.ghostSplits.length === 0) return 'no ghost yet'
  const gap = state.distanceM - state.ghostDistanceM
  const sign = gap >= 0 ? '+' : '-'
  return `${state.ghostName || 'record'}  ${sign}${Math.abs(Math.round(gap))} m`
}

const LaneButton = (props: { label: string; direction: number }) => (
  <Button
    value={props.label}
    variant="secondary"
    fontSize={56}
    onMouseDown={() => changeLane(props.direction)}
    uiTransform={{ width: 150, height: 150 }}
  />
)
