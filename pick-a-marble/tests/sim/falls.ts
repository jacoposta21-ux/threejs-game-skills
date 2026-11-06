import { initPhysics } from '../../src/physics/PhysicsWorld';
import { RaceSim } from '../../src/race/RaceSim';
import { newTrack } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
await initPhysics();
const t = newTrack('x');
const c = new TrackChain(t);
c.start(0, 30, 0);
for (const p of process.argv[2].split(',')) c.place(p);
c.place('finish');
console.log(t.pieces.map((p) => `${p.id}:${p.t}@${p.p.map((n) => n.toFixed(1))}`).join(' '));
const sim = new RaceSim(t.pieces, { seed: 3, marbles: Number(process.argv[3] ?? 12) });
sim.go();
const hist: string[][] = sim.states.map(() => []);
for (let i = 0; i < 120 * 60 && sim.phase !== 'done'; i++) {
  sim.step();
  if (i % 6 === 0) sim.states.forEach((s, k) => { hist[k].push(`${sim.time.toFixed(1)}:(${s.pos.toArray().map((n) => n.toFixed(1))}) v${s.speed.toFixed(1)}`); if (hist[k].length > 30) hist[k].shift(); });
  for (const e of sim.events.splice(0)) if (e.type === 'fall' || e.type === 'nudge') { console.log(JSON.stringify(e), 'history:', hist[e.marble].join(' ')); }
}
