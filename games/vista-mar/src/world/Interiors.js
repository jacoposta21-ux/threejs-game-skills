import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWeaponMesh } from '../combat/Weapons.js';
import { terrainHeight } from './Layout.js';

// Walk-in interiors (Sunline Arms, Threads & Co., Club Velvet). Each room is a
// closed box built high above its own street door (same x/z, so the radar and
// GPS still make sense); entering fades and teleports the player inside.
// Rooms are self-lit (emissive surfaces) so they look the same day and night
// and add no scene lights. Only the occupied room is drawn.

export const ROOM_Y = 600;

const TEXTS = {};
function signTexture(text, color, sub = '') {
  const key = text + color + sub;
  if (TEXTS[key]) return TEXTS[key];
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 256);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'italic 800 130px "Barlow Condensed", Arial Narrow, sans-serif';
  x.shadowColor = color; x.shadowBlur = 30; x.fillStyle = color;
  x.fillText(text, 512, sub ? 105 : 128);
  x.shadowBlur = 10; x.fillStyle = '#fff'; x.globalAlpha = 0.65; x.fillText(text, 512, sub ? 105 : 128);
  if (sub) { x.globalAlpha = 1; x.shadowBlur = 12; x.font = '600 46px Inter, Arial, sans-serif'; x.fillStyle = color; x.fillText(sub, 512, 200); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  TEXTS[key] = t;
  return t;
}

function floorTexture(a, b, n = 8) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const s = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * s, j * s, s, s); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Collects boxes per material and builds one merged mesh per material. */
class RoomBuilder {
  constructor(group, collision, ox, oz, y) {
    this.group = group; this.col = collision; this.ox = ox; this.oz = oz; this.y = y;
    this.parts = new Map();
    this.mats = {};
  }

  mat(key, o) {
    if (!this.mats[key]) {
      const { selfLit, ...rest } = o;
      const m = new THREE.MeshStandardMaterial({ roughness: 0.75, fog: false, ...rest });
      if (o.emissive === undefined && o.color !== undefined) { m.emissive = new THREE.Color(o.color); m.emissiveIntensity = (selfLit ?? 0.42) * 0.6; }
      this.mats[key] = m;
    }
    return key;
  }

  /** Box in room-local coordinates (x right, z forward, y up from the floor). */
  box(key, x0, y0, z0, x1, y1, z1, solid = false) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate(this.ox + (x0 + x1) / 2, this.y + (y0 + y1) / 2, this.oz + (z0 + z1) / 2);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g.toNonIndexed());
    if (solid) this.col.addBox(this.ox + x0, this.oz + z0, this.ox + x1, this.oz + z1, this.y + y1, 'interior', this.y + y0 - 0.5);
  }

  plane(mat, x, y, z, w, h, rotY = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(this.ox + x, this.y + y, this.oz + z);
    m.rotation.y = rotY;
    this.group.add(m);
    return m;
  }

  finish() {
    for (const [key, geos] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(geos), this.mats[key]);
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
  }

  /** Four walls, floor slab and ceiling around a W x D room; a door gap on the -z wall. */
  shell(W, D, H, floorKey, wallKey, ceilKey) {
    const t = 0.3;
    this.box(floorKey, -W / 2 - t, -0.5, -D / 2 - t, W / 2 + t, 0, D / 2 + t, true);
    this.box(ceilKey, -W / 2 - t, H, -D / 2 - t, W / 2 + t, H + 0.3, D / 2 + t, true);
    this.box(wallKey, -W / 2 - t, 0, D / 2, W / 2 + t, H, D / 2 + t, true);
    this.box(wallKey, -W / 2 - t, 0, -D / 2, -W / 2, H, D / 2, true);
    this.box(wallKey, W / 2, 0, -D / 2, W / 2 + t, H, D / 2, true);
    this.box(wallKey, -W / 2 - t, 0, -D / 2 - t, -1.1, H, -D / 2, true);
    this.box(wallKey, 1.1, 0, -D / 2 - t, W / 2 + t, H, -D / 2, true);
    this.box(wallKey, -1.1, 2.5, -D / 2 - t, 1.1, H, -D / 2, true);
    this.box(ceilKey, -1.1, 0, -D / 2 - t - 0.2, 1.1, 2.5, -D / 2 - t, true); // closed street door
  }
}

export class Interiors {
  constructor(game) {
    this.game = game;
    this.rooms = {};
    this.current = null;
    this.actors = [];
    this.build();
  }

  build() {
    const g = this.game;
    // ------------------------------------------------ Sunline Arms
    this.rooms.guns = this.room('guns', -150, -15.2, Math.PI, 14, 10, 4.2, (b) => {
      b.mat('floor', { map: floorTexture('#3a3d42', '#34373b', 6), color: 0x8a8d92, selfLit: 0.35 });
      b.mat('wall', { color: 0x6e5a4a, selfLit: 0.45 });
      b.mat('ceil', { color: 0x2b2d31, selfLit: 0.3 });
      b.mat('wood', { color: 0x6b4a30, selfLit: 0.4 });
      b.mat('steel', { color: 0x9aa0a6, metalness: 0.6, roughness: 0.35, selfLit: 0.35 });
      b.mat('glass', { color: 0xbfe8ff, emissive: 0x7fd0ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, roughness: 0.05 });
      b.mat('lamp', { color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 1.1 });
      b.mat('mat', { color: 0x8a1f2a, selfLit: 0.35 });
      b.shell(14, 10, 4.2, 'floor', 'wall', 'ceil');
      // counter with glass cases
      b.box('wood', -5, 0, 1.4, 5, 1.0, 2.4, true);
      b.box('glass', -4.6, 1.0, 1.5, 4.6, 1.35, 2.3);
      b.box('steel', -5, 1.35, 1.4, 5, 1.4, 2.4);
      // wall racks behind the counter
      b.box('wood', -6, 1.2, 4.6, 6, 1.32, 5);
      b.box('wood', -6, 2.2, 4.6, 6, 2.32, 5);
      b.box('steel', -6.8, 0, -4.8, -5.4, 2.2, 3.5, true); // ammo shelves
      b.box('mat', -2.5, 0.01, -3.8, 2.5, 0.03, -1.2);
      for (let x = -4.5; x <= 4.5; x += 3) b.box('lamp', x - 0.6, 4.1, -1.5, x + 0.6, 4.19, 1.5);
      b.plane(new THREE.MeshBasicMaterial({ fog: false, map: signTexture('SUNLINE ARMS', '#ff9d3d', 'LICENSED DEALER'), toneMapped: false }), 0, 3.25, 4.95, 6, 1.5, Math.PI);
      // the stock on display
      const ids = ['pistol', 'smg', 'shotgun', 'rpg', 'bat'];
      ids.forEach((id, i) => {
        const m = makeWeaponMesh(id);
        if (!m) return;
        m.position.set(-4 + i * 2, ROOM_Y + (i % 2 ? 2.45 : 1.45), 4.75);
        m.rotation.set(0, Math.PI / 2, 0);
        m.scale.setScalar(id === 'rpg' ? 1 : 1.4);
        b.group.add(m);
      });
    });

    // ------------------------------------------------ Threads & Co.
    this.rooms.clothes = this.room('clothes', -50, -209.5, Math.PI, 16, 11, 4.4, (b) => {
      b.mat('floor', { map: floorTexture('#a8865c', '#9c7a52', 10), color: 0xc8b090, selfLit: 0.3 });
      b.mat('wall', { color: 0xcfc6ba, selfLit: 0.35 });
      b.mat('ceil', { color: 0xbdb6ac, selfLit: 0.3 });
      b.mat('rail', { color: 0xb9bcc0, metalness: 0.7, roughness: 0.3, selfLit: 0.4 });
      b.mat('wood', { color: 0x8a6a4a, selfLit: 0.45 });
      b.mat('lamp', { color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 0.9 });
      b.mat('mirror', { color: 0xdfe8ef, metalness: 1, roughness: 0.04, selfLit: 0.25 });
      const cloth = ['#c0392b', '#2c3e50', '#16a085', '#f1c40f', '#8e44ad', '#ecf0f1', '#d35400', '#27ae60', '#e84393', '#34495e'];
      cloth.forEach((c, i) => b.mat(`c${i}`, { color: new THREE.Color(c).getHex(), selfLit: 0.4 }));
      b.shell(16, 11, 4.4, 'floor', 'wall', 'ceil');
      // clothes rails along both side walls, garments as thin coloured slabs
      for (const side of [-1, 1]) {
        const x = side * 6.6;
        b.box('rail', x - 0.03, 1.75, -3.5, x + 0.03, 1.8, 3.5);
        for (const z of [-3.3, 3.3]) b.box('rail', x - 0.03, 0, z - 0.03, x + 0.03, 1.8, z + 0.03);
        for (let k = 0; k < 14; k++) { const z = -3.1 + k * 0.47; b.box(`c${(k + (side > 0 ? 3 : 0)) % 10}`, x - 0.28, 0.85, z - 0.06, x + 0.28, 1.72, z + 0.06); }
        b.col.addBox(x - 0.4, -3.6, x + 0.4, 3.6, ROOM_Y + 1.8, 'interior', ROOM_Y - 0.5);
      }
      // centre tables with folded shirts
      for (const z of [-1.5, 1.8]) {
        b.box('wood', -1.6, 0, z - 0.6, 1.6, 0.85, z + 0.6, true);
        for (let k = 0; k < 5; k++) b.box(`c${(k * 3 + (z > 0 ? 1 : 0)) % 10}`, -1.4 + k * 0.6, 0.85, z - 0.25, -1.0 + k * 0.6, 0.95 + (k % 3) * 0.05, z + 0.25);
      }
      // cash desk + mirror on the back wall
      b.box('wood', 2.5, 0, 3.6, 6, 1.05, 4.4, true);
      b.box('mirror', -5, 0.3, 5.45, -2.6, 2.6, 5.5);
      for (let x = -5; x <= 5; x += 5) b.box('lamp', x - 1.2, 4.3, -2, x + 1.2, 4.39, 2);
      b.plane(new THREE.MeshBasicMaterial({ fog: false, map: signTexture('THREADS & CO.', '#c58cff', 'MIX · MATCH · WEAR'), toneMapped: false }), 0, 3.4, 5.45, 6, 1.5, Math.PI);
    });

    // ------------------------------------------------ Club Velvet
    this.rooms.club = this.room('club', 285.5, 62, -Math.PI / 2, 22, 18, 7, (b) => {
      this.danceMat = new THREE.MeshStandardMaterial({ map: floorTexture('#ff3fa4', '#3fe6ff', 6), emissiveMap: floorTexture('#ff3fa4', '#3fe6ff', 6), emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.3, fog: false });
      b.mats.dance = this.danceMat;
      b.mat('floor', { color: 0x1b1622, selfLit: 0.5 });
      b.mat('wall', { color: 0x2a1736, selfLit: 0.55 });
      b.mat('ceil', { color: 0x0e0b12, selfLit: 0.3 });
      b.mat('bar', { color: 0x3a2030, selfLit: 0.5 });
      b.mat('neonP', { color: 0xff3fa4, emissive: 0xff3fa4, emissiveIntensity: 1.4 });
      b.mat('neonC', { color: 0x3fe6ff, emissive: 0x3fe6ff, emissiveIntensity: 1.4 });
      b.mat('neonV', { color: 0xb05cff, emissive: 0xb05cff, emissiveIntensity: 1.4 });
      b.mat('sofa', { color: 0x7a1030, selfLit: 0.45 });
      b.mat('stage', { color: 0x141018, selfLit: 0.4 });
      b.shell(22, 18, 7, 'floor', 'wall', 'ceil');
      b.box('dance', -5, 0, -3, 5, 0.04, 4);
      // stage on the far wall
      b.box('stage', -6, 0, 5.5, 6, 0.8, 9, true);
      b.box('neonC', -6, 0.75, 5.45, 6, 0.85, 5.55);
      b.box('wall', -6.2, 0.8, 8.95, 6.2, 6.8, 9);
      b.box('neonP', -6.2, 6.6, 8.85, 6.2, 6.75, 8.95);
      for (let x = -5; x <= 5; x += 2.5) b.box(x % 5 === 0 ? 'neonV' : 'neonC', x - 0.05, 0.8, 8.9, x + 0.05, 6.5, 8.95);
      // bar along the left wall
      b.box('bar', -11, 0, -7, -8.6, 1.15, 3, true);
      b.box('neonP', -8.65, 1.0, -7, -8.55, 1.1, 3);
      b.box('bar', -11, 1.6, -7, -10.6, 3.6, 3);
      // VIP sofas on the right
      for (const z of [-6, -2.5, 1]) { b.box('sofa', 8.6, 0, z, 10.7, 0.75, z + 2.6, true); b.box('sofa', 10.3, 0.75, z, 10.7, 1.4, z + 2.6); }
      b.box('neonV', 10.9, 3.2, -7, 11, 3.35, 4);
      // ceiling rig
      b.box('neonC', -7, 6.7, -0.1, 7, 6.8, 0.1);
      b.box('neonP', -0.1, 6.7, -6, 0.1, 6.8, 6);
      b.plane(new THREE.MeshBasicMaterial({ fog: false, map: signTexture('VELVET', '#b05cff'), toneMapped: false }), 0, 5.2, 8.85, 7, 1.75, Math.PI);
    });
  }

  /**
   * Creates a room whose door faces the street. (ox, oz) is the street-side door point;
   * yaw turns the room so its -z wall (with the door) faces the street.
   */
  room(id, doorX, doorZ, yaw, W, D, H, fn) {
    const group = new THREE.Group();
    group.name = `Interior:${id}`;
    group.visible = false;
    this.game.scene.add(group);
    // room centre sits D/2 inside from the door; built axis-aligned then rotated about the door
    const pivot = new THREE.Group();
    pivot.position.set(doorX, 0, doorZ);
    pivot.rotation.y = yaw;
    group.add(pivot);
    const inner = new THREE.Group();
    inner.position.set(0, 0, D / 2);
    pivot.add(inner);
    // build in local space (origin = room centre), collision boxes in world space via a helper builder
    const col = this.localCollision(doorX, doorZ, yaw, D);
    const b = new RoomBuilder(inner, col, 0, 0, ROOM_Y);
    fn(b);
    b.finish();
    const toWorld = (lx, lz) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const z = lz + D / 2;
      return { x: doorX + lx * c + z * s, z: doorZ - lx * s + z * c };
    };
    const inside = toWorld(0, -D / 2 + 1.6);
    const exit = { x: doorX - Math.sin(yaw) * 0.9, z: doorZ - Math.cos(yaw) * 0.9 };
    return { id, group, door: { x: doorX, z: doorZ }, exit, inside, toWorld, yaw, W, D, H };
  }

  /** Collision adapter: boxes given in room-local coords become rotated world boxes (yaw is a multiple of 90 degrees). */
  localCollision(doorX, doorZ, yaw, D) {
    const g = this.game;
    const c = Math.round(Math.cos(yaw)), s = Math.round(Math.sin(yaw));
    const tf = (lx, lz) => { const z = lz + D / 2; return [doorX + lx * c + z * s, doorZ - lx * s + z * c]; };
    return {
      addBox: (x0, z0, x1, z1, top, kind, bottom) => {
        // RoomBuilder passes world coords offset by ox/oz = 0, i.e. local coords
        const [ax, az] = tf(x0, z0), [bx, bz] = tf(x1, z1);
        return g.collision.addBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), top, kind, bottom);
      },
    };
  }

  // ------------------------------------------------------------ enter / leave
  enter(id) {
    const g = this.game, r = this.rooms[id];
    if (!r || this.current) return;
    g.hud.fade(true);
    setTimeout(() => {
      if (g.driver.vehicle) g.driver.exit();
      this.current = r;
      g.interior = r;
      r.group.visible = true;
      const p = r.inside;
      g.player.pos.set(p.x, ROOM_Y + 0.05, p.z);
      g.player.vel.set(0, 0, 0);
      g.player.heading = r.yaw;
      g.camera3p.reset(r.yaw);
      this.spawnActors(r);
      g.hud.fade(false);
    }, 450);
  }

  leave() {
    const g = this.game, r = this.current;
    if (!r) return;
    g.hud.fade(true);
    setTimeout(() => {
      this.current = null;
      g.interior = null;
      r.group.visible = false;
      for (const a of this.actors) if (a.active) g.npcs.despawn(a);
      this.actors = [];
      const out = r.exit;
      g.player.pos.set(out.x, terrainHeight(out.x, out.z) + 0.05, out.z);
      g.player.vel.set(0, 0, 0);
      g.player.walkMode = false; g.player.crouched = false;
      g.input.keys.clear();
      g.player.heading = r.yaw + Math.PI;
      g.camera3p.reset(r.yaw + Math.PI);
      g.hud.fade(false);
    }, 450);
  }

  spawnActors(r) {
    const n = this.game.npcs;
    const put = (key, lx, lz, h, clip) => {
      const w = r.toWorld(lx, lz);
      const a = n.spawnActor(key, w.x, w.z, h + r.yaw, clip);
      if (a) { a.pos.y = ROOM_Y + (lz > 5.4 && r.id === 'club' ? 0.8 : 0); a.root.position.y = a.pos.y; this.actors.push(a); }
    };
    if (r.id === 'guns') put('guard', 0, 3.4, Math.PI, 'Idle_Loop');
    if (r.id === 'clothes') put('npc_w_suit', 4.2, 4.0, Math.PI, 'Idle_Talking_Loop');
    if (r.id === 'club') {
      put('dancerA', -3.5, 7.2, Math.PI, 'Dance_Loop');
      put('dancerC', 0, 7.6, Math.PI, 'Dance_Loop');
      put('dancerB', 3.5, 7.2, Math.PI, 'Dance_Loop');
      put('npc_m_casual', -2.5, 0, 0.3, 'Dance_Loop');
      put('npc_w_casual', 1.5, 1.2, -0.4, 'Dance_Loop');
      put('npc_m_casual', 3, -1.5, 2.6, 'Dance_Loop');
      put('npc_w_punk', -1, -2, 2.9, 'Dance_Loop');
      put('npc_m_casual2', -9.6, -2, Math.PI / 2, 'Idle_Loop'); // bartender
      put('npc_m_suit', 9.6, -0.8, -Math.PI / 2, 'Idle_Talking_Loop');
    }
  }

  update(dt) {
    if (this.current && this.current.id === 'club' && this.danceMat) {
      const t = this.game.world.elapsed;
      this.danceMat.emissiveIntensity = 0.25 + Math.abs(Math.sin(t * 4)) * 0.35;
      this.danceMat.map.offset.set(Math.floor(t * 2) % 2 ? 1 / 6 : 0, 0);
    }
    void dt;
  }
}
