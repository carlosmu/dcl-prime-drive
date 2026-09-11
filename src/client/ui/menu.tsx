import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { RACE, SKINS, formatDistance, formatTime } from '../../shared/config'
import { isOnline, state } from '../state'
import { startRace } from '../race'
import { requestBuySkin, requestEquipSkin } from '../net'
import { toggleMusic } from '../game/music'
import { Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { COLORS, MenuButton, PANEL_RADIUS, PRIMARY_COLOR, TEXT_SIZE, Text } from './theme'
import { BitmapText, PRIME_FONT_IMAGE_YELLOW } from './bitmapFont'
import { LEVEL_ART_RATIO, atlasIcon, levelThumb } from './atlas'

const PANEL_PADDING = 32
/**
 * Panel size. On mobile it fills the height and takes 40% of the width; on
 * desktop it's a fixed 940-wide card.
 */
const PANEL_WIDTH = isMobile() ? '50%' : 940
const PANEL_HEIGHT = isMobile() ? '100%' : '80vh'
/**
 * What a line of content can use, in px: the UI is laid out against the same
 * 1920x1080 virtual screen the HUD assumes, so 40% of the width is 768.
 */
const CONTENT_WIDTH = (isMobile() ? 768 : 940) - 2 * PANEL_PADDING

/** Logo art, A7:H8 of the atlas: 8 cells wide by 2 tall, so always 4:1. */
const LOGO_WIDTH = isMobile() ? 360 : 444
const LOGO_HEIGHT = LOGO_WIDTH / 4

/**
 * Tracks offered by the Race tab's selector, in the order of level_selector.png.
 * Everything but the first one is art only: `playable` gates the RACE button.
 */
const LEVELS = [
  { name: 'NEON CITY', playable: true },
  { name: 'RED DESERT', playable: false }
]

/** Prev/next sit at the panel's edges; the art takes every pixel between them. */
const LEVEL_NAV_WIDTH = 110
const LEVEL_ART_WIDTH = CONTENT_WIDTH - 2 * LEVEL_NAV_WIDTH - 32
/** Art is 2:1 (4x2 cells of the 8x8 sheet): the height follows the width. */
const LEVEL_ART_HEIGHT = LEVEL_ART_WIDTH / LEVEL_ART_RATIO

const isLevelPlayable = () => LEVELS[state.selectedLevel]?.playable === true

const TRANSPARENT = Color4.create(0, 0, 0, 0)
const RACE_BUTTON_COLOR = PRIMARY_COLOR

/** Main menu: race, garage, ranking, and tutorial. */
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
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        flexDirection: 'column',
        padding: PANEL_PADDING,
        borderRadius: PANEL_RADIUS
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: LOGO_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end'
        }}
      >
        {/* Absolute so the music button on the right doesn't push it off the panel's center. */}
        <UiEntity
          uiTransform={{
            width: LOGO_WIDTH,
            height: LOGO_HEIGHT,
            positionType: 'absolute',
            position: { left: (CONTENT_WIDTH - LOGO_WIDTH) / 2 }
          }}
          uiBackground={atlasIcon(0, 6, 8, 2)}
          onMouseDown={() => tapLogo()}
        />
        <MenuButton
          label={state.musicOn ? 'MUSIC: ON' : 'MUSIC: OFF'}
          icon={state.musicOn ? [4, 2] : [6, 2]}
          width={64}
          height={48}
          onDown={() => toggleMusic()}
        />
      </UiEntity>

      <UiEntity uiTransform={{ width: '100%', height: 56, flexDirection: 'row', margin: { top: 18 } }}>
        <Tab id="home" label="Race" />
        <Tab id="garage" label="Garage" />
        <Tab id="ranking" label="Ranking" />
        <Tab id="tutorial" label="Tutorial" />
      </UiEntity>
      <UiEntity uiTransform={{ width: '100%', height: 2 }} uiBackground={{ color: COLORS.text }} />

      {/* Takes whatever height is left; anything taller is clipped instead of spilling out. */}
      <UiEntity
        uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column', margin: { top: 32 }, overflow: 'hidden' }}
      >
        {state.screen === 'home' ? <Home /> : null}
        {state.screen === 'garage' ? <Garage /> : null}
        {state.screen === 'ranking' ? <Ranking /> : null}
        {state.screen === 'tutorial' ? <Tutorial /> : null}
      </UiEntity>

      {/* On every tab, always in the same place: the one action the menu exists for. */}
      <RaceButton />
    </UiEntity>
  </UiEntity>
)

/** Taps on the logo needed to open the debug panel. */
const DEBUG_TAPS = 10
/** A longer gap between taps restarts the count. */
const DEBUG_TAP_WINDOW = 2
let logoTaps = 0
let lastLogoTapAt = -Infinity

function tapLogo() {
  logoTaps = state.clock - lastLogoTapAt > DEBUG_TAP_WINDOW ? 1 : logoTaps + 1
  lastLogoTapAt = state.clock
  if (logoTaps < DEBUG_TAPS) return
  logoTaps = 0
  state.debugOn = true
}

/** Folder tab: the active one gets a white border with rounded top corners. */
const Tab = (props: { id: typeof state.screen; label: string }) => {
  const active = state.screen === props.id
  return (
    // Sized to its label (plus padding), not a fixed width.
    <UiEntity
      uiTransform={{
        height: '100%',
        flexDirection: 'column',
        margin: { right: 8 },
        // Inactive tabs keep the same (transparent) border so nothing shifts on switch.
        borderWidth: { top: 2, left: 2, right: 2, bottom: 0 },
        borderColor: active ? COLORS.text : TRANSPARENT,
        borderRadius: { topLeft: 12, topRight: 12 }
      }}
      onMouseDown={() => {
        state.screen = props.id
      }}
    >
      <UiEntity uiTransform={{ height: 52, alignItems: 'center', padding: { left: 16, right: 16 } }}>
        <BitmapText
          text={props.label.toUpperCase()}
          fontSize={TEXT_SIZE.md}
          color={active ? COLORS.text : COLORS.textDim}
        />
      </UiEntity>
    </UiEntity>
  )
}

/** Atlas icon + label in the bitmap font. */
const RaceButton = () => {
  const connecting = state.netStatus === 'connecting'
  // A level that isn't built yet dims the button, so the art alone doesn't promise a race.
  const locked = !isLevelPlayable()
  const disabled = connecting || locked
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 86,
        margin: { top: 16 },
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16
      }}
      uiBackground={{ color: disabled ? COLORS.panelSoft : RACE_BUTTON_COLOR }}
      onMouseDown={() => {
        if (!disabled) startRace()
      }}
    >
      <UiEntity
        uiTransform={{ width: 56, height: 56, margin: { right: 16 } }}
        uiBackground={atlasIcon(2, disabled ? 0 : 2)}
      />
      <BitmapText
        text={connecting ? 'CONNECTING...' : locked ? 'COMING SOON' : 'RACE'}
        fontSize={40}
        color={disabled ? COLORS.textDim : Color4.White()}
      />
    </UiEntity>
  )
}

/** How to play, plus the race's numbers. */
const Tutorial = () => (
  <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
    {/* Touch controls on mobile, keyboard on desktop. The font has no em dash or arrows. */}
    <ControlLine keys={isMobile() ? ['ARROWS'] : ['A', 'D']} action="Change lanes" first />
    {/* The mobile key IS the word Boost, so name what it does instead. */}
    <ControlLine keys={isMobile() ? ['BOOST'] : ['SPACE']} action="Speed up" />

    <TutorialGap />
    <TutorialLine value="Dodge obstacles & collect coins." />
    <TutorialLine value="Reach the finish line!" />

    <TutorialGap />
    <Text value={`${RACE.lives} Lives per race`} size={TEXT_SIZE.md} color={COLORS.text} marginTop={12} />
    <TutorialLine value="Coins only count if you finish." />
  </UiEntity>
)

/** "[A] [D] - Change lanes": each key drawn as a keycap, the action in white. */
const ControlLine = (props: { keys: string[]; action: string; first?: boolean }) => (
  <UiEntity
    uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', margin: { top: props.first ? 0 : 12 } }}
  >
    {props.keys.map((key) => (
      <KeyCap key={key} label={key} />
    ))}
    <BitmapText
      text={props.action}
      fontSize={TEXT_SIZE.md}
      color={COLORS.text}
      lineHeight={1.5}
      uiTransform={{ margin: { left: 8 } }}
    />
  </UiEntity>
)

/** A key (or on-screen button) name inside a rounded white outline. */
const KeyCap = (props: { key?: string; label: string }) => (
  <UiEntity
    uiTransform={{
      height: 44,
      alignItems: 'center',
      padding: { left: 14, right: 14 },
      margin: { right: 8 },
      borderWidth: 2,
      borderColor: COLORS.text,
      borderRadius: 8
    }}
  >
    <BitmapText text={props.label} fontSize={TEXT_SIZE.md} image={PRIME_FONT_IMAGE_YELLOW} />
  </UiEntity>
)

/** Space between the tutorial's blocks. */
const TutorialGap = () => <UiEntity uiTransform={{ width: '100%', height: 20 }} />

const TutorialLine = (props: { value: string }) => (
  <Text
    value={props.value}
    size={TEXT_SIZE.md}
    color={COLORS.text}
    marginTop={12}
    maxWidth={CONTENT_WIDTH}
    lineHeight={1.5}
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
      size={TEXT_SIZE.md}
      highlight={state.recordTimeMs > 0}
      color={COLORS.ghost}
      maxWidth={CONTENT_WIDTH}
      lineHeight={1.5}
    />
    <Text
      value={
        state.bestTimeMs > 0
          ? `Your best time: ${formatTime(state.bestTimeMs)}${
              state.racesFinished > 0 ? ` in ${state.racesFinished} races` : ' (local)'
            }`
          : "You haven't completed a race yet."
      }
      size={TEXT_SIZE.md}
      color={COLORS.text}
      marginTop={12}
      maxWidth={CONTENT_WIDTH}
    />
    {state.standings.length > 0 ? (
      <Text
        value={`${state.standings.length} racing now: ${state.standings
          .slice(0, 3)
          .map((r) => `${r.name} ${formatDistance(r.distanceM)}`)
          .join('  |  ')}`}
        size={TEXT_SIZE.sm}
        color={COLORS.textDim}
        marginTop={8}
        maxWidth={CONTENT_WIDTH}
      />
    ) : null}

    <LevelSelector />

    {/* Pushes the server status down, right above the RACE button. */}
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1 }} />
    {/* Only worth saying when something is wrong: connected is the expected case. */}
    {state.netStatus === 'online' ? null : (
      <Text value={netStatusLine()} size={TEXT_SIZE.sm} color={netStatusColor()} maxWidth={CONTENT_WIDTH} />
    )}
  </UiEntity>
)

/** Thumbnail of the selected level, with prev/next on each side. */
const LevelSelector = () => (
  <UiEntity
    uiTransform={{
      width: '100%',
      height: LEVEL_ART_HEIGHT + 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: { top: 16 }
    }}
  >
    <MenuButton label="PREV" fontSize={TEXT_SIZE.md} width={LEVEL_NAV_WIDTH} height={64} onDown={() => cycleLevel(-1)} />
    <UiEntity
      uiTransform={{
        width: LEVEL_ART_WIDTH,
        height: LEVEL_ART_HEIGHT,
        flexDirection: 'column',
        justifyContent: 'flex-start'
      }}
      uiBackground={levelThumb(state.selectedLevel)}
    >
      {/* Name over the art's top edge: white, so neither level reads as the highlighted one. */}
      <Text
        value={LEVELS[state.selectedLevel].name}
        size={TEXT_SIZE.lg}
        align="middle-center"
        marginTop={0}
        height={TEXT_SIZE.lg * 1.6}
      />
    </UiEntity>
    <MenuButton label="NEXT" fontSize={TEXT_SIZE.md} width={LEVEL_NAV_WIDTH} height={64} onDown={() => cycleLevel(1)} />
  </UiEntity>
)

/** Wraps around, so two levels feel like a carousel rather than a dead end. */
function cycleLevel(step: number) {
  state.selectedLevel = (state.selectedLevel + step + LEVELS.length) % LEVELS.length
}

function netStatusLine(): string {
  if (state.netStatus === 'connecting') return 'Looking for the race server...'
  return 'Server disconnected: you can race, but no progress will be saved - no coins, no records.'
}

function netStatusColor() {
  if (state.netStatus === 'connecting') return COLORS.textDim
  return COLORS.danger
}

const Garage = () => (
  // Scrolls: the skin list is longer than the panel from Nomad down to Obsidian.
  <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', overflow: 'scroll' }}>
    <Text value={`${state.coins} coins`} size={TEXT_SIZE.lg} highlight />
    <UiEntity uiTransform={{ width: '100%', height: 10 }} />
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
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 18, right: 18 },
            margin: { bottom: 10 },
            borderRadius: 12
          }}
          uiBackground={{ color: equipped ? COLORS.accentDim : COLORS.panelSoft }}
        >
          <Text value={skin.name} size={TEXT_SIZE.md} width="40%" />
          <Text
            value={owned ? 'in your garage' : `${skin.price} coins`}
            size={TEXT_SIZE.sm}
            width="30%"
            color={owned ? COLORS.textDim : affordable ? COLORS.gold : COLORS.danger}
          />
          <UiEntity uiTransform={{ width: '30%', height: 56, justifyContent: 'center', alignItems: 'center' }}>
            {equipped ? (
              <Text value="EQUIPPED" size={TEXT_SIZE.sm} align="middle-center" color={COLORS.accent} />
            ) : owned ? (
              <MenuButton label="EQUIP" width="100%" height={56} onDown={() => requestEquipSkin(skin.id)} />
            ) : (
              <MenuButton
                label="BUY"
                width="100%"
                height={56}
                primary
                disabled={!affordable}
                onDown={() => requestBuySkin(skin.id)}
              />
            )}
          </UiEntity>
        </UiEntity>
      )
    })}
    {/* Only the offline warning is worth screen space: online, the server's role is invisible to the player. */}
    {isOnline() ? null : (
      <Text
        value="The garage needs the server: without it there's no balance to spend."
        size={TEXT_SIZE.sm}
        color={COLORS.gold}
        marginTop={12}
        maxWidth={CONTENT_WIDTH}
      />
    )}
  </UiEntity>
)

const Ranking = () => (
  // Scrolls: the board holds more entries than fit on screen.
  <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', overflow: 'scroll' }}>
    {state.leaderboard.length === 0 ? (
      <Text
        value="No times recorded on this track yet."
        size={TEXT_SIZE.md}
        color={COLORS.textDim}
        maxWidth={CONTENT_WIDTH}
      />
    ) : (
      state.leaderboard.map((entry, index) => (
        <UiEntity
          key={`lb-${index}`}
          uiTransform={{
            width: '100%',
            height: 54,
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 18, right: 18 },
            margin: { bottom: 6 },
            borderRadius: 12
          }}
          uiBackground={{ color: index === 0 ? COLORS.accentDim : COLORS.panelSoft }}
        >
          <Text value={`${index + 1}`} size={TEXT_SIZE.sm} width="10%" color={COLORS.textDim} />
          <Text value={entry.name} size={TEXT_SIZE.md} width="60%" />
          <Text value={formatTime(entry.timeMs)} size={TEXT_SIZE.md} width="30%" align="middle-right" highlight />
        </UiEntity>
      ))
    )}
  </UiEntity>
)
