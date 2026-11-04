import { chromium } from '@playwright/test';
export async function open(url = process.env.BOT_URL ?? 'http://127.0.0.1:4188/?simsteps=6') {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__SHELL__, null, { timeout: 60000 });
  const B = {
    page, browser, errs,
    st: () => page.evaluate(() => { const d = window.__THREE_GAME_DIAGNOSTICS__; return { host: d.game.host, area: d.game.area, flags: d.game.flags.join(','), missions: d.game.missions.join(','), items: d.game.items.join(','), pos: [d.player.position.x, d.player.position.y, d.player.position.z].map((v) => +v.toFixed(2)), prompts: d.game.prompts, state: d.game.state, susp: +(+d.game.suspicion).toFixed(2) }; }),
    npc: (id) => page.evaluate((id) => { const n = window.__SHELL__.game.npcById.get(id); return { state: n.state, pos: n.ch.pos.toArray().map((v) => +v.toFixed(2)), susp: +n.suspicion.toFixed(2) }; }, id),
    obj: (id) => page.evaluate((id) => window.__SHELL__.game.objById.get(id).pos.toArray().map((v) => +v.toFixed(2)), id),
    key: (c, d) => page.evaluate(([c, d]) => window.__SHELL__.key(c, d), [c, d]),
    async press(w, wait = 400) { await page.evaluate((w) => window.__SHELL__.press(w), w); await page.waitForTimeout(wait); },
    async log(label) { console.log(label, JSON.stringify(await B.st())); },
    async closeCard() { await page.waitForTimeout(900); const b = await page.$('[data-a=ok]'); if (b) { await b.click(); await page.waitForTimeout(300); } },
    npcPos: (id) => async () => { const n = await B.npc(id); return [n.pos[0], n.pos[2]]; },
    objPos: (id) => async () => { const o = await B.obj(id); return [o[0], o[2]]; },
    async walkTo(x, z, tol = 0.8, maxMs = 90000, run = true) {
      const t0 = Date.now();
      await B.key('KeyW', true); if (run) await B.key('ShiftLeft', true);
      let d = 99;
      while (Date.now() - t0 < maxMs) {
        d = await page.evaluate(([x, z]) => { document.querySelector('[data-a=ok]')?.click(); window.__SHELL__.lookAt(x, z); const c = window.__SHELL__.game.controlled.pos; return Math.hypot(c.x - x, c.z - z); }, [x, z]);
        if (d < tol) break;
        await page.waitForTimeout(50);
      }
      await B.key('KeyW', false); await B.key('ShiftLeft', false);
      await page.waitForTimeout(200);
      if (d >= tol) console.log('WALK FAILED', x, z, d.toFixed(2));
    },
    async approach(getT, re, slot = 'e', maxMs = 60000) {
      const t0 = Date.now(); let ok = false;
      while (Date.now() - t0 < maxMs) {
        const t = await getT();
        const r = await page.evaluate(([x, z]) => { document.querySelector('[data-a=ok]')?.click(); window.__SHELL__.lookAt(x, z); const c = window.__SHELL__.game.controlled.pos; const d = window.__THREE_GAME_DIAGNOSTICS__; return { d: Math.hypot(c.x - x, c.z - z), e: d.game.prompts.e, f: d.game.prompts.f }; }, t);
        const pr = slot === 'e' ? r.e : r.f;
        if (pr && re.test(pr)) { ok = true; break; }
        await B.key('KeyW', r.d > 0.6);
        await page.waitForTimeout(50);
      }
      await B.key('KeyW', false);
      await page.waitForTimeout(150);
      if (!ok) console.log('APPROACH FAILED', re, JSON.stringify(await B.st()));
      return ok;
    },
    async waitFor(fn, arg, ms = 20000) { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { console.log('WAIT FAILED', String(fn).slice(0, 80), arg); return false; } },
    async waitHost(kind, ms = 20000) { return B.waitFor((k) => window.__THREE_GAME_DIAGNOSTICS__.game.host === k, kind, ms); },
    async waitFlag(f, ms = 20000) { return B.waitFor((f) => window.__THREE_GAME_DIAGNOSTICS__.game.flags.includes(f), f, ms); },
    async waitIdle(ms = 15000) { return B.waitFor(() => !document.querySelector('#action-ring') || document.querySelector('#action-ring').classList.contains('hidden'), null, ms); },
    async fps() { return page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) r(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })); },
    async simWait(sec) { await page.evaluate(() => document.querySelector('[data-a=ok]')?.click()); const t0 = await page.evaluate(() => window.__SHELL__.game.time); await B.waitFor((t) => window.__SHELL__.game.time > t, t0 + sec, 120000); },
    async face(x, z) { await page.evaluate(([x, z]) => window.__SHELL__.lookAt(x, z), [x, z]); await page.waitForTimeout(150); },
  };
  return B;
}
