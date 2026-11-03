// The residents of Mildew Hollow. All text lives in strings (npc.<id>.*); this is structure only.
//
// candidate: can be picked as the Gnomer at the start of a game.
// home: interior area id (the villager's bed spot is that room's "home" location).
// stats: shown in the notebook; some Gnomers choose victims by them.
// schedule: [time, location]. "home" = own bed spot; "store.counter" style ids are interior spots.
// lines: dialogue line keys -> conditions (weather, dow 0=Mon..6=Sun, state calm|fear, minHearts).
// look: drives the procedural sprite + portrait generator in js/art.js.

const BASE_LINES = {
  hi1: {}, hi2: {}, hi3: {},
  rain: { weather: 'rain' },
  sunday: { dow: 6 },
  calm: { state: 'calm' },
  fear1: { state: 'fear' }, fear2: { state: 'fear' },
  h2: { minHearts: 2 },
  h4: { minHearts: 4 },
  m1: { time: 'morning' }, m2: { time: 'evening' }, m3: { weather: 'cloudy' }, m4: {}, m5: {},
  m6: { minHearts: 1 }, m7: { minHearts: 3 }, m8: { state: 'fear' }, m9: { state: 'calm' }, m10: { dow: 4 },
};

export const VILLAGERS = [
  {
    id: 'odessa', candidate: true, home: 'house_odessa', pitch: 1.5,
    look: { skin: '#f0cfae', hair: '#c9c2cc', hairStyle: 'bun', shirt: '#8e78b4', pants: '#5b4a70', hat: null, glasses: true, height: 0 },
    stats: { height: 152, wealth: 5 },
    loves: ['tea_tin', 'aster_bouquet', 'cranberry'], likes: ['turnip', 'hard_cheese'], dislikes: ['garlic'],
    schedule: [['06:00', 'home'], ['09:00', 'board_spot'], ['13:00', 'fountain_w'], ['16:00', 'store_front'], ['18:00', 'bench_w'], ['21:00', 'home']],
    lines: BASE_LINES,
  },
  {
    id: 'barnaby', candidate: true, home: 'house_barnaby', pitch: 0.8,
    look: { skin: '#d9a47e', hair: '#6b4428', hairStyle: 'bald', beard: '#6b4428', shirt: '#f2ece0', pants: '#7a5a3c', hat: 'baker', apron: '#e9e2d3', height: 1 },
    stats: { height: 178, wealth: 3 },
    loves: ['pumpkin', 'hard_cheese'], likes: ['garlic', 'turnip', 'river_perch'], dislikes: ['aster_bouquet'],
    schedule: [['06:00', 'home'], ['08:00', 'stall'], ['17:00', 'fountain_e'], ['20:00', 'home']],
    lines: BASE_LINES,
  },
  {
    id: 'fennel', candidate: true, home: 'house_fennel', pitch: 1.0,
    look: { skin: '#eac3a3', hair: '#efeee6', hairStyle: 'short', beard: '#efeee6', shirt: '#7d6340', pants: '#4f4434', hat: 'tophat', glasses: true, height: 3 },
    stats: { height: 192, wealth: 8 },
    loves: ['tea_tin'], likes: ['pumpkin', 'hard_cheese'], dislikes: ['turnip'],
    schedule: [['06:00', 'home'], ['09:30', 'farm_road'], ['13:00', 'plaza_w'], ['16:00', 'bridge_mid'], ['20:30', 'home']],
    rain: [['06:00', 'home'], ['11:00', 'plaza_c'], ['15:00', 'plaza_w'], ['19:00', 'home']],
    lines: BASE_LINES,
  },
  {
    id: 'wren', candidate: true, home: 'house_wren', pitch: 1.25,
    look: { skin: '#c99677', hair: '#2b2530', hairStyle: 'messy', shirt: '#4d6a4a', pants: '#3a3a44', hat: 'beanie', hatColor: '#b5583a', height: 1 },
    stats: { height: 171, wealth: 1 },
    loves: ['aster_bouquet', 'pumpkin'], likes: ['tea_tin', 'cranberry'], dislikes: ['hard_cheese'],
    schedule: [['06:00', 'home'], ['10:00', 'plaza_e'], ['14:00', 'riverbank_n'], ['18:00', 'fountain_s'], ['22:00', 'home']],
    rain: [['06:00', 'home'], ['13:00', 'store_front'], ['16:00', 'fountain_s'], ['19:00', 'home']],
    lines: BASE_LINES,
  },
  {
    id: 'hollis', candidate: true, home: 'house_hollis', pitch: 0.7,
    look: { skin: '#d8a888', hair: '#e8e6e0', hairStyle: 'short', beard: '#e8e6e0', shirt: '#2f3f63', pants: '#2a2a35', hat: 'captain', height: 2 },
    stats: { height: 185, wealth: 4 },
    loves: ['hard_cheese', 'garlic', 'river_perch', 'silver_eel'], likes: ['turnip', 'mudminnow', 'golden_carp'], dislikes: ['tea_tin'],
    schedule: [['06:00', 'home'], ['07:00', 'dock'], ['13:00', 'hall_front'], ['17:00', 'dock'], ['21:00', 'home']],
    lines: BASE_LINES,
  },
  {
    id: 'marigold', candidate: false, home: 'store', pitch: 1.35,
    look: { skin: '#f3d2b5', hair: '#c4572e', hairStyle: 'curly', shirt: '#d9a43a', pants: '#7d5a2c', hat: null, apron: '#6f8a5a', height: 0 },
    stats: { height: 160, wealth: 9 },
    loves: ['turnip', 'tea_tin'], likes: ['garlic'], dislikes: ['pumpkin', 'silver_eel'],
    schedule: [['06:00', 'home'], ['07:45', 'store.counter'], ['17:15', 'bench_e'], ['20:00', 'home']],
    lines: BASE_LINES,
  },
  {
    id: 'tib', candidate: false, home: 'house_tib', pitch: 0.95,
    look: { skin: '#e2b590', hair: '#8a5a32', hairStyle: 'short', shirt: '#5d7a3e', pants: '#4a3b2c', hat: null, waistcoat: '#8c3b33', height: 0 },
    stats: { height: 166, wealth: 6 },
    loves: ['pumpkin', 'aster_bouquet', 'golden_carp'], likes: ['hard_cheese', 'tea_tin'], dislikes: ['garlic'],
    schedule: [['06:00', 'home'], ['08:30', 'hall.desk'], ['12:00', 'fountain_s'], ['13:00', 'hall.desk'], ['17:00', 'plaza_c'], ['20:00', 'home']],
    lines: BASE_LINES,
  },
];

export const PLAYER_LOOK = { skin: '#f0c8a0', hair: '#9c4a2a', hairStyle: 'short', shirt: '#c9a24a', pants: '#4e6b3a', hat: 'straw', overalls: '#4e6b3a', height: 0 };

// Friendship tuning (points; 100 points = 1 heart, max 5 hearts).
export const FRIENDSHIP = { perHeart: 100, max: 500, talk: 25, loved: 100, liked: 50, neutral: 20, disliked: -30, charm: 40, caught: -60, saved: 80 };
