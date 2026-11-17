/**
 * Gameplay trailer renderer (landscape 1920x1080 or portrait 1080x1920).
 *
 * The game is driven frame by frame at a fixed 30 fps: the real-time loop is
 * stopped, each video frame advances the simulation by 1/30 s (two 60 Hz
 * steps) with scripted player intents, renders, and is captured. So the
 * result is smooth even on a slow software renderer. Frames are encoded with
 * ffmpeg (H.264, yuv420p, no audio).
 *
 * Usage: node tests/trailer.mjs <landscape|portrait> [url] [outDir]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2] === 'portrait' ? 'portrait' : 'landscape';
const url = process.argv[3] || 'http://127.0.0.1:4188/';
const outDir = process.argv[4] || 'artifacts/trailer';
const FPS = 30;
const size = mode === 'portrait' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const frameDir = path.join(outDir, `frames-${mode}`);
fs.rmSync(frameDir, { recursive: true, force: true });
fs.mkdirSync(frameDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForSelector('#menu:not([hidden])', { timeout: 180000 });

// ---- page-side director: scripted shots, a fixed-step frame driver, the end card
await page.evaluate(({ portrait }) => {
  const S = window.__JESUS_SIM__.session;
  const H = window.__THREE_GAME_TEST_HOOKS__;
  const th = window.__JESUS_SIM__.terrainHeight;
  S.loop.stop();
  S.monitorPerformance = () => {}; // capture runs far below real time: never auto-downgrade
  S.settings.quality = 'high';
  S.applyQuality('high');
  S.suppressLockPause = true;
  const idle = () => ({ moveX: 0, moveY: 0, sprint: false, jump: false, jumpHeld: false, interact: false, vehicle: false, map: false, primary: false, cast: false, castHeld: false, aim: false, slot: null, lookX: 0, lookY: 0, zoom: 0, command: false });
  let intent = idle();
  S.input.read = () => ({ ...intent });
  let t = 100;
  const tr = {};
  window.__TR = tr;
  const far = (k) => (portrait ? k * 1.35 : k);

  /** Advance 1/30 s with the given intent (two fixed steps, two visual updates), then render. */
  tr.frame = (want = {}, camFn = null) => {
    intent = { ...idle(), ...want };
    for (let k = 0; k < 2; k += 1) {
      S.pausedForScreenshot = false;
      S.intent = { ...intent };
      S.fixedUpdate(1 / 60);
      t += 1 / 60;
      S.update(1 / 60, 1, t);
      intent = { ...intent, cast: false, interact: false, vehicle: false, slot: null, jump: false };
    }
    S.pausedForScreenshot = true;
    if (camFn) camFn(S.camera, S);
    S.world.update(0, t, S.camera.position, S.camera.far);
    S.dayCycle.apply(S.clock, S.camera.position, S.camera.far);
    S.ui.updateBubbles(S.allBubbles(), S.camera, S.renderer.domElement.clientWidth, S.renderer.domElement.clientHeight);
    S.render();
  };
  const orbit = (target, dist, height, yaw) => (cam) => {
    cam.position.set(target.x + Math.sin(yaw) * dist, target.y + height, target.z + Math.cos(yaw) * dist);
    cam.lookAt(target.x, target.y + 1.2, target.z);
  };
  const behind = (cam, Sx, back, up, side = 0) => {
    const p = Sx.model.group.position;
    const y = Sx.playerState.yaw;
    cam.position.set(p.x - Math.sin(y) * back + Math.cos(y) * side, p.y + up, p.z - Math.cos(y) * back - Math.sin(y) * side);
    cam.lookAt(p.x + Math.sin(y) * 4, p.y + 1.4, p.z + Math.cos(y) * 4);
  };
  const clearHud = () => { for (const id of ['toasts', 'banner']) { const el = document.getElementById(id); if (el) el.innerHTML = el.id === 'toasts' ? '' : el.innerHTML; } document.getElementById('banner').hidden = true; };

  // ---- shots: { setup(), step(i, n) -> [intent, camFn] }
  tr.shots = {
    village: {
      setup() {
        H.setState('active-play');
        H.hideDebugUi(true);
        S.romans.setActive(false);
        S.clock = 0.16;
        S.player.teleport(-9, 0, 4, 1.75);
        S.cam.yaw = 1.75 + Math.PI;
        for (let i = 0; i < 40; i += 1) S.fixedUpdate(1 / 60);
        clearHud();
      },
      step(i, n) {
        const u = i / n;
        return [{ moveY: 1 }, (cam, Sx) => {
          const p = Sx.model.group.position;
          const yaw = 1.75 + 0.5 - u * 0.9; // in front of him, sweeping across as he walks into the square
          cam.position.set(p.x + Math.sin(yaw) * far(7.5), p.y + far(2.8), p.z + Math.cos(yaw) * far(7.5));
          cam.lookAt(p.x, p.y + 1.5, p.z);
        }];
      },
    },
    push: {
      setup() {
        H.setState('active-play');
        H.hideDebugUi(true);
        S.unlockAllForTest();
        S.romans.setActive(true);
        S.clock = 0.2;
        for (const n of S.npcs.npcs) if (Math.hypot(n.pos.x - 3, n.pos.z - 6) < 8) { S.npcs.leaveAnchor(n, true); S.npcs.place(n, -40, 1.2, 30); }
        const ids = ['roman.flavius', 'roman.quintus', 'roman.brutus'];
        ids.forEach((id, k) => { const s = S.romans.byId.get(id); S.romans.place(s, 1.6 + k * 1.4, th(1.6 + k * 1.4, 4.6 - (k % 2) * 0.8), 4.6 - (k % 2) * 0.8); S.romans.setMode(s, 'duty', { force: true }); s.post = { x: s.pos.x, z: s.pos.z, y: s.pos.y, yaw: 0 }; s.yaw = 0; });
        S.player.teleport(3, 0, 9.6, Math.PI);
        S.cam.yaw = 0; // the push follows the game camera: aim it at the soldiers
        S.cam.pitch = 0.2;
        S.playerState.selectedMiracle = 0;
        for (let i = 0; i < 20; i += 1) S.fixedUpdate(1 / 60);
        clearHud();
      },
      step(i) {
        return [{ cast: i === 20 }, orbit({ x: 3, y: th(3, 6), z: 6.4 }, far(9.5), far(2.6), -1.35 - i * 0.004)];
      },
    },
    bread: {
      setup() {
        H.setState('miracle-multiply');
        H.hideDebugUi(true);
        S.romans.setActive(false);
        clearHud();
      },
      step(i) {
        return [{ castHeld: i > 5, cast: i === 6, slot: i === 2 ? 1 : null }, (cam, Sx) => behind(cam, Sx, far(4.2), far(2.6), 1.2)];
      },
    },
    water: {
      setup() {
        H.setState('active-play');
        H.hideDebugUi(true);
        S.unlockAllForTest();
        S.romans.setActive(false);
        S.clock = 0.33;
        S.player.teleport(126, 0.7, -15, Math.PI / 2 + 0.3);
        S.cam.yaw = Math.PI / 2 + 0.3 + Math.PI;
        S.playerState.selectedMiracle = 3;
        S.miracles.tryCast('miracle.walk-on-water');
        for (let i = 0; i < 20; i += 1) S.fixedUpdate(1 / 60);
        clearHud();
      },
      step(i, n) {
        const u = i / n;
        return [{ moveY: 1 }, (cam, Sx) => {
          const p = Sx.model.group.position;
          cam.position.set(p.x - 3 + u * 2, 1.1 + far(0.6), p.z + far(6.5));
          cam.lookAt(p.x + 1.5, p.y + 1.3, p.z);
        }];
      },
    },
    chariot: {
      setup() {
        H.setState('active-play');
        H.hideDebugUi(true);
        S.romans.setActive(false);
        S.clock = 0.24;
        S.mountForTest('vehicle.chariot.1');
        S.vehicles.place(S.vehicles.ridden, 126, -162.3, -Math.PI / 2);
        S.vehicles.ridden.speed = 13;
        clearHud();
      },
      step(i) {
        const v = S.vehicles.ridden;
        const want = Math.atan2(80 - v.pos.x, -162.3 - v.pos.z);
        let d = want - v.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return [{ moveY: 1, sprint: true, moveX: Math.max(-1, Math.min(1, -d * 3)) }, (cam) => {
          cam.position.set(v.render.x - 4 + i * 0.03, v.render.y + far(1.9), v.render.z + far(6.8));
          cam.lookAt(v.render.x - 2.5, v.render.y + 1.2, v.render.z);
        }];
      },
    },
    pursuit: {
      setup() {
        H.setState('roman-pursuit');
        H.hideDebugUi(true);
        S.playerState.yaw = Math.PI - 0.3;
        S.cam.yaw = S.playerState.yaw + Math.PI;
        clearHud();
      },
      step() {
        return [{ moveY: 1, sprint: true }, (cam, Sx) => {
          const p = Sx.model.group.position;
          const y = Sx.playerState.yaw;
          cam.position.set(p.x + Math.sin(y) * far(6.5) + 1.5, p.y + far(2.8), p.z + Math.cos(y) * far(6.5));
          cam.lookAt(p.x - Math.sin(y) * 3, p.y + 1.2, p.z - Math.cos(y) * 3);
        }];
      },
    },
    followers: {
      setup() {
        H.setState('active-play');
        H.hideDebugUi(true);
        S.romans.setActive(false);
        S.clock = 0.43;
        S.playerState.faith = 34;
        for (const id of ['npc.benjamin', 'npc.villager.2', 'npc.villager.5', 'npc.simon', 'npc.villager.8', 'npc.villager.6']) S.recruitFollower(S.npcs.byId.get(id), 'trailer');
        S.player.teleport(4, 0, 46, Math.PI * 0.98);
        S.playerState.yaw = Math.PI * 0.98;
        for (let i = 0; i < 90; i += 1) { S.intent = { ...idle(), moveY: 1 }; S.cam.yaw = S.playerState.yaw + Math.PI; S.fixedUpdate(1 / 60); }
        clearHud();
      },
      step(i, n) {
        const u = i / n;
        return [{ moveY: 1 }, (cam, Sx) => {
          const p = Sx.model.group.position;
          const y = Sx.playerState.yaw;
          cam.position.set(p.x + Math.sin(y) * far(4.8) + Math.cos(y) * (2 - u * 3), p.y + far(2.6), p.z + Math.cos(y) * far(4.8) - Math.sin(y) * (2 - u * 3));
          cam.lookAt(p.x - Math.sin(y) * 3, p.y + 1.2, p.z - Math.cos(y) * 3);
        }];
      },
    },
    endcard: {
      setup() {
        H.setState('active-play');
        H.hideDebugUi(true);
        S.romans.setActive(false);
        S.clock = 0.45;
        S.player.teleport(-4, 0, 6, Math.PI * 0.8);
        document.getElementById('hud').hidden = true;
        const card = document.createElement('div');
        card.id = 'trailer-card';
        card.innerHTML = '<div class="tc-cross">✝</div><div class="tc-title">JESUS<br>SIMULATOR</div><div class="tc-sub">THE HOLY OPEN WORLD EXPERIENCE</div><div class="tc-play">PLAY NOW</div>';
        const st = document.createElement('style');
        st.textContent = `#trailer-card{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${portrait ? 26 : 14}px;text-align:center;background:radial-gradient(ellipse at center,rgba(40,20,8,.15),rgba(40,20,8,.65));color:#fff6df;pointer-events:none;opacity:0;transition:none}
          #trailer-card .tc-cross{font-size:${portrait ? 110 : 80}px;color:#f2c14e;text-shadow:0 0 30px rgba(255,200,90,.8)}
          #trailer-card .tc-title{font:700 ${portrait ? 150 : 120}px/0.95 Georgia,'Palatino Linotype',serif;letter-spacing:.04em;text-shadow:0 6px 0 #6b3a12,0 14px 40px rgba(0,0,0,.6)}
          #trailer-card .tc-sub{font:800 ${portrait ? 34 : 28}px Trebuchet MS,sans-serif;letter-spacing:.3em;color:#f2c14e;text-shadow:0 2px 8px rgba(0,0,0,.7)}
          #trailer-card .tc-play{margin-top:${portrait ? 40 : 20}px;font:900 ${portrait ? 44 : 34}px Trebuchet MS,sans-serif;letter-spacing:.2em;padding:14px 40px;border-radius:999px;background:linear-gradient(180deg,#ffe08a,#f2b632);color:#4a2c16;box-shadow:0 0 0 4px #fff7d6,0 10px 30px rgba(0,0,0,.45)}`;
        document.head.appendChild(st);
        document.body.appendChild(card);
      },
      step(i, n) {
        document.getElementById('trailer-card').style.opacity = String(Math.min(1, i / 12));
        const yaw = 0.9 + (i / n) * 0.35;
        return [{}, (cam) => { cam.position.set(Math.sin(yaw) * far(30), 14 + far(4), Math.cos(yaw) * far(30)); cam.lookAt(0, 3, -4); }];
      },
    },
  };
  tr.setup = (name) => tr.shots[name].setup();
  tr.step = (name, i, n) => { const [want, cam] = tr.shots[name].step(i, n); tr.frame(want, cam); };
}, { portrait: mode === 'portrait' });

// ---- the cut: [shot, seconds]
const QUICK = !!process.env.TRAILER_QUICK; // preview: 3 frames per shot, contact sheet, no video
const CUT = [['village', 3], ['push', 3], ['bread', 2.7], ['water', 2.7], ['chariot', 2.7], ['pursuit', 2.7], ['followers', 2.7], ['endcard', 2.5]];
let index = 0;
const t0 = Date.now();
for (const [shot, seconds] of CUT) {
  await page.evaluate((name) => window.__TR.setup(name), shot);
  const n = QUICK ? 3 : Math.round(seconds * FPS);
  for (let i = 0; i < n; i += 1) {
    await page.evaluate(([name, k, total]) => window.__TR.step(name, k, total), [shot, i, n]);
    await page.screenshot({ path: path.join(frameDir, `f${String(index).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92, timeout: 180000 });
    index += 1;
  }
  console.log(`${mode} ${shot}: ${n} frames (${Math.round((Date.now() - t0) / 1000)} s elapsed)`);
}
if (QUICK) {
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const files = fs.readdirSync(frameDir).sort().filter((f, k) => k % 3 === 2);
  const cells = files.map((f) => `<img src="data:image/jpeg;base64,${fs.readFileSync(path.join(frameDir, f)).toString('base64')}">`).join('');
  await sheet.setContent(`<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(4,1fr);gap:4px}img{width:100%}</style>${cells}`);
  await sheet.screenshot({ path: path.join(outDir, `preview-${mode}.png`), fullPage: true });
  await browser.close();
  console.log('preview', path.join(outDir, `preview-${mode}.png`), JSON.stringify(errors.slice(0, 3)));
  process.exit(0);
}
await browser.close();

const out = path.join(outDir, `jesus-simulator-trailer-${mode}-${size.width}x${size.height}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frameDir, 'f%05d.jpg'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', '-an', out]);
console.log(`${out}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${index} frames, errors=${JSON.stringify(errors.slice(0, 3))}`);
