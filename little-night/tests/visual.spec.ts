import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

async function canvasVariance(page: import('@playwright/test').Page): Promise<{ variance: number; buckets: number }> {
  const png = PNG.sync.read(await page.locator('#game-canvas').screenshot());
  let min = 255;
  let max = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let i = 0; i < png.width * png.height; i += stride) {
    const o = i * 4;
    const r = png.data[o];
    const g = png.data[o + 1];
    const b = png.data[o + 2];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  return { variance: max - min, buckets: buckets.size };
}

test.setTimeout(240_000);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('littlenight.settings.v1')) localStorage.setItem('littlenight.settings.v1', JSON.stringify({ version: 1, master: 0.5, music: 0.5, sfx: 0.5, sensitivity: 1, invertY: false, quality: 'low', subtitles: true }));
  });
});

test('menu renders, game starts, and the player moves with real input', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?test=1');
  await expect(page.locator('.menus button[data-act="new"]')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(800);
  const menu = await canvasVariance(page);
  expect(menu.variance).toBeGreaterThan(20);
  await page.locator('.menus button[data-act="new"]').click();
  await page.waitForFunction(() => (window as any).__LN__?.state().state === 'playing', null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => (window as any).__LN__.state().pos);
  if (testInfo.project.name.includes('mobile')) {
    await expect(page.locator('.touch.show')).toBeVisible();
    const box = (await page.locator('.touch-move').boundingBox())!;
    const x = box.x + box.width * 0.4;
    const y = box.y + box.height * 0.7;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 6 });
    await page.waitForTimeout(700);
    await page.mouse.up();
  } else {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
  }
  const after = await page.evaluate(() => (window as any).__LN__.state().pos);
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.3);
  const play = await canvasVariance(page);
  expect(play.buckets).toBeGreaterThan(3);
  await testInfo.attach(`${testInfo.project.name}-play`, { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
