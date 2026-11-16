# ✝ Jesus Simulator — The Holy Open World Experience

A humorous, Roblox-inspired, GTA-style open-world sandbox set in first-century Galilee. Built with Three.js, Rapier 3D and Vite as plain JavaScript ES modules. **This release is single-player only.**

> Status: **Phases 1–3 are complete**: playable foundation, living world and miracles. Later phases (Romans, world expansion, missions, polish) are not implemented yet. See [Roadmap](#roadmap).

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5188
```

Production build + local preview (the build uses a relative base, so `dist/` works from any static host or iframe sub-path):

```bash
npm run build
npm run preview    # http://127.0.0.1:4188
```

Checks (need the preview server running):

```bash
npm run test:play      # real-input playtest: Phase 1 (movement, walls, stairs, discovery, pause, saves) + Phase 2 (NPCs, talk, collisions, knock-overs, pots, fruit, sheep errand, night)
npm run test:motion    # locomotion video + contact sheet
npm run verify:visual  # canvas inspector over the states in artifacts/evidence.json
```

If Playwright can't find a browser, point it at an installed Chromium with `CHROMIUM_PATH=/path/to/chromium`.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move (camera-relative) |
| Mouse (click the game to capture it) | Rotate camera · arrow keys also turn it |
| Shift | Sprint |
| Space | Jump (hold for higher) |
| E | Talk to villagers · interact with signs, the well, the olive press… |
| 1 / 2 / 3 (in a conversation) | Choose an answer · Esc leaves the conversation |
| Mouse wheel | Camera distance |
| Right mouse | Shoulder aim view |
| 1–6 | Select a miracle |
| Left mouse **or Q** | Cast the selected miracle (hold to keep lifting with Levitation; hold to keep multiplying) |
| F | Enter/exit vehicle (none yet) |
| Tab | Map |
| Esc | Pause menu |

## What Phase 3 adds — miracles

A `MiracleManager` owns unlocks, cooldowns, targeting, casting and ongoing effects, and publishes `miracle:cast`, `miracle:reveal` and `miracle:end` events. Each gift is **revealed by discovering a landmark**:

| Key | Miracle | Revealed at | What it does |
| --- | --- | --- | --- |
| 1 | **Divine Push** | Joseph & Son Carpentry | A cone of holy force (7.5 m) with distance and angle falloff. Strong hits topple villagers (they recover) and may bruise them. Props, fruit, bread and chickens fly; pots can break. +Chaos. |
| 2 | **Multiplication** | Nazareth Market | Aim at the bread or fish on the counters (or at a copy) to spawn copies that bounce, roll and collide; holding the button keeps going. Pooled with a **hard cap of 80** (the oldest is recycled with a poof) and a 60 s lifetime. Villagers cheer and fetch free bread (+Faith); a street drowning in bread raises Chaos. |
| 3 | **Water to Wine** | The Town Well | Aim at the well, the trough or a clay jar. The water turns deep red with a swirl of particles. Villagers react in three ways: some celebrate, some walk over curious, some shout for their friends, who come running. +Faith. The well runs clear again after a while. |
| 4 | **Walk on Water** | Shore of Galilee (new 8th landmark) | For 25 s a walkable surface appears over the open lake strip, with ripples at every step. Witnesses gasp (+Faith). If it runs out over deep water you sink and get fished out onto the dock. Without it you can wade into the shallows, but deep water pushes you back. |
| 5 | **Healing Touch** | The Synagogue | Heals injured villagers (Benjamin's old knee, a villager's sprained ankle, anyone bruised by your Push) with a golden column, cheering bystanders and +Faith (+5 for chronic ailments). Healthy people just say thanks. |
| 6 | **Holy Levitation** | Rooftop Lookout | Hold to lift a person or an object about 2.5 m and steer it gently with the crosshair (within 4 m). Release, or wait 7 s, and it is set down safely. Lifted villagers flail and shout "PUT ME DOWN!", then land dizzy. |

Supporting changes:
- **Lake shore:** the explorable area now includes the near shore of the Sea of Galilee, with a dock and a moored fishing boat.
- **Effects and sound:** a pooled VFX system (one particle draw call plus a ring pool), Jesus casting poses and halo glow, and procedural sounds for every miracle.
- **HUD:** a crosshair, a golden marker over the current target, the target or status line ("Heal: Benjamin (bad knee)"), and cooldown sweeps on each slot. Revealed gifts are saved.

## What Phase 2 adds — the living world

- **27 villagers** built from a lightweight blocky character kit. Each body part is one merged mesh with a shared face-atlas material, so a villager costs about 7 draw calls. Six facial expressions (neutral, smile, surprised, angry, talking, sleepy) are swapped through UVs; the mouth flaps while a villager speaks.
  - **Named characters:** Mary, Joseph, Eli the baker, Levi, Tobias, Rachel the potter, Dina, Naomi, Simon the fisherman, Old Hannah, Rabbi Ezra, Amos the shepherd, the kids Sami and Leah, and Yusuf the traveller.
  - **Others:** 10 villagers and 2 extra merchants.
- **Daily routines on a day/night clock:** a 10-minute day runs 06:00–20:00, followed by a short moonlit night.
  - **Merchants:** run their stalls and call out to passers-by.
  - **Joseph:** hammers at his workbench.
  - **Mary:** sweeps the yard and fetches water.
  - **Simon:** walks east toward the lake with his net, then delivers fish.
  - **Amos:** herds his flock.
  - **Ezra:** prays on the synagogue portico.
  - **The kids:** play tag in the square.
  - **Yusuf:** passes through the valley.
  - **In the evening and at night:** villagers sit on benches in the evening, then go home and step inside at night. The sun, sky, fog, stars and ambience follow the clock (crickets at night).
- **Navigation:** a waypoint graph of 272 nodes (roads, square, market aisle and every door, stall, bench and work spot). Every edge is verified with a Rapier capsule shape-cast, so paths don't cut through buildings, and routes use A*.
  - **Nearby villagers** (≤ 42 m) move with Rapier's character controller: they collide with walls, the player, each other and props, and push barrels and fruit.
  - **Distant villagers** follow their paths cheaply.
  - **Getting unstuck:** villagers sidestep first, then re-place themselves out of view if still stuck.
- **Reactions:**
  - They greet Jesus and turn their heads to follow him; the kids run over cheering "YESHUA!".
  - Passers-by stop to chat in pairs.
  - Bumping into someone gets a "Watch it!" as they step aside; **sprinting into someone knocks them flat** (+Chaos).
  - Breaking pottery startles bystanders and makes the potter furious.
- **Conversations:** press **E** near anyone. A dialogue panel offers 1–3 numbered answers, and the camera eases to an over-the-shoulder two-shot.
  - **What changes the lines:** time of day, your Chaos (people start to talk), and your progress. Villagers point you to the nearest undiscovered landmark with a compass direction.
  - **Kindness:** kind answers give a small one-time Faith reward.
  - **Speech bubbles:** world-space bubbles show barks, with a name tag on whoever you can talk to.
- **A small errand — "The Lost Sheep":** Amos asks you to find his runaway. She's on the Watchtower ridge; walk close and she follows you back to the flock (Faith +5).
- **Animals:** a flock of 6 sheep plus the stray, and 9 chickens that scatter, clucking, when you run past.
- **Market props:**
  - **Pottery:** clay pots shatter into pooled shards on hard impacts (+Chaos, merchant reacts).
  - **Fruit:** piles roll everywhere when you walk into them.
  - **Restocking:** disturbed props are quietly restocked after a while once you're far away, and still bodies are put to sleep.
- **Faith and Chaos:** both now move. Statistics show people met, pots broken and people knocked over.
- **Saving:** dialogue flags, people met and the time of day are saved and validated on load.
- **Audio:** villagers "speak" in pitched gibberish voices, and there are pot crashes, clucks, baas and night crickets — still all procedural.

## What Phase 1 contains

- **Main menu:** PLAY (or *PLAY — CONTINUE* with a save), a visibly disabled *MULTIPLAYER — COMING SOON* button with no network code behind it, SETTINGS and HOW TO PLAY. A slow orbit of the village plays behind it.
- **Jesus:** a procedural blocky character with long brown hair, a beard, a cream tunic, a red sash, leather sandals, a friendly face and a soft halo. A procedural rig drives idle breathing, walk, run lean, jump/fall poses, landing squash, and hair and sash sway.
- **Character controller:** Rapier kinematic character controller with a capsule. It has acceleration and deceleration, sprint, variable-height jump with coyote time and input buffering, autostep, slopes up to 48°, snap-to-ground, wall sliding, a soft valley boundary and fall recovery. It runs at a fixed 60 Hz with interpolated rendering.
- **Third-person camera:** mouse yaw/pitch, wheel zoom, and a shoulder aim view on right mouse. On obstruction it snaps in fast and eases back out; it ray-casts only against architecture and terrain, so thin trunks and props don't yank it. It never goes below the terrain, and its FOV widens while sprinting.
- **Nazareth:** a 500 × 500 m world (terrain, Sea of Galilee basin, perimeter hills) with the Nazareth valley open.
  - **Village:** about 55 limestone houses with painted shutters, roof beams, awnings, laundry lines, rooftop pergolas, and outdoor stairs up to walkable rooftops.
  - **Central sites:** the town square and well, a ten-stall market (fruit, bread, fish, pottery, fabric, spices), Joseph & Son Carpentry, and the synagogue.
  - **Outskirts:** the Rooftop Lookout, an olive grove with a stone press, and the old watchtower on the ridge.
  - **Living details:** about 40 dynamic barrels, crates and pots you can bump around. Countryside scatter is instanced (olives, cypress, bushes, rocks, grass); drifting stylised clouds, a gradient sky with sun glow and an animated lake complete the scene.
- **Playable loop — "Chapter I: Discover Nazareth":** find 7 landmarks, guided by minimap pins and an objective card with distance. Each one triggers a discovery banner and chime and autosaves; finding all seven completes the chapter.
- **HUD:** objective card with progress pips, Roman Attention stars (always 0 for now), a rotating minimap, region label, follower count, a 6-slot miracle hotbar (locked, with tooltips), interaction prompts and dialog, toasts, and an optional FPS counter.
- **Pause menu:** Resume · Map · Missions · Miracles · Statistics (Faith, Chaos, distance, jumps, props knocked over, time played) · Settings · Save & Quit. **TAB** opens the full valley map.
- **Audio:** all procedural Web Audio, with no audio files. Footsteps differ on sand and stone; there are jump and land sounds, a wind bed, market chatter that rises near the stalls, birdsong, a soft lyre-and-drone music loop, a discovery arpeggio, and UI sounds. Music and SFX volumes are separate.
- **Save:** LocalStorage stores position, discovered landmarks, Faith/Chaos, stats, unlocked miracles, missions and settings. Saves are validated on load; a corrupted save is quarantined and the player starts fresh with a notice.
- **Browser and CrazyGames readiness:**
  - Responsive canvas and resize handling.
  - Pauses on pointer-lock loss and tab hide.
  - Loading screen with progress, plus a friendly error screen.
  - Low/Medium/High quality presets with automatic downgrade when FPS stays under 38.
  - No external network requests; relative-base production build.

## Project structure

```
src/
  main.js                 boot + error screen
  core/                   EventBus, Input (intents), Loop (fixed 60 Hz + interpolation), Renderer, rng
  game/                   GameSession (systems + update order + test hooks), PlayerState, WorldState, miracles
  player/                 PlayerController (Rapier KCC), JesusModel (procedural rig), ThirdPersonCamera
  physics/PhysicsWorld.js Rapier world, static/dynamic bodies, ray casts
  world/                  layout (authoritative positions), terrain, Nazareth builder, vegetation, Sky, World, materials, textures, geometry batcher
  ui/                     UI (menus, HUD, pause, sheets, conversation, speech bubbles), Minimap + world map, icons
  npc/                    CharacterKit (NPC models + animator), NavGraph (A*), NPCManager (routines, reactions, LOD), roster, dialogue, Animals
  audio/AudioManager.js   procedural Web Audio
  save/SaveManager.js     LocalStorage + validation
tests/                    playtest.mjs, motion.mjs (Playwright, real input)
scripts/                  inspect-threejs-canvas.mjs (canvas/pixel/budget inspector)
artifacts/                evidence manifest, captures, playtest results, final-evidence.md
```

### Multiplayer-ready architecture (no networking yet)

- **State is separate from simulation:** `PlayerState` and `WorldState` hold pure data; controllers write it and the UI and save read it.
- **Stable IDs:** the player, landmarks, props and interactables all have them (e.g. `player.local`, `landmark.town-well`, `prop.barrel.03`).
- **Event bus:** gameplay publishes namespaced events such as `player:move`, `player:jump`, `landmark:discover`, `object:interact`, `prop:disturbed`, `mission:complete` and `session:*`. A future network layer can subscribe to the same stream.
- **Intent-driven input:** systems read intents, never DOM events, so input could come from a network or a replay.
- **Session-owned systems:** `GameSession` owns the systems and their update order, so it can later host more than one `PlayerState`.

## Known limitations (Phase 1)

- **Content not built yet:** no Roman AI, vehicles, followers or the full mission framework. Their HUD slots and menu entries say plainly that they're not yet revealed or coming in a later chapter, and nothing fakes them. The lost-sheep errand is a single scripted good deed, not the Phase 6 mission system.
- **Knock-overs are animated, not simulated:** a toppled villager falls over and gets back up through the animation rig. True ragdolls arrive with Phase 4.
- **Night is brief:** about 84 seconds. Villagers vanish indoors rather than performing evening activities inside houses.
- **Partial map:** only the Nazareth valley (radius 135 m) and the near strip of the lake are playable. The outpost, desert, countryside and the far lake are scenery beyond a soft boundary.
- **No miracle upgrades yet:** upgrades and follower recruitment from healing are planned for Phase 6. Healed villagers are already recorded in the save.
- **Large Rapier bundle:** about 1.7 MB gzipped, because the `-compat` build inlines its WASM. Switching to the non-compat package with a separate `.wasm` file would cut this.
- **Performance unmeasured on a real GPU:** all automated captures ran on a software renderer, so FPS numbers from them aren't meaningful. Desktop render budgets pass; the mobile triangle budget is exceeded (≈340k vs 300k), and mobile is not a target for this release.
- **Camera passes through foliage:** the camera ignores tree trunks for collision, so it can pass through canopies. Occluder fading is planned for the polish phase.
- **No real ragdolls yet:** props are rigid bodies; character ragdolls come with Phase 4.

## Roadmap

1. ~~Phase 1 — Playable foundation~~ ✅
2. ~~Phase 2 — Living world~~ ✅
3. ~~Phase 3 — Miracles~~ ✅
4. **Phase 4 — Roman system** *(next)*: patrols, line of sight, Roman Attention, capture/respawn, ragdolls.
5. Phase 5 — World expansion (countryside, lake, outpost, desert, vehicles, animals).
6. Phase 6 — Missions, Faith/Chaos, followers, full save.
7. Phase 7 — Polish, audio, optimisation, CrazyGames SDK integration.

All models, textures and sounds are original and generated procedurally at runtime. No third-party or Roblox assets are used.
