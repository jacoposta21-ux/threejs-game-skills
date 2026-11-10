// Plays full AI-vs-AI matches through the test hooks (both teams AI-driven)
// and reports what the AI actually does. node tools/qa/aimatch.mjs [difficulty] [matches]
import { chromium } from 'playwright';
const [difficulty = 'normal', matches = '2'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.addInitScript(() => localStorage.setItem('rua10:settings', JSON.stringify({ quality: 'low' })));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5188/');
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
const results = [];
for (let m = 0; m < +matches; m += 1) {
  const r = await page.evaluate(async ({ difficulty, seed }) => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    const g = window.__RUA10__;
    h.seed(seed);
    h.setDifficulty(difficulty);
    h.setState('active-play');
    h.setPausedForScreenshot(true);
    h.setAutoplay(true);
    g.resetPositions('home');
    g.timeLeft = 180;
    const counts = { shots: { home: 0, away: 0 }, passes: { home: 0, away: 0 }, passOk: { home: 0, away: 0 }, tackles: 0, tacklesWon: 0, tackleReasons: {}, steals: 0, saves: 0, goals: { home: 0, away: 0 } };
    const poss = { home: 0, away: 0, none: 0 };
    let pending = null;
    const off = [
      g.events.on('kick', ({ type, player, target, aerial, lob, through }) => {
        const adv = (counts.advanced ??= {});
        for (const [k, on] of [[aerial, !!aerial], ['lob', lob], ['through', through]]) if (on) adv[k] = (adv[k] ?? 0) + 1;
        if (type === 'shot') counts.shots[player.team] += 1;
        else { counts.passes[player.team] += 1; pending = target ? { team: player.team, target } : null; }
      }),
      g.events.on('control', ({ player, stolenFrom }) => {
        if (pending) { if (pending.team === player.team) counts.passOk[player.team] += 1; pending = null; }
        if (stolenFrom) counts.steals += 1;
      }),
      g.events.on('tackle', (e) => { const { success, victim, reason } = e; if (e.slide) { const adv = (counts.advanced ??= {}); adv[success ? 'slideWon' : 'slideMissed'] = (adv[success ? 'slideWon' : 'slideMissed'] ?? 0) + 1; } if (reason === 'reach') (counts.miss ??= []).push([+e.dBall.toFixed(2), +e.ballY.toFixed(2), e.held]); counts.tackles += 1; if (success && victim) counts.tacklesWon += 1; counts.tackleReasons[reason] = (counts.tackleReasons[reason] ?? 0) + 1; }),
      g.events.on('save', ({ type }) => { if (type !== 'claim') counts.saves += 1; }),
      g.events.on('trick', (e) => { const k = `${e.kind}:${e.outcome}`; (counts.tricks ??= {})[k] = (counts.tricks[k] ?? 0) + 1; }),
      g.events.on('goal', (e) => (counts.goalLog ??= []).push(`${e.team}:${e.flight.type ?? 'none'}:${e.lastTouchTeam}${e.lastTouchKeeper ? '(GK)' : ''}:since=${e.since.toFixed(1)}:fromX=${e.flight.scorerX?.toFixed?.(1)}`)),
    ];
    let guard = 0;
    let stuck = 0;
    let lastBall = { x: 0, z: 0 };
    while (g.phase !== 'fulltime' && guard < 400) {
      guard += 1;
      h.simulate(0.5, {});
      if (g.phase === 'goal' || g.phase === 'kickoff') continue;
      const t = g.match.possessionTeam ?? 'none';
      poss[t] += 1;
      const b = g.ball.position;
      if (Math.hypot(b.x - lastBall.x, b.z - lastBall.z) < 0.05) stuck += 1;
      lastBall = { x: b.x, z: b.z };
    }
    off.forEach((f) => f());
    counts.goals = { ...g.score };
    h.setAutoplay(false);
    const total = poss.home + poss.away + poss.none;
    return { counts, possession: { home: Math.round((poss.home / total) * 100), away: Math.round((poss.away / total) * 100), loose: Math.round((poss.none / total) * 100) }, ballStillSamples: stuck, samples: total, gameSecondsSimulated: guard * 0.5 };
  }, { difficulty, seed: 100 + m });
  results.push(r);
  console.log(JSON.stringify(r));
}
console.log('errors', errors);
await browser.close();
