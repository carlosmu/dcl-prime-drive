import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { RACE, SKINS, formatDistance, formatTime } from '../../shared/config'
import { isOnline, state } from '../state'
import { startRace } from '../race'
import { requestBuySkin, requestEquipSkin } from '../net'
import { toggleMusic } from '../game/music'
import { COLORS, Text } from './theme'

/** Main menu: race, garage, and ranking. */
export const Menu = () => (
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
      uiTransform={{
        width: 940,
        height: 700,
        flexDirection: 'column',
        padding: 32
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <UiEntity uiTransform={{ width: '100%', height: 78, flexDirection: 'row', alignItems: 'center' }}>
        <Text value="PRIME DRIVE" size={54} width="54%" color={COLORS.accent} />
        <Button
          value={state.musicOn ? 'Music: on' : 'Music: off'}
          variant="secondary"
          fontSize={20}
          onMouseDown={() => toggleMusic()}
          uiTransform={{ width: '22%', height: 48, margin: { right: 12 } }}
        />
        <Button
          value={state.debugOn ? 'Debug: on' : 'Debug: off'}
          variant="secondary"
          fontSize={20}
          onMouseDown={() => {
            state.debugOn = !state.debugOn
          }}
          uiTransform={{ width: '22%', height: 48 }}
        />
      </UiEntity>
      <Text
        value={`${formatDistance(RACE.distanceM)} - checkpoint every ${RACE.checkpointIntervalM} m - ${RACE.lives} lives`}
        size={22}
        color={COLORS.textDim}
      />

      <UiEntity uiTransform={{ width: '100%', height: 56, flexDirection: 'row', margin: { top: 18 } }}>
        <Tab id="home" label="Race" />
        <Tab id="garage" label="Garage" />
        <Tab id="ranking" label="Ranking" />
        <Text
          value={`${state.coins} coins`}
          size={28}
          width="30%"
          align="middle-right"
          color={COLORS.gold}
        />
      </UiEntity>

      <UiEntity uiTransform={{ width: '100%', height: 460, flexDirection: 'column', margin: { top: 16 } }}>
        {state.screen === 'home' ? <Home /> : null}
        {state.screen === 'garage' ? <Garage /> : null}
        {state.screen === 'ranking' ? <Ranking /> : null}
      </UiEntity>
    </UiEntity>
  </UiEntity>
)

const Tab = (props: { id: 'home' | 'garage' | 'ranking'; label: string }) => (
  <Button
    value={props.label}
    variant={state.screen === props.id ? 'primary' : 'secondary'}
    fontSize={24}
    onMouseDown={() => {
      state.screen = props.id
    }}
    uiTransform={{ width: '22%', height: 52, margin: { right: 12 } }}
  />
)

const Home = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
    <Text
      value={
        state.recordTimeMs > 0
          ? `Track record: ${formatTime(state.recordTimeMs)} - ${state.recordHolder}`
          : 'Nobody has completed the track yet. The first to finish leaves the ghost.'
      }
      size={24}
      color={COLORS.ghost}
    />
    <Text
      value={
        state.bestTimeMs > 0
          ? `Your best time: ${formatTime(state.bestTimeMs)}${
              state.racesFinished > 0 ? ` in ${state.racesFinished} races` : ' (local)'
            }`
          : "You haven't completed a race yet."
      }
      size={24}
      color={COLORS.textDim}
      marginTop={8}
    />
    <Text
      value={
        state.standings.length > 0
          ? `${state.standings.length} racing now: ${state.standings
              .slice(0, 3)
              .map((r) => `${r.name} ${formatDistance(r.distanceM)}`)
              .join('  |  ')}`
          : 'Nobody else is racing right now.'
      }
      size={22}
      color={COLORS.textDim}
      marginTop={8}
    />
    <Text
      value={'Change lanes with A / D or the buttons. Dodge, collect coins, and hold on for 10 km.'}
      size={22}
      color={COLORS.textDim}
      marginTop={20}
    />

    <Text value={netStatusLine()} size={22} color={netStatusColor()} marginTop={16} />

    <Button
      value={state.netStatus === 'connecting' ? 'connecting...' : 'RACE'}
      variant="primary"
      fontSize={34}
      disabled={state.netStatus === 'connecting'}
      onMouseDown={() => {
        if (state.netStatus !== 'connecting') startRace()
      }}
      uiTransform={{ width: '100%', height: 86, margin: { top: 16 } }}
    />
  </UiEntity>
)

function netStatusLine(): string {
  if (state.netStatus === 'online') return 'Server connected: coins and records are saved.'
  if (state.netStatus === 'connecting') return 'Looking for the race server...'
  return "No server: you can still race, but coins won't be credited and records won't be saved."
}

function netStatusColor() {
  if (state.netStatus === 'online') return COLORS.accent
  if (state.netStatus === 'connecting') return COLORS.textDim
  return COLORS.gold
}

const Garage = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
    {SKINS.map((skin) => {
      const owned = state.ownedSkins.includes(skin.id)
      const equipped = state.equippedSkin === skin.id
      const affordable = state.coins >= skin.price
      return (
        <UiEntity
          key={skin.id}
          uiTransform={{
            width: '100%',
            height: 92,
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 18, right: 18 },
            margin: { bottom: 10 }
          }}
          uiBackground={{ color: equipped ? COLORS.accentDim : COLORS.panelSoft }}
        >
          <Text value={skin.name} size={28} width="40%" />
          <Text
            value={owned ? 'in your garage' : `${skin.price} coins`}
            size={24}
            width="30%"
            color={owned ? COLORS.textDim : affordable ? COLORS.gold : COLORS.danger}
          />
          <UiEntity uiTransform={{ width: '30%', height: 56 }}>
            {equipped ? (
              <Text value="EQUIPPED" size={24} align="middle-center" color={COLORS.accent} />
            ) : owned ? (
              <Button
                value="Equip"
                variant="secondary"
                fontSize={22}
                onMouseDown={() => requestEquipSkin(skin.id)}
                uiTransform={{ width: '100%', height: 56 }}
              />
            ) : (
              <Button
                value="Buy"
                variant="primary"
                fontSize={22}
                disabled={!affordable}
                onMouseDown={() => requestBuySkin(skin.id)}
                uiTransform={{ width: '100%', height: 56 }}
              />
            )}
          </UiEntity>
        </UiEntity>
      )
    })}
    <Text
      value={
        isOnline()
          ? 'Balance and purchases are handled by the server: the UI only shows what it confirms.'
          : "The garage needs the server: without it there's no balance to spend."
      }
      size={20}
      color={isOnline() ? COLORS.textDim : COLORS.gold}
      marginTop={12}
    />
  </UiEntity>
)

const Ranking = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
    {state.leaderboard.length === 0 ? (
      <Text value="No times recorded on this track yet." size={24} color={COLORS.textDim} />
    ) : (
      state.leaderboard.map((entry, index) => (
        <UiEntity
          key={`lb-${index}`}
          uiTransform={{
            width: '100%',
            height: 54,
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 18, right: 18 },
            margin: { bottom: 6 }
          }}
          uiBackground={{ color: index === 0 ? COLORS.accentDim : COLORS.panelSoft }}
        >
          <Text value={`${index + 1}`} size={24} width="10%" color={COLORS.textDim} />
          <Text value={entry.name} size={24} width="60%" />
          <Text value={formatTime(entry.timeMs)} size={24} width="30%" align="middle-right" color={COLORS.gold} />
        </UiEntity>
      ))
    )}
  </UiEntity>
)
