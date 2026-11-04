// Boss difficulty (Story/Normal/Hard) changes only boss fights.  LV=4|8|13|18 node tools/playtest-boss-difficulty.mjs
import { boot, startLevel, check, summary, wait } from './harness.mjs';
const { browser, page, errors } = await boot();
const ev = (f, a) => page.evaluate(f, a);
const lv = +(process.env.LV || 4);
async function fight(diff) {
  await ev(async (d) => { const m = await import('/src/core/Save.ts'); m.Save.data.settings.bossDiff = d; }, diff);
  await ev((l) => window.__game.registry.remove('boss-' + l), lv);
  await startLevel(page, lv);
  const pre = await ev(() => ({ maxHp: window.__BTH.scene.player.maxHp, scale: window.__BTH.scene.bossTimeScale() }));
  const arena = await ev(() => window.__BTH.scene.bossArena);
  await ev(([a]) => { const s = window.__BTH.scene; s.player.body.reset(a + 9 * 32, s.player.y); }, arena);
  for (let i = 0; i < 80; i++) { await wait(page, 100); if (await ev(() => window.__BTH.scene.bossStarted && !window.__BTH.scene.cutscene)) break; }
  await wait(page, 300);
  const r = await ev(() => { const s = window.__BTH.scene, p = s.player, b = s.boss; p.invuln = 0; const h0 = p.hp; p.hurt(2, p.x - 30, { force: true }); return { bossMax: b.maxHp, pMax: p.maxHp, lost: h0 - p.hp, scale: s.bossTimeScale() }; });
  // phase heal
  await ev(() => { const s = window.__BTH.scene; s.player.hp = 1; const b = s.boss; if (b.nodePurified) s.hooks.filter((h) => h.dark).forEach((h) => { h.setDark(false); b.nodePurified(); }); else b.hp = Math.floor(b.maxHp * 0.6); });
  await wait(page, 700);
  const healed = await ev(() => window.__BTH.scene.player.hp);
  // one defeat → skip offered?
  await ev(() => { window.__BTH.scene.player.die(); });
  await wait(page, 2500);
  const items = await ev(() => window.__game.scene.getScene('UI').menu?.rows?.map((x) => x.text.text) ?? []);
  await ev(() => window.__game.scene.getScene('UI').closeOverlay());
  return { pre, ...r, healed, items };
}
const st = await fight('story');
console.log('story', JSON.stringify(st));
check('outside the boss fight nothing changes (Story)', st.pre.maxHp === 5 && st.pre.scale === 1, JSON.stringify(st.pre));
check('Story: 8 hearts, boss slower and weaker, hits cost one heart', st.pMax === 8 && st.scale < 1 && st.lost === 1, JSON.stringify(st));
check('Story: skip offered after the first defeat', st.items.some((s) => /Skip/.test(s)), st.items.join('|'));
const no = await fight('normal');
console.log('normal', JSON.stringify(no));
check('Normal: unchanged fight', no.pMax === 5 && no.scale === 1 && no.lost === 2 && no.healed === 5 && !no.items.some((s) => /Skip/.test(s)), JSON.stringify(no));
check('Story boss has less health than Normal', st.bossMax < no.bossMax, `${st.bossMax} < ${no.bossMax}`);
const hd = await fight('hard');
console.log('hard', JSON.stringify(hd));
check('Hard: faster, tougher boss, no healing between phases', hd.scale > 1 && hd.bossMax > no.bossMax && hd.healed < 5, JSON.stringify(hd));
check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
summary();
await browser.close();
