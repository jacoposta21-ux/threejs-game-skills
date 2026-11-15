import type { TrackDef } from '../Track';

/** Golden hour on the allotment: mud strips, a chicane, a boardwalk launch and pad-to-pad lines. */
export const VEGGIE: TrackDef = {
  id: 'veggie',
  name: 'Veggie Patch',
  blurb: 'Muddy furrows, a scarecrow chicane and the Pumpkin Plunge. Ride the pads.',
  points: [[0, 0], [0, -50], [0, -90], [-10, -140], [-60, -165], [-120, -160], [-165, -125], [-172, -75], [-140, -30], [-172, 15], [-172, 55], [-172, 95], [-172, 135], [-172, 175], [-140, 215], [-90, 228], [-45, 228], [-10, 205], [0, 160], [0, 100], [0, 40]],
  laps: 3,
  slope: [[0, 0], [44, 0], [58, 6], [200, 7], [400, 7], [450, 5], [500, 4], [540, 2], [550, 21], [566, 22], [570, 9], [588, 9], [602, 15], [640, 8], [760, 6], [860, 3], [926, 1]],
  halfWidth: [[0, 9.5], [110, 10.5], [400, 10.5], [420, 9], [500, 9], [506, 4.2], [542, 4.2], [550, 9.5], [620, 10.5], [1041, 10.5]],
  bankGain: [[0, 8], [100, 14], [400, 14], [420, 8], [620, 8], [640, 15], [860, 15], [880, 6], [1041, 6]],
  berm: [[0, 1.4], [100, 2.4], [500, 2.4], [506, 0.2], [542, 0.2], [552, 2.2], [640, 3], [860, 3], [880, 2], [1041, 2]],
  startS: 42,
  launchS: 926,
  landS: 18,
  sections: [
    { name: 'Seed Rows', s0: 0, s1: 110 },
    { name: 'Muddy Furrows', s0: 110, s1: 410 },
    { name: 'Scarecrow Chicane', s0: 410, s1: 500 },
    { name: 'Pumpkin Plunge', s0: 500, s1: 640 },
    { name: 'Harvest Dash', s0: 640, s1: 1041 },
  ],
  checkpoints: [100, 230, 370, 480, 610, 740, 880],
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
    flora: 'veggie',
  },
  landmarks: [
    { kind: 'pumpkin', s: 60, d: 40 },
    { kind: 'rake', s: 160, d: 40 },
    { kind: 'pot', s: 300, d: 46 },
    { kind: 'can', s: 470, d: -48 },
    { kind: 'pumpkin', s: 600, d: 44 },
    { kind: 'trowel', s: 720, d: 44 },
    { kind: 'pumpkin', s: 820, d: -40 },
    { kind: 'potTipped', s: 900, d: -46 },
  ],
  fence: { side: 1, s0: 130, s1: 380 },
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 410) return 'dirt';
    if (s < 506) return 'stone';
    if (s < 640) return 'dirt';
    return ad < 4 ? 'stone' : 'dirt';
  },
  build(b) {
    b.itemRow(130, 470, 660, 900);
    // Muddy Furrows: mud strips on alternating sides with pads on the clean line between them.
    b.patch(140, 200, 1.5, 10, 'mud', true);
    b.patch(205, 265, -10, -1.5, 'mud', true);
    b.patch(270, 330, 1.5, 10, 'mud', true);
    b.patch(335, 395, -10, -1.5, 'mud', true);
    b.pad(160, -4.5);
    b.pad(225, 4.5);
    b.pad(290, -4.5);
    b.pad(355, 4.5);
    b.add('pebble', 250, -7.5, 1.0, 0.5, 2);
    b.add('mushroom', 380, 7.8, 1.0, 1.25, 2);
    b.critter('ants', 300, 0.4, 14);

    // Scarecrow Chicane: right-left flick on stone, posts at the apexes.
    b.add('post', 432, 7.4, 0.7, 0.4, 2, 3);
    b.add('post', 470, -7.4, 0.7, 0.4, 2, 3);
    b.pad(486, 0);

    // Pumpkin Plunge: boardwalk over the ditch, a short plunge and the kicker.
    b.bridge(508, 540);
    b.jump(570, 588, 3.4);
    b.critter('beetle', 680, 0.2);

    // Harvest Dash: pad chains through the banked bends and up the approach.
    b.padChain(660, 3, 30, 3, 0);
    b.padChain(760, 3, 30, -3, 0);
    b.add('pebble', 700, -6.6, 1.0, 0.5, 2);
    b.add('mushroom', 800, 6.4, 1.0, 1.25, 2);
    b.critter('grasshopper', 840, 1.1);
    b.padChain(880, 3, 16, 0, 4.5);
  },
};
