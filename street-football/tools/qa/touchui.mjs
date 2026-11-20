// Touch controls check (phone emulation): floating stick, sprint at the rim, context buttons, net roof.
// node tools/qa/touchui.mjs <outDir> [baseUrl]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'artifacts/touchui';
const base = process.argv[3] ?? 'http://127.0.0.1:5188/?qa=1';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const report = {};
for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 7'].userAgent });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}-1-lobby.png` });
  const r = { errors };
  // Floating stick: put the thumb down somewhere in the left half, then push to the rim.
  const x0 = Math.round(vp.width * 0.28);
  const y0 = Math.round(vp.height * 0.7);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', x0, y0);
  await page.waitForTimeout(150);
  const placed = await page.evaluate(() => { const b = document.getElementById('touch-stick').getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; });
  r.stickUnderThumb = Math.hypot(placed[0] - x0, placed[1] - y0) < 6;
  await touch('touchMove', x0 + 25, y0);
  await page.waitForTimeout(300);
  r.halfPushSprint = await page.evaluate(() => window.__RUA10__.input.touchHeld.sprint);
  await touch('touchMove', x0 + 90, y0);
  await page.waitForTimeout(300);
  r.rimSprint = await page.evaluate(() => window.__RUA10__.input.touchHeld.sprint);
  const px0 = await page.evaluate(() => window.__RUA10__.human.p.position.x);
  await page.waitForFunction((x) => Math.abs(window.__RUA10__.human.p.position.x - x) > 1, px0, { timeout: 60000 }).catch(() => {});
  r.moved = await page.evaluate((x) => +Math.abs(window.__RUA10__.human.p.position.x - x).toFixed(1), px0);
  await page.screenshot({ path: `${out}/${name}-2-stick.png` });
  await touch('touchEnd', 0, 0);
  // Context: attack set in free play; defence set when the opponents have the ball.
  const visible = () => page.evaluate(() => [...document.querySelectorAll('#touch-buttons .tbtn')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()));
  r.attackButtons = await visible();
  await page.evaluate(() => {
    const g = window.__RUA10__;
    const h = window.__THREE_GAME_TEST_HOOKS__;
    g.closeLobbyMenu?.();
    h.setState('defending');
    h.setPausedForScreenshot(true);
    // An opponent on the ball, close to the human.
    const opp = g.match.teams.away.players[0];
    const p = g.human.p.position;
    opp.p.teleport(p.x - 2, p.z, Math.PI / 2);
    g.ball.placeAt(p.x - 1.5, 0.11, p.z);
    g.match.setOwner(opp);
    opp.possession = true;
    g.updateTouchContext();
    g.render();
  });
  await page.waitForTimeout(800);
  r.defendCtx = await page.evaluate(() => document.getElementById('touch-controls').dataset.ctx);
  r.defendButtons = await visible();
  await page.screenshot({ path: `${out}/${name}-3-defend.png` });
  // Tap SWITCH / TACKLE are real buttons.
  const tackle = page.locator('#touch-buttons .tbtn.big.def');
  const box = await tackle.boundingBox();
  r.tackleBox = box && [Math.round(box.width), Math.round(box.height)];
  await page.evaluate(() => { const g = window.__RUA10__; g.gb.meter = 1; g.updateTouchContext(); });
  r.gbShown = await page.locator('#touch-buttons .tbtn.gb').isVisible();
  report[name] = r;
  await ctx.close();
}
// Goal net roof, seen from the side and from above.
const page = await browser.newPage({ viewport: { width: 700, height: 420 } });
await page.goto(base);
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 120000 });
for (const [n, pos, look] of [['net-side', [-12.5, 3.2, -6], [-15.6, 1.2, 0]], ['net-top', [-13, 6.5, 0.01], [-15.6, 1.5, 0]]]) {
  await page.evaluate(([pos, look]) => {
    const g = window.__RUA10__;
    window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
    document.getElementById('hud').style.display = 'none';
    g.camera.position.set(...pos); g.camera.lookAt(...look); g.camera.fov = 50; g.camera.updateProjectionMatrix(); g.render();
  }, [pos, look]);
  await page.screenshot({ path: `${out}/${n}.png` });
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
