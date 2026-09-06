import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { RACE, formatDistance, formatTime } from '../../shared/config'
import { state } from '../state'
import { backToMenu, startRace } from '../race'
import { COLORS, Text } from './theme'

/** Pantalla de fin de carrera. Espera el veredicto del servidor. */
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
          value={result.completed ? 'META' : 'MOTO DESTRUIDA'}
          size={52}
          color={result.completed ? COLORS.accent : COLORS.danger}
        />
        <Text
          value={result.completed ? `Tiempo ${formatTime(result.elapsedMs)}` : `Llegaste a ${formatDistance(state.distanceM)}`}
          size={30}
          marginTop={10}
        />
        <Text
          value={`Monedas de la carrera: ${state.runCoins}  -  choques: ${state.crashes}/${RACE.lives}`}
          size={24}
          color={COLORS.textDim}
          marginTop={8}
        />

        <UiEntity uiTransform={{ width: '100%', height: 120, flexDirection: 'column', margin: { top: 20 } }}>
          {result.pending ? (
            <Text value="Validando con el servidor..." size={26} color={COLORS.textDim} />
          ) : result.offline ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="Carrera en local, sin servidor" size={28} color={COLORS.gold} />
              <Text
                value="Las monedas no se acreditan y el tiempo no entra al ranking."
                size={22}
                color={COLORS.textDim}
                marginTop={6}
              />
            </UiEntity>
          ) : result.accepted ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value={`+${result.coinsAwarded} monedas acreditadas`} size={30} color={COLORS.gold} />
              <Text value={`Saldo: ${state.coins}`} size={24} color={COLORS.textDim} marginTop={6} />
              {result.newRecord ? (
                <Text value="Nuevo record de la pista - tu vuelta es el nuevo ghost" size={24} color={COLORS.ghost} marginTop={6} />
              ) : null}
            </UiEntity>
          ) : (
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
              <Text value="El servidor rechazo la carrera" size={28} color={COLORS.danger} />
              <Text value={result.reason} size={22} color={COLORS.textDim} marginTop={6} />
            </UiEntity>
          )}
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: 76, flexDirection: 'row', margin: { top: 20 } }}>
          <Button
            value="Correr de nuevo"
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
