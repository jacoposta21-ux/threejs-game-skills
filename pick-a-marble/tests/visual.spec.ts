import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

declare global {
  interface Window {
    __PAM__?: any;
  }
}

async function canvasIsNonBlank(page: Page): Promise<{ ok: boolean; buckets: number }> {
  const buffer = await page.locator('#game-canvas').screenshot();
  const png = PNG.sync.read(buffer);
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let i = 0; i < png.width * png.height; i += stride) {
    const o = i * 4;
    buckets.add(`${png.data[o] >> 4},${png.data[o + 1] >> 4},${png.data[o + 2] >> 4}`);
  }
  return { ok: buckets.size > 12, buckets: buckets.size };
}

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.screen === 'menu', null, { timeout: 60_000 });
}

/** Library card → auto-snapped ghost → Enter places it. */
async function addPiece(page: Page, id: string, cat: string): Promise<void> {
  await page.click(`button[data-act="libTab"][data-cat="${cat}"]`);
  await page.locator(`.piece-card[data-piece="${id}"]`).dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerType: 'mouse' });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup')));
  await page.keyboard.press('Enter');
}

test('menu renders a live 3D scene', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await expect(page.locator('button[data-act="play"]')).toBeVisible();
  await expect(page.locator('button[data-act="builder"]')).toBeVisible();
  const sample = await canvasIsNonBlank(page);
  expect(sample.ok, JSON.stringify(sample)).toBe(true);
  expect(errors).toEqual([]);
});

test('build a track with real input, race it and save it', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await boot(page, errors);
  await page.click('button[data-act="builder"]');
  await page.click('button[data-act="newTrack"]');
  if (await page.isVisible('.tut-bubble')) await page.click('button[data-act="tutSkip"]');
  // the Starting Gate is armed; tap/click the world to place it
  const box = (await page.locator('#game-canvas').boundingBox())!;
  if (info.project.name.includes('mobile')) {
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.35);
    await page.click('button[data-act="placeGhost"]');
  } else await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);
  await expect.poll(() => page.evaluate(() => window.__PAM__.builder.track.pieces.length)).toBe(1);
  for (const [id, cat] of [
    ['straight', 'basic'],
    ['curve_gentle_r', 'basic'],
    ['ramp_down', 'vertical'],
    ['booster', 'special'],
    ['curve_sharp_r', 'basic'],
    ['finish', 'gates'],
  ])
    await addPiece(page, id, cat);
  const v = await page.evaluate(() => ({ n: window.__PAM__.builder.track.pieces.length, ok: window.__PAM__.builder.validation.ok }));
  expect(v).toEqual({ n: 7, ok: true });
  // undo / redo
  await page.click('button[data-act="undo"]');
  await expect.poll(() => page.evaluate(() => window.__PAM__.builder.track.pieces.length)).toBe(6);
  await page.click('button[data-act="redo"]');
  await expect.poll(() => page.evaluate(() => window.__PAM__.builder.track.pieces.length)).toBe(7);
  await page.click('button[data-act="testRace"]');
  await expect(page.locator('.pick-title')).toBeVisible();
  await page.click('.mcard >> nth=1');
  await page.click('button[data-act="mStart"]');
  await expect(page.locator('#rTimer')).toBeVisible();
  // software GL renders slowly in CI: advance the deterministic simulation directly
  await page.evaluate(() => {
    const g = window.__PAM__;
    for (let i = 0; i < 60 * 200 && g.race.state !== 'finished'; i += 1) g.race.update(1 / 60);
  });
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.screen === 'results', null, { timeout: 30_000 });
  const finished = await page.evaluate(() => window.__PAM__.race.result.finished);
  expect(finished).toBeGreaterThan(0);
  await expect(page.locator('.res-head h2')).toContainText('wins');
  await page.screenshot({ path: `test-results/${info.project.name}-results.png` });
  await page.click('#modal button[data-act="exitRace"]');
  await page.click('button[data-act="saveTrack"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pam.tracks.v1') || '[]').length);
  expect(saved).toBe(1);
  expect(errors).toEqual([]);
});

test('every screen state renders without errors', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await boot(page, errors);
  for (const s of ['editor', 'challenges', 'collection', 'menu']) {
    await page.evaluate(async (name) => window.__THREE_GAME_TEST_HOOKS__?.setState(name), s);
    const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.screen);
    expect(d === s || (s === 'editor' && d === 'editor')).toBe(true);
  }
  expect(errors).toEqual([]);
});
