# Jesus Simulator — progress log

## Intent and constraints
- Complete Jesus Simulator for CrazyGames, built incrementally phase by phase. This pass covers **Phase 1 only**.
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

## Next actions (Phase 3 — Miracles)
- **MiracleManager:** cooldowns, targeting, events (`miracle:cast`) and HUD hooks — the hotbar slots already exist.
- **Divine Push:** use NPCs' stumble state and PropSystem bodies.
- **Multiplication:** pooled bread/fish bodies reuse the shard-pool pattern.
- **Water to Wine:** target the well, trough and jars (`spot:well`, `spot:trough` anchors exist).
- **Healing Touch and Levitation:** need NPC "injured" states and a lift constraint.
- **Walk on Water:** needs the lake region opened.
