# God's Intern v0.5: CrazyGames submission readiness

The requirements were re-read on 2026-11-24 from docs.crazygames.com:
- requirements: intro, ads, gameplay, technical, quality;
- SDK: game, video-ads, data;
- the Basic Launch guide.

`/sdk/settings/` returned 404; the settings API is documented on the SDK Game page.

The pages were fetched and summarized by an automated reader. Check the exact wording on
the live pages before relying on it.

**Status legend.** ✅ done and verified here · 🟡 done, needs a real-device or
on-platform check · ⬜ not done / owner action.

## Recommended launch path: Basic Launch first

- Basic Launch disables ads, so **no ads are implemented**. The game shows no ad
  buttons, so nothing breaks when ads are off.
- The SDK is optional for Basic Launch. The integration here is lifecycle only.
- Full Launch would additionally need these, none of which is implemented:
  - respecting `muteAudio`;
  - the data module, if cloud saves are wanted;
  - midgame or rewarded ads, if wanted.

## Technical

| Requirement | Status | Notes |
| --- | --- | --- |
| Initial download ≤ 50 MB (≤ 20 MB for the mobile homepage) | ✅ | Web build ≈ 1.1 MB JS + CSS/fonts; single file ≈ 1.5 MB |
| Total ≤ 250 MB, ≤ 1500 files | ✅ | A handful of files |
| Relative paths only | ✅ | Vite `base: './'`; verified from `file://` |
| Works in Chrome and Edge | 🟡 | Chromium verified (SwiftShader). Edge, Safari and Firefox not tested here |
| Works on a 4 GB Chromebook | 🟡 | Untested; the Auto quality preset lowers detail at low FPS |
| Mouse, keyboard and touch | ✅ / 🟡 | Touch verified in emulation only |
| Mobile controls not shown via touch detection | ✅ | The possession pad shows whenever possessing. Hover tooltips are hidden through the CSS `pointer: coarse` media query, not script detection |
| `user-select: none` on body | ✅ | |
| iOS AudioContext resumed in a user gesture | 🟡 | Resumed on pointerdown, keydown and touchend; needs a real iPhone |
| Sitelock | ✅ | None used |
| No unnecessary external requests | ✅ | Standalone makes 0 external requests. The SDK script loads only on CrazyGames hosts or with `?platform=crazygames` |
| Escape / Ctrl+W | 🟡 | Escape is optional: every Escape action has an on-screen button (Cancel, close ✕, Menu). On CrazyGames, Escape also exits fullscreen, which is acceptable |
| No custom fullscreen button on CrazyGames | ⬜ | The pause menu has a Fullscreen button. **Hide it on CrazyGames** (it is hidden when the CrazyGames platform is detected; confirm on the platform) |
| Compressed builds | ✅ | Not required for HTML5. The host serves gzip/brotli |

## Gameplay

| Requirement | Status | Notes |
| --- | --- | --- |
| English localization | ✅ | English only; no other locales |
| Readable at 800×450 and 1080×607 | 🟡 | Verified at 863×360 (phone emulation), 1024×768 and 1180×820. Review an 800×450 iframe on the platform |
| Physics consistent across refresh rates | ✅ | Fixed 20 Hz simulation step |
| No crashes / errors | ✅ | 0 console errors across the browser suites |
| PEGI 12 | ✅ | Cartoon peril, no gore. Villagers can die (shown as a grave and "RIP" text) |
| Land in gameplay in ≤ 1 click | ✅ | Main menu → NEW CAREER (1 click) → playable onboarding |
| Onboarding skippable (quality guideline, not a requirement) | 🟡 | The ~30 s onboarding is intentionally mandatory (product decision) and never blocks the simulation |
| No cross-promotion | ✅ | None |

## SDK lifecycle

| Call | When | Status |
| --- | --- | --- |
| `init()` | At start, before gameplay | ✅ |
| `loadingStart()` / `loadingStop()` | Around world generation | ✅ |
| `gameplayStart()` | Leaving the main menu; resuming from pause | ✅ |
| `gameplayStop()` | Pause menu; returning to the main menu | ✅ |
| `happytime()` | Promotions and challenges, max once per 60 s | ✅ |
| Visibility / focus | Not handled by us on CrazyGames (the SDK does it) | ✅ |
| `muteAudio` setting | Full Launch only | ⬜ |
| Ads | None (Basic Launch) | ✅ |
| Data module | Not used; saves are in localStorage | ⬜ Needed only if Full Launch wants cross-device progress |

## Owner actions before submitting

1. Build `npm run build` and zip `dist/`. The prepared archive is
   `artifacts/release/gods-intern-v0.5-crazygames.zip`: no source maps, no tests, no dev
   hooks.
2. Test the ZIP in the CrazyGames QA tool / preview on desktop, Android and iPhone.
3. Prepare cover art, a description and tags.
4. Decide Basic vs Full Launch. For Full Launch, implement `muteAudio` and decide on
   ads and the data module.
5. Run the human playtest in `docs/PLAYTEST-CHECKLIST.md`.
