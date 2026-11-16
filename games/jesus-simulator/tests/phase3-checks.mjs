/**
 * Phase 3 (miracles) checks, run by tests/playtest.mjs in a fresh game.
 * Miracles are selected with the number keys and cast with real key presses
 * (Q = keyboard cast; held for levitation). Page-side helpers only place
 * actors, discover landmarks by walking/teleporting and fast-forward time.
 */
export async function phase3Checks({ page, check, diag, waitFrames, hold, out }) {
  const setup = (fn, arg) => page.evaluate(fn, arg);
  const sim = (seconds) => page.evaluate((s) => window.__JESUS_SIM__.session.simulate(s), seconds);
  const visit = async (x, z, yaw = 0) => {
    await setup(([px, pz, py]) => { const s = window.__JESUS_SIM__.session; s.player.teleport(px, 0, pz, py); }, [x, z, yaw]);
    await waitFrames(4);
  };
  const select = async (n) => { await page.keyboard.press(`Digit${n}`); await waitFrames(2); };
  const castQ = async () => { await page.keyboard.press('KeyQ'); await waitFrames(3); };

  // fresh game
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(3);
  await page.click('#btn-new');
  await waitFrames(6);

  // 1. locked miracles refuse to cast
  // toasts last ~3 s, a handful of software-rendered frames: watch for them rather than read them late
  await setup(() => {
    window.__toastLog = '';
    new MutationObserver(() => { window.__toastLog += document.getElementById('toasts').textContent; }).observe(document.getElementById('toasts'), { childList: true, subtree: true, characterData: true });
  });
  await select(2);
  await castQ();
  let d = await diag();
  const lockedOk = d.unlocked.length === 0 && (d.props.copies || 0) === 0 && (await setup(() => window.__toastLog)).includes('not yet been revealed');
  check('locked miracles cannot be cast', lockedOk, `unlocked=${JSON.stringify(d.unlocked)}`);

  // 2. discovering the workshop reveals Divine Push
  await visit(-27, 14);
  d = await diag();
  const banner = await page.textContent('#banner');
  check('landmark reveals a miracle (workshop -> Divine Push)', d.unlocked.includes('miracle.divine-push') && d.selected === 0,
    `unlocked=${JSON.stringify(d.unlocked)} banner="${banner.slice(0, 60)}"`);

  // 3. Divine Push knocks a villager and props back; cooldown prevents spam
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const n = s.npcs.byId.get('npc.villager.1');
    s.npcs.leaveAnchor(n, true);
    s.npcs.place(n, 4, 1.2, 15.5);
    n.override = { type: 'look', t: 4, age: 0 };
    s.player.teleport(4, 0, 18, Math.PI);
    s.cam.snap(s.playerState.position, 0);
    window.__npcStart = { x: n.pos.x, z: n.pos.z };
  });
  await waitFrames(3);
  await select(1);
  const casts0 = (await diag()).stats.miracles || 0;
  await castQ();
  await castQ(); // immediately again: should be on cooldown
  await waitFrames(20);
  const pushRes = await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const n = s.npcs.byId.get('npc.villager.1');
    return { moved: Math.hypot(n.pos.x - window.__npcStart.x, n.pos.z - window.__npcStart.z), o: n.override?.type, casts: s.playerState.stats.miracles || 0 };
  });
  await page.screenshot({ path: `${out}/push.png` });
  check('Divine Push shoves villagers (cooldown blocks spam)', pushRes.moved > 1 && pushRes.casts - casts0 === 1, `npc moved ${pushRes.moved.toFixed(2)} m, casts=${pushRes.casts - casts0}`);

  // 4. Multiplication: market reveals it, Q multiplies bread, holding Q keeps going, hard cap holds
  await visit(0, -25);
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const eli = s.npcs.byId.get('npc.eli');
    const f = s.world.anchors.stalls[eli.def.stall].front;
    for (const n of s.npcs.npcs) if (n !== eli && Math.hypot(n.pos.x - f.x, n.pos.z - f.z) < 4) { s.npcs.leaveAnchor(n, true); s.npcs.place(n, 0, 1.2, 9); }
    s.player.teleport(f.x, 0, f.z, f.yaw);
    s.cam.snap(s.playerState.position, f.yaw + Math.PI);
  });
  await waitFrames(3);
  await select(2);
  const label = await page.textContent('#miracle-label');
  await castQ();
  const c1 = (await diag()).props.copies;
  await hold('KeyQ', 40);
  await waitFrames(5);
  const c2 = (await diag()).props.copies;
  const cap = await setup(() => {
    const s = window.__JESUS_SIM__.session;
    for (let i = 0; i < 70; i += 1) { s.miracles.cooldowns.clear(); s.miracles.tryCast('miracle.multiplication'); }
    s.simulate(0.2);
    return s.world.propSystem.copies.length;
  });
  await page.screenshot({ path: `${out}/multiply.png` });
  d = await diag();
  check('Multiplication: Q copies bread, holding repeats, capped at 80',
    d.unlocked.includes('miracle.multiplication') && label.includes('Multiply') && c1 >= 2 && c2 > c1 && cap <= 80 && cap >= 60,
    `label="${label}" after1=${c1} afterHold=${c2} afterSpam=${cap}`);

  // 5. Water to Wine at the well: reveals at the well, turns it to wine, villagers react, Faith rises
  await visit(2.8, 2.8, Math.atan2(-2.8, -2.8));
  await setup(() => { const s = window.__JESUS_SIM__.session; s.cam.snap(s.playerState.position, Math.atan2(2.8, 2.8)); });
  await waitFrames(3);
  const faith0 = (await diag()).faith;
  await select(3);
  await castQ();
  await waitFrames(10);
  d = await diag();
  check('Water to Wine turns the well to wine (+Faith)', d.unlocked.includes('miracle.water-to-wine') && d.miracles.wine.includes('water.well') && d.faith > faith0,
    `wine=${JSON.stringify(d.miracles.wine)} faith ${faith0} -> ${d.faith}`);

  // 6. Healing Touch: discover the synagogue, heal Benjamin
  await visit(28, 14);
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const b = s.npcs.byId.get('npc.benjamin');
    s.npcs.leaveAnchor(b, true);
    s.npcs.place(b, 18, 1.2, 8);
    b.override = { type: 'look', t: 5, age: 0 };
    s.player.teleport(18, 0, 10.2, Math.PI);
    s.cam.snap(s.playerState.position, 0);
  });
  await waitFrames(3);
  const faith1 = (await diag()).faith;
  await select(5);
  await castQ();
  await waitFrames(6);
  const healed = await setup(() => window.__JESUS_SIM__.session.npcs.byId.get('npc.benjamin').injured === null);
  d = await diag();
  await page.screenshot({ path: `${out}/heal.png` });
  check('Healing Touch cures an injured villager (+Faith)', d.unlocked.includes('miracle.healing-touch') && healed && d.faith >= faith1 + 5, `healed=${healed} faith ${faith1} -> ${d.faith}`);

  // 7. Holy Levitation: discover the lookout roof, then hold Q on a villager, release to set them down
  await setup(() => { const s = window.__JESUS_SIM__.session; s.player.teleport(-29, 9, -47, 0); });
  await waitFrames(4);
  await setup(() => {
    const s = window.__JESUS_SIM__.session;
    const n = s.npcs.byId.get('npc.villager.2');
    s.npcs.leaveAnchor(n, true);
    s.npcs.place(n, 8, 1.2, 14);
    n.override = { type: 'look', t: 6, age: 0 };
    s.player.teleport(8, 0, 16.4, Math.PI);
    s.cam.snap(s.playerState.position, 0);
  });
  await waitFrames(3);
  await select(6);
  await page.keyboard.down('KeyQ');
  await waitFrames(25);
  const up = await setup(() => { const s = window.__JESUS_SIM__.session; const n = s.npcs.byId.get('npc.villager.2'); return { y: n.pos.y, lifting: s.miracles.lift?.target.id ?? null }; });
  await page.screenshot({ path: `${out}/levitate.png` });
  await page.keyboard.up('KeyQ');
  await waitFrames(25);
  const down = await setup(() => { const s = window.__JESUS_SIM__.session; const n = s.npcs.byId.get('npc.villager.2'); return { y: n.pos.y, lifting: s.miracles.lift?.target.id ?? null }; });
  check('Holy Levitation lifts while Q is held, sets down on release', up.lifting === 'npc.villager.2' && up.y > 2.5 && down.lifting === null && down.y < 1.6,
    `held y=${up.y.toFixed(2)} released y=${down.y.toFixed(2)}`);

  // 8. Walk on Water: shore reveals it; deep water blocks wading; with the miracle you walk out; expiry over deep water sinks you to the dock
  await visit(113, -8, Math.PI / 2);
  await setup(() => { const s = window.__JESUS_SIM__.session; s.player.teleport(116, 0, -2, Math.PI / 2); s.cam.snap(s.playerState.position, -Math.PI / 2); });
  await page.keyboard.down('KeyW');
  let lastX = -1;
  for (let i = 0; i < 60; i += 1) {
    await waitFrames(8);
    const x = (await diag()).player.position.x;
    if (Math.abs(x - lastX) < 0.02) break;
    lastX = x;
  }
  await page.keyboard.up('KeyW');
  const wade = (await diag()).water;
  await select(4);
  await castQ();
  await hold('KeyW', 60);
  const walk = await diag();
  await page.screenshot({ path: `${out}/water.png` });
  const sank = await setup(() => {
    const s = window.__JESUS_SIM__.session;
    s.player.teleport(140, 0.1, -12, Math.PI / 2);
    s.simulate(26);
    return { x: s.playerState.position.x, water: s.miracles.water, depth: s.playerState.waterDepth };
  });
  check('Walk on Water: wading stops at depth, the miracle lets you walk out, expiry sinks you to the dock',
    walk.unlocked.includes('miracle.walk-on-water') && wade.depth < 1.6 && walk.water.onWater && walk.player.position.y > -0.2 && sank.water === null && sank.x < 120,
    `wade depth=${wade.depth} on water=${walk.water.onWater} y=${walk.player.position.y.toFixed(2)} after expiry x=${sank.x.toFixed(1)}`);

  // 9. revealed gifts persist through Save & Quit -> Continue
  await page.keyboard.press('Escape');
  await waitFrames(3);
  await page.click('.pause-nav [data-tab="quit"]');
  await waitFrames(3);
  await page.click('#btn-play');
  await waitFrames(5);
  d = await diag();
  check('revealed miracles persist', d.unlocked.length === 6, JSON.stringify(d.unlocked));
}
