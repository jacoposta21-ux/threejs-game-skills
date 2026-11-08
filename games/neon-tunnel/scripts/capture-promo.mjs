#!/usr/bin/env node
// Captures portal page material from the running dev server (npm run dev):
//   promo/cover-1920x1080.png, promo/cover-portrait-800x1200.png,
//   promo/screenshot-{1..4}.png (1920x1080), promo/gameplay.mp4 (1280x720, 30 fps)
// The video is rendered frame-by-frame through the test hooks, so it is smooth
// even on a slow (software) renderer. Requires ffmpeg on PATH for the video.
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const url = process.env.GAME_URL || 'http://127.0.0.1:5188/';
const out = 'promo';
const seconds = Number(process.env.PROMO_SECONDS || 14);
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : { channel: 'chromium' });

async function open(viewport) {
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(() => localStorage.setItem('neon-tunnel-save-v1', JSON.stringify({ seenTutorial: true, settings: { quality: 'high', muted: true } })));
  await page.goto(url);
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state === 'menu', null, { timeout: 60_000 });
  return page;
}
const hooks = (page, fn, arg) => page.evaluate(fn, arg);

// covers
for (const [w, h, name] of [[1920, 1080, 'cover-1920x1080'], [800, 1200, 'cover-portrait-800x1200']]) {
  const page = await open({ width: w, height: h });
  await hooks(page, async () => {
    const t = window.__THREE_GAME_TEST_HOOKS__;
    await t.setState('cover');
    t.step(40, 1 / 30);
    t.setPausedForScreenshot(true);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
  console.log('wrote', `${out}/${name}.png`);
}

// screenshots across zones
const shots = ['active-play', 'theme-1', 'theme-2', 'theme-3'];
{
  const page = await open({ width: 1920, height: 1080 });
  for (let i = 0; i < shots.length; i += 1) {
    await hooks(page, async (s) => {
      const t = window.__THREE_GAME_TEST_HOOKS__;
      t.seed(11);
      await t.setState(s);
      t.setPausedForScreenshot(true);
    }, shots[i]);
    await page.waitForTimeout(2600); // let HUD banners fade
    await page.screenshot({ path: `${out}/screenshot-${i + 1}.png` });
    console.log('wrote', `${out}/screenshot-${i + 1}.png`);
  }
  await page.close();
}

// gameplay video
{
  const page = await open({ width: 1280, height: 720 });
  const frames = `${out}/.frames`;
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  await hooks(page, async () => {
    const t = window.__THREE_GAME_TEST_HOOKS__;
    t.seed(21);
    await t.setState('theme-1');
    t.setPausedForScreenshot(true);
    t.setAutopilot(true);
    t.setInvincible(true);
  });
  const total = seconds * 30;
  for (let f = 0; f < total; f += 1) {
    await hooks(page, () => window.__THREE_GAME_TEST_HOOKS__.step(1, 1 / 30));
    await page.screenshot({ path: `${frames}/f${String(f).padStart(4, '0')}.png` });
  }
  await page.close();
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${frames}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', `${out}/gameplay.mp4`]);
    console.log('wrote', `${out}/gameplay.mp4`);
    await rm(frames, { recursive: true, force: true });
  } catch (err) {
    console.warn('ffmpeg failed or missing; frames kept in', frames, err.message);
  }
}
await browser.close();
