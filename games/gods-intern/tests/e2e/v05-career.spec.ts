import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * v0.5 REAL-TIME CAREER PLAYTHROUGH. A new career from the main menu, played in real
 * time with the real mouse: no unlimited energy, no XP or Chaos grants, no shortcuts,
 * no fast-forward, no artificial completions. Read-only helpers only: the state and
 * diagnostics readers, `worldToScreen` (where a world point is on screen) and
 * `canCast` (the same yes/no the targeting bar shows).
 *
 * The "player" is a simple helpful-then-curious script: answer prayers with the
 * suggested power from the prayer card, plant trees, strike rocks, look around the
 * three villages, and try each newly unlocked power. It is a pacing model, not a
 * human. Results go to artifacts/v05-career/normal-play.json.
 */
const OUT = 'artifacts/v05-career';
const PLAY_SECONDS = Number(process.env.CAREER_SECONDS ?? 1320);

type Diag = {
  frame: number;
  selected: string | null;
  tutorial: { step: number; done: boolean };
  sim: { energy: number; prayersAnswered: number; unlocked: string[] };
  v4: { career: { xp: number; rank: number; title: string }; challengesCompleted: number; discoveries: string[] };
  v5: { tutorialSeconds: number; inspector: string | null; panel: string | null };
  events: string[];
};
const diag = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ as unknown as Diag);
const state = (page: Page) => page.evaluate(() => (window as unknown as { __GI_STATE__: () => any }).__GI_STATE__());

/** A target the power accepts near (x, z) that is on screen and clear of the UI (read-only check). */
async function target(page: Page, power: string, x: number, z: number, spread = 2.2, tries = 160) {
  return page.evaluate(
    ([id, px, pz, sp, n]) => {
      const h = window.__THREE_GAME_TEST_HOOKS__!;
      for (let k = 0; k < (n as number); k++) {
        const a = k * 2.4;
        const r = Math.sqrt(k) * (sp as number);
        const wx = (px as number) + Math.cos(a) * r;
        const wz = (pz as number) + Math.sin(a) * r;
        const p = h.worldToScreen(wx, wz);
        if (p.x < 560 || p.x > innerWidth - 360 || p.y < 120 || p.y > innerHeight - 200) continue;
        if (h.canCast(id as never, wx, wz)) return p;
      }
      return null;
    },
    [power, x, z, spread, tries] as const,
  );
}

async function castAt(page: Page, power: string, x: number, z: number, spread?: number): Promise<boolean> {
  const d = await diag(page);
  if (!d.sim.unlocked.includes(power)) return false;
  if (d.selected !== power) await page.click(`#toolbar .power[data-power=${power}], #power-menu [data-pick=${power}]`, { timeout: 3000 }).catch(() => undefined);
  if ((await diag(page)).selected !== power) {
    // Not in the dock: use ALL POWERS.
    await page.click('#toolbar .power.more');
    await page.click(`#power-menu [data-pick=${power}]`, { timeout: 3000 }).catch(() => undefined);
  }
  const p = await target(page, power, x, z, spread);
  if (!p) return false;
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(250);
  const before = (await diag(page)).events.filter((e) => e === `power:${power}`).length;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  return (await diag(page)).events.filter((e) => e === `power:${power}`).length > before;
}

test('v0.5 real-time career: new career from the main menu, normal energy, no shortcuts', async ({ page }) => {
  test.setTimeout((PLAY_SECONDS + 1200) * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForFunction(() => ((window.__THREE_GAME_DIAGNOSTICS__ as any)?.frame ?? 0) > 10 && !!(window as any).__GI_STATE__, null, { timeout: 90_000 });

  // --- Main menu → New Career (real click). The clock starts here.
  await page.click('[data-mm=new]');
  const t0 = Date.now();
  const at = () => Math.round((Date.now() - t0) / 1000);
  const m: Record<string, number> = {};
  const mark = (k: string) => (m[k] ??= at());
  const rankAt: Record<string, number> = {};
  const objectives = new Set<string>();

  // --- Onboarding with real input.
  await expect(page.locator('#tutorial-hint')).toContainText('rain', { timeout: 60_000 });
  await page.click('#toolbar .power[data-power=rain]');
  const s0 = await state(page);
  const well = s0.buildings[s0.villages[0].wellId];
  const wp = await page.evaluate(([x, z]) => window.__THREE_GAME_TEST_HOOKS__!.worldToScreen(x, z), [well.x, well.z] as const);
  await page.mouse.move(wp.x, wp.y, { steps: 3 });
  await page.mouse.click(wp.x, wp.y);
  await expect.poll(async () => (await diag(page)).events.join('|'), { timeout: 20_000 }).toContain('power:rain');
  mark('firstMiracle');
  await expect.poll(async () => (await diag(page)).tutorial.done, { timeout: 90_000 }).toBe(true);
  mark('tutorialDone');
  const tutorialSeconds = (await diag(page)).v5.tutorialSeconds;
  await page.click('#toolbar .dc-cancel', { timeout: 3000 }).catch(() => undefined);

  // --- Free play.
  let i = 0;
  let idle = 0;
  const villages = s0.villages.map((v: any) => ({ id: v.id, x: v.centerX, z: v.centerZ }));
  let focus = villages[0];
  const tried = new Set<string>();
  while (at() < PLAY_SECONDS) {
    i++;
    const d = await diag(page);
    const t = at();
    for (const mm of [5, 10, 15, 20]) if (t >= mm * 60 && rankAt[`${mm}min`] === undefined) rankAt[`${mm}min`] = d.v4.career.rank;
    if (d.events.some((e) => e.startsWith('challenge:'))) mark('firstChallenge');
    if (d.events.some((e) => e.startsWith('religion:') || e.startsWith('surreal:'))) mark('firstCulturalEvent');
    if (d.sim.unlocked.includes('mutation')) mark('mutationUnlocked');
    if (d.sim.unlocked.includes('tornado')) mark('tornadoUnlocked');
    if (d.sim.unlocked.includes('freeze')) mark('freezeUnlocked');
    for (const e of d.events) if (/^(challenge|combo|surreal|religion|promoted):/.test(e)) objectives.add(e);
    const s = await state(page);
    let acted = false;

    // 1. Answer the most urgent prayer with its suggested power (real prayer card button).
    const card = page.locator('#prayer-list .prayer:not(.done):not(.failed) [data-act=suggest]').first();
    if ((await card.count()) && d.sim.energy >= 20) {
      const id = await page.locator('#prayer-list .prayer:not(.done):not(.failed)').first().getAttribute('data-prayer-id');
      const pr = s.prayers.find((p: any) => p.id === id);
      await card.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(1400);
      const sel = (await diag(page)).selected;
      if (pr && sel) {
        const v = s.villages.find((x: any) => x.id === pr.villageId);
        const wl = v ? s.buildings[v.wellId] : null;
        const fire = s.fires.find((f: any) => f.intensity > 0 && Math.hypot(f.x - pr.targetX, f.z - pr.targetZ) < 30);
        const goal = pr.type === 'FIRE' && fire ? fire : pr.type === 'THIRST' && wl ? wl : { x: pr.targetX, z: pr.targetZ };
        acted = await castAt(page, sel, goal.x, goal.z);
      }
    }
    // 2. Otherwise do something meaningful or curious, paced by real energy.
    if (!acted) {
      const roll = i % 7;
      if (roll === 0) {
        // Look around: fly to another village through the World panel.
        focus = villages[(villages.indexOf(focus) + 1) % villages.length];
        await page.click('#nav-world', { timeout: 5000 }).catch(() => undefined);
        await page.click(`#villages [data-village=${focus.id}]`, { timeout: 5000 }).catch(() => undefined);
        await page.click('#villages .vp-close', { timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(2200);
        acted = true;
      } else if (roll === 1 && d.sim.energy >= 20) {
        const rock = s.rocks.find((r: any) => Math.hypot(r.x - focus.x, r.z - focus.z) < 30) ?? s.rocks[0];
        acted = await castAt(page, 'lightning', rock.x, rock.z, 0.8);
      } else if (roll === 2) {
        // Try a newly unlocked power once (curiosity), somewhere sensible.
        const fresh = d.sim.unlocked.find((p) => !tried.has(p) && !['rain', 'lightning', 'nature', 'fire', 'possession'].includes(p));
        if (fresh && d.sim.energy >= 30) {
          tried.add(fresh);
          const tree = s.trees.find((tr: any) => !tr.removed && tr.growth >= 1 && Math.hypot(tr.x - focus.x, tr.z - focus.z) < 25);
          const spot = fresh === 'mutation' && tree ? tree : { x: focus.x + 18, z: focus.z + 10 };
          acted = await castAt(page, fresh, spot.x, spot.z, fresh === 'mutation' ? 0.6 : 3);
          if (acted) mark(`used:${fresh}`);
        }
      } else if (roll === 3) {
        const thirsty = s.villages.find((v: any) => v.water < 50);
        if (thirsty && d.sim.energy >= 15) acted = await castAt(page, 'rain', s.buildings[thirsty.wellId].x, s.buildings[thirsty.wellId].z);
      }
      if (!acted && d.sim.energy >= 10) acted = await castAt(page, 'nature', focus.x + 12, focus.z - 8, 2.6);
    }
    await page.click('#toolbar .dc-cancel', { timeout: 3000 }).catch(() => undefined);
    if (!acted) idle++;
    fs.writeFileSync(`${OUT}/progress.json`, JSON.stringify({ at: at(), realSeconds: m, rankAt, rank: d.v4.career.rank, xp: d.v4.career.xp, objectives: objectives.size, decisions: i, idle }, null, 2));
    await page.waitForTimeout(acted ? 2500 : 4000);
  }
  const d = await diag(page);
  for (const mm of [5, 10, 15, 20]) rankAt[`${mm}min`] ??= d.v4.career.rank;
  await page.screenshot({ path: `${OUT}/end.png` });
  const report = {
    realSeconds: m,
    onboardingSecondsMeasuredInGame: tutorialSeconds,
    rankAt,
    final: d.v4.career,
    challengesCompleted: d.v4.challengesCompleted,
    discoveries: d.v4.discoveries,
    meaningfulObjectives: objectives.size,
    objectiveEvents: [...objectives],
    decisions: i,
    idleDecisions: idle,
    unreachable: ['mutationUnlocked', 'tornadoUnlocked'].filter((k) => m[k] === undefined),
    rules: 'real time from the main menu; normal energy; no XP/Chaos/energy grants; no fast-forward; read-only helpers only',
  };
  fs.writeFileSync(`${OUT}/normal-play.json`, JSON.stringify(report, null, 2));
  expect(m.firstMiracle).toBeLessThan(60);
  expect(tutorialSeconds).toBeLessThan(60);
  expect(m.firstChallenge).toBeDefined();
  expect(m.mutationUnlocked).toBeDefined();
  expect(errors).toEqual([]);
});
