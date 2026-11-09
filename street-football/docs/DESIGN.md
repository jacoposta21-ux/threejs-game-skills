# RUA 10 — Design

> Phase 2 update: the slice is now a 3v3 match. The Phase 1 brief below still holds for the individual verbs; the 3v3 additions are summarised first.

## Phase 2 brief (3v3)

- **Player promise:** run the game for your trio — keep the ball moving, win it back, and finish.
- **Verbs added:** pass to teammates (Space), tackle (F), switch player (Q); interceptions and shot blocks by positioning.
- **5–30 s loop:** win the ball → combine or dribble past a defender → shoot; or lose it → switch, press goal-side, tackle or intercept → counter.
- **Pressure:** a pressing defender closes down every carrier; tackles land when the ball strays; passes into crowded lanes are cut out; the keeper rushes 1-v-1s.
- **Reward / failure:** goals, tackles (+150), steals and interceptions (+100), blocks (+100) feed style points; conceding hands the opponent momentum and a kick-off is taken against you.
- **Mastery:** jog-dribble near defenders, pass before the press arrives, tackle from the front at the right distance, switch early on defence.

### Core loop contract (3v3)

> The player **combines and dribbles** to **score more than the opposing trio in 3:00** while **AI pressing, marking, tackling and a rushing keeper** create risk. Success gives **goals, style and momentum**; failure **turns the ball over** and the AI counter-attacks.

| Clause | Proven in code |
| --- | --- |
| Verbs on real input | `PlayerController.requestPass/requestTackle`, `Game.switchPlayer`; touch PASS/TACKLE/SWITCH buttons |
| Opponent pressure | `TeamAI` roles press / mark / cover, `tackleInReach`, `MatchState.canTake` (steals between touches) |
| Reward changes state | possession, score, style, kick-off ownership |
| Failure teaches | STEAL / TACKLE / BLOCKED popups, stagger reaction, possession tag |

AI-vs-AI evidence (`tools/qa/aimatch.mjs`) is in `docs/EVIDENCE.md`.


## Design brief

- **Player promise:** you are the best footballer on the street, and the cage is your stage.
- **Target feeling:** loose, rhythmic close control; the thump of a struck ball and the rattle of the fence; showing off for the crowd.
- **Primary verb:** dribble (touch the loose ball forward and keep it).
- **Secondary verbs:** shoot (charged), pass (off the boards in Phase 1, to teammates from Phase 2), sprint, and later skill moves (Phase 3) and tackles (Phase 2).
- **5–30 s loop:** pick up the ball → carry it toward goal with touches → choose the angle and power → shoot → keeper reacts → goal, save, parry or rebound → go again.
- **1–5 min arc:** a 2:30 match. The style score grows, the clock runs down, and in the last 10 seconds the clock pulses red.
- **Lose / learn / restart:** saves, heavy touches and own goals show what went wrong straight away: a "SAVED!" or "Heavy touch!" prompt and the crowd's "ooh". Kick-off follows 1.6 s after a goal, and a rematch is one click from the full-time screen.
- **Rewarded:** goals (+1000) plus readable bonuses for ROCKET (full power), TOP BINS (high corner), OFF THE POST, WALL BANK (off the boards or fence), FIRST TIME and FROM DISTANCE.
- **Risk:** sprinting gives longer, less accurate touches. Turning sharply at speed loses the ball. Full power sprays. Shooting from a sharp angle meets a keeper who has already narrowed it.
- **Mastery:** jog-dribble to keep close control, sprint only into space, and aim with ↑/↓ toward the post the keeper isn't covering. Mid power is accurate; full power scores only when placed. Use the boards for bank shots.
- **Communicating the next decision:** the camera biases toward the attacked goal, the keeper visibly sets and shuffles, the power ring sits on the player, and a BALL tag shows possession.
- **Non-goals for Phase 1:** opponents in open play, teammates, AI passing, tricks and combos, extra courts.

## Core loop contract

> The player **dribbles** to **score past the keeper** while **ball control at speed and a reacting keeper** create risk. Success gives **goals and style points with bonuses** (scoreboard, banner, crowd, celebration); failure **turns the ball over to the keeper** (who rolls it back out) or concedes an own goal, and play continues straight away.

| Clause | Proven in code |
| --- | --- |
| Verb is mapped to real input | `Input` → `PlayerController.updateBall` (touches), `requestKick` (J / LMB / Space, touch buttons) |
| Objective is visible | Goals at each end, scoreboard and clock in the HUD |
| Pressure in the first minute | `KeeperAI.readShot` (save roll scaled by speed, placement, height and difficulty), the clock, and dribble error at sprint |
| Reward changes state | Score, style points, best-score persistence, the crowd and celebration state |
| Failure teaches | SAVED / PARRIED / Heavy touch / Missed the ball prompts, keeper distribution |
| Fast restart | 4.2 s celebration → 1.6 s kick-off; one-click rematch |

## Level plan — Vila Esperança (Brazil)

- **Format:** a 30 × 18 m caged concrete court (playing lines at ±15 m by ±9 m) with 1 m kickboards, a 4.6 m chain-link fence, a 10 m invisible catch-net and roof, and 3.2 × 2 m street goals set 1.15 m deep.
- **Camera:** an elevated diagonal from the near (−Z) sideline, biased toward the attacked goal. It sees the full width and roughly 60% of the length; the near fence fades out. Portrait phones get a behind-the-attacker view.
- **Start / first decision:** the ball at your feet on the centre spot, the goal and keeper visible on screen right. The first decision is which line to dribble and when to shoot.
- **First threat:** the keeper steps out as you approach; at close range the angle narrows.
- **First reward:** the first goal: banner, confetti, crowd, airplane celebration.
- **Landmarks:** the sun-star emblem at centre, graffiti murals behind each goal (CRAQUE / RUA 10), the far street of shops (BAR DO TONHO, PADARIA ESTRELA), the hillside favela and granite peaks.
- **Escalation:** the clock, keeper difficulty (Easy/Normal/Hard), and in Phase 2 the 3v3 opponents.
- **Recovery beats:** the goal celebration and kick-off countdown; the keeper's hold-and-throw after a save.
- **Telegraphs:** the keeper's set stance, a visible shuffle before shots, and dives committed after a reaction delay.
- **Modular pieces:** `Court.js` (dimensions all from `config.js`), `Neighborhood.js` (house generator, mural walls, poles, palms, hillside), `Crowd.js`. A new court reuses the court builder with a new neighbourhood and lighting preset.
