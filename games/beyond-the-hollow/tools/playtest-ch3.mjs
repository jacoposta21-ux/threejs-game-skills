import { boot, startLevel, state, tp, segX, hold, tap, wait, check, summary, closeLog, walk } from './harness.mjs';
const { browser, page, errors } = await boot();
const ev = (fn, arg) => page.evaluate(fn, arg);
const freeze = () => ev(() => window.__BTH.scene.enemies.forEach((e) => { if (e.kind !== 'boss') { e.tick = () => {}; e.contactDamage = 0; } }));

// ---------------- Part 1 · Deep Threshold: Echo
await startLevel(page, 9);
await freeze();
await ev(() => window.__BTH.godMode(true));
let sx = await segX(page, 0);
const solidPresent = await ev(() => window.__BTH.scene.ecoBlocks.filter((b) => b.pastOnly).every((b) => !b.img.body.enable));
await tp(page, sx + 7, 18);
await closeLog(page);
await tap(page, 'KeyR', 80);
await wait(page, 500);
const past = await ev(() => window.__BTH.scene.past);
const solidPast = await ev(() => window.__BTH.scene.ecoBlocks.filter((b) => b.pastOnly).every((b) => b.img.body.enable));
check('III-1: R toggles Pip’s Echo; past-only stones become solid only in the past', solidPresent && past && solidPast, `present=${solidPresent} past=${past} solid=${solidPast}`);
await walk(page, ['ArrowRight'], 3200);
let s = await state(page);
check('III-1: Elias walks across the bridge of the past', s.player.x > (sx + 23) * 32 && s.player.hp > 900, `x=${s.player.x} hp=${s.player.hp}`);
// refuse switching inside a block
await ev(() => { const s = window.__BTH.scene; const b = s.ecoBlocks.find((b) => !b.pastOnly); s.player.body.reset(b.s.x, b.s.y); });
await wait(page, 100);
const before = await ev(() => window.__BTH.scene.past);
await tap(page, 'KeyR', 80);
await wait(page, 300);
check('III-1: Echo refuses to bring a block back on top of Elias', (await ev(() => window.__BTH.scene.past)) === before);
// updraft
sx = await segX(page, 1);
await tp(page, sx + 3, 18);
await ev(() => { if (window.__BTH.scene.past) window.__BTH.scene.toggleEco(); });
await tp(page, sx + 11, 18);
let minY = 9999;
for (let i = 0; i < 20; i++) { minY = Math.min(minY, (await state(page)).player.y); await wait(page, 100); }
check('III-1: rising spores lift Elias toward the ceiling', minY < 8 * 32, `minY=${minY}`);
// present-only rubble blocks the wall top; in the past it is gone
await tp(page, sx + 17, 7);
await hold(page, ['ArrowRight'], 900);
const blockedX = (await state(page)).player.x;
await tap(page, 'KeyR', 80);
await wait(page, 400);
await hold(page, ['ArrowRight'], 900);
const passX = (await state(page)).player.x;
check('III-1: rubble of the present stops Elias, the past lets him through', blockedX < (sx + 20) * 32 && passX > (sx + 21) * 32, `blocked=${blockedX} after=${passX}`);
// veiled shade splits
await ev(() => { const s = window.__BTH.scene; const v = s.enemies.find((e) => e.veiled); window.__v = v; v.hp = 0.1; v.hit(1, v.x - 10, false); });
await wait(page, 300);
const smalls = await ev(() => window.__BTH.scene.enemies.filter((e) => e.small && e.alive).length);
check('III-1: a Veiled Shade splits into two small shades', smalls === 2, `small=${smalls}`);

// ---------------- Part 2 · Gardens: mimic + vine
await startLevel(page, 10);
await ev(() => { window.__BTH.scene.enemies.forEach((e) => { if (e.kind !== 'mimic') e.tick = () => {}; }); });
sx = await segX(page, 0);
await ev(() => { const s = window.__BTH.scene; const m = s.enemies.find((e) => e.kind === 'mimic'); window.__m = m; s.player.hp = 5; s.player.invuln = 0; s.player.body.reset(m.x - 90, 19 * 32); });
await hold(page, ['ArrowRight'], 500);
await wait(page, 400);
s = await state(page);
check('III-2: a Mimic cap bites when Elias walks up to it', s.player.hp < 5, `hp=${s.player.hp} mode=${await ev(() => window.__m.mode)}`);
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 1);
await tp(page, sx + 4, 18);
await ev(() => { window.__BTH.scene.player.facing = 1; });
await tap(page, 'KeyX', 40);
await wait(page, 600);
const g1 = await ev(() => window.__BTH.scene.buds[0].grown);
await page.keyboard.down('KeyX'); await wait(page, 900); await page.keyboard.up('KeyX');
await wait(page, 1500);
const g2 = await ev(() => window.__BTH.scene.buds[0].grown);
await tp(page, sx + 8, 18);
await hold(page, ['KeyW'], 3800);
s = await state(page);
check('III-2: a charged blast grows the seed into a climbable vine', !g1 && g2 && s.player.y < 9 * 32, `afterTap=${g1} afterCharge=${g2} y=${s.player.y}`);

// ---------------- Part 3 · Quarter: crate through both times, Broken Keeper
await startLevel(page, 11);
await freeze();
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 1);
await tp(page, sx + 4, 18);
// present: the rubble (q) stops the crate; in the past it can pass, then the past wall (Q) stops it until we return
for (let i = 0; i < 14; i++) await hold(page, ['ArrowRight'], 120);
const c1 = await ev(() => Math.round(window.__BTH.scene.crates[0].body.right));
await tap(page, 'KeyR', 80); await wait(page, 300);
for (let i = 0; i < 14; i++) await hold(page, ['ArrowRight'], 120);
const c2 = await ev(() => Math.round(window.__BTH.scene.crates[0].body.right));
await tap(page, 'KeyR', 80); await wait(page, 300);
let opened = false;
for (let i = 0; i < 30 && !opened; i++) { await hold(page, ['ArrowRight'], 120); opened = (await state(page)).doors[0].open; }
check('III-3: the crate crosses the rubble in the past and the wall in the present, then opens the door', c1 < (sx + 15) * 32 + 2 && c2 > (sx + 16) * 32 && opened, `c1=${c1} c2=${c2} open=${opened}`);
const k = await ev(() => { const k = window.__BTH.scene.enemies.find((e) => e.key === 'keeper'); return k ? { hp: k.hp, sc: k.sc } : null; });
check('III-3: the Broken Keeper stands guard', !!k && k.hp === 22, JSON.stringify(k));

// ---------------- Part 4 · Archive: lanterns keep shades away
await startLevel(page, 12);
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 0);
await tp(page, sx + 6, 18);
await closeLog(page);
await tap(page, 'KeyQ', 80);
let lit = false;
for (let i = 0; i < 40 && !lit; i++) { await wait(page, 100); lit = await ev(() => window.__BTH.scene.lanterns.some((l) => l.lit)); }
check('III-4: Pip lights a Keeper lantern', lit);
await ev(() => { const s = window.__BTH.scene; const l = s.lanterns.find((l) => l.lit); const sh = s.enemies.find((e) => e.kind === 'stalker'); delete sh.tick; sh.x = l.s.x + 60; sh.y = l.ly; sh.mode = 'hunt'; window.__sh = sh; });
await wait(page, 500);
check('III-4: shades recoil from a lit lantern', (await ev(() => window.__sh.mode)) === 'flee' || !(await ev(() => window.__sh.alive)), await ev(() => window.__sh.mode));

// ---------------- Part 5 · The First Shadow
await startLevel(page, 13);
await ev(() => window.__BTH.godMode(true));
sx = await segX(page, 1);
await tp(page, sx + 12, 18);
await wait(page, 4500);
s = await state(page);
check('III-5: the First Shadow rises and the fight begins', s.boss && s.boss.mode !== 'intro', JSON.stringify(s.boss));
const hp0 = s.boss.hp;
await ev(() => { const s = window.__BTH.scene, b = s.boss; s.lanterns.forEach((l) => l.setLit(false, true)); b.tick = () => { b.coreOpen = b.exposed(); }; b.body.setVelocity(0, 0); b.x = s.player.x + 160; b.y = s.player.y - 60; b.body.reset(b.x, b.y); s.player.facing = 1; });
for (let i = 0; i < 4; i++) { await tap(page, 'KeyX', 40); await wait(page, 180); }
const hpDark = await ev(() => window.__BTH.scene.boss.hp);
await ev(() => { const s = window.__BTH.scene, b = s.boss; const [ax, bx] = s.bossArena; const l = s.lanterns.filter((l) => l.s.ty === 18 && l.s.x > ax + 200 && l.s.x < bx - 80)[0]; l.setLit(true, true); b.x = l.s.x + 40; b.y = l.ly - 10; b.body.reset(b.x, b.y); s.player.body.reset(l.s.x - 180, 19 * 32); s.player.facing = 1; });
await wait(page, 200);
for (let i = 0; i < 4; i++) { await tap(page, 'KeyX', 40); await wait(page, 180); }
const hpLit = await ev(() => window.__BTH.scene.boss.hp);
check('III-5: untouchable in the dark, wounded in lantern light', hpDark === hp0 && hpLit < hp0, `dark ${hp0}->${hpDark}, lit ->${hpLit}`);
await ev(() => { const s = window.__BTH.scene, b = s.boss; s.lanterns.forEach((l) => l.setLit(false, true)); b.phase = 2; if (!s.past) s.toggleEco(); b.coreOpen = b.exposed(); });
check('III-5: from phase 2 the light of the past exposes it', await ev(() => window.__BTH.scene.boss.coreOpen));
await ev(() => { const b = window.__BTH.scene.boss; b.hp = 0; b.die(); });
await wait(page, 2500);
s = await state(page);
check('III-5: the Shadow flees and the well door opens', s.doors.at(-1).open, JSON.stringify(s.doors.at(-1)));
await walk(page, ['ArrowRight'], 15000);
await wait(page, 3500);
console.log('end', JSON.stringify((await ev(() => window.__BTH?.state?.()))?.player));
const sc = await ev(() => window.__game.scene.getScenes(true).map((x) => x.scene.key));
check('III-5: the rift rolls the Chapter III ending', sc.includes('Ending'), sc.join(','));
check('no runtime errors', errors.length === 0, errors.slice(0, 4).join('\n'));
const fails = summary();
await browser.close();
process.exit(fails ? 1 : 0);
