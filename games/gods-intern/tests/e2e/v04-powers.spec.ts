import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * v0.4 advanced systems playthrough (technical, accelerated by mode, not by hooks):
 * the player switches to Creative Mode through the real pause menu, then uses all
 * eight new powers with real clicks/keys, discovers a combination, saves and
 * reloads, and returns to Career Mode with career progress untouched.
 * Read-only helpers only: state/diagnostics readers and worldToScreen.
 */
type Diag = {
  frame: number;
  selected: string | null;
  sim: { clouds: number };
  v4: {
    mode: string;
    career: { xp: number; rank: number };
    effects: Array<{ kind: string; x: number; z: number }>;
    possession: { id: string; visited: string[] } | null;
    discoveries: string[];
    graves: number;
    terrainEdits: number;
    unlocked: string[];
  };
  events: string[];
};
const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);
const state = (page: Page) => page.evaluate(() => (window as unknown as { __GI_STATE__: () => any }).__GI_STATE__());
const screen = (page: Page, x: number, z: number) => page.evaluate(([px, pz]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(px, pz), [x, z] as const);

async function clickWorld(page: Page, x: number, z: number) {
  const p = await screen(page, x, z);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
}

/** Pick a power from the categorized menu (G) with the mouse. */
async function pick(page: Page, id: string) {
  await page.keyboard.press('KeyG');
  await expect(page.locator('#power-menu')).toBeVisible();
  await page.locator(`#power-menu [data-pick=${id}]`).click();
  await expect.poll(async () => (await diag(page)).selected).toBe(id);
}

async function focus(page: Page, villageId: string) {
  await page.keyboard.press('KeyV');
  await page.locator(`#villages [data-village=${villageId}]`).click();
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(1800);
}

/** Find a target the power accepts that is visible on screen (clear of the HUD), then click it for real. */
async function castNear(page: Page, power: string, x: number, z: number, tries = 120) {
  const target = await page.evaluate(
    ([id, px, pz, n]) => {
      const h = window.__THREE_GAME_TEST_HOOKS__!;
      for (let k = 0; k < (n as number); k++) {
        const a = k * 2.4;
        const r = Math.sqrt(k) * 2.2;
        const cx = (px as number) + Math.cos(a) * r;
        const cz = (pz as number) + Math.sin(a) * r;
        const sc = h.worldToScreen(cx, cz);
        if (sc.x < 340 || sc.x > innerWidth - 340 || sc.y < 130 || sc.y > innerHeight - 180) continue;
        if (h.canCast(id as string, cx, cz)) return { x: cx, z: cz };
      }
      return null;
    },
    [power, x, z, tries] as const,
  );
  if (!target) throw new Error(`no valid on-screen target for ${power}`);
  const before = (await diag(page)).events.filter((e) => e === `power:${power}`).length;
  await clickWorld(page, target.x, target.z);
  await expect.poll(async () => (await diag(page)).events.filter((e) => e === `power:${power}`).length, { timeout: 10_000 }).toBeGreaterThan(before);
  return target;
}

test('v0.4 powers: creative mode via the menu, all eight new powers by hand, discovery, save/load, career untouched', async ({ page }, testInfo) => {
  test.setTimeout(1_500_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  fs.mkdirSync('artifacts/playtest-v04', { recursive: true });
  const shot = async (name: string) => {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    fs.copyFileSync(path, `artifacts/playtest-v04/${name}.png`);
  };

  await page.goto('/?fresh=1&skipTutorial=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?fresh=1&skipTutorial=1');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10 && !!(window as any).__GI_STATE__);
  await expect.poll(async () => (await diag(page)).v4.career.xp, { timeout: 20_000 }).toBeGreaterThan(0);
  const careerXp = (await diag(page)).v4.career.xp;

  // --- Creative Mode through the pause menu (P), with confirmation.
  await page.keyboard.press('KeyP');
  await page.locator('[data-a=mode]').click();
  await page.locator('[data-a=ok]').click();
  await expect.poll(async () => (await diag(page)).v4.mode).toBe('creative');
  await expect(page.locator('#mode-badge')).toBeVisible();
  expect((await diag(page)).v4.unlocked.length).toBe(13);
  // Unlimited energy is a Creative option, enabled through Settings.
  await page.keyboard.press('KeyP');
  await page.locator('[data-a=settings]').click();
  await page.locator('[data-t=unlimitedEnergy]').click();
  await page.locator('[data-a=done]').click();
  await page.locator('[data-a=resume]').click();

  const s = await state(page);
  const [P, D, R] = s.villages;

  // --- Tornado.
  await focus(page, 'v1');
  await pick(page, 'tornado');
  await castNear(page, 'tornado', P.centerX + 16, P.centerZ - 10);
  await expect.poll(async () => (await diag(page)).v4.effects.some((e) => e.kind === 'tornado')).toBe(true);
  await page.waitForTimeout(2500);
  await shot('10-tornado');

  // --- Freeze on a burning tree (Fire first, then Freeze): Cold Reception territory.
  // A grown tree that is on screen (clear of the HUD), not too close to the houses.
  const tree = await page.evaluate(([cx, cz]) => {
    const st = (window as any).__GI_STATE__();
    const h = window.__THREE_GAME_TEST_HOOKS__!;
    return st.trees.find((t: any) => {
      if (t.removed || t.growth < 1 || t.golden || t.charred) return false;
      const d = Math.hypot(t.x - cx, t.z - cz);
      if (d < 12 || d > 30) return false;
      const sc = h.worldToScreen(t.x, t.z);
      return sc.x > 380 && sc.x < innerWidth - 380 && sc.y > 160 && sc.y < innerHeight - 220;
    });
  }, [P.centerX, P.centerZ] as const);
  expect(tree).toBeTruthy();
  await page.keyboard.press('Digit4');
  await clickWorld(page, tree.x, tree.z);
  await page.waitForTimeout(1500);
  await pick(page, 'freeze');
  await castNear(page, 'freeze', tree.x, tree.z, 30);
  await expect.poll(async () => (await diag(page)).v4.discoveries, { timeout: 15_000 }).toContain('steam-thaw');
  await page.waitForTimeout(1500);
  await shot('11-freeze');

  // --- Gravity over Drizzleville.
  await focus(page, 'v2');
  await pick(page, 'gravity');
  await castNear(page, 'gravity', D.centerX, D.centerZ);
  await expect.poll(async () => (await state(page)).villagers.some((v: any) => (v.lift ?? 0) > 0.8), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1200);
  await shot('12-gravity');

  // --- Time Warp (fast) next to Drizzleville.
  await pick(page, 'timewarp');
  await castNear(page, 'timewarp', D.centerX - 8, D.centerZ + 10);
  await expect.poll(async () => (await diag(page)).v4.effects.some((e) => e.kind === 'timewarp')).toBe(true);
  await shot('13-timewarp');

  // --- Terraform: raise, toggle with T, lower.
  await focus(page, 'v3');
  await pick(page, 'terraform');
  const edits0 = (await diag(page)).v4.terrainEdits;
  const hill = await castNear(page, 'terraform', R.centerX, R.centerZ, 400);
  await page.waitForTimeout(1300); // cooldown
  await clickWorld(page, hill.x, hill.z);
  await page.keyboard.press('KeyT');
  await expect(page.locator('.mode-chip')).toContainText('Lower');
  await page.waitForTimeout(1300);
  await castNear(page, 'terraform', hill.x, hill.z, 400);
  await expect.poll(async () => (await diag(page)).v4.terrainEdits).toBeGreaterThanOrEqual(edits0 + 2);
  await shot('14-terraform');

  // --- Meteor (with its warning) far from the plaza.
  await pick(page, 'meteor');
  await castNear(page, 'meteor', R.centerX + 10, R.centerZ - 8, 400);
  await page.waitForTimeout(1200);
  await shot('15-meteor-warning');
  await expect.poll(async () => (await diag(page)).events.join('|'), { timeout: 20_000 }).toContain('meteor:');
  await page.waitForTimeout(1500);
  await shot('16-meteor-impact');

  // --- A real death (lightning on a villager), then Resurrection on the grave.
  await focus(page, 'v1');
  await page.keyboard.press('Digit2');
  for (let k = 0; k < 30 && (await diag(page)).v4.graves === 0; k++) {
    // A villager standing still (working, praying or idling at a spot), so the strike lands on them.
    const vs = (await state(page)).villagers.filter(
      (v: any) => v.alive && v.villageId === 'v1' && v.currentTask.arrived && v.currentTask.state !== 'RESTING' && v.currentTask.state !== 'FLEEING' && v.currentTask.timer > 1.5,
    );
    if (!vs.length) {
      await page.waitForTimeout(1000);
      continue;
    }
    const victim = vs[k % vs.length];
    await clickWorld(page, victim.position.x, victim.position.z);
    await page.waitForTimeout(1700); // lightning cooldown
  }
  expect((await diag(page)).v4.graves).toBeGreaterThan(0);
  const grave = (await state(page)).graveyard[0];
  await pick(page, 'resurrection');
  await clickWorld(page, grave.x, grave.z);
  await expect.poll(async () => (await diag(page)).events.join('|'), { timeout: 15_000 }).toContain(`resurrected:${grave.villager.name}`);
  const back = (await state(page)).villagers.filter((v: any) => v.id === grave.villager.id);
  expect(back.length).toBe(1);
  expect(back[0].alive).toBe(true);
  expect(back[0].name).toBe(grave.villager.name);
  await page.waitForTimeout(600);
  await shot('17-resurrection');

  // --- Possession: click a villager, walk with WASD, interact with E, leave with Q.
  await pick(page, 'possession');
  const host = (await state(page)).villagers.find((v: any) => v.alive && v.villageId === 'v1' && v.age > 16 && !v.travel);
  await clickWorld(page, host.position.x, host.position.z);
  let possessed = (await diag(page)).v4.possession;
  for (let k = 0; k < 6 && !possessed; k++) {
    const vs = (await state(page)).villagers.filter((v: any) => v.alive && v.villageId === 'v1' && v.age > 16);
    await clickWorld(page, vs[k].position.x, vs[k].position.z);
    await page.waitForTimeout(300);
    possessed = (await diag(page)).v4.possession;
  }
  expect(possessed).not.toBeNull();
  await expect(page.locator('#possess-hud')).toBeVisible();
  const startPos = (await state(page)).villagers.find((v: any) => v.id === possessed!.id).position;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  const endPos = (await state(page)).villagers.find((v: any) => v.id === possessed!.id).position;
  expect(Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z)).toBeGreaterThan(1);
  await page.keyboard.press('KeyE');
  await shot('18-possession');
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await diag(page)).v4.possession).toBeNull();

  // --- Save in the Creative slot, reload, load: v4 systems survive.
  await page.keyboard.press('KeyP');
  await page.locator('[data-a=save]').click();
  await expect(page.locator('#menu-status')).toContainText('Saved');
  const saved = await state(page);
  await page.goto('/?quality=low');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10 && !!(window as any).__GI_STATE__);
  expect((await diag(page)).v4.mode).toBe('creative'); // the game reopens the last mode's slot
  await page.keyboard.press('KeyP');
  await page.locator('[data-a=load]').click();
  await page.locator('[data-a=ok]').click();
  await expect.poll(async () => (await diag(page)).events.join('|')).toContain('notify:GAME LOADED');
  const loaded = await state(page);
  expect(loaded.version).toBe(4);
  expect(loaded.terrainEdits).toEqual(saved.terrainEdits);
  expect(loaded.discoveries).toEqual(saved.discoveries);
  expect(loaded.villagers.length).toBe(saved.villagers.length);

  // --- Back to Career Mode: career XP unchanged by everything above.
  await page.keyboard.press('KeyP');
  await page.locator('[data-a=mode]').click();
  await page.locator('[data-a=ok]').click();
  await expect.poll(async () => (await diag(page)).v4.mode).toBe('career');
  expect((await diag(page)).v4.career.xp).toBe(careerXp);
  expect((await diag(page)).v4.unlocked).not.toContain('meteor');

  expect(errors).toEqual([]);
});
