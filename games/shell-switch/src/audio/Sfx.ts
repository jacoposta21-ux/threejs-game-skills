/**
 * Cartoony synthesized one-shots, footsteps and gibberish voice blips.
 * Every function renders into `s.out` starting at `s.t` and returns its length in seconds.
 */
import type { CharacterKind, SfxName } from './AudioSystem';
import { mtof, noise, pick, rand, sub, tone, type Voice } from './synth';

type SfxFn = (s: Voice) => number;

const bell = (s: Voice, f: number, at: number, dur: number, peak: number): number => {
  tone(s, { f, at, dur, peak, a: 0.002 });
  tone(s, { f: f * 2.76, at, dur: dur * 0.45, peak: peak * 0.25, a: 0.002 });
  return tone(s, { f: f * 5.4, at, dur: dur * 0.2, peak: peak * 0.12, a: 0.002 });
};

const brassNote = (s: Voice, f: number, at: number, dur: number, peak: number): number => {
  tone(s, { type: 'sawtooth', f, at, dur, peak, a: 0.025, hold: dur * 0.7, ft: 'lowpass', ff: 2600, ff1: 900, q: 1.5 });
  return tone(s, { type: 'square', f: f * 0.5, at, dur, peak: peak * 0.35, a: 0.03, hold: dur * 0.7, ft: 'lowpass', ff: 1200, q: 0.7 });
};

const thump = (s: Voice, at: number, f: number, peak: number, dur = 0.16): number => {
  tone(s, { f, f1: f * 0.4, at, dur, peak, a: 0.002 });
  return noise(s, { color: 'brown', at, dur: dur * 0.7, peak: peak * 0.8, ft: 'lowpass', f: 400, q: 0.7 });
};

const click = (s: Voice, at: number, f: number, peak: number): number =>
  noise(s, { at, dur: 0.025, peak, ft: 'bandpass', f, q: 4, a: 0.001 });

const crowd = (s: Voice, dur: number, peak: number, excited: boolean): number => {
  // a swell of babble: several formant-filtered noise layers with slightly offset envelopes
  const formants = excited ? [700, 1100, 1600, 2400] : [500, 800, 1200];
  formants.forEach((f, i) => {
    noise(s, { color: 'pink', at: i * 0.03, dur, a: dur * 0.3, peak: peak / formants.length * 5, ft: 'bandpass', f, f1: f * (excited ? 1.15 : 0.9), q: 2.5 });
  });
  if (excited) {
    for (let i = 0; i < 5; i++) {
      const f = rand(380, 700);
      tone(s, { type: 'triangle', f, f1: f * rand(1.3, 1.7), at: rand(0, dur * 0.4), dur: rand(0.35, 0.6), peak: peak * 0.3, a: 0.05, ft: 'bandpass', ff: 1200, q: 1.2, vib: 40, vibHz: 7 });
    }
  }
  return dur;
};

export const SFX: Record<SfxName, SfxFn> = {
  possess: (s) => {
    // slurp ...
    noise(s, { dur: 0.28, a: 0.06, peak: 0.25, ft: 'bandpass', f: 300, f1: 2400, q: 6 });
    // bloop ...
    tone(s, { f: 180, f1: 620, dur: 0.16, peak: 0.32, a: 0.01, ft: 'lowpass', ff: 1800 });
    // boing!
    tone(s, { type: 'triangle', f: 380, f1: 940, at: 0.15, dur: 0.42, glide: 0.18, peak: 0.28, vib: 160, vibHz: 18 });
    return tone(s, { f: 760, f1: 1880, at: 0.16, dur: 0.3, glide: 0.18, peak: 0.08, vib: 160, vibHz: 18 });
  },
  unpossess: (s) => {
    noise(s, { dur: 0.04, peak: 0.3, ft: 'bandpass', f: 1800, q: 1.5 });
    tone(s, { f: 1100, f1: 260, dur: 0.09, peak: 0.32 });
    return tone(s, { type: 'triangle', f: 700, f1: 220, at: 0.06, dur: 0.28, peak: 0.2, ft: 'lowpass', ff: 2000 });
  },
  jump: (s) => tone(s, { type: 'square', f: 260, f1: 640, dur: 0.14, glide: 0.1, peak: 0.12, ft: 'lowpass', ff: 1600 }),
  land: (s) => thump(s, 0, 140, 0.28, 0.13),
  dash: (s) => {
    noise(s, { dur: 0.24, a: 0.03, peak: 0.28, ft: 'bandpass', f: 600, f1: 3200, q: 2 });
    return tone(s, { f: 500, f1: 1300, dur: 0.12, peak: 0.1 });
  },
  collect: (s) => {
    tone(s, { type: 'triangle', f: mtof(88), dur: 0.09, peak: 0.16 });
    tone(s, { f: mtof(95), at: 0.065, dur: 0.25, peak: 0.18 });
    return tone(s, { f: mtof(107), at: 0.065, dur: 0.18, peak: 0.04 });
  },
  core: (s) => {
    const notes = [84, 88, 91, 96, 100, 103, 108];
    notes.forEach((m, i) => {
      bell(s, mtof(m), i * 0.07, 0.8, 0.13);
      bell(s, mtof(m), i * 0.07 + 0.28, 0.6, 0.04); // soft echo
    });
    noise(s, { dur: 1.3, a: 0.3, peak: 0.06, ft: 'highpass', f: 6000, q: 0.5 });
    tone(s, { f: mtof(72), dur: 1.4, a: 0.2, peak: 0.12, vib: 15, vibHz: 5 });
    return tone(s, { f: mtof(79), dur: 1.4, a: 0.25, peak: 0.08, vib: 15, vibHz: 5 });
  },
  missionComplete: (s) => {
    const n = [67, 72, 76];
    n.forEach((m, i) => brassNote(s, mtof(m), i * 0.11, 0.14, 0.14));
    brassNote(s, mtof(79), 0.33, 0.22, 0.15);
    brassNote(s, mtof(76), 0.55, 0.11, 0.12);
    [72, 76, 79, 84].forEach((m) => brassNote(s, mtof(m), 0.68, 0.85, 0.09));
    thump(s, 0.68, 110, 0.18, 0.3);
    noise(s, { at: 0.68, dur: 0.9, peak: 0.06, ft: 'highpass', f: 5000 });
    return 1.6;
  },
  missionStart: (s) => {
    brassNote(s, mtof(74), 0, 0.16, 0.12);
    brassNote(s, mtof(81), 0.16, 0.42, 0.13);
    thump(s, 0.16, 120, 0.12, 0.2);
    return 0.65;
  },
  uiClick: (s) => tone(s, { f: 1250, f1: 1000, dur: 0.045, peak: 0.1, a: 0.002 }),
  uiHover: (s) => tone(s, { f: 1900, dur: 0.03, peak: 0.035, a: 0.002 }),
  uiBack: (s) => tone(s, { type: 'triangle', f: 900, f1: 560, dur: 0.08, peak: 0.1 }),
  uiOpen: (s) => {
    tone(s, { type: 'triangle', f: 660, f1: 990, dur: 0.06, peak: 0.08 });
    return tone(s, { f: 1320, at: 0.05, dur: 0.1, peak: 0.07 });
  },
  door: (s) => {
    tone(s, { type: 'sawtooth', f: 140, f1: 220, dur: 0.45, a: 0.05, peak: 0.07, ft: 'bandpass', ff: 900, q: 6, vib: 90, vibHz: 23 });
    return thump(s, 0.42, 120, 0.22, 0.18);
  },
  gate: (s) => {
    for (let i = 0; i < 12; i++) click(s, i * 0.06 + rand(0, 0.015), rand(1800, 3200), 0.11);
    noise(s, { color: 'brown', dur: 0.8, a: 0.1, peak: 0.16, ft: 'lowpass', f: 220 });
    tone(s, { type: 'square', f: 70, f1: 90, dur: 0.75, peak: 0.04, ft: 'lowpass', ff: 300 });
    bell(s, 520, 0.78, 0.5, 0.06);
    return thump(s, 0.78, 110, 0.25, 0.2) + 0.3;
  },
  lift: (s) => {
    tone(s, { type: 'sawtooth', f: 95, f1: 150, dur: 0.3, a: 0.04, peak: 0.12, ft: 'lowpass', ff: 700, vib: 50, vibHz: 12 });
    return noise(s, { color: 'pink', dur: 0.25, peak: 0.08, ft: 'lowpass', f: 500 });
  },
  throw: (s) => {
    noise(s, { dur: 0.32, a: 0.06, peak: 0.25, ft: 'bandpass', f: 400, f1: 1800, q: 2.5 });
    return tone(s, { type: 'sawtooth', f: 130, f1: 90, dur: 0.18, peak: 0.08, ft: 'lowpass', ff: 600 });
  },
  thud: (s) => thump(s, 0, 95, 0.36, 0.28),
  smash: (s) => {
    noise(s, { dur: 0.5, peak: 0.32, ft: 'lowpass', f: 3500, f1: 400, q: 0.6 });
    thump(s, 0, 70, 0.32, 0.4);
    for (let i = 0; i < 9; i++) click(s, rand(0.05, 0.6), rand(1200, 4500), rand(0.05, 0.12));
    return 0.75;
  },
  flex: (s) => {
    tone(s, { type: 'sawtooth', f: 160, f1: 130, dur: 0.32, a: 0.03, peak: 0.08, ft: 'lowpass', ff: 800, vib: 70, vibHz: 14 });
    tone(s, { f: 1400, f1: 2200, at: 0.12, dur: 0.07, peak: 0.06 });
    bell(s, mtof(96), 0.3, 0.6, 0.1);
    return bell(s, mtof(103), 0.36, 0.6, 0.06) + 0.3;
  },
  whistle: (s) => {
    tone(s, { f: 2750, at: 0, dur: 0.16, peak: 0.1, a: 0.01, hold: 0.13, vib: 120, vibHz: 28 });
    tone(s, { f: 2750, at: 0.2, dur: 0.48, peak: 0.12, a: 0.01, hold: 0.4, vib: 140, vibHz: 28 });
    return noise(s, { dur: 0.68, peak: 0.03, ft: 'bandpass', f: 3000, q: 2 });
  },
  honk: (s) => {
    for (const [f, d] of [[340, 0], [356, 8]] as const) {
      tone(s, { type: 'sawtooth', f, f1: f * 0.94, glide: 0.32, dur: 0.32, a: 0.015, hold: 0.24, peak: 0.12, ft: 'bandpass', ff: 1100, q: 2.5, detune: d });
    }
    return tone(s, { type: 'square', f: 170, dur: 0.3, a: 0.015, hold: 0.22, peak: 0.05, ft: 'lowpass', ff: 700 });
  },
  juggle: (s) => {
    const n = [76, 79, 83, 79, 84];
    n.forEach((m, i) => tone(s, { type: 'triangle', f: mtof(m) * rand(0.98, 1.02), at: i * 0.12, dur: 0.1, peak: 0.1 }));
    return 0.7;
  },
  sizzle: (s) => {
    noise(s, { dur: 0.9, a: 0.04, hold: 0.6, peak: 0.12, ft: 'highpass', f: 3500, q: 0.6 });
    for (let i = 0; i < 14; i++) click(s, rand(0, 0.85), rand(3000, 7000), rand(0.04, 0.1));
    return 0.95;
  },
  serve: (s) => {
    bell(s, 2350, 0, 0.6, 0.1);
    tone(s, { type: 'triangle', f: mtof(76), at: 0.12, dur: 0.12, peak: 0.1 });
    return tone(s, { type: 'triangle', f: mtof(84), at: 0.24, dur: 0.3, peak: 0.12 });
  },
  eat: (s) => {
    for (let i = 0; i < 3; i++) {
      noise(s, { color: 'pink', at: i * 0.15, dur: 0.1, peak: 0.2, ft: 'lowpass', f: 900, q: 1.5 });
      tone(s, { f: 160, f1: 110, at: i * 0.15, dur: 0.07, peak: 0.08 });
    }
    return tone(s, { f: 420, f1: 140, at: 0.5, dur: 0.18, peak: 0.16 }); // gulp
  },
  pickLock: (s) => {
    for (let i = 0; i < 5; i++) {
      click(s, i * rand(0.07, 0.11), rand(3500, 6000), 0.09);
      tone(s, { f: rand(2800, 4200), at: i * 0.09, dur: 0.02, peak: 0.03 });
    }
    return 0.5;
  },
  unlock: (s) => {
    click(s, 0, 2200, 0.2);
    thump(s, 0.08, 300, 0.1, 0.08);
    tone(s, { f: mtof(84), at: 0.15, dur: 0.15, peak: 0.08 });
    return tone(s, { f: mtof(91), at: 0.23, dur: 0.35, peak: 0.1 });
  },
  pickpocket: (s) => {
    noise(s, { dur: 0.14, peak: 0.16, ft: 'bandpass', f: 1500, f1: 4000, q: 2 });
    [0, 0.05, 0.09].forEach((at) => bell(s, rand(3800, 5200), 0.1 + at, 0.18, 0.04));
    return 0.4;
  },
  denied: (s) => {
    tone(s, { type: 'square', f: 180, dur: 0.11, hold: 0.09, peak: 0.08, ft: 'lowpass', ff: 1200 });
    return tone(s, { type: 'square', f: 140, at: 0.14, dur: 0.18, hold: 0.15, peak: 0.08, ft: 'lowpass', ff: 1000 });
  },
  phase: (s) => {
    tone(s, { f: 1300, f1: 500, dur: 0.5, a: 0.05, peak: 0.1, vib: 30, vibHz: 9 });
    tone(s, { f: 1310, f1: 505, dur: 0.5, a: 0.05, peak: 0.08, vib: 30, vibHz: 7 });
    return noise(s, { dur: 0.55, a: 0.1, peak: 0.08, ft: 'bandpass', f: 4000, f1: 900, q: 4 });
  },
  boo: (s) => {
    tone(s, { type: 'triangle', f: 260, f1: 420, glide: 0.35, dur: 1.1, a: 0.12, hold: 0.7, peak: 0.2, ft: 'bandpass', ff: 700, q: 2, vib: 50, vibHz: 5 });
    tone(s, { f: 520, f1: 840, glide: 0.35, dur: 1.0, a: 0.15, hold: 0.6, peak: 0.05, vib: 50, vibHz: 5 });
    return noise(s, { color: 'pink', dur: 1.1, a: 0.2, peak: 0.08, ft: 'bandpass', f: 600, f1: 300, q: 3 });
  },
  zap: (s) => {
    let at = 0;
    while (at < 0.38) {
      const d = rand(0.012, 0.035);
      tone(s, { type: 'square', f: rand(180, 2200), at, dur: d, peak: rand(0.04, 0.09), a: 0.001 });
      at += d * rand(0.7, 1.4);
    }
    for (let i = 0; i < 8; i++) click(s, rand(0, 0.38), rand(4000, 8000), rand(0.08, 0.16));
    return noise(s, { dur: 0.4, peak: 0.08, ft: 'highpass', f: 2500 });
  },
  machineOn: (s) => {
    tone(s, { type: 'sawtooth', f: 55, f1: 220, dur: 0.7, a: 0.1, hold: 0.55, peak: 0.1, ft: 'lowpass', ff: 300, ff1: 2000, linGlide: true });
    tone(s, { type: 'square', f: 110, dur: 0.9, a: 0.4, peak: 0.03, ft: 'lowpass', ff: 600, at: 0.2 });
    tone(s, { f: 1760, at: 0.72, dur: 0.08, peak: 0.07 });
    return tone(s, { f: 2349, at: 0.82, dur: 0.14, peak: 0.07 });
  },
  suspicion: (s) => {
    tone(s, { type: 'triangle', f: 560, dur: 0.1, peak: 0.1 });
    return tone(s, { type: 'triangle', f: 640, f1: 980, at: 0.11, dur: 0.18, peak: 0.1 });
  },
  alert: (s) => {
    for (const at of [0, 0.11]) {
      tone(s, { type: 'square', f: 1046, at, dur: 0.09, peak: 0.07, ft: 'lowpass', ff: 3000 });
      tone(s, { type: 'square', f: 1568, at, dur: 0.09, peak: 0.05, ft: 'lowpass', ff: 3000 });
    }
    return 0.22;
  },
  caught: (s) => {
    tone(s, { f: 1400, f1: 300, dur: 0.55, peak: 0.13, vib: 40, vibHz: 8 }); // slide whistle down
    thump(s, 0.55, 220, 0.2, 0.1);
    return bell(s, 900, 0.56, 0.4, 0.08) + 0.2; // bonk
  },
  achievement: (s) => {
    const n = [79, 83, 86, 91];
    n.forEach((m, i) => bell(s, mtof(m), i * 0.09, 0.7, 0.11));
    [95, 98, 95, 98, 103].forEach((m, i) => tone(s, { type: 'triangle', f: mtof(m), at: 0.4 + i * 0.05, dur: 0.12, peak: 0.05 }));
    tone(s, { type: 'triangle', f: mtof(67), at: 0.36, dur: 0.9, a: 0.02, peak: 0.1 });
    return tone(s, { type: 'triangle', f: mtof(74), at: 0.36, dur: 0.9, a: 0.02, peak: 0.08 });
  },
  discover: (s) => {
    [72, 79, 86, 93].forEach((m, i) => bell(s, mtof(m), i * 0.14, 1.0, 0.08));
    tone(s, { type: 'triangle', f: mtof(60), dur: 1.4, a: 0.4, peak: 0.08, vib: 10, vibHz: 4 });
    return tone(s, { type: 'triangle', f: mtof(67), dur: 1.4, a: 0.5, peak: 0.06, vib: 10, vibHz: 4 });
  },
  cannon: (s) => {
    noise(s, { color: 'brown', dur: 0.8, peak: 0.42, ft: 'lowpass', f: 1200, f1: 120 });
    noise(s, { dur: 0.15, peak: 0.25, ft: 'lowpass', f: 5000 });
    tone(s, { f: 95, f1: 32, dur: 0.6, peak: 0.4 });
    return tone(s, { f: 600, f1: 2400, at: 0.25, dur: 0.6, a: 0.05, peak: 0.06 }) ;
  },
  laser: (s) => tone(s, { type: 'square', f: 1900, f1: 280, dur: 0.18, peak: 0.08, ft: 'lowpass', ff: 4000 }),
  cheer: (s) => crowd(s, 1.3, 0.22, true),
  gasp: (s) => {
    noise(s, { color: 'pink', dur: 0.35, a: 0.12, peak: 0.18, ft: 'bandpass', f: 700, f1: 1300, q: 3 });
    for (let i = 0; i < 4; i++) {
      const f = rand(260, 420);
      tone(s, { type: 'triangle', f, f1: f * 0.8, at: 0.2 + rand(0, 0.05), dur: 0.5, a: 0.06, peak: 0.05, ft: 'bandpass', ff: 700, q: 2 });
    }
    return 0.75;
  },
  scream: (s) => {
    tone(s, { type: 'sawtooth', f: 620, f1: 1450, glide: 0.08, dur: 0.42, a: 0.01, hold: 0.25, peak: 0.12, ft: 'bandpass', ff: 1500, q: 2, vib: 80, vibHz: 11 });
    return tone(s, { type: 'triangle', f: 1240, f1: 2200, glide: 0.08, dur: 0.4, peak: 0.05, vib: 80, vibHz: 11 });
  },
  clap: (s) => {
    for (let i = 0; i < 28; i++) {
      noise(s, { at: rand(0, 1.1), dur: 0.035, peak: rand(0.05, 0.12), ft: 'bandpass', f: rand(900, 2000), q: 1.4, a: 0.001 });
    }
    return 1.2;
  },
  proclaim: (s) => {
    brassNote(s, mtof(72), 0, 0.12, 0.13);
    brassNote(s, mtof(72), 0.15, 0.12, 0.13);
    brassNote(s, mtof(79), 0.3, 0.55, 0.15);
    brassNote(s, mtof(76), 0.3, 0.55, 0.08);
    return 0.9;
  },
  lever: (s) => {
    for (let i = 0; i < 4; i++) click(s, i * 0.05, 1800 + i * 200, 0.12);
    return thump(s, 0.22, 180, 0.22, 0.12);
  },
  plate: (s) => {
    click(s, 0, 1200, 0.14);
    thump(s, 0.02, 160, 0.18, 0.12);
    return bell(s, mtof(88), 0.08, 0.35, 0.05);
  },
  splash: (s) => {
    noise(s, { dur: 0.6, peak: 0.28, ft: 'lowpass', f: 4000, f1: 400, q: 0.8 });
    for (let i = 0; i < 8; i++) {
      const f = rand(700, 1600);
      tone(s, { f, f1: f * 1.8, at: rand(0.08, 0.6), dur: 0.05, peak: 0.06 });
    }
    return 0.75;
  },
  trainHorn: (s) => {
    for (const f of [311, 370, 466]) {
      tone(s, { type: 'sawtooth', f, dur: 1.3, a: 0.12, hold: 1.0, peak: 0.06, ft: 'lowpass', ff: 1100, q: 0.8 });
    }
    return 1.35;
  },
  chime: (s) => {
    bell(s, mtof(76), 0, 1.0, 0.1);
    bell(s, mtof(72), 0.38, 1.0, 0.1);
    return bell(s, mtof(67), 0.76, 1.3, 0.1) + 0.76;
  },
};

// ---------------------------------------------------------------- footsteps

type StepFn = (s: Voice) => number;

export const FOOTSTEPS: Record<CharacterKind, StepFn> = {
  alien: (s) => tone(s, { f: rand(850, 1050), f1: 1300, dur: 0.035, peak: 0.05 }),
  strongman: (s) => {
    thump(s, 0, 75, 0.34, 0.22);
    return noise(s, { at: 0.01, dur: 0.12, peak: 0.08, ft: 'lowpass', f: 1500 });
  },
  police: (s) => {
    click(s, 0, 1600, 0.12);
    return thump(s, 0, 180, 0.08, 0.06);
  },
  clown: (s) => {
    thump(s, 0, 160, 0.08, 0.07);
    const f = rand(1100, 1300);
    return tone(s, { f, f1: f * 1.6, at: 0.02, dur: 0.09, peak: 0.07, vib: 80, vibHz: 30 });
  },
  chef: (s) => {
    thump(s, 0, 130, 0.12, 0.1);
    return noise(s, { color: 'pink', dur: 0.07, peak: 0.05, ft: 'lowpass', f: 800 });
  },
  thief: (s) => noise(s, { dur: 0.04, peak: 0.025, ft: 'bandpass', f: 2500, q: 2 }),
  singer: (s) => {
    click(s, 0, 3200, 0.12);
    return tone(s, { type: 'square', f: 2400, dur: 0.015, peak: 0.025 });
  },
  ghost: (s) => noise(s, { dur: 0.3, a: 0.12, peak: 0.02, ft: 'bandpass', f: 900, f1: 500, q: 3 }),
  scientist: (s) => {
    click(s, 0, 1300, 0.08);
    return thump(s, 0, 170, 0.07, 0.06);
  },
  mayor: (s) => {
    thump(s, 0, 110, 0.16, 0.12);
    return tone(s, { type: 'sawtooth', f: 260, f1: 200, at: 0.04, dur: 0.06, peak: 0.02, ft: 'bandpass', ff: 1200, q: 4 });
  },
  civilian: (s) => {
    click(s, 0, rand(900, 1300), 0.06);
    return thump(s, 0, 150, 0.06, 0.06);
  },
};

// ---------------------------------------------------------------- voices

interface Timbre {
  type: OscillatorType;
  base: number;
  formant: number;
  rate: number;
  peak: number;
  vib?: number;
  slide?: number;
  breath?: number;
}

const TIMBRES: Record<CharacterKind, Timbre> = {
  alien: { type: 'sine', base: 640, formant: 2400, rate: 0.065, peak: 0.12, vib: 120, slide: 1.25 },
  strongman: { type: 'sawtooth', base: 92, formant: 620, rate: 0.12, peak: 0.12 },
  police: { type: 'square', base: 190, formant: 1100, rate: 0.085, peak: 0.07 },
  clown: { type: 'square', base: 300, formant: 1600, rate: 0.08, peak: 0.06, slide: 1.35 },
  chef: { type: 'triangle', base: 170, formant: 900, rate: 0.1, peak: 0.14 },
  thief: { type: 'sawtooth', base: 210, formant: 1400, rate: 0.07, peak: 0.05 },
  singer: { type: 'triangle', base: 330, formant: 1300, rate: 0.11, peak: 0.13, vib: 35 },
  ghost: { type: 'sine', base: 260, formant: 800, rate: 0.16, peak: 0.12, vib: 50, slide: 0.85, breath: 0.05 },
  scientist: { type: 'square', base: 240, formant: 2000, rate: 0.065, peak: 0.06 },
  mayor: { type: 'sawtooth', base: 128, formant: 760, rate: 0.13, peak: 0.1, vib: 25 },
  civilian: { type: 'triangle', base: 220, formant: 1200, rate: 0.09, peak: 0.12 },
};

const INTERVALS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3];

/** Gibberish blip-speech; returns length in seconds. */
export function voiceBlips(s: Voice, kind: CharacterKind, syllables: number, pitch: number): number {
  const tb = TIMBRES[kind] ?? TIMBRES.civilian;
  const n = Math.max(1, Math.min(24, Math.round(syllables)));
  const question = Math.random() < 0.3;
  let at = 0;
  for (let i = 0; i < n; i++) {
    const contour = i === n - 1 ? (question ? 1.25 : 0.88) : 1;
    const f = tb.base * pitch * pick(INTERVALS) * contour;
    const d = tb.rate * rand(0.75, 1.2);
    const vs = sub(s, at);
    tone(vs, {
      type: tb.type, f, f1: tb.slide ? f * tb.slide : f * rand(0.96, 1.04), dur: d, a: 0.008,
      peak: tb.peak * rand(0.8, 1), ft: 'bandpass', ff: tb.formant * rand(0.8, 1.25), q: 1.4,
      vib: tb.vib, vibHz: 9,
    });
    if (tb.breath) noise(vs, { dur: d, peak: tb.breath, ft: 'bandpass', f: 900, q: 3 });
    at += d + tb.rate * rand(0.15, 0.6);
  }
  return at;
}
