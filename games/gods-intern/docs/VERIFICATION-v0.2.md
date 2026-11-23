# God's Intern — verification report (v0.2, "The Divine Absurdity Update")

All checks ran in a cloud Linux container **without a GPU**. Chromium rasterized with
SwiftShader (software), so frame rates here are not representative: about 10–17 fps in
software. Pixel checks, renderer counts, CPU timings, gameplay and UI checks are valid.
**60 fps on a real GPU has not been measured** (see Known limitations).

## Baseline before changes (v0.1, commit `b7ccfac`)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean |
| `npm run test:unit` | ✅ 22/22 |
| `npm run build` | ✅ |
| Real-input playtest (`tests/e2e/playtest.spec.ts`) | ✅ (last run on the same commit) |

## Results after v0.2

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | ✅ no errors |
| Unit tests | `npm run test:unit` | ✅ **55/55** (22 existing + 33 new culture tests), ~4 s |
| Production build | `npm run build` | ✅ JS 869 kB (247 kB gzip), CSS 73 kB |
| Production runtime | `vite preview` + Chromium | ✅ 0 console errors, **0 external requests**, no page scroll, perf overlay hidden by default |
| v0.1 real-input playtest | `tests/e2e/playtest.spec.ts` | ✅ still passes on v0.2 code (4.8 min) |
| v0.2 real-input playthrough | `tests/e2e/culture.spec.ts` | ✅ passes (4.4 min) |
| Canvas inspector | `npm run inspect:canvas -- --manifest artifacts/evidence.json` | ✅ 13/13 states PASS, render budget OK |
| Evidence manifest | `check_evidence.py --manifest artifacts/evidence.json` | ✅ 13 captures confirmed |
| UI at 1920×1080, 1366×768, 1280×720 | scripted capture with overlap check | ✅ no panel overlaps, no horizontal scroll, 0 errors |

Regressions found and fixed during v0.2:

- **Save round-trip non-determinism.** Speech-line selection consumed the gameplay RNG,
  so a restored save diverged. Speech now uses a hash.
- **Religion forming from a single event.** A religion formed from the very first
  tutorial rain. Belief pressure now caps the witness factor, so a faith needs repeated
  events, and no religion can form during the tutorial.
- **Sacred site not tied to the struck object.** A religion founded by pressure wasn't
  linked to the entity involved. Memories now carry `targetEntityId` into the sacred object.
- **Plaza rock next to the blue house.** Lightning on the plaza rock also damaged the
  house. The rock was moved.
- **Different religions grouped as one toast.** Grouping merged "A NEW RELIGION!" toasts
  for different faiths. Grouping now keys on title plus subtitle.
- **Department of Miracles ignored the event gap.** It could fire right after another
  major event. It now respects the 40-second gap.

## New unit tests (`tests/unit/culture.test.ts`), mapped to the requested list

| # | Requested | Test(s) |
| --- | --- | --- |
| 1 | Divine memory creation | *records witnessed events with witness ids…* |
| 2 | Witness detection | *only counts villagers that are in range, alive and awake* |
| 3 | Memory persistence | *decays ordinary memories, keeps permanent ones, and survives save/load*; *keeps the memory list bounded* |
| 4 | Religion formation thresholds | *needs enough belief pressure and witnesses…* |
| 5 | Religion deduplication | *deduplicates by archetype, keeps names unique and caps active religions* |
| 6 | Sacred object lifecycle | *progress from gathering to decorations, shrine and monument through villager work*; *caps… and reacts when one is destroyed* |
| 7 | Ritual scheduling | *schedules each ritual once per day at its time and applies its effect* |
| 8 | Surreal event conditions | One test per event, A through L |
| 9 | Event cooldowns | *respects cooldowns and the gap between major events* |
| 10 | Mutation target validation | *validates targets and never charges for invalid ones*; *…rejects repeats* |
| 11 | Mutation persistence | *mutations persist through save and load* |
| 12 | Personality effects | *skeptics resist conversion…*; *cowards flee a fire the brave stay near*; *every villager has 1–2 compatible traits* |
| 13 | History storage limits | *bounds the history book and collapses same-day duplicates* |
| 14 | Notification queue limits | *shows at most two notifications, groups duplicates and prioritizes* |
| 15 | v0.1 save migration | *loads a version 0.1 save and fills every new field* |
| — | Three religions via different triggers | Rock King (lightning on a rock), Holy Tree (a fire put out by rain), Golden Tree (mutation) |
| — | Long-run stability | 20-minute culture soak: all collections bounded, population stable |

## Browser playthrough (`tests/e2e/culture.spec.ts`)

Everything uses real keyboard and mouse input, with one documented exception.

1. **Start and tutorial.** Fresh profile. Press `1`, click the well, and the thirst
   prayer is answered. Rain again, the village floods, and the tutorial completes.
2. **Religious event.** Press `2`, click the plaza rock, and `surreal:rock-king` fires:
   the rock is crowned, *The Brotherhood of His Rocky Majesty* is founded with 11
   followers, and the sacred object *His Rocky Majesty* is created.
3. **Sacred object.** Clicking its pin opens the sacred-object card.
4. **Mutation.** The `grantChaos(30)` test hook unlocks Mutation deterministically
   (gameplay Chaos alone depends on fire spread). This is the one non-input step. Press
   `5`, click a visible tree, and it turns golden; *The Cult of the Shiny Bark* forms.
5. **History book.** Open it with its button. It contains "A Rock Was Crowned King" and
   "A Tree Turned to Gold". The Beliefs tab renders. Clicking an entry focuses the
   camera, and `Esc` closes the book.
6. **Save and reload.** Save from the menu, **navigate to a fresh page load**, and Load
   from the menu.
7. **Persistence confirmed.** The rock is still crowned and the tree still golden.
   Religions, sacred labels, history length and mutation count are all identical.
8. **No errors.** 0 console errors and 0 page errors.

History recorded in that run:
Day 1, in order: The Shrine Was Expanded, The Brotherhood of His Rocky Majesty Was
Founded, A Rock Was Crowned King, The Intern Discovered Mutation, A Tree Turned to Gold,
The Cult of the Shiny Bark Was Founded, The Golden Tree.

## Visual evidence (desktop 1280×720, run `v02-pass-1`)

| State | Entropy (bits) | Edge density | Contrast | Budget |
| --- | --- | --- | --- | --- |
| active-play | 6.34 | 0.407 | 180 | ok |
| tutorial | 6.71 | 0.403 | 201 | ok |
| rain | 6.63 | 0.411 | 184 | ok |
| forest-fire | 6.58 | 0.422 | 195 | ok |
| flood | 6.54 | 0.401 | 186 | ok |
| night | 5.89 | 0.387 | 220 | ok |
| overview | 5.40 | 0.305 | 152 | ok |
| inspector | 6.39 | 0.416 | 183 | ok |
| **religion** | 6.41 | 0.393 | 192 | ok |
| **monuments** | 6.54 | 0.460 | 191 | ok |
| **mutations** | 6.46 | 0.379 | 192 | ok |
| **culture-events** | 6.55 | 0.392 | 183 | ok |
| **book** | 6.21 | 0.406 | 197 | ok |

These are in `docs/screenshots/`, along with the v0.2 playthrough frames
(`v02-playthrough-*.jpg`) and the 1920×1080 and 1366×768 layouts.

## Performance observations

| Scene | Draw calls | Triangles | JS per frame | Sim per step | Render submit (software GL) |
| --- | --- | --- | --- | --- | --- |
| Fresh start (production build) | 65 | 210k | — | — | — |
| Busiest scene: every monument and the festival, low quality | 104 | 202k | 3.4 ms | 0.12 ms | 5.8 ms |
| Busiest scene, high quality | 116 | 218k | 2.7 ms | 0.16 ms | 7.7 ms |

- **JavaScript cost is small.** About 3 ms per frame on the main thread, and a fixed
  20 Hz simulation step of 0.1–0.2 ms, including all culture systems.
- **Draw calls rose from 56 to 65–116.** New batches were added, and empty instanced
  batches are now hidden so they cost nothing. Desktop budget is 300.
- **Everything new is bounded:**
  - culture rendering is about 40 instanced batches, rebuilt from state each frame;
  - memories ≤ 80, history ≤ 60, sacred objects ≤ 10, active religions ≤ 4, decorations ≤ 8 each;
  - active fires ≤ 70, the notification queue ≤ 6, visible speech bubbles ≤ 3.
- **Pacing (headless, 30 simulated minutes):**
  - *Idle player:* the Great Silence fires at 10.6 minutes, with 0.8 notifications per minute.
  - *Chaotic player:* surreal events and new religions arrive in spaced bursts (no two
    major events within 40 seconds), four religions form over 20 minutes, monuments
    complete after about 15 minutes, and notifications average 2.6 per minute.
- **Dev overlay.** Press backquote in development builds, or add `?debug` to any build.
  It shows FPS, draw calls, triangles, simulation milliseconds, villagers, fires,
  particles, religions, sacred objects, memories and active events. Hidden by default.

## Known limitations

- **Real-GPU 60 fps is unverified.** The container renders in software only.
- **Mutation in the browser test needed a Chaos hook** (`grantChaos`). In real play,
  Chaos comes from lightning, fire, floods, religions and mutations.
- **Religions are flavourful but simple.** Arguments are nonviolent and short;
  conversion is probabilistic with the seeded RNG; there are no inter-faith politics yet.
- **Monuments and decorations are procedural low-poly models.** The eight monument
  styles share one building pipeline, and decoration placement follows a fixed ring
  pattern around the sacred object.
- **Speech is limited to short canned lines.** They're chosen by event and personality,
  not generated.
- **Still one populated village.** Belief, memory and sacred systems are keyed per village
  and ready for more.
- **CrazyGames SDK is still not integrated.** Only the platform boundary exists.
- **The JS bundle is 869 kB** (247 kB gzip) and could be code-split.
