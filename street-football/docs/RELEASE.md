# Release notes — v1.8.0

## Deliverable

`npm run package` → `release/rua10-crazygames-v1.8.0.zip` (static build, 33 files, `index.html` at the root, relative paths). The same `dist/` can be served from any static host. Hashed files under `assets/` can be cached forever; `index.html` should be served with `no-cache`.

| Piece | Compressed (gzip) |
| --- | --- |
| Game code (JS + CSS + HTML) | 95 KB |
| three.js | 169 KB |
| Rapier physics (JS + streamed WASM) | 52 KB + 1.14 MB |
| Characters (2 bodies, hair, animations) | 1.12 MB |
| Fonts (woff2 and woff fallbacks; a browser downloads only the three woff2 files it needs) | 0.27 MB |
| Recorded audio (6 MP3 files) | 0.06 MB |
| **Zip total** | **2.94 MB** |

`npm run build:single` also produces `dist-single/index.html` (7.7 MB, everything inlined) for handing the game around as one file. It is not the CrazyGames upload.

## What is in v1.8.0

- **Home screen:** free play on an empty court with a controls card; the menu opens over it (Esc / M / MENU).
- **Modes:** Quick Match, First to 5, Style Challenge, 1 v 1, three-round Tournament.
- **Content:** five courts, six teams with rated players, and unlockable second kits with saved progress.
- **Moves:**
  - foot-driven skill moves and flair moves;
  - volleys and bicycle kicks;
  - lob, through ball and one-two;
  - slide tackle;
  - Gamebreaker.
- **AI:** on Hard it uses the full move set.
- **Controls:** two-zone keyboard (no mouse) and touch.
- **Presentation:** broadcast replay, five celebrations, falls and stumbles.

## Browser support

The build targets ES2022 and needs WebGL 2:

- Chrome / Edge 94+
- Firefox 93+
- Safari 15.4+ (macOS and iOS)
- Android Chrome on a WebGL 2 GPU

| Feature used | Why it matters |
| --- | --- |
| WebGL 2 (`gl_InstanceID` for the festoons, half-float render targets for bloom) | Checked at boot, with a clear message when missing |
| WebAssembly (Rapier), streamed | All the browsers above |
| ES2022 top-level await (WASM module init) | All the browsers above |
| Web Audio | Unlocked on the first gesture; `webkitAudioContext` fallback |
| Pointer events, safe-area insets, individual CSS transform properties | All the browsers above |

**Only Chromium was available in the build environment.** Every automated test and capture ran on Chromium (desktop, and mobile emulation of a Pixel 7 / iPhone-sized viewport). Firefox and Safari were reviewed for feature support but not run; please smoke-test them before release.

## Quality tiers

| Tier | Default for | DPR cap | Shadows | Bloom | Crowd |
| --- | --- | --- | --- | --- | --- |
| Low | touch devices and small screens | 1 | off | off | 3 |
| Medium | desktop | 1.5 | 2048 | on | 6 |
| High | opt-in | 2 | 2048 | on | 10 |

If the first 4 s of play average below about 28 fps, the game drops to Low once and says so.

## Known risks

- **Audio is part recorded, part synthesised.** Ball strikes, the kickboard, the post and the goal applause are CC0 recordings; the whistle, crowd bed, "ooh", net and fence are still synthesised (no usable CC0 source was reachable). The recordings were chosen by measurement (spectrum, decay), not by ear: listen to them before release.
- **Skill-move animation was judged from still frames**, not at real speed; play-test the timing.
- **Night and dusk courts** were relit in v1.7.1: the playing area of New York, London and Tokyo now measures 83–93% of Brazil's mean brightness in gameplay captures (it was about 30%). This was measured through a software renderer at Low quality; glance at them once on a real display.

- **CrazyGames SDK method names** are taken from the SDK v3 typings in an open-source wrapper; the official docs were unreachable. Verify them in the QA tool.
- **No real-GPU frame timing** was possible in the build environment (software rendering). Use `?bench` on target hardware.
- **Firefox and Safari** were not run (see above).
