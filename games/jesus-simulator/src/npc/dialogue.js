/**
 * Dialogue trees and ambient barks. Text may be a string, an array (random
 * pick) or a function of the dialogue context:
 *   ctx = { npc, flags, chaos, faith, hour, night, hint, discovered, total, rng }
 * Options: { label, next } | { label, end: true } and may carry
 *   effect: { faith, chaos, flag, event } and `if: (ctx) => bool`.
 */
const pick = (ctx, v) => (Array.isArray(v) ? v[Math.floor(ctx.rng() * v.length)] : v);
export const resolveText = (ctx, v) => (typeof v === 'function' ? resolveText(ctx, v(ctx)) : pick(ctx, v));

const hintLine = (ctx) => (ctx.hint
  ? `${ctx.hint.name}? ${ctx.hint.direction}, about ${Math.round(ctx.hint.distance / 10) * 10} metres from here.`
  : 'You have seen every corner of Nazareth already. Restless, aren\'t you?');

const chaosAside = (ctx) => (ctx.chaos >= 6 ? ' Also… people say pots keep breaking wherever you walk.' : '');

const bye = { label: 'Peace be with you.', end: true };

export const DIALOGUES = {
  mary: {
    root: {
      text: (c) => (c.night ? 'Yeshua! Out under the stars again? At least wear a cloak.' : [
        'Yeshua! Have you eaten? You look thin.',
        'There you are. Your father needs help with that table, you know.',
        'My son! Did you wash your feet before walking through the market?',
      ]),
      options: [
        { label: 'I ate yesterday, Mother.', next: 'ate' },
        { label: 'Anything happening in the village?', next: 'news' },
        { label: 'I love you, Mother.', next: 'love', effect: { faith: 1, flag: 'mary.love' } },
        bye,
      ],
    },
    ate: { text: 'Yesterday! Take this bread. And don\'t multiply it, just eat it.', options: [{ label: 'Yes, Mother.', end: true }] },
    news: { text: (c) => `${hintLine(c)}${chaosAside(c)}`, options: [{ label: 'Thank you.', end: true }] },
    love: { text: 'Oh, stop it. …Say it again tomorrow.', options: [{ label: '(smile)', end: true }] },
  },
  joseph: {
    root: {
      text: ['Measure twice, cut once. Pray three times.', 'Ah, son. Hand me that chisel? No — the other one.', 'This table has been "almost finished" for nine days.'],
      options: [
        { label: 'Can I help with the table?', next: 'help', effect: { faith: 1, flag: 'joseph.help' } },
        { label: 'Seen anything interesting?', next: 'news' },
        bye,
      ],
    },
    help: { text: 'Hold this end. Steady… steady… perfect. You were always good with wood.', options: [{ label: 'You taught me.', end: true }] },
    news: { text: (c) => hintLine(c), options: [{ label: 'Thanks, Father.', end: true }] },
  },
  eli: {
    root: {
      text: ['Business has been terrible lately.', 'Fresh bread! Well — this morning\'s bread. Well — yesterday\'s.', 'Everyone wants bread, nobody wants to pay for bread.'],
      options: [
        { label: 'Why is business so bad?', next: 'why' },
        { label: 'Your bread smells wonderful.', next: 'compliment', effect: { faith: 1, flag: 'eli.kind' } },
        bye,
      ],
    },
    why: { text: 'Rome taxes the flour, the oven and the smell. One day someone will make bread out of nothing and ruin me completely.', options: [{ label: 'Imagine that.', end: true }] },
    compliment: { text: 'You hear that, everyone? Free advertising! Bless you, Yeshua.', options: [{ label: 'Blessings, Eli.', end: true }] },
  },
  levi: {
    root: {
      text: ['Figs! Pomegranates! Dates sweeter than a psalm!', 'Careful near the fruit pile. It took me all morning.'],
      options: [{ label: 'How\'s the harvest?', next: 'harvest' }, bye],
    },
    harvest: { text: (c) => (c.chaos >= 3 ? 'It WAS good. Then someone walked through my pomegranates.' : 'Best in years. The olive grove south-east is heavy with fruit too.'), options: [{ label: 'Glad to hear it.', end: true }] },
  },
  tobias: {
    root: {
      text: ['Fish! From the Sea of Galilee, only two days old!', 'Simon brings the catch, I sell the catch. Simple. Smelly, but simple.'],
      options: [{ label: 'Where does the fish come from?', next: 'where' }, bye],
    },
    where: { text: 'The lake, east past the valley. Simon says the fishing has been miserable. Nets come up empty all week.', options: [{ label: 'Maybe that will change.', end: true }] },
  },
  rachel: {
    root: {
      text: (c) => (c.flags['pots.broken'] ? 'YOU. Do you know how long a pot takes to make?' : ['Every pot here is shaped by hand. Please don\'t touch.', 'Clay from the riverbed, fire from the kiln, patience from the Lord.']),
      options: [
        { label: 'I\'m sorry about the pots.', next: 'sorry', if: (c) => !!c.flags['pots.broken'], effect: { faith: 1, flag: 'rachel.sorry' } },
        { label: 'They\'re beautiful.', next: 'nice' },
        bye,
      ],
    },
    sorry: { text: 'Hmph. At least you apologise. Most people just blame the donkey.', options: [{ label: 'It won\'t happen again.', end: true }] },
    nice: { text: 'Thank you. The big jars hold water for a whole wedding.', options: [{ label: 'Good to know.', end: true }] },
  },
  simon: {
    root: {
      text: ['Nothing. All night on the water and NOTHING.', 'If the fish don\'t bite tomorrow I\'m becoming a carpenter like your father.'],
      options: [{ label: 'Don\'t give up yet.', next: 'hope', effect: { faith: 1, flag: 'simon.hope' } }, { label: 'Where do you fish?', next: 'where' }, bye],
    },
    hope: { text: 'Easy for you to say. …But all right. One more night.', options: [{ label: 'One more night.', end: true }] },
    where: { text: 'The Sea of Galilee, east down the road. The way is long — Romans are fixing the bridge, they say.', options: [{ label: 'I see.', end: true }] },
  },
  hannah: {
    root: {
      text: ['Sit, sit. My knees remember when this well was new.', 'I hear everything in this village. EVERYTHING.'],
      options: [{ label: 'What have you heard lately?', next: 'gossip' }, { label: 'Where should I go next?', next: 'hint' }, bye],
    },
    gossip: {
      text: (c) => (c.chaos >= 4 ? 'They say a bearded young man has been knocking over half the market. Funny, he looks just like you.' : ['Eli\'s bread got harder. Rachel\'s pots got pricier. Rome got greedier.', 'Amos lost a sheep again. That boy counts sheep like I count teeth.']),
      options: [{ label: 'Thank you, Hannah.', end: true }],
    },
    hint: { text: (c) => hintLine(c), options: [{ label: 'Bless you.', end: true }] },
  },
  ezra: {
    root: {
      text: ['Shalom, Yeshua. You asked better questions at twelve than my students do at thirty.', 'The scrolls say much. The village listens little.'],
      options: [{ label: 'Teach me something.', next: 'teach' }, { label: 'Any news?', next: 'news' }, bye],
    },
    teach: { text: ['Kindness is the shortest road between two houses.', 'A full jar spills; a humble one is filled.'], options: [{ label: 'Wise words.', end: true, effect: { faith: 1, flag: 'ezra.lesson' } }] },
    news: { text: (c) => hintLine(c), options: [{ label: 'Thank you, Rabbi.', end: true }] },
  },
  amos: {
    root: {
      text: (c) => {
        if (c.flags['sheep.returned']) return 'Yeshua! My lost sheep is home and eating everything again. Bless you.';
        if (c.flags['sheep.asked']) return 'Any sign of her? Old Watchtower ridge, north-west. She likes the view.';
        return 'Can you help me find my sheep? One wandered off again.';
      },
      options: [
        { label: 'I\'ll find her.', next: 'quest', if: (c) => !c.flags['sheep.asked'], effect: { flag: 'sheep.asked', event: 'sheep:asked' } },
        { label: 'Still looking.', end: true, if: (c) => c.flags['sheep.asked'] && !c.flags['sheep.returned'] },
        { label: 'How many sheep do you have?', next: 'count' },
        bye,
      ],
    },
    quest: { text: 'She\'s probably up by the old watchtower on the ridge. Walk close and she\'ll follow — she likes you better than me anyway.', options: [{ label: 'Leave it to me.', end: true }] },
    count: { text: 'Six. Seven with the runaway. Nine when I count after supper.', options: [{ label: 'Ha!', end: true }] },
  },
  benjamin: {
    root: {
      text: (c) => (c.flags['healed.npc.benjamin'] ? 'Yeshua! Look — I can run! Well, jog. Well… walk very fast!' : ['Oh, my knee. Forty years at the olive press and it creaks like a cart.', 'Sit with an old man a moment. My knee won\'t let me stand long.']),
      options: [
        { label: 'Let me see that knee.', next: 'knee', if: (c) => !c.flags['healed.npc.benjamin'] },
        { label: 'How are you feeling?', next: 'fine', if: (c) => !!c.flags['healed.npc.benjamin'] },
        bye,
      ],
    },
    knee: { text: 'You? You\'re a carpenter, not a physician. …Though they do say you have gifted hands.', options: [{ label: '(Use Healing Touch: select 5, aim, press Q or click)', end: true }] },
    fine: { text: 'Like a young goat! I\'m telling everyone. EVERYONE.', options: [{ label: 'Go easy on that knee.', end: true }] },
  },
  child: {
    root: {
      text: ['Yeshua! Yeshua! Do a miracle!', 'Can you jump onto the roof? Sami says you can\'t.', 'We\'re playing tag. You\'re IT!'],
      options: [
        { label: 'Not yet. Soon, maybe.', next: 'soon' },
        { label: 'Have you been good?', next: 'good' },
        { label: 'Run along and play.', end: true },
      ],
    },
    soon: { text: '"Soon" is what grown-ups say when they mean "no"!', options: [{ label: '(laugh)', end: true }] },
    good: { text: 'Mostly! I only threw ONE fig at Levi.', options: [{ label: 'Hmm.', end: true }] },
  },
  yusuf: {
    root: {
      text: ['Peace, friend. I walked from Capernaum by the lake. My feet are older than me now.', 'Nazareth! Small town. Big rumours.'],
      options: [{ label: 'What news from the lake?', next: 'lake' }, { label: 'What rumours?', next: 'rumours' }, bye],
    },
    lake: { text: 'Fishermen grumbling, Romans counting, boats waiting. Something is about to happen there, I feel it.', options: [{ label: 'Maybe it is.', end: true }] },
    rumours: { text: (c) => `They say a carpenter's son here is… unusual.${chaosAside(c)}`, options: [{ label: 'Unusual how?', next: 'how' }, { label: 'Interesting.', end: true }] },
    how: { text: 'Nobody agrees. Some say kind. Some say clumsy. You wouldn\'t know him?', options: [{ label: 'Never met him.', end: true }] },
  },
  merchant: {
    root: {
      text: ['Business has been terrible lately.', 'Best prices in Nazareth! Also the only prices in Nazareth.', 'Looking or buying? Looking is free. Touching is not.'],
      options: [{ label: 'Why so slow?', next: 'why' }, bye],
    },
    why: { text: ['Taxes, my friend. Rome taxes the stall, the cloth, the shade over the cloth.', 'Everyone is saving for the Passover trip to Jerusalem.'], options: [{ label: 'I see.', end: true }] },
  },
  soldier: {
    root: {
      text: (c) => (c.chaos >= 10 ? ['We\'ve heard about you, Galilean. Pots. Bread. Flying people.', 'You again. Keep your hands where I can see them. And your halo.'] : [
        'Move along, citizen. Nothing to see here.',
        'Another glorious day in the provinces. Glorious. Hot. Glorious.',
        'Rome has the finest roads in the world, they said. My feet disagree.',
        'Halt! …Sorry. Habit. Carry on.',
      ]),
      options: [
        { label: 'What are you guarding?', next: 'guard' },
        { label: 'What happens if I cause trouble?', next: 'trouble' },
        { label: 'Peace be with you.', next: 'peace', effect: { faith: 1, flag: 'roman.peace' } },
        { label: 'Carry on, soldier.', end: true },
      ],
    },
    guard: { text: ['The road. The province. Mostly the road.', 'The checkpoint up north. Nobody goes inside the palisade. Nobody.'], options: [{ label: 'Understood.', end: true }] },
    trouble: { text: 'You break things where I can see, we chase you. Push a legionary and the whole garrison chases you. Get caught and you spend the night at the checkpoint. Simple.', options: [{ label: 'And if I run?', next: 'run' }, { label: 'Very clear.', end: true }] },
    run: { text: 'Then don\'t let us see you. Stay out of sight long enough and we\'ll forget your face. We forget a lot of faces. Bad pay.', options: [{ label: 'Good to know.', end: true }] },
    peace: { text: ['…Peace? Nobody says that to us. Thanks, I suppose.', 'Huh. That\'s nice. Don\'t tell the centurion I said that.'], options: [{ label: '(nod)', end: true }] },
  },
  centurion: {
    root: {
      text: (c) => (c.flags['roman.arrested'] ? 'YOU. The one we released this morning. I have my eye on you, carpenter.' : [
        'Centurion Gaius Grumpus, Tenth Legion. State your business. Quickly. I have reports to stamp.',
        'Another Galilean. Let me guess: you want to complain about taxes.',
      ]),
      options: [
        { label: 'What is this place?', next: 'place' },
        { label: 'Why are you so grumpy?', next: 'grumpy' },
        { label: 'Your men look tired.', next: 'tired', effect: { faith: 1, flag: 'roman.kind' } },
        { label: 'Just passing through.', end: true },
      ],
    },
    place: { text: 'A checkpoint. Inside the palisade is military ground — civilians who wander in get escorted out. Firmly.', options: [{ label: 'I\'ll stay outside.', end: true }] },
    grumpy: { text: 'Twenty years of service, and they send me to watch goats and fishermen. Grumpy is the polite word.', options: [{ label: 'Perhaps the goats need you.', next: 'goats' }, { label: 'I\'m sorry.', end: true }] },
    goats: { text: '…Was that a joke? Out. Before I start laughing and lose my reputation.', options: [{ label: '(leave)', end: true }] },
    tired: { text: 'Tired? They\'re soldiers of Rome! …Yes. Yes they are. Thank you for noticing.', options: [{ label: 'Rest well.', end: true }] },
  },
  villager: {
    root: {
      text: (c) => (c.night ? 'It\'s late, Yeshua. Shouldn\'t you be home?' : ['Shalom, Yeshua!', 'Isn\'t that Joseph\'s boy? All grown up!', 'Hot day. The well is the only cool place in town.', 'Did you hear? Romans are building another tower north of the valley.']),
      options: [{ label: 'Anything worth seeing around here?', next: 'hint' }, { label: 'How are you?', next: 'how' }, bye],
    },
    hint: { text: (c) => hintLine(c), options: [{ label: 'Thanks!', end: true }] },
    how: { text: (c) => (c.chaos >= 5 ? 'Nervous. Things keep falling over around here.' : ['Blessed, mostly. My back is less blessed.', 'Busy! The market doesn\'t shop by itself.']), options: [{ label: 'Take care.', end: true }] },
  },
};

/** Short ambient lines shown in speech bubbles. */
export const BARKS = {
  greet: ['Shalom!', 'Peace, Yeshua!', 'Ah, Joseph\'s boy!', 'Good day!', 'Blessings!'],
  greetKid: ['YESHUA!', 'Hi Yeshua!!', 'Watch this!', 'Tag, you\'re it!'],
  bumped: ['Oof!', 'Watch it!', 'Excuse you!', 'Hey!', 'My foot!'],
  knocked: ['WHOA!', 'Aaah!', 'My dignity!', 'Rude!', 'Help!'],
  startle: ['What was that?!', 'Eek!', 'Goodness!', 'Who did that?'],
  potBroken: ['MY POTS!', 'That was a good pot!', 'Who will pay for that?!'],
  sell: { bread: 'Fresh bread!', fruit: 'Sweet figs!', fish: 'Fish! Fresh-ish!', pottery: 'Fine clay jars!', fabric: 'Finest wool!', spice: 'Cumin! Saffron!' },
  well: ['Cool water today.', 'Heavy jar…', 'Ah, refreshing.'],
  shop: ['How much for this?', 'Too expensive!', 'I\'ll take two.'],
  work: ['Tap, tap, tap…', 'Almost square.'],
  lake: ['The lake is that way…', 'Maybe the fish will bite today.'],
  fish: ['Here\'s the catch!', 'Small one today.'],
  gossip: ['Did you hear about Eli\'s bread?', 'In my day…', 'Hmph.'],
  wisdom: ['Listen, and be wise.', 'Shalom, children.'],
  sheep: ['Come on, come on…', 'One, two, three…'],
  travel: ['Long road…', 'Nazareth at last.'],
  roman: {
    idle: ['Move along.', 'Nothing to see here.', 'My feet hurt.', 'Is it lunch yet?', 'Keep the peace.', 'Halt! …Oh, it\'s a goat.', 'Glory to Rome. Mostly.'],
    greet: ['Citizen.', 'Move along, citizen.', 'Keep your miracles to yourself.', 'Watching you, Galilean.'],
    suspicious: ['Hmm?', 'You there!', 'What\'s that one up to?', 'Hold on…'],
    warn: ['Halt! Military area!', 'No civilians past the gate!', 'Out! Now!', 'This is your only warning!'],
    witness: ['HEY!', 'I saw that!', 'Vandal!', 'That\'s a crime, that is!'],
    spot: ['HALT!', 'Stop in the name of Caesar!', 'After him!', 'Seize the bearded one!', 'There! The one with the glowing head!', 'STOP! …please?'],
    chase: ['Halt!', 'Get back here!', 'You can\'t outrun Rome!', 'Cut him off!', 'He\'s fast for a carpenter!'],
    lost: ['Where did he go?', 'He vanished! Like… a miracle.', 'Search the market!', 'Lost him. Again.', 'Nobody tell the centurion.'],
    arrest: ['Got you!', 'You\'re coming with me!', 'In the name of Rome!'],
    flying: ['AAAARGH!', 'MY ARMOUR!', 'I\'m reporting this!', 'Assault on a legionary!', 'Not again!'],
    getup: ['Ow.', 'Did anyone see that?', 'Right. Now I\'m angry.', 'That was NOT regulation.'],
    lifted: ['PUT ME DOWN! THAT\'S AN ORDER!', 'This is NOT in the regulations!', 'I\'m telling Pilate!'],
    healed: ['My back hasn\'t felt this good since Gaul…', 'I… didn\'t see anything. Carry on.', 'Warm hands. Very warm. I\'m off duty.'],
    wine: ['Is that… WINE?', 'Five minutes! Inspection!', 'For official tasting only.', 'Free wine?! Hold my spear.'],
    water: ['Is he… walking on the WATER?!', 'Come back here! …How?!', 'Nobody said anything about water!'],
    bread: ['Unlicensed bread distribution!', 'Who authorised this bread?!'],
    horn: ['Sound the horn!', 'Reinforcements!', 'Call the garrison!'],
  },
  chat: [['Shalom!', 'Shalom!'], ['How is your mother?', 'Still complaining!'], ['Hot today.', 'Hotter tomorrow.'], ['Seen the Romans?', 'Don\'t mention them.'], ['Bread price went up.', 'Again?!']],
};
