// Fires shots at the keeper through the real controller and audits every save:
// the ball must be at a glove (or the body) when it is stopped.
// node tools/qa/keepercheck.mjs [outDir] [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? null;
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.argv[3] ?? 'http://127.0.0.1:5188/?qa=1');
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 120000 });
const res = await page.evaluate((capture) => {
  const g = window.__RUA10__;
  const h = window.__THREE_GAME_TEST_HOOKS__;
  g.skipReplays = true;
  h.seed(5);
  const stats = { shots: 0, saves: 0, goals: 0, other: 0, contacts: [], maxContact: 0, jerk: 0 };
  const shotsOut = [];
  const keeper = () => g.match.teams.away.keeper;
  let last = null;
  const offs = [
    g.events.on('save', (e) => { if (e.type !== 'claim') last = { type: e.type, contact: e.contact }; }),
    g.events.on('goal', () => { last = { type: 'goal' }; }),
  ];
  for (let i = 0; i < 36; i += 1) {
    h.setState('active-play');
    h.setPausedForScreenshot(true);
    for (const c of g.match.teams.away.players) { c.p.teleport(12, 7, 0); c.frozen = true; }
    for (const c of g.match.teams.home.players) if (c !== g.human) { c.p.teleport(10, -7, 0); c.frozen = true; }
    const hk = g.human;
    hk.reset();
    const x = -6 - (i % 4) * 1.5;
    const z = ((i % 5) - 2) * 1.8;
    hk.p.teleport(x, z, -Math.PI / 2);
    g.ball.placeAt(x - 0.5, 0.11, z);
    h.simulate(0.25, {});
    last = null;
    hk.requestKick('shot', 0.45 + (i % 3) * 0.22, { aimZ: ((i % 7) - 3) * 0.45 });
    const k = keeper().k;
    let prev = k.position.z;
    let prevV = 0;
    const frames = [];
    for (let s = 0; s < 44 && !last; s += 1) {
      h.simulate(1 / 30, {});
      const v = (k.position.z - prev) * 30;
      stats.jerk = Math.max(stats.jerk, Math.abs(v - prevV));
      prev = k.position.z;
      prevV = v;
      if (capture && i < 6) {
        g.camera.position.set(-15 + 6.5, 1.5, 0.3);
        g.camera.lookAt(-15, 1.0, 0);
        g.camera.fov = 50;
        g.camera.updateProjectionMatrix();
        g.render();
        if (s % 3 === 1) frames.push(g.renderer.domElement.toDataURL('image/jpeg', 0.8));
      }
    }
    const pl = keeper().plan;
    const bp = g.ball.position;
    (stats.log ??= []).push(`${last?.type ?? 'none'} plan=${pl ? (pl.success ? 'S' : 'F') + (pl.needsDive ? 'D' : 's') + ' closest=' + (pl.closest ?? 9).toFixed(2) : keeper().state} ball=${bp.x.toFixed(1)},${bp.y.toFixed(1)},${bp.z.toFixed(1)} v=${g.ball.velocity.length().toFixed(0)}`);
    stats.shots += 1;
    if (last?.type === 'goal') stats.goals += 1;
    else if (last) {
      stats.saves += 1;
      if (last.contact != null) { stats.contacts.push(+last.contact.toFixed(2)); stats.maxContact = Math.max(stats.maxContact, last.contact); }
    } else stats.other += 1;
    if (frames.length) shotsOut.push(frames);
    h.simulate(1.2, {});
  }
  offs.forEach((o) => o());
  stats.maxContact = +stats.maxContact.toFixed(2);
  stats.jerk = +stats.jerk.toFixed(1);
  return { stats, shotsOut };
}, !!out);
console.log(JSON.stringify(res.stats));
if (out) res.shotsOut.forEach((frames, i) => frames.forEach((d, j) => fs.writeFileSync(`${out}/shot${i}-${String(j).padStart(2, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'))));
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await browser.close();
