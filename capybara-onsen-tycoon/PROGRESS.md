# Capybara Onsen Tycoon — Progress

## M0 — Economy + simulator ✅
- `src/economy/config.ts` — all constants; `model.ts` — pure logic (state, tick, dig, merge, upgrades, offline); `format.ts`; `save.ts`.
- `tools/simulate.ts` — greedy bot (merges whenever possible, digs when payback ≤ 10 min, buys best-payback upgrade, taps 50% of golden guests, no videos). Schedule: 30 min active → [8 h offline → 15 min active] repeated.
- `npm test` → 40 tests pass. `npm run simulate` → every target within ±35% (see table below).

### Balancing (only `config.ts` changed)
With the spec constants the bot reached **L12 in 12 minutes** (L4 1.2 min, L6 3.2 min, L8 6 min). Two structural facts drove the changes:
1. The free pool alone (every 10 s) gives 32 L1-equivalents (= L6) in 5.3 min, so L6 ≈ 10 min is impossible at 10 s.
2. "L10 ≈ 3 h including offline pauses": the 8 h pause after 30 min means wall-clock can't land near 3 h, so L10/L12 are measured on **active + credited offline time** (offline seconds that actually produced, i.e. capped). With a 2 h base cap the 2nd session already starts at 2.5 h credited and the 3rd at 4.75 h, so L10 could only fit inside one 15-min window. A 1 h base cap gives a 2-session window.

| Constant | Spec | Tuned |
|---|---|---|
| free pool interval | 10 s | 22 s |
| dig cost | 5 × 1.07^n | 500 × 1.18^n |
| Hot water cost | 100 × 4^k | 2500 × 5.5^k |
| Better shovel cost | 500 × 12^k | 30000 × 60^k |
| Long rest cost | 1000 × 6^k | 1e7 × 1.5^k |
| offline base cap | 2 h | 1 h |
| starting board | — | 2 level-1 pools (`startPools`, instant first merge) |

Unchanged: production 1 × 2.3^(L−1), offline rate 50%, all effects/maxima, golden guest and boosts.

### Simulator output (seed 12345)
| Level | Active | Active+credited offline | Wall clock | Target | Ratio |
|---|---|---|---|---|---|
| 4 | 1.8 min | | | 2 min (active) | 0.92 ✔ |
| 6 | 8.4 min | | | 10 min (active) | 0.84 ✔ |
| 8 | 24.9 min | | | 35 min (active) | 0.71 ✔ |
| 9 | 37 min | 1.62 h | 8.6 h | | |
| 10 | 59 min | 2.99 h | 17 h | 3 h (credited) | 1.00 ✔ |
| 11 | 1.77 h | 19.8 h | 2.07 d | | |
| 12 | 3.32 h | 2.64 d | 4.14 d | 3 d (credited) | 0.88 ✔ |

Max coins held: 6e9 (< 1e15). Robust across 9 golden-guest seeds (all within tolerance). CSV: `tools/out/simulation.csv`, timeline `tools/out/simulation_timeline.csv`.

## M1 — Playable graybox ✅ (built directly with final art)
- Dig (first empty slot, row by row), free pool every 22 s with progress bar, drag & drop merge / move / swap, level-12 cap, upgrade panel.
- Save: `localStorage` key `cot_save_v1`, every 5 s + `visibilitychange`/`beforeunload`/`pagehide`, try/catch (game continues without saving). Corrupt saves → fresh game (unit-tested).
- Offline earnings + "Welcome back!" popup; debug `?offline=3600`. Background tab: return after ≥ 60 s → offline popup, otherwise the gap is ticked normally; frame dt clamped to 0.25 s.

## M2 — Juice + content + stubs ✅
- 12 capybaras (accessory + water colour per level), album (12 cards, silhouettes for locked), 12 unlockable decorations, golden guest (90–150 s, 8 s crossing, ×3 30 s + optional video ×3 3 min), manual ×2 5-min video boost.
- Merge juice: squash & stretch, tinted splash particles, capybara jumps out, "+X/s" flying text, screen shake; grouped floating coin numbers; animated steam; idle bobbing with phase offset.
- Web Audio SFX (plop pitch rises with level, cling, jingle, click, sparkle); mute saved in the save.
- `services/ads.ts` (`Ads` interface + `StubAds` DOM overlay "AD (stub) – 2 s", `?adfail=1` simulates failure), `services/adPolicy.ts` (midgame: only after a new capybara, never in the first 5 min, ≤ 1 per 3 min — unit-tested), `services/analytics.ts` (`StubAnalytics` → `console.debug`). `gameplayStop/Start` around popups; game paused + muted during ads.
- Debug panel (`D` or `?debug=1`): +1M, spawn level N, time ×10, golden guest now, fill album, reset save.
- Performance: Phaser `Graphics` were re-tessellated every frame (6.2 ms CPU); all UI shapes are now baked canvas textures → **~0.4–0.9 ms CPU per frame**. Particles and floating texts are pooled.

## M3 — Build ✅
- `npm run build` → `dist/` **1.28 MB** (Phaser ≈ 1.27 MB of it), relative paths (`base: './'`), no external requests.
- `npm run preview` + `node scripts/screenshots.cjs http://localhost:4173/ screenshots/preview` → **21/21 checks**, no console errors, mobile 844×390 touch merge OK, smallest button 49.8 px.

## Verification script (`npm run screenshots`, needs a running dev/preview server)
Playwright (environment-provided, used only as a dev tool) checks: start state, mouse + touch drag merge, swap, reload persistence, dig, upgrade, full grid disables Dig, golden guest tap, offline amount = 50% × prod × 3600, rewarded stub reward, failing ad, background tab, mobile button size / no scroll, analytics events, console errors, external requests, CPU per frame.

## Known issues / notes
- Headless Chromium uses SwiftShader (software GPU): ~15 fps there is fill-rate bound (the background alone gives ~36 fps); CPU per frame is < 1 ms. Real-device fps not measured here.
- `screenshots/merge_clip_10s.webm` was recorded headless, so it is choppy; record marketing clips on a real machine.
- `ad_interstitial_shown` and `session_end` are not exercised by the browser script (5-min grace / page unload); the policy is unit-tested.
- Upgrades Shovel 3–5 and Hot Water beyond ~6 are deliberately out of reach before L12 (simulator ends at hot water 6, shovel 2, long rest 6).
- `npm run simulate` uses Node ≥ 22.18 native TypeScript stripping (no extra dependency).
