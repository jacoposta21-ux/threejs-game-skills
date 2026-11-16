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

## Next actions (Phase 4 — Roman system)
- **Soldier model:** a Roman soldier built on CharacterKit (helmet, scutum and armour parts) with patrol routes on the NavGraph around a north outpost. Open the north road strip, the same way the lake strip was opened.
- **Perception:** ray-cast line of sight against static colliders, plus last-known-position tracking.
- **Roman Attention:** feed from `npc:knocked`, `miracle:cast` (Push and Levitation on soldiers), restricted zones and stolen vehicles (Phase 5). The HUD stars already exist.
- **Ragdolls:** replace the animated stumble with Rapier multi-body ragdolls for soldiers (the villager stumble can stay).
- **Capture and respawn:** design to be decided.
