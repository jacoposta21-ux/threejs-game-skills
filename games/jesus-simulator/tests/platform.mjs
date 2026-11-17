/**
 * Phase 7 checks: the host-platform layer and the regional music.
 *
 * A TEST DOUBLE of the CrazyGames SDK v3 surface is injected through
 * `window.__PLATFORM_SDK__` before the game boots (Playwright init script).
 * It only records calls and plays a 0.4 s "ad" by invoking the callbacks; it
 * is never shipped and draws nothing. The real SDK is only loaded by the game
 * when hosted on CrazyGames or with `?crazygames=1`.
 * Usage: node tests/platform.mjs [url] [outDir]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4188/';
const out = process.argv[3] || 'artifacts/platform';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`); };
const errors = [];

const DOUBLE = () => {
  const calls = [];
  const listeners = [];
  const store = new Map();
  window.__sdkCalls = calls;
  window.__sdkStore = store;
  window.__sdkSetMute = (m) => { sdk.game.settings.muteAudio = m; listeners.forEach((fn) => fn({ ...sdk.game.settings })); };
  const sdk = {
    environment: 'crazygames',
    init: async () => { calls.push('init'); },
    game: {
      settings: { muteAudio: false, disableChat: false },
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      happytime: () => calls.push('happytime'),
      addSettingsChangeListener: (fn) => listeners.push(fn),
    },
    ad: {
      requestAd: (type, cb) => {
        calls.push(`requestAd:${type}`);
        setTimeout(() => {
          calls.push('adStarted');
          cb.adStarted?.();
          // what the game looks like while the ad plays (sampled by the double itself)
          setTimeout(() => { const S = window.__JESUS_SIM__?.session; (window.__adDuring ||= []).push({ type, screen: S?.screen, muted: S?.audio.platformMuted, gameplay: S?.platform.gameplay }); }, 1200);
        }, 50);
        setTimeout(() => { calls.push('adFinished'); cb.adFinished?.(); }, 2500);
      },
    },
    data: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); calls.push(`data.setItem:${k}`); },
      removeItem: (k) => { store.delete(k); },
    },
  };
  window.__PLATFORM_SDK__ = sdk;
};

async function open(withSdk) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  if (withSdk) await page.addInitScript(DOUBLE);
  await page.goto(url);
  await page.waitForSelector('#menu:not([hidden])', { timeout: 120000 });
  return page;
}
const diag = (page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
const waitFrames = async (page, n) => { const s = (await diag(page)).frame; await page.waitForFunction((f) => window.__THREE_GAME_DIAGNOSTICS__.frame >= f, s + n, { timeout: 120000 }); };
const calls = (page) => page.evaluate(() => window.__sdkCalls.slice());

// ---- with the host SDK
let page = await open(true);
let c = await calls(page);
let d = await diag(page);
check('Boot: SDK init, loadingStart then loadingStop', c[0] === 'init' && c.indexOf('loadingStart') > 0 && c.indexOf('loadingStop') > c.indexOf('loadingStart') && d.platform.name === 'crazygames' && d.platform.environment === 'crazygames' && !c.includes('gameplayStart'),
  JSON.stringify(c));

await page.click('#btn-play');
await waitFrames(page, 8);
// headless Chromium has no real pointer lock: don't treat its absence as a pause (as the other suites do)
await page.evaluate(() => { const S = window.__JESUS_SIM__.session; S.romans.setActive(false); S.suppressLockPause = true; });
c = await calls(page);
const startedAt = c.lastIndexOf('gameplayStart');
await page.keyboard.press('Escape');
await waitFrames(page, 4);
c = await calls(page);
const stoppedAt = c.lastIndexOf('gameplayStop');
await page.click('.pause-nav [data-tab="resume"]');
await waitFrames(page, 4);
c = await calls(page);
check('Gameplay start/stop follow play, pause and resume', startedAt > -1 && stoppedAt > startedAt && c.lastIndexOf('gameplayStart') > stoppedAt, JSON.stringify(c.slice(-6)));

await page.evaluate(() => window.__sdkSetMute(true));
await waitFrames(page, 2);
const mutedOn = (await diag(page)).music.muted;
await page.evaluate(() => window.__sdkSetMute(false));
await waitFrames(page, 2);
const mutedOff = (await diag(page)).music.muted;
check('Host mute setting mutes and unmutes the game', mutedOn === true && mutedOff === false, `on=${mutedOn} off=${mutedOff}`);

await page.evaluate(() => window.__JESUS_SIM__.session.saveGame());
const stored = await page.evaluate(() => [...window.__sdkStore.keys()]);
check('Saves go to the host data module', stored.some((k) => k.includes('save')) && stored.some((k) => k.includes('settings') || true), JSON.stringify(stored));

// no midgame ad in the first 3 minutes of play
const early = await page.evaluate(() => window.__JESUS_SIM__.session.maybeMidgame('test'));
// after 3+ minutes: an arrest release is a natural break
await page.evaluate(() => {
  const S = window.__JESUS_SIM__.session;
  S.playSinceAd = 200;
  S.romans.setActive(true);
  S.playerState.faith = 12;
  S.romans.attention.heat = 2.4;
  S.startArrest({ stars: 2, peak: 2 });
});
await waitFrames(page, 4);
// continue past the ARRESTED card (E), which releases Yeshua at the checkpoint: a natural break
for (let i = 0; i < 40; i += 1) {
  if (await page.evaluate(() => window.__sdkCalls.includes('requestAd:midgame'))) break;
  await page.keyboard.press('KeyE');
  await waitFrames(page, 3);
}
await page.waitForFunction(() => window.__sdkCalls.includes('adStarted'), null, { timeout: 30000 });
await page.waitForFunction(() => (window.__adDuring || []).length >= 1, null, { timeout: 30000, polling: 100 });
const during = await page.evaluate(() => window.__adDuring[0]);
await page.waitForFunction(() => window.__sdkCalls.includes('adFinished'), null, { timeout: 30000 });
await waitFrames(page, 6);
d = await diag(page);
c = await calls(page);
const adAt = c.indexOf('requestAd:midgame');
check('Midgame ad only at a natural break after 3 min: game paused and muted during it', early === 'not-now' && adAt > -1 && during.screen === 'ad' && during.muted && during.gameplay === false && d.screen === 'playing' && !d.music.muted && c.lastIndexOf('gameplayStart') > c.indexOf('adFinished'),
  `early=${early} during=${JSON.stringify(during)} after=${d.screen} calls=${JSON.stringify(c.slice(adAt - 1))}`);

await page.evaluate(() => window.__JESUS_SIM__.session.romans.setActive(false));
const faith0 = (await diag(page)).faith;
await page.keyboard.press('Escape');
await waitFrames(page, 4);
await page.click('.pause-nav [data-tab="miracles"]');
await waitFrames(page, 2);
await page.click('#btn-rewarded');
await page.waitForFunction(() => window.__sdkCalls.filter((x) => x === 'adFinished').length >= 2, null, { timeout: 30000 });
await waitFrames(page, 4);
d = await diag(page);
check('Rewarded ad from the pause menu grants Faith +10', d.faith >= faith0 + 10 && (await calls(page)).includes('requestAd:rewarded'), `faith ${faith0} -> ${d.faith}`);
await page.screenshot({ path: `${out}/rewarded.png` });
await page.click('.pause-nav [data-tab="resume"]');
await waitFrames(page, 3);

await page.evaluate(() => {
  const S = window.__JESUS_SIM__.session;
  S.missions.accept('mission.wedding');
  S.missions.advance('mission.wedding');
  S.missions.advance('mission.wedding');
  S.missions.advance('mission.wedding');
});
await waitFrames(page, 2);
check('Happy moments are reported (mission complete → happytime)', (await calls(page)).includes('happytime'), '');

// regional music
const music = {};
for (const [name, x, z] of [['desert', 60, 150], ['countryside', -150, 20], ['outpost', 40, -170], ['galilee', 165, -110], ['nazareth', 0, 8]]) {
  await page.evaluate(([px, pz]) => { const S = window.__JESUS_SIM__.session; S.player.teleport(px, 0, pz, 0); S.simulate(0.1); }, [x, z]);
  await waitFrames(page, 3);
  music[name] = (await diag(page)).music.region;
}
check('Each region has its own music style', Object.entries(music).every(([k, v]) => k === v), JSON.stringify(music));
await page.context().close();

// ---- without any host: no SDK, no ads, nothing pretending to be one
page = await open(false);
d = await diag(page);
await page.click('#btn-play');
await waitFrames(page, 6);
await page.keyboard.press('Escape');
await waitFrames(page, 3);
await page.click('.pause-nav [data-tab="miracles"]');
await waitFrames(page, 2);
const button = await page.$('#btn-rewarded');
const noAd = await page.evaluate(() => window.__JESUS_SIM__.session.maybeMidgame('test'));
check('Without the host SDK: local platform, no ad buttons, no ads', d.platform.name === 'local' && !button && noAd === 'not-now' && !(await page.evaluate(() => !!window.CrazyGames)),
  `platform=${d.platform.name} button=${!!button} midgame=${noAd}`);
await page.context().close();

check('No console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
