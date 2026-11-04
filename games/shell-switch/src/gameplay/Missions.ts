import type { Game } from '../game/Game';
import type { AreaId } from './types';

export type Target = { npc: string } | { obj: string } | { pos: [number, number, number] };

export interface Step {
  text: string;
  done: (g: Game) => boolean;
  target?: Target;
}

export interface Mission {
  id: string;
  area: AreaId;
  title: string;
  blurb: string;
  available: (g: Game) => boolean;
  steps: Step[];
  reward: string;
}

const f = (name: string) => (g: Game) => g.progress.flag(name);
const disc = (h: Parameters<Game['progress']['discovered']['has']>[0]) => (g: Game) => g.progress.discovered.has(h);
const done = (id: string) => (g: Game) => g.progress.missions.has(id);
const open = (flag: string) => (g: Game) => g.progress.flag(flag);

export const MISSIONS: Mission[] = [
  {
    id: 'S1',
    area: 'station',
    title: 'Heavy Baggage',
    blurb: 'A steamer trunk blocks the only way off Platform 1. Glim is far too small to budge it.',
    available: () => true,
    reward: 'Concourse access',
    steps: [
      { text: 'Walk up to Brick the porter and possess him (E)', done: disc('strongman'), target: { npc: 'brick' } },
      { text: 'Lift the steamer trunk out of the exit (F), then F again to set it down', done: f('trunkMoved'), target: { obj: 'trunk' } },
    ],
  },
  {
    id: 'S2',
    area: 'station',
    title: 'City Pass',
    blurb: 'The turnstiles need a City Pass, but the ticket clerk is hiding from a loiterer.',
    available: done('S1'),
    reward: 'Opens the turnstiles, Mall and Circus',
    steps: [
      { text: 'Hop out (Q) and possess Officer Pina', done: disc('police'), target: { npc: 'pina' } },
      { text: 'Blow the whistle (F) at Spike by the ticket window', done: f('spikeGone'), target: { npc: 'spike' } },
      { text: 'Talk to Mabel at the window (E)', done: f('passGranted'), target: { npc: 'mabel' } },
    ],
  },
  {
    id: 'S3',
    area: 'station',
    title: 'Newsstand Core',
    blurb: 'A Star Core landed on the newsstand roof. Guard Gertie forbids climbing.',
    available: done('S1'),
    reward: 'Star Core 1',
    steps: [
      { text: 'Get Guard Gertie to take a break', done: f('gertieBreak'), target: { npc: 'gertie' } },
      { text: 'As Brick, set a heavy crate on the marked spot', done: f('stepPlaced'), target: { obj: 'plate-step' } },
      { text: 'As Glim, jump crate → roof and grab the Star Core', done: f('core:station'), target: { obj: 'core-station' } },
    ],
  },
  {
    id: 'M1',
    area: 'mall',
    title: 'Lunch Break',
    blurb: 'Guard Waldo won\'t leave the staff corridor. He looks... hungry.',
    available: open('passGranted'),
    reward: "Velvet's lucky mic",
    steps: [
      { text: 'Possess Chef Bun in the food court', done: disc('chef'), target: { npc: 'bun' } },
      { text: 'Cook a Mega Burger at the grill (F)', done: (g) => g.hasItem('burger') || g.progress.flag('waldoFed'), target: { obj: 'stove-mall' } },
      { text: 'Give the burger to Guard Waldo (E)', done: f('waldoFed'), target: { npc: 'waldo' } },
      { text: "Find Velvet's lucky mic in the staff room", done: f('got:mic-pickup'), target: { obj: 'mic-pickup' } },
    ],
  },
  {
    id: 'M2',
    area: 'mall',
    title: 'Open Mic',
    blurb: 'Stage Manager Gus needs a crowd of four before the show can start.',
    available: done('M1'),
    reward: '5 Star Bits and adoring fans',
    steps: [
      { text: 'Possess Velvet Vox while carrying her mic', done: f('velvetMic'), target: { npc: 'velvet' } },
      { text: 'Sing (F) and lead four listeners into the stage circle', done: f('showDone'), target: { pos: [-42, 1.2, -7] } },
    ],
  },
  {
    id: 'M3',
    area: 'mall',
    title: 'Sparkle & Co.',
    blurb: 'The "Mystery Gem" in the jeweller\'s window is your Star Core. Mr. Facet never leaves his door.',
    available: open('passGranted'),
    reward: 'Star Core 2',
    steps: [
      { text: 'Lure or distract Mr. Facet away from his door', done: f('facetAway'), target: { npc: 'facet' } },
      { text: 'Pick the lock as Slink while he is busy (F)', done: f('door:sparkle'), target: { obj: 'sparkle' } },
      { text: 'Take the Mystery Gem', done: f('core:mall'), target: { obj: 'core-mall' } },
    ],
  },
  {
    id: 'C1',
    area: 'circus',
    title: 'Tough Crowd',
    blurb: 'The Big Top queue is bored. Ringmaster Rosalind won\'t open until they\'re cheering.',
    available: open('passGranted'),
    reward: 'Big Top opens',
    steps: [
      { text: 'Possess Noodle the clown', done: disc('clown'), target: { npc: 'noodle' } },
      { text: 'Perform (F) near the queue until four people watch', done: f('bigTopOpen'), target: { pos: [33, 1.2, 0] } },
    ],
  },
  {
    id: 'C2',
    area: 'circus',
    title: 'Backstage Pass',
    blurb: 'Moose the bouncer guards the ringmaster\'s trailer, keycard dangling from his belt.',
    available: open('passGranted'),
    reward: 'Cannon Fuse',
    steps: [
      { text: 'Distract Moose with a clown show', done: f('mooseDistracted'), target: { npc: 'moose' } },
      { text: 'Quick! Exit, possess Slink and pickpocket the keycard (F)', done: (g) => g.hasItem('keycard') || g.progress.flag('door:trailer'), target: { npc: 'moose' } },
      { text: 'Open the trailer and take the Cannon Fuse', done: f('got:fuse-pickup'), target: { obj: 'fuse-pickup' } },
    ],
  },
  {
    id: 'C3',
    area: 'circus',
    title: 'Shot From a Cannon',
    blurb: 'The Star Core is stuck on the trapeze platform. The ladder is "out for repairs".',
    available: (g) => g.progress.missions.has('C1') && g.progress.missions.has('C2'),
    reward: 'Star Core 3',
    steps: [
      { text: 'Install the fuse in the Big Top cannon (E)', done: f('cannonFuse'), target: { obj: 'cannon' } },
      { text: 'Bring Brick from the station to turn the cannon toward the trapeze (F)', done: f('cannonAimed'), target: { obj: 'cannon' } },
      { text: 'Climb in, launch, and grab the Star Core', done: f('core:circus'), target: { obj: 'core-circus' } },
    ],
  },
  {
    id: 'U1',
    area: 'museum',
    title: 'Lights Out',
    blurb: 'The museum lost power the night your saucer flew over. The east wing doors are dead.',
    available: (g) => g.progress.cores >= 3,
    reward: 'East wing opens',
    steps: [
      { text: 'Possess Prof. Volta in the lobby', done: disc('scientist'), target: { npc: 'volta' } },
      { text: 'Zap the generator in the utility room (F)', done: f('power'), target: { obj: 'generator' } },
    ],
  },
  {
    id: 'U2',
    area: 'museum',
    title: 'Haunted Archive',
    blurb: 'The sealed archive holds the vault lever. Iron bars, two centuries of rust, one ghost.',
    available: done('U1'),
    reward: 'Vault corridor opens',
    steps: [
      { text: 'Possess Lady Mopewell in the Hall of Armour', done: disc('ghost'), target: { npc: 'mopewell' } },
      { text: 'Phase (F) through the bars and pull the archive lever', done: f('archiveLever'), target: { obj: 'lever-archive' } },
    ],
  },
  {
    id: 'U3',
    area: 'museum',
    title: 'Meteorite Heist',
    blurb: 'Your core is on display as "The Fizzwick Meteorite", behind lasers and glass.',
    available: done('U2'),
    reward: 'Star Core 4',
    steps: [
      { text: 'Get into the security office (pick the lock… or find another way)', done: f('door:secoffice'), target: { obj: 'secoffice' } },
      { text: 'As Volta, zap the laser panel off', done: f('lasersOff'), target: { obj: 'laserpanel' } },
      { text: 'As Mopewell, phase into the case and take the core', done: f('core:museum'), target: { obj: 'core-museum' } },
    ],
  },
  {
    id: 'H1',
    area: 'cityhall',
    title: 'Red Tape',
    blurb: 'Nobody goes upstairs without a stamped permit, and the stamp machine is broken.',
    available: (g) => g.progress.cores >= 4,
    reward: 'Upstairs access',
    steps: [
      { text: 'Bring Prof. Volta and zap the stamp machine', done: f('stampFixed'), target: { obj: 'stamp' } },
      { text: 'Print a permit (E)', done: (g) => g.hasItem('permit') || g.progress.flag('permitOk'), target: { obj: 'stamp' } },
      { text: 'Hand it to Receptionist Doris', done: f('permitOk'), target: { npc: 'doris' } },
    ],
  },
  {
    id: 'H2',
    area: 'cityhall',
    title: "Bodyguard's Appetite",
    blurb: 'Tank guards the Mayor\'s office. Rumour says he\'d sell his sunglasses for a soufflé.',
    available: done('H1'),
    reward: "Mayor's office opens",
    steps: [
      { text: 'As Chef Bun, cook a Triple Soufflé in the City Hall café', done: (g) => g.hasItem('souffle') || g.progress.flag('tankFed'), target: { obj: 'stove-cityhall' } },
      { text: 'Give the soufflé to Tank upstairs', done: f('tankFed'), target: { npc: 'tank' } },
    ],
  },
  {
    id: 'H3',
    area: 'cityhall',
    title: 'Key to the City',
    blurb: 'The last Star Core sits in the City Vault. Its door opens only by mayoral decree.',
    available: done('H2'),
    reward: 'Star Core 5',
    steps: [
      { text: 'Possess Mayor Bumbleton', done: disc('mayor'), target: { npc: 'mayor' } },
      { text: 'Decree the City Vault open (F)', done: f('door:vault'), target: { obj: 'vault' } },
      { text: 'Take the Star Core', done: f('core:cityhall'), target: { obj: 'core-cityhall' } },
    ],
  },
  {
    id: 'F',
    area: 'station',
    title: 'Homeward Bound',
    blurb: 'Five Star Cores. One very dented saucer. Time to go home — or is it?',
    available: (g) => g.progress.cores >= 5,
    reward: 'The ending',
    steps: [{ text: 'Return to the saucer on Platform 1 and install the cores', done: f('saucerFixed'), target: { obj: 'saucer' } }],
  },
];

/** Index of the first unfinished step (later progress implies earlier steps). */
export function currentStep(m: Mission, g: Game): number {
  for (let i = m.steps.length - 1; i >= 0; i -= 1) if (m.steps[i].done(g)) return i + 1;
  return 0;
}
