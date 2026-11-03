// River fish. weight = how common; zone = width (0..1) of the green zone in the reeling bar
// (smaller is harder); speed = how fast the marker moves. night: only after 18:00. rain: more common in rain.
// Roughly: out of 10 casts, 5 mudminnows, 3 perch, 2 bits of junk, plus the odd rare catch.
export const FISH = [
  { id: 'mudminnow', weight: 46, zone: 0.34, speed: 0.9 },
  { id: 'river_perch', weight: 26, zone: 0.26, speed: 1.2 },
  { id: 'tin_can', weight: 7, zone: 0.45, speed: 0.7, junk: true },
  { id: 'old_boot', weight: 6, zone: 0.45, speed: 0.7, junk: true },
  { id: 'soggy_paper', weight: 5, zone: 0.45, speed: 0.7, junk: true },
  { id: 'silver_eel', weight: 7, zone: 0.2, speed: 1.5, night: true },
  { id: 'golden_carp', weight: 3, zone: 0.14, speed: 1.8, rain: true },
];

export const FISHING = {
  energy: 2,        // per cast (each cast also uses one bait)
  wait: [1.5, 4.5], // seconds before a bite
  bite: 0.9,        // seconds to react to "!"
  rodPrice: 150,
  catPets: 3,       // a cat fed a fish follows you until bedtime and can be petted this many times
};
