import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * v0.4 NORMAL-PLAY playthrough. A new Career Mode game played in real time like a
 * player would: real mouse and keyboard, normal energy, no fast-forward, and no
 * hook that grants XP, Chaos or energy. The only page helpers used are read-only:
 * the state/diagnostics readers and `worldToScreen` (to find where the well or a
 * rock is on screen before clicking it with the real mouse).
 *
 * Milestone timings (real seconds since the page became interactive) are written
 * to artifacts/playtest-v04/normal-play.json.
 */

type Diag = {
  frame: number;
  tutorial: { step: number; done: boolean };
  sim: { energy: number; clouds: number; prayersAnswered: number; unlocked: string[]; chaos: number; approval: number };
  civ: { visited: string[]; villages: Array<{ id: string; center: { x: number; z: number } }> };
  v4: { mode: string; career: { xp: number; rank: number; title: string; promotions: number[] }; challengesCompleted: number; discoveries: string[]; unlocked: string[] };
  culture: { religions: Array<{ archetype: string }> };
  events: string[];
};

const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);
const state = (page: Page) => page.evaluate(() => (window as unknown as { __GI_STATE__: () => any }).__GI_STATE__());

async function screenOf(page: Page, x: number, z: number) {
  return page.evaluate(([px, pz]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(px, pz), [x, z] as const);
}

async function clickWorld(page: Page, x: number, z: number) {
  const p = await screenOf(page, x, z);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y);
}

/** Wait (in real time) until there is enough energy for a cast. */
async function waitEnergy(page: Page, need: number) {
  await expect.poll(async () => (await diag(page)).sim.energy, { timeout: 60_000 }).toBeGreaterThanOrEqual(need);
}

test('v0.4 normal play: a new career, real time, normal energy, no shortcuts', async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  fs.mkdirSync('artifacts/playtest-v04', { recursive: true });
  const shot = async (name: string) => {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    fs.copyFileSync(path, `artifacts/playtest-v04/${name}.png`);
  };

  await page.goto('/?fresh=1&tutorial=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?fresh=1&tutorial=1');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10 && !!(window as any).__GI_STATE__);
  const t0 = Date.now();
  const at = () => Math.round((Date.now() - t0) / 1000);
  const milestones: Record<string, number> = {};
  const mark = (k: string) => {
    if (milestones[k] === undefined) milestones[k] = at();
  };

  // --- Tutorial with real input (normal energy).
  let d = await diag(page);
  expect(d.v4.mode).toBe('career');
  expect(d.v4.career.rank).toBe(1);
  await expect.poll(async () => (await diag(page)).tutorial.step, { timeout: 90_000 }).toBe(1);
  await page.keyboard.press('Digit1');
  const s0 = await state(page);
  const well = s0.buildings[s0.villages[0].wellId];
  await clickWorld(page, well.x, well.z);
  mark('firstMiracle');
  await expect.poll(async () => (await diag(page)).sim.prayersAnswered, { timeout: 180_000 }).toBe(1);
  mark('firstPrayerAnswered');
  await expect.poll(async () => (await diag(page)).sim.clouds, { timeout: 90_000 }).toBe(0);
  await clickWorld(page, well.x, well.z);
  await expect.poll(async () => (await diag(page)).tutorial.done, { timeout: 240_000 }).toBe(true);
  mark('tutorialDone');
  await expect.poll(async () => (await diag(page)).v4.career.xp, { timeout: 30_000 }).toBeGreaterThan(0);

  // --- A second and third power: lightning on the plaza rock (a cultural event in front of witnesses).
  const rock = (await state(page)).rocks[0];
  await page.waitForTimeout(1500);
  await waitEnergy(page, 20);
  await page.keyboard.press('Digit2');
  await clickWorld(page, rock.x, rock.z);
  mark('secondPower');
  await expect.poll(async () => (await diag(page)).events.join('|'), { timeout: 45_000 }).toMatch(/surreal:rock-king|religion:/);
  mark('culturalEvent');
  await page.waitForTimeout(2000);
  await shot('01-rock-king');

  // --- Nature: grow trees around Puddleton (Amateur Botanist), paced by real energy.
  await page.keyboard.press('Digit3');
  const p = (await state(page)).villages[0];
  let planted = 0;
  for (let ring = 0; ring < 4 && planted < 12; ring++) {
    for (let k = 0; k < 14 && planted < 12; k++) {
      const a = (k / 14) * Math.PI * 2 + ring * 0.33;
      const r = 13 + ring * 4;
      const x = p.centerX + Math.cos(a) * r;
      const z = p.centerZ + Math.sin(a) * r;
      const sc = await screenOf(page, x, z);
      if (sc.x < 330 || sc.x > 1100 || sc.y < 120 || sc.y > 730) continue;
      await waitEnergy(page, 10);
      const before = (await state(page)).trees.filter((t: any) => t.byPlayer && !t.removed).length;
      await clickWorld(page, x, z);
      await page.waitForTimeout(450);
      if ((await state(page)).trees.filter((t: any) => t.byPlayer && !t.removed).length > before) planted++;
    }
  }
  expect(planted).toBeGreaterThanOrEqual(10);
  mark('trees');

  // --- Visit all three villages with the village selector (Divine Tourist).
  await page.keyboard.press('Digit0');
  await page.keyboard.press('KeyV');
  for (const id of ['v3', 'v2', 'v1']) {
    await page.locator(`#villages [data-village=${id}]`).click();
    await page.waitForTimeout(3000);
  }
  await expect.poll(async () => (await diag(page)).civ.visited.length, { timeout: 30_000 }).toBe(3);
  mark('visitedAllVillages');
  await page.keyboard.press('KeyV');

  // --- First promotion, then a newly unlocked power used for real.
  await expect.poll(async () => (await diag(page)).v4.career.rank, { timeout: 600_000 }).toBeGreaterThanOrEqual(2);
  mark('promotion1');
  await shot('02-promotion');
  d = await diag(page);
  expect(d.v4.unlocked).toContain('tornado');
  // Tornado sits on quick slot 6 by default. Aim at open meadow away from the plaza.
  await waitEnergy(page, 30);
  await page.keyboard.press('Digit6');
  const meadow = { x: p.centerX + 24, z: p.centerZ - 18 };
  await clickWorld(page, meadow.x, meadow.z);
  await expect.poll(async () => (await diag(page)).events.join('|'), { timeout: 20_000 }).toContain('power:tornado');
  mark('newPowerUsed');
  await page.waitForTimeout(2500);
  await shot('03-tornado');
  await page.keyboard.press('Digit0');

  // --- Keep playing normally until the second promotion (prayers, challenges and discoveries keep coming).
  const deadline = Date.now() + 900_000;
  let extra = 0;
  while ((await diag(page)).v4.career.rank < 3 && Date.now() < deadline) {
    // Be a helpful intern: rain on a village that needs water, plant a tree, wait a bit.
    const s = await state(page);
    const thirsty = s.villages.find((v: any) => v.water < 55) ?? s.villages[extra % 3];
    await page.keyboard.press('KeyV');
    await page.locator(`#villages [data-village=${thirsty.id}]`).click();
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(1500);
    await waitEnergy(page, 15);
    await page.keyboard.press('Digit1');
    const w = s.buildings[thirsty.wellId];
    await clickWorld(page, w.x, w.z);
    await page.keyboard.press('Digit0');
    await page.waitForTimeout(12_000);
    extra++;
  }
  d = await diag(page);
  expect(d.v4.career.rank).toBeGreaterThanOrEqual(3);
  mark('promotion2');

  // --- Results.
  d = await diag(page);
  expect(d.v4.career.promotions.length).toBeGreaterThanOrEqual(2);
  expect(d.v4.challengesCompleted).toBeGreaterThanOrEqual(3);
  expect(d.civ.visited.length).toBe(3);
  await shot('04-after-second-promotion');
  const report = {
    realSecondsToMilestone: milestones,
    finalCareer: d.v4.career,
    challengesCompleted: d.v4.challengesCompleted,
    discoveries: d.v4.discoveries,
    religions: d.culture.religions.map((r) => r.archetype),
    rescueRainCycles: extra,
    shortcuts: 'none (no XP/energy/chaos hooks, no fast-forward, normal energy)',
  };
  fs.writeFileSync('artifacts/playtest-v04/normal-play.json', JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});
