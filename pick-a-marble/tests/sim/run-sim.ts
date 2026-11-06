import { initPhysics } from '../../src/physics/PhysicsWorld';
import { RaceSim } from '../../src/race/RaceSim';
import { newTrack } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
import { validateTrack } from '../../src/track/TrackValidator';

type Spec = { name: string; pieces: (string | [string, { mirror?: boolean; outIndex?: number }])[]; y?: number };

const specs: Spec[] = [
  { name: 'straight', pieces: ['straight', 'straight_long', 'straight_short'] },
  { name: 'curves', pieces: ['curve_gentle_r', 'curve_sharp_l', 's_curve', 'wide_curve', 'curve_sharp_r', 'curve_gentle_l'] },
  { name: 'ramps', pieces: ['ramp_steep', 'ramp_down', 'ramp_up', 'straight', 'ramp_down'] },
  { name: 'loops', pieces: ['ramp_steep', 'loop', 'straight', 'corkscrew', 'straight', 'ramp_down', 'loop', 'straight'] },
  { name: 'funnels', pieces: ['funnel_small', 'straight', 'funnel_large', 'straight', 'funnel_vortex'] },
  { name: 'obstacles', pieces: ['ramp_down', 'rotator', 'swinger', 'pendulum', 'gates', 'moving_platform'] },
  { name: 'jumps', pieces: ['ramp_down', 'jump', 'gap_jump', 'bounce', 'cannon'] },
  { name: 'split', pieces: ['splitter', 'straight', 'straight'] },
  { name: 'vertical', pieces: ['drop', 'straight', 'spiral', 'straight', 'half_pipe', 'tube', 'booster', 'straight'] },
  { name: 'overlapbad', pieces: ['drop', 'spiral', 'half_pipe'] },
];

await initPhysics();
const marbles = Number(process.argv[2] ?? 8);
for (const spec of specs) {
  const t = newTrack(spec.name);
  const c = new TrackChain(t);
  c.start(0, spec.y ?? 30, 0);
  for (const p of spec.pieces) {
    if (typeof p === 'string') c.place(p);
    else c.place(p[0], p[1]);
  }
  if (spec.name === 'split') {
    // build both branches into a merge
    t.pieces.length = 0;
    const c2 = new TrackChain(t);
    c2.start(0, 30, 0);
    const sp = c2.place('splitter');
    const [a, b] = c2.outs(sp);
    c2.cursor = a;
    c2.place('straight');
    const endA = c2.cursor!;
    c2.cursor = b;
    c2.place('booster');
    c2.place('straight_short');
    const mergeAt = endA;
    c2.place('merge', { at: mergeAt, inIndex: 0 });
    c2.place('straight');
    c2.place('finish');
  } else c.place('finish');
  const v = validateTrack(t.pieces);
  const sim = new RaceSim(t.pieces, { seed: 7, marbles });
  const t0 = performance.now();
  sim.runHeadless(150);
  const ms = performance.now() - t0;
  const fin = sim.states.filter((s) => s.finished).length;
  const falls = sim.states.reduce((a, s) => a + s.falls, 0);
  const nudges = sim.events.filter((e) => e.type === 'nudge').length;
  const times = sim.states.filter((s) => s.finished).map((s) => s.finishTime.toFixed(1)).join(',');
  console.log(
    `${spec.name.padEnd(10)} mesh=${sim.physics.meshMode} tris=${sim.physics.staticTriangles} valid=${v.ok}(${v.issues.map((i) => i.code).join('|')}) finished=${fin}/${marbles} falls=${falls} nudges=${nudges} raceTime=${sim.time.toFixed(1)}s times=[${times}] wall=${ms.toFixed(0)}ms loops=${sim.states.map((s) => s.loops).join('')} jumps=${sim.states.map((s) => s.jumps).join('')}`,
  );
  const where: Record<string, number> = {};
  for (const e of sim.events) if (e.type === 'fall' || e.type === 'nudge') where[`${e.type}@${e.at}`] = (where[`${e.type}@${e.at}`] ?? 0) + 1;
  if (Object.keys(where).length) console.log('   ', JSON.stringify(where));
  sim.dispose();
}
