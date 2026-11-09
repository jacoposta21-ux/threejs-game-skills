// Drives the real controller through the test hook and logs possession over time.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto('http://127.0.0.1:5188/');
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 60000 });
const result = await page.evaluate(async () => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  const g = window.__RUA10__;
  const out = {};
  for (const [label, intents] of [
    ['jog', { moveX: 1 }],
    ['sprint', { moveX: 1, sprint: true }],
    ['jog-zigzag', null],
    ['sprint-turn', null],
  ]) {
    h.setState('active-play');
    g.player.teleport(12, 0, -Math.PI / 2);
    g.ball.placeAt(11.45, 0.11, 0);
    g.controller.reset();
    h.setPausedForScreenshot(true);
    const rows = [];
    let poss = 0;
    const N = 40;
    for (let i = 0; i < N; i += 1) {
      let it = intents;
      if (label === 'jog-zigzag') it = { moveX: 1, moveY: Math.sin(i / 4) > 0 ? 0.8 : -0.8 };
      if (label === 'sprint-turn') it = i < 20 ? { moveX: 1, sprint: true } : { moveX: 0, moveY: 1, sprint: true };
      h.simulate(0.1, it);
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      g.publishDiagnostics();
      const dd = window.__THREE_GAME_DIAGNOSTICS__;
      const sep = Math.hypot(dd.ball.position.x - dd.player.position.x, dd.ball.position.z - dd.player.position.z);
      if (dd.player.possession) poss += 1;
      if (i % 5 === 4) rows.push(`${((i + 1) / 10).toFixed(1)}s spd=${dd.player.speed.toFixed(2)} ball=${dd.ball.speed.toFixed(2)} sep=${sep.toFixed(2)} poss=${dd.player.possession}`);
    }
    out[label] = { possessionPct: Math.round((poss / N) * 100), rows };
  }
  return out;
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
