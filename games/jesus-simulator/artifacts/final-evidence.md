# Evidence — Phase 7 (polish, regional music, host-platform layer)

Screenshots and videos are kept out of git (the repo ignores `artifacts/`). This report, the manifest, the JSON reports and the motion sheets are committed. Regenerate the rest with:
- `npm run verify:visual`
- `npm run test:play`
- `npm run test:platform`
- `npm run test:motion`
- `npm run test:npc-motion`
- `npm run test:roman-motion`
- `npm run test:ride-motion`

All runs used the final production build (`npm run build` + `vite preview` on :4188) in headless Chromium with **software rendering (SwiftShader)**, so FPS numbers are not meaningful (about 1–2 FPS here). Pixel, budget and gameplay checks are meaningful.

Player actions use real input (keys, number keys, Q, E, F, G and mouse clicks in menus) while the fixed 60 Hz simulation is fast-forwarded in-page. The circus lap and the donkey's last metres use the test autopilot.

Phase 1–6 evidence remains in git history.

## Canvas inspector — run `phase7-pass-1`
Manifest: [evidence.json](evidence.json). `check_evidence.py --manifest` → **passed, 24 artifacts confirmed.** **18/18 captures PASS.** All 17 desktop captures are within the desktop render budget (calls ≤ 300, triangles ≤ 750k, geometries ≤ 300).

| Viewport / state | Draw calls | Triangles | Geometries |
| --- | --- | --- | --- |
| desktop / menu (village orbit) | 297 | 638k | 254 |
| desktop / active-play | 237 | 490k | 231 |
| desktop / roman-pursuit | 276 | 514k | 239 |
| desktop / ride-chariot | 219 | 597k | 134 |
| desktop / followers | 116 | 421k | 160 |
| desktop / the other 12 states | within budget | | |
| mobile / followers | 97 | 414k > 300k | 150 |

The mobile capture is over the triangle budget; mobile is not a target.

## Real-input playtest — run `phase7-pass-1`
[results.json](phase7-pass-1/playtest/results.json) — **73/73 PASS** and no console or page errors. It covers Phases 1–6: 12 + 10 + 9 + 14 + 14 + 14 checks.

## Host-platform checks — run `phase7-pass-1`
[platform/results.json](phase7-pass-1/platform/results.json) — **10/10 PASS** and no console or page errors.

A **test-only** double of the CrazyGames SDK v3 surface is injected before boot. It records calls and plays a 2.5 s "ad" by invoking the callbacks. It is never shipped and draws nothing. The checks:

1. **Boot:** SDK `init`, then `loadingStart`, then `loadingStop`. The environment is reported, and gameplay hasn't started at the menu.
2. **Gameplay state:** `gameplayStart` on Play, `gameplayStop` on pause, `gameplayStart` on resume — state changes only.
3. **Mute:** the host's mute setting mutes and unmutes the game.
4. **Saves:** they go to the host's data module.
5. **Midgame ad:**
   - Refused before 3 minutes of play.
   - After 3+ minutes, the release from an arrest triggers `requestAd('midgame')`.
   - While it plays, the game is in the `ad` state, muted, with gameplay stopped.
   - Afterwards the game is back to playing, unmuted, with `gameplayStart` again.
6. **Rewarded ad:** from Pause → Miracles, it grants Faith +10.
7. **Happy moments:** `happytime` on mission completion.
8. **Regional music:** desert, countryside, outpost, Galilee and Nazareth each select their own style.
9. **Without the host SDK:** the local platform shows no ad button, refuses midgame ads, and loads no `CrazyGames` global.
10. **No console or page errors.**

## Motion
[ride-motion-sheet.png](phase7-pass-1/motion/ride-motion-sheet.png), [motion-sheet.png](phase7-pass-1/motion/motion-sheet.png), [npc-motion-sheet.png](phase7-pass-1/motion/npc-motion-sheet.png) and [roman-motion-sheet.png](phase7-pass-1/motion/roman-motion-sheet.png), all shot on the final build.

## Defects found during this pass and fixed
- **Loading bar overflowed** past 100% with the larger world (8 build steps).
- **Test timing:** the SDK double's timers bunched up behind slow software-rendered frames, ending the "ad" before the check could sample it. The double now times the ad from its own start.

## Not verified
- **The real CrazyGames SDK:**
  - docs.crazygames.com and sdk.crazygames.com could not be reached from this session (blocked by its permissions, even after the environment allowed the hosts).
  - The adapter follows SDK v3 as known at the time of writing, and every call is feature-checked.
  - Before submitting, verify the names against the live docs, test with `?crazygames=1` and run the CrazyGames QA tool.
  - **The game has not been submitted and has no CrazyGames approval.**
- Real-GPU frame rate and audio (including the regional music) in a headed browser.
- Mobile/touch input (not a target).
