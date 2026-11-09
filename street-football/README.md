# RUA 10 — Street Football (Phase 1)

A 3D arcade street-football game for the browser: Three.js rendering, Rapier physics, a loose physically simulated ball, skeletal animation, and a Brazilian street court. It is built for CrazyGames-style distribution: one static bundle that loads fast.

**This is Phase 1 — the playable foundation.** Implemented features and planned features are listed separately below.

## Run it

```bash
cd street-football
npm install
npm run dev        # http://127.0.0.1:5188
```

Production build and local preview:

```bash
npm run build      # outputs dist/ (relative paths, deploy anywhere)
npm run preview    # http://127.0.0.1:4188
```

Requirements: Node 18+ and a WebGL2-capable browser. Nothing else needs downloading; every asset is in the repo (see `docs/ASSETS.md`).

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move (camera-relative) | WASD / arrow keys | left stick |
| Sprint | Shift | SPRINT |
| Shoot (hold to charge, release to strike; ↑/↓ while shooting aims at a post) | J or left mouse | SHOOT (hold) |
| Pass (off the boards in Phase 1) | Space | PASS |
| Pause | Esc / P | ❚❚ button |
| Skill move / switch player / tackle | E / Q / F — show a "coming in Phase 2/3" notice | — |

## How to test Phase 1

1. **Menu:** PLAY, SELECT COURT (Brazil playable, four courts marked *coming soon*), HOW TO PLAY and SETTINGS (volumes, mute, graphics Low/Med/High, keeper Easy/Normal/Hard, camera shake) all work.
2. **Countdown:** 3-2-1-JOGA! with beeps and a whistle, then play starts.
3. **Dribbling:** hold D and the player carries the ball with separate touches; the ball is never attached. Jog for close control. Hold Shift and the touches get longer and less accurate. Turn hard while sprinting and the ball runs away.
4. **Ball physics:** pass (Space) into the boards and fence and watch it bounce, rattle and roll to a stop. Lofted balls hit the cage net and come back. Hit the post and you'll hear a clang.
5. **Shooting:** hold J and the power ring fills; release. The kick animation strikes the ball on the contact frame. Hold ↑ or ↓ while shooting to aim at a post. Full power flies but sprays.
6. **Keeper:** the keeper narrows the angle, dives, catches or parries, then rolls the ball back out. Change the keeper difficulty in Settings.
7. **Goal:** the ball fully crossing the goal line triggers slow motion, GOOOL!, confetti, the crowd, an airplane celebration on a close camera, and a scoreboard update, then a kick-off from the centre. Putting it in the far (+X) goal counts as an own goal.
8. **Full time:** after 2:30 you get the long whistle and a results screen with best-score persistence. PLAY AGAIN restarts.
9. **Robustness:** switch tabs and the game pauses. Resize the window and the canvas and HUD adapt. On a phone in portrait you get a behind-the-attacker camera and touch controls.

Automated checks:

```bash
npx playwright test                           # smoke (desktop + mobile), pause/resume, keyboard bot playtest
npm run inspect:canvas -- --manifest artifacts/evidence.json --url http://127.0.0.1:5188
node tools/qa/dribble.mjs                     # possession % for jog / sprint / zigzag / sprint-turn (dev server running)
node tools/qa/motion.mjs <dir>                # close-up animation frame sequences
```

## Architecture

```
src/
  main.js                     boot: platform → physics + character load in parallel → Game
  config.js                   every tuning constant (court, ball, player, dribble, kick, keeper, camera, quality, teams)
  core/        Loop, Renderer (resize, DPR cap), Input (keyboard/mouse/touch → intents), Events, seeded rng
  physics/     PhysicsWorld — Rapier world, fixed 120 Hz step, collision groups, contact events
  entities/    Ball (independent rigid body: rolling resistance, drag, Magnus spin)
               Footballer (character + kinematic capsule + interpolation)
               PlayerController (momentum movement, touch dribbling, charged shots/passes)
               KeeperAI (finite-state machine: set / dive / down / hold / throw / beaten)
  animation/   CharacterLibrary (load, merge, kit regions, stride measurement)
               AnimationController (phase-synced locomotion blend + overlay + one-shot layers)
               FootballClips (authored skeletal clips), KitMaterial (kit shader), Hair
  world/       Court (surface, boards, cage, goals, colliders), Neighborhood, Crowd, Environment, ProceduralTextures
  systems/     CameraRig, AudioSystem (synthesised SFX + loops), Vfx
  ui/          Hud, Menus
  platform/    CrazyGames SDK wrapper, Storage
  game/Game.js orchestration: phases, update order, feedback, test hooks
```

Fixed-step update order: input intents → player controller → keeper AI → ball forces → Rapier step → contact events → goal check. Rendering interpolates physics poses, so motion is smooth at any refresh rate.

## Implemented (Phase 1)

- A detailed Brazilian street court: worn painted concrete with cracks and repairs, ad kickboards, a chain-link cage, recessed street goals with nets, floodlights, a street of colourful stacked houses with shops and water tanks, graffiti murals, power lines, palms, a favela hillside, animated spectators and a rooftop crowd, and a warm afternoon sky and lighting.
- Rigged, skinned footballers with per-team kits, numbers, skin tones and hairstyles. Locomotion blends idle/walk/jog/sprint with foot-synchronised, speed-matched playback; authored shot, pass, keeper and celebration clips.
- An independent physical ball: Rapier rigid body with CCD, custom rolling resistance, air drag, Magnus curve, bounces off boards, fence, posts and nets.
- Touch-based dribbling with speed- and turn-dependent error, possession loss, first-touch control and shielding.
- Charged shooting and passing timed to the kick contact frame; accuracy depends on power, speed and turning; aim toward the posts.
- A goalkeeper AI with difficulty levels.
- Goal detection; the goal sequence (stop, slow-mo, banner, confetti, crowd, celebration, scoreboard, restart from the centre); match timer, countdown, full time and results.
- Style points with goal bonuses and floating popups.
- An elevated diagonal follow camera (ball framing, attack bias, speed zoom, shot tracking, goal cam, shake, FOV punch, building-safe bounds) and a portrait mobile camera.
- Synthesised audio: kicks, touches, bounces, fence rattle, post clang, net, footsteps, whistle, crowd bed, cheers and ooh, distant traffic, UI. Volume groups, mute, gesture unlock, pause.
- Menus, HUD, pause, settings, results, touch controls, focus-loss pause, WebGL context-loss handling, CrazyGames lifecycle hooks.

## Planned

- **Phase 2:** 3v3 (teammates and opponents with FSM AI), passing to teammates, tackles (F), interceptions, player switching (Q), Easy/Normal/Hard AI for outfield players.
- **Phase 3:** skill moves (E: stepover, roulette, rainbow flick, nutmeg, heel flick, body feint, ball roll, fake shot) with success/risk, trick scoring and combo multipliers.
- **Phase 4:** dressed character models (Quaternius Universal Base Characters or Mixamo, retargeted), photo-scanned textures, recorded audio, more VFX and UI animation.
- **Phase 5:** New York, London, Tokyo and Barcelona courts; profiling on low-end devices; verified CrazyGames submission.
