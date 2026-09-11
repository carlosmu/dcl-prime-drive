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
import { atlasIcon } from './hud'

/** Menu panel is 940 wide with 32 of padding on each side: what a text line can use. */
const CONTENT_WIDTH = 876

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
        width: 940,
        height: '80vh',
        flexDirection: 'column',
        padding: 32,
        borderRadius: PANEL_RADIUS
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <UiEntity uiTransform={{ width: '100%', height: 78, flexDirection: 'row', alignItems: 'center' }}>
        <UiEntity uiTransform={{ flexGrow: 1, height: '100%' }} onMouseDown={() => tapLogo()}>
          <Text value="PRIME DRIVE" size={54} highlight />
        </UiEntity>
        <MenuButton
          label={state.musicOn ? 'MUSIC: ON' : 'MUSIC: OFF'}
          width={200}
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

/** Speedometer icon (C1:D2 of the atlas) + label in the bitmap font. */
const RaceButton = () => {
  const connecting = state.netStatus === 'connecting'
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
      uiBackground={{ color: connecting ? COLORS.panelSoft : RACE_BUTTON_COLOR }}
      onMouseDown={() => {
        if (!connecting) startRace()
      }}
    >
      <UiEntity uiTransform={{ width: 56, height: 56, margin: { right: 16 } }} uiBackground={atlasIcon(2, 0)} />
      <BitmapText text={connecting ? 'CONNECTING...' : 'RACE'} fontSize={40} color={Color4.White()} />
    </UiEntity>
  )
}

/** How to play, plus the race's numbers. */
const Tutorial = () => (
  <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
    {/* Touch controls on mobile, keyboard on desktop. The font has no em dash or arrows. */}
    <ControlLine keys={isMobile() ? ['ARROWS'] : ['A', 'D']} action="Change lanes" first />
    <ControlLine keys={isMobile() ? ['BOOST'] : ['SPACE']} action="Boost" />

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
      size={TEXT_SIZE.lg}
      highlight={state.recordTimeMs > 0}
      color={COLORS.ghost}
      maxWidth={CONTENT_WIDTH}
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

    {/* Pushes the server status down, right above the RACE button. */}
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1 }} />
    <Text value={netStatusLine()} size={TEXT_SIZE.sm} color={netStatusColor()} maxWidth={CONTENT_WIDTH} />
  </UiEntity>
)

function netStatusLine(): string {
  if (state.netStatus === 'online') return 'Server connected: coins and records are saved.'
  if (state.netStatus === 'connecting') return 'Looking for the race server...'
  return "No server: you can still race, but coins won't be credited and records won't be saved."
}

function netStatusColor() {
  if (state.netStatus === 'online') return COLORS.accent
  if (state.netStatus === 'connecting') return COLORS.textDim
  return COLORS.gold
}

const Garage = () => (
  <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
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
    <Text
      value={
        isOnline()
          ? 'Balance and purchases are handled by the server: the UI only shows what it confirms.'
          : "The garage needs the server: without it there's no balance to spend."
      }
      size={TEXT_SIZE.sm}
      color={isOnline() ? COLORS.textDim : COLORS.gold}
      marginTop={12}
      maxWidth={CONTENT_WIDTH}
    />
  </UiEntity>
)

const Ranking = () => (
  <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
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
