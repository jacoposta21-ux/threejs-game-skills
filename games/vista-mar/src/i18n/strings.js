// Story text table. Every line the story shows lives here, keyed by mission,
// so new languages can be added as sibling tables (e.g. STRINGS.it) later.

export const LANG = 'en';

export const STRINGS = {
  en: {
    m03: {
      title: 'MISSION 03 — NEON MILE MANNERS',
      giver: 'Rico Alvarez · Neon Mile',
      intro: [
        ['RICO', 'You heard of Victor Kane? Builds hotels by day, buys the rest of the city by night.'],
        ['RICO', 'His boys are leaning on the Neon Mile bars for "protection money". My cousin\'s bar is one of them.'],
        ['LEO', 'And you want me to explain to them that the Mile is not for sale.'],
        ['RICO', 'Politely. With your fists. Left click to punch, right click or V to kick.'],
      ],
      go: 'Go to the Starlite bar on Neon Mile',
      fight: (n) => `Teach Kane's boys some manners · ${n} left`,
      pass: ['RICO', '"Kane will hear about this. Good. If you want real hardware, Sunline Arms on Palm Boulevard sells it."'],
    },
    m04: {
      title: 'MISSION 04 — PAPER TRAIL',
      giver: 'Dana Reyes · Club Velvet',
      intro: [
        ['DANA', 'So you are the one who put three of Kane\'s men on the pavement. I am Dana. I run the Mile.'],
        ['DANA', 'Every Friday a courier carries Kane\'s ledgers to the port. Who he pays, which cops, which councilmen.'],
        ['DANA', 'Follow him. Not too close, he checks his mirrors. When he stops, take the case.'],
        ['LEO', 'And then?'],
        ['DANA', 'Then we stop being afraid of Victor Kane.'],
      ],
      car: 'Get in the car Dana left for you',
      tail: (d) => `Tail the courier · ${d} m · stay between 15 and 90 m`,
      tooClose: 'He spotted you.',
      lost: 'You lost the courier.',
      grab: 'Take the briefcase from the courier',
      pick: 'Pick up the briefcase',
      back: 'Bring the ledgers to Dana at Club Velvet',
      pass: ['DANA', '"Names, numbers, dates. Kane kept receipts. Now so do we."'],
    },
    m05: {
      title: 'MISSION 05 — DOCKSIDE',
      giver: 'Dana Reyes · Club Velvet',
      intro: [
        ['DANA', 'The ledgers say a shipment lands tonight at the container yard. Kane\'s money, in a van.'],
        ['DANA', 'His guards carry guns. Take this pistol. Right click to aim, left click to fire, R to reload.'],
        ['LEO', 'I take out the guards, I take the van.'],
        ['DANA', 'And you bring it to the Spray & Go before anyone reads the plates.'],
      ],
      go: 'Go to the container yard in Port Industrial',
      fight: (n) => `Take out Kane's guards · ${n} left`,
      van: 'Steal the shipment van',
      deliver: (h) => `Bring the van to the Spray & Go garage · condition ${h}%`,
      pass: ['DANA', '"That van is going to pay a lot of honest salaries. Haskins at VMPD wants to meet you."'],
    },
    m06: {
      title: 'MISSION 06 — WRONG DELIVERIES',
      giver: 'Officer Haskins · VMPD Headquarters',
      intro: [
        ['HASKINS', 'Relax. If I wanted you arrested you would be in a cell already.'],
        ['HASKINS', 'Kane has three delivery vans parked around town. Evidence of things I would rather nobody found.'],
        ['HASKINS', 'Make them disappear. Shoot them, ram them, I do not care how.'],
        ['LEO', 'Whose side are you on, officer?'],
        ['HASKINS', 'The winning one. Clock is ticking.'],
      ],
      task: (n) => `Destroy Kane's delivery vans · ${n} left`,
      timeout: 'Kane moved the vans.',
      pass: ['HASKINS', '"Nice and tidy. Need paperwork lost one day? Press B and call me. It is not free."'],
    },
    m07: {
      title: 'MISSION 07 — HIGH GROUND',
      giver: 'Rico Alvarez · Hotel Marisol',
      intro: [
        ['RICO', 'Kane is scared. He keeps a black helicopter at the airport, ready to fly out.'],
        ['RICO', 'No helicopter, no escape. Go take it.'],
        ['LEO', 'I have never flown one.'],
        ['RICO', 'Space goes up, Shift goes down, W leans forward. How hard can it be? Land it on the beach and we are even.'],
      ],
      go: 'Go to Vista Mar Airport, north of the city',
      steal: 'Steal Kane\'s black helicopter',
      land: 'Land the helicopter on the beach by the lifeguard towers',
      lostHeli: 'The helicopter was destroyed.',
      pass: ['RICO', '"Kane is grounded. Dana says it is time to finish this. Find me on Palm Boulevard."'],
    },
    m08: {
      title: 'MISSION 08 — LAST CALL',
      giver: 'Rico & Dana · Palm Boulevard',
      intro: [
        ['DANA', 'Kane is holed up in his villa in Palm Heights with everyone he has left.'],
        ['RICO', 'Guards with guns. Lots of them.'],
        ['DANA', 'Haskins will keep the police busy for an hour. After that, we are on our own.'],
        ['LEO', 'Then I had better be quick.'],
      ],
      go: 'Drive to Kane\'s villa in Palm Heights',
      fight: (n) => `Get past Kane's guards · ${n} left`,
      chase: 'Kane is escaping! Wreck his car',
      escaped: 'Kane got away.',
      finish: 'Take down Victor Kane',
      pass: ['DANA', '"It is over. Vista Mar belongs to the people who live in it again. And maybe a little to us."'],
      ending: ['VISTA MAR IS YOURS', 'Thanks for playing · the city is still open, keep exploring'],
    },
  },
};

export const S = STRINGS[LANG];
