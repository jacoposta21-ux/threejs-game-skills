// Shared Playwright helpers for scripted playtests (real keyboard input, game state via window.__BTH).
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
let pw;
try { pw = req('playwright'); } catch { pw = createRequire('/opt/node-tools/')('playwright'); }
export const { chromium } = pw;

export async function boot({ w = 1280, h = 720, gl = false, url = 'http://127.0.0.1:5188/' } = {}) {
  const browser = await chromium.launch(gl ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => localStorage.removeItem('beyond-the-hollow-save-v1'));
  await page.goto(url + (gl ? '' : '?canvas'));
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Menu'), null, { timeout: 30000 });
  return { browser, page, errors };
}

export async function startLevel(page, level, checkpoint = -1) {
  await page.evaluate(([l, c]) => {
    const g = window.__game;
    ['Menu', 'BG', 'Story', 'Game'].forEach((k) => g.scene.isActive(k) && g.scene.stop(k));
    window.__BTH = undefined;
    g.scene.start('Game', { level: l, checkpoint: c });
  }, [level, checkpoint]);
  await page.waitForFunction(() => window.__BTH && window.__BTH.scene.player && !window.__BTH.scene.cutscene, null, { timeout: 60000 });
  await page.waitForTimeout(300);
}

export const state = (page) => page.evaluate(() => ({ ...window.__BTH.state(), paused: window.__BTH.scene.scene.isPaused(), overlay: window.__game.scene.getScene('UI').overlay?.getData('kind') ?? null }));
export const closeLog = (page) => page.evaluate(() => window.__game.scene.getScene('UI').closeLog());
export const tp = async (page, tx, ty) => { await closeLog(page); await page.evaluate(([x, y]) => window.__BTH.teleport(x, y), [tx, ty]); await page.waitForTimeout(250); };
/** Grid offset (in tiles) of segment `seg` of the running level. */
export const segX = (page, seg) => page.evaluate((s) => {
  const def = window.__BTH.scene.levelDef; let x = 2;
  for (let i = 0; i < s; i++) x += Math.max(...def.segments[i].map((r) => r.length));
  return x;
}, seg);
export async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
}
export async function tap(page, key, ms = 60) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
export const wait = (page, ms) => page.waitForTimeout(ms);

const results = [];
export function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
export function summary() {
  const f = results.filter((r) => !r.ok);
  console.log(`\n${results.length - f.length}/${results.length} checks passed`);
  return f.length;
}

/** Run right with real key input, jumping (and Pip-boosting) at gaps and walls like a player would. */
export async function autopilotRight(page, untilX, { maxMs = 12000, double = true } = {}) {
  await page.keyboard.down('ArrowRight');
  const t0 = Date.now();
  let lastJump = 0;
  while (Date.now() - t0 < maxMs) {
    const st = await page.evaluate(() => {
      if (!window.__BTH || !window.__BTH.scene.sys.isActive()) return null;
      const s = window.__BTH.scene, p = s.player, L = s.level, T = 32;
      const b = p.body, tx = Math.floor((b.right + 6) / T), ty = Math.floor((b.bottom + 4) / T);
      const gapAhead = !L.solid(tx, ty) && !L.solid(tx + 1, ty) && !s.ghosts.some((g) => g.revealed && Math.abs(g.s.tx - tx) <= 1 && g.s.ty === ty);
      const wallAhead = L.solid(tx, ty - 1) || L.solid(tx, ty - 2);
      return { x: p.x, ground: b.blocked.down || b.touching.down, vy: b.velocity.y, gapAhead, wallAhead, state: p.state };
    });
    if (!st || st.x >= untilX) break;
    const now = Date.now();
    if (st.ground && (st.gapAhead || st.wallAhead) && now - lastJump > 350) {
      lastJump = now;
      await page.keyboard.down('Space');
      await page.waitForTimeout(260);
      await page.keyboard.up('Space');
      if (double && st.wallAhead) { await page.waitForTimeout(180); await page.keyboard.down('Space'); await page.waitForTimeout(200); await page.keyboard.up('Space'); }
    }
    await page.waitForTimeout(40);
  }
  await page.keyboard.up('ArrowRight');
}
