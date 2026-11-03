// Guided objectives, in two phases. Each step is completed by the matching game event
// (steps can be done in any order; the card shows the first unfinished one).
// target: where the on-screen arrow points.
//   mat: 'farmhouse'        -> the doormat of that room (only while inside it)
//   field: true             -> the middle of the farm field
//   obj: kind               -> the first object of that kind (indoors: via the building door)
//   place: [x, y]           -> an outdoor tile
//   npc: true               -> the nearest villager
//   sparkle: true           -> the nearest clue sparkle
// visit: true -> done just by walking up to the target; then a short explanation pops up.
export const TUTORIAL = {
  // Day one: the farm loop.
  farm: [
    { id: 'exit', target: { mat: 'farmhouse' } },
    { id: 'clear', target: { field: true } },
    { id: 'till', target: { field: true } },
    { id: 'shop', target: { obj: 'counter' } },
    { id: 'plant', target: { field: true } },
    { id: 'water', target: { field: true } },
    { id: 'talk', target: { npc: true } },
    { id: 'notebook' },
    { id: 'rest', target: { obj: 'bench' } },
  ],
  // After the first gnoming: how to investigate and catch the Gnomer.
  detective: [
    { id: 'inspect', target: { sparkle: true } },
    { id: 'ask', target: { npc: true } },
    { id: 'lectern', target: { obj: 'lectern' }, visit: true },
    { id: 'craft', target: { obj: 'workbench' }, visit: true },
  ],
};
