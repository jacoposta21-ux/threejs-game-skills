#!/usr/bin/env node
/**
 * Renders a 30 s gameplay trailer frame by frame.
 *
 *   node scripts/trailer/capture-trailer.cjs --url http://127.0.0.1:4188 --size 1280x720 --out trailer/landscape
 *
 * Time is fully virtual: the game loop is driven with advance(1/30), page timers run on
 * Playwright's fake clock, and CSS animations are scrubbed to the trailer time, so the
 * result is smooth 30 fps footage even on a slow software renderer. Every sound the game
 * plays is logged with its trailer timestamp and re-rendered offline into audio.wav.
 */
const fs = require('fs');
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('@playwright/test'));
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const URL = args.url ?? 'http://127.0.0.1:4188';
const [W, H] = (args.size ?? '1280x720').split('x').map(Number);
const OUT = path.resolve(args.out ?? 'trailer/out');
const FPS = 30;
const DURATION = Number(args.duration ?? 30);
const SEED = Number(args.seed ?? 5);
const portrait = H > W;

fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('pam.settings.v1', JSON.stringify({ quality: 'high', showFps: false, tutorials: { editor: true }, marbleCount: 8 }));
  });
  await page.clock.install({ time: 0 });
  await page.goto(URL);
  // let boot run on the fake clock
  for (let i = 0; i < 600; i += 1) {
    await page.clock.runFor(50);
    const ready = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.screen === 'menu').catch(() => false);
    if (ready) break;
    await page.waitForTimeout(30);
  }

  await page.evaluate(
    ({ portrait }) => {
      const g = window.__PAM__;
      g.manualClock = true;
      // trailer showcases every component: unlock them all for this session
      for (const id of ['loop', 'corkscrew', 'spiral', 'funnel_large', 'funnel_vortex', 'tube', 'jump', 'gap_jump', 'bounce', 'cannon', 'moving_platform', 'rotator', 'swinger', 'pendulum', 'gates'])
        if (!g.progress.data.pieces.includes(id)) g.progress.data.pieces.push(id);
      window.__trailerT = 0;
      // log every sound with its trailer timestamp
      window.__cues = [];
      const names = ['place', 'snap', 'click', 'countdown', 'gate', 'clack', 'boost', 'jump', 'bounce', 'cannon', 'fall', 'finish', 'victory', 'coin', 'levelUp'];
      for (const n of names) {
        const orig = g.audio[n].bind(g.audio);
        g.audio[n] = (...a) => {
          window.__cues.push({ t: window.__trailerT, name: n, args: a });
          return orig(...a);
        };
      }
      const style = document.createElement('style');
      style.textContent = `
        #fps, #toasts, #rotate-hint, #tutorial { display: none !important; }
        body.trailer-intro #screen { visibility: hidden; }
        #trailer { position: fixed; inset: 0; pointer-events: none; z-index: 100; font-family: 'Baloo 2', sans-serif; }
        #trailer .cap { position: absolute; left: 0; right: 0; top: ${portrait ? '36%' : '64%'}; text-align: center;
          font-weight: 800; font-size: ${portrait ? 76 : 84}px; line-height: .95; color: #fff;
          -webkit-text-stroke: ${portrait ? 7 : 8}px #1b1f3b; paint-order: stroke fill; text-shadow: 0 8px 0 #1b1f3b, 0 16px 30px rgba(0,0,0,.35); }
        #trailer .cap b { color: #ffbe0b; font-weight: 800; }
        #trailer .card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center;
          background: radial-gradient(circle at 50% 42%, rgba(79,168,255,.55), rgba(27,31,59,.94) 70%); }
        #trailer .card .logo { justify-content: center; font-size: ${portrait ? 118 : 132}px; }
        #trailer .card .logo .l3 { width: 100%; }
        #trailer .tag { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: ${portrait ? 34 : 34}px; color: #fff; margin-top: 18px; letter-spacing: .02em; text-shadow: 0 3px 8px rgba(0,0,0,.5); }
        #trailer .cta { display: inline-block; margin-top: 28px; padding: 16px 44px 12px; border-radius: 22px; font-size: 44px; font-weight: 800; color: #fff;
          background: linear-gradient(180deg, #ff86a9, #ff5d8f 55%); box-shadow: 0 8px 0 #d63a6c, 0 14px 30px rgba(0,0,0,.35); text-shadow: 0 3px 0 rgba(0,0,0,.2); }
      `;
      document.head.appendChild(style);
      const tr = document.createElement('div');
      tr.id = 'trailer';
      tr.innerHTML = `<div class="cap" id="tcap"></div>
        <div class="card" id="tcard"><div><h1 class="logo"><span class="l1">PICK</span><span class="l2">A</span><span class="l3">MARBLE</span></h1>
        <div class="tag" id="ttag">Build crazy tracks. Pick your champion. Watch them race.</div><div class="cta" id="tcta">PLAY NOW</div></div></div>`;
      document.body.appendChild(tr);
      document.body.classList.add('trailer-intro');
    },
    { portrait },
  );

  /* ------------------------------------------------------------ timeline */
  const T_BUILD = 2.6;
  const T_SETUP = 8.6;
  const T_RACE = 9.9;
  const T_END = DURATION - 2.3;
  const BUILD = ['ramp_steep', 'loop', 'curve_gentle_r', 'jump', 'curve_sharp_r', 'cannon', 'finish'];
  const placeEvery = (T_SETUP - T_BUILD - 0.9) / BUILD.length;
  let placed = -1;
  const totalFrames = Math.round(DURATION * FPS);

  for (let f = 0; f < totalFrames; f += 1) {
    const t = f / FPS;
    const step = await page.evaluate(
      ({ t, f, FPS, T_BUILD, T_SETUP, T_RACE, T_END, BUILD, placeEvery, placed, SEED, portrait }) => {
        const g = window.__PAM__;
        window.__trailerT = t;
        const dt = 1 / FPS;
        const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
        const win = (a, b, fade = 0.25) => Math.min(ease((t - a) / fade), ease((b - t) / fade));
        let newPlaced = placed;
        // --- scene beats -------------------------------------------------------
        if (f === Math.round(T_BUILD * FPS)) {
          document.body.classList.remove('trailer-intro');
          const track = { v: 1, id: 'trailer', name: 'Loop & Boom', created: 0, updated: 0, pieces: [{ id: 1, t: 'start', p: [-22, 24, -14], r: 0 }], meta: { source: 'creative', area: 32 } };
          g.openEditor(track, { mode: 'creative', returnTo: 'menu' });
          g.ui.dismissTutorial();
          window.__buildCam = { a: -0.55 };
        }
        if (t >= T_BUILD && t < T_SETUP) {
          const k = Math.floor((t - T_BUILD - 0.35) / placeEvery);
          const want = Math.min(BUILD.length - 1, k);
          const sub = (t - T_BUILD - 0.35) - k * placeEvery;
          if (want > placed && want >= 0) {
            g.builder.startPlacing(BUILD[want]);
            newPlaced = want;
            window.__placedAt = t;
          }
          if (g.builder.placing && t - (window.__placedAt ?? 0) > placeEvery * 0.55) g.builder.placeGhost(), g.builder.cancelPlacing();
          void sub;
          // slow orbit framing the finished layout
          const c = window.__buildCam;
          c.a += dt * 0.1;
          const center = { x: -6, y: 16, z: -2 };
          const r = portrait ? 66 : 50;
          g.cams.tween = null;
          g.scene.camera.position.set(center.x + Math.cos(c.a) * r, center.y + (portrait ? 30 : 22), center.z + Math.sin(c.a) * r);
          g.cams.controls.target.set(center.x, center.y - 4, center.z);
          g.scene.camera.lookAt(center.x, center.y - 4, center.z);
        }
        if (f === Math.round(T_SETUP * FPS)) {
          if (g.builder.placing) g.builder.placeGhost();
          g.builder.cancelPlacing();
          g.testRace();
        }
        if (f === Math.round(T_RACE * FPS)) {
          const marbles = g.defaultMarbles(8);
          g.startRace(marbles, 0, SEED);
        }
        g.advance(dt);
        if (t >= T_RACE) g.ui.updateRaceHud();
        // --- captions ------------------------------------------------------------
        const cap = document.getElementById('tcap');
        let text = '';
        let alpha = 0;
        if (t >= T_BUILD + 0.2 && t < T_SETUP - 0.2) {
          text = t < T_BUILD + 3.4 ? 'BUILD <b>CRAZY</b><br>TRACKS' : 'SNAP. STACK.<br><b>LOOP!</b>';
          alpha = t < T_BUILD + 3.4 ? win(T_BUILD + 0.2, T_BUILD + 3.3) : win(T_BUILD + 3.5, T_SETUP - 0.2);
        }
        if (t >= T_RACE + 3.6 && g.race.sim) {
          const s = g.race.sim;
          const lead = s.states.slice().sort((a, b) => a.rank - b.rank).find((x) => !x.finished);
          const def = lead ? s.graph.lanes[lead.lane]?.defId : '';
          const map = { loop: 'LOOP-DE-<b>LOOP!</b>', jump: '<b>BIG</b> AIR!', cannon: '<b>BOOM!</b>' };
          window.__capShown = window.__capShown ?? {};
          if (map[def] && !window.__capShown[def]) window.__capShown[def] = t;
          for (const [k, t0] of Object.entries(window.__capShown)) {
            if (t - t0 < 1.5) {
              text = map[k];
              alpha = win(t0, t0 + 1.5, 0.18);
            }
          }
        }
        cap.innerHTML = text;
        cap.style.opacity = String(alpha);
        cap.style.transform = `scale(${0.82 + 0.18 * Math.min(1, alpha * 1.4)}) rotate(${(1 - alpha) * -4}deg)`;
        // intro + end cards
        const card = document.getElementById('tcard');
        let ca = 0;
        if (t < T_BUILD) ca = Math.min(1, ease(t / 0.45)) * Math.min(1, (T_BUILD - t) / 0.35);
        if (t >= T_END) ca = ease((t - T_END) / 0.5);
        card.style.opacity = String(ca);
        card.style.background = t < T_BUILD ? 'radial-gradient(circle at 50% 42%, rgba(79,168,255,.10), rgba(27,31,59,.55) 75%)' : '';
        const logo = card.querySelector('.logo');
        const pop = t < T_BUILD ? ease(t / 0.6) : ease((t - T_END) / 0.6);
        logo.style.transform = `scale(${0.6 + 0.4 * pop}) rotate(${(1 - pop) * -6}deg)`;
        document.getElementById('tcta').style.opacity = t >= T_END + 0.5 ? String(ease((t - T_END - 0.5) / 0.4)) : '0';
        document.getElementById('tcta').style.transform = `scale(${1 + 0.05 * Math.sin(t * 7)})`;
        document.getElementById('ttag').textContent = t < T_BUILD ? 'Build. Pick. Race.' : 'Build crazy tracks. Pick your champion. Watch them race.';
        // scrub CSS animations to virtual time
        window.__animStart = window.__animStart ?? new WeakMap();
        for (const a of document.getAnimations()) {
          if (!window.__animStart.has(a)) window.__animStart.set(a, t);
          a.pause();
          a.currentTime = (t - window.__animStart.get(a)) * 1000;
        }
        return { placed: newPlaced, screen: g.screen, race: g.race.state };
      },
      { t, f, FPS, T_BUILD, T_SETUP, T_RACE, T_END, BUILD, placeEvery, placed, SEED, portrait },
    );
    placed = step.placed;
    // tap the card corner (not the ball, which opens the skin picker)
    if (f === Math.round(8.95 * FPS)) await page.click('.mcard >> nth=3', { position: { x: 12, y: 12 } }).catch(() => undefined);
    if (f === Math.round(9.4 * FPS)) await page.click('.mcard >> nth=0', { position: { x: 12, y: 12 } }).catch(() => undefined);
    await page.clock.runFor(1000 / FPS);
    await page.screenshot({ path: path.join(OUT, 'frames', `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (f % 30 === 0) console.log(`frame ${f}/${totalFrames} t=${t.toFixed(1)} ${step.screen} ${step.race}`);
  }

  // offline soundtrack from the logged cues
  const wav = await page.evaluate(async (DURATION) => {
    const g = window.__PAM__;
    const cues = window.__cues.map((c) => ({ t: c.t, fn: (a) => a[c.name](...c.args) }));
    const buf = await g.audio.constructor.renderOffline(DURATION, 'race', cues);
    const ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    out.setUint32(4, 36 + n * 4, true);
    w(8, 'WAVEfmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 2, true);
    out.setUint32(24, buf.sampleRate, true);
    out.setUint32(28, buf.sampleRate * 4, true);
    out.setUint16(32, 4, true);
    out.setUint16(34, 16, true);
    w(36, 'data');
    out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i += 1)
      for (let c = 0; c < 2; c += 1) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 0x7fff, true);
    let bin = '';
    const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), cues: window.__cues.length };
  }, DURATION);
  fs.writeFileSync(path.join(OUT, 'audio.wav'), Buffer.from(wav.b64, 'base64'));
  console.log(`audio cues: ${wav.cues}`);
  await browser.close();
})();
