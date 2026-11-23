import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * Real-input browser playtest: keyboard, mouse clicks on projected world
 * positions, wheel and drag. Drives the actual first-minute tutorial and every
 * power, then checks camera, pause, menu, save/load and console cleanliness.
 */

type Diag = {
  frame: number;
  fps: number;
  selected: string | null;
  tutorial: { step: number; done: boolean };
  menu: string | null;
  events: string[];
  inspectorOpen: boolean;
  camera: { distance: number; yaw: number; x: number; z: number };
  sim: {
    time: number;
    energy: number;
    approval: number;
    chaos: number;
    population: number;
    water: number;
    flood: number;
    fires: number;
    clouds: number;
    trees: number;
    prayers: string[];
    prayersAnswered: number;
    unlocked: string[];
    villagerStates: Record<string, number>;
  };
};

const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);

async function screen(page: Page, x: number, z: number) {
  return page.evaluate(([px, pz]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(px, pz), [x, z] as const);
}

async function worldPoint(page: Page, name: 'well' | 'tree-near' | 'sea' | 'plant') {
  return page.evaluate((n) => {
    // Read positions from the live save-shaped state via the autosave-free hook path.
    const g = window.__THREE_GAME_DIAGNOSTICS__ as unknown as { sim: unknown };
    void g;
    const raw = (window as unknown as { __GI_STATE__?: () => any }).__GI_STATE__?.();
    if (!raw) throw new Error('state accessor missing');
    const v = raw.villages[0];
    if (n === 'well') {
      const w = raw.buildings[v.wellId];
      return { x: w.x, z: w.z };
    }
    if (n === 'sea') return { x: 10.5, z: 17 }; // river beside the village: visible and unplantable
    if (n === 'plant') return { x: v.centerX - 4, z: v.centerZ + 5 };
    // A grown tree that is on screen and clear of the HUD, toolbar and prayer panel.
    const hooks = window.__THREE_GAME_TEST_HOOKS__!;
    const onScreen = (tr: any) => {
      const p = hooks.worldToScreen(tr.x, tr.z);
      return p.x > 260 && p.x < window.innerWidth - 340 && p.y > 120 && p.y < window.innerHeight - 160;
    };
    const ok = (tr: any, min: number) => !tr.charred && !tr.burning && tr.growth >= 1 && !tr.byPlayer && Math.hypot(tr.x - v.centerX, tr.z - v.centerZ) > min && onScreen(tr);
    const t = raw.trees.find((tr: any) => ok(tr, 18)) ?? raw.trees.find((tr: any) => ok(tr, 6));
    return { x: t.x, z: t.z };
  }, name);
}

async function clickWorld(page: Page, x: number, z: number) {
  const p = await screen(page, x, z);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y);
}

test('first minute, powers, consequences and UI through real input', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string) => {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    fs.mkdirSync('artifacts/playtest', { recursive: true });
    fs.copyFileSync(path, `artifacts/playtest/${name}.png`);
  };

  await page.goto('/?fresh=1&tutorial=1');
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10);

  // --- Tutorial: intro titles, then the thirst prayer appears.
  await expect(page.locator('#tutorial-title h2')).toBeAttached();
  await expect.poll(async () => (await diag(page)).tutorial.step, { timeout: 90_000 }).toBe(1);
  await expect.poll(async () => (await diag(page)).sim.prayers).toContain('THIRST');
  await expect.poll(async () => (await diag(page)).events.join('|')).toContain('speech:PLEASE! WE NEED WATER!');
  await expect(page.locator('.power[data-power=rain]')).toHaveClass(/highlight/);
  await expect(page.locator('.power[data-power=fire]')).toHaveClass(/locked/);
  await shot('01-tutorial-prayer');

  // Locked powers refuse selection.
  await page.keyboard.press('Digit4');
  expect((await diag(page)).selected).toBeNull();

  // --- Select rain with the keyboard and click the well.
  await page.keyboard.press('Digit1');
  await expect.poll(async () => (await diag(page)).tutorial.step).toBe(2);
  const well = await worldPoint(page, 'well');
  const energyBefore = (await diag(page)).sim.energy;
  const waterBefore = (await diag(page)).sim.water;
  await clickWorld(page, well.x, well.z);
  await expect.poll(async () => (await diag(page)).sim.clouds).toBe(1);
  expect((await diag(page)).sim.energy).toBeLessThan(energyBefore);
  await page.waitForTimeout(2500);
  await shot('02-rain');
  await expect.poll(async () => (await diag(page)).sim.water, { timeout: 30_000 }).toBeGreaterThan(waterBefore + 20);
  await expect.poll(async () => (await diag(page)).sim.prayersAnswered, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await diag(page)).tutorial.step).toBe(4);

  // --- Too much rain: a second cloud floods the village and ends the tutorial.
  await expect.poll(async () => (await diag(page)).sim.clouds, { timeout: 20_000 }).toBe(0);
  await clickWorld(page, well.x, well.z);
  // The flood peak can fall between diagnostic samples on slow software rendering, so accept
  // either the sampled level or the FLOOD_STARTED notification (emitted only at level ≥ 0.25).
  await expect
    .poll(async () => {
      const d = await diag(page);
      return d.sim.flood > 0.25 || d.events.some((e: string) => e.startsWith('notify:FLASH FLOOD'));
    }, { timeout: 30_000 })
    .toBe(true);
  await expect.poll(async () => (await diag(page)).events.join('|')).toContain('god:');
  await shot('03-flood');
  await expect.poll(async () => (await diag(page)).tutorial.done, { timeout: 120_000 }).toBe(true);
  expect((await diag(page)).sim.unlocked).toEqual(expect.arrayContaining(['rain', 'lightning', 'nature', 'fire']));

  // --- Invalid action costs nothing.
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(1500);
  const sea = await worldPoint(page, 'sea');
  const eInvalid = (await diag(page)).sim.energy;
  await clickWorld(page, sea.x, sea.z);
  await expect.poll(async () => (await diag(page)).events.join('|')).toContain('reject:nature:');
  expect((await diag(page)).sim.energy).toBeGreaterThanOrEqual(eInvalid);

  // --- Nature: plant trees near the village.
  const trees0 = (await diag(page)).sim.trees;
  const plant = await worldPoint(page, 'plant');
  for (let i = 0; i < 3; i++) {
    await clickWorld(page, plant.x + i * 2.5, plant.z - i * 1.5);
    await page.waitForTimeout(700);
  }
  await expect.poll(async () => (await diag(page)).sim.trees).toBeGreaterThan(trees0);

  // --- Lightning on a tree near the village ignites it.
  await page.waitForTimeout(3000);
  await page.keyboard.press('Digit2');
  const tree = await worldPoint(page, 'tree-near');
  const chaos0 = (await diag(page)).sim.chaos;
  await clickWorld(page, tree.x, tree.z);
  await expect.poll(async () => (await diag(page)).events.join('|')).toMatch(/lightning:trees=[1-9]/);
  await expect.poll(async () => (await diag(page)).sim.chaos).toBeGreaterThan(chaos0);
  await page.waitForTimeout(3500);
  await shot('04-lightning-fire');

  // --- Rain puts it out.
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(2500);
  await clickWorld(page, tree.x, tree.z);
  await expect.poll(async () => (await diag(page)).sim.fires, { timeout: 120_000 }).toBeLessThanOrEqual(1);

  // --- Camera: wheel zoom, right-drag orbit, WASD pan.
  await page.keyboard.press('Digit0');
  const c0 = (await diag(page)).camera;
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await diag(page)).camera.distance).toBeGreaterThan(c0.distance + 5);
  await page.mouse.move(720, 450);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(900, 470, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => Math.abs((await diag(page)).camera.yaw - c0.yaw)).toBeGreaterThan(0.3);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  const c1 = (await diag(page)).camera;
  expect(Math.hypot(c1.x - c0.x, c1.z - c0.z)).toBeGreaterThan(2);

  // Clicking the UI never moves the camera.
  const before = (await diag(page)).camera;
  await page.locator('#prayer-toggle').click();
  await page.locator('#prayer-toggle').click();
  const after = (await diag(page)).camera;
  expect(Math.abs(after.yaw - before.yaw)).toBeLessThan(0.01);

  // --- Pause with Space; time stops.
  await page.keyboard.press('Space');
  await expect(page.locator('#paused-badge')).toBeVisible();
  await page.waitForTimeout(1500); // let the 5-frame diagnostics snapshot catch up
  const t0 = (await diag(page)).sim.time;
  await page.waitForTimeout(1500);
  expect((await diag(page)).sim.time).toBeCloseTo(t0, 3);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await diag(page)).sim.time).toBeGreaterThan(t0 + 0.3);

  // --- Menu: save, then load.
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal h2')).toContainText('Paused');
  await page.locator('[data-a=save]').click();
  await expect(page.locator('#menu-status')).toContainText('Saved');
  await page.locator('[data-a=settings]').click();
  await expect(page.locator('.modal h2')).toContainText('Settings');
  await page.locator('[data-t=unlimitedEnergy]').click();
  await shot('05-settings');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal h2')).toContainText('Paused');
  await page.locator('[data-a=load]').click();
  await page.locator('[data-a=ok]').click();
  await expect(page.locator('#modal-root')).toBeHidden();
  await expect.poll(async () => (await diag(page)).events.join('|')).toContain('notify:GAME LOADED');

  // --- Inspector via clicking the well in Look mode.
  await page.keyboard.press('Digit0');
  await clickWorld(page, well.x, well.z + 0.3);
  await expect.poll(async () => (await diag(page)).inspectorOpen).toBe(true);
  await expect(page.locator('#inspector h3')).toHaveText('Puddleton');
  await shot('06-inspector');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await diag(page)).inspectorOpen).toBe(false);

  const d = await diag(page);
  fs.writeFileSync('artifacts/playtest/metrics.json', JSON.stringify(d, null, 2));
  expect(d.sim.population).toBeGreaterThanOrEqual(18);
  expect(errors).toEqual([]);
});
