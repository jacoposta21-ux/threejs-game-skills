# ✝ Jesus Simulator — The Holy Open World Experience

A humorous, Roblox-inspired, GTA-style open-world sandbox set in first-century Galilee. Built with Three.js, Rapier 3D and Vite as plain JavaScript ES modules. **This release is single-player only.**

> Status: **Phase 1 — Playable Foundation** is complete. Later phases (NPCs, miracles, Romans, world expansion, missions, polish) are not implemented yet. See [Roadmap](#roadmap).

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
npm run test:play      # real-input playtest: movement, walls, stairs, discovery, E, pause, save/continue, corrupt save
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
| E | Interact with signs, the well, the olive press… |
| Mouse wheel | Camera distance |
| Right mouse | Shoulder aim view |
| Left mouse / 1–6 | Use / select miracle (all locked in Phase 1) |
| F | Enter/exit vehicle (none yet) |
| Tab | Map |
| Esc | Pause menu |

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
  ui/                     UI (menus, HUD, pause, sheets), Minimap + world map, icons
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

- **Content not built yet:** no NPCs, animals, miracles, Roman AI, vehicles, followers or villager missions. Their HUD slots and menu entries say plainly that they're not yet revealed or coming in a later chapter, and nothing fakes them.
- **Partial map:** only the Nazareth valley is playable (radius 135 m). The lake, outpost, desert and countryside are scenery beyond a soft boundary.
- **Large Rapier bundle:** about 1.7 MB gzipped, because the `-compat` build inlines its WASM. Switching to the non-compat package with a separate `.wasm` file would cut this.
- **Performance unmeasured on a real GPU:** all automated captures ran on a software renderer, so FPS numbers from them aren't meaningful. Desktop render budgets pass; the mobile triangle budget is exceeded (≈340k vs 300k), and mobile is not a target for this release.
- **Camera passes through foliage:** the camera ignores tree trunks for collision, so it can pass through canopies. Occluder fading is planned for the polish phase.
- **No real ragdolls yet:** props are rigid bodies; character ragdolls come with Phase 4.

## Roadmap

1. ~~Phase 1 — Playable foundation~~ ✅
2. **Phase 2 — Living world:** NPC models, daily routines, E-to-talk dialogue, market props that react. *(next)*
3. Phase 3 — Miracles (MiracleManager + the six miracles).
4. Phase 4 — Roman system (patrols, line of sight, Roman Attention, capture/respawn, ragdolls).
5. Phase 5 — World expansion (countryside, lake, outpost, desert, vehicles, animals).
6. Phase 6 — Missions, Faith/Chaos, followers, full save.
7. Phase 7 — Polish, audio, optimisation, CrazyGames SDK integration.

All models, textures and sounds are original and generated procedurally at runtime. No third-party or Roblox assets are used.
