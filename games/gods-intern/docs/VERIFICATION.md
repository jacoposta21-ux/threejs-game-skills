# God's Intern — verification report

All checks ran in a cloud Linux container **without a GPU**. Chromium rasterized with
SwiftShader (software), so frame-rate numbers here are not meaningful: the game ran at
about 3–10 fps in software. Pixel checks, renderer counts, gameplay and UI checks are valid.
Real-GPU frame timing has **not** been measured yet (see Known limitations).

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | ✅ no errors |
| Unit tests | `npm run test:unit` | ✅ 22/22 pass (~3 s) |
| Production build | `npm run build` | ✅ `dist/` built, JS 755 kB (209 kB gzip), CSS 67 kB, fonts bundled locally |
| Production runtime | `vite preview` + Chromium | ✅ 0 console errors, **0 external network requests**, page cannot scroll, tutorial starts |
| Real-input playtest | `npm run test:e2e` (`tests/e2e/playtest.spec.ts`) | ✅ passes end to end (~5 min on software GL) |
| Canvas inspector | `npm run inspect:canvas -- --manifest artifacts/evidence.json` | ✅ 8/8 declared states PASS, render budget OK |
| Evidence manifest | `check_evidence.py --manifest artifacts/evidence.json` | ✅ 9 artifacts confirmed (8 captures + motion clip) |

### Unit tests (`tests/unit/simulation.test.ts`)

These cover deterministic world generation; energy consumption, cooldowns and
regeneration; rejected actions cost no energy (sea, inside a building, off-island, locked,
insufficient energy); nature planting persistent trees; lightning igniting trees and
frightening witnesses; rain moisture accumulation and well refill; a second rain on
saturated soil flooding the village, which later recedes; rain extinguishing fire;
fire spread never exceeding the active-fire cap; villagers fleeing fire; villagers moving
to real destinations and consuming resources; **a 15-minute unattended soak** (no NaN,
population ≥ 12, prayer history bounded); a thirst prayer generated from a real shortage
and completed by rain; prayer de-duplication; the active-prayer cap; the GREEN prayer
completed by planting 5 trees; FIRE, PANIC and FLOOD prayers completed through
simulation state; a full save round-trip, after which the restored simulation keeps
stepping identically; and corrupted, outdated and malformed saves rejected without throwing.

### Real-input browser playtest (`tests/e2e/playtest.spec.ts`)

This test drives the game the way a player does: keyboard, mouse clicks on projected
world positions, wheel, and drag.

1. Fresh profile: intro titles, then a villager walks to the shrine and pleads "PLEASE! WE NEED WATER!", the THIRST prayer appears, Rain pulses, and the other powers are locked (pressing 4 is refused).
2. Press `1`, click the well: a cloud spawns, energy drops, water rises, the prayer completes (+energy, approval).
3. Rain again on the same spot: the flood passes its threshold, God's memo appears, and the tutorial ends with all powers unlocked.
4. Nature on the river is rejected with a reason ("Too wet to plant here" / "Roots would drown") and no energy is spent; planting on dry ground adds trees.
5. Lightning on a tree ignites it (`lightning:trees=1`), chaos rises, and "THE TREE HAS SPOKEN." fires. Rain then extinguishes it.
6. Camera: wheel zoom changes distance, right-drag orbits, `D` pans, and clicking UI panels leaves the camera untouched.
7. `Space` pauses (sim time frozen) and resumes. `Esc` opens the menu, then Save → Settings (toggle) → back → Load → confirm.
8. In Look mode, clicking the well opens the Puddleton inspector, and `Esc` closes it.
9. Zero console errors and zero page errors across the run.

The playtest found two real bugs, both now fixed. Confirming **Load** or **Restart**
re-opened the pause menu instead of closing it. And on slow machines the tutorial's
fallback could fire just before the flood it was waiting for.

## Visual evidence (desktop 1280×720, `docs/screenshots/`)

| State | Entropy (bits) | Edge density | Contrast | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| active-play | 6.34 | 0.399 | 183.7 | 56 | 203k |
| tutorial | 6.69 | 0.406 | 201.6 | 56 | 203k |
| rain | 6.67 | 0.410 | 187.8 | 56 | 203k |
| forest-fire | 6.21 | 0.396 | 185.0 | 56 | 203k |
| flood | 6.50 | 0.398 | 196.1 | 56 | 203k |
| night | 5.80 | 0.365 | 219.5 | 56 | 203k |
| overview | 5.39 | 0.305 | 156.3 | 57 | 204k |
| inspector | 6.37 | 0.407 | 186.2 | 56 | 203k |

Render budget (desktop): calls 56 of 300, triangles 204k of 750k, geometries 45 of 300,
textures 4 of 60. All within budget.

Motion: `artifacts/pass-2/motion-villagers-lightning.webm` (30 s, 960×540, local only).
`docs/screenshots/motion-lightning-sequence.jpg` holds four frames from it showing:

- Villagers moving between frames.
- The clock advancing.
- A lightning strike triggering "THE TREE HAS SPOKEN.", "SOMETHING EXPLODED!", "THE VILLAGE IS IN DANGER!" and a God memo.
- Authored flames on the struck tree.

## Visual scorecard (genre-mapped, self-assessed)

| Category | Genre meaning | Score | Evidence |
| --- | --- | --- | --- |
| Art direction | Warm miniature diorama | 2.5 | One palette across terrain, buildings, UI (ivory, navy, gold); comedic tone in copy |
| Hero | Village and villagers | 2 | Authored houses, well, farm, barn and shrine; instanced villagers with per-state poses and thought icons. Villagers are small at default zoom |
| Obstacles | Disasters (fire, flood, lightning) | 2 | Flame meshes and particles, puddle discs, branching bolts, scorch smoke, charred stumps, rubble |
| Interactables | Powers, prayers, readouts | 2.5 | Terrain-projected targeting ring (red when invalid); visible well level, crops, woodpile and food sacks; cooldown sweep |
| World | Island | 2.5 | Mountain, cliffs, lake, river, forests, meadows, rocks, flowers, grass, birds, sky clouds |
| Materials | Low-poly flat shading | 2 | Vertex-coloured facets, wetness tint, damage soot. No textures (deliberate), modest material variety |
| Lighting | Day/night | 2 | Keyframed sun and sky, ACES tone mapping, shadows, glowing windows, fire lights, stars and fireflies |
| VFX | Event VFX | 2 | Rain, splashes, sparkles, confetti, prayer motes, smoke, embers, lightning flash and shake |
| UI/HUD | Commercial indie UI | 2.5 | Authored meters, power cards, prayer inbox, God memos, inspector, menus, tooltips |
| Performance evidence | — | **1.5** | Renderer counts and budgets are measured, but there is **no real-GPU FPS measurement** |

Average ≈ 2.15. This does **not** meet the repo's premium bar (≥ 2.3 with no category
below 2), mainly because real-GPU performance evidence is missing.

## Known limitations

- **No real-GPU frame-rate measurement.** The container is software-rendered. Draw calls (~56) and triangles (~200k) are small, so 60 fps on an ordinary laptop is expected, but that's unverified. Auto quality steps down to medium/low when FPS falls below 38.
- **One populated village.** The architecture (village IDs, settlement sites, mission per village) supports three, and the two extra meadows are flattened and empty.
- **CrazyGames SDK not integrated.** The docs URL returned 404 during the build, so only the `platform/` boundary exists. No ads.
- **Audio** is fully synthesized. It's functional but simple.
- **Desktop only.** Narrow windows reflow, but there are no touch controls.
- Main JS chunk is 755 kB (Three.js is most of it). It loads fine, but could be split.
