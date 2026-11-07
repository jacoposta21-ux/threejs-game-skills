/** Every player-facing text lives here (English only for now). */
export const S = {
  title: 'Capybara Onsen Tycoon',
  loading: 'Heating the springs…',
  perSec: '/s',
  dig: 'Dig',
  digFree: 'Free pool in',
  gridFull: 'Merge to make room!',
  upgradesTitle: 'Upgrades',
  max: 'MAX',
  level: 'Lv',
  upgrades: {
    hotWater: { name: 'Hotter Water', effect: '×1.5 production' },
    shovel: { name: 'Better Shovel', effect: 'New pools +1 Lv' },
    longRest: { name: 'Long Rest', effect: '+1 h offline cap' },
  },
  boostIdle: '×2 for 5 min',
  boostActive: '×2 active',
  video: 'video',
  golden: 'Golden',
  boost: 'Boost',
  welcomeTitle: 'Welcome back!',
  welcomeBody: (dur: string) => `Your capybaras soaked for ${dur}`,
  welcomeCap: (dur: string) => `(offline limit ${dur} — upgrade Long Rest)`,
  collect: 'Collect',
  collectX2: 'Collect ×2',
  newCapy: 'New capybara!',
  decoUnlocked: (name: string) => `Decoration unlocked: ${name}`,
  yay: 'Yay!',
  album: 'Album',
  albumTitle: 'Capybara Album',
  albumLocked: '???',
  albumHint: 'Merge pools to discover new capybaras',
  goldenTitle: 'Golden guest!',
  goldenBody: 'Production ×3 for 30 s',
  goldenOffer: 'Watch a video for ×3 for 3 minutes?',
  watch: 'Watch',
  noThanks: 'No thanks',
  adUnavailable: 'Video unavailable — try again later',
  close: 'Close',
  merged: 'Merged!',
  tutorialMerge: 'Drag a pool onto a matching one!',
  debug: {
    title: 'DEBUG',
    coins: '+1M coins',
    spawn: (l: number) => `Spawn L${l}`,
    speed: (on: boolean) => `Time ×10: ${on ? 'ON' : 'off'}`,
    guest: 'Golden guest',
    reset: 'Reset save',
    unlockAll: 'Fill album',
  },
};

export interface CapyInfo {
  name: string;
  quote: string;
  deco: string;
}

/** One entry per level (index 0 = level 1). Names are original and silly. */
export const CAPYS: CapyInfo[] = [
  { name: 'Snoozy Mochi', quote: 'Five more minutes. Or hours.', deco: 'Paper lantern' },
  { name: 'Sir Leafington', quote: 'A leaf a day keeps worries away.', deco: 'Bamboo grove' },
  { name: 'Citrus Kiko', quote: 'Smells like victory. And yuzu.', deco: 'Stone lantern' },
  { name: 'Professor Puddle', quote: 'I have studied water. It is wet.', deco: 'Red bridge' },
  { name: 'Blossom Bean', quote: 'Pink is a state of mind.', deco: 'Cherry blossoms' },
  { name: 'Duckie Daifuku', quote: 'Quack is my love language.', deco: 'Koi pond' },
  { name: 'Captain Bubbles', quote: 'Maximum relaxation, full power!', deco: 'Torii gate' },
  { name: 'Lady Matcha', quote: 'Sip. Soak. Repeat.', deco: 'Snowy mountain' },
  { name: 'DJ Steam', quote: 'Dropping beats and body temperature.', deco: 'Maple tree' },
  { name: 'Grandpa Onsen', quote: 'Back in my day we soaked uphill.', deco: 'Festival lights' },
  { name: 'Moonbeam Momo', quote: 'Too chill for daylight.', deco: 'Full moon' },
  { name: 'Emperor Yuzu', quote: 'All tubs bow before me.', deco: 'Golden fireworks' },
];
