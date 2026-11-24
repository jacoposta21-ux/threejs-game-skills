import { devices, expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * v0.4 touch controls under mobile emulation (Pixel 7, landscape, Chromium touch
 * events). This is emulation only: no physical device was tested.
 * Verifies tap-to-select, tap-to-cast, one-finger pan, two-finger pinch/rotate,
 * the power menu by touch, no page scrolling or browser zoom, and the layout.
 */
const pixel = devices['Pixel 7 landscape'];
test.use({ viewport: pixel.viewport, deviceScaleFactor: pixel.deviceScaleFactor, isMobile: pixel.isMobile, hasTouch: true, userAgent: pixel.userAgent });

type Diag = { frame: number; camera: { x: number; z: number; distance: number; yaw: number }; sim: { clouds: number }; selected: string | null; v4: { menu: boolean } };
const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);

/** Raw touch events through one CDP session (Playwright's touchscreen only taps). */
let cdp: import('@playwright/test').CDPSession | null = null;
async function touch(page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>) {
  cdp ??= await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
  await page.waitForTimeout(30);
}

test('v0.4 touch: tap, cast, pan, pinch, rotate and the power menu in mobile landscape', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  fs.mkdirSync('artifacts/playtest-v04', { recursive: true });
  await page.goto('/?fresh=1&skipTutorial=1');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10 && !!window.__THREE_GAME_TEST_HOOKS__);
  const vw = pixel.viewport.width;
  const vh = pixel.viewport.height;

  // Layout: no horizontal scroll, toolbar fully on screen.
  const layout = await page.evaluate(() => {
    const tb = document.querySelector('#toolbar')!.getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, tb: { l: tb.left, r: tb.right, t: tb.top, b: tb.bottom }, ih: innerHeight };
  });
  expect(layout.sw).toBeLessThanOrEqual(layout.iw);
  expect(layout.tb.l).toBeGreaterThanOrEqual(0);
  expect(layout.tb.r).toBeLessThanOrEqual(layout.iw);
  expect(layout.tb.b).toBeLessThanOrEqual(layout.ih);
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  fs.copyFileSync(testInfo.outputPath('mobile.png'), 'artifacts/playtest-v04/05-mobile-landscape.png');

  // Tap a power slot, then tap the ground to cast.
  await page.locator('#toolbar .power[data-power=rain]').tap();
  await expect.poll(async () => (await diag(page)).selected).toBe('rain');
  const s = await page.evaluate(() => (window as any).__GI_STATE__());
  const well = s.buildings[s.villages[0].wellId];
  const p = await page.evaluate(([x, z]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(x, z), [well.x, well.z] as const);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(async () => (await diag(page)).sim.clouds, { timeout: 20_000 }).toBe(1);

  // One-finger drag pans the camera (and is not treated as a tap).
  const before = (await diag(page)).camera;
  await touch(page, 'touchStart', [{ x: vw / 2, y: vh / 2, id: 1 }]);
  for (let i = 1; i <= 8; i++) await touch(page, 'touchMove', [{ x: vw / 2 - i * 20, y: vh / 2 - i * 6, id: 1 }]);
  await touch(page, 'touchEnd', []);
  await expect.poll(async () => {
    const c = (await diag(page)).camera;
    return Math.hypot(c.x - before.x, c.z - before.z);
  }, { timeout: 15_000 }).toBeGreaterThan(2);
  expect((await diag(page)).sim.clouds).toBeLessThanOrEqual(1); // the drag did not cast a second rain

  // Two-finger pinch zooms; twisting rotates.
  const d0 = (await diag(page)).camera;
  await touch(page, 'touchStart', [{ x: vw / 2 - 60, y: vh / 2, id: 1 }, { x: vw / 2 + 60, y: vh / 2, id: 2 }]);
  for (let i = 1; i <= 8; i++) await touch(page, 'touchMove', [{ x: vw / 2 - 60 - i * 15, y: vh / 2 - i * 4, id: 1 }, { x: vw / 2 + 60 + i * 15, y: vh / 2 + i * 4, id: 2 }]);
  await touch(page, 'touchEnd', []);
  await expect.poll(async () => (await diag(page)).camera.distance, { timeout: 15_000 }).toBeLessThan(d0.distance - 3);
  const yaw0 = (await diag(page)).camera.yaw;
  await touch(page, 'touchStart', [{ x: vw / 2 - 80, y: vh / 2, id: 1 }, { x: vw / 2 + 80, y: vh / 2, id: 2 }]);
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * 0.8;
    await touch(page, 'touchMove', [
      { x: vw / 2 - Math.cos(a) * 80, y: vh / 2 - Math.sin(a) * 80, id: 1 },
      { x: vw / 2 + Math.cos(a) * 80, y: vh / 2 + Math.sin(a) * 80, id: 2 },
    ]);
  }
  await touch(page, 'touchEnd', []);
  await expect.poll(async () => Math.abs((await diag(page)).camera.yaw - yaw0), { timeout: 15_000 }).toBeGreaterThan(0.2);

  // The page itself never scrolls or zooms.
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY, z: visualViewport?.scale ?? 1 }));
  expect(scroll).toEqual({ x: 0, y: 0, z: 1 });

  // Power menu by touch.
  await page.locator('#toolbar .power.more').tap();
  await expect(page.locator('#power-menu')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-menu.png') });
  fs.copyFileSync(testInfo.outputPath('mobile-menu.png'), 'artifacts/playtest-v04/06-mobile-power-menu.png');
  await page.locator('#power-menu .pm-pick[data-pick=nature]').tap();
  await expect.poll(async () => (await diag(page)).selected).toBe('nature');
  await expect(page.locator('#power-menu')).toBeHidden();

  // Inspect by tap in Look mode (no hover needed).
  await page.locator('#toolbar .power.inspect').tap();
  // Fly back to Puddleton with the village selector (touch), then tap its well.
  await page.locator('#btn-villages').tap();
  await page.locator('#villages [data-village=v1]').tap();
  await page.locator('#btn-villages').tap();
  await page.waitForTimeout(2500);
  const p2 = await page.evaluate(([x, z]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(x, z), [well.x, well.z + 0.5] as const);
  await page.touchscreen.tap(p2.x, p2.y);
  await expect(page.locator('#inspector')).toBeVisible({ timeout: 10_000 });

  expect(errors).toEqual([]);
});
