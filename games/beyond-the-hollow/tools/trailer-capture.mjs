// Usage: (dev server on :5188) node tools/trailer-capture.mjs 1920 1080 <frames-dir>  → then ffmpeg -framerate 30 -i <dir>/f%04d.jpg …
// Deterministic trailer capture: the game loop is stepped by hand at 30 fps and every frame is grabbed.
import { createRequire } from 'module';
import fs from 'fs';
const { chromium } = createRequire('/opt/node-tools/')('playwright');
const W = +process.argv[2], H = +process.argv[3], OUT = process.argv[4], ONLY = process.argv[5] || '';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];

page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('beyond-the-hollow-save-v1', JSON.stringify({ version: 1, unlocked: 18, level: 0, checkpoint: -1, lore: [], deaths: 0, completed: false, settings: { music: 0.7, sfx: 0.85, quality: 'high', shake: true, lang: 'en', bossDiff: 'normal' } })));
await page.goto('http://127.0.0.1:5188/?noauto');

await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Menu'), null, { timeout: 90000 });
await page.waitForTimeout(1500);

// ---------- page-side director
await page.evaluate(() => {
  const g = window.__game;
  g.loop.sleep();
  const D = (window.__D = { t: performance.now(), held: new Set() });
  const KC = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, Space: 32, KeyX: 88, KeyF: 70, KeyQ: 81, KeyR: 82 };
  D.key = (code, down) => {
    if (down === D.held.has(code)) return;
    if (down) D.held.add(code); else D.held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, keyCode: KC[code], which: KC[code], bubbles: true }));
  };
  D.releaseAll = () => [...D.held].forEach((c) => D.key(c, false));
  // a recording picked up along the way would pause the game behind the hidden UI: close it at once
  D.step = (n = 1) => { for (let i = 0; i < n; i++) { const ui = g.scene.getScene('UI'); if (ui && ui.logOpen) ui.closeLog(); D.t += 1000 / 30; g.step(D.t, 1000 / 30); } };
  // overlay canvas for captions (game font)
  const oc = document.createElement('canvas');
  D.grab = (cap, capAlpha, big) => {
    const src = g.canvas;
    oc.width = src.width; oc.height = src.height;
    const c = oc.getContext('2d');
    c.drawImage(src, 0, 0);
    if (cap && capAlpha > 0) {
      const w = oc.width, h = oc.height, port = h > w;
      c.save();
      c.globalAlpha = capAlpha;
      const grad = c.createLinearGradient(0, h * 0.62, 0, h);
      grad.addColorStop(0, 'rgba(5,7,10,0)'); grad.addColorStop(1, 'rgba(5,7,10,0.85)');
      c.fillStyle = grad; c.fillRect(0, h * 0.62, w, h * 0.38);
      const size = Math.round((big ? (port ? 64 : 92) : (port ? 40 : 56)));
      c.font = `600 ${size}px Cinzel`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 18;
      c.fillStyle = big ? '#b8ffd8' : '#f4ecd8';
      const lines = cap.split('\n');
      const y0 = big ? h * (port ? 0.62 : 0.74) - (lines.length - 1) * size * 0.6 : h * (port ? 0.86 : 0.85) - (lines.length - 1) * size * 0.6;
      lines.forEach((l, i) => c.fillText(l, w / 2, y0 + i * size * 1.2));
      c.restore();
    }
    return oc.toDataURL('image/jpeg', 0.9);
  };
  // trailer framing for the title: larger lockup, centred in portrait
  D.bigTitle = () => {
    const m = g.scene.getScene('Menu'), w = g.scale.width, h = g.scale.height, port = h > w;
    m.title.setScale(port ? Math.min(1.1, w / 760) : Math.min(1.8, w / 1000));
    m.title.setPosition(port ? w / 2 : w * 0.64, h * (port ? 0.22 : 0.3));
    m.root?.setVisible(false);
  };
  D.hideUI = () => { const ui = g.scene.getScene('UI'); if (ui && ui.cameras?.main) ui.cameras.main.setVisible(false); };
  D.cleanLevel = () => {
    const s = window.__BTH.scene;
    s.hints.forEach((h) => h.text.destroy()); s.hints = [];
    s.player.invuln = 0;
    window.__BTH.godMode(true);
    s.player.maxHp = 5; s.player.hp = 5;
  };
  D.startLevel = (lv, cp = -1) => {
    ['Menu', 'BG', 'Story', 'Game'].forEach((k) => g.scene.isActive(k) && g.scene.stop(k));
    window.__BTH = undefined;
    g.scene.start('Game', { level: lv, checkpoint: cp });
    for (let i = 0; i < 400; i++) { D.step(); if (window.__BTH && window.__BTH.scene.player && !window.__BTH.scene.cutscene) break; }
    D.hideUI();
    D.cleanLevel();
    D.frame();
  };
  // portrait trailers: bring the camera closer so Elias and Pip read on a phone
  D.frame = () => { if (g.scale.height > g.scale.width) { const sc = window.__BTH.scene; sc.tweens.killTweensOf(sc.cameras.main); sc.applyZoom(); sc.cameras.main.setZoom(sc.cameras.main.zoom * 1.6); } };
  // simple run-right autopilot (jump at walls/gaps, Pip boost on tall walls)
  D.autopilot = () => {
    const s = window.__BTH.scene, p = s.player, L = s.level, T = 32;
    const b = p.body, tx = Math.floor((b.right + 10) / T), ty = Math.floor((b.bottom + 4) / T);
    const gap = !L.solid(tx, ty) && !L.solid(tx + 1, ty);
    const wall = L.solid(tx, ty - 1) || L.solid(tx, ty - 2);
    const ground = b.blocked.down || b.touching.down;
    D.key('ArrowRight', true);
    D.apT = (D.apT || 0) - 1;
    if (ground && (gap || wall) && D.apT <= 0) { D.key('Space', true); D.apT = 12; D.jumpHeld = 7; D.boost = wall ? 12 : 0; }
    if (D.jumpHeld > 0 && --D.jumpHeld === 0) D.key('Space', false);
    if (D.boost > 0 && --D.boost === 0) { D.key('Space', true); D.jumpHeld = 6; }
  };
});

let frame = 0;
async function shoot(name, frames, cap, perFrame, opts = {}) {
  const fade = 12;
  for (let i = 0; i < frames; i++) {
    const a = !cap ? 0 : Math.min(1, Math.max(0, (i - (opts.capDelay ?? 8)) / fade), (frames - i) / fade);
    const data = await page.evaluate(([i, cap, a, big, fn]) => { const D = window.__D; if (fn) (0, eval)('(' + fn + ')')(i); D.step(); return D.grab(cap, a, big); }, [i, cap, a, !!opts.big, perFrame ? perFrame.toString() : null]);
    fs.writeFileSync(`${OUT}/f${String(frame++).padStart(4, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(name, 'done, frames', frame, errors.length ? errors : '');
}
const ev = (fn, arg) => page.evaluate(fn, arg);

// 1 · title over the painted vista
if (!ONLY || ONLY.includes('1')) {
  await ev(() => { const g = window.__game; const m = g.scene.getScene('Menu'); m.prompt?.setVisible(false); m.menu?.container?.setVisible(false); window.__D.bigTitle(); });
  await shoot('title', 100, null, (i) => { const m = window.__game.scene.getScene('Menu'); m.prompt?.setVisible(false); window.__D.bigTitle(); });
}
// 2 · forest run with Pip boost
if (!ONLY || ONLY.includes('2')) {
  await ev(() => { const D = window.__D; D.startLevel(1); const s = window.__BTH.scene; s.player.body.reset(28 * 32, s.player.y); D.step(10); });
  await shoot('forest', 120, 'Descend into the Hollow', () => window.__D.autopilot());
  await ev(() => window.__D.releaseAll());
}
// 3 · dark caverns: Pip's light, shooting
if (!ONLY || ONLY.includes('3')) {
  await ev(() => { const D = window.__D; D.startLevel(2); D.step(5); });
  await shoot('caverns', 105, "Pip's light holds back the dark", (i) => { const D = window.__D; D.autopilot(); if (i % 18 === 4) D.key('KeyX', true); if (i % 18 === 7) D.key('KeyX', false); });
  await ev(() => window.__D.releaseAll());
}
// 4 · temple blades
if (!ONLY || ONLY.includes('4')) {
  await ev(() => { const D = window.__D; D.startLevel(7); const s = window.__BTH.scene, pd = s.pendulums[1]; s.player.body.reset(pd.ax - 300, 19 * 32 - 1); pd.t = 0.3; D.step(5); });
  await shoot('temple', 105, 'Ancient ruins. Deadly machines.', (i) => { const D = window.__D; if (i > 20) D.autopilot(); });
  await ev(() => window.__D.releaseAll());
}
// 5 · Echo: present / past
if (!ONLY || ONLY.includes('5')) {
  await ev(() => { const D = window.__D; D.startLevel(9); D.step(5); });
  await shoot('echo', 120, 'Shift between present and past', (i) => { const D = window.__D; const s = window.__BTH.scene; if (i === 25 || i === 70) s.toggleEco(); if (i > 30) D.autopilot(); if (i % 10 === 0 && window.__DBG) console.log('ECO', i, JSON.stringify({ fl: s.cameras.main.flashEffect.isRunning, fa: s.cameras.main.flashEffect.alpha, fade: s.cameras.main.fadeEffect.isRunning, past: s.past, p: [Math.round(s.player.x), Math.round(s.player.y)], st: s.player.state, act: s.scene.isActive(), scenes: window.__game.scene.getScenes(true).map((x) => x.scene.key) })); });
  await ev(() => { const D = window.__D; D.releaseAll(); if (window.__BTH.scene.past) window.__BTH.scene.toggleEco(); });
}
// 6 · Light Thread
if (!ONLY || ONLY.includes('6')) {
  await ev(() => { const D = window.__D; D.startLevel(14); const s = window.__BTH.scene; const n = s.hooks[0]; s.player.body.reset(n.x - 60, n.y + 140); s.player.attach(n); D.step(3); });
  await shoot('thread', 120, 'Swing on threads of light', () => {
    const D = window.__D, s = window.__BTH.scene, p = s.player;
    D.key('ArrowRight', true);
    D.cd = (D.cd || 0) - 1;
    const vx = p.body.velocity.x, vy = p.body.velocity.y;
    if (p.state === 'swing' && p.anchor && p.x > p.anchor.x + 40 && vx > 150 && vy < -60 && D.cd <= 0) { D.key('Space', true); D.cd = 6; D.rel = 2; }
    else if (p.state === 'air' && vy > -100 && D.cd <= 0) { D.key('KeyF', true); D.cd = 6; D.rel = 2; }
    if (D.rel > 0 && --D.rel === 0) { D.key('Space', false); D.key('KeyF', false); }
  });
  await ev(() => window.__D.releaseAll());
}
// 7 · boss
if (!ONLY || ONLY.includes('7')) {
  await ev(() => {
    const D = window.__D; D.startLevel(4);
    const s = window.__BTH.scene, a = s.bossArena;
    s.player.body.reset(a[0] + 9 * 32, s.player.y);
    for (let i = 0; i < 300 && !(s.bossStarted && !s.cutscene); i++) D.step();
    D.hideUI();
    D.frame();
    const b = s.boss; s.player.body.reset(b.x - 330, s.player.y); s.player.facing = 1; s.player.setFlipX(false);
    b.attackCd = 99; b.setMode('roar'); D.step(2);
  });
  await shoot('boss', 135, 'Face the guardians of the deep', (i) => {
    const D = window.__D, s = window.__BTH.scene, b = s.boss, p = s.player;
    if (i === 55) { b.x = p.x + 260; b.body.reset(b.x, b.y); b.setMode('windup'); }
    if (i === 70) D.key('Space', true);
    if (i === 78) D.key('Space', false);
    if (b.mode === 'open' && i % 6 === 0) { p.facing = Math.sign(b.x - p.x) || 1; D.key('KeyX', true); }
    if (i % 6 === 3) D.key('KeyX', false);
  });
  await ev(() => window.__D.releaseAll());
}
// 8 · end card
if (!ONLY || ONLY.includes('8')) {
  await ev(() => { const D = window.__D, g = window.__game; ['Game', 'UI', 'BG'].forEach((k) => g.scene.isActive(k) && g.scene.stop(k)); g.scene.start('Menu'); D.step(40); const m = g.scene.getScene('Menu'); m.prompt?.setVisible(false); m.menu?.container?.setVisible(false); D.bigTitle(); });
  await shoot('end', 95, 'PLAY NOW', (i) => { const m = window.__game.scene.getScene('Menu'); m.prompt?.setVisible(false); m.menu?.container?.setVisible(false); window.__D.bigTitle(); }, { big: true, capDelay: 10 });
}
console.log('frames', frame, 'errors', errors);
await browser.close();
