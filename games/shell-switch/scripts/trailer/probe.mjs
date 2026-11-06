// Probe camera setups: node probe.mjs <out.jpg> '<js body run with T,g>' [steps]
import { chromium } from 'playwright';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./trailer.mjs', import.meta.url), 'utf8');
const helper = src.slice(src.indexOf('await page.evaluate((portrait) => {') + 'await page.evaluate('.length, src.indexOf("}, mode === 'portrait');") + 1);
const [out, body, steps = '20'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto('http://127.0.0.1:4188/');
await page.waitForFunction(() => window.__SHELL__, null, { timeout: 120000 });
await page.evaluate(`(${helper})(false)`);
const shots = body.split('|||');
for (let k = 0; k < shots.length; k++) {
  await page.evaluate(`(() => { const T = window.__T; const g = window.__SHELL__.game; ${shots[k]} })()`);
  for (let i = 0; i < +steps; i++) await page.evaluate(() => window.__T.step(1 / 30));
  if (process.env.TITLE) console.log(await page.title());
  await page.screenshot({ path: out.replace('.jpg', `_${k}.jpg`), type: 'jpeg', quality: 80 });
}
await browser.close();
