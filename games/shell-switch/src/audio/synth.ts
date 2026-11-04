/**
 * Shared Web Audio synthesis primitives for SHELL SWITCH.
 * Everything here is generated at runtime: no audio files, no network.
 */

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

/** A synthesis "voice context": where and when to render, with pitch/volume multipliers. */
export interface Voice {
  ctx: AudioContext;
  nz: NoiseBank;
  out: AudioNode;
  /** absolute AudioContext start time */
  t: number;
  /** pitch multiplier applied to tone frequencies */
  p: number;
  /** volume multiplier applied to peaks */
  v: number;
}

export type NoiseColor = 'white' | 'pink' | 'brown';

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const EPS = 0.0001;

export function createNoiseBank(ctx: AudioContext): NoiseBank {
  const len = Math.floor(ctx.sampleRate * 2);
  const make = (fill: (d: Float32Array) => void): AudioBuffer => {
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    fill(buf.getChannelData(0));
    return buf;
  };
  const white = make((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  const pink = make((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  });
  const brown = make((d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  });
  return { white, pink, brown };
}

/** Small synthetic room impulse response (created once). */
export function createImpulse(ctx: AudioContext, seconds = 1.6, decay = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function cleanup(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    try {
      src.disconnect();
      for (const n of nodes) n.disconnect();
    } catch {
      /* ignore */
    }
  };
}

export interface ToneOpts {
  type?: OscillatorType;
  /** start frequency (Hz) */
  f: number;
  /** end frequency (Hz) for a glide */
  f1?: number;
  /** glide duration (default dur) */
  glide?: number;
  /** linear glide instead of exponential */
  linGlide?: boolean;
  /** offset from voice start (s) */
  at?: number;
  dur: number;
  /** attack (s) */
  a?: number;
  /** sustain at peak until at+hold, then decay */
  hold?: number;
  peak: number;
  /** optional filter */
  ft?: BiquadFilterType;
  ff?: number;
  ff1?: number;
  q?: number;
  /** vibrato depth in cents and rate in Hz */
  vib?: number;
  vibHz?: number;
  detune?: number;
  /** ignore voice pitch multiplier */
  fixed?: boolean;
}

/** One oscillator note with envelope, optional filter/glide/vibrato. Returns end offset (s). */
export function tone(s: Voice, o: ToneOpts): number {
  const { ctx } = s;
  const at = o.at ?? 0;
  const t = s.t + at;
  const dur = Math.max(0.01, o.dur);
  const pm = o.fixed ? 1 : s.p;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  const f0 = Math.max(20, o.f * pm);
  osc.frequency.setValueAtTime(f0, t);
  if (o.f1 !== undefined) {
    const f1 = Math.max(20, o.f1 * pm);
    const gt = t + (o.glide ?? dur);
    if (o.linGlide) osc.frequency.linearRampToValueAtTime(f1, gt);
    else osc.frequency.exponentialRampToValueAtTime(f1, gt);
  }
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const g = ctx.createGain();
  const peak = Math.max(EPS * 2, o.peak * s.v);
  const a = Math.min(o.a ?? 0.005, dur * 0.9);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (o.hold !== undefined && o.hold > a) g.gain.setValueAtTime(peak, t + Math.min(o.hold, dur * 0.95));
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  const nodes: AudioNode[] = [g];
  let head: AudioNode = osc;
  if (o.ft) {
    const fl = ctx.createBiquadFilter();
    fl.type = o.ft;
    fl.frequency.setValueAtTime(o.ff ?? 1000, t);
    if (o.ff1 !== undefined) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.ff1), t + dur);
    fl.Q.value = o.q ?? 1;
    head.connect(fl);
    head = fl;
    nodes.push(fl);
  }
  head.connect(g);
  g.connect(s.out);
  let lfo: OscillatorNode | null = null;
  if (o.vib) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibHz ?? 6;
    const lg = ctx.createGain();
    lg.gain.value = o.vib;
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    cleanup(lfo, lg);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
  cleanup(osc, ...nodes);
  return at + dur;
}

export interface NoiseOpts {
  color?: NoiseColor;
  at?: number;
  dur: number;
  a?: number;
  hold?: number;
  peak: number;
  ft?: BiquadFilterType;
  /** filter freq start / end */
  f: number;
  f1?: number;
  q?: number;
  /** ignore voice pitch multiplier for filter freq */
  fixed?: boolean;
}

/** Filtered noise burst. Returns end offset (s). */
export function noise(s: Voice, o: NoiseOpts): number {
  const { ctx } = s;
  const at = o.at ?? 0;
  const t = s.t + at;
  const dur = Math.max(0.01, o.dur);
  const pm = o.fixed ? 1 : s.p;
  const src = ctx.createBufferSource();
  const buf = s.nz[o.color ?? 'white'];
  src.buffer = buf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = o.ft ?? 'bandpass';
  fl.frequency.setValueAtTime(Math.max(20, o.f * pm), t);
  if (o.f1 !== undefined) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * pm), t + dur);
  fl.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const peak = Math.max(EPS * 2, o.peak * s.v);
  const a = Math.min(o.a ?? 0.004, dur * 0.9);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (o.hold !== undefined && o.hold > a) g.gain.setValueAtTime(peak, t + Math.min(o.hold, dur * 0.95));
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(s.out);
  src.start(t, Math.random() * (buf.duration - 0.1));
  src.stop(t + dur + 0.05);
  cleanup(src, fl, g);
  return at + dur;
}

/** Shift a voice to a sub-time / different multiplier. */
export function sub(s: Voice, at: number, p = 1, v = 1): Voice {
  return { ctx: s.ctx, nz: s.nz, out: s.out, t: s.t + at, p: s.p * p, v: s.v * v };
}
