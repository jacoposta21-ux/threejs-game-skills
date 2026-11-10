// Checks match modes end the way they should: node tools/qa/modescheck.mjs [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5188/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 3, null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const g = window.__RUA10__;
  const h = window.__THREE_GAME_TEST_HOOKS__;
  h.setPausedForScreenshot(true);
  g.skipReplays = true;
  const play = () => h.simulate(4.2, {});
  const goal = (team) => {
    // Score through the real goal path.
    g.ball.placeAt(team === 'home' ? -15.6 : 15.6, 0.3, 0);
    g.ball.lastTouch = g.match.teams[team].players[0].p;
    h.simulate(0.2, {});
    h.simulate(4.5, {});
  };
  const res = {};
  // First to 5
  g.startMode('firstTo5');
  play();
  res.firstTo5 = { clock: document.getElementById('match-clock').textContent };
  for (let i = 0; i < 5; i += 1) goal('home');
  h.simulate(3, {});
  res.firstTo5.score = { ...g.score };
  res.firstTo5.phase = g.phase;
  res.firstTo5.won = g.lastResult?.won;
  // Style challenge
  g.startMode('style');
  play();
  g.addStyle(8200, 'TEST', g.human.p.position.clone());
  h.simulate(0.1, {});
  res.style = { phase: g.phase, won: g.lastResult?.won, hudStyle: document.getElementById('style-points').textContent };
  // 1 v 1
  g.startMode('oneVone');
  play();
  h.simulate(2, {});
  res.oneVone = {
    home: g.match.teams.home.players.length,
    away: g.match.teams.away.players.length,
    benchedVisible: g.allPlayers.home.slice(1).some((c) => c.p.holder.visible),
    clock: document.getElementById('match-clock').textContent,
  };
  // Tournament: win round 1, draw round 2 into golden goal, check the ladder
  g.startMode('tournament');
  play();
  const r = [];
  r.push({ round: g.tournament.round, away: g.awayTeam.name, venue: g.venueId, level: g.matchLevel });
  goal('home');
  g.timeLeft = 0.05;
  h.simulate(3, {});
  r[0].won = g.lastResult?.won;
  r[0].results = document.getElementById('results-again').textContent;
  return g.restartFromMenu().then(() => {
    play();
    r.push({ round: g.tournament.round, away: g.awayTeam.name, venue: g.venueId, level: g.matchLevel });
    g.timeLeft = 0.05;
    h.simulate(0.5, {});
    r[1].golden = g.goldenGoal;
    r[1].clock = document.getElementById('match-clock').textContent;
    goal('home');
    h.simulate(3, {});
    r[1].won = g.lastResult?.won;
    res.tournament = r;
    res.progress = { ...g.progress.data };
    return res;
  });
});
console.log(JSON.stringify(out, null, 1));
console.log('errors', JSON.stringify(errors));
await browser.close();
