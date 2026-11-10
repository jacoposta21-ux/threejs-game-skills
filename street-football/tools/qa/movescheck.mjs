// Checks the v1.3 move set through the real controller: flair skills (R), lob / through / one-two,
// volley, bicycle kick, slide tackle and the Gamebreaker.
// node tools/qa/movescheck.mjs [outDir] [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? null;
const base = process.argv[3] ?? 'http://127.0.0.1:5188/';
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 420, height: 420 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });

const run = (name, capture = false) =>
  page.evaluate(
    ({ name, capture }) => {
      const h = window.__THREE_GAME_TEST_HOOKS__;
      const g = window.__RUA10__;
      h.seed(11);
      h.setState('active-play');
      h.setPausedForScreenshot(true);
      const hk = g.human;
      const home = g.match.teams.home.players;
      const away = g.match.teams.away.players;
      const keeper = g.match.teams.away.keeper;
      for (const c of [...home, ...away]) c.reset();
      const ev = [];
      const offs = ['trickStart', 'trick', 'kick', 'kickStart', 'tackle', 'tackleStart', 'control', 'whiff', 'goal', 'passRequest', 'save'].map((n) =>
        g.events.on(n, (e) => ev.push(`${n}:${e.kind ?? e.type ?? ''}${e.aerial ? ':' + e.aerial : ''}${e.lob ? ':lob' : ''}${e.through ? ':through' : ''}${e.slide ? ':slide' : ''}${e.outcome ? ':' + e.outcome : ''}${e.success != null ? ':' + e.success : ''}${e.team ? ':' + e.team : ''}${n === 'control' ? ':' + e.player.look.name : ''}${n === 'kick' && e.target ? '>' + e.target.p.look.name : ''}${n === 'kick' ? '@v=' + [g.ball.velocity.x, g.ball.velocity.y, g.ball.velocity.z].map((v) => v.toFixed(0)).join(',') + ',y=' + g.ball.position.y.toFixed(1) : ''}`)),
      );
      const shots = [];
      const snap = (who = hk.p) => {
        if (!capture) return;
        const p = who.holder.position;
        g.camera.position.set(p.x + 0.6, 1.7, p.z - 5.2);
        g.camera.lookAt(p.x, 1.0, p.z);
        g.camera.fov = 42;
        g.camera.updateProjectionMatrix();
        g.render();
        shots.push(g.renderer.domElement.toDataURL('image/jpeg', 0.8));
      };
      const sim = (t, it = {}, frames = 0, who) => {
        if (!frames) return h.simulate(t, it);
        for (let i = 0; i < frames; i += 1) {
          h.simulate(t / frames, i === 0 ? it : { ...it, skillPressed: false, skill2Pressed: false, passPressed: false, tacklePressed: false, shootPressed: false, specialPressed: false });
          snap(who);
        }
      };
      const park = (list, x, z) => list.forEach((c, i) => { c.p.teleport(x + i * 1.5, z, 0); c.frozen = true; });
      const noFail = () => { const r = hk.rng; hk.rng = () => 0.99; hk.rng.gauss = () => 0; hk.rng.range = r.range; return () => { hk.rng = r; }; };
      const res = { name };
      const start = (x = 2, heading = -Math.PI / 2) => {
        hk.p.teleport(x, 0, heading);
        g.ball.placeAt(x - 0.5, 0.11, 0);
        sim(0.3, { moveX: 1 });
      };

      if (['elastico', 'sombrero', 'dragback'].includes(name)) {
        park(away, 13, 8);
        if (name === 'sombrero') { away[0].p.teleport(-0.6, 0, Math.PI / 2); }
        start();
        const restore = noFail();
        const it = name === 'sombrero' ? { moveX: 1 } : name === 'dragback' ? { moveX: -1 } : {};
        sim(0.75, { ...it, skill2Pressed: true }, 6);
        restore();
        let maxY = 0;
        for (let i = 0; i < 20; i += 1) { sim(0.05, { moveX: 1 }); maxY = Math.max(maxY, g.ball.position.y); }
        res.maxBallY = +maxY.toFixed(2);
        res.possession = hk.possession;
      } else if (name === 'lob' || name === 'through') {
        park(away, 13, 8);
        home[1].p.teleport(-6, 3, -Math.PI / 2);
        start();
        const mateX = home[1].p.position.x;
        if (name === 'lob') { sim(0.05, { moveX: 1, passPressed: true, passHeld: true }); sim(0.3, { moveX: 1, passHeld: true }); sim(0.05, { moveX: 1, passHeld: false, passReleased: true }); }
        else { sim(0.05, { moveX: 1, sprint: true, passPressed: true, passHeld: true }); sim(0.05, { moveX: 1, sprint: true, passHeld: false, passReleased: true }); }
        let maxY = 0;
        let landX = null;
        for (let i = 0; i < 40; i += 1) { sim(0.05, {}); maxY = Math.max(maxY, g.ball.position.y); if (landX == null && g.match.owner) landX = g.ball.position.x; }
        res.maxBallY = +maxY.toFixed(2);
        res.receivedAheadOfMateBy = landX == null ? null : +(mateX - landX).toFixed(1);
        res.owner = g.match.owner?.p.look.name ?? null;
      } else if (name === 'onetwo') {
        park(away, 13, 8);
        home[1].p.teleport(-4, 1.5, -Math.PI / 2);
        start();
        const passer = hk.p.look.name;
        sim(0.05, { moveX: 1, passPressed: true, passHeld: true });
        sim(0.05, { moveX: 1, passHeld: false, passReleased: true });
        sim(0.3, { moveX: 1 });
        sim(0.05, { moveX: 1, sprint: true, passPressed: true, passHeld: true });
        sim(0.05, { moveX: 1, sprint: true, passHeld: false, passReleased: true });
        for (let i = 0; i < 50; i += 1) sim(0.05, { moveX: 1, sprint: true });
        res.passer = passer;
        res.mate = [home[1].p.position.x, home[1].p.position.z].map((v) => +v.toFixed(1));
        res.giveGo = !!g.match.giveGo;
        res.humanNow = g.human.p.look.name;
        res.owner = g.match.owner?.p.look.name ?? null;
      } else if (name === 'volley' || name === 'bicycle') {
        park(away, 13, 8);
        keeper.k.teleport(keeper.homeX, 2.2, Math.PI / 2);
        // A ball dropping onto the striker, 7 m from goal (bicycle: back to goal).
        hk.p.teleport(-8, 0, name === 'bicycle' ? Math.PI / 2 : -Math.PI / 2);
        g.ball.placeAt(-8 + (name === 'bicycle' ? 0.2 : -0.5), name === 'bicycle' ? 3.4 : 2.3, 0.1);
        g.ball.kick(new THREE_VEC(0, 1.5, 0), null, null, g.time);
        sim(0.3, {});
        sim(1.0, { shootPressed: true, shootHeld: true }, 10);
        res.ballAfter = [g.ball.velocity.x, g.ball.velocity.y, g.ball.velocity.z].map((v) => +v.toFixed(1));
        for (let i = 0; i < 20; i += 1) sim(0.05, {});
        res.score = { ...g.score };
        res.phase = g.phase;
        res.ball = [g.ball.position.x, g.ball.position.y, g.ball.position.z].map((v) => +v.toFixed(1));
      } else if (name === 'slide') {
        park(home.filter((c) => c !== hk), -12, -8);
        park(away.slice(1), 13, 8);
        const opp = away[0];
        opp.p.teleport(-1.2, 0, Math.PI / 2);
        g.ball.placeAt(-0.7, 0.11, 0);
        hk.p.teleport(3.2, 0, -Math.PI / 2);
        sim(0.2, { moveX: 1, sprint: true });
        const restore = noFail();
        hk.rng = () => 0.01;
        hk.rng.gauss = () => 0;
        sim(1.0, { moveX: 1, sprint: true, tacklePressed: true }, 8);
        restore();
        res.oppStagger = +opp.stagger.toFixed(2);
        res.speedAfter = +hk.p.speed.toFixed(1);
      } else if (name === 'gamebreaker') {
        park(away, 13, 8);
        start(4);
        g.addStyle(2600, 'TEST', hk.p.position.clone());
        res.meter = g.gb.meter;
        sim(0.05, { specialPressed: true });
        res.active = +g.gb.active.toFixed(1);
        res.boost = hk.shotBoost;
        res.keeperDebuff = keeper.debuff;
        res.cls = document.getElementById('app').classList.contains('gb-on');
        sim(0.6, { moveX: 1 });
        sim(0.05, { moveX: 1, shootPressed: true, shootHeld: true });
        sim(0.5, { moveX: 1, shootHeld: true });
        sim(0.05, { shootHeld: false, shootReleased: true });
        for (let i = 0; i < 30; i += 1) sim(0.05, {});
        res.score = { ...g.score };
        g.endGamebreaker(true);
      }
      offs.forEach((o) => o());
      for (const c of [...home, ...away]) c.frozen = false;
      res.events = ev.join(' ');
      return { res, shots };
    },
    { name, capture },
  );

await page.evaluate(() => {
  // Minimal vector for the scripted drop ball (the game does not expose THREE).
  window.THREE_VEC = function V(x, y, z) { return { x, y, z, length: () => Math.hypot(x, y, z) }; };
});
for (const name of ['elastico', 'sombrero', 'dragback', 'lob', 'through', 'onetwo', 'volley', 'bicycle', 'slide', 'gamebreaker']) {
  const { res, shots } = await run(name, !!out);
  console.log(JSON.stringify(res));
  if (out) shots.forEach((d, i) => fs.writeFileSync(`${out}/${name}-${String(i).padStart(2, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64')));
}
console.log('errors', JSON.stringify(errors));
await browser.close();
