import type { TrackDef } from '../Track';

/** Inside the glasshouse: fern terraces with hairpins, a seed-tray slalom, sprinkler puddles and the Watering Can Leap. */
export const GREENHOUSE: TrackDef = {
  id: 'greenhouse',
  name: 'The Greenhouse',
  blurb: 'Warm mist under glass. Fern terraces, a seed-tray slalom and sprinkler puddles.',
  points: [[0, 0], [0, -50], [0, -95], [40, -145], [110, -160], [165, -125], [160, -70], [110, -40], [80, 10], [110, 60], [175, 50], [225, 10], [262, 40], [262, 100], [195, 140], [120, 150], [60, 175], [0, 165], [0, 85]],
  laps: 3,
  slope: [[0, 0], [44, 0], [58, 7], [260, 7], [300, 6], [420, 7], [540, 7], [700, 6.5], [801, 6.5], [827, 18], [851, 19], [857, 6], [901, 6.5], [1021, 4], [1115, 1]],
  halfWidth: [[0, 9.5], [80, 10.5], [240, 11], [270, 12], [400, 12], [430, 10.5], [1230, 10.5]],
  bankGain: [[0, 8], [70, 14], [240, 16], [410, 16], [430, 12], [540, 12], [560, 14], [690, 18], [781, 18], [811, 15], [881, 15], [1091, 6], [1230, 6]],
  berm: [[0, 1.4], [80, 2.4], [240, 3], [410, 3], [430, 2.2], [690, 3.6], [781, 3.6], [811, 2.6], [881, 2.6], [1091, 2], [1230, 2]],
  startS: 42,
  launchS: 1115,
  landS: 18,
  sections: [
    { name: 'Potting Bench', s0: 0, s1: 70 },
    { name: 'Fern Terraces', s0: 70, s1: 430 },
    { name: 'Seed-Tray Slalom', s0: 430, s1: 540 },
    { name: 'Sprinkler Causeway', s0: 540, s1: 700 },
    { name: 'Orchid Sweep', s0: 700, s1: 816 },
    { name: 'Watering Can Leap', s0: 816, s1: 901 },
    { name: 'Hothouse Run', s0: 901, s1: 1230 },
  ],
  checkpoints: [100, 230, 360, 480, 620, 741, 861, 1001],
  theme: {
    skyTop: 0xa8dccf,
    skyHorizon: 0xf3f0cf,
    skyGround: 0x7aa070,
    fog: 0xdcefd8,
    hemiSky: 0xeaffef,
    hemiGround: 0x6aa060,
    hemiIntensity: 1.15,
    sunColor: 0xfff0c4,
    sunIntensity: 2.6,
    verge: 0x3f9a4a,
    farA: 0x4fa458,
    farB: 0x3a8a48,
    grassTints: [0x5fbf5a, 0x4aa850, 0x7ad06a, 0x3f9a46, 0x6ac460],
    flora: 'garden',
    weather: 'dust',
    glasshouse: true,
  },
  landmarks: [
    { kind: 'pot', s: 30, d: 20 },
    { kind: 'can', s: 120, d: -24 },
    { kind: 'pot', s: 280, d: 40 },
    { kind: 'potTipped', s: 420, d: -26 },
    { kind: 'trowel', s: 560, d: 24 },
    { kind: 'pot', s: 700, d: -30 },
    { kind: 'can', s: 841, d: 22 },
    { kind: 'pot', s: 981, d: -24 },
    { kind: 'rake', s: 1081, d: 24 },
  ],
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 70) return ad < 5.5 ? 'wood' : 'grass';
    if (s < 430) return ad < 4.5 ? 'dirt' : 'grass';
    if (s < 540) return ad < 3.6 ? 'stone' : 'dirt';
    if (s < 700) return ad < 4 ? 'stone' : 'grass';
    if (s < 901) return ad < 5 ? 'leaves' : 'grass';
    return ad < 4 ? 'stone' : 'grass';
  },
  build(b) {
    b.itemRow(130, 470, 741, 1041);
    // Fern Terraces: a long sweeping U-turn down the shelving, pads on the exits.
    b.pad(230, 0);
    b.pad(350, -2);
    b.critter('beetle', 200, 0.3);
    b.add('mushroom', 300, 8, 1.1, 1.25, 2);

    // Seed-Tray Slalom: seedling pebbles either side of a stone line.
    b.add('pebble', 455, -4.2, 0.9, 0.5, 2);
    b.gate(448, 462, -1.6, 6);
    b.add('pebble', 505, 4.2, 0.9, 0.5, 2);
    b.gate(498, 512, -6, 1.6);
    b.critter('ants', 480, 0.4, 10);

    // Sprinkler Causeway: puddles either side of a stone causeway, pads either end.
    b.basin(560, 584, -11, -3, 0.5);
    b.basin(594, 618, 3, 11, 0.5);
    b.pad(545, 0);
    b.pad(630, 0);
    b.critter('pillbug', 660, 0.5);

    // Orchid Sweep.
    b.padChain(751, 2, 28, 0, 0);
    b.critter('grasshopper', 791, 0.3);

    // Watering Can Leap.
    b.pad(807, 0, 9, 2);
    b.jump(831, 849, 4.0);
    b.basin(853, 885, -15, 15, 1.1);

    // Hothouse Run: puddle chicane and pads down to the Boing Mushroom.
    b.basin(961, 986, 1.5, 10, 0.45);
    b.basin(1011, 1036, -10, -1.5, 0.45);
    b.add('mushroom', 1071, -6.5, 1.0, 1.25, 2);
    b.pad(1091, 0);
  },
};
