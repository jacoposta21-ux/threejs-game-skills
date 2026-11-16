/**
 * Roman motion evidence: (1) legionaries closing in on Jesus at three stars,
 * (2) a Divine Push ragdoll from launch to getting back up. Fixed cameras,
 * the simulation advanced between frames, one contact sheet.
 * Usage: node tests/roman-motion.mjs [url] [outDir]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4188/';
const out = process.argv[3] || 'artifacts/motion';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(url);
await page.waitForSelector('#menu:not([hidden])', { timeout: 90000 });

const frame = (step) => page.evaluate((dt) => {
  const s = window.__JESUS_SIM__.session;
  s.pausedForScreenshot = false;
  s.simulate(dt);
  s.pausedForScreenshot = true;
  const ctx = { cameraPos: s.camera.position, playerPos: s.playerState.position, night: false };
  for (let k = 0; k < 20; k += 1) { s.npcs.update(1 / 60, 1, ctx); s.romans.update(1 / 60, 1, ctx); }
  s.ragdolls.sync();
  const c = s.renderer.domElement;
  s.ui.updateBubbles(s.allBubbles(), s.camera, c.clientWidth, c.clientHeight);
  s.render();
  const r = s.romans.stats();
  return { modes: r.modes, grab: r.grab, ragdolls: r.ragdolls };
}, step);

const frames = [];
const shoot = async (name, t, info) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, clip: { x: 160, y: 70, width: 640, height: 400 }, timeout: 120000 });
  frames.push({ file: path.basename(file), label: `${name.split('-')[0]} t+${t.toFixed(2)}s`, info });
};

// (1) the chase
await page.evaluate(() => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  h.setState('roman-pursuit');
  h.hideDebugUi(true);
  h.setPausedForScreenshot(true);
  const s = window.__JESUS_SIM__.session;
  s.camera.position.set(9, 6.5, 14);
  s.camera.lookAt(-0.5, 1, 1.5);
});
for (let i = 0; i < 6; i += 1) await shoot(`chase-${i}`, (i + 1) * 0.35, await frame(0.35));

// (2) Divine Push ragdoll and recovery
await page.evaluate(() => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  h.setPausedForScreenshot(false);
  h.setState('active-play');
  h.hideDebugUi(true);
  const s = window.__JESUS_SIM__.session;
  s.unlockAllForTest();
  for (const n of s.npcs.npcs) if (Math.hypot(n.pos.x - 3, n.pos.z - 5) < 7) { s.npcs.leaveAnchor(n, true); s.npcs.place(n, -30, 1.2, 30); }
  const f = s.romans.byId.get('roman.flavius');
  s.romans.place(f, 3, window.__JESUS_SIM__.terrainHeight(3, 7.6), 7.6);
  f.post = { x: 3, z: 7.6, y: f.pos.y, yaw: 0 };
  s.romans.setMode(f, 'duty', { force: true });
  f.yaw = 0;
  s.player.teleport(3, 0, 10, Math.PI);
  s.simulate(0.2);
  s.camera.position.set(3, 3, 14);
  s.camera.lookAt(3, 1.4, 7);
  s.castForTest(0, 0);
  h.setPausedForScreenshot(true);
  s.camera.position.set(14, 3.4, 2.2);
  s.camera.lookAt(2.8, 1.1, 2.6);
});
let t = 0;
for (const dt of [0.08, 0.12, 0.15, 0.2, 0.35, 1.3]) {
  t += dt;
  await shoot(`ragdoll-${frames.length - 6}`, t, await frame(dt));
}

const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(out, f.file)).toString('base64')}"><figcaption>${f.label}</figcaption></figure>`).join('');
const sheet = await browser.newPage({ viewport: { width: 1320, height: 700 } });
await sheet.setContent(`<style>body{margin:0;background:#2b1b10;font:600 13px sans-serif;color:#f7ecd4;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{text-align:center;padding:3px}</style>${cells}`);
await sheet.screenshot({ path: path.join(out, 'roman-motion-sheet.png'), fullPage: true, timeout: 120000 });
fs.writeFileSync(path.join(out, 'roman-motion.json'), JSON.stringify(frames, null, 2));
await browser.close();
console.log(`roman motion sheet: ${frames.length} frames`);
