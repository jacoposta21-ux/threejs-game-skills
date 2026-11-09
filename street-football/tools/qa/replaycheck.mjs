// Replay evidence: plays the scripted goal, restarts the instant replay and
// captures page screenshots (canvas + letterbox/film overlays) through it.
// node tools/qa/replaycheck.mjs <outDir> [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'artifacts/replay';
const base = process.argv[3] ?? 'http://127.0.0.1:5188/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(base);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
const info = await page.evaluate(() => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  const g = window.__RUA10__;
  h.seed(3);
  h.setState('replay');
  h.setPausedForScreenshot(true);
  g.startReplay();
  const r = g.replay;
  return { frames: r.frames, shot: r.shot, start: +r.frameF.toFixed(1), shooter: r.actors[r.shooter].f.look.name, name: document.getElementById('replay-name').textContent };
});
console.log(JSON.stringify(info));
const log = [];
for (let i = 0; i < 40; i += 1) {
  const st = await page.evaluate(() => {
    const g = window.__RUA10__;
    const h = window.__THREE_GAME_TEST_HOOKS__;
    if (g.phase !== 'replay') return null;
    h.simulate(0.1, {});
    g.render();
    const r = g.replay;
    return { phase: g.phase, seg: r.segment(), frameF: +r.frameF.toFixed(1), rate: +r.rateAt(r.frameF).toFixed(2), fov: +g.camera.fov.toFixed(1), ballV: +g.ball.velocity.length().toFixed(1) };
  });
  if (!st || st.phase !== 'replay') break;
  log.push(st);
  await page.screenshot({ path: `${out}/replay-${String(i).padStart(2, '0')}.png` });
}
console.log(log.map((s) => `${s.frameF}:s${s.seg}:r${s.rate}:v${s.ballV}`).join(' '));
await browser.close();
