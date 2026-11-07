# Pizza Wobble

3D web driving game (Three.js + Rapier): ride a scooter through an Italian town and deliver a
**physically simulated** stack of pizza boxes before it wobbles off the rack. Built for CrazyGames
(SDK not integrated yet — see `src/services/`).

```bash
npm install
npm run dev        # http://127.0.0.1:5173  (?debug=1 or F1 for the debug panel)
npm run build      # static dist/ with relative paths
npm run preview    # http://127.0.0.1:4173
npm run levels     # regenerate + validate the 30 shifts -> public/levels/levels.json
npm test           # Vitest: generator, validator, difficulty, rules, save, headless pile physics
npm run shots      # Playwright: completes shift 1 with the autopilot, saves screenshots/ (needs preview running)
npm run smoke      # Playwright: UI flow checks through real clicks/keys (needs preview running)
```

Controls: W/↑ gas · S/↓ brake/reverse · A/D or ←/→ steer · Space hard brake · R reset (−3 s) · H horn · Esc pause.
Touch: ◀ ▶ bottom-left, brake/gas bottom-right.

See `PROGRESS.md` for status and decisions, `CREDITS.md` for assets.

## Play without a server
`npm run single` writes `dist/pizza-wobble.html`: one self-contained file (JS, CSS, fonts and levels inlined)
that opens directly in Chrome with a double click. A prebuilt copy is in `play/pizza-wobble.html`.
