# Evidence — Phase 5 (Galilee, rides, wildlife)

Screenshots and videos are kept out of git (the repo ignores `artifacts/`). This report, the manifest, the JSON reports and the motion sheets are committed. Regenerate the rest with:
- `npm run verify:visual`
- `npm run test:play`
- `npm run test:motion`
- `npm run test:npc-motion`
- `npm run test:roman-motion`
- `npm run test:ride-motion`

All runs used the final production build (`npm run build` + `vite preview` on :4188) in headless Chromium with **software rendering (SwiftShader)**, so FPS numbers are not meaningful (about 1–2 FPS in this container). Pixel, budget and gameplay checks are meaningful.

Simulation-heavy checks fast-forward the fixed 60 Hz step in-page. Player actions use real key input: W/A/D/Shift held while the simulation runs, F to get on and off rides, E, number keys and Q. The circus lap is the one exception: it uses a test autopilot (synthetic W/A/D intents through waypoints), because steering a full oval by hand at software-rendering frame rates would take many minutes.

Phase 1–4 evidence remains in git history.

## Canvas inspector — run `phase5-pass-1`
Manifest: [evidence.json](evidence.json). `check_evidence.py --manifest` → **passed, 22 artifacts confirmed.** **17/17 captures PASS.** All 16 desktop captures are within the desktop render budget (calls ≤ 300, triangles ≤ 750k, geometries ≤ 300).

| Viewport / state | Draw calls | Triangles | Geometries |
| --- | --- | --- | --- |
| desktop / menu (village orbit) | 296 | 636k | 248 |
| desktop / active-play | 229 | 485k | 225 |
| desktop / plaza-life | 264 | 498k | 250 |
| desktop / roman-pursuit | 263 | 505k | 233 |
| desktop / ride-donkey (Joseph's donkey trotting across the square) | 175 | 455k | 193 |
| desktop / ride-chariot (stolen chariot on the circus straight, lap timer running) | 211 | 593k | 127 |
| desktop / region-farm | 105 | 534k | 90 |
| desktop / region-lake (Fishers' Hamlet, jetty, lake) | 80 | 372k | 86 |
| desktop / region-outpost (Castra Galilaea gate and guards) | 173 | 450k | 110 |
| desktop / region-desert (Palm Oasis) | 53 | 229k | 53 |
| desktop / npc-dialogue, pause, map, miracle-push, roman-arrest, night | 136–229 | 459–491k | 117–225 |
| mobile / ride-donkey | 127 | 432k > 300k | 171 |

The mobile capture is over the triangle budget; mobile is not a target.

## Real-input playtest — run `phase5-pass-1`
[results.json](phase5-pass-1/playtest/results.json) — **59/59 PASS** and no console or page errors.

The suite has 12 Phase 1, 10 Phase 2, 9 Phase 3 and 14 Phase 4 checks; the Phase 4 garrison check now expects 12 soldiers. It adds 14 new Phase 5 checks:

1. **Fort garrison:** 12 soldiers on duty, the 4 fort posts manned, and every navigation anchor reachable (419 nodes).
2. **Getting on:** the F prompt reads "Ride Joseph's donkey"; F mounts it, and the riding panel shows the name.
3. **Riding:** W trots (about 5 m/s), Shift gallops, and D steers right. The rider sits on the saddle.
4. **Trampling:** a galloping donkey hits a villager. Events: `vehicle:hit`, then `npc:trampled`, and the knocked-down count goes up.
5. **Getting off:** F puts Jesus beside the donkey with his collider back on, and walking works again.
6. **Water:** a galloping ride stops at the lake shore (`vehicle:refuse`); its centre stays in shallow water.
7. **Chapter II:** all 8 new places are discovered, with correct region labels; `mission.explore-galilee` completes.
8. **Map edge:** a sprint west stops at the ±204 m boundary, with a toast.
9. **Chariot theft:** the prompt reads "Steal the Roman chariot". The stable guard sees the theft: crime `chariot`, 2★, and `chariotsStolen` goes up.
10. **Pulled off:** pursuing legionaries grab the rider and drag him off (`vehicle:exit`, reason `pulled`).
11. **Circus:** a full lap through the white line is timed (about 16 s on the farm horse at a trot), and the best lap is saved.
12. **Wildlife:** pigeons burst off the square, goats flee on Goat Hill, the camel caravan walks its loop, fish leap near the hamlet, and there are 33 birds.
13. **Water to Wine on the oasis pond:** real 3 + Q.
14. **Save and Continue:** ride stats (rides, distance ridden, best lap, chariots stolen) and Chapter II persist. You load in on foot, and the camel is back at the camp.

## Motion
- [ride-motion-sheet.png](phase5-pass-1/motion/ride-motion-sheet.png):
  - Joseph's donkey from a standstill to a gallop across the square.
  - The chariot's two-horse gallop gait with spinning wheels on the circus straight.
  - Pigeons taking off as Jesus walks onto the square.
- [motion-sheet.png](phase5-pass-1/motion/motion-sheet.png), [npc-motion-sheet.png](phase5-pass-1/motion/npc-motion-sheet.png) and [roman-motion-sheet.png](phase5-pass-1/motion/roman-motion-sheet.png): Phase 1–4 motion, re-shot on the Phase 5 build.

## Defects found during this pass and fixed
- **Geometry and draw calls over budget:**
  - The first Phase 5 build used 304–341 geometries.
  - **Fix:**
    - Sites are batched into 4 regional meshes.
    - Mount geometries are cached and shared.
    - The Jesus model's static parts are merged per pivot and material (39 → 24 meshes).
  - Splitting grass into 60 m chunks added about 20 draw calls in wide views. Larger chunks (140 m) and hiding grass beyond about 110 m fixed it.
- **Fort stable guard facing away from the chariots:** the guard couldn't witness a theft, so his post now faces the chariots.
- **Prompt text:** read "Steal the the Roman chariot" and "You climb onto the joseph's donkey"; both are fixed.
- **Joseph's donkey parked in a cramped corner:** a gallop ran straight into a wall. It's now parked on clear ground found by a shape-cast search, and scaled up so it reads under the rider.
- **Caravan could stall:** a leader that makes no progress for 4 s now moves on to the next waypoint.
- **Test states (captures only):**
  - Rides were culled from the pre-move camera, so the menu drew all 10 rides (about 100 extra draw calls).
  - Overlay states (pause, map, arrest) left the camera mid-transition.
  - Two regional framings pointed away from the subject.
- **Older tests now frame-rate independent:** the bigger world renders more slowly, which exposed timing assumptions.
  - Waits now count simulated seconds, not rendered frames.
  - Toasts are watched rather than read late.
  - Diagnostics are read only after a frame publishes them.
  - A villager is pinned (or moved away) where a check needs a fixed setup.

## Budgets
- **Rides:** each is one kinematic cuboid moved by its own Rapier character controller only while ridden. Parked rides are static obstacles. Rides are hidden beyond 140 m and stop casting shadows beyond 45 m. A donkey is about 7 draw calls; a chariot with its horses is about 15.
- **Regions:** 4 batched meshes (one per region per material), plus a few animated extras: campfire flames, SPQR flags and signs.
- **Wildlife:** birds and fish are one InstancedMesh each, so 2 draw calls in total. Goats and camels are about 1 draw call each.

## Not verified
- Real-GPU frame rate and audio in a headed browser (hooves, brays, whinnies, bleats, pigeon wings).
- Long riding sessions across the whole map with a 5★ chase.
- Mobile/touch input (not a target).
