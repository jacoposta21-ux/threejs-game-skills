# NEON TUNNEL

*Survive the speed.* A 3D endless reflex arcade game for desktop and mobile browsers, built with Three.js and Vite. You steer a glowing energy sphere around the inside of an endless neon tunnel. Dodge spikes, lasers, blades, moving walls and energy gates, and chase a high score.

All art and audio are generated in code: shaders, instanced geometry and a Web Audio synth. There are no paid assets, no backend, and no network calls at runtime.

## Run it

Requires Node.js 18+ (tested with Node 22).

```bash
cd games/neon-tunnel
npm install
npm run dev
```

Open http://127.0.0.1:5188.

To test on a phone on the same network, run `npx vite --host 0.0.0.0` and open your computer's LAN address on port 5188.

Production build (static files in `dist/`, with relative paths, so they can be uploaded to any portal or static host):

```bash
npm run build
npm run preview   # serves dist/ on http://127.0.0.1:4188
```

Single self-contained HTML file (JS, CSS and fonts inlined; open it by double-clicking, no server needed):

```bash
npm run build:single   # writes dist-single/neon-tunnel.html
```

CrazyGames build (loads the CrazyGames SDK; falls back to local behaviour if it cannot load):

```bash
npm run build:crazygames   # writes dist-crazygames/
```

Portal page material (dev server must be running):

```bash
npm run promo   # writes promo/cover-*.png, promo/screenshot-*.png, promo/gameplay.mp4 (needs ffmpeg)
```

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Rotate left | `A` / `←`, or hold the left half of the screen with the mouse | Hold the left half of the screen |
| Rotate right | `D` / `→`, or hold the right half of the screen with the mouse | Hold the right half of the screen |
| Pause / resume | `Space` (also `Esc` / `P`) or the pause button | Pause button |
| Retry after game over | `Enter` / `R` / `Space` | RETRY button |
| Mute | `M` or the speaker button | Speaker button |

If both directions are held, the most recent press wins. The game pauses itself when the tab is hidden or loses focus, and resumes with a 3‑2‑1 countdown.

## What's in the game

- **Endless procedural tunnel.** A single shader-driven cylinder is indexed by travel distance, with per-section variation in panels, neon strips, travelling light pulses, rings and inset lamps. Instanced structural ribs and rotating light rings are recycled as you advance. A fake neon sheen, the sphere's glow on the walls, and distance fog give depth.
- **Five obstacle families plus combos:**
  - Neon spikes (magenta)
  - Laser barriers (red, static or rotating)
  - Rotating energy blades (orange)
  - Moving metallic walls (cyan rims)
  - Energy gates (blue, with bright gap edges)
  - Combination patterns: spike spirals, wall zigzags, gate trains, laser fans, gate+laser and blade+gate pairs
- **Readable hazards.**
  - Lasers appear as dashed "charging" lines and ignite with a spark burst 1.7 s before they reach you.
  - Rotating blades and lasers show a dashed sweep ring at your lane.
  - Gate openings are framed by bright pylons.
- **Learning from failure.** After a crash the world freezes on the obstacle, which pulses, while the camera pulls back. The Game Over screen names what hit you and gives a tip.
- **First-run tutorial.** Rotate, follow the energy, then go for a near miss. The first obstacle now arrives sooner.
- **Near-miss juice.** A short slow-motion punch, sparks off the exact edge you skimmed, and a multiplier pulse.
- **Theme-specific surfaces.** Each theme has its own wall detail: circuit traces, hex cells, heat vents, star windows, clean scan tiles. Glowing portal rings mark every zone change.
- **Fairness guarantee.** The generator runs a reachability solver over 180 angular bins. A row is accepted only if *every* angle the player could be in can reach a safe angle in time. If not, it re-rolls the row or adds distance. `npm run test:fairness` re-checks thousands of rows independently with the exact collision maths.
- **Smooth difficulty.** Speed and difficulty are continuous curves (`src/Difficulty.js`). Obstacle families unlock gradually: Beginner 0–30 s, Intermediate 30–60 s, Advanced 60–120 s, Expert 120 s+.
- **Accurate collision.** Collision is swept per frame using the sphere's real radius and cross-section, so nothing tunnels through at low frame rates or at boost speed.
- **Scoring:**
  - Points for distance travelled
  - Energy shards (+25 × multiplier)
  - Near misses (+60 × multiplier)
  - A multiplier up to ×8 that builds from collecting and near misses and decays when you stop
  - Persistent best score
- **Power-ups:**
  - ⚡ BOOST: overdrive speed, and you smash through obstacles for a bonus, with a short grace period afterwards
  - 🛡 SHIELD: absorbs one hit
  - 🧲 MAGNET: pulls in nearby energy
- **Five tunnel themes** that blend smoothly every 1,800 m: Cyber Blue, Toxic Green, Solar Core, Violet Void and Quantum White.
- **Nine cosmetic skins.**
  - Six are bought with energy you bank from runs: Cyber Core, Plasma, Inferno, Toxic, Quantum, Void.
  - Three animated skins are earned through achievements: PRISM (rainbow), PULSAR (strobe), AURUM (gold shimmer).
- **Missions.** Three are always active (near misses, energy, distance, zones, multiplier, survival, power-ups, smashes, runs). Completing one pays energy, and it is replaced by a harder version. You get toasts during the run and a summary on Game Over.
- **15 achievements** and a **stats** page (runs, distances, time played, furthest zone, near misses and more).
- **Daily Run.** A seeded tunnel that is identical for every player on the same day, with its own daily best.
- **More patterns:**
  - Narrowing *lane*: consecutive walls leave one drifting lane.
  - *Corkscrew*: a spiral of single-gap gates that forces continuous rotation.
  - Counter-rotating *double gates*.
- **Zone soundtrack.** Each theme has its own key, arp timbre, acid bass and echo. The music changes with the zone.
- **Rewarded options on Game Over (once per run):**
  - **CONTINUE** revives you at the crash point with 3 s of protection; the recorded result is undone.
  - **×2 ENERGY** banks the run's energy again.
- **Particles.** A single pooled GPU point system handles trails, sparks, pickups, near misses, power-up rings and the death explosion. Ambient dust and speed streaks use fixed buffers.
- **Audio.** A procedural synthwave track whose tempo, filter and layers build with speed, plus SFX for every event. There are master, music and effects volume sliders and a mute toggle. Audio starts only after the first user gesture.
- **Death sequence.** An explosion, slow motion, camera shake and a flash, then the Game Over screen with score, best, distance, energy and time. Retry is instant.
- **Performance:**
  - Every obstacle family draws with shared `InstancedMesh`es (about 30–45 draw calls in play)
  - No per-frame allocations in hot paths
  - Device-pixel-ratio cap and adaptive quality (auto steps HIGH → MED → LOW when frame time stays high)
  - A LOW mode with no bloom, fewer particles and DPR 1

## Project structure

```
neon-tunnel/
  index.html              DOM for HUD and all menu screens
  styles/main.css         Responsive UI (safe-area aware, portrait + landscape)
  src/
    main.js               Entry point
    Game.js               State machine, loop, camera, post-processing, quality, test hooks
    Config.js             All tuning: speed, generator, scoring, power-ups, themes, skins, quality
    Difficulty.js         Pure difficulty / speed / steering curves
    ObstacleModel.js      Renderer-free obstacle maths (arcs, rotation, clearance)
    ProceduralGenerator.js  Seeded pattern generator + fairness solver + pickup placement
    CollisionSystem.js    Swept sphere-vs-arc collision and near-miss detection
    Tunnel.js             Tunnel shader, ribs, rotors, vanishing glow, theme blending
    Obstacles.js          Instanced obstacle rendering
    Player.js             Energy sphere visuals, steering physics, ribbon trail
    PowerUps.js           Energy shards, power-up tokens, timers, magnet
    ParticleSystem.js     Pooled particles, dust, speed streaks
    AudioManager.js       Web Audio music sequencer + SFX
    InputManager.js       Keyboard, mouse and multi-touch steering
    UIManager.js          Screens, HUD, popups, skins, settings
    SaveManager.js        localStorage persistence (guarded)
    Platform.js           Platform adapters: local (placeholder rewarded ads) and CrazyGames SDK v3
    Progression.js        Missions, achievements, stats, daily seed
  assets/audio, assets/textures   Reserved for optional external assets
  scripts/fairness-check.mjs      Offline generator fairness verification
  scripts/inspect-threejs-canvas.mjs  Canvas/pixel/render-budget inspector
  tests/visual.spec.js    Playwright real-input gameplay + menu tests
```

## Testing

```bash
npm run test:fairness                 # 60 seeds x 420 s of generated tunnel, exact-collision reachability
npx playwright test --trace off       # desktop + mobile real-input gameplay and menu tests
npm run inspect:canvas -- --state active-play   # pixel + render-budget report (dev server running)
```

The Playwright config uses the `chromium` channel. If that browser is not installed, set `PW_CHROME=/path/to/chrome`.

Test hooks (`window.__THREE_GAME_TEST_HOOKS__`) support `seed(n)`, `setState(name)` and `setPausedForScreenshot(bool)`, plus an autopilot and invincibility for captures. Valid states for `setState` are `menu`, `skins`, `settings`, `howto`, `active-play`, `late-game`, `boost`, `paused` and `game-over`.

## CrazyGames readiness

- Plain HTML5 static build, relative asset paths, no accounts, no backend and no permissions.
- Clear game states (`menu`, `playing`, `paused`, `countdown`, `dying`, `gameover`), fast restart, and pause/resume including tab-visibility handling.
- `src/Platform.js` is the only integration point. `CrazyGamesPlatform` is used when built with `npm run build:crazygames` or opened with `?platform=crazygames`.
  - It loads `https://sdk.crazygames.com/crazygames-sdk-v3.js` and calls `SDK.init()`.
  - It maps the game's hooks onto `game.loadingStart/loadingStop`, `game.gameplayStart/gameplayStop` (run start/resume vs pause/death/menu) and `game.happytime` (new best, achievement).
  - Ads go through `ad.requestAd('midgame' | 'rewarded', { adStarted, adFinished, adError })`. Audio is suspended during ads.
  - It honours the portal's `game.settings.muteAudio` (through `addSettingsChangeListener`).
- Ads:
  - A midgame break is requested at most every 3rd retry.
  - Rewarded ads are only shown when the player taps CONTINUE or ×2 ENERGY.
  - Nothing interrupts a run.
- If the SDK cannot load, the game logs a warning and stays fully playable without ads.
- **Before submitting:** the SDK method names were cross-checked against a published third-party integration (`@adlad/plugin-crazygames`), because docs.crazygames.com was unreachable from the build environment. Re-verify them against the official docs and test in the CrazyGames QA tool.
- Progress is saved in `localStorage`. If you want cloud saves on CrazyGames, mirror `SaveManager` to the SDK data module.

## Tuning

Everything gameplay-relevant is in `src/Config.js`:
- Steering speed and responsiveness
- The speed curve
- Row spacing and fairness margins
- Score values
- Power-up durations
- Themes, skins and quality presets

`src/Difficulty.js` holds the curves shared by the game, the generator and the fairness checker.
