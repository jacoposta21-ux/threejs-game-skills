import { BUILTIN_TRACKS } from '../../src/modes/builtinTracks';
import { validateTrack } from '../../src/track/TrackValidator';
for (const id of process.argv.slice(2)) {
  const t = BUILTIN_TRACKS.find((b) => b.id === id)!.make();
  const v = validateTrack(t.pieces);
  for (const i of v.issues) console.log(id, i.code, i.pieces.map((pid) => { const p = t.pieces.find((q) => q.id === pid)!; return `${pid}:${p.t}@${p.p}`; }).join(' '));
}
