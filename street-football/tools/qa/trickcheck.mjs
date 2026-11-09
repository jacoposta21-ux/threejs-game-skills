// Numeric checks for lifted / through-the-legs tricks and their pending award.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.addInitScript(() => localStorage.setItem('rua10:settings', JSON.stringify({ quality: 'low' })));
await page.goto('http://127.0.0.1:5188/');
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
for (const [kind, dist, forceRoll] of [['rainbow', 2.2, 0.99], ['nutmeg', 1.9, 0.99], ['nutmeg', 1.9, 0.0], ['stepover', 1.6, 0.99], ['roulette', 1.6, 0.99]]) {
  const r = await page.evaluate(({ kind, dist, forceRoll }) => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    const g = window.__RUA10__;
    h.setState('active-play');
    h.setPausedForScreenshot(true);
    const hk = g.human;
    hk.reset();
    g.place('home', [[-2, 0, Math.PI / 2], [-8, 6], [-10, -6]]);
    g.place('away', [[-2 + dist, 0, -Math.PI / 2], [10, -6], [12, 5]]);
    const def = g.match.teams.away.players[0];
    g.ball.placeAt(-1.55, 0.11, 0);
    h.simulate(0.08, { moveX: -0.4 });
    const rng = hk.rng;
    hk.rng = () => forceRoll;
    hk.rng.gauss = rng.gauss;
    hk.rng.range = rng.range;
    const events = [];
    const off = g.events.on('trick', (e) => events.push(`${e.kind}:${e.outcome}${e.points ? `:+${e.points}` : ''}${e.solo ? ':solo' : ''}`));
    const offF = g.events.on('fooled', (e) => events.push(`fooled:${e.victim.look.name}`));
    const t0 = g.time;
    const offC = g.events.on('control', (e) => events.push(`control:${e.player.look.name}@${(g.time - t0).toFixed(2)}`));
    const offT = g.events.on('trick', (e) => events.push(`@${(g.time - t0).toFixed(2)}`));
    const started = hk.requestTrick(kind, 1);
    hk.rng = rng;
    let maxY = 0;
    let crossedDefender = false;
    let minDistToDefender = Infinity;
    const defX = def.p.position.x;
    for (let i = 0; i < 60; i += 1) {
      h.simulate(1 / 20, { moveX: -1, sprint: true });
      const b = g.ball.position;
      maxY = Math.max(maxY, b.y);
      minDistToDefender = Math.min(minDistToDefender, Math.hypot(b.x - def.p.position.x, b.z - def.p.position.z));
      if (b.x > defX + 0.3) crossedDefender = true;
    }
    off();
    offF();
    offC();
    offT();
    return { kind, started, forcedRoll: forceRoll, maxBallY: +maxY.toFixed(2), crossedDefender, minDistToDefender: +minDistToDefender.toFixed(2), events, owner: g.match.owner?.p.look.name ?? null, combo: g.combo };
  }, { kind, dist, forceRoll });
  console.log(JSON.stringify(r));
}
await browser.close();
