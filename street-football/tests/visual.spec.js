import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { diag, openMenu, startMatch, trackErrors } from './helpers.js';

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

test('Q switches the controlled teammate', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'keyboard path');
  test.setTimeout(420_000);
  await startMatch(page);
  // Stand still: the AI presses and wins the ball, so we are defending.
  await expect.poll(async () => (await diag(page)).possession.team, { timeout: 300_000, intervals: [1000] }).toBe('away');
  const before = (await diag(page)).player.name;
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await diag(page)).player.name, { timeout: 60_000 }).not.toBe(before);
  await expect(page.locator('#player-name')).not.toHaveText(before);
});

test('E performs a skill move with the ball (real keyboard input)', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'keyboard path');
  await startMatch(page);
  // Observe gameplay events (input stays real keyboard).
  await page.evaluate(() => {
    window.__tricks = [];
    window.__RUA10__.events.on('trickStart', (e) => window.__tricks.push(e.kind));
  });
  // We kick off with the ball at our feet.
  await expect.poll(async () => (await diag(page)).player.possession, { timeout: 60_000 }).toBe(true);
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__tricks.length), { timeout: 60_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__tricks[0])).toBe('stepover');
});

test('R performs a flair move and G fires a full Gamebreaker (real keyboard input)', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'keyboard path');
  await startMatch(page);
  await page.evaluate(() => {
    window.__tricks = [];
    window.__RUA10__.events.on('trickStart', (e) => window.__tricks.push(e.kind));
  });
  await expect.poll(async () => (await diag(page)).player.possession, { timeout: 60_000 }).toBe(true);
  await page.keyboard.press('KeyI');
  await expect.poll(() => page.evaluate(() => window.__tricks.length), { timeout: 60_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__tricks[0])).toBe('elastico');
  // Fill the meter (style points do this in play), then fire it with G.
  await page.evaluate(() => {
    const g = window.__RUA10__;
    g.addStyle(3000, 'TEST', g.human.p.position.clone());
  });
  await expect(page.locator('#gb')).toHaveClass(/ready/);
  await page.keyboard.press('KeyH');
  await expect.poll(() => page.evaluate(() => window.__RUA10__.gb.active > 0), { timeout: 60_000 }).toBe(true);
  await expect(page.locator('#app')).toHaveClass(/gb-on/);
});

test('content: every court, team and mode is reachable from the menus', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?qa=1');
  await openMenu(page);
  await page.locator('#main-menu [data-menu="courts"]').click();
  await expect(page.locator('#court-grid [data-court]')).toHaveCount(5);
  await page.locator('#court-grid [data-court="tokyo"]').click();
  await page.locator('#courts [data-back]').click();
  await page.locator('#main-menu [data-menu="modes"]').click();
  await expect(page.locator('#mode-grid [data-mode]')).toHaveCount(5);
  // Multiplayer is announced but not selectable.
  await expect(page.locator('#mode-grid .mode-card.soon')).toContainText('MULTIPLAYER');
  await expect(page.locator('#mode-grid .mode-card.soon')).toBeDisabled();
  await page.locator('#mode-grid [data-mode="firstTo5"]').click();
  await expect(page.locator('#team-grid [data-team]')).toHaveCount(6);
  await page.locator('#team-grid [data-team="bkb"]').click();
  await page.locator('#kickoff-btn').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing', null, { timeout: 90_000 });
  const state = await page.evaluate(() => ({ venue: window.__RUA10__.venueId, home: window.__RUA10__.homeTeam.name, mode: window.__RUA10__.mode.id }));
  expect(state).toEqual({ venue: 'tokyo', home: 'BROOKLYN BRIDGERS', mode: 'firstTo5' });
  await expect(page.locator('#match-clock')).toHaveText('FIRST TO 5');
  await expect(page.locator('#home-badge')).toHaveText('BKB');
  expect(errors).toEqual([]);
});

test('home screen is free play: one player, a ball, the menu on ESC', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 90_000 });
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#lobby-bar')).toBeVisible();
  const field = await page.evaluate(() => {
    const g = window.__RUA10__;
    return {
      outfield: g.match.allOutfield().length,
      keepersVisible: Object.values(g.match.teams).some((t) => t.keeper.k.holder.visible),
    };
  });
  expect(field).toEqual({ outfield: 1, keepersVisible: false });
  await expect(page.locator('[data-menu="tutorial"]')).toHaveCount(0);
  // A goal into the empty net: the ball comes back onto the pitch, and stays there, even with the player facing the net.
  const back = await page.evaluate(() => {
    const g = window.__RUA10__;
    const h = window.__THREE_GAME_TEST_HOOKS__;
    const out = [];
    for (let i = 0; i < 2; i += 1) {
      g.human.p.teleport(-13.5, 0, -Math.PI / 2);
      g.ball.placeAt(-15.6, 0.3, 0);
      h.simulate(3.5, {});
      out.push({ inGoal: g.ball.inGoal, onPitch: Math.abs(g.ball.position.x) < 14 });
    }
    return out;
  });
  expect(back).toEqual([{ inGoal: false, onPitch: true }, { inGoal: false, onPitch: true }]);
  if (!info.project.name.includes('mobile')) {
    // The controls cheat sheet is on screen and folds away with C.
    await expect(page.locator('#controls-card .cc-body')).toBeVisible();
    await page.locator('#game-canvas').focus();
    await page.keyboard.press('KeyC');
    await expect(page.locator('#controls-card .cc-body')).toBeHidden();
    await page.keyboard.press('KeyC');
    // Real keys move the player; ESC opens the menu, ESC again goes back to free play.
    await page.locator('#game-canvas').focus();
    const x0 = (await diag(page)).player.position.x;
    await page.keyboard.down('KeyA');
    await page.waitForFunction((x) => Math.abs(window.__THREE_GAME_DIAGNOSTICS__.player.position.x - x) > 1, x0, { timeout: 60_000 });
    await page.keyboard.up('KeyA');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
  } else {
    await page.locator('#lobby-menu-btn').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('[data-menu="freeplay"]').click();
    await expect(page.locator('#menu')).toBeHidden();
  }
  expect(errors).toEqual([]);
});
