import * as THREE from 'three';
import { walkingMaterial, antGeometry, beeGeometry, beetleGeometry, dragonflyGeometry, grasshopperGeometry, ladybugGeometry, pillbugGeometry, wingGeometry } from '../characters/Insects';
import type { CritterSystem } from '../racing/Critters';
import { createSeededRandom } from '../utils/random';
import { track } from '../world/Track';

/**
 * Draws the insect hazards from the critter system, plus ambient bugs that make
 * each course feel alive: bees, dragonflies and ladybugs (none in the snow).
 */

const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
const shinyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.2 });
// Shader-driven walking legs: quick little steps for ants, slow heavy ones for beetles.
const antWalk = walkingMaterial(bodyMat, 0.05, 24);
const beetleWalk = walkingMaterial(shinyMat, 0.13, 8);
const wingMat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

interface Flyer {
  root: THREE.Group;
  wings: THREE.Mesh;
  anchor: THREE.Vector3;
  target: THREE.Vector3;
  phase: number;
  kind: 'bee' | 'dragonfly';
  timer: number;
}

interface Crawler {
  base: THREE.Vector3;
  yaw: number;
  phase: number;
  r: number;
}

export class CritterView {
  readonly group = new THREE.Group();
  private ants: THREE.InstancedMesh | null = null;
  private readonly bugs: THREE.Object3D[] = [];
  private readonly flyers: Flyer[] = [];
  private ladybugs: THREE.InstancedMesh | null = null;
  private readonly crawlers: Crawler[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly antGeo = antGeometry();
  private readonly pillGeo = pillbugGeometry();
  private readonly beetleGeo = beetleGeometry();
  private readonly hopperGeo = grasshopperGeometry();
  private readonly beeGeo = beeGeometry();
  private readonly dragonGeo = dragonflyGeometry();
  private readonly ladyGeo = ladybugGeometry();
  private readonly beeWing = wingGeometry(0.5, 0.26);
  private readonly dragonWing = wingGeometry(2.0, 0.34, 2);

  constructor() {
    this.group.name = 'critters';
  }

  private clear(): void {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    }
    this.ants = null;
    this.ladybugs = null;
    this.bugs.length = 0;
    this.flyers.length = 0;
    this.crawlers.length = 0;
  }

  /** Rebuild for the current course (after CritterSystem.reset). */
  reset(critters: CritterSystem): void {
    this.clear();
    const antCount = critters.bodies.filter((b) => b.kind === 'ants').length;
    if (antCount) {
      this.ants = new THREE.InstancedMesh(this.antGeo, antWalk.material, antCount);
      this.ants.castShadow = true;
      this.ants.frustumCulled = false;
      this.group.add(this.ants);
    }
    for (const b of critters.bodies) {
      if (b.kind === 'ants') continue;
      const geo = b.kind === 'pillbug' ? this.pillGeo : b.kind === 'beetle' ? this.beetleGeo : this.hopperGeo;
      const m = new THREE.Mesh(geo, b.kind === 'grasshopper' ? bodyMat : b.kind === 'beetle' ? beetleWalk.material : shinyMat);
      m.castShadow = true;
      if (b.kind === 'pillbug') m.scale.setScalar(b.r);
      if (b.kind === 'beetle') m.scale.setScalar(1.25);
      if (b.kind === 'grasshopper') m.scale.setScalar(1.4);
      this.group.add(m);
      this.bugs.push(m);
    }

    // Ambient life, by theme.
    const flora = track.def.theme.flora;
    if (flora === 'snow') return;
    const rng = createSeededRandom(4242);
    const v = new THREE.Vector3();
    const bees = flora === 'sand' ? 3 : flora === 'glow' ? 0 : 12;
    const dragons = flora === 'pond' ? 9 : flora === 'sand' ? 0 : 4;
    for (let i = 0; i < bees + dragons; i += 1) {
      const kind = i < bees ? 'bee' : 'dragonfly';
      const s = rng() * track.length;
      const side = rng() < 0.5 ? -1 : 1;
      track.toWorld(s, side * (track.halfWidth(s) + 5 + rng() * 10), v);
      v.y += kind === 'bee' ? 2 + rng() * 2.5 : 3 + rng() * 3;
      const root = new THREE.Group();
      const body = new THREE.Mesh(kind === 'bee' ? this.beeGeo : this.dragonGeo, bodyMat);
      const wings = new THREE.Mesh(kind === 'bee' ? this.beeWing : this.dragonWing, wingMat);
      wings.position.set(0, kind === 'bee' ? 0.2 : 0.1, kind === 'bee' ? 0.05 : 0.15);
      root.add(body, wings);
      root.scale.setScalar(kind === 'bee' ? 1.3 : 1.2);
      root.position.copy(v);
      this.group.add(root);
      this.flyers.push({ root, wings, anchor: v.clone(), target: v.clone(), phase: rng() * 10, kind, timer: rng() * 2 });
    }
    const ladies = flora === 'sand' ? 8 : 34;
    this.ladybugs = new THREE.InstancedMesh(this.ladyGeo, shinyMat, ladies);
    this.ladybugs.frustumCulled = false;
    for (let i = 0; i < ladies; i += 1) {
      const s = rng() * track.length;
      const side = rng() < 0.5 ? -1 : 1;
      track.toWorld(s, side * (track.halfWidth(s) + 2.5 + rng() * 6), v);
      this.crawlers.push({ base: v.clone(), yaw: rng() * 6.28, phase: rng() * 10, r: 0.4 + rng() * 0.8 });
    }
    this.group.add(this.ladybugs);
  }

  /** `racers`: snail positions, so ants near a passing snail scatter out of its way. */
  update(critters: CritterSystem, time: number, racers: readonly { pos: THREE.Vector3 }[] = []): void {
    const d = this.dummy;
    antWalk.time.value = time;
    beetleWalk.time.value = time;
    let ai = 0;
    let bi = 0;
    for (const b of critters.bodies) {
      if (b.kind === 'ants') {
        if (!this.ants) continue;
        d.position.copy(b.pos);
        d.position.y += Math.abs(Math.sin(b.anim)) * 0.05 - 0.1;
        let yaw = -b.yaw + Math.sin(b.anim * 0.5) * 0.15 + Math.PI;
        // Panic: shy away from the nearest snail and turn to flee.
        let best = 9;
        let fx = 0;
        let fz = 0;
        for (const r of racers) {
          const dx = b.pos.x - r.pos.x;
          const dz = b.pos.z - r.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < best && Math.abs(b.pos.y - r.pos.y) < 3) {
            best = dist;
            fx = dx / Math.max(dist, 1e-3);
            fz = dz / Math.max(dist, 1e-3);
          }
        }
        if (best < 3.2) {
          const push = (1 - best / 3.2) * 0.7;
          d.position.x += fx * push;
          d.position.z += fz * push;
          d.position.y += Math.abs(Math.sin(time * 40 + ai)) * 0.06;
          yaw = Math.atan2(fx, fz) + Math.sin(time * 25 + ai) * 0.4;
        }
        d.rotation.set(0, yaw, 0);
        d.scale.setScalar(1.25);
        d.updateMatrix();
        this.ants.setMatrixAt(ai, d.matrix);
        ai += 1;
        continue;
      }
      const m = this.bugs[bi];
      bi += 1;
      if (!m) continue;
      m.position.copy(b.pos);
      if (b.kind === 'pillbug') {
        m.rotation.set(0, -b.yaw + Math.PI, 0);
        m.rotateX(b.anim);
      } else if (b.kind === 'beetle') {
        m.position.y += -0.55 + Math.abs(Math.sin(b.anim)) * 0.06;
        m.rotation.set(0, -b.yaw + Math.PI, Math.sin(b.anim * 2) * 0.03);
      } else {
        const hopping = b.lift > 0.5;
        m.position.y -= 0.45;
        m.rotation.set(hopping ? -0.35 : 0, -b.yaw + Math.PI, 0);
      }
    }
    if (this.ants) this.ants.instanceMatrix.needsUpdate = true;

    for (const f of this.flyers) {
      const t = time + f.phase;
      if (f.kind === 'bee') {
        // Lazy figure-eights round a flower.
        f.root.position.set(f.anchor.x + Math.sin(t * 0.9) * 2.2, f.anchor.y + Math.sin(t * 2.1) * 0.4, f.anchor.z + Math.sin(t * 1.8) * 1.4);
        f.root.rotation.y = Math.atan2(Math.cos(t * 0.9) * 2.2, Math.cos(t * 1.8) * 2.8);
        f.wings.scale.set(1, 1, 1);
        f.wings.rotation.z = Math.sin(time * 60 + f.phase) * 0.5;
      } else {
        // Dart, hover, dart.
        f.timer -= 1 / 60;
        if (f.timer <= 0) {
          f.timer = 1.2 + ((f.phase * 7.3 + time) % 1.6);
          f.target.set(f.anchor.x + Math.sin(time * 3.1 + f.phase) * 6, f.anchor.y + Math.sin(time * 1.7) * 1.2, f.anchor.z + Math.cos(time * 2.3 + f.phase) * 6);
        }
        const before = f.root.position.clone();
        f.root.position.lerp(f.target, 0.06);
        const dx = f.root.position.x - before.x;
        const dz = f.root.position.z - before.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.01) f.root.rotation.y = Math.atan2(dx, dz);
        f.wings.rotation.z = Math.sin(time * 45 + f.phase) * 0.25;
      }
    }

    if (this.ladybugs) {
      this.crawlers.forEach((c, i) => {
        const t = time * 0.35 + c.phase;
        d.position.set(c.base.x + Math.cos(t) * c.r, c.base.y + 0.02, c.base.z + Math.sin(t) * c.r);
        d.rotation.set(0, -t, 0);
        d.scale.setScalar(0.9);
        d.updateMatrix();
        this.ladybugs!.setMatrixAt(i, d.matrix);
      });
      this.ladybugs.instanceMatrix.needsUpdate = true;
    }
  }
}
