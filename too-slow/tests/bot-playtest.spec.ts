import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Drives a full race with real keyboard events only (no autopilot hook):
 * crawl off the line, tuck in on the slope, steer by reading the published
 * track offset, pop out and crawl whenever momentum dies. Proves the whole
 * loop is completable through actual input and records how it went.
 */
test('a keyboard-only bot completes the Backyard race', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?q=0&dpr=0.25');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 60_000 });
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.seed(42));
  await page.click('#btn-play');
  await page.click('.track-card[data-track="backyard"]');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'racing', null, { timeout: 120_000 });

  const held = new Set<string>();
  const hold = async (key: string, on: boolean) => {
    if (on && !held.has(key)) {
      held.add(key);
      await page.keyboard.down(key);
    } else if (!on && held.has(key)) {
      held.delete(key);
      await page.keyboard.up(key);
    }
  };

  const shotDir = 'artifacts/bot';
  mkdirSync(shotDir, { recursive: true });
  const samples: { t: number; s: number; kmh: number; mode: string; rank: number }[] = [];
  let slowSince = -1;
  let softlocks = 0;
  let lastProgress = 0;
  let lastProgressT = 0;
  let maxKmh = 0;
  let sawAir = false;
  let nextShot = 0;
  const wallStart = Date.now();

  for (;;) {
    const d = await page.evaluate(() => {
      const g = window.__THREE_GAME_DIAGNOSTICS__!;
      return { t: g.elapsed, yaw: g.player.trackYaw, grade: g.player.grade, s: g.racers[0].s, d: g.racers[0].d, mode: g.mode, kmh: g.speedKmh, done: g.complete, rank: g.rank, air: g.airborne };
    });
    if (d.done) break;
    if (Date.now() - wallStart > 560_000) break;
    maxKmh = Math.max(maxKmh, d.kmh);
    sawAir ||= d.air && d.kmh > 60;

    // Steering: hold a heading relative to the course that leans back toward the chosen lane.
    // The lanes a player would pick by eye: around the root tips, down the wide side of the split.
    const lane = d.s > 540 && d.s < 578 ? 3 : d.s > 585 && d.s < 618 ? -3 : d.s > 625 && d.s < 770 ? -4 : d.s > 775 && d.s < 812 ? -5 : d.s > 818 && d.s < 856 ? 5 : 0;
    const wantYaw = Math.max(-0.5, Math.min(0.5, (lane - d.d) * 0.09));
    const cmd = wantYaw - d.yaw;
    await hold('KeyD', cmd > 0.07);
    await hold('KeyA', cmd < -0.07);

    if (d.mode === 'crawl') {
      await hold('KeyW', true);
      // Tuck in once the hill is under us and we are at crawl pace.
      if (d.grade > 0.03 && d.kmh > 9 && slowSince < 0) await page.keyboard.press('Space');
      if (slowSince >= 0 && d.t - slowSince > 2.5) slowSince = -1;
    } else {
      await hold('KeyW', false);
      if (d.kmh < 4 && !d.air) {
        if (slowSince < 0) slowSince = d.t;
        else if (d.t - slowSince > 0.8) {
          await page.keyboard.press('Space');
          slowSince = d.t;
        }
      } else if (d.mode === 'roll') slowSince = -1;
    }

    if (d.s < lastProgress - 20) lastProgress = d.s; // sent back to a checkpoint
    if (d.s > lastProgress + 1) {
      lastProgress = d.s;
      lastProgressT = d.t;
    } else if (d.t - lastProgressT > 8) {
      softlocks += 1;
      lastProgressT = d.t;
      await page.keyboard.press('KeyR');
    }

    if (d.t >= nextShot) {
      nextShot = d.t + 8;
      samples.push({ t: +d.t.toFixed(1), s: Math.round(d.s), kmh: Math.round(d.kmh), mode: d.mode, rank: d.rank });
      await page.screenshot({ path: `${shotDir}/t${String(Math.round(d.t)).padStart(3, '0')}.png` });
    }
    await page.waitForTimeout(30);
  }
  for (const k of [...held]) await hold(k, false);

  await expect(page.locator('#menu-results')).toBeVisible({ timeout: 60_000 });
  const end = await page.evaluate(() => {
    const g = window.__THREE_GAME_DIAGNOSTICS__!;
    return { time: g.racers[0].time, rank: g.rank, complete: g.complete, frames: g.frame, racers: g.racers.map((r) => ({ name: r.name, finished: r.finished, time: +r.time.toFixed(2), s: Math.round(r.s) })) };
  });
  await page.screenshot({ path: `${shotDir}/results.png` });
  const report = { seed: 42, ...end, maxKmh: Math.round(maxKmh), sawAir, softlocks, samples, errors };
  writeFileSync(`${shotDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));

  expect(end.complete).toBe(true);
  expect(maxKmh).toBeGreaterThan(80);
  expect(sawAir).toBe(true);
  expect(softlocks).toBeLessThanOrEqual(2);

  // Restart must reset the whole race.
  await page.click('#btn-again');
  await page.waitForFunction(() => {
    const g = window.__THREE_GAME_DIAGNOSTICS__!;
    return !g.complete && g.elapsed < 1 && g.racers.every((r) => !r.finished && r.s < 30);
  }, null, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
