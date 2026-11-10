import * as THREE from 'three';
import { terrainHeight } from '../world/Layout.js';

// Reusable objective framework. A mission is a list of steps; each step has
// `enter`, `update(dt) -> 'done' | 'fail' | undefined`, an objective text and
// optional waypoint. Phase 1 ships one open-ended activity ("Lost Tapes"), and
// Phase 2+ missions (e.g. MISSION 01 — THE DELIVERY) plug into the same API.
export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.activities = [];
    this.active = null;
  }

  add(activity) {
    this.activities.push(activity);
    activity.start && activity.start();
    return activity;
  }

  update(dt) {
    for (const a of this.activities) a.update(dt);
  }

  /** Interactables near the player (closest first). */
  nearestInteractable(pos, range = 2.2) {
    let best = null, bd = range;
    for (const a of this.activities) {
      if (!a.interactables) continue;
      for (const it of a.interactables()) {
        const d = Math.hypot(it.x - pos.x, it.z - pos.z);
        if (d < bd && Math.abs((it.y ?? pos.y) - pos.y) < 2.2) { bd = d; best = it; }
      }
    }
    return best;
  }

  markers() {
    const out = [];
    for (const a of this.activities) if (a.markers) out.push(...a.markers());
    return out;
  }

  reset() {
    for (const a of this.activities) a.reset && a.reset();
  }
}

const TAPES = [
  { name: 'Sunset Drive', x: 446, z: -40 },
  { name: 'Neon Rain', x: 250, z: -50 },
  { name: 'Palm Boulevard', x: 155, z: 0.2 },
  { name: 'Bayfront Nights', x: 34, z: 132 },
  { name: 'Skyline', x: 50, z: -128 },
  { name: 'Full Tank', x: -122, z: 30 },
  { name: 'Parking Lot Love', x: 150, z: -250 },
  { name: 'Container Yard', x: -262, z: -262 },
  { name: 'Pool Party', x: -250, z: 162 },
  { name: 'Ocean Drive', x: 410.5, z: -380 },
  { name: 'Quiet Park', x: -250, z: 250 },
  { name: 'Low Tide', x: 452, z: 372 },
];

/** Exploration activity: 12 cassette tapes hidden around the districts. */
export class LostTapes {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'LostTapes';
    game.scene.add(this.group);
    this.reward = 500;
    this.bonus = 5000;
    this.tapes = TAPES.map((t, i) => {
      const p = this.findFree(t.x, t.z);
      return { ...t, x: p.x, z: p.z, y: terrainHeight(p.x, p.z), i, collected: false, mesh: null };
    });
    this.buildMeshes();
  }

  findFree(x, z) {
    const col = this.game.collision;
    for (let r = 0; r < 30; r += 1.5) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!col.blockedCircle(px, pz, 1.1)) return { x: px, z: pz };
        if (r === 0) break;
      }
    }
    return { x, z };
  }

  buildMeshes() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1c1c22'; ctx.fillRect(0, 0, 128, 80);
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#ff4fa3'); g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g; ctx.fillRect(8, 8, 112, 34);
    ctx.fillStyle = '#fff'; ctx.font = 'italic bold 16px Arial'; ctx.fillText('VISTA MIX', 14, 30);
    ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(40, 58, 9, 0, 7); ctx.arc(88, 58, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#333'; ctx.fillRect(52, 52, 24, 12);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
    const tapeGeo = new THREE.BoxGeometry(0.5, 0.32, 0.07);
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.9, 40, 16, 1, true).translate(0, 20, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const ringGeo = new THREE.RingGeometry(0.8, 1.05, 32).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.5, 1.4), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const n = this.tapes.length;
    this.tapeIM = new THREE.InstancedMesh(tapeGeo, face, n);
    this.beamIM = new THREE.InstancedMesh(beamGeo, this.beamMat, n);
    this.ringIM = new THREE.InstancedMesh(ringGeo, this.ringMat, n);
    for (const im of [this.tapeIM, this.beamIM, this.ringIM]) { im.frustumCulled = false; this.group.add(im); }
    this.tapeIM.castShadow = true;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._up = new THREE.Vector3(0, 1, 0);
    const self = this;
    for (const t of this.tapes) {
      t.visible = true;
      t.mesh = { get visible() { return t.visible; }, set visible(v) { t.visible = v; self.placeTape(t, 0); } };
      this.placeTape(t, 0);
    }
  }

  placeTape(t, time) {
    const s = t.visible ? 1 : 0;
    this._s.setScalar(s);
    this._q.identity();
    this.beamIM.setMatrixAt(t.i, this._m.compose(this._p.set(t.x, t.y, t.z), this._q, this._s));
    this.ringIM.setMatrixAt(t.i, this._m.compose(this._p.set(t.x, t.y + 0.05, t.z), this._q, this._s));
    this._q.setFromAxisAngle(this._up, time * 1.8 + t.i);
    this.tapeIM.setMatrixAt(t.i, this._m.compose(this._p.set(t.x, t.y + 1.1 + Math.sin(time * 2 + t.i) * 0.12, t.z), this._q, this._s));
    this.tapeIM.instanceMatrix.needsUpdate = this.beamIM.instanceMatrix.needsUpdate = this.ringIM.instanceMatrix.needsUpdate = true;
  }

  get count() { return this.tapes.filter((t) => t.collected).length; }

  nearest(pos) {
    let best = null, bd = Infinity;
    for (const t of this.tapes) {
      if (t.collected) continue;
      const d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best ? { tape: best, dist: bd } : null;
  }

  interactables() {
    return this.tapes.filter((t) => !t.collected).map((t) => ({
      x: t.x, z: t.z, y: t.y, label: `Pick up tape "${t.name}"`, action: () => this.collect(t),
    }));
  }

  collect(t) {
    if (t.collected) return;
    t.collected = true;
    t.mesh.visible = false;
    const g = this.game;
    g.events.emit('tapeCollected', t);
    g.addMoney(this.reward);
    g.audio.pickup();
    const n = this.count;
    g.hud.toast(`TAPE ${n}/${this.tapes.length} — "${t.name}"`, `+$${this.reward}`, 'reward');
    if (n === this.tapes.length) {
      g.addMoney(this.bonus);
      g.audio.reward();
      setTimeout(() => g.hud.toast('COLLECTION COMPLETE', `Every lost tape found. Bonus +$${this.bonus.toLocaleString('en-US')}`, 'reward'), 900);
    }
  }

  markers() {
    const near = this.nearest(this.game.player.pos);
    return this.tapes.filter((t) => !t.collected).map((t) => ({ x: t.x, z: t.z, color: '#ff4fa3', shape: 'diamond', size: t === near?.tape ? 7 : 5, edge: t === near?.tape }));
  }

  update(dt) {
    const time = this.game.world.elapsed;
    const night = this.game.world.night;
    this.beamMat.opacity = 0.12 + night * 0.18;
    for (const t of this.tapes) if (!t.collected) this.placeTape(t, time);
    const pl = this.game.player;
    if (pl.vehicle) {
      for (const t of this.tapes) if (!t.collected && Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z) < 3.2) this.collect(t);
    }
    const n = this.count, total = this.tapes.length;
    const near = this.nearest(this.game.player.pos);
    if (near) { this.objectiveTitle = `Find the lost tapes  ${n}/${total}`; this.objectiveSub = `Nearest: ${Math.round(near.dist)} m. Follow the pink beam.`; }
    else { this.objectiveTitle = 'All tapes found'; this.objectiveSub = 'Vista Mar is yours to explore.'; }
  }

  reset() {
    for (const t of this.tapes) { t.collected = false; t.mesh.visible = true; }
  }
}
