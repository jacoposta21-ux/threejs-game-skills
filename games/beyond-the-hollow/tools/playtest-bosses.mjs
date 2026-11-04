// Boss fairness: phase heal, resume at the phase reached, skip offer after three defeats.  LV=4|8|13|18 node tools/playtest-bosses.mjs
import { boot, startLevel, tp, check, summary, wait, segX, state } from './harness.mjs';
const { browser, page, errors } = await boot();
const ev = (f, a) => page.evaluate(f, a);
const lv = +(process.env.LV || 4);
await startLevel(page, lv);
// walk into the arena
const arena = await ev(() => window.__BTH.scene.bossArena);
await ev(([a]) => { const s = window.__BTH.scene; s.player.body.reset(a + 9 * 32, s.player.y); }, arena);
for (let i = 0; i < 80; i++) { await wait(page, 100); if (await ev(() => window.__BTH.scene.bossStarted && !window.__BTH.scene.cutscene)) break; }
const b0 = await ev(() => ({ hp: window.__BTH.scene.boss.hp, max: window.__BTH.scene.boss.maxHp }));
// reach phase 2, check the heal
await ev(() => { const s = window.__BTH.scene; s.player.hp = 1; const b = s.boss; if (b.nodePurified) { s.hooks.filter((h) => h.dark).forEach((h) => { h.setDark(false); b.nodePurified(); }); } else b.hp = Math.floor(b.maxHp * 0.6); });
await wait(page, 600);
const healed = await ev(() => ({ hp: window.__BTH.scene.player.hp, phase: window.__BTH.scene.boss.phase }));
check('a new boss phase restores Elias', healed.hp === 5 && healed.phase === 2, JSON.stringify(healed));
// fall three times
for (let k = 0; k < 3; k++) {
  await ev(() => { const p = window.__BTH.scene.player; p.invuln = 0; p.hurt(99, p.x, { force: true }); });
  await wait(page, 2500);
  const items = await ev(() => window.__game.scene.getScene('UI').menu?.rows?.map((r) => r.text.text) ?? []);
  console.log('game over menu', k, items.join(' | '));
  if (k < 2) {
    check(`no skip offered after ${k + 1} defeat(s)`, !items.some((s) => /Skip/.test(s)), items.join('|'));
    await ev(() => { const ui = window.__game.scene.getScene('UI'); ui.menu.rows[0].item.action(); });
    await startLevelWait();
    for (let i = 0; i < 100; i++) { await wait(page, 100); if (await ev(() => window.__BTH.scene.bossStarted && !window.__BTH.scene.cutscene)) break; await ev(([a]) => { const s = window.__BTH.scene; if (!s.bossStarted && !s.cutscene) s.player.body.reset(a + 9 * 32, s.player.y); }, arena); }
    await wait(page, 900);
    const r = await ev(() => ({ hp: window.__BTH.scene.boss.hp, max: window.__BTH.scene.boss.maxHp, phase: window.__BTH.scene.boss.phase }));
    check(`retry ${k + 1}: the fight resumes at phase 2`, r.hp <= r.max * 0.7 && r.phase === 2, JSON.stringify(r));
  } else {
    check('after three defeats the game-over panel offers to skip the fight', items.some((s) => /Skip/.test(s)), items.join('|'));
    await ev(() => { const ui = window.__game.scene.getScene('UI'); ui.menu.rows.find((r) => /Skip/.test(r.text.text)).item.action(); });
    await startLevelWait();
    await wait(page, 3500);
    const st = await ev(() => ({ alive: window.__BTH.scene.boss?.alive, doors: window.__BTH.scene.doors.every((d) => d.open) }));
    check('skipping: the boss is beaten and the way on opens', st.alive === false && st.doors, JSON.stringify(st));
  }
}
async function startLevelWait() { await page.waitForFunction(() => window.__BTH && window.__BTH.scene.player && window.__BTH.scene.sys.isActive(), null, { timeout: 60000 }); await wait(page, 300); }
check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
summary();
await browser.close();
