import { expect } from '@playwright/test';

export const diag = (page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);

export function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Load, wait for the menu, press PLAY and wait for kick-off (real UI input). */
export async function startMatch(page) {
  // CI machines often render WebGL on the CPU; Low keeps them interactive.
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('rua10:settings')) {
      window.localStorage.setItem('rua10:settings', JSON.stringify({ quality: 'low', difficulty: 'normal', shake: true }));
    }
  });
  await page.goto('/?qa=1');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 120_000 });
  const play = page.locator('#main-menu [data-menu="play"]');
  await expect(play).toBeVisible();
  await play.click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing', null, { timeout: 90_000 });
}
