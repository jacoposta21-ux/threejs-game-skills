# God's Intern

> God is on vacation. You're in charge.

**Version 0.3 — The Divine Civilization Update.** Three villages now share the island:
Puddleton (farmers), Drizzleville (river traders) and Rockbottom (miners). They trade,
migrate, spread their faiths, form friendships and rivalries, and notice exactly how
evenly you hand out miracles. Twenty optional Divine Challenges reward experimentation.
See [What's new in 0.3](#whats-new-in-03).

Version 0.2 (The Divine Absurdity Update) made villagers *remember* what you do,
misunderstand it, found religions around it, decorate it, build monuments to it and hold
festivals about it. See [What's new in 0.2](#whats-new-in-02).

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
| `5` | Mutation (unlocks at 25 Chaos) |
| `B` | The Book of Questionable Miracles (history, civilization, beliefs, sacred places) |
| `C` | Divine Challenges (filter by category, pin up to 3, choose your title) |
| `V` | Villages: selector (click to fly there) and side-by-side comparison |
| `` ` `` | Performance overlay (development builds, or any build with `?debug`) |
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
  civ/         v0.3: CivilizationSystem (favor, diplomacy, trade, migration, visits, pilgrimages, spread),
               Relations, ChallengeDefinitions (20), ChallengeSystem
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

## What's new in 0.2

All of the following is simulation-driven (DOM-free code under `src/culture/`), saved,
and covered by `tests/unit/culture.test.ts`.

- **Divine memory** (`culture/MemorySystem.ts`): lightning, floods, instant trees,
  regrowth, fires put out by rain, destroyed buildings, answered prayers and mutations
  are recorded with the ids of the villagers who perceived them. Perception uses a
  spatial-grid query, and villagers must be alive and awake. Memories decay; strong,
  widely witnessed events become permanent. Memories make fire survivors flee earlier,
  raise faith, and feed belief formation. The list is bounded at 80.
- **Personalities** (`culture/Personality.ts`): each villager has one or two
  compatible traits, out of curious, skeptical, superstitious, brave, cowardly, lazy,
  ambitious, devout, rebellious and dramatic. Traits weight conversion, fleeing
  distance, fear, leadership, idling, work effort, ritual attendance and investigating
  oddities.
- **Religion generator** (`culture/ReligionSystem.ts`, `culture/Archetypes.ts`):
  - **Founding:** each stored memory adds *belief pressure* to an archetype (rock, tree,
    burned tree, flood, cloud, rebirth, fire, gold, potato, walking rock, giant head). A
    religion forms only when pressure crosses a threshold, at least 3 villagers
    witnessed it, no faith of that archetype exists, and a 90-second cooldown has passed.
  - **What each faith gets:** a deterministic, readable name (e.g. *The Society of the
    Sacred Pebble*, *The Church of the Wet Sock*), doctrine, a daily ritual, symbols, a
    leader with a title, a sacred place, and a sash colour that its followers wear.
  - **Life cycle:** followers recruit, hold rituals, argue with rivals in public, and
    fade when ignored. At most 4 faiths are active at once.
- **Sacred objects and monuments** (`culture/SacredSystem.ts`): an object becomes a
  gathering place, then villagers walk over and place decorations one at a time (1 wood
  each), build a shrine (12 wood, visible scaffolding), then a monument (24 wood). There
  are eight monument styles. Damage to a sacred object upsets its followers. Capped at 10.
- **Twelve surreal events** (`culture/SurrealEvents.ts`), data-driven on the existing
  consequence engine. Each one has a real trigger, a state change, visuals, a history
  entry and a cooldown:
  - **Rock King:** a crowned rock, royal decrees with real effects, and a "Silent
    Majesty" prayer.
  - **Wet Sock Festival:** repeats every 2 days.
  - **Holy Tree.**
  - **Ash Resurrection:** its followers replant burned stumps.
  - **Forbidden Well:** believers drink at the river instead, and rain purifies it.
  - **Eternal Picnic:** picnickers stop working and snack more.
  - **Upside-Down Day:** everyone walks backwards and farm output drops.
  - **Cloud Trial:** benches, an effigy and a verdict. A guilty cloud gets rain booed for a day.
  - **Sacred Potato:** a giant potato monument and smaller harvests.
  - **Department of Miracles:** an office is built, villagers queue, and prayers become
    forms with +20% reward.
  - **Fire Appreciation Society:** a fire pit and Bonfire Night, with slightly higher
    fire spread and stray embers.
  - **Great Silence:** shrine visits stop, an OUT OF OFFICE monument goes up, and an "Is
    God Still Employed?" prayer appears.
  - **Pacing:** major events are at least 40 seconds apart.
- **Mutation power** (`powers/MutationPower.ts`, `powers/MutationDefinitions.ts`):
  data-driven, with three mutations:
  - A villager gets a giant head.
  - A tree turns golden: it can't burn or be chopped.
  - A rock grows legs and wanders; it never blocks pathfinding.

  Invalid targets cost nothing. Mutations persist in saves.
- **The Book of Questionable Miracles** (`ui/HistoryBookPanel.ts`): a bounded, persisted
  history (80 entries since v0.3). Clicking an entry flies the camera there. It also has a Beliefs
  tab (the religion inspector) and a Sacred Places tab. Clickable pins mark sacred sites
  and open the sacred-object card.
- **Notifications**: at most 2 prominent toasts, a priority queue, ×N grouping of
  duplicates and expiry (`ui/NotificationQueue.ts`). Speech bubbles are capped at 3,
  ranked by priority and camera distance.
- **Visible world**:
  - Expressive villagers: bigger silhouettes, eyes and mood mouths, job tools,
    religion sashes and prophet hats.
  - New group poses: ritual rings and processions, picnics, arguments, queues and juries.
  - Village props: benches, a gathering circle, carts, clotheslines, a sign and flower beds.
  - Earned improvements: gardens, lanterns, a market and an expanded shrine.
  - Effects: ash under burned trees, blooming flowers around divine trees, lightning
    shockwaves, mutation pulses, and breathing rain clouds.
- **Saves**: version 2 with a v1→v2 migration (`persistence/Migrations.ts`). It fills
  traits deterministically from villager ids, generates rock entities from the terrain,
  and defaults all culture state.

## What's new in 0.3

The civilization layer lives in `src/civ/` (DOM-free, saved, and covered by
`tests/unit/civilization.test.ts`). The village layouts are in `src/world/Settlements.ts`.

### Three villages, three economies
| Village | Culture | Start pop | Strengths | Weaknesses |
| --- | --- | --- | --- | --- |
| Puddleton | Farmers | 20 | Farms ×1.15 | Average at everything else |
| Drizzleville | River traders (stilts, teal roofs, nets, boats, walkways) | 16 | Well refill ×1.6, fishery, open to trade and new faiths | Floods hurt crops ×1.5 |
| Rockbottom | Miners (log cabins, quarry, mine carts, cairns, raised stone shrine) | 14 | Quarry stone, monuments ×1.35 sacredness | Farms ×0.6, stubborn about religion |

- **Separate stores.** Every village has its own food, water, wood and stone, plus its own
  well, storehouse, shrine and homes. Miners and fishers are new jobs.
- **Village identity** (`VillageIdentity`): culture, openness, religious tolerance,
  divine favor, preferred resources, dominant religion, and economic multipliers.
- **Getting around.** A plank bridge crosses the river. Dirt roads follow the real A*
  routes between plazas. The population is capped at 90.

### Relationships (`civ/Relations.ts`)
- **Scale and bands.** Scores run from −100 to 100: Allied ≥60, Friendly 20–59,
  Neutral −19–19, Rival −59 to −20, Hostile ≤−60.
- **Bounded changes.** A single cause moves a score by at most 6 points.
- **Drift.** Every 5 s each relationship drifts (at most 0.5) toward a structural
  target. The target rises with shared dominant faith (+25) and recent trade and aid. It
  falls with different faiths (−18), theological rivalry, and unequal divine favor.
- **Events.**
  - Completed trades: +3.
  - Aid: +6.
  - Visits: +1.
  - Cross-village theological arguments: −2.
  - Favoritism: −5.
  - Harm done next to a favored neighbour (envy): −1.
- **Effects by band.**
  - Trade appetite: allied ×1.6, friendly ×1.2, rival ×0.5. Hostile suspends trade.
  - Friends send emergency aid and receive visitors.
  - Rivals mock each other and push their shrines in a monument race.
  - Allies join each other's festivals; rivals throw louder ones out of spite.
  - Hostile villages spread propaganda, and visits and pilgrimages between them stop.
  - There is no combat.

### Trade (`CivilizationSystem.planTrade`)
- **Planning.** Every 12 s (after the tutorial) the planner looks for the best
  surplus→need exchange. Surplus is anything above 1.3× the comfort level. Need is
  anything below comfort; preferred resources add appetite. At most 3 caravans travel at
  once. The destination pays in something it has spare, preferably something the origin
  wants.
- **Caravans travel physically.** One or two merchants carry a crate coloured by the
  cargo. They walk the A* route (over the bridge when needed), barter at the
  destination's storehouse, and walk home.
- **Conservation rules (tested).**
  - Cargo leaves the origin's stock at departure.
  - Cargo is added to the destination at arrival.
  - Payment leaves the destination at the exchange and enters the origin's stock when
    the last merchant is home.
  - If merchants die, no route is found, or the trip exceeds 200 s, whatever the cart
    carries goes back to its owner. Undelivered cargo and already-collected payment
    both go to the origin.
  - Amounts are clipped to available room at departure. Anything that no longer fits
    at arrival stays on the cart and is refunded.
- **Commentary.** Messages name the real amounts ("DRIZZLEVILLE TRADED 15 WATER FOR 6
  WOOD."). After the 3rd trade, "PUDDLETON HAS INVENTED SHIPPING FEES." (+10% price).
  Rich Puddleton starts "EXPORTING LUXURY CARROTS" (+30% food price).

### Migration
- **How often.** Every 30 s, with a global cooldown of 70 s, at most one adult considers
  moving.
- **Push score** (reasons to leave): unhappiness, hunger, thirst, fear, being a
  religious minority in an intolerant village, and the potato situation.
- **Pull score** (reasons to pick a destination): prosperity, happiness, openness, a
  shared faith, and friendly relations.
- **Blocked moves.** Nobody moves into a hostile village or a full one. No village
  shrinks below 5 people.
- **Same entity.** The migrant walks over with a bindle and changes village on arrival.
  Name, traits, memories, faith, mutation and age are kept.

### Religion across villages
- **How faiths travel.** Merchants, visitors, migrants and pilgrims carry their faith.
  Shared miracles convert witnesses too.
- **Conversion odds** for a faith born elsewhere are scaled by (0.4 + local tolerance) ×
  relationship factor (allied 1.4 … hostile 0.3). A village's dominant faith resists
  newcomers.
- **Spread events.** The first believer in a new village emits `RELIGION_SPREAD` and
  writes history. Theological arguments between villages build rivalries.
- **Pilgrimages.** Once a sacred place reaches stage 3, believers from other villages
  make pilgrimages to it. Each one adds sacredness.

### Divine favor and favoritism
- **Recording.** Interventions are recorded per village, with positive and negative
  tracked separately over a rolling 5-minute window. Approval is still tracked on its
  own.
  - Positive: rain on a needy village +6 (otherwise +2), Nature tree +2, rain putting
    out a fire +4, answered prayer +10.
  - Negative: ignored prayer −6, lightning nearby −4/−8/−10, your fire −4, flood after
    your rain −8, destroyed building −8.
- **Jealousy.** When one village's positive favor leads another's by 40 or more (with a
  2-minute cooldown), the overlooked village files a complaint:
  - "DRIZZLEVILLE HAS FILED A FORMAL COMPLAINT AGAINST HEAVEN."
  - "ROCKBOTTOM BELIEVES GOD HAS A FAVORITE CHILD."
  - "PUDDLETON DEMANDS EQUAL OPPORTUNITY MIRACLES."

  Its happiness drops, relations with the favorite sour, it pours effort into its own
  shrine, and it sends an *Equal Opportunity Miracles* prayer. That prayer completes
  when it receives 15 favor.
- **Resentment.** A village that takes most of the divine harm gains fear and loses
  faith.

### Divine Challenges (`civ/ChallengeDefinitions.ts`, `civ/ChallengeSystem.ts`, key `C`)
Twenty optional challenges in five categories (Miracle, Civilization, Cultural, Chaos,
Diplomacy):
- **Easy (available from the start):** Let There Be Rain, Amateur Botanist,
  Firefighter of the Year, The First Believers, Divine Tourist.
- **Medium (after the tutorial):** The Rock Has Spoken, Golden Age, International
  Relations, The Traveling Merchant, Cultural Exchange, New Neighbors, Equal
  Opportunity God, The Great Pilgrimage, The Monumental Mistake.
- **Hard (after any 3 completed):** Three Gods One Island, Diplomatic Disaster, The
  Peace Treaty, The Golden Kingdom, The Divine Bureaucracy, The Worst Intern Ever.

How progress and rewards work:
- **What objectives read.** Every objective reads authoritative state (`state`), counts
  real events (`counter`), or measures continuous time (`duration`).
- **No pre-filling or farming.** Counters advance only while a challenge is unlocked
  and not yet completed.
- **Duration objectives reset to 0 when interrupted.** They do not pause.
- **Rewards.** Energy, approval, chaos, cosmetic titles (Certified Rain Technician,
  Supreme Rock Consultant, Divine Human Resources Manager, Assistant to the Regional
  God, Employee of the Apocalypse, …) and cosmetics (Golden Lightning, Rainbow Rain, a
  Statue of the Intern in Puddleton, a gold desk nameplate). History entries too.
- **No duplicates.** Rewards are applied exactly once; a saved `rewardApplied` flag
  guards them.
- **Panel.** Filter by category and pin up to 3; pinned challenges show in a compact
  widget. Pick your title. Completion shows a non-modal confetti toast: "DIVINE
  CHALLENGE COMPLETED!"

### Navigation and history
- `V` opens the village selector, which flies the camera to a village, next to a compact
  comparison table:
  - population, food, water, wood, stone and prosperity;
  - dominant religion;
  - divine favor (+/−);
  - emergencies;
  - relationship meters;
  - caravans on the road.
- The Book has a new **Civilization** chapter: foundings, first trade, first migration,
  faith spreads, alliances, rivalries, monuments and challenges. Clicking an entry flies
  the camera there.
- The performance overlay (`` ` ``) and `window.__THREE_GAME_DIAGNOSTICS__` now also
  report caravans, travellers, rituals and particles.

### Saves
- **Version 3.** Older saves migrate deterministically. A v0.1 or v0.2 save keeps
  Puddleton, its villagers, faiths, sacred places, mutations, memories, monuments,
  history and resources.
- **New villages in old saves.** Drizzleville and Rockbottom are founded exactly as in a
  new world (same seed-derived layout). A "New Neighbors Arrived" entry is added to the
  history.
- **Persisted.** Identities, relationships, caravans in transit (with their cargo),
  travellers mid-route, favor events, challenge progress, titles, cosmetics and pins.

### Test hooks
`window.__THREE_GAME_TEST_HOOKS__` is installed only in development builds or with
`?test`. Production players cannot use it to fast-forward or complete challenges.
