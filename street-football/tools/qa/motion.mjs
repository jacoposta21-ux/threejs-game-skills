// Motion evidence: renders close-up frame sequences of real gameplay animation
// (driven through the game's own controller) and saves them as PNG frames.
// node tools/qa/motion.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'artifacts/motion';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 400 } });
await page.goto('http://127.0.0.1:5188/');
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, null, { timeout: 60000 });
const seqs = [
  { name: 'jog-dribble', frames: 12, dt: 1 / 30, setup: 'jog', intents: { moveX: 1 } },
  { name: 'sprint-dribble', frames: 12, dt: 1 / 30, setup: 'jog', intents: { moveX: 1, sprint: true }, warm: 1.2 },
  { name: 'shot', frames: 12, dt: 1 / 20, setup: 'shot', intents: {} },
  { name: 'celebration', frames: 12, dt: 1 / 10, setup: 'goal', intents: {} },
  { name: 'keeper-dive', frames: 10, dt: 1 / 20, setup: 'save', intents: {} },
];
for (const s of seqs) {
  const frames = await page.evaluate(async (s) => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    const g = window.__RUA10__;
    h.seed(7);
    let target = () => g.player;
    if (s.setup === 'goal') {
      h.setState('goal');
    } else {
      h.setState('active-play');
      g.player.teleport(6, 0, -Math.PI / 2);
      g.ball.placeAt(5.45, 0.11, 0);
      g.controller.reset();
      if (s.setup === 'shot') {
        h.simulate(0.5, { moveX: 1 });
        g.controller.requestKick('shot', 0.9);
      }
      if (s.setup === 'save') {
        g.keeperAI.difficulty = 'hard';
        g.player.teleport(-8, 0, -Math.PI / 2);
        g.ball.placeAt(-8.6, 0.11, 0.9);
        h.simulate(0.3, { moveX: 1 });
        g.controller.requestKick('shot', 0.4);
        h.simulate(0.45, {});
        target = () => g.keeper;
      }
    }
    h.setPausedForScreenshot(true);
    if (s.warm) h.simulate(s.warm, s.intents);
    const shots = [];
    for (let i = 0; i < s.frames; i += 1) {
      h.simulate(s.dt, s.intents);
      const p = target().holder.position;
      // Side-on close-up camera.
      g.camera.position.set(p.x + 0.4, 1.3, p.z - 4.2);
      g.camera.lookAt(p.x, 0.85, p.z);
      g.camera.fov = 40;
      g.camera.updateProjectionMatrix();
      g.render();
      shots.push(g.renderer.domElement.toDataURL('image/png'));
    }
    return shots;
  }, s);
  frames.forEach((d, i) => fs.writeFileSync(`${out}/${s.name}-${String(i).padStart(2, '0')}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log(s.name, frames.length);
}
await browser.close();
