import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { CHECKPOINT_COUNT, TRACK_ID } from '../../shared/config'
import { state } from '../state'
import { COLORS } from './theme'

/**
 * Authoritative server diagnostics panel.
 *
 * The value that matters is `server tick`: the server emits it once per
 * second and it travels as a synced component. If it advances, the server is
 * alive and the CRDT channel is arriving. If it's at `--`, there's no server.
 * If it's frozen on a number, the server started and then went down.
 *
 * Can be turned off from the menu.
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
    <Row label="last message" value={lastMessageValue()} />
    <Row
      label="net"
      value={`${state.netStatus} - stateSynced=${state.stateSynced} - msgs=${state.messagesReceived}`}
      color={state.netStatus === 'online' ? COLORS.accent : COLORS.gold}
    />
    <Row label="wallet" value={state.myAddress || '(no identity)'} />
    <Row
      label="players"
      value={`server=${state.serverTick >= 0 ? state.serverConnectedPlayers : '--'} - rivals=${state.standings.length}`}
    />
    <Row
      label="race"
      value={`${state.phase} - ${Math.floor(state.distanceM)}m - cp ${state.lastCheckpointSent}/${CHECKPOINT_COUNT}${
        state.invalidated ? ' - INVALID' : ''
      }`}
      color={state.invalidated ? COLORS.danger : COLORS.text}
    />
    <Row label="track" value={`${TRACK_ID} - clock ${state.clock.toFixed(1)}s`} />
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
  if (state.serverTick < 0) return '-- (server heartbeat never arrived)'
  const age = state.clock - state.serverTickAtClock
  return `${state.serverTick}  (${age.toFixed(1)}s ago)`
}

/**
 * A heartbeat arrives every second. After 3 s without one, the server has
 * either gone down or the channel has been cut.
 */
function tickColor(): Color4 {
  if (state.serverTick < 0) return COLORS.danger
  return state.clock - state.serverTickAtClock > 3 ? COLORS.gold : COLORS.accent
}

function lastMessageValue(): string {
  if (state.lastMessageAtClock < 0) return '-- (no message received)'
  return `${(state.clock - state.lastMessageAtClock).toFixed(1)}s ago`
}
