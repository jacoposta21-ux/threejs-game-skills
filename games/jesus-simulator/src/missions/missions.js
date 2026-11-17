import { FARM, HAMLET, OUTPOST, OASIS, CAMP, CHECKPOINT } from '../world/layout.js';

/**
 * Chapter III — The Ministry. Data-driven missions.
 *
 * A mission is offered by its giver (a dialogue option appears while it is
 * available) and then runs through steps:
 *   talk    { npc }                          talk to someone (option in their dialogue)
 *   reach   { x, z, r, onWater?, npcTarget?, vehicle? }  get somewhere (marker; may follow an NPC or a ride)
 *   ride    { vehicle, x, z, r }             bring a ride somewhere while riding it
 *   miracle { miracle, target? , npc? }      cast a miracle on a target id / npc
 *   event   { event, count, filter? }        count bus events
 * `dialog` holds the lines used by the generated dialogue nodes.
 */
export const WEDDING = { x: 15.5, z: 9.5, yaw: -0.6 };
export const DEEP_WATER = { x: 172, z: -52 };
export const LOST_DONKEY = { x: OASIS.x - 12, z: OASIS.z - 7, yaw: 2.2 };

export const MISSIONS = [
  {
    id: 'mission.wedding', title: 'The Wedding Wine', giver: 'npc.mary', region: 'Nazareth',
    summary: 'Cousin Nathan\'s wedding feast has run out of wine — and the guests have only just arrived.',
    reward: { faith: 15, chaos: -3, text: 'Faith +15 · the whole village is talking (nicely)' },
    dialog: {
      offer: 'Yeshua… Nathan\'s wedding feast, just east of the square — they have run out of wine already. The shame of it! Could you… do something? You know. Something.',
      accept: 'I will see what I can do, Mother.',
      decline: 'Not yet, Mother.',
      accepted: 'Bless you. And please — don\'t make it TOO strong.',
    },
    steps: [
      { kind: 'reach', x: WEDDING.x, z: WEDDING.z, r: 5, text: 'Go to the wedding feast east of the square' },
      { kind: 'miracle', miracle: 'miracle.water-to-wine', target: 'water.wedding', text: 'Turn the water in the six stone jars into wine' },
      { kind: 'talk', npc: 'npc.groom', text: 'Tell Nathan the bridegroom', line: 'Is this… this is the BEST wine! Everyone serves the good wine first — you saved the best for last! Yeshua, you have saved my wedding!', option: 'The jars are full again, Nathan.' },
    ],
  },
  {
    id: 'mission.fishers', title: 'Fishers of Men', giver: 'npc.simon', region: 'Sea of Galilee',
    summary: 'Simon\'s nets come up empty every night. He wants a sign — preferably a fishy one.',
    reward: { faith: 10, follower: 'npc.simon', text: 'Faith +10 · Simon leaves his nets and follows you' },
    dialog: {
      offer: 'Empty. EMPTY! All night on the water. If you know so much, Yeshua, go out to the deep water past the jetty and show me where the fish are.',
      accept: 'Meet me at the hamlet jetty.',
      decline: 'Another time, Simon.',
      accepted: 'Ha! I\'ll believe it when the nets break. The hamlet is up the north shore of the lake.',
    },
    steps: [
      { kind: 'reach', x: HAMLET.jettyX, z: -78, r: 4, text: 'Go to the end of the jetty at the Fishers\' Hamlet' },
      { kind: 'reach', x: DEEP_WATER.x, z: DEEP_WATER.z, r: 7, onWater: true, text: 'Walk out onto the deep water (Walk on Water, key 4)', done: 'fish' },
      { kind: 'talk', npc: 'npc.simon', text: 'Tell Simon about the catch', line: 'The nets… they BROKE! Too many fish! Yeshua — I\'m done with fish. Whatever you are doing, I\'m coming with you.', option: 'Follow me, Simon. I\'ll make you a fisher of people.' },
    ],
  },
  {
    id: 'mission.donkey', title: 'The Wandering Donkey', giver: 'npc.bartholomew', region: 'Countryside',
    summary: 'Bartholomew\'s donkey wandered off towards the desert. Again.',
    reward: { faith: 10, follower: 'npc.bartholomew', text: 'Faith +10 · Bartholomew joins your followers' },
    dialog: {
      offer: 'Have you seen my donkey? She saw a camel once and has been dreaming of the desert ever since. Last seen trotting south. Bring her home and I\'ll owe you my life. Or at least lunch.',
      accept: 'I\'ll find her.',
      decline: 'Not right now.',
      accepted: 'South, past the dunes, probably near the oasis. Ride her back — she likes being ridden more than being led.',
    },
    onAccept: 'hide-donkey',
    steps: [
      { kind: 'reach', vehicle: 'vehicle.donkey.farm', r: 5, text: 'Find Bartholomew\'s donkey near the Palm Oasis' },
      { kind: 'ride', vehicle: 'vehicle.donkey.farm', x: FARM.x, z: FARM.z, r: 15, text: 'Ride her back to Bar-Tolmai Farm' },
      { kind: 'talk', npc: 'npc.bartholomew', text: 'Tell Bartholomew', line: 'MY GIRL! Look at her, all dusty and happy. Yeshua, I\'ve been thinking… the farm runs itself. Can I walk with you for a while?', option: 'Come along, Bartholomew.' },
    ],
  },
  {
    id: 'mission.caravan', title: 'Bread for the Caravan', giver: 'npc.hiram', region: 'Desert',
    summary: 'The caravan ran out of food crossing the desert. Hiram has one loaf for six hungry travellers.',
    reward: { faith: 12, chaos: -2, text: 'Faith +12 · word of the miracle travels east with the caravan' },
    dialog: {
      offer: 'Six travellers, one loaf of bread and three more days to Damascus. I am a merchant, friend — I can do many sums, but not this one. Can you?',
      accept: 'Give me the loaf.',
      decline: 'Maybe later.',
      accepted: 'Here. It is a very… average loaf. Good luck.',
    },
    onAccept: 'give-bread',
    steps: [
      { kind: 'event', event: 'npc:fetched', count: 6, filter: 'hungry', text: 'Feed the hungry travellers with Multiplication (key 2)' },
      { kind: 'talk', npc: 'npc.hiram', text: 'Speak to Hiram', line: 'Six full bellies from one loaf. I have traded in eleven kingdoms and never seen that. When we reach Damascus, they will hear your name.', option: 'Travel safely, Hiram.' },
    ],
  },
  {
    id: 'mission.centurion', title: 'The Centurion\'s Servant', giver: 'roman.gaius', region: 'Roman Outpost',
    requiresCalm: true,
    summary: 'Centurion Gaius Grumpus has a servant burning with fever at the fort. He is too proud to ask. He asks anyway.',
    reward: { faith: 15, perk: 'favour', text: 'Faith +15 · Centurion\'s Favour: the legion looks a little less closely' },
    dialog: {
      offer: 'Carpenter. My servant Philo lies sick at Castra Galilaea, up the north road. The army doctor prescribed "more marching". They say you… help people. I will not beg. …Please.',
      accept: 'I\'ll go to the fort.',
      decline: 'Not today, centurion.',
      accepted: 'Show this seal at the gate; the guards will let you pass. Touch nothing. Especially the chariots.',
    },
    onAccept: 'fort-pass',
    steps: [
      { kind: 'reach', x: OUTPOST.x + 9, z: OUTPOST.z + 2, r: 5, text: 'Go to the headquarters inside Castra Galilaea' },
      { kind: 'miracle', miracle: 'miracle.healing-touch', npc: 'npc.philo', text: 'Heal Philo with Healing Touch (key 5)' },
      { kind: 'talk', npc: 'roman.gaius', text: 'Return to Centurion Gaius at the checkpoint', line: 'Philo is up and complaining about the food. A good sign. I don\'t understand you, carpenter, but the legion will look a little less closely at you from now on.', option: 'Peace be with you, Gaius.' },
    ],
  },
  {
    id: 'mission.sheep', title: 'The Lost Sheep', giver: 'npc.amos', region: 'Nazareth Valley', legacy: true,
    summary: 'Amos the shepherd has 99 sheep and one problem.',
    reward: { faith: 0, text: 'Faith +5 (from Amos)' },
    steps: [
      { kind: 'event', event: 'sheep:following', count: 1, x: -73, z: -53, text: 'Find the runaway sheep on the Watchtower ridge' },
      { kind: 'event', event: 'sheep:returned', count: 1, npcTarget: 'npc.amos', text: 'Lead her back to Amos and the flock' },
    ],
  },
];

export const MISSION_IDS = new Set(MISSIONS.map((m) => m.id));

/** People who live outside Nazareth (or stand at fixed posts) — Phase 6. */
export const POSTED_FOLK = {
  bartholomew: { x: FARM.x + 1.5, z: FARM.z + 2.5, yaw: Math.PI },
  hiram: { x: CAMP.x + 3.5, z: CAMP.z + 4.2, yaw: Math.PI },
  philo: { x: OUTPOST.x + 9.5, z: OUTPOST.z + 1.5, yaw: -Math.PI / 2 },
  groom: { x: WEDDING.x - 1.6, z: WEDDING.z + 1.8, yaw: Math.PI * 0.8 },
  travellers: [
    { x: CAMP.x - 2.6, z: CAMP.z - 1.6, yaw: 1.0 },
    { x: CAMP.x + 2.4, z: CAMP.z - 1.8, yaw: -1.0 },
    { x: CAMP.x - 2.2, z: CAMP.z + 2.2, yaw: 2.4 },
    { x: CAMP.x + 1.0, z: CAMP.z - 2.9, yaw: 0.1 },
    { x: CAMP.x - 4.2, z: CAMP.z + 0.2, yaw: 1.6 },
    { x: CAMP.x + 4.4, z: CAMP.z + 0.4, yaw: -1.5 },
  ],
};

export { CHECKPOINT };
