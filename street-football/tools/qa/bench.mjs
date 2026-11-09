// Runs the in-game ?bench on the production preview and prints the summary.
// node tools/qa/bench.mjs [low|medium|high] [url]
import { chromium } from 'playwright';
const [quality = 'medium', url = 'http://127.0.0.1:4188/'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((q) => localStorage.setItem('rua10:settings', JSON.stringify({ quality: q })), quality);
await page.goto(`${url}?bench`);
await page.waitForFunction(() => window.__RUA10_BENCH__, null, { timeout: 900_000, polling: 2000 });
const r = await page.evaluate(() => window.__RUA10_BENCH__);
console.log(JSON.stringify({ ...r, userAgent: undefined }), 'errors:', errors);
await browser.close();
