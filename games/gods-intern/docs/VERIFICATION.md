# God's Intern — verification report (v0.4, "The Heavenly Polish Update")

Everything ran in a cloud Linux container **without a GPU**. Chromium used SwiftShader
software rendering, so frame rates here are not representative.
- **Valid here:** pixel checks, renderer counts, CPU/simulation timings and gameplay/UI checks.
- **Not measured:** real-GPU performance. 60 FPS on a desktop GPU is a target, not a
  verified result.
- **Touch:** tested only in Chromium mobile emulation, not on a physical device.

Earlier reports: [v0.3](VERIFICATION-v0.3.md), [v0.2](VERIFICATION-v0.2.md).

## Baseline before v0.4 (commit `b4d9084`)

| Check | Result |
| --- | --- |
| Typecheck | ✅ clean |
| Unit tests | ✅ 76/76 |
| Browser playthroughs | ✅ 3 (v0.1, v0.2, v0.3) |
| Bundle | 949 kB JS (274 kB gzip) in 2 chunks |

## Results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck (src + tests) | `npx tsc --noEmit -p .` | ✅ |
| Unit tests | `npm run test:unit` | ✅ **98/98** (76 existing + 22 in `tests/unit/v04.test.ts`) |
| v0.1 playtest | `tests/e2e/playtest.spec.ts` | ✅ unchanged (5.2 min) |
| v0.2 playthrough | `tests/e2e/culture.spec.ts` | ✅ unchanged (4.5 min) |
| v0.3 playthrough | `tests/e2e/civilization.spec.ts` | ✅ (11.1 min) after 3 expectation updates for intended v0.4 changes (below) |
| **v0.4 normal play** | `tests/e2e/v04-career.spec.ts` | ✅ (6.8 min) — real time, normal energy, no shortcuts |
| **v0.4 all new powers** | `tests/e2e/v04-powers.spec.ts` | ✅ (8.2 min) |
| **v0.4 touch** | `tests/e2e/v04-touch.spec.ts` | ✅ (2.4 min, Pixel 7 landscape emulation) |
| Canvas inspector + evidence | `inspect-threejs-canvas.mjs --manifest artifacts/evidence.json` + `check_evidence.py` | ✅ **23/23** captures PASS, render budget ok |
| Production build | `npm run build` | ✅ |
| Single-file build | `npm run build:single` | ✅ 1.44 MB; runs from `file://` with 0 errors, 0 external requests, no hooks |
| **Production hook exclusion** | `npm run check:prod` | ✅ no hook markers in `dist/` or `dist-single/` |
| ZIP packages | `artifacts/release/` | ✅ `gods-intern-v0.4-web.zip` (dist, no source maps), `gods-intern-v0.4-single-file.zip` |

### Updated expectations in older tests (each an intended v0.4 change)
- **Save version.** Save files are version 4 now. The `version` assertions use `SAVE_VERSION`.
- **Challenge count.** There are 30 challenges, so the v0.2-save migration test expects 30 records.
- **Miracle filter.** It now shows 6 challenges (Wind Management and Cold Reception joined).
- **Starter pins.** v0.4 pins three starter challenges after training. Tests that check
  their own pins clear these first.
- **v0.1 playtest flood check.** It already accepted the `FLASH FLOOD!` notification
  (v0.3 change); it is unchanged in v0.4.

## Normal-play playthrough (no shortcuts)

A new Career Mode game played like a player would:
- the tutorial with real clicks;
- lightning on the plaza rock;
- planting trees as energy allows;
- the village selector;
- the newly unlocked Tornado.

It uses no XP, Chaos or energy hooks, no fast-forward and normal energy. The only page
helpers are read-only: the state and diagnostics readers, `worldToScreen`, and
`canCast` (the same yes/no as the targeting preview, used to find open ground).

| Milestone | Real seconds |
| --- | ---: |
| First miracle (rain on the well) | 10 |
| First prayer answered | 77 |
| Tutorial complete | 127 |
| Second power used (lightning) | 136 |
| Cultural event (Rock King crowned, religion founded) | 139 |
| 12 trees planted | 307 |
| All three villages visited | 351 |
| Newly unlocked power used (Tornado) | 366 |
| Rank ≥ 3 confirmed | 377 |

**End state:**
- Rank 4 *Certified Demigod*, 563 XP.
- 5 challenges completed: The First Believers, The Rock Has Spoken, Amateur Botanist,
  Divine Tourist, Let There Be Rain.
- 1 discovery (Rock Epiphany) and 1 religion.

**When promotions actually happened.** The table only records when the test checked
the rank. The event log shows:
- rank 2 during the tutorial's flood (about 2 minutes in);
- rank 3 right after the Rock King (about 2.3 minutes);
- rank 4 while planting trees (about 4–5 minutes).

That meets the pacing targets (first promotion in minutes 1–3, more by minute 5–10).
It may be slightly generous; adjust `CONFIG.career.thresholds` after real-player tests.

## Advanced powers playthrough
- **Mode.** Switches to Creative Mode through the real pause menu, and turns on
  unlimited energy through Settings (a Creative option).
- **The eight powers, all with real mouse and keyboard input:**
  - Tornado moves and damages.
  - Fire on a tree, then Freeze discovers *Express Thaw*.
  - Gravity lifts villagers.
  - Time Warp.
  - Terraform raises, `T` toggles, then lowers.
  - Meteor shows its warning, then impacts.
  - Lightning kills a villager; Resurrection on the grave brings back the same
    individual (same id, one copy).
  - Possession: click a villager, walk with `W`/`D`, `E` interacts, `Q` exits.
- **Save, reload, load.** Terrain edits, discoveries and villager count match, and the
  game reopens the Creative slot.
- **Back to Career Mode.** Career XP is unchanged and Meteor is locked again.

## Touch playthrough (emulation)
- **Layout.** At Pixel 7 landscape (863×360): no horizontal scroll, and the toolbar fits.
- **Taps.**
  - Tapping a power slot selects it.
  - Tapping the ground casts rain.
  - Tapping in Look mode opens the inspector (no hover needed).
- **Gestures.**
  - One-finger drag pans the camera and does not cast.
  - Two-finger pinch zooms; twisting rotates.
- **No page scroll or zoom.** `scrollX`, `scrollY` and visual viewport scale stay at 0/0/1.
- **Power menu** works by touch.
- **Portrait phones** show a "turn your device sideways" prompt.

## Visual verification (run `v04-pass-1`, 1280×720 software rendering)
- **Captures.** 23 captures pass the inspector's pixel and budget checks:
  - island at sunrise, Puddleton by day, Drizzleville in rain, Rockbottom at sunset, night;
  - the eight new powers;
  - promotion, power menu, challenges and career panels;
  - civilization, overview, active play, monuments, the Book;
  - one mobile capture.
- **Images.** In `artifacts/v04-pass-1/`. Playthrough screenshots (including meteor
  warning and impact, possession, resurrection and mobile) are in
  `artifacts/playtest-v04/`.

Manual review found and fixed:
- **HUD clipped at 1280 px:** compact meters and buttons below 1400 px.
- **Pinned goals overlapped the toolbar in landscape phones:** compact pinned widget
  and prayer panel on short screens.
- **Portrait phones overflowed:** a rotate prompt replaces the overflowing layout (the
  game is landscape-first).
- **Tornado funnel read as a solid beehive:** made translucent, narrower at the base and
  wobbling.

Also from the review:
- **Meteor capture.** The inspector's meteor capture can miss the meteor, because the
  scene keeps running before capture. The playthrough screenshots
  (`15-meteor-warning.png` with the red danger ring, `16-meteor-impact.png`) show it.

## Performance (measured)

| Measure | Value |
| --- | --- |
| JS bundle | **1,034.9 kB** (302.6 kB gzip): game 467.0 kB (158.0) + three.js 567.9 kB (144.6); CSS 55.4 kB (11.7). Before: 948.6 kB (273.6 gzip). |
| Single-file HTML | 1.44 MB (573 kB gzip) |
| Draw calls / triangles (inspector, all v0.4 states) | about 147 calls, about 262k triangles. The same value in every state, so treat it as an approximate sample. |
| Simulation, browser (inspector diagnostics) | 0.42–0.95 ms per frame |
| Simulation, busiest scene (Node) | Tornado + Freeze + Gravity + Time Warp + Meteor + 42 fires: **0.80 ms avg**, 4.6 ms p95, 7.3 ms max per 20 Hz step |
| Frame CPU (excluding rasterization) | 2.8–3.7 ms |
| Real-GPU FPS | **Not measured** (no GPU in this environment) |

**Budgets:**
- Effects: at most 8 at once (oldest replaced).
- One tornado and one meteor at a time.
- Graveyard: 12 graves for 15 min.
- Terrain edits: 80.
- Heaven archive: 30 messages.

**Particles** use the existing pooled systems; tornado and gravity emissions are rate-limited.

**Graphics presets:** low, medium, high and auto, as before.

## Known limitations
- **Performance.** Real-GPU FPS was not measured, so 60 FPS is unverified.
- **Touch.** Only emulation was tested; no physical phone or tablet.
- **Freeze.** It does not create walkable ice over water. Navigation over water would
  need water-aware pathing; this is documented as omitted.
- **Terraform.**
  - Edits are kept away from water, buildings and the bridge.
  - Water does not flow into dug pits. A pit only gets a local "puddle" when rained on
    (the *Puddle of Destiny* combination).
  - Older edits are dropped after 80.
- **Puddleton-specific details.**
  - Wet Sock Festival bunting still appears only in Puddleton.
  - Village improvements (gardens, market) are Puddleton-specific.
  - The other cultural events now happen in any village.
- **Draw-call sampling.** The inspector reports one value across all states.
- **CrazyGames.**
  - Only the SDK lifecycle is wired: init, loading, gameplay and happytime.
  - No ads, data or user modules are implemented.
  - The advertisement and gameplay requirement pages were not reviewed.
  - Before submission: compressed build, sitelock whitelist, iOS audio resume, and
    checking the ads-page rules.
