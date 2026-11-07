/**
 * Online end-to-end: host creates a room, guest joins by code through the UI,
 * both race the same track; checks the guest follows host state and both get
 * the same official result and room scores.
 *   node tests/online/peer-server.cjs 9000 &   (and the dev server on 5188)
 *   node tests/online/two-players.cjs <shot-dir>
 */
const { chromium } = require('playwright');
const out = process.argv[2] ?? '.';
const URL = 'http://127.0.0.1:5188/?peerhost=127.0.0.1&peerport=9000&peerpath=/&peersecure=0';
(async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('pam.settings.v1', JSON.stringify({ quality: 'low', tutorials: { editor: true } })));
    p.errors = [];
    p.on('pageerror', (e) => p.errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
    await p.goto(URL);
    await p.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.screen === 'menu', null, { timeout: 120000 });
    await p.click('button[data-act="online"]');
    await p.fill('#nameIn', name);
    return p;
  };
  const host = await mk('Jacopo');
  const guest = await mk('Ospite');
  await host.click('.skin-row .ball[data-skin="art_watermelon"]');
  await host.click('button[data-act="onlineCreate"]');
  await host.waitForSelector('.room-code', { timeout: 20000 });
  const code = (await host.textContent('.room-code')).trim();
  console.log('room code', code);
  await guest.click('.skin-row .ball[data-skin="art_smiley"]');
  await guest.fill('#codeIn', code);
  await guest.click('button[data-act="onlineJoin"]');
  await guest.waitForSelector('.room-code', { timeout: 20000 });
  await host.waitForFunction(() => window.__PAM__.online.players.length === 2);
  await host.selectOption('#trackSel', 'b_loops');
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${out}/online-host-lobby.png` });
  await guest.screenshot({ path: `${out}/online-guest-lobby.png` });
  console.log('guest sees players:', await guest.evaluate(() => window.__PAM__.online.players.map((p) => `${p.name}:${p.skin}`).join(', ')));
  // drive both pages deterministically from here (software GL is slow)
  for (const p of [host, guest]) await p.evaluate(() => (window.__PAM__.manualClock = true));
  await host.click('button[data-act="onlineStart"]');
  await guest.waitForFunction(() => window.__PAM__.screen === 'race', null, { timeout: 10000 });
  let maxErr = 0;
  for (let i = 0; i < 400; i += 1) {
    await host.evaluate(() => window.__PAM__.advance(0.1));
    await guest.evaluate(() => window.__PAM__.advance(0.1));
    if (i % 25 === 0) {
      const hp = await host.evaluate(() => window.__PAM__.race.sim?.states.map((s) => s.pos.toArray()));
      const gp = await guest.evaluate(() => window.__PAM__.race.sim?.states.map((s) => s.pos.toArray()));
      if (hp && gp) {
        const err = Math.max(...hp.map((a, k) => Math.hypot(a[0] - gp[k][0], a[1] - gp[k][1], a[2] - gp[k][2])));
        maxErr = Math.max(maxErr, err);
      }
      if (i === 100) {
        await host.screenshot({ path: `${out}/online-host-race.png` });
        await guest.screenshot({ path: `${out}/online-guest-race.png` });
      }
    }
    const done = await guest.evaluate(() => window.__PAM__.race.state === 'finished');
    if (done) break;
  }
  // results appear 1.8 s (page timers) after the finish
  for (let i = 0; i < 12; i += 1) {
    await host.evaluate(() => window.__PAM__.advance(0.1));
    await guest.evaluate(() => window.__PAM__.advance(0.1));
    await host.waitForTimeout(250);
  }
  const hr = await host.evaluate(() => ({ screen: window.__PAM__.screen, rows: window.__PAM__.race.result?.rows.map((r) => r.name).join('>'), scores: window.__PAM__.online.players.map((p) => `${p.name}=${p.score}`).join(' ') }));
  const gr = await guest.evaluate(() => ({ screen: window.__PAM__.screen, rows: window.__PAM__.race.result?.rows.map((r) => r.name).join('>'), scores: window.__PAM__.online.players.map((p) => `${p.name}=${p.score}`).join(' ') }));
  console.log('max host/guest position gap sampled:', maxErr.toFixed(3));
  console.log('host :', JSON.stringify(hr));
  console.log('guest:', JSON.stringify(gr));
  console.log('same official order:', hr.rows === gr.rows);
  await host.screenshot({ path: `${out}/online-host-results.png` });
  await guest.screenshot({ path: `${out}/online-guest-results.png` });
  // guest leaves, host sees it
  await guest.click('#modal button[data-act="onlineLobby"]');
  await guest.click('button[data-act="onlineLeave"]');
  await host.waitForFunction(() => window.__PAM__.online.players.length === 1, null, { timeout: 15000 });
  console.log('guest left, host players:', await host.evaluate(() => window.__PAM__.online.players.length));
  console.log('errors host:', host.errors, 'guest:', guest.errors);
  await browser.close();
})();
