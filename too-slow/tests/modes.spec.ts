import { expect, test, type Page } from '@playwright/test';

const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);

async function start(page: Page, mode: string, trackId?: string): Promise<void> {
  await page.click('#btn-play');
  await page.click(`.mode-card[data-mode="${mode}"]`);
  if (trackId) await page.click(`.track-card[data-track="${trackId}"]`);
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'racing', null, { timeout: 120_000 });
}

async function toMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-pause')).toBeVisible();
  await page.click('#btn-pause-menu');
  await expect(page.locator('#menu-main')).toBeVisible({ timeout: 30_000 });
}

test('tutorial, time trial and split-screen start from the mode screen and answer real keys', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?q=0&dpr=0.25&unlock=all');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 60_000 });

  // Tutorial: the checklist shows and holding W ticks off the first step.
  await start(page, 'tutorial');
  await expect(page.locator('#tutorial-panel')).toBeVisible();
  await expect(page.locator('#lap-total')).toHaveText('/1');
  await page.keyboard.down('KeyW');
  await expect(page.locator('#tutorial-steps li.done')).toHaveCount(1, { timeout: 120_000 });
  await page.keyboard.up('KeyW');
  await toMenu(page);

  // Time trial: solo field, no standings, medal targets on screen.
  await start(page, 'tt', 'backyard');
  await expect(page.locator('#tt-panel')).toBeVisible();
  await expect(page.locator('.pos-total')).toHaveText('/ 1');
  await expect(page.locator('#standings')).toBeHidden();
  expect((await diag(page)).racers.length).toBe(6);
  await toMenu(page);

  // Split-screen: the second HUD appears and the arrow keys drive racer 2, WASD racer 1.
  await start(page, 'duo', 'backyard');
  await expect(page.locator('#app')).toHaveClass(/duo/);
  await expect(page.locator('#hud2')).toBeVisible();
  const before = await diag(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction((s) => window.__THREE_GAME_DIAGNOSTICS__!.racers[1].s > s + 2, before.racers[1].s, { timeout: 120_000 });
  await page.keyboard.up('ArrowUp');
  const mid = await diag(page);
  // Player one only drifts if a rival shoulders it on the grid.
  expect(Math.abs(mid.racers[0].s - before.racers[0].s)).toBeLessThan(4);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((s) => window.__THREE_GAME_DIAGNOSTICS__!.racers[0].s > s + 2, mid.racers[0].s, { timeout: 120_000 });
  await page.keyboard.up('KeyW');
  await toMenu(page);
  await expect(page.locator('#app')).not.toHaveClass(/duo/);

  expect(errors).toEqual([]);
});

test('touch buttons drive the snail', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1024, height: 600 } });
  const page = await ctx.newPage();
  await page.goto('/?q=0&dpr=0.25');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 60_000 });
  await page.tap('#btn-play');
  await page.tap('.mode-card[data-mode="race"]');
  await page.tap('.track-card[data-track="backyard"]');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'racing', null, { timeout: 120_000 });
  await expect(page.locator('#touch-controls')).toBeVisible();
  // Crawling is automatic on touch.
  const s0 = (await diag(page)).score;
  await page.waitForFunction((b) => window.__THREE_GAME_DIAGNOSTICS__!.score > b + 2, s0, { timeout: 120_000 });
  // SHELL tucks in.
  await page.locator('#touch-controls [data-t="roll"]').dispatchEvent('pointerdown', { pointerId: 1 });
  await page.locator('#touch-controls [data-t="roll"]').dispatchEvent('pointerup', { pointerId: 1 });
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'roll', null, { timeout: 60_000 });
  await ctx.close();
});
