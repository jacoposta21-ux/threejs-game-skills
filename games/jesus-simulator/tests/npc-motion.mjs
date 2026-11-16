/**
 * NPC motion evidence: a fixed camera over the town square, the village
 * simulation advanced 0.4 s between frames, 12 frames in a contact sheet.
 * Usage: node tests/npc-motion.mjs [url] [outDir]
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
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setState('plaza-life'));
await page.evaluate(() => { window.__THREE_GAME_TEST_HOOKS__.hideDebugUi(true); window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true); });
const frames = [];
for (let i = 0; i < 12; i += 1) {
  const info = await page.evaluate(() => {
    const s = window.__JESUS_SIM__.session;
    s.pausedForScreenshot = false;
    s.simulate(0.4);
    s.pausedForScreenshot = true;
    for (let k = 0; k < 24; k += 1) s.npcs.update(1 / 60, 1, { cameraPos: s.camera.position, playerPos: s.playerState.position });
    const c = s.renderer.domElement;
    s.ui.updateBubbles(s.npcs.bubbles(null), s.camera, c.clientWidth, c.clientHeight);
    s.render();
    return s.npcs.stats().states;
  });
  const file = path.join(out, `npc-${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, clip: { x: 160, y: 60, width: 640, height: 400 } });
  frames.push({ file: path.basename(file), t: ((i + 1) * 0.4).toFixed(1), states: info });
}
const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(out, f.file)).toString('base64')}"><figcaption>t+${f.t}s</figcaption></figure>`).join('');
const sheet = await browser.newPage({ viewport: { width: 1320, height: 700 } });
await sheet.setContent(`<style>body{margin:0;background:#2b1b10;font:600 13px sans-serif;color:#f7ecd4;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{text-align:center;padding:3px}</style>${cells}`);
await sheet.screenshot({ path: path.join(out, 'npc-motion-sheet.png'), fullPage: true, timeout: 120000 });
fs.writeFileSync(path.join(out, 'npc-motion.json'), JSON.stringify(frames, null, 2));
await browser.close();
console.log(`npc motion sheet: ${frames.length} frames`);
