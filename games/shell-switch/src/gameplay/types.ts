import type { CivilianType, HostKind } from '../characters/Archetypes';

export type AreaId = 'station' | 'hub' | 'mall' | 'circus' | 'museum' | 'cityhall';

export interface AreaInfo {
  id: AreaId;
  name: string;
  tagline: string;
  rect: [number, number, number, number]; // minX, maxX, minZ, maxZ
  spawn: [number, number, number]; // x, z, yaw
  color: string;
}

export const AREAS: AreaInfo[] = [
  { id: 'station', name: 'Puffington Station', tagline: 'Where you crash-landed', rect: [-24, 29, 30.5, 64], spawn: [-6, 50, Math.PI], color: '#e2473f' },
  { id: 'mall', name: 'Glitterbox Mall', tagline: 'Shop till you hop', rect: [-64, -22.5, -20, 28], spawn: [-27, 0, -Math.PI / 2], color: '#ff8fc0' },
  { id: 'circus', name: 'Big Top Bonanza', tagline: 'Step right up', rect: [22.5, 68, -24, 24], spawn: [27, 0, Math.PI / 2], color: '#f39a3d' },
  { id: 'museum', name: 'Museum of Peculiar History', tagline: 'Please do not haunt the exhibits', rect: [-64, -20.5, -60, -20.2], spawn: [-24, -27, -Math.PI / 2], color: '#3bb3a8' },
  { id: 'cityhall', name: 'Fizzwick City Hall', tagline: 'Bureaucracy since 1802', rect: [-26, 26, -88, -31.5], spawn: [0, -35, Math.PI], color: '#f2c14e' },
];

export const HUB_INFO: AreaInfo = { id: 'hub', name: 'Fountain Square', tagline: 'The heart of Fizzwick', rect: [-30, 30, -31, 30], spawn: [0, 8, Math.PI], color: '#4a8fe0' };

export function areaAt(x: number, z: number): AreaId {
  for (const a of AREAS) {
    const [x0, x1, z0, z1] = a.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return a.id;
  }
  return 'hub';
}

export function areaInfo(id: AreaId): AreaInfo {
  return AREAS.find((a) => a.id === id) ?? HUB_INFO;
}

export type Weakness = 'distract' | 'intimidate' | 'lure' | 'scare' | 'feed' | 'decree';
export type Personality = 'cheerful' | 'grumpy' | 'nervous' | 'snooty' | 'kid' | 'fan' | 'guard' | 'sleepy';

export interface GuardDef {
  /** Invisible doorway blocker active while the guard holds the post. */
  blocker: [number, number, number, number];
  weak: Weakness[];
  /** Where the guard goes when a weakness permanently moves them. */
  moveTo?: [number, number];
  /** Flag set when permanently moved. */
  movedFlag?: string;
  /** Weaknesses that move permanently (others are temporary distractions). */
  permanent?: Weakness[];
  dish?: string;
  afterMoveMode?: 'sit' | 'wander' | 'idle' | 'eat';
  /** Shown when you walk up to them: what would move this guard. */
  info?: string;
  /** Once this flag is set the post blocker is permanently disabled. */
  releaseFlag?: string;
  /** Guard chases suspicious hosts doing shady things nearby. */
  strict?: boolean;
  /** Lines when an ineffective approach is tried. */
  refuse?: Partial<Record<Weakness | 'block', string>>;
}

export interface NpcSpawn {
  id: string;
  type: 'host' | 'named' | 'civilian';
  host?: HostKind;
  named?: string;
  civ?: CivilianType;
  area: AreaId;
  x: number;
  z: number;
  /** Floor height (mezzanines). */
  y?: number;
  yaw?: number;
  mode: 'wander' | 'post' | 'sit' | 'sleep' | 'idle' | 'queue' | 'patrol' | 'eat';
  radius?: number;
  personality: Personality;
  guard?: GuardDef;
  /** Pickpocket loot. */
  pocket?: { item?: string; label: string; postcard?: string; bits?: number };
  /** Patrol points. */
  path?: [number, number][];
  /** Talk handler id. */
  talk?: string;
  /** Fan of the singer: follows from further away. */
  fan?: boolean;
  /** When a flag turns on, walk somewhere and switch mode. */
  relocate?: { flag: string; to: [number, number]; mode: 'idle' | 'sit' | 'wander' | 'post'; yaw?: number; emotion?: 'happy' | 'neutral' };
  /** Mode after a guard is permanently moved. */
  afterMove?: 'sit' | 'wander' | 'idle' | 'eat';
  /** Starting emotion. */
  emotion?: 'neutral' | 'scared' | 'sad' | 'happy' | 'suspicious' | 'sleepy' | 'smug';
  /** Ignores shows and songs (busy staff). */
  busy?: boolean;
}

export type ItemId =
  | 'cityPass'
  | 'mic'
  | 'burger'
  | 'souffle'
  | 'candy'
  | 'keycard'
  | 'fuse'
  | 'permit'
  | 'duck'
  | 'wallet';

export const ITEM_INFO: Record<ItemId, { name: string; icon: string; desc: string }> = {
  cityPass: { name: 'City Pass', icon: '🎫', desc: 'Opens the station turnstiles and the city gates.' },
  mic: { name: "Velvet's Lucky Mic", icon: '🎤', desc: 'Velvet refuses to sing a note without it.' },
  burger: { name: 'Mega Burger', icon: '🍔', desc: 'Seven patties. Structurally questionable.' },
  souffle: { name: 'Triple Soufflé', icon: '🧁', desc: 'So fluffy it hovers slightly.' },
  candy: { name: 'Cotton Candy', icon: '🍭', desc: 'A pink cloud on a stick.' },
  keycard: { name: 'Backstage Keycard', icon: '💳', desc: "Moose's keycard for the ringmaster's trailer." },
  fuse: { name: 'Cannon Fuse', icon: '🧨', desc: 'Makes the circus cannon go BOOM.' },
  permit: { name: 'Stamped Permit', icon: '📜', desc: 'Form 27-B: Permission to Go Upstairs.' },
  duck: { name: 'Rubber Duck', icon: '🦆', desc: 'Squeaks. Nobody knows whose it is.' },
  wallet: { name: 'Lost Wallet', icon: '👛', desc: 'Contains three buttons and a coupon.' },
};
