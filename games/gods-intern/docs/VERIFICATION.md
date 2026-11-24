# God's Intern — verification report (v0.5, "Less UI, More God")

Everything ran in a cloud Linux container **without a GPU**. Chromium used SwiftShader
software rendering, so frame rates here are not representative.

- **Measured frame rate here:** about 1–2.5 fps under SwiftShader.
- **Valid here:**
  - layout, input paths, pixel captures and UI collision checks;
  - CPU and simulation timings;
  - real-time gameplay pacing, because the simulation runs at a fixed 20 Hz on wall
    time and is not tied to the frame rate.
- **Not measured:** real-GPU frame rate. 60 FPS is a target, not a result.
- **Touch:** only Chromium mobile emulation was tested.

Earlier reports: [v0.4](VERIFICATION-v0.4.md) · [v0.3](VERIFICATION-v0.3.md) ·
[v0.2](VERIFICATION-v0.2.md).

## 1. Audit (before v0.5, commit `2731712`)

- **Normal play reached rank 4 in about 6.5 minutes.** This was the v0.4 real-time
  playthrough. The cause was large one-time rewards stacking in the first minutes:
  - first use of each power: 10 × 13 XP;
  - surreal discoveries: 40 XP each;
  - each new religion: 30 XP (religions re-form, so this repeated);
  - challenges: 30 / 60 / 120 XP;
  - combinations: 30–45 XP;
  - consequence chains: 15 XP each.
- **The UI had 14 always-visible elements:**
  - **HUD:** brand, clock, population, career chip, three meters and six buttons;
  - **toolbar:** Look plus six slots plus All powers;
  - **on screen:** three pinned goals and a prayer list.

## 2. XP economy: old vs new

Thresholds (cumulative XP per rank):

| Rank | v0.4 | v0.5 | Unlock |
| --- | ---: | ---: | --- |
| 1 | 0 | 0 | Rain, Lightning, Nature, Fire |
| — | (rank 4 or 25 Chaos) | **620** (or 527 with ≥ 60 Chaos) | Mutation ("probation review") |
| 2 | 100 | 880 | Tornado |
| 3 | 250 | 1150 | Freeze |
| 4 | 450 | 1420 | Gravity |
| 5 | 750 | 1650 | Terraform |
| 6 | 1150 | 2000 | Time Warp |
| 7 | 1700 | 2500 | Possession |
| 8 | 2400 | 3200 | Meteor |
| 9 | 3300 | 4000 | Resurrection |
| 10 | 4500 | 5000 | Divine Overtime |

XP sources (all in `CONFIG.career.xp`):

| Source | v0.4 | v0.5 | Dedupe / limit |
| --- | ---: | ---: | --- |
| Finished training | 25 | 10 | once |
| First use of a power | 10 each | **0** (+5 energy instead) | once per power |
| Prayer answered | 25 | 12 | once per prayer |
| …thirst / hunger bonus | 10 | 4 | once per prayer |
| Challenge easy / medium / hard | 30 / 60 / 120 | 10 / 20 / 45 | once each |
| Surreal discovery | 40 | 8 | once each |
| Religion founded | 30 per religion | 15 per kind of religion | once per archetype |
| Sacred site stage ≥ 3 | 15 | 6 | once per stage |
| Monument | 40 | 20 | once each |
| Rescue (rain on a village fire) | 4 (5/min) | 2 (4/min) | window |
| Relations improved | 20 | 10 | once per pair and level |
| Miracle witnessed (≥ 5) | 3 (6 per 2 min) | 2 (3 per 2 min) | window |
| Village rebuilt after a disaster | — | 3 (2 per 2 min) | new; gives chaotic play a steady source |
| Resurrection | 25 | 10 | once per villager |
| Memorable flood | 10 | 4 | once per village |
| Consequence chain | 15 (every 4 min) | 3 | **once** per chain |
| Meteor impact | 20 (per 2 min) | 8 (per 5 min) | window |
| Combination discovered | 30–45 | 11–16 (×0.35) | once each |
| Power mastery goal | — | 6 | new, 22 goals, once each |

Non-XP rewards:
- **Promotions** refill energy, give +4 Approval and add the rank title.
- **First use of a power** gives +5 energy.
- **Challenges** keep their energy, approval, title and cosmetic rewards.

No real-time timers anywhere: every unlock is earned by play.

## 3. Progression bots (deterministic, headless, simulated active play)

How the bots work:
- They live in `tests/progression/bots.ts` and play through `PowerManager.activate`.
- Energy and cooldowns are normal, and there are no XP grants.
- They make one decision every 10 simulated seconds.
- They are pacing models, faster and more focused than a person. Unlock *minutes* below
  are simulated active-play time.

`PROGRESSION=1` runs 5 hours per bot. The numbers below are the final configuration,
seeds 7 and 11. The opt-in run writes `artifacts/progression/report-*.json`; only
`stability.json` is committed. Times are in minutes.

| Unlock | Target | Benevolent (7 / 11) | Exploratory (7 / 11) | Chaotic (7 / 11) |
| --- | --- | --- | --- | --- |
| Mutation | 5–10 | 3.4 / 3.4 | 4.4 / 4.8 | 4.3 / 4.7 |
| Tornado | 8–12 | 10.8 / 8.8 | 9.3 / 8.0 | 16.4 / 19.6 |
| Freeze | 15–20 | 17.0 / 21.3 | 13.1 / 13.5 | 31.9 / 33.5 |
| Gravity | 25–35 | 25.9 / 47.4 | 20.0 / 18.8 | 50.4 / 63.2 |
| Terraform | 40–50 | 34.9 / 57.8 | 28.0 / 31.0 | 71.3 / 84.2 |
| Time Warp | 60–80 | 54.2 / 76.2 | 41.2 / 41.4 | 114 / 120 |
| Possession | 90–120 | 89.3 / 105.7 | 69.8 / 80.6 | 187 / 184 |
| Meteor | 120–180 | 134.6 / 161.7 | 113.2 / 133.2 | 297 / 280 |
| Resurrection | 180–240 | 177.2 / 216.3 | 160.9 / 179.0 | > 300 |
| Overtime (rank 10) | ~300 | ~240 / ~300 | ~120–180 | > 300 |

| Measure (5 h, seed 7) | Benevolent | Exploratory | Chaotic | Destructive spam |
| --- | ---: | ---: | ---: | ---: |
| Final XP | 6674 | 6790 | 3264 | **843** |
| Final rank | 10 | 10 | 8 | **1** |
| Challenges | 23 | 27 | 18 | 12 |
| Idle decisions | 647 / 1800 | 141 / 1800 | 0 / 1800 | 0 / 1800 |
| Share of casts on the single most-used spot | 0.23 | 0.06 | 0.10 | 1.00 |

How to read this:
- **Helpful and curious play** lands close to the targets.
- **Chaotic play** progresses steadily, but at about half the speed.
- **Destructive repetition** at one spot plateaus at about 840 XP. It never reaches
  rank 2, so repetition is not the fastest path.
- **Mutation** arrives a little before its 5–10 minute target for these bots. A human
  is slower in the first minutes (see section 4).

`tests/unit/progression.test.ts` runs a 25-minute version on every unit run and asserts:
- Mutation arrives between 200 and 720 s, and Tornado before 17 minutes;
- no late-game power unlocks in the first 25 minutes;
- every promotion is exactly one rank;
- the destructive spammer earns less than 75% of the benevolent or chaotic bot's XP;
- both play styles are promoted.

## 4. Real-time Career playthrough (normal play, no shortcuts)

`tests/e2e/v05-career.spec.ts` plays a new career from the main menu:
- real time, real mouse clicks on the dock, prayer cards and World panel;
- normal energy; no XP, Chaos or energy grants; no fast-forward.

It uses read-only helpers only: the state and diagnostics readers, `worldToScreen` and
`canCast`.

CAREER_RESULTS

## 5. Long-session stability (ACCELERATED, headless)

`STABILITY=1 npx vitest run tests/progression/stability.test.ts` runs 75 simulated
minutes. It took about 19 s of wall time, so this is **not real time**.

What it does:
- plays exploratory and benevolent bots in 5-minute chunks;
- **save → reload** into a fresh `Simulation` after every chunk, checking villager
  count, unique ids, XP and rank;
- every 15 minutes, a separate **Creative** session on its own slot. It earns 0 career
  XP and the Career slot reloads intact.

Results (`artifacts/progression/stability.json`):

| Minute | Villagers | Trees | Effects | History | Religions (incl. faded) | Save | Heap | Sim step |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 54 | 294 | 0 | 59 | 6 | 220 KB | 54 MB | 0.34 ms |
| 20 | 62 | 316 | 0 | 80 | 13 | 255 KB | 39 MB | 0.19 ms |
| 50 | 61 | 319 | 0 | 80 | 22 | 266 KB | 38 MB | 0.15 ms |
| 75 | 61 | 340 | 0 | 80 | 31 | 285 KB | 81 MB | 0.14 ms |

Findings:
- Collections stay bounded and saves stay well under the 1 MB CrazyGames data limit.
- Heap moves with garbage collection rather than growing steadily.
- The step cost does not grow.
- **Known slow growth:** faded religions stay in the save, about 0.4 per minute of
  chaotic play, adding a few KB each. Pruning is a future cleanup.

In the browser, the visual and powers specs also cover:
- opening and closing every panel;
- Career ↔ Creative switching;
- save, reload and load.

## 6. Interface verification

The interaction flow:

| Action | Steps |
| --- | --- |
| Use a power | Select it in the dock (or ALL POWERS). The targeting bar says what to click and shows ✓ valid or ✕ with the reason. Click the island, or press **Cancel** or Esc |
| Change power mode | Raise/Lower or Accelerate/Slow buttons in the targeting bar (T optional) |
| Inspect | No power selected → click a villager, building, sacred object, village centre or disaster site |
| Open a panel | The rail (World, Career, Challenges, History). One panel at a time; clicking the island closes it, and that click does nothing else |
| Answer a prayer | Prayer card → **Focus** (fly there) or the suggested power (selects it and flies there; you cast) |
| Set up the dock | ALL POWERS → **Put in dock** → choose a slot (mouse or touch) |

### Usability paths

The usability paths were each exercised by an automated spec through visible controls,
with no keyboard shortcuts.

The specs prove only that each path works. Whether people *find* each path is for the
human playtest in [PLAYTEST-CHECKLIST.md](PLAYTEST-CHECKLIST.md).

| Path | Spec |
| --- | --- |
| Cast Rain | `v05-visual`: dock click → click the well, during onboarding |
| Select another power | `v05-visual` (Lightning), `v05-career` |
| Cancel | `v05-visual`, `v04-touch` (Cancel button) |
| Inspect a villager | `v05-visual` (09) |
| Inspect a village | `v04-touch` (World → card → tap), `playtest` (building) |
| View prayers | `v05-visual` (10), `v05-career` (suggested-power button) |
| Complete a challenge | `civilization` (Divine Tourist), `v05-career` |
| See the next unlock | `v05-visual` (07 locked Meteor, 11 career) |
| Change graphics | `v05-visual` (16 settings) |
| Enter Creative | `v05-visual` (15, via the pause menu) |
| Return to the main menu | pause menu → **Main menu** (button; covered in `v05-visual` settings flow) |

BROWSER_RESULTS

### Screenshots (`artifacts/v05-screens/`, reviewed manually)

01 main menu · 02 New Career intro · 03 default HUD · 04 selected power ·
05 targeting preview · 06 All Powers · 07 locked power details · 08 World ·
09 villager inspector · 10 prayers · 11 career · 12 challenges · 13 history ·
14 promotion · 15 Creative · 16 settings · 17 phone landscape (plus targeting and World) ·
18 tablet landscape · 19 Possession touch controls · 20 portrait rotate prompt.
There are also desktop sweeps at 1920×1080, 1366×768, 1280×720 and 1024×768. The
manifest notes which states were staged with dev hooks: prayers after `simulate(240)`,
the promotion via `grantXp`, possession via `possess()`.

The visual spec also asserts:
- no page overflow;
- no overlap between the HUD, rail, dock and prayer chip at every desktop, tablet and
  phone size.

Issues found and fixed during review:
- **1.25 fps under software rendering.** `backdrop-filter` blur was over the live
  canvas; it was removed. The frame rate turned out to be the environment's baseline
  anyway, but the blur is a known compositing cost on weak GPUs.
- **Clicks lost on panels.** A panel could rebuild its HTML between press and release.
  Panels now rebuild only when the pointer is not over them, or when their own button
  forces it.
- **Phone rail too tall.** It was 9 px taller than a 360 px screen; Help and Speed now
  move into the Menu below 420 px height.
- **HUD touching the prayer chip** at 1180×820: fixed by more clearance.
- **ALL POWERS label clipped** at 1024 px: fixed.
- The "Got it" tip button was stretched full-width: fixed.

## 7. Onboarding

- **Length:** about 30–45 s. It runs:
  - three intro lines (5 s);
  - the rain request, with Rain highlighted;
  - the cast near the well;
  - the villagers' reaction (6 s);
  - the reward (6 s).
- **Measured onboarding time:** see section 4.
- **Tips:** short contextual tips follow (Fire, religion, diplomacy, career, Mutation,
  power modes, possession, prayers, camera, goals). Each appears once, can be dismissed,
  never blocks, and is listed under Help.

## 8. Saves (version 5)

- v4 → v5 never demotes and keeps all unlocked powers. This is unit-tested with a v0.4
  rank-4 save at 563 XP:
  - it loads as rank 4 with 1420 XP;
  - Tornado, Freeze, Gravity and Mutation stay unlocked;
  - no promotion event fires;
  - there are 3 promotions in its history.
- The save keeps everything: career, unlocks, ranks, challenges, discoveries, cosmetics,
  world and Creative slot, plus the new `tipsSeen` and `pinsTouched` flags.
- Settings keep quick slots (6 → 7 migrated), reduced motion and camera shake.

## 9. Build, bundle and performance

| Check | Result |
| --- | --- |
| Typecheck | ✅ |
| Unit tests | ✅ **104/104** (98 earlier + progression and migration) |
| Production build | ✅ JS 509 kB (171 kB gzip) + three.js 568 kB (145 kB gzip); CSS 63 kB |
| Single file | ✅ 1.49 MB (588 kB gzip); runs from `file://` |
| Test hooks in production | ✅ none (`npm run check:prod`) |
| Simulation | 0.14–0.34 ms per 20 Hz step (Node); 0.46 ms in the browser |
| Frame CPU (excluding rasterization) | ~4 ms |
| Real-GPU FPS | **not measured** |

Graphics have Auto plus Low, Medium and High, with a manual override in Settings. Auto
drops a level when the frame rate stays under 38.

## 10. CrazyGames

See [SUBMISSION-CHECKLIST.md](SUBMISSION-CHECKLIST.md). In summary:
- **SDK use:** lifecycle only, plus `muteAudio`.
- **Ads:** none (Basic Launch disallows them).
- **External requests:** none in standalone play.
- **Custom fullscreen button:** hidden on CrazyGames.
- **Audio:** iOS audio resumes on `touchend`/`click`.

## 11. Limitations and remaining manual testing

- Real-GPU performance and physical touch devices are untested. See
  [PLAYTEST-CHECKLIST.md](PLAYTEST-CHECKLIST.md) for the device list.
- **Bot pacing is a model.** Human pacing needs the human playtest.
- Chaotic play unlocks later powers at about half the pace of helpful play.
- Mutation can arrive slightly before 5 minutes for very active players.
- Faded religions accumulate slowly in long saves.
- The onboarding is mandatory by design. CrazyGames' quality guidelines (not
  requirements) suggest a skippable onboarding.
- Not implemented: Full Launch requirements (ads, data module), translations.
