import ReactEcs, { Button, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { abortRace, resumeRace } from '../race'
import { state } from '../state'
import { toggleMusic } from '../game/music'
import { COLORS, Text } from './theme'

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
      uiTransform={{ width: 520, height: 432, flexDirection: 'column', alignItems: 'center', padding: 32 }}
      uiBackground={{ color: COLORS.panel }}
    >
      <Text value="PAUSED" size={52} align="middle-center" highlight />
      <Button
        value="Resume"
        variant="primary"
        fontSize={28}
        onMouseDown={() => resumeRace()}
        uiTransform={{ width: '100%', height: 76, margin: { top: 24 } }}
      />
      <Button
        value={state.musicOn ? 'Music: on' : 'Music: off'}
        variant="secondary"
        fontSize={28}
        onMouseDown={() => toggleMusic()}
        uiTransform={{ width: '100%', height: 76, margin: { top: 16 } }}
      />
      <Button
        value="Quit"
        variant="secondary"
        fontSize={28}
        onMouseDown={() => abortRace()}
        uiTransform={{ width: '100%', height: 76, margin: { top: 16 } }}
      />
    </UiEntity>
  </UiEntity>
)
