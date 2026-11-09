# Phase 1 — verification evidence

Everything below was run against this commit. The build sandbox has **no GPU**: WebGL ran on SwiftShader (CPU), at about 0.5 fps at 1280×720 Medium and about 2 fps at 640×360 Low. Pixel, budget and gameplay checks are valid. **FPS and frame-time numbers are not**, and none are claimed. Measure frame rate on real hardware (see the bottom of this file).

## Automated tests (`npx playwright test`, dev server)

| Test | Result |
| --- | --- |
| Desktop: menu → PLAY → countdown → play; non-blank canvas; **WASD moves the player**; no console errors | ✓ |
| Desktop: Esc pauses (clock frozen), RESUME continues | ✓ |
| Mobile (Pixel 7 emulation): touch stick visible and **moves the player**; no errors | ✓ |
| Desktop: **keyboard-only bot playtest** (steers with WASD, shoots with held J) | ✓ — see `docs/bot-playtest.json` |

Bot result over ~70 s of game time on the CPU renderer: 6 shots registered, 1 goal, 3 keeper saves; phases seen: playing → goal → kickoff → playing. The bot is deliberately crude (no aiming), so these numbers show the loop works end to end; they are not a balance measurement.

## Dribble probe (`node tools/qa/dribble.mjs`, through the real controller)

| Scenario (4 s) | Possession | Ball–player separation |
| --- | --- | --- |
| Jog straight | 100% | 0.2–1.2 m |
| Sprint straight | 100% | 1.3–1.9 m (longer touches) |
| Jog zig-zag | 100% | 0.1–0.7 m |
| Sprint then 90° turn | 53% (ball lost at the turn, by design) | — |

## Canvas inspector (`npm run inspect:canvas -- --manifest artifacts/evidence.json`, **production build** via `vite preview`)

Run `phase1-pass-1`: 9/9 captures PASS, render budget ok. `check_evidence.py` passed (10 artifacts).

| Capture | entropy | edges | contrast | dominant |
| --- | --- | --- | --- | --- |
| desktop menu | 6.07 | 0.418 | 171 | 0.14 |
| desktop active-play | 5.27 | 0.388 | 129 | 0.18 |
| desktop dribble | 5.47 | 0.426 | 129 | 0.15 |
| desktop shot | 5.91 | 0.473 | 135 | 0.15 |
| desktop keeper-save | 5.91 | 0.480 | 128 | 0.13 |
| desktop goal | 6.89 | 0.590 | 178 | 0.09 |
| desktop fulltime (results modal over a dimmed scene) | 2.74 | 0.104 | 33 | 0.36 |
| mobile active-play | 5.10 | 0.337 | 172 | 0.19 |
| mobile goal | 6.62 | 0.540 | 178 | 0.08 |

Renderer counts in active play: **55–66 draw calls, 126k (Low) – 216k (Medium) triangles, ~55 geometries, 31–44 textures**. That is within the desktop (300 / 750k) and mobile (150 / 300k) starting budgets. Physics: Rapier, fixed 120 Hz step, 3 bodies (ball + 2 kinematic capsules), 33 colliders, CCD on the ball.

## Download size (production `dist/`)

| Piece | Raw | gzip |
| --- | --- | --- |
| Game code | 130 KB | 46 KB |
| three.js | 653 KB | 167 KB |
| Rapier (WASM inlined) | 4.3 MB | 1.67 MB |
| Character GLB (mesh + skin + 7 clips) | 277 KB | 149 KB |
| CSS + fonts | ~120 KB | — |

The total transfer is about **2.1 MB gzipped**. The biggest remaining saving is switching Rapier from the `-compat` build (base64-inlined WASM) to the plain WASM package plus a Vite WASM plugin, which would save roughly 0.4–0.6 MB.

## Motion evidence (`tools/qa/motion.mjs`, unpaused simulation, close-up camera)

- `screenshots/motion-jog-dribble.jpg` — a run cycle with planted feet; ball touches land on the stride; the ball stays loose and separate from the feet.
- `screenshots/motion-shot.jpg` — approach → backswing → contact (dust and trail appear on the contact frame) → follow-through with counter-balancing arm → recovery.
- `screenshots/motion-keeper-dive.jpg` — reaction, horizontal dive with arms extended, landing, staying down. A snap-to-standing bug on conceding was found here and fixed.
- `screenshots/motion-celebration.jpg` — the airplane celebration running arcs at the jog clip's natural speed, so the feet do not slide.

## Visual scorecard (anchors in `threejs-aaa-graphics-builder/references/visual-scorecard.md`)

No "before" exists for a new game. These are the current scores, judged from the captures above:

| Category | Score | Evidence |
| --- | --- | --- |
| Art direction | 2 | The Brazilian street identity carries through the court emblem, kits, ads, murals, palette and UI motifs |
| Hero / player | 2 | Rigged human mannequin with team kit, number, crest, hair and headband; possession tag. Faces and clothing folds are simple — Phase 4 target |
| Obstacles (keeper, goals, cage) | 2 | Keeper with a distinct kit and readable set / dive / hold states; goals, boards and cage are authored with collision proxies |
| Interactables (ball and goal) | 2 | Panelled ball with contact blob, shot trail, dust, net and post feedback, goal banner and confetti |
| World / environment | 2.5 | Foreground cage, mid-ground street of shops and houses with props, background hillside and peaks; animated crowd |
| Materials / textures | 2 | Worn concrete with paint chips, patches and cracks; plaster with damp streaks and exposed brick; weathered ad boards |
| Lighting / render | 2 | ACES, warm key sun with shadows, hemisphere fill, rim light, sky IBL, fog for depth only |
| VFX / motion | 2 | Event-driven dust, sparks, trail, confetti, slow-motion, shake and FOV punch |
| UI / HUD | 2 | Street-sign scoreboard, power ring, popups, banners, menus, touch controls |
| Performance evidence | 1 | Renderer counts and budget checks only. No real-GPU frame timing was possible in this sandbox |

Average **1.95**. This is a polished Phase 1 slice, not yet at the premium bar (≥ 2.3 with no category below 2). The weakest areas, and what fixes them:

- **Performance evidence:** run on real hardware (below).
- **Hero detail:** Phase 4, dressed CC0 Universal Base Characters on the same rig (see `ASSETS.md`).

## Measuring FPS on real hardware

```bash
npm run build && npm run preview
# open http://127.0.0.1:4188, start a match, then in the console:
#   let f=__THREE_GAME_DIAGNOSTICS__.frame; setTimeout(()=>console.log((__THREE_GAME_DIAGNOSTICS__.frame-f)/5,'fps'),5000)
```

The game also downgrades itself to Low once if the first 4 s of play average below about 28 fps.
