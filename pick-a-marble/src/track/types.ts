import type * as THREE from 'three';
import type { SurfaceData } from './geometry';

export type Category = 'gates' | 'basic' | 'vertical' | 'special' | 'decor';

export const CELL = 4;

export interface PortDef {
  /** Local position (floor point of the channel). */
  pos: THREE.Vector3;
  /** Outward facing unit vector, axis aligned. */
  facing: THREE.Vector3;
  kind: 'in' | 'out';
}

export interface LaneDef {
  /** Floor-line points in local space, in flow order. */
  points: THREE.Vector3[];
  /** Index into ports of the entry port, or -1 when the lane starts at a spawn. */
  from: number;
  /** Index into ports of the exit port, or -1 when the lane ends at the finish. */
  to: number;
}

export type ZoneEffect =
  | { type: 'boost'; dir: THREE.Vector3; speed: number; accel: number }
  | { type: 'kick'; dir: THREE.Vector3; speed: number }
  | { type: 'sustain'; speed: number }
  | { type: 'drag'; k: number }
  | { type: 'launch'; target: THREE.Vector3; time: number; sfx: 'jump' | 'cannon' | 'bounce' }
  | { type: 'finish' }
  | { type: 'tag'; tag: 'loop' | 'jump' | 'funnel' };

export interface ZoneDef {
  min: THREE.Vector3;
  max: THREE.Vector3;
  effect: ZoneEffect;
}

export type ColliderSpec =
  | { type: 'cuboid'; center: THREE.Vector3; half: THREE.Vector3; rotY?: number; rotZ?: number; restitution?: number }
  | { type: 'ball'; center: THREE.Vector3; radius: number }
  | { type: 'cylinder'; center: THREE.Vector3; halfHeight: number; radius: number }
  | { type: 'hull'; points: number[] };

export interface MoverState {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

export interface MoverDef {
  colliders: ColliderSpec[];
  /** Visual template (materials tagged via userData.mats). */
  visual: () => THREE.Object3D;
  /** Deterministic motion in piece-local space. `open` is the race gate state (0..1). */
  motion: (time: number, out: MoverState, open: number) => void;
  gate?: boolean;
}

export interface PieceBuild {
  visual: THREE.Object3D;
  surfaces: SurfaceData[];
  colliders: ColliderSpec[];
  lanes: LaneDef[];
  zones: ZoneDef[];
  movers: MoverDef[];
  spawns: THREE.Vector3[];
  /** Local-space point where the finish line is crossed (finish piece only). */
  finishX?: number;
  /** Bulbs for countdown lights (start piece). */
  hasLights?: boolean;
}

export interface PieceDef {
  id: string;
  name: string;
  category: Category;
  desc: string;
  /** Unlock requirement for creative mode. null = always available. */
  unlock: { level: number; coins: number } | null;
  ports: PortDef[];
  mirrorable?: boolean;
  defaultColor: string;
  /** Rough count of cells along the flow, for UI. */
  size: string;
  build: () => PieceBuild;
  /** Counts as a jump/loop/curve etc. for challenges. */
  tags?: string[];
  decor?: boolean;
  /** Half-width of the channel for overlap checks (default 1.1). */
  extent?: number;
}

/** Serialized track piece (compact). */
export interface PieceData {
  /** Unique id within the track. */
  id: number;
  /** Definition id. */
  t: string;
  /** Position [x, y, z]. */
  p: [number, number, number];
  /** Quarter turns 0..3. */
  r: number;
  /** Mirrored variant. */
  m?: 1;
  /** Colour. */
  c?: string;
  /** Group id. */
  g?: number;
}

export interface TrackData {
  v: 1;
  id: string;
  name: string;
  created: number;
  updated: number;
  env?: string;
  pieces: PieceData[];
  meta?: { author?: string; source?: 'creative' | 'random' | 'challenge' | 'builtin'; seed?: number; difficulty?: string; challenge?: string; area?: number };
  thumb?: string;
}
