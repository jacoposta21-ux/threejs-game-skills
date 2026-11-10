// Close-up frame rows of every skill move, both from the side and from the front.
// node tools/qa/trickmotion.mjs <outDir> [kinds,comma,separated]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'artifacts/tricks';
const only = process.argv[3]?.split(',');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.argv[4] ?? 'http://127.0.0.1:5188/?qa=1');
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 120000 });
const all = ['stepover', 'feint', 'ballroll', 'cut', 'roulette', 'elastico', 'dragback', 'nutmeg', 'heel', 'rainbow', 'sombrero', 'fakeshot'];
for (const kind of only ?? all) {
  const res = await page.evaluate((kind) => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    const g = window.__RUA10__;
    g.enterLobby({ openMenu: false });
    h.setPausedForScreenshot(true);
    const hk = g.human;
    hk.p.teleport(0, 0, Math.PI / 2); // facing +X
    g.ball.placeAt(0.5, 0.11, 0);
    const sprint = ['cut', 'rainbow', 'heel'].includes(kind);
    const stand = kind === 'ballroll';
    // +X is screen-left for the default camera: steer in world space through the camera yaw.
    const y = g.cameraRig.yaw;
    const it = stand ? {} : { moveX: -Math.cos(y), moveY: Math.sin(y), sprint };
    h.simulate(stand ? 0.3 : 0.7, it);
    const rng = hk.rng;
    hk.rng = () => 0.99;
    hk.rng.gauss = () => 0;
    hk.rng.range = rng.range;
    hk.trickCooldown = 0;
    if (kind === 'fakeshot') hk.charge.active = true;
    const ok = hk.requestTrick(kind, 1);
    const def = hk.trick?.def;
    const n = 8;
    const shots = [];
    let minFootY = 9;
    let maxSlide = 0;
    const feet = { l: null, r: null };
    for (let i = 0; i < n; i += 1) {
      h.simulate(((def?.dur ?? 0.6) * 1.05) / n, {});
      const p = hk.p.holder.position;
      for (const [k, dx, dz] of [['side', 0.2, -4.2], ['front', 4.2, 0.2]]) {
        g.camera.position.set(p.x + dx, 1.2, p.z + dz);
        g.camera.lookAt(p.x + 0.2, 0.75, p.z);
        g.camera.fov = 40;
        g.camera.updateProjectionMatrix();
        g.render();
        shots.push([k, i, g.renderer.domElement.toDataURL('image/jpeg', 0.82)]);
      }
      for (const s of ['l', 'r']) {
        const f = hk.p.character.bones.get(`ball_${s}`).getWorldPosition(new g.camera.position.constructor());
        minFootY = Math.min(minFootY, f.y);
      }
    }
    hk.rng = rng;
    const b = g.ball.position;
    return { ok, shots, minFootY: +minFootY.toFixed(2), possession: hk.possession, ballDist: +Math.hypot(b.x - hk.p.position.x, b.z - hk.p.position.z).toFixed(2) };
  }, kind);
  for (const [k, i, d] of res.shots) fs.writeFileSync(`${out}/${kind}-${k}-${String(i).padStart(2, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  console.log(kind, JSON.stringify({ ok: res.ok, minToeY: res.minFootY, possession: res.possession, ballDist: res.ballDist }));
}
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await browser.close();
