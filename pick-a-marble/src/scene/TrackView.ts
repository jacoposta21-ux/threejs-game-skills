import * as THREE from 'three';
import { getDef } from '../track/catalog';
import { getBuild } from '../track/PieceRegistry';
import { pieceMatrix, worldLanes } from '../track/Track';
import type { MoverState, PieceData, TrackData } from '../track/types';
import { materials } from './Materials';

export interface PieceVisual {
  data: PieceData;
  sig: string;
  object: THREE.Group;
  movers: THREE.Object3D[];
  anims: THREE.Mesh[];
  bulbs: THREE.Mesh[];
  pad?: THREE.Object3D;
  muzzle?: THREE.Object3D;
}

const _state: MoverState = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

export class TrackView {
  readonly root = new THREE.Group();
  readonly visuals = new Map<number, PieceVisual>();
  private supports: THREE.InstancedMesh | null = null;
  private supportFeet: THREE.InstancedMesh | null = null;
  private supportsDirty = true;
  private highlight = new THREE.Group();
  private padSquash = new Map<number, number>();
  showSupports = true;

  constructor() {
    this.root.add(this.highlight);
  }

  sync(track: TrackData): void {
    const seen = new Set<number>();
    for (const pd of track.pieces) {
      seen.add(pd.id);
      const sig = `${pd.t}|${pd.p.join(',')}|${pd.r}|${pd.m ?? 0}|${pd.c ?? ''}`;
      const cur = this.visuals.get(pd.id);
      if (cur && cur.sig === sig) {
        cur.data = pd;
        continue;
      }
      if (cur) this.removeVisual(pd.id);
      this.visuals.set(pd.id, this.createVisual(pd, sig));
      this.supportsDirty = true;
    }
    for (const id of [...this.visuals.keys()]) {
      if (!seen.has(id)) {
        this.removeVisual(id);
        this.supportsDirty = true;
      }
    }
    if (this.supportsDirty) this.rebuildSupports();
  }

  clear(): void {
    for (const id of [...this.visuals.keys()]) this.removeVisual(id);
    this.rebuildSupports();
  }

  private createVisual(pd: PieceData, sig: string): PieceVisual {
    const def = getDef(pd.t);
    const build = getBuild(pd.t, !!pd.m);
    const object = new THREE.Group();
    object.matrixAutoUpdate = false;
    pieceMatrix(pd, object.matrix);
    object.userData.pieceId = pd.id;
    const vis = build.visual.clone(true);
    materials.applyTo(vis, pd.c ?? def.defaultColor);
    object.add(vis);
    const movers: THREE.Object3D[] = [];
    for (const m of build.movers) {
      const mv = m.visual();
      materials.applyTo(mv, pd.c ?? def.defaultColor);
      const wrap = new THREE.Group();
      wrap.add(mv);
      if (pd.m) {
        // mirrored pieces: keep mover motion in mirrored space
        wrap.userData.mirror = true;
      }
      object.add(wrap);
      movers.push(wrap);
    }
    const anims: THREE.Mesh[] = [];
    const bulbs: THREE.Mesh[] = [];
    let pad: THREE.Object3D | undefined;
    let muzzle: THREE.Object3D | undefined;
    object.traverse((o) => {
      o.userData.pieceId = pd.id;
      const mesh = o as THREE.Mesh;
      if (mesh.userData.anim) anims.push(mesh);
      if (mesh.name?.startsWith('bulb')) {
        // per-instance bulb materials so countdown lights can change
        mesh.material = (mesh.material as THREE.Material).clone();
        bulbs.push(mesh);
      }
      if (mesh.name === 'pad') pad = mesh;
      if (mesh.name === 'muzzle') muzzle = mesh;
      if (mesh.userData.anim === 'flag') {
        mesh.geometry = mesh.geometry.clone();
        mesh.userData.base = (mesh.geometry.getAttribute('position').array as Float32Array).slice();
      }
    });
    bulbs.sort((a, b) => a.name.localeCompare(b.name));
    this.root.add(object);
    object.updateMatrixWorld(true);
    return { data: pd, sig, object, movers, anims, bulbs, pad, muzzle };
  }

  private removeVisual(id: number): void {
    const v = this.visuals.get(id);
    if (!v) return;
    this.root.remove(v.object);
    v.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.userData.anim === 'flag') mesh.geometry.dispose();
    });
    this.visuals.delete(id);
  }

  private rebuildSupports(): void {
    this.supportsDirty = false;
    if (this.supports) {
      this.root.remove(this.supports);
      this.supports.dispose();
      this.supports = null;
    }
    if (this.supportFeet) {
      this.root.remove(this.supportFeet);
      this.supportFeet.dispose();
      this.supportFeet = null;
    }
    if (!this.showSupports) return;
    const cols: { x: number; z: number; top: number }[] = [];
    for (const v of this.visuals.values()) {
      const def = getDef(v.data.t);
      if (def.decor) continue;
      if (def.id.startsWith('funnel')) {
        // funnels already have legs; support the chute end and entry
      }
      for (const lane of worldLanes(v.data)) {
        const pts = lane.points;
        let acc = 0;
        for (let i = 1; i < pts.length; i += 1) {
          acc += pts[i].distanceTo(pts[i - 1]);
          if (acc >= 5.5 || i === Math.floor(pts.length / 2)) {
            acc = 0;
            const p = pts[i];
            if (p.y > 1.2) cols.push({ x: p.x, z: p.z, top: p.y - 0.12 });
          }
        }
      }
    }
    // thin out columns that are too close together
    const kept: typeof cols = [];
    for (const c of cols) {
      if (kept.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < 2.6)) continue;
      kept.push(c);
    }
    if (!kept.length) return;
    const geo = new THREE.CylinderGeometry(0.09, 0.12, 1, 6);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#e9edf5', roughness: 0.55, metalness: 0.2 });
    const inst = new THREE.InstancedMesh(geo, mat, kept.length);
    const feet = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.36, 0.12, 8), new THREE.MeshStandardMaterial({ color: '#9aa4b5', roughness: 0.6 }), kept.length);
    const m = new THREE.Matrix4();
    kept.forEach((c, i) => {
      m.compose(new THREE.Vector3(c.x, 0, c.z), new THREE.Quaternion(), new THREE.Vector3(1, c.top, 1));
      inst.setMatrixAt(i, m);
      m.makeTranslation(c.x, 0.06, c.z);
      feet.setMatrixAt(i, m);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    feet.receiveShadow = true;
    this.supports = inst;
    this.supportFeet = feet;
    this.root.add(inst, feet);
  }

  /** Preview animation (editor/menu) or physics-driven poses (race). */
  animate(time: number, dt: number, moverPose?: (pieceId: number, index: number) => { pos: THREE.Vector3; quat: THREE.Quaternion } | null, gateOpen = 0): void {
    for (const v of this.visuals.values()) {
      const build = getBuild(v.data.t, !!v.data.m);
      v.movers.forEach((wrap, i) => {
        const pose = moverPose?.(v.data.id, i);
        if (pose) {
          // world pose → piece local
          const inv = v.object.matrix.clone().invert();
          const wm = new THREE.Matrix4().compose(pose.pos, pose.quat, new THREE.Vector3(1, 1, 1));
          wm.premultiply(inv);
          wm.decompose(wrap.position, wrap.quaternion, wrap.scale);
        } else {
          const def = build.movers[i];
          def.motion(time, _state, def.gate ? gateOpen : 1);
          wrap.position.copy(_state.pos);
          wrap.quaternion.copy(_state.quat);
          if (v.data.m) {
            wrap.position.z = -wrap.position.z;
            wrap.quaternion.x = -wrap.quaternion.x;
            wrap.quaternion.y = -wrap.quaternion.y;
            wrap.scale.z = -1;
          }
        }
      });
      for (const a of v.anims) {
        if (a.userData.anim === 'flag') {
          const pos = a.geometry.getAttribute('position') as THREE.BufferAttribute;
          const base = a.userData.base as Float32Array;
          for (let i = 0; i < pos.count; i += 1) {
            const x = base[i * 3];
            pos.setZ(i, Math.sin(time * 4 + x * 3) * 0.12 * (x + 0.7));
          }
          pos.needsUpdate = true;
        } else if (a.userData.anim === 'pulse') {
          a.scale.setScalar(1 + Math.sin(time * 3) * 0.06);
        }
      }
      if (v.pad) {
        const sq = this.padSquash.get(v.data.id) ?? 0;
        if (sq > 0) this.padSquash.set(v.data.id, Math.max(0, sq - dt * 4));
        v.pad.scale.y = 1 - Math.sin(sq * Math.PI) * 0.6;
      }
      if (v.muzzle) {
        const sq = this.padSquash.get(-v.data.id) ?? 0;
        if (sq > 0) this.padSquash.set(-v.data.id, Math.max(0, sq - dt * 3));
        v.muzzle.scale.setScalar(1 + sq * 0.4);
      }
    }
    // booster chevrons scroll
    materials.chevronTex.offset.x = -time * 1.6;
  }

  bouncePad(pieceId: number): void {
    this.padSquash.set(pieceId, 1);
  }

  fireCannon(pieceId: number): void {
    this.padSquash.set(-pieceId, 1);
  }

  /** Countdown lights on the start arch: lit = number of bulbs on (0..3), green when go. */
  setLights(lit: number, go: boolean): void {
    for (const v of this.visuals.values()) {
      v.bulbs.forEach((b, i) => {
        const m = b.material as THREE.MeshStandardMaterial;
        if (go) {
          m.emissive.set('#2bff88');
          m.emissiveIntensity = 2.4;
        } else {
          m.emissive.set(i === 2 ? '#2bff88' : i === 1 ? '#ffbe0b' : '#ff3b3b');
          m.emissiveIntensity = i < lit ? 2.2 : 0.05;
          if (i < lit) m.emissive.set('#ff3b3b');
        }
      });
    }
  }

  pick(raycaster: THREE.Raycaster): number | null {
    const hits = raycaster.intersectObjects(
      [...this.visuals.values()].map((v) => v.object),
      true,
    );
    for (const h of hits) {
      const id = h.object.userData.pieceId as number | undefined;
      if (id !== undefined) return id;
    }
    return null;
  }

  pieceBox(id: number): THREE.Box3 | null {
    const v = this.visuals.get(id);
    if (!v) return null;
    return new THREE.Box3().setFromObject(v.object);
  }

  setSupportsVisible(on: boolean): void {
    this.showSupports = on;
    this.rebuildSupports();
  }
}
