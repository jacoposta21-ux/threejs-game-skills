import { boot, startLevel, state, tp, segX, hold, tap, wait, check, summary, closeLog, walk } from './harness.mjs';
const { browser, page, errors } = await boot();
const ev = (fn, arg) => page.evaluate(fn, arg);
const freeze = () => ev(() => window.__BTH.scene.enemies.forEach((e) => { if (e.kind !== 'boss') { e.tick = () => {}; e.contactDamage = 0; } }));

// ---------------- Part 1 · Roots: the Light Thread
await startLevel(page, 14);
await freeze();
await ev(() => window.__BTH.godMode(true));
let sx = await segX(page, 0);
await tp(page, sx + 10, 18);
await page.keyboard.down('ArrowRight');
await wait(page, 150);
await page.keyboard.down('Space'); await wait(page, 250); await page.keyboard.up('Space');
await tap(page, 'KeyF', 60);
await wait(page, 200);
let st = await ev(() => window.__BTH.scene.player.state);
check('IV-1: F catches the nearest glowing node (Light Thread)', st === 'swing', st);
// swing node to node across the chasm: let go while rising forward, catch the next node; after the last node, fly to the ledge
const lastNodeX = await ev(() => Math.max(...window.__BTH.scene.hooks.filter((h) => h.x < 40 * 32).map((h) => h.x)));
let crossed = false;
for (let i = 0; i < 200 && !crossed; i++) {
  const s = await ev(() => { const p = window.__BTH.scene.player; return { x: p.x, st: p.state, vx: p.body.velocity.x, vy: p.body.velocity.y, ax: p.anchor ? p.anchor.x : 0 }; });
  if (s.st === 'swing' && s.x > s.ax + 40 && s.vx > 150 && s.vy < -60) await tap(page, 'Space', 30);
  else if (s.st === 'air' && s.vy > -100 && s.x < lastNodeX - 20) await tap(page, 'KeyF', 30);
  crossed = s.x > (sx + 31) * 32 && s.st === 'ground';
  await wait(page, 30);
}
await page.keyboard.up('ArrowRight');
let s = await state(page);
check('IV-1: swinging from node to node crosses the root chasm', crossed, `x=${s.player.x} state=${s.player.state} hp=${s.player.hp}`);

// ---------------- Part 2 · Sea of Sap: Lucimanti drift to Pip
await startLevel(page, 15);
await ev(() => window.__BTH.godMode(true));
const j0 = await ev(() => { const s = window.__BTH.scene; const j = s.enemies.find((e) => e.kind === 'jelly'); window.__j = j; return Phaser.Math.Distance.Between(j.x, j.y, s.pip.x, s.pip.y); });
await ev(() => { const s = window.__BTH.scene; s.pip.update = () => {}; s.pip.x = window.__j.x - 200; s.pip.y = window.__j.y; });
await wait(page, 300);
const d1 = await ev(() => Phaser.Math.Distance.Between(window.__j.x, window.__j.y, window.__BTH.scene.pip.x, window.__BTH.scene.pip.y));
await wait(page, 1500);
const d2 = await ev(() => Phaser.Math.Distance.Between(window.__j.x, window.__j.y, window.__BTH.scene.pip.x, window.__BTH.scene.pip.y));
check('IV-2: a Lucimante drifts toward Pip’s light', d2 < d1 - 20, `${d1.toFixed(0)} -> ${d2.toFixed(0)}`);

// ---------------- Part 4 · Sanctuary: Ilse
await startLevel(page, 17);
await freeze();
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 0);
await walk(page, ['ArrowRight'], 2500);
const il = await ev(() => { const s = window.__BTH.scene; return { ix: s.ilse.x, px: s.player.x, mode: s.ilse.mode }; });
check('IV-4: Ilse follows Elias', il.mode === 'follow' && Math.abs(il.ix - il.px) < 200 && il.ix > (sx + 8) * 32, JSON.stringify(il));
sx = await segX(page, 1);
await tp(page, sx + 24, 18);
await ev(() => { const s = window.__BTH.scene; s.ilse.body.reset(s.player.x - 60, s.player.y); });
let ch = false;
for (let i = 0; i < 60 && !ch; i++) { await wait(page, 100); ch = (await ev(() => window.__BTH.scene.ilse.mode)) === 'channel'; }
const shades = await ev(() => window.__BTH.scene.enemies.filter((e) => e.prey).length);
let opened = false;
for (let i = 0; i < 80 && !opened; i++) { await wait(page, 100); opened = await ev(() => window.__BTH.scene.doors.find((d) => d.ritual).open); }
check('IV-4: at the Keeper door Ilse channels, shades come for her, and the door opens', ch && shades >= 2 && opened, `channel=${ch} shades=${shades} open=${opened}`);
await ev(() => { const s = window.__BTH.scene; s.ilse.invuln = 0; s.ilse.hurt(99); });
await wait(page, 2500);
const over = await ev(() => window.__game.scene.getScene('UI').overlay?.getData('kind'));
check('IV-4: if Ilse falls, it is game over', over === 'gameover', String(over));
await ev(() => window.__game.scene.getScene('UI').closeOverlay());

// ---------------- Part 5 · The Heart of Shadow
await startLevel(page, 18);
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 1);
await tp(page, sx + 12, 18);
await wait(page, 5000);
s = await state(page);
const dark = await ev(() => window.__BTH.scene.darkNodes());
check('IV-5: the fight begins and the Shadow infects three nodes', s.boss && s.boss.mode === 'p1' && dark === 3, `${JSON.stringify(s.boss)} dark=${dark}`);
const hp0 = s.boss.hp;
await ev(() => { const s = window.__BTH.scene; const n = s.hooks.find((h) => h.dark); s.player.body.reset(n.x, n.y + 120); s.player.attach(n); });
await wait(page, 3200);
const hp1 = await ev(() => window.__BTH.scene.boss.hp);
check('IV-5: hanging from an infected node purifies it and wounds the Heart', hp1 < hp0 && (await ev(() => window.__BTH.scene.darkNodes())) === 2, `hp ${hp0}->${hp1}`);
await ev(() => { const s = window.__BTH.scene; s.player.releaseSwing(false); s.hooks.filter((h) => h.dark).forEach((h) => { h.setDark(false); s.boss.nodePurified(); }); });
const mode2 = await ev(() => window.__BTH.scene.boss.mode);
// time wave: harmless in the other time
await ev(() => { const s = window.__BTH.scene; if (s.past) s.toggleEco(); s.player.hp = 5; s.player.maxHp = 5; s.player.invuln = 0; s.spawnTimeWave(s.player.x + 60, true); });
await wait(page, 600);
const hpAfterPastWave = (await state(page)).player.hp;
await ev(() => { const s = window.__BTH.scene; s.player.invuln = 0; s.spawnTimeWave(s.player.x + 60, false); });
await wait(page, 600);
const hpAfterPresentWave = (await state(page)).player.hp;
check('IV-5: phase 2 — a wave of the past passes through Elias in the present; one of the present hurts', mode2 === 'p2' && hpAfterPastWave === 5 && hpAfterPresentWave < 5, `mode=${mode2} hp ${hpAfterPastWave}/${hpAfterPresentWave}`);
await ev(() => window.__BTH.godMode(true));
await ev(() => { const b = window.__BTH.scene.boss; b.waves = 5; b.waveT = 0; });
let open = false;
for (let i = 0; i < 40 && !open; i++) { await wait(page, 100); open = await ev(() => window.__BTH.scene.boss.coreOpen); }
check('IV-5: after a volley the core tears open', open);
await ev(() => { const b = window.__BTH.scene.boss; b.hp = b.maxHp * 0.25; });
await wait(page, 600);
const pc = await ev(() => ({ pc: window.__BTH.scene.pipControl, motes: window.__BTH.scene.motes.length, st: window.__BTH.scene.player.state }));
check('IV-5: phase 3 — Elias is struck down and you fly Pip', pc.pc && pc.motes === 3 && pc.st === 'cutscene', JSON.stringify(pc));
// fly Pip to each mote with the arrows
for (let m = 0; m < 3; m++) {
  for (let i = 0; i < 120; i++) {
    const g = await ev(() => { const s = window.__BTH.scene; const mo = s.motes[0]; if (!mo) return null; return { dx: mo.x - s.pip.x, dy: mo.y - s.pip.y }; });
    if (!g) break;
    const keys = [];
    if (g.dx > 12) keys.push('ArrowRight'); else if (g.dx < -12) keys.push('ArrowLeft');
    if (g.dy > 12) keys.push('ArrowDown'); else if (g.dy < -12) keys.push('ArrowUp');
    for (const k of keys) await page.keyboard.down(k);
    await wait(page, 80);
    for (const k of keys) await page.keyboard.up(k);
  }
}
await wait(page, 500);
const back = await ev(() => ({ pc: window.__BTH.scene.pipControl, st: window.__BTH.scene.player.state, ilse: !!window.__BTH.scene.ilse }));
check('IV-5: Pip gathers the three lights and Elias rises', !back.pc && back.st !== 'cutscene' && back.ilse, JSON.stringify(back));
let held = false;
for (let i = 0; i < 120 && !held; i++) { await wait(page, 100); held = (await ev(() => window.__BTH.scene.boss.mode)) === 'p3final'; }
check('IV-5: Ilse reaches the Seed and holds the core open', held);
await ev(() => { const s = window.__BTH.scene, b = s.boss; s.player.body.reset(b.x - 160, 19 * 32); s.player.facing = 1; b.hp = 1; });
await wait(page, 300);
for (let k = 0; k < 10; k++) { await page.keyboard.down('ArrowUp'); await tap(page, 'KeyX', 40); await page.keyboard.up('ArrowUp'); await wait(page, 150); }
await wait(page, 2500);
s = await state(page);
check('IV-5: the Heart of Shadow falls', s.boss && !s.boss.alive, JSON.stringify(s.boss));
await walk(page, ['ArrowRight'], 15000);
await wait(page, 4000);
const sc = await ev(() => window.__game.scene.getScenes(true).map((x) => x.scene.key));
check('IV-5: the final ending plays', sc.includes('Ending'), sc.join(','));
check('no runtime errors', errors.length === 0, errors.slice(0, 4).join('\n'));
const fails = summary();
await browser.close();
process.exit(fails ? 1 : 0);
