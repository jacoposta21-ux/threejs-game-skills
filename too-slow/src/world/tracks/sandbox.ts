import type { TrackDef } from '../Track';

/** Hot afternoon in the sandpit: stay on the packed groove, the loose sand eats your speed. */
export const SANDBOX: TrackDef = {
  id: 'sandbox',
  name: 'Sandbox Canyon',
  blurb: 'Stay in the packed groove, loose sand bites. Cactus zigzag and the Spade Ramp.',
  points: [[0, 0], [0, -50], [0, -90], [25, -125], [85, -135], [140, -110], [150, -60], [85, -35], [85, 0], [85, 40], [85, 80], [85, 115], [130, 135], [180, 140], [205, 180], [175, 225], [110, 235], [50, 240], [0, 195], [0, 130], [0, 60]],
  laps: 3,
  slope: [[0, 0], [44, 0], [58, 7], [200, 8], [340, 7], [390, 6], [400, 22], [420, 24], [424, 9], [442, 9], [460, 14], [500, 6], [600, 5], [760, 5], [900, 3], [1015, 1]],
  halfWidth: [[0, 9.5], [80, 10], [340, 10], [360, 8.5], [390, 8.5], [400, 10], [500, 10], [510, 8.5], [600, 8.5], [620, 10.5], [1130, 10.5]],
  bankGain: [[0, 8], [70, 14], [340, 14], [350, 9], [600, 9], [620, 14], [960, 14], [980, 6], [1130, 6]],
  berm: [[0, 2], [70, 4.2], [340, 4.2], [350, 3], [600, 3], [620, 4.5], [960, 4.5], [980, 2.5], [1130, 2.5]],
  startS: 42,
  launchS: 1015,
  landS: 18,
  sections: [
    { name: 'Bucket Top', s0: 0, s1: 70 },
    { name: 'Dune Drift', s0: 70, s1: 340 },
    { name: 'Spade Ramp', s0: 340, s1: 500 },
    { name: 'Cactus Zigzag', s0: 500, s1: 610 },
    { name: 'Castle Run', s0: 610, s1: 1130 },
  ],
  checkpoints: [100, 230, 370, 520, 660, 800, 940],
  theme: {
    skyTop: 0x2f8fe0,
    skyHorizon: 0xffe9c0,
    skyGround: 0xe0c487,
    fog: 0xfbe6c4,
    hemiSky: 0xfff3dc,
    hemiGround: 0xc9a46a,
    hemiIntensity: 1.1,
    sunColor: 0xfff0c8,
    sunIntensity: 2.8,
    verge: 0xd8bb7c,
    farA: 0xe2c78c,
    farB: 0xc9a86a,
    grassTints: [0xc9c26a, 0xb0b45a, 0xd8cf7a],
    flora: 'sand',
    weather: 'dust',
  },
  landmarks: [
    { kind: 'bucket', s: 50, d: -40 },
    { kind: 'spade', s: 380, d: 36 },
    { kind: 'bucket', s: 640, d: 44 },
    { kind: 'spade', s: 820, d: -38 },
    { kind: 'bucket', s: 980, d: -42 },
  ],
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 70) return ad < 6 ? 'packed' : 'sand';
    if (s >= 424 && s < 442) return 'wood';
    // A packed groove that wanders across the course; everything else is loose sand.
    const groove = Math.sin(s * 0.021) * 3.2;
    return Math.abs(ad - Math.abs(groove)) < 5.2 || ad < 3.5 ? 'packed' : 'sand';
  },
  build(b) {
    b.itemRow(120, 395, 640, 990);
    // Dune Drift: high banked berms, pads at the apexes.
    b.pad(150, 3);
    b.pad(230, 3.5);
    b.pad(300, 2.5);
    b.critter('ants', 190, 0, 14);
    b.add('cactus', 260, -8.2, 0.9, 0.7, 2, 2.4);

    // Spade Ramp.
    b.jump(424, 442, 3.4, 'wood');
    b.pad(405, 0, 9, 2);

    // Cactus Zigzag: tight left with cacti on the apexes and outside.
    b.add('cactus', 520, -5.5, 0.9, 0.7, 2, 2.4);
    b.add('cactus', 545, 6.0, 0.9, 0.7, 2, 2.4);
    b.add('cactus', 575, -6.2, 0.9, 0.7, 2, 2.4);
    b.add('pebble', 595, 5, 1.0, 0.5, 2);
    b.critter('beetle', 560, 0.4);

    // Castle Run: long banked sweepers, a moat, pad chains.
    b.padChain(640, 3, 30, 2.5, 0);
    b.basin(700, 740, -10, -2.5, 0.5);
    b.critter('ants', 730, 1.3, 12);
    b.add('cactus', 790, 7.5, 0.9, 0.7, 2, 2.4);
    b.padChain(830, 2, 34, -3, 0);
    b.critter('pillbug', 900, 0.9);
    b.add('pebble', 940, -6.5, 1.0, 0.5, 2);
    b.padChain(975, 2, 18, 0, 4);
  },
};
