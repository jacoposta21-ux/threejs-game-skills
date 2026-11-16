import type { TrackDef } from '../Track';

/** Dusk by the water: two lily-pad shortcuts, the Frog Leap over the pond, a stepping-stone ribbon. */
export const POND: TrackDef = {
  id: 'pond',
  name: 'Lily Pond',
  blurb: 'Dusk and fireflies. Lily shortcuts, stepping stones and the Frog Leap.',
  points: [[0, 0], [0, -50], [0, -90], [30, -135], [100, -150], [175, -125], [215, -60], [215, -25], [215, 10], [215, 45], [215, 80], [190, 135], [150, 175], [95, 215], [35, 225], [0, 180], [0, 120], [0, 60]],
  laps: 3,
  slope: [[0, 0], [44, 0], [58, 6], [200, 7.5], [380, 7], [400, 6], [412, 21], [444, 23], [450, 9], [470, 9], [500, 12], [522, 8], [600, 5], [680, 6], [800, 4], [887, 1]],
  halfWidth: [[0, 9.5], [80, 10.5], [400, 10.5], [520, 10], [530, 11], [660, 11], [700, 10.5], [1002, 10.5]],
  bankGain: [[0, 8], [70, 13], [390, 13], [500, 16], [850, 16], [870, 6], [1002, 6]],
  berm: [[0, 1.4], [80, 2.2], [400, 2.2], [520, 2.8], [850, 2.8], [870, 2], [1002, 2]],
  startS: 42,
  launchS: 887,
  landS: 18,
  sections: [
    { name: 'Reed Bank', s0: 0, s1: 70 },
    { name: 'Lily Bend', s0: 70, s1: 400 },
    { name: 'Frog Leap', s0: 400, s1: 525 },
    { name: 'Stepping Stones', s0: 525, s1: 670 },
    { name: 'Firefly Run', s0: 670, s1: 1002 },
  ],
  checkpoints: [90, 200, 330, 520, 640, 760, 860],
  theme: {
    skyTop: 0x3a3f9a,
    skyHorizon: 0xffb08a,
    skyGround: 0x4a6a5a,
    fog: 0xe6aa9e,
    hemiSky: 0xcbbcff,
    hemiGround: 0x3f6a50,
    hemiIntensity: 1.0,
    sunColor: 0xffb070,
    sunIntensity: 2.3,
    verge: 0x3c8a4a,
    farA: 0x4a9a58,
    farB: 0x2f7a4a,
    grassTints: [0x6fc68a, 0x58b47a, 0x8fd6a0, 0x4aa46a, 0x7ac890],
    flora: 'pond',
    fireflies: true,
  },
  landmarks: [
    { kind: 'lantern', s: 40, d: 18 },
    { kind: 'trunk', s: 160, d: -70 },
    { kind: 'pot', s: 330, d: -46 },
    { kind: 'lantern', s: 470, d: -20 },
    { kind: 'trunk', s: 600, d: 66 },
    { kind: 'can', s: 720, d: -50 },
    { kind: 'lantern', s: 860, d: 18 },
  ],
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 70) return ad < 5.5 ? 'dirt' : 'grass';
    if (s < 412) return 'grass';
    if (s < 525) return 'stone';
    if (s < 670) return ad < 3.2 ? 'stone' : 'mud';
    return ad < 4 ? 'stone' : 'grass';
  },
  build(b) {
    b.itemRow(130, 395, 615, 850);
    // Lily Bend: two lily-pad shortcuts on the inside of the long right-hander.
    b.leafBridge(150, 220, 1);
    b.leafBridge(290, 360, 1);
    b.add('pebble', 120, -6.4, 0.9, 0.5, 1.8);
    b.add('mushroom', 250, -7.4, 1.1, 1.25, 2);
    b.pad(240, -3);
    b.critter('grasshopper', 200, 0.2);

    // Frog Leap: plunge, kicker, and the pond to clear on the far side.
    b.jump(450, 470, 4.0);
    b.basin(474, 506, -15, 15, 1.1);
    b.pad(415, 0, 9, 2);

    // Stepping Stones: a fast stone ribbon down the middle, mud either side, two root tips to thread.
    b.root(560, -14, -2.6, 0.75, 4);
    b.gate(552, 566, -0.6, 2.6);
    b.root(608, 14, 2.6, 0.75, -4);
    b.gate(600, 614, -2.6, 0.6);
    b.gate(530, 668, -2.6, 2.6);
    b.pad(640, 0);
    b.critter('ants', 590, 0.6, 10);

    // Firefly Run: banked right-hander, pads, a puddle chicane on the approach.
    b.padChain(690, 3, 28, 3, 0);
    b.add('mushroom', 720, -6.5, 1.0, 1.25, 2);
    b.add('pebble', 780, 6.2, 1.0, 0.5, 2);
    b.critter('pillbug', 770, 0.5);
    b.basin(832, 850, 2.5, 10, 0.45);
    b.pad(838, -4.5);
    b.pad(862, 0);
  },
};
