# Verification record

What was run against this revision, and what was seen. Everything here ran in a cloud sandbox with
**no GPU** (Chromium on SwiftShader, a CPU rasteriser), so functional, pixel and budget results are
valid but **no frame-rate figure from it means anything** — performance on real hardware is still
to be measured.

## Headless race simulation (`npm run sim`)

The real track, physics and AI with no rendering.

- 40 seeded six-snail races: every racer finished (0 DNF), 1 checkpoint reset in total.
- Wins spread over all six profiles (Turbo 10, Shelldon 8, autopilot player 8, Gooey Louie 7,
  Slimothy 5, Escargo 2); average winning time 84.5 s; field between roughly 80 and 115 s.
- A deliberately naive keyboard-style controller (bang-bang steering toward a lane, tuck on a
  downhill, crawl when stalled) finished in 108 s reacting every 50 ms and 126 s reacting every
  200 ms, with no softlocks.
- Top speed about 52 m/s (≈ 190 "km/h") at the kicker; about 1.5 s of air off the big jump.

## Browser tests (`npm test`)

- `tests/visual.spec.ts` — passed. Boots to the menu, canvas is visually varied, How to Play opens
  and closes with ESC, PLAY reaches GO, `W` moves the snail, `SPACE` enters the shell, `ESC` pauses
  (race clock frozen) and RESUME continues, no console or page errors.
- `tests/bot-playtest.spec.ts` — passed. A full race driven only by real key events: crawl, tuck,
  steer, pop out and crawl after stalls, `R` after a stall. All six snails finished, the results
  screen appeared, RACE AGAIN reset every racer and the clock, no console or page errors. The bot's
  own time was 9 min: the sandbox renders about two frames a second, so its key presses lag by half
  a second of game time and it weaves; treat that run as proof the loop completes on real input, not
  as a lap time. The camera, terrain-colour and menu-framing changes made after it are visual only.

## Canvas inspection (`npm run inspect:canvas`, manifest `artifacts/evidence.json`, run `pass-3`)

Six desktop 1280×720 states captured at the medium graphics tier (the inspector's 10 s preparation
deadline cannot be met at the high tier on a CPU rasteriser). All passed; no browser errors.

| State | Colour entropy (bits) | Edge density | Luminance contrast | Draw calls |
| --- | --- | --- | --- | --- |
| menu | 6.57 | 0.331 | 171 | 78 |
| active-play (Leaf Slide) | 6.25 | 0.406 | 187 | 160 |
| root-maze | 6.72 | 0.461 | 198 | 141 |
| big-drop (airborne) | 6.38 | 0.274 | 166 | 200 |
| final-sprint | 6.03 | 0.424 | 175 | 214 |
| results | 4.97 | 0.223 | 200 | 66 |

All render-budget rows were inside the desktop starting budget (300 calls, 750k triangles). At the
high tier the heaviest view measured was the starting grid: about 320 draw calls and 480k triangles.

Screenshots from this pass are in `docs/screens/`.

## Defects found by this verification and fixed

- AI stalled for good against the divider root and at the leaf-shortcut exit → routes now follow the
  side of a divider the snail is actually on; crash recovery crawls clear before rolling again.
- Racers flew off the first banked curve at post-jump speed → wider first curve, taller berms, and a
  shell brake (`S` while rolling) that the AI also uses.
- The big jump over-shot its landing slope → shorter plunge, re-shaped kicker and landing.
- At very low frame rates the snail's squash spring went unstable and the model vanished → the
  spring is sub-stepped.
- A snail returned to the Root Maze checkpoint could not roll over the next hump → hump lowered,
  checkpoint moved back for more run-up.
- The speedometer covered the snail while crawling, and the snail dropped out of frame in flight →
  camera framing reworked.

## Visual scorecard (self-assessed against `visual-scorecard.md`)

| Category | Score | Evidence |
| --- | --- | --- |
| Art direction | 2.5 | one cartoon-garden language across world, snails, HUD and menus |
| Hero / player | 2.5 | modelled spiral shell, soft body, stalk eyes with lids, state animation |
| Obstacles | 2 | roots, mushrooms, pebbles, stump, bridge rails: distinct forms and responses |
| Interactables | 2 | plank ramps, leaf bridge, checkpoints, start / finish arches |
| World | 2.5 | grass walls, flowers, tools, pots, fence, trunks, stream; long views from the jump |
| Materials | 2 | procedural cobble / leaf / grain ground, wood, bark, clear-coated shells |
| Lighting | 2 | sky-lit key / fill / rim, soft shadows, fog depth, no post chain |
| VFX / motion | 2 | surface dust, slime ribbon, boost trail, splashes, stars, speed streaks |
| UI / HUD | 2.5 | badge, gauge, meters, progress bar with rivals, toasts, hints, results |
| Performance evidence | 1 | draw / triangle budgets met; no real-GPU frame timing yet |

Average 2.1. The performance row keeps this short of a "premium" claim until it is profiled on a
real GPU.
