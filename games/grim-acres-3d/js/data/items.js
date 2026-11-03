// Item definitions. Display names and descriptions live in strings (item.<id>.name / .desc).
// type: tool | seed | crop | fish | junk | goods | charm. pack = how many you get per purchase. price = shop buy price, sell = sell/ship value.
export const ITEMS = {
  hoe:            { type: 'tool', stack: 1, energy: 2 },
  watering_can:   { type: 'tool', stack: 1, energy: 1, capacity: 20 },
  scythe:         { type: 'tool', stack: 1, energy: 1 },
  fishing_rod:    { type: 'tool', stack: 1, energy: 3, price: 150 },
  seed_turnip:    { type: 'seed', crop: 'turnip', price: 20, sell: 10, stack: 99 },
  seed_garlic:    { type: 'seed', crop: 'garlic', price: 30, sell: 15, stack: 99 },
  seed_pumpkin:   { type: 'seed', crop: 'pumpkin', price: 60, sell: 30, stack: 99 },
  seed_cranberry: { type: 'seed', crop: 'cranberry', price: 90, sell: 45, stack: 99 },
  turnip:         { type: 'crop', sell: 45, stack: 99, gift: true },
  garlic:         { type: 'crop', sell: 70, stack: 99, gift: true },
  pumpkin:        { type: 'crop', sell: 260, stack: 99, gift: true },
  cranberry:      { type: 'crop', sell: 40, stack: 99, gift: true },
  mudminnow:      { type: 'fish', sell: 25, stack: 99, gift: true },
  river_perch:    { type: 'fish', sell: 45, stack: 99, gift: true },
  silver_eel:     { type: 'fish', sell: 80, stack: 99, gift: true },
  golden_carp:    { type: 'fish', sell: 180, stack: 99, gift: true },
  // junk you fish out of the river: worth nothing, but you can ship or sell it to get rid of it
  tin_can:        { type: 'junk', sell: 0, stack: 99 },
  old_boot:       { type: 'junk', sell: 0, stack: 99 },
  soggy_paper:    { type: 'junk', sell: 0, stack: 99 },
  bait:           { type: 'goods', price: 20, pack: 5, sell: 2, stack: 99 }, // sold in packs of 5
  tea_tin:        { type: 'goods', price: 60, sell: 25, stack: 99, gift: true },
  aster_bouquet:  { type: 'goods', price: 45, sell: 15, stack: 99, gift: true },
  hard_cheese:    { type: 'goods', price: 80, sell: 30, stack: 99, gift: true },
  garlic_garland: { type: 'charm', charges: 1, stack: 99 },
  pumpkin_ward:   { type: 'charm', charges: 2, stack: 99 },
};

// What the general store sells, in display order.
export const SHOP_STOCK = ['fishing_rod', 'bait', 'seed_turnip', 'seed_garlic', 'seed_pumpkin', 'seed_cranberry', 'tea_tin', 'aster_bouquet', 'hard_cheese'];
export const BACKPACK = { price: 500, size: 25 };
export const START_INVENTORY = [['hoe', 1], ['watering_can', 1], ['scythe', 1]];
// Marigold's welcome gift, handed over free the first time you open the store.
export const STARTER_SEEDS = [['seed_turnip', 8], ['seed_garlic', 4]];
export const START_MONEY = 300;
export const START_INV_SIZE = 15;
