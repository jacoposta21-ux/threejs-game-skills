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

The title screen is the painted mushroom-forest vista with Elias and Pip; `public/cover-512.jpg` is a cover thumbnail for the portal listing.

Checkpoints save to `localStorage`, and Continue resumes from the last one. Chapter select is grouped by chapter. A death offers retry from checkpoint or restart chapter. The game also has lore recordings (50), settings (music/sfx volume, quality, language, screen shake), fullscreen, and gamepad support.

**Boss fights are meant to be beaten.**

*Boss difficulty* (Settings, or offered on the game-over screen) changes **only** the boss fights:

| | Story | Normal | Hard |
|---|---|---|---|
| Boss speed (movement, cooldowns, wind-ups) | 72% | 100% | 120% |
| Boss health | 65% | 100% | 130% |
| Elias' hearts during the fight | +3 | — | — |
| Damage per boss hit | 1 | as designed | as designed |
| New phase restores Elias | yes | yes | no |
| "Skip this fight" offered after | 1 defeat | 3 defeats | 3 defeats |

In every difficulty:
- after a fall, Retry resumes at the phase reached;
- in Normal or Hard, after two defeats the game-over panel offers to switch boss fights to Story.

Every boss attack is announced before it lands, and a golden ring marks the weak spot whenever the boss can be hurt.

| Boss | Attack | Warning |
|---|---|---|
| Hollow Heart | slam | red chevrons show where the slam's shockwaves will run |
| Hollow Heart | charge | its lane is marked during the roar |
| Hollow Heart | spores | rings show where they will land |
| Ancient Sentinel | bombs | each bomb's landing ring stays until it bursts |
| Ancient Sentinel | dive | the landing zone and the shockwaves are marked |
| Ancient Sentinel | laser | its column builds up first |
| First Shadow | orb volley | the boss glows first |
| First Shadow | lunge | it stops, its eyes turn red, and a dashed line shows its path |
| Heart of Shadow | orb fan | the boss glows first |
| Heart of Shadow | shadow column | the column builds up first |

Falling stalactites flash a column on the floor. A short two-note alarm accompanies each warning.

**Performance.** Settings → Visual quality → *Performance* has these effects:
- two of the four parallax layers are hidden;
- the ambient motes are turned off;
- the darkness overlay is drawn at a third of the resolution;
- rendering is capped at 60 fps on high-refresh screens.

The darkness overlay always erases all lights in a single pass. If the frame rate stays under ~48 fps for about eight seconds, the game switches to Performance by itself and says so. Add `?noauto` to the URL to disable that. If Elias ever ends up inside solid ground, he is put back on the last safe spot.

## Languages

The game is fully translated into English, Italiano, Español, Français, Deutsch and Português: menus, HUD messages, hints, story, recordings, boss titles and endings. On first launch the language follows the browser (on CrazyGames that is the player's locale); The *Language* entry on the title menu (and in Settings) opens the list of languages; the choice is saved.

- `src/core/i18n.ts` — `t('English text', …args)` for UI strings; `applyLanguage()` rewrites the level/chapter data in place from stable ids (`<level>.intro.0`, `<level>.lore.2`, `ch3.end.1`…).
- `src/i18n/<lang>.ts` — one pack per language (`ui` keyed by the English text, `data` keyed by id). Key and button names (JUMP, FIRE, SPACE, Q…) stay as on the controls.
- `node --experimental-strip-types tools/i18n-check.ts` lists every translatable string and fails on missing ids, stray keys or broken `{0}` placeholders (`--dump file.json` writes the source catalogue).

## Architecture

```
src/core     constants, Save (localStorage), i18n, Quality, BossTuning, cheats, Audio (generative music + SFX), Controls (kbd/mouse/pad/touch), CrazySDK wrapper
src/art      procedural painters: elias (FK pose → sprite sheet), creatures, tiles (autotiled, extruded atlas), backgrounds, props/FX
src/levels   ASCII segment level data + compiler (→ Phaser Tilemap)
src/world    LevelMap (tilemap layers, decor scatter), Objects (doors, plates, mechanisms, hazards…), Lighting (darkness RT), Fx
src/entities Player (explicit animation/physics state machine), Pip, Enemies (Crawler, Stalker, Burrower, Guardian/boss)
src/scenes   Boot, Menu, Story, BG (parallax), Game, UI (HUD/menus/touch), Ending
src/i18n     translation packs (it, es, fr, de, pt)
tools        validate-levels.ts (--traps finds soft-locks), i18n-check.ts, gen-chapter2/3/4.py (map authoring), harness.mjs, playtest-l1.mjs, playtest-all.mjs, playtest-ch2.mjs, playtest-ch3.mjs, playtest-ch4.mjs, playtest-bosses.mjs and playtest-boss-difficulty.mjs (LV=4|8|13|18)
```

## Portals and builds

The game talks to portals only through `src/core/Portal.ts`. There are two builds:

| Build | Command | Output | Upload |
|---|---|---|---|
| CrazyGames (and generic web) | `npm run build` | `dist/` | `release/beyond-the-hollow-html5.zip` |
| Playgama (+ its partner portals) | `npm run build:playgama` | `dist-playgama/` | `release/beyond-the-hollow-playgama.zip` |

Each zip has `index.html` at the root and relative paths.

### Playgama

Playgama uses the [Bridge SDK](https://www.npmjs.com/package/@playgama/bridge), `@playgama/bridge` 2.3.1, pinned. The official Vite plugin injects it from `bridge.playgama.com`, and falls back to the bundled `playgama-bridge.js` if that fails. `playgama-bridge-config.json` (source: `portal/playgama/`) sits next to `index.html`.

| Bridge feature | How the game uses it |
|---|---|
| `bridge.initialize()` | runs before the game is created |
| loading progress | `setGameLoadingProgress` reports progress while assets are painted |
| `game_ready` | sent when the title menu appears |
| `gameplay_started` / `gameplay_stopped` | sent on play, pause, death and level end |
| `level_started` / `level_completed` / `level_failed` | sent at those moments |
| `player_got_achievement` | sent when a boss is defeated |
| interstitials | shown between parts and chapters; the platform enforces the minimum delay (60 s in the config) and game audio is muted while the ad is open |
| audio / pause / visibility | the platform's audio switch mutes the game; a pause request opens the in-game pause menu; a hidden page suspends audio |
| `bridge.platform.language` | picks the language on first launch |
| `bridge.storage` | mirrors the save (cloud saves where the platform has them); at boot the stored save is loaded |
| CrazyGames SDK | never loaded in this build |

## CrazyGames

No account, no payments. The SDK v3 is loaded only on CrazyGames domains (or with `?crazygames`). It handles `loadingStart/Stop`, `gameplayStart/Stop` on play, pause, and death, `happytime` on the boss kill, and a midgame ad between chapters, with audio muted during ads. Fullscreen, pause, game-over/restart screens, a responsive canvas (RESIZE + adaptive camera zoom) and touch controls are all built in.
