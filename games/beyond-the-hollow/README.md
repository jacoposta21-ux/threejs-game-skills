# Beyond the Hollow

A cinematic 2D platform adventure built with **Phaser 3.90 + TypeScript + Vite**, prepared for CrazyGames.

Elias, a teenage explorer, falls through the floor of an abandoned research station into the Hollow, an underground world. His only companion is **Pip**, a mechanical firefly his mother built. Across five chapters he follows her recorded logs back toward the surface.

All art (character, creatures, tiles, parallax backgrounds, props, VFX) is **painted procedurally at boot**. All music and sound is **synthesized with WebAudio**. The game downloads no image or audio files: the build is about 1.8 MB, or about 400 KB of gzipped JS plus fonts.

## Run

```bash
npm install
npm run dev            # http://127.0.0.1:5188  (add ?canvas to force the Canvas renderer)
npm run build          # production build in dist/ (relative paths; upload the folder's contents)
npm run validate:levels  # reachability proof for all five levels
```

## Controls

| Action | Keyboard | Mouse / Pad | Touch |
| --- | --- | --- | --- |
| Move | A/D, ← → | stick / d-pad | ◀ ▶ |
| Jump (again in the air = Pip-boost double jump) | Space, Z, W, ↑ | A | JUMP |
| Crouch, crawl, hide in lockers/foliage | S, ↓ | | ▼ |
| Climb ladders / ledges | W, ↑ | | ▲ |
| Lumen Coil (hold to charge) | X, J | Left-click (aims at cursor) | FIRE |
| Pip: wake mechanisms or sing a lure | Q, K | Right-click | PIP |
| Pause | Esc, P | Start | ❚❚ |

## Chapters

| # | Chapter | New mechanics | New threats |
| --- | --- | --- | --- |
| I | The Abandoned Station | run/jump, ladders, crouch vents, crates & pressure plates, ledge grab, lockers, Pip mechanisms | Crawlers (crawl on walls and ceilings, then pounce), electric arcs, spikes |
| II | The Mushroom Forest | Pip-boost double jump, bounce caps, totem gates | Burrowers (tunnel, erupt, bite, spit), spore vents |
| III | The Forgotten Caverns | near-total darkness, light-glass bridges revealed by Pip, charged shots vs web cocoons, Pip through cracks | Stalkers (hunt in darkness, flee light), falling stalactites |
| IV | The Underground Ocean | swimming, air meter, currents, floating crates, Pip lure | The Tide Warden (guardian), urchin beds |
| V | The Heart of the Hollow | everything combined | acid; the Hollow Heart boss (3 phases, core windows, stalactite drops) |

Checkpoints save to `localStorage`, and Continue resumes from the last one. A death offers retry from checkpoint or restart chapter. The game also has lore recordings (15), a chapter select, settings (music/sfx volume, quality, screen shake), fullscreen, and gamepad support.

## Architecture

```
src/core     constants, Save (localStorage), Audio (generative music + SFX), Controls (kbd/mouse/pad/touch), CrazySDK wrapper
src/art      procedural painters: elias (FK pose → sprite sheet), creatures, tiles (autotiled, extruded atlas), backgrounds, props/FX
src/levels   ASCII segment level data + compiler (→ Phaser Tilemap)
src/world    LevelMap (tilemap layers, decor scatter), Objects (doors, plates, mechanisms, hazards…), Lighting (darkness RT), Fx
src/entities Player (explicit animation/physics state machine), Pip, Enemies (Crawler, Stalker, Burrower, Guardian/boss)
src/scenes   Boot, Menu, Story, BG (parallax), Game, UI (HUD/menus/touch), Ending
tools        validate-levels.ts, harness.mjs, playtest-l1.mjs, playtest-all.mjs (scripted real-input playtests)
```

## CrazyGames

No account, no payments. The SDK v3 is loaded only on CrazyGames domains (or with `?crazygames`). It handles `loadingStart/Stop`, `gameplayStart/Stop` on play, pause, and death, `happytime` on the boss kill, and a midgame ad between chapters, with audio muted during ads. Fullscreen, pause, game-over/restart screens, a responsive canvas (RESIZE + adaptive camera zoom) and touch controls are all built in.
