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
const sim = new RaceSim(t.pieces, { seed: 3, marbles: 1 });
sim.go();
let lastE = 0;
for (let i = 0; i < 120 * Number(process.argv[3] ?? 10) && sim.phase !== 'done'; i++) {
  sim.step();
  const b = sim.physics.marbles[0];
  const v = b.linvel(); const w = b.angvel(); const p = b.translation();
  const E = 0.5 * (v.x*v.x+v.y*v.y+v.z*v.z) + 0.2*0.0625*(w.x*w.x+w.y*w.y+w.z*w.z) + 20*p.y;
  const lane = sim.graph.lanes[sim.states[0].lane];
  if (i % 6 === 0) console.log(`t=${sim.time.toFixed(2)} y=${p.y.toFixed(2)} x=${p.x.toFixed(2)} z=${p.z.toFixed(2)} v=${Math.hypot(v.x,v.y,v.z).toFixed(1)} w=${Math.hypot(w.x,w.y,w.z).toFixed(0)} E=${E.toFixed(1)} dE=${(E-lastE).toFixed(2)} ${lane?.defId}`);
  if (i % 6 === 0) lastE = E;
}
