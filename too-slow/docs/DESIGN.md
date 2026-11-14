# TOO SLOW! — design notes

## Design brief

- **Player promise:** be the slowest animal alive and still hit 190 km/h, because you learned how to
  use a hill.
- **Target feeling:** helpless crawl → tuck → the slope takes over → barely-in-control speed →
  flight → clean landing → slipping past a rival.
- **Primary verb:** roll (steer momentum). **Secondary:** crawl (position / recover), slide (spend
  slime to keep momentum), boost, spin.
- **Every 5–30 s:** pick a line for the next bend or obstacle, decide whether to slide, brake or
  commit, decide when to spend a boost.
- **Across the race:** five sections that each lean on a different skill (see level plan).
- **Lose / learn / restart:** you lose places, not lives. Crashes cost momentum, which is the only
  currency; leaving the course returns you to a checkpoint. Results → RACE AGAIN is one click.
- **Rewarded:** carrying speed, clean landings, precise shortcuts. **Risk:** wet leaves, root tips,
  the narrow stone lane, landing mid-spin, boosting into a bend.
- **Better players:** brake less, slide on grass and mud, take the leaf bridge and the inside lane,
  boost on straights only, land in the steep part of the big landing.
- **Communicated by:** surface colour and texture, banked berms, the progress bar, contextual key
  hints during the first three races, toasts for every outcome.
- **Non-goals for this slice:** more courses, touch controls, online play, unlocks.

## Core loop contract

> The player **rolls and steers a shell** to **cross the finish line ahead of five rivals** while
> **momentum that only gravity can give, slippery surfaces and obstacles** create risk; success
> gives **a higher placing and a faster personal best**, failure costs **momentum and places**, and
> a restart is one click away.

| Clause | Where it is proven |
| --- | --- |
| Verb mapped to real input | `core/Input.ts` → `RaceManager.playerIntent` → `RacerBody.step` |
| Objective visible | position badge, standings, progress bar with all six snails, finish arch |
| Pressure inside the first minute | five AI rivals from the grid; first bends on wet leaves at ~20 s |
| Reward changes state | placing, best time in `localStorage`, boost charge from rolling and tricks |
| Failure teaches | hit / splash / sloppy-landing toasts, sounds, speed loss, stall hint |
| Fast restart | results → RACE AGAIN, pause → RESTART |

## Level plan — The Backyard

Point-to-point, 1,840 m from line to line, about 250 m of descent. The chase camera sees 40–100 m
ahead depending on speed; berms on both sides act as soft walls so the course rarely needs barriers.

| s (m) | Section | Teaches / tests | Notes |
| --- | --- | --- | --- |
| 0–150 | Starting Hill | crawl → tuck | flat grid, slope starts just past the line; a mushroom and two pebbles |
| 150–550 | Leaf Slide | steering on low grip | right then left bend on wet leaves, plank hop at 300, leaf-bridge shortcut over the stream (394–478, inside of the left-hander) |
| 550–960 | Root Maze | precision, momentum on a climb | two root tips to thread, split around the divider root (wide grass lane vs narrow stone lane with a three-root slalom), 2.6° climb at 672–698, rope bridge over the stream at 920–958 |
| 960–1260 | The Big Drop | commitment, air control | 30° plunge, wooden kicker at 1090–1122, 20° ski-jump landing; ~1.5 s of air |
| 1260–1960 | Final Sprint | carrying speed | three banked stone curves with slippery outside patches, straight with puddle and mud chicane, finish at 1862 |

Recovery beats: the straight after each curve pair, the bridge approach, the run-out after the
landing. Hazards are telegraphed by form (roots, mushrooms, pebbles), by surface colour (mud brown,
water blue, leaves orange) and by the section toast.

## Tuning record

All racer constants live in `TUNE` (`physics/RacerBody.ts`); surface constants in `SURFACES`
(`world/Track.ts`). Balance was set with the headless simulation (`npm run sim`): over 40 seeded
races every snail finishes, wins are spread across all six profiles, and finishing times fall
between roughly 80 and 115 s.
