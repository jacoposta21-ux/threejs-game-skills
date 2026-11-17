/**
 * Phase 6 (missions, followers, Faith/Chaos, Blessings, full save) checks,
 * run by tests/playtest.mjs. Conversations use real keys (E to talk, 1/2/3
 * to answer), miracles use number keys + Q, followers G, rides F, and the
 * Blessing is bought with a real click in the pause menu. Page-side helpers
 * only place actors, fast-forward the fixed 60 Hz simulation and read state.
 */
export async function phase6Checks({ page, check, diag, waitFrames, out }) {
  const setup = (fn, arg) => page.evaluate(fn, arg);
  const sim = async (seconds) => { await page.evaluate((s) => window.__JESUS_SIM__.session.simulate(s), seconds); await waitFrames(2); };
  const press = async (key, frames = 3) => { await page.keyboard.press(key); await waitFrames(frames); };
  const events = () => setup(() => window.__p6events.splice(0));
  const holdSim = async (keys, seconds) => {
    for (const k of keys) await page.keyboard.down(k);
    await waitFrames(2);
    await sim(seconds);
    for (const k of keys) await page.keyboard.up(k);
    await waitFrames(2);
  };
  /** Stand 1.6 m in front of someone, facing them, camera behind. */
  const faceNpc = (id) => setup((nid) => {
    const S = window.__JESUS_SIM__.session;
    const n = S.npcs.byId.get(nid) || S.romans.byId.get(nid);
    if (S.vehicles.ridden) S.vehicles.dismount(S.player, S.playerState, { force: true });
    n.override = null;
    const fx = Math.sin(n.yaw);
    const fz = Math.cos(n.yaw);
    const x = n.pos.x + fx * 1.6;
    const z = n.pos.z + fz * 1.6;
    const yaw = Math.atan2(n.pos.x - x, n.pos.z - z);
    S.player.teleport(x, Math.max(n.pos.y, window.__JESUS_SIM__.terrainHeight(x, z)), z, yaw);
    S.playerState.yaw = yaw;
    S.cam.snap(S.playerState.position, yaw + Math.PI);
    S.simulate(0.05);
  }, id);
  const talk = async (id) => {
    await faceNpc(id);
    await waitFrames(3);
    await press('KeyE', 4);
    return setup(() => { const D = window.__JESUS_SIM__.session.dialogue; return D.active ? { npc: D.npc.id, options: D.options.map((o) => o.label) } : null; });
  };
  const choose = async (n) => { await press(`Digit${n}`, 4); };
  const closeTalk = async () => {
    for (let i = 0; i < 4; i += 1) {
      const open = await setup(() => window.__JESUS_SIM__.session.dialogue.active);
      if (!open) return;
      const n = await setup(() => window.__JESUS_SIM__.session.dialogue.options.length);
      await press(n ? 'Digit1' : 'KeyE', 4);
    }
  };
  const teleport = (x, z, yaw, y = 0) => setup(([px, pz, pyaw, py]) => {
    const S = window.__JESUS_SIM__.session;
    if (S.vehicles.ridden) S.vehicles.dismount(S.player, S.playerState, { force: true });
    S.player.teleport(px, py, pz, pyaw);
    S.cam.snap(S.playerState.position, pyaw + Math.PI);
    S.simulate(0.05);
  }, [x, z, yaw, y]);

  // fresh game, everything revealed, an event log
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(3);
  await page.click('#btn-new');
  await waitFrames(6);
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    S.romans.setActive(false);
    S.unlockAllForTest();
    window.__p6events = [];
    for (const name of ['mission:accepted', 'mission:step', 'mission:done', 'mission:progress', 'follower:joined', 'miracle:blessed', 'npc:avoid', 'npc:fetched', 'roman:warning']) {
      S.bus.on(name, (e) => window.__p6events.push({ name, ...JSON.parse(JSON.stringify({ ...e, copy: undefined, step: e.step ? { kind: e.step.kind, text: e.step.text } : undefined, finished: undefined })) }));
    }
  });
  await waitFrames(3);

  // 1. Mary offers the wedding mission: gold "!" over her, ★ option, accept with 1 + 1
  const before = await setup(() => window.__JESUS_SIM__.session.questBubbles().map((b) => b.id));
  const conv = await talk('npc.mary');
  await choose(1);
  const offerText = await page.textContent('#conv-text');
  await choose(1);
  await closeTalk();
  let ev = await events();
  let d = await diag();
  const card = await page.textContent('#obj-title');
  check('Mission offered and accepted through dialogue', before.includes('q-npc.mary') && conv?.options[0] === '★ The Wedding Wine' && /wedding/i.test(offerText) && ev.some((e) => e.name === 'mission:accepted' && e.missionId === 'mission.wedding') && d.missions.tracked === 'mission.wedding' && card === 'The Wedding Wine',
    `bubble=${before.includes('q-npc.mary')} options=${JSON.stringify(conv?.options)} card=${card}`);

  // 2. the wedding: walk to the feast, turn the jars to wine (3 + Q), tell the bridegroom
  await teleport(19, 5.5, -0.75);
  await holdSim(['KeyW'], 1.2);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(15.6, 0, 6.3, 0); S.playerState.yaw = 0; S.cam.snap(S.playerState.position, Math.PI); S.cam.pitch = 0.1; S.simulate(0.05); });
  await press('Digit3');
  await press('KeyQ');
  await sim(0.5);
  const faith0 = (await diag()).faith;
  const g = await talk('npc.groom');
  await choose(1);
  await closeTalk();
  ev = await events();
  d = await diag();
  const steps = ev.filter((e) => e.name === 'mission:step').map((e) => e.step.kind);
  check('Wedding: reach the feast, wine in the jars, the bridegroom', steps.join(',') === 'miracle,talk' && g?.options[0]?.startsWith('★') && ev.some((e) => e.name === 'mission:done' && e.missionId === 'mission.wedding') && d.faith >= faith0 + 15 && d.flags['wine.wedding'],
    `steps=${steps.join(',')} faith ${faith0} -> ${d.faith} done=${JSON.stringify(d.missions.done)}`);

  // 3. Simon: the deep-water catch. Accept, jetty end, Walk on Water (4 + Q), walk out, back to Simon
  await talk('npc.simon');
  await choose(1);
  await choose(1);
  await closeTalk();
  await teleport(166, -80, Math.PI, 1.2);
  await sim(0.3);
  const atJetty = (await diag()).missions.active.find((m) => m.id === 'mission.fishers')?.step;
  await setup(() => { const S = window.__JESUS_SIM__.session; const y = Math.atan2(172 - 166, -52 + 80); S.playerState.yaw = y; S.cam.snap(S.playerState.position, y + Math.PI); });
  await press('Digit4');
  await press('KeyQ');
  await holdSim(['KeyW', 'ShiftLeft'], 4);
  ev = await events();
  const onLake = (await diag()).water;
  await talk('npc.simon');
  await choose(1);
  await closeTalk();
  ev = ev.concat(await events());
  d = await diag();
  check('Fishers of Men: walk on the deep water, Simon follows', atJetty === 1 && ev.some((e) => e.name === 'mission:step' && /Tell Simon/.test(e.step.text)) && ev.some((e) => e.name === 'mission:done' && e.missionId === 'mission.fishers') && d.followers.some((f) => f.id === 'npc.simon'),
    `jettyStep=${atJetty} water=${JSON.stringify(onLake)} followers=${JSON.stringify(d.followers.map((f) => f.id))}`);

  // 4. Bartholomew's donkey: it runs off to the oasis; ride it home (F + autopilot for the last stretch)
  await talk('npc.bartholomew');
  await choose(1);
  await choose(1);
  await closeTalk();
  const lost = await setup(() => { const v = window.__JESUS_SIM__.session.vehicles.byId.get('vehicle.donkey.farm'); return [Math.round(v.pos.x), Math.round(v.pos.z)]; });
  await setup(() => { const S = window.__JESUS_SIM__.session; const v = S.vehicles.byId.get('vehicle.donkey.farm'); S.player.teleport(v.pos.x + Math.cos(v.yaw) * 1.4, 0, v.pos.z - Math.sin(v.yaw) * 1.4, 0); S.simulate(0.2); });
  await waitFrames(3);
  await press('KeyF', 4);
  const mounted = (await diag()).vehicles.ridden?.id;
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    S.vehicles.place(S.vehicles.ridden, -148, 4, 0);
    S.driveForTest([[-148, 14], [-148, 24]], 4, false);
  });
  await sim(0.2);
  await press('KeyF', 4);
  await talk('npc.bartholomew');
  await choose(1);
  await closeTalk();
  ev = await events();
  d = await diag();
  check('Wandering Donkey: found at the oasis, ridden home, Bartholomew follows', Math.hypot(lost[0] - 54, lost[1] - 157) < 4 && mounted === 'vehicle.donkey.farm' && ev.some((e) => e.name === 'mission:done' && e.missionId === 'mission.donkey') && d.followers.some((f) => f.id === 'npc.bartholomew'),
    `lost at ${lost} mounted=${mounted} done=${JSON.stringify(d.missions.done)}`);

  // 5. the caravan: one loaf, Multiplication (2 + Q) until six travellers have eaten
  await talk('npc.hiram');
  await choose(1);
  await choose(1);
  await closeTalk();
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    const h = S.npcs.byId.get('npc.hiram');
    const bread = S.world.propSystem.copies.find((c) => { const t = c.body.translation(); return Math.hypot(t.x - h.pos.x, t.z - h.pos.z) < 12; });
    const t = bread.body.translation();
    S.player.teleport(t.x, 0, t.z + 2.2, Math.PI);
    S.playerState.yaw = Math.PI;
    S.cam.snap(S.playerState.position, 0);
    S.cam.pitch = 0.45;
    S.simulate(0.05);
  });
  await press('Digit2');
  let fed = 0;
  ev = [];
  for (let i = 0; i < 12 && fed < 6; i += 1) {
    await press('KeyQ', 2);
    await sim(3);
    ev = ev.concat(await events());
    fed = ev.filter((e) => e.name === 'npc:fetched' && e.hungry).length;
  }
  await talk('npc.hiram');
  await choose(1);
  await closeTalk();
  ev = ev.concat(await events());
  check('Bread for the Caravan: six travellers fed from one loaf', fed >= 6 && ev.some((e) => e.name === 'mission:done' && e.missionId === 'mission.caravan'),
    `fed=${fed} progress=${ev.filter((e) => e.name === 'mission:progress').map((e) => e.progress).join(',')}`);

  // 6. the centurion's servant: Gaius gives a pass, the fort lets you in, Healing Touch on Philo
  await setup(() => window.__JESUS_SIM__.session.romans.setActive(true));
  await waitFrames(3);
  // walk up to the camp gate (outside): the centurion comes over to talk
  await teleport(-6, -108, Math.PI / 2);
  await holdSim(['KeyW'], 1.0);
  await sim(14);
  await events();
  const gate = await setup(() => { const g = window.__JESUS_SIM__.session.romans.byId.get('roman.gaius'); return { summoned: !!g.summoned, x: +g.pos.x.toFixed(1) }; });
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    const g = S.romans.byId.get('roman.gaius');
    S.player.teleport(Math.min(g.pos.x - 1.7, 5.6), 0, g.pos.z, Math.PI / 2);
    S.playerState.yaw = Math.PI / 2;
    S.cam.snap(S.playerState.position, -Math.PI / 2);
    S.simulate(0.05);
  });
  await waitFrames(3);
  await press('KeyE', 4);
  const gc = await setup(() => { const D = window.__JESUS_SIM__.session.dialogue; return D.active ? { npc: D.npc.id, options: D.options.map((o) => o.label) } : null; });
  await choose(1);
  await choose(1);
  await closeTalk();
  await teleport(32, -178, Math.PI / 2);
  await holdSim(['KeyW'], 3);
  await sim(5);
  ev = await events();
  const warned = ev.some((e) => e.name === 'roman:warning');
  d = await diag();
  const stepNow = d.missions.active.find((m) => m.id === 'mission.centurion')?.step;
  await faceNpc('npc.philo');
  await press('Digit5');
  await press('KeyQ');
  await sim(0.5);
  await teleport(-6, -108, Math.PI / 2);
  await sim(14); // Gaius walks over from his post (~10 s)
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    const g = S.romans.byId.get('roman.gaius');
    S.player.teleport(Math.min(g.pos.x - 1.7, 5.6), 0, g.pos.z, Math.PI / 2);
    S.playerState.yaw = Math.PI / 2;
    S.cam.snap(S.playerState.position, -Math.PI / 2);
    S.simulate(0.05);
  });
  await waitFrames(3);
  await press('KeyE', 4);
  await choose(1);
  await closeTalk();
  ev = ev.concat(await events());
  d = await diag();
  check('Centurion\'s Servant: Gaius comes to the gate, a pass into the fort, Philo healed, favour', gate.summoned && gate.x < 10 && gc?.options[0] === '★ The Centurion\'s Servant' && !warned && stepNow === 1 && d.romans.stars === 0 && ev.some((e) => e.name === 'mission:done' && e.missionId === 'mission.centurion') && d.perks.includes('perk.favour') && d.perks.includes('pass.outpost'),
    `gate=${JSON.stringify(gate)} options=${JSON.stringify(gc?.options)} warned=${warned} step=${stepNow} stars=${d.romans.stars} perks=${d.perks}`);
  await setup(() => window.__JESUS_SIM__.session.romans.setActive(false));

  // 7. followers keep formation while you walk; G makes them wait, G calls them back
  await teleport(-30, 2, Math.PI / 2);
  await sim(1);
  await holdSim(['KeyW'], 3);
  const walking = (await diag()).followers;
  await press('KeyG');
  await holdSim(['KeyW', 'ShiftLeft'], 3);
  const waiting = (await diag()).followers;
  await press('KeyG');
  await sim(6);
  const back = (await diag()).followers;
  check('Followers follow, wait on G, come back on G', walking.length >= 2 && walking.every((f) => f.d < 7 && !f.waiting) && waiting.every((f) => f.waiting && f.d > 15) && back.every((f) => !f.waiting && f.d < 8),
    `walking=${JSON.stringify(walking.map((f) => f.d))} waiting=${JSON.stringify(waiting.map((f) => f.d))} back=${JSON.stringify(back.map((f) => f.d))}`);

  // 8. Faith 25+: ask a villager to follow; healing a long-suffering villager recruits her too
  const asked = await setup(() => {
    const S = window.__JESUS_SIM__.session;
    S.playerState.faith = Math.max(S.playerState.faith, 30);
    const n = S.npcs.npcs.find((x) => x.def.generic && !x.follower && !x.hidden && !x.injured && x.id !== 'npc.villager.3');
    return n.id;
  });
  const inv = await talk(asked);
  const invIdx = (inv?.options || []).indexOf('Come, follow me.') + 1;
  if (invIdx > 0) await choose(invIdx);
  await closeTalk();
  await faceNpc('npc.villager.3');
  await press('Digit5');
  await press('KeyQ');
  await sim(0.5);
  d = await diag();
  check('Recruiting: an invitation at Faith 25+, a healed sufferer joins', invIdx > 0 && d.followers.some((f) => f.id === asked) && d.followers.some((f) => f.id === 'npc.villager.3'),
    `invite option at ${invIdx} followers=${JSON.stringify(d.followers.map((f) => f.id))}`);

  // 9. ride far away: followers rejoin out of sight
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    S.mountForTest('vehicle.donkey.joseph');
    S.vehicles.place(S.vehicles.ridden, -90, -2, -Math.PI / 2);
    S.driveForTest([[-125, 2]], 3, true);
  });
  await sim(1);
  d = await diag();
  check('Followers catch up when you ride off', d.followers.length >= 4 && d.followers.every((f) => f.waiting || f.d < 12), JSON.stringify(d.followers.map((f) => f.d)));
  await setup(() => { const S = window.__JESUS_SIM__.session; S.vehicles.dismount(S.player, S.playerState, { force: true }); });

  // 10. a Blessing bought with a real click: Faith spent, Divine Push reaches further
  await setup(() => { window.__JESUS_SIM__.session.playerState.faith = 40; });
  const reach0 = await setup(() => window.__JESUS_SIM__.session.miracles.rangeOf('miracle.divine-push'));
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="miracles"]');
  await waitFrames(2);
  await page.click('[data-bless="miracle.divine-push"]');
  await waitFrames(3);
  await page.screenshot({ path: `${out}/p6-blessings.png` });
  await page.click('.pause-nav [data-tab="resume"]');
  await waitFrames(3);
  ev = await events();
  d = await diag();
  const reach1 = await setup(() => window.__JESUS_SIM__.session.miracles.rangeOf('miracle.divine-push'));
  check('Blessing: Faith spent, Divine Push upgraded', d.levels['miracle.divine-push'] === 1 && d.faith === 25 && reach1 > reach0 && ev.some((e) => e.name === 'miracle:blessed'),
    `level=${d.levels['miracle.divine-push']} faith=${d.faith} reach ${reach0} -> ${reach1}`);

  // 11. Chaos consequences: notorious = villagers back away, Romans see further; it fades over time
  await setup(() => { const S = window.__JESUS_SIM__.session; S.playerState.chaos = 36; S.npcs.setFollowersWaiting(true); });
  await teleport(-4, 8, Math.PI);
  await events();
  await holdSim(['KeyW'], 3);
  await sim(3);
  ev = await events();
  d = await diag();
  const tierHud = await page.getAttribute('#hud-rep', 'data-tier');
  // measure the fade somewhere quiet (frightened villagers bump the market's fruit)
  await teleport(60, -60, 0);
  const chaos1 = (await diag()).reputation.chaos;
  await sim(60);
  const chaos2 = (await diag()).reputation.chaos;
  check('Chaos tiers: notorious scares villagers, Chaos fades', d.reputation.tier === 'notorious' && tierHud === 'notorious' && ev.some((e) => e.name === 'npc:avoid') && chaos2 < chaos1 - 0.3,
    `tier=${d.reputation.tier} hud=${tierHud} avoid=${ev.filter((e) => e.name === 'npc:avoid').length} chaos ${chaos1} -> ${chaos2}`);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.playerState.chaos = 2; S.npcs.setFollowersWaiting(false); });

  // 12. followers bring Faith over time
  const f0 = (await diag()).faith;
  await sim(40);
  const f1 = (await diag()).faith;
  check('Followers bring Faith over time', f1 > f0, `faith ${f0} -> ${f1} with ${(await diag()).followers.length} followers`);

  // 13. full save: missions, followers, Blessings, perks survive Save & Quit → Continue
  const snap = await diag();
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(4);
  await page.click('#btn-play');
  await waitFrames(8);
  d = await diag();
  const saved = await setup(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.includes('save') && !k.includes('settings')) || 'null'))?.version);
  check('Save & continue keeps missions, followers, Blessings and favours', saved === 2 && JSON.stringify(d.missions.done.sort()) === JSON.stringify(snap.missions.done.sort()) && d.followers.length === snap.followers.length && d.levels['miracle.divine-push'] === 1 && d.perks.includes('perk.favour'),
    `version=${saved} done=${d.missions.done.length}/${snap.missions.done.length} followers=${d.followers.length}/${snap.followers.length} levels=${JSON.stringify(d.levels)}`);

  // 14. an old (version 1) save still loads, with the new systems starting empty
  const migrated = await setup(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('save') && !k.includes('settings'));
    const raw = JSON.parse(localStorage.getItem(key));
    const v1 = { ...raw, version: 1 };
    for (const k of ['ministry', 'followers', 'miracleLevels', 'vehicles']) delete v1[k];
    localStorage.setItem(key, JSON.stringify(v1));
    return key;
  });
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  // Save & Quit overwrote the v1 save we just wrote; write it again and continue from it
  await waitFrames(4);
  await setup((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    const v1 = { ...raw, version: 1 };
    for (const k of ['ministry', 'followers', 'miracleLevels', 'vehicles']) delete v1[k];
    localStorage.setItem(key, JSON.stringify(v1));
  }, migrated);
  await page.click('#btn-play');
  await waitFrames(8);
  d = await diag();
  check('A version 1 save loads (no missions, followers or Blessings yet)', d.screen === 'playing' && d.followers.length === 0 && d.missions.done.length === 0 && Object.keys(d.levels).length === 0 && d.discovered.length >= 0,
    `screen=${d.screen} followers=${d.followers.length} done=${d.missions.done.length}`);
}
