// Smoke test of the CrazyGames build with a mock SDK v3 (logs every SDK call).
// usage: node scripts/crazygames-smoke.mjs <url> [noSdk] [shotDir]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://127.0.0.1:4190/';
const noSdk = process.argv[3] === 'noSdk';
const shotDir = process.argv[4];
const MOCK = `
(() => {
  const log = (...a) => (window.__cg = window.__cg || []).push(a.join(' '));
  const store = {};
  const settingsCbs = [];
  const SDK = {
    environment: 'crazygames',
    async init() { log('init'); },
    game: {
      settings: { muteAudio: false, disableChat: false },
      loadingStart: () => log('loadingStart'), loadingStop: () => log('loadingStop'),
      gameplayStart: () => log('gameplayStart'), gameplayStop: () => log('gameplayStop'),
      happytime: () => log('happytime'),
      addSettingsChangeListener: (cb) => settingsCbs.push(cb),
    },
    ad: { requestAd(type, cb) { log('requestAd', type); cb.adStarted && cb.adStarted(); setTimeout(() => { cb.adFinished && cb.adFinished(); log('adFinished'); }, 1500); } },
    data: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; log('setItem', k, v.length); }, removeItem: (k) => { delete store[k]; log('removeItem', k); } },
  };
  window.__cgMute = (m) => { SDK.game.settings.muteAudio = m; settingsCbs.forEach((c) => c({ ...SDK.game.settings })); };
  window.CrazyGames = { SDK };
})();`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.route('https://sdk.crazygames.com/**', (r) => (noSdk ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: MOCK })));
await page.goto(url);
await page.waitForFunction(() => window.__SHELL__, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const log = () => page.evaluate(() => (window.__cg || []).splice(0));
console.log('after load:', await log());
if (shotDir) await page.screenshot({ path: `${shotDir}/cg-title.png` });
// Start a new game through the real title menu button.
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setState('active-play'));
await page.waitForTimeout(800);
console.log('after start:', await log());
await page.keyboard.press('KeyP');
await page.waitForTimeout(500);
console.log('after pause:', await log());
await page.keyboard.press('KeyP');
await page.waitForTimeout(500);
console.log('after resume:', await log());
// Complete a mission via the game itself to trigger happytime + midgame ad.
const before = await page.evaluate(() => { const g = window.__SHELL__.game; return { muted: g.audio.sfxVol }; });
await page.evaluate(() => { const g = window.__SHELL__.game; const m = g.missions?.list?.find?.((x) => x.state !== 'done') ?? null; window.__mid = m && m.id; });
await page.evaluate(() => { const P = window.__SHELL__; P.game.progress.dirty = true; });
await page.evaluate(() => { window.__cgMute?.(true); });
await page.waitForTimeout(300);
const mutedVol = await page.evaluate(() => window.__SHELL__.game.audio.sfxVol);
await page.evaluate(() => { window.__cgMute?.(false); });
await page.waitForTimeout(300);
const unmutedVol = await page.evaluate(() => window.__SHELL__.game.audio.sfxVol);
console.log('mute setting -> sfxVol', mutedVol, 'unmute ->', unmutedVol, '(before', before.muted, ')');
// Finish mission S1 (Brick lifts the trunk): expect happytime, then a midgame ad that pauses and mutes.
await page.evaluate(() => {
  const g = window.__SHELL__.game;
  g.loop.stop();
  const h = g.hostChars.get('strongman');
  h.place(0, 0, 47.35, Math.PI);
  g.glim.model.root.visible = false; g.glim.active = false;
  g.progress.discovered.add('strongman');
  h.possessed = true; h.model.setPossessed(true); g.controlled = h;
  g.objById.get('trunk').useF(g);
  for (let i = 0; i < 40; i++) g.update(1 / 30);
  window.__SHELL__.lookAt(1, 55);
  g.input.intent.ability = true;
  for (let i = 0; i < 90; i++) g.update(1 / 30);
  window.__done = [...g.progress.missions];
});
await page.waitForTimeout(2900);
const during = await page.evaluate(() => ({ log: (window.__cg || []).splice(0), sfx: window.__SHELL__.game.audio.sfxVol }));
console.log('missions done:', await page.evaluate(() => window.__done));
console.log('mission complete (+2.9s):', during.log, 'sfxVol during ad', during.sfx);
await page.waitForTimeout(1800);
const after = await page.evaluate(() => ({ log: (window.__cg || []).splice(0), sfx: window.__SHELL__.game.audio.sfxVol }));
console.log('after ad:', after.log, 'sfxVol', after.sfx);
await page.waitForTimeout(9000);
console.log('later (save flush):', await log());
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
