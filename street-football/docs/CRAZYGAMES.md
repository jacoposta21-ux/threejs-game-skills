# CrazyGames integration

`src/platform/CrazyGames.js` wraps the CrazyGames HTML5 SDK v3. It is loaded only when the page runs on a `crazygames.*` host or referrer, or when `?sdk=1` is in the URL. `?nosdk` forces it off. Everywhere else every call is a no-op, and SDK failures are caught so they can never break the game.

| Game moment | SDK call |
| --- | --- |
| Boot starts / first frame ready | `SDK.game.loadingStart()` / `SDK.game.loadingStop()` |
| Kick-off countdown starts, or resume from pause | `SDK.game.gameplayStart()` |
| Pause, focus loss, full time, quit to menu | `SDK.game.gameplayStop()` |
| Goal scored | `SDK.game.happytime()` |
| "Play again" after full time (natural break) | `SDK.ad.requestAd('midgame', { adStarted, adFinished, adError })`; the loop is stopped and audio muted for the ad |
| Platform mute setting | `SDK.game.settings.muteAudio` + `SDK.game.addSettingsChangeListener` |
| Saves (best score, settings) | `SDK.data.getItem/setItem` when available, otherwise `localStorage`, otherwise memory |

**Verify before submitting.** The official docs (docs.crazygames.com) could not be reached from the build environment. The method names above come from the SDK v3 type definitions used by the open-source `@adlad/plugin-crazygames` package, which wraps the real SDK. Check them against the current docs and the CrazyGames QA tool before submission:

1. `npm run build` → zip the contents of `dist/` (the build uses relative paths, so it works from any folder).
2. Upload the zip in the CrazyGames developer portal and run the QA tool. Confirm loading start/stop, gameplay start/stop on pause/resume, the midgame ad after a match, and mute.

Already handled: pausing and muting on focus loss, no external links, responsive resize, touch controls, WebGL context loss and restore, and no runtime downloads beyond the bundle.
