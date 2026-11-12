# CrazyGames integration and submission

## Build the upload

```bash
npm run package        # production build + checks → release/rua10-crazygames-v1.7.1.zip
```

The zip holds `dist/` with `index.html` at the root (33 files, 2.94 MB compressed). The script fails if the build contains source maps, `localhost` references, or absolute asset paths. Every path is relative (`base: './'`), so it runs from any CDN folder.

## SDK wiring (`src/platform/CrazyGames.js`)

The SDK script (`https://sdk.crazygames.com/crazygames-sdk-v3.js`) loads only on a `crazygames.*` host or referrer, or with `?sdk=1`; `?nosdk` disables it. Elsewhere every call is a no-op, and SDK errors are caught so they never break the game.

| Game moment | SDK call |
| --- | --- |
| Boot starts / first frame ready | `SDK.game.loadingStart()` / `SDK.game.loadingStop()` |
| Free play begins (home screen, menu closed); countdown starts; resume from pause | `SDK.game.gameplayStart()` |
| Menu opened over free play; pause, focus loss, full time | `SDK.game.gameplayStop()` |
| Home goal | `SDK.game.happytime()` |
| PLAY AGAIN after full time (natural break) | `SDK.ad.requestAd('midgame', { adStarted, adFinished, adError })`; the game loop is stopped and audio muted during the ad |
| Platform mute | `SDK.game.settings.muteAudio` + `addSettingsChangeListener` |
| Saves (best score, settings, team / court / mode choice, unlock progress) | `SDK.data.getItem/setItem`, falling back to `localStorage`, then memory |

> **Verify against the official docs before submitting.** docs.crazygames.com and sdk.crazygames.com could not be reached from the build environment, in any phase. The method names come from the SDK v3 type definitions in the open-source `@adlad/plugin-crazygames` wrapper. Check them in the CrazyGames QA tool after uploading.

## Pre-submission checklist

| Requirement | Status |
| --- | --- |
| Runs from a zip with relative paths, `index.html` at root | ✓ `npm run package` checks it |
| No external requests at runtime (except the CrazyGames SDK on their host) | ✓ fonts, models and audio are bundled or synthesised |
| Fast first load | ✓ 2.94 MB compressed in total; Rapier WASM streamed and compiled in parallel with the character models; content-hashed, cacheable assets |
| No mouse needed in play | ✓ two keyboard zones (WASD + Shift; J K L / U I O / H); the mouse only clicks menus |
| Keyboard works inside an iframe | ✓ the canvas takes focus on click; arrow keys and Space do not scroll the host page |
| Mobile / touch | ✓ stick plus PASS/SHOOT/SPRINT/TACKLE/SWITCH/SKILL/FLAIR/GB buttons and a MENU button; portrait camera; Low quality by default on handhelds |
| Pause and mute on focus loss; pause and mute during ads | ✓ |
| Loading and gameplay events; happy time; midgame ad at a natural break | ✓ (verify method names in the QA tool) |
| No debug UI or test hooks in the shipped build | ✓ hooks and diagnostics exist only in dev or with `?qa` |
| WebGL context loss | ✓ the overlay restores, or offers a reload |
| Missing WebGL 2 / failed download | ✓ clear message with TRY AGAIN |
| Right-click menu suppressed on the canvas | ✓ |
| Original or CC0 assets, no third-party trademarks | ✓ see `docs/ASSETS.md` |

## Store listing (draft)

**Title:** RUA 10 — Street Football

**Short description:** 3-v-3 street football with real skill moves. Beat defenders with stepovers, elasticos and roulettes, chain combos for style, fill the Gamebreaker and finish with a bicycle kick, on five street courts from Rio to Tokyo.

**Description:** RUA 10 is arcade street football in a cage: three a side, no fouls, walls in play.
- The ball is never glued to your feet. Every touch is a real kick, and skill moves are played with the sole and the side of the boot.
- Trick a defender for style points and chain moves into combos. A full Gamebreaker meter gives you ten seconds of unstoppable shooting.
- Play a quick match, race to five goals, chase a style target, go one on one, or win a three-round tournament across New York, London, Tokyo, Barcelona and Brazil.
- Unlock a second kit for every team.
- The game opens in free play, so you can practise moves and shots straight away.

**Controls (keyboard):**

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint |
| J | Shoot (hold for power) |
| K | Pass (hold for a lob) |
| L | Skill |
| I | Flair |
| U | Tackle (with Shift: slide) |
| O | Switch player |
| H | Gamebreaker |
| Esc / M | Menu or pause |

On touch: stick and on-screen buttons.

**Category / tags:** Sports, Football (Soccer), 3D, Skill, 1 player.

**Screenshots:** `docs/screenshots/store-*.jpg` (free play, two match shots in Brazil, the four other courts, team select).

## Still to do in the CrazyGames portal (needs your account)

1. Upload `release/rua10-crazygames-v1.7.1.zip` and open the QA tool.
2. Check that loading start/stop and gameplay start/stop fire, the midgame ad plays after a match, and audio mutes during it.
3. Paste the listing text above, upload the screenshots and make a cover image (none is included).
4. Play one match at real speed on a desktop with a GPU and on a phone: this was not possible in the build environment.
5. On a mid-range laptop, open the game with `?bench` and keep the result for the submission notes.
