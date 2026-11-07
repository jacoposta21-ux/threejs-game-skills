/**
 * Headless verification + screenshots (Playwright is used only as a dev tool).
 *   node scripts/screenshots.cjs [baseUrl] [outDir]
 * Default base URL: http://localhost:5173/ (npm run dev). Use the preview URL for the build.
 * Exits non-zero on console errors or failed checks.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:5173/';
const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const external = new Set();
const events = new Set();
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${url}: ${m.text()}`);
    const t = m.text();
    if (t.startsWith('[analytics]')) events.add(t.split(' ')[1]);
  });
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.add(u.href);
  });
  if (opts.save !== undefined) {
    await page.addInitScript((save) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        if (save === null) localStorage.removeItem('cot_save_v1');
        else localStorage.setItem('cot_save_v1', save);
      }
    }, opts.save);
  }
  await page.goto(url);
  await page.waitForFunction(() => window.cot && window.cot.scene && !document.getElementById('loader'), null, { timeout: 15000 });
  await sleep(400);
  return { ctx, page };
}

/** Converts game coordinates (1280×720) to page coordinates. */
async function toPage(page, x, y) {
  return page.evaluate(
    ([x, y]) => {
      const c = document.querySelector('canvas').getBoundingClientRect();
      return { x: c.left + (x / 1280) * c.width, y: c.top + (y / 720) * c.height };
    },
    [x, y],
  );
}

const slot = (i) => ({ x: 50 + (i % 5) * 150 + 70, y: 120 + Math.floor(i / 5) * 126 + 58 });

function makeSave(over) {
  const base = {
    v: 1, coins: 0, grid: new Array(20).fill(0), poolsBought: 0, upgrades: { hotWater: 0, shovel: 0, longRest: 0 }, spawnTimer: 0,
    unlocked: new Array(12).fill(false), maxLevel: 0, playTime: 0, totalEarned: 0, goldenTime: 0, boostTime: 0, nextGuestIn: 120, merges: 1, lastSeen: Date.now(), muted: true,
  };
  return JSON.stringify(Object.assign(base, over));
}

async function drag(page, from, to, steps = 12) {
  const a = await toPage(page, slot(from).x, slot(from).y);
  const b = await toPage(page, slot(to).x, slot(to).y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    await sleep(16);
  }
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1) fresh start
    {
      const { ctx, page } = await open(browser, BASE, { save: null, dpr: 1 });
      const st = await page.evaluate(() => window.cot.state());
      check('fresh game starts with 2 level-1 pools', st.grid.filter((x) => x === 1).length === 2);
      await page.screenshot({ path: path.join(OUT, '01_start.png') });
      // merge the two starting pools by drag & drop
      await drag(page, 0, 1);
      await sleep(130);
      await page.screenshot({ path: path.join(OUT, '02_merge_moment.png') });
      await sleep(900);
      const after = await page.evaluate(() => window.cot.state());
      check('drag & drop merges two L1 into an L2', after.grid[1] === 2 && after.grid[0] === 0, JSON.stringify(after.grid.slice(0, 3)));
      // new capybara popup for L2
      await page.screenshot({ path: path.join(OUT, '03_new_capybara.png') });
      // persistence across reload
      await page.evaluate(() => {
        const s = window.cot.state();
        s.coins = 4242;
      });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
      await page.reload();
      await page.waitForFunction(() => window.cot && window.cot.scene && !document.getElementById('loader'));
      const reloaded = await page.evaluate(() => window.cot.state());
      check('save survives a page reload', reloaded.grid[1] === 2 && reloaded.coins >= 4242, `coins=${Math.round(reloaded.coins)}`);
      await ctx.close();
    }

    // 2) dig, upgrade, full grid
    {
      const grid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 3, 5, 2, 7, 4, 6, 1, 8];
      const unlocked = new Array(12).fill(true);
      const { ctx, page } = await open(browser, BASE, { save: makeSave({ coins: 2.5e6, grid, unlocked, maxLevel: 12 }) });
      await sleep(1200);
      await page.screenshot({ path: path.join(OUT, '04_grid_full.png') });
      const digDisabled = await page.evaluate(() => !window.cot.scene.digBtn.isEnabled());
      check('dig button disabled when grid is full', digDisabled);
      // swap two different levels
      await drag(page, 0, 1);
      await sleep(400);
      let st = await page.evaluate(() => window.cot.state());
      check('dragging onto a different level swaps', st.grid[0] === 2 && st.grid[1] === 1);
      // buy upgrade
      const before = st.upgrades.hotWater;
      const btn = await page.evaluate(() => ({ x: window.cot.scene.upgradeButtons.get('hotWater').x, y: window.cot.scene.upgradeButtons.get('hotWater').y }));
      const p = await toPage(page, btn.x, btn.y);
      await page.mouse.click(p.x, p.y);
      await sleep(200);
      st = await page.evaluate(() => window.cot.state());
      check('upgrade purchase via the panel', st.upgrades.hotWater === before + 1, `hotWater ${before} → ${st.upgrades.hotWater}`);
      // golden guest
      await page.evaluate(() => {
        window.cot.state().nextGuestIn = 0;
      });
      await sleep(2500);
      await page.screenshot({ path: path.join(OUT, '05_golden_guest.png') });
      const gpos = await page.evaluate(() => ({ x: window.cot.scene.guest.x, y: window.cot.scene.guest.y, v: window.cot.scene.guest.visible }));
      check('golden guest crosses the screen', gpos.v && gpos.x > 0 && gpos.x < 1280);
      const gp = await toPage(page, gpos.x + 30, gpos.y);
      await page.mouse.click(gp.x, gp.y);
      await sleep(500);
      st = await page.evaluate(() => window.cot.state());
      check('tapping the golden guest gives ×3', st.goldenTime > 25, `goldenTime=${st.goldenTime.toFixed(1)}`);
      await page.screenshot({ path: path.join(OUT, '06_golden_popup.png') });
      await ctx.close();
    }

    // 3) offline popup via ?offline=3600
    {
      const grid = [5, 6, 4, 3, 2, 7, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const unlocked = [true, true, true, true, true, true, true, false, false, false, false, false];
      const { ctx, page } = await open(browser, BASE + '?offline=3600', { save: makeSave({ coins: 1000, grid, unlocked, maxLevel: 7 }) });
      await sleep(700);
      await page.screenshot({ path: path.join(OUT, '07_offline_popup.png') });
      const c0 = await page.evaluate(() => window.cot.state().coins);
      // click "Collect" (left button of the popup, game coords 640-140, 360+130)
      const p = await toPage(page, 500, 490);
      await page.mouse.click(p.x, p.y);
      await sleep(400);
      const c1 = await page.evaluate(() => window.cot.state().coins);
      const expected = await page.evaluate(() => {
        const s = window.cot.state();
        let base = 0;
        for (const l of s.grid) if (l > 0) base += Math.pow(2.3, l - 1);
        return 0.5 * base * Math.pow(1.5, s.upgrades.hotWater) * 3600;
      });
      check('offline earnings = 50% × prod × 3600 s (cap 1 h)', Math.abs(c1 - c0 - expected) / expected < 0.02, `got ${Math.round(c1 - c0)} expected ${Math.round(expected)}`);
      // dig with the collected coins
      const db = await page.evaluate(() => ({ x: window.cot.scene.digBtn.x, y: window.cot.scene.digBtn.y }));
      const before = await page.evaluate(() => window.cot.state().poolsBought);
      const dp = await toPage(page, db.x, db.y);
      await page.mouse.click(dp.x, dp.y);
      await sleep(300);
      const afterDig = await page.evaluate(() => window.cot.state());
      check('Dig buys a pool in the first empty slot', afterDig.poolsBought === before + 1 && afterDig.grid[7] === 1, `poolsBought ${before} → ${afterDig.poolsBought}`);
      // album
      await page.evaluate(() => window.cot.scene.openAlbum());
      await sleep(600);
      await page.screenshot({ path: path.join(OUT, '08_album.png') });
      await ctx.close();
    }

    // 4) rewarded ad stub: boost ×2
    {
      const { ctx, page } = await open(browser, BASE, { save: makeSave({ coins: 10, grid: [1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], unlocked: [true, true, true, false, false, false, false, false, false, false, false, false], maxLevel: 3 }) });
      const b = await page.evaluate(() => ({ x: window.cot.scene.boostBtn.x, y: window.cot.scene.boostBtn.y }));
      const p = await toPage(page, b.x, b.y);
      await page.mouse.click(p.x, p.y);
      await sleep(600);
      await page.screenshot({ path: path.join(OUT, '09_ad_stub.png') });
      await sleep(2000);
      const st = await page.evaluate(() => window.cot.state());
      check('rewarded stub (2 s) grants ×2 boost', st.boostTime > 290, `boostTime=${st.boostTime.toFixed(1)}`);
      await sleep(300);
      await page.screenshot({ path: path.join(OUT, '10_boost_active.png') });
      await ctx.close();
    }

    // 4b) background tab: hidden for 1 h → offline popup on return, no runaway tick
    {
      const { ctx, page } = await open(browser, BASE, { save: makeSave({ grid: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], unlocked: [true, true, true, false, false, false, false, false, false, false, false, false], maxLevel: 3 }) });
      const r = await page.evaluate(async () => {
        const sc = window.cot.scene;
        let hidden = true;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        document.dispatchEvent(new Event('visibilitychange'));
        sc.hiddenAt = Date.now() - 3600 * 1000;
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise((res) => setTimeout(res, 500));
        return { popup: sc.popupOpen, grid: window.cot.state().grid.filter((x) => x > 0).length };
      });
      check('background tab (1 h) → welcome-back popup, no spawn explosion', r.popup && r.grid === 2, JSON.stringify(r));
      await ctx.close();
    }

    // 5) failing ad: game continues
    {
      const { ctx, page } = await open(browser, BASE + '?adfail=1', { save: makeSave({ grid: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], unlocked: [true, false, false, false, false, false, false, false, false, false, false, false], maxLevel: 1 }) });
      const b = await page.evaluate(() => ({ x: window.cot.scene.boostBtn.x, y: window.cot.scene.boostBtn.y }));
      const p = await toPage(page, b.x, b.y);
      await page.mouse.click(p.x, p.y);
      await sleep(1500);
      const st = await page.evaluate(() => ({ boost: window.cot.state().boostTime, coins: window.cot.state().coins, paused: window.cot.scene.paused }));
      check('failed ad → no reward, game keeps running', st.boost === 0 && !st.paused && st.coins > 0);
      await ctx.close();
    }

    // 6) mobile landscape 844×390 (touch)
    {
      const grid = [1, 1, 2, 3, 4, 5, 2, 6, 0, 3, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0];
      const unlocked = [true, true, true, true, true, true, true, false, false, false, false, false];
      const { ctx, page } = await open(browser, BASE, { viewport: { width: 844, height: 390 }, touch: true, mobile: true, dpr: 2, save: makeSave({ coins: 50000, grid, unlocked, maxLevel: 7 }) });
      await sleep(800);
      await page.screenshot({ path: path.join(OUT, '11_mobile_844x390.png') });
      const sizes = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        const k = r.width / 1280;
        const sc = window.cot.scene;
        const btns = [sc.digBtn, sc.boostBtn, sc.albumBtn, sc.muteBtn, ...sc.upgradeButtons.values()];
        return { k, min: Math.min(...btns.map((b) => Math.min(b.width, b.height) * k)), noScrollX: document.documentElement.scrollWidth <= innerWidth };
      });
      check('mobile buttons ≥ 48 px effective', sizes.min >= 47.5, `smallest ${sizes.min.toFixed(1)} px (scale ${sizes.k.toFixed(3)})`);
      check('mobile: no horizontal scroll', sizes.noScrollX);
      // touch drag merge
      const a = await toPage(page, slot(0).x, slot(0).y);
      const bb = await toPage(page, slot(1).x, slot(1).y);
      const cdp = await ctx.newCDPSession(page);
      const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', a.x, a.y);
      for (let i = 1; i <= 10; i++) {
        await touch('touchMove', a.x + ((bb.x - a.x) * i) / 10, a.y + ((bb.y - a.y) * i) / 10);
        await sleep(16);
      }
      await touch('touchEnd');
      await sleep(900);
      const st = await page.evaluate(() => window.cot.state());
      check('touch drag merges on mobile', st.grid[1] === 2 && st.grid[0] === 0, JSON.stringify(st.grid.slice(0, 3)));
      await page.screenshot({ path: path.join(OUT, '12_mobile_after_merge.png') });
      await ctx.close();
    }

    // 6b) 10 s merge clip (video) — "a muted 10 s clip of merges must look like an ad"
    {
      const grid = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];
      const unlocked = new Array(12).fill(false).map((_, i) => i < 11);
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((save) => localStorage.setItem('cot_save_v1', save), makeSave({ coins: 3e5, grid, unlocked, maxLevel: 11 }));
      await page.goto(BASE);
      await page.waitForFunction(() => window.cot && window.cot.scene && !document.getElementById('loader'));
      await sleep(500);
      const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15], [16, 17], [18, 19]];
      let k = 0;
      for (const [a, b] of pairs) {
        await drag(page, a, b, 8);
        if (k++ === 3) await page.screenshot({ path: path.join(OUT, '13_merge_juice.png') });
        await sleep(650);
      }
      await sleep(1200);
      const video = page.video();
      await ctx.close();
      if (video) {
        const src = await video.path();
        fs.renameSync(src, path.join(OUT, 'merge_clip.webm')); // trim: ffmpeg -ss 3 -i merge_clip.webm -t 10 merge_clip_10s.webm
      }
      const exists = fs.existsSync(path.join(OUT, 'merge_clip.webm'));
      check('10 s merge clip recorded', exists, 'screenshots/merge_clip.webm');
    }

    // 7) performance sample (frames over 3 s while idle with full board)
    {
      const grid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 3, 5, 2, 7, 4, 6, 1, 8];
      const { ctx, page } = await open(browser, BASE, { save: makeSave({ grid, unlocked: new Array(12).fill(true), maxLevel: 12 }) });
      const perf = await page.evaluate(
        () =>
          new Promise((res) => {
            const g = window.cot.scene.game;
            let a = 0;
            let cpu = 0;
            let n = 0;
            const t0 = performance.now();
            g.events.on('prestep', () => (a = performance.now()));
            g.events.on('postrender', () => {
              cpu += performance.now() - a;
              n++;
            });
            setTimeout(() => res({ cpuMs: cpu / n, fps: (n * 1000) / (performance.now() - t0) }), 3000);
          }),
      );
      check('CPU cost per frame (update + render submit) < 4 ms', perf.cpuMs < 4, `${perf.cpuMs.toFixed(2)} ms/frame; headless SwiftShader fps ${perf.fps.toFixed(1)} (GPU fill-bound, info only)`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  const bad = errors.filter((e) => !/favicon/.test(e));
  check('no console errors', bad.length === 0, bad.slice(0, 5).join(' | '));
  const want = ['session_start', 'merge', 'max_level_reached', 'pool_bought', 'upgrade_bought', 'offline_collected', 'golden_guest_tapped', 'booster_used', 'ad_rewarded_shown', 'album_opened'];
  const missing = want.filter((e) => !events.has(e));
  check('analytics events emitted', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : [...events].join(', '));
  check('no external network requests', external.size === 0, [...external].slice(0, 5).join(' | '));
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshots in ${OUT}`);
  process.exitCode = failed.length ? 1 : 0;
})();
