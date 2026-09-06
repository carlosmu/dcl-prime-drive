import ReactEcs, { PositionUnit, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

/** Paleta y piezas de UI reutilizadas por las tres pantallas. */
export const COLORS = {
  panel: Color4.create(0.04, 0.05, 0.09, 0.92),
  panelSoft: Color4.create(0.09, 0.11, 0.18, 0.85),
  accent: Color4.create(0.15, 0.75, 1, 1),
  accentDim: Color4.create(0.15, 0.75, 1, 0.35),
  gold: Color4.create(1, 0.82, 0.3, 1),
  danger: Color4.create(1, 0.35, 0.35, 1),
  ghost: Color4.create(0.65, 0.55, 1, 1),
  text: Color4.create(0.93, 0.95, 1, 1),
  textDim: Color4.create(0.6, 0.66, 0.78, 1),
  track: Color4.create(1, 1, 1, 0.12)
}

export const Panel = (props: {
  children?: ReactEcs.JSX.Element | (ReactEcs.JSX.Element | null)[] | null
  width: PositionUnit
  height?: PositionUnit
  padding?: number
}) => (
  <UiEntity
    uiTransform={{
      width: props.width,
      height: props.height ?? 'auto',
      flexDirection: 'column',
      padding: props.padding ?? 24
    }}
    uiBackground={{ color: COLORS.panel }}
  >
    {props.children}
  </UiEntity>
)

export const Text = (props: {
  value: string
  size?: number
  color?: Color4
  align?: 'top-left' | 'middle-left' | 'middle-center' | 'middle-right'
  width?: PositionUnit
  height?: PositionUnit
  marginTop?: number
}) => (
  <UiEntity
    uiTransform={{
      width: props.width ?? '100%',
      height: props.height ?? (props.size ?? 24) * 1.5,
      margin: { top: props.marginTop ?? 0 }
    }}
    uiText={{
      value: props.value,
      fontSize: props.size ?? 24,
      color: props.color ?? COLORS.text,
      textAlign: props.align ?? 'middle-left'
    }}
  />
)

/**
 * Barra de progreso horizontal.
 *
 * `markers` son los rivales y el ghost: se dibujan como muescas sobre la misma
 * barra, para comparar de un vistazo sin leer numeros.
 */
export const ProgressBar = (props: {
  progress: number
  height?: number
  color?: Color4
  markers?: { progress: number; color: Color4 }[]
}) => {
  const height = props.height ?? 18
  const clamped = Math.max(0, Math.min(1, props.progress))
  return (
    <UiEntity
      uiTransform={{ width: '100%', height, positionType: 'relative' }}
      uiBackground={{ color: COLORS.track }}
    >
      <UiEntity
        uiTransform={{
          width: `${clamped * 100}%`,
          height: '100%',
          positionType: 'absolute',
          position: { left: '0%', top: '0%' }
        }}
        uiBackground={{ color: props.color ?? COLORS.accent }}
      />
      {(props.markers ?? []).map((marker, index) => (
        <UiEntity
          key={`marker-${index}`}
          uiTransform={{
            width: 4,
            height: '100%',
            positionType: 'absolute',
            position: { left: `${Math.max(0, Math.min(1, marker.progress)) * 100}%`, top: '0%' }
          }}
          uiBackground={{ color: marker.color }}
        />
      ))}
    </UiEntity>
  )
}
