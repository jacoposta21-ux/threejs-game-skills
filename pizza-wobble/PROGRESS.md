# Pizza Wobble — Progress

## M0 — Levels ✅
- `src/levels/generator.ts`: deterministic seed-based district generator (grid of blocks, variable road widths, vicoli, merged blocks, plazas with fountains, sea + piers + quay at the port, switchback terraces + stairs on the hill, speed bumps and ramps, traffic loops, delivery doors).
- `src/levels/validator.ts`: A* reachability from the pizzeria, ≥ 4 m corridors (declared widths + 2×2 grid window check), no delivery inside a blocked cell, optimal open tour 250–900 m.
- `src/levels/difficulty.ts`: single formula `0.012·path + 0.45·sharpTurns + 0.3·bumps + 0.4·cars + 0.9·N + 1.2·K`.
- `tools/generate-levels.ts` (`npm run levels`): 30 turns, invalid candidates discarded, seed nearest the target curve chosen, exported to `public/levels/levels.json` (seed + params only).
- Tests: determinism, validator valid/invalid cases, difficulty progression.

## M1 — Playable slice ✅
- Fixed 60 Hz simulation (2 Rapier sub-steps) decoupled from rendering; slow-motion scales sim time.
- Arcade scooter (`src/physics/scooter.ts`): speed/heading model, Rapier character controller (ball collider, rotation-safe) for walls/traffic, analytic vertical motion (curbs, cobbles, bumps, ramp jumps), lean, spring-mounted rack whose sway drives the pile.
- Physical pile (`src/physics/pile.ts`): real Rapier boxes 0.36×0.05×0.36 m, 0.4 kg, friction 0.6 (+15%/rack level), containment lips; lost when touching ground or > 0.5 m from the rack.
- Shift rules: 150 s, delivery under 4 m/s inside the circle (top boxes thrown in an arc), heat 0.4 %/s, tips with time bonus + perfect bonus, 0–3 stars.
- Verified: autopilot completes shift 1 in the browser (3/3 delivered, 0 lost, 3 stars).
- Tuning decisions: normal brake 3.8 m/s² and accel 3.9 m/s² stay under μg (5.9 m/s²); hard brake (Space) 8 m/s² slides the stack if held; head-on hits above ~1.5 m/s relative spill top boxes (by design: "urti").
