import { LINES, xWidths, zWidths, terrainHeight } from '../world/Layout.js';
import { route } from './RoadGraph.js';
import { clamp } from '../utils/random.js';

// Five-star wanted system and police AI.
//  ★     one unit investigates the last known position
//  ★★    units pursue
//  ★★★   several units, interceptors aim ahead of the player
//  ★★★★  roadblocks across the road ahead + more units
//  ★★★★★ maximum response, units ram
// Crimes raise the level; staying out of police sight long enough, outside the
// search area around the last known position, clears it. Stopped next to a
// police car while wanted = BUSTED.

const UNITS = [0, 1, 2, 4, 5, 6];
const N = LINES.length;

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.units = [];
    this.roadblocks = [];
    this.lastKnown = null;
    this.seen = false;
    this.evade = 0;
    this.seenTime = 0;
    this.spawnTimer = 0;
    this.roadblockTimer = 0;
    this.bustTimer = 0;
    this.scanTimer = 0;
    this.pedHits = 0;
    const ev = game.events;
    ev.on('pedestrianHit', () => { this.pedHits++; this.crime(this.level === 0 ? 1 : this.pedHits % 2 === 0 ? 1 : 0, 'Hit-and-run'); });
    ev.on('carjack', () => this.crime(1, 'Carjacking'));
    ev.on('trafficCrash', () => { if (this.policeNear(70)) this.crime(1, 'Reckless driving'); });
    ev.on('policeHit', () => this.crime(this.level < 2 ? 2 - this.level : 1, 'Assaulting an officer', 2));
    ev.on('enterVehicle', (v) => { if (v.spec.siren && !v.police) this.crime(2 - Math.min(2, this.level), 'Stolen police car', 2); if (v.alarm) { v.alarm = false; this.crime(Math.max(0, v.alarmStars - this.level), 'Car alarm', v.alarmStars); } });
  }

  get searchRadius() {
    return 45 + this.level * 25;
  }

  policeNear(r) {
    const p = this.game.player.pos;
    return this.units.some((u) => Math.hypot(u.v.pos.x - p.x, u.v.pos.z - p.z) < r);
  }

  /** Raise the wanted level by `add` (and to at least `min`). */
  crime(add, label, min = 0) {
    const before = this.level;
    this.log = (this.log || []).concat(`${label}:${add}/${min}@${this.game.playTime.toFixed(1)}`).slice(-8);
    this.level = clamp(Math.max(this.level + add, min), 0, 5);
    if (this.level > before) {
      this.lastKnown = { x: this.game.player.pos.x, z: this.game.player.pos.z };
      this.evade = 0;
      this.seen = true;
      this.game.hud.toast(`WANTED ${'★'.repeat(this.level)}`, label, 'alert');
      this.game.audio.wantedUp();
    }
  }

  setLevel(l) {
    this.level = clamp(l, 0, 5);
    if (this.level > 0) { this.lastKnown = { x: this.game.player.pos.x, z: this.game.player.pos.z }; this.seen = true; this.evade = 0; }
  }

  clear(msg = null) {
    this.level = 0;
    this.lastKnown = null;
    this.evade = 0;
    this.seenTime = 0;
    this.pedHits = 0;
    for (const u of this.units) { u.mode = 'leave'; u.v.siren = false; }
    for (const rb of this.roadblocks) rb.expire = 0;
    if (msg) this.game.hud.toast(msg, 'Wanted level cleared', 'reward');
  }

  // ------------------------------------------------------------ units
  spawnUnit(mode = 'pursue') {
    const g = this.game, p = g.player.pos;
    const cam = g.camera.position;
    for (let tries = 0; tries < 20; tries++) {
      // a point on a road 110-170 m away, preferably out of view
      const ang = Math.random() * Math.PI * 2, r = 110 + Math.random() * 60;
      let x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
      const vertical = Math.random() < 0.5;
      const L = LINES[Math.floor(Math.random() * N)];
      if (vertical) x = L + 2; else z = L + 2;
      x = clamp(x, LINES[0], LINES[N - 1]); z = clamp(z, LINES[0], LINES[N - 1]);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 80) continue;
      if (g.collision.blockedCircle(x, z, 2.5)) continue;
      void cam;
      const heading = Math.atan2(p.x - x, p.z - z);
      const v = g.vehicles.spawnPolice(x, z, vertical ? (p.z > z ? 0 : Math.PI) : (p.x > x ? Math.PI / 2 : -Math.PI / 2));
      if (!v) return null;
      void heading;
      v.siren = true;
      const u = { v, mode, path: [], pathTimer: 0, stuck: 0, reverse: 0, target: null, searchTarget: null, searchTimer: 0 };
      this.units.push(u);
      return u;
    }
    return null;
  }

  removeUnit(u) {
    this.units.splice(this.units.indexOf(u), 1);
    this.game.vehicles.removePolice(u.v);
  }

  spawnRoadblock() {
    const g = this.game, pl = g.player;
    const v = pl.vehicle;
    if (!v || Math.abs(v.speed) < 8) return;
    // put it on the road ahead along our travel axis, past the next intersection
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const alongX = Math.abs(fx) > Math.abs(fz);
    const dir = alongX ? Math.sign(fx) : Math.sign(fz);
    const s0 = alongX ? v.pos.x : v.pos.z;
    let line = -1;
    for (let k = 0; k < N; k++) {
      const L = LINES[dir > 0 ? k : N - 1 - k];
      if ((L - s0) * dir > 70) { line = dir > 0 ? k : N - 1 - k; break; }
    }
    if (line < 0) return;
    const roadLine = alongX ? nearestLine(v.pos.z) : nearestLine(v.pos.x);
    const crossHalf = alongX ? xWidths[line] / 2 : zWidths[line] / 2;
    const s = LINES[line] - dir * (crossHalf + 10);
    const c = LINES[roadLine];
    const rb = { cars: [], expire: 40 };
    for (const off of [-3.2, 3.2]) {
      const x = alongX ? s : c + off, z = alongX ? c + off : s;
      const heading = alongX ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI / 2 : -Math.PI / 2);
      const pc = g.vehicles.spawnPolice(x, z, heading);
      if (pc) { pc.siren = true; pc.roadblock = true; rb.cars.push(pc); }
    }
    if (rb.cars.length) {
      this.roadblocks.push(rb);
      g.hud.toast('ROADBLOCK AHEAD', 'Police have blocked the road. Find another way.', 'alert');
    }
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.game, pl = g.player, p = pl.pos;
    // sight checks (every 0.25 s)
    this.scanTimer -= dt;
    if (this.level > 0 && this.scanTimer <= 0) {
      this.scanTimer = 0.25;
      this.seen = false;
      const range = 60 + this.level * 12;
      for (const u of this.units) {
        const d = Math.hypot(u.v.pos.x - p.x, u.v.pos.z - p.z);
        if (d > range) continue;
        const t = g.collision.raycast(u.v.pos.x, u.v.pos.y + 1.5, u.v.pos.z, p.x, p.y + 1.2, p.z);
        if (t >= 0.999) { this.seen = true; break; }
      }
      for (const rb of this.roadblocks) for (const c of rb.cars) {
        if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 45 && g.collision.raycast(c.pos.x, c.pos.y + 1.5, c.pos.z, p.x, p.y + 1.2, p.z) >= 0.999) this.seen = true;
      }
      if (this.seen) this.lastKnown = { x: p.x, z: p.z };
    }
    if (this.level > 0) {
      if (this.seen) {
        this.evade = 0;
        this.seenTime += dt;
        // sustained pursuit escalates
        if (this.level >= 2 && this.level < 5 && this.seenTime > 45) { this.seenTime = 0; this.crime(1, 'Evading police'); }
      } else {
        const crouchBonus = !pl.vehicle && pl.crouched ? 1.6 : 1;
        this.evade += dt * crouchBonus;
        const outside = !this.lastKnown || Math.hypot(p.x - this.lastKnown.x, p.z - this.lastKnown.z) > this.searchRadius;
        if (this.evade > 6 + this.level * 4 && outside) this.clear('YOU LOST THE COPS');
      }
    }

    // keep the right number of units
    const want = UNITS[this.level];
    const active = this.units.filter((u) => u.mode !== 'leave');
    this.spawnTimer -= dt;
    if (active.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      this.spawnUnit(this.level === 1 ? 'investigate' : 'pursue');
    }
    // roadblocks
    this.roadblockTimer -= dt;
    if (this.level >= 4 && this.roadblockTimer <= 0 && this.roadblocks.length < 2) {
      this.roadblockTimer = 22;
      this.spawnRoadblock();
    }
    for (const rb of [...this.roadblocks]) {
      rb.expire -= dt;
      const far = rb.cars.every((c) => Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > 160);
      if (rb.expire <= 0 && far) { for (const c of rb.cars) g.vehicles.removePolice(c); this.roadblocks.splice(this.roadblocks.indexOf(rb), 1); }
    }

    // drive every unit
    for (const u of [...this.units]) {
      if (u.v.driver) { this.units.splice(this.units.indexOf(u), 1); continue; } // player stole it
      const d = Math.hypot(u.v.pos.x - p.x, u.v.pos.z - p.z);
      if (u.mode === 'leave' && d > 140) { this.removeUnit(u); continue; }
      if (d > 320) { this.removeUnit(u); continue; }
      if (u.v.wrecked) { u.mode = 'leave'; u.v.siren = false; }
      this.driveUnit(u, dt, d);
    }

    // busted: wanted and stuck next to a police car
    if (this.level > 0) {
      const near = this.units.some((u) => !u.v.wrecked && Math.hypot(u.v.pos.x - p.x, u.v.pos.z - p.z) < (pl.vehicle ? 7 : 6) && Math.abs(u.v.speed) < 4)
        || this.roadblocks.some((rb) => rb.cars.some((c) => Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 6));
      const slow = pl.vehicle ? Math.abs(pl.vehicle.speed) < 1.5 : pl.speed < 1.2;
      this.bustTimer = near && slow ? this.bustTimer + dt : Math.max(0, this.bustTimer - dt * 2);
      if (this.bustTimer > 3) { this.bustTimer = 0; g.busted(); }
    } else this.bustTimer = 0;

    // siren mix: loudest nearby unit with its siren on
    let sir = 0;
    for (const u of this.units) if (u.v.siren) sir = Math.max(sir, 1 - Math.hypot(u.v.pos.x - p.x, u.v.pos.z - p.z) / 160);
    g.audio.policeSirens(Math.max(0, sir));
  }

  driveUnit(u, dt, dist) {
    const g = this.game, v = u.v, pl = g.player;
    const p = pl.pos;
    let tx, tz, maxSpeed = v.spec.maxSpeed * (0.85 + this.level * 0.04);
    if (u.mode === 'leave') {
      tx = v.pos.x + Math.sin(v.heading) * 50; tz = v.pos.z + Math.cos(v.heading) * 50;
      maxSpeed = 12;
    } else if (u.mode === 'investigate' && !this.seen && this.lastKnown) {
      // drive to the last known position, then cruise around it
      const lk = this.lastKnown;
      if (!u.searchTarget || Math.hypot(v.pos.x - u.searchTarget.x, v.pos.z - u.searchTarget.z) < 12 || (u.searchTimer -= dt) < 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.searchRadius;
        u.searchTarget = { x: lk.x + Math.cos(a) * r, z: lk.z + Math.sin(a) * r };
        u.searchTimer = 12;
      }
      ({ x: tx, z: tz } = this.waypoint(u, u.searchTarget, dt));
      maxSpeed = 16;
    } else {
      if (this.seen) u.mode = 'pursue';
      const pv = pl.vehicle;
      const lead = this.level >= 3 ? 1.1 : 0.5;
      const target = this.seen || dist < 25
        ? { x: p.x + (pv ? pv.vel.x : 0) * lead, z: p.z + (pv ? pv.vel.y : 0) * lead }
        : (this.lastKnown || { x: p.x, z: p.z });
      const los = dist < 55 && g.collision.raycast(v.pos.x, v.pos.y + 1, v.pos.z, target.x, 1, target.z) >= 0.999;
      if (los) { tx = target.x; tz = target.z; u.path = []; }
      else ({ x: tx, z: tz } = this.waypoint(u, target, dt));
      // ease off right next to an on-foot suspect
      if (!pv && dist < 9) maxSpeed = Math.min(maxSpeed, dist);
    }
    // steering toward target
    const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    let diff = want - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    let steer = clamp(-diff * 2.4, -1, 1);
    let throttle = Math.abs(v.speed) < maxSpeed ? 1 : 0;
    if (Math.abs(diff) > 1.3 && v.speed > 14) throttle = -0.6;
    let handbrake = Math.abs(diff) > 1.6 && v.speed > 10;
    // stuck detection: reverse out
    if (u.reverse > 0) {
      u.reverse -= dt;
      throttle = -1; steer = -steer; handbrake = false;
    } else if (throttle > 0 && Math.abs(v.speed) < 1) {
      u.stuck += dt;
      if (u.stuck > 1.4) { u.stuck = 0; u.reverse = 1.1; }
    } else u.stuck = 0;
    v.update(dt, { throttle, steer, handbrake });
  }

  /** Next point along a street route (recomputed every couple of seconds). */
  waypoint(u, target, dt) {
    const v = u.v;
    u.pathTimer -= dt;
    if (!u.path.length || u.pathTimer <= 0) {
      u.path = route({ x: v.pos.x, z: v.pos.z }, target).slice(1);
      u.pathTimer = 2;
    }
    while (u.path.length > 1 && Math.hypot(u.path[0].x - v.pos.x, u.path[0].z - v.pos.z) < 9) u.path.shift();
    return u.path[0] || target;
  }

  markers() {
    const out = [];
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    for (const u of this.units) out.push({ x: u.v.pos.x, z: u.v.pos.z, color: blink ? '#ff3b3b' : '#3b7bff', size: 6, edge: this.level > 0, shape: 'dot' });
    for (const rb of this.roadblocks) for (const c of rb.cars) out.push({ x: c.pos.x, z: c.pos.z, color: '#ff3b3b', size: 5, shape: 'dot' });
    return out;
  }

  reset() {
    this.clear();
    for (const u of [...this.units]) this.removeUnit(u);
    for (const rb of this.roadblocks) for (const c of rb.cars) this.game.vehicles.removePolice(c);
    this.roadblocks = [];
  }
}

function nearestLine(v) {
  let best = 0, bd = Infinity;
  LINES.forEach((L, k) => { const d = Math.abs(v - L); if (d < bd) { bd = d; best = k; } });
  return best;
}

export { terrainHeight };
