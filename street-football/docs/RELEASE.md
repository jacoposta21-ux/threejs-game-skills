# Release notes — v1.0.0

## Deliverable

`npm run package` → `release/rua10-crazygames-v1.0.0.zip` (static build, `index.html` at the root, relative paths). The same `dist/` can be served from any static host. Hashed files under `assets/` can be cached forever; `index.html` should be served with `no-cache`.

| Piece | Compressed (gzip) |
| --- | --- |
| Game code (JS + CSS) | ~70 KB |
| three.js | 175 KB |
| Rapier physics (JS + streamed WASM) | 52 KB + 1.19 MB |
| Characters (2 bodies, hair, animations) | ~1.15 MB |
| Fonts | ~0.1 MB |
| **Zip total** | **2.89 MB** |

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

- **CrazyGames SDK method names** are taken from the SDK v3 typings in an open-source wrapper; the official docs were unreachable. Verify them in the QA tool.
- **No real-GPU frame timing** was possible in the build environment (software rendering). Use `?bench` on target hardware.
- **Firefox and Safari** were not run (see above).
