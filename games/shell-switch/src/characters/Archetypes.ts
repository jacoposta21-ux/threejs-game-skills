import type { CharacterSpec, Extra, HairType, HatType, Held } from './CharacterModel';
import { PALETTE as P } from '../world/Materials';

export type HostKind = 'alien' | 'strongman' | 'police' | 'clown' | 'chef' | 'thief' | 'singer' | 'ghost' | 'scientist' | 'mayor';
export type CharacterKind = HostKind | 'civilian';

export interface MoveStats {
  speed: number;
  run: number;
  accel: number;
  jump: number;
  gravity: number;
  small?: boolean;
  floats?: boolean;
}

export interface HostDef {
  id: HostKind;
  name: string;
  title: string;
  bio: string;
  ability: string;
  abilityHint: string;
  color: string;
  stats: MoveStats;
  voice: number;
  spec: CharacterSpec;
}

const base = (o: Partial<CharacterSpec> & Pick<CharacterSpec, 'torso' | 'head' | 'arms'>): CharacterSpec => ({
  legs: { len: 0.45, w: 0.08, color: P.navy, shoe: P.ink, shoeSize: 1 },
  eyes: { size: 0.075, spacing: 0.36 },
  brows: { color: P.ink },
  nose: { type: 'button' },
  hair: { type: 'none', color: P.ink },
  hat: { type: 'none', color: P.ink },
  facial: { type: 'none', color: P.ink },
  extras: [],
  held: 'none',
  gait: 'normal',
  ...o,
});

export const HOSTS: Record<HostKind, HostDef> = {
  alien: {
    id: 'alien',
    name: 'Glim',
    title: 'Stranded Star-Sprout',
    bio: 'A pocket-sized visitor whose saucer sneezed out of orbit. Can slip into people like a hand into a glove.',
    ability: 'Hop-Dash',
    abilityHint: 'Quick dash. Tiny enough for vents.',
    color: P.alien,
    stats: { speed: 5.2, run: 8, accel: 30, jump: 9.0, gravity: 1, small: true },
    voice: 1.8,
    spec: base({
      torso: { bottom: 0.2, mid: 0.22, top: 0.19, h: 0.2, depth: 0.95, color: P.alien },
      head: { r: 0.21, skin: P.alien, sy: 0.92, neck: 0.0 },
      legs: { len: 0.11, w: 0.055, color: P.alienDark, shoe: P.alienDark, shoeSize: 0.55 },
      arms: { len: 0.17, w: 0.045, sleeve: P.alien, hand: P.alienDark, handSize: 0.9 },
      eyes: { size: 0.115, spacing: 0, single: true, y: 0.12, iris: '#7a4fd0', pupil: '#1a1426' },
      brows: undefined,
      nose: { type: 'none' },
      extras: ['antennae'],
      gait: 'hop',
    }),
  },
  strongman: {
    id: 'strongman',
    name: 'Brick Mulligan',
    title: 'Porter of Platform 1',
    bio: 'Has carried every suitcase in Fizzwick at least twice. Gentle as a kitten, built like a vending machine.',
    ability: 'Heave',
    abilityHint: 'Lift, carry and throw heavy things. Smash cracked walls.',
    color: '#e2473f',
    stats: { speed: 3.2, run: 4.6, accel: 14, jump: 5.6, gravity: 1.1 },
    voice: 0.62,
    spec: base({
      torso: { bottom: 0.26, mid: 0.48, top: 0.64, h: 0.78, depth: 0.72, color: '#e2473f', color2: P.cream, pattern: 'stripes', bands: 7 },
      head: { r: 0.21, skin: P.skinTan, sy: 1.05, neck: 0.02 },
      legs: { len: 0.46, w: 0.11, color: '#3a3f6b', shoe: '#4a3020', shoeSize: 1.25 },
      arms: { len: 0.78, w: 0.13, sleeve: P.skinTan, hand: P.skinTan, handSize: 1.7 },
      eyes: { size: 0.05, spacing: 0.34, y: 0.18 },
      brows: { color: '#4a3020', thick: 1.6 },
      nose: { type: 'big', size: 1.2 },
      hat: { type: 'flatcap', color: '#5a6a8a' },
      facial: { type: 'handlebar', color: '#4a3020' },
      extras: ['belt'],
      extraColor: '#4a3020',
      gait: 'stomp',
    }),
  },
  police: {
    id: 'police',
    name: 'Officer Pina Pepper',
    title: 'Fizzwick\'s Finest (Allegedly)',
    bio: 'Twenty years on the beat and not one arrest — but a lot of very stern looks. Her hat is legally a separate officer.',
    ability: 'Whistle & Order',
    abilityHint: 'Blow the whistle: loiterers and rule-breakers move along.',
    color: P.navy,
    stats: { speed: 4.4, run: 6.6, accel: 22, jump: 6.6, gravity: 1 },
    voice: 1.15,
    spec: base({
      torso: { bottom: 0.36, mid: 0.4, top: 0.3, h: 0.62, depth: 0.85, color: '#2d4a8b' },
      head: { r: 0.3, skin: P.skinMid },
      legs: { len: 0.38, w: 0.1, color: '#1e2c55', shoe: P.ink, shoeSize: 1.1 },
      arms: { len: 0.5, w: 0.085, sleeve: '#2d4a8b', hand: P.skinMid },
      eyes: { size: 0.075, spacing: 0.36, lashes: true },
      brows: { color: '#2a1a14', thick: 1.3 },
      hair: { type: 'bun', color: '#2a1a14' },
      hat: { type: 'police', color: '#22336b', color2: '#111a38' },
      extras: ['badge', 'belt', 'whistle', 'buttons'],
      extraColor: '#111a38',
      extraColor2: P.gold,
      held: 'baton',
      gait: 'march',
    }),
  },
  clown: {
    id: 'clown',
    name: 'Noodle',
    title: 'Professional Pratfaller',
    bio: 'Noodle\'s shoes are size 31. Noodle\'s confidence is size 40. Crowds cannot look away, and neither can the guards.',
    ability: 'Showtime',
    abilityHint: 'Juggle and tumble: nearby crowds and guards stop to watch.',
    color: '#ff8fc0',
    stats: { speed: 4.2, run: 6.2, accel: 18, jump: 10.6, gravity: 1 },
    voice: 1.4,
    spec: base({
      torso: { bottom: 0.21, mid: 0.24, top: 0.21, h: 0.56, depth: 0.9, color: '#ffe27a', color2: '#e2473f', pattern: 'dots' },
      head: { r: 0.29, skin: '#fff3ea', sy: 1.05 },
      legs: { len: 0.74, w: 0.065, color: '#4a8fe0', shoe: '#e2473f', shoeSize: 2.4, spread: 0.02 },
      arms: { len: 0.66, w: 0.055, sleeve: '#4fb06a', hand: '#ffffff', handSize: 1.3 },
      eyes: { size: 0.07, spacing: 0.38, y: 0.18, iris: '#4a8fe0' },
      brows: { color: '#2a2238', thick: 0.8 },
      nose: { type: 'ball', color: '#e2473f', size: 1.15 },
      hair: { type: 'clownPuffs', color: '#f39a3d' },
      extras: ['ruffle', 'buttons'],
      extraColor: '#ffffff',
      extraColor2: '#ff8fc0',
      gait: 'bounce',
    }),
  },
  chef: {
    id: 'chef',
    name: 'Chef Bun Bonbon',
    title: 'Food Court Virtuoso',
    bio: 'Bun once cooked a soufflé so fluffy it applied for its own passport. Feeds anyone who looks peckish. Everyone looks peckish.',
    ability: 'Cook & Serve',
    abilityHint: 'Cook at stoves, then serve the dish to someone hungry.',
    color: '#f6f6f2',
    stats: { speed: 3.6, run: 5.0, accel: 16, jump: 5.8, gravity: 1 },
    voice: 0.95,
    spec: base({
      torso: { bottom: 0.32, mid: 0.5, top: 0.32, h: 0.64, depth: 0.95, color: '#f6f6f2' },
      head: { r: 0.29, skin: P.skinLight, sx: 1.1 },
      legs: { len: 0.27, w: 0.1, color: '#2a2238', shoe: '#2a2238', shoeSize: 1.1 },
      arms: { len: 0.48, w: 0.09, sleeve: '#f6f6f2', hand: P.skinLight },
      eyes: { size: 0.065, spacing: 0.34, y: 0.2 },
      brows: { color: '#5a3a20' },
      nose: { type: 'big', color: '#ffb4a0' },
      hat: { type: 'toque', color: '#ffffff' },
      facial: { type: 'curly', color: '#5a3a20' },
      extras: ['buttons', 'scarf'],
      extraColor: '#e2473f',
      extraColor2: '#2a2238',
      held: 'spatula',
      gait: 'waddle',
    }),
  },
  thief: {
    id: 'thief',
    name: 'Slink',
    title: 'Gentleman of Light Fingers',
    bio: 'Slink only steals things nobody will miss, like keys, wallets, and the occasional rubber duck. Mostly returns them. Mostly.',
    ability: 'Swipe & Pick',
    abilityHint: 'Pick locks. Pickpocket people who are distracted or facing away.',
    color: '#2a2238',
    stats: { speed: 4.8, run: 7.0, accel: 26, jump: 7.2, gravity: 1 },
    voice: 1.0,
    spec: base({
      torso: { bottom: 0.18, mid: 0.21, top: 0.22, h: 0.56, depth: 0.85, color: '#2a2238', color2: '#f4efe6', pattern: 'stripes', bands: 8 },
      head: { r: 0.26, skin: P.skinOlive, sy: 1.08 },
      legs: { len: 0.56, w: 0.065, color: '#2a2238', shoe: '#1a1426', shoeSize: 1.0 },
      arms: { len: 0.6, w: 0.055, sleeve: '#2a2238', hand: '#3a3348', handSize: 1.0 },
      eyes: { size: 0.065, spacing: 0.34, y: 0.15 },
      brows: { color: '#1a1426', thick: 1.1 },
      nose: { type: 'long', size: 1.1 },
      hat: { type: 'beanie', color: '#1a1426', color2: '#3a3348' },
      extras: ['mask', 'sack'],
      extraColor: '#c8b28a',
      gait: 'sneak',
    }),
  },
  singer: {
    id: 'singer',
    name: 'Velvet Vox',
    title: 'Diva of the Glitterbox',
    bio: 'Velvet\'s voice can curdle milk into butter, then into cheese, then into a standing ovation. People simply follow the music.',
    ability: 'Serenade',
    abilityHint: 'Sing: nearby people follow you while the song lasts.',
    color: '#7d4fc9',
    stats: { speed: 4.0, run: 5.6, accel: 16, jump: 5.8, gravity: 1 },
    voice: 1.35,
    spec: base({
      torso: { bottom: 0.2, mid: 0.2, top: 0.25, h: 0.52, depth: 0.85, color: '#7d4fc9' },
      head: { r: 0.27, skin: P.skinDeep },
      legs: { len: 0.55, w: 0.06, color: P.skinDeep, shoe: '#f2c14e', shoeSize: 0.8 },
      arms: { len: 0.55, w: 0.05, sleeve: '#7d4fc9', hand: P.skinDeep },
      eyes: { size: 0.07, spacing: 0.36, lashes: true, iris: '#5a2a80' },
      brows: { color: '#1a1426', thick: 0.8 },
      nose: { type: 'button' },
      hair: { type: 'beehive', color: '#ff6fb5' },
      extras: ['gown', 'necklace'],
      extraColor2: '#ffe27a',
      held: 'mic',
      gait: 'glide',
    }),
  },
  ghost: {
    id: 'ghost',
    name: 'Lady Mopewell',
    title: 'Resident Apparition, Est. 1803',
    bio: 'Has haunted the museum for two centuries and still hasn\'t found the gift shop. Walls are merely a suggestion.',
    ability: 'Phase & Boo',
    abilityHint: 'Turn intangible to drift through bars and glass. Spooks onlookers.',
    color: '#9fdcff',
    stats: { speed: 4.0, run: 5.4, accel: 10, jump: 0, gravity: 0, floats: true },
    voice: 1.1,
    spec: base({
      torso: { bottom: 0.34, mid: 0.3, top: 0.26, h: 0.62, depth: 0.9, color: '#d8ecff' },
      head: { r: 0.32, skin: '#e6f3ff' },
      legs: null,
      arms: { len: 0.45, w: 0.06, sleeve: '#d8ecff', hand: '#e6f3ff' },
      eyes: { size: 0.085, spacing: 0.36, y: 0.08, iris: '#3a5aa0', lashes: true },
      brows: { color: '#8aa6d8' },
      nose: { type: 'none' },
      hat: { type: 'bonnet', color: '#b79cf0', color2: '#8a6ad0' },
      held: 'lantern',
      gait: 'float',
      ghost: true,
    }),
  },
  scientist: {
    id: 'scientist',
    name: 'Prof. Volta Quark',
    title: 'Curator of Shocking Science',
    bio: 'Volta invented a toaster that toasts toasters. Carries a pocket lightning coil "for emergencies", which is every day.',
    ability: 'Zap',
    abilityHint: 'Zap machines, generators and panels to power them.',
    color: '#3bb3a8',
    stats: { speed: 4.6, run: 6.8, accel: 24, jump: 6.2, gravity: 1 },
    voice: 1.25,
    spec: base({
      torso: { bottom: 0.21, mid: 0.24, top: 0.22, h: 0.5, depth: 0.9, color: '#3bb3a8' },
      head: { r: 0.33, skin: P.skinLight, sy: 1.02 },
      legs: { len: 0.4, w: 0.07, color: '#5a5770', shoe: '#7d5130', shoeSize: 1.1 },
      arms: { len: 0.5, w: 0.06, sleeve: '#f6f6f2', hand: P.skinLight },
      eyes: { size: 0.08, spacing: 0.36, y: 0.08, iris: '#3bb3a8' },
      brows: { color: '#e8e8e8', thick: 1.5 },
      nose: { type: 'button', size: 1.3 },
      hair: { type: 'frizz', color: '#f4f4f4' },
      facial: { type: 'mustache', color: '#f4f4f4' },
      extras: ['labcoat', 'goggles', 'coilpack', 'bowtie'],
      extraColor: '#e2473f',
      gait: 'hurry',
    }),
  },
  mayor: {
    id: 'mayor',
    name: 'Mayor Bumbleton',
    title: 'Mayor for Life (Disputed)',
    bio: 'Has cut 412 ribbons and never once found the scissors on the first try. His word is literally law — the Decree Doors only open for him.',
    ability: 'Proclamation',
    abilityHint: 'Decree! Opens Decree Doors and declares an instant city holiday.',
    color: '#f2c14e',
    stats: { speed: 3.4, run: 4.8, accel: 14, jump: 5.2, gravity: 1 },
    voice: 0.8,
    spec: base({
      torso: { bottom: 0.46, mid: 0.43, top: 0.27, h: 0.7, depth: 0.85, color: '#2d3a6b' },
      head: { r: 0.29, skin: '#ffc9a8' },
      legs: { len: 0.34, w: 0.1, color: '#2d3a6b', shoe: P.ink, shoeSize: 1.1 },
      arms: { len: 0.5, w: 0.085, sleeve: '#2d3a6b', hand: '#ffffff' },
      eyes: { size: 0.065, spacing: 0.34, y: 0.15 },
      brows: { color: '#d0d0d8', thick: 1.4 },
      nose: { type: 'big', color: '#ffaa90' },
      hat: { type: 'tophat', color: '#1a1426', color2: '#e2473f' },
      facial: { type: 'chops', color: '#d0d0d8' },
      extras: ['sash', 'chain', 'monocle', 'buttons'],
      extraColor: '#e2473f',
      extraColor2: P.gold,
      held: 'cane',
      gait: 'strut',
    }),
  },
};

export const HOST_ORDER: HostKind[] = ['alien', 'strongman', 'police', 'chef', 'singer', 'clown', 'thief', 'scientist', 'ghost', 'mayor'];

// ---------------------------------------------------------------------------
// Named non-possessable NPCs.

export const NAMED: Record<string, { name: string; spec: CharacterSpec; voice: number }> = {
  spike: {
    name: 'Spike',
    voice: 0.9,
    spec: base({
      torso: { bottom: 0.2, mid: 0.24, top: 0.27, h: 0.55, depth: 0.85, color: '#2a2238' },
      head: { r: 0.27, skin: P.skinLight },
      legs: { len: 0.55, w: 0.07, color: '#4a8fe0', shoe: '#e2473f', shoeSize: 1.1 },
      arms: { len: 0.55, w: 0.065, sleeve: '#2a2238', hand: P.skinLight },
      hair: { type: 'mohawk', color: '#4fe08a' },
      extras: ['chain', 'sunglasses'],
      held: 'paint',
      heldColor: '#ff6fb5',
      gait: 'strut',
    }),
  },
  mabel: {
    name: 'Mabel',
    voice: 1.3,
    spec: base({
      torso: { bottom: 0.26, mid: 0.27, top: 0.24, h: 0.5, depth: 0.85, color: '#e2473f' },
      head: { r: 0.28, skin: P.skinTan },
      legs: { len: 0.42, w: 0.07, color: '#2a2238', shoe: P.ink, shoeSize: 0.9 },
      arms: { len: 0.48, w: 0.06, sleeve: '#e2473f', hand: P.skinTan },
      eyes: { size: 0.07, spacing: 0.36, lashes: true },
      hair: { type: 'bob', color: '#f39a3d' },
      extras: ['glasses', 'vest', 'skirt'],
      extraColor: '#2d3a6b',
      gait: 'normal',
    }),
  },
  gertie: {
    name: 'Guard Gertie',
    voice: 1.0,
    spec: base({
      torso: { bottom: 0.32, mid: 0.36, top: 0.32, h: 0.6, depth: 0.85, color: '#5a6a8a' },
      head: { r: 0.28, skin: P.skinMid },
      legs: { len: 0.42, w: 0.09, color: '#2a2238', shoe: P.ink, shoeSize: 1.1 },
      arms: { len: 0.52, w: 0.08, sleeve: '#5a6a8a', hand: P.skinMid },
      hair: { type: 'puff', color: '#2a1a14' },
      hat: { type: 'guardcap', color: '#2d3a6b' },
      extras: ['badge', 'belt'],
      extraColor: '#2a2238',
      held: 'clipboard',
      gait: 'march',
    }),
  },
  waldo: {
    name: 'Guard Waldo',
    voice: 0.75,
    spec: base({
      torso: { bottom: 0.4, mid: 0.52, top: 0.32, h: 0.66, depth: 0.95, color: '#6b8ab0' },
      head: { r: 0.28, skin: P.skinLight },
      legs: { len: 0.38, w: 0.1, color: '#2a2238', shoe: P.ink, shoeSize: 1.1 },
      arms: { len: 0.52, w: 0.09, sleeve: '#6b8ab0', hand: P.skinLight },
      hat: { type: 'guardcap', color: '#2d3a6b' },
      facial: { type: 'mustache', color: '#8a5a3c' },
      extras: ['badge', 'belt', 'tie'],
      extraColor: '#2a2238',
      held: 'flashlight',
      gait: 'waddle',
    }),
  },
  facet: {
    name: 'Mr. Facet',
    voice: 1.1,
    spec: base({
      torso: { bottom: 0.2, mid: 0.22, top: 0.24, h: 0.6, depth: 0.85, color: '#f4efe6' },
      head: { r: 0.26, skin: P.skinLight, sy: 1.15 },
      legs: { len: 0.58, w: 0.06, color: '#2a2238', shoe: P.ink, shoeSize: 1.0 },
      arms: { len: 0.55, w: 0.055, sleeve: '#f4efe6', hand: P.skinLight },
      hair: { type: 'side', color: '#c0c0c8' },
      nose: { type: 'long', size: 0.8 },
      extras: ['vest', 'bowtie', 'monocle'],
      extraColor: '#7d4fc9',
      gait: 'strut',
    }),
  },
  gus: {
    name: 'Stage Manager Gus',
    voice: 0.9,
    spec: base({
      torso: { bottom: 0.27, mid: 0.3, top: 0.28, h: 0.56, depth: 0.85, color: '#2a2238' },
      head: { r: 0.28, skin: P.skinDeep },
      legs: { len: 0.46, w: 0.08, color: '#5a5770', shoe: P.ink, shoeSize: 1.0 },
      arms: { len: 0.5, w: 0.07, sleeve: '#2a2238', hand: P.skinDeep },
      hat: { type: 'cap', color: '#e2473f', color2: '#e2473f' },
      facial: { type: 'beard', color: '#1a1426' },
      held: 'clipboard',
      gait: 'hurry',
    }),
  },
  rosalind: {
    name: 'Ringmaster Rosalind',
    voice: 1.2,
    spec: base({
      torso: { bottom: 0.24, mid: 0.27, top: 0.3, h: 0.6, depth: 0.85, color: '#c8243a' },
      head: { r: 0.27, skin: P.skinTan },
      legs: { len: 0.52, w: 0.07, color: '#f4efe6', shoe: '#1a1426', shoeSize: 1.2 },
      arms: { len: 0.55, w: 0.065, sleeve: '#c8243a', hand: '#ffffff' },
      eyes: { size: 0.07, spacing: 0.36, lashes: true },
      hair: { type: 'long', color: '#1a1426' },
      hat: { type: 'ringmaster', color: '#1a1426', color2: '#f2c14e' },
      extras: ['epaulettes', 'buttons', 'belt'],
      extraColor: '#1a1426',
      extraColor2: P.gold,
      held: 'cane',
      gait: 'strut',
    }),
  },
  moose: {
    name: 'Moose the Bouncer',
    voice: 0.6,
    spec: base({
      torso: { bottom: 0.36, mid: 0.52, top: 0.6, h: 0.82, depth: 0.8, color: '#1a1426' },
      head: { r: 0.25, skin: P.skinDeep },
      legs: { len: 0.48, w: 0.12, color: '#2a2238', shoe: P.ink, shoeSize: 1.3 },
      arms: { len: 0.72, w: 0.13, sleeve: '#1a1426', hand: P.skinDeep, handSize: 1.4 },
      brows: { color: '#1a1426', thick: 1.8 },
      extras: ['sunglasses', 'chain'],
      gait: 'stomp',
    }),
  },
  tilly: {
    name: 'Madame Tilly',
    voice: 1.4,
    spec: base({
      torso: { bottom: 0.25, mid: 0.27, top: 0.24, h: 0.5, depth: 0.85, color: '#ffe27a' },
      head: { r: 0.28, skin: P.skinLight },
      legs: { len: 0.44, w: 0.07, color: '#e2473f', shoe: P.ink, shoeSize: 0.9 },
      arms: { len: 0.48, w: 0.06, sleeve: '#ffe27a', hand: P.skinLight },
      eyes: { size: 0.07, spacing: 0.36, lashes: true },
      hair: { type: 'pigtails', color: '#c8553d' },
      extras: ['tutu', 'bowtie'],
      extraColor: '#ff8fc0',
      held: 'clipboard',
      gait: 'kid',
    }),
  },
  otto: {
    name: 'Night Watchman Otto',
    voice: 0.7,
    spec: base({
      torso: { bottom: 0.32, mid: 0.36, top: 0.3, h: 0.6, depth: 0.85, color: '#4a5a3a' },
      head: { r: 0.29, skin: P.skinTan },
      legs: { len: 0.42, w: 0.09, color: '#2a2238', shoe: P.ink, shoeSize: 1.1 },
      arms: { len: 0.52, w: 0.08, sleeve: '#4a5a3a', hand: P.skinTan },
      hat: { type: 'guardcap', color: '#3a4a2a' },
      facial: { type: 'stubble', color: '#8a7a6a' },
      extras: ['badge', 'belt'],
      held: 'flashlight',
      gait: 'normal',
    }),
  },
  orla: {
    name: 'Curator Orla',
    voice: 1.15,
    spec: base({
      torso: { bottom: 0.24, mid: 0.25, top: 0.24, h: 0.56, depth: 0.85, color: '#3bb3a8' },
      head: { r: 0.28, skin: P.skinDeep },
      legs: { len: 0.5, w: 0.065, color: '#2a2238', shoe: '#7d5130', shoeSize: 0.9 },
      arms: { len: 0.52, w: 0.06, sleeve: '#3bb3a8', hand: P.skinDeep },
      eyes: { size: 0.07, spacing: 0.36, lashes: true },
      hair: { type: 'bun', color: '#1a1426' },
      extras: ['glasses', 'scarf', 'skirt'],
      extraColor: '#f2c14e',
      held: 'clipboard',
      gait: 'normal',
    }),
  },
  doris: {
    name: 'Receptionist Doris',
    voice: 1.25,
    spec: base({
      torso: { bottom: 0.28, mid: 0.3, top: 0.26, h: 0.52, depth: 0.85, color: '#b79cf0' },
      head: { r: 0.29, skin: P.skinLight },
      legs: { len: 0.42, w: 0.07, color: '#2a2238', shoe: P.ink, shoeSize: 0.9 },
      arms: { len: 0.48, w: 0.06, sleeve: '#b79cf0', hand: P.skinLight },
      eyes: { size: 0.07, spacing: 0.36, lashes: true },
      hair: { type: 'beehive', color: '#c0c0c8' },
      extras: ['glasses', 'necklace', 'skirt'],
      extraColor: '#7d4fc9',
      extraColor2: '#f4efe6',
      gait: 'normal',
    }),
  },
  tank: {
    name: 'Tank',
    voice: 0.55,
    spec: base({
      torso: { bottom: 0.4, mid: 0.56, top: 0.62, h: 0.85, depth: 0.85, color: '#2a2238' },
      head: { r: 0.25, skin: P.skinMid },
      legs: { len: 0.5, w: 0.13, color: '#2a2238', shoe: P.ink, shoeSize: 1.3 },
      arms: { len: 0.74, w: 0.13, sleeve: '#2a2238', hand: P.skinMid, handSize: 1.4 },
      brows: { color: '#1a1426', thick: 1.8 },
      extras: ['sunglasses', 'tie'],
      extraColor: '#e2473f',
      gait: 'stomp',
    }),
  },
};

// ---------------------------------------------------------------------------
// Civilians: seeded variety so crowds read as individuals.

export type CivilianType = 'commuter' | 'shopper' | 'kid' | 'tourist' | 'elder' | 'fan' | 'artsy';

const SKINS = [P.skinLight, P.skinTan, P.skinMid, P.skinDeep, P.skinOlive, '#f0c8a0'];
const SHIRTS = ['#e2473f', '#4a8fe0', '#4fb06a', '#f39a3d', '#7d4fc9', '#ff8fc0', '#3bb3a8', '#ffe27a', '#c8553d', '#5a6a8a', '#9fd8ff', '#b79cf0'];
const PANTS = ['#2a2238', '#3a3f6b', '#5a5770', '#7d5130', '#2d3a6b', '#4a5a3a', '#c8b28a'];
const HAIRS = ['#2a1a14', '#5a3a20', '#c8553d', '#f2c14e', '#1a1426', '#c0c0c8', '#8a5a3c', '#ff6fb5'];

export function civilianSpec(type: CivilianType, rng: () => number): CharacterSpec {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const skin = pick(SKINS);
  const shirt = pick(SHIRTS);
  const kid = type === 'kid';
  const elder = type === 'elder';
  const size = kid ? 0.65 : 1;
  const wide = 0.85 + rng() * 0.45;
  const legLen = (kid ? 0.28 : 0.38 + rng() * 0.2) * (elder ? 0.9 : 1);
  const hairTypes: HairType[] = kid ? ['pigtails', 'spiky', 'puff', 'bob'] : elder ? ['side', 'none', 'puff', 'bun'] : ['side', 'bob', 'puff', 'spiky', 'long', 'bun', 'none', 'pigtails'];
  let hat: HatType = 'none';
  const hatRoll = rng();
  if (type === 'tourist') hat = hatRoll < 0.6 ? 'sunhat' : 'cap';
  else if (type === 'commuter') hat = hatRoll < 0.3 ? 'bowler' : 'none';
  else if (type === 'artsy') hat = 'beret';
  else if (elder) hat = hatRoll < 0.4 ? 'flatcap' : 'none';
  else if (hatRoll < 0.15) hat = 'beanie';
  else if (hatRoll < 0.25) hat = 'cap';
  const extras: Extra[] = [];
  if (rng() < 0.3) extras.push('glasses');
  if (type === 'commuter') extras.push(rng() < 0.5 ? 'tie' : 'scarf');
  if (type === 'tourist') extras.push('backpack');
  if (type === 'fan') extras.push('scarf');
  if (!kid && rng() < 0.25) extras.push('skirt');
  const helds: Record<CivilianType, Held[]> = {
    commuter: ['briefcase', 'newspaper', 'phone'],
    shopper: ['bag', 'bag', 'phone'],
    kid: ['balloon', 'icecream', 'none'],
    tourist: ['camera', 'camera', 'phone'],
    elder: ['cane', 'newspaper'],
    fan: ['phone', 'none'],
    artsy: ['clipboard', 'phone'],
  };
  return {
    torso: {
      bottom: (0.22 + rng() * 0.12) * size * wide,
      mid: (0.24 + rng() * 0.14) * size * wide,
      top: (0.22 + rng() * 0.08) * size,
      h: (0.48 + rng() * 0.16) * size,
      depth: 0.85,
      color: shirt,
      color2: pick(SHIRTS),
      pattern: rng() < 0.18 ? 'stripes' : rng() < 0.1 ? 'dots' : 'none',
      bands: 6,
    },
    head: { r: (0.26 + rng() * 0.05) * (kid ? 0.95 : 1), skin, sy: 0.95 + rng() * 0.15 },
    legs: { len: legLen, w: 0.07 * size * wide, color: pick(PANTS), shoe: pick([P.ink, '#7d5130', '#e2473f', '#ffffff']), shoeSize: kid ? 0.8 : 1 },
    arms: { len: (0.42 + rng() * 0.12) * size, w: 0.06 * size * wide, sleeve: shirt, hand: skin },
    eyes: { size: (kid ? 0.085 : 0.065) + rng() * 0.012, spacing: 0.34 + rng() * 0.06, lashes: rng() < 0.4 },
    brows: { color: pick(HAIRS), thick: 0.8 + rng() * 0.6 },
    nose: { type: pick(['button', 'button', 'big', 'long']), size: 0.8 + rng() * 0.5 },
    hair: { type: pick(hairTypes), color: elder ? '#d8d8e0' : pick(HAIRS) },
    hat: { type: hat, color: pick(SHIRTS), color2: pick(PANTS) },
    facial: { type: !kid && rng() < 0.2 ? pick(['mustache', 'beard', 'stubble']) : 'none', color: pick(HAIRS) },
    extras,
    extraColor: pick(SHIRTS),
    held: pick(helds[type]),
    heldColor: pick(SHIRTS),
    gait: kid ? 'kid' : elder ? 'waddle' : 'normal',
  };
}
