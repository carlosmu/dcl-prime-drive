import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { abortRace, resumeRace } from '../race'
import { state } from '../state'
import { toggleMusic } from '../game/music'
import { COLORS, MenuButton, PANEL_RADIUS, TEXT_SIZE, Text } from './theme'

/** Pause overlay: dims the race and blocks the HUD controls underneath. */
export const PauseMenu = () => (
  <UiEntity
    uiTransform={{
      width: '100%',
      height: '100%',
      positionType: 'absolute',
      justifyContent: 'center',
      alignItems: 'center'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
  >
    <UiEntity
      uiTransform={{
        width: 520,
        height: 432,
        flexDirection: 'column',
        alignItems: 'center',
        padding: 32,
        borderRadius: PANEL_RADIUS
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <Text value="PAUSED" size={52} align="middle-center" highlight />
      <MenuButton
        label="RESUME"
        primary
        fontSize={TEXT_SIZE.md}
        width="100%"
        height={76}
        margin={{ top: 24 }}
        onDown={() => resumeRace()}
      />
      <MenuButton
        label={state.musicOn ? 'MUSIC: ON' : 'MUSIC: OFF'}
        icon={state.musicOn ? [4, 2] : [6, 2]}
        fontSize={TEXT_SIZE.md}
        width="100%"
        height={76}
        margin={{ top: 16 }}
        onDown={() => toggleMusic()}
      />
      <MenuButton
        label="QUIT"
        fontSize={TEXT_SIZE.md}
        width="100%"
        height={76}
        margin={{ top: 16 }}
        onDown={() => abortRace()}
      />
    </UiEntity>
  </UiEntity>
)
