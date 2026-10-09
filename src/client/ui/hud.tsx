import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { RACE, formatTime } from '../../shared/config'
import { livesLeft, state } from '../state'
import { boostAmount, changeLane, pauseRace, setBoost, setBrake } from '../race'
import { PauseMenu } from './pause'
import { PRIME_FONT } from './bitmapFont'
import { atlasIcon } from './atlas'
import { COLORS, PANEL_RADIUS, ProgressBar, Text } from './theme'
import { KeyboardGuide, keyboardGuideHeight, keyboardGuideWidth } from './keyboardGuide'

/** Race HUD: time, coins, lives, and comparison with rivals. */
export const Hud = () => {
  const boost = boostAmount()
  const mobile = isMobile()
  const progress = state.distanceM / RACE.distanceM

  const markers = [] as { progress: number; color: Color4 }[]
  for (const ghost of state.ghosts) {
    markers.push({ progress: ghost.distanceM / RACE.distanceM, color: COLORS.ghost })
  }
  for (const rival of state.standings) {
    markers.push({ progress: rival.distanceM / RACE.distanceM, color: COLORS.gold })
  }

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {/* Top bar */}
      <UiEntity
        uiTransform={{
          width: '50%',
          height: 142 + BAR_EXTRA,
          positionType: 'absolute',
          position: { top: 0, left: '25%' },
          flexDirection: 'column',
          padding: { left: 24, right: 24, top: 12, bottom: 12 },
          // Flush with the top edge of the screen: only the bottom corners are rounded.
          borderRadius: { bottomLeft: PANEL_RADIUS, bottomRight: PANEL_RADIUS }
        }}
        uiBackground={{ color: COLORS.panel }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <HudStat icon={[0, 0]} label="TIME" value={formatTime(state.elapsedMs)} width={170} highlight />
          <HudStat
            icon={[2, 0]}
            label="KM/H"
            value={`${Math.round(state.speed * 3.6)}`}
            highlight={boost > 0.05}
          />
          <HudStat icon={[4, 0]} label="COINS" value={`${state.runCoins}`} highlight />
          <UiEntity
            uiTransform={{ width: 52, height: 52 }}
            uiBackground={atlasIcon(6, 0)}
            onMouseDown={() => pauseRace()}
          />
        </UiEntity>

        {/* Margins leave room for the profile pictures that stick out above and below the bar. */}
        <UiEntity
          uiTransform={{
            width: '100%',
            height: BAR_HEIGHT,
            margin: { top: 6 + AVATAR_OVERHANG, bottom: AVATAR_OVERHANG }
          }}
        >
          <ProgressBar progress={progress} markers={markers} height={BAR_HEIGHT} radius={BAR_HEIGHT / 2} />
          <RacerAvatars progress={progress} />
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: 34, flexDirection: 'row', margin: { top: 6 } }}>
          <UiEntity uiTransform={{ width: '30%', height: '100%', flexDirection: 'row', alignItems: 'center' }}>
            <Text value="Lives" size={22} width={64} color={livesLeft() > 1 ? COLORS.text : COLORS.danger} />
            <UiEntity uiTransform={{ width: 8 }} />
            {/* One heart (atlas A3:B4) per life left. Lost ones aren't drawn dimmed: mobile ignores the tint. */}
            {Array.from({ length: livesLeft() }, (_, index) => (
              <UiEntity
                key={`life-${index}`}
                uiTransform={{ width: LIFE_ICON, height: LIFE_ICON, margin: { left: 4 } }}
                uiBackground={atlasIcon(0, 2)}
              />
            ))}
          </UiEntity>
          <Text value={ghostLine()} size={22} width="40%" align="middle-center" color={COLORS.ghost} />
          <Text
            value={state.standings.length > 0 ? `${state.standings.length} racing` : 'solo run'}
            size={22}
            width="30%"
            align="middle-right"
            color={COLORS.textDim}
          />
        </UiEntity>
      </UiEntity>

      {state.invalidated ? (
        <UiEntity
          uiTransform={{
            width: 720,
            height: 52,
            positionType: 'absolute',
            position: { top: 172 + BAR_EXTRA, left: '50%' },
            margin: { left: -360 }
          }}
          uiBackground={{ color: Color4.create(0.4, 0.05, 0.05, 0.9) }}
          uiText={{
            value: `Race invalidated by server: ${state.invalidReason}`,
            fontSize: 22,
            color: COLORS.text,
            textAlign: 'middle-center'
          }}
        />
      ) : null}

      {/* 3, 2, 1 while the countdown runs, then GO! over the first moment of the race. */}
      {state.phase === 'countdown' || state.elapsedMs < GO_FLASH_MS ? (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 200,
            positionType: 'absolute',
            position: { top: '38%', left: '0%' },
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: COUNTDOWN_CIRCLE,
              height: COUNTDOWN_CIRCLE,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: COUNTDOWN_CIRCLE / 2
            }}
            uiBackground={{ color: COUNTDOWN_FILL }}
          >
            {/* `highlight` uses the pre-tinted yellow font, so it stays yellow on mobile too.
                GO! is drawn smaller: at the digits' size it's wider than the disc. */}
            {state.phase === 'countdown' ? (
              <Text value={`${Math.ceil(state.countdown)}`} size={80} height={100} align="middle-center" highlight />
            ) : (
              <Text value="GO!" size={60} height={80} align="middle-center" highlight />
            )}
          </UiEntity>
        </UiEntity>
      ) : null}

      {/* Touch controls, mobile only: on desktop the keyboard does it all. */}
      {mobile ? <LaneControls /> : null}
      {mobile ? <PedalButtons boosting={boost > 0.05} /> : <KeyHints />}

      {state.paused ? <PauseMenu /> : null}
    </UiEntity>
  )
}

const LaneControls = () => (
  <UiEntity
    uiTransform={{
      width: 360,
      height: 150,
      positionType: 'absolute',
      position: { bottom: CONTROLS_BOTTOM, left: 60 },
      flexDirection: 'row',
      justifyContent: 'space-between'
    }}
  >
    <LaneButton label="<" direction={-1} />
    <LaneButton label=">" direction={1} />
  </UiEntity>
)

/**
 * Brake and boost, both held down. onMouseLeave releases them if the finger
 * slides off. Brake sits on the inside, boost under the right thumb.
 */
const PedalButtons = (props: { boosting: boolean }) => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { bottom: CONTROLS_BOTTOM, right: 60 },
      flexDirection: 'row'
    }}
  >
    <TouchButton
      label="BRAKE"
      size={30}
      width={150}
      height={150}
      active={state.braking}
      onDown={() => setBrake(true)}
      onUp={() => setBrake(false)}
    />
    <UiEntity uiTransform={{ width: 30 }} />
    <TouchButton
      label="BOOST"
      size={30}
      width={150}
      height={150}
      active={props.boosting}
      onDown={() => setBoost(true)}
      onUp={() => setBoost(false)}
    />
  </UiEntity>
)

/** Size of each heart in the lives row. */
const LIFE_ICON = 24

/** Progress bar thickness. */
const BAR_HEIGHT = 13.5
/** Profile pictures sitting on the progress bar. */
const AVATAR_SIZE = 32
/** Shown instead of a profile picture when there isn't one (guests, offline). */
const FALLBACK_AVATAR = 'assets/images/fallback_profile_pic.png'
/**
 * Panel-colored square with a transparent circle, laid over each picture.
 * Desktop doesn't clip textures to `borderRadius` (mobile does), so this
 * crops them to a circle on every platform.
 */
const AVATAR_MASK = 'assets/images/avatar_mask.png'
/** How far a picture sticks out above (and below) the bar it's centered on. */
const AVATAR_OVERHANG = (AVATAR_SIZE - BAR_HEIGHT) / 2
/** What the thicker bar and its pictures add to the top bar, over the original 5 px bar. */
const BAR_EXTRA = BAR_HEIGHT - 5 + 2 * AVATAR_OVERHANG

/**
 * The player's and every ghost's profile pictures, on top of the progress bar
 * at each one's spot. Drawn from the furthest back to the furthest ahead: later
 * siblings paint on top, so the leader is always the one fully visible. On a
 * tie (the start line) the player goes on top.
 */
const RacerAvatars = (props: { progress: number }) => {
  // An empty userId falls back to the generic picture.
  const playerId = state.myIsGuest ? '' : state.myAddress
  const racers = [
    { key: 'player', userId: playerId, progress: props.progress, color: COLORS.accent, isPlayer: true }
  ]
  state.ghosts.forEach((ghost, index) => {
    racers.push({
      key: `ghost-${index}`,
      userId: ghost.hasProfile ? ghost.address : '',
      progress: ghost.distanceM / RACE.distanceM,
      color: COLORS.ghost,
      isPlayer: false
    })
  })
  racers.sort((a, b) => a.progress - b.progress || Number(a.isPlayer) - Number(b.isPlayer))

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}>
      {racers.map((racer) => (
        <UiEntity
          key={racer.key}
          uiTransform={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            positionType: 'absolute',
            // Centered on its spot along the bar, in both axes.
            position: { left: `${Math.max(0, Math.min(1, racer.progress)) * 100}%`, top: -AVATAR_OVERHANG },
            margin: { left: -AVATAR_SIZE / 2 },
            borderRadius: AVATAR_SIZE / 2
          }}
          uiBackground={
            racer.userId
              ? { textureMode: 'stretch', avatarTexture: { userId: racer.userId } }
              : { textureMode: 'stretch', texture: { src: FALLBACK_AVATAR } }
          }
        >
          <UiEntity
            uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}
            uiBackground={{ textureMode: 'stretch', texture: { src: AVATAR_MASK } }}
          />
          {/* The ring goes over the mask, so the mask's antialiased edge never shows. */}
          <UiEntity
            uiTransform={{
              width: '100%',
              height: '100%',
              positionType: 'absolute',
              position: { top: 0, left: 0 },
              borderRadius: AVATAR_SIZE / 2,
              borderWidth: 2,
              borderColor: racer.color
            }}
          />
        </UiEntity>
      ))}
    </UiEntity>
  )
}

/** Bottom offset of the touch controls: 60 px + 5vh (54 px of the 1080 virtual height). */
const CONTROLS_BOTTOM = 60 + 54

/** Diameter of the dark disc behind the 3, 2, 1. */
const COUNTDOWN_CIRCLE = 140
const COUNTDOWN_FILL = Color4.create(0, 0, 0, 0.3)

/** How long GO! stays on screen once the race starts. */
const GO_FLASH_MS = 800

/** `width` must fit the widest value: a text that overflows makes the row jump. */
const HudStat = (props: {
  icon: [number, number]
  label: string
  value: string
  color?: Color4
  width?: number
  highlight?: boolean
}) => (
  <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center' }}>
    <UiEntity uiTransform={{ width: 52, height: 52, margin: { right: 8 } }} uiBackground={atlasIcon(...props.icon)} />
    <UiEntity
      uiTransform={{ width: props.width ?? 110, height: '100%', flexDirection: 'column', justifyContent: 'center' }}
    >
      <Text value={props.label} size={16} height={20} color={COLORS.textDim} />
      <Text value={props.value} size={28} height={32} color={props.color ?? COLORS.text} highlight={props.highlight} />
    </UiEntity>
  </UiEntity>
)

/** 80% of the menu tutorial's size. */
const HINT_SCALE = 0.8
const HINT_TITLE_HEIGHT = 28
/** Extra space under the title: the text box already leaves ~5 px, this doubles it. */
const HINT_TITLE_GAP = 5

/** Keyboard guide, desktop only: right edge, vertically centered. */
const KeyHints = () => {
  const height = HINT_TITLE_HEIGHT + HINT_TITLE_GAP + keyboardGuideHeight(HINT_SCALE)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '50%', right: 40 },
        margin: { top: -height / 2 },
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <Text
        value="How to play:"
        size={18}
        width={keyboardGuideWidth(HINT_SCALE)}
        height={HINT_TITLE_HEIGHT}
        align="middle-center"
        color={COLORS.textDim}
      />
      <UiEntity uiTransform={{ height: HINT_TITLE_GAP }} />
      <KeyboardGuide scale={HINT_SCALE} />
    </UiEntity>
  )
}

/** Gap with the fastest ghost: the track record, unless it's the player's own. */
function ghostLine(): string {
  const record = state.ghosts[0]
  if (!record) return 'no ghost yet'
  const gap = state.distanceM - record.distanceM
  const sign = gap >= 0 ? '+' : '-'
  return `${record.name || 'record'}  ${sign}${Math.abs(Math.round(gap))} m`
}

const LaneButton = (props: { label: string; direction: number }) => (
  <TouchButton label={props.label} size={56} width={150} height={150} onDown={() => changeLane(props.direction)} />
)

/** Fill of the touch controls: 40% so the track shows through. */
const TOUCH_FILL = Color4.create(0, 0, 0, 0.4)
const TOUCH_FILL_ACTIVE = Color4.create(0.15, 0.75, 1, 0.4)

/** Rounded, white-bordered, see-through button for the on-screen controls. */
const TouchButton = (props: {
  label: string
  size: number
  width: number
  height: number
  active?: boolean
  onDown: () => void
  onUp?: () => void
}) => (
  <UiEntity
    uiTransform={{
      width: props.width,
      height: props.height,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 24,
      borderWidth: 4,
      borderColor: Color4.White()
    }}
    uiBackground={{ color: props.active ? TOUCH_FILL_ACTIVE : TOUCH_FILL }}
    onMouseDown={props.onDown}
    onMouseUp={props.onUp}
    onMouseLeave={props.onUp}
  >
    {hasAllGlyphs(props.label) ? (
      <Text value={props.label} size={props.size} width="100%" align="middle-center" highlight={props.active} />
    ) : (
      // The bitmap font has no `<` / `>`: the lane arrows fall back to the system font.
      <UiEntity
        uiTransform={{ width: '100%', height: '100%' }}
        uiText={{ value: props.label, fontSize: props.size, color: COLORS.text, textAlign: 'middle-center' }}
      />
    )}
  </UiEntity>
)

function hasAllGlyphs(text: string): boolean {
  return Array.from(text).every((char) => PRIME_FONT.glyphs.has(char.codePointAt(0) ?? 0))
}
