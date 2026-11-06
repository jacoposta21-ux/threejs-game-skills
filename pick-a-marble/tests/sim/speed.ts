import { initPhysics } from '../../src/physics/PhysicsWorld';
import { RaceSim } from '../../src/race/RaceSim';
import { newTrack } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
await initPhysics();
for (const seq of [['ramp_steep', 'ramp_steep', 'booster', 'finish'], ['drop', 'ramp_steep', 'booster', 'booster', 'finish'], ['ramp_steep', 'ramp_steep', 'ramp_steep', 'finish']]) {
  const t = newTrack('s'); const c = new TrackChain(t); c.start(-22, 28, -18);
  for (const p of seq) c.place(p);
  const sim = new RaceSim(t.pieces, { seed: 2, marbles: 6 }); sim.runHeadless(60);
  console.log(seq.join(','), 'winner', Math.min(...sim.states.filter(s => s.finished).map(s => s.finishTime)).toFixed(2));
}
