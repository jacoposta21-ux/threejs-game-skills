/**
 * Phase 5 (world expansion, riding, wildlife) checks, run by tests/playtest.mjs.
 * Riding uses real key presses (F to get on/off, W/A/D/Shift held while the
 * fixed 60 Hz simulation is fast-forwarded in-page). The circus lap uses the
 * test autopilot (synthetic W/A/D intents through waypoints) because steering
 * a full oval by hand at software-rendering frame rates would take minutes.
 */
export async function phase5Checks({ page, check, diag, waitFrames, out }) {
  const setup = (fn, arg) => page.evaluate(fn, arg);
  // fast-forward, then let a frame publish fresh diagnostics
  const sim = async (seconds) => { await page.evaluate((s) => window.__JESUS_SIM__.session.simulate(s), seconds); await waitFrames(2); };
  /** Teleport and put the camera behind the player (so W walks/rides "forward"). */
  const teleport = (x, z, yaw, y = 0) => setup(([px, pz, pyaw, py]) => {
    const S = window.__JESUS_SIM__.session;
    if (S.vehicles.ridden) S.vehicles.dismount(S.player, S.playerState, { force: true });
    S.player.teleport(px, py, pz, pyaw);
    S.cam.snap(S.playerState.position, pyaw + Math.PI);
    S.simulate(0.1);
  }, [x, z, yaw, y]);
  const camBehind = () => setup(() => { const S = window.__JESUS_SIM__.session; const v = S.vehicles.ridden; S.cam.yaw = (v ? v.yaw : S.playerState.yaw) + Math.PI; });
  const press = async (key) => { await page.keyboard.press(key); await waitFrames(3); };
  const holdSim = async (keys, seconds) => {
    for (const k of keys) await page.keyboard.down(k);
    await waitFrames(2);
    await sim(seconds);
    for (const k of keys) await page.keyboard.up(k);
    await waitFrames(2);
  };
  const events = () => setup(() => window.__p5events.splice(0));

  // fresh game, garrison on duty, an event log for this suite
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(3);
  await page.click('#btn-new');
  await waitFrames(6);
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    S.romans.setActive(true);
    S.unlockAllForTest();
    window.__p5events = [];
    for (const name of ['vehicle:enter', 'vehicle:exit', 'vehicle:hit', 'vehicle:refuse', 'circuit:lap', 'circuit:start', 'landmark:discover', 'mission:complete', 'roman:crime', 'npc:trampled', 'fish:jump', 'player:boundary', 'animal:flee']) {
      S.bus.on(name, (e) => window.__p5events.push({ name, ...JSON.parse(JSON.stringify({ ...e, copy: undefined })) }));
    }
  });
  await waitFrames(3);

  // 1. the garrison grew: 12 on duty (4 at the fort) and every nav anchor is reachable
  let d = await diag();
  const fort = await setup(() => window.__JESUS_SIM__.session.romans.soldiers.filter((s) => s.def.post?.startsWith?.('out')).map((s) => [s.id, Math.round(s.pos.x), Math.round(s.pos.z)]));
  check('Fort garrison posted and navigable', d.romans.active === 12 && fort.length === 4 && fort.every((f) => f[2] < -160) && d.npcs.nav.unreachable === 0,
    `active=${d.romans.active} fort=${JSON.stringify(fort)} nav=${JSON.stringify(d.npcs.nav)}`);

  // 2. Joseph's donkey near the start: the F prompt, then get on with a real F press
  await setup(() => window.__JESUS_SIM__.session.romans.setActive(false));
  await teleport(-20.6, 8.8, 2.0);
  await waitFrames(3);
  const prompt = await setup(() => (document.getElementById('ride-prompt').hidden ? null : document.getElementById('ride-prompt-text').textContent));
  await press('KeyF');
  d = await diag();
  const hud = await setup(() => ({ visible: !document.getElementById('ride-hud').hidden, name: document.getElementById('ride-name').textContent }));
  check('Mount Joseph\'s donkey with F', prompt === "Ride Joseph's donkey" && d.mode === 'mounted' && d.vehicles.ridden?.id === 'vehicle.donkey.joseph' && hud.visible && hud.name === "Joseph's donkey",
    `prompt=${prompt} mode=${d.mode} hud=${JSON.stringify(hud)}`);

  // 3. ride: W trots, Shift gallops, A/D steer; the rider sits on the saddle (out on the open west road)
  await setup(() => { const S = window.__JESUS_SIM__.session; S.vehicles.place(S.vehicles.ridden, -44, 4.6, -Math.PI / 2 - 0.08); });
  await camBehind();
  const p0 = (await diag()).vehicles.ridden;
  await holdSim(['KeyW'], 1.2);
  const trot = (await diag()).vehicles.ridden;
  await holdSim(['KeyW', 'ShiftLeft'], 1.2);
  const gallop = (await diag()).vehicles.ridden;
  await holdSim(['KeyW', 'KeyD'], 0.8);
  const turned = (await diag()).vehicles.ridden;
  const seat = await setup(() => { const S = window.__JESUS_SIM__.session; const v = S.vehicles.ridden; return { dy: S.model.group.position.y - v.render.y, gap: Math.hypot(S.model.group.position.x - v.render.x, S.model.group.position.z - v.render.z) }; });
  const moved = Math.hypot(gallop.x - p0.x, gallop.z - p0.z);
  check('Riding: trot, gallop, steer', trot.speed > 4.2 && gallop.speed > trot.speed + 1.5 && moved > 8 && Math.atan2(Math.sin(turned.yaw - gallop.yaw), Math.cos(turned.yaw - gallop.yaw)) < -0.3 && seat.dy > 0.3 && seat.dy < 1.0 && seat.gap < 0.3,
    `trot=${trot.speed.toFixed(1)} gallop=${gallop.speed.toFixed(1)} moved=${moved.toFixed(1)} yaw ${gallop.yaw.toFixed(2)}->${turned.yaw.toFixed(2)} seat=${JSON.stringify(seat)}`);

  // 4. a galloping donkey into a villager: knocked down (no Romans around to care)
  const victim = await setup(() => {
    const S = window.__JESUS_SIM__.session;
    const v = S.vehicles.ridden;
    S.vehicles.place(v, -46, 4.4, -Math.PI / 2);
    const n = S.npcs.npcs.find((x) => !x.hidden && !x.anchored && !x.def.kid && x.id !== 'npc.amos');
    S.npcs.leaveAnchor(n, true);
    S.npcs.place(n, -52.5, window.__JESUS_SIM__.terrainHeight(-52.5, 4.1), 4.1);
    n.phase = 'none';
    n.bumpCd = 0;
    S.npcs.setOverride(n, 'look', 8, { lookAt: { x: -46, z: 4.4 } });
    S.cam.yaw = Math.PI / 2;
    return n.id;
  });
  const knockedBefore = (await diag()).stats.peopleKnocked || 0;
  await events();
  await holdSim(['KeyW', 'ShiftLeft'], 2.4);
  let ev = await events();
  d = await diag();
  check('Trampling: a galloping ride knocks a villager over', ev.some((e) => e.name === 'vehicle:hit') && ev.some((e) => e.name === 'npc:trampled' && e.entityId === victim) && (d.stats.peopleKnocked || 0) > knockedBefore,
    `events=${ev.map((e) => e.name).join(',')} knocked ${knockedBefore}->${d.stats.peopleKnocked}`);

  // 5. get off with F: on foot beside the donkey, collider back, walking works
  await press('KeyF');
  d = await diag();
  const off = await setup(() => { const S = window.__JESUS_SIM__.session; const v = S.vehicles.byId.get('vehicle.donkey.joseph'); return { enabled: S.player.collider.isEnabled(), gap: Math.hypot(S.playerState.position.x - v.pos.x, S.playerState.position.z - v.pos.z), hud: !document.getElementById('ride-hud').hidden }; });
  const footA = d.player.position;
  await camBehind();
  await holdSim(['KeyW'], 0.8);
  const footB = (await diag()).player.position;
  check('Dismount with F, then walk', d.mode === 'on-foot' && off.enabled && off.gap > 0.6 && off.gap < 3 && !off.hud && Math.hypot(footB.x - footA.x, footB.z - footA.z) > 2,
    `mode=${d.mode} ${JSON.stringify(off)} walked=${Math.hypot(footB.x - footA.x, footB.z - footA.z).toFixed(1)}`);

  // 6. rides refuse deep water
  await teleport(106, 6, Math.PI / 2);
  await setup(() => { const S = window.__JESUS_SIM__.session; const v = S.vehicles.byId.get('vehicle.donkey.farm'); S.vehicles.place(v, 104, 4, Math.PI / 2); S.player.teleport(104, 0, 2.6, Math.PI / 2); S.simulate(0.05); });
  await press('KeyF');
  await camBehind();
  await events();
  await holdSim(['KeyW', 'ShiftLeft'], 4);
  ev = await events();
  const wet = await setup(() => { const S = window.__JESUS_SIM__.session; const v = S.vehicles.ridden; return v ? { x: v.pos.x, depth: window.__JESUS_SIM__.waterDepth(v.pos.x, v.pos.z) } : null; });
  check('Rides refuse to walk into the lake', !!wet && wet.depth < 0.9 && ev.some((e) => e.name === 'vehicle:refuse'),
    `ride=${JSON.stringify(wet)} events=${ev.map((e) => e.name).join(',')}`);
  await press('KeyF');

  // 7. Chapter II: walk into each region's places; labels follow; 8/8 completes the chapter
  const places = [['landmark.farmstead', 'Bar-Tolmai Farm'], ['landmark.goat-hill', 'Goat Hill'], ['landmark.hamlet', "Fishers' Hamlet"], ['landmark.isle', 'The Lonely Isle'],
    ['landmark.outpost', 'Castra Galilaea (restricted)'], ['landmark.circus', 'The Little Circus'], ['landmark.oasis', 'Palm Oasis'], ['landmark.caravan', 'Caravan Camp']];
  const labels = [];
  await events();
  for (const [id] of places) {
    await setup((lid) => {
      const S = window.__JESUS_SIM__.session;
      const l = S.worldState.landmarks.find((x) => x.id === lid);
      S.player.teleport(l.x + 0.5, Math.max(0, window.__JESUS_SIM__.terrainHeight(l.x + 0.5, l.z)), l.z + 0.5, 0);
      S.simulate(0.05);
    }, id);
    await waitFrames(2);
    labels.push((await diag()).region);
  }
  ev = await events();
  d = await diag();
  const found = places.filter(([id]) => d.discovered.includes(id)).length;
  const labelsOk = places.every(([, name], i) => labels[i] === name);
  check('Chapter II: 8 new places, region labels, chapter complete', found === 8 && labelsOk && d.chapters.two === 8 && d.chapters.complete2 && ev.some((e) => e.name === 'mission:complete' && e.missionId === 'mission.explore-galilee'),
    `found=${found} labels=${labels.join(' | ')} chapters=${JSON.stringify(d.chapters)}`);

  // 8. the edge of Galilee: a sprint west on the road stops at the boundary
  await teleport(-196, 6, -Math.PI / 2);
  await events();
  await holdSim(['KeyW', 'ShiftLeft'], 3);
  ev = await events();
  d = await diag();
  check('World boundary at the edge of the map', d.player.position.x > -205.5 && d.player.position.x < -199 && ev.some((e) => e.name === 'player:boundary'),
    `x=${d.player.position.x.toFixed(1)} events=${ev.map((e) => e.name).join(',')}`);

  // 9. stealing a chariot in front of the stable guard = Roman Attention (2+ stars)
  await setup(() => window.__JESUS_SIM__.session.romans.setActive(true));
  await teleport(26.4, -168.5, Math.PI / 2);
  await setup(() => {
    const R = window.__JESUS_SIM__.session.romans;
    R.attention.reset();
    R.syncState();
    window.__JESUS_SIM__.session.simulate(0.3);
  });
  await waitFrames(3);
  const stealPrompt = await setup(() => (document.getElementById('ride-prompt').hidden ? null : document.getElementById('ride-prompt-text').textContent));
  await events();
  await press('KeyF');
  // what F did, read before the guard reaches us
  const stolen = await setup(() => window.__JESUS_SIM__.session.vehicles.ridden?.kind ?? null);
  await sim(0.6);
  ev = await events();
  const theftEvents = ev;
  d = await diag();
  check('Stealing a Roman chariot is a crime', stealPrompt === 'Steal the Roman chariot' && stolen === 'chariot' && ev.some((e) => e.name === 'roman:crime' && e.type === 'chariot') && d.romans.stars >= 2 && (d.stats.chariotsStolen || 0) >= 1,
    `prompt=${stealPrompt} ride=${stolen} crimes=${ev.filter((e) => e.name === 'roman:crime').map((e) => e.type).join(',')} stars=${d.romans.stars}`);

  // 10. sit still: a legionary grabs the reins and drags you off the chariot
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    const R = S.romans;
    const v = S.vehicles.ridden;
    if (!v) return; // the stable guard already dragged him off
    for (const id of ['roman.felix', 'roman.cassius']) {
      const s = R.byId.get(id);
      R.place(s, v.pos.x + (id === 'roman.felix' ? 1.8 : -1.8), v.pos.y, v.pos.z + 1.2);
      R.setMode(s, 'pursue', { force: true });
    }
  });
  await events();
  await sim(2.5);
  await waitFrames(3);
  ev = theftEvents.concat(await events());
  d = await diag();
  check('Pulled off your ride by a legionary', ev.some((e) => e.name === 'vehicle:exit' && e.reason === 'pulled') && d.vehicles.ridden === null,
    `exits=${JSON.stringify(ev.filter((e) => e.name === 'vehicle:exit'))} mode=${d.mode} grab=${d.romans.grab}`);
  // calm everything down again
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    if (S.screen === 'arrested') S.finishArrest();
    S.romans.reset();
    S.romans.setActive(false);
    S.screen = 'playing';
  });
  await waitFrames(3);

  // 11. the circus: a full lap through the white line (autopilot), the best lap is kept
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    S.mountForTest('vehicle.horse.farm');
    const C = { x: 104, z: -172 };
    S.vehicles.place(S.vehicles.ridden, C.x + 6, C.z + 9.8, -Math.PI / 2);
    const lap = [[C.x - 12, C.z + 9.8], [C.x - 22.5, C.z + 3], [C.x - 22, C.z - 6], [C.x - 10, C.z - 10], [C.x + 10, C.z - 10], [C.x + 22, C.z - 6], [C.x + 22.5, C.z + 3], [C.x + 10, C.z + 9.8], [C.x - 8, C.z + 9.8]];
    S.driveForTest(lap, 16, false);
    S.driveForTest(lap, 16, false);
  });
  ev = await events();
  d = await diag();
  const laps = ev.filter((e) => e.name === 'circuit:lap');
  check('Circus lap timed and best lap saved', ev.some((e) => e.name === 'circuit:start') && laps.length >= 1 && laps[0].time > 6 && laps[0].time < 30 && d.stats.bestLap > 0 && d.stats.laps >= 1,
    `laps=${JSON.stringify(laps.map((l) => [+l.time.toFixed(2), l.record]))} best=${d.stats.bestLap}`);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.vehicles.dismount(S.player, S.playerState, { force: true }); });

  // 12. wildlife: pigeons burst off the square, goats scatter, the caravan walks, fish leap
  await teleport(-6, 10, Math.PI);
  const camelsA = (await diag()).wildlife.camels;
  await camBehind();
  await holdSim(['KeyW', 'ShiftLeft'], 1.5);
  const pig = (await diag()).wildlife.pigeonsFlying;
  await teleport(-162.5, -56, Math.PI);
  await events();
  await holdSim(['KeyW', 'ShiftLeft'], 3.5);
  const goats = new Set((await events()).filter((e) => e.name === 'animal:flee' && e.kind === 'goat').map((e) => e.entityId)).size;
  await teleport(166, -82, Math.PI, 1.2);
  await events();
  await sim(14);
  ev = await events();
  d = await diag();
  const camelsB = d.wildlife.camels;
  const caravanMoved = camelsB.some((c, i) => !c[2] && Math.hypot(c[0] - camelsA[i][0], c[1] - camelsA[i][1]) > 8);
  check('Wildlife: pigeons, goats, caravan, fish', pig >= 3 && goats >= 2 && caravanMoved && ev.filter((e) => e.name === 'fish:jump').length >= 2 && d.wildlife.birds > 30,
    `pigeonsFlying=${pig} goatsFleeing=${goats} caravanMoved=${caravanMoved} fish=${ev.filter((e) => e.name === 'fish:jump').length} birds=${d.wildlife.birds}`);

  // 13. Water to Wine works on the oasis pond (real 3 + Q)
  await teleport(66 - 6.4, 164, Math.PI / 2);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.cam.pitch = 0.05; });
  await page.keyboard.press('Digit3');
  await waitFrames(3);
  await press('KeyQ');
  await sim(1.5);
  const pond = await setup(() => { const w = window.__JESUS_SIM__.session.world.waterTargets.find((x) => x.id === 'water.oasis'); return { target: w.target, wine: w.wine }; });
  check('Water to Wine on the oasis pond', pond.target === 1 && pond.wine > 0.2, `target=${pond.target} wine=${pond.wine.toFixed(2)}`);
  await page.screenshot({ path: `${out}/p5-oasis-wine.png` });

  // 14. save & continue: ride stats and Galilee places persist; you come back on foot, rides at home
  await setup(() => { const S = window.__JESUS_SIM__.session; S.mountForTest('vehicle.camel.camp'); });
  const before = await diag();
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(4);
  await page.click('#btn-play');
  await waitFrames(8);
  d = await diag();
  const home = d.vehicles.vehicles.find((v) => v.id === 'vehicle.camel.camp');
  check('Save & continue keeps riding stats and Galilee places', d.mode === 'on-foot' && d.chapters.two === 8 && d.stats.rides === before.stats.rides && d.stats.bestLap === before.stats.bestLap && d.stats.ridden > 20 && d.stats.chariotsStolen >= 1 && Math.hypot(home.x - (-38), home.z - 159.5) < 2,
    `mode=${d.mode} two=${d.chapters.two} rides=${d.stats.rides}/${before.stats.rides} ridden=${Math.round(d.stats.ridden)} best=${d.stats.bestLap} camel=${home.x},${home.z}`);
}
