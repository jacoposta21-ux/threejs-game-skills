#!/usr/bin/env node
// Renders a clean gameplay clip frame-by-frame (smooth even on a slow renderer):
// fast Violet Void zone, no power-ups, the promo pilot follows the guaranteed
// safe line, collisions stay real (a crash aborts the clip).
//
//   GAME_URL=http://127.0.0.1:4188/ node scripts/capture-gameplay.mjs 1920 1080 promo/gameplay-1920x1080.mp4
//   env: SECONDS (15), FPS (30), SEED (5), WARMUP (2 s), FRAMES_ONLY=1 to keep PNG frames
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const [width = 1920, height = 1080, out = 'promo/gameplay.mp4'] = process.argv.slice(2);
const url = process.env.GAME_URL || 'http://127.0.0.1:5188/';
const seconds = Number(process.env.SECONDS || 15);
const fps = Number(process.env.FPS || 30);
const seed = Number(process.env.SEED || 5);
const warmup = Number(process.env.WARMUP || 2);
const frames = `${out}.frames`;

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : { channel: 'chromium' });
const page = await (await browser.newContext({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 })).newPage();
const quality = process.env.QUALITY || 'medium';
await page.addInitScript((q) => localStorage.setItem('neon-tunnel-save-v1', JSON.stringify({ seenTutorial: true, settings: { quality: q, muted: false } })), quality);
await page.goto(url);
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'menu', null, { timeout: 60_000 });
await page.evaluate(async ({ seed, warmup, fps }) => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  h.seed(seed);
  await h.setState('promo-fast');
  h.setPausedForScreenshot(true);
  h.step(Math.round(warmup * fps), 1 / fps);
}, { seed, warmup, fps });
await page.waitForTimeout(3000); // let any HUD banner animation finish

await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
const total = Math.round(seconds * fps);
for (let f = 0; f < total; f += 1) {
  const state = await page.evaluate((fps) => window.__THREE_GAME_TEST_HOOKS__.step(1, 1 / fps), fps);
  if (state !== 'playing') throw new Error(`run ended at frame ${f} (${state}); try another SEED`);
  await page.screenshot({ path: `${frames}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 });
  if (f % 50 === 0) console.log(`frame ${f}/${total}`);
}
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${frames}/f%04d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
if (!process.env.FRAMES_ONLY) await rm(frames, { recursive: true, force: true });
console.log('wrote', out);
