import { boot, startLevel, state, tp, segX, hold, tap, wait, check, summary, closeLog } from './harness.mjs';
const { browser, page, errors } = await boot();
const ev = (fn, arg) => page.evaluate(fn, arg);
const freeze = () => ev(() => window.__BTH.scene.enemies.forEach((e) => { if (e.kind !== 'boss') { e.tick = () => {}; e.contactDamage = 0; } }));

// ---------------- Part 6 · Glass Caverns
await startLevel(page, 5);
await freeze();
let sx = await segX(page, 0);
await tp(page, sx + 4, 18);
await hold(page, ['ArrowRight'], 700);
const v0 = await ev(() => Math.abs(window.__BTH.scene.player.body.velocity.x));
await wait(page, 200);
const v1 = await ev(() => Math.abs(window.__BTH.scene.player.body.velocity.x));
check('II-1: crystal floors are slippery (Elias keeps sliding after release)', v1 > 40, `v at release ${v0.toFixed(0)}, 0.2s later ${v1.toFixed(0)}`);
await tp(page, sx + 24, 18);
await ev(() => { window.__BTH.scene.player.facing = 1; });
const k0 = await ev(() => window.__BTH.scene.breaks.filter((b) => b.alive).length);
for (let i = 0; i < 8; i++) { await tap(page, 'KeyX', 40); await wait(page, 200); }
const k1 = await ev(() => window.__BTH.scene.breaks.filter((b) => b.alive).length);
check('II-1: cracked crystal breaks under fire', k1 < k0, `${k0} -> ${k1}`);
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 1);
// wait for the rail platform to come to the left lip, step on, ride across
await tp(page, sx + 6, 18);
for (let i = 0; i < 300; i++) { const x = await ev(() => window.__BTH.scene.movers[0].img.x); if (x < (sx + 10) * 32) break; await wait(page, 100); }
await ev(() => { const s = window.__BTH.scene, m = s.movers[0], p = s.player; p.body.reset(m.img.x, m.body.top - 1); });
await wait(page, 300);
let s = await state(page);
const onMover = await ev(() => { const p = window.__BTH.scene.player.body, m = window.__BTH.scene.movers[0].body; return Math.abs(p.bottom - m.top) < 6 && p.right > m.left && p.left < m.right; });
for (let i = 0; i < 300; i++) { const x = await ev(() => window.__BTH.scene.movers[0].img.x); if (x > (sx + 29) * 32) break; await wait(page, 100); }
await hold(page, ['ArrowRight'], 700);
s = await state(page);
check('II-1: rail platform carries Elias over the spike chasm', onMover && s.player.x > (sx + 32) * 32 && s.player.hp > 900, `on=${onMover} x=${s.player.x} hp=${s.player.hp}`);
sx = await segX(page, 2);
await closeLog(page);
const lift = await ev(() => window.__BTH.scene.movers.find((m) => m.vertical).s.tx);
for (let i = 0; i < 400; i++) { const y = await ev(() => window.__BTH.scene.movers.find((m) => m.vertical).img.y); if (y > 580) break; await wait(page, 100); }
await ev(() => { const s = window.__BTH.scene, m = s.movers.find((m) => m.vertical), p = s.player; p.body.reset(m.img.x, m.body.top - 1); });
void lift;
await wait(page, 300);
for (let i = 0; i < 100; i++) { const y = await ev(() => window.__BTH.scene.movers.find((m) => m.vertical).img.y); if (y < 6 * 32) break; await wait(page, 100); }
s = await state(page);
check('II-1: the lift carries Elias up the crystal wall', s.player.y < 8 * 32, `y=${s.player.y}`);

// ---------------- Part 7 · Clockwork Ruins
await startLevel(page, 6);
await freeze();
sx = await segX(page, 0);
await tp(page, sx + 10, 18);
await wait(page, 300);
const bx0 = (await state(page)).player.x;
await wait(page, 800);
const bx1 = (await state(page)).player.x;
check('II-2: conveyor belt carries a standing Elias', bx1 - bx0 > 15, `dx=${bx1 - bx0}`);
await ev(() => { const s = window.__BTH.scene; s.crushers[0].t = 1.95; const p = s.player; p.invuln = 0; p.body.reset(s.crushers[0].s.x, s.crushers[0].floor); });
await wait(page, 400);
s = await state(page);
check('II-2: crusher hits whoever stands below', s.player.hp < 5, `hp=${s.player.hp}`);
// watcher shoots
sx = await segX(page, 1);
await ev((sx) => { const s = window.__BTH.scene; const d = s.enemies.filter((e) => e.kind === 'drone').sort((a, b) => Math.abs(a.x - sx * 32) - Math.abs(b.x - sx * 32))[0]; delete d.tick; d.cd = 0; window.__d = d; }, sx + 14);
await ev(() => { const s = window.__BTH.scene; const p = s.player; p.hp = 5; p.invuln = 0; p.body.reset(window.__d.x - 150, 19 * 32); });
console.log('watcher', JSON.stringify(await ev(() => { const d = window.__d, p = window.__BTH.scene.player; return { d: [Math.round(d.x), Math.round(d.y)], p: [Math.round(p.x), Math.round(p.y)], sees: d.sees(540, d.y), mode: d.mode }; })));
let hit = false;
for (let i = 0; i < 100 && !hit; i++) { await wait(page, 100); hit = (await state(page)).player.hp < 5; }
check('II-2: a Watcher locks on and fires', hit, `mode=${await ev(() => window.__d.mode)}`);
// crate on belt to the plate
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 3);
await tp(page, sx + 3, 16);
let opened = false;
for (let i = 0; i < 140 && !opened; i++) { await wait(page, 100); opened = (await state(page)).doors[0].open; }
check('II-2: the belt carries the crate onto the plate and the door opens', opened, JSON.stringify((await state(page)).doors[0]));

// ---------------- Part 8 · Sunken Temple
await startLevel(page, 7);
await freeze();
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 1);
await tp(page, sx + 6, 18);
await closeLog(page);
await tap(page, 'KeyQ', 80);
let gate = false;
for (let i = 0; i < 40 && !gate; i++) { await wait(page, 100); gate = (await state(page)).doors[0].open; }
await wait(page, 14000);
const closed = !(await state(page)).doors[0].open;
check('II-3: Pip lights a timed totem — the gate opens, then closes again', gate && closed, `opened=${gate} closedAfter=${closed}`);
await ev(() => window.__BTH.godMode(false));
for (let i = 0; i < 20 && (await state(page)).player.hp >= 5; i++) {
  await ev(() => { const s = window.__BTH.scene; const pd = s.pendulums[0]; const p = s.player; p.hp = 5; p.invuln = 0; p.body.reset(pd.ax, pd.ay + pd.len + 40); });
  await wait(page, 150);
}
check('II-3: a swinging blade hurts', (await state(page)).player.hp < 5);

// ---------------- Part 9 · Sentinel
await startLevel(page, 8);
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 1);
await tp(page, sx + 12, 18);
await wait(page, 4500);
s = await state(page);
check('II-4: the Ancient Sentinel wakes and the fight begins', s.boss && s.boss.mode !== 'intro', JSON.stringify(s.boss));
let stuck = false;
const bhp = s.boss.hp;
for (let i = 0; i < 200 && !stuck; i++) {
  await ev(() => { const b = window.__BTH.scene.boss; if (b.mode === 'hover') { b.next = 'dive'; b.cd = Math.min(b.cd, 0.1); } });
  stuck = (await ev(() => window.__BTH.scene.boss.mode)) === 'stuck';
  await wait(page, 100);
}
await ev(() => { const s = window.__BTH.scene; const b = s.boss; const p = s.player; p.body.reset(b.x - 170, 19 * 32); p.facing = 1; p.setPState('ground'); b.stateT = -3; });
await wait(page, 300);
for (let k = 0; k < 6; k++) { await tap(page, 'KeyX', 40); await wait(page, 150); }
const bhp2 = await ev(() => window.__BTH.scene.boss.hp);
check('II-4: after its dive the Sentinel is stuck and its core takes damage', stuck && bhp2 < bhp, `stuck=${stuck} hp ${bhp}->${bhp2}`);
await ev(() => { const b = window.__BTH.scene.boss; b.hp = 0; b.die(); });
await wait(page, 2500);
s = await state(page);
check('II-4: defeating it opens the vault door', s.doors.at(-1).open, JSON.stringify(s.doors.at(-1)));
await hold(page, ['ArrowRight'], 8000);
await wait(page, 3500);
const sc = await ev(() => window.__game.scene.getScenes(true).map((x) => x.scene.key));
check('II-4: the rift rolls the Chapter II ending', sc.includes('Ending'), sc.join(','));
check('no runtime errors', errors.length === 0, errors.slice(0, 4).join('\n'));
const fails = summary();
await browser.close();
process.exit(fails ? 1 : 0);
