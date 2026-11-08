import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// Real-input gameplay + render checks for NEON TUNNEL. Every step uses the
// actual DOM buttons, keyboard and touch input the player would use; test
// hooks are only used to read diagnostics and pin the RNG seed.

async function sampleCanvas(page) {
  const buffer = await page.locator('#game-canvas').screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  const buckets = new Set();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let p = 0; p < png.width * png.height; p += stride) {
    const o = p * 4;
    min = Math.min(min, png.data[o], png.data[o + 1], png.data[o + 2]);
    max = Math.max(max, png.data[o], png.data[o + 1], png.data[o + 2]);
    buckets.add(`${png.data[o] >> 4},${png.data[o + 1] >> 4},${png.data[o + 2] >> 4}`);
  }
  return { variance: max - min, buckets: buckets.size };
}

const diag = (page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);

/** Holds a real steering input until the sphere has turned by `delta` radians. */
async function steer(page, mobile, side, delta) {
  const start = (await diag(page)).player.angle;
  if (mobile) {
    const vp = page.viewportSize();
    const x = side > 0 ? vp.width * 0.8 : vp.width * 0.2;
    await page.evaluate(
      ({ x, y }) => {
        document.getElementById('touch-layer').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
      },
      { x, y: vp.height * 0.6 },
    );
  } else {
    await page.keyboard.down(side > 0 ? 'ArrowRight' : 'KeyA');
  }
  await expect
    .poll(async () => ((await diag(page)).player.angle - start) * side, { timeout: 15_000 })
    .toBeGreaterThan(delta);
  if (mobile) {
    await page.evaluate(() => {
      document.getElementById('touch-layer').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true }));
    });
  } else {
    await page.keyboard.up(side > 0 ? 'ArrowRight' : 'KeyA');
  }
  return (await diag(page)).player.angle;
}

test('menu -> play -> steer -> pause -> die -> retry', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const mobile = testInfo.project.name.includes('mobile');
  // Gameplay logic test: LOW quality keeps software-rendered CI browsers responsive.
  await page.addInitScript(() => {
    if (!localStorage.getItem('neon-tunnel-save-v1')) {
      localStorage.setItem('neon-tunnel-save-v1', JSON.stringify({ settings: { quality: 'low' } }));
    }
  });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'menu', null, { timeout: 30_000 });
  await expect(page.locator('#screen-menu')).toBeVisible();
  const menuSample = await sampleCanvas(page);
  expect(menuSample.variance).toBeGreaterThan(40);
  expect(menuSample.buckets).toBeGreaterThan(20);

  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.seed(1234));
  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state === 'playing');
  await expect(page.locator('#hud')).toBeVisible();

  // forward motion
  const d0 = (await diag(page)).distance;
  await expect.poll(async () => (await diag(page)).distance).toBeGreaterThan(d0 + 3);

  // steering right then left through real input
  const a0 = (await diag(page)).player.angle;
  const a1 = await steer(page, mobile, 1, 0.3);
  expect(a1).toBeGreaterThan(a0 + 0.3);
  const a2 = await steer(page, mobile, -1, 0.3);
  expect(a2).toBeLessThan(a1 - 0.3);

  const screenshot = await page.screenshot();
  await testInfo.attach(`${testInfo.project.name}-play`, { body: screenshot, contentType: 'image/png' });

  // pause / resume
  if (mobile) await page.locator('#btn-pause').click();
  else await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state === 'paused');
  const frozenAt = (await diag(page)).distance;
  await page.waitForTimeout(300);
  expect((await diag(page)).distance).toBeCloseTo(frozenAt, 3);
  await page.locator('#screen-pause [data-action="resume"]').click();
  await page.waitForFunction(() => ['playing', 'dying', 'gameover'].includes(window.__THREE_GAME_DIAGNOSTICS__.state), null, { timeout: 20_000 });

  // no input: the sphere eventually hits something and the run ends
  await page.waitForFunction(() => ['dying', 'gameover'].includes(window.__THREE_GAME_DIAGNOSTICS__.state), null, { timeout: 45_000 });
  await expect(page.locator('#screen-gameover')).toBeVisible({ timeout: 5000 });
  const over = await diag(page);
  expect(over.score).toBeGreaterThan(0);
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-tunnel-save-v1')).best);
  expect(best).toBe(over.score);

  // retry resets the entire run
  await page.locator('#screen-gameover [data-action="retry"]').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state === 'playing');
  const fresh = await diag(page);
  expect(fresh.distance).toBeLessThan(25);
  expect(fresh.score).toBeLessThan(50);
  expect(fresh.multiplier).toBe(1);
  expect(fresh.energy).toBe(0);

  expect(errors).toEqual([]);
});

test('menus are functional', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'menu', null, { timeout: 30_000 });
  for (const screen of ['skins', 'settings', 'howto']) {
    await page.locator(`#screen-menu [data-action="${screen}"]`).click();
    await expect(page.locator(`#screen-${screen}`)).toBeVisible();
    await page.locator(`#screen-${screen} [data-action="back"]`).click();
    await expect(page.locator('#screen-menu')).toBeVisible();
  }
  // settings persist
  await page.locator('#screen-menu [data-action="settings"]').click();
  await page.locator('[data-setting-seg="quality"] [data-value="low"]').click();
  await page.locator('[data-toggle="shake"]').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-tunnel-save-v1')).settings);
  expect(saved.quality).toBe('low');
  expect(saved.shake).toBe(false);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.quality)).toBe('low');

  // skin unlock with banked energy
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('neon-tunnel-save-v1'));
    s.energyBank = 200;
    localStorage.setItem('neon-tunnel-save-v1', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'menu', null, { timeout: 30_000 });
  await page.locator('#screen-menu [data-action="skins"]').click();
  await page.locator('.skin-card').nth(1).locator('.btn').click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-tunnel-save-v1')));
  expect(after.unlockedSkins).toContain('plasma');
  expect(after.selectedSkin).toBe('plasma');
  expect(after.energyBank).toBe(50);
});

test('daily run is deterministic and progress screen works', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('neon-tunnel-save-v1')) localStorage.setItem('neon-tunnel-save-v1', JSON.stringify({ seenTutorial: true, settings: { quality: 'low' } }));
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'menu', null, { timeout: 30_000 });

  // daily run: same seed every time today
  await page.locator('[data-action="daily"]').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state === 'playing');
  await expect(page.locator('#hud-daily')).toBeVisible();
  const seedA = (await diag(page)).seed;
  await page.locator('#btn-pause').click();
  await page.locator('#screen-pause [data-action="menu"]').click();
  await page.locator('[data-action="daily"]').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state === 'playing');
  expect((await diag(page)).seed).toBe(seedA);
  await page.locator('#btn-pause').click();
  await page.locator('#screen-pause [data-action="menu"]').click();

  // progress screen: 3 missions, achievements and stats tabs
  await page.locator('[data-action="progress"]').click();
  await expect(page.locator('#missions-list .mission')).toHaveCount(3);
  await page.locator('.tab[data-tab="achievements"]').click();
  await expect(page.locator('#achievements-list .ach').first()).toBeVisible();
  await page.locator('.tab[data-tab="stats"]').click();
  await expect(page.locator('#stats-list div').first()).toBeVisible();
});
