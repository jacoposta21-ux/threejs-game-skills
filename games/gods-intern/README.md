# God's Intern

> God is on vacation. You're in charge.

A browser-playable 3D god sandbox. A tiny island village lives its own life; you
answer its prayers with divine powers, and every miracle has consequences.
Built with TypeScript, Vite and Three.js. No backend, accounts, API keys or external
runtime assets: art is procedural low-poly, audio is synthesized with Web Audio,
and fonts are bundled from npm.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5188
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://127.0.0.1:4188
npm run test:unit  # simulation unit tests (vitest, no browser)
npm run test:e2e   # real-input browser playtest (Playwright)
```

URL flags (handy for testing): `?fresh` ignores the autosave, `?tutorial` forces the
tutorial, `?skipTutorial` skips it, `?quality=low|medium|high` pins graphics quality.

If Playwright's own browser download isn't available, point the e2e run at an installed
Chromium with `PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## Controls

| Input | Action |
| --- | --- |
| Left click | Use the selected power / inspect in Look mode |
| `1` `2` `3` `4` | Rain, Lightning, Nature, Fire |
| `0` / `Esc` | Look mode (hover villagers, click buildings) |
| Right drag | Orbit camera |
| Wheel | Zoom |
| `W` `A` `S` `D` / arrows / middle drag | Pan |
| `Q` / `E` | Spin camera |
| `Space` | Pause / resume |
| `F` | Simulation speed 1× / 2× / 3× |
| `Esc` | Close panel → deselect → pause menu |

## Design brief

- **Player promise:** "I have unlimited divine responsibility and absolutely no idea what I'm doing."
- **Target feeling:** You're watching a living miniature that reacts. You meddle, and the meddling snowballs.
- **Primary verb:** cast a power at a point on the island.
- **Secondary verbs:** inspect villagers and buildings, prioritize prayers, manage energy and timing.
- **5–30 s repeat:** read a prayer → pick a power → aim → watch the world and the villagers react.
- **1–5 min change:** the well drains, harvests come and go, day turns to night, and fires,
  floods and shortages create new prayers. Approval and chaos drift with your track record.
- **Lose / learn / restart:** there's no game over. Ignored prayers fail, approval drops,
  faith erodes, and villagers can die of thirst, fire or your lightning. Every failure
  shows up as a notification, a memo from God, or a visible change (rubble, ash, puddles).
  You can restart the world from the menu.
- **Rewarded:** solving the real problem, by any method. Prayers check simulation state,
  not button presses. **Risk:** overcorrecting (flooding, wildfire spread).
- **What a better player does:** rains on the well *and* the farm in one cast, stops
  before the soil saturates, plants firebreaks, and uses lightning for faith without
  hitting houses.
- **How the next decision is communicated:** villagers walk to the shrine and shout,
  the prayer inbox ranks prayers by urgency, the inspector lists current problems,
  thought bubbles show over villagers' heads, and the targeting ring turns red for
  invalid targets.
- **Non-goals for this slice:** multiple populated villages, advertising, an online
  backend, skeletal animation.

### Core loop contract

*The player casts powers to answer the village's prayers, while the simulation's own
pressure (drying well, crop cycles, night) and the side effects of their miracles
(floods, wildfires, panic) create risk. Success refills divine energy, raises approval
and makes villagers celebrate. Failure lowers approval and faith, and can kill
villagers, and the cause stays visible in the world.*

| Clause | Where it's proven in code |
| --- | --- |
| Verb mapped to input | `core/Game.ts` click → `PowerManager.activate` |
| Objective visible | `ui/PrayerPanel.ts` objective + progress, speech bubble, well water level |
| Pressure in the first minute | `CONFIG.village.startWater = 24` → tutorial thirst prayer; the well drains continuously |
| Reward changes state | `MissionManager` adds energy; `FaithSystem` adds approval and faith |
| Failure teaches | `PRAYER_FAILED` → toast, memo ("YOU HAD ONE JOB."), lower faith |
| Fast retry | No fail state; Restart World in the pause menu |

### Level plan (the island)

- **Format:** one 160 × 160 island with an authored layout and a seeded detail pass (`world/TerrainGen.ts`).
- **Start and first decision:** the camera flies into Puddleton (south-west). A villager
  walks to the shrine and asks for water. The well sits in the middle of the plaza.
- **Landmarks:** the snowy mountain massif (north) with cliffs on the north-west coast,
  the highland lake (north-east) draining into a river past the village, forests in the
  east and north, and two empty meadows (east and west) reserved as future settlement sites.
- **Escalation:** the well drains roughly every 2 minutes, which creates thirst prayers. Your
  own powers add floods (second rain), wildfires (dry pines spread faster) and panic.
  Night sends villagers home.
- **Recovery beats:** floods drain on their own, rain-soaked ash regrows into saplings,
  and builders repair or rebuild with wood.
- **Telegraphs:** the targeting ring, cloud shadows, the "UH… THAT MIGHT BE TOO MUCH."
  saturation warning, "THE VILLAGE IS IN DANGER!" when fire nears houses, and red
  urgency on prayers.

## Architecture

```
src/
  core/        Config, typed EventBus, seeded Rng, SpatialGrid, GameLoop (fixed step), Game (composition root), Settings
  world/       TerrainGen (pure heightfield), WorldGen (initial state), Terrain/Water/Vegetation/Weather/Ambient/DayNightCycle (Three.js)
  simulation/  SimulationManager, EnvironmentSystem (moisture/flood/clouds/trees), FireSystem, VillageSystem, FaithSystem,
               ConsequenceSystem + ConsequenceDefinitions (data-driven rules)
  ai/          VillagerAI (FSM), NeedsSystem, Pathfinding (A* + line-of-sight smoothing)
  powers/      DivinePower interface, PowerManager, Rain/Lightning/Nature/Fire
  missions/    MissionDefinitions (6 prayers), MissionManager, PrayerGenerator
  entities/    BuildingRenderer, VillagerRenderer (instanced body parts)
  effects/     ParticleSystem (pooled GPU points), VisualEffects
  ui/          HUD, PowerToolbar, PrayerPanel, VillageInspector, Notifications (toasts + God memos), WorldLabels, Menus, Tutorial
  audio/       AudioManager (procedural Web Audio)
  persistence/ SaveManager (versioned, validated localStorage saves)
  platform/    Platform boundary (standalone; CrazyGames adapter not yet implemented, see below)
```

- **Simulation and rendering are separate.** Everything under `simulation/`, `ai/`, `powers/`,
  `missions/`, `world/TerrainGen.ts` and `world/WorldGen.ts` is DOM- and Three.js-free.
  It runs at a fixed 20 Hz and is unit-tested in Node. Renderers read the plain-JSON
  `GameStateData` each frame and rebuild visuals from it, which is also why save/load is
  just JSON.
- **Event-driven.** Systems emit typed events (`POWER_USED`, `FIRE_SPREAD`,
  `FLOOD_STARTED`, `PRAYER_COMPLETED`, …). The consequence engine, missions, UI, audio and
  VFX subscribe without knowing about each other.
- **Performance:** villagers are about 10 instanced draws total, trees are 4 instanced
  draws, particles are 3 pooled `Points` draws. Spatial grids serve fire spread, witnesses
  and power effects. AI decisions are staggered. Fire has caps on active fires and on
  spread checks per tick. Quality presets (low/medium/high) scale DPR, shadows and
  particles, and Auto steps quality down when FPS drops.

## Consequence chains (implemented)

| Chain | Trigger → consequences |
| --- | --- |
| A — Holy Lightning | Lightning ignites a tree with ≥3 witnesses → faith up, chaos up, witnesses kneel → "THE TREE HAS SPOKEN." A second one within 4 minutes → "NEW RELIGIOUS MOVEMENT!" + memo |
| B — Too Much of a Good Thing | Rain on saturated soil → flood risk warning → flood → crops drown, happiness drops → "Too Much Rain" prayer + memo |
| C — Accidental Forest Fire | Spread with ≥6 active fires → villagers flee (AI), "THE VILLAGE IS IN DANGER!" → "Burning Question" prayer; burned buildings become rubble |
| D — Miracle Forest | ≥4 player trees near the village within 45 s → +12 wood, happiness, gratitude festival (villagers celebrate) |
| E — Divine Neglect | Long shortage with an unanswered prayer, or 2 failed prayers → happiness, faith and approval drop → "THE PEOPLE ARE BEGINNING TO QUESTION MANAGEMENT." |
| F — Arsonist Turned Hero | Completing a fire prayer after you started fires → approval *and* chaos rise |
| Also | Rain celebrations, smiting reactions, regrowth after rain on ash, taxes at high prosperity, "WHY ARE THEY WORSHIPPING A ROCK?" at high faith |

## Prayers (implemented)

The Great Thirst · The Burning Question · A Little More Green · Divine Panic · Too Much Rain · Empty Bellies.
Each prayer has a trigger condition, progress tracking, completion, expiry-based failure, and
an energy and approval reward. There's one active prayer per type per village and at most 3 active at once.

## CrazyGames

`src/platform/Platform.ts` is the integration boundary, and gameplay calls only that
interface. The official SDK docs could not be reached while this was built, so **no SDK
calls are made yet**. Implement a `GamePlatform` against the current official docs before
enabling it. The build has no external runtime requests and needs no login or keys.
