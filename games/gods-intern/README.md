# God's Intern

> God is on vacation. You're in charge.

**Version 0.5 — Less UI, More God (final pre-launch).** The game is easier to read and
paces its unlocks properly:
- **A calmer screen.** Four indicators at the top (Energy, Career, Approval, Chaos), a
  power dock at the bottom, a navigation rail on the left (World, Career, Challenges,
  History) and prayers on the right.
- **Clear targeting.** Select a power and a bar tells you what to click, whether the
  target is valid, and shows Raise/Lower or Accelerate/Slow buttons and a **Cancel**
  button.
- **A rebalanced career.** Four powers at the start; Mutation in about 5–10 minutes,
  Tornado in about 10–15, and the rest over several hours. There is no more rank-skipping
  from early bonuses.
- **A short onboarding** (about 30 seconds), contextual tips, a main menu, Possession
  touch controls and a reduced-motion setting.

See [What's new in 0.5](#whats-new-in-05).

**Version 0.4 — The Heavenly Polish Update.** You now have a career:
- **Promotions.** Earn Divine Experience and climb from *Unpaid Intern* to *God of
  Questionable Decisions*.
- **Eight new powers** unlock along the way: Tornado, Freeze, Gravity, Terraform, Time
  Warp, Possession, Meteor and Resurrection.
- **Combinations.** Fifteen secret power combinations are waiting to be discovered.
- **Heavenly mail.** Heaven's departments send increasingly worried memos.
- **Creative Mode** keeps the sandbox separate from your career.

See [What's new in 0.4](#whats-new-in-04).

**Version 0.3 — The Divine Civilization Update** added three villages: Puddleton
(farmers), Drizzleville (river traders) and Rockbottom (miners). They trade, migrate,
spread their faiths, form friendships and rivalries, and notice how evenly you hand out
miracles. Twenty optional Divine Challenges reward experimentation.

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

The game opens on the main menu. URL flags (handy for testing) skip it: `?play`
continues the saved world, `?fresh` starts a new world, `?tutorial` forces the onboarding,
`?skipTutorial` skips it, and `?quality=low|medium|high` pins graphics quality.

If Playwright's own browser download isn't available, point the e2e run at an installed
Chromium with `PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## Controls

Everything works with the mouse or touch alone; keys are optional shortcuts.

| Input | Action |
| --- | --- |
| Click a power in the dock | Select it; the bar above the dock says what to click |
| Click the island | Cast the selected power · with no power selected: inspect what you clicked |
| **Cancel** button / `Esc` | Put the power away |
| **ALL POWERS** / `G` | Every power by category: what it does, how to use it, how to unlock it; put any power in any dock slot |
| Rail: World / Career / Challenges / History | One panel at a time; click the island to close it |
| Prayer card: Focus / suggested power | Fly there / pick the usual fix (you still cast it) |
| Top bar: Energy, Approval, Chaos | Click for an explanation |
| Drag · right-drag · wheel | Pan · rotate · zoom |
| Touch | Tap to cast or inspect · drag pans · pinch zooms · twist rotates |
| Possession | On-screen pad, **Interact** and **Leave body** buttons (or `WASD`, `E`, `Q`) |
| Optional keys | `1`–`7` dock · `T` power mode · `V` `J` `C` `B` panels · `Space` pause · `F` speed · `P` menu · `K`/`H` cinematic/screenshot |

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

`src/platform/Platform.ts` implements CrazyGames HTML5 SDK v3. It uses:
- lifecycle: `init`, `loadingStart`/`loadingStop`, `gameplayStart`/`gameplayStop`;
- `happytime` (rate-limited);
- the `muteAudio` setting.

The SDK script loads only when hosted on CrazyGames (or with `?platform=crazygames`).
Standalone builds make no external requests. There are no ads; Basic Launch disallows
them. See [docs/SUBMISSION-CHECKLIST.md](docs/SUBMISSION-CHECKLIST.md).

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

## What's new in 0.4

### Heavenly Career (`src/career/`)
- **Ten ranks:**

  | Rank | Title | XP |
  | ---: | --- | ---: |
  | 1 | Unpaid Intern | 0 |
  | 2 | Junior Miracle Assistant | 100 |
  | 3 | Cloud Department Employee | 250 |
  | 4 | Certified Demigod | 450 |
  | 5 | Regional Deity | 750 |
  | 6 | Senior God | 1150 |
  | 7 | Director of Creation | 1700 |
  | 8 | Supreme Cosmic Manager | 2400 |
  | 9 | God's Replacement | 3300 |
  | 10 | God of Questionable Decisions | 4500 |

- **XP comes from meaningful events, each deduplicated:**
  - training: 25;
  - answered prayers: 25 per prayer, plus 10 when it ends a shortage;
  - challenges: 30, 60 or 120 by difficulty;
  - first discovery of each surreal event: 40;
  - new religions: 30; sacred sites growing (stage 3+): 15; monuments: 40;
  - rescues: 4, at most 5 per minute;
  - improved relationships: 20 per pair and category;
  - consequence chains, floods, meteors and witnessed miracles: rate-limited;
  - first use of each power: 10;
  - combinations: 30–45 each.
- **No click farming.** Repeating the same action at the same spot earns nothing.
  Chaotic play earns XP as well as kind play.
- **Promotions.**
  - Each one shows a short, non-modal ceremony (rays, fanfare, the new title, what
    unlocked) and adds a History Book entry.
  - Each unlocks a power: Tornado (2), Freeze (3), Gravity and Mutation (4), Terraform
    (5), Time Warp (6), Possession (7), Meteor (8), Resurrection (9).
  - Rank 10 unlocks **Divine Overtime**: 30 s of cooldowns ×0.25 and energy ×4,
    recharging over 3 min. It also brings a cosmic aura, a golden badge, a Monument of
    the Intern in Puddleton, and God's final review. The sandbox keeps going.
- **HUD.** A career chip shows rank, title, XP bar and the next unlock. `J` opens the
  full path and Heaven's inbox.
- **Heaven's departments** (`career/HeavenSystem.ts`): contextual memos built from real
  state. Examples:
  - "WE HAVE RECEIVED 56 COMPLAINTS ABOUT THE WEATHER."
  - "WHY IS A ROCK NOW THE MAYOR OF PUDDLETON?"
  - "ROCKBOTTOM HAS REQUESTED AN EXPLANATION FOR ITS NEW MOUNTAIN."
  - Periodic performance reviews.

  Each memo is sent once (or after its cooldown) and at least 45 s after the previous
  one. The archive keeps the last 30.

### Thirteen powers
New powers live in `src/powers/V4Powers.ts`, with timed area effects in `src/powers/EffectsSystem.ts`.

| Power | What it does | Safety rules |
| --- | --- | --- |
| Tornado | Wandering funnel (14 s): villagers flee, trees can be uprooted (wood for the village), weak buildings damaged, loose rocks flung to valid ground, caravans in its path fail (goods go home), weak fires snuffed, strong fires thrown downwind. | One at a time; bounded radius; rocks only land on land; navigation untouched. |
| Freeze | 30 s frost: fires go out (`byFreeze`), crops and plants stop growing, villagers slow down, visible thaw at the end. | No ice crossings (would need water-aware navigation; documented limitation). |
| Gravity | 12 s low-gravity bubble: villagers and rocks float, then settle. | Controlled animation, no physics engine; `lift` always returns to 0. |
| Terraform | Raise/lower a 4 m brush (`T` toggles), ±4 m max per spot. | Refuses near buildings, the bridge and water. Navigation is refreshed locally; edits persist and replay deterministically. |
| Time Warp | 25 s bubble at ×2.5 or ×0.35 for walking, work, growth, building and fire. | Per-entity multipliers only, never the global step; production only happens when work completes, so nothing is duplicated. |
| Possession | 45 s third-person control of one villager: `WASD`/tap to walk, `E` to pray, drink or chat, `Q` to leave. | AI suspended and resumed; walkability rules apply; others comment on wall-walking. |
| Meteor | 3 s warning, then a bounded impact: damage within 8 m, fire, a crater (unless protected), a warm sacred fragment. | One at a time; never wipes out a village; saving during the warning still lands it. |
| Resurrection | Revive a villager from the graveyard: same id, name, traits, memories, faith and village. | Max 12 graves for 15 min; no duplicates; population cap; safe walkable spawn. Believers come back as prophets. |

New memories and religions: *The Order of the Extremely Large Rock*, *The Church of the
Eternal Ice Cube*, the Sacred Spin and the Returned.

### Power combinations (`src/powers/ComboSystem.ts`)
- **Fifteen interactions,** all detected from real simulation events:
  - Rain + Fire, Rain + Nature, Fire + Nature, Lightning + Rock;
  - Mutation + Sacred Tree, Freeze + Fire, Freeze + Rain, Gravity + Mutation;
  - Tornado + Fire, Meteor + Rain, Terraform + Rain, Resurrection + Religion;
  - Freeze + Nature, Gravity + Lightning, Time Warp + Nature.
- **Real effects.** Each one changes the game, e.g. faster growth, a wider frost, a
  floating rock, a pond, a prophet.
- **One-time rewards.** Each gives its XP once and adds a History Book entry.

### Ten new challenges (30 in total)
Wind Management, Cold Reception, Unqualified Astronaut, Department of Geography, Time Is
a Suggestion, Employee of the Month, Undercover Management, The Big Rock Problem, Death
Was a Clerical Error, God's Worst Nightmare.

### Cultural events in every village
- **Where they happen.** These events now take place in the village where they start:
  - the Forbidden Well, the Sacred Potato, the Eternal Picnic;
  - the Department of Miracles, the Great Silence, the Fire Appreciation Society;
  - the Rock King's prayer.
- **Local variations:**

  | Event | Puddleton | Drizzleville | Rockbottom |
  | --- | --- | --- | --- |
  | Sacred crop | *The Unusually Successful Carrot* | *The Holy Turnip of the Tides* | *The Sacred Gravel Potato* |
  | Prayer office | Department of Miracles | *Rain Bureaucracy* | *Ministry of Stone Tablets* |

- **Old saves** keep these events in Puddleton.

### World polish
- **Village identity.** Puddleton is warm (red/terracotta/gold roofs). Drizzleville is
  teal on stilts with nets and boats; Rockbottom has stone, mine carts and cairns.
  Plazas fly banners in their dominant faith's color and string up bunting when
  prosperous.
- **Atmosphere.** Pollen drifts by day, mist lies over water at dawn and night, and
  fireflies glow around every village.
- **Villagers.** They float, carry crates of what they produced, and lazy ones sit down.
- **Effect visuals:** a tornado funnel with debris, a frost field with crystals, a
  gravity dome, a time-warp clock ring, a meteor fall/impact with shockwave and dust,
  graves, a possession aura and resurrection light.
- **Audio:** ocean waves and a small generative music box, plus a distinct sound for
  every new power, promotions and discoveries. Five volume buses: master, music,
  ambience, effects, interface.

### Interface, camera and touch
- **Toolbar.** Look plus six assignable quick slots, and an "All powers" menu with
  categories, lock reasons and slot assignment.
- **Camera modes.** Cinematic mode (`K`) slowly orbits the island with the UI hidden;
  screenshot mode (`H`) hides the UI.
- **Possession camera** follows close behind the villager.
- **Touch.** Tap to cast or inspect, one-finger pan, pinch-zoom, twist-rotate, and
  touch-sized controls in landscape phone layouts. Tested in browser emulation only.

### Career Mode and Creative Mode
- **Career** (default) uses normal energy and cooldowns, with progression and
  challenges.
- **Creative** (pause menu) has every power, optional unlimited energy and ×0.25
  cooldowns, **no career XP**, no challenges, and its own save slots.
- **Separate slots.** `gods-intern.creative.save` and `.autosave`; Career keeps the
  original keys.

### Saves (version 4)
- **Additive migration.** v1, v2 and v3 saves upgrade; nothing is reset.
- **Persisted:** career XP and rank, unlocks, discoveries, active effects, terrain
  edits (replayed deterministically), the graveyard, possession, Heaven's mail,
  craters, mode and the new challenges.
- **Active effects** continue for their remaining time after loading.

### Production builds and test hooks
- **Dev builds only.** `window.__THREE_GAME_TEST_HOOKS__` (and the scene staging
  code) lives in `src/dev/TestHooks.ts`. It is imported only inside an
  `import.meta.env.DEV` branch, so production bundles do not contain it.
- **No URL switch.** No URL parameter can enable the hooks.
- **Checked.** `npm run check:prod` scans `dist/` and `dist-single/` for hook markers.

### CrazyGames
`src/platform/Platform.ts` implements the HTML5 SDK v3 lifecycle, checked against
docs.crazygames.com:
- `SDK.init()`, `game.loadingStart/Stop`, `gameplayStart/Stop` on menus and pauses, and
  a rate-limited `happytime()` on promotions and challenges.
- The SDK script loads only when the game is hosted on CrazyGames (or with
  `?platform=crazygames`). Calls are made only when `SDK.environment` is `crazygames`
  or `local`, so standalone play makes no external requests.
- No ads are implemented.
- `P` opens the menu because CrazyGames discourages relying on `Esc`.

## What's new in 0.5

### Interface (`src/ui/`)
- **HUD** (`HUD.ts`): Energy (current/max, refill timer, cost preview), Career,
  Approval and Chaos, each with a word as well as a number. Approval and Chaos explain
  themselves when clicked.
- **Navigation rail**: World, Career, Challenges and History, plus Help, Menu, Pause and
  Speed. One side panel at a time. Clicking the island closes the panel, and that click
  does nothing else. Labels collapse to icons on small screens.
- **Power dock** (`PowerToolbar.ts`): 7 slots (6 on narrow screens). Each slot shows icon,
  name and cost, plus its state in words ("Locked", "Need 20", "2.4s"). The targeting bar
  shows how to use the power, whether the target is valid, mode buttons and **Cancel**.
- **All Powers**: Creation, Weather, Destruction and Reality, each power with what it
  does, how to use it, its unlock requirement and progress, and its mastery goals. A
  "Put in dock" button assigns slots by mouse or touch. Combos stay secret.
- **World** (`VillagePanel.ts`):
  - a card per village with a plain-language headline ("Drizzleville is running out of
    food.");
  - happiness and prosperity, divine favor and dominant religion;
  - expandable resources; clicking a card flies there;
  - diplomacy in words, religion distribution, caravans.
- **Inspector** (`VillageInspector.ts`):
  - villagers: activity in plain words, mood, personality, religion, needs and memories,
    and "Follow with camera";
  - buildings, sacred objects and monuments (with their origin), villages, caravans
    (through their merchants) and disaster sites.
- **Prayers** (`PrayerPanel.ts`): two cards at most, the rest in an inbox. Each card says
  who asks, what they want, the suggested power, the reward (XP and energy) and the
  urgency.
- **Notifications** (`Notifications.ts`): three tiers. Critical stays longer; important
  is short; ambient is one quiet line. Repeats are grouped.
- **Main menu** (`MainMenu.ts`): over the living island, with Continue (only with a
  career save), New Career, Creative Mode and Settings. It asks before overwriting a
  career.
- **Onboarding** (`Tutorial.ts`): about 30 seconds, with no skip. Contextual tips
  (`Tips.ts`) appear once each and are listed under Help.
- **Settings**: Reduced motion and Camera shake are new. Unlimited energy and reduced
  cooldowns appear only in Creative Mode.

### Career rebalance (`src/career/`, `CONFIG.career`)
- Every XP source is in one table, `CONFIG.career.xp`, with the v0.4 values in comments.
  `docs/VERIFICATION.md` has the before/after table.
- First use of a power now gives +5 energy instead of XP. Challenges, discoveries,
  consequences and religions are worth less.
- Promotions refill energy, raise Approval and add the rank title.
- Mutation unlocks at the "probation review" (620 XP), or sooner with high Chaos.
- **Mastery** (`Mastery.ts`): 22 optional goals across the 13 powers, detected from
  existing events. Benevolent and chaotic goals are mixed.
- Thresholds are fitted to deterministic headless bots (`tests/progression/`).

### Saves (version 5)
v4 saves migrate without demotion. The rank and every unlocked power are kept, and XP is
raised to the new threshold of the rank already held. No promotion is replayed. Quick
slots grow from 6 to 7.

### Tests
- `tests/unit/progression.test.ts`: pacing bots and the v4 → v5 migration.
- `tests/progression/run.test.ts` (opt-in, `PROGRESSION=1`): 5-hour bot report.
- `tests/progression/stability.test.ts` (opt-in, `STABILITY=1`): 75-minute accelerated
  stability run.
- `tests/e2e/v05-visual.spec.ts`: the 20 verification screenshots, layout collision
  checks and the possession touch pad.
- `tests/e2e/v05-career.spec.ts`: real-time Career playthrough with no shortcuts.
