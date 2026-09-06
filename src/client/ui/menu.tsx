import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { RACE, SKINS, formatDistance, formatTime } from '../../shared/config'
import { isOnline, state } from '../state'
import { startRace } from '../race'
import { requestBuySkin, requestEquipSkin } from '../net'
import { toggleMusic } from '../game/music'
import { COLORS, Text } from './theme'

/** Menu principal: jugar, garage y ranking. */
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
          value={state.musicOn ? 'Musica: on' : 'Musica: off'}
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
        value={`${formatDistance(RACE.distanceM)} - checkpoint cada ${RACE.checkpointIntervalM} m - ${RACE.lives} vidas`}
        size={22}
        color={COLORS.textDim}
      />

      <UiEntity uiTransform={{ width: '100%', height: 56, flexDirection: 'row', margin: { top: 18 } }}>
        <Tab id="home" label="Carrera" />
        <Tab id="garage" label="Garage" />
        <Tab id="ranking" label="Ranking" />
        <Text
          value={`${state.coins} monedas`}
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
          ? `Record de la pista: ${formatTime(state.recordTimeMs)} - ${state.recordHolder}`
          : 'Nadie completo la pista todavia. El primero en llegar deja el ghost.'
      }
      size={24}
      color={COLORS.ghost}
    />
    <Text
      value={
        state.bestTimeMs > 0
          ? `Tu mejor tiempo: ${formatTime(state.bestTimeMs)}${
              state.racesFinished > 0 ? ` en ${state.racesFinished} carreras` : ' (local)'
            }`
          : 'Todavia no completaste una carrera.'
      }
      size={24}
      color={COLORS.textDim}
      marginTop={8}
    />
    <Text
      value={
        state.standings.length > 0
          ? `${state.standings.length} corriendo ahora: ${state.standings
              .slice(0, 3)
              .map((r) => `${r.name} ${formatDistance(r.distanceM)}`)
              .join('  |  ')}`
          : 'No hay nadie mas en pista ahora mismo.'
      }
      size={22}
      color={COLORS.textDim}
      marginTop={8}
    />
    <Text
      value={'Cambia de carril con A / D o con los botones. Esquiva, junta monedas y aguanta 10 km.'}
      size={22}
      color={COLORS.textDim}
      marginTop={20}
    />

    <Text value={netStatusLine()} size={22} color={netStatusColor()} marginTop={16} />

    <Button
      value={state.netStatus === 'connecting' ? 'conectando...' : 'CORRER'}
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
  if (state.netStatus === 'online') return 'Servidor conectado: las monedas y los records se guardan.'
  if (state.netStatus === 'connecting') return 'Buscando el servidor de carreras...'
  return 'Sin servidor: se puede correr, pero no se acreditan monedas ni se guardan records.'
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
            value={owned ? 'en tu garage' : `${skin.price} monedas`}
            size={24}
            width="30%"
            color={owned ? COLORS.textDim : affordable ? COLORS.gold : COLORS.danger}
          />
          <UiEntity uiTransform={{ width: '30%', height: 56 }}>
            {equipped ? (
              <Text value="EQUIPADA" size={24} align="middle-center" color={COLORS.accent} />
            ) : owned ? (
              <Button
                value="Equipar"
                variant="secondary"
                fontSize={22}
                onMouseDown={() => requestEquipSkin(skin.id)}
                uiTransform={{ width: '100%', height: 56 }}
              />
            ) : (
              <Button
                value="Comprar"
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
          ? 'El saldo y las compras los resuelve el servidor: la UI solo muestra lo que confirma.'
          : 'El garage necesita el servidor: sin el no hay saldo que gastar.'
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
      <Text value="Todavia no hay tiempos registrados en esta pista." size={24} color={COLORS.textDim} />
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
