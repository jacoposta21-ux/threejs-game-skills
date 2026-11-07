import * as THREE from 'three';
import { CharacterRig } from '../player/CharacterRig.js';

// Bakes Universal-Animation-Library clips onto a Quaternius character's own
// skeleton once, at load. Pedestrians then play ordinary AnimationClips through
// a cheap per-NPC AnimationMixer instead of running the live retargeter.
export function bakeCharacter(animGltf, charGltf, clipNames, fps = 24) {
  const rig = new CharacterRig(animGltf, charGltf, 1.75);
  if (!rig.ok) return null;
  const mapped = rig.pairs.map((p) => p.t);
  const hips = rig.hips ? rig.hips.t : null;
  const clips = {};
  for (const name of clipNames) {
    const src = rig.clips[name];
    if (!src) continue;
    rig.mixer.stopAllAction();
    const action = rig.mixer.clipAction(src);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    const frames = Math.max(2, Math.round(src.duration * fps) + 1);
    const times = new Float32Array(frames);
    const qv = mapped.map(() => new Float32Array(frames * 4));
    const hv = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      const t = Math.min(src.duration, (f / (frames - 1)) * src.duration);
      times[f] = t;
      rig.mixer.setTime(t);
      rig.update(0);
      mapped.forEach((b, i) => b.quaternion.toArray(qv[i], f * 4));
      if (hips) hips.position.toArray(hv, f * 3);
    }
    const tracks = mapped.map((b, i) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, qv[i]));
    if (hips) tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hv));
    clips[name] = new THREE.AnimationClip(name, src.duration, tracks);
    action.stop();
  }
  return { clips, scale: rig.model.scale.x, offsetY: rig.model.position.y, gltf: charGltf };
}
