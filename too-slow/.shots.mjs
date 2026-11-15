import { chromium } from 'playwright';
const states = process.argv.slice(2);
const out = process.env.OUT;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5190/?q=0&dpr=0.5&unlock=all');
await page.waitForFunction(() => window.__THREE_GAME_TEST_HOOKS__, null, { timeout: 60000 });
for (const s of states) {
  const t0 = Date.now();
  await page.evaluate((s) => { window.__THREE_GAME_TEST_HOOKS__.setState(s); window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true); }, s);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${s}.jpg`, quality: 70 });
  console.log(s, Date.now() - t0, 'ms');
}
console.log('errors', errors);
await browser.close();
