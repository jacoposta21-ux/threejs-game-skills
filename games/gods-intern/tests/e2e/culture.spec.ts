import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * v0.2 browser playthrough with real input: finish the tutorial, crown a rock
 * with lightning (religion + sacred object), unlock and use Mutation, open the
 * Book of Questionable Miracles, save, reload the page, load, and confirm the
 * world remembers. The only non-input step is a documented test hook that
 * grants Chaos so Mutation unlocks without depending on random fire spread.
 */

type Diag = {
  tutorial: { step: number; done: boolean };
  sim: { clouds: number; flood: number; prayersAnswered: number; unlocked: string[]; chaos: number };
  culture: {
    religions: Array<{ name: string; archetype: string; followers: number }>;
    sacred: Array<{ label: string; stage: number }>;
    history: number;
    mutations: string[];
    crownedRock: number;
    bookOpen: boolean;
  };
  events: string[];
  menu: string | null;
};

const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);
const state = (page: Page) => page.evaluate(() => (window as unknown as { __GI_STATE__: () => any }).__GI_STATE__());

async function clickWorld(page: Page, x: number, z: number) {
  const p = await page.evaluate(([px, pz]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(px, pz), [x, z] as const);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(200);
  await page.mouse.click(p.x, p.y);
}

test('v0.2: tutorial, a crowned rock, mutation, the history book, and persistence', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string) => {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    fs.mkdirSync('artifacts/playtest-v02', { recursive: true });
    fs.copyFileSync(path, `artifacts/playtest-v02/${name}.png`);
  };

  await page.goto('/?fresh=1&tutorial=1');
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10);

  // --- Tutorial with real input: rain on the well, then too much rain.
  await expect.poll(async () => (await diag(page)).tutorial.step, { timeout: 90_000 }).toBe(1);
  await page.keyboard.press('Digit1');
  await expect.poll(async () => (await diag(page)).tutorial.step).toBe(2);
  const s0 = await state(page);
  const well = s0.buildings[s0.villages[0].wellId];
  await clickWorld(page, well.x, well.z);
  await expect.poll(async () => (await diag(page)).tutorial.done, { timeout: 120_000 }).toBe(true);
  await expect.poll(async () => (await diag(page)).sim.prayersAnswered, { timeout: 180_000 }).toBe(1);
  await page.keyboard.press('Digit0');

  // --- Religious event: lightning on the plaza rock in front of the village.
  const rock = (await state(page)).rocks[0];
  await page.waitForTimeout(1500);
  await page.keyboard.press('Digit2');
  await clickWorld(page, rock.x, rock.z);
  await expect.poll(async () => (await diag(page)).events.join('|'), { timeout: 30_000 }).toContain('surreal:rock-king');
  let d = await diag(page);
  expect(d.culture.crownedRock).toBe(0);
  expect(d.culture.religions.some((r) => r.archetype === 'rock')).toBe(true);
  expect(d.culture.sacred.some((s) => s.label === 'His Rocky Majesty')).toBe(true);
  await page.waitForTimeout(2500);
  await shot('01-rock-king');

  // --- Inspect the sacred object by clicking its pin.
  await page.keyboard.press('Digit0');
  await page.locator('.sacred-pin').first().click();
  await expect(page.locator('#inspector h3')).toHaveText('His Rocky Majesty');
  await page.keyboard.press('Escape');

  // --- Mutation: v0.5 unlocks it at the career "probation review" (test hook grants that XP deterministically).
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.grantXp(700));
  await expect.poll(async () => (await diag(page)).sim.unlocked, { timeout: 30_000 }).toContain('mutation');
  // A grown tree that is on screen, clear of the HUD, with no villager close enough to be picked instead.
  const tree = await page.evaluate(() => {
    const s = (window as any).__GI_STATE__();
    const hooks = window.__THREE_GAME_TEST_HOOKS__!;
    return s.trees.find((t: any) => {
      if (t.charred || t.golden || t.growth < 1) return false;
      if (s.villagers.some((p: any) => p.alive && Math.hypot(p.position.x - t.x, p.position.z - t.z) < 4)) return false;
      if (s.rocks.some((r: any) => Math.hypot(r.x - t.x, r.z - t.z) < 4)) return false;
      const p = hooks.worldToScreen(t.x, t.z);
      return p.x > 300 && p.x < innerWidth - 360 && p.y > 140 && p.y < innerHeight - 180;
    });
  });
  expect(tree).toBeTruthy();
  await page.keyboard.press('Digit5');
  await page.waitForTimeout(600);
  await clickWorld(page, tree.x, tree.z);
  await expect.poll(async () => (await diag(page)).culture.mutations, { timeout: 30_000 }).toContain('golden-tree');
  expect((await state(page)).trees[tree.id].golden).toBe(true);
  await page.waitForTimeout(2000);
  await shot('02-golden-tree');

  // --- The Book of Questionable Miracles.
  await page.keyboard.press('Digit0');
  await page.locator('#nav-history').click();
  await expect(page.locator('#book')).toBeVisible();
  await expect(page.locator('#book .chronicle')).toContainText('A Rock Was Crowned King');
  await expect(page.locator('#book .chronicle')).toContainText('A Tree Turned to Gold');
  await page.locator('#book [data-tab=beliefs]').click();
  await expect(page.locator('#book .faith').first()).toBeVisible();
  await shot('03-book');
  // Clicking an entry focuses the camera; closing works.
  await page.locator('#book [data-tab=history]').click();
  await page.locator('#book .chronicle li.linked').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#book')).toBeHidden();

  // --- Save, reload the page, load the save, and confirm persistent world changes.
  await page.locator('#btn-settings').click();
  await expect(page.locator('.modal h2')).toContainText('Paused');
  await page.locator('[data-a=save]').click();
  await expect(page.locator('#menu-status')).toContainText('Saved');
  const before = await state(page);
  await page.goto('/?quality=low&play=1');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10);
  await page.keyboard.press('Escape');
  await page.locator('[data-a=load]').click();
  await page.locator('[data-a=ok]').click();
  await expect.poll(async () => (await diag(page)).events.join('|')).toContain('notify:GAME LOADED');
  const after = await state(page);
  expect(after.rocks[0].crowned).toBe(true);
  expect(after.trees[tree.id].golden).toBe(true);
  expect(after.religions.map((r: any) => r.name)).toEqual(before.religions.map((r: any) => r.name));
  expect(after.sacred.map((s: any) => s.label)).toEqual(before.sacred.map((s: any) => s.label));
  expect(after.history.length).toBe(before.history.length);
  expect(after.mutations.length).toBe(before.mutations.length);
  d = await diag(page);
  expect(d.culture.religions.length).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await shot('04-after-reload');
  fs.writeFileSync('artifacts/playtest-v02/metrics.json', JSON.stringify({ diag: d, history: after.history.map((h: any) => `Day ${h.day}: ${h.title}`) }, null, 2));

  expect(errors).toEqual([]);
});
