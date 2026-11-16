# Evidence — Phase 4 (Roman system)

Screenshots and videos are kept out of git (the repo ignores `artifacts/`). This report, the manifest, the JSON reports and the motion sheets are committed. Regenerate the rest with:
- `npm run verify:visual`
- `npm run test:play`
- `npm run test:motion`
- `npm run test:npc-motion`
- `npm run test:roman-motion`

All runs used the final production build (`npm run build` + `vite preview` on :4188) in headless Chromium with **software rendering (SwiftShader)**, so FPS numbers are not meaningful (about 2 FPS in this container, the same as the Phase 2 and 3 builds). Pixel, budget and gameplay checks are meaningful. Simulation-heavy checks fast-forward the fixed 60 Hz step in-page; every player action uses real key input: W/Shift, E, number keys and Q.

Phase 1–3 evidence remains in git history.

## Canvas inspector — run `phase4-pass-1`
Manifest: [evidence.json](evidence.json). `check_evidence.py --manifest` → **passed, 18 artifacts confirmed.** **14/14 captures PASS.**

| Viewport / state | Draw calls | Triangles | Geometries | Budget |
| --- | --- | --- | --- | --- |
| desktop / active-play | 219 | 446k | 209 | ok |
| desktop / plaza-life | 262 | 471k | 244 | ok |
| desktop / roman-pursuit (3★, legionaries closing in) | 256 | 474k | 224 | ok |
| desktop / roman-ragdoll | 214 | 442k | 180 | ok |
| desktop / menu, npc-dialogue, pause, miracle-push, miracle-levitate, roman-patrol, roman-checkpoint, roman-arrest, night | — | — | — | ok |
| mobile / roman-pursuit | 171 > 150 | 432k > 300k | 180 | over (mobile is not a target) |

## Real-input playtest — run `phase4-pass-1`
[results.json](phase4-pass-1/playtest/results.json) — **45/45 PASS** and no console or page errors.

The suite has 12 Phase 1, 10 Phase 2 and 9 Phase 3 regression checks; those run with the garrison off duty (`romans.setActive(false)`) so a patrol can't interfere with them. It adds 14 new Phase 4 checks:

1. **Garrison:** 8 soldiers on duty, the 4 patrol soldiers walk their routes, and all navigation anchors are reachable.
2. **Talk (E):** "Talk to Legionary Flavius", answer 2 (an explanation of how chases work), Esc leaves.
3. **Line of sight:** a soldier sees Jesus in the open, but not when Jesus is behind the lookout house.
4. **Witnessed crime:** with Q, Divine Push blasts two villagers in front of a legionary. They become ragdolls, the attention goes to 1★, the soldier gives chase and the HUD turns red.
5. **Villager recovery:** ragdolled villagers stand back up (collider back on, sane height).
6. **Ragdolled legionary:** Q on a legionary makes him a ragdoll; he flies 4.3 m and attention goes 1★ → 2★. He gets up bruised and goes back to searching.
7. **Healing Touch on him:** attention drops 2★ → 1★ and he turns friendly.
8. **Escape:** Jesus sprints away down the south road and stays out of sight. The search runs out, the stars drop to 0, an escape is counted and the "You lost them" toast shows.
9. **3★ escalation:** reinforcements spawn 15–26 m away and pursue, with 6 soldiers on the hunt.
10. **Seized:** the grab bar shows (it peaked at 0.33). Q (Push) breaks free: the grabber ragdolls and the bar drains.
11. **Water to Wine:** the pursuing legionary becomes `distracted`.
12. **Arrest:** Jesus stands still next to two pursuers. The ARRESTED card appears, E continues, he is released at the checkpoint barrier with the stars at 0, the arrest counted and the Faith fine applied.
13. **Trespass:** Jesus walks through the camp gate. A warning event fires, then the attention goes to 1★.
14. **Persistence:** after Save & Quit and Continue, arrests (1), escapes (1) and the highest attention (5★) persist, and the wanted level resets to 0.

## Motion
- **Player locomotion:** [motion-sheet.png](phase4-pass-1/motion/motion-sheet.png).
- **NPC life:** [npc-motion-sheet.png](phase4-pass-1/motion/npc-motion-sheet.png).
- **Romans:** [roman-motion-sheet.png](phase4-pass-1/motion/roman-motion-sheet.png).
  - Six chase frames: legionaries with "!" converge on Jesus, a kid shouts "RUN, YESHUA!", and the last frame is the grab ("Got you!").
  - Six ragdoll frames: launch, tumble, landing and getting back up (t = 0.08 → 2.2 s).

## Defects found during this pass and fixed
- **Stale ragdoll start:** a ragdoll launched from the last *rendered* rig position instead of the soldier's simulated position, so a soldier placed or moved in the same frame flew from the wrong spot. The rig is now synced before spawning.
- **Exploding ragdolls:** overlapping limb boxes pushed each other apart at launch. A collision group now keeps ragdoll parts from colliding with each other.
- **Overly harsh escalation:** one Push into a crowd near a soldier jumped straight to 3★. The "blasting citizens" heat now counts at most two victims per cast.
- **Free ground during pause:** soldiers kept moving while the game was paused or the arrest card was up; the garrison now freezes.
- **Geometry over budget:** the desktop geometry count was over budget (323–354 of 300). Identical body parts are now shared across characters, and reserves are built only when first needed. It is now 180–244.
- **Test hooks too late:** the hooks appeared only after the world finished loading, so the inspector failed every capture. They now exist from the first frame and wait for initialisation.
- **Test-state rendering (only affected captures):** the states didn't re-render soldiers at their new positions and left the sky dome behind for far-away states (black sky at the checkpoint).

## Budgets
- **Physics:**
  - Each ragdoll is 7 dynamic bodies and 6 spherical joints, with at most 8 ragdolls at once.
  - Soldier capsules are kinematic and share the villagers' character controller.
  - Line-of-sight checks are about 8 Hz per soldier and 1–2 rays each.
- **Draw calls:** about 7 per soldier, the same as a villager. The checkpoint adds one static batch per material, plus the banner, the sign and the flame.

## Not verified
- Real-GPU frame rate and audio in a headed browser (pursuit drums, horn).
- Long sessions with repeated 5★ chases across the whole valley.
- Mobile/touch input (not a target).
