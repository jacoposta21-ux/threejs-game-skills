// Quick screenshot helper: node tools/qa/shot.mjs <state|menu> <out.png> [w h]
import { chromium } from 'playwright';
const [state = 'menu', out = 'shot.png', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const mobile = +w < 600;
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:5188/${process.env.Q ?? ''}`);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 60000 });
if (state !== 'menu') {
  await page.evaluate((s) => { window.__THREE_GAME_TEST_HOOKS__.setState(s); window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true); }, state);
}
await page.waitForTimeout(+(process.env.WAIT ?? 600));
await page.screenshot({ path: out });
const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
console.log(JSON.stringify({ phase: diag.phase, renderer: diag.renderer, player: diag.player, ball: diag.ball, keeper: diag.keeper, physics: diag.physics }));
console.log(errors.slice(0, 15).join('\n'));
await browser.close();
