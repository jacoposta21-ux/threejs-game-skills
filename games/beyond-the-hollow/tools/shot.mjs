// Quick browser driver: node tools/shot.mjs <outdir> [level] [checkpoint] [w] [h]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'artifacts/shots';
const level = Number(process.argv[3] ?? -1);
const cp = Number(process.argv[4] ?? -1);
const W = Number(process.argv[5] ?? 1280), H = Number(process.argv[6] ?? 720);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:5188/' + (process.env.GL ? '' : '?canvas'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/00-title.png` });
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/01-menu.png` });
if (level >= 0) {
  await page.evaluate(([l, c]) => { const g = window.__game; g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'UI') g.scene.stop(s.scene.key); }); g.scene.start('Game', { level: l, checkpoint: c }); }, [level, cp]);
} else {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/02-story.png` });
  await page.keyboard.press('Space');
}
await page.waitForTimeout(Number(process.env.WAIT || 6000));
await page.screenshot({ path: `${out}/03-game.png` });
const st = await page.evaluate(() => window.__BTH && window.__BTH.state());
console.log(JSON.stringify(st));
console.log('ERRORS', errors.slice(0, 20).join('\n'));
await browser.close();
