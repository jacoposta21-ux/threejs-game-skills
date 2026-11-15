import type { TrackDef } from '../Track';

/** A frozen dawn: a glassy ice line down the middle, grippy snow either side. */
export const FROST: TrackDef = {
  id: 'frost',
  name: 'Frosty Morning',
  blurb: 'Ice is fast, snow is grippy. Icicle bend, the Snowbank Jump and a frozen pond.',
  points: [[0, 0], [0, -50], [0, -90], [-25, -140], [-80, -160], [-145, -140], [-172, -85], [-172, -45], [-172, -5], [-172, 35], [-172, 75], [-150, 120], [-165, 170], [-125, 220], [-60, 230], [-15, 205], [0, 160], [0, 100], [0, 40]],
  laps: 3,
  slope: [[0, 0], [44, 0], [58, 7.5], [200, 7],  [340, 6], [372, 5], [384, 20], [416, 22], [422, 8], [440, 8], [460, 13], [500, 6], [600, 4], [700, 4.5], [800, 3], [880, 1]],
  halfWidth: [[0, 10], [80, 11], [360, 11], [500, 11], [520, 13], [700, 13], [740, 11], [995, 11]],
  bankGain: [[0, 8], [70, 10], [360, 10], [520, 6], [700, 6], [720, 14], [850, 14], [870, 6], [995, 6]],
  berm: [[0, 1.6], [70, 2.6], [500, 2.6], [520, 1.5], [700, 1.5], [720, 2.8], [995, 2.4]],
  startS: 42,
  launchS: 880,
  landS: 18,
  sections: [
    { name: 'Frosty Plateau', s0: 0, s1: 70 },
    { name: 'Icicle Bend', s0: 70, s1: 370 },
    { name: 'Snowbank Jump', s0: 370, s1: 510 },
    { name: 'Frozen Pond', s0: 510, s1: 710 },
    { name: 'Snowman Sprint', s0: 710, s1: 995 },
  ],
  checkpoints: [90, 220, 350, 500, 620, 740, 850],
  theme: {
    skyTop: 0x7fb4e8,
    skyHorizon: 0xf3f0ff,
    skyGround: 0xdfe8f2,
    fog: 0xe8eef8,
    hemiSky: 0xeef4ff,
    hemiGround: 0xb8c8d8,
    hemiIntensity: 1.15,
    sunColor: 0xffe8d8,
    sunIntensity: 2.2,
    verge: 0xe6eef5,
    farA: 0xeef3f8,
    farB: 0xd4e0ea,
    grassTints: [0xcfe6ef, 0xb8d8e6, 0xe2f0f6],
    flora: 'snow',
    weather: 'snow',
  },
  landmarks: [
    { kind: 'snowman', s: 30, d: 34 },
    { kind: 'trunk', s: 200, d: 72 },
    { kind: 'snowman', s: 360, d: 34 },
    { kind: 'lantern', s: 520, d: -20 },
    { kind: 'snowman', s: 640, d: 40 },
    { kind: 'trunk', s: 760, d: -70 },
    { kind: 'snowman', s: 900, d: -34 },
  ],
  mainJump: 0,
  baseSurface(s, ad) {
    if (s < 70) return ad < 4 ? 'ice' : 'snow';
    if (s >= 510 && s < 710) return ad < 9 ? 'ice' : 'snow';
    return ad < 3.6 ? 'ice' : 'snow';
  },
  build(b) {
    b.itemRow(130, 380, 600, 840);
    // Icicle Bend: icicles hang into the outside of the long left-hander.
    for (const [s, d] of [
      [120, 7.6],
      [175, 6.8],
      [230, 7.8],
      [285, 6.6],
      [335, 7.4],
    ]) b.add('icicle', s, d, 0.6, 0.5, 1.6, 2.6);
    b.add('snowball', 260, -5, 1.1, 0.4, 2.2);
    b.pad(200, -3);
    b.pad(310, -2.5);

    // Snowbank Jump.
    b.jump(422, 440, 3.4, 'snow');
    b.pad(388, 0, 9, 2);
    b.add('snowball', 480, 6, 1.1, 0.4, 2.2);

    // Frozen Pond: the whole middle is glare ice; snowballs mark the edges.
    b.add('snowball', 560, -9.5, 1.2, 0.4, 2.2);
    b.add('snowball', 620, 9.5, 1.2, 0.4, 2.2);
    b.add('snowball', 670, -9.5, 1.2, 0.4, 2.2);
    b.critter('pillbug', 600, 0.4);
    b.padChain(540, 2, 60, 0, 0);

    // Snowman Sprint.
    b.padChain(730, 3, 30, -3, 0);
    b.critter('beetle', 790, 0.8);
    b.add('snowball', 820, 6.5, 1.1, 0.4, 2.2);
    b.padChain(850, 2, 16, 0, 4);
  },
};
