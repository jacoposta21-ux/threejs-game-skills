import type { HostKind } from './Archetypes';
import type { Personality } from '../gameplay/types';

type Table = Partial<Record<HostKind, Partial<Record<Personality | 'any', string[]>>>>;

/** What townsfolk say when you walk past wearing a given host. */
export const REACT: Table = {
  alien: {
    any: ['What... is THAT?', 'Is that a gummy bear with legs?', 'Did that jellybean just blink at me?', 'Somebody call the zoo. Or NASA.'],
    kid: ['A ALIEN! Can I keep it?!', 'Mom! The jellybean has an EYE!'],
    nervous: ['Nope. Nope nope nope.', 'I am not seeing this.'],
    snooty: ['Ugh. Tourists.', 'Is that... sticky?'],
    guard: ['Halt! What species are you?!', 'Hey! You! Little green... thing!'],
    sleepy: ['Must be dreaming again...'],
  },
  strongman: {
    any: ['Whoa, Brick! Lifting anything good today?', 'Those arms have their own postcode.', 'Hey Brick! Can you open this jar?'],
    kid: ['Can you lift a CAR?!', 'Flex! Flex! Flex!'],
    snooty: ['Mind the shelves, dear.'],
    guard: ['Easy there, big fella.'],
    nervous: ['P-please don\'t sit on me.'],
  },
  police: {
    any: ['Afternoon, officer!', 'Lovely hat, Officer Pepper.', 'I was jaywalking in my HEAD only, I swear.'],
    nervous: ['I didn\'t do it!', 'I\'ve never even SEEN a crime!'],
    grumpy: ['Took you long enough.'],
    kid: ['Can I blow the whistle? Please?'],
    guard: ['Officer.', 'All quiet here, ma\'am.'],
  },
  clown: {
    any: ['Ha! Do the thing with the shoes!', 'Is it squeaky? Make it squeak!', 'My cousin is afraid of you. I respect it.'],
    kid: ['NOODLE!!! Do a cartwheel!', 'Honk the nose! HONK IT!'],
    snooty: ['Ugh. A clown.', 'Please do not juggle near the merchandise.'],
    grumpy: ['Not today, clown.'],
    guard: ['No funny business, pal.'],
  },
  chef: {
    any: ['Something smells AMAZING.', 'Chef! Are you doing samples?', 'Is that soufflé or are you just happy to see me?'],
    kid: ['Can I have a cookie? Two cookies?'],
    snooty: ['Is it gluten-free?'],
    guard: ['Got anything for a hungry guard, Chef?'],
    grumpy: ['Your food court burger gave me hiccups for a week.'],
  },
  thief: {
    any: ['Hey... why are you tiptoeing?', 'I\'m keeping my hands on my pockets, thanks.', 'Didn\'t I see you on a poster?'],
    nervous: ['M-my wallet is empty! It\'s just buttons!'],
    snooty: ['Security! ...Oh, never mind.'],
    guard: ['I\'ve got my eye on you, stripes.'],
    kid: ['Are you a mime? A sneaky mime?'],
  },
  singer: {
    any: ['Velvet! Sing the one about the moon!', 'Is that Velvet Vox?!', 'Can I get an autograph? On my forehead?'],
    fan: ['VELVET!!! I LOVE YOU!', 'Sing! Sing! Sing!', '*faints dramatically*'],
    snooty: ['I prefer opera, darling.'],
    guard: ['Ma\'am, I\'m a huge fan. Professionally I can\'t show it.'],
    kid: ['Velvet, your hair is a CASTLE!'],
  },
  ghost: {
    any: ['G-G-GHOST!', 'AAAH! A see-through lady!', 'I\'ll pay my library fines, I promise!'],
    kid: ['Cool! Can you go through ME?'],
    sleepy: ['...not this dream again.'],
    guard: ['N-no haunting on duty!'],
  },
  scientist: {
    any: ['Professor! Your hair is crackling.', 'Is that coil supposed to hum like that?', 'Don\'t point that thing at me, Prof!'],
    kid: ['Make lightning! Make LIGHTNING!'],
    snooty: ['Please don\'t short-circuit my phone.'],
    guard: ['Professor. Mind the wiring.'],
  },
  mayor: {
    any: ['Mr. Mayor! Big fan of the potholes!', 'Mayor Bumbleton! Fix the fountain!', 'Vote Bumbleton! ...Wait, I didn\'t.'],
    kid: ['Are you the king?', 'Your hat is taller than my dad!'],
    snooty: ['Darling, the parking situation.'],
    guard: ['Sir! Yes sir!'],
  },
};

export function pickReact(host: HostKind, p: Personality, rng: () => number): string {
  const t = REACT[host];
  const lines = (t?.[p] && rng() < 0.65 ? t[p] : t?.any) ?? ['Hm?'];
  return lines[Math.floor(rng() * lines.length)];
}

/** When the alien is spotted fully: */
export const ALARM = ['ALIEN!!!', 'IT\'S AN ALIEN!', 'THE JELLYBEAN IS REAL!', 'SPACE INVADER!', 'RUN! IT HAS ONE EYE!'];
export const SHADY = ['Hey! What are you doing?!', 'THIEF!', 'Stop right there!', 'I saw that!'];
export const POSSESS_SEEN = ['Did that jellybean just... go INSIDE him?!', 'What just happened to her face?!', 'I need to lie down.', 'Did anyone else see that?!'];
export const DAZED = ['Huh? Where am I?', 'Why do I taste glitter?', 'I had the strangest dream...', 'Who moved me?!', 'My head feels... roomy.', 'Did I just do something weird?'];
export const WATCH = ['Ha! Bravo!', 'Again! Again!', 'Ooh!', 'Hahaha!', 'Encore!'];
export const SWOON = ['♥ Velvet ♥', 'Sooo dreamy...', 'I\'ll follow you anywhere!', 'La la laaa~'];
export const SCARED = ['AAAAH!', 'Not today, spooky!', 'I\'m too young to be haunted!', 'MOMMY!'];
export const DANCE = ['Holiday!!', 'Woo! No work today!', 'Long live the Mayor!', 'Party in the plaza!'];
export const ZAPPED = ['ZZZT! My hair!', 'I can taste colours!', 'Ow! My fillings are humming!', 'I feel... electric.'];
export const PICKED = ['Huh? My pocket feels lighter...', 'Did a breeze just steal my lint?'];

/** Idle chit-chat by personality (talking with E). */
export const CHAT: Record<Personality, string[]> = {
  cheerful: ['Lovely day in Fizzwick!', 'Did you hear? Somebody saw a saucer over the station!', 'I love this town. Even the pigeons are polite.'],
  grumpy: ['Hmph.', 'Back in my day the fountain worked.', 'The trains are late again. Typical.'],
  nervous: ['Have you seen the news? UFOs!', 'I double-locked my door. Twice.', 'Is it just me or is everyone acting strange today?'],
  snooty: ['I only shop at the Glitterbox.', 'Darling, have you SEEN the prices at Sparkle & Co.?', 'I summer in the museum gift shop.'],
  kid: ['I lost my balloon in the sky. It\'s a satellite now.', 'The circus has a CANNON!', 'Do you think aliens like ice cream?'],
  fan: ['Velvet Vox is performing at the mall! Maybe!', 'I have all of Velvet\'s albums. On cassette.'],
  guard: ['Move along.', 'Nothing to see here.', 'I\'m on duty.'],
  sleepy: ['Zzz... five more minutes...', '*snore*'],
};
