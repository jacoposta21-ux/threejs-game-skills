/**
 * What the rival snails say. Each has a voice: Turbo brags, Shelldon is polite, Gooey Louie is
 * laid-back, Slimothy is dramatic, Escargo is a snob. Lines are keyed by moment.
 */
export type Moment = 'passYou' | 'passedBy' | 'hitYou' | 'hitBy' | 'win' | 'nemesis' | 'lastLap';

const LINES: Record<string, Record<Moment, string[]>> = {
  Turbo: {
    passYou: ['Too slow!', 'See ya, slowpoke!', 'Eat my slime!'],
    passedBy: ['Lucky gust...', 'Hey! That was MY line!', 'Not for long!'],
    hitYou: ['Bullseye!', 'Ha! Gotcha!'],
    hitBy: ['Oh, it is ON now.', 'You will pay for that!'],
    win: ['Fastest shell in the garden!'],
    nemesis: ['You and me. Let us settle this.'],
    lastLap: ['Last lap — watch me fly!'],
  },
  Shelldon: {
    passYou: ['Pardon me, coming through.', 'Excuse me!'],
    passedBy: ['Well driven!', 'Oh, nicely done.'],
    hitYou: ['Terribly sorry!', 'Oops — my apologies!'],
    hitBy: ['Was that really necessary?', 'Ouch. Rude.'],
    win: ['A gentlesnail always finishes first.'],
    nemesis: ['May the better shell win.'],
    lastLap: ['Steady now, steady...'],
  },
  'Gooey Louie': {
    passYou: ['Chill, I just slid by.', 'Wheee!'],
    passedBy: ['Go on, have fun!', 'No rush, dude.'],
    hitYou: ['Whoops, slippery fingers.', 'My bad, buddy.'],
    hitBy: ['Whoa, harsh vibes.', 'Not cool, man.'],
    win: ['Totally didn’t even try.'],
    nemesis: ['Race you, buddy!'],
    lastLap: ['Last lap? Already?'],
  },
  Slimothy: {
    passYou: ['Behold my glory!', 'The crowd adores me!'],
    passedBy: ['Betrayal! Treachery!', 'NOOOO!'],
    hitYou: ['A tragedy... for YOU!', 'Mwahaha!'],
    hitBy: ['I have been WRONGED!', 'My beautiful shell!'],
    win: ['Applause, please. More!'],
    nemesis: ['Our rivalry shall be LEGENDARY!'],
    lastLap: ['The grand finale!'],
  },
  Escargo: {
    passYou: ['Make way for royalty.', 'Hmph. Peasant.'],
    passedBy: ['How... common.', 'This is beneath me.'],
    hitYou: ['Know your place.', 'Do keep up.'],
    hitBy: ['How DARE you!', 'My crown!'],
    win: ['As expected of nobility.'],
    nemesis: ['You? Racing ME? Amusing.'],
    lastLap: ['Do try to keep up.'],
  },
};

export function line(name: string, moment: Moment, rng: () => number): string | null {
  const set = LINES[name]?.[moment];
  if (!set || set.length === 0) return null;
  return set[Math.floor(rng() * set.length) % set.length];
}

const NEMESIS_KEY = 'tooslow.nemesis.v1';

/** The rival who got the better of the player most recently. */
export function loadNemesis(): number {
  try {
    const n = Number(window.localStorage.getItem(NEMESIS_KEY));
    return n >= 1 && n <= 5 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveNemesis(index: number): void {
  try {
    window.localStorage.setItem(NEMESIS_KEY, String(index));
  } catch {
    /* no storage */
  }
}
