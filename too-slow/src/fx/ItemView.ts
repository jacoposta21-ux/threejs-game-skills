import { track } from '../world/Track';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HONEY_LIFE, HONEY_R, type ItemSystem } from '../racing/Items';
import { ladybugGeometry } from '../characters/Insects';

/** Renders the item system: floating item boxes, banana peels and rolling acorns (pooled meshes). */

function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const c = new THREE.Color(color);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function bananaGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Three floppy peel petals splayed on the ground, a nub of fruit and a brown stem.
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const petal = new THREE.CapsuleGeometry(0.13, 0.55, 4, 8);
    petal.scale(1, 1, 0.45);
    petal.translate(0, 0.38, 0);
    petal.rotateX(1.25);
    petal.rotateY(a);
    parts.push(paint(petal, i === 1 ? 0xf7d43a : 0xffe04a));
  }
  parts.push(paint(new THREE.SphereGeometry(0.2, 12, 8).scale(1, 1.3, 1).translate(0, 0.2, 0), 0xfff2b0));
  parts.push(paint(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 6).translate(0, 0.5, 0), 0x6b4a2e));
  for (const p of parts) {
    // Brown tips on the petals read as "peel" from a distance.
    const pos = p.getAttribute('position');
    const col = p.getAttribute('color');
    for (let k = 0; k < pos.count; k += 1) {
      const r = Math.hypot(pos.getX(k), pos.getZ(k));
      if (r > 0.62) col.setXYZ(k, 0.55, 0.38, 0.16);
    }
  }
  return mergeGeometries(parts)!;
}

function acornGeometry(): THREE.BufferGeometry {
  const nut = new THREE.SphereGeometry(0.42, 16, 12);
  nut.scale(1, 1.2, 1);
  const cap = new THREE.SphereGeometry(0.46, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
  cap.translate(0, 0.08, 0);
  const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 6).translate(0, 0.55, 0);
  return mergeGeometries([paint(nut, 0xc07a3a), paint(cap, 0x7a5232), paint(stem, 0x5a3a20)])!;
}

function webGeometry(): THREE.BufferGeometry {
  // Radial threads and rings lying flat, slightly domed.
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(paint(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 4).rotateZ(Math.PI / 2).translate(0.75, 0.06, 0).rotateY(a), 0xf4f6ff));
  }
  for (const r of [0.35, 0.7, 1.05, 1.4]) parts.push(paint(new THREE.TorusGeometry(r, 0.018, 4, 24).rotateX(Math.PI / 2).translate(0, 0.07, 0), 0xe6ecff));
  parts.push(paint(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.8, 1.2).translate(0.45, 0.16, 0.3), 0x23232a));
  return mergeGeometries(parts)!;
}

function questionTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '900 104px "Lilita One", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#23331a';
  ctx.strokeText('?', 64, 70);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('?', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const UP = new THREE.Vector3(0, 1, 0);

export class ItemView {
  readonly group = new THREE.Group();
  private readonly nrm = new THREE.Vector3();
  private boxMesh: THREE.InstancedMesh | null = null;
  private readonly dummy = new THREE.Object3D();
  private readonly boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5, 1, 1, 1);
  private readonly boxMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    roughness: 0.1,
    clearcoat: 1,
    emissive: 0x6a4aff,
    emissiveIntensity: 0.45,
    depthWrite: false,
  });
  private readonly bananaMeshes: THREE.Mesh[] = [];
  private readonly acornMeshes: THREE.Mesh[] = [];
  private readonly webMeshes: THREE.Mesh[] = [];
  private readonly bugMeshes: THREE.Mesh[] = [];
  private readonly honeyMeshes: THREE.Mesh[] = [];

  constructor() {
    this.group.name = 'items';
    // Rainbow faces on the box.
    const pos = this.boxGeo.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      c.setHSL(((pos.getX(i) + pos.getY(i) * 0.7 + pos.getZ(i) * 0.4) * 0.35 + 0.5) % 1, 0.85, 0.62);
      col.set([c.r, c.g, c.b], i * 3);
    }
    this.boxGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // The "?" is printed on every face, so one instanced draw covers all boxes.
    this.boxMat.map = questionTexture();

    const banana = bananaGeometry();
    const acorn = acornGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    for (let i = 0; i < 18; i += 1) {
      const m = new THREE.Mesh(banana, mat);
      m.castShadow = true;
      m.visible = false;
      this.bananaMeshes.push(m);
      this.group.add(m);
    }
    const web = webGeometry();
    const webMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0x9fb0ff, emissiveIntensity: 0.25 });
    for (let i = 0; i < 18; i += 1) {
      const m = new THREE.Mesh(web, webMat);
      m.visible = false;
      this.webMeshes.push(m);
      this.group.add(m);
    }
    const bug = ladybugGeometry();
    const bugMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1 });
    for (let i = 0; i < 4; i += 1) {
      const m = new THREE.Mesh(bug, bugMat);
      m.castShadow = true;
      m.visible = false;
      m.scale.setScalar(2.4);
      this.bugMeshes.push(m);
      this.group.add(m);
    }
    const honeyMat = new THREE.MeshStandardMaterial({ color: 0xffa000, roughness: 0.18, transparent: true, opacity: 0.95, emissive: 0xd07000, emissiveIntensity: 0.7, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -4 });
    // A low glossy dome with a blobby rim and a few drips on top, so it reads at a grazing camera angle.
    const dome = new THREE.SphereGeometry(1, 28, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    {
      const hp = dome.getAttribute('position');
      for (let k = 0; k < hp.count; k += 1) {
        const a = Math.atan2(hp.getZ(k), hp.getX(k));
        const w = HONEY_R * (1 + 0.12 * Math.sin(a * 5) + 0.07 * Math.sin(a * 9 + 1));
        hp.setXYZ(k, hp.getX(k) * w, hp.getY(k) * 0.42, hp.getZ(k) * w);
      }
      dome.computeVertexNormals();
    }
    const drips = [dome];
    for (const [x, z, r] of [[0.6, 0.3, 0.32], [-0.8, -0.5, 0.26], [0.1, -1.1, 0.22], [-0.3, 0.9, 0.2]] as const) {
      drips.push(new THREE.SphereGeometry(r, 10, 6).scale(1, 0.9, 1).translate(x * 1.3, 0.34, z * 1.3));
    }
    const honeyGeo = mergeGeometries(drips.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; }))!;
    for (let i = 0; i < 6; i += 1) {
      const m = new THREE.Mesh(honeyGeo, honeyMat);
      m.visible = false;
      m.receiveShadow = true;
      this.honeyMeshes.push(m);
      this.group.add(m);
    }
    for (let i = 0; i < 8; i += 1) {
      const m = new THREE.Mesh(acorn, mat);
      m.castShadow = true;
      m.visible = false;
      this.acornMeshes.push(m);
      this.group.add(m);
    }
  }

  /** Rebuild the box meshes for the current course. */
  reset(items: ItemSystem): void {
    if (this.boxMesh) {
      this.group.remove(this.boxMesh);
      this.boxMesh.dispose();
      this.boxMesh = null;
    }
    if (!items.boxes.length) return;
    this.boxMesh = new THREE.InstancedMesh(this.boxGeo, this.boxMat, items.boxes.length);
    this.boxMesh.renderOrder = 4;
    this.boxMesh.frustumCulled = false;
    this.group.add(this.boxMesh);
  }

  update(items: ItemSystem, time: number): void {
    const mesh = this.boxMesh;
    if (mesh) {
      const d = this.dummy;
      items.boxes.forEach((box, i) => {
        // Pops back in over the last half second of the respawn timer.
        const k = box.respawn > 0 ? Math.max(0, 1 - box.respawn / 0.5) : 1;
        d.position.copy(box.pos);
        d.position.y += Math.sin(time * 2.4 + i) * 0.12;
        d.rotation.set(0.35, time * 1.3 + i * 0.5, 0.2);
        d.scale.setScalar(Math.max(1e-4, k * k * (3 - 2 * k)));
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.webMeshes.forEach((m, i) => {
      const b = items.bananas[i];
      m.visible = !!b && b.kind === 'web';
      if (b && m.visible) {
        track.normal(b.s, b.d, this.nrm);
        m.quaternion.setFromUnitVectors(UP, this.nrm);
        m.rotateY(b.yaw);
        m.position.copy(b.pos).addScaledVector(this.nrm, 0.02);
        m.scale.setScalar(Math.min(1, 0.3 + b.age * 3));
      }
    });
    this.bugMeshes.forEach((m, i) => {
      const lb = items.ladybugs[i];
      m.visible = !!lb;
      if (lb) {
        m.position.copy(lb.pos);
        m.rotation.set(Math.sin(time * 9) * 0.15, track.heading(lb.s) * -1 + Math.PI, Math.sin(time * 7) * 0.2);
      }
    });
    this.honeyMeshes.forEach((m, i) => {
      const pd = items.puddles[i];
      m.visible = !!pd;
      if (pd) {
        // Lie on the slope, a hair above the ribbon mesh.
        track.normal(pd.s, pd.d, this.nrm);
        m.quaternion.setFromUnitVectors(UP, this.nrm);
        m.position.copy(pd.pos).addScaledVector(this.nrm, -0.04);
        const grow = Math.min(1, 0.2 + pd.age * 4);
        const fade = Math.min(1, (HONEY_LIFE - pd.age) / 1.5);
        m.scale.setScalar(Math.max(0.01, grow * fade));
      }
    });
    this.bananaMeshes.forEach((m, i) => {
      const b = items.bananas[i];
      m.visible = !!b && b.kind === 'banana';
      if (b && m.visible) {
        m.position.copy(b.pos);
        m.rotation.y = b.yaw;
        m.scale.setScalar(Math.min(1, 0.4 + b.age * 3) * 1.25);
      }
    });
    this.acornMeshes.forEach((m, i) => {
      const a = items.acorns[i];
      m.visible = !!a;
      if (a) {
        m.position.copy(a.pos);
        m.rotation.set(time * 14, a.s * 0.1, 0);
      }
    });
  }
}
