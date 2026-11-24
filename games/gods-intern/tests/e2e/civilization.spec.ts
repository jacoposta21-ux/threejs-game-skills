import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * v0.3 browser playthrough. Real mouse and keyboard drive navigation, the
 * village selector, the challenge panel, pinning, divine powers and save/load.
 *
 * Documented shortcuts (all keep the real gameplay logic):
 * - `?skipTutorial=1` starts after the tutorial (the tutorial has its own specs).
 * - `simulate(seconds)` fast-forwards the real fixed-step simulation for slow
 *   social processes (trade round trips, migration, religious spread, drift).
 * - `planTrade()` asks the real trade planner for its best deal immediately
 *   instead of waiting for its 12 s timer; all eligibility rules still apply.
 */

type Civ = {
  villages: Array<{ id: string; name: string; population: number; center: { x: number; z: number }; favorPos: number }>;
  relations: Record<string, { score: number; category: string }>;
  caravans: Array<{ id: string; merchants: Array<{ id: string; x: number; z: number }> }>;
  stats: { trades: number; migrations: number; religionSpreads: number };
  challenges: { completed: number; status: Record<string, string>; rewardApplied: Record<string, boolean>; pinned: string[]; titles: string[]; selectedTitle: string | null };
  visited: string[];
  panels: { challenges: boolean; villages: boolean; pins: boolean };
};
type Diag = {
  frame: number;
  sim: { approval: number; energy: number; unlocked: string[]; prayers: string[] };
  camera: { x: number; z: number; distance: number };
  civ: Civ;
  events: string[];
};

const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);
const state = (page: Page) => page.evaluate(() => (window as unknown as { __GI_STATE__: () => any }).__GI_STATE__());
const simulate = (page: Page, seconds: number) => page.evaluate((s) => window.__THREE_GAME_TEST_HOOKS__!.simulate(s), seconds);

/** Fast-forward in chunks until the predicate holds against the event log/state. */
async function simulateUntil(page: Page, check: (d: Diag) => boolean, maxSeconds: number, chunk = 30): Promise<number> {
  let elapsed = 0;
  // Events can scroll out of the 40-line diagnostics log, so the caller passes state-based checks too.
  while (elapsed <= maxSeconds) {
    await page.waitForTimeout(250);
    const d = await diag(page);
    if (check(d)) return elapsed;
    await simulate(page, chunk);
    elapsed += chunk;
  }
  return -1;
}

async function clickWorld(page: Page, x: number, z: number) {
  const p = await page.evaluate(([px, pz]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(px, pz), [x, z] as const);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y);
}

test('v0.3: three villages, travel, trade, migration, faith, diplomacy, favoritism, challenges and persistence', async ({ page }, testInfo) => {
  test.setTimeout(3_600_000); // slow software rendering slows the simulation (see docs/VERIFICATION.md)
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  fs.mkdirSync('artifacts/playtest-v03', { recursive: true });
  const shot = async (name: string) => {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    fs.copyFileSync(path, `artifacts/playtest-v03/${name}.png`);
  };
  const report: Record<string, unknown> = {};

  await page.goto('/?fresh=1&skipTutorial=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?fresh=1&skipTutorial=1');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10);

  // --- 1. All three villages exist, are populated and render on screen.
  let d = await diag(page);
  expect(d.civ.villages.map((v) => v.name)).toEqual(['Puddleton', 'Drizzleville', 'Rockbottom']);
  expect(d.civ.villages.map((v) => v.population)).toEqual([20, 16, 14]);
  const before = await state(page);
  expect(before.buildings.filter((b: any) => b.villageId === 'v2').length).toBeGreaterThan(5);
  expect(before.buildings.filter((b: any) => b.villageId === 'v3').length).toBeGreaterThan(5);

  // --- 2. Villagers move on their own (real time, no fast-forward).
  const pos0 = new Map<string, [number, number]>(before.villagers.map((v: any) => [v.id, [v.position.x, v.position.z]]));
  await page.waitForTimeout(6000);
  const movers = (await state(page)).villagers.filter((v: any) => {
    const p = pos0.get(v.id);
    return p && Math.hypot(v.position.x - p[0], v.position.z - p[1]) > 0.5;
  });
  const moved = movers.length;
  // The world starts before dawn, so many villagers are still asleep; walkers must exist in more than one village.
  expect(moved).toBeGreaterThanOrEqual(6);
  expect(new Set(movers.map((v: any) => v.villageId)).size).toBeGreaterThanOrEqual(2);
  report.villagersMoved = moved;

  // --- 3. Camera navigation with the keyboard (pan) and the village selector (mouse).
  const cam0 = (await diag(page)).camera;
  await page.locator('#game-canvas').focus();
  await page.keyboard.down('KeyD');
  // Software rendering in CI is slow; hold until the camera has visibly panned.
  await expect
    .poll(async () => {
      const c = (await diag(page)).camera;
      return Math.hypot(c.x - cam0.x, c.z - cam0.z);
    }, { timeout: 20_000 })
    .toBeGreaterThan(1);
  await page.keyboard.up('KeyD');
  await page.locator('#nav-world').click();
  await expect(page.locator('#villages')).toBeVisible();
  await expect(page.locator('#villages .vp-cards')).toContainText('Rockbottom');
  await shot('01-villages-panel');
  for (const id of ['v3', 'v2', 'v1']) {
    await page.locator(`#villages [data-village=${id}]`).click();
    const center = d.civ.villages.find((v) => v.id === id)!.center;
    await expect.poll(async () => {
      const c = (await diag(page)).camera;
      return Math.hypot(c.x - center.x, c.z - center.z);
    }).toBeLessThan(8);
    await page.waitForTimeout(2200); // dwell so the visit counts
  }
  // Divine Tourist: a challenge progressed and completed through real navigation.
  await expect.poll(async () => (await diag(page)).civ.visited.length).toBe(3);
  await expect.poll(async () => (await diag(page)).civ.challenges.status['divine-tourist']).toBe('completed');
  await expect(page.locator('#challenge-toast')).toContainText('DIVINE TOURIST');
  await shot('02-challenge-complete');
  d = await diag(page);
  expect(d.civ.challenges.titles).toContain('Divine Tourist');
  expect(d.civ.challenges.rewardApplied['divine-tourist']).toBe(true);
  const approvalAfterReward = d.sim.approval;
  await page.keyboard.press('Escape');
  await expect(page.locator('#villages')).toBeHidden();

  // --- 4. Challenge panel with real input: filter and pin.
  await page.locator('#nav-challenges').click();
  await expect(page.locator('#challenges')).toBeVisible();
  // v0.5: the default view only recommends challenges the current powers can achieve.
  await expect(page.locator('#challenges [data-filter=Recommended]')).toHaveClass(/on/);
  await expect(page.locator('#challenges .side-body')).not.toContainText('Big Rock Problem');
  await page.locator('#challenges [data-filter=Completed]').click();
  await expect(page.locator('#challenges .ch-card[data-id=divine-tourist]')).toBeVisible();
  await page.locator('#challenges [data-filter=Advanced]').click();
  await expect(page.locator('#challenges .ch-card[data-id=big-rock-problem]')).toContainText('Meteor');
  // One recommended goal was pinned automatically; the player adds their own.
  const auto = (await diag(page)).civ.challenges.pinned;
  expect(auto.length).toBe(1);
  await page.locator('#challenges [data-filter=Miracles]').click();
  if (!auto.includes('amateur-botanist')) await page.locator('#challenges [data-pin=amateur-botanist]').click();
  await page.locator('#challenges [data-filter=Civilization]').click();
  await page.locator('#challenges [data-pin=traveling-merchant]').click();
  await expect.poll(async () => (await diag(page)).civ.challenges.pinned).toEqual(expect.arrayContaining(['amateur-botanist', 'traveling-merchant']));
  await shot('03-challenges-panel');
  await page.keyboard.press('Escape');
  await expect(page.locator('#challenge-pins')).toBeVisible();
  await expect(page.locator('#challenge-pins')).toContainText('The Traveling Merchant');

  // --- 5. Divine favoritism: lavish Puddleton with trees (real clicks), ignore the others.
  // Sandbox setting via the real settings menu so energy does not limit the planting spree.
  // (v0.4 toggled "unlimited energy" here; it only ever applied to Creative Mode, so v0.5 hides it in Career.)
  const p = d.civ.villages[0];
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.focusVillage('v1'));
  await page.waitForTimeout(1500);
  await page.keyboard.press('Digit3');
  let planted = 0;
  const byPlayer = async () => (await state(page)).trees.filter((t: any) => t.byPlayer && !t.removed).length;
  const start = await byPlayer();
  // Trees only count as favor for Puddleton close to it (rings up to ~27 m), so sample more angles, not more rings.
  for (let ring = 0; ring < 6 && planted < 24; ring++) {
    for (let k = 0; k < 30 && planted < 24; k++) {
      const a = (k / 30) * Math.PI * 2 + ring * 0.17;
      const r = 10 + ring * 3.5;
      const screen = await page.evaluate(([x, z]) => window.__THREE_GAME_TEST_HOOKS__!.worldPoint(x, z), [p.center.x + Math.cos(a) * r, p.center.z + Math.sin(a) * r] as const);
      // Stay clear of the HUD, panels and toolbar.
      if (screen.x < 330 || screen.x > 1100 || screen.y < 110 || screen.y > 740) continue;
      // Wait for energy like a player would (energy refills in game time).
      await expect.poll(async () => (await state(page)).energy, { timeout: 180_000 }).toBeGreaterThanOrEqual(10);
      await clickWorld(page, p.center.x + Math.cos(a) * r, p.center.z + Math.sin(a) * r);
      await page.waitForTimeout(380);
      planted = (await byPlayer()) - start;
    }
  }
  expect(planted).toBeGreaterThanOrEqual(21); // 2 favor per tree; the favoritism gap is 40
  report.treesPlanted = planted;
  await page.keyboard.press('Digit0');
  // The FAVORITISM event can scroll out of the 120-line diagnostics log during the planting
  // loop, so v0.5 checks its lasting result in the state: an Equal Opportunity prayer from a
  // jealous village (and the complaint in the log when it is still there).
  let complaint = '';
  await expect
    .poll(async () => {
      complaint ||= (await diag(page)).events.find((e) => /favoritism:jealousy|FORMAL COMPLAINT AGAINST HEAVEN|FAVORITE CHILD/.test(e)) ?? '';
      return (await state(page)).prayers.some((q: any) => q.type === 'EQUAL_TREATMENT');
    }, { timeout: 900_000 })
    .toBe(true);
  const jealous = (await state(page)).prayers.find((q: any) => q.type === 'EQUAL_TREATMENT').villageId;
  expect(['v2', 'v3']).toContain(jealous);
  d = await diag(page);
  report.favoritism = { jealous, puddletonFavor: d.civ.villages[0].favorPos };
  await shot('04-favoritism');

  // --- 6. A trade expedition walks between villages and completes.
  // The villages may already be trading on their own; otherwise ask the planner now.
  let caravanId = (await diag(page)).civ.caravans[0]?.id ?? (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.planTrade()));
  if (!caravanId) {
    await simulateUntil(page, (x) => x.civ.caravans.length > 0, 120, 6);
    caravanId = (await diag(page)).civ.caravans[0]?.id ?? null;
  }
  expect(caravanId).not.toBeNull();
  const tradesBefore = (await diag(page)).civ.stats.trades;
  // Watch the merchants walk in real time.
  const startPos = (await diag(page)).civ.caravans.find((c) => c.id === caravanId)!.merchants[0];
  await page.waitForTimeout(5000);
  const laterPos = (await diag(page)).civ.caravans.find((c) => c.id === caravanId)?.merchants[0];
  if (laterPos) expect(Math.hypot(laterPos.x - startPos.x, laterPos.z - startPos.z)).toBeGreaterThan(1);
  const tradeAt = await simulateUntil(page, (x) => x.civ.stats.trades > tradesBefore, 240, 15);
  expect(tradeAt).toBeGreaterThanOrEqual(0);
  report.firstTradeAfterSimSeconds = tradeAt;

  // --- 7. Relationships change, a villager migrates and a religion spreads (slow social processes, fast-forwarded).
  // A religion to spread: lightning on Puddleton's plaza rock in front of witnesses (real click).
  const rock = (await state(page)).rocks[0];
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.focusVillage('v1'));
  await page.waitForTimeout(1200);
  await page.keyboard.press('Digit2');
  await clickWorld(page, rock.x, rock.z);
  await page.keyboard.press('Digit0');
  await expect.poll(async () => (await state(page)).religions.length, { timeout: 30_000 }).toBeGreaterThan(0);
  const rel0 = (await diag(page)).civ.relations;
  const relChanged = (x: Diag) => Object.entries(x.civ.relations).some(([k, r]) => r.category !== rel0[k].category);
  const t0 = await simulateUntil(page, (x) => relChanged(x) && x.civ.stats.migrations >= 1 && x.civ.stats.religionSpreads >= 1, 2400, 30);
  d = await diag(page);
  report.social = { simSeconds: t0, relationsBefore: rel0, relations: d.civ.relations, stats: d.civ.stats };
  expect(relChanged(d)).toBe(true);
  expect(d.civ.stats.migrations).toBeGreaterThanOrEqual(1);
  expect(d.civ.stats.religionSpreads).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.focusVillage('v2'));
  await page.waitForTimeout(1500);
  await shot('05-after-social-sim');

  // Rewards were applied once: approval did not jump again from the tourist reward.
  d = await diag(page);
  expect(d.civ.challenges.titles.filter((t) => t === 'Divine Tourist').length).toBe(1);
  expect(d.events.filter((e) => e === 'challenge:divine-tourist').length).toBeLessThanOrEqual(1);
  report.approval = { afterTouristReward: approvalAfterReward, now: d.sim.approval };

  // --- 8. The History Book's civilization chapter records it.
  await page.locator('#nav-history').click();
  await page.locator('#book [data-tab=civ]').click();
  await expect(page.locator('#book .civ-summary')).toBeVisible();
  await expect(page.locator('#book .chronicle')).toContainText('The First Trade');
  await expect(page.locator('#book .chronicle')).toContainText('Was Founded');
  await shot('06-book-civilization');
  await page.keyboard.press('Escape');

  // --- 9. Save, reload, load: the civilization layer survives.
  await page.locator('#btn-settings').click();
  await page.locator('[data-a=save]').click();
  await expect(page.locator('#menu-status')).toContainText('Saved');
  const saved = await state(page);
  await page.goto('/?quality=low&play=1');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10);
  await page.keyboard.press('Escape');
  await page.locator('[data-a=load]').click();
  await page.locator('[data-a=ok]').click();
  await expect.poll(async () => (await diag(page)).events.join('|')).toContain('notify:GAME LOADED');
  const loaded = await state(page);
  expect(loaded.version).toBe(5); // v0.5 schema
  expect(loaded.villages.length).toBe(3);
  expect(loaded.villagers.length).toBe(saved.villagers.length);
  expect(new Set(loaded.villagers.map((v: any) => v.id)).size).toBe(loaded.villagers.length);
  expect(loaded.civ.relations).toEqual(saved.civ.relations);
  expect(loaded.civ.challenges).toEqual(saved.civ.challenges);
  expect(loaded.civ.titles).toEqual(saved.civ.titles);
  expect(loaded.civ.pinned).toEqual(saved.civ.pinned);
  expect(loaded.stats.tradesCompleted).toBe(saved.stats.tradesCompleted);
  expect(loaded.stats.migrations).toBe(saved.stats.migrations);
  expect(loaded.civ.caravans.length).toBe(saved.civ.caravans.length);
  d = await diag(page);
  expect(d.civ.challenges.rewardApplied['divine-tourist']).toBe(true);
  await page.waitForTimeout(1000);
  await shot('07-after-reload');

  report.final = d.civ;
  fs.writeFileSync('artifacts/playtest-v03/metrics.json', JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});
