// Soak test: plays full AI-driven matches in every mode on every court and checks invariants
// (no errors, no NaN, nobody outside the cage, no stalled ball, no stuck phase / keeper / pose).
// node tools/qa/soak.mjs [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5188/?qa=1';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.addInitScript(() => localStorage.setItem('rua10:settings', JSON.stringify({ quality: 'low' })));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(base);
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'lobby', null, { timeout: 120000 });

const runs = [
  { mode: 'quick', court: 'brazil', team: 'can', level: 'normal', seed: 1 },
  { mode: 'quick', court: 'tokyo', team: 'kit', level: 'hard', seed: 2 },
  { mode: 'firstTo5', court: 'london', team: 'sth', level: 'easy', seed: 3 },
  { mode: 'style', court: 'newyork', team: 'bkb', level: 'normal', seed: 4 },
  { mode: 'oneVone', court: 'barcelona', team: 'rvl', level: 'hard', seed: 5 },
  { mode: 'tournament', court: 'brazil', team: 'vrb', level: 'normal', seed: 6, rounds: 3 },
];
for (const run of runs) {
  const res = await page.evaluate((run) => {
    const g = window.__RUA10__;
    const h = window.__THREE_GAME_TEST_HOOKS__;
    h.setPausedForScreenshot(true);
    h.seed(run.seed);
    g.skipReplays = run.seed % 2 === 0; // half the runs go through replays too
    g.setSetting('difficulty', run.level);
    g.saveChoice({ court: run.court, team: run.team, kit: 'home' });
    const L = 15;
    const W = 9;
    const issues = {};
    const note = (k, detail) => { (issues[k] ??= { n: 0, first: detail }).n += 1; };
    const out = { run: `${run.mode}@${run.court}/${run.level}`, matches: [] };
    const playOne = () => {
      g.autoplay = true;
      if (g.human) g.human.isHuman = false;
      let t = 0;
      let stillFor = 0;
      let phaseFor = 0;
      let lastPhase = g.phase;
      let keeperFor = { home: 0, away: 0 };
      let keeperState = { home: '', away: '' };
      let lastBall = g.ball.position.clone();
      const trickFor = new Map();
      const cap = run.mode === 'firstTo5' ? 600 : 260;
      while (g.phase !== 'fulltime' && t < cap) {
        h.simulate(0.25, {});
        t += 0.25;
        if (g.human) g.human.isHuman = false;
        if (g.phase === lastPhase) phaseFor += 0.25;
        else { phaseFor = 0; lastPhase = g.phase; }
        if (g.phase !== 'playing' && phaseFor > 14) note('phaseStuck', `${g.phase} for ${phaseFor}s`);
        const b = g.ball.position;
        if (![b.x, b.y, b.z].every(Number.isFinite)) note('ballNaN', '');
        if (Math.abs(b.x) > L + 2.2 || Math.abs(b.z) > W + 1.2 || b.y < -0.3 || b.y > 11) note('ballOut', `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)} ${g.phase}`);
        for (const c of g.match.allOutfield()) {
          const p = c.p.position;
          if (![p.x, p.z].every(Number.isFinite)) note('playerNaN', c.p.name);
          if (Math.abs(p.x) > L + 0.3 || Math.abs(p.z) > W + 0.3) note('playerOut', `${c.p.name} ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
          if (!c.p.holder.visible) note('fieldedInvisible', c.p.name);
          if (c.trick) { const v = (trickFor.get(c) ?? 0) + 0.25; trickFor.set(c, v); if (v > 2.5) note('trickStuck', `${c.p.name} ${c.trick.kind}`); } else trickFor.delete(c);
          if (g.phase === 'playing') {
            if (Math.abs(c.p.pitch) > 0.01 && !c.kick && !(c.fallTime > 0)) note('pitchStuck', `${c.p.name} ${c.p.pitch.toFixed(2)}`);
            if (c.p.lift > 0.01 && !c.kick) note('liftStuck', `${c.p.name} ${c.p.lift.toFixed(2)}`);
            if (c.p.trickAnim && !c.trick) note('trickAnimStuck', c.p.name);
            if (c.frozen) note('frozenInPlay', c.p.name);
          }
        }
        for (const [id, team] of Object.entries(g.match.teams)) {
          const k = team.keeper;
          if (k.state === keeperState[id]) keeperFor[id] += 0.25;
          else { keeperFor[id] = 0; keeperState[id] = k.state; }
          if (k.state !== 'set' && k.state !== 'beaten' && keeperFor[id] > 5) note('keeperStuck', `${id} ${k.state} ${keeperFor[id]}s`);
          const kp = k.k.position;
          if (g.phase === 'playing' && (Math.abs(kp.x) > L + 1.6 || Math.abs(kp.z) > W)) note('keeperOut', `${id} ${kp.x.toFixed(1)},${kp.z.toFixed(1)} ${k.state}`);
          if (g.phase === 'playing' && k.state === 'set' && (Math.abs(k.k.roll) > 0.05 || k.k.lift > 0.2)) note('keeperPoseStuck', `${id} roll=${k.k.roll.toFixed(2)} lift=${k.k.lift.toFixed(2)}`);
          if (k.state === 'set' && k.k.reach) note('keeperReachStuck', id);
        }
        if (g.phase === 'playing') {
          if (b.distanceTo(lastBall) < 0.15) stillFor += 0.25;
          else stillFor = 0;
          if (stillFor > 6 && stillFor % 2 === 0) {
            const o = g.match.owner;
            const near = g.match.allOutfield().map((c) => `${c.p.name}:${Math.hypot(c.p.position.x - b.x, c.p.position.z - b.z).toFixed(1)}`).join(' ');
            note('ballStalled', `ball ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)} owner=${o?.p.name ?? '-'} held=${g.ball.heldBy ? 'keeper' : '-'} keepers=${g.match.teams.home.keeper.state}/${g.match.teams.away.keeper.state} | ${near}`);
          }
        } else stillFor = 0;
        lastBall.copy(b);
      }
      if (g.phase !== 'fulltime') note('noFullTime', `phase ${g.phase} after ${t}s, timeLeft ${g.timeLeft}`);
      h.simulate(3, {});
      out.matches.push({ score: `${g.score.home}-${g.score.away}`, t, style: g.style, away: g.awayTeam?.short, venue: g.venueId, won: g.lastResult?.won, resultsShown: !document.getElementById('results').classList.contains('hidden') });
    };
    g.startMode(run.mode);
    h.simulate(4.5, {});
    playOne();
    let chain = Promise.resolve();
    for (let r = 1; r < (run.rounds ?? 1); r += 1) {
      chain = chain.then(() => g.restartFromMenu()).then(() => { h.simulate(4.5, {}); playOne(); });
    }
    return chain.then(() => {
      g.autoplay = false;
      g.quitToMenu();
      out.lobby = { phase: g.phase, outfield: g.match.allOutfield().length, menu: !document.getElementById('menu').classList.contains('hidden'), hud: document.getElementById('hud').className };
      out.issues = issues;
      return out;
    });
  }, run);
  console.log(JSON.stringify(res));
}
console.log('errors', JSON.stringify(errors.slice(0, 6)));
await browser.close();
