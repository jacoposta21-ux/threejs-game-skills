// Frame-exact trailer capture: steps the real game at 30 fps with scripted shots and captions.
// usage: node trailer.mjs <landscape|portrait> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const mode = process.argv[2] ?? 'landscape';
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const size = mode === 'portrait' ? { width: 1080, height: 1620 } : { width: 1920, height: 1080 };
const FPS = 30;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:4188/');
await page.waitForFunction(() => window.__SHELL__, null, { timeout: 120000 });

// Director helpers live in the page.
await page.evaluate((portrait) => {
  const S = window.__SHELL__;
  const g = S.game;
  g.loop.stop();
  const css = document.createElement('style');
  css.textContent = `
    #hud > * { display: none !important; }
    #banner, #toasts, #objective, .world-prompt, #touch, #menus, #tip { display: none !important; }
    #trailer-cap { position: absolute; left: 50%; ${portrait ? 'top: 9%;' : 'bottom: 8%;'} transform: translateX(-50%) rotate(-1.5deg);
      padding: ${portrait ? '18px 30px' : '16px 34px'}; background: #2f2a52; color: #fff; border: 5px solid #241d38; border-radius: 22px;
      box-shadow: 0 8px 0 #241d38; font: 900 ${portrait ? 54 : 58}px "Inter Display", "Trebuchet MS", sans-serif; white-space: nowrap; z-index: 50; }
    #trailer-cap b { color: #ffe27a; }
    #trailer-cap.pop { animation: capPop .45s cubic-bezier(.2,1.6,.4,1); }
    @keyframes capPop { from { transform: translateX(-50%) rotate(-1.5deg) scale(.4); opacity: 0; } }
    .bubble { font-size: ${portrait ? 26 : 24}px !important; max-width: 340px !important; border-width: 4px !important; }
    .icon-mark { font-size: 34px !important; }`;
  document.head.appendChild(css);
  const cap = document.createElement('div');
  cap.id = 'trailer-cap';
  cap.style.display = 'none';
  document.querySelector('#app').appendChild(cap);
  const T = (window.__T = {});
  T.cap = (html) => {
    if (!html) { cap.style.display = 'none'; return; }
    cap.innerHTML = html;
    cap.style.display = 'block';
    cap.classList.remove('pop');
    void cap.offsetWidth;
    cap.classList.add('pop');
  };
  T.lock = (p, l, drift) => { T.locked = p ? [p, l] : null; T.lockDrift = drift ?? null; };
  T.state = (name, extraFlags = []) => {
    T.locked = null;
    window.__THREE_GAME_TEST_HOOKS__.setState(name);
    for (const h of ['strongman', 'police', 'clown', 'chef', 'thief', 'singer', 'ghost', 'scientist', 'mayor']) g.progress.discovered.add(h);
    for (const f of extraFlags) g.progress.set(f);
    for (const o of g.objects) o.init(g);
    for (const n of g.npcs) n.syncFlags(g);
    g.hud.show(true);
    g.hud.clearTransient();
  };
  T.host = (kind, x, z, yaw, y = 0) => {
    if (g.controlled !== g.glim) g.exitHost(true);
    const h = g.hostChars.get(kind);
    h.place(x, y, z, yaw);
    const n = g.npcById.get(h.id);
    n.home.set(x, y, z);
    g.glim.model.root.visible = false;
    g.glim.active = false;
    h.possessed = true;
    h.model.setPossessed(true);
    g.controlled = h;
    g.cam.heightOffset = Math.max(1, h.model.height * 0.75);
    g.cam.snap(h.pos);
  };
  T.glim = (x, z, yaw) => {
    if (g.controlled !== g.glim) g.exitHost(true);
    g.glim.place(x, 0, z, yaw);
    g.glim.model.root.visible = true;
    g.glim.active = true;
    g.cam.heightOffset = 1.0;
    g.cam.snap(g.glim.pos);
  };
  T.cam = (yaw, pitch, dist) => {
    g.cam.yaw = yaw;
    g.cam.pitch = pitch;
    g.cam.targetDistance = dist;
    g.cam.distance = dist;
    g.cam.snap(g.controlled.pos);
  };
  T.face = (x, z) => S.lookAt(x, z);
  T.key = (code, down) => S.key(code, down);
  T.press = (w) => (g.input.intent[w] = true);
  T.step = (dt, camDrift) => {
    if (camDrift) {
      g.cam.yaw += camDrift.yaw ?? 0;
      g.cam.pitch += camDrift.pitch ?? 0;
      g.cam.targetDistance += camDrift.dist ?? 0;
    }
    g.update(dt);
    if (T.locked) {
      const [p, l] = T.locked;
      g.camera.position.set(p[0], p[1], p[2]);
      g.camera.lookAt(l[0], l[1], l[2]);
      if (T.lockDrift) { p[0] += T.lockDrift[0]; p[1] += T.lockDrift[1]; p[2] += T.lockDrift[2]; }
    }
    g.render();
  };
}, mode === 'portrait');

let frame = 0;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
let cur = '';
const at = (name) => { cur = name; return !ONLY || ONLY.includes(name); };
async function shot(frames, perFrame) {
  if (ONLY && !ONLY.includes(cur)) { frame += frames; return; }
  for (let i = 0; i < frames; i += 1) {
    await page.evaluate(perFrame ? perFrame : () => undefined, i);
    await page.evaluate(([i]) => window.__T.step(1 / 30, window.__drift), [i]);
    await page.screenshot({ path: `${out}/f${String(frame).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    frame += 1;
  }
}
const drift = (d) => page.evaluate((d) => (window.__drift = d), d);
const ev = (fn, arg) => page.evaluate(fn, arg);
const wide = mode === 'portrait' ? 1.25 : 1;

at('A');
// ---- A (0-3.5s): crash site
await ev(() => {
  const T = window.__T;
  T.state('active-play');
  T.glim(-7.5, 51, -Math.PI / 2);
  T.cam(Math.PI * 0.35, 0.28, 5.2);
  T.cap('A tiny alien <b>crash-lands</b>...');
  window.__SHELL__.game.say(window.__SHELL__.game.glim, 'Blorp?! My saucer!', true);
});
await drift({ yaw: -0.006, dist: -0.005 });
await shot(105);

at('B');
// ---- B (3.5-7.5s): possess Brick
await ev((w) => {
  const T = window.__T;
  const g = window.__SHELL__.game;
  T.glim(0.6, 49.3, Math.PI / 2);
  const b = g.hostChars.get('strongman');
  b.place(2.6, 0, 49.2, -Math.PI / 2);
  g.npcById.get(b.id).home.set(2.6, 0, 49.2);
  T.cam(-0.2, 0.22, 5.5 * w);
  T.cap('...and <b>hops inside</b> anyone!');
}, wide);
await drift({ yaw: 0.004 });
await shot(120, (i) => {
  const g = window.__SHELL__.game;
  if (i === 14) g.startPossess(g.hostChars.get('strongman'));
  if (i === 60) g.say(g.controlled, 'I feel... roomy.', true);
});

at('C');
// ---- C (7.5-11s): Brick lifts the trunk
await ev((w) => {
  const T = window.__T;
  const g = window.__SHELL__.game;
  T.state('active-play');
  T.host('strongman', 0, 47.35, Math.PI);
  T.lock([4.6, 3.2, 47 + 7.5 * w], [0, 1.5, 48.5], [0, 0, -0.01]);
  T.cap('Borrow their <b>talents</b>');
}, wide);
await drift({ yaw: 0.003 });
await shot(105, (i) => {
  const g = window.__SHELL__.game;
  if (i === 6) g.objById.get('trunk').useF(g);
  if (i === 22) window.__T.face(1, 55);
  if (i === 52) window.__T.press('ability');
});

at('D');
// ---- D (11-14.5s): clown show
await ev((w) => {
  const T = window.__T;
  T.state('circus');
  T.host('clown', 32.6, 0.2, -Math.PI / 2);
  T.cam(-Math.PI / 2 + 0.5, 0.3, 7 * w);
  T.cap('Distract a <b>crowd</b>');
}, wide);
await drift({ yaw: -0.004 });
await shot(105, (i) => { if (i === 4) window.__T.press('ability'); });

at('E');
// ---- E (14.5-17.5s): Velvet sings
await ev((w) => {
  const T = window.__T;
  const g = window.__SHELL__.game;
  T.state('mall', ['velvetMic']);
  T.host('singer', -35, -3, Math.PI);
  T.cam(Math.PI * 0.15, 0.32, 7 * w);
  T.cap('Charm the <b>whole town</b>');
}, wide);
await drift({ yaw: 0.004 });
await shot(90, (i) => {
  if (i === 2) window.__T.press('ability');
  if (i === 40) { window.__T.face(-42, -8); window.__T.key('KeyW', true); }
  if (i === 89) window.__T.key('KeyW', false);
});

at('F');
// ---- F (17.5-20.5s): ghost through bars (fixed side camera)
await ev((w) => {
  const T = window.__T;
  T.state('museum', ['power']);
  T.host('ghost', -36, -52.5, -Math.PI / 2);
  T.lock([-35.5 + (w - 1) * 6, 2.6, -47.5 + (w - 1) * 4], [-43, 1.3, -53.5], [-0.012, 0, -0.006]);
  T.cap('Walk <b>through walls</b>');
}, wide);
await drift(null);
await shot(90, (i) => {
  if (i === 3) window.__T.press('ability');
  if (i === 8) { window.__T.face(-48, -52.5); window.__T.key('KeyW', true); }
  if (i === 89) window.__T.key('KeyW', false);
});

at('G');
// ---- G (20.5-23.5s): cannon launch (fixed camera inside the big top)
await ev((w) => {
  const T = window.__T;
  const g = window.__SHELL__.game;
  T.state('circus', ['bigTopOpen', 'cannonFuse', 'door:bigtop-flap']);
  const c = g.objById.get('cannon');
  c.aim = 2;
  g.progress.values['aim:cannon'] = 2;
  c.init(g);
  T.glim(40.2, 4.2, 0.8);
  T.lock([45, 4, w > 1 ? 9.6 : 10], [w > 1 ? 46.6 : 47, 5.2, -0.5], [0, 0.004, -0.01]);
  T.cap('Fly by <b>cannon</b>!');
}, wide);
await shot(90, (i) => { const g = window.__SHELL__.game; if (i === 8) g.objById.get('cannon').useE(g); });

at('H');
// ---- H (23.5-27s): Mayor's holiday
await ev((w) => {
  const T = window.__T;
  T.state('cityhall');
  T.host('mayor', 0, -49.2, Math.PI);
  T.cam(Math.PI - 0.4, 0.36, 8 * w);
  T.cap('Cause <b>total chaos</b>');
}, wide);
await drift({ yaw: 0.003 });
await shot(105, (i) => { if (i === 6) window.__T.press('ability'); });

console.log('frames', frame, 'errors', errs.join(' | ') || 'none');
await browser.close();
