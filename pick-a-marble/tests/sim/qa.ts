/**
 * Headless QA checklist (no browser): determinism, repeated restarts, invalid
 * connections, dead ends, serialization round-trip, long races and
 * fall-off recovery. Exit code 1 on any failure.
 */
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { BUILTIN_TRACKS } from '../../src/modes/builtinTracks';
import { RaceSim } from '../../src/race/RaceSim';
import { newTrack, sanitizeTrack } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
import { validateTrack } from '../../src/track/TrackValidator';
import { History } from '../../src/editor/History';

await initPhysics();
let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

// 1. determinism: same seed, same finishing order and times
{
  const t = BUILTIN_TRACKS[0].make();
  const run = (): string => {
    const sim = new RaceSim(t.pieces, { seed: 1234, marbles: 8 });
    sim.runHeadless(120);
    const r = sim.states.map((s) => `${s.index}:${s.finished ? s.finishTime.toFixed(4) : 'dnf'}`).join(',');
    sim.dispose();
    return r;
  };
  const a = run();
  const b = run();
  check('same seed reproduces the race exactly', a === b);
  const sim = new RaceSim(t.pieces, { seed: 999, marbles: 8 });
  sim.runHeadless(120);
  const c = sim.states.map((s) => `${s.index}:${s.finished ? s.finishTime.toFixed(4) : 'dnf'}`).join(',');
  sim.dispose();
  check('different seed produces a different race', c !== a);
}

// 2. restarting races repeatedly (world creation/disposal is leak-free and stable)
{
  const t = BUILTIN_TRACKS[2].make();
  let finishedAll = true;
  const t0 = performance.now();
  for (let i = 0; i < 15; i += 1) {
    const sim = new RaceSim(t.pieces, { seed: i, marbles: 6 });
    for (let k = 0; k < 120 * 5; k += 1) sim.step();
    if (i % 5 === 0) {
      sim.runHeadless(120);
      finishedAll &&= sim.states.every((s) => s.finished);
    }
    sim.dispose();
  }
  check('15 consecutive restarts run and complete', finishedAll, `${(performance.now() - t0).toFixed(0)} ms`);
}

// 3. invalid connections: two entrances joined together
{
  const t = newTrack('bad');
  const c = new TrackChain(t);
  c.start(0, 20, 0);
  const s = c.place('straight');
  // place a second straight facing backwards so its entrance sits on the first one's entrance
  t.pieces.push({ id: 99, t: 'straight', p: [s.p[0], s.p[1], s.p[2]], r: 2 });
  const v = validateTrack(t.pieces);
  check('validator flags impossible (entrance-to-entrance) connection', v.issues.some((i) => i.code === 'mismatch'), v.issues.map((i) => i.code).join('|'));
}

// 4. dead ends, missing finish, missing start
{
  const t = newTrack('dead');
  const c = new TrackChain(t);
  c.start(0, 20, 0);
  c.place('straight');
  const v = validateTrack(t.pieces);
  check('validator flags missing finish + dead end', v.issues.some((i) => i.code === 'no-finish') && v.issues.some((i) => i.code === 'dead-end'));
  const v2 = validateTrack(t.pieces.filter((p) => p.t !== 'start'));
  check('validator flags missing start', v2.issues.some((i) => i.code === 'no-start'));
}

// 5. disconnected section
{
  const t = BUILTIN_TRACKS[0].make();
  t.pieces.push({ id: 500, t: 'loop', p: [20, 10, 20], r: 0 });
  const v = validateTrack(t.pieces);
  check('validator flags disconnected pieces', v.issues.some((i) => i.code === 'disconnected'));
}

// 6. serialization round-trip and hostile import
{
  const t = BUILTIN_TRACKS[1].make();
  const back = sanitizeTrack(JSON.parse(JSON.stringify(t)));
  check('track JSON round-trips', JSON.stringify(back.pieces) === JSON.stringify(t.pieces));
  const hostile = sanitizeTrack({ name: '<script>x</script>'.repeat(10), pieces: [{ t: 'nope', p: [0, 0, 0] }, { t: 'straight', p: [1, 'x', 3] }, { t: 'straight', p: [0, 5, 0], r: 7, c: 'red;}' }] });
  check('import drops unknown/malformed pieces and bad colours', hostile.pieces.length === 1 && hostile.pieces[0].r === 3 && !hostile.pieces[0].c && hostile.name.length <= 40);
}

// 7. undo/redo history
{
  const t = newTrack('h');
  const h = new History();
  h.reset(t);
  const c = new TrackChain(t);
  c.start(0, 10, 0);
  h.commit(t);
  c.place('straight');
  h.commit(t);
  h.undo(t);
  const afterUndo = t.pieces.length;
  h.redo(t);
  check('undo/redo restores piece lists', afterUndo === 1 && t.pieces.length === 2);
}

// 8. long race (winding track) finishes, and falling marbles are recovered
{
  const t = newTrack('long');
  const c = new TrackChain(t);
  c.start(-20, 40, -20);
  const seq = ['straight_long', 'curve_gentle_r', 'straight_long', 'curve_gentle_r', 'spiral', 'straight', 'curve_sharp_r', 'straight_long', 'curve_gentle_l', 'half_pipe', 'curve_gentle_l', 'straight', 'finish'];
  for (const p of seq) c.place(p);
  const sim = new RaceSim(t.pieces, { seed: 5, marbles: 12 });
  sim.runHeadless(240);
  const fin = sim.states.filter((s) => s.finished).length;
  check('long winding race completes with 12 marbles', fin === 12, `${fin}/12 in ${sim.time.toFixed(1)}s`);
  sim.dispose();

  const d = newTrack('deadend');
  const dc = new TrackChain(d);
  dc.start(0, 20, 0);
  dc.place('ramp_steep');
  const sim2 = new RaceSim(d.pieces, { seed: 3, marbles: 4 });
  sim2.runHeadless(60);
  const falls = sim2.states.reduce((a, s) => a + s.falls, 0);
  check('marbles flying off a dead end are recovered, then eliminated after 3 falls', falls >= 4 && sim2.states.every((s) => s.dnf) && sim2.phase === 'done', `${falls} falls`);
  sim2.dispose();
}

// 9. tunnelling: no marble ends below the platform while the race runs on a steep, fast track
{
  const t = newTrack('fast');
  const c = new TrackChain(t);
  c.start(0, 34, 0);
  for (const p of ['ramp_steep', 'ramp_steep', 'drop', 'ramp_steep', 'curve_gentle_r', 'ramp_steep', 'straight', 'finish']) c.place(p);
  const sim = new RaceSim(t.pieces, { seed: 8, marbles: 12 });
  sim.go();
  let below = 0;
  let maxSpeed = 0;
  for (let i = 0; i < 120 * 60 && sim.phase !== 'done'; i += 1) {
    sim.step();
    for (const s of sim.states) {
      if (s.pos.y < -0.5 && !s.dnf) below += 1;
      maxSpeed = Math.max(maxSpeed, s.speed);
    }
  }
  const fin = sim.states.filter((s) => s.finished).length;
  check('high-speed track: no tunnelling through the platform, all finish', below === 0 && fin === 12, `max speed ${maxSpeed.toFixed(1)} u/s, ${fin}/12`);
  sim.dispose();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll QA checks passed');
process.exit(failed ? 1 : 0);
