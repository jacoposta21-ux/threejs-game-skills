// Renders every venue in active play (gameplay camera) and a wide view: node tools/qa/venues.mjs <outDir> [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'artifacts/venues';
const base = process.argv[3] ?? 'http://127.0.0.1:5188/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
for (const id of ['brazil', 'newyork', 'london', 'tokyo', 'barcelona']) {
  const info = await page.evaluate((id) => {
    const g = window.__RUA10__;
    const h = window.__THREE_GAME_TEST_HOOKS__;
    g.choice.court = id;
    const t0 = performance.now();
    h.setState('active-play');
    const ms = performance.now() - t0;
    h.setPausedForScreenshot(true);
    g.render();
    const r = g.renderer.info.render;
    return { id, setStateMs: Math.round(ms), calls: r.calls, tris: r.triangles, away: g.awayTeam?.name };
  }, id);
  await page.screenshot({ path: `${out}/${id}-play.png` });
  await page.evaluate(() => {
    const g = window.__RUA10__;
    g.camera.position.set(-6, 9, -24);
    g.camera.lookAt(0, 4, 6);
    g.camera.fov = 60;
    g.camera.updateProjectionMatrix();
    g.render();
  });
  await page.screenshot({ path: `${out}/${id}-wide.png` });
  console.log(JSON.stringify(info));
}
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
