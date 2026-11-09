# VISTA MAR — Handoff for the next Claude Code session

> Read this first. It covers everything you need to keep developing the game
> exactly where the previous session left off.

## 1. What it is
A third-person open-world browser game, inspired by GTA (but with an **original** city, characters and names), set in **Vista Mar**, a coastal city with a Miami/80s vibe. Built with **Three.js r0.184 + Vite + plain JavaScript (ES modules)**, no backend. It also ships as **a single offline HTML file** (all models embedded).

The user is Italian: **reply in Italian**. All in-game text is in **English** (requested; multiple languages planned later through `src/i18n/strings.js`). Required style: **clean** (no blood: hits show white sparks), and **non-explicit** strip club (dancers in stage costumes, no nudity).

The user tests on an **AMD Radeon iGPU laptop (ANGLE / D3D11)**: the bottleneck is **CPU render submission (draw calls)**. Every new feature must keep draw calls under control (current numbers in §7). With the Low preset they run at ~60 fps, auto tier L3.

## 2. How to start it
```bash
cd games/vista-mar        # (in the zip: the project root)
npm install
npm run dev               # http://127.0.0.1:5188
npm run build:single      # -> dist-single/index.html (a single ~6.4 MB file, works by double-clicking)
```
Useful URL parameters: `?quality=low|medium|high&autoperf=0`.
The latest playable build is in `artifacts/VistaMar-Fase8.html`.

Repo: GitHub `jacoposta21-ux/threejs-game-skills`, branch `claude/zen-curie-lxpnlp`, folder `games/vista-mar`. The repo also contains workflow "skills" for Three.js (`skills/threejs-game-director/SKILL.md` etc.: read the `AGENTS.md` at the repo root if you have the full repo).

## 3. Controls (current)
WASD move · mouse camera · Shift sprint · Space jump · C crouch · Q toggle walk/run · **E interact / enter-exit car / shops** · LMB punch (combo) / bat / fire · RMB kick (bare hands) or hold to aim · V kick · R reload · 1-6 / Tab weapons · B bribe the cops (Officer Haskins) · M map (wheel/+- zoom, drag, click = GPS, right click = clear) · Esc pause · in car: W/S, A/D, Space handbrake, L lights, H horn/siren · helicopter: Space up, Shift down, W/S tilt, A/D turn · plane: W/S throttle, A/D bank, Space pitch up (takeoff > 110 km/h), Shift nose down.

## 4. Architecture (src/)
- `core/Game.js` — main loop, states (`loading|ready|playing|paused|map|shop|minigame`), init + **full warm-up before Play** (street prefill, `compileAsync` with all hidden objects temporarily visible, test frames), automatic performance tiers `PERF_TIERS` (resolution/MSAA/bloom/shadows; tiers 4-5 and the Low preset use **direct render** without the composer), save/load (`localStorage` `vistamar.save`, v2: money, tapes, missions, combat, economy), waypoint/GPS (`places()`, `setWaypoint()`), **test hooks** `window.__THREE_GAME_TEST_HOOKS__` (`setState`, `simulate(seconds, keys, taps)` at fixed 60 Hz, `teleport`, `callBreakdown`…) and `window.__game`.
- `core/InputManager.js` — keyboard + mouse (mouse buttons are `Mouse0`/`Mouse2` in `keys`), pointer lock with a drag-look fallback.
- `core/AssetLoader.js` — `MANIFEST` of the loaded models (only these get embedded in the single-file build). Models are **meshopt**-compressed (`npx @gltf-transform/cli meshopt in.glb out.glb`).
- `world/CityGenerator.js` — procedural city: 8x8 block grid (`LINES` = -400..400 in steps of 100), districts, buildings, roads, airport (north, z −480…−680), Club Velvet (block 6,4), shop facades (`storefront()`), parked cars (617 props, `parkedNear`/`takeParked`), boundaries. Geometry merged by (chunk, material) via `GeoBuilder`; **texture atlases** (`world/Atlas.js`: atlasB buildings 5x4, atlasG ground 4x3) to cut draw calls; far LOD for buildings beyond 170 m; vegetation/lamps/cars instanced via `ChunkedLod` (`world/Batches.js`, InstancedMesh per 200 m chunk, `hide(item)`).
- `world/Layout.js` — layout data: `LINES`, road widths, `classify(x,z)`, `terrainHeight`, `SPECIAL` blocks, `AIRPORT`, `BOUNDS`.
- `world/World.js` (sky, sun, day/night, ocean, night lights), `world/Effects.js` (wind, car paint, seagulls, flare, skid marks, grade pass), `world/textures.js` (procedural canvas textures).
- `world/Interiors.js` — **walk-in interiors** (Sunline Arms, Threads & Co., Club Velvet) built **at y=600 above their own door** (same x/z, so radar/GPS keep working). Collision boxes support a **bottom** (`addBox(..., bottom)`) so they don't block the streets. Self-lit materials, `fog:false`, no extra lights. Fade + teleport on `enter(id)` / `leave()`. While inside, street interactions are disabled (`game.interior`).
- `player/PlayerController.js` + `player/CharacterRig.js` — Quaternius character with **runtime retargeting** of the Universal Animation Library clips (world-space deltas against reference poses). **Upper-body layer** (`playUpper`) driven by a second hidden mannequin (needed because the pistol clips rotate the whole skeleton). `rotateBoneWorld` for procedural poses (kick, aim pitch). `setOutfit(gltf)` rebuilds the rig.
- `player/Outfit.js` — **clothing by parts**: keeps the player's head (M_Beach) and swaps the `_Body/_Legs/_Feet` groups from other outfits (`composeOutfit`). 18 items in `CLOTHES`.
- `combat/Weapons.js` (fists, bat, pistol, smg, shotgun, rpg + procedural meshes), `combat/CombatSystem.js` (inventory, melee with soft lock, aiming from the camera ray, tracers, impact puffs, physical rockets + chained explosions, pickups, `enemyFire`, vehicle damage, armor).
- `npc/NPCSystem.js` — pedestrians: sidewalk graph, states (WALKING, WAITING, CROSSING, FLEEING, INTERACTING, KNOCKED, **DOWN** permanent, FIGHT, COMBAT, ACTOR), health, `hurt/down/blast/panic`, **combatants** (`spawnCombatant('cop'|'thug'|'guard'|'boss'|…)` with pistols/smg), **actors** (`spawnActor`, dancers/mission contacts), recoloured variants (`VARIANTS`, including `dancerA/B/C`). Clips pre-baked per outfit (`AnimBaker.js`), each NPC merged into **1 SkinnedMesh** with vertex colours. Fixed bug: DOWN NPCs must never go through `move()` (they would stand back up).
- `traffic/TrafficSystem.js` — AI traffic (lanes, traffic lights, turns), InstancedMesh per model, `toVehicle()` turns a car into a physical one (crash / carjack / shots).
- `vehicles/Vehicle.js` (arcade car physics, damage, lights, **fuel**, `locked/lockable`), `VehicleSystem.js` (spawns, recycling of far-away cars, owned car, aircraft), `VehicleTypes.js` (incl. `speedster` = Kenney race), `VehicleController.js` (**E** to enter/exit, `beginEnter` = walk to the door + `Sitting_Enter`, flight input), `Aircraft.js` (procedural helicopter + plane with arcade flight models, Vehicle-compatible interface).
- `systems/PoliceSystem.js` — 5 stars, routed units (RoadGraph BFS), line of sight, search area, roadblocks at 4★, officers on foot (`deploy`), shooting from cars at 3★+, busted/wasted. Crime events: `pedestrianHit`, `pedestrianAttacked`, `shotsFired`, `carjack`, `carStolen` (+1★ always), `carAlarm`, `vehicleDestroyed`, `enterVehicle` (police car / aircraft).
- `systems/Economy.js` — weapon shop, clothes shop (try-on preview), Vista Customs (engine, armor, underglow, garage car), properties with income at 08:00 (`PROPERTIES`: condo, cabs, spray, club, hangar), club, bar, VIP, bribes. Interior markers (`interior: 'guns'|'clothes'|'club'`).
- `systems/Locations.js` — safehouse, gas stations (fuel + repair menu, 3 locations), Spray & Go, food carts. `systems/CollisionSystem.js` (AABB boxes with top/bottom + cylinders, spatial hash, `raycast`), `systems/RoadGraph.js`, `systems/MissionSystem.js` (Lost Tapes collectibles).
- `missions/MissionManager.js` (step contract `{text, enter, update -> 'next'|{fail}, target, timer}`, intro cutscenes, contact NPCs at the markers), `missions/missions.js` (M01-M02), `missions/story.js` (M03-M08, the Victor Kane arc), `missions/AIDrive.js` (AI driving along the streets), `i18n/strings.js` (all story text).
- `ui/HUD.js`, `ui/Minimap.js` (radar + big map with zoom/pan), `ui/Menus.js` (start, pause, settings, map list), `ui/Overlays.js` (`Cutscene` with optional MP4 support via `def.video`, `ShopMenu` with a "Leave" item, `Lockpick`).
- `audio/AudioManager.js` — **procedural** Web Audio (no audio files).

## 5. Story and content
- Story: Leo vs **Victor Kane** (developer/crime boss). Characters: Rico Alvarez, Dana Reyes, Officer Haskins. Missions M01 The Delivery, M02 Joyride, M03 Neon Mile Manners, M04 Paper Trail, M05 Dockside, M06 Wrong Deliveries, M07 High Ground (helicopter), M08 Last Call (finale). All verified as completable.
- Locations: start at Palm Boulevard (28,−15.4) · Sunline Arms (−150,−15.2) · Threads & Co. (−50,−209.5) · Vista Customs (−195.5,−64, by car) · Club Velvet door (285.5,62) · airport (north, z<−470) · police HQ (109,−60) · hospital (93,150).
- CC0 assets: Quaternius (characters, UAL animations, palms, street lights) and Kenney Car Kit. Licences in `public/assets/LICENSES.md`.

## 6. Testing (important)
The cloud container has no GPU: headless Chromium runs on SwiftShader at 1-4 fps, so **you can't measure real FPS**; ask the user for the "Show FPS" line (settings) on their PC. Tests use Playwright + `simulate()`:
```js
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
// page.goto('http://127.0.0.1:5188/?quality=low&autoperf=0'); wait for #play to be visible
// window.__THREE_GAME_TEST_HOOKS__.setState('explore-day'); H.simulate(2, ['KeyW'], ['KeyE']);
```
Note: effects delayed with `setTimeout` (explosions on cars, shop/interior fades) don't run inside a synchronous `simulate`: wait with real time. Useful states: `explore-day|explore-golden|explore-night|downtown-day|neon-night|beach-sunset|residential-day|industrial-day|drive-golden|drive-night|wanted-3|mission-01|map|pause`.

## 7. Performance reference (Low preset, SwiftShader, after Phase 8)
draw calls: boulevard ~356, downtown ~170, beach ~83 (shadows included). Don't let them grow: prefer merged or instanced geometry, shared materials, and objects hidden when far away. On the user's PC (AMD iGPU): ~60 fps at L3, cpu render ~7 ms.

## 8. History of user requests (all done)
Phases 1-5 (base, vehicles, living city, wanted/missions/economy base, visual polish) · Step 1 performance (atlases, instancing, auto tiers, direct render) · Phase 6 combat + story + economy + Club Velvet + airport · Phase 7 interiors, clothes by parts, rocket launcher, Speedster, lockpicking parked cars, map with navigator, NPC-standing-up bug and bus-stops-in-the-road bug · Phase 8: full warm-up before Play, shop facades, map-only zoom, natural bat grip, Leave shop item (and mouse not lost), clothes try-on, walk-mode reset, night roofs (atlas tile shared between roof and walls in the same bucket — fixed in `GeoBuilder.gable`), E for cars + entry animation, dancers in costume, fuel + 3 gas stations, every car locked (lockpick + 1★).

## 9. Ideas / possible next steps (not yet requested as a priority)
- Optional MP4 cutscenes (`def.video` in mission defs, file next to the HTML).
- More languages (Italian) using the structure of `i18n/strings.js` (the UI/HUD still has hardcoded English text to migrate).
- Real street supercar (needs a CC0 model; at the moment the Speedster is an open-wheel race car).
- Car door/exit animation (only the entry is animated), more interiors (safehouse), radio, motorcycles.
- `artifacts/game-progress.md` holds the detailed per-phase log: keep updating it.

## 10. Working rules learned with this user
- They want frequent playable versions: after every batch, **build the single-file HTML** and hand it over (named e.g. `VistaMar-Fase9.html`).
- Don't sacrifice visual quality for performance without saying so; always check before/after with screenshots.
- Before adding content, check that it doesn't overlap streets/buildings (bus stops and palms caused bugs).
- Commit and push on branch `claude/zen-curie-lxpnlp` after every phase.
