import { expect, test, type Page } from '@playwright/test';
import { installDriver } from './helpers';

/**
 * Start-to-finish playthrough: main menu -> Bedroom -> Kitchen -> Attic -> ending.
 * Every puzzle is solved through the real systems (autopilot movement with collision,
 * Space climbs, push/drag, E interactions, LUMO placement). THE HUSH still spawns and
 * runs its scripts, but its sight is disabled so the run is deterministic.
 */

test.describe.configure({ mode: 'serial' });
test.setTimeout(1_800_000);
test.use({ viewport: { width: 480, height: 270 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('littlenight.settings.v1')) {
      localStorage.setItem('littlenight.settings.v1', JSON.stringify({ version: 1, master: 0.5, music: 0.5, sfx: 0.5, sensitivity: 1, invertY: false, quality: 'low', subtitles: true }));
    }
  });
});

type Log = string[];

async function run(page: Page, label: string, body: string): Promise<Log> {
  const log = (await page.evaluate(`(async () => { const L = window.__LN__; const T = window.__T; const log = []; const ok = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) throw new Error(m + ' :: ' + JSON.stringify(L.state().pos) + ' prompt=' + L.state().prompt + ' log=' + JSON.stringify(log)); };
    ${body}
    return log; })()`)) as Log;
  console.log(`\n[${label}]\n${log.join('\n')}`);
  return log;
}

const blindHush = `
  const h = L.game.enemies.hush; if (h) { h.blind = true; }
`;

test('complete playthrough from the main menu to the ending', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => (window as unknown as { __LN__?: unknown }).__LN__);
  await page.locator('.menus button[data-act="new"]').waitFor({ timeout: 20000 });
  await page.locator('.menus button[data-act="new"]').click();
  await page.waitForFunction(() => (window as any).__LN__.state().state === 'playing', null, { timeout: 15000 });
  await installDriver(page);
  await page.evaluate(() => (window as any).__LN__.setSpeed(4));

  // ---------------------------------------------------------------- Chapter 1
  await run(page, 'bedroom: wake, find LUMO', `
    ${blindHush}
    ok(L.state().chapter === 'bedroom', 'starts in the bedroom');
    await T.wait(600);
    let r = await T.walk(-0.9, -1.1); ok(r.ok, 'climbs down from the bed and walks');
    await T.wait(700);
    ok(L.state().pos[1] < 0.05, 'standing on the floor');
    r = await T.walk(1.62, -1.1); ok(r.ok, 'walks to the dresser');
    let u = await T.useId('dresser-0'); ok(/Open/.test(u.prompt || ''), 'drawer prompt: ' + u.prompt);
    await T.wait(700);
    ok(L.state().flags['drawer:dresser-0'] === true, 'drawer opened');
    u = await T.useId('lumo'); ok(/firefly/.test(u.prompt || ''), 'LUMO pickup prompt: ' + u.prompt);
    await T.wait(400); await T.skip(); await T.wait(300);
    ok(L.state().lumo.found, 'LUMO found and awake');
    ok(L.state().checkpoint === 'lumo', 'checkpoint after finding LUMO');
  `);
  await run(page, 'bedroom: climb to the Nest and charge', `
    let r = await T.walk(-1.55, 1.2); ok(r.ok, 'walks to the toy box');
    L.setYaw(Math.PI / 2, 0); await T.wait(100);
    let p = await T.jump(); ok(p[1] > 0.4, 'climbed onto the toy box y=' + p[1]);
    L.setYaw(Math.PI / 2, 0); await T.wait(100);
    p = await T.jump(); ok(p[1] > 1.1, 'climbed onto the shelf y=' + p[1]);
    const u = await T.useId('nest-bedroom'); ok(/Nest/.test(u.prompt || ''), 'nest prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().lumo.energy >= 99.5, 9000), 'LUMO charged to full');
    L.press('lumo'); await T.wait(900);
    ok(L.state().lumo.state === 'follow', 'LUMO recalled');
    r = await T.walk(-1.4, 0.4); ok(L.state().pos[1] < 0.05, 'back on the floor');
  `);
  await run(page, 'bedroom: push the toy chest to the door, open it', `
    let r = await T.walk(-0.78, 1.9); ok(r.ok, 'behind the chest');
    let u = await T.useId('chest'); ok(/Push/.test(u.prompt || ''), 'push prompt: ' + u.prompt);
    ok(L.state().mode === 'pushing', 'grabbed the chest');
    const chest = () => L.game.interactions.find('chest').base;
    ok(await T.push(-Math.PI / 2, 1, () => chest().x > 1.62), 'pushed chest east, x=' + chest().x);
    r = await T.walk(chest().x, 1.32); ok(r.ok, 'south of chest');
    u = await T.useId('chest'); ok(L.state().mode === 'pushing', 'grabbed again');
    ok(await T.push(Math.PI, 1, () => chest().z > 2.8), 'pushed chest to the door, z=' + chest().z);
    r = await T.walk(chest().x, 2.15); L.setYaw(Math.PI, 0); await T.wait(100);
    const p = await T.jump(); ok(p[1] > 0.45, 'standing on the chest');
    u = await T.useId('bedroom-door'); ok(u.prompt === 'Open', 'door prompt from the chest: ' + u.prompt);
    ok(await T.waitFor(() => L.state().flags['door:bedroom-door'] === true, 3000), 'door open');
    await T.wait(1500);
    ok(await T.waitFor(() => L.state().checkpoint === 'door', 4000), 'checkpoint after the door');
  `);
  await run(page, 'bedroom: light the hallway, survive the encounter, take the chute', `
    let r = await T.walk(1.7, 3.0, { timeout: 4000 });
    r = await T.walk(1.55, 4.3); ok(r.ok, 'in the hallway');
    let u = await T.useId('hall-a'); ok(u.prompt === 'Place LUMO', 'perch A prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().lumo.state === 'perched', 4000), 'LUMO perched on A');
    r = await T.walk(-0.6, 4.4); ok(r.ok, 'walked into the lit hall');
    ok(await T.waitFor(() => L.state().hush && L.state().hush.state !== 'inactive', 9000), 'THE HUSH came up the stairs');
    ok(await T.waitFor(() => L.state().flags['ch1-encounter-done'] === true, 70000), 'THE HUSH left; encounter over');
    ok(L.state().checkpoint === 'hall', 'checkpoint after the encounter');
    // LUMO may have been snuffed by the lure: re-light the path.
    if (L.state().lumo.state !== 'perched') { L.press('lumo'); await T.wait(600); u = await T.useId('hall-a'); await T.waitFor(() => L.state().lumo.state === 'perched', 4000); }
    r = await T.walk(-2.1, 4.4); ok(L.state().hazard.grab < 0.5, 'still safe in the light');
    u = await T.useId('hall-b'); ok(/Place LUMO|Call/.test(u.prompt || ''), 'perch B prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().lumo.state === 'perched', 4000), 'LUMO perched on B');
    r = await T.walk(-5.2, 5.05); ok(r.ok, 'at the chute');
    u = await T.useId('chute'); ok(/chute/.test(u.prompt || ''), 'chute prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().chapter === 'kitchen' && L.state().state === 'playing', 20000), 'chapter 2 loaded');
  `);

  // ---------------------------------------------------------------- Chapter 2
  await run(page, 'kitchen: chair to counter, tin, key', `
    await T.wait(800);
    ${blindHush}
    L.game.enemies.hush.tuning.hearing = 0;
    ok(L.state().checkpoint === 'start', 'kitchen start checkpoint');
    let r = await T.walk(-5.9, 2.2); r = await T.walk(-3.9, 1.9); ok(r.ok, 'entered the kitchen');
    r = await T.walk(-1.6, 2.45); ok(r.ok, 'south of the east chair');
    let u = await T.useId('chair-e'); ok(L.state().mode === 'pushing', 'grabbed chair: ' + u.prompt);
    const chair = () => L.game.interactions.find('chair-e').base;
    ok(await T.push(0, 1, () => chair().z < -2.85, 12000), 'pushed chair north z=' + chair().z);
    r = await T.walk(-2.2, chair().z); ok(r.ok, 'west of chair');
    u = await T.useId('chair-e'); ok(L.state().mode === 'pushing', 'grabbed chair again');
    ok(await T.push(-Math.PI / 2, 1, () => chair().x > -0.4, 8000), 'pushed chair to the counter x=' + chair().x);
    r = await T.walk(chair().x, -2.25); L.setYaw(0, 0); await T.wait(100);
    let p = await T.jump(); ok(p[1] > 0.45, 'on the chair');
    L.setYaw(0, 0); await T.wait(100);
    p = await T.jump(); ok(p[1] > 0.9, 'on the counter (crawling)');
    ok(L.state().crawling, 'forced to crawl under the cabinets');
    u = await T.useId('bread-tin'); ok(/bread tin/.test(u.prompt || ''), 'tin prompt: ' + u.prompt);
    const tin = () => L.game.interactions.find('bread-tin').base;
    ok(await T.push(-Math.PI / 2, 1, () => tin().x > 0.5, 8000), 'pushed the bread tin aside x=' + tin().x);
    u = await T.useId('pantry-key'); ok(/key/.test(u.prompt || ''), 'key prompt: ' + u.prompt);
    ok(L.state().inventory.includes('pantry-key'), 'has the pantry key');
    await T.wait(600);
    ok(await T.waitFor(() => L.state().checkpoint === 'key', 4000), 'checkpoint after the key');
  `);
  await run(page, 'kitchen: distraction throw, pantry, perches, sack, wind key', `
    L.game.enemies.hush.tuning.hearing = 1;
    let r = await T.walk(-0.8, -2.6); ok(L.state().pos[1] < 0.05, 'climbed down');
    r = await T.walk(-1.0, 1.75); ok(r.ok, 'at the spoon');
    let u = await T.useId('spoon-a'); ok(L.state().held === 'spoon-a', 'holding the spoon: ' + u.prompt);
    L.lookAt(-4.0, 0.9, 2.8); await T.wait(100); L.press('throw'); await T.wait(1500);
    ok(L.state().held === null, 'threw the spoon');
    ok(['investigate', 'searchSpot', 'lookaround'].includes(L.state().hush.state), 'THE HUSH went to the noise: ' + L.state().hush.state);
    r = await T.walk(2.2, 1.2, { timeout: 7000 }); r = await T.walk(3.9, -2.1); ok(r.ok, 'at the pantry door');
    u = await T.useId('pantry-door'); ok(u.prompt === 'Unlock', 'unlock prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().flags['door:pantry-door'] === true, 3000), 'pantry open');
    await T.wait(1500);
    ok(await T.waitFor(() => L.state().checkpoint === 'pantry', 4000), 'checkpoint at the pantry');
    u = await T.useId('pantry-a'); ok(u.prompt === 'Place LUMO', 'pantry perch A: ' + u.prompt);
    ok(await T.waitFor(() => L.state().lumo.state === 'perched', 4000), 'perched A');
    r = await T.walk(5.4, -2.0); r = await T.walk(7.2, -2.0); ok(L.state().hazard.grab < 0.6, 'walking in the lit pantry');
    u = await T.useId('pantry-b'); ok(/Place LUMO/.test(u.prompt || ''), 'pantry perch B: ' + u.prompt);
    ok(await T.waitFor(() => L.state().lumo.state === 'perched' && L.game.lumo.anchor.id === 'pantry-b', 4000), 'perched B');
    r = await T.walk(8.1, -3.35); ok(r.ok, 'beside the flour sack');
    u = await T.useId('flour-sack'); ok(L.state().mode === 'pushing', 'grabbed sack: ' + u.prompt);
    const sack = () => L.game.interactions.find('flour-sack').base;
    ok(await T.push(-Math.PI / 2, -1, () => sack().x < 8.3, 8000), 'pulled the sack away x=' + sack().x);
    ok(L.state().flags['k-hole-found'] === true, 'hole revealed');
    r = await T.walk(8.45, -1.35); ok(r.ok, 'at the south shelf');
    u = await T.useId('wind-key'); ok(/wind key/.test(u.prompt || ''), 'wind key prompt: ' + u.prompt);
    ok(L.state().inventory.includes('wind-key'), 'has the wind key');
  `);
  await run(page, 'kitchen: escape through the hole, climb to the attic', `
    let r = await T.walk(8.95, -3.0, { crawl: true }); ok(L.state().crawling, 'crawling');
    r = await T.walk(8.95, -4.35, { timeout: 7000 }); ok(r.ok, 'crawled through the hole into the hall');
    ok(L.state().flags['k-hall'] === true, 'hall reached');
    L.press('crawl'); await T.wait(300);
    r = await T.walk(5.5, -4.45); ok(r.ok, 'at the ladder');
    const u = await T.useId('ladder'); ok(/attic/.test(u.prompt || ''), 'ladder prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().chapter === 'attic' && L.state().state === 'playing', 25000), 'chapter 3 loaded');
  `);

  // ---------------------------------------------------------------- Chapter 3
  await run(page, 'attic: graveyard perches and the spring', `
    await T.wait(800);
    ${blindHush}
    ok(L.state().inventory.includes('wind-key'), 'wind key carried into the attic');
    let r = await T.walk(-4.75, 0.9); ok(r.ok, 'at the edge of the dark');
    let u = await T.useId('attic-a'); ok(u.prompt === 'Place LUMO', 'attic perch A: ' + u.prompt);
    ok(await T.waitFor(() => L.state().lumo.state === 'perched', 4000), 'perched A');
    r = await T.walk(-3.6, 1.2); r = await T.walk(-2.6, 1.55); ok(r.ok && L.state().hazard.grab < 0.6, 'at the toy trunk, lit');
    u = await T.useId('toy-trunk'); ok(/trunk/.test(u.prompt || ''), 'trunk prompt: ' + u.prompt);
    await T.wait(500);
    u = await T.useId('spring'); ok(/spring/.test(u.prompt || ''), 'spring prompt: ' + u.prompt);
    ok(L.state().inventory.includes('spring'), 'has the spring');
    u = await T.useId('attic-b'); ok(/Place LUMO/.test(u.prompt || ''), 'attic perch B: ' + u.prompt);
    ok(await T.waitFor(() => L.state().lumo.state === 'perched' && L.game.lumo.anchor.id === 'attic-b', 4000), 'perched B');
    r = await T.walk(-2.0, 0.3); r = await T.walk(-0.6, 0.2); ok(r.ok, 'out of the graveyard');
  `);
  await run(page, 'attic: gear, crank, repair and open the gate', `
    L.press('lumo'); await T.wait(700);
    let r = await T.walk(0.0, -1.25); ok(r.ok, 'at the workbench');
    let u = await T.useId('bench-drawer'); ok(u.prompt === 'Open', 'bench drawer: ' + u.prompt);
    await T.wait(700);
    u = await T.useId('gear'); ok(/gear/.test(u.prompt || ''), 'gear prompt: ' + u.prompt);
    ok(L.state().inventory.includes('gear'), 'has the gear');
    r = await T.walk(1.25, 1.05); ok(r.ok, 'at the box tower');
    L.setYaw(-Math.PI / 2, 0); await T.wait(100); let p = await T.jump(); ok(p[1] > 0.4, 'crate 1');
    L.setYaw(-Math.PI / 2, 0); await T.wait(100); p = await T.jump(); ok(p[1] > 0.8, 'crate 2');
    L.setYaw(-Math.PI / 2, 0); await T.wait(100); p = await T.jump(); ok(p[1] > 1.15, 'top of the tower');
    u = await T.useId('crank'); ok(/crank/.test(u.prompt || ''), 'crank prompt: ' + u.prompt);
    ok(L.state().inventory.includes('crank'), 'has the crank');
    r = await T.walk(2.9, 0.2, { timeout: 4000 }); r = await T.walk(2.15, -1.7); ok(L.state().pos[1] < 0.05, 'down and at the mechanism');
    u = await T.useId('gate-gear'); ok(/gear/.test(u.prompt || ''), 'socket gear: ' + u.prompt);
    u = await T.useId('gate-spring'); ok(/spring/.test(u.prompt || ''), 'socket spring: ' + u.prompt);
    u = await T.useId('gate-crank'); ok(/crank/.test(u.prompt || ''), 'socket crank: ' + u.prompt);
    u = await T.useId('gate-crank-turn'); ok(u.prompt === 'Turn the crank', 'turn the crank: ' + u.prompt);
    ok(await T.waitFor(() => L.state().flags['attic-gate-open'] === true, 2000), 'gate opening');
    ok(await T.waitFor(() => L.state().checkpoint === 'gate', 5000), 'checkpoint at the gate');
  `);
  await run(page, 'attic: trunk, magic lantern, dials, finale', `
    let r = await T.walk(4.3, 0.0, { timeout: 9000 }); ok(r.ok, 'through the gate, behind the trunk');
    let u = await T.useId('big-trunk'); ok(L.state().mode === 'pushing', 'grabbed the trunk: ' + u.prompt);
    const trunk = () => L.game.interactions.find('big-trunk').base;
    ok(await T.push(0, 1, () => trunk().z < -1.7, 8000), 'pushed the trunk under the lantern z=' + trunk().z);
    r = await T.walk(4.3, -1.05); L.setYaw(0, 0); await T.wait(100);
    let p = await T.jump(); ok(p[1] > 0.45, 'on the trunk');
    u = await T.useId('lantern'); ok(/lantern/.test(u.prompt || ''), 'lantern prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().flags['a-projected'] === true, 4000), 'symbols projected');
    r = await T.walk(4.3, -0.6, { timeout: 4000 }); r = await T.walk(4.75, 0.0); ok(L.state().pos[1] < 0.05, 'at the dials');
    const presses = [1, 5, 4];
    for (let i = 0; i < 3; i++) for (let k = 0; k < presses[i]; k++) { await T.useId('dial-' + i); await T.wait(80); }
    ok(L.state().flags['attic-cage-open'] === true, 'cage open (dials correct)');
    ok(await T.waitFor(() => L.state().checkpoint === 'finale', 4000), 'finale checkpoint');
    await T.wait(1200);
    u = await T.useId('wind-box'); ok(/Wind/.test(u.prompt || ''), 'wind prompt: ' + u.prompt);
    ok(L.state().flags['a-wound'] === true, 'music box wound');
    u = await T.useId('crown'); ok(/LUMO/.test(u.prompt || ''), 'crown prompt: ' + u.prompt);
    ok(await T.waitFor(() => L.state().state === 'ending', 30000), 'reached the ending');
  `);
  await expect(page.locator('.menus.screen-ending')).toBeVisible();
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('littlenight.save') || 'null'));
  expect(save?.gameComplete).toBe(true);
  await page.screenshot({ path: 'test-results/playthrough-ending.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('getting caught restarts from the checkpoint; continue survives a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test=1');
  await page.waitForFunction(() => (window as any).__THREE_GAME_TEST_HOOKS__);
  await page.evaluate(() => (window as any).__THREE_GAME_TEST_HOOKS__.setState('kitchen'));
  await installDriver(page);
  await page.evaluate(() => (window as any).__LN__.setSpeed(4));
  await run(page, 'caught', `
    const h = L.game.enemies.hush;
    h.spawn(new L.THREE.Vector3(-1.0, 0, 0.6), -Math.PI / 2, 'patrol', L.game.ctx, true);
    await T.wait(2200);
    L.teleport(-2.0, 0, 0.6, Math.PI / 2, false);
    ok(await T.waitFor(() => h.state === 'chase' || h.state === 'catch', 6000), 'THE HUSH saw the player: ' + h.state);
    ok(await T.waitFor(() => L.state().cinematic || h.state === 'catch', 8000), 'caught');
    ok(await T.waitFor(() => L.state().state === 'transition' || L.state().state === 'playing', 6000), 'reloading');
    await T.wait(2500);
    ok(L.state().state === 'playing' && L.state().chapter === 'kitchen', 'back in play after being caught');
    const pos = L.state().pos;
    ok(Math.hypot(pos[0] + 6.6, pos[2] - 3.0) < 0.6, 'restored at the kitchen start checkpoint ' + JSON.stringify(pos));
  `);
  await page.reload();
  await page.locator('.menus button[data-act="continue"]').waitFor({ timeout: 20000 });
  await page.locator('.menus button[data-act="continue"]').click();
  await page.waitForFunction(() => (window as any).__LN__?.state().state === 'playing', null, { timeout: 15000 });
  const s = await page.evaluate(() => (window as any).__LN__.state());
  expect(s.chapter).toBe('kitchen');
  expect(errors).toEqual([]);
});
