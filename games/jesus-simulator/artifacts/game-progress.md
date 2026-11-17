# Jesus Simulator — progress log

## Intent and constraints
- Complete Jesus Simulator for CrazyGames, built incrementally phase by phase. Phases 1–6 are done; the current pass is Phase 6 (missions, followers, Faith/Chaos, Blessings, full save).
- JavaScript ES modules (the user asked for JS, overriding the pack's TS default), Three.js, Rapier 3D, Vite, Web Audio, LocalStorage.
- Single-player only; MULTIPLAYER is a visibly disabled "COMING SOON" button with no networking.
- Tone: playful and absurd, never deliberately offensive. Roblox-inspired but original art; procedural geometry is acceptable for Phase 1.
- Desktop browsers first; responsive layout. Mobile input is not a target yet.

## Design brief (Phase 1 slice)
- **Player promise:** wander your blocky, sun-baked home village as Jesus and get to know every corner, before the miracles and the chaos arrive.
- **Primary verb:** explore (walk, sprint, jump, climb stairs to rooftops). **Secondary:** inspect (E), read the map.
- **5–30 s repeat:** pick the nearest unknown pin → travel → discovery banner and chime.
- **1–5 min change:** the map fills in, routes rise from street level to rooftops and the ridge, and the region label changes.
- **Reward:** discovery banner, minimap pin turns gold, objective progress, autosave. Finding all seven completes Chapter I.
- **Risk/pressure:** none by design in Phase 1 (no Romans yet); traversal is the challenge.
- **Non-goals for this slice:** NPCs, miracles, Romans, vehicles, missions beyond exploration.

## Core loop contract
Player **explores** to **discover the 7 landmarks of Nazareth**; the minimap and objective card point to the nearest one. Success gives a banner, a chime, progress and an autosave. Falling off something costs only time (recovery teleport if out of the world).

## Level plan (Nazareth valley)
- **Start:** in front of Joseph & Son Carpentry, facing the square. The first landmark is about 9 m away, so the first reward comes within seconds.
- **Ring 1:** well and town square (centre), market just north.
- **Ring 2:** synagogue to the east, Rooftop Lookout north-west. The lookout is the first vertical challenge: climb the outdoor stairs.
- **Outskirts:** olive grove and press to the south-east, old watchtower on the north-west ridge.
- **Landmarks visible from far away:** watchtower, palms, cypress pairs, laundry flags.
- **Boundary:** soft radius of 135 m with a toast; the regions beyond are scenery for later phases.

## Completed (Phase 1)
- Project setup, renderer, lighting/shadows, sky, fog, quality presets with automatic downgrade.
- Procedural Jesus model with a locomotion rig; Rapier character controller; third-person camera.
- Terrain, lake, Nazareth village builder (batched into a few draw calls), instanced countryside, ~40 dynamic props.
- Main menu, settings, how-to, HUD, minimap, world map, pause menu (all tabs), interaction dialogs.
- Procedural audio; LocalStorage save with validation and corrupt-save quarantine.
- Event bus, stable IDs, intent input, state/controller split (multiplayer-ready, no networking).
- Evidence: canvas inspector (phase1-pass-4), real-input playtest (13/13), motion capture.

## Defects found and fixed in this pass
- The stairs couldn't be climbed. A velocity clamp in the controller collapsed speed on slopes; it was replaced with wall-normal projection.
- The TAB key closed the map and then immediately reopened it (both handlers saw the same press).
- Holding forward on a stair's top landing walked the player off the edge; safety walls were added.
- The camera collapsed onto the player when a palm trunk passed behind; it now ignores cylinders and dynamic props.
- The menu title was clipped; the hotbar overflowed at phone width.
- Vegetation triangle cost was cut from ~520k to ~280k per frame.

## Phase 2 — Living world (completed)
- **NPC kit:** a CharacterKit with merged parts, a face atlas and 6 expressions, plus a procedural animator (walk, talk, wave, hammer, sell, sweep, draw water, pray, sit, cheer, startle, angry, stumble).
- **Cast:** a roster of 27 people (13 named characters, 10 villagers, 2 extra merchants) with homes and daily routines on a 10-minute day/night clock.
- **Navigation:** a NavGraph built from roads, the square, the aisle and every anchor, with shape-cast-verified edges and A* paths.
- **Movement:** NPCs use Rapier's KCC near the player and cheap path-following further away, and unstick themselves when blocked.
- **Reactions:** greeting, head tracking, bumping, knock-overs, startle and anger at broken pots, pair chats, kids playing tag and cheering for Jesus.
- **Conversations:** branching dialogue with numbered options, flags and one-time Faith rewards, landmark hints with compass directions, and an over-the-shoulder camera.
- **Errand:** the "lost sheep" errand (Amos) — a scripted good deed, not the Phase 6 mission framework.
- **Animals:** sheep (a flock and a stray) and chickens.
- **Props:** a PropSystem with breakable pots, a shard pool, rollable fruit piles and quiet restocking.
- **World and progression:** a DayCycle drives sun/moon, sky, fog and stars, with crickets at night. Faith and Chaos now move, and saves include flags, people met and the clock.
- **Evidence:** `phase2-pass-3` — inspector 8/8, playtest 22/22, motion sheets for the player and NPCs.

## Phase 3 — Miracles (completed)
- **MiracleManager** (`src/miracles/`): unlocks, cooldowns, crosshair-ray targeting with a "close and in front" fallback, a target marker, casting, ongoing effects, and the events `miracle:cast`, `miracle:reveal`, `miracle:end` and `miracle:witnessed`.
- **The six miracles:** Divine Push (cone with falloff, knock-backs, bruising, prop impulses), Multiplication (pooled copies, cap 80, 60 s lifetime, villagers fetch bread), Water to Wine (well, trough, jars; three villager reaction types plus calling friends), Walk on Water (lake collider toggled, ripples, sinking on expiry, wading limits), Healing Touch (injured, chronic and bruised villagers) and Holy Levitation (hold to lift people or props, safe set-down).
- **Reveals:** each gift is revealed by discovering its landmark. A new 8th landmark, the Shore of Galilee, comes with a dock, a boat and the open lake strip.
- **Effects and feedback:** an Effects VFX pool (900 particles in one draw call, plus 14 rings), Jesus casting poses and halo glow, six procedural miracle sounds, and a HUD with cooldown sweeps and target labels. Q is the keyboard cast key.
- **Defects found by tests and fixed:**
  - Web Audio threw on zero-gain sounds (a distant pot shattering could throw inside an event handler).
  - Wading could creep into deep water.
  - Casting Walk on Water while submerged left Jesus on the lake bed.
  - Kids kept a stale travel phase at dawn (null-step crash).
  - Well-water spots were registered as nav anchors.
  - An NPC home was unreachable; homes are now reassigned to reachable doors.

## Phase 4 — Roman system (completed)
- **Roman checkpoint** (`src/world/RomanCheckpoint.js`): a palisade camp on the north road at (16, -108) on a flattened terrain pad. It has a gate, a lookout tower, tents, a command tent, a campfire with a flickering flame, a waving SPQR standard, a weapon rack, and a road barrier with a guard booth. The compound is a restricted zone (`inRestrictedZone`). It is shown on the minimap and the world map.
- **Legionary look:** a CharacterKit extension adds a galea helmet with crest, lorica bands, pauldrons, a scutum, a pilum, pteruges and a gladius; the centurion gets a transverse crest, medals and a cape. All of it is merged into the existing part meshes, so a soldier still costs 7 draw calls. New actions: guard, grab, point, salute, drink, search, plus a soldier carry stance.
- **RagdollSystem** (`src/physics/Ragdoll.js`): 7 dynamic boxes with spherical joints per character. Ragdoll parts use a collision group so they never collide with each other, only with the world, props and characters.
  - The parts are re-parented to a scene container while simulating, and the hierarchy is restored exactly afterwards.
  - It detects when a ragdoll has settled, and a stand-up spot finder places the character back on the ground or the nearest nav node.
  - At most 8 ragdolls run at once. Used for soldiers (any Divine Push hit) and villagers (strong hits).
- **RomanManager** (`src/roman/`): 8 garrison soldiers (two patrol routes plus a patrol pair, a road guard, a gate guard, a tower lookout and the centurion) and 6 reserves.
  - **Perception:** a view cone with a head sweep, Rapier line-of-sight rays against fixed non-cylinder colliders, peripheral notice within 3.5 m, and reduced range at night.
  - **Crimes:** only crimes a soldier witnessed count. Loud crimes nobody saw bring soldiers to investigate, and villagers may call the guard.
  - **Pursuit:** soldiers lead the target, steer straight when a shape cast is clear and follow A* otherwise. They search around the last known position and stop at the waterline.
  - **Escalation:** at 2★ the horn sounds and soldiers within 95 m join; reinforcements spawn out of view (2/4/6 at 3/4/5★); the centurion joins at 4★.
  - **Seizing and arrest:** a grab meter slows the player and can be broken with a push. A full meter means arrest: an ARRESTED card, a Faith fine and release at the checkpoint 3 hours later.
  - **Miracles on soldiers:** Heal gives −1★ once per hunt and makes the soldier friendly; Wine distracts nearby soldiers for 9 s; Levitate works on soldiers but is a crime.
  - **Dialogue:** soldier and centurion dialogue trees, and Roman barks.
- **RomanAttention:** a pure heat model with a crime table, `stars = floor(heat)`, and lose time of 6 s + 3 s per star. It is never saved; arrests, escapes, toppled soldiers and the highest star level are saved.
- **HUD and audio:**
  - The attention pill turns red when wanted, the stars flash while searching, and a search bar runs down.
  - A SEIZED bar, red view cones on the minimap and "!" / "?" alert bubbles.
  - Procedural cornu horn, armour clank, pursuit drums by star level, an arrest sting and an escape chord.
- **Tests:** phase 1–3 checks run with the garrison off duty (`romans.setActive(false)`); `tests/phase4-checks.mjs` adds 14 real-input checks; `tests/roman-motion.mjs` produces a chase and ragdoll contact sheet.

## Phase 5 — World expansion and rides (completed)
- **Open map:** the whole 408 m square (`PLAY_HALF` 204, square boundary with `boundaryNormal`). Terrain pads flatten each new site, with dunes south of z 118, a 9 m Goat Hill and a lake island. The whole lake gets a walk-on-water collider; the oasis pond counts as water (wading and water depth).
- **Chapter II "Explore Galilee":** 8 new places, two per region (`chapter: 2` in `LANDMARKS`, plus `CHAPTER_ONE` / `CHAPTER_TWO`). `WorldState` counts per chapter and emits `mission:complete` for `mission.explore-galilee`. The objective card switches chapters and shows the compass direction of the nearest place.
- **Sites** (`src/world/Regions.js`), batched into 4 regional meshes for culling and the geometry budget:
  - Countryside: the farmstead (walls, farmhouse, stable shed, threshing floor, vineyard, goat pen, instanced wheat fields) and Goat Hill.
  - Lake: the Fishers' Hamlet (huts, jetty, boats, nets) and the Lonely Isle.
  - North: Castra Galilaea (stone fort, restricted) and the Little Circus.
  - South: the Palm Oasis (pond = a water-to-wine target), the Caravan Camp, and a desert arch and mesas.
- **Rides** (`src/vehicles/`): a `VehicleManager` with 10 rides — 2 donkeys, a farm horse, 2 legion horses, 2 carts, 2 chariots and a camel. Each is a kinematic cuboid moved by its own Rapier KCC with arcade gaits, steering, a hop, water refusal, the map edge, slope tilt, a gait animation, and return-home when abandoned.
  - **Events:** `vehicle:enter`, `vehicle:exit`, `vehicle:hit`, `vehicle:step`, `vehicle:refuse`, `circuit:start`, `circuit:lap` and `circuit:abort`.
  - **Rider:** the Jesus model has straddle, sit and stand riding poses.
  - **Camera:** a mount pull-back and auto-follow.
  - **Circus laps:** quadrant visits plus crossing the start line; the best lap is saved.
- **Crimes:** `trample` (0.7), `horsetheft` (1.3, at least 1★) and `chariot` (2.2, at least 2★) are added to `CRIMES`. A legionary seeing you on Roman property is a crime once per ride. Being grabbed while mounted drags you off; riding into a soldier ragdolls him (assault).
- **Wildlife:** goats (pen and hill), camels (resting and a 3-camel caravan loop), plus `Wildlife.js`: 25 flock birds and 8 town-square pigeons in one InstancedMesh with shader flapping, and leaping fish (one InstancedMesh, `fish:jump`).
- **UI and save:**
  - Minimap and world map over all of Galilee (EXTENT 212, region names, ride triangles), an F ride prompt and a riding panel.
  - Missions tab split by chapter; ride stats in Statistics.
  - `SAVE_EXTENT` raised to 240; new stats `rides`, `ridden`, `chariotsStolen`, `laps` and `bestLap`.
- **Performance:**
  - The Jesus model's static parts are merged per pivot and material (39 → 24 geometries).
  - Mount geometries are cached and shared.
  - Rides are hidden beyond 140 m and drop shadows beyond 45 m.
- **Tests:** `tests/phase5-checks.mjs` (14 checks; real F/W/Shift/D/Q input plus the test autopilot for the lap) and `tests/ride-motion.mjs` (contact sheet). The Phase 4 garrison count is now 12.

## Phase 6 — The Ministry (completed)
- **Missions** (`src/missions/`): a `MissionManager` with available, active and done states, steps, progress, a tracked mission, markers and dialogue offers; it emits `mission:accepted`, `mission:step`, `mission:progress` and `mission:done`. `missions.js` holds 6 missions: wedding, fishers, donkey, caravan, centurion and the legacy sheep errand.
  - **Step kinds:** talk, reach (optionally on water, or to a ride), ride, miracle (on a target or an NPC) and counted events.
- **Dialogue:** `DialogueController.getExtras` puts mission offers, talk steps, the follow invite and follower orders in front of any NPC's own options.
- **Posted folk:** `postedFolk()` in the roster adds Bartholomew, Hiram, 6 hungry travellers (the bread witness serves one loaf each), Philo (fever) and Nathan the groom. Posted people skip routines and night-time hiding and walk back to their post.
- **Centurion:** Gaius is *summoned* to the camp gate when Yeshua approaches with his mission available or due, so it can start without trespassing. The `pass.outpost` flag makes the fort non-restricted (`zoneAccess`).
- **Wedding feast:** `buildWedding` places a canopy, table, benches and six stone jars (an InstancedMesh water target `water.wedding`) at `WEDDING` (15.5, 9.5).
- **Followers:** `NPCManager.recruit`, `followPlayer` (formation behind a damped yaw; catch-up teleport when more than 40 m away and out of view) and `setFollowersWaiting` (G). Followers come from missions, healing chronic injuries and invites at Faith 25+, up to 12.
- **Reputation** (`game/reputation.js`):
  - Faith titles come from the lifetime `faithEarned`.
  - Chaos tiers: restless (12+) means wary greetings; notorious (30+) means villagers back away (`npc:avoid`) and Roman `sightScale` ×1.2.
  - Chaos fades by 0.5 per minute; healing −1, missions −2 or −3. Followers add +1 Faith per 90 s each (fixed step).
- **Blessings:** `MiracleManager.levels` gives −20% cooldown per level plus each miracle's own effect (push reach, loaves per cast, wine duration, water time, area heal, levitation range). They are bought in Pause → Miracles (`ui:bless`).
- **Save v2:** `ministry`, `followers`, `miracleLevels`, parked `vehicles`, and the new stats `missions`, `followersEver`, `blessings` and `faithEarned`. v1 saves still load.
- **UI:** a reputation pill, quest bubbles (`!` / ★), mission and giver markers on the minimap and world map, the journal (Chapter III first) and Blessing buttons.

## Next actions (Phase 7 — polish, audio, optimisation, CrazyGames SDK)
- **CrazyGames SDK** integration (loading events, gameplay start/stop, ads only through the SDK, no fake ads), plus a build size pass (Rapier non-compat build).
- **Performance on real GPUs:** LOD for far characters, shadow cascades, a quality auto-tune.
- **Audio polish and music per region;** occluder fading for the camera.
- **Mobile/touch controls** if wanted.
