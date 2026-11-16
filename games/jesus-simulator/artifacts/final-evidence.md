# Evidence — Phase 3 (miracles)

Screenshots and videos are kept out of git (the repo ignores `artifacts/`). This report, the manifest, the JSON reports and the motion sheets are committed. Regenerate the rest with:
- `npm run verify:visual`
- `npm run test:play`
- `npm run test:motion`
- `npm run test:npc-motion`

All runs used the production build (`npm run build` + `vite preview` on :4188) in headless Chromium with **software rendering (SwiftShader)**. In this container session SwiftShader renders at about 2 FPS. I verified this by comparing against the committed Phase 2 build on the same machine: both ran at 1.75 FPS, and without rendering the game runs at 36–39 FPS (about 25 ms of JavaScript per frame). FPS numbers here are therefore not meaningful; pixel, budget and gameplay checks are. Simulation-heavy checks fast-forward the fixed 60 Hz step in-page, but every player action uses real key input: number keys to select, **Q** to cast and hold.

Phase 1 and 2 evidence remains in git history.

## Canvas inspector — run `phase3-pass-1`
Manifest: [evidence.json](evidence.json). `check_evidence.py --manifest` → **passed, 15 artifacts confirmed.**

| Viewport / state | Result | Budget |
| --- | --- | --- |
| desktop / menu, active-play, plaza-life, npc-dialogue, pause | PASS | ok |
| desktop / miracle-push | PASS | ok |
| desktop / miracle-multiply | PASS | ok |
| desktop / miracle-wine | PASS | ok |
| desktop / miracle-water | PASS | ok |
| desktop / miracle-heal | PASS | ok |
| desktop / miracle-levitate | PASS | ok |
| mobile / miracle-multiply | PASS | over: triangles 402k > 300k, geometries 238 > 200 (mobile is not a target) |

## Real-input playtest — run `phase3-pass-1`
[results.json](phase3-pass-1/playtest/results.json) — **31/31 PASS**: 12 Phase 1 regressions, 10 Phase 2 checks, and 9 Phase 3 checks:

- **Locked miracles:** pressing 2 then Q before any reveal does nothing and shows a "not yet revealed" toast.
- **Reveal:** reaching the workshop reveals Divine Push (banner, slot auto-selected).
- **Divine Push:** Q shoves a villager 1.84 m; an immediate second Q is refused by the cooldown (exactly 1 cast).
- **Multiplication:** Q on Eli's bread gives 2 copies; holding Q gives 22; 70 forced casts stay **capped at 80**.
- **Water to Wine:** the well turns to wine and Faith goes 0 → 4.
- **Healing Touch:** Benjamin's chronic knee is cured and Faith goes 4 → 9.
- **Holy Levitation:** holding Q lifts a villager to y = 3.70; releasing sets them down at y = 1.28 (ground ≈ 1.2).
- **Walk on Water:**
  - Wading stops at 1.33 m depth.
  - After casting, Jesus walks out onto the lake (`onWater` = true, y = 0.04).
  - When the miracle expires over deep water, Jesus sinks and is placed on the dock (x = 106).
- **Persistence:** all 6 revealed miracles survive Save & Quit → Continue.
- **Errors:** no console or page errors.

## Motion
- **Player locomotion:** [motion-sheet.png](phase3-pass-1/motion/motion-sheet.png).
- **NPC life:** [npc-motion-sheet.png](phase3-pass-1/motion/npc-motion-sheet.png) — a regression check that kids greet Jesus, play tag and villagers chat.

## Defects found by the tests and fixed in this pass
- **Audio exception:** the Web Audio envelope threw on zero-gain sounds (distance attenuation to 0). Because it was inside an event handler, a distant pot shattering could throw mid-frame. Envelopes are now floored and silent sounds skipped.
- **Wading leak:** wading only slowed you in deep water, so you could creep ever deeper. Deeper motion is now cancelled past 1.3 m, with a drift back to shore past 1.5 m.
- **Submerged cast:** casting Walk on Water while submerged left Jesus on the lake bed under the walkable surface. Casting now lifts him onto the water.
- **Dawn crash:** a stale NPC `travel` phase at dawn caused a re-path to a null step (crash). Phases are reset on block change and null steps guarded.
- **Bad anchors:** the well-water and trough-water spots were registered as NPC destinations inside colliders. Only standing spots become anchors.
- **Unreachable home:** one villager's home door was unreachable. Homes are now reassigned to reachable doors.
- **Wine targeting:** the fallback measured to a target's centre, not its edge, so you couldn't target the well from its rim.

## Budgets
- **Effects:** 900 particles (one draw call) plus 14 rings.
- **Bodies:** 80 multiplied copies per kind are pre-created and disabled until used; shards stay at 48.
- **Pre-created colliders:** the lake surface collider is created once and toggled with `setEnabled`.
- **Totals and cost:** about 321 bodies and 904 colliders in total; the desktop gameplay view uses about 207 draw calls and about 420k triangles (within the desktop budget).

## Not verified
- Real-GPU frame rate.
- Audio in a headed browser.
- Long play sessions with heavy miracle use beyond the tested caps.
