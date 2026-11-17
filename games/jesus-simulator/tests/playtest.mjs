/**
 * Real-input playtest: drives the built game with keyboard events and checks
 * movement, wall collision, stairs-to-rooftop, landmark discovery, interaction,
 * pause, save and continue. Usage: node tests/playtest.mjs [url] [outDir]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { phase2Checks } from './phase2-checks.mjs';
import { phase3Checks } from './phase3-checks.mjs';
import { phase4Checks } from './phase4-checks.mjs';
import { phase5Checks } from './phase5-checks.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4188/';
const out = process.argv[3] || 'artifacts/playtest';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`); };
const diag = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
// waits in *simulated* time: software GPUs run slowly, so wait on game frames, not wall-clock
const waitFrames = async (n) => {
  const start = (await diag()).frame;
  await page.waitForFunction((s) => window.__THREE_GAME_DIAGNOSTICS__.frame >= s, start + n, { timeout: 120000 });
};
const hold = async (key, frames) => { await page.keyboard.down(key); await waitFrames(frames); await page.keyboard.up(key); };
const setup = (fn, arg) => page.evaluate(fn, arg);

// Phases 1-3 run with the Roman garrison off duty so a patrol can't interfere
// with those checks (e.g. arrest Jesus mid-test); phase 4 turns it back on.
const offDuty = () => page.evaluate(() => window.__JESUS_SIM__.session.romans.setActive(false));

await page.goto(url);
await page.waitForSelector('#menu:not([hidden])', { timeout: 60000 });
await offDuty();
await page.evaluate(() => localStorage.clear());
await page.click('#btn-play');
await waitFrames(10);

// 1. walking moves the player and keeps them grounded
let d = await diag();
const p0 = d.player.position;
await hold('KeyW', 40);
d = await diag();
const moved = Math.hypot(d.player.position.x - p0.x, d.player.position.z - p0.z);
check('walk forward moves player', moved > 1, `moved=${moved.toFixed(2)}m grounded=${d.player.grounded}`);

// 2. first landmark (workshop) discovered on the way
await setup(() => { const s = window.__JESUS_SIM__.session; s.player.teleport(-27, 0, 14, 0); });
await waitFrames(5);
d = await diag();
check('landmark discovery triggers', d.discovered.includes('landmark.workshop'), JSON.stringify(d.discovered));

// 3. wall collision: walk into the lookout house front wall for ~1.5s
const H = { x: -29, z: -47, ry: 0.15, d: 10 };
await setup((h) => {
  const s = window.__JESUS_SIM__.session;
  const lx = 2.2; const lz = h.d / 2 + 2;
  const x = h.x + lx * Math.cos(h.ry) + lz * Math.sin(h.ry);
  const z = h.z - lx * Math.sin(h.ry) + lz * Math.cos(h.ry);
  s.player.teleport(x, 0, z, h.ry + Math.PI);
  s.cam.yaw = h.ry;
}, H);
await waitFrames(4);
await hold('KeyW', 90);
d = await diag();
const localZ = (d.player.position.x - H.x) * Math.sin(H.ry) + (d.player.position.z - H.z) * Math.cos(H.ry);
check('wall blocks movement', localZ > H.d / 2 + 0.3 && localZ < H.d / 2 + 0.6, `player local z=${localZ.toFixed(2)} (wall at ${H.d / 2})`);
await page.screenshot({ path: `${out}/wall.png` });

// 4. outdoor stairs to the lookout roof using only W then A
await setup((h) => {
  const s = window.__JESUS_SIM__.session;
  const lx = 4.35; const lz = h.d / 2 + 1.2;
  const x = h.x + lx * Math.cos(h.ry) + lz * Math.sin(h.ry);
  const z = h.z - lx * Math.sin(h.ry) + lz * Math.cos(h.ry);
  s.player.teleport(x, 0, z, h.ry + Math.PI);
  s.cam.yaw = h.ry;
  s.cam.pitch = 0.45;
}, H);
await waitFrames(4);
// hold W until the climb stops rising (top landing), then strafe left through the parapet gap
const localOf = (p) => ({ lx: (p.x - H.x) * Math.cos(H.ry) - (p.z - H.z) * Math.sin(H.ry), lz: (p.x - H.x) * Math.sin(H.ry) + (p.z - H.z) * Math.cos(H.ry) });
await page.keyboard.down('KeyW');
let lastY = -1;
for (let i = 0; i < 60; i += 1) {
  await waitFrames(6);
  const pos = (await diag()).player.position;
  if (localOf(pos).lz < -3.8 || (pos.y > 8.2 && Math.abs(pos.y - lastY) < 0.02)) break;
  lastY = pos.y;
}
await page.keyboard.up('KeyW');
const onLanding = await diag();
await page.keyboard.down('KeyA');
for (let i = 0; i < 40; i += 1) {
  await waitFrames(4);
  if (localOf((await diag()).player.position).lx < 2.0) break;
}
await page.keyboard.up('KeyA');
await waitFrames(10);
d = await diag();
const lp = localOf(d.player.position);
check('climb stairs to rooftop', onLanding.player.position.y > 8 && d.player.position.y > 8 && d.player.grounded && lp.lx < 3.4, `landing y=${onLanding.player.position.y.toFixed(2)} roof y=${d.player.position.y.toFixed(2)} local x=${lp.lx.toFixed(2)}`);
check('rooftop lookout discovered', d.discovered.includes('landmark.lookout'), JSON.stringify(d.discovered));
await page.screenshot({ path: `${out}/rooftop.png` });

// 5. jump from the roof and land safely
await page.keyboard.down('KeyW');
await page.keyboard.down('Space');
await waitFrames(8);
const air = await diag();
await page.keyboard.up('Space');
await waitFrames(70);
await page.keyboard.up('KeyW');
await waitFrames(30);
d = await diag();
check('jump leaves ground and lands', !air.player.grounded && d.player.grounded && d.stats.jumps >= 1, `airborne y=${air.player.position.y.toFixed(2)} landed y=${d.player.position.y.toFixed(2)} jumps=${d.stats.jumps}`);

// 6. interaction prompt + dialog at the well
await setup(() => {
  const s = window.__JESUS_SIM__.session;
  // a villager next to the well would take the E key (talk wins over objects)
  for (const n of s.npcs.npcs) if (!n.hidden && Math.hypot(n.pos.x - 3, n.pos.z) < 7) { s.npcs.leaveAnchor(n, true); s.npcs.place(n, -40, 1.2, 30); n.phase = 'none'; }
  s.player.teleport(3.1, 0, 0.4, -Math.PI / 2);
});
await waitFrames(5);
const prompt = await page.isVisible('#prompt');
await page.keyboard.press('KeyE');
await waitFrames(3);
const dialog = await page.isVisible('#dialog');
const dialogText = await page.textContent('#dialog-text');
check('interaction prompt + dialog', prompt && dialog, dialogText?.slice(0, 60));
await page.screenshot({ path: `${out}/interact.png` });

// 7. sprint is faster than walk
await setup(() => { const s = window.__JESUS_SIM__.session; s.player.teleport(20, 0, -2, Math.PI / 2); s.cam.yaw = -Math.PI / 2; });
await page.keyboard.down('KeyW');
await waitFrames(30);
const walkSpeed = (await diag()).player.speed;
await page.keyboard.down('ShiftLeft');
await waitFrames(30);
const runSpeed = (await diag()).player.speed;
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
check('sprint faster than walk', runSpeed > walkSpeed + 2, `walk=${walkSpeed.toFixed(2)} sprint=${runSpeed.toFixed(2)}`);

// 8. map toggle, pause menu, save & quit, continue restores progress
await page.keyboard.press('Tab');
await waitFrames(3);
const mapOpen = await page.isVisible('#worldmap');
await page.keyboard.press('Tab');
await waitFrames(3);
check('TAB map opens and closes', mapOpen && !(await page.isVisible('#worldmap')));
await page.keyboard.press('Escape');
await waitFrames(3);
const paused = (await diag()).screen === 'paused' && (await page.isVisible('#pause'));
await page.click('.pause-nav [data-tab="stats"]');
await waitFrames(3);
await page.screenshot({ path: `${out}/pause-stats.png` });
check('ESC opens pause menu', paused);
const before = (await diag()).discovered.length;
await page.click('.pause-nav [data-tab="quit"]');
await waitFrames(5);
const atMenu = (await diag()).screen === 'menu' && (await page.textContent('#btn-play')).includes('CONTINUE');
await page.click('#btn-play');
await waitFrames(5);
d = await diag();
check('save & continue restores progress', atMenu && d.discovered.length === before && d.screen === 'playing', `landmarks ${before} -> ${d.discovered.length}`);

// 9. corrupted save handled gracefully (quit to menu first so save-on-unload doesn't overwrite it)
await page.keyboard.press('Escape');
await waitFrames(3);
await page.click('.pause-nav [data-tab="quit"]');
await waitFrames(3);
await page.evaluate(() => localStorage.setItem('jesus-simulator.save.v1', '{not json'));
await page.reload();
await page.waitForSelector('#menu:not([hidden])', { timeout: 60000 });
await offDuty();
const playLabel = await page.textContent('#btn-play');
await page.click('#btn-play');
await waitFrames(5);
d = await diag();
check('corrupt save -> fresh start, no crash', d.screen === 'playing' && d.discovered.length === 0 && playLabel.trim() === 'PLAY', `label=${playLabel.trim()}`);

// Phase 2 — living world
await phase2Checks({ page, check, diag, waitFrames, hold, out });

// Phase 3 — miracles
await phase3Checks({ page, check, diag, waitFrames, hold, out });

// Phase 4 — the Roman system
await phase4Checks({ page, check, diag, waitFrames, hold, out });
await phase5Checks({ page, check, diag, waitFrames, hold, out });

check('no console/page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ url, results, errors }, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
