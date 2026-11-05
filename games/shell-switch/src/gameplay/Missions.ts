import type { Game } from '../game/Game';
import type { HostKind } from '../characters/Archetypes';
import type { AreaId } from './types';

export type Target = { npc: string } | { obj: string } | { pos: [number, number, number] };

export interface Step {
  text: string;
  done: (g: Game) => boolean;
  target?: Target;
  /** Who can do this step. 'alien' means "as Glim" (hop out with Q first). Empty = anyone. */
  hosts?: HostKind[];
  /** Three escalating hints: nudge, method, full solution. */
  hints: [string, string, string];
  /** Live counter shown after the step text, e.g. "2/4". */
  progress?: (g: Game) => string | null;
}

export interface Mission {
  id: string;
  area: AreaId;
  title: string;
  blurb: string;
  available: (g: Game) => boolean;
  /** Shown in the tracker/journal while the mission is still locked. */
  lockedHint: string;
  steps: Step[];
  reward: string;
}

const f = (name: string) => (g: Game) => g.progress.flag(name);
const disc = (h: HostKind) => (g: Game) => g.progress.discovered.has(h);
const done = (id: string) => (g: Game) => g.progress.missions.has(id);
const open = (flag: string) => (g: Game) => g.progress.flag(flag);

export const MISSIONS: Mission[] = [
  {
    id: 'S1',
    area: 'station',
    title: 'Heavy Baggage',
    blurb: 'A steamer trunk blocks the only exit off Platform 1. Glim is far too small to budge it.',
    available: () => true,
    lockedHint: '',
    reward: 'Concourse access',
    steps: [
      {
        text: 'Walk up to Brick, the big porter, and press E to hop inside him',
        done: disc('strongman'),
        target: { npc: 'brick' },
        hosts: ['alien'],
        hints: [
          'Brick is the striped porter near the purple trunk.',
          'Get close until the prompt says "Possess Brick Mulligan", then press E.',
          'Walk right next to Brick and press E. Glim jumps inside him.',
        ],
      },
      {
        text: 'As Brick, press F next to the purple trunk to lift it, walk away from the exit, press F again to put it down',
        done: f('trunkMoved'),
        target: { obj: 'trunk' },
        hosts: ['strongman'],
        hints: [
          'Only Brick is strong enough. The trunk sits in the gap of the low wall.',
          'Stand next to the trunk until the prompt says "Lift steamer trunk", then press F.',
          'Lift it with F, take a few steps back onto the platform, press F again. The exit is free.',
        ],
      },
    ],
  },
  {
    id: 'S2',
    area: 'station',
    title: 'City Pass',
    blurb: 'The turnstiles need a City Pass, but the ticket clerk is hiding from a rude loiterer.',
    available: done('S1'),
    lockedHint: 'Finish "Heavy Baggage" first.',
    reward: 'Opens the turnstiles, the Mall and the Circus',
    steps: [
      {
        text: 'Press Q to hop out of Brick, then possess Officer Pina in the concourse',
        done: disc('police'),
        target: { npc: 'pina' },
        hosts: ['alien'],
        hints: [
          'Officer Pina wears a tall blue police hat and walks around the concourse.',
          'Hop out with Q, go through the exit you just cleared and get close to Pina.',
          'Q to hop out → walk to Pina → E to possess her.',
        ],
      },
      {
        text: 'Stand facing Spike (green mohawk, by the ticket window) and press F to blow the whistle',
        done: f('spikeGone'),
        target: { npc: 'spike' },
        hosts: ['police', 'ghost', 'singer'],
        hints: [
          'Spike ignores everyone except authority.',
          'The whistle only works on people in front of you, within a few steps.',
          'As Pina, face Spike from 2–3 steps away and press F. He storms off to a bench.',
        ],
      },
      {
        text: 'Talk to Mabel at the ticket window (E) to get the City Pass',
        done: f('passGranted'),
        target: { npc: 'mabel' },
        hints: [
          'Mabel comes back to her window once Spike is gone.',
          'Walk up to Mabel; the prompt says "Talk to Mabel".',
          'Press E next to Mabel. She hands over the City Pass and the turnstiles open.',
        ],
      },
    ],
  },
  {
    id: 'S3',
    area: 'station',
    title: 'Newsstand Core',
    blurb: 'A Star Core landed on the roof of the green newsstand. Guard Gertie forbids climbing.',
    available: done('S1'),
    lockedHint: 'Finish "Heavy Baggage" first.',
    reward: 'Star Core 1',
    steps: [
      {
        text: 'As Officer Pina, whistle (F) at Guard Gertie by the newsstand to send her on a break',
        done: f('gertieBreak'),
        target: { npc: 'gertie' },
        hosts: ['police', 'ghost'],
        hints: [
          'Gertie only takes orders from the police.',
          'Possess Officer Pina and stand in front of Gertie.',
          'As Pina, face Gertie up close and press F. She leaves for a bench.',
        ],
      },
      {
        text: 'As Brick, carry a heavy wooden crate (red strap) from the platform onto the yellow dashed pad',
        done: f('stepPlaced'),
        target: { obj: 'plate-step' },
        hosts: ['strongman'],
        progress: (g) => (g.carrying ? 'carrying' : null),
        hints: [
          'Glim cannot jump onto the roof from the ground. It needs a step.',
          'The wooden crates are on the platform near the baggage. Brick lifts them with F.',
          'Possess Brick → F next to a wooden crate → walk to the yellow pad in front of the newsstand → F to set it down.',
        ],
      },
      {
        text: 'As Glim, jump onto the crate, then onto the roof, and grab the Star Core (E)',
        done: f('core:station'),
        target: { obj: 'core-station' },
        hosts: ['alien', 'clown'],
        hints: [
          'Glim is the best jumper. Hop out of Brick first (Q).',
          'Stand right behind the crate, then hold forward and press Space twice: crate, then roof.',
          'Jump onto the crate, jump again toward the newsstand, then press E next to the glowing core.',
        ],
      },
    ],
  },
  {
    id: 'M1',
    area: 'mall',
    title: 'Lunch Break',
    blurb: 'Guard Waldo will not leave the staff door. He looks very, very hungry.',
    available: open('passGranted'),
    lockedHint: 'Get the City Pass at the station ("City Pass").',
    reward: "Velvet's lucky mic",
    steps: [
      {
        text: 'Possess Chef Bun in the food court (south-west corner of the mall)',
        done: disc('chef'),
        target: { npc: 'bun' },
        hosts: ['alien'],
        hints: [
          'Chef Bun wears a huge white chef hat.',
          'Enter the mall from Fountain Square (west street) and head to the food court.',
          'Walk up to Chef Bun as Glim and press E.',
        ],
      },
      {
        text: 'As Chef Bun, press F at the grill to cook a Mega Burger',
        done: (g) => g.hasItem('burger') || g.progress.flag('waldoFed'),
        target: { obj: 'stove-mall' },
        hosts: ['chef'],
        hints: [
          "The grill is behind the yellow counter of Bun's Burgers.",
          'Stand close to the grill until the prompt says "Cook Mega Burger".',
          'As Chef Bun, press F at the grill and wait two seconds.',
        ],
      },
      {
        text: 'Give the burger to Guard Waldo at the staff door (E)',
        done: f('waldoFed'),
        target: { npc: 'waldo' },
        hints: [
          'Waldo guards the STAFF ONLY door on the south wall.',
          'Anyone carrying the burger can hand it over.',
          'Walk up to Waldo and press E ("Give Mega Burger"). He goes to eat at a table.',
        ],
      },
      {
        text: "Go through the staff door and pick up Velvet's lucky mic (E)",
        done: f('got:mic-pickup'),
        target: { obj: 'mic-pickup' },
        hints: [
          'The staff room is behind the door Waldo was guarding.',
          'The mic floats on a purple box in the middle of the staff room.',
          'Walk through the door and press E next to the microphone.',
        ],
      },
    ],
  },
  {
    id: 'M2',
    area: 'mall',
    title: 'Open Mic',
    blurb: 'Stage Manager Gus needs four people in the pink audience circle before the show can start.',
    available: done('M1'),
    lockedHint: 'Finish "Lunch Break" first (you need the mic).',
    reward: '5 Star Bits and adoring fans',
    steps: [
      {
        text: 'Possess Velvet Vox on the stage while you carry her mic',
        done: f('velvetMic'),
        target: { npc: 'velvet' },
        hosts: ['alien'],
        hints: [
          'Velvet has a tall pink beehive and stands on the purple stage.',
          'The stage is a little step up: jump onto it as Glim.',
          'Hop out (Q), jump onto the stage, press E next to Velvet.',
        ],
      },
      {
        text: 'Sing (F) near shoppers so they follow you, then stand inside the pink circle until four listeners gather',
        done: f('showDone'),
        target: { pos: [-42, 1.2, -7] },
        hosts: ['singer'],
        progress: (g) => `${g.stageAudience()}/4 listening`,
        hints: [
          'People who hear Velvet sing follow her while the song lasts (about 12 seconds).',
          'Start singing near the fans in the middle of the mall, then walk slowly into the pink circle.',
          'Press F next to a group of shoppers, walk into the pink circle while singing, wait. If the song ends, press F again.',
        ],
      },
    ],
  },
  {
    id: 'M3',
    area: 'mall',
    title: 'Sparkle & Co.',
    blurb: 'The "Mystery Gem" in the jeweller\'s window is your Star Core. Mr. Facet never leaves his door.',
    available: open('passGranted'),
    lockedHint: 'Get the City Pass at the station ("City Pass").',
    reward: 'Star Core 2',
    steps: [
      {
        text: 'Lure Mr. Facet away from his door: sing as Velvet, or perform as Noodle the clown',
        done: f('facetAway'),
        target: { npc: 'facet' },
        hosts: ['singer', 'clown'],
        hints: [
          'Facet loves music and shows. Nothing else moves him.',
          'Velvet works (after "Lunch Break"), or bring Noodle the clown from the Circus.',
          'As Velvet, press F next to Facet and walk a few steps away: he follows you.',
        ],
      },
      {
        text: 'Quick! Hop out and possess Slink the thief, then pick the lock (F). Bring Slink from the Circus beforehand',
        done: f('door:sparkle'),
        target: { obj: 'sparkle' },
        hosts: ['thief'],
        hints: [
          'Only Slink can pick locks. He lives at the Circus, so walk him over to the mall first and leave him near the shop.',
          'Velvet keeps singing for a few seconds after you hop out, so Facet stays distracted.',
          'Park Slink near the shop → lure Facet with Velvet → Q → possess Slink → F at the door.',
        ],
      },
      {
        text: 'Go inside and take the Mystery Gem (E)',
        done: f('core:mall'),
        target: { obj: 'core-mall' },
        hints: ['The gem sits on the golden pedestal.', 'Walk into the shop.', 'Press E next to the glowing gem.'],
      },
    ],
  },
  {
    id: 'C1',
    area: 'circus',
    title: 'Tough Crowd',
    blurb: 'The Big Top queue is bored. Ringmaster Rosalind will not open until they are cheering.',
    available: open('passGranted'),
    lockedHint: 'Get the City Pass at the station ("City Pass").',
    reward: 'Big Top opens',
    steps: [
      {
        text: 'Possess Noodle the clown (by the purple juggling stand)',
        done: disc('clown'),
        target: { npc: 'noodle' },
        hosts: ['alien'],
        hints: ['Noodle has huge red shoes and orange hair puffs.', 'He practises near the purple stand, north-west of the Big Top.', 'Walk up to Noodle as Glim and press E.'],
      },
      {
        text: 'Stand right next to the queue by the Big Top entrance and perform (F) until four people watch',
        done: f('bigTopOpen'),
        target: { pos: [33, 1.2, 0] },
        hosts: ['clown'],
        progress: (g) => `${g.queueWatchers()}/4 watching`,
        hints: [
          'The queue waits behind the red rope in front of the big striped tent.',
          'The show only counts if Noodle performs within a few steps of the queue.',
          'As Noodle, stand next to the red rope and press F. Press F again if the show ends.',
        ],
      },
    ],
  },
  {
    id: 'C2',
    area: 'circus',
    title: 'Backstage Pass',
    blurb: "Moose the bouncer guards the ringmaster's blue trailer, keycard on his belt.",
    available: open('passGranted'),
    lockedHint: 'Get the City Pass at the station ("City Pass").',
    reward: 'Cannon Fuse',
    steps: [
      {
        text: 'As Noodle, perform (F) right next to Moose at the blue trailer',
        done: f('mooseDistracted'),
        target: { npc: 'moose' },
        hosts: ['clown', 'ghost'],
        hints: ['Moose cannot resist a good show.', 'The trailer is in the south-west corner of the fairground.', 'Walk Noodle up to Moose and press F.'],
      },
      {
        text: 'While he watches: Q to hop out, possess Slink, sneak up and pickpocket Moose (F)',
        done: (g) => g.hasItem('keycard') || g.progress.flag('door:trailer'),
        target: { npc: 'moose' },
        hosts: ['thief'],
        hints: [
          'Noodle keeps performing for a while after you hop out.',
          'Bring Slink close to the trailer before starting the show, so the swap is quick.',
          'Show with Noodle → Q → possess Slink → walk to Moose → F ("Pickpocket").',
        ],
      },
      {
        text: 'Open the trailer with the keycard (E) and take the Cannon Fuse',
        done: f('got:fuse-pickup'),
        target: { obj: 'fuse-pickup' },
        hints: ['The keycard opens the trailer door.', 'Press E at the door, then go in.', 'E at the trailer door, then E next to the red fuse.'],
      },
    ],
  },
  {
    id: 'C3',
    area: 'circus',
    title: 'Shot From a Cannon',
    blurb: 'The Star Core is stuck on the trapeze platform. The ladder is "out for repairs".',
    available: (g) => g.progress.missions.has('C1') && g.progress.missions.has('C2'),
    lockedHint: 'Finish "Tough Crowd" and "Backstage Pass" first.',
    reward: 'Star Core 3',
    steps: [
      {
        text: 'Inside the Big Top, install the fuse in the cannon (E)',
        done: f('cannonFuse'),
        target: { obj: 'cannon' },
        hints: ['The cannon is inside the big tent, left of the ring.', 'You need the Cannon Fuse from the trailer.', 'Walk to the cannon and press E.'],
      },
      {
        text: 'Walk Brick over from the Station and turn the cannon (F) until it aims at the trapeze platform',
        done: f('cannonAimed'),
        target: { obj: 'cannon' },
        hosts: ['strongman'],
        progress: (g) => (g.progress.flag('cannonAimed') ? 'aimed' : null),
        hints: [
          'Only Brick can turn the heavy cannon. Possess him and walk him all the way to the Circus.',
          'Each F turns the cannon to the next target. The prompt shows where it will point.',
          'As Brick at the cannon, press F until the prompt says it aims at the trapeze platform.',
        ],
      },
      {
        text: 'Climb in (E) to fly to the trapeze platform, then grab the Star Core',
        done: f('core:circus'),
        target: { obj: 'core-circus' },
        hints: ['Anyone can ride the cannon. Glim is the classic choice.', 'Hop out of Brick and press E at the cannon.', 'E at the cannon → land on the platform → E next to the core.'],
      },
    ],
  },
  {
    id: 'U1',
    area: 'museum',
    title: 'Lights Out',
    blurb: 'The museum lost power the night your saucer flew over. The east wing doors are dead.',
    available: (g) => g.progress.cores >= 3,
    lockedHint: 'The museum gate opens when you have 3 Star Cores.',
    reward: 'East wing opens',
    steps: [
      {
        text: 'Possess Prof. Volta (white frizzy hair, lab coat) in the museum lobby',
        done: disc('scientist'),
        target: { npc: 'volta' },
        hosts: ['alien'],
        hints: ['Volta walks around the lobby near the pedestals.', 'Enter the museum from the street north-west of Fountain Square.', 'Walk up to Volta as Glim and press E.'],
      },
      {
        text: 'Go into the UTILITY room (west side of the lobby) and zap the generator (F)',
        done: f('power'),
        target: { obj: 'generator' },
        hosts: ['scientist'],
        hints: ['The generator is a blue machine with a red light.', 'The utility room door is on the left wall of the lobby, under the yellow UTILITY sign.', 'As Volta, stand next to the generator and press F.'],
      },
    ],
  },
  {
    id: 'U2',
    area: 'museum',
    title: 'Haunted Archive',
    blurb: 'The sealed archive holds the vault lever. Iron bars, two centuries of rust, one ghost.',
    available: done('U1'),
    lockedHint: 'Restore the museum power first ("Lights Out").',
    reward: 'Vault corridor opens',
    steps: [
      {
        text: 'Possess Lady Mopewell, the ghost in the Hall of Armour (behind the doors you just powered)',
        done: disc('ghost'),
        target: { npc: 'mopewell' },
        hosts: ['alien'],
        hints: ['She floats among the suits of armour.', 'The Hall of Armour is through the double doors at the back of the lobby.', 'Walk up to the ghost as Glim and press E.'],
      },
      {
        text: 'Press F to turn see-through, drift through the glowing bars on the left wall, and pull the lever (E)',
        done: f('archiveLever'),
        target: { obj: 'lever-archive' },
        hosts: ['ghost'],
        hints: ['Ghosts pass through the blue glowing bars, but only while phasing.', 'Phasing lasts a few seconds. Face the bars before pressing F.', 'Face the bars → F → walk through → E at the red-handled lever.'],
      },
    ],
  },
  {
    id: 'U3',
    area: 'museum',
    title: 'Meteorite Heist',
    blurb: 'Your core is on display as "The Fizzwick Meteorite", behind lasers and glass.',
    available: done('U2'),
    lockedHint: 'Pull the archive lever first ("Haunted Archive").',
    reward: 'Star Core 4',
    steps: [
      {
        text: 'Get into the SECURITY office: pick the lock as Slink, or crawl in as Glim through the vent in the dinosaur gallery and open it from inside',
        done: f('door:secoffice'),
        target: { obj: 'secoffice' },
        hosts: ['thief', 'alien'],
        hints: [
          'There are two ways in. Slink picks locks; Glim fits through vents.',
          'The vent is low on the wall of the dinosaur gallery (go through the utility room).',
          'As Glim: utility room → dinosaur gallery → vent → press E at the door from inside.',
        ],
      },
      {
        text: 'As Prof. Volta, zap the laser panel inside the security office (F)',
        done: f('lasersOff'),
        target: { obj: 'laserpanel' },
        hosts: ['scientist'],
        hints: ['The panel is a grey box with coloured buttons.', 'Only Volta can switch it off, and only with the power on.', 'Possess Volta, walk into the security office, F at the panel.'],
      },
      {
        text: 'As the ghost, go through the vault corridor to the meteor room, phase (F) into the glass case and take the core',
        done: f('core:museum'),
        target: { obj: 'core-museum' },
        hosts: ['ghost'],
        hints: [
          'Only a ghost can reach inside the glass case.',
          'The vault corridor opens from the Hall of Armour (round vault door).',
          'As Mopewell: vault corridor → meteor room → face the case → F → walk in → E.',
        ],
      },
    ],
  },
  {
    id: 'H1',
    area: 'cityhall',
    title: 'Red Tape',
    blurb: 'Nobody goes upstairs without a stamped permit, and the stamp machine is broken.',
    available: (g) => g.progress.cores >= 4,
    lockedHint: 'City Hall opens when you have 4 Star Cores.',
    reward: 'Upstairs access',
    steps: [
      {
        text: 'Walk Prof. Volta over from the Museum and zap the purple stamp machine (F)',
        done: f('stampFixed'),
        target: { obj: 'stamp' },
        hosts: ['scientist'],
        hints: ['Only Volta can fix machines.', 'The stamp machine is in the City Hall lobby, left of the entrance.', 'Possess Volta, walk her to City Hall, F at the stamp machine.'],
      },
      {
        text: 'Print a permit at the stamp machine (E)',
        done: (g) => g.hasItem('permit') || g.progress.flag('permitOk'),
        target: { obj: 'stamp' },
        hints: ['The machine works now.', 'Anyone can press the button.', 'Press E at the stamp machine.'],
      },
      {
        text: 'Hand the permit to Receptionist Doris at the desk (E)',
        done: f('permitOk'),
        target: { npc: 'doris' },
        hints: ['Doris sits behind the reception desk.', 'Walk up to her with the permit.', 'Press E next to Doris. The velvet rope by the stairs drops.'],
      },
    ],
  },
  {
    id: 'H2',
    area: 'cityhall',
    title: "Bodyguard's Appetite",
    blurb: "Tank guards the Mayor's office upstairs. He would sell his sunglasses for a soufflé.",
    available: done('H1'),
    lockedHint: 'Get past the velvet rope first ("Red Tape").',
    reward: "Mayor's office opens",
    steps: [
      {
        text: 'Walk Chef Bun over from the Mall and cook a Triple Soufflé in the Civic Café oven (F)',
        done: (g) => g.hasItem('souffle') || g.progress.flag('tankFed'),
        target: { obj: 'stove-cityhall' },
        hosts: ['chef'],
        hints: ['Only Chef Bun can cook.', 'The Civic Café is in the front-left corner of the City Hall lobby.', 'Possess Bun, walk him to City Hall, F at the café oven.'],
      },
      {
        text: 'Go up the red stairs and give the soufflé to Tank (E)',
        done: f('tankFed'),
        target: { npc: 'tank' },
        hints: ['Tank stands in front of the Mayor\'s office upstairs.', 'Anyone carrying the soufflé can give it.', 'Climb the stairs on the right, press E next to Tank.'],
      },
    ],
  },
  {
    id: 'H3',
    area: 'cityhall',
    title: 'Key to the City',
    blurb: 'The last Star Core sits in the City Vault. Its door opens only by mayoral decree.',
    available: done('H2'),
    lockedHint: 'Feed Tank first ("Bodyguard\'s Appetite").',
    reward: 'Star Core 5',
    steps: [
      {
        text: "Possess Mayor Bumbleton in his office upstairs",
        done: disc('mayor'),
        target: { npc: 'mayor' },
        hosts: ['alien'],
        hints: ['The Mayor wears a top hat and a red sash.', 'His office is upstairs, behind where Tank stood.', 'Walk into the office as Glim and press E next to the Mayor.'],
      },
      {
        text: 'Walk the Mayor down to the round golden vault door and decree it open (F)',
        done: f('door:vault'),
        target: { obj: 'vault' },
        hosts: ['mayor'],
        hints: ['Only the Mayor can open the vault.', 'The vault is on the left side of the ground floor, under the balcony.', 'As the Mayor, stand at the vault door and press F.'],
      },
      {
        text: 'Take the Star Core from the vault (E)',
        done: f('core:cityhall'),
        target: { obj: 'core-cityhall' },
        hints: ['The core floats inside the vault.', 'Walk in.', 'Press E next to the core.'],
      },
    ],
  },
  {
    id: 'F',
    area: 'station',
    title: 'Homeward Bound',
    blurb: 'Five Star Cores. One very dented saucer. Time to go home — or is it?',
    available: (g) => g.progress.cores >= 5,
    lockedHint: 'Collect all 5 Star Cores.',
    reward: 'The ending',
    steps: [
      {
        text: 'Return to your crashed saucer on Platform 1 and install the cores (E)',
        done: f('saucerFixed'),
        target: { obj: 'saucer' },
        hints: ['The saucer is where you started, on the station platform.', 'Walk back to the Station.', 'Press E next to the saucer.'],
      },
    ],
  },
];

/** Index of the first unfinished step (later progress implies earlier steps). */
export function currentStep(m: Mission, g: Game): number {
  for (let i = m.steps.length - 1; i >= 0; i -= 1) if (m.steps[i].done(g)) return i + 1;
  return 0;
}
