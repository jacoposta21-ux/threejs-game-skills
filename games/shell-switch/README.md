# SHELL SWITCH

An original browser 3D adventure-puzzle game. You are **Glim**, a pocket-sized alien who crash-landed in the town of Fizzwick. Hop inside the townsfolk, borrow their bodies and talents, and recover five Star Cores to fix your saucer.

Built with Three.js + TypeScript + Vite. Everything is procedural: models, textures, signs, VFX, music and sound effects are generated at runtime. No asset files, no backend, no external APIs.

## Play

```bash
npm install
npm run dev        # http://127.0.0.1:5188
```

### Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move / run | WASD / hold Shift | left-side floating joystick (push to the edge to run, or Run toggle) |
| Camera | mouse (click to capture), wheel zooms | drag on the right side |
| Jump | Space | Jump button |
| Possess / use / talk | E | E button (shows the current action) |
| Host ability | F | big F button (shows the current ability) |
| Hop out of host | Q | Q button |
| Journal | Tab or J | pause → Mission Journal |
| Hint for the current step | H (or click the mission panel) | tap the mission panel |
| Pause | Esc or P | pause button |

## The game

- **5 districts** in one continuous town: Puffington Station, Glitterbox Mall, Big Top Bonanza, the Museum of Peculiar History and Fizzwick City Hall, linked by Fountain Square.
- **10 possessable hosts**, each with its own model, gait, voice and F ability: Glim (hop-dash, vents), Brick the strongman (lift/throw, smash walls, aim the cannon), Officer Pina (whistle & order), Noodle the clown (showtime distraction), Chef Bun (cook & serve), Slink the thief (pick locks, pickpocket), Velvet Vox the singer (lure crowds), Lady Mopewell the ghost (phase & boo), Prof. Volta the scientist (zap machines) and the bonus Mayor Bumbleton (decree doors, city holiday).
- **16 missions** (3 per district + finale) that chain hosts across districts, with alternative solutions for several guards.
- **NPCs** wander, react to whichever host you wear, gossip, panic, chase, watch shows, follow songs and grow suspicious when they see the naked alien or shady behaviour. Guards who catch you toss Glim back to the district entrance (progress is kept).
- **Guidance**: a compact tracker shows the current step, who can do it (with portraits) and where that character is; the objective marker leads to the needed character first. Hints escalate on their own if you stay stuck (or press **H** / tap the panel), tutorial tips teach each control the first time it matters, and walking up to something with the wrong character explains what it needs.
- **Post-game**: after the finale **every townsperson can be possessed** (44 extras), each with a name, a bio and a silly F ability (flash photos, tantrums, sales, bedtime stories, glitter tags…), collected in Collection → Extras.
- **Progression**: mission journal (with unlock conditions), host collection with bios, 56 Star Bits, 10 hidden postcards, 18 achievements (11 hidden), unlockable districts, localStorage save.

## Build and deploy

```bash
npm run build      # tsc + vite build → dist/
npm run preview    # http://127.0.0.1:4188
```

`dist/` is a self-contained static site with relative asset paths (`base: './'`).

### Playgama

The build integrates the **Playgama Bridge SDK** (`@playgama/bridge`, bundled locally by its Vite plugin as the first `<head>` script, with `public/playgama-bridge-config.json` next to `index.html`). `src/platform/Platform.ts` is the only place that talks to it:

- `bridge.initialize()` and one `storage.get([...])` finish before the game is built; saves and settings go only through Bridge storage (no `localStorage`).
- `platform.isAudioEnabled` is applied at start; audio/pause/interstitial state events mute and freeze the game.
- `game_ready` is sent once the title screen is interactive; `level_started/paused/resumed/completed` follow the game flow.
- Interstitials are requested at natural pauses only: mission complete, pause menu, ending screen. Bridge decides when one actually shows.
- Esc is not used (pause is P or the on-screen button); there is a mute button; no emoji icons; long-press callouts and text selection are disabled.

```bash
npm run build && (cd dist && zip -qr ../shell-switch-playgama.zip . -x '*.map')
```

Upload `shell-switch-playgama.zip` (index.html at the archive root).

### CrazyGames

`npm run build:crazygames` builds `dist-crazygames/` with the **CrazyGames SDK v3** instead of Playgama Bridge (`vite build --mode crazygames`; `src/platform/CrazyGames.ts` is the backend, the game code is unchanged):

- the SDK script loads from `sdk.crazygames.com` first in `<head>`; `SDK.init()` runs before the game is built;
- `loadingStart` at init, `loadingStop` once the title screen is interactive; `gameplayStart/Stop` on play, pause menu and ads; `happytime` on mission complete;
- midgame ads only after a mission and on the ending screen (never from the pause menu); the game pauses and mutes while one plays;
- the platform mute setting (`game.settings.muteAudio`) is honoured live;
- saves go through `SDK.data` (throttled, flushed when the tab hides), with localStorage as a fallback when the SDK is unavailable.

```bash
npm run build:crazygames && (cd dist-crazygames && zip -qr ../shell-switch-crazygames.zip .)
node scripts/crazygames-smoke.mjs http://127.0.0.1:4190/   # mock-SDK smoke test (serve dist-crazygames on 4190)
```

## Project layout

```
src/core        renderer, loop, input (keyboard/mouse/touch), camera rig
src/world       materials, merge builder, collision grid, props, signs, ground/sky, districts in areas/
src/characters  procedural character rig + faces, cast definitions, NPC brain, dialogue lines
src/gameplay    world objects (doors, crates, machines…), missions, progress/save, star bits, achievements
src/audio       procedural music sequencer, ambience, SFX, loops (Web Audio)
src/fx          pooled particle VFX (one draw call)
src/ui          HUD, menus, host portraits
src/game        Game orchestrator (possession, abilities, rules, ending, test hooks)
docs/design.md  design brief, core loop contract, level plan, mission table
```

## Testing

- `window.__THREE_GAME_TEST_HOOKS__.setState(name)` supports `title`, `active-play`, `possessed`, `station-core`, `mall`, `circus`, `museum`, `cityhall`, `journal`, `collection`, `ending`.
- `tests/bot/*.mjs` drive full mission chains through real input intents (WASD, E, F, Q, Space). Append `?simsteps=N` to fast-forward the simulation on slow software renderers.
- `npm run inspect:canvas -- --manifest artifacts/evidence.json --url http://127.0.0.1:5188` captures the declared viewport/state set. In containers whose preinstalled Chromium differs from the npm Playwright build, set `CHROMIUM_PATH=/path/to/chromium`.
