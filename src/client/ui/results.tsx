import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { RACE, formatDistance, formatTime } from '../../shared/config'
import { livesLeft, state } from '../state'
import { backToMenu, startRace } from '../race'
import { COLORS, MenuButton, PANEL_RADIUS, TEXT_SIZE, Text } from './theme'

/** One row of the coin breakdown. Zero amounts (no record, no lives left) are skipped. */
const BreakdownLine = (props: { label: string; amount: number }) =>
  props.amount > 0 ? (
    <UiEntity uiTransform={{ width: '100%', height: 28, flexDirection: 'row', margin: { top: 6 } }}>
      <Text value={props.label} size={TEXT_SIZE.sm} width="70%" color={COLORS.textDim} />
      <Text value={`+${props.amount}`} size={TEXT_SIZE.sm} width="30%" align="middle-right" />
    </UiEntity>
  ) : null

/** End-of-race screen. Waits for the server's verdict. */
export const Results = () => {
  const result = state.result
  if (!result) return <UiEntity />

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: 760, height: 650, flexDirection: 'column', padding: 32, borderRadius: PANEL_RADIUS }}
        uiBackground={{ color: COLORS.panel }}
      >
        <Text
          value={result.completed ? 'FINISH' : 'BIKE DESTROYED'}
          size={52}
          highlight={result.completed}
          color={COLORS.danger}
        />
        <Text
          value={result.completed ? `Time ${formatTime(result.elapsedMs)}` : `You reached ${formatDistance(state.distanceM)}`}
          size={30}
          marginTop={10}
        />
        <Text
          value={`Race coins: ${state.runCoins}  -  crashes: ${state.crashes}/${RACE.lives}`}
          size={24}
          color={COLORS.textDim}
          marginTop={8}
        />

        <UiEntity uiTransform={{ width: '100%', height: 250, flexDirection: 'column', margin: { top: 20 } }}>
          {result.pending ? (
            <Text value="Validating with the server..." size={26} color={COLORS.textDim} />
          ) : result.offline ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="Local race, no server" size={28} color={COLORS.gold} />
              <Text
                value="Coins are not credited and the time does not enter the ranking."
                size={22}
                maxWidth={696}
                color={COLORS.textDim}
                marginTop={6}
              />
            </UiEntity>
          ) : result.accepted && !result.completed ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="No coins credited" size={28} color={COLORS.danger} />
              <Text
                value="Finish the race to keep the coins you pick up."
                size={22}
                color={COLORS.textDim}
                marginTop={6}
                maxWidth={696}
              />
            </UiEntity>
          ) : result.accepted ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value={`+${result.coinsAwarded} coins credited`} size={TEXT_SIZE.lg} highlight />
              <BreakdownLine label="Coins picked up" amount={result.coinsPicked} />
              <BreakdownLine label="Finish bonus" amount={result.finishBonus} />
              <BreakdownLine label={`Lives bonus (${livesLeft()} left)`} amount={result.livesBonus} />
              <BreakdownLine label="Record bonus" amount={result.recordBonus} />
              <Text value={`Balance: ${state.coins}`} size={TEXT_SIZE.sm} color={COLORS.textDim} marginTop={8} />
              {result.newRecord ? (
                <Text value="New track record - your lap is the new ghost" size={24} color={COLORS.ghost} marginTop={6} />
              ) : null}
            </UiEntity>
          ) : (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="The server rejected the race" size={28} color={COLORS.danger} />
              <Text value={result.reason} size={22} color={COLORS.textDim} marginTop={6} maxWidth={696} />
            </UiEntity>
          )}
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: 76, flexDirection: 'row', margin: { top: 20 } }}>
          <MenuButton
            label="RACE AGAIN"
            primary
            disabled={result.pending}
            fontSize={TEXT_SIZE.md}
            width="32%"
            height={76}
            margin={{ right: '2%' }}
            onDown={() => startRace()}
          />
          <MenuButton
            label="RANKING"
            fontSize={TEXT_SIZE.md}
            width="32%"
            height={76}
            margin={{ right: '2%' }}
            onDown={() => {
              backToMenu()
              state.screen = 'ranking'
            }}
          />
          <MenuButton label="MENU" fontSize={TEXT_SIZE.md} width="32%" height={76} onDown={() => backToMenu()} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
