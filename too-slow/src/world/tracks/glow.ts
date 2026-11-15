import type { TrackDef } from '../Track';

/** Night in the mushroom wood: glowing caps light the way, an S-bend hollow, the Moon Jump and a gully of glow-worms. */
export const GLOW: TrackDef = {
  id: 'glow',
  name: 'Glow Grove',
  blurb: 'Midnight among glowing mushrooms. S-bends, the Moon Jump and glow-worms.',
  points: [[0, 0], [0, -50], [0, -90], [-40, -140], [-110, -155], [-165, -115], [-175, -50], [-135, 0], [-95, 35], [-95, 85], [-135, 125], [-125, 185], [-65, 220], [0, 200], [0, 140], [0, 75]],
  laps: 3,
  slope: [[0, 0], [44, 0], [58, 6], [200, 7], [360, 6.5], [380, 5.5], [470, 7.5], [560, 6], [572, 20], [600, 22], [606, 6], [640, 5], [700, 6.5], [760, 6], [882, 1]],
  halfWidth: [[0, 9.5], [80, 10.5], [360, 10.5], [380, 10], [530, 10], [560, 11], [660, 11], [700, 10.5], [997, 10.5]],
  bankGain: [[0, 8], [70, 13], [280, 15], [360, 15], [380, 15], [540, 15], [560, 8], [640, 17], [740, 17], [860, 14], [870, 6], [997, 6]],
  berm: [[0, 1.4], [80, 2.2], [280, 2.8], [360, 2.8], [380, 2.8], [540, 2.8], [560, 2], [640, 3.4], [740, 3.4], [860, 2.6], [870, 2], [997, 2]],
  startS: 42,
  launchS: 882,
  landS: 18,
  sections: [
    { name: 'Moonlit Ridge', s0: 0, s1: 70 },
    { name: 'Glowshroom Wood', s0: 70, s1: 365 },
    { name: 'Firefly Hollow', s0: 365, s1: 545 },
    { name: 'Moon Jump', s0: 545, s1: 655 },
    { name: 'Glow-worm Gully', s0: 655, s1: 800 },
    { name: 'Starlight Run', s0: 800, s1: 997 },
  ],
  checkpoints: [90, 200, 330, 450, 560, 680, 800],
  theme: {
    skyTop: 0x070b26,
    skyHorizon: 0x2c2f72,
    skyGround: 0x1a2440,
    fog: 0x1b2150,
    hemiSky: 0x7f8cff,
    hemiGround: 0x1e3a3a,
    hemiIntensity: 0.85,
    sunColor: 0xa8c0ff,
    sunIntensity: 1.25,
    verge: 0x1f5a4a,
    farA: 0x245a4c,
    farB: 0x173f3c,
    grassTints: [0x3f8a78, 0x2f7a6a, 0x4f9a86, 0x2a6a5e, 0x3a8a70],
    flora: 'glow',
    fireflies: true,
    bloom: true,
  },
  landmarks: [
    { kind: 'lantern', s: 40, d: 18 },
    { kind: 'lantern', s: 140, d: 20 },
    { kind: 'trunk', s: 250, d: 66 },
    { kind: 'lantern', s: 400, d: -20 },
    { kind: 'pot', s: 520, d: -48 },
    { kind: 'lantern', s: 640, d: 20 },
    { kind: 'trunk', s: 720, d: -64 },
    { kind: 'lantern', s: 860, d: 18 },
  ],
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 70) return ad < 5.5 ? 'dirt' : 'grass';
    if (s < 365) return ad < 4.5 ? 'leaves' : 'grass';
    if (s < 545) return ad < 3.4 ? 'stone' : 'mud';
    if (s < 655) return 'grass';
    if (s < 800) return ad < 5 ? 'dirt' : 'grass';
    return ad < 4 ? 'stone' : 'grass';
  },
  build(b) {
    b.itemRow(120, 400, 640, 845);
    // Glowshroom Wood: a long left-hander lined with mushrooms, one in the middle to pick a side of.
    b.add('mushroom', 150, -6.6, 1.1, 1.25, 2);
    b.add('mushroom', 205, 6.4, 1.0, 1.25, 2);
    b.add('mushroom', 280, 0, 1.2, 1.25, 2.4);
    b.gate(268, 292, 2.6, 8.5);
    b.padChain(170, 3, 26, -2.5, 0);
    b.add('pebble', 330, 6.2, 0.9, 0.5, 1.8);
    b.critter('beetle', 240, 0.4);

    // Firefly Hollow: S-bends on a stone ribbon with mud either side, two roots to thread.
    b.root(410, -14, -2.6, 0.75, 4);
    b.gate(402, 418, -0.6, 2.6);
    b.root(470, 14, 2.6, 0.75, -4);
    b.gate(462, 478, -2.6, 0.6);
    b.pad(440, 0);
    b.pad(505, 0);
    b.critter('ants', 495, 0.6, 10);

    // Moon Jump: a dash pad, the ramp, and a moon-pool to clear.
    b.pad(560, 0, 9, 2);
    b.jump(586, 604, 4.0);
    b.basin(610, 642, -15, 15, 1.1);

    // Glow-worm Gully: a fast banked right-hander with pads and bugs.
    b.padChain(730, 2, 28, 2, 0);
    b.critter('pillbug', 720, 0.5);
    b.add('mushroom', 745, -6.5, 1.0, 1.25, 2);
    b.add('pebble', 765, 6.2, 1.0, 0.5, 2);
    b.critter('grasshopper', 780, 0.2);

    // Starlight Run down to the Boing Mushroom.
    b.pad(835, -3.5);
    b.pad(858, 3.5);
  },
};
