import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { diag, startMatch, trackErrors } from './helpers.js';

// A scripted player using ONLY the keyboard: it reads positions from the
// diagnostics, steers with WASD (camera-relative), chases the ball, tackles
// with F when an opponent has it, dribbles at the goal and shoots with J,
// against the full 3v3 AI.
test('bot playtest: dribble and shoot with real keyboard input', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'desktop keyboard bot');
  test.setTimeout(420_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('rua10:settings', JSON.stringify({ quality: 'low', difficulty: 'normal', shake: true }));
  });
  await startMatch(page);
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.has(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
    for (const k of want) if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
  };
  const metrics = { shotsAttempted: 0, goals: 0, saves: 0, possessionSamples: 0, samples: 0, phasesSeen: new Set() };
  // Budget in game seconds (diagnostics clock), with a wall-clock cap for slow CPU renderers.
  const gameBudget = 70;
  const wallEnd = Date.now() + 330_000;
  const t0 = (await diag(page)).timeLeft;
  let lastShot = 0;
  while (Date.now() < wallEnd) {
    const d = await diag(page);
    metrics.phasesSeen.add(d.phase);
    if (d.phase === 'fulltime' || t0 - d.timeLeft > gameBudget) break;
    if (d.phase !== 'playing') {
      await setKeys(new Set());
      await page.waitForTimeout(120);
      continue;
    }
    metrics.samples += 1;
    if (d.player.possession) metrics.possessionSamples += 1;
    const p = d.player.position;
    const b = d.ball.position;
    // Target: the ball; once in possession, the goal at -X (screen right).
    const tx = d.player.possession ? -15 : b.x;
    const tz = d.player.possession ? 0 : b.z;
    const dx = tx - p.x;
    const dz = tz - p.z;
    // Camera looks roughly along +Z: D = -X (right), W = +Z (up).
    const want = new Set();
    if (dx < -0.3) want.add('KeyD');
    if (dx > 0.3) want.add('KeyA');
    if (dz > 0.4) want.add('KeyW');
    if (dz < -0.4) want.add('KeyS');
    if (d.player.possession && Math.abs(dx) > 9) want.add('ShiftLeft');
    await setKeys(want);
    // Defending: lunge when close to the ball and an opponent has it.
    const ballDist = Math.hypot(b.x - p.x, b.z - p.z);
    if (d.possession.team === 'away' && ballDist < 1.4 && d.time - (metrics.lastTackle ?? -9) > 1) {
      metrics.lastTackle = d.time;
      metrics.tackles = (metrics.tackles ?? 0) + 1;
      await page.keyboard.press('KeyF');
    }
    // Far from the ball while defending: switch to the closer teammate.
    if (d.possession.team === 'away' && ballDist > 9 && d.time - (metrics.lastSwitch ?? -9) > 2) {
      metrics.lastSwitch = d.time;
      metrics.switches = (metrics.switches ?? 0) + 1;
      await page.keyboard.press('KeyQ');
    }
    const distGoal = Math.hypot(-15 - p.x, p.z);
    if (d.player.possession && distGoal < 10 && d.time - lastShot > 1.5) {
      lastShot = d.time;
      metrics.shotsAttempted += 1;
      // Hold for a game-time charge (0.25-0.7 s), measured on the game clock.
      const charge = 0.25 + (metrics.shotsAttempted % 3) * 0.22;
      const start = d.time;
      await page.keyboard.down('KeyJ');
      await page.waitForFunction((t) => window.__THREE_GAME_DIAGNOSTICS__.time >= t, start + charge, { timeout: 60_000 });
      await page.keyboard.up('KeyJ');
    }
    await page.waitForTimeout(60);
  }
  await setKeys(new Set());
  const d = await diag(page);
  metrics.goals = d.score.home;
  metrics.saves = d.stats.saves;
  const result = {
    ...metrics,
    phasesSeen: [...metrics.phasesSeen],
    possessionPct: Math.round((metrics.possessionSamples / Math.max(1, metrics.samples)) * 100),
    shotsRegistered: d.stats.shots,
    style: d.style,
    score: d.score,
    renderer: d.renderer,
  };
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/bot-playtest.json', JSON.stringify(result, null, 2));
  console.log('BOT', JSON.stringify(result));
  // Against a full AI team the crude bot will not always score; it must reach
  // the ball, shoot and keep the match flowing without errors.
  expect(result.shotsRegistered).toBeGreaterThan(0);
  expect(result.possessionPct).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
