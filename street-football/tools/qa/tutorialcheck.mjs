// Plays the tutorial end to end through the game's own intents and reports each step.
// node tools/qa/tutorialcheck.mjs [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5188/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
const log = await page.evaluate(() => {
  const g = window.__RUA10__;
  const h = window.__THREE_GAME_TEST_HOOKS__;
  h.setPausedForScreenshot(true);
  g.startTutorial();
  h.simulate(4.2, {}); // countdown
  const steps = [];
  let last = -1;
  const toIntent = (wx, wz, extra = {}) => {
    const y = g.cameraRig.yaw;
    const c = Math.cos(y);
    const s = Math.sin(y);
    const n = Math.hypot(wx, wz) || 1;
    return { moveX: (-c * wx + s * wz) / n, moveY: (s * wx + c * wz) / n, ...extra };
  };
  let t = 0;
  let pressCycle = 0;
  while (t < 240 && g.tutorial && g.tutorial.index < 8) {
    const tut = g.tutorial;
    if (tut.index !== last) {
      steps.push({ step: tut.index, title: document.getElementById('tut-title').textContent, at: +t.toFixed(1) });
      last = tut.index;
    }
    const hk = g.human;
    const p = hk.p.position;
    const b = g.ball.position;
    const toBall = toIntent(b.x - p.x, b.z - p.z);
    const id = ['move', 'dribble', 'pass', 'skill', 'flair', 'shoot', 'defend', 'gamebreaker'][tut.index];
    let it = {};
    pressCycle += 1;
    const tap = pressCycle % 12 === 0;
    if (id === 'move') it = toIntent(-1, Math.sin(t));
    else if (!hk.possession && id !== 'defend') it = toBall;
    else if (id === 'dribble') it = toIntent(Math.sign(-p.x - 0.01) || -1, -p.z * 0.2, { sprint: true });
    else if (id === 'pass') it = { ...toIntent(1, 0), passPressed: tap };
    else if (id === 'skill') it = { skillPressed: tap };
    else if (id === 'flair') it = { skill2Pressed: tap };
    else if (id === 'shoot') {
      const dx = -15 - p.x;
      it = toIntent(dx, -p.z);
      if (Math.abs(dx) < 9 && tap) it = { ...it, shootPressed: true, shootHeld: true };
      else if (hk.charge.active) it = { ...it, shootHeld: hk.charge.t < 0.45, shootReleased: hk.charge.t >= 0.45 };
    } else if (id === 'defend') it = { ...toBall, tacklePressed: tap && Math.hypot(b.x - p.x, b.z - p.z) < 1.6 };
    else if (id === 'gamebreaker') it = { specialPressed: tap };
    h.simulate(0.05, it);
    t += 0.05;
  }
  steps.push({ end: true, at: +t.toFixed(1), finished: !!g.tutorial && g.tutorial.index >= 8, progress: g.progress.data.tutorialDone });
  return steps;
});
console.log(JSON.stringify(log));
console.log('errors', JSON.stringify(errors));
await browser.close();
