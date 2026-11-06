import { initPhysics } from '../../src/physics/PhysicsWorld';
import { RaceSim } from '../../src/race/RaceSim';
import { newTrack, trackBounds } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
import { validateTrack } from '../../src/track/TrackValidator';
await initPhysics();
const seqs: Record<string, string[]> = {
  A: ['ramp_steep', 'loop', 'curve_gentle_r', 'jump', 'booster', 'curve_sharp_r', 'cannon', 'finish'],
  B: ['ramp_steep', 'loop', 'curve_gentle_r', 'jump', 'curve_sharp_r', 'cannon', 'finish'],
  C: ['booster', 'loop', 'curve_gentle_r', 'ramp_down', 'jump', 'curve_sharp_r', 'cannon', 'finish'],
};
for (const [k, seq] of Object.entries(seqs)) {
  const t = newTrack(k); const c = new TrackChain(t); c.start(-22, 24, -14, 0);
  for (const p of seq) c.place(p);
  const v = validateTrack(t.pieces);
  const b = trackBounds(t);
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = new RaceSim(t.pieces, { seed, marbles: 8 }); sim.runHeadless(60);
    const ts = sim.states.filter(s => s.finished).map(s => s.finishTime).sort((a, b) => a - b);
    console.log(k, seed, v.ok, v.issues.map(i => i.code).join('|'), 'fin', ts.length, 'win', ts[0]?.toFixed(2), 'last', ts.at(-1)?.toFixed(2), 'falls', sim.states.reduce((a, s) => a + s.falls, 0), 'bounds', b.min.toArray().map(n => n.toFixed(0)), b.max.toArray().map(n => n.toFixed(0)));
    sim.dispose();
  }
}
