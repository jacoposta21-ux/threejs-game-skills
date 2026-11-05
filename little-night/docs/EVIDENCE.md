# LITTLE NIGHT — Release evidence (v1.0.0)

Everything below was run in this repository's sandbox, which has **no GPU**: Chromium rasterizes through SwiftShader (software) at 2–3 fps. Pixel, budget and gameplay checks are valid there; frame-rate numbers are not, so none are claimed.

## Automated tests (all passing)

| Command | What it proves | Result |
| --- | --- | --- |
| `npm run test:playthrough` | Main menu → New Game → Bedroom → Kitchen → Attic → ending screen, solving every puzzle with the real systems (autopilot movement with collision, Space climbs, push/pull, E interactions, LUMO perches/nest/lantern/crown, throwing, dials). Asserts checkpoints, inventory, flags, `gameComplete` save and zero console/page errors. Second test: THE HUSH sees and catches the player → scare → reload at the kitchen checkpoint; then page reload → Continue resumes the kitchen. | 2 passed |
| `npm run test:smoke` | Desktop (keyboard W) and mobile (touch joystick drag) move the player; canvas non-blank; no errors. | 2 passed |
| `npm run build` | Type-check + production build (`base: './'`). | passes |
| Production preview check | `vite preview` build: boots to menu, New Game starts play, test hooks absent without `?test`, no console errors. | passes |
| `package:crazygames` | `release/little-night-crazygames-v1.0.0.zip`, index.html at root, 37 files, 716 KiB. | produced |

Bugs the playthrough found and that were fixed (all real player-facing issues unless noted): interaction raycast used last frame's camera; items enabled after an action (LUMO in the drawer) weren't targetable; level checkpoints used wall-clock timers; bread tin blocked the counter climb landing; forced crawl persisted off the counter ("handle too high"); pantry shelf stopped the flour sack short of the crawl hole; crank sat under the climb landing (couldn't look down at it); cage plate stole the dial and wind-stem targeting; THE HUSH repeatedly snuffed the mandatory pantry perches (lure range reduced there); grazing contact blocked dragging.

## Canvas inspector (`artifacts/evidence.json`, run `release-3`, production preview with `?test=1`)

`check_evidence.py --manifest artifacts/evidence.json` → **passed, 6 artifacts confirmed**.

| Capture | Entropy (bits) | Edge density | Contrast | Draw calls | Triangles | Textures |
| --- | --- | --- | --- | --- | --- | --- |
| desktop / menu | 2.77 | 0.341 | 37.2 | — | — | — |
| mobile / bedroom | 4.58 | 0.624 | 63.7 | 73 | 20k | 46 |
| mobile / hallway (lit perch) | 4.14 | 0.591 | 52.7 | 27 | 6.5k | 36 |
| mobile / kitchen + THE HUSH | 5.39 | 0.711 | 123.5 | 124 | 83k | 56 |
| mobile / attic + THE HUSH | 3.09 | 0.760 | 54.6 | 91 | 67k | 44 |
| mobile / ending screen | 1.27 | 0.193 | 116.5 | — | — | 42 |

Screenshots: `docs/evidence/*.png`. Desktop gameplay states could not be captured by the inspector here: at 1280×720 a chapter load under software rendering exceeds the inspector's fixed 10 s preparation deadline. Desktop gameplay was exercised by the playthrough and smoke tests instead, and desktop draw-call counts were read from game diagnostics during development (bedroom ~230, kitchen ~250–300, attic ~230–300 including the shadow pass, after static batching cut ~490 → ~230).

Budget notes: textures exceed the 40 mobile guideline (42–56). They are small canvas-generated maps (128–512 px; wallpapers, wood, tiles, labels, glyphs), well under the memory budget; kept for material variety. The menu's low contrast is deliberate (dark backdrop behind the title); the ending screen is a mostly flat UI card by design.

## Visual scorecard (premium bar: no category < 2, average ≥ 2.3)

Before = not captured (new game).

| Category | Score | Evidence |
| --- | --- | --- |
| Art direction | 2.5 | Storybook-night identity across world, UI and glyphs: moon wallpaper, crayon drawings, brass/amber LUMO, chalk glyphs reused in HUD and menus. |
| Hero / player (LUMO + hands) | 2.5 | Authored clockwork firefly (glass lantern abdomen, wind key, veined wings, antenna lamps), energy-driven glow, toddler hands with pajama cuffs and contextual poses. |
| Obstacles / enemies | 2 | THE HUSH: shrouded silhouette, finger-to-mouth pose, ragged dissolve shader, smoke, procedural hitching gait; shadow hands. Rim still slightly purple in some shots. |
| Rewards / interactables | 2 | Distinct forms per role (perches, Nest, drawers, sockets, dials, lantern, music box) with prompts, reach rules and glow cues. |
| World / environment | 2.5 | Three furnished rooms per chapter with scale cues for a toddler, layered props, storm windows, glow stars, attic rafters and sanctum. |
| Materials / textures | 2 | Shared procedural material kit (planks, wallpapers, tiles, fabric, quilt, rug, grain) with roughness variation; no PBR normal maps. |
| Lighting / render | 2 | Moon key through real window openings (one shadow light), warm accents, fog per chapter, graded atmosphere pass; one unexplained thin seam line mitigated, not root-caused. |
| VFX / motion | 2 | Event VFX: lightning flash + thunder, LUMO glow/flight, chalk reveal, shadow-hand grab, catch lean-in, projector beam, finale reveal. |
| UI / HUD | 2.5 | Firefly energy meter, contextual prompts, crosshair state, noise ring, hiding slats, examine paper, chapter cards, themed menus/settings, touch layout. |
| Performance evidence | 2 | Renderer counts per state, budget notes, batching before/after; no GPU frame timings available here. |
| **Average** | **2.2** | Just under the 2.3 premium bar; enemy rim, materials and lighting are the next pass. |

## Known limitations

- No GPU frame timing was possible; verify 60 fps on target hardware (expected comfortable given ~100–300 draw calls and one shadow light).
- Thin bright seam along some wall/ceiling junctions is masked by an unlit crown band; root cause not isolated.
- CrazyGames docs could not be reached from the sandbox; SDK v3 calls were taken from a published adapter's source. Confirm in the CrazyGames QA tool before submission.
