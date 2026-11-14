import type { TrackDef } from '../Track';

/** Technical dusk course: two lily-pad shortcuts, stepping stones and a leap over the pond. */
export const POND: TrackDef = {
  id: 'pond',
  name: 'Lily Pond',
  blurb: 'Dusk by the water. Two lily shortcuts, stepping stones and the Frog Leap.',
  layout: [
    [140, 0], // 1 · Reed Bank                0 –  140
    [130, 85], // 2 · Lily Bend             140 –  510
    [40, 0],
    [140, -100],
    [60, 0],
    [120, 70], // 3 · Stepping Stones       510 –  680
    [50, 0],
    [260, 0], // 4 · Frog Leap              680 –  940
    [150, -75], // 5 · Firefly Run          940 – 1640
    [30, 0],
    [120, 90],
    [40, 0],
    [110, -60],
    [250, 0],
  ],
  slope: [
    [0, 0],
    [20, 0],
    [44, 7],
    [140, 8.5],
    [310, 8],
    [450, 7.5],
    [510, 5],
    [600, 4.5],
    [680, 3],
    [715, 3],
    [735, 22],
    [745, 27],
    [788, 27],
    [802, 12],
    [830, 12],
    [838, 21],
    [905, 19],
    [950, 6],
    [1300, 5.5],
    [1420, 4],
    [1500, 2.5],
    [1560, 1],
    [1600, 0],
    [1640, -4],
  ],
  halfWidth: [
    [0, 9],
    [140, 10],
    [510, 11],
    [680, 9],
    [830, 9.5],
    [845, 13],
    [930, 12],
    [960, 9.5],
    [1390, 9.5],
    [1430, 10.5],
    [1640, 10.5],
  ],
  bankGain: [
    [0, 7],
    [930, 7],
    [955, 18],
    [1390, 18],
    [1420, 4],
  ],
  berm: [
    [0, 1.0],
    [120, 1.9],
    [680, 2.0],
    [830, 2.2],
    [840, 2.8],
    [935, 2.6],
    [955, 3.2],
    [1390, 3.2],
    [1420, 2.0],
    [1640, 2.0],
  ],
  startS: 22,
  gridS: 14,
  finishS: 1560,
  sections: [
    { name: 'Reed Bank', s0: 0, s1: 140 },
    { name: 'Lily Bend', s0: 140, s1: 510 },
    { name: 'Stepping Stones', s0: 510, s1: 680 },
    { name: 'Frog Leap', s0: 680, s1: 940 },
    { name: 'Firefly Run', s0: 940, s1: 1640 },
  ],
  checkpoints: [140, 310, 510, 690, 945, 1120, 1280, 1420],
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
    fireflies: true,
  },
  landmarks: [
    { kind: 'trunk', s: 60, d: -56 },
    { kind: 'pot', s: 230, d: -46 },
    { kind: 'trunk', s: 560, d: 54 },
    { kind: 'trunk', s: 640, d: -52 },
    { kind: 'can', s: 720, d: -54 },
    { kind: 'hose', s: 700, d: 27, s1: 960 },
    { kind: 'potTipped', s: 1030, d: 48 },
    { kind: 'trunk', s: 1320, d: 54 },
    { kind: 'rake', s: 1500, d: 36 },
  ],
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 140) return ad < 5.5 ? 'dirt' : 'grass';
    if (s < 510) return 'grass';
    if (s < 680) return ad < 3.2 ? 'stone' : 'mud';
    if (s < 800) return 'stone';
    if (s < 940) return 'grass';
    if (s < 1395) return 'leaves';
    return ad < 3.6 ? 'stone' : 'grass';
  },
  build(b) {
    b.itemRow(160, 470, 694, 960, 1300);
    // 1 · Reed Bank
    b.add('mushroom', 98, 7, 1.0, 1.25, 2);
    b.add('pebble', 124, -6.4, 0.9, 0.5, 1.8);
    b.pad(110, -2);

    // 2 · Lily Bend: right-hander, then the first lily shortcut inside the big left-hander.
    b.patch(180, 250, -9.5, -4, 'leaves', true);
    b.add('pebble', 222, 5.5, 1.0, 0.5, 2);
    b.add('mushroom', 286, -7.4, 1.1, 1.25, 2);
    b.leafBridge(345, 425, -1);
    b.add('pebble', 404, 5, 1.0, 0.5, 2);
    b.pad(470, 2);

    // 3 · Stepping Stones: a fast stone ribbon down the middle, mud either side, two root tips to thread.
    b.root(556, -14, -2.6, 0.75, 4);
    b.gate(548, 562, -0.6, 2.6);
    b.root(604, 14, 2.6, 0.75, -4);
    b.gate(596, 610, -2.6, 0.6);
    b.gate(520, 676, -2.6, 2.6);
    b.pad(640, 0);

    // 4 · Frog Leap: plunge, kicker, and a pond to clear on the far side.
    b.jump(800, 830, 5.0);
    b.basin(834, 870, -15, 15, 1.1);
    b.add('mushroom', 912, 8, 1.1, 1.25, 2.2);

    // 5 · Firefly Run: slick banked bends, the second lily shortcut, then a boost-pad straight.
    b.add('pebble', 1000, -5.6, 1.0, 0.5, 2);
    b.add('mushroom', 1070, 6, 1.0, 1.25, 2);
    b.leafBridge(1142, 1222, 1);
    b.add('pebble', 1196, -4.6, 1.0, 0.5, 2);
    b.pad(1262, -2);
    b.add('mushroom', 1330, 2, 1.0, 1.25, 2);
    b.pad(1408, 0);
    b.basin(1440, 1468, 1.4, 10, 0.45);
    b.pad(1452, -4.6);
    b.basin(1490, 1518, -10, -1.4, 0.45, 'mud');
    b.pad(1504, 4.6);
  },
};
