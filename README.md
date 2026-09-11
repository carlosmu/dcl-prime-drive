# Prime Drive

A 3-lane racing runner for Decentraland SDK7, with an **authoritative server**.

The player rides a bike, dodges obstacles, and collects coins along
**10,000 m**. Every **100 m** the client reports a checkpoint to the server, which
validates the time and decides how many coins to credit. It's a single-player
match, but you race while comparing yourself against the **track record ghost**
and against the progress bar of the other racers who happen to be in the scene
at the same time.

## How to run it

```bash
npm install
npm run start
```

The preview also spins up the authoritative server (`authoritativeMultiplayer: true`
in `scene.json` triggers it automatically). Server logs come out with the
`[Server]` prefix.

### Why `npm start` goes through `scripts/start.js`

sdk-commands picks the `bevy` engine by default, and that implementation is an
**unsigned** native `.exe`. On Windows with Smart App Control or WDAC enabled,
Code Integrity blocks it: the preview comes up, the server dies with
`spawn UNKNOWN`, and the scene is left without a server with no explanation.

`scripts/start.js` forces `DCL_SERVER_ENGINE=hammurabi`, which is pure JS and
runs under `node.exe` — signed and trusted by the policy. It starts up without
touching anything on the system.

- `npm start` → hammurabi (this project's default).
- `npm run start:bevy` → sdk-commands' original behavior.
- `DCL_SERVER_ENGINE=bevy npm start` → also forces bevy; an already-set variable wins.

**If you preview from the Creator Hub**, the Hub doesn't go through `npm start`,
so you need to set the variable at the user level once:

```
setx DCL_SERVER_ENGINE hammurabi
```

and restart the Hub.

> **Before deploying, two fields in `scene.json` need to be updated:**
> - `worldConfiguration.name` — currently set to `prime-drive.dcl.eth`; put your DCL NAME or ENS.
> - `logsPermissions` — currently has a zero address; put your wallet in there or you
>   won't see the server's `console.log` output.

## How to play

- **A / D** (or the on-screen buttons, which also work on mobile) change lanes.
- Coins are collected by driving over them; obstacles never block all 3 lanes
  at once — there's always an opening.
- **3 crashes** end the race. A crash slows you down and grants 1.6 s of
  invulnerability.
- Speed increases linearly from 26 m/s to 62 m/s with distance traveled.

## Architecture

```
src/
├── index.ts                 isServer() decides which half starts
├── shared/
│   ├── config.ts            track, speed curve, economy, skins
│   ├── messages.ts          client ↔ server protocol (registerMessages)
│   └── schemas.ts           synced TrackRecord + protectServerEntity
├── server/
│   ├── server.ts            handlers, standings, record, shop
│   ├── validation.ts        checkpoint and race-finish anti-cheat
│   └── profiles.ts          persistence (per-player and per-scene Storage)
└── client/
    ├── setup.ts             client startup
    ├── race.ts              race loop, phases, input, checkpoints
    ├── net.ts                message sends and handlers
    ├── state.ts             state read by the UI
    ├── game/
    │   ├── track.ts         road, rails, buildings, and pylons with scrolling
    │   ├── spawner.ts       coin, obstacle, and arch pools
    │   ├── bike.ts          player's bike, lanes, and skins
    │   ├── camera.ts        chase VirtualCamera
    │   └── ghost.ts         record ghost bike
    └── ui/                  HUD, menu/garage/ranking, and results
```

### The player doesn't move

The Decentraland avatar is **hidden** (`AvatarModifierArea` with `AMT_HIDE_AVATARS`)
and **frozen** (`InputModifier`), anchored near `z = 21`. What you see and control
is a bike entity that only moves along X between the three lanes. Everything
else — buildings, coins, obstacles — is born at `z = 300` and travels toward
`z = 0`. `state.distanceM` is the only notion of progress.

The camera is a `VirtualCamera` behind the bike: the normal camera follows the
avatar, which stays still here.

### Nothing is created during the race

Everything comes from pools set up when the scene starts. The scenery (stripes,
pylons, buildings) consists of fixed-size rings that loop back to the rear once
the camera passes them. Coins, obstacles, and arches are parked at `y = -200`
when not in use. `GltfContainer.src` is never swapped on the fly: that would
reload the GLB and cause a stutter.

All 4 bike skins are instantiated at startup and toggled with
`VisibilityComponent`.

### Crossing-based collision detection, not proximity-based

At 62 m/s and 30 fps, an object advances 2 m per frame. A distance window
would skip right over it, so the test checks **crossing the player's plane**:
`previousZ > playerZ && newZ <= playerZ`. Accurate at any speed.

## The server is optional to play

If the authoritative room doesn't sync within 6 s, the scene switches to
**offline**: the race still runs, but no coins are credited, no records are
saved, and the garage is disabled. The menu says so explicitly, and the
handshake keeps retrying in the background, so if the server shows up later
the scene switches to online on its own, without reloading.

This isn't just a development convenience: a player whose connection drops
shouldn't be left with a dead button.

### Debug panel

At the bottom center there's a panel showing connection status, which can be
turned off from the menu. The value that matters is **`server tick`**: the
server increments it once per second and it travels as a synced component
(`ServerHeartbeat` in `shared/schemas.ts`).

| what it shows | what it means |
|---|---|
| tick advancing | server alive and CRDT arriving |
| `--` | no heartbeat ever arrived: there's no server |
| frozen on a number | the server started and then went down |

`stateSynced` is the raw `isStateSyncronized()`, and `msgs` counts received
messages: together they tell apart a CRDT problem from a message-bus problem.

## Authoritative server

The client simulates the race; the server decides what counts. Nothing the
client reports is accepted without going through `server/validation.ts`.

**What a checkpoint validates:**

1. Consecutive index (skipping one invalidates the race).
2. `elapsedMs` monotonically increasing.
3. `elapsedMs >= idealTimeMs(distance) * 0.97`. `idealTimeMs` is the closed-form
   integral of the speed curve: with `v(d) = a + k·d`, `t = ln((a + k·d)/a) / k`.
   It's the absolute physical floor — no legitimate race can go below it.
4. The client's clock can't drift more than 8 s from the server's clock.
5. Coins and crashes can't go backwards, and coins can't exceed what the
   spawner can generate at that distance (`maxCoinsAt`).

The first rejected checkpoint marks the race as invalid: from that point on it
pays out nothing, even if the player reaches the finish line.

> The server **cannot see the player's real position** in this scene, because
> the avatar stays still and it's the world that moves. Authority relies on
> what it does control: its own clock, the deterministic speed curve from
> `shared/config.ts`, and the coin cap per segment. If positional verification
> is ever needed, the avatar would have to actually move and be read via
> `PlayerIdentityData` + `Transform`.

**Persistence** (`@dcl/sdk/server` `Storage`):

| key | scope | contents |
|---|---|---|
| `profile` | player | coins, purchased skins, equipped skin, best time, races |
| `ghost:<trackId>` | scene | splits of the current record, replayed as a ghost |
| `leaderboard:<trackId>` | scene | top 10 times |

Changing `TRACK_ID` in `shared/config.ts` invalidates saved records and
ghosts — useful when rebalancing the track.

**Environment variables** (`.env` locally, `npm run deploy-env` in production):

| variable | default | effect |
|---|---|---|
| `COIN_MULTIPLIER` | `1` | multiplies the coins credited at the end |

## Economy

Coins are credited **only when the race ends** and only if the server accepted
it: what was collected (capped), plus 250 for completing the 10 km, plus 500
for a new record. They're spent in the garage, on the 4 bike skins
(0 / 1500 / 4000 / 9000).

## Assets

- From the `coin-runner` project: `coin.glb`, `building_01..03.glb`,
  `street_lines.glb`, and the sound effects.
- From the OpenDCL catalog: the 4 bikes (`bike_01..04.glb`), the cones
  (`obstacle_cone`), the checkpoint arch (`obstacle_gate`), and the pylons
  (`track_edge`).

> **Watch out for catalog GLBs that carry transforms on their nodes.** The
> barrier that used to be used (`obstacle_barrier.glb`) had its nodes offset
> +14 m in Y and −17 m in Z and scaled 8× and 15×, so the mesh appeared far
> away from the entity's position. Since collision is calculated against the
> entity, the player would crash into nothing. Now the barrier is a primitive:
> what you see and what you collide with are the same size by construction.
> Before using a new model as an obstacle, verify that its bbox is centered on
> the origin and that its nodes don't carry their own `translation`/`scale`.

The road, shoulders, and neon rails are primitives with PBR material: zero
textures and 5 entities for the 320 m of track.

`assets/sounds/music_01.mp3` is the background music: it loops from the moment
the scene loads, at low volume in the menu and louder during the race, with a
toggle in the menu. It weighs 4 MB — by far the largest file in the project,
so if a deploy comes out too heavy, that's the first one worth recompressing.

## Quick tweaks

| what | where |
|---|---|
| Race length, checkpoints, speeds, lives | `shared/config.ts` → `RACE` |
| Lanes, player Z, spawn Z | `shared/config.ts` → `TRACK` |
| Coin, obstacle, and building density | `shared/config.ts` → `SPAWN` |
| Skin prices and models | `shared/config.ts` → `SKINS` |
| Bonus and coin cap | `shared/config.ts` → `ECONOMY` |
| Bike and ghost orientation | `client/game/bike.ts` → `BIKE_YAW_DEG` |
| Camera distance and height | `client/game/camera.ts` |
| Music volume in menu and race | `client/game/music.ts` |
