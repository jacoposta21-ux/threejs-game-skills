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
| Pip's Echo: present ↔ past (Chapter III+) | R, U | RB | ECO |
| Pip's Light Thread: grapple & swing (Chapter IV) | F, O | LB | HOOK |
| Pause | Esc, P | Start | ❚❚ |

## Chapters

The story is split into chapters, and each one ends with its own boss.

### Chapter I · The Descent

| Part | Area | New mechanics | New threats |
| --- | --- | --- | --- |
| 1 | The Abandoned Station | run/jump, ladders, crouch vents, crates & pressure plates, ledge grab, lockers, Pip mechanisms | Crawlers, electric arcs, spikes |
| 2 | The Mushroom Forest | Pip-boost double jump, bounce caps, totem gates | Burrowers, spore vents |
| 3 | The Forgotten Caverns | darkness, light-glass bridges, charged shots vs cocoons, Pip through cracks | Stalkers, falling stalactites |
| 4 | The Underground Ocean | swimming, air meter, currents, floating crates, Pip lure | The Tide Warden |
| 5 | The Heart of the Hollow | everything combined | **Boss: The Hollow Heart** (3 phases) |

### Chapter II · The Iron Echo

| Part | Area | New mechanics | New threats |
| --- | --- | --- | --- |
| 1 | The Glass Caverns | slick crystal floors, rail platforms, crystal lifts, breakable crystal walls | Crawlers on crystal, Stalkers |
| 2 | The Clockwork Ruins | conveyor belts (they carry crates too), stone crushers | Watchers (flying sentries with a laser sight) |
| 3 | The Sunken Temple | timed totems (7-second gates), swinging blades | Burrowers, Stalkers |
| 4 | The Sentinel's Vault | arena fight | **Boss: The Ancient Sentinel**: bomb runs, laser columns, ground dives that leave its core exposed; it calls Watchers in phase 2 |

### Chapter III · The Keepers’ City

Pip learns the **Echo** (R / U, gamepad RB, touch ECO): the world switches between the ruined **present** and the golden **past** of the Keepers' city. Some stones exist only in one time.

| Part | Area | New mechanics | New threats |
| --- | --- | --- | --- |
| 1 | The Deep Threshold | Echo bridges and rubble, rising spore columns, switching time in mid-air | Veiled Shades (split in two) |
| 2 | The Hanging Gardens | vine seeds that grow into ladders under a charged blast | Mimic caps (look like bounce caps, bite) |
| 3 | The Keepers’ Quarter | crate puzzle across both times; Ilse's birthplace | **Mini-boss: the Broken Keeper** |
| 4 | The Archive of Voices | Keeper lanterns (lit by Pip or a charged blast) keep shades away | Veiled Shades in the dark |
| 5 | The Shadow Well | lantern-lit arena | **Boss: The First Shadow**: untouchable in darkness; light the lanterns. From phase 2 it snuffs them, and the light of the past wounds it. In phase 3 it eats the light |

### Chapter IV · The Seed

Pip learns the **Light Thread** (F / O, gamepad LB, touch HOOK): catch a glowing node and swing. ← → pump the swing, ↑ ↓ climb or lower the thread, and JUMP lets go with momentum. You can chain from node to node.

| Part | Area | New mechanics | New threats |
| --- | --- | --- | --- |
| 1 | The Roots of the World | Light Thread, living root platforms | Crawlers |
| 2 | The Sea of Sap | swimming in sap, node chains over the sea | Lucimanti (jellies drawn to Pip's light) |
| 3 | The Memory of the Hollow | a corrupted remix of the station: ladders, arcs, crates across time, threads | shadow versions of earlier creatures |
| 4 | The Sanctuary of the Seed | **Ilse** follows you; at Keeper doors she kneels and channels while shades hunt her (if she falls, it's game over) | Veiled Shades |
| 5 | The Heart of Shadow | **Final boss**, three phases: hang from infected nodes to purify them; dodge waves that exist in only one time (Echo); Elias is struck down and you fly **Pip** to gather the Seed's light, then Ilse holds the core open for the last shot | — |

**Two endings.** With at least 80% of the game's 50 recordings found you get *Light* (the Canto is complete and Pip stays with Elias). Otherwise you get *Seed* (Pip becomes the Hollow's new heart).

Story and level structure for Chapters III–IV live in `docs/capitoli-3-4.md`.

The title screen opens on the key art (`src/assets/keyart.jpg`), and `public/cover-512.jpg` is a cover thumbnail for the portal listing.

Checkpoints save to `localStorage`, and Continue resumes from the last one. Chapter select is grouped by chapter. A death offers retry from checkpoint or restart chapter. The game also has lore recordings (50), settings (music/sfx volume, quality, language, screen shake), fullscreen, and gamepad support.

## Languages

The game is fully translated into English, Italiano, Español, Français, Deutsch and Português: menus, HUD messages, hints, story, recordings, boss titles and endings. On first launch the language follows the browser (on CrazyGames that is the player's locale); Settings → Language switches it at any time, and the choice is saved.

- `src/core/i18n.ts` — `t('English text', …args)` for UI strings; `applyLanguage()` rewrites the level/chapter data in place from stable ids (`<level>.intro.0`, `<level>.lore.2`, `ch3.end.1`…).
- `src/i18n/<lang>.ts` — one pack per language (`ui` keyed by the English text, `data` keyed by id). Key and button names (JUMP, FIRE, SPACE, Q…) stay as on the controls.
- `node --experimental-strip-types tools/i18n-check.ts` lists every translatable string and fails on missing ids, stray keys or broken `{0}` placeholders (`--dump file.json` writes the source catalogue).

## Architecture

```
src/core     constants, Save (localStorage), i18n, Audio (generative music + SFX), Controls (kbd/mouse/pad/touch), CrazySDK wrapper
src/art      procedural painters: elias (FK pose → sprite sheet), creatures, tiles (autotiled, extruded atlas), backgrounds, props/FX
src/levels   ASCII segment level data + compiler (→ Phaser Tilemap)
src/world    LevelMap (tilemap layers, decor scatter), Objects (doors, plates, mechanisms, hazards…), Lighting (darkness RT), Fx
src/entities Player (explicit animation/physics state machine), Pip, Enemies (Crawler, Stalker, Burrower, Guardian/boss)
src/scenes   Boot, Menu, Story, BG (parallax), Game, UI (HUD/menus/touch), Ending
src/i18n     translation packs (it, es, fr, de, pt)
tools        validate-levels.ts, i18n-check.ts, gen-chapter2/3/4.py (map authoring), harness.mjs, playtest-l1.mjs, playtest-all.mjs, playtest-ch2.mjs, playtest-ch3.mjs, playtest-ch4.mjs
```

## CrazyGames

No account, no payments. The SDK v3 is loaded only on CrazyGames domains (or with `?crazygames`). It handles `loadingStart/Stop`, `gameplayStart/Stop` on play, pause, and death, `happytime` on the boss kill, and a midgame ad between chapters, with audio muted during ads. Fullscreen, pause, game-over/restart screens, a responsive canvas (RESIZE + adaptive camera zoom) and touch controls are all built in.
