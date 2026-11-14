import type { TrackDef } from '../Track';

/** Fast and flowing: tilled soil, muddy furrows, a boardwalk and plenty of boost pads. */
export const VEGGIE: TrackDef = {
  id: 'veggie',
  name: 'Veggie Patch',
  blurb: 'Golden-hour sprint through muddy furrows. Hit the pads, dodge the mud.',
  layout: [
    [140, 0], // 1 · Seed Rows               0 –  140
    [110, -70], // 2 · Muddy Furrows        140 –  480
    [50, 0],
    [120, 80],
    [60, 0],
    [130, -85], // 3 · The Boardwalk        480 –  750
    [40, 0],
    [100, 60],
    [220, 0], // 4 · Pumpkin Plunge         750 –  970
    [140, 75], // 5 · Harvest Dash          970 – 1520
    [40, 0],
    [110, -70],
    [260, 0],
  ],
  slope: [
    [0, 0],
    [20, 0],
    [44, 7],
    [140, 8],
    [250, 7],
    [420, 8],
    [480, 6],
    [600, 5],
    [612, 2],
    [650, 3],
    [700, 6],
    [770, 4],
    [790, 24],
    [800, 28],
    [838, 28],
    [852, 12],
    [880, 12],
    [888, 22],
    [950, 19],
    [985, 6],
    [1300, 5],
    [1380, 3],
    [1440, 1],
    [1480, 0],
    [1520, -4],
  ],
  halfWidth: [
    [0, 9],
    [140, 9.5],
    [480, 10],
    [594, 9],
    [608, 4.2],
    [652, 4.2],
    [666, 9],
    [880, 9.5],
    [895, 13],
    [960, 12],
    [990, 9.5],
    [1260, 9.5],
    [1300, 10.5],
    [1520, 10.5],
  ],
  bankGain: [
    [0, 7],
    [960, 7],
    [980, 19],
    [1260, 19],
    [1290, 4],
  ],
  berm: [
    [0, 1.0],
    [120, 1.9],
    [594, 1.9],
    [606, 0.2],
    [654, 0.2],
    [668, 2.2],
    [880, 2.2],
    [890, 2.8],
    [965, 2.6],
    [980, 3.4],
    [1270, 3.4],
    [1300, 2.0],
    [1520, 2.0],
  ],
  startS: 22,
  gridS: 14,
  finishS: 1440,
  sections: [
    { name: 'Seed Rows', s0: 0, s1: 140 },
    { name: 'Muddy Furrows', s0: 140, s1: 480 },
    { name: 'The Boardwalk', s0: 480, s1: 750 },
    { name: 'Pumpkin Plunge', s0: 750, s1: 970 },
    { name: 'Harvest Dash', s0: 970, s1: 1520 },
  ],
  checkpoints: [140, 300, 480, 668, 760, 975, 1150, 1290],
  theme: {
    skyTop: 0x4f8fe0,
    skyHorizon: 0xffe0b0,
    skyGround: 0xc9b070,
    fog: 0xffe6c2,
    hemiSky: 0xfff0d8,
    hemiGround: 0x9a8a4a,
    hemiIntensity: 1.0,
    sunColor: 0xffd9a0,
    sunIntensity: 2.6,
    verge: 0x6f9a34,
    farA: 0x86a83c,
    farB: 0x5f8a30,
    grassTints: [0xb6d65a, 0x9cc64a, 0xd0d86a, 0x86b446, 0xa8c850],
  },
  landmarks: [
    { kind: 'rake', s: 90, d: -36 },
    { kind: 'pot', s: 210, d: 44 },
    { kind: 'potTipped', s: 380, d: -46 },
    { kind: 'can', s: 560, d: 54 },
    { kind: 'trowel', s: 770, d: 44 },
    { kind: 'hose', s: 760, d: -27, s1: 1000 },
    { kind: 'pot', s: 1060, d: -46 },
    { kind: 'pot', s: 1210, d: 46 },
    { kind: 'trowel', s: 1400, d: -40 },
  ],
  fence: { side: -1, s1: 360 },
  mainJump: 1,
  baseSurface(s, ad) {
    if (s < 480) return 'dirt';
    if (s < 612) return 'wood';
    if (s < 750) return 'stone';
    if (s < 850) return 'dirt';
    if (s < 970) return 'grass';
    if (s < 1262) return 'stone';
    return ad < 4 ? 'stone' : 'dirt';
  },
  build(b) {
    b.itemRow(150, 490, 690, 985, 1170);
    // 1 · Seed Rows
    b.add('pebble', 92, 6.5, 0.9, 0.5, 1.8);
    b.add('mushroom', 120, -7, 1.0, 1.25, 2);
    b.pad(112, 2);

    // 2 · Muddy Furrows: long mud strips on alternating sides, a clean line (and pads) between them.
    b.patch(160, 236, 2.5, 9.5, 'mud', true);
    b.patch(238, 300, -9.5, -2.5, 'mud', true);
    b.patch(306, 372, 1.5, 9.5, 'mud', true);
    b.patch(376, 432, -9.5, -1.5, 'mud', true);
    b.pad(196, -3.5);
    b.pad(262, 3.5);
    b.pad(334, -4);
    b.jump(442, 456, 1.6);
    b.add('pebble', 286, 6.8, 1.0, 0.5, 2);
    b.add('mushroom', 404, 6.4, 1.0, 1.25, 2);

    // 3 · The Boardwalk: planks through the left-hander, a bridge over the irrigation ditch, stone after.
    b.patch(500, 560, 3, 9.5, 'leaves', true); // loose straw on the outside
    b.add('pebble', 536, -6.2, 1.0, 0.5, 2);
    b.bridge(612, 648);
    b.add('mushroom', 700, 6.8, 1.1, 1.25, 2);
    b.pad(716, -2);

    // 4 · Pumpkin Plunge
    b.jump(850, 880, 5.0);
    b.basin(942, 968, -12, -3, 0.45, 'mud');

    // 5 · Harvest Dash: banked stone bends, then a pad-to-pad straight with puddles to thread.
    b.patch(1010, 1070, -9.5, -4, 'leaves', true);
    b.patch(1170, 1230, 4, 9.5, 'leaves', true);
    b.add('pebble', 1040, 5.6, 1.0, 0.5, 2);
    b.add('mushroom', 1128, -2, 1.0, 1.25, 2);
    b.add('pebble', 1200, -5.4, 1.0, 0.5, 2);
    b.pad(1132, 4);
    b.pad(1276, 0);
    b.basin(1312, 1340, -10, -1.4, 0.45);
    b.pad(1326, 4.6);
    b.basin(1362, 1390, 1.4, 10, 0.45, 'mud');
    b.pad(1376, -4.6);
    b.add('pebble', 1418, 7, 1.0, 0.5, 2);
  },
};
