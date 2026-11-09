import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { diag, startMatch, trackErrors } from './helpers.js';

async function sampleCanvas(page) {
  const buffer = await page.locator('#game-canvas').screenshot();
  const png = PNG.sync.read(buffer);
  const buckets = new Set();
  let min = 255;
  let max = 0;
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let p = 0; p < png.width * png.height; p += stride) {
    const o = p * 4;
    const [r, g, b] = [png.data[o], png.data[o + 1], png.data[o + 2]];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  return { variance: max - min, colorBuckets: buckets.size };
}

test('menu → match: non-blank canvas, real input moves the player, no errors', async ({ page }, info) => {
  const errors = trackErrors(page);
  await startMatch(page);
  const sample = await sampleCanvas(page);
  expect(sample.variance).toBeGreaterThan(60);
  expect(sample.colorBuckets).toBeGreaterThan(40);

  const before = (await diag(page)).player.position;
  const moved = async () => {
    const p = (await diag(page)).player.position;
    return Math.hypot(p.x - before.x, p.z - before.z);
  };
  // Hold the input until the effect shows up: on CPU-rendered CI the frame rate
  // is low and game time advances slower than wall time.
  if (info.project.name.includes('mobile')) {
    await expect(page.locator('#touch-stick')).toBeVisible();
    const box = await page.locator('#touch-stick').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 6 });
    await expect.poll(moved, { timeout: 60_000 }).toBeGreaterThan(1.0);
    await page.mouse.up();
  } else {
    await page.keyboard.down('KeyD');
    await expect.poll(moved, { timeout: 60_000 }).toBeGreaterThan(1.0);
    await page.keyboard.up('KeyD');
  }

  await info.attach(`${info.project.name}-play`, { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('pause and resume via keyboard', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'keyboard path');
  await startMatch(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  const t0 = (await diag(page)).timeLeft;
  await page.waitForTimeout(1500);
  expect((await diag(page)).timeLeft).toBe(t0);
  await page.locator('[data-pause="resume"]').click();
  await expect(page.locator('#pause')).toBeHidden();
  await expect.poll(async () => (await diag(page)).timeLeft, { timeout: 60_000 }).toBeLessThan(t0);
});
