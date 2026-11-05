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
  // hide the UI controls right before every render (the UI's own update shows some of them again)
  g.events.on('prerender', () => { if (D.hiding && g.scene.isActive('UI')) D.hideUI(); });
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
  // keep the UI layer's colour grading (the warm past, the vignette) but hide every control and readout
  D.hideUI = () => {
    const ui = g.scene.getScene('UI');
    if (!ui || !ui.children) return;
    ui.cameras.main.setVisible(true);
    for (const o of ui.children.list) o.setVisible(o === ui.warm ? ui.warm.fillAlpha > 0 : o === ui.vignette);
  };
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
    D.hiding = true;
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
    const data = await page.evaluate(([i, cap, a, big, fn]) => { const D = window.__D; if (fn) (0, eval)('(' + fn + ')')(i); D.step(); if (window.__game.scene.isActive('UI')) D.hideUI(); return D.grab(cap, a, big); }, [i, cap, a, !!opts.big, perFrame ? perFrame.toString() : null]);
    fs.writeFileSync(`${OUT}/f${String(frame++).padStart(4, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(name, 'done, frames', frame, errors.length ? errors : '');
}
const ev = (fn, arg) => page.evaluate(fn, arg);


const T = 75, M = 90; // frames per shot (2.5 s / 3 s)
// 1 · title over the painted vista
if (!ONLY || ONLY.includes('a')) {
  await ev(() => { const g = window.__game; const m = g.scene.getScene('Menu'); m.prompt?.setVisible(false); m.menu?.container?.setVisible(false); window.__D.bigTitle(); });
  await shoot('title', T, null, () => { const m = window.__game.scene.getScene('Menu'); m.prompt?.setVisible(false); window.__D.bigTitle(); });
}
// 2 · mushroom forest: run onto a glowing cap and bounce high
if (!ONLY || ONLY.includes('b')) {
  await ev(() => { const D = window.__D; D.startLevel(1); const s = window.__BTH.scene; s.player.body.reset(48 * 32, 19 * 32 - 1); D.step(4); });
  await shoot('forest', T, 'Descend into the Hollow', () => window.__D.key('ArrowRight', true));
  await ev(() => window.__D.releaseAll());
}
// 3 · hanging gardens
if (!ONLY || ONLY.includes('c')) {
  await ev(() => { const D = window.__D; D.startLevel(10); const s = window.__BTH.scene; s.player.body.reset(8 * 32, 19 * 32 - 1); D.step(4); });
  await shoot('gardens', T, 'A world that glows in the dark', () => window.__D.autopilot());
  await ev(() => window.__D.releaseAll());
}
// 4 · underground ocean: swim between the lights
if (!ONLY || ONLY.includes('d')) {
  await ev(() => {
    const D = window.__D; D.startLevel(3); const s = window.__BTH.scene, L = s.level;
    // deepest water column a bit into the level
    let best = null;
    for (let x = 60; x < L.W - 20 && !best; x++) { let d = 0; for (let y = 2; y < L.H; y++) if (L.isWater(x, y)) d++; if (d >= 4) best = x; }
    let wy = 2; while (!L.isWater(best, wy)) wy++;
    s.player.body.reset(best * 32, (wy + 2) * 32);
    D.step(6);
  });
  await shoot('ocean', M, 'Explore a living underworld', (i) => { const D = window.__D; D.key('ArrowRight', true); D.key('Space', i % 22 < 6); });
  await ev(() => window.__D.releaseAll());
}
// 5 · sea of sap: swing node to node over the golden sap
if (!ONLY || ONLY.includes('e')) {
  await ev(() => { const D = window.__D; D.startLevel(15); const s = window.__BTH.scene; const n = s.hooks.slice().sort((a, b) => a.x - b.x)[1]; s.player.body.reset(n.x - 80, n.y + 150); s.player.attach(n); D.step(3); });
  await shoot('sap', M, 'Swing on threads of light', () => {
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
// 6 · the Keepers' quarter in the golden past
if (!ONLY || ONLY.includes('f')) {
  await ev(() => { const D = window.__D; D.startLevel(11); const s = window.__BTH.scene; s.player.body.reset(30 * 32, 19 * 32 - 1); D.step(4); });
  await shoot('past', M, 'Walk through the past', (i) => { const D = window.__D, s = window.__BTH.scene; if (i === 14 && !s.past) s.toggleEco(); if (i > 4) D.autopilot(); });
  await ev(() => { const D = window.__D; D.releaseAll(); const s = window.__BTH.scene; if (s.past) s.toggleEco(); });
}
// 7 · sanctuary: Ilse opens the Keeper door while the shades come
if (!ONLY || ONLY.includes('g')) {
  await ev(() => {
    const D = window.__D; D.startLevel(17); const s = window.__BTH.scene;
    const door = s.doors.find((d) => d.ritual);
    s.player.body.reset(door.s.x - 170, 19 * 32 - 1); s.player.facing = 1; s.player.setFlipX(false);
    s.ilse.body.reset(door.s.x - 60, 19 * 32 - 1);
    D.step(30);
    for (const e of s.enemies) if (e.alive && e.kind !== 'boss') { e.x = door.s.x + 260 + Math.random() * 120; e.body.reset(e.x, 18 * 32); }
  });
  await shoot('ritual', M, 'Protect your mother', (i) => { const D = window.__D, s = window.__BTH.scene; s.ilse && (s.ilse.invuln = 1); if (i % 10 === 2) D.key('KeyX', true); if (i % 10 === 5) D.key('KeyX', false); });
  await ev(() => window.__D.releaseAll());
}
// 8 · the Ancient Sentinel: laser columns, then the dive
if (!ONLY || ONLY.includes('h')) {
  await ev(() => {
    const D = window.__D; D.startLevel(8);
    const s = window.__BTH.scene, a = s.bossArena;
    s.player.body.reset(a[0] + 9 * 32, s.player.y);
    for (let i = 0; i < 300 && !(s.bossStarted && !s.cutscene); i++) D.step();
    D.hideUI(); D.frame();
    s.player.body.reset((a[0] + a[1]) / 2 - 200, s.player.y);
    s.boss.setMode('laser'); D.step(2);
  });
  await shoot('sentinel', M, 'Face ancient guardians', (i) => {
    const D = window.__D, s = window.__BTH.scene, b = s.boss, p = s.player;
    if (i === 50) b.setMode('dive');
    D.key('ArrowRight', i % 40 < 14); D.key('ArrowLeft', i % 40 >= 20 && i % 40 < 32);
    if (b.mode === 'stuck' && i % 6 === 0) { p.facing = Math.sign(b.x - p.x) || 1; D.key('KeyX', true); }
    if (i % 6 === 3) D.key('KeyX', false);
  });
  await ev(() => window.__D.releaseAll());
}
// 9 · the Heart of Shadow: Ilse holds the core open, Elias strikes
if (!ONLY || ONLY.includes('i')) {
  await ev(() => {
    const D = window.__D; D.startLevel(18);
    const s = window.__BTH.scene, a = s.bossArena;
    s.player.body.reset(a[0] + 9 * 32, s.player.y);
    for (let i = 0; i < 300 && !(s.bossStarted && !s.cutscene); i++) D.step();
    D.hideUI(); D.frame();
    const b = s.boss;
    s.hooks.forEach((h) => h.setDark(false));
    b.phase = 3; b.mode = 'p3pip'; b.hp = Math.floor(b.maxHp * 0.25);
    s.pipControl = true; s.endPipControl();
    s.ilse.body.reset(b.x - 90, s.level.heightPx - 5 * 32 - 1);
    D.step(20);
    s.player.body.reset(b.x - (window.__game.scale.height > window.__game.scale.width ? 150 : 260), s.player.y); s.player.facing = 1;
  });
  await shoot('heart', M, 'Free the Seed', (i) => {
    const D = window.__D, s = window.__BTH.scene, b = s.boss, p = s.player;
    if (b && b.alive) b.hp = Math.max(b.hp, 6);
    D.key('ArrowUp', true);
    if (i % 7 === 0) { p.facing = 1; D.key('KeyX', true); }
    if (i % 7 === 3) D.key('KeyX', false);
  });
  await ev(() => window.__D.releaseAll());
}
// 10 · dawn: Elias and Ilse climb out onto Hollow Ridge
if (!ONLY || ONLY.includes('j')) {
  await ev(() => {
    const D = window.__D, g = window.__game;
    ['Game', 'UI', 'BG'].forEach((k) => g.scene.isActive(k) && g.scene.stop(k));
    g.scene.start('Ending', { chapter: 4, next: -1 });
    D.step(80);
  });
  await shoot('dawn', T, null, () => {});
}
// 11 · end card
if (!ONLY || ONLY.includes('k')) {
  await ev(() => { const D = window.__D, g = window.__game; ['Ending', 'Game', 'UI', 'BG'].forEach((k) => g.scene.isActive(k) && g.scene.stop(k)); g.scene.start('Menu'); D.step(40); const m = g.scene.getScene('Menu'); m.prompt?.setVisible(false); m.menu?.container?.setVisible(false); D.bigTitle(); });
  await shoot('end', 60, 'PLAY NOW', () => { const m = window.__game.scene.getScene('Menu'); m.prompt?.setVisible(false); m.menu?.container?.setVisible(false); window.__D.bigTitle(); }, { big: true, capDelay: 6 });
}
console.log('frames', frame, 'errors', errors);
await browser.close();
