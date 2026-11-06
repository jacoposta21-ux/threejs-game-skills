import { initPhysics } from '../../src/physics/PhysicsWorld';
import { BUILTIN_TRACKS, menuTrack } from '../../src/modes/builtinTracks';
import { CHALLENGES } from '../../src/modes/ChallengeManager';
import { RaceSim } from '../../src/race/RaceSim';
import { validateTrack } from '../../src/track/TrackValidator';
import { trackBounds } from '../../src/track/Track';
await initPhysics();
const list = [{ name: 'menu', make: menuTrack }, ...BUILTIN_TRACKS.map((b) => ({ name: b.id, make: b.make }))];
for (const b of list) {
  const t = b.make();
  const v = validateTrack(t.pieces);
  const sim = new RaceSim(t.pieces, { seed: 5, marbles: 10 });
  sim.runHeadless(200);
  const fin = sim.states.filter((s) => s.finished).length;
  const where: Record<string, number> = {};
  for (const e of sim.events) if (e.type === 'fall' || e.type === 'nudge') where[`${e.type}@${e.at}`] = (where[`${e.type}@${e.at}`] ?? 0) + 1;
  const bb = trackBounds(t);
  console.log(`${b.name.padEnd(12)} valid=${v.ok} ${v.issues.map((i) => i.code).join('|')} fin=${fin}/10 win=${sim.states.filter(s=>s.finished).map(s=>s.finishTime).sort((a,b)=>a-b)[0]?.toFixed(1)} t=${sim.time.toFixed(1)} bounds=${bb.min.toArray().map(n=>n.toFixed(0))}..${bb.max.toArray().map(n=>n.toFixed(0))} ${JSON.stringify(where)}`);
  sim.dispose();
}
for (const c of CHALLENGES) {
  const s = c.setup();
  const v = validateTrack(s.track.pieces);
  console.log(c.id, s.track.pieces.map((p) => `${p.t}@${p.p}`).join(' '), v.issues.map((i) => i.code).join('|'));
}
