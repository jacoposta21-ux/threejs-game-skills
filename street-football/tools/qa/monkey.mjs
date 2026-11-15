// UI monkey test with real clicks and keys: random walks through menus, matches, pause, quit,
// checking after every action that the screens and the game state agree.
// node tools/qa/monkey.mjs [steps] [seed] [baseUrl]
import { chromium } from 'playwright';
const steps = Number(process.argv[2] ?? 120);
let seed = Number(process.argv[3] ?? 7);
const base = process.argv[4] ?? 'http://127.0.0.1:5188/?qa=1';
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript(() => localStorage.setItem('rua10:settings', JSON.stringify({ quality: 'low' })));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(base);
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 120000 });
await page.evaluate(() => { window.__RUA10__.skipReplays = false; });
const problems = [];
const state = () => page.evaluate(() => {
  const g = window.__RUA10__;
  const vis = [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id);
  return { phase: g.phase, paused: g.paused, lobbyMenu: !!g.lobbyMenu, screens: vis, hud: document.getElementById('hud').className, inputEnabled: g.input.enabled, time: g.time, human: !!g.human, touchHidden: document.getElementById('touch-controls').classList.contains('hidden'), tournament: !!g.tournament, mode: g.modeId };
});
const check = (s, action) => {
  const bad = (msg) => problems.push(`${msg} after [${action}] :: ${JSON.stringify(s)}`);
  if (s.screens.length > 1) bad('more than one screen visible');
  if (!s.human) bad('no human player');
  const inMatch = ['countdown', 'playing', 'kickoff', 'goal', 'replay'].includes(s.phase);
  if (inMatch && !s.paused && s.screens.length) bad('screen over a running match');
  if (inMatch && s.paused && !s.screens.length) bad('paused with no screen');
  if (s.phase === 'lobby' && s.lobbyMenu !== (s.screens.length > 0)) bad('lobby menu flag and screens disagree');
  if (s.phase === 'lobby' && !s.lobbyMenu && !s.inputEnabled) bad('free play with input disabled');
  if (s.phase === 'lobby' && !s.hud.includes('lobby')) bad('lobby without lobby HUD');
  if (inMatch && s.hud.includes('lobby')) bad('match with lobby HUD');
  if (s.phase === 'playing' && !s.paused && !s.inputEnabled) bad('playing with input disabled');
  if (s.phase === 'fulltime' && s.screens.length && s.screens[0] !== 'results') bad('full time with a non-results screen');
};
const log = [];
for (let i = 0; i < steps; i += 1) {
  const s = await state();
  let action;
  const buttons = await page.locator('.screen:not(.hidden) button:not([disabled])').all();
  const r = rnd();
  if (buttons.length && r < 0.62) {
    const b = pick(buttons);
    action = `click "${(await b.innerText().catch(() => '?')).split('\n')[0].slice(0, 28)}"`;
    await b.click({ timeout: 20000 }).catch((e) => problems.push(`click failed: ${action} ${e.message.split('\n')[0]}`));
  } else if (r < 0.8) {
    action = 'Escape';
    await page.keyboard.press('Escape');
  } else if (r < 0.88) {
    const k = pick(['KeyJ', 'KeyK', 'KeyL', 'KeyI', 'KeyU', 'KeyO', 'KeyH', 'KeyM', 'KeyC', 'KeyP']);
    action = `key ${k}`;
    await page.keyboard.press(k, { delay: 40 });
  } else if (r < 0.94) {
    action = 'hold KeyA 600ms';
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyA');
  } else {
    // Let a match run for a while (fast-forward through the hooks), sometimes to full time.
    const secs = pick([3, 8, 30, 200]);
    action = `advance ${secs}s`;
    await page.evaluate((secs) => {
      const g = window.__RUA10__;
      if (g.paused || g.phase === 'lobby') return;
      window.__THREE_GAME_TEST_HOOKS__.simulate(secs, {});
    }, secs);
  }
  await page.waitForTimeout(350);
  const after = await state();
  log.push(`${i} ${s.phase}${s.paused ? '(paused)' : ''} -> ${action} -> ${after.phase}${after.paused ? '(paused)' : ''} [${after.screens}]`);
  check(after, action);
  if (errors.length) { problems.push(`page error after [${action}]: ${errors.splice(0).join(' | ')}`); }
}
console.log(log.slice(-12).join('\n'));
console.log(JSON.stringify({ steps, problems: problems.slice(0, 12), problemCount: problems.length }, null, 1));
await browser.close();
