# Phase 1 evidence

Screenshots and the video are kept out of git (the repo ignores `artifacts/`); this report, the manifest, the JSON reports and the motion sheet are committed. Regenerate the captures with `npm run verify:visual`, `npm run test:play` and `npm run test:motion`.

All runs were against the production build (`npm run build` + `vite preview` on :4188) in headless Chromium. **Rendering was software (SwiftShader):** pixel, budget and gameplay checks are valid, but FPS and frame-time numbers are not.

## Build
`npm run build` → success; three chunks: app 100 KB, three 524 KB, rapier 4.3 MB (1.67 MB gzip, inlined WASM).

## Canvas inspector — run `phase1-pass-4`
Manifest: [evidence.json](evidence.json). `check_evidence.py --manifest` → **passed, 12 artifacts confirmed.**

| Viewport / state | Result | Budget | Screenshot |
| --- | --- | --- | --- |
| desktop / menu | PASS | ok | [png](phase1-pass-4/desktop-menu.png) |
| desktop / active-play | PASS | ok | [png](phase1-pass-4/desktop-active-play.png) |
| desktop / portrait | PASS | ok | [png](phase1-pass-4/desktop-portrait.png) |
| desktop / market | PASS | ok | [png](phase1-pass-4/desktop-market.png) |
| desktop / rooftop | PASS | ok | [png](phase1-pass-4/desktop-rooftop.png) |
| desktop / map | PASS | ok | [png](phase1-pass-4/desktop-map.png) |
| desktop / pause | PASS | ok | [png](phase1-pass-4/desktop-pause.png) |
| mobile / menu | PASS | triangles 334k > 300k | [png](phase1-pass-4/mobile-menu.png) |
| mobile / active-play | PASS | triangles 343k > 300k | [png](phase1-pass-4/mobile-active-play.png) |

The mobile triangle overage is accepted for this release, which targets desktop. The Low preset reduces grass and draw distance.

## Real-input playtest — `tests/playtest.mjs` (run `phase1-pass-3`, gameplay code unchanged since)
[results.json](phase1-pass-3/playtest/results.json) — **13/13 PASS**:
- **Walk:** moved 14.7 m and stayed grounded.
- **Discovery:** the workshop landmark triggers.
- **Wall collision:** the player stops 0.40 m from the house wall (capsule radius 0.36).
- **Stairs:** outdoor stairs climbed to the roof at y = 8.79, using only W, then A through the parapet gap.
- **Rooftop:** the Rooftop Lookout landmark (minY 6) is discovered.
- **Jump:** jumping from the roof leaves the ground and lands.
- **Interaction:** at the well, the E prompt and dialog appear.
- **Sprint:** 8.2 m/s against 4.6 m/s walking.
- **Map:** TAB opens and closes it.
- **Pause:** ESC opens the pause menu.
- **Save & continue:** Save & Quit, then continue, restores the landmarks.
- **Corrupt save:** an unparseable save is quarantined; the game starts fresh with a PLAY label and no crash.
- **Errors:** no console or page errors.

## Motion — `tests/motion.mjs` (run `phase1-pass-3`)
[motion-sheet.png](phase1-pass-3/motion/motion-sheet.png) shows idle → walk ×4 → sprint ×3 → jump rise / apex → fall → land → idle, driven by real keys. The `locomotion.webm` recording is produced locally and git-ignored because of its size.

The sheet shows leg and arm swing scaling with speed, forward lean on sprint, an airborne pose, a return to idle, and hair/sash sway.

## Physics
- **Engine:** Rapier 3D (compat) with a fixed 60 Hz step and an accumulator clamped at 0.1 s.
- **Static colliders:** a terrain trimesh (200 × 200 cells) plus about 550 primitive colliders — cuboids for buildings, stalls and ramps; cylinders for trunks, columns and the well.
- **Dynamic props:** about 40 bodies (cylinders and cuboids) that sleep until disturbed.
- **Player:** kinematic capsule (r 0.36, half-height 0.54) driven by the KinematicCharacterController. Settings: autostep 0.42 m, max climb 48°, snap 0.45 m, pushes dynamic bodies.

## Renderer (desktop, High, gameplay view)
About 70 draw calls; about 280k triangles in the main meshes (terrain 80k, grass 50k, village batches about 110k). There is one shadow-casting directional light, snapped to the texel grid, with a 2048 map.

## Not verified
- Real-GPU FPS. The auto-downgrade path was exercised (it fired on the software renderer), but 60 FPS on target hardware has not been measured.
- Audio playback in a headed browser. All audio is procedural and runs without errors headless.
