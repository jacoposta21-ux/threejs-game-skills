import type { CharacterSpec } from './CharacterModel';
import type { ExtraEffect, HostDef, MoveStats } from './Archetypes';
import type { NpcSpawn } from '../gameplay/types';

const FIRST = ['Dot', 'Wim', 'Pip', 'Mags', 'Ozzie', 'Fern', 'Lou', 'Bea', 'Gus', 'Tilda', 'Rex', 'Nell', 'Arlo', 'Ivy', 'Bert', 'Coco', 'Milo', 'Peg', 'Otis', 'Juno', 'Hal', 'Rosa', 'Ned', 'Lulu', 'Fitz', 'Wren', 'Sid', 'Opal', 'Benny', 'Hattie'];
const LAST = ['Pickle', 'Crumb', 'Fizzle', 'Buttons', 'Mallow', 'Puddle', 'Sprocket', 'Wobble', 'Tumble', 'Noodlesworth', 'Snicket', 'Doodle', 'Bramble', 'Plum', 'Kettle', 'Marmalade', 'Jitters', 'Bloop', 'Waffle', 'Gumdrop'];

interface CivKit {
  title: string;
  ability: string;
  hint: string;
  effect: ExtraEffect;
  lines: string[];
  bio: string[];
}

const CIV: Record<string, CivKit> = {
  commuter: {
    title: 'Professional Commuter',
    ability: 'Dramatic Sigh',
    hint: 'Sigh so hard that everyone nearby freezes in sympathy.',
    effect: 'freeze',
    lines: ['*SIIIIGH* The 3:15 is late again.', 'Monday. Again.'],
    bio: ['Has read the same newspaper since 2019.', 'Owns eleven identical grey coats.', 'Knows every train timetable by heart and trusts none of them.'],
  },
  shopper: {
    title: 'Bargain Hunter',
    ability: 'SALE!',
    hint: 'Shout about a sale: nearby people follow you.',
    effect: 'lure',
    lines: ['SALE! EVERYTHING MUST GO!', '70% OFF! FOLLOW ME!'],
    bio: ['Can smell a discount from three districts away.', 'Owns 40 bags and zero things to put in them.', 'Once queued overnight for a half-price spoon.'],
  },
  kid: {
    title: 'Tiny Tornado',
    ability: 'Tantrum',
    hint: 'Throw a tantrum: every grown-up nearby comes to watch.',
    effect: 'show',
    lines: ['I WANT A BALLOOOON!', 'It\'s NOT naptime! WAAAH!'],
    bio: ['Has asked "why?" 4,000 times today.', 'Believes the fountain grants wishes. Is correct, probably.', 'Wants to be an astronaut, a dinosaur, or both.'],
  },
  tourist: {
    title: 'Enthusiastic Tourist',
    ability: 'Flash Photo',
    hint: 'Snap a photo: people in front of you are dazzled.',
    effect: 'flash',
    lines: ['Say cheese!', 'One more! The light was wrong!'],
    bio: ['Has taken 900 photos of the same statue.', 'Came for a day trip in 2021. Never left.', 'Their sunhat has its own fan club.'],
  },
  elder: {
    title: 'Fizzwick Old-Timer',
    ability: 'Bedtime Story',
    hint: 'Tell a very long story: listeners nearby nod off.',
    effect: 'nap',
    lines: ['Back in my day, the trains ran on steam and gossip...', 'Did I ever tell you about the Great Pudding Flood?'],
    bio: ['Remembers when the fountain was a puddle.', 'Has opinions about every bench in town.', 'Once beat the Mayor at checkers. Mentions it daily.'],
  },
  fan: {
    title: 'Velvet Superfan',
    ability: 'Chant',
    hint: 'Start a chant: other people nearby join and follow you.',
    effect: 'lure',
    lines: ['VEL-VET! VEL-VET!', 'Encore! ENCORE!'],
    bio: ['Has a Velvet Vox tattoo. It\'s temporary. It\'s been three years.', 'Knows every lyric, including the ones Velvet forgot.', 'Camps outside the mall "just in case".'],
  },
  artsy: {
    title: 'Avant-Garde Artist',
    ability: 'Interpretive Dance',
    hint: 'Perform an interpretive dance: a confused crowd gathers.',
    effect: 'show',
    lines: ['This dance is about tax forms.', 'Feel the... beige.'],
    bio: ['Their latest sculpture is a chair that refuses to be sat on.', 'Paints exclusively in the colour "Tuesday".', 'Sold one painting. To their mum.'],
  },
};

const NAMED_KIT: Record<string, Omit<CivKit, 'bio'> & { bio: string }> = {
  spike: { title: 'Local Menace', ability: 'Glitter Tag', hint: 'Spray glitter paint everywhere. People complain loudly.', effect: 'spray', lines: ['SPIKE WOZ ERE!', 'It\'s ART, okay?!'], bio: 'Paints his name on everything, including, once, a pigeon.' },
  mabel: { title: 'Ticket Clerk', ability: 'Announcement', hint: 'Make a station announcement: people nearby stop and listen.', effect: 'show', lines: ['Ding-dong! The 3:15 is cancelled. Forever.', 'Attention please! Nobody panic!'], bio: 'Has sold tickets for 30 years and never once taken a train.' },
  gertie: { title: 'Station Guard', ability: 'HALT!', hint: 'Shout HALT: loiterers and rule-breakers move along.', effect: 'halt', lines: ['HALT! In the name of Platform 1!', 'No running! No climbing! No fun!'], bio: 'Has written 4,000 tickets for climbing. Mostly to pigeons.' },
  waldo: { title: 'Mall Security', ability: 'Security!', hint: 'Bark an order: people in front of you scatter.', effect: 'halt', lines: ['MALL SECURITY! Move it!', 'This is a no-loitering zone!'], bio: 'Guards the staff door with his life, and his lunch with more.' },
  facet: { title: 'Jeweller', ability: 'Appraise', hint: 'Appraise the nearest person. They are not flattered.', effect: 'bark', lines: ['Hmm. Two carats of charm, at most.', 'Costume jewellery. How quaint.'], bio: 'Can price a diamond by sniffing it. Nobody knows how.' },
  gus: { title: 'Stage Manager', ability: 'Places, Everyone!', hint: 'Call places: people nearby follow you to the stage.', effect: 'lure', lines: ['PLACES, PEOPLE! Show in five!', 'Follow me, audience!'], bio: 'Has never seen a show from the front. Prefers it that way.' },
  rosalind: { title: 'Ringmaster', ability: 'Roll Up!', hint: 'Announce a show: a crowd gathers around you.', effect: 'show', lines: ['ROLL UP, ROLL UP!', 'The greatest show in Fizzwick!'], bio: 'Owns 14 top hats, one for each mood.' },
  moose: { title: 'Bouncer', ability: 'Not On The List', hint: 'Fold your arms: people in front of you back away.', effect: 'halt', lines: ['You\'re not on the list.', 'Moose says no.'], bio: 'Secretly cries at every trapeze act.' },
  tilly: { title: 'Ticket Lady', ability: 'Cartwheel', hint: 'Cartwheel around: people nearby stop to watch.', effect: 'show', lines: ['Wheeee!', 'Ta-daa! Tickets!'], bio: 'Joined the circus at six. Still waiting for her first big act.' },
  otto: { title: 'Night Watchman', ability: 'Flashlight', hint: 'Shine your flashlight: people in front of you are dazzled.', effect: 'flash', lines: ['Who goes there?!', 'Nothing to see here... I think.'], bio: 'Has slept through three burglaries and a brass band.' },
  orla: { title: 'Museum Curator', ability: 'Lecture', hint: 'Give a lecture on ancient spoons: listeners nearby fall asleep.', effect: 'nap', lines: ['Now, regarding the history of the teaspoon...', 'Chapter one of seventy-two...'], bio: 'Knows the backstory of every potato in the museum.' },
  doris: { title: 'Receptionist', ability: 'Rubber Stamp', hint: 'Stamp everything: people nearby freeze, waiting for paperwork.', effect: 'freeze', lines: ['DENIED! ...wait, APPROVED!', 'Form 27-B, in triplicate!'], bio: 'Has stamped 2 million forms. Has read none of them.' },
  tank: { title: 'Bodyguard', ability: 'Loom', hint: 'Loom menacingly: people in front of you back away.', effect: 'halt', lines: ['...', 'Tank is watching.'], bio: 'Bench-presses the Mayor for exercise. The Mayor has not been told.' },
};

const EXTRA_STATS: MoveStats = { speed: 3.8, run: 6.2, accel: 18, jump: 6.4, gravity: 1 };
const KID_STATS: MoveStats = { speed: 4.4, run: 7.0, accel: 24, jump: 7.0, gravity: 1 };

/** A possessable "extra" for any townsperson who is not a story host. */
export function extraDefFor(spawn: NpcSpawn, spec: CharacterSpec, namedName: string | null, seed: number): HostDef {
  const pick = <T>(arr: T[], k: number): T => arr[Math.abs(Math.floor(k)) % arr.length];
  if (spawn.named && NAMED_KIT[spawn.named]) {
    const k = NAMED_KIT[spawn.named];
    return {
      id: 'extra',
      extra: { effect: k.effect, lines: k.lines },
      name: namedName ?? spawn.named,
      title: k.title,
      bio: k.bio,
      ability: k.ability,
      abilityHint: k.hint,
      color: spec.torso.color,
      stats: EXTRA_STATS,
      voice: 1,
      spec,
    };
  }
  const kit = CIV[spawn.civ ?? 'shopper'] ?? CIV.shopper;
  const name = `${pick(FIRST, seed * 7 + 3)} ${pick(LAST, seed * 13 + 5)}`;
  return {
    id: 'extra',
    extra: { effect: kit.effect, lines: kit.lines },
    name,
    title: kit.title,
    bio: pick(kit.bio, seed),
    ability: kit.ability,
    abilityHint: kit.hint,
    color: spec.torso.color,
    stats: spawn.civ === 'kid' ? KID_STATS : EXTRA_STATS,
    voice: spawn.civ === 'kid' ? 1.6 : 1,
    spec,
  };
}
