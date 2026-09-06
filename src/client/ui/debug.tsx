import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { CHECKPOINT_COUNT, TRACK_ID } from '../../shared/config'
import { state } from '../state'
import { COLORS } from './theme'

/**
 * Panel de diagnostico del servidor autoritativo.
 *
 * El dato que importa es `server tick`: lo emite el servidor una vez por
 * segundo y viaja como componente sincronizado. Si avanza, el servidor esta
 * vivo y el canal CRDT llega. Si esta en `--`, no hay servidor. Si esta
 * congelado en un numero, el servidor arranco y despues se corto.
 *
 * Se apaga desde el menu.
 */

const ROW_HEIGHT = 22
const FONT = 17

export const DebugPanel = () => (
  <UiEntity
    uiTransform={{
      width: 640,
      height: 8 * ROW_HEIGHT + 20,
      positionType: 'absolute',
      position: { bottom: 20, left: '50%' },
      margin: { left: -320 },
      flexDirection: 'column',
      padding: { left: 14, right: 14, top: 10, bottom: 10 }
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.72) }}
  >
    <Row label="server tick" value={tickValue()} color={tickColor()} />
    <Row label="server uptime" value={state.serverTick >= 0 ? `${state.serverUptimeSeconds}s` : '--'} />
    <Row label="ultimo mensaje" value={lastMessageValue()} />
    <Row
      label="net"
      value={`${state.netStatus} - stateSynced=${state.stateSynced} - msgs=${state.messagesReceived}`}
      color={state.netStatus === 'online' ? COLORS.accent : COLORS.gold}
    />
    <Row label="wallet" value={state.myAddress || '(sin identidad)'} />
    <Row
      label="jugadores"
      value={`servidor=${state.serverTick >= 0 ? state.serverConnectedPlayers : '--'} - rivales=${state.standings.length}`}
    />
    <Row
      label="carrera"
      value={`${state.phase} - ${Math.floor(state.distanceM)}m - cp ${state.lastCheckpointSent}/${CHECKPOINT_COUNT}${
        state.invalidated ? ' - INVALIDADA' : ''
      }`}
      color={state.invalidated ? COLORS.danger : COLORS.text}
    />
    <Row label="pista" value={`${TRACK_ID} - clock ${state.clock.toFixed(1)}s`} />
  </UiEntity>
)

const Row = (props: { label: string; value: string; color?: Color4 }) => (
  <UiEntity uiTransform={{ width: '100%', height: ROW_HEIGHT, flexDirection: 'row' }}>
    <UiEntity
      uiTransform={{ width: '30%', height: '100%' }}
      uiText={{
        value: props.label,
        fontSize: FONT,
        font: 'monospace',
        color: COLORS.textDim,
        textAlign: 'middle-left'
      }}
    />
    <UiEntity
      uiTransform={{ width: '70%', height: '100%' }}
      uiText={{
        value: props.value,
        fontSize: FONT,
        font: 'monospace',
        color: props.color ?? COLORS.text,
        textAlign: 'middle-left'
      }}
    />
  </UiEntity>
)

function tickValue(): string {
  if (state.serverTick < 0) return '-- (nunca llego un latido del servidor)'
  const age = state.clock - state.serverTickAtClock
  return `${state.serverTick}  (hace ${age.toFixed(1)}s)`
}

/**
 * Un latido llega cada segundo. Pasados 3 s sin novedades, el servidor se
 * cayo o el canal se corto.
 */
function tickColor(): Color4 {
  if (state.serverTick < 0) return COLORS.danger
  return state.clock - state.serverTickAtClock > 3 ? COLORS.gold : COLORS.accent
}

function lastMessageValue(): string {
  if (state.lastMessageAtClock < 0) return '-- (ningun mensaje recibido)'
  return `hace ${(state.clock - state.lastMessageAtClock).toFixed(1)}s`
}
