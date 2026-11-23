import * as THREE from 'three';
import type { ThoughtIcon, VillagerData } from '../core/types';
import { build, flatMaterial, Part } from '../render/ModelKit';
import type { TerrainData } from '../world/TerrainGen';

const CAPACITY = 140;
const ICONS: Exclude<ThoughtIcon, null>[] = ['question', 'alarm', 'heart', 'pray', 'water', 'food', 'sleep', 'idea', 'music', 'angry'];

interface VisualState {
  x: number;
  z: number;
  y: number;
  heading: number;
  phase: number;
  speed: number;
}

function drawIconAtlas(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size * ICONS.length;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ICONS.forEach((icon, i) => {
    const cx = i * size + size / 2;
    const cy = size / 2 - 6;
    ctx.save();
    // Bubble with tail.
    ctx.fillStyle = icon === 'alarm' ? '#ffefe6' : '#fffaf0';
    ctx.strokeStyle = '#1d2747';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.moveTo(cx - 12, cy + 40);
    ctx.lineTo(cx, cy + 60);
    ctx.lineTo(cx + 12, cy + 40);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 64px "Fredoka", "Arial Rounded MT Bold", Arial, sans-serif';
    switch (icon) {
      case 'question':
        ctx.fillStyle = '#3d5a80';
        ctx.fillText('?', cx, cy + 3);
        break;
      case 'alarm':
        ctx.fillStyle = '#e63946';
        ctx.fillText('!', cx, cy + 3);
        break;
      case 'sleep':
        ctx.fillStyle = '#5c6bc0';
        ctx.font = 'bold 44px Arial, sans-serif';
        ctx.fillText('Zz', cx, cy + 2);
        break;
      case 'heart':
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.moveTo(cx, cy + 22);
        ctx.bezierCurveTo(cx - 40, cy - 6, cx - 18, cy - 34, cx, cy - 14);
        ctx.bezierCurveTo(cx + 18, cy - 34, cx + 40, cy - 6, cx, cy + 22);
        ctx.fill();
        break;
      case 'water':
        ctx.fillStyle = '#2f9ee8';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 28);
        ctx.bezierCurveTo(cx + 26, cy + 2, cx + 22, cy + 26, cx, cy + 26);
        ctx.bezierCurveTo(cx - 22, cy + 26, cx - 26, cy + 2, cx, cy - 28);
        ctx.fill();
        break;
      case 'food':
        ctx.fillStyle = '#c8733a';
        ctx.beginPath();
        ctx.ellipse(cx - 4, cy - 4, 20, 16, -0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f1e3c6';
        ctx.fillRect(cx + 6, cy + 4, 8, 18);
        ctx.beginPath();
        ctx.arc(cx + 8, cy + 24, 6, 0, Math.PI * 2);
        ctx.arc(cx + 15, cy + 22, 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'idea':
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath();
        ctx.arc(cx, cy - 6, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9aa4b8';
        ctx.fillRect(cx - 9, cy + 12, 18, 12);
        break;
      case 'music':
        ctx.fillStyle = '#8a6cff';
        ctx.fillRect(cx + 2, cy - 26, 7, 40);
        ctx.beginPath();
        ctx.ellipse(cx - 6, cy + 16, 13, 10, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx + 2, cy - 26, 20, 8);
        break;
      case 'angry':
        ctx.strokeStyle = '#e63946';
        ctx.lineWidth = 8;
        ctx.beginPath();
        for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.moveTo(cx + ax * 8, cy + ay * 8);
          ctx.lineTo(cx + ax * 24, cy + ay * 24);
        }
        ctx.stroke();
        break;
      case 'pray': {
        ctx.strokeStyle = '#e0a526';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 12, 22, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
          const r = k % 2 ? 7 : 18;
          ctx.lineTo(cx + Math.cos(a) * r, cy + 14 + Math.sin(a) * r);
        }
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Every villager is drawn from shared instanced body parts (one draw call per
 * part type regardless of population). Poses are computed per frame from the
 * villager's current FSM state so behavior is legible at a glance.
 */
export class VillagerRenderer {
  readonly group = new THREE.Group();
  readonly pickMesh: THREE.InstancedMesh;
  private readonly parts: Record<'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR' | 'hair' | 'bun' | 'hat' | 'belt' | 'mouthSmile' | 'mouthFrown' | 'mouthO' | 'leaderHat' | 'axe' | 'hoe' | 'hammer' | 'pick' | 'rod' | 'pack' | 'bindle' | 'staff', THREE.InstancedMesh>;
  private readonly visual = new Map<string, VisualState>();
  private readonly order: VillagerData[] = [];
  private readonly sprites: THREE.Sprite[] = [];
  private readonly iconMats: Record<string, THREE.SpriteMaterial> = {};
  private readonly m = {
    base: new THREE.Matrix4(),
    torso: new THREE.Matrix4(),
    tmp: new THREE.Matrix4(),
    out: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(),
    p: new THREE.Vector3(),
    s: new THREE.Vector3(),
    zero: new THREE.Matrix4().makeScale(0, 0, 0),
  };
  private readonly color = new THREE.Color();

  constructor() {
    const white = 0xffffff;
    const geos = {
      torso: build([Part.cyl(0.17, 0.23, 0.5, 7).at(0, 0.25, 0).color(white)]),
      head: build([
        Part.ico(0.2, 1).at(0, 0.2, 0).color(white),
        Part.ico(0.045, 0).at(0, 0.18, 0.2).color(0xf0c0a0),
        Part.ico(0.036, 0).at(-0.075, 0.245, 0.175).color(0x111111),
        Part.ico(0.036, 0).at(0.075, 0.245, 0.175).color(0x111111),
        Part.box(0.07, 0.018, 0.02).rot(0, 0, 0.15).at(-0.08, 0.3, 0.18).color(0x3a2a20),
        Part.box(0.07, 0.018, 0.02).rot(0, 0, -0.15).at(0.08, 0.3, 0.18).color(0x3a2a20),
      ]),
      mouthSmile: build([Part.box(0.04, 0.02, 0.02).at(-0.04, 0.115, 0.185).rot(0, 0, 0).color(0x6b1e1e), Part.box(0.05, 0.02, 0.02).at(0, 0.1, 0.19).color(0x6b1e1e), Part.box(0.04, 0.02, 0.02).at(0.04, 0.115, 0.185).color(0x6b1e1e)]),
      mouthFrown: build([Part.box(0.04, 0.02, 0.02).at(-0.04, 0.095, 0.185).color(0x6b1e1e), Part.box(0.05, 0.02, 0.02).at(0, 0.11, 0.19).color(0x6b1e1e), Part.box(0.04, 0.02, 0.02).at(0.04, 0.095, 0.185).color(0x6b1e1e)]),
      mouthO: build([Part.ico(0.05, 0).scale(1, 1.25, 0.5).at(0, 0.1, 0.19).color(0x3a0f0f)]),
      leaderHat: build([Part.cyl(0.3, 0.3, 0.03, 10).at(0, 0.36, 0).color(white), Part.cone(0.2, 0.6, 8).at(0, 0.66, 0).color(white), Part.ico(0.06, 0).at(0, 0.98, 0).color(0xf2c14e)]),
      axe: build([Part.box(0.04, 0.6, 0.04).rot(0, 0, 0.6).at(0, 0.3, -0.24).color(0x8a6a44), Part.box(0.18, 0.12, 0.03).rot(0, 0, 0.6).at(0.18, 0.5, -0.24).color(0xb8c2c8)]),
      hoe: build([Part.box(0.035, 0.85, 0.035).rot(0, 0, -0.5).at(0, 0.32, -0.24).color(0x8a6a44), Part.box(0.16, 0.04, 0.1).rot(0, 0, -0.5).at(-0.2, 0.68, -0.24).color(0x9aa4b8)]),
      hammer: build([Part.box(0.035, 0.45, 0.035).at(0.16, 0.05, -0.22).color(0x8a6a44), Part.box(0.14, 0.08, 0.08).at(0.16, 0.28, -0.22).color(0x6e7a86)]),
      armL: build([Part.box(0.09, 0.36, 0.09).at(0, -0.18, 0).color(white), Part.ico(0.06, 0).at(0, -0.38, 0).color(0xf2c9a0)]),
      armR: build([Part.box(0.09, 0.36, 0.09).at(0, -0.18, 0).color(white), Part.ico(0.06, 0).at(0, -0.38, 0).color(0xf2c9a0)]),
      legL: build([Part.box(0.11, 0.36, 0.12).at(0, -0.18, 0).color(white), Part.box(0.12, 0.07, 0.18).at(0, -0.34, 0.03).color(0x3a2a20)]),
      legR: build([Part.box(0.11, 0.36, 0.12).at(0, -0.18, 0).color(white), Part.box(0.12, 0.07, 0.18).at(0, -0.34, 0.03).color(0x3a2a20)]),
      hair: build([Part.sphere(0.215, 8, 4, Math.PI / 2).scale(1, 0.9, 1.05).at(0, 0.21, -0.02).color(white)]),
      bun: build([Part.sphere(0.215, 8, 4, Math.PI / 2).at(0, 0.21, -0.02).color(white), Part.ico(0.11, 0).at(0, 0.38, -0.16).color(white)]),
      hat: build([Part.cyl(0.34, 0.34, 0.03, 10).at(0, 0.3, 0).color(white), Part.cone(0.2, 0.28, 8).at(0, 0.45, 0).color(white)]),
      // v0.3 job tools and travel gear.
      pick: build([Part.box(0.035, 0.6, 0.035).rot(0, 0, -0.55).at(0, 0.3, -0.24).color(0x8a6a44), Part.box(0.3, 0.05, 0.05).rot(0, 0, -0.55).at(-0.16, 0.54, -0.24).color(0x9aa4b0)]),
      rod: build([Part.box(0.025, 1.1, 0.025).rot(0.35, 0, 0.2).at(0.05, 0.5, -0.26).color(0x7a5a34), Part.box(0.008, 0.5, 0.008).at(-0.07, 0.8, -0.05).color(0xe8e8e8)]),
      pack: build([
        Part.box(0.38, 0.36, 0.22).at(0, 0.34, -0.3).color(white),
        Part.box(0.42, 0.05, 0.26).at(0, 0.54, -0.3).color(0x6b4a2a),
        Part.box(0.05, 0.4, 0.05).at(-0.12, 0.34, -0.17).color(0x6b4a2a),
        Part.box(0.05, 0.4, 0.05).at(0.12, 0.34, -0.17).color(0x6b4a2a),
      ]),
      bindle: build([Part.box(0.03, 0.9, 0.03).rot(0, 0, 0.9).at(0.12, 0.62, -0.18).color(0x7a5a34), Part.ico(0.15, 1).at(-0.22, 0.92, -0.18).color(white)]),
      staff: build([Part.box(0.04, 1.3, 0.04).at(0.3, 0.2, 0.06).color(0x8a6a44), Part.box(0.24, 0.16, 0.012).at(0.42, 0.78, 0.06).color(white)]),
      belt: build([Part.cyl(0.235, 0.235, 0.09, 7).at(0, 0.05, 0).color(white), Part.box(0.06, 0.52, 0.03).rot(0, 0, 0.75).at(0, 0.28, 0.2).color(white)]),
    };
    const material = flatMaterial({ roughness: 0.8 });
    this.parts = {} as typeof this.parts;
    for (const [name, geo] of Object.entries(geos) as Array<[keyof typeof geos, THREE.BufferGeometry]>) {
      const mesh = new THREE.InstancedMesh(geo, material, CAPACITY);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `villager-${name}`;
      this.parts[name] = mesh;
      this.group.add(mesh);
    }
    this.pickMesh = this.parts.torso;

    const atlas = drawIconAtlas();
    ICONS.forEach((icon, i) => {
      const tex = atlas.clone();
      tex.repeat.set(1 / ICONS.length, 1);
      tex.offset.set(i / ICONS.length, 0);
      tex.needsUpdate = true;
      this.iconMats[icon] = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    });
    for (let i = 0; i < 40; i++) {
      const sprite = new THREE.Sprite(this.iconMats.question);
      sprite.scale.set(0.95, 0.95, 1);
      sprite.visible = false;
      sprite.renderOrder = 20;
      this.sprites.push(sprite);
      this.group.add(sprite);
    }
  }

  villagerAt(instanceId: number): VillagerData | undefined {
    return this.order[instanceId];
  }

  /** World-space head position for UI anchoring. */
  headPosition(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const v = this.visual.get(id);
    if (!v) return null;
    return out.set(v.x, v.y + 2.05, v.z);
  }

  reset(): void {
    this.visual.clear();
  }

  update(villagers: VillagerData[], terrain: TerrainData, dt: number, elapsed: number, reducedMotion: boolean, religionColors: Map<string, number> = new Map(), backwards = false, packColors: Map<string, number> = new Map()): void {
    const parts = this.parts;
    const m = this.m;
    this.order.length = 0;
    let i = 0;
    let spriteIndex = 0;
    const seen = new Set<string>();
    for (const v of villagers) {
      if (i >= CAPACITY) break;
      seen.add(v.id);
      let vis = this.visual.get(v.id);
      if (!vis) {
        vis = { x: v.position.x, z: v.position.z, y: v.position.y, heading: v.heading, phase: Math.random() * 6, speed: 0 };
        this.visual.set(v.id, vis);
      }
      const k = Math.min(1, dt * 12);
      const nx = vis.x + (v.position.x - vis.x) * k;
      const nz = vis.z + (v.position.z - vis.z) * k;
      const moved = Math.hypot(nx - vis.x, nz - vis.z);
      vis.speed += ((dt > 0 ? moved / dt : 0) - vis.speed) * Math.min(1, dt * 8);
      vis.x = nx;
      vis.z = nz;
      vis.y = terrain.walkHeightAt(nx, nz);
      let dh = v.heading - vis.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      vis.heading += dh * Math.min(1, dt * 10);
      vis.phase += (reducedMotion ? 0 : dt) * (2 + vis.speed * 3.2);

      const state = v.currentTask.state;
      const hidden = (state === 'RESTING' && v.currentTask.arrived) || (!v.alive && v.deadTime > 28);
      const index = i++;
      this.order[index] = v;
      if (hidden) {
        for (const p of Object.values(parts)) p.setMatrixAt(index, m.zero);
        continue;
      }

      // ---- pose parameters ----
      const t = reducedMotion ? 0 : elapsed;
      const walking = vis.speed > 0.25;
      const ph = vis.phase;
      let bob = 0;
      let lean = 0;
      let legL = 0;
      let legR = 0;
      let armL = 0;
      let armR = 0;
      let spreadL = 0.08;
      let spreadR = 0.08;
      let hip = 0.36;
      let lieDown = 0;
      let headTilt = 0;
      const act = v.currentTask.activity;
      if (!v.alive) {
        lieDown = 1;
        hip = 0.12 - Math.max(0, v.deadTime - 20) * 0.03;
      } else if (walking) {
        const run = state === 'FLEEING';
        const amp = run ? 1.0 : 0.6;
        legL = Math.sin(ph) * amp;
        legR = -legL;
        armL = -Math.sin(ph) * amp * 0.9;
        armR = -armL;
        bob = Math.abs(Math.sin(ph)) * (run ? 0.08 : 0.04);
        lean = run ? 0.25 : 0.05;
        if (run) {
          spreadL = 0.5 + Math.sin(t * 14 + index) * 0.4;
          spreadR = 0.5 + Math.cos(t * 13 + index) * 0.4;
          armL = -2.4 + Math.sin(t * 15) * 0.5;
          armR = -2.4 + Math.cos(t * 15) * 0.5;
        }
      } else if (state === 'PRAYING' && v.currentTask.arrived) {
        hip = 0.16;
        legL = 1.45;
        legR = 1.45;
        const bow = Math.sin(t * 2.2 + index) * 0.5 + 0.5;
        lean = 0.15 + bow * 0.45;
        armL = -2.3 + bow * 0.6;
        armR = -2.3 + bow * 0.6;
        spreadL = 0.25;
        spreadR = 0.25;
      } else if (state === 'CELEBRATING') {
        bob = Math.abs(Math.sin(t * 7 + index)) * 0.35;
        armL = -2.9 + Math.sin(t * 12 + index) * 0.3;
        armR = -2.9 - Math.sin(t * 12 + index) * 0.3;
        spreadL = 0.5;
        spreadR = 0.5;
        legL = bob > 0.1 ? 0.3 : 0;
        legR = legL;
      } else if (state === 'WORKING' && v.currentTask.arrived && act === 'farm') {
        const hoe = Math.sin(t * 4 + index);
        lean = 0.55 + hoe * 0.1;
        armL = -1.2 + hoe * 0.6;
        armR = -1.2 + hoe * 0.6;
      } else if (act === 'picnic' && v.currentTask.arrived) {
        hip = 0.16;
        legL = -1.45;
        legR = -1.35;
        lean = -0.15;
        armR = -0.9 + Math.sin(t * 2.5 + index) * 0.4; // snacking
      } else if (act === 'argue' && v.currentTask.arrived) {
        const g = Math.sin(t * 7 + index);
        armL = -1.4 + g * 0.6;
        armR = -0.5 - g * 0.6;
        spreadL = 0.4;
        lean = 0.12 + Math.max(0, g) * 0.1;
        bob = Math.abs(Math.sin(t * 5 + index)) * 0.04;
      } else if ((act === 'investigate' || act === 'queue' || act === 'trial') && v.currentTask.arrived) {
        headTilt = act === 'investigate' ? Math.sin(t * 1.4 + index) * 0.5 : 0;
        lean = act === 'investigate' ? 0.25 : 0;
        if (act === 'queue') armR = -0.25 + Math.sin(t * 6 + index) * 0.15; // impatient tapping
        if (act === 'trial') {
          armL = -1.2;
          armR = -1.2;
          spreadL = -0.45;
          spreadR = -0.45; // arms folded, judging
        }
      } else if (state === 'WORKING' && v.currentTask.arrived && (act === 'chop' || act === 'repair' || act === 'decorate' || act === 'construct' || act === 'construct-office' || act === 'mine')) {
        const chop = Math.sin(t * 6 + index);
        armL = -2.6 + (chop > 0 ? chop * 2 : 0);
        armR = armL;
        lean = 0.1 + Math.max(0, chop) * 0.25;
      } else if (state === 'SEEKING_WATER' || state === 'SEEKING_FOOD') {
        if (v.currentTask.arrived) {
          armR = -1.6;
          lean = 0.2;
        }
      } else {
        // Idle: breathing, occasional head turn, chatting gestures near the well.
        bob = Math.sin(t * 2 + index) * 0.01;
        headTilt = Math.sin(t * 0.7 + index * 1.3) * 0.4;
        if (act === 'chat') armR = -0.6 + Math.sin(t * 3 + index) * 0.4;
        if (v.fear > 0.5) {
          spreadL = 0.3 + Math.sin(t * 20) * 0.1;
          spreadR = spreadL;
          armL = -0.4;
          armR = -0.4;
        }
      }

      const look = v.look;
      const s = look.height * (v.age < 12 ? 0.62 + v.age * 0.02 : 1) * 1.45;
      // Upside-Down Day: everyone walks backwards.
      const yaw = backwards && walking && v.alive ? vis.heading + Math.PI : vis.heading;
      if (backwards && walking) {
        legL = -legL;
        legR = -legR;
      }
      m.p.set(vis.x, vis.y + bob * s, vis.z);
      m.e.set(lieDown ? -Math.PI / 2 : 0, yaw, 0, 'YXZ');
      m.q.setFromEuler(m.e);
      m.s.set(s, s, s);
      m.base.compose(m.p, m.q, m.s);
      if (lieDown) m.base.multiply(m.tmp.makeTranslation(0, -0.1, -0.5));

      // Torso.
      m.torso.copy(m.base).multiply(m.tmp.makeTranslation(0, hip, 0)).multiply(m.out.makeRotationX(lean));
      parts.torso.setMatrixAt(index, m.torso);
      parts.belt.setMatrixAt(index, m.torso);
      // Head.
      const big = v.mutation === 'giant-head' ? 2.05 : 1;
      m.out.copy(m.torso).multiply(m.tmp.makeTranslation(0, 0.52, 0)).multiply(m.tmp.makeRotationY(headTilt));
      if (big !== 1) m.out.multiply(m.tmp.makeScale(big, big, big));
      parts.head.setMatrixAt(index, m.out);
      // Facial expression from mood.
      const scared = v.alive && (state === 'FLEEING' || v.fear > 0.45 || act === 'argue');
      const happy = v.alive && !scared && (v.happiness > 0.55 || state === 'CELEBRATING');
      parts.mouthSmile.setMatrixAt(index, happy ? m.out : m.zero);
      parts.mouthO.setMatrixAt(index, scared ? m.out : m.zero);
      parts.mouthFrown.setMatrixAt(index, !happy && !scared ? m.out : m.zero);
      const leader = !!v.title && v.alive;
      parts.leaderHat.setMatrixAt(index, leader ? m.out : m.zero);
      const hairMesh = look.hairStyle === 2 ? parts.bun : look.hairStyle === 3 ? parts.hat : parts.hair;
      parts.hair.setMatrixAt(index, m.zero);
      parts.bun.setMatrixAt(index, m.zero);
      parts.hat.setMatrixAt(index, m.zero);
      if (look.hairStyle !== 0 && !leader) hairMesh.setMatrixAt(index, m.out);
      // Job tool on the back makes roles readable from the default camera.
      parts.axe.setMatrixAt(index, v.job === 'woodcutter' && v.age >= 12 && !v.travel ? m.torso : m.zero);
      parts.hoe.setMatrixAt(index, v.job === 'farmer' && v.age >= 12 && !v.travel ? m.torso : m.zero);
      parts.hammer.setMatrixAt(index, v.job === 'builder' && v.age >= 12 && !v.travel ? m.torso : m.zero);
      const trip = v.alive ? v.travel?.kind : undefined;
      parts.pick.setMatrixAt(index, v.job === 'miner' && v.age >= 12 && !trip ? m.torso : m.zero);
      parts.rod.setMatrixAt(index, v.job === 'fisher' && v.age >= 12 && !trip ? m.torso : m.zero);
      // Travellers are readable at a glance: merchants carry crates, migrants a bindle, pilgrims a banner staff.
      parts.pack.setMatrixAt(index, trip === 'trade' ? m.torso : m.zero);
      parts.bindle.setMatrixAt(index, trip === 'migrate' || trip === 'visit' ? m.torso : m.zero);
      parts.staff.setMatrixAt(index, trip === 'pilgrim' ? m.torso : m.zero);
      // Arms.
      m.out.copy(m.torso).multiply(m.tmp.makeTranslation(-0.25, 0.44, 0)).multiply(m.tmp.makeRotationZ(-spreadL)).multiply(m.tmp.makeRotationX(armL));
      parts.armL.setMatrixAt(index, m.out);
      m.out.copy(m.torso).multiply(m.tmp.makeTranslation(0.25, 0.44, 0)).multiply(m.tmp.makeRotationZ(spreadR)).multiply(m.tmp.makeRotationX(armR));
      parts.armR.setMatrixAt(index, m.out);
      // Legs.
      m.out.copy(m.base).multiply(m.tmp.makeTranslation(-0.09, hip, 0)).multiply(m.tmp.makeRotationX(legL));
      parts.legL.setMatrixAt(index, m.out);
      m.out.copy(m.base).multiply(m.tmp.makeTranslation(0.09, hip, 0)).multiply(m.tmp.makeRotationX(legR));
      parts.legR.setMatrixAt(index, m.out);

      // Colors.
      const pale = v.alive ? 1 : 0.6;
      parts.torso.setColorAt(index, this.color.set(look.shirt).multiplyScalar(pale));
      parts.armL.setColorAt(index, this.color);
      parts.armR.setColorAt(index, this.color);
      parts.head.setColorAt(index, this.color.set(look.skin).multiplyScalar(pale));
      parts.legL.setColorAt(index, this.color.set(look.pants));
      parts.legR.setColorAt(index, this.color);
      // Believers wear a sash in their religion's color.
      const faithColor = v.religionId ? religionColors.get(v.religionId) : undefined;
      parts.belt.setColorAt(index, this.color.set(faithColor ?? 0x4a3426));
      parts.leaderHat.setColorAt(index, this.color.set(faithColor ?? 0x8a6cff));
      for (const mouth of [parts.mouthSmile, parts.mouthFrown, parts.mouthO, parts.axe, parts.hoe, parts.hammer, parts.pick, parts.rod]) mouth.setColorAt(index, this.color.set(0xffffff));
      parts.pack.setColorAt(index, this.color.set(packColors.get(v.id) ?? 0xc8a46a));
      parts.bindle.setColorAt(index, this.color.set(0xd96a5a));
      parts.staff.setColorAt(index, this.color.set(faithColor ?? 0xf2c14e));
      hairMesh.setColorAt(index, this.color.set(look.hairStyle === 3 ? 0xd9b25a : look.hair));

      // Thought icon.
      if (v.alive && v.thought && spriteIndex < this.sprites.length) {
        const sprite = this.sprites[spriteIndex++];
        sprite.material = this.iconMats[v.thought];
        sprite.visible = true;
        sprite.position.set(vis.x, vis.y + 2.25 * (s / 1.25) + Math.sin(t * 3 + index) * 0.08, vis.z);
        const sc = v.thought === 'alarm' ? 1.05 : 0.9;
        sprite.scale.set(sc, sc, 1);
      }
    }
    for (let k = spriteIndex; k < this.sprites.length; k++) this.sprites[k].visible = false;
    for (const id of this.visual.keys()) if (!seen.has(id)) this.visual.delete(id);
    for (const p of Object.values(parts)) {
      p.count = i;
      p.instanceMatrix.needsUpdate = true;
      if (p.instanceColor) p.instanceColor.needsUpdate = true;
    }
  }
}
