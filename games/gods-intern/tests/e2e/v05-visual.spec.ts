import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * v0.5 visual verification: the 20 required screenshots (plus desktop viewport
 * sweeps), captured through the real UI. A few states are staged with dev-only
 * hooks to save time (skipping onboarding, fast-forwarding to get prayers, one XP
 * grant for the promotion ceremony, possession start); each is labelled in
 * artifacts/v05-screens/manifest.json. Software rendering (SwiftShader).
 */
const OUT = 'artifacts/v05-screens';
const manifest: Array<{ file: string; viewport: string; state: string; staged?: string }> = [];

type Diag = { frame: number; v5: { panel: string | null; inspector: string | null; mainMenu: boolean }; v4: { career: { rank: number; xp: number } }; sim: { prayers: string[] } };
const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);
const hooks = (page: Page, fn: string) => page.evaluate(fn);

async function ready(page: Page) {
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10 && !!window.__THREE_GAME_TEST_HOOKS__, null, { timeout: 90_000 });
}

async function shot(page: Page, file: string, state: string, staged?: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}` });
  const v = page.viewportSize()!;
  manifest.push({ file, viewport: `${v.width}x${v.height}`, state, ...(staged ? { staged } : {}) });
}

async function noOverflow(page: Page) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }));
  expect(r.sw).toBeLessThanOrEqual(r.iw);
  expect(r.sh).toBeLessThanOrEqual(r.ih);
}

/** No two of these fixed UI regions may overlap (dock, rail, HUD, prayer chip). */
async function noCollisions(page: Page) {
  const boxes = await page.evaluate(() => {
    const pick = (sel: string) => {
      const n = document.querySelector(sel) as HTMLElement | null;
      if (!n || n.offsetParent === null) return null;
      const r = n.getBoundingClientRect();
      return { sel, l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    return ['#hud', '#sidenav', '#toolbar .dock-row', '#prayer-toggle'].map(pick).filter(Boolean) as Array<{ sel: string; l: number; t: number; r: number; b: number }>;
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      expect(overlap, `${a.sel} overlaps ${b.sel}`).toBe(false);
    }
  }
  for (const b of boxes) {
    expect(b.l).toBeGreaterThanOrEqual(0);
    expect(b.r).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    expect(b.b).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
  }
}

test.describe.configure({ mode: 'serial' });

test('v0.5 visual verification: 20 states', async ({ page, browser }) => {
  test.setTimeout(1_500_000);
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewportSize({ width: 1600, height: 900 });

  // 1. Main menu over the living island.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('[data-mm=continue]')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await shot(page, '01-main-menu.png', 'main menu (no career save: no Continue)');

  // 2. New Career → onboarding intro lines.
  await page.click('[data-mm=new]');
  await expect(page.locator('#tutorial-title h2')).toBeVisible({ timeout: 10_000 });
  await shot(page, '02-new-career-intro.png', 'New Career onboarding intro');
  // Onboarding: select Rain, cast near the well (real clicks).
  await expect(page.locator('#tutorial-hint')).toContainText('praying for rain', { timeout: 30_000 });
  await page.click('#toolbar .power[data-power=rain]');
  const s0 = await page.evaluate(() => (window as any).__GI_STATE__());
  const well = s0.buildings[s0.villages[0].wellId];
  const wp = await page.evaluate(([x, z]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(x, z), [well.x, well.z] as const);
  await page.mouse.move(wp.x, wp.y);
  await page.mouse.click(wp.x, wp.y);
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__ as any).tutorial.done, null, { timeout: 60_000 });
  await page.click('#toolbar .dc-cancel').catch(() => undefined);
  await page.waitForTimeout(800);

  // 3. Default HUD.
  await noOverflow(page);
  await noCollisions(page);
  await shot(page, '03-default-hud.png', 'default HUD after onboarding');

  // 4–5. Selected power and targeting preview.
  await page.click('#toolbar .power[data-power=lightning]');
  await expect(page.locator('#toolbar .dock-context')).toBeVisible();
  await shot(page, '04-selected-power.png', 'Lightning selected: targeting bar with Cancel');
  const rock = (await page.evaluate(() => (window as any).__GI_STATE__())).rocks[0];
  const rp = await page.evaluate(([x, z]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(x, z), [rock.x, rock.z] as const);
  await page.mouse.move(rp.x, rp.y, { steps: 4 });
  await page.waitForTimeout(600);
  await shot(page, '05-targeting-preview.png', 'targeting preview over a rock (valid target)');
  await page.click('#toolbar .dc-cancel');
  await expect(page.locator('#toolbar .dock-context')).toBeHidden();

  // 6–7. All Powers and a locked power's details.
  await page.click('#toolbar .power.more');
  await expect(page.locator('#power-menu')).toBeVisible();
  await shot(page, '06-all-powers.png', 'All Powers panel');
  await page.locator('[data-card=meteor]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-card=meteor] .pm-req')).toContainText('Rank 8');
  await shot(page, '07-locked-power.png', 'Meteor locked: requirement and progress');
  await page.click('#power-menu .pm-close');

  // 8. Village overview (World).
  await page.click('#nav-world');
  await expect(page.locator('#villages .vp-card')).toHaveCount(3);
  await shot(page, '08-world.png', 'World panel: three village cards');
  // Clicking a card flies the camera; clicking outside closes the panel.
  await page.locator('#villages [data-village=v2]').click();
  await page.mouse.click(1100, 450);
  await expect(page.locator('#villages')).toBeHidden();

  // 9. Villager inspector.
  await hooks(page, 'window.__THREE_GAME_TEST_HOOKS__.focusVillage("v1")');
  await page.waitForTimeout(1500);
  let inspected = false;
  for (let attempt = 0; attempt < 12 && !inspected; attempt++) {
    const pts = await page.evaluate(() => {
      const st = (window as any).__GI_STATE__();
      const h = window.__THREE_GAME_TEST_HOOKS__!;
      return st.villagers.filter((v: any) => v.alive).map((v: any) => h.worldPoint(v.position.x, v.position.z)).filter((p: any) => p.visible && p.x > 300 && p.x < 1200 && p.y > 150 && p.y < 700);
    });
    if (pts.length) {
      await page.mouse.click(pts[attempt % pts.length].x, pts[attempt % pts.length].y);
      await page.waitForTimeout(300);
      inspected = (await diag(page)).v5.inspector === 'villager';
    }
  }
  expect(inspected).toBe(true);
  await page.click('#inspector [data-more]');
  await shot(page, '09-villager-inspector.png', 'villager inspector with needs and memories');
  await page.click('#inspector .insp-close');

  // 10. Prayer inbox (fast-forward so several prayers are waiting).
  await hooks(page, 'window.__THREE_GAME_TEST_HOOKS__.simulate(240)');
  await page.waitForTimeout(1200);
  await page.click('#prayer-toggle');
  await shot(page, '10-prayers.png', 'prayer cards and compact inbox', 'simulate(240) to accumulate prayers');

  // 11–13. Career, Challenges, History.
  await page.click('#nav-career');
  await expect(page.locator('#career .cp-path li')).toHaveCount(11);
  await shot(page, '11-career.png', 'Career panel path');
  await page.click('#nav-challenges');
  await expect(page.locator('#career')).toBeHidden();
  await shot(page, '12-challenges.png', 'Challenges: Recommended');
  await page.click('#nav-history');
  await shot(page, '13-history.png', 'History: events');
  await page.click('#book .book-close');

  // 14. Promotion ceremony (one XP grant through the real award path).
  const d14 = await diag(page);
  const next = [0, 880, 1150, 1420, 1650, 2000, 2500, 3200, 4000, 5000][d14.v4.career.rank];
  await hooks(page, `window.__THREE_GAME_TEST_HOOKS__.grantXp(${next - d14.v4.career.xp})`);
  await expect(page.locator('#promo-toast')).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, '14-promotion.png', 'promotion ceremony', 'grantXp to the next threshold');

  // 15. Creative Mode (through the pause menu).
  await page.click('#btn-settings');
  await page.click('.modal [data-a=mode]');
  await page.click('.modal [data-a=ok]');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__ as any).v4.mode === 'creative');
  await page.waitForTimeout(1200);
  await page.click('#toolbar .power.more');
  await shot(page, '15-creative.png', 'Creative Mode: every power available');
  await page.click('#power-menu .pm-close');

  // 16. Settings.
  await page.click('#btn-settings');
  await page.click('.modal [data-a=settings]');
  await expect(page.locator('.modal [data-t=reducedMotion]')).toBeVisible();
  await shot(page, '16-settings.png', 'Settings with graphics, volumes, reduced motion, camera shake');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Desktop viewport sweep (HUD collisions and overflow).
  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 768]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(900);
    await noOverflow(page);
    await noCollisions(page);
    await shot(page, `vp-${w}x${h}.png`, `creative HUD at ${w}x${h}`);
  }

  // 17–20 on emulated devices.
  await mobile(browser, 'Pixel 7 landscape', '17-phone-landscape.png', true);
  await tablet(browser);
  await portrait(browser);

  fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
  expect(errors).toEqual([]);
});

async function mobile(browser: Browser, name: string, file: string, possess: boolean) {
  const d = devices[name];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: 1, isMobile: d.isMobile, hasTouch: true, userAgent: d.userAgent });
  const page = await ctx.newPage();
  await page.goto('/?fresh=1&skipTutorial=1');
  await ready(page);
  await page.waitForTimeout(1500);
  await noOverflow(page);
  await noCollisions(page);
  await shot(page, file, `${name}: default HUD`);
  await page.locator('#toolbar .power[data-power=rain]').tap();
  await shot(page, file.replace('.png', '-targeting.png'), `${name}: Rain selected`);
  await page.locator('#toolbar .dc-cancel').tap();
  await page.locator('#nav-world').tap();
  await shot(page, file.replace('.png', '-world.png'), `${name}: World panel`);
  await page.locator('#villages .vp-close').tap();
  if (possess) {
    const id = await page.evaluate(() => (window as any).__GI_STATE__().villagers.find((v: any) => v.alive && !v.travel).id);
    await page.evaluate((v) => window.__THREE_GAME_TEST_HOOKS__!.possess(v), id);
    await expect(page.locator('#possess-pad')).toBeVisible();
    const before = await page.evaluate((v) => (window as any).__GI_STATE__().villagers.find((x: any) => x.id === v).position, id);
    const up = page.locator('#possess-pad [data-dir=up]');
    const box = (await up.boundingBox())!;
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
    await expect.poll(async () => {
      const now = await page.evaluate((v) => (window as any).__GI_STATE__().villagers.find((x: any) => x.id === v).position, id);
      return Math.hypot(now.x - before.x, now.z - before.z);
    }, { timeout: 20_000 }).toBeGreaterThan(0.5);
    await shot(page, '19-possession-touch.png', 'Possession: on-screen pad, Interact and Leave', 'possess() hook to start');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.evaluate((v) => (window as any).__GI_STATE__().villagers.find((x: any) => x.id === v).position, id);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.5);
    await page.locator('#possess-pad [data-pq]').tap();
    await expect(page.locator('#possess-pad')).toBeHidden();
  }
  await ctx.close();
}

async function tablet(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/?fresh=1&skipTutorial=1');
  await ready(page);
  await page.waitForTimeout(1500);
  await noOverflow(page);
  await noCollisions(page);
  await shot(page, '18-tablet-landscape.png', 'tablet landscape 1180x820 (iPad Air class)');
  await ctx.close();
}

async function portrait(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/?fresh=1&skipTutorial=1');
  await ready(page);
  await expect(page.locator('#rotate-hint')).toBeVisible();
  await shot(page, '20-portrait.png', 'portrait phone: rotate prompt');
  await ctx.close();
}
