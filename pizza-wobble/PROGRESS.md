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

## M2 — World & graphics ✅
- Procedural town per district (`src/world/city.ts`): 1 m terrain with a painted ground atlas (sampietrini, slabs, asphalt, grass), merged building shells (plinth, string course, cornice, quoins, chimneys, gable/hip/flat coppi roofs), instanced windows (open/closed sage shutters), balconies with geraniums, arched doors, lamps with glowing lanterns, parked scooters, laundry lines swaying in a vertex shader, plaza fountains with animated water, café tables + umbrellas, string lights, pigeons that take off, harbour sea shader, quay curbs, bollards, crates, bobbing boats, gulls, lighthouse, hill cypresses/olives, stairs, speed bumps and ramps.
- Golden-hour DirectionalLight with 2048 shadow map following the player (texel-snapped), hemisphere fill, sky-gradient PMREM env, fog in sky colour, pmndrs post: bloom (threshold 0.92, lanterns/rings only), ACES tone mapping, vignette, SMAA. Low quality: no post, 1024 shadows, DPR 1, fewer details.
- Self-review round 1 (screenshots `screenshots/r1-*` → `r2-*`):
  1. Guide arrow rendered as a yellow slab (wrong Euler order) → `YXZ`, tilted toward camera.
  2. Rider read as a white "snowman" blending with the boxes → sage polo, yellow helmet with red stripe.
  3. Cobbles too grey/dark → warmer stone colour and lighter atlas.
  4. Traffic car looked like a white brick with a black box on top → body-colour roof, glass bands, hubcaps.
  5. Floating horizontal stair railings on the hill → removed.
  6. Harbour/hill shots indistinguishable from the old town → captured on the quay (sea, boats, gulls) and up a switchback; hill houses biased to whites/creams.
  7. Garage camera inside a wall/under the panel → showroom pose at the pizzeria, scooter framed on the left; arrow hidden in menus; 3D labels clamped on-screen; steam puffs smaller.

## M3 — Full game ✅
- 30 shifts from `levels.json`, district unlocks at 18/40 stars, sequential shift unlocks, traffic (cars + Ape on fixed loops, pause at intersections, stop behind the player/other cars, honk), garage with 4 upgrades, title/select/pause/end/garage/settings, save `pw_save_v1` (sanitised, try/catch), WHOA near-miss slow-mo (0.3 s at 0.3×, camera push-in), lost box flies open and the pizza spins out, delivery toss + coins to HUD + confetti, sparks/dust/steam/puddle splashes, synthesised audio with persisted mute, ads/analytics stubs with all events.
- `npm run smoke` (tools/smoke.mjs): 25/25 checks pass through real clicks/keys (menus, Escape/blur pause, corrupted save, rewarded double tips, garage purchase, next shift, F1 debug + teleport, analytics events, no console errors).

## M4 — Build & polish ✅
- Self-review round 2 (final `screenshots/*.png` vs round-1 `screenshots/r1-*.png`):
  1. Pile hard to read from the chase cam → box sides painted cream with a red band; chase camera closer (4.7 m, 2.35 m high).
  2. Scooter headlight and harbour lighthouse lamp rendered black (emissive material relied on vertex colours absent from those geometries) → dedicated HDR lamp material (blooms).
  3. Guide arrow covered the scene during the WHOA push-in → hidden while zoomed.
  4. Garage showroom still too tight → camera pulled back/up, scooter framed left of the panel with a full stack.
  5. Per-frame HUD allocations removed (stop views are mutated in place).
- Auto quality: average FPS of the first 5 s of the first shift; < 45 → Low (no post, DPR 1, 1024 shadows, no balconies/laundry). Settings: Auto/High/Low.
- `npm run build`: 5.1 MB total (`index.js` 5.2 MB incl. ~2 MB Rapier WASM inlined; gzip 1.9 MB), relative paths, no runtime network requests, loading screen with progress bar.
- `npm run preview` + Playwright at 1280×720 and 844×390 (mobile, touch): no console errors.
- Measured (headless Chromium with SwiftShader software GL — no GPU in this environment, so FPS here (~1) is not representative): draw calls 57–106 (High peak 106 in the harbour, Low 57), triangles 297k–466k High (incl. shadow pass), 197k Low; simulation CPU 0.49 ms per fixed step (scooter + pile + traffic + rules).

## Open questions — defaults taken
- **Name**: web search found no "Pizza Wobble" on CrazyGames (closest: "Pizza Challenge", "Pizza Car", "Where's my Pizza?"; the tray-balancing "Woozy Waiter" on Kiz10 is the nearest concept). Kept "Pizza Wobble". Alternatives if needed: **Stack & Scoot**, **Wobbly Delivery**, **Piazza Dash**.
- **Language**: English, all text in `src/strings.ts`.
- **Customers**: faceless, varied shirts/skin tones and hats (cap, straw hat, beret, hair).
- **Music**: none; synthesised SFX + soft ambience only.
- **SDK**: not integrated; `Ads`/`Analytics` interfaces + stubs in `src/services/`.
- **Tips**: computed per pizza (`10 × heat/100 × time bonus`) summed per stop, +5 once per stop if perfect (no hits/hard landings since the previous delivery).
- **Stars "100% without losses"**: a pizza recovered with the rewarded ad no longer counts as lost.
- **Shift unlocks**: inside a district, shift n+1 unlocks after ≥ 1 star on shift n; districts by total stars (18 / 40).
- **Interstitial**: offered on Next/Retry from the end screen, never before shift 4, max once per 3 minutes.

## Known issues / limits
- 60 fps (laptop) and ≥ 30 fps (budget Android, Low) are not verified on real hardware here; only software-GL captures and renderer counters were possible.
- Rapier's JS API returns small wrapper objects (`translation()`, `rotation()`), so a few allocations per frame remain inside the physics bindings; game code itself reuses buffers (particles pooled).
- Difficulty is intentionally physical: holding Space at top speed or a head-on hit above ~5 km/h slides the upper boxes off; normal brake/accel stay below the friction limit. Needs human playtesting for tuning.
- The hill district reads mostly through slopes, stairs, cypresses and lighter facades; there are no long-distance valley vistas.
- Bundle is one 5 MB JS file (Rapier WASM inlined by the compat package).
