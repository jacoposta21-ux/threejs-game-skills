#!/usr/bin/env node
// Drives the real game in headless Chromium: loads, captures named states at
// desktop + mobile viewports, then plays with real key input (walk, sprint,
// jump, crouch, camera, pickup) and checks state changes. Writes artifacts/.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] || 'http://127.0.0.1:5188/';
const out = 'artifacts/playtest';
const states = (process.argv[3] || 'explore-golden,explore-day,explore-night,downtown-day,neon-night,beach-sunset,residential-day,industrial-day,map,pause').split(',');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { url, errors: [], captures: [], play: {} };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => report.errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.errors.push(`${m.type()}: ${m.text()}`); });
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => !document.getElementById('play').classList.contains('hidden') || !document.getElementById('fatal').classList.contains('hidden'), null, { timeout: 180000 });
report.loadMs = Date.now() - t0;
await page.screenshot({ path: `${out}/start.png` });
report.captures.push('start.png');
await page.click('#play');
await page.waitForTimeout(800);
for (const s of states) {
  await page.evaluate((s) => window.__THREE_GAME_TEST_HOOKS__.setState(s), s);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${s}.png` });
  report.captures.push(`${s}.png`);
  if (s === 'map' || s === 'pause') await page.evaluate(() => window.__game.resume());
}
// ---- real-input play
const D = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setState('explore-golden'));
const before = await D();
await page.keyboard.down('KeyW'); await page.waitForTimeout(1500);
const walking = await D();
await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(1500);
const sprint = await D();
await page.screenshot({ path: `${out}/play-sprint.png` });
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
await page.keyboard.press('Space'); await page.waitForTimeout(180);
const jump = await D();
await page.screenshot({ path: `${out}/play-jump.png` });
await page.waitForTimeout(900);
await page.keyboard.press('KeyC'); await page.waitForTimeout(500);
const crouch = await D();
await page.screenshot({ path: `${out}/play-crouch.png` });
await page.keyboard.press('KeyC');
// camera rotation via arrow keys (mouse look fallback path)
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft');
const rotated = await D();
// wall collision: run north into the block for 4s and check we never enter a building
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.teleport(60, -24));
await page.evaluate(() => { window.__game.camera3p.yaw = Math.PI; });
await page.keyboard.down('KeyW'); await page.waitForTimeout(3500); await page.keyboard.up('KeyW');
const wall = await D();
// pickup: teleport next to the first tape and press E
const tape = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.tapes()))[0];
await page.evaluate(([x, z]) => window.__THREE_GAME_TEST_HOOKS__.teleport(x + 1, z), [tape.x, tape.z]);
await page.waitForTimeout(400);
const moneyBefore = (await D()).money;
await page.keyboard.press('KeyE'); await page.waitForTimeout(600);
const after = await D();
await page.screenshot({ path: `${out}/play-pickup.png` });
// M map + Esc
await page.keyboard.press('KeyM'); await page.waitForTimeout(400);
const mapState = (await D()).state;
await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
report.play = {
  start: before.player, walking: walking.player, sprint: sprint.player, jumpY: jump.player.y - before.player.y, jumpGrounded: jump.player.grounded,
  crouch: crouch.player.crouched, crouchAnim: crouch.player.anim, yawBefore: walking.camera.yaw, yawAfter: rotated.camera.yaw,
  wallZ: wall.player.z, moneyBefore, moneyAfter: after.money, tapes: after.tapes, mapState, render: after.render,
};
// mobile viewport capture
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setState('explore-golden'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/mobile-explore.png` });
report.captures.push('mobile-explore.png');
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
