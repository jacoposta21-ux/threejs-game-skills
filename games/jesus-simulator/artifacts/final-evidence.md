# Evidence — Phase 2 (living world)

Screenshots and videos are kept out of git (the repo ignores `artifacts/`). This report, the manifest, the JSON reports and the motion sheets are committed. Regenerate the rest with:
- `npm run verify:visual`
- `npm run test:play`
- `npm run test:motion`
- `npm run test:npc-motion`

All runs used the production build (`npm run build` + `vite preview` on :4188) in headless Chromium. **Rendering was software (SwiftShader):** pixel, budget and gameplay checks are valid, but FPS numbers are not. Simulation-heavy checks fast-forward the fixed 60 Hz step in-page (`session.simulate`), because the software GPU renders too slowly for minutes of real time. All player actions still use real key input.

Phase 1 evidence (run `phase1-pass-4`, plus playtest/motion `phase1-pass-3`) remains in git history.

## Canvas inspector — run `phase2-pass-3`
Manifest: [evidence.json](evidence.json). `check_evidence.py --manifest` → **passed, 11 artifacts confirmed.**

| Viewport / state | Result | Budget |
| --- | --- | --- |
| desktop / menu (village simulating behind it) | PASS | ok |
| desktop / active-play | PASS | ok |
| desktop / plaza-life (after 40 s simulated) | PASS | ok — 203 calls, 403k tris, 255 geometries |
| desktop / market-life | PASS | ok |
| desktop / npc-dialogue (Eli the baker) | PASS | ok |
| desktop / night (all villagers indoors) | PASS | ok |
| desktop / pause | PASS | ok |
| mobile / plaza-life | PASS | over: calls 174 > 150, triangles 392k > 300k, geometries 234 > 200 |

Mobile is not a target for this release; the overage is recorded, not hidden.

## Real-input playtest — run `phase2-pass-3`
[results.json](phase2-pass-3/playtest/results.json) — **22/22 PASS** (12 Phase 1 regressions + 10 Phase 2 checks):

- **Routines:** 27 NPCs; 19 moved more than 2 m over 20 simulated seconds. Nav graph: 272 nodes, 576 edges, 0 unreachable anchors.
- **Conversation:** "Talk to Eli" prompt → **E** opens the conversation (3 options) → **1** advances to a new node → **W** does nothing during the conversation → **Esc** closes it.
- **NPC collision:** the player is blocked by an NPC (263 contact events; capsule centres never closer than 0.70 m).
- **Knock-over:** sprinting into a villager makes them stumble and fall; Chaos goes 1.6 → 2.6.
- **Pottery:** a pot dropped from 4 m shatters (6 shards, Chaos +2, the merchant reacts).
- **Fruit:** walking into a fruit pile scatters it (props disturbed 12 → 18).
- **Lost sheep:** Amos gives the errand (E, 1), the stray follows the player, rejoins the flock, and the reward is Faith +5.
- **Night:** at night 27/27 villagers are indoors; at dawn 0 are hidden.
- **Persistence:** people met, dialogue flags and the returned sheep survive Save & Quit → Continue.
- **Errors:** no console or page errors.

Stability: the playtest also passed 22/22 on two earlier consecutive runs of the build before the final camera and awning changes.

## Motion
- **Player locomotion:** [motion-sheet.png](phase2-pass-3/motion/motion-sheet.png) — idle → walk → sprint → jump → land.
- **NPC life:** [npc-motion-sheet.png](phase2-pass-3/motion/npc-motion-sheet.png) — a fixed camera over the square, 12 frames, 0.4 s of simulation apart.
  - **Visible:** walk cycles, the kids running up cheering then going back to tag ("Tag! You're it!" / "No fair!"), two pairs of passers-by chatting, and greetings.

## Defects found and fixed in this pass
- **Lanes through the workshop:** two village lanes started inside the carpentry workshop, putting nav nodes inside its walls (Mary and Joseph stuck). The lanes were moved.
- **Nodes inside the well:** road nodes sat inside the well collider (an unstuck teleport landed a villager inside the well). Nodes are now rejected with a penetration test.
- **Overlapping spawns:** villagers sharing a home spawned in the same spot and locked each other's capsules. Spawns are now offset, with a direct overlap nudge.
- **Restless fruit:** fruit pyramids never slept (balls creep on balls; 22 bodies awake forever). Slow props are now put to sleep, leaving 0–1 awake at rest.
- **Camera pushed by NPCs:** NPC capsules pushed the camera into villagers' heads. The camera now collides only with fixed architecture.
- **Hidden merchant faces:** stall valances hung at merchant head height. The awnings were raised; the over-the-shoulder conversation camera now frames the NPC's face above the panel.
- **Shoppers scattering fruit:** fruit piles sat in the shoppers' path and were permanently scattered. They were moved beside the stalls.

## Physics and AI budget
- **NPCs:** 27 kinematic capsules. Those within 42 m move with Rapier's KinematicCharacterController (one shared controller); the rest follow paths directly. Animation runs at full rate within 48 m and every third frame beyond; shadows within 30 m; hidden beyond 125 m.
- **Props:** 70 dynamic bodies plus a pool of 48 shards; bodies sleep until touched. Animals are 16 kinematic agents with no physics bodies.
- **Navigation:** about 800 shape casts at build time; paths are computed with A* on demand.

## Not verified
- Real-GPU frame rate with 27 NPCs.
- Audio in a headed browser (the procedural voices run without errors headless).
- Long sessions beyond a few simulated in-game hours.
