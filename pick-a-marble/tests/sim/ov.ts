import { newTrack, worldLanes } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
import { validateTrack } from '../../src/track/TrackValidator';
const t = newTrack('x'); const c = new TrackChain(t); c.start(0, 30, 0);
c.place('drop'); c.place('spiral'); c.place('half_pipe'); c.place('finish');
const [ , , sp, hp] = t.pieces;
let best = 1e9, bp: any;
for (const a of worldLanes(sp)[0].points) for (const b of worldLanes(hp)[0].points) { const d = Math.hypot(a.x-b.x, a.z-b.z); if (Math.abs(a.y-b.y) < 3 && d < best) { best = d; bp = [a.toArray(), b.toArray()]; } }
console.log(best, JSON.stringify(bp));
console.log(validateTrack(t.pieces).issues);
