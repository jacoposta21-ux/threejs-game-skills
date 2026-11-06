import { initPhysics } from '../../src/physics/PhysicsWorld';
import { RaceSim } from '../../src/race/RaceSim';
import { newTrack } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
await initPhysics();
const pieces = process.argv[2].split(',');
const t = newTrack('x');
const c = new TrackChain(t);
c.start(0, 30, 0);
for (const p of pieces) c.place(p);
c.place('finish');
console.log(t.pieces.map((p) => `${p.id}:${p.t}@${p.p.map((n) => n.toFixed(1))}`).join(' '));
const sim = new RaceSim(t.pieces, { seed: 3, marbles: Number(process.argv[3] ?? 1) });
sim.go();
let last = 0;
for (let i = 0; i < 120 * 40 && sim.phase !== 'done'; i++) {
  sim.step();
  const s = sim.states[0];
  for (const e of sim.events.splice(0)) console.log('  EVENT', JSON.stringify(e));
  if (sim.time - last >= 0.2) {
    last = sim.time;
    const lane = sim.graph.lanes[s.lane];
    console.log(`t=${sim.time.toFixed(2)} pos=${s.pos.toArray().map((n) => n.toFixed(2))} v=${s.speed.toFixed(1)} piece=${lane?.pieceId}:${lane?.defId} rem=${s.remaining.toFixed(1)}`);
  }
}
