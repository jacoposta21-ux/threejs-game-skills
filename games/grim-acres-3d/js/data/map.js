// Mildew Hollow layout. Pure data: the World builder (js/world.js) turns this into tiles.
// Coordinates are in tiles. Rects are [x, y, w, h].

export const MAP = {
  width: 64,
  height: 48, // outdoor area; interiors are packed below it by the builder

  river: { x: 29, w: 3 },            // water columns 29..31, sand banks on 28 and 32
  bridge: [28, 22, 5, 3],            // planks across the river
  field: { rect: [3, 12, 20, 17], gate: [12, 13], cleared: [10, 13, 6, 3] }, // fence on the rect border
  plaza: [38, 14, 20, 14],

  paths: [
    [7, 8, 1, 3],    // farmhouse door -> lane
    [7, 10, 19, 1],  // farm lane
    [12, 11, 2, 1],  // lane -> field gate
    [24, 10, 2, 15], // farm road (north-south)
    [24, 23, 4, 2],  // farm road -> bridge
    [33, 23, 5, 2],  // bridge -> plaza
    [41, 12, 1, 2],  // store door
    [53, 12, 1, 2],  // town hall door
    [47, 28, 2, 1],  // plaza -> south street
    [33, 29, 28, 1], // street S1
    [44, 30, 1, 6],
    [53, 30, 1, 6],
    [37, 36, 24, 1], // street S2
    [41, 37, 1, 7],
    [50, 37, 1, 7],
    [33, 44, 26, 1], // street S3
  ],

  flowers: [[33, 3, 4, 3], [58, 18, 3, 6], [15, 3, 4, 2], [56, 3, 5, 2], [34, 17, 3, 4]],

  // door = column of the door inside the building footprint (always on the bottom row)
  buildings: [
    { id: 'farmhouse', x: 4, y: 3, w: 7, h: 5, door: 3, style: 'farmhouse', interior: 'farmhouse' },
    { id: 'store', x: 38, y: 6, w: 8, h: 6, door: 3, style: 'store', interior: 'store', lock: 'store' },
    { id: 'hall', x: 49, y: 5, w: 9, h: 7, door: 4, style: 'hall', interior: 'hall', lock: 'hall' },
    { id: 'house_odessa', x: 37, y: 31, w: 6, h: 5, door: 2, style: 'house', roof: 'plum', walls: 'cream', interior: 'house_odessa', owner: 'odessa', lock: 'house' },
    { id: 'house_wren', x: 46, y: 31, w: 6, h: 5, door: 2, style: 'house', roof: 'teal', walls: 'grey', interior: 'house_wren', owner: 'wren', lock: 'house' },
    { id: 'house_fennel', x: 55, y: 31, w: 6, h: 5, door: 2, style: 'house', roof: 'brown', walls: 'brick', interior: 'house_fennel', owner: 'fennel', lock: 'house' },
    { id: 'house_hollis', x: 34, y: 39, w: 6, h: 5, door: 2, style: 'house', roof: 'navy', walls: 'plank', interior: 'house_hollis', owner: 'hollis', lock: 'house' },
    { id: 'house_barnaby', x: 43, y: 39, w: 6, h: 5, door: 2, style: 'house', roof: 'red', walls: 'cream', interior: 'house_barnaby', owner: 'barnaby', lock: 'house' },
    { id: 'house_tib', x: 52, y: 39, w: 6, h: 5, door: 2, style: 'house', roof: 'orange', walls: 'brick', interior: 'house_tib', owner: 'tib', lock: 'house' },
  ],

  // Outdoor props. interact = what pressing E on it does (handled in game.js).
  objects: [
    { kind: 'bin', x: 9, y: 8, interact: 'bin' },
    { kind: 'workbench', x: 4, y: 8, w: 2, interact: 'craft' },
    { kind: 'well', x: 14, y: 7, interact: 'well' },
    { kind: 'bench', x: 11, y: 8, w: 2, flat: true }, // the farm bench: rest here
    { kind: 'board', x: 44, y: 14, interact: 'board' },
    { kind: 'fountain', x: 47, y: 19, w: 2, h: 2, interact: 'well' },
    { kind: 'stall', x: 52, y: 17, w: 2 },
    { kind: 'bench', x: 41, y: 21, w: 2, flat: true },
    { kind: 'bench', x: 54, y: 24, w: 2, flat: true },
    { kind: 'lamp', x: 38, y: 14, light: true },
    { kind: 'lamp', x: 57, y: 14, light: true },
    { kind: 'lamp', x: 38, y: 27, light: true },
    { kind: 'lamp', x: 57, y: 27, light: true },
    { kind: 'lamp', x: 33, y: 22, light: true },
    { kind: 'lamp', x: 26, y: 22, light: true },
    { kind: 'lamp', x: 8, y: 11, light: true },
    { kind: 'lamp', x: 45, y: 30, light: true },
    { kind: 'lamp', x: 51, y: 38, light: true },
    { kind: 'sign', x: 26, y: 9, interact: 'sign' },
    // decorations
    { kind: 'planter', x: 39, y: 14 }, { kind: 'planter', x: 56, y: 14 }, { kind: 'planter', x: 39, y: 27 }, { kind: 'planter', x: 56, y: 27 },
    { kind: 'pumpkinpile', x: 54, y: 17, w: 2 },
    { kind: 'haybale', x: 18, y: 8 }, { kind: 'haybale', x: 19, y: 8 }, { kind: 'haybale', x: 46, y: 26 },
    { kind: 'scarecrow', x: 23, y: 14 },
    { kind: 'barrel', x: 46, y: 10 }, { kind: 'crate', x: 46, y: 11 },
    { kind: 'leafpile', x: 27, y: 14, flat: true }, { kind: 'leafpile', x: 34, y: 20, flat: true }, { kind: 'leafpile', x: 59, y: 25, flat: true },
    { kind: 'leafpile', x: 11, y: 9, flat: true }, { kind: 'leafpile', x: 43, y: 33, flat: true }, { kind: 'leafpile', x: 60, y: 37, flat: true },
  ],

  // Named spots villagers walk to. face = direction they look when they arrive.
  locations: {
    board_spot: { x: 45, y: 15, face: 'left' },
    fountain_w: { x: 46, y: 20, face: 'right' },
    fountain_e: { x: 49, y: 20, face: 'left' },
    fountain_s: { x: 47, y: 21, face: 'up' },
    stall: { x: 52, y: 16, face: 'down' },
    farm_road: { x: 25, y: 18, face: 'left' },
    plaza_w: { x: 40, y: 24, face: 'right' },
    plaza_e: { x: 56, y: 21, face: 'left' },
    plaza_c: { x: 50, y: 24, face: 'down' },
    bench_w: { x: 41, y: 21, face: 'down' },
    bench_e: { x: 54, y: 24, face: 'down' },
    bridge_mid: { x: 30, y: 22, face: 'up' },
    riverbank_n: { x: 32, y: 16, face: 'left' },
    dock: { x: 32, y: 34, face: 'left' },
    store_front: { x: 42, y: 13, face: 'up' },
    hall_front: { x: 54, y: 13, face: 'up' },
  },

  // Furniture footprints (tiles). search = can be snooped. flat = drawn under characters, not solid.
  furniture: {
    bed: { w: 1, h: 2 }, cot: { w: 1, h: 2 }, stove: { w: 1, h: 1 }, table: { w: 2, h: 1 },
    chest: { w: 1, h: 1, search: true }, wardrobe: { w: 1, h: 1, search: true }, bookshelf: { w: 1, h: 1, search: true },
    plant: { w: 1, h: 1 }, rug: { w: 3, h: 2, flat: true }, shelf: { w: 3, h: 1 }, counter: { w: 4, h: 1 },
    yarnbasket: { w: 1, h: 1 }, armchair: { w: 1, h: 1 }, potterywheel: { w: 1, h: 1 }, kiln: { w: 1, h: 1 }, bust: { w: 1, h: 1 },
    gnomeshelf: { w: 1, h: 1 }, globe: { w: 1, h: 1 }, helm: { w: 1, h: 1 }, anchor: { w: 1, h: 1 }, fishtank: { w: 1, h: 1 },
    oven: { w: 1, h: 1 }, floursacks: { w: 1, h: 1 }, cabinet: { w: 1, h: 1 }, papers: { w: 1, h: 1 }, flagstand: { w: 1, h: 1 },
    barrel: { w: 1, h: 1 }, desk: { w: 2, h: 1 }, lectern: { w: 2, h: 1 }, crate: { w: 1, h: 1 },
  },

  // Interior rooms (w, h include walls: two wall rows on top, one on each side, one at the bottom).
  // The exit mat is in the bottom wall at the centre column. locs = named spots, relative to the room.
  interiors: {
    farmhouse: {
      w: 10, h: 7, wall: 'farm', floor: 'wood',
      items: [['bed', 1, 2, { interact: 'bed' }], ['stove', 8, 2], ['table', 4, 3], ['chest', 8, 4, { search: false }], ['plant', 1, 5], ['rug', 4, 4]],
      locs: {},
    },
    store: {
      w: 12, h: 8, wall: 'store', floor: 'wood',
      items: [['shelf', 1, 2], ['shelf', 8, 2], ['counter', 4, 4, { interact: 'shop' }], ['cot', 10, 4], ['barrel', 1, 5], ['crate', 1, 6]],
      locs: { counter: { x: 5, y: 3, face: 'down' }, home: { x: 9, y: 5, face: 'right' } },
    },
    hall: {
      w: 12, h: 8, wall: 'hall', floor: 'stone',
      items: [['desk', 2, 4], ['lectern', 8, 3, { interact: 'accuse' }], ['bookshelf', 10, 2, { search: false }], ['plant', 10, 6], ['rug', 5, 4]],
      locs: { desk: { x: 2, y: 3, face: 'down' } },
    },
  },

  // Every villager house uses this room template, with its own wallpaper.
  houseTemplate: {
    w: 9, h: 7, floor: 'wood',
    items: [['bed', 1, 2], ['bookshelf', 5, 2], ['wardrobe', 7, 2], ['table', 3, 4], ['chest', 7, 5], ['plant', 1, 5]],
    locs: { home: { x: 2, y: 2, face: 'left' } },
  },
  // Personal touches per house (free tiles in the template: (3,2) (4,2) (6,2) (5,4) (5,5)).
  houseExtras: {
    odessa: [['yarnbasket', 3, 2], ['armchair', 6, 2], ['plant', 5, 5]],
    wren: [['potterywheel', 3, 2], ['kiln', 6, 2], ['bust', 5, 5]],
    fennel: [['gnomeshelf', 3, 2], ['globe', 6, 2], ['papers', 5, 5]],
    hollis: [['helm', 3, 2], ['anchor', 6, 2], ['fishtank', 5, 5]],
    barnaby: [['oven', 3, 2], ['floursacks', 6, 2], ['barrel', 5, 5]],
    tib: [['cabinet', 3, 2], ['flagstand', 6, 2], ['papers', 5, 5]],
  },
  // Wandering cats: [colour, x, y, w, h] roaming rectangle.
  cats: [['ginger', 40, 15, 16, 11], ['grey', 3, 8, 20, 3]],
  houseWalls: { odessa: 'lilac', wren: 'sage', fennel: 'tweed', hollis: 'navy', barnaby: 'butter', tib: 'rose' },
};
