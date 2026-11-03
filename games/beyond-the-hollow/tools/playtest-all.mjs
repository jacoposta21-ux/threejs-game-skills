import { boot, startLevel, state, tp, segX, hold, tap, wait, check, summary, closeLog, autopilotRight } from './harness.mjs';
const { browser, page, errors } = await boot();
const ev = (fn, arg) => page.evaluate(fn, arg);
const freezeEnemies = () => ev(() => window.__BTH.scene.enemies.forEach((e) => { e.tick = () => {}; e.contactDamage = 0; }));
const jumpRight = async (ms1, holdJump, second = 0) => {
  await page.keyboard.down('ArrowRight');
  await wait(page, ms1);
  await page.keyboard.down('Space');
  await wait(page, holdJump);
  await page.keyboard.up('Space');
  if (second) { await wait(page, second); await tap(page, 'Space', 200); }
  await wait(page, 900);
  await page.keyboard.up('ArrowRight');
  await wait(page, 300);
};

// ---------------------------------------------------------------- Chapter II
await startLevel(page, 1);
await freezeEnemies();
let sx = await segX(page, 0);
await tp(page, sx + 11, 18);
await jumpRight(200, 300);
let s = await state(page);
check('II: single jump cannot clear the 6-wide pit (spike respawn)', s.player.hp < 5 || s.player.x < (sx + 20) * 32, `x=${s.player.x} hp=${s.player.hp}`);
await ev(() => window.__BTH.godMode(true));
await tp(page, sx + 12, 18);
await jumpRight(150, 320, 250);
s = await state(page);
check('II: Pip-boost double jump clears the pit', s.player.x > (sx + 20) * 32 && s.player.y <= 19 * 32, `x=${s.player.x}`);
await tp(page, sx + 25, 18);
await autopilotRight(page, (sx + 31) * 32, { maxMs: 3000 });
s = await state(page);
check('II: double jump reaches the 5-high block', s.player.y <= 14 * 32 + 2, `y=${s.player.y}`);
sx = await segX(page, 1);
await tp(page, sx + 13, 17);
await wait(page, 200);
await page.keyboard.down('ArrowRight');
await wait(page, 1300);
await tap(page, 'Space', 200);
await wait(page, 900);
await page.keyboard.up('ArrowRight');
await wait(page, 500);
s = await state(page);
check('II: bounce cap launches Elias onto the 10-high cliff', s.player.y <= 9 * 32 + 2, `y=${s.player.y} x=${s.player.x}`);
await closeLog(page);
// burrower: unfreeze one burrower, wait for it to surface, then shoot
sx = await segX(page, 2);
await ev((x) => {
  const s = window.__BTH.scene;
  const b = s.enemies.filter((e) => e.kind === 'burrower').sort((a, c) => Math.abs(a.x - x) - Math.abs(c.x - x))[0];
  delete b.tick; window.__bur = b;
}, (sx + 9) * 32);
await tp(page, sx + 5, 18);
let surfaced = false, shotOk = false;
for (let i = 0; i < 40; i++) {
  await wait(page, 100);
  const m = await ev(() => window.__bur.mode);
  if (m === 'up') { surfaced = true; break; }
}
const hp0 = await ev(() => window.__bur.hp);
await ev(() => { window.__BTH.scene.player.facing = window.__bur.x > window.__BTH.scene.player.x ? 1 : -1; });
for (let i = 0; i < 5; i++) { await tap(page, 'KeyX', 40); await wait(page, 120); }
shotOk = (await ev(() => window.__bur.hp)) < hp0 || !(await ev(() => window.__bur.alive));
check('II: burrower surfaces near Elias and takes damage while exposed', surfaced && shotOk, `surfaced=${surfaced} hp ${hp0}->${await ev(() => window.__bur.hp)}`);
// totem gate + crate gate (seg 3)
sx = await segX(page, 3);
await tp(page, sx + 9, 18);
await tap(page, 'KeyQ', 80);
await wait(page, 3200);
s = await state(page);
const gate1 = s.doors.find((d) => Math.abs(d.x - ((sx + 14) * 32 + 16)) < 2);
check('II: Pip wakes the totem and gate 1 opens', gate1 && gate1.open, JSON.stringify(gate1));
await tp(page, sx + 21, 13); // onto the crate ledge
await wait(page, 400);
s = await state(page);
const onLedge = s.player.y <= 15 * 32 + 2;
for (let i = 0; i < 25; i++) { await hold(page, ['ArrowRight'], 120); const d = (await state(page)).doors.find((d) => Math.abs(d.x - ((sx + 33) * 32 + 16)) < 2); if (d.open) break; }
await wait(page, 300);
s = await state(page);
const gate2 = s.doors.find((d) => Math.abs(d.x - ((sx + 33) * 32 + 16)) < 2);
check('II: crate pushed off the ledge lands on the plate and opens gate 2', onLedge && gate2.open, `onLedge=${onLedge} ${JSON.stringify(gate2)}`);
// spore vent damages
await ev(() => window.__BTH.godMode(false));
const v = await ev(() => { const s = window.__BTH.scene; const vt = s.vents[0]; vt.t = 2.5; return { x: vt.s.x, ty: vt.s.ty }; });
await ev(([x, ty]) => { const p = window.__BTH.scene.player; p.invuln = 0; p.body.reset(x, (ty + 1) * 32); }, [v.x, v.ty]);
await wait(page, 700);
s = await state(page);
check('II: erupting spore vent hurts', s.player.hp < 5, `hp=${s.player.hp}`);

// ---------------------------------------------------------------- Chapter III
await startLevel(page, 2);
await freezeEnemies();
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 2);
const ghosts0 = await ev(() => window.__BTH.scene.ghosts.filter((g) => g.revealed).length);
await tp(page, sx + 8, 18);
await hold(page, ['ArrowRight'], 400);
await wait(page, 600);
const ghosts1 = await ev(() => window.__BTH.scene.ghosts.filter((g) => g.revealed).length);
check('III: light-glass stays hidden until Pip approaches, then reveals', ghosts0 === 0 && ghosts1 > 0, `${ghosts0} -> ${ghosts1}`);
// cross the chasm on revealed platforms
{
  // jump at each edge: chasm lip, then the right edge of every light-glass platform
  const edges = [(sx + 10) * 32 - 10];
  const plats = await ev(() => window.__BTH.scene.ghosts.map((g) => g.s.tx));
  const local = plats.filter((t) => t > sx && t < sx + 30).sort((a, b) => a - b);
  for (let i = 0; i < local.length; i++) if (local[i + 1] !== local[i] + 1) edges.push((local[i] + 1) * 32 - 10);
  await page.keyboard.down('ArrowRight');
  for (const ex of edges) {
    for (let k = 0; k < 120; k++) { const x = await ev(() => window.__BTH.scene.player.body.right); if (x >= ex) break; await wait(page, 15); }
    await tap(page, 'Space', 200);
    await wait(page, 250);
  }
  await wait(page, 700);
  await page.keyboard.up('ArrowRight');
}
s = await state(page);
check('III: crosses the chasm on light-glass', s.player.x > (sx + 27) * 32 && s.player.y <= 19 * 32, `x=${s.player.x} y=${s.player.y} paused=${s.paused} overlay=${s.overlay}`);
// stalker flees Pip light
await ev(() => { const s = window.__BTH.scene; const st = s.enemies.find((e) => e.kind === 'stalker'); delete st.tick; st.x = s.pip.x + 40; st.y = s.pip.y; st.mode = 'hunt'; window.__st = st; });
await wait(page, 500);
const stMode = await ev(() => window.__st.mode);
check('III: stalker recoils from Pip\'s light', stMode === 'flee' || !(await ev(() => window.__st.alive)), stMode);
// cocoon
sx = await segX(page, 3);
await tp(page, sx + 27, 18);
await ev(() => { window.__BTH.scene.player.facing = 1; });
await tap(page, 'KeyX', 40);
await wait(page, 500);
const c1 = await ev(() => window.__BTH.scene.cocoons[0].alive);
await page.keyboard.down('KeyX');
await wait(page, 900);
await page.keyboard.up('KeyX');
await wait(page, 600);
const c2 = await ev(() => window.__BTH.scene.cocoons[0].alive);
check('III: web cocoon ignores a normal shot but breaks on a charged blast', c1 && !c2, `after tap alive=${c1}, after charge alive=${c2}`);
// stalactite falls when walked under
await startLevel(page, 2);
await freezeEnemies();
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 0);
await tp(page, sx + 9, 18);
await hold(page, ['ArrowRight'], 500);
await wait(page, 900);
const rock = await ev(() => window.__BTH.scene.rocks[0].mode);
check('III: stalactite shakes loose when Elias passes beneath', rock !== 'hang', rock);
// Pip through the crack (seg 5)
sx = await segX(page, 5);
await ev(() => window.__BTH.godMode(true));
await tp(page, sx + 12, 5);
await closeLog(page);
await tap(page, 'KeyQ', 80);
await wait(page, 3500);
s = await state(page);
check('III: Pip slips through the crack and opens the final gate', s.doors.at(-1).open, JSON.stringify(s.doors.at(-1)) + ` paused=${s.paused} overlay=${s.overlay} pip=${s.pip.mode}`);

// ---------------------------------------------------------------- Chapter IV
await startLevel(page, 3);
await freezeEnemies();
sx = await segX(page, 0);
await tp(page, sx + 16, 16);
await wait(page, 1500);
s = await state(page);
const air = await ev(() => window.__BTH.scene.player.air);
check('IV: Elias swims in water and spends air while submerged', s.player.state === 'swim' && air < 1, `state=${s.player.state} air=${air.toFixed(2)}`);
await page.keyboard.down('ArrowUp');
await wait(page, 1600);
await page.keyboard.up('ArrowUp');
const air2 = await ev(() => window.__BTH.scene.player.air);
check('IV: surfacing refills air', air2 > air, `${air.toFixed(2)} -> ${air2.toFixed(2)}`);
await wait(page, 1500);
const crate = await ev(() => { const s = window.__BTH.scene; const c = s.crates[0]; return { y: c.body.center.y, inWater: s.level.waterAtWorld(c.body.center.x, c.body.center.y + 20), surf: 16 * 32 }; });
check('IV: crates float at the surface', Math.abs(crate.y - crate.surf) < 40, JSON.stringify(crate));
// Tide Warden lured by Pip
sx = await segX(page, 2);
await ev(() => window.__BTH.godMode(true));
await ev(() => { const g = window.__BTH.scene.enemies.find((e) => e.kind === 'guardian'); delete g.tick; window.__g = g; });
await tp(page, sx + 12, 15);
await ev(() => { window.__BTH.scene.player.facing = -1; });
const gx0 = await ev(() => window.__g.x);
await tap(page, 'KeyQ', 80);
await wait(page, 2500);
const gs = await ev(() => ({ x: window.__g.x, mode: window.__g.mode }));
check('IV: the Tide Warden follows Pip\'s song', gs.mode === 'lured' && gs.x < gx0 - 40, `x ${gx0.toFixed(0)} -> ${gs.x.toFixed(0)} mode=${gs.mode}`);

// ---------------------------------------------------------------- Chapter V
await startLevel(page, 4);
await ev(() => window.__BTH.scene.enemies.forEach((e) => { if (e.kind !== 'boss') { e.tick = () => {}; e.contactDamage = 0; } }));
sx = await segX(page, 0);
await ev((x) => { const p = window.__BTH.scene.player; p.body.reset(x, 19 * 32 + 20); }, (sx + 12) * 32);
await wait(page, 600);
s = await state(page);
check('V: acid burns and respawns Elias on safe ground', s.player.hp < 5 && s.player.y <= 19 * 32, `hp=${s.player.hp} y=${s.player.y}`);
// boss fight with god mode: hit the core when open
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 3);
await tp(page, sx + 10, 18);
await wait(page, 4500);
s = await state(page);
check('V: boss intro plays and the fight begins', s.boss && ['chase', 'windup', 'slam', 'open', 'roar', 'charge'].includes(s.boss.mode), JSON.stringify(s.boss));
let opened = false, damaged = false;
const bhp0 = s.boss.hp;
await ev(() => { window.__BTH.scene.enemies.filter((e) => e.kind === 'crawler').forEach((e) => e.die()); });
for (let i = 0; i < 160 && !damaged; i++) {
  await ev(() => { const s = window.__BTH.scene; const b = s.boss; if (b.alive && b.mode === 'chase' && b.attackCd > 0.3) b.attackCd = 0; s.player.facing = b.x > s.player.x ? 1 : -1; });
  const b = await ev(() => ({ mode: window.__BTH.scene.boss.mode, hp: window.__BTH.scene.boss.hp }));
  if (b.mode === 'open') {
    opened = true;
    for (let k = 0; k < 6; k++) { await tap(page, 'KeyX', 40); await wait(page, 120); }
    damaged = (await ev(() => window.__BTH.scene.boss.hp)) < bhp0;
  }
  await wait(page, 100);
}
check('V: boss exposes its core after attacking and takes core damage', opened && damaged, `opened=${opened} hp=${bhp0}->${await ev(() => window.__BTH.scene.boss.hp)}`);
await ev(() => { const s = window.__BTH.scene; const b = s.boss; b.hp = 1; b.phase = 3; b.setMode('open'); b.stateT = -4; const p = s.player; p.body.reset(b.x + b.facing * 170, b.y); p.setPState('ground'); p.charging = false; p.facing = -b.facing; });
await wait(page, 300);
await wait(page, 100);
await ev(() => { const S = window.__BTH.scene; const b = S.boss; window.__hits = []; const obh = S.boltHitsEnemy.bind(S); S.boltHitsEnemy = (bolt, e) => { window.__hits.push([e.kind, Math.round(bolt.x), Math.round(bolt.body.x), bolt.body.width, Math.round(e.body.x), e.body.width, Math.round(e.x)]); return obh(bolt, e); }; const sb = window.__BTH.scene.spawnBolt.bind(window.__BTH.scene); window.__spawned = 0; window.__BTH.scene.spawnBolt = (...a) => { window.__spawned++; return sb(...a); }; });
console.log('pre-shot', JSON.stringify(await ev(() => { const s = window.__BTH.scene, b = s.boss, p = s.player; return { body: [b.body.x, b.body.width, b.body.offset.x, b.scaleX, b.displayOriginX, b.frame.name, b.flipX], bx: b.x, bf: b.facing, core: b.corePos(), px: p.x, py: p.y, pf: p.facing, ps: p.state, ch: p.charging, paused: s.scene.isPaused(), cut: s.cutscene }; })));
for (let k = 0; k < 8; k++) { await tap(page, 'KeyX', 40); await wait(page, 150); }
console.log('post-shot', JSON.stringify(await ev(() => { const s = window.__BTH.scene, b = s.boss, p = s.player; return { hp: b.hp, bx: b.x, px: p.x, pf: p.facing, ps: p.state, bolts: s.bolts.getLength(), hits: window.__hits, spawned: window.__spawned, open: b.coreOpen, mode: b.mode }; })));
await wait(page, 2500);
s = await state(page);
check('V: defeating the Guardian opens the way home', s.boss && !s.boss.alive && s.doors.at(-1).open, JSON.stringify(s.boss) + JSON.stringify(s.doors.at(-1)));
await autopilotRight(page, 5600, { maxMs: 12000 });
await wait(page, 3500);
const sc = await ev(() => window.__game.scene.getScenes(true).map((x) => x.scene.key));
check('V: reaching the rift rolls the ending', sc.includes('Ending'), sc.join(','));
check('no runtime errors', errors.length === 0, errors.slice(0, 5).join('\n'));
const fails = summary();
await browser.close();
process.exit(fails ? 1 : 0);
