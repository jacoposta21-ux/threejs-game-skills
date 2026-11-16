/**
 * Phase 2 (living world) checks, run by tests/playtest.mjs inside an active game.
 * Real key input drives the player; page-side helpers only place actors and
 * fast-forward simulation time (the software GPU renders too slowly for minutes of real time).
 */
export async function phase2Checks({ page, check, diag, waitFrames, hold, out }) {
  const sim = (seconds) => page.evaluate((s) => window.__JESUS_SIM__.session.simulate(s), seconds);
  const setup = (fn, arg) => page.evaluate(fn, arg);

  // 1. villagers exist and follow routines (positions change over simulated time)
  let d = await diag();
  const before = await setup(() => window.__JESUS_SIM__.session.npcs.npcs.map((n) => [n.pos.x, n.pos.z]));
  await sim(20);
  const after = await setup(() => window.__JESUS_SIM__.session.npcs.npcs.map((n) => [n.pos.x, n.pos.z]));
  const moving = after.filter((p, i) => Math.hypot(p[0] - before[i][0], p[1] - before[i][1]) > 2).length;
  d = await diag();
  check('NPCs spawn and follow routines', d.npcs.count >= 20 && moving >= 8 && d.npcs.homesReachable,
    `count=${d.npcs.count} moved>2m=${moving} states=${JSON.stringify(d.npcs.states)} nav=${JSON.stringify(d.npcs.nav)}`);

  // 2. talk to Eli the baker with E, answer with 1, leave with Esc
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const eli = s.npcs.byId.get('npc.eli');
    const f = s.world.anchors.stalls[eli.def.stall].front;
    // shoppers standing at the stall would (rightly) win the talk prompt: send them elsewhere
    for (const n of s.npcs.npcs) {
      if (n !== eli && Math.hypot(n.pos.x - f.x, n.pos.z - f.z) < 5) { s.npcs.leaveAnchor(n, true); s.npcs.place(n, 0, 1.2, 9 + Math.random() * 3); n.phase = 'none'; }
    }
    s.player.teleport(f.x, 0, f.z, f.yaw);
    s.cam.snap(s.playerState.position, f.yaw + Math.PI);
  });
  await waitFrames(4);
  const prompt = await page.textContent('#prompt-text');
  await page.keyboard.press('KeyE');
  await waitFrames(4);
  const open1 = await page.isVisible('#conversation');
  const name = await page.textContent('#conv-name');
  const text1 = await page.textContent('#conv-text');
  const opts = await page.$$eval('#conv-options .conv-opt', (els) => els.length);
  await page.screenshot({ path: `${out}/dialogue.png` });
  await page.keyboard.press('Digit1');
  await waitFrames(4);
  const text2 = await page.textContent('#conv-text');
  const p0 = (await diag()).player.position;
  await hold('KeyW', 20); // walking is frozen during a conversation
  const p1 = (await diag()).player.position;
  await page.keyboard.press('Escape');
  await waitFrames(4);
  const closed = !(await page.isVisible('#conversation')) && (await diag()).screen === 'playing';
  check('talk to NPC (E, choose 1, Esc)', prompt.includes('Eli') && open1 && name === 'Eli' && opts >= 2 && text1 !== text2 && closed && Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05,
    `prompt="${prompt}" options=${opts} "${text1.slice(0, 40)}" -> "${text2.slice(0, 40)}"`);

  // 3. NPC bodies block the player; 4. sprinting into one knocks them over
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const n = s.npcs.byId.get('npc.villager.1');
    s.npcs.place(n, 6, 1.2, 14);
    n.override = { type: 'look', t: 30, age: 0 };
    n.lookAt = null;
    s.player.teleport(6, 0, 18.5, Math.PI);
    s.cam.snap(s.playerState.position, 0);
  });
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    window.__contacts = 0;
    window.__minGap = 99;
    s.bus.on('player:contact', () => { window.__contacts += 1; });
    s.bus.on('player:move', ({ x, z }) => {
      const n = s.npcs.byId.get('npc.villager.1');
      window.__minGap = Math.min(window.__minGap, Math.hypot(x - n.pos.x, z - n.pos.z));
    });
  });
  await waitFrames(3);
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 80; i += 1) {
    await waitFrames(3);
    if (await setup(() => window.__contacts > 20 || window.__minGap < 0.75)) break;
  }
  await waitFrames(15);
  await page.keyboard.up('KeyW');
  const col = await setup(() => ({ contacts: window.__contacts, minGap: window.__minGap, o: window.__JESUS_SIM__.session.npcs.byId.get('npc.villager.1').override?.type }));
  // capsule radii 0.36 + 0.30 (minus controller skin): centres never closer than ~0.6 m
  check('NPC collision blocks the player', col.contacts > 0 && col.minGap > 0.56, `contacts=${col.contacts} min centre gap=${col.minGap.toFixed(2)} reaction=${col.o}`);
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const n = s.npcs.byId.get('npc.villager.1');
    n.override = null;
    n.bumpCd = 0;
    s.npcs.place(n, 6, 1.2, 14);
    n.override = { type: 'look', t: 30, age: 0 };
    s.player.teleport(6, 0, 24, Math.PI);
    s.cam.snap(s.playerState.position, 0);
  });
  const chaos0 = (await diag()).chaos;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  let knocked = null;
  for (let i = 0; i < 40 && !knocked; i += 1) {
    await waitFrames(3);
    knocked = await setup(() => (window.__JESUS_SIM__.session.npcs.byId.get('npc.villager.1').override?.type === 'stumble' ? 'stumble' : null));
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await waitFrames(4);
  await page.screenshot({ path: `${out}/knocked.png` });
  d = await diag();
  check('sprinting into a villager knocks them over (+Chaos)', knocked === 'stumble' && d.chaos > chaos0, `reaction=${knocked} chaos ${chaos0} -> ${d.chaos.toFixed(1)}`);

  // 5. a pot dropped from a height shatters into shards, adds Chaos, merchant reacts
  const chaos1 = d.chaos;
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const pot = s.world.propSystem.props.find((p) => p.type === 'pot' && p.owner === 'npc.rachel' && !p.broken);
    s.player.teleport(pot.home.x + 3, 0, pot.home.z + 3, 0);
    pot.body.setTranslation({ x: pot.home.x, y: pot.home.y + 4, z: pot.home.z }, true);
    pot.body.wakeUp();
  });
  await waitFrames(40);
  d = await diag();
  check('pottery breaks on hard impact', d.props.broken >= 1 && d.props.shards >= 1 && d.chaos >= chaos1 + 2, `broken=${d.props.broken} shards=${d.props.shards} chaos=${d.chaos.toFixed(1)}`);

  // 6. walking into a fruit pile scatters fruit
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const stall = s.world.anchors.stalls.find((st) => st.goods === 'fruit');
    const f = stall.front;
    const p = stall.fruitSpot;
    // stand 3 m out toward the aisle and face the pile
    const ox = -Math.sin(f.yaw);
    const oz = -Math.cos(f.yaw);
    s.player.teleport(p.x + ox * 3, 0, p.z + oz * 3, f.yaw);
    s.cam.snap(s.playerState.position, f.yaw + Math.PI);
  });
  const dist0 = (await diag()).stats.propsDisturbed;
  await hold('KeyW', 60);
  await waitFrames(10);
  d = await diag();
  check('fruit pile scatters when walked into', d.stats.propsDisturbed > dist0, `propsDisturbed ${dist0} -> ${d.stats.propsDisturbed}`);

  // 7. lost-sheep errand: accept from Amos, sheep follows, returns to the flock
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const amos = s.npcs.byId.get('npc.amos');
    s.player.teleport(amos.pos.x + 1.6, 0, amos.pos.z, -Math.PI / 2);
    s.cam.snap(s.playerState.position, Math.PI / 2);
    amos.override = null;
  });
  await waitFrames(3);
  await page.keyboard.press('KeyE');
  await waitFrames(4);
  const amosText = await page.textContent('#conv-text');
  await page.keyboard.press('Digit1');
  await waitFrames(3);
  await page.keyboard.press('KeyE');
  await waitFrames(3);
  const asked = (await diag()).flags['sheep.asked'] === true || (await setup(() => !!window.__JESUS_SIM__.session.flags['sheep.asked']));
  // walk the player from the ridge back to Amos (scripted positions, simulated time)
  const result = await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const stray = s.npcs.animals.stray;
    const amos = s.npcs.byId.get('npc.amos');
    s.player.teleport(stray.x + 2, 0, stray.z + 2, 0);
    s.simulate(1);
    const following = !!stray.following;
    for (let i = 0; i < 900 && !stray.joined; i += 1) {
      const p = s.playerState.position;
      const dx = amos.pos.x - p.x;
      const dz = amos.pos.z - p.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 3) s.player.teleport(p.x + (dx / dd) * 0.07, 0, p.z + (dz / dd) * 0.07, Math.atan2(dx, dz));
      s.playerState.speed = 4.2;
      s.simulate(1 / 60);
    }
    return { following, joined: !!stray.joined, returned: !!s.flags['sheep.returned'], faith: s.playerState.faith };
  });
  check('lost-sheep errand (Amos)', amosText.includes('sheep') && asked && result.following && result.joined && result.returned,
    `following=${result.following} joined=${result.joined} faith=${result.faith}`);

  // 8. day/night routine: villagers go home at night and come back in the morning
  const night = await setup(() => {
    const s = window.__JESUS_SIM__.session;
    s.clock = 0.9;
    s.simulate(45);
    const atNight = s.npcs.stats().hidden;
    s.clock = 0.02;
    s.simulate(3);
    return { atNight, morning: s.npcs.stats().hidden, total: s.npcs.npcs.length };
  });
  check('villagers go home at night, return at dawn', night.atNight >= night.total * 0.6 && night.morning === 0, JSON.stringify(night));

  // 9. people met, flags and clock persist through Save & Quit -> Continue
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(3);
  await page.click('#btn-play');
  await waitFrames(5);
  const persisted = await setup(() => { const s = window.__JESUS_SIM__.session; return { met: s.met.size, sheep: !!s.flags['sheep.returned'], stray: !!s.npcs.animals.stray.joined }; });
  check('dialogue flags + people met persist', persisted.met >= 2 && persisted.sheep && persisted.stray, JSON.stringify(persisted));
}
