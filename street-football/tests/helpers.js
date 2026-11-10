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
  // Home screen is free play; open the menu, then PLAY → mode → team → KICK OFF.
  await openMenu(page);
  const play = page.locator('#main-menu [data-menu="modes"]');
  await expect(play).toBeVisible();
  await play.click();
  await page.locator('#mode-grid [data-mode="quick"]').click();
  await page.locator('#kickoff-btn').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing', null, { timeout: 90_000 });
}

/** The game opens on free play: the MENU button brings the menu up over the court. */
export async function openMenu(page) {
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 90_000 });
  if (!(await page.locator('#menu').isVisible())) await page.locator('#lobby-menu-btn').click();
  await expect(page.locator('#menu')).toBeVisible();
}
