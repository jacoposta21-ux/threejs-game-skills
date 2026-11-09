# RUA 10 — Street Football (Phase 3: freestyle)

A 3D arcade street-football game for the browser: Three.js rendering, Rapier physics, a loose physically simulated ball, skeletal animation, and a Brazilian street court. It is built for CrazyGames-style distribution: one static bundle that loads fast.

**Phases 1–3 are done:** a full 3v3 match (three outfield players plus a keeper per side) against AI opponents with AI teammates, plus a freestyle trick system with combos. Implemented features and planned features are listed separately below.

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
| Pass to the teammate in the direction you move or face | Space | PASS |
| Tackle (poke lunge; from behind is risky) | F | TACKLE |
| Switch to the teammate nearest the ball | Q | SWITCH |
| Pause | Esc / P | ❚❚ button |
| Skill move (see the table below) | E + direction relative to where you face | SKILL + stick |

Control follows the ball automatically: when a teammate wins it or receives your pass, you take control of them.

## Freestyle tricks (Phase 3)

| Input (relative to facing) | Trick | Points vs a defender |
| --- | --- | --- |
| E | Stepover | 100 |
| E + left/right | Body feint | 100 |
| E + left/right while standing | Ball roll | 150 |
| E + left/right + Shift | Quick cut | 150 |
| E while charging a shot (J held) | Fake shot (a keeper near goal buys it) | 200 |
| E + back | Roulette | 250 |
| E + back + Shift | Heel flick (backheel turn) | 300 |
| E + forward + Shift | Rainbow flick over the defender | 400 (when you get the ball back) |
| E + forward, defender right in front | Nutmeg through the legs | 500 (when you get past with the ball) |

- **Points only against an opponent** within about 3 m in front. Alone, the trick plays and shows its name, but scores nothing.
- **Every trick can fail.** Risk rises with speed above the trick's limit, low stamina, a Hard defence, and repeating the same trick twice in a row. A failed trick knocks the ball loose (FAILED!).
- **Beaten defenders are wrong-footed.** For 0.5–1.3 s they stumble the way they bit, cannot tackle, and cannot touch the ball.
- **Combo:** consecutive successful tricks multiply the points (x2, x3 … x5). The combo ends when you fail a trick or the other team wins the ball; passing between teammates keeps it alive. Scoring with a combo of x2 or more adds STYLE BONUS = 250 × combo (x3 → +750).
- **AI attackers use tricks too** (stepover, feint, cut, roulette) when you press them. If they beat you, your player is wrong-footed for a moment.

## How to test Phase 3

1. Kick off with the ball and walk at a defender. Press **E** (stepover), then **E + a side** (feint). Watch for STEPOVER +100, then BODY FEINT +200 with COMBO x2 and the combo badge by your style score.
2. Stand still with the ball and press **E + side** (ball roll); jog and press **E + back** (roulette, a full spin).
3. Sprint and press **E + forward** (rainbow flick over the defender), then collect the ball behind them.
4. Walk straight at a defender who is right in front and press **E + forward** (nutmeg), then run past them to collect.
5. Near goal, hold **J** and press **E** (fake shot): the keeper shuffles the wrong way.
6. Keep a combo running and score: STYLE BONUS appears with the GOOOL banner.
7. Spam the same trick and watch it start failing; let the AI win the ball and the combo badge disappears.

## How to test Phase 2 (3v3)

1. **PLAY** → countdown → you kick off as ZÉ (#10, yellow). Two AI teammates spread wide and ahead; three VILA RUBRA players (red/black stripes) and their keeper defend.
2. **Passing:** move toward a teammate and press Space. The pass is weighted to their run; the yellow ring under your feet moves to the receiver when they control it.
3. **Defending:** lose the ball and the AI attacks — the carrier dribbles at goal, passes when pressed, shoots from range. Press **Q** to jump to the teammate nearest the ball, close in, and press **F** to tackle. Win it from the front: tackles from behind fail more and the victim staggers when you win it cleanly.
4. **Interceptions and blocks:** stand in a passing lane to steal passes; stand in front of a shot and it bounces off you (BLOCKED!).
5. **Scoring:** both teams score; the scorer celebrates, the other team kicks off. 3:00 match, full-time stats (shots for/against, passes, tackles, steals, style).
6. **AI level:** Settings → AI LEVEL Easy / Normal / Hard changes how fast the AI thinks, how often and how well it tackles, how hard it presses, pass accuracy and shooting range, plus keeper reactions.

## How to test Phase 1 features

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
node tools/qa/motion.mjs <dir> [name]         # close-up animation frame sequences (jog-dribble, shot, tackle, ...)
node tools/qa/aimatch.mjs [easy|normal|hard] [n]  # full AI-vs-AI matches: shots, passes, tackles, steals, goals, possession, AI tricks
node tools/qa/trickcheck.mjs                  # rainbow height, nutmeg through the legs, pending awards, forced fail
node tools/qa/trickmotion.mjs <dir>           # every trick as a close-up frame row
```

## Architecture

```
src/
  main.js                     boot: platform → physics + character load in parallel → Game
  config.js                   every tuning constant (court, ball, player, dribble, kick, keeper, camera, quality, teams)
  core/        Loop, Renderer (resize, DPR cap), Input (keyboard/mouse/touch → intents), Events, seeded rng
  physics/     PhysicsWorld — Rapier world, fixed 120 Hz step, collision groups, contact events
  ai/          TeamAI — role assignment + per-step steering for outfield players
  skills/      Tricks — trick definitions, input mapping, risk model
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
  game/        Game.js orchestration (phases, update order, feedback, test hooks); MatchState (ball owner, pass targets, lane queries)
```

Fixed-step update order: input intents → team AI (roles, intents) → every outfield controller → keepers → body separation → ball forces → Rapier step → contact events → goal check. Rendering interpolates physics poses, so motion is smooth at any refresh rate.

## Implemented (Phase 3)

- **Nine tricks** (`src/skills/Tricks.js`), each with:
  - its own authored skeletal clip in left and right versions, mirrored automatically (`FootballClips.js`);
  - a scripted body path: speed, turn, sideways travel, and a full-body spin for the roulette;
  - a physical ball script: holds the ball on a line, then plays it with an impulse;
  - a duration, a key moment where success or failure is decided, and a risk model.
- **Defender reactions:** beaten players are wrong-footed and cannot tackle or control the ball. A nutmeg or rainbow lets the ball, and the attacker, slip through the victim.
- **Pending awards:** a rainbow or nutmeg only scores once you get past with the ball or win it back.
- **Combo multiplier** up to x5, a combo badge in the HUD, trick, COMBO and STYLE BONUS popups, and a rising combo chime, trick whoosh and fail thud.
- **AI attackers** perform tricks under pressure. A keeper buys a fake shot near goal.
- **Full-time stats:** tricks landed, nutmegs, best combo.

## Implemented (Phase 2)

- **3v3 match**: two teams of three outfield players plus keepers, 3:00 timer, kick-off by the conceding team, scorer celebration, full-time stats.
- **Contested possession**: one ball owner at a time (`MatchState`); opponents can take the ball between dribble touches or by tackling; passes can be intercepted; bodies block shots physically.
- **Passing**: direction-aware teammate selection (alignment, lane openness, space, progress), receiver-led passes weighted by distance, AI receivers attack the ball.
- **Tackling**: authored poke-tackle clip with a contact frame, lunge that tracks the ball, success from reach/angle/difficulty, stagger reaction (`Hit_Chest`) for the victim.
- **Team switching**: Q (nearest to ball), automatic switch on gaining possession or receiving, controlled-player ring and pass-target pulse, HUD name/number.
- **Team AI** (`src/ai/TeamAI.js`, finite-state roles): carry (shoot / pass when pressed / dribble around defenders), support runs, receive, chase loose balls, press goal-side, mark goal-side in the lane, cover; teammate spacing; three difficulty levels.
- **Keepers**: 1-v-1 rush and smother, distribution to the most open teammate.

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

- **Phase 4:** dressed character models (Quaternius Universal Base Characters or Mixamo, retargeted), photo-scanned textures, recorded audio, more VFX and UI animation.
- **Phase 5:** New York, London, Tokyo and Barcelona courts; profiling on low-end devices; verified CrazyGames submission.
