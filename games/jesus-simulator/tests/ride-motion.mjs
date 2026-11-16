/**
 * Riding motion evidence: (1) Joseph's donkey from a standstill to a gallop
 * across the square, (2) a stolen chariot on the circus straight, (3) the camel
 * caravan and pigeons taking off. Fixed side cameras, the simulation advanced
 * between frames with the test autopilot; one contact sheet.
 * Usage: node tests/ride-motion.mjs [url] [outDir]
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
await page.waitForSelector('#menu:not([hidden])', { timeout: 120000 });

/** Advance `dt` seconds (autopilot toward `to` when riding), frame a side camera that tracks the subject. */
const frame = (args) => page.evaluate(({ dt, to, sprint, cam }) => {
  const s = window.__JESUS_SIM__.session;
  s.pausedForScreenshot = false;
  if (s.vehicles.ridden && to) s.driveForTest([to], dt, sprint);
  else s.simulate(dt);
  s.pausedForScreenshot = true;
  const ctx = { cameraPos: s.camera.position, playerPos: s.playerState.position, night: false };
  for (let k = 0; k < 10; k += 1) { s.npcs.update(1 / 60, 1, ctx); s.romans.update(1 / 60, 1, ctx); s.vehicles.update(1 / 60, 1, s.camera.position); }
  s.syncModel(1 / 60, 1);
  const v = s.vehicles.ridden;
  const target = cam.fixed ? cam.look : v ? [v.pos.x, v.pos.y + 1.2, v.pos.z] : cam.look;
  const [ox, oy, oz] = cam.offset;
  if (cam.fixed) s.camera.position.set(...cam.pos);
  else s.camera.position.set(target[0] + ox, target[1] + oy, target[2] + oz);
  s.camera.lookAt(target[0], target[1], target[2]);
  s.world.update(1 / 60, s.simTime || 0, s.camera.position, s.camera.far);
  s.dayCycle.apply(s.clock, s.camera.position, s.camera.far);
  s.render();
  return v ? { speed: Math.round(v.speed * 10) / 10, x: v.pos.x, z: v.pos.z } : { pigeons: s.npcs.animals.wildlife.stats().pigeonsFlying };
}, args);

const frames = [];
const shoot = async (group, t, info) => {
  const name = `${group}-${frames.length}`;
  const file = path.join(out, `ride-${name}.png`);
  await page.screenshot({ path: file, clip: { x: 160, y: 70, width: 640, height: 400 }, timeout: 120000 });
  frames.push({ file: path.basename(file), label: `${group} t+${t.toFixed(2)}s`, info });
};

// (1) donkey: standstill -> trot -> gallop across the square (side camera)
await page.evaluate(() => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  h.setState('active-play');
  h.hideDebugUi(true);
  const s = window.__JESUS_SIM__.session;
  s.romans.setActive(false);
  s.mountForTest('vehicle.donkey.joseph');
  s.vehicles.place(s.vehicles.ridden, -14, 6, Math.PI / 2 - 0.25);
});
let t = 0;
for (const [dt, sprint] of [[0.05, false], [0.35, false], [0.35, false], [0.4, true], [0.4, true], [0.4, true]]) {
  t += dt;
  await shoot('donkey', t, await frame({ dt, to: [14, -1], sprint, cam: { offset: [1.5, 1.4, 6.5] } }));
}

// (2) chariot on the circus straight (camera alongside)
await page.evaluate(() => {
  const s = window.__JESUS_SIM__.session;
  s.mountForTest('vehicle.chariot.1');
  s.vehicles.place(s.vehicles.ridden, 124, -162.4, -Math.PI / 2);
});
t = 0;
for (const dt of [0.05, 0.4, 0.4, 0.4, 0.4, 0.4]) {
  t += dt;
  await shoot('chariot', t, await frame({ dt, to: [80, -162.4], sprint: true, cam: { offset: [-2.5, 1.6, 7.5] } }));
}

// (3) pigeons bursting off the square as Jesus walks in, the caravan behind
await page.evaluate(() => {
  const s = window.__JESUS_SIM__.session;
  s.vehicles.dismount(s.player, s.playerState, { force: true });
  s.player.teleport(-9, 0, 9, 2.2);
  s.cam.yaw = 2.2 + Math.PI;
});
t = 0;
await page.keyboard.down('KeyW');
for (const dt of [0.05, 0.4, 0.4, 0.5, 0.6, 0.8]) {
  t += dt;
  await shoot('pigeons', t, await frame({ dt, cam: { fixed: true, pos: [8, 3.2, 10], look: [-1, 3, 0] } }));
}
await page.keyboard.up('KeyW');

const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(out, f.file)).toString('base64')}"><figcaption>${f.label}</figcaption></figure>`).join('');
const sheet = await browser.newPage({ viewport: { width: 1320, height: 700 } });
await sheet.setContent(`<style>body{margin:0;background:#2b1b10;font:600 13px sans-serif;color:#f7ecd4;display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{text-align:center;padding:3px}</style>${cells}`);
await sheet.screenshot({ path: path.join(out, 'ride-motion-sheet.png'), fullPage: true });
fs.writeFileSync(path.join(out, 'ride-motion.json'), JSON.stringify(frames, null, 2));
await browser.close();
console.log(`ride motion sheet: ${frames.length} frames`);
