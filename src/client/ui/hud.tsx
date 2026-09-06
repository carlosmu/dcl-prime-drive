import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { RACE, formatDistance, formatTime } from '../../shared/config'
import { livesLeft, state } from '../state'
import { abortRace, boostAmount, changeLane, setBoost } from '../race'
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
          width: '40%',
          height: 132,
          positionType: 'absolute',
          position: { top: 24, left: '30%' },
          flexDirection: 'column',
          padding: { left: 24, right: 24, top: 12, bottom: 12 }
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <UiEntity uiTransform={{ width: '100%', height: 46, flexDirection: 'row' }}>
          <Text value={formatTime(state.elapsedMs)} size={38} width="24%" />
          <Text
            value={`${formatDistance(state.distanceM)} / ${formatDistance(RACE.distanceM)}`}
            size={30}
            width="34%"
            align="middle-center"
            color={COLORS.textDim}
          />
          <Text
            value={`${Math.round(state.speed * 3.6)} km/h${boost > 0.05 ? '  >>' : ''}`}
            size={30}
            width="21%"
            align="middle-center"
            color={boost > 0.05 ? COLORS.gold : COLORS.accent}
          />
          <Text
            value={`${state.runCoins} coins`}
            size={30}
            width="21%"
            align="middle-right"
            color={COLORS.gold}
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

      <Button
        value="Quit"
        variant="secondary"
        fontSize={22}
        onMouseDown={() => abortRace()}
        uiTransform={{
          width: 160,
          height: 56,
          positionType: 'absolute',
          position: { top: 62, left: '70%' },
          margin: { left: 16 }
        }}
      />
    </UiEntity>
  )
}

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
