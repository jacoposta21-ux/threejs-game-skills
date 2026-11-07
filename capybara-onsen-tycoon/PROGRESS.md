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
