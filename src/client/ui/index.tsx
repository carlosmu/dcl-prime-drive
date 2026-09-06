import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { state } from '../state'
import { DebugPanel } from './debug'
import { Hud } from './hud'
import { Menu } from './menu'
import { Results } from './results'
import { COLORS } from './theme'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(Root, { virtualWidth: 1920, virtualHeight: 1080 })
}

/**
 * Raiz de la UI. React-ECS re-renderiza cada frame leyendo `state` directo, sin
 * hooks: el estado del juego ya vive en un objeto mutable.
 */
const Root = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
    {state.phase === 'racing' || state.phase === 'countdown' ? <Hud /> : null}
    {state.phase === 'menu' ? <Menu /> : null}
    {state.phase === 'finished' || state.phase === 'wrecked' ? <Results /> : null}
    {state.toast.length > 0 ? <Toast /> : null}
    {state.debugOn ? <DebugPanel /> : null}
  </UiEntity>
)

const Toast = () => (
  <UiEntity
    uiTransform={{
      width: 760,
      height: 56,
      positionType: 'absolute',
      position: { bottom: 220, left: '50%' },
      margin: { left: -380 }
    }}
    uiBackground={{ color: COLORS.panel }}
    uiText={{ value: state.toast, fontSize: 26, color: COLORS.text, textAlign: 'middle-center' }}
  />
)
