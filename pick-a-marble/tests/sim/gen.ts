import { initPhysics } from '../../src/physics/PhysicsWorld';
import { RandomTrackGenerator, type Difficulty } from '../../src/modes/RandomTrackGenerator';
import { RaceSim } from '../../src/race/RaceSim';
await initPhysics();
const g = new RandomTrackGenerator(44);
for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
  for (let s = 1; s <= Number(process.argv[2] ?? 4); s++) {
    const t0 = performance.now();
    const r = g.generate(s * 1000 + 17, d);
    const ms = performance.now() - t0;
    const sim = new RaceSim(r.track.pieces, { seed: 99, marbles: 10 });
    sim.runHeadless(200);
    const fin = sim.states.filter((x) => x.finished).length;
    const where: Record<string, number> = {};
    for (const e of sim.events) if (e.type === 'fall' || e.type === 'nudge') where[`${e.type}@${e.at}`] = (where[`${e.type}@${e.at}`] ?? 0) + 1;
    console.log(`${d} seed=${s} pieces=${r.track.pieces.length} attempts=${r.attempts} genFin=${r.finishers} gen=${ms.toFixed(0)}ms | 10-marble: fin=${fin} t=${sim.time.toFixed(1)} ${JSON.stringify(where)} diamonds=${r.track.pieces.filter(p=>p.t==='splitter').length}`);
    sim.dispose();
  }
}
