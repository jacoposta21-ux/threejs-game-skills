# Verification evidence

## v1.7.1 — recorded audio, night courts relit

**Audio.** Six sounds now load CC0 recordings over the synthesised versions: hard kick, soft kick, touch, kickboard, post, and applause under the goal cheer. In Chromium all six decode, both from the dev server and from the single-file build opened from disk. The leading MP3 padding is trimmed so impacts are not delayed. The six files add 60 KB.

**Brightness.** Mean luminance of the playing area in gameplay captures (`tools/qa/venues.mjs`, Low quality):

| Court | Before | After |
| --- | --- | --- |
| Brazil | 0.48 | 0.48 |
| New York | 0.16 | 0.45 |
| London | 0.16 | 0.44 |
| Tokyo | 0.14 | 0.40 |
| Barcelona | 0.40 | 0.40 |

## v1.7.0 release checks

| Check | Result |
| --- | --- |
| `npm run package` | `release/rua10-crazygames-v1.7.0.zip`: 30 files, 6.15 MB unpacked, **2.92 MB zip**; no source maps, no localhost references, relative paths |
| Full suite on the production build (`PREVIEW=1 PORT=4188 npx playwright test`) | **11 passed** (desktop and mobile emulation): free-play home screen, menu → match, pause, switch, skill and flair keys, Gamebreaker, content menus, keyboard bot match |
| The zip itself, extracted and served from a sub-folder, without `?qa` | Free play reached in 11.9 s (software rendering); no test hooks, diagnostics or game global; no page or console errors; no failed requests; **no request outside its own folder** |
| Menu in the shipped build | PLAY, SELECT COURT, HOW TO PLAY, SETTINGS, FREE PLAY |
| Store screenshots | `screenshots/store-1…8-*.jpg` (1280×720, High quality), captured from the extracted zip |

Not checked here: real-GPU frame rate, a real phone, Firefox and Safari, and the CrazyGames QA tool (SDK calls and ads).


## v1.5 — content and presentation

Draw cost of the five courts at Low quality, gameplay camera (`node tools/qa/venues.mjs`, no page errors):

| Court | Draw calls | Triangles |
| --- | --- | --- |
| Brazil | 148 | 379k |
| New York | 115 | 332k |
| London | 116 | 329k |
| Tokyo | 118 | 329k |
| Barcelona | 117 | 330k |

The first switch to a court builds it in 220–460 ms (headless, software GL). Later switches reuse it.

`node tools/qa/modescheck.mjs`:
- First to 5 ends at 5–0 as a win.
- Style Challenge ends as soon as 8,000 style is reached.
- 1 v 1 fields one player per side, with the benched players hidden.
- Tournament: the round 1 win offers "NEXT: SEMI-FINAL". Round 2 moves to the opponent's court at the next AI level, and a draw at the whistle goes to a golden goal, which wins it.

`node tools/qa/tutorialcheck.mjs` played all eight tutorial steps in 37 s of game time and saved `tutorialDone`.

Screens for modes, teams with kit locks, courts and the tutorial card, plus frames for the fall, stumble and celebrations, were inspected from `tools/qa` captures.

## v1.4 — hard AI move set, two-zone keyboard

`node tools/qa/aimatch.mjs hard 2` (two 100 s AI-vs-AI matches, no errors): 4–2 and 3–4. New moves used per match: 8 and 10 lobs, 2 and 5 through balls, 1 slide tackle won in each, 1 bicycle kick in each, 1 volley; flair tricks (elastico, drag-back, sombrero, nutmeg) appear in the trick log. `aimatch.mjs normal 2`: none of the new moves used.

Keyboard: the Playwright test presses I (flair) and H (Gamebreaker) from the right-hand zone; E is still covered as an alias.

## v1.3 — full move set

`node tools/qa/movescheck.mjs` (real controller, scripted intents), all with no page errors:

| Move | Result |
| --- | --- |
| Elastico / drag-back (R, R + back) | start and score as tricks, possession kept |
| Sombrero (R + forward) | ball lifted to 1.36 m over the defender, regained, awarded |
| Lob (hold pass) | apex 2.8 m, controlled by the receiver |
| Through ball (sprint + pass) | flagged `through`, controlled by the receiver |
| One-two (pass, pass again) | receiver returns a first-time through ball to the original passer; control stays with the runner |
| Volley | struck at 1.3 m, 28 m/s, goal |
| Bicycle kick (back to goal) | struck at 1.7 m, 28 m/s, goal |
| Slide tackle (sprint + F) | wins the ball, tackler ends on the floor at low speed |
| Gamebreaker | meter full at 2,600 style, G gives 10 s, shot boost 1.2, keeper penalty 0.32, `gb-on` class set |

Frame rows for the new animations were inspected (bicycle with the body horizontal, slide along the ground, sombrero over the defender). Not re-run after these changes: the AI-vs-AI match script.

## v1.2 — kick-and-catch dribble, readable skills

`node tools/qa/touchcheck.mjs` (3 s per scenario): possession 100% and 0 missed swings in all four scenarios (jog, sprint then jog, zigzag, sprint then release). Player-to-ball distance now cycles between about 0.3 m and 1.0–1.4 m on each touch (v1.1 held it near 0.5 m), touches every 0.3–0.9 s at a jog, mean toe-to-ball at contact 0.40–0.57 m.

`trickcheck.mjs`: rainbow, nutmeg (success and forced fail) and roulette resolve as before. `aimatch.mjs normal 2`: 6–2 and 3–5, AI tricks used, no errors. Live-loop keyboard run (real key events, no hooks): E standing and E while running start a stepover and score it; E without the ball reports "no ball"; no page errors.

## v1.1 — ball control, skills, replay

### Dribble touches (`node tools/qa/touchcheck.mjs`, 3 s per scenario, opponents parked)

| Scenario | Possession | Misses | Mean foot→ball at contact | Touch rhythm |
| --- | --- | --- | --- | --- |
| jog | 100% | 0 | 0.33 m | every ~0.47 s (every other step) |
| sprint, then jog | 100% | 0 | 0.31 m | 0.3–0.4 s while closing, longer knocks at top speed |
| zigzag (stick flips ±40°) | 100% | 0 | 0.38 m | 0.47 s |
| sprint, then release the stick | 100% | 0 | — | runs onto the ball and soles it |

Foot→ball is measured from the `ball_l/_r` toe bone of the swinging leg to the ball centre (ball radius 0.11 m), so a boot-surface contact reads about 0.2–0.35 m. Before v1.1, touches fired on a 0.27 s timer whatever the legs were doing, and a standing player pulled the ball to his feet continuously.

AI-vs-AI (`tools/qa/aimatch.mjs normal 2`): two 100 s matches finished 4–2 and 4–2, with 15 and 11 shots and AI tricks used, and no errors.

### Skills
- `trickcheck.mjs`: rainbow (1.6 m lift, award once past the defender), nutmeg through the legs (+500), forced-fail nutmeg, stepover and roulette all start and resolve.
- `trickmotion.mjs` sheets: `screenshots/v11-tricks.jpg`.
- Mapping fix: **E + forward** with no defender within 0.7 m of the running line used to start a "solo nutmeg", which was a plain forward knock. It is now a stepover-and-go.

### Replay (`node tools/qa/replaycheck.mjs`)
- A real controller shot at 26 m/s is detected at recorded frame 32 of 59.
- Speed ramp: 0.85 → 0.25 around the strike → 0.6.
- Segments: 1 = dolly, 2 = over the shoulder, 3 = behind the net.
- Sheet: `screenshots/v11-replay-sheet.jpg`.


## Phase 5 (release v1.0.0)

### Production build checks

| Check | Result |
| --- | --- |
| `npm run package` | `release/rua10-crazygames-v1.0.0.zip`: 30 files, 6.07 MB unpacked, **2.89 MB zip**. No source maps, no localhost references, relative paths |
| Rapier packaging | compat (base64 inside JS) **1.67 MB gz** → streamed `.wasm` **1.19 MB gz + 52 KB JS** |
| QA gating on the shipped build | without `?qa`: no test hooks, no diagnostics, no `window.__RUA10__`; with `?qa`: all present. No page errors either way |
| Smoke tests against the **production preview** (`PREVIEW=1 PORT=4188 npx playwright test tests/visual.spec.js`) | 5 passed (menu → match, WASD, pause and resume, Q switch, E trick, mobile touch stick) |
| Full suite on dev (`npx playwright test`) | 6 passed. The keyboard bot won 2–1 through goal → replay → kick-off, with 9 tackle attempts |
| Canvas inspector on the production build (`phase5-release`, `?qa`) | **16/16 PASS, all within budget**; `check_evidence.py` passed (21 artifacts including the release zip) |

### CPU cost per frame (`node tools/qa/cpuprofile.mjs`, production preview)

1,800 consecutive 60 Hz frames of AI-vs-AI 3v3 at Medium, without rendering. Each frame covers two 120 Hz Rapier steps, team AI, eight controllers, keepers, animation mixers for the players and the crowd, camera, VFX and replay recording:

| avg | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- |
| **0.44 ms** | 0.40 ms | 0.60 ms | 0.90 ms | 3.1 ms |

That is under 3% of a 16.7 ms frame. Simulation and AI are not the bottleneck; on target hardware the budget belongs to rendering. That cost needs a real GPU, so the game measures it itself with `?bench` (summary card) and `?fps` / F8 (live overlay). The headless `?bench` runs here used SwiftShader, so their frame times are not quoted.

### Scorecard update

Performance evidence goes from **1.5 to 2**, matching the anchor for 2 ("renderer counts, build/browser QA, target-viewport shots, budget notes"):

- per-tier renderer budgets on every pass;
- production-build QA;
- CPU profiling;
- before and after numbers for bundle size and textures;
- built-in GPU timing tools.

It is not a 3, because no real-GPU baseline exists yet.

Averages are **2.35** with **no category below 2**, so the premium bar is met on the anchors. The remaining caveat is frame timing on a real GPU (`?bench`).

## Phase 4 (visual polish)

### Automated tests (`npx playwright test`)

All passing (6 passed, 4 skipped by design). The keyboard bot played a full match through the new flow: goal → **replay** → kick-off, finishing 2–1, with no console or page errors.

### Canvas inspector, production build (`phase4-pass-2`)

**16/16 PASS, all within budget**; `check_evidence.py` passed (20 artifacts, including the four character GLBs). The new `replay` state was captured on desktop, and `goal` on mobile.

| Capture | calls | triangles | textures | Quality |
| --- | --- | --- | --- | --- |
| desktop active-play | 147 | 379k | 56 | Medium (bloom on) |
| desktop replay | 144 | 380k | 55 | Medium |
| mobile active-play | 76 | 193k | 36 | Low (handheld default) |
| mobile goal | 60 | 179k | 36 | Low |

What the passes caught and what was fixed:
- **Wrong draw-call counts with bloom:** `renderer.info` reset on every post pass and reported 1 call. It is now reset once per frame, so the counts above include every pass.
- **Too many GPU textures:** `SkeletonUtils.clone` gave each character three skeletons (body, eyes, brows), so three bone textures each. Eyes and brows are now rigid head props, and duplicate eye and hair textures are shared, taking Low from 67 to 38 textures and Medium from 91 to 56.
- **Mobile over budget at the default quality** (`phase4-pass-1`: 365k triangles and 55 textures on phones). Handheld devices now default to Low, which lands at 193k and 36.
- **Festoons crossing the portrait camera** (seen after `pass-2`). Festoons now fade out within 4–8 m of the lens; `screenshots/p4-mobile-active-play.jpg` is the capture after that shader-only fix (render counts unchanged).

### Characters and motion

- `screenshots/p4-characters-closeup.jpg` and `p4-characters-back.jpg` show the new bodies: painted faces re-tinted per skin tone, rigid eyes and brows, Quaternius and procedural hair, kits with numbers and a thin collar.
- `screenshots/p4-motion-jog.jpg` and `p4-motion-shot.jpg` show the UAL clips and the authored shot on the new skeleton: planted feet while dribbling; backswing, contact and follow-through on the shot.

### Audio

All 24 sounds, including the new four-bar batucada (9.23 s), synthesise in 212 ms in Chromium. RMS per sixteenth over the first bar peaks at positions 4 and 12 (surdo on beats 2 and 4: 0.29 and 0.27), with caixa and agogô in between.

### Visual scorecard (anchors in `threejs-aaa-graphics-builder/references/visual-scorecard.md`)

| Category | Phase 1 | Phase 4 | Evidence |
| --- | --- | --- | --- |
| Art direction | 2 | 2.5 | The Brazilian street identity now runs through bandeirinhas, murals, kits, batucada and UI motifs |
| Hero / player | 2 | 2.5 | Real human bodies with painted faces, re-tinted skin tones, hair and beards, kit, number and crest. Kits are still painted on the body rather than modelled cloth |
| Obstacles (defenders, keepers, goals, cage) | 2 | 2 | Distinct kits and readable states (pressing, wrong-footed, stagger, dive); the cage is unchanged |
| Interactables (ball, goal feedback) | 2 | 2.5 | Trail, dust, net, confetti, bloom pulse and **instant replay** |
| World / environment | 2.5 | 2.5 | Festoons, sidewalk props and mixed crowd add to the existing layers |
| Materials / textures | 2 | 2 | Character PBR (normal and roughness maps). The world is still procedural: Poly Haven was unreachable from this environment |
| Lighting / render | 2 | 2.5 | ACES, warm key and shadows, sky IBL, half-resolution bloom on highlights, vignette |
| VFX / motion | 2 | 2.5 | Event-driven VFX plus replay camera work, swaying festoons, dust motes and UI motion |
| UI / HUD | 2 | 2.5 | Animated entrances, combo badge, replay letterbox, consistent street-sign language |
| Performance evidence | 1 | 1.5 | Per-tier renderer budgets measured on every pass, handheld Low default, one-time auto-downgrade. No real-GPU frame timing is possible here |

Average **2.3**. One category is still below 2: performance evidence, at 1.5. So the premium bar ("no category below 2, average ≥ 2.3") is **not formally met** until frame timing is measured on real hardware (see the bottom of this file). The visual categories themselves all sit at 2–2.5.

## Phase 3 (freestyle tricks)

### Automated tests (`npx playwright test`)

All passing (6 passed, 4 skipped by design: keyboard-only tests on mobile, touch-only on desktop). New test: **E with the ball performs a stepover** through real keyboard input. The keyboard bot still plays full 3v3 matches without errors.

### Trick mechanics (`node tools/qa/trickcheck.mjs`, forced success/fail rolls, real controller and AI)

| Check | Result |
| --- | --- |
| Rainbow flick vs a defender 2.2 m ahead | ball peaks at **1.61 m** and passes over; RAFA wrong-footed; **RAINBOW FLICK +400** once ZÉ collects behind him |
| Nutmeg vs a defender in front | ball passes **through the defender's position** (no body collision during the trick); **NUTMEG +500** when ZÉ is past him with the ball |
| Nutmeg, forced failed roll | ball knocked loose, **FAILED**, combo reset |
| Stepover / roulette vs a pressing defender | defender wrong-footed; **+100 / +250**; AI attackers answer with their own tricks and can wrong-foot ZÉ |

What this probe found and fixed:
- A just-nutmegged defender could still trap the ball, so wrong-footed players can no longer control it.
- Bodies collided during a nutmeg, so the trickster now slips past the victim.
- The nutmeg knock was too long; it is now a 4.4 m/s touch.
- A nutmeg that kept possession was never awarded; awards now trigger once the player is past the defender with the ball.
- A trick interrupted by a tackle was silent; it now shows LOST IT and ends the combo.
- Popups were removed on a fixed timer and could vanish before their animation had played on slow devices; they are now removed on `animationend`.
- The reduced-motion stylesheet ended popups at opacity 0, so players with reduced motion never saw them; reduced motion now uses a readable fade.

### Motion (`node tools/qa/trickmotion.mjs`)

`screenshots/motion-tricks-1.jpg` (stepover, body feint, ball roll, quick cut, roulette) and `screenshots/motion-tricks-2.jpg` (heel flick, rainbow, nutmeg, fake shot). Each row is the trick played against a defender, six frames, side close-up. The roulette shows the full spin, the heel flick sends the ball behind the player and turns him, and the fake shot shows a full backswing that checks over the ball. Combo popups (paused mid-animation): `screenshots/p3-combo-popups.jpg`.

### AI vs AI with tricks (`node tools/qa/aimatch.mjs normal 1`)

A full 3:00 match ended 3–4 with no errors. AI attackers landed a cut and two roulettes under pressure (rates were raised slightly afterwards).

### Canvas inspector, production build

`phase3-pass-2`: **14/14 PASS**, all within budget, and `check_evidence.py` passed (15 artifacts). This run adds the `trick` (roulette mid-spin vs a defender) and `combo` (COMBO x3) states on desktop, and `trick` on mobile.

| Capture | calls | triangles | textures |
| --- | --- | --- | --- |
| desktop trick / combo | 75 | 249k | 34 |
| mobile trick | 65 | 242k | 32 |

The first pass showed the portrait camera framing the player under the touch stick. The attack-bias look-ahead was reduced for portrait, and the player now sits above the controls (`screenshots/p3-mobile-trick.jpg`).

## Phase 2 (3v3)

Same sandbox caveat as below: the GPU is software (SwiftShader), so there is no FPS claim.

### Automated tests (`npx playwright test`)

| Test | Result |
| --- | --- |
| Desktop: menu → match, WASD moves the player, no console errors | ✓ |
| Desktop: Esc pause / resume | ✓ |
| Desktop: **Q switches the controlled teammate** (stand still until the AI wins the ball, press Q; HUD name changes) | ✓ |
| Mobile: touch stick moves the player | ✓ |
| Desktop: keyboard-only bot in the full 3v3 (WASD, J, F tackles, Q switches) | ✓ — the bot lost 1-2, made 11 tackle attempts and 1 switch, and saw goal → kick-off |

### AI vs AI (`node tools/qa/aimatch.mjs <level>`, full 3:00 matches)

| Level | Score | Shots H/A | Passes completed | Tackles (won by ball-winner) | Steals between touches | Possession H / A / loose |
| --- | --- | --- | --- | --- | --- | --- |
| Normal (seed 100) | 2–1 | 9 / 7 | 32 / 34 | 21 (6 won, 3 out of reach) | 11 | 35 / 24 / 41 % |
| Normal (seed 101) | 1–0 | 8 / 6 | 35 / 48 | 27 (8 won, 2 out of reach) | 17 | 34 / 20 / 47 % |
| Easy | 2–3 | 7 / 9 | 31 / 37 | 15 (3 won) | 15 | 23 / 38 / 39 % |
| Hard | 1–2 | 6 / 9 | 53 / 69 | 46 (12 won) | 29 | 30 / 31 / 39 % |

The table tracks the fixes made from this probe. The first runs showed 15 of 29 AI tackles whiffing out of reach; a predictive lunge trigger, a lunge that tracks the ball, and a longer reach brought that to 2–4. Goals also came from carriers dribbling into the net; the keeper's 1-v-1 rush and smother fixed it, and after the fix every goal in these runs came from a real shot. Hard presses about three times as often as Easy, and wins about four times as many tackles.

### Canvas inspector, production build (`phase2-pass-2`)

Result: 11/11 PASS, all within budget. `check_evidence.py` passed.

| Capture | calls | triangles | textures |
| --- | --- | --- | --- |
| desktop active-play / defending | 75 | 249k | 34 |
| desktop goal | 61 | 235k | 32 |
| mobile active-play / defending | 61–62 | 237k | 32–33 |

The first Phase 2 pass went over the mobile texture budget (43–44 > 40). Sharing the sponsor atlas between boards and shop signs, dropping an unused asphalt texture, and moving the shirt numbers into one tinted mask atlas brought it to 32–34.

Screenshots: `screenshots/p2-*.jpg`. Tackle motion: `screenshots/motion-tackle.jpg` shows the lunge, the ball knocked away, and the victim's recoil.

---

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
