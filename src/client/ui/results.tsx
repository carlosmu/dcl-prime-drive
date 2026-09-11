import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { RACE, formatDistance, formatTime } from '../../shared/config'
import { state } from '../state'
import { backToMenu, startRace } from '../race'
import { COLORS, Text } from './theme'

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
        uiTransform={{ width: 760, height: 520, flexDirection: 'column', padding: 32 }}
        uiBackground={{ color: COLORS.panel }}
      >
        <Text
          value={result.completed ? 'FINISH' : 'BIKE DESTROYED'}
          size={52}
          color={result.completed ? COLORS.accent : COLORS.danger}
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

        <UiEntity uiTransform={{ width: '100%', height: 120, flexDirection: 'column', margin: { top: 20 } }}>
          {result.pending ? (
            <Text value="Validating with the server..." size={26} color={COLORS.textDim} />
          ) : result.offline ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="Local race, no server" size={28} color={COLORS.gold} />
              <Text
                value="Coins are not credited and the time does not enter the ranking."
                size={22}
                color={COLORS.textDim}
                marginTop={6}
              />
            </UiEntity>
          ) : result.accepted && !result.completed ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="No coins credited" size={28} color={COLORS.danger} />
              <Text value="Finish the race to keep the coins you pick up." size={22} color={COLORS.textDim} marginTop={6} />
            </UiEntity>
          ) : result.accepted ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value={`+${result.coinsAwarded} coins credited`} size={30} color={COLORS.gold} />
              <Text value={`Balance: ${state.coins}`} size={24} color={COLORS.textDim} marginTop={6} />
              {result.newRecord ? (
                <Text value="New track record - your lap is the new ghost" size={24} color={COLORS.ghost} marginTop={6} />
              ) : null}
            </UiEntity>
          ) : (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="The server rejected the race" size={28} color={COLORS.danger} />
              <Text value={result.reason} size={22} color={COLORS.textDim} marginTop={6} />
            </UiEntity>
          )}
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: 76, flexDirection: 'row', margin: { top: 20 } }}>
          <Button
            value="Race again"
            variant="primary"
            fontSize={26}
            disabled={result.pending}
            onMouseDown={() => {
              if (!result.pending) startRace()
            }}
            uiTransform={{ width: '48%', height: 76, margin: { right: '4%' } }}
          />
          <Button
            value="Menu"
            variant="secondary"
            fontSize={26}
            onMouseDown={() => backToMenu()}
            uiTransform={{ width: '48%', height: 76 }}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
