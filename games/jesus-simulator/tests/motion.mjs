/**
 * Motion evidence: drives idle -> walk -> sprint -> jump -> land -> idle with
 * real key input (strafing so the camera sees the character side-on), records
 * a video and builds a contact sheet. Usage: node tests/motion.mjs [url] [outDir]
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
const context = await browser.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
const page = await context.newPage();
const diag = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
const waitFrames = async (n) => {
  const start = (await diag()).frame;
  await page.waitForFunction((s) => window.__THREE_GAME_DIAGNOSTICS__.frame >= s, start + n, { timeout: 120000 });
};

await page.goto(url);
await page.waitForSelector('#menu:not([hidden])', { timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.click('#btn-play');
await page.evaluate(() => {
  const s = window.__JESUS_SIM__.session;
  s.hideDebugUi = true;
  s.player.teleport(-6, 0, 9, 0);
  s.cam.snap(s.playerState.position, 0);
  s.cam.pitch = 0.18;
  s.cam.targetDistance = 5;
});
await waitFrames(20);

const frames = [];
const grab = async (label) => {
  const file = path.join(out, `frame-${String(frames.length).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, clip: { x: 280, y: 90, width: 400, height: 400 }, timeout: 120000 });
  const d = await diag();
  frames.push({ file: path.basename(file), label, speed: d.player.speed.toFixed(1), y: d.player.position.y.toFixed(2), grounded: d.player.grounded });
};

await grab('idle');
await page.keyboard.down('KeyD');
for (let i = 0; i < 4; i += 1) { await waitFrames(3); await grab('walk'); }
await page.keyboard.down('ShiftLeft');
await waitFrames(10);
for (let i = 0; i < 3; i += 1) { await waitFrames(3); await grab('sprint'); }
await page.keyboard.down('Space');
await waitFrames(3);
await grab('jump rise');
await waitFrames(4);
await grab('jump apex');
await page.keyboard.up('Space');
await waitFrames(5);
await grab('falling');
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyD');
await waitFrames(4);
await grab('landing');
await waitFrames(30);
await grab('idle again');

// contact sheet
const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(out, f.file)).toString('base64')}"><figcaption>${f.label}<br><small>v=${f.speed} y=${f.y} ${f.grounded ? 'grounded' : 'air'}</small></figcaption></figure>`).join('');
const sheet = await browser.newPage({ viewport: { width: 1320, height: 900 } });
await sheet.setContent(`<style>body{margin:0;background:#2b1b10;font:600 14px sans-serif;color:#f7ecd4;display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{text-align:center;padding:4px}</style>${cells}`);
await sheet.screenshot({ path: path.join(out, 'motion-sheet.png'), fullPage: true });
await sheet.close();
fs.writeFileSync(path.join(out, 'motion.json'), JSON.stringify(frames, null, 2));
const video = page.video();
await context.close();
const vpath = await video.path();
fs.renameSync(vpath, path.join(out, 'locomotion.webm'));
await browser.close();
console.log(frames.map((f) => `${f.label}: v=${f.speed} y=${f.y} ${f.grounded}`).join('\n'));
