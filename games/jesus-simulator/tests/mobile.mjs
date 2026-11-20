/**
 * Mobile checks: touch controls drive the game through real touch events
 * (CDP Input.dispatchTouchEvent, which Chromium turns into pointer events),
 * and the HUD fits a phone held sideways and upright.
 * Usage: node tests/mobile.mjs [url] [outDir]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4188/';
const out = process.argv[3] || 'artifacts/mobile';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`); };
const errors = [];

async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000); // software-rendered frames are slow at 2x pixels
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto(url);
  await page.waitForSelector('#menu:not([hidden])', { timeout: 180000 });
  const cdp = mobile ? await ctx.newCDPSession(page) : null;
  return { page, cdp };
}
const diag = (page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
const waitFrames = async (page, n) => { const s = (await diag(page)).frame; await page.waitForFunction((f) => window.__THREE_GAME_DIAGNOSTICS__.frame >= f, s + n, { timeout: 180000 }); };
const S = (page, fn, arg) => page.evaluate(fn, arg);
// raw multi-touch: points = [{ x, y, id }]
const touch = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
const tapAt = async (cdp, x, y, id = 9) => { await touch(cdp, 'touchStart', [{ x, y, id }]); await touch(cdp, 'touchEnd', []); };
const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);

/** Rectangles of the HUD groups that must not overlap on a phone. */
const layout = (page) => page.evaluate(() => {
  const sel = { left: '.t-left', right: '.hud-topright', hotbar: '.hotbar', top: '.t-top', cast: '.t-cast', jump: '.t-jump', talk: '.t-talk', ring: '.t-ring' };
  const r = {};
  for (const [k, s] of Object.entries(sel)) {
    const el = document.querySelector(s);
    const b = el?.getBoundingClientRect();
    if (b && b.width) r[k] = { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  const keys = Object.keys(r);
  const overlaps = [];
  for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) if (hit(r[keys[i]], r[keys[j]])) overlaps.push(`${keys[i]}×${keys[j]}`);
  const inside = keys.every((k) => r[k].x >= 0 && r[k].y >= 0 && r[k].x + r[k].w <= innerWidth + 1 && r[k].y + r[k].h <= innerHeight + 1);
  return { overlaps, inside, rects: r };
});

async function startPlay(page) {
  await page.tap('#btn-play');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.screen === 'playing', null, { timeout: 120000 });
  await S(page, () => {
    const s = window.__JESUS_SIM__.session;
    s.romans.setActive(false);
    s.unlockAllForTest();
  });
  await waitFrames(page, 4);
}

// ============================================================ phone, sideways
const LAND = { width: 844, height: 390 };
let { page, cdp } = await open(LAND, true);
const menuFits = await page.evaluate(() => ['#btn-play', '#btn-settings', '#btn-howto', '#btn-about'].every((id) => { const r = document.querySelector(id).getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth; }));
await page.screenshot({ path: `${out}/phone-landscape-menu.png` });
await startPlay(page);
const mode = await page.evaluate(() => ({ cls: document.body.classList.contains('touch-ui'), touchMode: window.__JESUS_SIM__.session.input.touchMode, visible: getComputedStyle(document.querySelector('#touch')).display !== 'none', quality: window.__JESUS_SIM__.session.quality }));
check('Phone: touch controls are on by themselves, the whole menu fits, phone quality preset', menuFits && mode.cls && mode.touchMode && mode.visible && mode.quality === 'low', JSON.stringify({ menuFits, ...mode }));

let L = await layout(page);
check('Phone sideways: HUD groups and thumb controls do not overlap and stay on screen', L.overlaps.length === 0 && L.inside, JSON.stringify(L.overlaps));

// joystick: hold up → walk forward along the camera
const p0 = await S(page, () => { const s = window.__JESUS_SIM__.session; s.player.teleport(-9, 0, 4, 0); s.cam.yaw = Math.PI; return null; });
await waitFrames(page, 3);
const before = await S(page, () => ({ ...window.__JESUS_SIM__.session.playerState.position }));
await touch(cdp, 'touchStart', [{ x: 110, y: 290, id: 1 }]);
await touch(cdp, 'touchMove', [{ x: 110, y: 240, id: 1 }]);
await waitFrames(page, 4);
const walking = await S(page, () => ({ analog: window.__JESUS_SIM__.session.input.analog, sprint: window.__JESUS_SIM__.session.intent?.sprint }));
await S(page, () => window.__JESUS_SIM__.session.simulate(1.0));
await waitFrames(page, 2);
const mid = await S(page, () => ({ ...window.__JESUS_SIM__.session.playerState.position }));
// push past the ring: sprint
await touch(cdp, 'touchMove', [{ x: 110, y: 190, id: 1 }]);
await waitFrames(page, 3);
const running = await S(page, () => ({ analog: window.__JESUS_SIM__.session.input.analog, run: document.querySelector('.t-stick').classList.contains('run') }));
// release: stick resets, no move left over
await touch(cdp, 'touchEnd', []);
await waitFrames(page, 3);
const released = await S(page, () => ({ analog: window.__JESUS_SIM__.session.input.analog, on: document.querySelector('.t-stick').classList.contains('on') }));
const moved = Math.hypot(mid.x - before.x, mid.z - before.z);
check('Joystick walks Jesus, pushing past the ring sprints, releasing stops',
  walking.analog && walking.analog.y > 0.5 && moved > 1 && running.analog?.run && running.run && released.analog === null && !released.on,
  `moved ${moved.toFixed(2)} m, walk=${JSON.stringify(walking.analog)} run=${JSON.stringify(running)} released=${JSON.stringify(released)}`);

// look: drag on the right side turns the camera; together with the stick (two thumbs)
const yaw0 = await S(page, () => window.__JESUS_SIM__.session.cam.yaw);
await touch(cdp, 'touchStart', [{ x: 110, y: 290, id: 1 }, { x: 560, y: 200, id: 2 }]);
await touch(cdp, 'touchMove', [{ x: 110, y: 250, id: 1 }, { x: 640, y: 200, id: 2 }]);
await waitFrames(page, 3);
const both = await S(page, () => ({ yaw: window.__JESUS_SIM__.session.cam.yaw, analog: window.__JESUS_SIM__.session.input.analog }));
await touch(cdp, 'touchCancel', []);
await waitFrames(page, 2);
const cancelled = await S(page, () => window.__JESUS_SIM__.session.input.analog);
check('Two thumbs: look drag turns the camera while the stick is held; a cancelled touch leaves nothing stuck',
  Math.abs(both.yaw - yaw0) > 0.15 && both.analog && cancelled === null, `yaw ${yaw0.toFixed(2)} → ${both.yaw.toFixed(2)}, analog during=${!!both.analog} after cancel=${JSON.stringify(cancelled)}`);

// pinch zooms
const dist0 = await S(page, () => window.__JESUS_SIM__.session.cam.targetDistance);
await touch(cdp, 'touchStart', [{ x: 520, y: 180, id: 3 }, { x: 600, y: 180, id: 4 }]);
await touch(cdp, 'touchMove', [{ x: 470, y: 180, id: 3 }, { x: 650, y: 180, id: 4 }]);
await touch(cdp, 'touchMove', [{ x: 430, y: 180, id: 3 }, { x: 690, y: 180, id: 4 }]);
await touch(cdp, 'touchEnd', []);
await waitFrames(page, 3);
const dist1 = await S(page, () => window.__JESUS_SIM__.session.cam.targetDistance);
check('Pinch zooms the camera in', dist1 < dist0, `${dist0} → ${dist1}`);

// jump button
const jumps0 = await S(page, () => window.__JESUS_SIM__.session.playerState.stats.jumps);
let c = await center(page, '.t-jump');
await touch(cdp, 'touchStart', [{ ...c, id: 5 }]);
await waitFrames(page, 4);
await touch(cdp, 'touchEnd', []);
await waitFrames(page, 3);
const jumps1 = await S(page, () => window.__JESUS_SIM__.session.playerState.stats.jumps);
check('Jump button jumps', jumps1 > jumps0, `jumps ${jumps0} → ${jumps1}`);

// hotbar tap selects a miracle; cast button casts it
c = await center(page, '.hotbar [data-slot="2"]');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 3);
const sel = await S(page, () => window.__JESUS_SIM__.session.playerState.selectedMiracle);
c = await center(page, '.hotbar [data-slot="0"]');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 3);
await S(page, () => { window.__casts = []; window.__JESUS_SIM__.session.bus.on('miracle:cast', (e) => window.__casts.push(e.miracleId || e.id || 'cast')); });
c = await center(page, '.t-cast');
await touch(cdp, 'touchStart', [{ ...c, id: 6 }]);
await waitFrames(page, 4);
await touch(cdp, 'touchEnd', []);
await waitFrames(page, 3);
const casts = await S(page, () => ({ casts: window.__casts, cd: window.__JESUS_SIM__.session.miracles.cooldownLeft('miracle.divine-push') }));
check('Tapping a hotbar slot selects the miracle; the cast button casts it', sel === 2 && casts.casts.length >= 1 && casts.cd > 0, `selected=${sel} casts=${JSON.stringify(casts)}`);
await page.screenshot({ path: `${out}/phone-landscape-play.png` });

// talk: walk up to a villager, the talk button glows, tap it, then leave with ✕
const npc = await S(page, () => {
  const s = window.__JESUS_SIM__.session;
  const n = s.npcs.npcs.find((x) => !x.hidden && !x.tag && !x.anchored) || s.npcs.npcs[0];
  n.paused = true;
  const yaw = 0.6;
  s.player.teleport(n.pos.x - Math.sin(yaw) * 1.6, 0, n.pos.z - Math.cos(yaw) * 1.6, yaw);
  s.playerState.yaw = yaw;
  return n.id;
});
await waitFrames(page, 4);
const hot = await page.evaluate(() => document.querySelector('.t-talk').classList.contains('hot'));
c = await center(page, '.t-talk');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 4);
const talking = await S(page, () => window.__JESUS_SIM__.session.dialogue.active);
await page.screenshot({ path: `${out}/phone-landscape-talk.png` });
c = await center(page, '#conv-leave');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 3);
const left = await S(page, () => !window.__JESUS_SIM__.session.dialogue.active);
check('Talk button glows near a villager, opens the conversation; ✕ leaves it', hot && talking && left, `npc=${npc} hot=${hot} talking=${talking} left=${left}`);

// ride: next to a donkey the ride button appears; tap to mount and again to get off
const vid = await S(page, () => {
  const s = window.__JESUS_SIM__.session;
  const v = s.vehicles.list.find((x) => !x.roman && x.kind === 'donkey') || s.vehicles.list[0];
  s.player.teleport(v.pos.x + 1.6, 0, v.pos.z, 0);
  return v.id;
});
await waitFrames(page, 4);
const rideShown = await page.evaluate(() => !document.querySelector('.t-ride').hidden);
c = await center(page, '.t-ride');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 4);
const riding = await S(page, () => !!window.__JESUS_SIM__.session.vehicles.ridden);
await page.screenshot({ path: `${out}/phone-landscape-ride.png` });
L = await layout(page);
c = await center(page, '.t-ride');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 4);
const off = await S(page, () => !window.__JESUS_SIM__.session.vehicles.ridden);
check('Ride button appears by a donkey, mounts and dismounts (riding HUD still fits)', rideShown && riding && off && L.overlaps.length === 0, `vehicle=${vid} shown=${rideShown} riding=${riding} off=${off} overlaps=${JSON.stringify(L.overlaps)}`);

// pause and map buttons
c = await center(page, '.t-top [data-code="Escape"]');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 3);
const paused = (await diag(page)).screen;
await page.screenshot({ path: `${out}/phone-landscape-pause.png` });
await page.tap('.pause-nav [data-tab="resume"]');
await waitFrames(page, 3);
const resumed = (await diag(page)).screen;
c = await center(page, '.t-top [data-code="Tab"]');
await tapAt(cdp, c.x, c.y);
await waitFrames(page, 3);
const mapOpen = (await diag(page)).screen;
const mapFits = await page.evaluate(() => { const r = document.querySelector('.map-card').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; });
await page.screenshot({ path: `${out}/phone-landscape-map.png` });
await page.tap('#map-close');
await waitFrames(page, 3);
const mapClosed = (await diag(page)).screen;
check('Pause and map buttons; Resume and ✕ bring play back; the map fits the screen', paused === 'paused' && resumed === 'playing' && mapOpen === 'map' && mapFits && mapClosed === 'playing',
  `${paused} → ${resumed}, ${mapOpen} (fits=${mapFits}) → ${mapClosed}`);

// a held button cannot stay down when the page loses focus
c = await center(page, '.t-jump');
await touch(cdp, 'touchStart', [{ ...c, id: 7 }]);
await waitFrames(page, 2);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await waitFrames(page, 2);
const stuck = await S(page, () => ({ down: [...window.__JESUS_SIM__.session.input.down], pressed: document.querySelectorAll('.t-btn.down').length }));
await touch(cdp, 'touchEnd', []);
check('Losing focus releases held touch buttons', stuck.down.length === 0 && stuck.pressed === 0, JSON.stringify(stuck));
await page.context().close();

// ============================================================ phone, upright
({ page, cdp } = await open({ width: 390, height: 844 }, true));
await page.screenshot({ path: `${out}/phone-portrait-menu.png` });
await startPlay(page);
L = await layout(page);
await page.screenshot({ path: `${out}/phone-portrait-play.png` });
const before2 = await S(page, () => ({ ...window.__JESUS_SIM__.session.playerState.position }));
await touch(cdp, 'touchStart', [{ x: 90, y: 740, id: 1 }]);
await touch(cdp, 'touchMove', [{ x: 90, y: 690, id: 1 }]);
await waitFrames(page, 3);
await S(page, () => window.__JESUS_SIM__.session.simulate(1.0));
await touch(cdp, 'touchEnd', []);
await waitFrames(page, 2);
const after2 = await S(page, () => ({ ...window.__JESUS_SIM__.session.playerState.position }));
const moved2 = Math.hypot(after2.x - before2.x, after2.z - before2.z);
check('Phone upright: layout without overlaps, joystick works', L.overlaps.length === 0 && L.inside && moved2 > 1, `moved ${moved2.toFixed(2)} m overlaps=${JSON.stringify(L.overlaps)}`);
// rotating the phone keeps the canvas and HUD
await page.setViewportSize(LAND);
await waitFrames(page, 4);
const rot = await page.evaluate(() => ({ cw: document.querySelector('#game-canvas').clientWidth, ch: document.querySelector('#game-canvas').clientHeight, aspect: window.__JESUS_SIM__.session.camera.aspect }));
L = await layout(page);
check('Rotating the phone resizes the canvas and re-lays the HUD', rot.cw === LAND.width && rot.ch === LAND.height && Math.abs(rot.aspect - LAND.width / LAND.height) < 0.01 && L.overlaps.length === 0, JSON.stringify({ ...rot, overlaps: L.overlaps }));
await page.context().close();

// ============================================================ tablet
({ page, cdp } = await open({ width: 1024, height: 768 }, true));
await startPlay(page);
L = await layout(page);
await page.screenshot({ path: `${out}/tablet-play.png` });
check('Tablet: layout without overlaps', L.overlaps.length === 0 && L.inside, JSON.stringify(L.overlaps));
await page.context().close();

// ============================================================ desktop is unchanged
({ page } = await open({ width: 1280, height: 720 }, false));
const desk = await page.evaluate(() => ({ cls: document.body.classList.contains('touch-ui'), shown: getComputedStyle(document.querySelector('#touch')).display !== 'none' }));
await page.click('#btn-play');
await waitFrames(page, 6);
await page.evaluate(() => { const s = window.__JESUS_SIM__.session; s.romans.setActive(false); s.suppressLockPause = true; s.player.teleport(-9, 0, 4, 0); s.cam.yaw = Math.PI; });
const d0 = await S(page, () => ({ ...window.__JESUS_SIM__.session.playerState.position }));
await page.keyboard.down('KeyW');
await waitFrames(page, 3);
await S(page, () => window.__JESUS_SIM__.session.simulate(1.0));
await page.keyboard.up('KeyW');
const d1 = await S(page, () => ({ ...window.__JESUS_SIM__.session.playerState.position }));
const kmoved = Math.hypot(d1.x - d0.x, d1.z - d0.z);
check('Desktop: no touch controls, keyboard still walks', !desk.cls && !desk.shown && kmoved > 1, `${JSON.stringify(desk)} moved ${kmoved.toFixed(2)} m`);
await page.context().close();

check('No console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
