import type { TrackDef } from '../Track';

/** The all-rounder: a long wet-leaf sweeper, the Big Drop, a root-maze S-bend. */
export const BACKYARD: TrackDef = {
  id: 'backyard',
  name: 'The Backyard',
  blurb: 'Wet leaves, the Big Drop and a root maze. The classic.',
  points: [[0, 0], [0, -50], [0, -90], [25, -135], [85, -150], [140, -120], [165, -60], [165, -25], [165, 10], [165, 45], [165, 80], [165, 115], [150, 165], [115, 200], [85, 240], [50, 265], [15, 262], [0, 230], [0, 150], [0, 75]],
  laps: 3,
  slope: [[0, 0], [44, 0], [58, 6], [150, 7.5], [250, 8], [340, 6.5], [362, 5], [376, 23], [418, 25], [426, 9], [446, 9], [466, 15], [500, 7], [560, 5], [650, 4], [720, 3], [800, 2], [893, 1]],
  halfWidth: [[0, 9.5], [360, 10], [480, 10], [500, 11.5], [800, 11.5], [820, 10], [1008, 10]],
  bankGain: [[0, 8], [70, 13], [350, 13], [500, 15], [800, 16], [820, 6], [1008, 6]],
  berm: [[0, 1.4], [70, 2.6], [360, 2.2], [500, 3], [800, 3.4], [820, 2], [1008, 2]],
  startS: 42,
  launchS: 893,
  landS: 18,
  sections: [
    { name: 'Starting Plateau', s0: 0, s1: 70 },
    { name: 'Leaf Slide', s0: 70, s1: 360 },
    { name: 'The Big Drop', s0: 360, s1: 500 },
    { name: 'Root Maze', s0: 500, s1: 650 },
    { name: 'Hedgehog Hairpin', s0: 650, s1: 810 },
    { name: 'Boing Bottom', s0: 810, s1: 1008 },
  ],
  checkpoints: [90, 210, 340, 480, 600, 720, 840],
  theme: {
    skyTop: 0x3d9bf2,
    skyHorizon: 0xd8f3ff,
    skyGround: 0x9bd67a,
    fog: 0xcfeefd,
    hemiSky: 0xdff3ff,
    hemiGround: 0x7fb054,
    hemiIntensity: 1.05,
    sunColor: 0xfff0d0,
    sunIntensity: 2.5,
    verge: 0x4c9a36,
    farA: 0x5fae3c,
    farB: 0x3f8a34,
    grassTints: [0x9bd65a, 0x7cc64a, 0xb3e06a, 0x62b446, 0x8fd060],
    flora: 'garden',
  },
  landmarks: [
    { kind: 'can', s: 30, d: -48 },
    { kind: 'trunk', s: 250, d: -70 },
    { kind: 'trowel', s: 380, d: 44 },
    { kind: 'pot', s: 470, d: -46 },
    { kind: 'hose', s: 560, d: 34, s1: 760 },
    { kind: 'potTipped', s: 700, d: -46 },
    { kind: 'rake', s: 860, d: 36 },
  ],
  fence: { side: -1, s0: 90, s1: 330 },
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 70) return ad < 5.5 + Math.sin(s * 0.2) * 0.8 ? 'dirt' : 'grass';
    if (s < 362) return 'leaves';
    if (s < 446) return 'stone';
    if (s < 810) return ad < 4 ? 'dirt' : 'grass';
    return 'stone';
  },
  build(b) {
    b.itemRow(130, 300, 590, 830);
    // Leaf Slide: leaf-bridge shortcut on the inside of the long right-hander.
    b.leafBridge(205, 285, 1);
    b.add('pebble', 110, -5.5, 1.0, 0.5, 2);
    b.add('mushroom', 170, -7.6, 1.1, 1.25, 2);
    b.add('pebble', 240, -3.5, 0.9, 0.5, 1.8);
    b.add('mushroom', 320, 6.8, 1.0, 1.25, 2);
    b.padChain(100, 2, 26, 3, 0);
    b.pad(330, -3);
    b.critter('ants', 150, 0, 12);
    b.critter('grasshopper', 300, 0.7);

    // The Big Drop: plunge, then the kicker.
    b.jump(446, 466, 3.6);
    b.add('pebble', 384, -6.5, 1.1, 0.5, 2.2);
    b.add('pebble', 396, 6.6, 1.0, 0.5, 2);
    b.pad(368, 0, 9, 2);

    // Root Maze: roots reach across from alternate sides; thread the gaps.
    b.root(520, -12.5, -4.2, 0.7, 3);
    b.gate(512, 528, -0.6, 10);
    b.root(568, 12.5, 4.2, 0.7, -3);
    b.gate(560, 576, -10, 0.6);
    b.root(616, -12.5, -4.2, 0.7, 3);
    b.gate(608, 624, -0.6, 10);
    b.patch(585, 610, -10, -3, 'mud', true);
    b.add('mushroom', 545, -7.5, 1.0, 1.25, 2);
    b.add('stump', 640, -6.5, 1.5, 0.4, 2.6, 2);
    b.critter('pillbug', 595, 0.3);
    b.pad(590, 5);

    // Hedgehog Hairpin: the banked hairpin at the bottom.
    b.patch(690, 760, 4, 11, 'leaves', true);
    b.add('pebble', 700, -7, 1.0, 0.5, 2);
    b.critter('ants', 780, 0.5, 10);

    // Boing Bottom: pad chain into the launcher.
    b.padChain(815, 3, 22, 0, 4);
    b.add('mushroom', 850, 7.2, 1.0, 1.25, 2);
    b.add('pebble', 865, -7.0, 0.9, 0.5, 2);
  },
};
