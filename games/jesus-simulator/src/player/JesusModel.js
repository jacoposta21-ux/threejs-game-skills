import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox } from '../world/geometry.js';
import { clamp, damp } from '../core/rng.js';

const SKIN = '#e0b48a';
const HAIR = '#6a4126';
const BEARD = '#5a371f';
const ROBE = '#f2ead6';
const ROBE_SHADE = '#e4d8bc';
const SASH = '#b8262b';
const LEATHER = '#7a4a26';

function faceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = SKIN;
  g.fillRect(0, 0, 128, 128);
  // cheeks
  g.fillStyle = 'rgba(214,120,100,0.28)';
  g.beginPath(); g.ellipse(30, 78, 12, 8, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(98, 78, 12, 8, 0, 0, Math.PI * 2); g.fill();
  // eyebrows
  g.strokeStyle = BEARD;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(26, 42); g.quadraticCurveTo(38, 35, 50, 41); g.stroke();
  g.beginPath(); g.moveTo(78, 41); g.quadraticCurveTo(90, 35, 102, 42); g.stroke();
  // eyes: warm brown with highlights
  for (const x of [39, 89]) {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(x, 60, 10, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a2c18';
    g.beginPath(); g.ellipse(x + 1, 61, 7, 8.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1c120c';
    g.beginPath(); g.ellipse(x + 1, 62, 3.6, 4.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(x + 4, 57, 2.6, 0, Math.PI * 2); g.fill();
  }
  // nose
  g.fillStyle = 'rgba(150,90,60,0.35)';
  g.beginPath(); g.ellipse(64, 80, 6, 4, 0, 0, Math.PI * 2); g.fill();
  // smile
  g.strokeStyle = '#7a3b2a';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(50, 98); g.quadraticCurveTo(64, 108, 78, 98); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

/**
 * For every node, merge its childless mesh children that use the same
 * material into one mesh (transforms baked). `keep` meshes stay separate
 * because the animator moves them.
 */
function mergeStatic(root, keep) {
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  for (const node of nodes) {
    const groups = new Map();
    for (const c of node.children) {
      if (!c.isMesh || c.children.length || keep.has(c)) continue;
      if (!groups.has(c.material)) groups.set(c.material, []);
      groups.get(c.material).push(c);
    }
    for (const [material, list] of groups) {
      if (list.length < 2) continue;
      const geos = list.map((c) => {
        c.updateMatrix();
        let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        g.applyMatrix4(c.matrix);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      for (const c of list) {
        node.remove(c);
        c.geometry.dispose();
      }
      for (const g of geos) g.dispose();
      const m = new THREE.Mesh(merged, material);
      m.castShadow = true;
      m.receiveShadow = true;
      node.add(m);
    }
  }
}

function part(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Blocky but characterful Jesus: long brown hair, beard, cream tunic, red
 * sash, leather sandals, friendly face and a soft halo. Pivots allow a
 * procedural walk / run / jump / idle rig.
 */
export class JesusModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'jesus';
    const m = {
      skin: mat(SKIN, { roughness: 0.7 }),
      hair: mat(HAIR, { roughness: 0.9 }),
      beard: mat(BEARD, { roughness: 0.95 }),
      robe: mat(ROBE, { roughness: 0.92 }),
      robeShade: mat(ROBE_SHADE, { roughness: 0.92 }),
      sash: mat(SASH, { roughness: 0.75 }),
      leather: mat(LEATHER, { roughness: 0.85 }),
      face: new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.7 }),
      halo: new THREE.MeshStandardMaterial({ color: '#ffd36b', emissive: '#ffb830', emissiveIntensity: 1.4, roughness: 0.4, transparent: true, opacity: 0.85 }),
    };
    this.materials = m;

    // body sways and leans from the hips
    this.body = new THREE.Group();
    this.group.add(this.body);

    // legs (pivot at hip)
    this.legs = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.16, 0.92, 0);
      pivot.add(part(roundedBox(0.24, 0.6, 0.26, 0.06), m.robeShade, 0, -0.3, 0));
      pivot.add(part(roundedBox(0.2, 0.36, 0.22, 0.06), m.skin, 0, -0.7, 0));
      pivot.add(part(roundedBox(0.24, 0.07, 0.36, 0.03), m.leather, 0, -0.89, 0.04));
      pivot.add(part(new THREE.BoxGeometry(0.22, 0.04, 0.05), m.leather, 0, -0.8, 0.09));
      pivot.add(part(new THREE.BoxGeometry(0.21, 0.04, 0.04), m.leather, 0, -0.74, -0.08));
      this.body.add(pivot);
      return pivot;
    });

    // robe skirt (flared) + hem trim
    this.skirt = new THREE.Group();
    this.skirt.position.y = 0.98;
    const skirtGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.66, 10, 1);
    skirtGeo.scale(1, 1, 0.72);
    this.skirt.add(part(skirtGeo, m.robe, 0, -0.33, 0));
    const hemGeo = new THREE.CylinderGeometry(0.505, 0.51, 0.06, 10, 1, true);
    hemGeo.scale(1, 1, 0.72);
    this.skirt.add(part(hemGeo, m.sash, 0, -0.63, 0));
    this.body.add(this.skirt);

    // torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.96;
    this.body.add(this.torso);
    this.torso.add(part(roundedBox(0.76, 0.74, 0.44, 0.12), m.robe, 0, 0.37, 0));
    // red sash: diagonal over the shoulder + belt with hanging tail
    const sash = part(new THREE.BoxGeometry(0.2, 0.98, 0.47), m.sash, 0, 0.36, 0);
    sash.rotation.z = 0.72;
    this.torso.add(sash);
    this.torso.add(part(roundedBox(0.8, 0.12, 0.48, 0.05), m.sash, 0, 0.04, 0));
    this.sashTail = part(new THREE.BoxGeometry(0.12, 0.42, 0.04), m.sash, 0.24, -0.16, 0.24);
    this.torso.add(this.sashTail);
    this.torso.add(part(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 8), m.skin, 0, 0.78, 0));
    // V-neck opening
    const neck = part(new THREE.BoxGeometry(0.16, 0.16, 0.02), m.skin, 0, 0.66, 0.222);
    neck.rotation.z = Math.PI / 4;
    this.torso.add(neck);

    // arms (pivot at shoulder)
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.47, 0.66, 0);
      pivot.add(part(roundedBox(0.22, 0.5, 0.25, 0.07), m.robe, side * 0.04, -0.22, 0));
      pivot.add(part(roundedBox(0.26, 0.12, 0.29, 0.04), m.robeShade, side * 0.05, -0.46, 0));
      pivot.add(part(roundedBox(0.17, 0.2, 0.19, 0.06), m.skin, side * 0.05, -0.6, 0));
      this.torso.add(pivot);
      return pivot;
    });

    // head
    this.head = new THREE.Group();
    this.head.position.y = 0.84;
    this.torso.add(this.head);
    this.head.add(part(roundedBox(0.54, 0.56, 0.52, 0.12), m.skin, 0, 0.28, 0));
    const face = part(new THREE.PlaneGeometry(0.46, 0.46), m.face, 0, 0.3, 0.262);
    face.castShadow = false;
    this.head.add(face);
    // hair: crown, centre part, long back panel, side locks
    this.head.add(part(roundedBox(0.6, 0.18, 0.58, 0.08), m.hair, 0, 0.57, -0.01));
    this.head.add(part(roundedBox(0.58, 0.12, 0.2, 0.05), m.hair, 0, 0.5, 0.2));
    this.hairBack = new THREE.Group();
    this.hairBack.position.set(0, 0.5, -0.24);
    this.hairBack.add(part(roundedBox(0.6, 0.72, 0.13, 0.06), m.hair, 0, -0.3, -0.02));
    this.head.add(this.hairBack);
    for (const side of [-1, 1]) {
      this.head.add(part(roundedBox(0.1, 0.62, 0.36, 0.05), m.hair, side * 0.3, 0.24, -0.05));
      this.head.add(part(roundedBox(0.1, 0.38, 0.12, 0.04), m.hair, side * 0.3, -0.02, 0.1));
    }
    // beard + moustache
    this.head.add(part(roundedBox(0.5, 0.2, 0.16, 0.07), m.beard, 0, 0.06, 0.22));
    this.head.add(part(roundedBox(0.3, 0.14, 0.14, 0.06), m.beard, 0, -0.06, 0.2));
    for (const side of [-1, 1]) this.head.add(part(roundedBox(0.1, 0.3, 0.3, 0.04), m.beard, side * 0.24, 0.12, 0.1));
    this.head.add(part(roundedBox(0.28, 0.05, 0.05, 0.02), m.beard, 0, 0.16, 0.27));

    // halo
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 6, 32), m.halo);
    this.halo.rotation.x = Math.PI / 2 - 0.25;
    this.halo.position.set(0, 0.86, -0.08);
    this.head.add(this.halo);

    // merge static parts that share a pivot and a material (fewer geometries and draw calls)
    mergeStatic(this.group, new Set([this.sashTail, this.hairBack, this.halo, face]));

    this.phase = 0;
    this.time = 0;
    this.squash = 0;
    this.lean = 0;
    this.airBlend = 0;
    this.moveBlend = 0;
  }

  /**
   * @param {{speed:number, sprint:boolean, grounded:boolean, vy:number, aiming:boolean}} s
   */
  update(dt, s) {
    this.time += dt;
    const k = damp(12, dt);
    const speedN = clamp(s.speed / 7.5, 0, 1);
    this.moveBlend += ((s.speed > 0.2 && s.grounded && !s.ride ? 1 : 0) - this.moveBlend) * k;
    this.airBlend += ((s.grounded || s.ride ? 0 : 1) - this.airBlend) * damp(10, dt);
    this.phase += dt * (3.2 + s.speed * 1.55);

    const amp = (0.45 + speedN * 0.55) * this.moveBlend;
    const sw = Math.sin(this.phase);
    const breath = Math.sin(this.time * 2.1);

    // walk / run cycle
    let legL = sw * 0.75 * amp;
    let legR = -sw * 0.75 * amp;
    let armL = -sw * 0.7 * amp;
    let armR = sw * 0.7 * amp;
    let armSpread = 0.06 + 0.02 * breath * (1 - this.moveBlend);
    // jump/fall pose
    const air = this.airBlend;
    const rising = s.vy > 0 ? 1 : 0;
    legL = legL * (1 - air) + air * (rising ? -0.6 : -0.25);
    legR = legR * (1 - air) + air * (rising ? 0.35 : 0.2);
    armL = armL * (1 - air) + air * -0.5;
    armR = armR * (1 - air) + air * -0.5;
    armSpread += air * 0.75;
    if (s.aiming) {
      armR = -1.4;
      armSpread = 0.1;
    }
    // miracle poses (one-shot casts and held poses)
    this.castT = Math.max(0, (this.castT || 0) - dt);
    const pose = this.castT > 0 ? this.castPose : this.holdPose;
    let leanAdd = 0;
    if (pose === 'push') { armL = -1.55; armR = -1.55; armSpread = -0.05; leanAdd = 0.25; }
    else if (pose === 'bless') { armL = -2.5; armR = -2.5; armSpread = 0.45; }
    else if (pose === 'touch') { armR = -1.45; armL = -0.3; leanAdd = 0.12; }
    else if (pose === 'levitate') { armL = -2.0 + Math.sin(this.time * 3) * 0.08; armR = -2.0 - Math.sin(this.time * 3) * 0.08; armSpread = 0.2; }
    else if (pose === 'water') { armSpread = Math.max(armSpread, 0.55); }
    // riding: straddle a saddle, sit on a cart bench, or stand in a chariot holding the reins
    let legSpread = 0;
    this.rideBlend = (this.rideBlend || 0) + ((s.ride ? 1 : 0) - (this.rideBlend || 0)) * damp(10, dt);
    if (s.ride) {
      const jig = Math.sin(this.time * (4 + s.speed * 1.3)) * Math.min(1, s.speed / 6);
      if (s.ride === 'stand') {
        legL = -0.12;
        legR = 0.12;
        leanAdd += 0.12 + Math.min(0.25, s.speed * 0.015);
      } else {
        legL = s.ride === 'sit' ? -1.45 : -1.15;
        legR = legL;
        legSpread = s.ride === 'sit' ? 0.12 : 0.42;
        leanAdd += Math.min(0.3, s.speed * 0.02) + jig * 0.03;
      }
      if (!pose) {
        armL = -0.85 + jig * 0.12;
        armR = -0.85 - jig * 0.12;
        armSpread = 0.02;
      }
    }

    this.legs[0].rotation.x = legL;
    this.legs[1].rotation.x = legR;
    this.legs[0].rotation.z = -legSpread;
    this.legs[1].rotation.z = legSpread;
    this.arms[0].rotation.x += (armL - this.arms[0].rotation.x) * k;
    this.arms[1].rotation.x += (armR - this.arms[1].rotation.x) * k;
    this.arms[0].rotation.z += (-armSpread - this.arms[0].rotation.z) * k;
    this.arms[1].rotation.z += (armSpread - this.arms[1].rotation.z) * k;

    const bob = Math.abs(Math.cos(this.phase)) * 0.07 * amp;
    const targetLean = speedN * 0.22 * this.moveBlend + air * -0.05 + leanAdd;
    this.skirt.scale.set(1, 1 - this.rideBlend * 0.45, 1 + this.rideBlend * 0.35);
    this.lean += (targetLean - this.lean) * k;
    this.body.position.y = bob + (1 - this.moveBlend) * breath * 0.008 * (1 - air);
    this.torso.rotation.x = this.lean;
    this.torso.rotation.y = sw * 0.08 * amp;
    this.skirt.rotation.x = this.lean * 0.4;
    this.skirt.rotation.z = sw * 0.05 * amp;
    this.head.rotation.x = -this.lean * 0.6;
    this.head.rotation.y = (1 - this.moveBlend) * Math.sin(this.time * 0.45) * 0.25;
    this.hairBack.rotation.x = -(speedN * 0.35 * this.moveBlend) - air * 0.25 + Math.sin(this.phase * 2) * 0.03 * amp;
    this.sashTail.rotation.x = -(speedN * 0.6) - air * 0.4 + Math.sin(this.phase * 2 + 1) * 0.12 * amp;

    // landing squash
    this.squash += (0 - this.squash) * damp(9, dt);
    const sq = this.squash;
    this.group.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    this.halo.position.y = 0.86 + Math.sin(this.time * 1.8) * 0.025;
    this.halo.rotation.z = this.time * 0.6;
    this.materials.halo.emissiveIntensity = 1.4 + (this.castT || 0) * 6 + (this.holdPose ? 1.2 : 0);
  }

  /** One-shot casting pose. */
  cast(pose, seconds = 0.6) {
    this.castPose = pose;
    this.castT = seconds;
  }

  /** Held pose while a sustained miracle is active (levitate, water); null clears. */
  hold(pose) {
    this.holdPose = pose;
  }

  land(intensity) {
    this.squash = Math.min(0.18, 0.05 + intensity * 0.01);
  }

  stabilize() {
    this.phase = 0;
    this.time = 0;
    this.squash = 0;
  }
}
