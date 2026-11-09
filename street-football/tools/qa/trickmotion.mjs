// Renders every freestyle trick (right side) as a close-up frame row: node tools/qa/trickmotion.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'artifacts/tricks';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 360, height: 360 } });
await page.goto('http://127.0.0.1:5188/');
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
const kinds = ['stepover', 'feint', 'ballroll', 'cut', 'roulette', 'heel', 'rainbow', 'nutmeg', 'fakeshot'];
for (const kind of kinds) {
  const frames = await page.evaluate(async (kind) => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    const g = window.__RUA10__;
    h.setState('active-play');
    h.setPausedForScreenshot(true);
    const hk = g.human;
    hk.reset();
    // Capture only: defenders do not tackle, so the move plays out in full.
    for (const o of g.match.teams.away.players) o.tackleCooldown = 99;
    // Player facing +X (left of screen → right), defender ahead for nutmeg/rainbow.
    g.place('home', [[-2, 0, Math.PI / 2], [-6, 6], [-9, -6]]);
    g.place('away', [[kind === 'nutmeg' ? 0.4 : 1.2, 0, -Math.PI / 2], [9, -6], [11, 5]]);
    if (!['nutmeg', 'rainbow'].includes(kind)) g.match.teams.away.players[0].p.teleport(9, 3, 0);
    g.ball.placeAt(-1.55, 0.11, 0);
    const entry = kind === 'cut' || kind === 'rainbow' ? { moveX: -1, sprint: true } : kind === 'ballroll' ? {} : { moveX: -0.5 };
    h.simulate(kind === 'ballroll' ? 0.3 : kind === 'nutmeg' ? 0.12 : 0.35, entry);
    for (const o of g.match.teams.away.players) o.tackleCooldown = 99;
    const rng = hk.rng;
    hk.rng = () => 0.99;
    hk.rng.gauss = rng.gauss;
    hk.rng.range = rng.range;
    hk.trickCooldown = 0;
    hk.lastTrickKind = null;
    if (kind === 'fakeshot') hk.charge.active = true;
    const why = { possession: hk.possession, busy: hk.busy, kick: !!hk.kick, tackle: !!hk.tackle, stagger: hk.stagger, cd: hk.trickCooldown, owner: g.match.owner?.p.look.name };
    const ok = hk.requestTrick(kind, 1);
    const dur = { stepover: 0.7, feint: 0.5, ballroll: 0.6, cut: 0.38, roulette: 0.8, heel: 0.62, rainbow: 0.75, nutmeg: 0.4, fakeshot: 0.62 }[kind];
    const shots = [];
    const n = 6;
    for (let i = 0; i < n; i += 1) {
      h.simulate(dur / n, {});
      const p = hk.p.holder.position;
      const wide = kind === 'rainbow' || kind === 'nutmeg';
      g.camera.position.set(p.x + (wide ? 1.2 : -0.3), wide ? 2.2 : 1.5, p.z - (wide ? 6.0 : 4.0));
      g.camera.lookAt(p.x + (wide ? 1.4 : 0.4), wide ? 1.2 : 0.8, p.z);
      g.camera.fov = wide ? 50 : 42;
      g.camera.updateProjectionMatrix();
      g.render();
      shots.push(g.renderer.domElement.toDataURL('image/png'));
    }
    hk.rng = rng;
    return { ok, why, shots };
  }, kind);
  frames.shots.forEach((d, i) => fs.writeFileSync(`${out}/${kind}-${String(i).padStart(2, '0')}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log(kind, frames.ok, JSON.stringify(frames.why));
}
await browser.close();
