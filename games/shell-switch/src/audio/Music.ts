/**
 * Procedural music + ambience for SHELL SWITCH.
 * All melodies, progressions and grooves below are original compositions written for this game.
 * A lookahead scheduler (driven by AudioSystem's ~25 ms timer) books notes ~0.12 s ahead on the AudioContext clock.
 */
import type { AreaId, MusicTrack } from './AudioSystem';
import { SFX } from './Sfx';
import { mtof, noise, rand, sub, tone, type NoiseBank, type Voice } from './synth';

// ------------------------------------------------------------------ instruments

export type Inst =
  | 'bass' | 'upright' | 'tuba' | 'pad' | 'epiano' | 'pluck' | 'guitar' | 'celesta' | 'bell' | 'brass'
  | 'reed' | 'flute' | 'calliope' | 'organ' | 'vibes'
  | 'kick' | 'snare' | 'hat' | 'ohat' | 'ride' | 'brush' | 'rim' | 'shaker' | 'tick' | 'crash' | 'timp';

type InstFn = (s: Voice, f: number, d: number, v: number) => void;

const INSTRUMENTS: Record<Inst, InstFn> = {
  bass: (s, f, d, v) => {
    tone(s, { type: 'triangle', f, dur: Math.min(d, 1.2) + 0.05, a: 0.01, hold: d * 0.6, peak: 0.24 * v, ft: 'lowpass', ff: 700 });
    tone(s, { f, dur: Math.min(d, 1.2), a: 0.01, hold: d * 0.5, peak: 0.12 * v });
  },
  upright: (s, f, d, v) => {
    tone(s, { type: 'triangle', f, dur: Math.min(d * 0.95, 0.6), a: 0.006, peak: 0.28 * v, ft: 'lowpass', ff: 900 });
    noise(s, { dur: 0.03, peak: 0.03 * v, ft: 'lowpass', f: 700, fixed: true });
  },
  tuba: (s, f, d, v) => {
    tone(s, { type: 'sawtooth', f, dur: Math.min(d, 0.5), a: 0.02, hold: 0.2, peak: 0.13 * v, ft: 'lowpass', ff: 520, q: 1.2 });
    tone(s, { f, dur: Math.min(d, 0.5), a: 0.02, peak: 0.14 * v });
  },
  pad: (s, f, d, v) => {
    const dur = d + 0.6;
    tone(s, { type: 'sawtooth', f, dur, a: Math.min(0.5, d * 0.4), hold: d, peak: 0.028 * v, ft: 'lowpass', ff: 900, q: 0.6, detune: -7 });
    tone(s, { type: 'sawtooth', f, dur, a: Math.min(0.5, d * 0.4), hold: d, peak: 0.028 * v, ft: 'lowpass', ff: 900, q: 0.6, detune: 7 });
  },
  epiano: (s, f, d, v) => {
    tone(s, { f, dur: Math.min(d + 0.4, 1.6), a: 0.004, peak: 0.1 * v });
    tone(s, { f: f * 2, dur: 0.35, a: 0.002, peak: 0.03 * v });
    tone(s, { type: 'triangle', f: f * 3, dur: 0.12, a: 0.001, peak: 0.012 * v });
  },
  pluck: (s, f, d, v) => {
    tone(s, { type: 'triangle', f, dur: Math.min(0.35, d + 0.15), a: 0.003, peak: 0.12 * v, ft: 'lowpass', ff: 2600 });
  },
  guitar: (s, f, d, v) => {
    tone(s, { type: 'triangle', f, dur: Math.min(0.9, d + 0.4), a: 0.003, peak: 0.09 * v, ft: 'lowpass', ff: 2200 });
    tone(s, { type: 'sawtooth', f, dur: 0.18, a: 0.002, peak: 0.018 * v, ft: 'lowpass', ff: 1800, ff1: 500 });
  },
  celesta: (s, f, d, v) => {
    tone(s, { f, dur: Math.max(0.9, d + 0.5), a: 0.002, peak: 0.12 * v });
    tone(s, { f: f * 4, dur: 0.3, a: 0.001, peak: 0.025 * v });
    tone(s, { f: f * 2, dur: 0.6, a: 0.001, peak: 0.02 * v });
  },
  bell: (s, f, d, v) => {
    tone(s, { f, dur: Math.max(1.0, d + 0.6), a: 0.002, peak: 0.07 * v });
    tone(s, { f: f * 2.76, dur: 0.45, a: 0.001, peak: 0.02 * v });
    tone(s, { f: f * 5.4, dur: 0.2, a: 0.001, peak: 0.01 * v });
  },
  brass: (s, f, d, v) => {
    const dur = d * 0.92 + 0.06;
    tone(s, { type: 'sawtooth', f, dur, a: 0.03, hold: dur * 0.75, peak: 0.07 * v, ft: 'lowpass', ff: 2200, ff1: 800, q: 1.2, vib: 8, vibHz: 5 });
    tone(s, { type: 'square', f, dur, a: 0.04, hold: dur * 0.75, peak: 0.025 * v, ft: 'lowpass', ff: 1400 });
  },
  reed: (s, f, d, v) => {
    const dur = d * 0.95 + 0.05;
    tone(s, { type: 'square', f, dur, a: 0.025, hold: dur * 0.7, peak: 0.05 * v, ft: 'lowpass', ff: 1500, q: 1.5, vib: 14, vibHz: 5.2 });
    tone(s, { type: 'triangle', f, dur, a: 0.02, hold: dur * 0.7, peak: 0.05 * v });
  },
  flute: (s, f, d, v) => {
    const dur = d * 0.95 + 0.08;
    tone(s, { f, dur, a: 0.04, hold: dur * 0.75, peak: 0.1 * v, vib: 12, vibHz: 5 });
    tone(s, { type: 'triangle', f: f * 2, dur, a: 0.05, hold: dur * 0.6, peak: 0.012 * v });
    noise(s, { dur: Math.min(dur, 0.25), a: 0.03, peak: 0.012 * v, ft: 'bandpass', f: f * 2, q: 4, fixed: true });
  },
  calliope: (s, f, d, v) => {
    const dur = d * 0.9 + 0.05;
    tone(s, { type: 'square', f, dur, a: 0.01, hold: dur * 0.8, peak: 0.035 * v, ft: 'lowpass', ff: 2400, vib: 18, vibHz: 6 });
    tone(s, { f: f * 2, dur, a: 0.01, hold: dur * 0.8, peak: 0.05 * v, vib: 18, vibHz: 6 });
    tone(s, { f, dur, a: 0.01, hold: dur * 0.8, peak: 0.05 * v });
  },
  organ: (s, f, d, v) => {
    const dur = Math.min(d, 0.45);
    tone(s, { type: 'square', f, dur, a: 0.005, hold: dur * 0.7, peak: 0.02 * v, ft: 'lowpass', ff: 1500 });
    tone(s, { f: f * 2, dur, a: 0.005, hold: dur * 0.7, peak: 0.03 * v });
  },
  vibes: (s, f, d, v) => {
    const dur = Math.max(0.8, d + 0.6);
    tone(s, { f, dur, a: 0.003, peak: 0.11 * v, vib: 18, vibHz: 4.5 });
    tone(s, { f: f * 4, dur: 0.15, a: 0.001, peak: 0.02 * v });
  },
  kick: (s, _f, _d, v) => {
    tone(s, { f: 120, f1: 45, glide: 0.12, dur: 0.22, a: 0.002, peak: 0.32 * v, fixed: true });
  },
  timp: (s, f, _d, v) => {
    tone(s, { f, f1: f * 0.9, dur: 0.7, a: 0.004, peak: 0.16 * v });
    noise(s, { color: 'brown', dur: 0.2, peak: 0.08 * v, ft: 'lowpass', f: 300, fixed: true });
  },
  snare: (s, _f, _d, v) => {
    noise(s, { dur: 0.16, peak: 0.12 * v, ft: 'bandpass', f: 2200, q: 0.8, fixed: true });
    tone(s, { type: 'triangle', f: 190, f1: 150, dur: 0.08, peak: 0.08 * v, fixed: true });
  },
  hat: (s, _f, _d, v) => {
    noise(s, { dur: 0.035, peak: 0.05 * v, ft: 'highpass', f: 7500, fixed: true });
  },
  ohat: (s, _f, _d, v) => {
    noise(s, { dur: 0.18, peak: 0.04 * v, ft: 'highpass', f: 7000, fixed: true });
  },
  ride: (s, _f, _d, v) => {
    noise(s, { dur: 0.3, peak: 0.03 * v, ft: 'bandpass', f: 6500, q: 1.5, fixed: true });
    tone(s, { f: 4200, dur: 0.25, peak: 0.006 * v, fixed: true });
  },
  brush: (s, _f, d, v) => {
    noise(s, { color: 'pink', dur: Math.max(0.12, d * 0.8), a: 0.02, peak: 0.05 * v, ft: 'bandpass', f: 3500, q: 0.7, fixed: true });
  },
  rim: (s, _f, _d, v) => {
    tone(s, { type: 'square', f: 1700, dur: 0.025, a: 0.001, peak: 0.03 * v, ft: 'bandpass', ff: 1800, q: 3, fixed: true });
  },
  shaker: (s, _f, _d, v) => {
    noise(s, { dur: 0.06, a: 0.015, peak: 0.03 * v, ft: 'highpass', f: 6000, fixed: true });
  },
  tick: (s, _f, _d, v) => {
    tone(s, { f: 1500, dur: 0.03, a: 0.001, peak: 0.04 * v, fixed: true });
  },
  crash: (s, _f, _d, v) => {
    noise(s, { dur: 1.4, peak: 0.05 * v, ft: 'highpass', f: 5000, fixed: true });
  },
};

// ------------------------------------------------------------------ notation helpers

const PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

const QUAL: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10], dim7: [0, 3, 6, 9], add9: [0, 4, 7, 14], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
};

interface Chord { pc: number; iv: number[] }

function parseChord(name: string): Chord {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  if (!m) return { pc: 0, iv: QUAL[''] };
  return { pc: PC[m[1]] ?? 0, iv: QUAL[m[2]] ?? QUAL[''] };
}

/** "C5" -> midi */
export function noteToMidi(n: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 60;
  return (PC[m[1]] ?? 0) + (parseInt(m[2], 10) + 1) * 12;
}

export interface Ev { b: number; inst: Inst; m: number; d: number; v: number }

interface ProgSeg { b: number; d: number; ch: Chord }

/** Builder for one loop variant. */
class TB {
  ev: Ev[] = [];
  segs: ProgSeg[] = [];
  readonly total: number;
  constructor(readonly bpb: number, readonly bars: number, prog: [string, number][]) {
    this.total = bpb * bars;
    let b = 0;
    for (const [name, d] of prog) {
      this.segs.push({ b, d, ch: parseChord(name) });
      b += d;
    }
  }
  chordAt(beat: number): ProgSeg {
    for (let i = this.segs.length - 1; i >= 0; i--) if (beat >= this.segs[i].b - 1e-6) return this.segs[i];
    return this.segs[0];
  }
  nextSeg(seg: ProgSeg): ProgSeg {
    const i = this.segs.indexOf(seg);
    return this.segs[(i + 1) % this.segs.length];
  }
  add(inst: Inst, b: number, m: number, d: number, v: number): void {
    if (b < this.total - 1e-6) this.ev.push({ b, inst, m, d, v });
  }
  /** Melody: "C5:1 r:0.5 E5:0.5" */
  line(inst: Inst, str: string, v = 0.7, transpose = 0, start = 0): this {
    let b = start;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, ds] = tok.split(':');
      const d = parseFloat(ds);
      if (n !== 'r') this.add(inst, b, noteToMidi(n) + transpose, d, v * rand(0.92, 1.05));
      b += d;
    }
    return this;
  }
  /** Sustained chord voicing per progression segment. */
  pad(inst: Inst, base = 48, v = 0.6, maxNotes = 4): this {
    for (const sg of this.segs) {
      const root = base + sg.ch.pc;
      sg.ch.iv.slice(0, maxNotes).forEach((iv) => this.add(inst, sg.b, root + iv, sg.d, v));
    }
    return this;
  }
  /** Chord stabs at beat offsets (relative to bar start). */
  comp(inst: Inst, hits: [number, number][], base = 55, v = 0.6, maxNotes = 4, everyBars = 1): this {
    const span = this.bpb * everyBars;
    for (let bar = 0; bar < this.total; bar += span) {
      for (const [off, d] of hits) {
        const b = bar + off;
        const sg = this.chordAt(b);
        let root = base + sg.ch.pc;
        if (root > base + 6) root -= 12;
        sg.ch.iv.slice(0, maxNotes).forEach((iv) => this.add(inst, b, root + iv, d, v));
      }
    }
    return this;
  }
  /** Bass hits: [offset, dur, degree] per bar, degree 'r' root, '5' fifth, '8' octave, '3' third, 'a' approach to next chord. */
  bassline(inst: Inst, hits: [number, number, string][], base = 36, v = 0.8, everyBars = 1): this {
    const span = this.bpb * everyBars;
    for (let bar = 0; bar < this.total; bar += span) {
      for (const [off, d, deg] of hits) {
        const b = bar + off;
        const sg = this.chordAt(b);
        let root = base + sg.ch.pc;
        if (root > base + 7) root -= 12;
        let m = root;
        if (deg === '5') m = root + 7;
        else if (deg === '8') m = root + 12;
        else if (deg === '3') m = root + (sg.ch.iv[1] ?? 4);
        else if (deg === 'a') {
          let nr = base + this.nextSeg(sg).ch.pc;
          if (nr > base + 7) nr -= 12;
          m = nr - 1;
        }
        this.add(inst, b, m, d, v);
      }
    }
    return this;
  }
  /** Walking quarter-note bass across segments. */
  walk(inst: Inst, base = 36, v = 0.8): this {
    for (const sg of this.segs) {
      let root = base + sg.ch.pc;
      if (root > base + 7) root -= 12;
      let nr = base + this.nextSeg(sg).ch.pc;
      if (nr > base + 7) nr -= 12;
      const approach = nr + (Math.random() < 0.6 ? -1 : 1);
      const tones = sg.d >= 4 ? [root, root + sg.ch.iv[1], root + 7, approach] : sg.d >= 3 ? [root, root + 7, approach] : [root, approach];
      tones.forEach((m, i) => this.add(inst, sg.b + i, m, 0.9, v * (i === 0 ? 1 : 0.85)));
    }
    return this;
  }
  /** Arpeggio pattern of chord-tone indices on a fixed step grid. */
  arp(inst: Inst, pattern: number[], step: number, base = 55, v = 0.5): this {
    let i = 0;
    for (let b = 0; b < this.total - 1e-6; b += step, i++) {
      const sg = this.chordAt(b);
      let root = base + sg.ch.pc;
      if (root > base + 6) root -= 12;
      const idx = pattern[i % pattern.length];
      const iv = sg.ch.iv[idx % sg.ch.iv.length] + 12 * Math.floor(idx / sg.ch.iv.length);
      this.add(inst, b, root + iv, step, v * (i % 2 === 0 ? 1 : 0.8));
    }
    return this;
  }
  /** Drum grid: 'x' full, 'o' soft, '.' rest; repeats to fill the loop. */
  drum(inst: Inst, pat: string, step: number, v = 0.7, freq = 0): this {
    const cells = pat.replace(/\s+/g, '');
    let i = 0;
    for (let b = 0; b < this.total - 1e-6; b += step, i++) {
      const c = cells[i % cells.length];
      if (c === 'x') this.add(inst, b, freq, step, v);
      else if (c === 'o') this.add(inst, b, freq, step, v * 0.5);
    }
    return this;
  }
  done(): Ev[] {
    return this.ev.sort((a, b) => a.b - b.b);
  }
}

// ------------------------------------------------------------------ tracks

export interface TrackDef {
  bpm: number;
  bpb: number;
  bars: number;
  swing: number;
  level: number;
  /** each loop iteration uses variants[loop % n] */
  variants: Ev[][];
}

type Prog = [string, number][];

function track(bpm: number, bpb: number, bars: number, swing: number, level: number, prog: Prog, common: (t: TB) => void, melodies: ((t: TB) => void)[]): TrackDef {
  const variants = melodies.map((mel) => {
    const t = new TB(bpb, bars, prog);
    common(t);
    mel(t);
    return t.done();
  });
  return { bpm, bpb, bars, swing, level, variants };
}

// MENU — F major, 76 bpm, dreamy pad + celesta
const MENU = track(76, 4, 8, 0, 0.9,
  [['Fmaj7', 4], ['Am7', 4], ['Bbmaj7', 4], ['Gm7', 2], ['C7', 2], ['Fmaj7', 4], ['Dm7', 4], ['Bbmaj7', 4], ['C7sus4', 4]],
  (t) => {
    t.pad('pad', 48, 0.8);
    t.bassline('bass', [[0, 2.5, 'r'], [2.5, 1.5, '5']], 36, 0.55);
    t.arp('pluck', [0, 1, 2, 3, 2, 1, 2, 3], 0.5, 60, 0.28);
    t.drum('shaker', '.o.o.o.x', 0.5, 0.6);
  },
  [
    (t) => t.line('celesta', 'A5:1.5 G5:0.5 F5:1 C5:1  E5:1.5 G5:0.5 A5:2  D6:1 C6:0.5 Bb5:0.5 A5:1 F5:1  G5:2 r:0.5 E5:0.5 F5:0.5 G5:0.5  A5:1.5 C6:0.5 E6:1 D6:1  C6:1.5 A5:0.5 F5:2  D5:1 F5:1 A5:1 G5:0.5 F5:0.5  G5:3 r:1', 0.75),
    (t) => {
      const b = 'C6:1 A5:1 G5:0.5 F5:0.5 G5:1  E5:3 r:1  F5:0.5 G5:0.5 A5:0.5 Bb5:0.5 D6:2  C6:1 Bb5:1 A5:1 G5:1  F5:1 A5:1 C6:1 E6:1  F6:2 D6:1 A5:1  Bb5:1.5 A5:0.5 G5:1 F5:1  G5:1 A5:1 C6:2';
      t.line('celesta', b, 0.65);
      t.line('flute', b, 0.35, -12);
    },
  ]);

// STATION — C major jazzy swing, 132 bpm, walking upright, brushes, clarinet-ish reed
const STATION = track(132, 4, 8, 0.17, 1.2,
  [['C6', 2], ['A7', 2], ['Dm7', 2], ['G7', 2], ['Em7', 2], ['A7', 2], ['Dm7', 2], ['G7', 2], ['C6', 4], ['F6', 2], ['F#dim7', 2], ['C6', 2], ['A7', 2], ['Dm7', 2], ['G7', 2]],
  (t) => {
    t.walk('upright', 36, 0.85);
    t.comp('epiano', [[0, 0.75], [1.5, 0.5], [3.5, 0.4]], 55, 0.45);
    t.drum('ride', 'x.xxx.xx', 0.5, 0.8);
    t.drum('hat', '..x...x.', 0.5, 0.5);
    t.drum('brush', '..x...x.', 0.5, 0.6);
    t.drum('kick', 'o.......o.......', 0.5, 0.5);
  },
  [
    (t) => t.line('reed', 'E5:0.5 G5:0.5 A5:0.5 G5:0.5 C#5:1 E5:1  F5:1.5 A5:0.5 G5:1 F5:0.5 D5:0.5  G5:1 E5:0.5 G5:0.5 A5:1 G5:1  F5:1 D5:1 B4:1 G4:1  C5:0.5 E5:0.5 G5:0.5 A5:0.5 C6:1.5 r:0.5  A5:1 F5:1 A5:0.5 C6:0.5 Eb6:1  E6:1 D6:0.5 C6:0.5 C#6:1 A5:1  D6:1 A5:0.5 F5:0.5 G5:1.5 r:0.5', 0.8),
    (t) => t.line('reed', 'r:1 G5:0.5 A5:0.5 C6:1 A5:1  F5:0.5 E5:0.5 F5:0.5 A5:0.5 B5:1 G5:1  E5:1.5 D5:0.5 C#5:1 E5:1  D5:0.5 F5:0.5 A5:0.5 C6:0.5 B5:1 G5:1  C6:2 G5:0.5 E5:0.5 C5:1  F5:0.5 A5:0.5 C6:0.5 D6:0.5 Eb6:1 C6:1  G5:1 E5:1 A5:0.5 G5:0.5 E5:1  D5:1 F5:0.5 B4:0.5 C5:2', 0.8),
  ]);

// HUB — G major, 104 bpm, breezy guitar arps + flute
const HUB = track(104, 4, 8, 0, 0.85,
  [['G', 4], ['D', 4], ['Em7', 4], ['Cmaj7', 4], ['G', 4], ['Bm7', 4], ['Cadd9', 4], ['D7sus4', 2], ['D7', 2]],
  (t) => {
    t.arp('guitar', [0, 2, 1, 2, 3, 2, 1, 2], 0.5, 55, 0.6);
    t.bassline('bass', [[0, 1.5, 'r'], [1.5, 0.5, 'r'], [2, 1.5, '5'], [3.5, 0.5, 'a']], 36, 0.6);
    t.drum('kick', 'x...x.x.', 0.5, 0.45);
    t.drum('hat', 'oxoxoxox', 0.5, 0.45);
    t.drum('rim', '..x...x.', 0.5, 0.6);
  },
  [
    (t) => t.line('flute', 'B5:1 D6:1 B5:0.5 A5:0.5 G5:1  A5:1.5 F#5:0.5 D5:2  E5:0.5 G5:0.5 B5:1 D6:1 B5:1  C6:1.5 B5:0.5 G5:2  B5:1 D6:0.5 E6:0.5 D6:1 B5:1  A5:1 F#5:0.5 A5:0.5 D6:2  E6:1 D6:1 C6:0.5 B5:0.5 A5:1  G5:2 F#5:1 A5:1', 0.7, -12),
    (t) => t.line('flute', 'D5:0.5 G5:0.5 B5:0.5 D6:0.5 G6:2  F#6:1 E6:0.5 D6:0.5 A5:2  G5:1 B5:1 E6:1.5 D6:0.5  E6:1 C6:1 G5:1 E5:1  D5:1 G5:1 B5:1 A5:0.5 G5:0.5  F#5:1 D5:1 F#5:0.5 A5:0.5 B5:1  C6:1 D6:1 E6:1 G6:1  F#6:1.5 E6:0.5 D6:1 C6:1', 0.65, -12),
  ]);

// MALL — D major bossa / lounge, 120 bpm, nylon guitar comp + vibes
const MALL = track(120, 4, 8, 0, 0.85,
  [['Dmaj7', 4], ['Em7', 4], ['F#m7', 4], ['Bm7', 4], ['Em9', 4], ['A7', 4], ['Dmaj7', 2], ['B7', 2], ['Em7', 2], ['A7', 2]],
  (t) => {
    t.bassline('bass', [[0, 1.5, 'r'], [1.5, 0.5, '5'], [2, 1.5, '5'], [3.5, 0.5, 'r']], 36, 0.65);
    t.comp('guitar', [[0, 0.4], [1.5, 0.4], [3, 0.4], [5, 0.4], [6.5, 0.4]], 55, 0.5, 4, 2);
    t.drum('rim', 'x..x..x...x..x..', 0.5, 0.7);
    t.drum('shaker', 'oxoxoxox', 0.5, 0.7);
    t.drum('kick', 'x..xx..x', 0.5, 0.35);
  },
  [
    (t) => t.line('vibes', 'F#5:1.5 E5:0.5 F#5:1 A5:1  G5:2 r:0.5 B4:0.5 D5:0.5 E5:0.5  A5:1.5 F#5:0.5 E5:1 C#5:1  D5:3 r:1  F#5:0.5 G5:0.5 B5:0.5 D6:0.5 F#6:1.5 E6:0.5  C#6:1 B5:0.5 A5:0.5 G5:2  F#5:1 A5:0.5 C#6:0.5 B5:1 A5:1  G5:1 F#5:0.5 E5:0.5 E5:1 C#5:1', 0.7),
    (t) => t.line('vibes', 'A5:0.5 F#5:0.5 A5:0.5 C#6:1.5 r:1  B5:1 G5:0.5 E5:0.5 D5:2  C#5:0.5 E5:0.5 A5:0.5 C#6:0.5 E6:2  D6:1.5 C#6:0.5 B5:1 F#5:1  G5:2 D6:1 B5:1  A5:1.5 G5:0.5 E5:1 C#5:1  D5:0.5 F#5:0.5 A5:0.5 C#6:0.5 B5:1 D#6:1  E6:2 C#6:1 A5:1', 0.65),
  ]);

// CIRCUS — F major 3/4 oom-pah waltz, 168 bpm, calliope + tuba
const CIRCUS = track(168, 3, 16, 0, 1.15,
  [['F', 3], ['F', 3], ['C7', 3], ['C7', 3], ['C7', 3], ['C7', 3], ['F', 3], ['F', 3], ['F7', 3], ['F7', 3], ['Bb', 3], ['Bb', 3], ['F', 3], ['C7', 3], ['F', 3], ['F', 3]],
  (t) => {
    t.bassline('tuba', [[0, 0.8, 'r'], [3, 0.8, '5']], 36, 0.85, 2);
    t.comp('organ', [[1, 0.5], [2, 0.5]], 60, 0.55, 3);
    t.drum('kick', 'x..', 1, 0.5);
    t.drum('hat', '.xx', 1, 0.6);
    t.drum('crash', 'x' + '.'.repeat(23), 1, 0.5);
  },
  [
    (t) => t.line('calliope', 'A5:2 C6:1  F6:2 E6:1  D6:1 C6:1 Bb5:1  G5:2 r:1  G5:1 A5:1 Bb5:1  E6:2 D6:1  C6:1 A5:1 F5:1  F5:2 r:1  A5:2 C6:1  Eb6:2 C6:1  D6:1 F6:1 D6:1  Bb5:2 r:1  A5:1 C6:1 A5:1  G5:1 Bb5:1 E5:1  F5:3  r:1 C5:1 E5:1', 0.7, -12),
    (t) => t.line('calliope', 'A5:1 G#5:1 A5:1  C6:1 B5:1 C6:1  Bb5:1 A5:1 G5:1  E5:1 F5:1 G5:1  Bb5:1 A5:1 Bb5:1  D6:1 C#6:1 D6:1  C6:2 A5:1  F5:1 G5:1 A5:1  C6:1 B5:1 C6:1  Eb6:1 D6:1 C6:1  Bb5:1 D6:1 F6:1  D6:2 r:1  C6:1 A5:1 F5:1  E5:1 G5:1 Bb5:1  A5:2 G5:0.5 E5:0.5  F5:2 r:1', 0.7, -12),
  ]);

// MUSEUM — A minor, 80 bpm, celesta + pizzicato + dark pad
const MUSEUM = track(80, 4, 8, 0, 1.3,
  [['Am', 4], ['Fmaj7', 4], ['Dm7', 4], ['E7', 4], ['Am', 4], ['C', 4], ['F#m7b5', 4], ['E7sus4', 2], ['E7', 2]],
  (t) => {
    t.pad('pad', 45, 0.6, 3);
    t.bassline('pluck', [[0, 0.5, 'r'], [1, 0.5, '5'], [2, 0.5, '8'], [3, 0.5, '5']], 45, 0.7);
    t.drum('tick', 'x.o.', 1, 0.35);
    t.drum('timp', 'x' + '.'.repeat(15), 1, 0.4, 45);
  },
  [
    (t) => t.line('celesta', 'E5:1 A5:1 C6:1 B5:1  A5:2 E5:1 F5:1  D5:1 F5:1 A5:1 G5:0.5 F5:0.5  E5:2 G#5:2  A5:1 C6:1 E6:1.5 D6:0.5  C6:1 B5:0.5 A5:0.5 G5:2  F#5:1 A5:1 C6:1 E6:1  D6:2 B5:1 G#5:1', 0.75),
    (t) => t.line('pluck', 'A4:0.5 r:0.5 C5:0.5 r:0.5 E5:0.5 r:0.5 A5:1  G5:0.5 F5:0.5 E5:0.5 C5:0.5 A4:2  r:1 D5:0.5 E5:0.5 F5:1 A5:1  G#5:1.5 B5:0.5 D6:2  C6:0.5 B5:0.5 A5:0.5 E5:0.5 C6:1 A5:1  G5:1.5 E5:0.5 C5:2  A5:0.5 C6:0.5 E6:0.5 C6:0.5 F#5:2  E5:1 F5:1 G#5:1 B5:1', 0.9),
  ]);

// CITY HALL — Bb major pompous march, 116 bpm, brass + tuba + snare
const CITYHALL = track(116, 4, 8, 0, 1.1,
  [['Bb', 4], ['F7', 4], ['Bb', 4], ['Eb', 2], ['Bb', 2], ['Gm', 4], ['C7', 4], ['F', 2], ['F7', 2], ['Bb', 2], ['F7', 2]],
  (t) => {
    t.bassline('tuba', [[0, 0.8, 'r'], [2, 0.8, '5']], 36, 0.9);
    t.comp('brass', [[1, 0.35], [3, 0.35]], 58, 0.35, 3);
    t.drum('snare', 'x.oox.o.', 0.5, 0.55);
    t.drum('kick', 'x...x...', 0.5, 0.6);
    t.drum('crash', 'x' + '.'.repeat(31), 0.5, 0.4);
  },
  [
    (t) => t.line('brass', 'F5:0.75 F5:0.25 Bb5:1 D6:1 Bb5:1  C6:1.5 A5:0.5 F5:2  D6:0.75 D6:0.25 F6:1 D6:1 Bb5:1  G5:1 Bb5:1 F5:2  G5:0.75 A5:0.25 Bb5:1 D6:1 G5:1  E5:0.75 F5:0.25 G5:1 Bb5:1 E5:1  F5:1 A5:1 C6:1 Eb6:1  D6:2 C6:1 r:1', 0.75, -12),
    (t) => t.line('brass', 'Bb5:1 Bb5:0.5 C6:0.5 D6:1 Bb5:1  A5:1 C6:1 F6:2  F6:0.75 Eb6:0.25 D6:1 C6:1 Bb5:1  Bb5:1 G5:1 D5:2  D5:0.5 G5:0.5 Bb5:0.5 D6:0.5 G6:2  E6:1 D6:0.5 C6:0.5 Bb5:2  A5:1 C6:1 F5:1 A5:1  Bb5:3 r:1', 0.75, -12),
  ]);

// FINALE — C major triumphant, 128 bpm, brass + bells + full kit
const FINALE = track(128, 4, 8, 0, 0.85,
  [['C', 4], ['G', 4], ['Am', 4], ['F', 4], ['C', 4], ['F', 4], ['G', 2], ['G7', 2], ['C', 2], ['G', 2]],
  (t) => {
    t.pad('pad', 48, 0.9, 3);
    t.bassline('bass', [[0, 0.45, 'r'], [0.5, 0.45, '8'], [1, 0.45, 'r'], [1.5, 0.45, '8'], [2, 0.45, 'r'], [2.5, 0.45, '8'], [3, 0.45, '5'], [3.5, 0.45, '8']], 36, 0.6);
    t.drum('kick', 'x...x...', 0.5, 0.7);
    t.drum('snare', '..x...x.', 0.5, 0.6);
    t.drum('hat', 'xoxoxoxo', 0.5, 0.6);
    t.drum('crash', 'x' + '.'.repeat(31), 0.5, 0.6);
  },
  [
    (t) => {
      const a = 'G5:1 C6:1 E6:1.5 D6:0.5  D6:1 B5:1 G5:2  A5:1 C6:1 E6:1 A6:1  G6:1.5 F6:0.5 C6:2  E6:1 G6:1 E6:1 C6:1  F6:1.5 E6:0.5 D6:1 C6:1  B5:1 D6:1 G6:1 F6:1  E6:2 D6:2';
      t.line('brass', a, 0.75, -12);
      t.line('bell', a, 0.5);
    },
    (t) => {
      const b = 'C6:0.5 E6:0.5 G6:1 G6:0.5 A6:0.5 G6:1  D6:1.5 B5:0.5 G5:1 B5:1  C6:0.5 E6:0.5 A6:1 G6:1 E6:1  F6:1 A6:1 C7:2  G6:1.5 E6:0.5 C6:1 E6:1  A6:1 F6:1 C6:1 A5:1  G5:0.5 B5:0.5 D6:0.5 F6:0.5 G6:2  C7:3 r:1';
      t.line('brass', b, 0.75, -12);
      t.line('bell', b, 0.5);
    },
  ]);

export const TRACKS: Record<MusicTrack, TrackDef> = {
  menu: MENU, station: STATION, hub: HUB, mall: MALL, circus: CIRCUS, museum: MUSEUM, cityhall: CITYHALL, finale: FINALE,
};

// ------------------------------------------------------------------ track player

const LOOKAHEAD = 0.12;

export class TrackPlayer {
  readonly gain: GainNode;
  private loop = 0;
  private idx = 0;
  private loopStart = -1;
  private readonly spb: number;
  private readonly loopLen: number;
  stopped = false;

  constructor(private ctx: AudioContext, private nz: NoiseBank, readonly def: TrackDef, dest: AudioNode, fadeIn: number) {
    this.spb = 60 / def.bpm;
    this.loopLen = def.bpb * def.bars * this.spb;
    this.gain = ctx.createGain();
    const now = ctx.currentTime;
    this.gain.gain.setValueAtTime(0.0001, now);
    this.gain.gain.linearRampToValueAtTime(def.level, now + fadeIn);
    this.gain.connect(dest);
    this.loopStart = -1; // anchored on first tick, once the context clock is running
  }

  private swing(b: number): number {
    const fl = Math.floor(b);
    const fr = b - fl;
    if (this.def.swing > 0 && Math.abs(fr - 0.5) < 1e-4) return fl + 0.5 + this.def.swing;
    return b;
  }

  tick(now: number): void {
    if (this.stopped) return;
    if (this.loopStart < 0) this.loopStart = now + 0.06;
    // fell far behind (tab throttling etc.): resync instead of bursting notes
    if (this.loopStart + this.loopLen < now) {
      this.loopStart = now + 0.05;
      this.idx = 0;
      this.loop++;
    }
    let guard = 0;
    while (guard++ < 256) {
      const evs = this.def.variants[this.loop % this.def.variants.length];
      if (!evs || evs.length === 0) return;
      if (this.idx >= evs.length) {
        this.idx = 0;
        this.loop++;
        this.loopStart += this.loopLen;
        continue;
      }
      const e = evs[this.idx];
      const t = this.loopStart + this.swing(e.b) * this.spb;
      if (t > now + LOOKAHEAD) return;
      this.idx++;
      if (t < now - 0.03) continue; // too late, skip
      const s: Voice = { ctx: this.ctx, nz: this.nz, out: this.gain, t: Math.max(t, now), p: 1, v: 1 };
      INSTRUMENTS[e.inst](s, mtof(e.m), e.d * this.spb, e.v);
    }
  }

  fadeOut(dur: number): void {
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0.0001, now + dur);
    this.stopped = true;
    const gain = this.gain;
    setTimeout(() => {
      try { gain.disconnect(); } catch { /* ignore */ }
    }, (dur + 1.5) * 1000);
  }
}

// ------------------------------------------------------------------ ambience

interface AmbEvent { min: number; max: number; next: number; fn: (s: Voice) => void }

export class AmbiencePlayer {
  readonly gain: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private events: AmbEvent[] = [];
  stopped = false;

  constructor(private ctx: AudioContext, private nz: NoiseBank, readonly area: AreaId, dest: AudioNode, fadeIn: number) {
    this.gain = ctx.createGain();
    const now = ctx.currentTime;
    this.gain.gain.setValueAtTime(0.0001, now);
    this.gain.gain.linearRampToValueAtTime(1, now + fadeIn);
    this.gain.connect(dest);
    this.build(area);
    for (const e of this.events) e.next = now + rand(e.min * 0.3, e.max * 0.6);
  }

  private loopNoise(color: 'white' | 'pink' | 'brown', ft: BiquadFilterType, f: number, q: number, level: number, lfoHz = 0, lfoDepth = 0, ft2?: BiquadFilterType, f2?: number): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.nz[color];
    src.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = ft;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.value = level;
    src.connect(fl);
    let head: AudioNode = fl;
    if (ft2 && f2) {
      const fl2 = c.createBiquadFilter();
      fl2.type = ft2;
      fl2.frequency.value = f2;
      fl.connect(fl2);
      head = fl2;
    }
    head.connect(g);
    g.connect(this.gain);
    src.start(c.currentTime, Math.random() * 1.5);
    this.sources.push(src);
    if (lfoHz > 0) {
      const lfo = c.createOscillator();
      lfo.frequency.value = lfoHz;
      const lg = c.createGain();
      lg.gain.value = lfoDepth;
      lfo.connect(lg);
      lg.connect(g.gain);
      lfo.start();
      this.sources.push(lfo);
    }
  }

  private murmur(level: number): void {
    this.loopNoise('pink', 'bandpass', 480, 0.9, level, 0.13, level * 0.4, 'lowpass', 1200);
    this.loopNoise('pink', 'bandpass', 950, 1.6, level * 0.5, 0.21, level * 0.3);
  }

  private fountain(level: number): void {
    this.loopNoise('white', 'highpass', 500, 0.5, level, 6.5, level * 0.15, 'lowpass', 4200);
    this.loopNoise('brown', 'lowpass', 350, 0.7, level * 1.2, 0.4, level * 0.3);
  }

  private ev(min: number, max: number, fn: (s: Voice) => void): void {
    this.events.push({ min, max, next: 0, fn });
  }

  private build(area: AreaId): void {
    switch (area) {
      case 'station':
        this.murmur(0.05);
        this.ev(22, 45, (s) => SFX.chime(sub(s, 0, 1, 0.45)));
        this.ev(30, 60, (s) => SFX.trainHorn(sub(s, 0, rand(0.9, 1.05), 0.35)));
        break;
      case 'mall':
        this.fountain(0.035);
        this.murmur(0.035);
        this.ev(15, 30, (s) => SFX.serve(sub(s, 0, 1.2, 0.2)));
        break;
      case 'circus':
        this.murmur(0.06);
        this.ev(12, 25, (s) => SFX.cheer(sub(s, 0, rand(0.9, 1.1), 0.3)));
        this.ev(18, 35, (s) => SFX.clap(sub(s, 0, 1, 0.25)));
        break;
      case 'museum':
        this.loopNoise('brown', 'lowpass', 180, 0.7, 0.07, 0.07, 0.02);
        this.loopNoise('pink', 'bandpass', 260, 4, 0.012);
        this.ev(4, 9, (s) => {
          const f = rand(900, 1400);
          for (let i = 0; i < 3; i++) tone(s, { f, f1: f * 2, at: i * 0.22, dur: 0.05, peak: 0.05 / (i * 2 + 1) });
        });
        break;
      case 'cityhall':
        this.murmur(0.025);
        this.ev(1, 1, (s) => {
          const tock = Math.floor(s.t) % 2 === 0;
          tone(s, { f: tock ? 1100 : 1400, dur: 0.035, peak: 0.025, a: 0.001 });
          noise(s, { dur: 0.03, peak: 0.02, ft: 'bandpass', f: 2500, q: 4 });
        });
        this.ev(6, 13, (s) => {
          // "coo-roo-coo"
          const base = rand(330, 420);
          [0, 0.3, 0.55].forEach((at, i) => tone(s, { f: base * (i === 1 ? 1.12 : 1), f1: base * 0.85, at, dur: i === 1 ? 0.2 : 0.28, a: 0.04, peak: 0.04, vib: 60, vibHz: 22 }));
        });
        break;
      case 'hub':
        this.fountain(0.04);
        this.ev(2, 6, (s) => {
          const n = 2 + Math.floor(Math.random() * 3);
          const base = rand(2800, 4200);
          for (let i = 0; i < n; i++) tone(s, { f: base * rand(0.9, 1.1), f1: base * rand(1.2, 1.5), at: i * rand(0.08, 0.14), dur: 0.06, peak: 0.025 });
        });
        break;
    }
  }

  tick(now: number, paused: boolean): void {
    if (this.stopped) return;
    for (const e of this.events) {
      if (now < e.next) continue;
      e.next = now + rand(e.min, e.max);
      if (paused) continue;
      try {
        e.fn({ ctx: this.ctx, nz: this.nz, out: this.gain, t: now + 0.02, p: 1, v: 1 });
      } catch {
        /* ignore */
      }
    }
  }

  fadeOut(dur: number): void {
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0.0001, now + dur);
    this.stopped = true;
    const sources = this.sources;
    const gain = this.gain;
    setTimeout(() => {
      for (const s of sources) {
        try { s.stop(); s.disconnect(); } catch { /* ignore */ }
      }
      try { gain.disconnect(); } catch { /* ignore */ }
    }, (dur + 0.3) * 1000);
  }
}
