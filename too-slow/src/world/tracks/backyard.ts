import type { TrackDef } from '../Track';

/** The original course: a bit of everything. */
export const BACKYARD: TrackDef = {
  id: 'backyard',
  name: 'The Backyard',
  blurb: 'Wet leaves, a root maze and one very big drop.',
  layout: [
    [150, 0], // 1 · Starting Hill            0 –  150
    [50, 0], //  2 · Leaf Slide             150 –  550
    [120, 75],
    [40, 0],
    [130, -95],
    [60, 0],
    [60, 0], //  3 · Root Maze              550 –  960
    [150, 80],
    [70, 0],
    [90, -40],
    [40, 0],
    [300, 0], // 4 · The Big Drop           960 – 1260
    [150, 70], // 5 · Final Sprint         1260 – 1960
    [30, 0],
    [120, -90],
    [30, 0],
    [100, 60],
    [270, 0],
  ],
  slope: [
    [0, 0],
    [21, 0],
    [46, 7.5],
    [150, 9],
    [200, 10],
    [320, 8],
    [450, 9],
    [550, 6],
    [600, 4.5],
    [656, 3],
    [672, -2.6],
    [698, -2.6],
    [716, 4],
    [860, 6],
    [960, 3.5],
    [1000, 2],
    [1022, 22],
    [1034, 30],
    [1080, 30],
    [1096, 12],
    [1122, 12],
    [1130, 22],
    [1218, 20],
    [1262, 6.5],
    [1300, 5.5],
    [1640, 5],
    [1700, 3.5],
    [1800, 2.5],
    [1860, 1],
    [1900, 0],
    [1960, -4],
  ],
  halfWidth: [
    [0, 9],
    [150, 9.5],
    [360, 10],
    [550, 10.5],
    [620, 12],
    [770, 12],
    [900, 9],
    [918, 4.2],
    [960, 4.2],
    [978, 9],
    [1122, 9.5],
    [1137, 13],
    [1240, 12],
    [1280, 9.5],
    [1700, 9.5],
    [1740, 10.5],
    [1960, 10.5],
  ],
  bankGain: [
    [0, 6],
    [1240, 6],
    [1270, 19],
    [1690, 19],
    [1720, 4],
  ],
  berm: [
    [0, 1.0],
    [140, 1.9],
    [900, 1.9],
    [915, 0.2],
    [962, 0.2],
    [980, 2.2],
    [1122, 2.2],
    [1132, 2.8],
    [1250, 2.6],
    [1270, 3.4],
    [1700, 3.4],
    [1730, 2.0],
    [1960, 2.0],
  ],
  startS: 22,
  gridS: 14,
  finishS: 1862,
  sections: [
    { name: 'Starting Hill', s0: 0, s1: 150 },
    { name: 'Leaf Slide', s0: 150, s1: 550 },
    { name: 'Root Maze', s0: 550, s1: 960 },
    { name: 'The Big Drop', s0: 960, s1: 1260 },
    { name: 'Final Sprint', s0: 1260, s1: 1960 },
  ],
  checkpoints: [150, 330, 550, 752, 965, 1260, 1425, 1575, 1700],
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
  },
  landmarks: [
    { kind: 'can', s: 70, d: 52 },
    { kind: 'pot', s: 505, d: 44 },
    { kind: 'trunk', s: 690, d: -52 },
    { kind: 'trunk', s: 640, d: 54 },
    { kind: 'trunk', s: 835, d: 50 },
    { kind: 'trowel', s: 1012, d: -46 },
    { kind: 'hose', s: 968, d: 27, s1: 1290 },
    { kind: 'pot', s: 1340, d: -44 },
    { kind: 'pot', s: 1500, d: 46 },
    { kind: 'potTipped', s: 1618, d: -50 },
    { kind: 'rake', s: 1800, d: -34 },
  ],
  fence: { side: 1, s1: 520 },
  mainJump: 1,
  baseSurface(s, ad) {
    if (s < 150) return ad < 5.5 + Math.sin(s * 0.2) * 0.8 ? 'dirt' : 'grass';
    if (s < 550) return 'leaves';
    if (s < 962) return 'grass';
    if (s < 1122) return 'stone';
    if (s < 1262) return 'grass';
    if (s < 1695) return 'stone';
    return ad < 3.6 ? 'stone' : 'grass';
  },
  build(b) {
    b.itemRow(176, 586, 990, 1290, 1560);
    // 1 · Starting Hill
    b.add('mushroom', 96, -7.2, 1.0, 1.25, 2);
    b.add('pebble', 118, 6.4, 0.9, 0.5, 1.8);
    b.add('mushroom', 136, 8.1, 0.9, 1.25, 1.8);
    b.pad(124, -3);

    // 2 · Leaf Slide: plank hop, then stream + leaf shortcut on the inside of the left-hander.
    b.jump(300, 314, 1.5);
    b.leafBridge(394, 478, -1);
    b.add('pebble', 232, -5.5, 1.0, 0.5, 2);
    b.add('mushroom', 268, 8.6, 1.1, 1.25, 2);
    b.add('pebble', 286, 3.2, 0.8, 0.5, 1.8);
    b.add('mushroom', 352, 7.8, 1.0, 1.25, 2);
    b.add('pebble', 446, 4.5, 1.0, 0.5, 2);
    b.add('mushroom', 516, -6.8, 1.1, 1.25, 2);
    b.pad(246, -4);

    // 3 · Root Maze: thread the root tips, then the split around the big divider root.
    b.patch(640, 745, 4.6, 11.4, 'stone'); // precise inside lane
    b.patch(684, 722, -11.5, -4.5, 'mud', true);
    b.hump(738, 3.4, 0.8, 4.6, 11.6);
    b.hump(786, 5, 0.6, -13, 13);
    b.patch(858, 892, -9.5, -1.5, 'mud', true);
    b.root(566, -14, -2.4, 0.75, 5);
    b.gate(558, 574, -0.4, 10);
    b.root(610, 14, 2.4, 0.75, -4);
    b.gate(600, 614, -10.5, 0.4);
    for (let s = 650; s < 742; s += 13) b.root(s, 2.4 + Math.sin(s) * 0.4, 2.9 + Math.sin(s + 13) * 0.4, 1.15, 13);
    b.gate(632, 745, -10.5, -0.9, 'maze', 'safe');
    b.gate(632, 745, 5.8, 10.4, 'maze', 'risky');
    b.split('maze', 648, 745, 2.65, 'safe', 'risky');
    b.root(664, 13, 8.9, 0.6, 2);
    b.gate(658, 668, 5.2, 7.4, 'maze', 'risky');
    b.root(694, 4.2, 7.0, 0.6, 2);
    b.gate(689, 699, 8.6, 10.6, 'maze', 'risky');
    b.root(726, 13, 9.4, 0.6, -2);
    b.gate(721, 730, 5.2, 8, 'maze', 'risky');
    b.add('mushroom', 668, -7.5, 1.1, 1.25, 2.2);
    b.add('mushroom', 742, -3.6, 1.0, 1.25, 2);
    b.add('stump', 757, 2.7, 1.6, 0.4, 2.8, 2);
    b.root(800, 13, 0.6, 0.75, 5);
    b.gate(792, 808, -9.5, -1.5);
    b.root(846, -13, -0.6, 0.75, -4);
    b.gate(838, 852, 1.5, 9.5);
    b.add('pebble', 884, 4.2, 1.0, 0.5, 2);
    b.bridge(920, 958);

    // 4 · The Big Drop: kicker at the bottom of the plunge, ski-jump landing after.
    b.jump(1090, 1122, 5.2);
    b.basin(1222, 1258, 3, 12.5, 0.5, 'mud');
    b.add('pebble', 1004, -6.5, 1.1, 0.5, 2.2);
    b.add('pebble', 1010, 6.8, 1.0, 0.5, 2);

    // 5 · Final Sprint: slippery outside lines, a puddle chicane on the straight.
    b.patch(1300, 1352, -9.5, -3.5, 'leaves', true);
    b.patch(1470, 1530, 3.5, 9.5, 'leaves', true);
    b.patch(1620, 1666, -9.5, -4, 'leaves', true);
    b.basin(1752, 1782, -10, -1.2, 0.45);
    b.basin(1800, 1830, 1.2, 10, 0.45, 'mud');
    b.hump(1728, 4, 0.6, -3.4, 3.4);
    b.add('pebble', 1318, 5.8, 1.0, 0.5, 2);
    b.add('mushroom', 1388, -1.5, 1.0, 1.25, 2);
    b.add('pebble', 1462, -5.4, 1.1, 0.5, 2.2);
    b.add('pebble', 1552, 2.4, 0.9, 0.5, 2);
    b.add('mushroom', 1600, 6.6, 1.0, 1.25, 2);
    b.add('pebble', 1712, -6.8, 1.0, 0.5, 2);
    b.add('mushroom', 1766, 7.2, 1.1, 1.25, 2);
    b.add('pebble', 1838, -6.2, 1.0, 0.5, 2);
    b.pad(1425, 3);
    b.pad(1696, 0);
    b.pad(1788, -4.5);
  },
};
