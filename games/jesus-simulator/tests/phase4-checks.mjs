/**
 * Phase 4 (Roman system) checks, run by tests/playtest.mjs in a fresh game.
 * Player actions use real key presses (E talk, number keys + Q to cast,
 * W/Shift to run). Page-side helpers only place actors, fast-forward the
 * fixed 60 Hz simulation and read state.
 */
export async function phase4Checks({ page, check, diag, waitFrames, hold, out }) {
  const setup = (fn, arg) => page.evaluate(fn, arg);
  const sim = (seconds) => page.evaluate((s) => window.__JESUS_SIM__.session.simulate(s), seconds);
  const select = async (n) => { await page.keyboard.press(`Digit${n}`); await waitFrames(2); };
  const castQ = async () => { await page.keyboard.press('KeyQ'); await waitFrames(3); };
  /** Put a soldier somewhere, optionally pinned to a temporary post. */
  const placeSoldier = (id, x, z, yaw, mode = 'duty', pin = false) => setup(([sid, sx, sz, syaw, smode, spin]) => {
    const S = window.__JESUS_SIM__.session;
    const R = S.romans;
    const s = R.byId.get(sid);
    if (s.ragdoll) { S.ragdolls.release(s.ragdoll); s.ragdoll = null; s.collider.setEnabled(true); }
    if (s.hidden) R.hide(s, false);
    R.place(s, sx, window.__JESUS_SIM__.terrainHeight(sx, sz), sz);
    s.yaw = syaw;
    s.lookYaw = 0;
    s.sweepT = 0;
    if (spin) s.post = { x: sx, z: sz, y: s.pos.y, yaw: syaw };
    R.setMode(s, smode, { force: true });
  }, [id, x, z, yaw, mode, pin]);
  /** Everyone else back to their normal duty spots (keeps a check focused). */
  const calm = (keep = []) => setup((ids) => {
    const S = window.__JESUS_SIM__.session;
    const R = S.romans;
    for (const s of R.soldiers) {
      if (ids.includes(s.id)) continue;
      if (s.ragdoll) { S.ragdolls.release(s.ragdoll); s.ragdoll = null; s.collider.setEnabled(true); }
      s.post = s.def.post ? S.world.anchors.romanPosts[s.def.post] : null;
      if (s.reserve) { R.hide(s, true); continue; }
      const p = R.dutySpot(s);
      R.place(s, p.x, window.__JESUS_SIM__.terrainHeight(p.x, p.z), p.z);
      R.setMode(s, 'duty', { force: true });
    }
  }, keep);
  const clearVillagers = (x, z, r) => setup(([cx, cz, cr]) => {
    const S = window.__JESUS_SIM__.session;
    for (const n of S.npcs.npcs) {
      if (n.hidden || Math.hypot(n.pos.x - cx, n.pos.z - cz) > cr) continue;
      S.npcs.leaveAnchor(n, true);
      S.npcs.place(n, -40, 1.2, 30 + Math.random() * 6);
      n.phase = 'none';
    }
  }, [x, z, r]);

  // fresh game with the garrison on duty
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(3);
  await page.click('#btn-new');
  await waitFrames(6);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.romans.setActive(true); S.unlockAllForTest(); S.playerState.faith = 10; });
  await waitFrames(3);

  // 1. garrison on duty: patrols walk their routes, posts are manned
  const start = await setup(() => window.__JESUS_SIM__.session.romans.soldiers.filter((s) => !s.hidden).map((s) => [s.id, s.pos.x, s.pos.z]));
  await sim(15);
  const after = await setup(() => window.__JESUS_SIM__.session.romans.soldiers.filter((s) => !s.hidden).map((s) => [s.id, s.pos.x, s.pos.z, s.mode]));
  const walked = after.filter((a, i) => Math.hypot(a[1] - start[i][1], a[2] - start[i][2]) > 4).map((a) => a[0]);
  let d = await diag();
  check('Roman garrison patrols and guards', d.romans.active === 12 && walked.length >= 4 && after.every((a) => a[3] === 'duty') && d.npcs.nav.unreachable === 0,
    `active=${d.romans.active} walking=${walked.join(',')} nav=${JSON.stringify(d.npcs.nav)}`);

  // 2. talk to a legionary with E; answer with 2; Esc leaves
  await calm();
  await clearVillagers(0, 12, 6);
  await placeSoldier('roman.flavius', 0, 10, 0, 'duty', true);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(0, 0, 11.7, Math.PI); S.cam.snap(S.playerState.position, 0); });
  await waitFrames(4);
  const prompt = await page.textContent('#prompt-text');
  await page.keyboard.press('KeyE');
  await waitFrames(4);
  const talkName = await page.textContent('#conv-name');
  await page.keyboard.press('Digit2');
  await waitFrames(3);
  const talkText = await page.textContent('#conv-text');
  await page.screenshot({ path: `${out}/roman-talk.png` });
  await page.keyboard.press('Escape');
  await waitFrames(3);
  d = await diag();
  check('talk to a legionary (E, answer, Esc)', prompt.includes('Flavius') && talkName.includes('Legionary') && /chase/i.test(talkText) && !d.dialogue && d.screen === 'playing',
    `prompt="${prompt}" name="${talkName}" text="${talkText.slice(0, 50)}…"`);

  // 3. line of sight: seen in the open, hidden behind a house
  const H = { x: -29, z: -47, ry: 0.15, d: 10 };
  const local = (lx, lz) => ({ x: H.x + lx * Math.cos(H.ry) + lz * Math.sin(H.ry), z: H.z - lx * Math.sin(H.ry) + lz * Math.cos(H.ry) });
  const sp = local(0, H.d / 2 + 9);
  await placeSoldier('roman.flavius', sp.x, sp.z, H.ry + Math.PI, 'duty', true);
  const open = local(1.5, H.d / 2 + 2);
  await setup((p) => { const S = window.__JESUS_SIM__.session; S.player.teleport(p.x, 0, p.z, 0); }, open);
  await waitFrames(4);
  const seenOpen = await setup(() => window.__JESUS_SIM__.session.romans.byId.get('roman.flavius').sees);
  const hidden = local(0, -H.d / 2 - 2.5);
  await setup((p) => { const S = window.__JESUS_SIM__.session; S.player.teleport(p.x, 0, p.z, 0); }, hidden);
  await waitFrames(4);
  const seenHidden = await setup(() => window.__JESUS_SIM__.session.romans.byId.get('roman.flavius').sees);
  check('legionaries need line of sight (house blocks the view)', seenOpen === true && seenHidden === false, `in the open=${seenOpen} behind the house=${seenHidden}`);

  // 4. a witnessed crime: Divine Push sends two villagers flying in front of a legionary -> wanted, chase
  await calm(['roman.flavius']);
  await clearVillagers(0, 9, 9);
  await placeSoldier('roman.flavius', 6.5, 7.5, Math.atan2(-6.5, 4.5), 'duty', true);
  const spawned0 = (await diag()).ragdolls.spawned;
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    ['npc.villager.1', 'npc.villager.2'].forEach((id, i) => {
      const n = S.npcs.byId.get(id);
      S.npcs.leaveAnchor(n, true);
      S.npcs.place(n, -0.7 + i * 1.4, 1.2, 10);
      n.override = { type: 'look', t: 5, age: 0 };
    });
    S.player.teleport(0, 0, 12, Math.PI);
    S.cam.snap(S.playerState.position, 0);
  });
  await waitFrames(3);
  await select(1);
  await castQ();
  await waitFrames(3);
  d = await diag();
  const wantedClass = await page.getAttribute('#attention', 'class');
  const fl = await setup(() => { const s = window.__JESUS_SIM__.session.romans.byId.get('roman.flavius'); return s.mode; });
  await page.screenshot({ path: `${out}/roman-wanted.png` });
  check('witnessed crime raises Roman Attention and starts a chase', d.romans.stars >= 1 && fl === 'pursue' && d.ragdolls.spawned - spawned0 >= 2 && wantedClass.includes('wanted'),
    `stars=${d.romans.stars} heat=${d.romans.heat} flavius=${fl} villager ragdolls=${d.ragdolls.spawned - spawned0}`);

  // 5. ragdolled villagers get back up (Jesus waits out of sight meanwhile)
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(60, 0, -60, 0); });
  await sim(6);
  const vill = await setup(() => ['npc.villager.1', 'npc.villager.2'].map((id) => {
    const n = window.__JESUS_SIM__.session.npcs.byId.get(id);
    return { ragdoll: !!n.ragdoll, collider: n.collider.isEnabled(), ok: Number.isFinite(n.pos.x + n.pos.y + n.pos.z), y: n.pos.y };
  }));
  check('ragdolled villagers stand back up', vill.every((v) => !v.ragdoll && v.collider && v.ok && v.y > 0.5 && v.y < 4), JSON.stringify(vill));

  // 6. Divine Push on a legionary: ragdoll flight, more stars, he gets up and resumes the chase
  await calm(['roman.flavius']);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(0, 0, 12, Math.PI); S.cam.snap(S.playerState.position, 0); S.romans.markSeen(S.playerState.position); });
  await placeSoldier('roman.flavius', 0.3, 9.6, 0, 'pursue');
  const stars0 = (await diag()).romans.stars;
  await castQ();
  const flight = await setup(() => {
    const s = window.__JESUS_SIM__.session.romans.byId.get('roman.flavius');
    return { ragdoll: !!s.ragdoll, mode: s.mode };
  });
  await waitFrames(4);
  const moved6 = await setup(() => { const s = window.__JESUS_SIM__.session.romans.byId.get('roman.flavius'); return Math.hypot(s.pos.x - 0.3, s.pos.z - 9.6); });
  d = await diag();
  await page.screenshot({ path: `${out}/roman-ragdoll.png` });
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(60, 0, -60, 0); });
  await sim(6);
  const upAgain = await setup(() => { const s = window.__JESUS_SIM__.session.romans.byId.get('roman.flavius'); return { ragdoll: !!s.ragdoll, mode: s.mode, collider: s.collider.isEnabled(), bruised: !!s.injured }; });
  check('Divine Push ragdolls a legionary; he gets up angrier', flight.ragdoll && flight.mode === 'down' && moved6 > 1.5 && d.romans.stars > stars0 && !upAgain.ragdoll && upAgain.collider && upAgain.bruised && ['pursue', 'search', 'getup'].includes(upAgain.mode),
    `flew ${moved6.toFixed(1)} m, stars ${stars0} -> ${d.romans.stars}, after: ${JSON.stringify(upAgain)}`);

  // 7. Healing Touch on the bruised legionary: he looks the other way (-1 star)
  await calm(['roman.flavius']);
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(0, 0, 12, Math.PI); S.cam.snap(S.playerState.position, 0); S.romans.markSeen(S.playerState.position); });
  await placeSoldier('roman.flavius', 0, 10.2, 0, 'pursue');
  const before7 = (await diag()).romans.stars;
  await select(5);
  await castQ();
  await waitFrames(3);
  d = await diag();
  const fmode = await setup(() => window.__JESUS_SIM__.session.romans.byId.get('roman.flavius').mode);
  check('Healing Touch on a legionary lowers Roman Attention', d.romans.stars === before7 - 1 && fmode === 'friendly', `stars ${before7} -> ${d.romans.stars}, flavius=${fmode}`);

  // 8. losing them: sprint away, stay out of sight until the search is called off
  await calm();
  await setup(() => { const S = window.__JESUS_SIM__.session; S.romans.crime('assault', { victim: S.romans.byId.get('roman.quintus') }); });
  d = await diag();
  const starsBefore = d.romans.stars;
  await clearVillagers(4, 32, 14);
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    window.__lost = [];
    S.bus.on('roman:lost', () => window.__lost.push(document.getElementById('toasts').textContent));
    // sprint away down the south road
    S.player.teleport(3, 0, 22, 0.05);
    S.cam.snap(S.playerState.position, Math.PI + 0.05);
  });
  await page.keyboard.down('ShiftLeft');
  await hold('KeyW', 30);
  await page.keyboard.up('ShiftLeft');
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(66, 0, 58, 0); });
  const searching = await setup(async () => {
    const S = window.__JESUS_SIM__.session;
    S.simulate(2);
    return S.romans.attention.unseen > 0;
  });
  await sim(16);
  await waitFrames(2);
  d = await diag();
  const lostToasts = await setup(() => window.__lost);
  check('break line of sight and the Romans give up', starsBefore >= 1 && searching && d.romans.stars === 0 && d.stats.escapes >= 1 && lostToasts.length === 1 && lostToasts[0].includes('lost them'),
    `stars ${starsBefore} -> ${d.romans.stars}, escapes=${d.stats.escapes}`);

  // 9. three stars: horn, the garrison joins in and reinforcements arrive from out of view
  await calm();
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(-1, 0, 6, Math.PI); S.cam.snap(S.playerState.position, 0); });
  await waitFrames(2);
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    const q = S.romans.byId.get('roman.quintus');
    for (let i = 0; i < 3; i += 1) S.romans.crime('assault', { victim: q });
  });
  await sim(5);
  d = await diag();
  const reinf = await setup(() => {
    const S = window.__JESUS_SIM__.session;
    const p = S.playerState.position;
    return S.romans.soldiers.filter((s) => s.reserve && !s.hidden).map((s) => ({ mode: s.mode, d: +Math.hypot(s.pos.x - p.x, s.pos.z - p.z).toFixed(1) }));
  });
  check('3 stars: reinforcements join the hunt', d.romans.stars >= 3 && reinf.length >= 2 && reinf.every((r) => ['pursue', 'search'].includes(r.mode) && r.d < 80) && (d.romans.modes.pursue || 0) >= 4,
    `stars=${d.romans.stars} reinforcements=${JSON.stringify(reinf)} modes=${JSON.stringify(d.romans.modes)}`);

  // 10. seized, then break free with Divine Push
  await calm();
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(0, 0, 12, Math.PI); S.cam.snap(S.playerState.position, 0); S.romans.markSeen(S.playerState.position); S.romans.grab = 0; });
  await placeSoldier('roman.brutus', 0, 11, 0, 'pursue');
  let grabbed = 0;
  let meterShown = false;
  for (let i = 0; i < 30 && grabbed < 0.3; i += 1) {
    await waitFrames(1);
    grabbed = (await diag()).romans.grab;
    meterShown = meterShown || (await page.getAttribute('#grab-meter', 'hidden')) === null;
  }
  await page.screenshot({ path: `${out}/roman-grab.png` });
  await select(1);
  await castQ();
  await waitFrames(12);
  d = await diag();
  check('seized: a Divine Push breaks free', grabbed >= 0.3 && meterShown && d.screen === 'playing' && d.romans.grab < grabbed && d.romans.ragdolls >= 1,
    `grab peaked ${grabbed.toFixed(2)}, after push ${d.romans.grab}, ragdolls=${d.romans.ragdolls}, meter=${meterShown}`);

  // 11. Water to Wine distracts pursuing legionaries
  await calm();
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(2.8, 0, 2.8, Math.atan2(-2.8, -2.8)); S.cam.snap(S.playerState.position, Math.atan2(2.8, 2.8)); S.romans.markSeen(S.playerState.position); S.miracles.cooldowns.clear(); });
  await placeSoldier('roman.brutus', 9, 9, 0, 'pursue');
  await select(3);
  await castQ();
  await waitFrames(3);
  const distracted = await setup(() => window.__JESUS_SIM__.session.romans.byId.get('roman.brutus').mode);
  check('Water to Wine distracts the legionaries', distracted === 'distracted', `brutus=${distracted}`);

  // 12. arrest: stand still next to two pursuers; card, fine, release at the checkpoint
  await calm();
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    S.playerState.faith = 10;
    S.player.teleport(0, 0, 12, Math.PI);
    S.cam.snap(S.playerState.position, 0);
    S.romans.crime('assault', { victim: S.romans.byId.get('roman.brutus') });
    S.romans.crime('assault', { victim: S.romans.byId.get('roman.brutus') });
    S.romans.markSeen(S.playerState.position);
  });
  await placeSoldier('roman.brutus', 0, 10.4, 0, 'pursue');
  await placeSoldier('roman.sextus', 1.3, 12.4, -Math.PI / 2, 'pursue');
  let screen = 'playing';
  for (let i = 0; i < 80 && screen !== 'arrested'; i += 1) { await waitFrames(2); screen = (await diag()).screen; }
  const card = await page.isVisible('#arrest-card');
  await page.screenshot({ path: `${out}/roman-arrest.png` });
  await waitFrames(8);
  await page.keyboard.press('KeyE');
  await waitFrames(4);
  d = await diag();
  const rel = d.player.position;
  check('arrest: card, fine, release at the checkpoint',
    screen === 'arrested' && card && d.screen === 'playing' && Math.hypot(rel.x + 1.5, rel.z + 95) < 2 && d.romans.stars === 0 && d.stats.arrests === 1 && d.faith < 10 && d.romans.reserves === 0,
    `screen=${screen} card=${card} after=${d.screen} pos=${rel.x.toFixed(1)},${rel.z.toFixed(1)} arrests=${d.stats.arrests} faith=${d.faith}`);

  // 13. restricted area: walk through the camp gate -> warning, then a star
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    window.__warnings = [];
    S.bus.on('roman:warning', () => window.__warnings.push(document.getElementById('toasts').textContent));
    S.player.teleport(2.6, 0, -108, Math.PI / 2);
    S.cam.snap(S.playerState.position, -Math.PI / 2);
  });
  await waitFrames(2);
  await hold('KeyW', 30);
  d = await diag();
  const inside = d.player.position.x > 6.5;
  // fast-forward until the guards act (stop before they can seize him)
  await setup(() => {
    const S = window.__JESUS_SIM__.session;
    for (let i = 0; i < 40 && S.romans.attention.stars === 0; i += 1) S.simulate(0.25);
  });
  await waitFrames(1);
  const warnings = await setup(() => window.__warnings.length);
  const warnToast = await page.textContent('#toasts') + (await setup(() => [...document.querySelectorAll('#toasts *')].map((e) => e.textContent).join(' ')));
  d = await diag();
  check('trespassing in the Roman camp: warning, then wanted', inside && warnings >= 1 && d.romans.stars >= 1,
    `inside=${inside} x=${d.player.position.x.toFixed(1)} warnings=${warnings} toast=${warnToast.includes('Restricted')} stars=${d.romans.stars} modes=${JSON.stringify(d.romans.modes)} seeing=${d.romans.seeing}`);
  await page.screenshot({ path: `${out}/roman-camp.png` });
  // leave the camp and let things calm down before saving
  await setup(() => { const S = window.__JESUS_SIM__.session; S.player.teleport(-1.5, 0, -90, Math.PI); S.romans.resetDuty(true); S.romans.syncState(); });
  await waitFrames(3);

  // 14. Roman record persists (arrests, escapes, highest attention); wanted level does not
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(3);
  await page.click('#btn-play');
  await waitFrames(5);
  d = await diag();
  check('Roman record persists; wanted level resets on load', d.stats.arrests === 1 && d.stats.escapes >= 1 && d.stats.maxStars >= 3 && d.romans.stars === 0,
    `arrests=${d.stats.arrests} escapes=${d.stats.escapes} maxStars=${d.stats.maxStars} stars=${d.romans.stars}`);
}
