# God's Intern — verification report (v0.3, "The Divine Civilization Update")

All checks ran in a cloud Linux container **without a GPU**. Chromium rasterized with
SwiftShader (software), so frame rates measured here are **not** representative. The
pixel checks, renderer counts, CPU/simulation timings and gameplay/UI checks are valid.
**60 FPS on a typical desktop GPU has not been measured.** It is a target, not a
verified result. The v0.2 report is kept in [`VERIFICATION-v0.2.md`](VERIFICATION-v0.2.md).

## Baseline before v0.3 (v0.2 + single-file build, commit `064d6af`)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean |
| Unit tests | ✅ 55/55 |
| Production bundle | JS 868.98 kB (247.46 kB gzip), one chunk |

## Results after v0.3

| Check | Command | Result |
| --- | --- | --- |
| Typecheck (src + tests) | `npx tsc --noEmit -p .` | ✅ no errors |
| Unit tests | `npm run test:unit` | ✅ **76/76**: 55 existing + 21 new in `tests/unit/civilization.test.ts` (~8 s) |
| v0.1 real-input playtest | `tests/e2e/playtest.spec.ts` | ✅ passes (5.2 min), after one test-timing fix (see below) |
| v0.2 real-input playthrough | `tests/e2e/culture.spec.ts` | ✅ passes unchanged (4.5 min) |
| **v0.3 playthrough** | `tests/e2e/civilization.spec.ts` | ✅ passes (9.6 min) |
| Canvas inspector | `node scripts/inspect-threejs-canvas.mjs --manifest artifacts/evidence.json --url "http://127.0.0.1:5188/?fresh=1&quality=high" --seed 42` | ✅ **19/19** states PASS, render budget ok. The 13 v0.2 states plus `civilization`, `trade`, `rockbottom`, `drizzleville`, `villages` and `challenges` |
| Evidence manifest | `python3 ../../skills/threejs-game-director/scripts/check_evidence.py . --manifest artifacts/evidence.json` | ✅ 19 captures confirmed (run `v03-pass-1`) |
| Production build | `npm run build` | ✅ two chunks (see Bundle) |
| Single-file build | `npm run build:single` → `dist-single/index.html` | ✅ 1.34 MB. Loads from `file://` with 0 console errors and 0 external requests; 3 villages populated; test hooks absent |

## New unit tests mapped to the requested list

| # | Requested | Test |
| --- | --- | --- |
| 1 | Village initialization | `1.` three villages; 20/16/14 villagers; distinct identities; styled buildings; quarry and fishery; relations for each pair; overland routes between all villages |
| 2 | Resource independence | `2.` a soaked well raises only its own village's water; a miner's stone goes only to Rockbottom |
| 3 | Relationship calculations | `3.` changes are bounded per cause and clamped to ±100; negative causes are recorded; shared faith versus split faith (Δ43); recent trade raises the target |
| 4 | Relationship thresholds | `4.` exact category boundaries; `RELATIONSHIP_CHANGED` fires only on transitions |
| 5 | Trade eligibility | `5.` surplus→need deal; hostile pairs suspended; no deal without surplus; aid only between friends in an emergency |
| 6 | Resource conservation | `6.` full physical round trip over the bridge with production frozen; totals (including goods on the road) are checked every simulated second |
| 7 | Trade interruption | `7.` merchants die outbound → cargo refunded; die inbound → payment still reaches the origin; save/load mid-trip → completes with no duplicates |
| 8 | Migration eligibility | `8.` push and pull scores; hostile or full destinations refused; cooldown; villages of ≤5 never lose people |
| 9 | Migration completion | `9 & 10.` the villager physically walks to Rockbottom and is rehomed there; populations update |
| 10 | Identity preservation | `9 & 10.` the same object keeps its id, name, traits, memories, mutation and age; no duplicates |
| 11 | Cross-village religion spreading | `11.` a travelling believer converts someone in Drizzleville → exactly one `RELIGION_SPREAD`; relations scale conversion (allied > 4× hostile) |
| 12 | Religious rivalry | `12.` an argument across villages costs −2 and adds a rivalry; different dominant faiths drift relations down |
| 13 | Divine favor calculations | `13.` real rain and lightning produce +/− favor; separate sums; rolling window; balance clamp; bounded log |
| 14 | Favoritism detection | `14.` complaint text, Equal Treatment prayer, relation penalty, cooldown; the prayer completes on real favor |
| 15 | Challenge unlocking | `15.` easy → medium after the tutorial → hard after 3 real completions |
| 16 | Challenge progress | `16.` locked challenges ignore events; progress is read from player-grown trees |
| 17 | Challenge completion | `17, 18 & 19.` Divine Tourist completes from camera dwell; one `CHALLENGE_COMPLETED` |
| 18 | Reward application | same test: energy, approval, title, selected title, history |
| 19 | Duplicate reward prevention | same test: re-apply, re-emit and keep updating → no change; completed challenges can't be pinned |
| 20 | Duration-based challenges | `20.` Equal Opportunity: time accumulates, **resets** on imbalance, then completes after 120 s |
| 21 | Challenge persistence | `21.` status, `rewardApplied`, held seconds, titles, pins and visited survive save/load; no re-grant |
| 22 | Save migration from v0.2 | `22.` Puddleton villagers, religion, sacred place and history kept; 16+14 settlers added; ids unique; idempotent on re-save |
| 23 | Save migration from v0.1 | `23.` same through v1→v2→v3 |
| 24 | Long-running stability | `24.` 30 simulated minutes with an intervention every minute: caps, bounds, finite values, unique ids, ≥1 trade, no village wiped out |

## Browser playthrough (`tests/e2e/civilization.spec.ts`)

Real mouse and keyboard drive navigation, the village selector, the challenge panel,
filters, pins, the settings menu, divine powers, the Book, and save/reload/load.

| Requested | How it is verified | Run result |
| --- | --- | --- |
| All three villages render | diagnostics show 3 populated villages and ≥6 buildings each; the inspector captures `rockbottom`, `drizzleville` and `civilization` pass the pixel checks | ✅ |
| Villagers move autonomously | real time, 6 s, no fast-forward: positions compared, movers in ≥2 villages | ✅ 15 moved (pre-dawn start) |
| Camera navigation | hold `D` → camera pans; `V` → click each village chip → camera arrives within 8 units | ✅ |
| A challenge progresses and completes | Divine Tourist via real navigation → toast "DIVINE TOURIST"; title shown in the profile | ✅ |
| Rewards applied once | `rewardApplied`, a single title entry, no repeated completion events | ✅ |
| Divine favoritism produces a reaction | 22 trees planted with real clicks around Puddleton → `FAVORITISM` → the jealous village complains and an Equal Opportunity prayer appears | ✅ Drizzleville complained (Puddleton favor 40) |
| A trade expedition completes | merchants seen walking in real time, then fast-forward until a trade completes | ✅ after 45 simulated s |
| A relationship changes / a villager migrates / a religion spreads | religion founded with a real lightning click on the plaza rock; then fast-forward until a category change, a migration and a spread | ✅ within 150 simulated s: Drizzleville↔Rockbottom became Friendly; 2 migrations; 2 faith spreads; 8 trades |
| History records it | Book → Civilization tab shows the summary, "The First Trade" and "Was Founded" | ✅ |
| Save/load preserves the new systems | menu Save → reload page → Load: relations, challenges, titles, pins, stats, caravans, villager count and unique ids equal | ✅ |
| No runtime errors | console and page errors collected for the whole run | ✅ 0 |

By the end of the run, 8 challenges had completed naturally:
- Amateur Botanist, The First Believers and Divine Tourist;
- International Relations, The Traveling Merchant, Cultural Exchange, New Neighbors and The Great Pilgrimage.

Screenshots and metrics are in `artifacts/playtest-v03/`.

### Test shortcuts (all reported)
- **Skipped tutorial.** `?skipTutorial=1` starts after the tutorial; the tutorial is
  covered by the other two specs.
- **Fast-forward.** `simulate(seconds)` advances the real fixed-step simulation for slow
  social processes: trade round trips, migration, religious spread and relationship
  drift. Same code path, just more steps per frame.
- **Starting a trade.** The spec first follows a caravan the villages started on their
  own. Only if none is on the road does it call `planTrade()`, which runs the real
  planner immediately instead of after its 12 s timer.
- **Unlimited energy.** Turned on through the real Settings menu so energy does not cap
  the tree-planting spree.
- **Unit tests stage some conditions directly.** Examples: setting stock levels, moving
  a preacher next to Drizzleville, freezing production to isolate trade conservation,
  and favor calls for the duration test. The mechanics under test (planner, AI travel,
  conversion, detection, challenge tracking) always run unmodified.
- **v0.1 spec change.** `playtest.spec.ts` now accepts the `FLASH FLOOD!` notification
  (emitted only at flood ≥ 0.25) as an alternative to sampling the flood level. With
  three villages, software rendering is slower and diagnostics sample less often, so
  the flood peak (0.56 measured headless) fell between samples; the notification was
  on screen in the failure capture.

## Bundle

| | Before (v0.2) | After (v0.3) |
| --- | --- | --- |
| JavaScript | 868.98 kB / 247.46 kB gzip, 1 chunk | **948.6 kB / 273.6 kB gzip** in 2 chunks: `index` 380.8 kB (129.0 gzip) + `three` 567.9 kB (144.6 gzip) |
| CSS | — | 43.4 kB (9.7 kB gzip) |

- **Why it grew.** About +80 kB of new game code (civilization systems, challenges,
  panels, settlements, decor).
- **The split.** three.js was split into its own vendor chunk with `manualChunks`. The
  entry `modulepreload`s it, so both load in parallel. Engine bytes stay cached across
  game updates, and no single chunk exceeds 600 kB.
- **Lazy loading was investigated and not adopted.**
  - three.js is needed for the first frame.
  - The new panels are a few kB each.
  - `lil-gui` is not imported at all.
  - Deferring a few kB of UI would add a loading path without a measurable win, so it
    was not done (reliability over size).

## Performance observations (SwiftShader, 1280×720, high quality)

| State | Draw calls | Triangles | Sim ms/step (avg, browser) | Frame CPU ms |
| --- | --- | --- | --- | --- |
| active-play (Puddleton) | 95 | 248k | 0.62 | 3.3 |
| civilization (whole island, 2 caravans, 4 travellers) | 124 | 256k | 0.65 | 3.0 |
| overview | 122 | 256k | 0.79 | 2.8 |
| rockbottom close-up | 69 | 241k | 0.36 | 3.0 |

- **Simulation cost in Node.** A headless 20-minute three-village run took about
  0.05 ms per 20 Hz step on average (max about 6 ms during A* path bursts). The browser
  numbers above include instrumentation.
- **Where the time goes.** Frame time in this container is dominated by software
  rasterization (`renderSubmitMs` 20–27 ms); CPU-side work is about 3 ms per frame.
- **Limits.**
  - Population is capped at 90.
  - At most 3 caravans and 4 active religions.
  - At most 1 migration per 70 s.
  - Diplomacy updates every 5 s; favoritism checks every 5 s.
  - The favor log is bounded to 240 events.
  - History is bounded to 80 entries.
- **Staggering.** Challenge checks run every 0.5 s (durations per tick). All are
  staggered and cheap.
- **New monitoring.** `window.__THREE_GAME_DIAGNOSTICS__.counts` and the `` ` `` overlay
  now report villagers, caravans, travellers, rituals and particles.

## Known limitations
- **Frame rate.** Real-GPU FPS not measured; 60 FPS is unverified.
- **Mobile.** Mobile layout was checked only by CSS breakpoints. The new panels are
  usable at narrow widths but were not tested on a touch device.
- **Village-specific events.** Some v0.2 surreal events and the Department of Miracles
  remain Puddleton-centred by design. They now trigger prayers only for Puddleton.
- **Long challenges.** Several hard challenges (The Golden Kingdom, The Worst Intern
  Ever, The Peace Treaty, Diplomatic Disaster) are reachable through normal mechanics
  but take long, deliberate play. Their objectives are covered by the unit-tested
  tracking machinery, not each by an end-to-end run.
- **CrazyGames SDK.** Still not integrated; see the README.
