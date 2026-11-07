# Pizza Wobble — Progress

## M0 — Levels ✅
- `src/levels/generator.ts`: deterministic seed-based district generator (grid of blocks, variable road widths, vicoli, merged blocks, plazas with fountains, sea + piers + quay at the port, switchback terraces + stairs on the hill, speed bumps and ramps, traffic loops, delivery doors).
- `src/levels/validator.ts`: A* reachability from the pizzeria, ≥ 4 m corridors (declared widths + 2×2 grid window check), no delivery inside a blocked cell, optimal open tour 250–900 m.
- `src/levels/difficulty.ts`: single formula `0.012·path + 0.45·sharpTurns + 0.3·bumps + 0.4·cars + 0.9·N + 1.2·K`.
- `tools/generate-levels.ts` (`npm run levels`): 30 turns, invalid candidates discarded, seed nearest the target curve chosen, exported to `public/levels/levels.json` (seed + params only).
- Tests: determinism, validator valid/invalid cases, difficulty progression.
