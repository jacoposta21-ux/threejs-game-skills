# CrazyGames integration and submission

## Build the upload

```bash
npm run package        # production build + checks → release/rua10-crazygames-v1.0.0.zip
```

The zip holds `dist/` with `index.html` at the root (30 files, about 2.9 MB compressed). The script fails if the build contains source maps, `localhost` references, or absolute asset paths. Every path is relative (`base: './'`), so it runs from any CDN folder.

## SDK wiring (`src/platform/CrazyGames.js`)

The SDK script (`https://sdk.crazygames.com/crazygames-sdk-v3.js`) loads only on a `crazygames.*` host or referrer, or with `?sdk=1`; `?nosdk` disables it. Elsewhere every call is a no-op, and SDK errors are caught so they never break the game.

| Game moment | SDK call |
| --- | --- |
| Boot starts / first frame ready | `SDK.game.loadingStart()` / `SDK.game.loadingStop()` |
| Countdown starts; resume from pause | `SDK.game.gameplayStart()` |
| Pause, focus loss, full time, quit to menu | `SDK.game.gameplayStop()` |
| Home goal | `SDK.game.happytime()` |
| PLAY AGAIN after full time (natural break) | `SDK.ad.requestAd('midgame', { adStarted, adFinished, adError })`; the game loop is stopped and audio muted during the ad |
| Platform mute | `SDK.game.settings.muteAudio` + `addSettingsChangeListener` |
| Saves (best score, settings) | `SDK.data.getItem/setItem`, falling back to `localStorage`, then memory |

> **Verify against the official docs before submitting.** docs.crazygames.com and sdk.crazygames.com could not be reached from the build environment, in any phase. The method names come from the SDK v3 type definitions in the open-source `@adlad/plugin-crazygames` wrapper. Check them in the CrazyGames QA tool after uploading.

## Pre-submission checklist

| Requirement | Status |
| --- | --- |
| Runs from a zip with relative paths, `index.html` at root | ✓ `npm run package` checks it |
| No external requests at runtime (except the CrazyGames SDK on their host) | ✓ fonts, models and audio are bundled or synthesised |
| Fast first load | ✓ about 2.9 MB compressed in total; Rapier WASM streamed and compiled in parallel with the character models; content-hashed, cacheable assets |
| Keyboard works inside an iframe | ✓ the canvas takes focus on click; arrow keys and Space do not scroll the host page |
| Mobile / touch | ✓ stick plus PASS/SHOOT/SPRINT/TACKLE/SWITCH/SKILL buttons; portrait camera; Low quality by default on handhelds |
| Pause and mute on focus loss; pause and mute during ads | ✓ |
| Loading and gameplay events; happy time; midgame ad at a natural break | ✓ (verify method names in the QA tool) |
| No debug UI or test hooks in the shipped build | ✓ hooks and diagnostics exist only in dev or with `?qa` |
| WebGL context loss | ✓ the overlay restores, or offers a reload |
| Missing WebGL 2 / failed download | ✓ clear message with TRY AGAIN |
| Right-click menu suppressed on the canvas | ✓ |
| Original or CC0 assets, no third-party trademarks | ✓ see `docs/ASSETS.md` |

## Still to do in the CrazyGames portal (needs your account)

1. Upload `release/rua10-crazygames-v1.0.0.zip` and open the QA tool.
2. Check that loading start/stop and gameplay start/stop fire, the midgame ad plays after a match, and audio mutes during it.
3. Provide the cover art and screenshots (`docs/screenshots/p4-*.jpg` are good starting points), a description, and the controls.
4. On a mid-range laptop, open the game with `?bench` and keep the result for the submission notes.
