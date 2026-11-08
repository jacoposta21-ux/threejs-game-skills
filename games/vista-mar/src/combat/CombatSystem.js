import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER, makeWeaponMesh } from './Weapons.js';
import { radialGlowTexture } from '../world/textures.js';
import { terrainHeight } from '../world/Layout.js';
import { clamp } from '../utils/random.js';

// Player combat: weapon inventory, melee (punch combo, kick, bat), aiming and
// firing (camera-centred crosshair), hit resolution against pedestrians,
// vehicles, traffic and the static world, plus shared effects (tracers,
// muzzle flashes, impact puffs) and pickups. Clean style: hits show white
// sparks, nobody bleeds.

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.inv = { fists: true };
    this.ammo = {}; // id -> { mag, reserve }
    this.current = 'fists';
    this.armor = 0;
    this.aiming = false;
    this.aimHold = 0; // keeps the aim pose briefly after hip-firing
    this.cooldown = 0;
    this.reloading = 0;
    this.melee = null; // { kind, t, dur, hit:false, damage, range }
    this.combo = 0;
    this.kickT = -1;
    this.flinch = 0;
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.aimPoint = new THREE.Vector3();
    this.hitMarker = 0;
    this.shotsFired = 0;
    this.meshes = {};
    this.buildEffects();
  }

  // ------------------------------------------------------------ inventory
  give(id, rounds = 0) {
    const w = WEAPONS[id];
    if (!w) return;
    const had = !!this.inv[id];
    this.inv[id] = true;
    if (!w.melee) {
      const a = this.ammo[id] || (this.ammo[id] = { mag: 0, reserve: 0 });
      a.reserve += rounds;
      if (a.mag === 0) this.refill(id);
    }
    if (!had) this.select(id);
  }

  addAmmo(id, rounds) {
    if (!this.inv[id]) return false;
    const a = this.ammo[id] || (this.ammo[id] = { mag: 0, reserve: 0 });
    a.reserve += rounds;
    return true;
  }

  refill(id) {
    const w = WEAPONS[id], a = this.ammo[id];
    const n = Math.min(w.mag - a.mag, a.reserve);
    a.mag += n; a.reserve -= n;
  }

  select(id) {
    if (!this.inv[id] || this.current === id) return;
    this.current = id;
    this.reloading = 0;
    this.melee = null;
    this.game.audio.click();
  }

  cycle(dir = 1) {
    const owned = WEAPON_ORDER.filter((id) => this.inv[id]);
    const i = owned.indexOf(this.current);
    this.select(owned[(i + dir + owned.length) % owned.length]);
  }

  get weapon() { return WEAPONS[this.current]; }

  get ammoText() {
    const w = this.weapon;
    if (w.melee) return '';
    const a = this.ammo[w.id] || { mag: 0, reserve: 0 };
    return `${a.mag} / ${a.reserve}`;
  }

  reset() {
    this.inv = { fists: true };
    this.ammo = {};
    this.current = 'fists';
    this.armor = 0;
    this.melee = null;
    this.kickT = -1;
    this.aiming = false;
    for (const p of this.pickups) p.active = false;
  }

  serialize() { return { inv: { ...this.inv }, ammo: JSON.parse(JSON.stringify(this.ammo)), current: this.current, armor: this.armor }; }

  restore(d) {
    if (!d) return;
    this.inv = { fists: true, ...(d.inv || {}) };
    this.ammo = d.ammo || {};
    this.current = this.inv[d.current] ? d.current : 'fists';
    this.armor = d.armor || 0;
  }

  // ------------------------------------------------------------ per frame (player on foot)
  /** Reads combat input; returns movement constraints for the controller. */
  updatePlayer(dt, cameraYaw) {
    const g = this.game, inp = g.input, pl = g.player;
    this.cooldown -= dt;
    this.flinch -= dt;
    this.hitMarker -= dt;
    const w = this.weapon;
    const busy = pl.knocked > 0 || g.respawning;
    // weapon selection: number keys or Tab
    for (let k = 0; k < WEAPON_ORDER.length; k++) if (inp.hit(`Digit${k + 1}`)) this.select(WEAPON_ORDER[k]);
    if (inp.hit('Tab')) this.cycle(1);

    const lmb = inp.down('Mouse0'), lmbHit = inp.hit('Mouse0');
    const rmb = inp.down('Mouse2'), rmbHit = inp.hit('Mouse2');
    const kickKey = inp.hit('KeyV');
    let face = null; // heading the body must face this frame

    if (busy || g.interior) { this.aiming = false; this.melee = null; return { face: null, slow: false }; }

    if (w.melee) {
      this.aiming = false;
      if (!this.melee && this.kickT < 0) {
        if (lmbHit) this.startMelee(w.id === 'bat' ? 'bat' : this.combo++ % 2 === 0 ? 'jab' : 'cross');
        else if (rmbHit || kickKey) this.startMelee('kick');
      }
    } else {
      if (kickKey && !this.melee && this.kickT < 0) this.startMelee('kick');
      const a = this.ammo[w.id];
      if (inp.hit('KeyR') && a && a.mag < w.mag && a.reserve > 0 && this.reloading <= 0) this.startReload();
      if (lmb) this.aimHold = 0.9;
      this.aimHold -= dt;
      this.aiming = (rmb || this.aimHold > 0) && !this.melee && this.kickT < 0;
      if (this.aiming) {
        face = cameraYaw;
        this.computeAim();
        const wantFire = w.auto ? lmb : lmbHit;
        if (wantFire && this.cooldown <= 0 && this.reloading <= 0) this.fire();
      }
    }
    void rmbHit;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.refill(w.id);
    }
    // melee timeline
    if (this.melee) {
      const m = this.melee;
      m.t += dt;
      if (m.target) face = Math.atan2(m.target.pos.x - pl.pos.x, m.target.pos.z - pl.pos.z);
      if (!m.hit && m.t >= m.hitAt) { m.hit = true; this.resolveMelee(m); }
      if (m.t >= m.dur) this.melee = null;
    }
    if (this.kickT >= 0) {
      this.kickT += dt;
      if (this.kickT > 0.6) this.kickT = -1;
    }
    return { face, slow: this.aiming, rooted: !!(this.melee && this.melee.kind !== 'jab') || this.kickT >= 0 };
  }

  startMelee(kind) {
    const pl = this.game.player;
    const spec = {
      jab: { dur: 0.42, hitAt: 0.16, damage: 14, range: 1.45, clip: 'Punch_Jab' },
      cross: { dur: 0.55, hitAt: 0.22, damage: 22, range: 1.65, clip: 'Punch_Cross' },
      kick: { dur: 0.6, hitAt: 0.2, damage: 28, range: 1.75, clip: null },
      bat: { dur: 0.75, hitAt: 0.32, damage: WEAPONS.bat.damage, range: 2.1, clip: 'Sword_Attack' },
    }[kind];
    // soft lock onto the nearest opponent in front
    const target = this.game.npcs.meleeTarget(pl.pos, pl.heading, spec.range + 1.4);
    this.melee = { kind, t: 0, hit: false, target, ...spec };
    if (kind === 'kick') this.kickT = 0;
    this.game.audio.whoosh();
  }

  resolveMelee(m) {
    const g = this.game, pl = g.player;
    const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
    const victim = g.npcs.meleeHit(pl.pos, fx, fz, m.range, m.damage, { kind: m.kind, byPlayer: true, knock: m.kind === 'kick' || m.kind === 'bat' });
    if (victim) {
      g.audio.punch(m.kind === 'jab' ? 0.7 : 1);
      g.camera3p.kick(0.05);
      this.hitMarker = 0.15;
      _p.set(victim.pos.x, victim.pos.y + 1.3, victim.pos.z);
      this.puff(_p, 0xffffff, 0.5);
    }
  }

  startReload() {
    this.reloading = this.weapon.reload;
    this.game.audio.reload();
  }

  /** Crosshair ray: camera through the screen centre to the first thing it meets. */
  computeAim() {
    const cam = this.game.camera;
    cam.getWorldDirection(_d);
    _o.copy(cam.position);
    const hit = this.raycast(_o, _d, this.weapon.range || 90, true);
    this.aimPoint.copy(_o).addScaledVector(_d, hit.t);
    const muzzle = this.muzzleWorld(_p);
    this.aimDir.copy(this.aimPoint).sub(muzzle).normalize();
    this.aimTarget = hit;
  }

  fire() {
    const g = this.game, w = this.weapon;
    const a = this.ammo[w.id];
    if (!a || a.mag <= 0) {
      if (a && a.reserve > 0) this.startReload();
      else { g.audio.dryFire(); this.cooldown = 0.3; }
      return;
    }
    a.mag--;
    this.cooldown = w.rate;
    this.shotsFired++;
    if (w.rocket) { this.fireRocket(); return; }
    const cam = g.camera;
    const moving = g.player.speed > 0.5 ? 1.8 : 1;
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    let anyHit = false;
    for (let i = 0; i < w.pellets; i++) {
      cam.getWorldDirection(_d);
      _d.x += (Math.random() - 0.5) * w.spread * 2 * moving;
      _d.y += (Math.random() - 0.5) * w.spread * 2 * moving;
      _d.z += (Math.random() - 0.5) * w.spread * 2 * moving;
      _d.normalize();
      _o.copy(cam.position);
      const hit = this.raycast(_o, _d, w.range, false);
      const end = _o.clone().addScaledVector(_d, hit.t);
      // the muzzle must see the point too (no shooting through the wall you hug)
      const t2 = g.collision.raycast(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
      if (t2 < 0.97) { end.lerpVectors(muzzle, end, t2); hit.kind = 'world'; }
      this.tracer(muzzle, end);
      if (this.applyHit(hit, w.damage, end, _d)) anyHit = true;
    }
    if (anyHit) this.hitMarker = 0.15;
    this.flash(muzzle, 0.5);
    g.audio.gunshot(w.id, 0);
    g.camera3p.kick(w.id === 'shotgun' ? 0.09 : 0.03);
    g.camera3p.recoil = (g.camera3p.recoil || 0) + (w.id === 'shotgun' ? 0.05 : w.id === 'smg' ? 0.008 : 0.02);
    g.events.emit('shotsFired', { x: g.player.pos.x, z: g.player.pos.z, weapon: w.id });
    if (a.mag === 0 && a.reserve > 0) setTimeout(() => this.reloading <= 0 && this.current === w.id && this.startReload(), 250);
  }

  fireRocket() {
    const g = this.game;
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    const cam = g.camera;
    cam.getWorldDirection(_d);
    const hit = this.raycast(cam.position.clone(), _d.clone(), 220, true);
    const target = cam.position.clone().addScaledVector(_d, hit.t);
    const dir = target.sub(muzzle).normalize();
    if (!this.rocketMesh) {
      const geo = new THREE.CylinderGeometry(0.05, 0.07, 0.6, 8).rotateX(Math.PI / 2);
      this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.6, emissive: 0xff8a2a, emissiveIntensity: 0 });
      this.rockets = [];
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(geo, this.rocketMat); m.visible = false; this.scene.add(m); this.rockets.push({ m, active: false }); }
      this.rocketMesh = true;
    }
    const r = this.rockets.find((x) => !x.active) || this.rockets[0];
    r.active = true; r.life = 4; r.pos = muzzle.clone(); r.vel = dir.multiplyScalar(62); r.trail = 0;
    r.m.visible = true; r.m.position.copy(muzzle); r.m.lookAt(muzzle.clone().add(r.vel));
    this.flash(muzzle, 1.2, 0xffb24a, 0.08);
    this.puff(muzzle.clone().addScaledVector(r.vel, -0.03), 0x333333, 0.9, 1);
    g.audio.gunshot('shotgun', 0);
    g.audio.whoosh();
    g.camera3p.kick(0.12);
    g.events.emit('shotsFired', { x: g.player.pos.x, z: g.player.pos.z, weapon: 'rpg' });
  }

  updateRockets(dt) {
    if (!this.rockets) return;
    const g = this.game;
    for (const r of this.rockets) {
      if (!r.active) continue;
      r.life -= dt;
      const step = r.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().normalize();
      // anything in the way during this step?
      const hit = this.raycastFrom(r.pos, dir, len + 0.3);
      if (hit || r.life <= 0) {
        const p = hit ? r.pos.clone().addScaledVector(dir, hit) : r.pos;
        r.active = false; r.m.visible = false;
        this.explode(p.x, p.y, p.z, 8);
        continue;
      }
      r.pos.add(step);
      r.vel.y -= 1.5 * dt;
      r.m.position.copy(r.pos);
      r.m.lookAt(r.pos.clone().add(r.vel));
      r.trail -= dt;
      if (r.trail <= 0) { r.trail = 0.025; this.puff(r.pos.clone(), 0x333333, 0.5, 0.9); this.flash(r.pos.clone(), 0.5, 0xffa040, 0.04); }
    }
  }

  /** Distance along dir (from o) to the first solid thing, or 0 if clear within len. */
  raycastFrom(o, d, len) {
    const g = this.game;
    let best = Infinity;
    for (const n of g.npcs.npcs) {
      if (n.state === 'DOWN' || n.role === 'actor') continue;
      const t = rayCylinder(o, d, n.pos.x, n.pos.z, n.pos.y, n.pos.y + 1.8, 0.4);
      if (t < best) best = t;
    }
    for (const v of g.vehicles.vehicles) {
      if (v === g.player.vehicle || Math.abs(v.pos.x - o.x) > len + 8 || Math.abs(v.pos.z - o.z) > len + 8) continue;
      for (const c of v.circles()) { const t = rayCylinder(o, d, c.x, c.z, v.pos.y, v.pos.y + v.height, c.r); if (t < best) best = t; }
    }
    if (g.traffic) for (const c of g.traffic.cars) {
      if (Math.abs(c.x - o.x) > len + 8 || Math.abs(c.z - o.z) > len + 8) continue;
      for (const cc of g.traffic.carCircles(c)) { const t = rayCylinder(o, d, cc.x, cc.z, 0, 1.5, cc.r); if (t < best) best = t; }
    }
    const tw = g.collision.raycast(o.x, o.y, o.z, o.x + d.x * len, o.y + d.y * len, o.z + d.z * len) * len;
    if (tw < len) best = Math.min(best, tw);
    const gy = terrainHeight(o.x + d.x * len, o.z + d.z * len);
    if (o.y + d.y * len <= gy) best = Math.min(best, d.y < -1e-3 ? Math.max(0.01, (gy - o.y) / d.y) : len);
    return best <= len ? Math.max(0.01, best) : 0;
  }

  applyHit(hit, damage, point, dir) {
    const g = this.game;
    if (hit.kind === 'npc') {
      const headshot = point.y - hit.npc.pos.y > 1.45;
      g.npcs.hurt(hit.npc, damage * (headshot ? 2.2 : 1), { x: point.x - dir.x * 3, z: point.z - dir.z * 3 }, { kind: 'bullet', byPlayer: true, dir });
      this.puff(point, 0xffffff, 0.35);
      return true;
    }
    if (hit.kind === 'vehicle') {
      this.damageVehicle(hit.vehicle, damage * 0.22, point);
      return true;
    }
    if (hit.kind === 'traffic') {
      const c = hit.car;
      const v = g.traffic.toVehicle(c);
      if (v) {
        const door = v.doorPoint(1);
        g.npcs.spawnAt(door.x, door.z, g.player.pos);
        this.damageVehicle(v, damage * 0.22, point);
      }
      return true;
    }
    if (hit.kind === 'world' || hit.kind === 'ground') {
      this.puff(point, 0xbfb7a8, 0.45);
      if (Math.random() < 0.3) g.audio.ricochet();
    }
    return false;
  }

  damageVehicle(v, dmg, point) {
    const g = this.game;
    if (v.wrecked) { this.puff(point, 0xffb060, 0.3); return; }
    v.health = Math.max(0, v.health - dmg * (v.armored ? 0.45 : 1));
    const k = 1 - v.health / 100;
    for (const m of v.materials || []) m.color.setScalar(1 - 0.58 * k);
    this.puff(point, 0xffc070, 0.3);
    g.audio.metalHit();
    if (v.health <= 0) {
      v.wrecked = true;
      this.explode(v.pos.x, v.pos.y + 1, v.pos.z);
      g.events.emit('vehicleDestroyed', v);
      if (v.driver === g.player) g.vehicles.onWrecked(v);
    }
  }

  /** Clean-style blast: bright flash, smoke, knocks people over nearby. */
  explode(x, y, z, r = 7) {
    const g = this.game;
    _p.set(x, y, z);
    const center = new THREE.Vector3(x, y, z);
    this.flash(_p, 4.5, 0xffb24a, 0.5);
    for (let i = 0; i < 6; i++) this.puff(_p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), 0x333333, 2.2, 1.6);
    g.audio.explosion(Math.max(0.2, 1 - g.player.pos.distanceTo(_p) / 120));
    g.camera3p.shake = Math.max(g.camera3p.shake || 0, 1);
    const pl = g.player;
    const d = Math.hypot(pl.pos.x - x, pl.pos.z - z);
    if (d < 7) {
      if (pl.vehicle) g.damagePlayer((7 - d) * 3);
      else { g.damagePlayer((7 - d) * 7); pl.hitByVehicle({ vel: new THREE.Vector2((pl.pos.x - x) * 2, (pl.pos.z - z) * 2), police: false }, 8, { x: pl.pos.x, z: pl.pos.z }); }
    }
    g.npcs.blast(x, z, r);
    // chain reaction: cars caught in the blast take heavy damage (and may blow up too)
    for (const v of [...g.vehicles.vehicles]) {
      const dv = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (dv < r && !v.wrecked) setTimeout(() => this.damageVehicle(v, (r - dv) * 28 + 20, center), 120 + dv * 25);
    }
    if (g.traffic) for (const c of [...g.traffic.cars]) {
      const dc = Math.hypot(c.x - x, c.z - z);
      if (dc < r) { const v = g.traffic.toVehicle(c, { x: (c.x - x) * 2, z: (c.z - z) * 2 }); if (v) setTimeout(() => this.damageVehicle(v, (r - dc) * 28 + 20, center), 150 + dc * 25); }
    }
  }

  // ------------------------------------------------------------ ray tests
  /**
   * First hit along o + d*t (t in metres). With skipNearPlayer the first metres
   * in front of the camera (the player's own body) are ignored.
   */
  raycast(o, d, range, aimOnly) {
    const g = this.game, pl = g.player;
    let best = { t: range, kind: 'none' };
    const minT = aimOnly || true ? Math.max(0.5, Math.hypot(pl.pos.x - o.x, pl.pos.z - o.z) + 0.4) : 0;
    // characters (vertical capsules)
    for (const n of g.npcs.npcs) {
      if (n.state === 'DOWN') continue;
      const t = rayCylinder(o, d, n.pos.x, n.pos.z, n.pos.y, n.pos.y + 1.78, 0.34);
      if (t > minT && t < best.t) best = { t, kind: 'npc', npc: n };
    }
    // vehicles and traffic (three cylinders along the body)
    for (const v of g.vehicles.vehicles) {
      if (v === pl.vehicle) continue;
      if (Math.abs(v.pos.x - o.x) > range + 10 || Math.abs(v.pos.z - o.z) > range + 10) continue;
      for (const c of v.circles()) {
        const t = rayCylinder(o, d, c.x, c.z, v.pos.y, v.pos.y + v.height * 0.9, c.r);
        if (t > minT && t < best.t) best = { t, kind: 'vehicle', vehicle: v };
      }
    }
    if (g.traffic) {
      for (const c of g.traffic.cars) {
        if (Math.abs(c.x - o.x) > range + 10 || Math.abs(c.z - o.z) > range + 10) continue;
        for (const cc of g.traffic.carCircles(c)) {
          const t = rayCylinder(o, d, cc.x, cc.z, 0, 1.45, cc.r);
          if (t > minT && t < best.t) best = { t, kind: 'traffic', car: c };
        }
      }
    }
    // static world
    const tw = g.collision.raycast(o.x, o.y, o.z, o.x + d.x * range, o.y + d.y * range, o.z + d.z * range) * range;
    if (tw < best.t) best = { t: tw, kind: 'world' };
    if (d.y < -1e-3) {
      const gy = terrainHeight(o.x + d.x * best.t, o.z + d.z * best.t);
      const tg = (gy - o.y) / d.y;
      if (tg > 0 && tg < best.t) best = { t: tg, kind: 'ground' };
    }
    return best;
  }

  // ------------------------------------------------------------ held weapon + procedural poses
  /** World position of the current weapon's muzzle (falls back to the chest). */
  muzzleWorld(out) {
    const mesh = this.meshes[this.current];
    if (mesh && mesh.visible) { mesh.updateMatrixWorld(); return out.copy(mesh.userData.muzzle).applyMatrix4(mesh.matrixWorld); }
    const pl = this.game.player;
    return out.set(pl.pos.x + Math.sin(pl.heading) * 0.4, pl.pos.y + 1.4, pl.pos.z + Math.cos(pl.heading) * 0.4);
  }

  /** Called by the player controller after the rig has posed the skeleton. */
  postRig(rig) {
    const pl = this.game.player;
    const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
    _axis.set(-fz, 0, fx); // rotating about this tilts "down" toward "forward"
    // procedural front kick: chamber, snap, recover
    if (this.kickT >= 0 && rig) {
      const t = this.kickT;
      const lift = t < 0.18 ? t / 0.18 : t < 0.32 ? 1 : Math.max(0, 1 - (t - 0.32) / 0.26);
      const knee = t < 0.1 ? t / 0.1 : t < 0.2 ? 1 - (t - 0.1) / 0.1 : t < 0.32 ? 0 : Math.min(1, (t - 0.32) / 0.12) * Math.max(0, 1 - (t - 0.44) / 0.14);
      rig.rotateBoneWorld(rig.bone('Chest'), _axis, -0.32 * lift);
      rig.rotateBoneWorld(rig.bone('UpperLeg.R'), _axis, 1.55 * lift);
      rig.rotateBoneWorld(rig.bone('LowerLeg.R'), _axis, -1.5 * knee);
    }
    // aim elevation: tilt the chest so the arms follow the crosshair
    if (this.aiming && rig) {
      const elev = clamp(Math.asin(clamp(this.aimDir.y, -1, 1)), -0.75, 0.75);
      rig.rotateBoneWorld(rig.bone('Chest'), _axis, elev * 0.85);
    }
    this.placeWeapon(rig);
  }

  placeWeapon(rig) {
    const g = this.game, pl = g.player;
    const id = this.current;
    for (const [k, m] of Object.entries(this.meshes)) m.visible = false;
    if (WEAPONS[id].id === 'fists' || pl.vehicle || !rig || !g.player.group.visible) return;
    let mesh = this.meshes[id];
    if (!mesh) {
      mesh = this.meshes[id] = makeWeaponMesh(id);
      if (!mesh) return;
      this.scene.add(mesh);
    }
    const hand = rig.bone('Hand.R'), fore = rig.bone('LowerArm.R');
    if (!hand || !fore) return;
    const hp = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    const fp = new THREE.Vector3().setFromMatrixPosition(fore.matrixWorld);
    const dir = this.aiming ? this.aimDir.clone() : hp.clone().sub(fp).normalize();
    if (id === 'bat' && !this.melee) dir.lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
    mesh.position.copy(hp).addScaledVector(dir, 0.06);
    _m.lookAt(dir, ORIGIN, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(Math.sin(pl.heading), 0, Math.cos(pl.heading)) : _up);
    mesh.quaternion.setFromRotationMatrix(_m);
    mesh.visible = true;
  }

  /** Which upper-body clip the player should show right now (null = none). */
  upperClip() {
    if (this.flinch > 0) return { name: 'Hit_Chest', once: true };
    if (this.melee && this.melee.clip) return { name: this.melee.clip, once: true, timeScale: this.melee.kind === 'bat' ? 1.35 : 1.25 };
    const w = this.weapon;
    if (w.melee) return w.id === 'bat' ? { name: 'Sword_Idle' } : null;
    if (this.reloading > 0) return { name: 'Pistol_Reload', once: true, timeScale: 1.6 / w.reload };
    if (this.aiming) return { name: this.cooldown > w.rate * 0.5 && !w.auto ? 'Pistol_Shoot' : 'Pistol_Aim_Neutral', once: false };
    return null; // carried at the side with normal locomotion
  }

  // ------------------------------------------------------------ enemy fire
  /**
   * An enemy at `from` shoots at the player. accuracy 0..1 is the chance to hit.
   * Returns true on a hit.
   */
  enemyFire(from, accuracy, damage, weapon = 'pistol') {
    const g = this.game, pl = g.player;
    const target = new THREE.Vector3(pl.pos.x, pl.pos.y + (pl.vehicle ? 0.9 : 1.25), pl.pos.z);
    const dist = target.distanceTo(from);
    const hit = Math.random() < accuracy;
    if (!hit) target.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 3));
    // blocked by a wall?
    const t = g.collision.raycast(from.x, from.y, from.z, target.x, target.y, target.z);
    if (t < 0.98) { target.lerpVectors(from, target, t); this.tracer(from, target); this.puff(target, 0xbfb7a8, 0.35); return false; }
    this.tracer(from, target);
    this.flash(from, 0.4);
    g.audio.gunshot(weapon, dist);
    if (!hit) { if (dist < 12 && Math.random() < 0.4) g.audio.ricochet(); return false; }
    if (pl.vehicle) {
      const v = pl.vehicle;
      this.damageVehicle(v, damage * 0.35, target);
      if (Math.random() < 0.3) g.damagePlayer(damage * 0.5);
    } else {
      g.damagePlayer(damage);
      this.flinch = 0.25;
      this.puff(target, 0xffffff, 0.3);
    }
    return true;
  }

  // ------------------------------------------------------------ effects
  buildEffects() {
    // tracers: one LineSegments buffer, additive, fades per segment by colour
    const N = 48;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.tracers.frustumCulled = false;
    this.tracerLife = new Float32Array(N);
    this.tracerIdx = 0;
    this.scene.add(this.tracers);
    // sprites for flashes and impact puffs
    const tex = radialGlowTexture();
    this.sprites = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      s.visible = false;
      this.scene.add(s);
      this.sprites.push({ s, life: 0, max: 1, grow: 1, vy: 0, size: 1 });
    }
    this.spriteIdx = 0;
    // pickups (cash / ammo) as one instanced mesh
    this.pickups = [];
    const pg = new THREE.BoxGeometry(0.34, 0.08, 0.2);
    this.pickupMesh = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0x113311, emissiveIntensity: 0.6 }), 24);
    this.pickupMesh.count = 0;
    this.pickupMesh.frustumCulled = false;
    this.scene.add(this.pickupMesh);
    for (let i = 0; i < 24; i++) this.pickups.push({ active: false, x: 0, z: 0, y: 0, kind: 'cash', amount: 0, t: 0 });
    this.pickupIdx = 0;
  }

  tracer(a, b) {
    const i = this.tracerIdx++ % this.tracerLife.length;
    const pos = this.tracers.geometry.attributes.position;
    // start a little way out of the muzzle so it reads as a streak, not a laser
    _p.copy(b).sub(a);
    const L = _p.length();
    const s = Math.min(0.6, L * 0.2) / Math.max(L, 1e-3);
    pos.setXYZ(i * 2, a.x + _p.x * s, a.y + _p.y * s, a.z + _p.z * s);
    pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    this.tracerLife[i] = 0.09;
  }

  flash(p, size = 0.5, color = 0xffd27a, life = 0.05) {
    const sp = this.sprites[this.spriteIdx++ % this.sprites.length];
    sp.s.position.copy(p);
    sp.s.material.color.setHex(color);
    sp.s.material.blending = THREE.AdditiveBlending;
    sp.s.visible = true;
    sp.life = sp.max = life;
    sp.size = size; sp.grow = 0.2; sp.vy = 0;
    sp.s.scale.setScalar(size);
  }

  puff(p, color = 0xffffff, size = 0.4, life = 0.35) {
    const sp = this.sprites[this.spriteIdx++ % this.sprites.length];
    sp.s.position.copy(p);
    sp.s.material.color.setHex(color);
    sp.s.material.blending = color === 0x333333 ? THREE.NormalBlending : THREE.AdditiveBlending;
    sp.s.visible = true;
    sp.life = sp.max = life;
    sp.size = size; sp.grow = 1.8; sp.vy = color === 0x333333 ? 1.5 : 0.3;
    sp.s.scale.setScalar(size);
  }

  /** Drops a cash or ammo pickup on the ground. */
  drop(x, z, kind, amount, weapon = null) {
    const p = this.pickups[this.pickupIdx++ % this.pickups.length];
    Object.assign(p, { active: true, x, z, y: terrainHeight(x, z) + 0.15, kind, amount, weapon, t: 0 });
  }

  update(dt) {
    const g = this.game;
    this.updateRockets(dt);
    // tracers fade
    const col = this.tracers.geometry.attributes.color;
    let dirty = false;
    for (let i = 0; i < this.tracerLife.length; i++) {
      if (this.tracerLife[i] <= 0 && col.getX(i * 2) === 0) continue;
      this.tracerLife[i] -= dt;
      const k = Math.max(0, this.tracerLife[i] / 0.09);
      col.setXYZ(i * 2, 0.2 * k, 0.18 * k, 0.1 * k);
      col.setXYZ(i * 2 + 1, 1.6 * k, 1.35 * k, 0.8 * k);
      dirty = true;
    }
    if (dirty) col.needsUpdate = true;
    for (const sp of this.sprites) {
      if (!sp.s.visible) continue;
      sp.life -= dt;
      if (sp.life <= 0) { sp.s.visible = false; continue; }
      const k = sp.life / sp.max;
      sp.s.scale.setScalar(sp.size * (1 + (1 - k) * sp.grow));
      sp.s.material.opacity = k;
      sp.s.position.y += sp.vy * dt;
    }
    // pickups: spin, collect on touch
    const pl = g.player;
    let n = 0;
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (const p of this.pickups) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t > 90) { p.active = false; continue; }
      if (!pl.vehicle && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 1.1) {
        p.active = false;
        if (p.kind === 'cash') { g.addMoney(p.amount); g.audio.cash(); g.hud.toast(`+$${p.amount}`, '', 'reward'); }
        else if (this.addAmmo(p.weapon, p.amount) || (this.give(p.weapon, p.amount), true)) { g.audio.pickup(); g.hud.toast(`${WEAPONS[p.weapon].name.toUpperCase()}`, `+${p.amount} rounds`, 'reward'); }
        continue;
      }
      q.setFromAxisAngle(_up, p.t * 2.5);
      mm.compose(_p.set(p.x, p.y + Math.sin(p.t * 3) * 0.06, p.z), q, new THREE.Vector3(1, 1, 1));
      this.pickupMesh.setMatrixAt(n, mm);
      this.pickupMesh.setColorAt(n, c.setHex(p.kind === 'cash' ? 0x5fdc6a : 0xe8b030));
      n++;
    }
    this.pickupMesh.count = n;
    if (n) { this.pickupMesh.instanceMatrix.needsUpdate = true; if (this.pickupMesh.instanceColor) this.pickupMesh.instanceColor.needsUpdate = true; }
  }

  markers() {
    return this.pickups.filter((p) => p.active).map((p) => ({ x: p.x, z: p.z, color: p.kind === 'cash' ? '#5fdc6a' : '#e8b030', shape: 'dot', size: 3 }));
  }
}

/** Ray vs vertical cylinder (x,z centre, y0..y1, radius r). Returns distance or Infinity. */
export function rayCylinder(o, d, cx, cz, y0, y1, r) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return Infinity;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a);
  if (t < 0) return Infinity;
  const y = o.y + d.y * t;
  if (y < y0 || y > y1) return Infinity;
  return t;
}
