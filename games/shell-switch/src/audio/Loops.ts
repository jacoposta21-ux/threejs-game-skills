/**
 * Continuous game-controlled loops: singer serenade, ghost phase shimmer, laser hum, carry strain.
 * Each loop renders into its own `out` gain; AudioSystem routes that through spatial gain/pan nodes.
 */
import { noteToMidi } from './Music';
import { mtof, rand, type NoiseBank } from './synth';

export type LoopId = 'sing' | 'phaseLoop' | 'laserHum' | 'carryStrain';

export interface LoopInstance {
  /** loop output (fades in/out) */
  out: GainNode;
  tick(now: number): void;
  stop(): void;
}

function base(ctx: AudioContext, level: number, fade = 0.25): { out: GainNode; nodes: AudioScheduledSourceNode[]; stop: () => void } {
  const out = ctx.createGain();
  const now = ctx.currentTime;
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(level, now + fade);
  const nodes: AudioScheduledSourceNode[] = [];
  const stop = (): void => {
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
    out.gain.linearRampToValueAtTime(0.0001, t + 0.2);
    for (const n of nodes) {
      try { n.stop(t + 0.25); } catch { /* ignore */ }
    }
    setTimeout(() => {
      try { out.disconnect(); } catch { /* ignore */ }
    }, 600);
  };
  return { out, nodes, stop };
}

function osc(ctx: AudioContext, type: OscillatorType, f: number, dest: AudioNode, gain: number, list: AudioScheduledSourceNode[]): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.value = gain;
  o.connect(g);
  g.connect(dest);
  o.start();
  list.push(o);
  return o;
}

// Original lilting serenade in G major, 3/4 feel. [note, beats]
const SERENADE: [string, number][] = [
  ['G4', 1], ['B4', 1], ['D5', 1], ['E5', 2], ['D5', 1], ['C5', 1], ['E5', 1], ['G5', 1], ['F#5', 2], ['D5', 1],
  ['G5', 1.5], ['F#5', 0.5], ['E5', 1], ['D5', 1], ['B4', 1], ['G4', 1], ['A4', 1], ['C5', 1], ['E5', 1], ['D5', 3],
  ['B4', 1], ['D5', 1], ['G5', 1], ['A5', 2], ['G5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['B5', 2], ['A5', 1],
  ['G5', 1], ['E5', 1], ['C5', 1], ['D5', 1.5], ['E5', 0.5], ['F#5', 1], ['G5', 3], ['r', 3],
];
const VOWELS: [number, number][] = [[800, 1200], [500, 900], [600, 1700], [380, 850]];

function makeSing(ctx: AudioContext): LoopInstance {
  const b = base(ctx, 1, 0.3);
  const spb = 60 / 96;
  // voice source: saw + detuned triangle with vibrato
  const noteGain = ctx.createGain();
  noteGain.gain.value = 0.0001;
  const v1 = osc(ctx, 'sawtooth', 392, noteGain, 0.5, b.nodes);
  const v2 = osc(ctx, 'triangle', 392, noteGain, 0.6, b.nodes);
  v2.detune.value = 6;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.4;
  const vibG = ctx.createGain();
  vibG.gain.value = 22;
  vib.connect(vibG);
  vibG.connect(v1.detune);
  vibG.connect(v2.detune);
  vib.start();
  b.nodes.push(vib);
  // formants
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 5;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass'; f2.frequency.value = 1200; f2.Q.value = 7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2800;
  const mix = ctx.createGain();
  mix.gain.value = 0.9;
  noteGain.connect(f1); noteGain.connect(f2); noteGain.connect(lp);
  const lpG = ctx.createGain(); lpG.gain.value = 0.12;
  lp.connect(lpG); lpG.connect(mix);
  f1.connect(mix); f2.connect(mix);
  mix.connect(b.out);

  let idx = 0;
  let next = ctx.currentTime + 0.1;
  return {
    out: b.out,
    tick(now) {
      let guard = 0;
      if (next < now - 0.5) next = now + 0.05;
      while (next < now + 0.15 && guard++ < 16) {
        const [n, beats] = SERENADE[idx % SERENADE.length];
        idx++;
        const dur = beats * spb;
        const t = next;
        next += dur;
        if (n === 'r') {
          noteGain.gain.setTargetAtTime(0.0001, t, 0.05);
          continue;
        }
        const f = mtof(noteToMidi(n));
        v1.frequency.setTargetAtTime(f, t, 0.025);
        v2.frequency.setTargetAtTime(f, t, 0.025);
        const [a, c] = VOWELS[Math.floor(rand(0, VOWELS.length))];
        f1.frequency.setTargetAtTime(a, t, 0.04);
        f2.frequency.setTargetAtTime(c, t, 0.04);
        noteGain.gain.setTargetAtTime(0.03, t, 0.012); // little "l" dip
        noteGain.gain.setTargetAtTime(0.16, t + 0.03, 0.03);
        noteGain.gain.setTargetAtTime(0.1, t + dur * 0.8, 0.05);
      }
    },
    stop: b.stop,
  };
}

function makePhase(ctx: AudioContext, nz: NoiseBank): LoopInstance {
  const b = base(ctx, 1, 0.4);
  const shimmer = ctx.createGain();
  shimmer.gain.value = 0.05;
  shimmer.connect(b.out);
  const amp = ctx.createOscillator();
  amp.frequency.value = 0.7;
  const ampG = ctx.createGain(); ampG.gain.value = 0.025;
  amp.connect(ampG); ampG.connect(shimmer.gain);
  amp.start(); b.nodes.push(amp);
  for (const [f, d] of [[880, 0], [1318, 8], [1760, -6]] as const) {
    const o = osc(ctx, 'sine', f, shimmer, 0.35, b.nodes);
    o.detune.value = d;
    const l = ctx.createOscillator(); l.frequency.value = rand(3, 6);
    const lg = ctx.createGain(); lg.gain.value = 18;
    l.connect(lg); lg.connect(o.detune); l.start(); b.nodes.push(l);
  }
  const src = ctx.createBufferSource();
  src.buffer = nz.pink; src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 6;
  const sweep = ctx.createOscillator(); sweep.frequency.value = 0.35;
  const sg = ctx.createGain(); sg.gain.value = 1200;
  sweep.connect(sg); sg.connect(bp.frequency); sweep.start(); b.nodes.push(sweep);
  const ng = ctx.createGain(); ng.gain.value = 0.05;
  src.connect(bp); bp.connect(ng); ng.connect(b.out);
  src.start(); b.nodes.push(src);
  return { out: b.out, tick() { /* static */ }, stop: b.stop };
}

function makeLaser(ctx: AudioContext): LoopInstance {
  const b = base(ctx, 1, 0.15);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
  const trem = ctx.createGain();
  trem.gain.value = 0.06;
  lp.connect(trem); trem.connect(b.out);
  osc(ctx, 'sawtooth', 110, lp, 0.5, b.nodes);
  osc(ctx, 'square', 220.6, lp, 0.25, b.nodes);
  osc(ctx, 'sine', 1760, trem, 0.04, b.nodes);
  const l = ctx.createOscillator(); l.frequency.value = 8;
  const lg = ctx.createGain(); lg.gain.value = 0.02;
  l.connect(lg); lg.connect(trem.gain); l.start(); b.nodes.push(l);
  return { out: b.out, tick() { /* static */ }, stop: b.stop };
}

function makeStrain(ctx: AudioContext, nz: NoiseBank): LoopInstance {
  const b = base(ctx, 1, 0.3);
  const g = ctx.createGain();
  g.gain.value = 0.05;
  g.connect(b.out);
  const o = osc(ctx, 'triangle', 72, g, 0.8, b.nodes);
  const l = ctx.createOscillator(); l.frequency.value = 3.2;
  const lg = ctx.createGain(); lg.gain.value = 30;
  l.connect(lg); lg.connect(o.detune); l.start(); b.nodes.push(l);
  const src = ctx.createBufferSource();
  src.buffer = nz.brown; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const ng = ctx.createGain(); ng.gain.value = 0.25;
  src.connect(lp); lp.connect(ng); ng.connect(g);
  src.start(); b.nodes.push(src);
  return { out: b.out, tick() { /* static */ }, stop: b.stop };
}

export function createLoop(id: LoopId, ctx: AudioContext, nz: NoiseBank): LoopInstance {
  switch (id) {
    case 'sing': return makeSing(ctx);
    case 'phaseLoop': return makePhase(ctx, nz);
    case 'laserHum': return makeLaser(ctx);
    case 'carryStrain': return makeStrain(ctx, nz);
  }
}
