// Renders the trailer frame by frame from the real game (scripted scenes, fixed 30 fps),
// so the result is smooth whatever the capture machine's frame rate.
// node tools/trailer/make-trailer.mjs <outDir> <landscape|portrait> [baseUrl] [sceneFilter] [maxFrames]
// Then tools/trailer/encode.sh joins the frames and the soundtrack.
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2];
const mode = process.argv[3] ?? 'landscape';
const base = process.argv[4] ?? 'http://127.0.0.1:5188/?qa=1';
const only = process.argv[5] && process.argv[5] !== 'all' ? process.argv[5].split(',') : null;
const maxFrames = Number(process.argv[6] ?? 0);
const portrait = mode === 'portrait';
const SCALE = Number(process.env.TR_SCALE ?? 1);
const STRIDE = Number(process.env.TR_STRIDE ?? 1); // preview: keep every Nth frame
const W = Math.round((portrait ? 720 : 1280) * SCALE);
const H = Math.round((portrait ? 1280 : 720) * SCALE);
const FPS = 30;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 180000 });

// Stage: no HUD, a caption layer in the game's own type.
await page.addStyleTag({ content: `
  #hud, #touch-controls, #vignette, .screen { display: none !important; }
  #tr-cap { position: absolute; left: 0; right: 0; bottom: ${portrait ? '13%' : '9%'}; padding: 0 5vw; pointer-events: none; z-index: 50;
    font-family: 'Anton', Impact, sans-serif; font-style: italic; color: #f4f1e8; font-size: ${portrait ? '11.5vw' : '5.4vw'}; line-height: 1.02;
    letter-spacing: 0.02em; text-shadow: 0 0.06em 0 #141414, 0 0 0.5em rgba(0,0,0,0.55); -webkit-text-stroke: 0.035em #141414; text-transform: uppercase; }
  #tr-cap b { color: #f6c915; font-weight: 400; }
  #tr-cap small { display: block; margin-top: 0.35em; font-family: 'Barlow Condensed', sans-serif; font-style: normal; font-weight: 800; font-size: 0.36em; letter-spacing: 0.12em; -webkit-text-stroke: 0; color: #f4f1e8; }
  #tr-title { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; z-index: 51; background: radial-gradient(ellipse at 50% 50%, rgba(10,10,10,0.25), rgba(10,10,10,0.72)); }
  #tr-title .logo { transform: rotate(-4deg) scale(${((portrait ? 1.15 : 1.7) * W) / (portrait ? 720 : 1280)}); }
  #tr-title p { position: absolute; left: 0; right: 0; bottom: ${portrait ? '22%' : '14%'}; margin: 0; text-align: center; font-family: 'Anton', sans-serif; font-size: ${portrait ? '8vw' : '3.6vw'}; letter-spacing: 0.08em; color: #141414; }
  #tr-title p span { background: #f6c915; padding: 0.1em 0.6em; }
  #tr-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 52; }
` });
await page.evaluate((q) => { window.__TRQ = q; }, process.env.TR_QUALITY ?? 'medium');
await page.evaluate(() => {
  const app = document.getElementById('app');
  app.insertAdjacentHTML('beforeend', '<div id="tr-cap"></div><div id="tr-title" style="opacity:0"><div class="logo"><span class="rua">RUA</span><span class="ten">10</span><small>STREET FOOTBALL</small></div><p><span></span></p></div><div id="tr-flash"></div>');
  const g = window.__RUA10__;
  g.skipReplays = true;
  g.setSetting('quality', window.__TRQ);
  // Scene helpers live on window so each step can call them.
  const h = window.__THREE_GAME_TEST_HOOKS__;
  const T = (window.__TR = { g, h, cam: null, t: 0 });
  T.force = (obj, v) => {
    const r = obj.rng;
    const f = () => v;
    f.gauss = () => 0;
    f.range = (a, b) => a + (b - a) * 0.5;
    f.pick = r.pick;
    obj.rng = f;
    return () => { obj.rng = r; };
  };
  T.begin = (court, away = null) => {
    g.choice.court = court;
    h.setState('active-play');
    h.setPausedForScreenshot(true);
    g.hud.hideBanner();
    for (const c of g.match.allOutfield()) { c.reset(); c.frozen = false; }
    T.cam = null;
    T.t = 0;
    T.script = [];
  };
  T.at = (time, fn) => T.script.push([time, fn, false]);
  T.step = (dt, intents) => {
    for (const s of T.script) if (!s[2] && T.t >= s[0]) { s[2] = true; s[1](); }
    const it = typeof intents === 'function' ? intents(T.t) : intents;
    h.simulate(dt, it ?? {});
    T.t += dt;
    if (T.cam) {
      T.cam(g.camera, T.t);
      g.camera.updateProjectionMatrix();
    }
    g.render();
  };
  // Stick input that moves toward a world direction whatever the camera yaw is.
  T.toward = (wx, wz, extra = {}) => {
    const y = g.cameraRig.yaw;
    const n = Math.hypot(wx, wz) || 1;
    return { moveX: (-Math.cos(y) * wx + Math.sin(y) * wz) / n, moveY: (Math.sin(y) * wx + Math.cos(y) * wz) / n, ...extra };
  };
  T.look = (cam, px, py, pz, lx, ly, lz, fov) => { cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz); cam.fov = fov; };
});

const P = portrait ? 1.45 : 1; // wider lens for hand-placed cameras in portrait

/** Scenes: setup runs in the page; frames = length; cap = caption html; title = full-screen title text. */
const scenes = [
  {
    id: 'open', frames: 84, title: 'STREET FOOTBALL', cap: '',
    setup: (P) => {
      const T = window.__TR; const g = T.g;
      T.begin('brazil');
      T.intents = (t) => T.toward(-1, Math.sin(t * 1.3) * 0.5);
      T.cam = (cam, t) => { const a = 0.9 + t * 0.22; T.look(cam, Math.sin(a) * 15, 7.5, -Math.cos(a) * 19, 0, 1, 0, 40 * P); };
    },
  },
  {
    id: 'skills', frames: 118, cap: 'Real <b>skill moves</b><small>ELASTICO · ROULETTE · STEPOVER</small>',
    setup: (P) => {
      const T = window.__TR; const g = T.g; const hk = g.human;
      T.begin('brazil');
      g.place('home', [[3, 0.4, -Math.PI / 2], [-6, 6], [9, -6]]);
      g.place('away', [[-0.2, 0.2, Math.PI / 2], [10, 6], [12, -5]]);
      const def = g.match.teams.away.players[0];
      for (const c of g.match.allOutfield()) if (c !== hk && c !== def) c.frozen = true;
      g.ball.placeAt(2.5, 0.11, 0.4);
      const un = T.force(hk, 0.99);
      T.intents = (t) => (hk.trick ? {} : T.toward(-1, t > 2.4 ? 0.6 : 0, { sprint: t > 3.2 }));
      T.script = [];
      T.at(0.0, () => { def.tackleCooldown = 9; });
      T.at(0.55, () => { hk.trickCooldown = 0; hk.requestTrick('elastico', 1); });
      T.at(1.55, () => { def.tackleCooldown = 9; hk.trickCooldown = 0; hk.lastTrickKind = null; hk.requestTrick('roulette', -1); });
      T.at(2.9, () => { hk.trickCooldown = 0; hk.lastTrickKind = null; hk.requestTrick('stepover', 1); });
      T.at(3.9, un);
      T.cam = (cam, t) => { const p = hk.p.holder.position; const a = -0.5 + t * 0.16; T.look(cam, p.x - Math.sin(a) * 2.2 - 3.6, 1.25, p.z - 4.6, p.x - 0.5, 0.8, p.z, 36 * P); };
    },
  },
  {
    id: 'tokyo', frames: 84, cap: 'Beat your man<small>NUTMEGS · SOMBREROS · COMBOS</small>',
    setup: (P) => {
      const T = window.__TR; const g = T.g; const hk = g.human;
      T.begin('tokyo');
      g.place('home', [[2, 0, -Math.PI / 2], [-4, 5], [8, -6]]);
      g.place('away', [[-1.6, 0, Math.PI / 2], [-9, 4], [-8, -5]]);
      const def = g.match.teams.away.players[0];
      def.frozen = true;
      g.ball.placeAt(1.5, 0.11, 0);
      const un = T.force(hk, 0.99);
      T.intents = (t) => (hk.trick ? {} : T.toward(-1, 0, { sprint: t > 1.5 }));
      T.at(0.5, () => { hk.trickCooldown = 0; hk.requestTrick('sombrero', 1); });
      T.at(2.6, un);
      T.cam = (cam, t) => { const p = hk.p.holder.position; T.look(cam, p.x + 4.2 - t * 0.5, 1.5 + t * 0.2, p.z - 5.2, p.x - 1.2, 1.1, p.z, 40 * P); };
    },
  },
  {
    id: 'bicycle', frames: 60, cap: '<b>Bicycle kicks</b><small>VOLLEYS · LOBS · THROUGH BALLS</small>', flashAt: 22,
    setup: (P) => {
      const T = window.__TR; const g = T.g; const hk = g.human;
      T.begin('newyork');
      for (const c of g.match.allOutfield()) if (c !== hk) c.frozen = true;
      g.place('away', [[-2, 6], [4, 6], [6, -6]]);
      g.place('home', [[-8.5, 0.3, Math.PI / 2], [-3, -5], [2, 5]]);
      const keeper = g.match.teams.away.keeper;
      keeper.k.teleport(keeper.homeX, 1.3, Math.PI / 2);
      T.force(keeper, 0.99);
      g.ball.placeAt(-8.3, 3.6, 0.35);
      g.ball.body.setLinvel({ x: 0, y: 1.2, z: 0 }, true);
      T.intents = (t) => (t > 0.3 && t < 0.4 ? { shootPressed: true, shootHeld: true } : {});
      T.cam = (cam, t) => { T.look(cam, -5.2 + t * 0.25, 1.0, -3.6, -9.6, 1.4, 0.3, 44 * P); };
    },
  },
  {
    id: 'save', frames: 70, cap: 'Keepers that <b>fight back</b>',
    setup: (P) => {
      const T = window.__TR; const g = T.g; const hk = g.human;
      T.begin('london');
      for (const c of g.match.allOutfield()) if (c !== hk) c.frozen = true;
      g.place('away', [[2, 6], [4, 6], [6, -6]]);
      g.place('home', [[-6.5, -1.5, -Math.PI / 2], [-3, -6], [2, 5]]);
      g.ball.placeAt(-7.0, 0.11, -1.5);
      const keeper = g.match.teams.away.keeper;
      keeper.difficulty = 'hard';
      T.force(keeper, 0.02);
      T.force(hk, 0.5);
      T.at(0.35, () => hk.requestKick('shot', 0.7, { aimZ: 1.25 }));
      T.intents = () => ({});
      T.cam = (cam, t) => { T.look(cam, -11.2, 1.3, -4.4 + t * 0.3, -14.6, 1.0, 0.7, 46 * P); };
    },
  },
  {
    id: 'goal', frames: 132, cap: '5 courts · 6 teams<small>TOURNAMENT · FIRST TO 5 · STYLE CHALLENGE · 1 V 1</small>', flashAt: 40,
    setup: (P) => {
      const T = window.__TR; const g = T.g; const hk = g.human;
      T.begin('barcelona');
      g.place('home', [[-5, 1.2, -Math.PI / 2], [-2, -5], [3, 5]]);
      g.place('away', [[-1, 5], [1, -6], [5, 2]]);
      for (const c of g.match.teams.away.players) c.frozen = true;
      g.ball.placeAt(-5.5, 0.11, 1.2);
      const keeper = g.match.teams.away.keeper;
      T.force(keeper, 0.99);
      T.force(hk, 0.5);
      T.intents = (t) => (g.phase === 'playing' && t < 0.9 ? T.toward(-1, -0.1, { sprint: true }) : {});
      T.at(0.75, () => hk.requestKick('shot', 0.9, { aimZ: -1.2 }));
      // Gameplay camera into the game's own goal camera.
    },
  },
  {
    id: 'end', frames: 84, title: 'PLAY NOW', cap: '',
    setup: (P) => {
      const T = window.__TR; const g = T.g;
      T.begin('brazil');
      T.intents = (t) => T.toward(-1, Math.cos(t) * 0.6);
      T.cam = (cam, t) => { const a = 2.4 + t * 0.2; T.look(cam, Math.sin(a) * 13, 5.5, -Math.cos(a) * 17, 0, 1.2, 0, 42 * P); };
    },
  },
];

const ease = (x) => Math.max(0, Math.min(1, x));
let n = 0;
const marks = [];
for (const sc of scenes) {
  if (only && !only.includes(sc.id)) continue;
  await page.evaluate(`(${sc.setup.toString()})(${P})`);
  marks.push({ id: sc.id, frame: n, time: +(n / FPS).toFixed(2) });
  const t0 = Date.now();
  for (let f = 0; f < sc.frames; f += 1) {
    if (maxFrames && f >= maxFrames) break;
    const inK = ease(f / 8);
    const outK = ease((sc.frames - 1 - f) / 8);
    const k = Math.min(inK, outK);
    await page.evaluate(([cap, title, k, slide, flash]) => {
      const T = window.__TR;
      T.step(1 / 30, T.intents);
      const c = document.getElementById('tr-cap');
      if (c.dataset.html !== cap) { c.innerHTML = cap; c.dataset.html = cap; }
      c.style.opacity = k;
      c.style.transform = `translateX(${slide}vw) skewX(-4deg)`;
      const t = document.getElementById('tr-title');
      t.style.opacity = title ? k : 0;
      if (title) t.querySelector('p span').textContent = title;
      document.getElementById('tr-flash').style.opacity = flash;
    }, [sc.cap, sc.title ?? '', k, (1 - inK) * -6, sc.flashAt != null && f >= sc.flashAt && f < sc.flashAt + 5 ? 0.7 * (1 - (f - sc.flashAt) / 5) : 0]);
    if (f % STRIDE === 0) {
      await page.screenshot({ path: `${out}/f${String(n).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
      n += 1;
    }
  }
  console.log(sc.id, 'frames', sc.frames, 'ms/frame', Math.round((Date.now() - t0) / Math.max(1, Math.min(sc.frames, maxFrames || sc.frames))));
}
fs.writeFileSync(`${out}/marks.json`, JSON.stringify({ fps: FPS, frames: n, marks }, null, 1));
console.log('total frames', n, 'errors', JSON.stringify(errors.slice(0, 3)));
await browser.close();
