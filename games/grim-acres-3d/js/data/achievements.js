// Achievements. `test` receives (game, progress) and returns true once earned.
// Names/descriptions live in strings (achievement.<id>.name / .desc).
const count = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

export const ACHIEVEMENTS = [
  { id: 'first_harvest', test: (g) => g.stats.harvested >= 1 },
  { id: 'green_thumb', test: (g, p) => p.stats.harvested >= 100 },
  { id: 'pumpkin_patch', test: (g) => (g.stats.byCrop && g.stats.byCrop.pumpkin) >= 5 },
  { id: 'friend', test: (g) => [...g.npcs.values()].some((n) => n.hearts >= 3) },
  { id: 'beloved', test: (g) => [...g.npcs.values()].every((n) => n.gnomed || n.hearts >= 2) },
  { id: 'detective', test: (g) => g.mystery.found.length >= 10 },
  { id: 'snoop', test: (g) => (g.stats.snooped || 0) >= 3 },
  { id: 'guardian', test: (g) => g.mystery.attacks.some((a) => a.blocked) },
  { id: 'night_owl', test: (g) => (g.stats.scared || 0) >= 1 },
  { id: 'helper', test: (g, p) => p.stats.quests >= 5 },
  { id: 'rich', test: (g) => g.money >= 3000 },
  { id: 'angler', test: (g, p) => p.stats.fish >= 10 },
  { id: 'cat_person', test: (g, p) => p.stats.pets >= 10 },
  { id: 'case_closed', test: (g) => g.mystery.solved },
  { id: 'flawless', test: (g) => g.mystery.solved && g.mystery.victims.length === 0 },
  { id: 'hard_case', test: (g) => g.mystery.solved && g.mystery.difficulty === 'hard' },
  { id: 'all_suspects', test: (g, p) => count(p.stats.caught) >= 5 && Object.keys(p.stats.caught).length >= 5 },
];
