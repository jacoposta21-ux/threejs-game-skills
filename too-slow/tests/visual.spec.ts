import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

test('boots to the menu, renders a varied canvas, and the snail answers real keys', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?q=0&dpr=0.5');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 60_000 });
  await expect(page.locator('#menu-main')).toBeVisible();
  await expect(page.locator('.logo')).toContainText('TOO');

  const png = PNG.sync.read(await page.locator('#game-canvas').screenshot());
  const buckets = new Set<string>();
  for (let i = 0; i < png.width * png.height; i += 97) {
    const o = i * 4;
    buckets.add(`${png.data[o] >> 4},${png.data[o + 1] >> 4},${png.data[o + 2] >> 4}`);
  }
  expect(buckets.size).toBeGreaterThan(40);

  // Track select and garage open; a garage change persists.
  await page.click('#btn-garage');
  await expect(page.locator('#menu-garage')).toBeVisible();
  await page.click('#garage-hat button[data-v="crown"]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-main')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tooslow.look.v1') ?? '{}').hat)).toBe('crown');

  // How-to and settings open and close.
  await page.click('#btn-how');
  await expect(page.locator('#menu-how')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-main')).toBeVisible();

  // PLAY → countdown → GO, then W crawls the snail forward.
  await page.click('#btn-play');
  await page.click('.track-card[data-track="backyard"]');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'racing', null, { timeout: 120_000 });
  await expect(page.locator('#hud')).toBeVisible();
  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.score);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((b) => window.__THREE_GAME_DIAGNOSTICS__!.score > b + 2, before, { timeout: 120_000 });
  await page.keyboard.up('KeyW');

  // SPACE tucks into the shell; ESC pauses and resumes.
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'roll', null, { timeout: 30_000 });
  // F with an empty slot does nothing harmful.
  await page.keyboard.press('KeyF');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-pause')).toBeVisible();
  const frozen = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.elapsed);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.elapsed)).toBe(frozen);
  await page.click('#btn-resume');
  await expect(page.locator('#menu-pause')).toBeHidden();

  expect(errors).toEqual([]);
});
