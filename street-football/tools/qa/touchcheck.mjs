// Dribble touch audit: every touch must come from a swinging foot that is actually at the ball.
// node tools/qa/touchcheck.mjs [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5188/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(base);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
const result = await page.evaluate(() => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  const g = window.__RUA10__;
  const out = {};
  const scenarios = {
    jog: () => ({ moveX: 1 }),
    sprint: (t) => (t < 2.2 ? { moveX: 1, sprint: true } : { moveX: 1 }),
    zigzag: (t) => ({ moveX: 1, moveY: Math.sin(t * 1.6) > 0 ? 0.8 : -0.8 }),
    stopAndRelease: (t) => (t < 1.6 ? { moveX: 1, sprint: true } : {}),
  };
  for (const [label, intent] of Object.entries(scenarios)) {
    h.setState('active-play');
    h.setPausedForScreenshot(true);
    for (const o of g.match.teams.away.players) o.p.teleport(14, 8, 0);
    for (const o of g.match.teams.home.players) if (o !== g.human) o.p.teleport(-14, -8, 0);
    const hk = g.human;
    hk.reset();
    hk.p.teleport(12, 0, -Math.PI / 2);
    g.ball.placeAt(11.5, 0.11, 0);
    const log = [];
    const touches = [];
    const off = g.events.on('touch', ({ player, side, trap }) => {
      if (player !== hk.p) return;
      const foot = player.footWorld(side);
      const b = g.ball.position;
      const pp = player.position;
      touches.push({ t: +g.time.toFixed(2), side, trap: !!trap, footToBall: +Math.hypot(foot.x - b.x, foot.z - b.z).toFixed(2), pulse: !!player.legPulse, body: +Math.hypot(pp.x - b.x, pp.z - b.z).toFixed(2), foot: +Math.hypot(foot.x - pp.x, foot.z - pp.z).toFixed(2), u: player.legPulse ? +(player.legPulse.t / player.legPulse.dur).toFixed(2) : -1 });
    });
    let misses = 0;
    const off2 = g.events.on('touchMiss', ({ player }) => {
      if (player === hk.p) misses += 1;
    });
    let poss = 0;
    const N = 60;
    for (let i = 0; i < N; i += 1) {
      for (const o of g.match.teams.away.players) o.tackleCooldown = 99;
      h.simulate(0.05, intent(i * 0.05));
      if (hk.possession) poss += 1;
      if (i % 6 === 5) {
        const b = g.ball.position;
        log.push(`${(i * 0.05 + 0.05).toFixed(1)}:${hk.possession ? 'P' : '-'} d=${Math.hypot(b.x - hk.p.position.x, b.z - hk.p.position.z).toFixed(2)} v=${hk.p.speed.toFixed(1)}`);
      }
    }
    off?.();
    off2?.();
    const gaps = touches.slice(1).map((t, i) => +(t.t - touches[i].t).toFixed(2));
    out[label] = {
      possessionPct: Math.round((poss / N) * 100),
      touches: touches.length,
      misses,
      meanFootToBall: +(touches.reduce((s, t) => s + t.footToBall, 0) / Math.max(1, touches.length)).toFixed(2),
      maxFootToBall: Math.max(0, ...touches.map((t) => t.footToBall)),
      sides: touches.map((t) => (t.trap ? 'T' : t.side)).join(''),
      gaps: gaps.join(' '),
      log: log.join(' | '),
      detail: touches.map((t) => `${t.t}${t.side} f2b=${t.footToBall} body=${t.body} foot=${t.foot} u=${t.u}`).join(' ; '),
    };
  }
  return out;
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
