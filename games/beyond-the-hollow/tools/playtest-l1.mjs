import { boot, startLevel, state, tp, segX, hold, tap, wait, check, summary } from './harness.mjs';
const { browser, page, errors } = await boot();
await startLevel(page, 0);
await page.evaluate(() => window.__BTH.scene.enemies.forEach((e) => e.kind === 'crawler' && e.x > 1500 && e.x < 2100 && (e.tick = () => {})));
let s = await state(page);
const x0 = s.player.x;
await hold(page, ['ArrowRight'], 900);
s = await state(page);
check('run right moves Elias', s.player.x - x0 > 120, `dx=${s.player.x - x0}`);
// jump
const y0 = s.player.y;
await page.keyboard.down('Space');
await wait(page, 220);
let s2 = await state(page);
await page.keyboard.up('Space');
check('jump leaves the ground', y0 - s2.player.y > 40 && s2.player.state === 'air', `dy=${y0 - s2.player.y}`);
await wait(page, 900);
s = await state(page);
check('lands again', s.player.state === 'ground');
// pit jump (seg 0 pit at cols 19..22)
let sx = await segX(page, 0);
await tp(page, sx + 16, 18);
await page.keyboard.down('ArrowRight');
await wait(page, 230);
await page.keyboard.down('Space');
await wait(page, 380);
await page.keyboard.up('Space');
await wait(page, 600);
await page.keyboard.up('ArrowRight');
await wait(page, 400);
s = await state(page);
check('clears the spike pit', s.player.x > (sx + 23) * 32 && s.player.hp === 5, `x=${s.player.x} hp=${s.player.hp}`);
// crouch tunnel seg 1 cols 16..23 row 18
sx = await segX(page, 1);
await tp(page, sx + 13, 18);
await hold(page, ['ArrowRight'], 1200);
s = await state(page);
check('standing blocked by low vent', s.player.x < (sx + 16) * 32 + 4, `x=${s.player.x} wall=${(sx + 16) * 32}`);
await page.keyboard.down('ArrowDown');
await hold(page, ['ArrowRight'], 3600);
await page.keyboard.up('ArrowDown');
await wait(page, 300);
s = await state(page);
check('crouch-crawls through the vent', s.player.x > (sx + 24) * 32, `x=${s.player.x}`);
// ladder col 13 rows 9..18
await tp(page, sx + 13, 18);
await hold(page, ['KeyW'], 2600);
s = await state(page);
check('climbs the ladder', s.player.y < 11 * 32, `y=${s.player.y} state=${s.player.state}`);
await hold(page, ['KeyD'], 700);
await wait(page, 300);
s = await state(page);
check('steps off the ladder top onto the platform', s.player.state === 'ground' && s.player.y <= 9 * 32 + 2, `y=${s.player.y} state=${s.player.state}`);
// shooting the crawler in seg 1 (col 32 floor)
const sx4 = await segX(page, 4);
const all = (await state(page)).enemies; const cr = all.find((e) => e.kind === 'crawler' && Math.abs(e.y - 607) < 3);
await page.evaluate((x) => { const c = window.__BTH.scene.enemies.find((e) => Math.abs(e.x - x) < 2); c.tick = () => {}; }, cr.x);
await tp(page, Math.floor(cr.x / 32) + 6, 18);
await page.evaluate(() => { window.__BTH.scene.player.facing = -1; });
await hold(page, ['ArrowLeft'], 50);
const before = (await state(page)).enemies.filter((e) => e.alive).length;
for (let i = 0; i < 8; i++) { await tap(page, 'KeyX', 50); await wait(page, 150); }
await wait(page, 600);
s = await state(page);
check('Lumen Coil kills a crawler', s.enemies.filter((e) => e.alive).length < before, `alive ${before} -> ${s.enemies.filter((e) => e.alive).length}`);
// crate + plate + door (seg 3)
sx = await segX(page, 3);
await page.evaluate(() => window.__BTH.godMode(true));
await tp(page, sx + 10, 18);
for (let i = 0; i < 30; i++) {
  await hold(page, ['ArrowRight'], 120);
  if ((await state(page)).doors[0].open) break;
}
await wait(page, 600);
s = await state(page);
check('pushed crate holds the door open', s.doors[0].open, JSON.stringify(s.doors[0]));
await page.keyboard.down('ArrowUp'); // jump over crate
await hold(page, ['ArrowRight'], 400);
await page.keyboard.up('ArrowUp');
await hold(page, ['ArrowRight'], 2600);
s = await state(page);
check('walks through the opened door', s.player.x > (sx + 31) * 32, `x=${s.player.x} door=${(sx + 30) * 32}`);
// ledge grab (seg 4 block cols 28..33 rows 15..18)
sx = await segX(page, 4);
await tp(page, sx + 25, 18);
await page.keyboard.down('ArrowRight');
await wait(page, 120);
await page.keyboard.down('Space');
await wait(page, 450);
await page.keyboard.up('Space');
await wait(page, 300);
s = await state(page);
const grabbed = s.player.state === 'ledge' || s.player.state === 'ledgeup' || s.player.y <= 15 * 32 + 2;
await page.keyboard.up('ArrowRight');
await tap(page, 'KeyW', 100);
await wait(page, 700);
s2 = await state(page);
check('grabs and climbs the high ledge', grabbed && s2.player.y <= 15 * 32 + 2, `grab=${grabbed} y=${s2.player.y} state=${s2.player.state}`);
// Pip mechanism + gate + exit (seg 5)
sx = await segX(page, 5);
await tp(page, sx + 18, 18);
await tap(page, 'KeyQ', 80);
await wait(page, 3500);
s = await state(page);
check('Pip activates the ancient mechanism and opens the gate', s.doors[s.doors.length - 1].open, JSON.stringify(s.doors.at(-1)) + ' pip=' + s.pip.mode);
await hold(page, ['ArrowRight'], 2500);
s = await state(page);
check('reaching the rift completes the chapter', s.finished, `x=${s.player.x}`);
await wait(page, 3500);
const scenes = await page.evaluate(() => window.__game.scene.getScenes(true).map((x) => x.scene.key));
check('chapter II story card follows', scenes.includes('Story'), scenes.join(','));
check('no runtime errors', errors.length === 0, errors.join('\n'));
const fails = summary();
await browser.close();
process.exit(fails ? 1 : 0);
