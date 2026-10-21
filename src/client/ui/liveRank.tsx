import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { LEADERBOARD_SIZE, RACE, formatTime } from '../../shared/config'
import { LeaderboardRow, state } from '../state'
import { ProfilePic } from './profilePic'
import { COLORS, Text } from './theme'

/**
 * LIVE RANK: where the player's projected finish time would land on the
 * top 10. It never compares race progress, only finish times: the board's
 * racers aren't on track right now, and other live racers started at other
 * moments.
 */
export const LiveRank = () => {
  const finished = state.phase === 'finished'
  const playerMs = finished ? state.elapsedMs : estimatedFinishMs()
  const view = liveRankView(state.leaderboard, state.myAddress, playerMs)
  const player: RankRow = {
    position: view.playerPosition,
    userId: state.myIsGuest ? '' : state.myAddress,
    timeMs: playerMs,
    estimated: !finished,
    isPlayer: true
  }

  return (
    <UiEntity
      uiTransform={{
        width: PANEL_WIDTH,
        positionType: 'absolute',
        position: { top: PANEL_TOP, right: PANEL_RIGHT },
        flexDirection: 'column',
        padding: { left: 12, right: 12, top: 10, bottom: 12 },
        borderRadius: PANEL_CORNER
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <Text value="LIVE RANK" size={20} height={30} align="middle-center" color={COLORS.textDim} />
      {view.rows.map((row, index) => (
        // Keyed by slot, not by racer: when the player climbs, the same five
        // rows just swap contents instead of being torn down and rebuilt.
        <RankLine key={`slot-${index}`} row={row ?? player} />
      ))}
      {view.playerOutside ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
          <UiEntity
            uiTransform={{ width: '100%', height: 2, margin: { top: 4, bottom: 2 } }}
            uiBackground={{ color: COLORS.track }}
          />
          <RankLine row={player} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

type RankRow = {
  /** 1-based. `null` when the exact rank is unknown (outside the top 10). */
  position: number | null
  userId: string
  timeMs: number
  estimated: boolean
  isPlayer: boolean
}

const RankLine = (props: { key?: string; row: RankRow }) => {
  const row = props.row
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: ROW_HEIGHT,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        padding: { left: 8, right: 10 },
        margin: { top: ROW_GAP },
        borderRadius: 10
      }}
      uiBackground={{ color: row.isPlayer ? PLAYER_ROW : TRANSPARENT }}
    >
      <UiEntity uiTransform={{ width: 40, height: '100%', alignItems: 'center' }}>
        {row.position !== null ? (
          <Text value={`${row.position}`} size={20} width="100%" color={COLORS.textDim} />
        ) : (
          // The bitmap font has no em dash: a short bar stands in for it.
          <UiEntity uiTransform={{ width: 16, height: 3 }} uiBackground={{ color: COLORS.textDim }} />
        )}
      </UiEntity>
      {/* The mask's corners are opaque: on the see-through panel they'd show as a
          dark square. An opaque disc of their exact color swallows them. */}
      <UiEntity
        uiTransform={{
          width: BACKDROP_SIZE,
          height: BACKDROP_SIZE,
          flexShrink: 0,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: BACKDROP_SIZE / 2
        }}
        uiBackground={{ color: row.isPlayer ? PLAYER_ROW : MASK_CORNER }}
      >
        <ProfilePic
          userId={row.userId}
          size={AVATAR_SIZE}
          ringColor={row.isPlayer ? COLORS.accent : COLORS.ghost}
          mask={row.isPlayer ? PLAYER_ROW_MASK : undefined}
        />
      </UiEntity>
      {/* Right-aligned, so the asterisk grows to the left and the times stay lined up. */}
      <UiEntity uiTransform={{ flexGrow: 1, height: '100%' }}>
        <Text
          value={`${formatTime(row.timeMs)}${row.estimated ? '*' : ''}`}
          size={20}
          align="middle-right"
          highlight={row.isPlayer}
        />
      </UiEntity>
    </UiEntity>
  )
}

/**
 * Rows to draw, slowest last. A `null` row is the player's slot.
 *
 * Inside the top 10 the player sits in the middle of five rows whenever the
 * board allows it. Outside, the panel shows 6–10 and the player goes in a
 * separate row below, without a position.
 */
export function liveRankView(
  board: LeaderboardRow[],
  myAddress: string,
  playerMs: number
): { rows: (RankRow | null)[]; playerPosition: number | null; playerOutside: boolean } {
  // The player's own saved time is left out: their live row stands for them.
  const me = myAddress.toLowerCase()
  const others = board
    .filter((entry) => !me || entry.address.toLowerCase() !== me)
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, LEADERBOARD_SIZE)
  // On a tie the saved time keeps its place: it got there first.
  const playerIndex = others.filter((entry) => entry.timeMs <= playerMs).length
  const toRow = (entry: LeaderboardRow, index: number): RankRow => ({
    position: index + 1,
    userId: entry.hasProfile ? entry.address : '',
    timeMs: entry.timeMs,
    estimated: false,
    isPlayer: false
  })

  if (playerIndex >= LEADERBOARD_SIZE) {
    const first = LEADERBOARD_SIZE - VISIBLE_ROWS
    return {
      rows: others.slice(first).map((entry, i) => toRow(entry, first + i)),
      playerPosition: null,
      playerOutside: true
    }
  }

  // Positions as they'd be with the player in: everyone behind moves down one.
  const ranked: (RankRow | null)[] = others.map((entry, i) => toRow(entry, i < playerIndex ? i : i + 1))
  ranked.splice(playerIndex, 0, null)
  const top = ranked.slice(0, LEADERBOARD_SIZE)
  const start = Math.max(0, Math.min(playerIndex - Math.floor(VISIBLE_ROWS / 2), top.length - VISIBLE_ROWS))
  return { rows: top.slice(start, start + VISIBLE_ROWS), playerPosition: playerIndex + 1, playerOutside: false }
}

/**
 * Projected finish time at the pace held so far. Refreshed every
 * `ESTIMATE_REFRESH_MS` of race time, so the time and the rank don't flicker
 * with every frame's speed change.
 */
function estimatedFinishMs(): number {
  if (estimate.atMs < 0 || state.elapsedMs < estimate.atMs || state.elapsedMs - estimate.atMs >= ESTIMATE_REFRESH_MS) {
    // Over the first stretch the average pace is mostly noise: assume cruise speed.
    const msPerMeter =
      state.distanceM >= RACE.checkpointIntervalM ? state.elapsedMs / state.distanceM : 1000 / RACE.baseSpeed
    estimate.atMs = state.elapsedMs
    estimate.valueMs = state.elapsedMs + Math.max(0, RACE.distanceM - state.distanceM) * msPerMeter
  }
  return estimate.valueMs
}

const estimate = { atMs: -1, valueMs: 0 }
const ESTIMATE_REFRESH_MS = 500

const VISIBLE_ROWS = 5
const PANEL_WIDTH = 300
/** Clear of the top bar, which spans the middle half of the screen. */
const PANEL_TOP = 24
const PANEL_RIGHT = 40
const PANEL_CORNER = 18
const ROW_HEIGHT = 44
const ROW_GAP = 4
const AVATAR_SIZE = 32
/** Disc behind each picture: a few px wider so its round edge hides the mask's square one. */
const BACKDROP_SIZE = AVATAR_SIZE + 6
/** `COLORS.panel` at full opacity: the corner color of `AVATAR_MASK` (10, 13, 23). */
const MASK_CORNER = Color4.create(COLORS.panel.r, COLORS.panel.g, COLORS.panel.b, 1)
/** Must stay the corner color of `PLAYER_ROW_MASK` (15, 64, 97): the mask's corners are opaque. */
const PLAYER_ROW = Color4.create(15 / 255, 64 / 255, 97 / 255, 1)
const PLAYER_ROW_MASK = 'assets/images/avatar_mask_highlight.png'
const TRANSPARENT = Color4.create(0, 0, 0, 0)
