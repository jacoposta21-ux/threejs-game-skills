// CPU cost of one 60 Hz game frame WITHOUT rendering: physics (2 × 120 Hz
// steps), team AI, controllers, animation mixers, crowd, camera, VFX, replay
// recording — during a real AI-vs-AI 3v3 match. Valid on any machine (no GPU
// involved). node tools/qa/cpuprofile.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://127.0.0.1:4188/?qa=1';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript(() => localStorage.setItem('rua10:settings', JSON.stringify({ quality: 'medium' })));
await page.goto(url);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
const r = await page.evaluate(() => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  const g = window.__RUA10__;
  h.setState('active-play');
  h.setPausedForScreenshot(true);
  h.setAutoplay(true);
  g.skipReplays = true;
  g.resetPositions('home');
  h.simulate(2, {}); // warm-up (JIT)
  const times = [];
  for (let i = 0; i < 1800; i += 1) {
    const t0 = performance.now();
    h.simulate(1 / 60, {});
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return { frames: times.length, avgMs: +avg.toFixed(3), p50Ms: +times[900].toFixed(3), p95Ms: +times[1710].toFixed(3), p99Ms: +times[1782].toFixed(3), maxMs: +times[1799].toFixed(3), score: g.score, phase: g.phase };
});
console.log(JSON.stringify(r));
await browser.close();
