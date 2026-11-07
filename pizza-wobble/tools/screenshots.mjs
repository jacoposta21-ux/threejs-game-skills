/**
 * Playwright capture: completes shift 1 with the scripted autopilot and saves screenshots to
 * screenshots/ (title, centro, piazza, porto, collina, end, garage, mobile) + metrics JSON.
 * Usage: node tools/screenshots.mjs [url] [prefix]   (default url http://127.0.0.1:4173/)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const prefix = process.argv[3] || '';
const dir = 'screenshots';
mkdirSync(dir, { recursive: true });
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const metrics = {};

async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__pw, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r(null) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function shot(page, name) {
  await frames(page, 3);
  await page.screenshot({ path: `${dir}/${prefix}${name}.png` });
  metrics[name] = await page.evaluate(() => window.__pw.stats());
  console.log('captured', name, JSON.stringify(metrics[name]));
}

const { page } = await open({ width: 1280, height: 720 });
await page.waitForTimeout(2500);
await shot(page, 'title');

// centro: drive with the autopilot for a few seconds
await page.evaluate(() => { window.__pw.startTurn(1); window.__pw.autopilot(true); window.__pw.simulate(5); });
await shot(page, 'centro');

// piazza: place the scooter at the edge of a plaza looking at the fountain
await page.evaluate(() => {
  window.__pw.startTurn(2);
  const lv = window.__pw.level(); const p = lv.map.plazas[0];
  const cx = (p.x0 + p.x1), cz = (p.z0 + p.z1);
  const x = p.x0 * 2 + 1.5, z = cz;
  window.__pw.pose(x - 4, z + 1, Math.atan2(cx - x, 0) );
  window.__pw.autopilot(false); window.__pw.simulate(0.5);
});
await shot(page, 'piazza');

await page.evaluate(() => {
  window.__pw.startTurn(11);
  const m = window.__pw.level().map;
  // on the quay road, driving along the sea
  window.__pw.pose(m.cols * 2 * 0.35, m.waterLine - 3.5, Math.PI / 2 + 0.25);
  window.__pw.autopilot(false); window.__pw.game.input.keys.add('KeyW'); window.__pw.simulate(2.5); window.__pw.game.input.keys.clear();
});
await shot(page, 'porto');

await page.evaluate(() => {
  window.__pw.startTurn(21);
  const m = window.__pw.level().map;
  // climb a switchback connector (vertical road segment) looking uphill
  const seg = m.segments.filter((s) => s.axis === 'z' && s.kind === 'road').sort((a, b) => b.z1 - a.z1)[0];
  const x = (seg.x0 + seg.x1); const z = seg.z1 * 2 - 6;
  window.__pw.pose(x, z, Math.PI);
  window.__pw.autopilot(false); window.__pw.game.input.keys.add('KeyW'); window.__pw.simulate(1.5); window.__pw.game.input.keys.clear();
});
await shot(page, 'collina');

// complete shift 1 end to end with the scripted pilot
const result = await page.evaluate(() => {
  window.__pw.startTurn(1); window.__pw.autopilot(true);
  let st = 'playing';
  for (let i = 0; i < 60 && st !== 'end'; i++) st = window.__pw.simulate(3);
  return { state: st, shift: window.__pw.shift() };
});
console.log('shift 1 result', JSON.stringify(result));
metrics.shift1 = result;
await page.waitForTimeout(1500);
await shot(page, 'fine-turno');

await page.evaluate(() => { window.__pw.setCoins(600); window.__pw.go('garage'); });
await page.waitForTimeout(1500);
await shot(page, 'garage');

const m = await open({ width: 844, height: 390 }, true);
await m.page.evaluate(() => { window.__pw.startTurn(1); window.__pw.autopilot(true); window.__pw.simulate(4); });
await shot(m.page, 'mobile');
await m.page.evaluate(() => window.__pw.go('select'));
await m.page.waitForTimeout(800);
await shot(m.page, 'mobile-select');

writeFileSync(`${dir}/${prefix}metrics.json`, JSON.stringify({ metrics, errors }, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
if (result.state !== 'end' || result.shift.delivered < 1) process.exit(1);
