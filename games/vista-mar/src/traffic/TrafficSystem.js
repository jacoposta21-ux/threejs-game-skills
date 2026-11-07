import * as THREE from 'three';
import { LINES, xWidths, zWidths, terrainHeight, blockDistrict } from '../world/Layout.js';
import { clamp } from '../utils/random.js';

// Autonomous road traffic on the street grid. Each car follows a lane (right-hand
// traffic), stops at red lights, picks straight/left/right at intersections on a
// Bezier path, keeps a gap to whatever is ahead (cars, the player, crossing
// pedestrians), honks when blocked, and spawns/despawns around the player with a
// district-dependent density. Rendered as InstancedMesh pools (one draw call per
// model). A hard hit turns a traffic car into a physical, drivable Vehicle.

const MODELS = ['sedan', 'suv', 'taxi', 'hatch', 'van', 'sports'];
const POOL_PER_MODEL = 8;
const N = LINES.length;

function laneOffsets(width, isBoulevard) {
  if (isBoulevard) return [3.9, 7.5];
  if (width >= 16) return [2.2];
  return [1.9];
}

export class TrafficSystem {
  constructor(game, carModels) {
    this.game = game;
    this.scene = game.scene;
    this.cars = [];
    this.meshes = {};
    this.lights = {};
    const lampGeo = new THREE.BoxGeometry(0.32, 0.12, 0.05);
    for (const key of MODELS) {
      const m = carModels[key];
      if (!m) continue;
      const im = new THREE.InstancedMesh(m.geometry, m.materials.length > 1 ? m.materials : m.materials[0], POOL_PER_MODEL);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.receiveShadow = true;
      im.count = 0;
      this.scene.add(im);
      // head + tail lamps for this model, one instanced mesh with 4 lamps per car
      const s = m.size;
      const lamps = [
        [s.x * 0.31, s.y * 0.36, s.z / 2, 0xfff1d6], [-s.x * 0.31, s.y * 0.36, s.z / 2, 0xfff1d6],
        [s.x * 0.33, s.y * 0.42, -s.z / 2, 0xff2414], [-s.x * 0.33, s.y * 0.42, -s.z / 2, 0xff2414],
      ];
      const geos = lamps.map(([x, y, z, c]) => {
        const g = lampGeo.clone().translate(x, y, z).toNonIndexed();
        const col = new THREE.Color(c);
        const arr = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return g;
      });
      const merged = mergeSimple(geos);
      const lm = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0x333333 });
      const li = new THREE.InstancedMesh(merged, lm, POOL_PER_MODEL);
      li.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      li.frustumCulled = false;
      li.count = 0;
      this.scene.add(li);
      this.meshes[key] = { im, li, size: s, free: [...Array(POOL_PER_MODEL).keys()], key, lampMat: lm };
    }
    this.spawnTimer = 0;
    this.matrix = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.scale = new THREE.Vector3(1, 1, 1);
    this.hornTimer = 0;
  }

  // ------------------------------------------------------------ lanes
  /** Lane centre line: ori 'ns' (runs along z) or 'ew' (along x), line index k, dir ±1. */
  laneCoord(ori, k, dir, off) {
    // right-hand traffic: southbound (+z) keeps to -x, northbound to +x; eastbound to +z, westbound to -z
    if (ori === 'ns') return LINES[k] + (dir > 0 ? -off : off);
    return LINES[k] + (dir > 0 ? off : -off);
  }

  roadHalfWidth(ori, k) {
    return (ori === 'ns' ? xWidths[k] : zWidths[k]) / 2;
  }

  crossHalfWidth(ori, m) {
    // the road we drive into at line m runs the other way
    return (ori === 'ns' ? zWidths[m] : xWidths[m]) / 2;
  }

  /** Index of the next cross line ahead of coordinate s in direction dir, or -1. */
  nextLine(s, dir) {
    if (dir > 0) { for (let m = 0; m < N; m++) if (LINES[m] > s + 0.5) return m; }
    else { for (let m = N - 1; m >= 0; m--) if (LINES[m] < s - 0.5) return m; }
    return -1;
  }

  // ------------------------------------------------------------ spawning
  spawnCar(nearPos, minD, maxD, avoidView) {
    const keys = Object.keys(this.meshes).filter((k) => this.meshes[k].free.length);
    if (!keys.length) return null;
    const key = keys[Math.floor(Math.random() * keys.length)];
    const cam = this.game.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    for (let tries = 0; tries < 16; tries++) {
      const ori = Math.random() < 0.5 ? 'ns' : 'ew';
      const k = Math.floor(Math.random() * N);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const offs = laneOffsets(ori === 'ns' ? xWidths[k] : zWidths[k], ori === 'ew' && LINES[k] === 0);
      const off = offs[Math.floor(Math.random() * offs.length)];
      const c = this.laneCoord(ori, k, dir, off);
      // along-coordinate within the grid, not inside an intersection
      const s = LINES[0] + Math.random() * (LINES[N - 1] - LINES[0]);
      const m = this.nextLine(s, dir);
      if (m < 0) continue;
      if (Math.abs(LINES[m] - s) < this.crossHalfWidth(ori, m) + 8) continue;
      const prev = this.nextLine(s, -dir);
      if (prev >= 0 && Math.abs(LINES[prev] - s) < this.crossHalfWidth(ori, prev) + 4) continue;
      const x = ori === 'ns' ? c : s, z = ori === 'ns' ? s : c;
      const d = Math.hypot(x - nearPos.x, z - nearPos.z);
      if (d < minD || d > maxD) continue;
      if (avoidView && d < 120 && (x - cam.position.x) * fwd.x + (z - cam.position.z) * fwd.z > 0) continue;
      if (this.occupied(x, z, 9)) continue;
      const pool = this.meshes[key];
      const slot = pool.free.pop();
      const car = {
        key, slot, pool, ori, k, dir, off, s, c, x, z, heading: 0, speed: 6 + Math.random() * 4,
        halfL: pool.size.z / 2, halfW: pool.size.x / 2, turn: null, blocked: 0, honk: 0, limit: 11,
        phaseGo: true,
      };
      car.heading = this.headingFor(ori, dir);
      this.cars.push(car);
      return car;
    }
    return null;
  }

  headingFor(ori, dir) {
    if (ori === 'ns') return dir > 0 ? 0 : Math.PI;
    return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  occupied(x, z, r) {
    for (const c of this.cars) if (Math.abs(c.x - x) < r && Math.abs(c.z - z) < r) return true;
    for (const v of this.game.vehicles.vehicles) if (Math.abs(v.pos.x - x) < r && Math.abs(v.pos.z - z) < r) return true;
    return false;
  }

  remove(car) {
    car.pool.free.push(car.slot);
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  // ------------------------------------------------------------ simulation
  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    const hour = g.world.timeOfDay;
    const late = hour >= 1 && hour < 5.5;
    const district = blockDistrictAt(p.x, p.z);
    const base = { downtown: 26, midtown: 22, nightlife: 20, beach: 18, apartments: 14, residential: 9, industrial: 12, park: 14, sand: 12 }[district] ?? 14;
    const target = Math.round(base * (late ? 0.4 : 1));
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.cars.length < target) {
      this.spawnTimer = 0.15;
      this.spawnCar(p, this.cars.length < target * 0.5 && g.playTime < 1 ? 15 : 70, 190, true);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 240 || (c.blocked > 25 && d > 50)) this.remove(c);
    }
    for (const c of this.cars) this.drive(c, dt);
    this.hornTimer -= dt;
    this.render(g.world.night);
  }

  drive(c, dt) {
    const g = this.game;
    // speed limit by district
    const dist = blockDistrictAt(c.x, c.z);
    c.limit = c.ori === 'ew' && LINES[c.k] === 0 ? 14 : c.ori === 'ns' && c.k === N - 1 ? 13 : dist === 'residential' ? 9 : dist === 'industrial' ? 10 : 11.5;
    let desired = c.limit;

    if (!c.turn) {
      // approaching the next intersection: obey the signal
      const m = this.nextLine(c.s, c.dir);
      if (m < 0) { this.remove(c); return; }
      const stopAt = LINES[m] - c.dir * (this.crossHalfWidth(c.ori, m) + 1.2);
      const toStop = (stopAt - c.s) * c.dir;
      const i = c.ori === 'ns' ? c.k : m, j = c.ori === 'ns' ? m : c.k;
      const phase = g.world.signalPhase(c.ori, g.world.signalOffset(i, j));
      if (toStop > -0.5) {
        const mustStop = phase === 'red' || (phase === 'yellow' && toStop > 6);
        if (mustStop && toStop < 40) desired = Math.min(desired, Math.max(0, Math.sqrt(2 * 5 * Math.max(0, toStop - c.halfL)) - 0.5));
      }
      if (toStop <= c.halfL * 0.2 - 0.0 && toStop > -3 && !(phase === 'red' && toStop > -0.2)) {
        // entering the intersection: choose a manoeuvre
        if (toStop < 0.5) this.startTurn(c, m);
      }
    }

    // keep a gap to whatever is ahead in our path
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    let gap = Infinity;
    const consider = (ox, oz, half, latTol = 1.7) => {
      const dx = ox - c.x, dz = oz - c.z;
      const a = dx * fx + dz * fz;
      if (a <= 0 || a > 40) return;
      const lat = Math.abs(dx * -fz + dz * fx);
      if (lat > latTol) return;
      gap = Math.min(gap, a - c.halfL - half);
    };
    for (const o of this.cars) if (o !== c) consider(o.x, o.z, o.halfL);
    for (const v of g.vehicles.vehicles) consider(v.pos.x, v.pos.z, v.halfL, 1.9);
    let playerAhead = false;
    if (!g.player.vehicle) {
      const before = gap; consider(g.player.pos.x, g.player.pos.z, 0.5, 1.6);
      playerAhead = gap < before && gap < 8;
    } else {
      const before = gap; const pv = g.player.vehicle; consider(pv.pos.x, pv.pos.z, pv.halfL, 2.0);
      playerAhead = gap < before && gap < 8;
    }
    if (g.npcs) for (const n of g.npcs.onRoadNear(c.x, c.z, 30)) consider(n.pos.x, n.pos.z, 0.4, 2.2);
    if (gap < Infinity) desired = Math.min(desired, Math.max(0, (gap - 2.2) * 0.85));

    // accelerate / brake toward desired speed
    const acc = desired > c.speed ? 2.6 : 7.5;
    c.speed += clamp(desired - c.speed, -acc * dt, acc * dt);
    c.braking = desired < c.speed - 0.3 || c.speed < 0.3;
    if (c.speed < 0.2) c.blocked += dt; else c.blocked = 0;

    // honk at a player blocking the lane
    if (playerAhead && c.speed < 0.5 && c.blocked > 2.5 && this.hornTimer <= 0) {
      this.hornTimer = 3 + Math.random() * 2;
      g.audio.hornAt(Math.hypot(c.x - g.player.pos.x, c.z - g.player.pos.z));
    }

    // advance
    if (c.turn) {
      const t = c.turn;
      t.u = Math.min(1, t.u + (c.speed * dt) / t.len);
      const u = t.u, iu = 1 - u;
      c.x = iu * iu * t.p0.x + 2 * iu * u * t.p1.x + u * u * t.p2.x;
      c.z = iu * iu * t.p0.z + 2 * iu * u * t.p1.z + u * u * t.p2.z;
      const tx = 2 * iu * (t.p1.x - t.p0.x) + 2 * u * (t.p2.x - t.p1.x);
      const tz = 2 * iu * (t.p1.z - t.p0.z) + 2 * u * (t.p2.z - t.p1.z);
      if (Math.hypot(tx, tz) > 1e-4) c.heading = Math.atan2(tx, tz);
      if (t.u >= 1) {
        c.turn = null;
        c.ori = t.ori; c.k = t.k; c.dir = t.dir; c.off = t.off;
        c.c = this.laneCoord(c.ori, c.k, c.dir, c.off);
        c.s = c.ori === 'ns' ? c.z : c.x;
        c.heading = this.headingFor(c.ori, c.dir);
      }
    } else {
      c.s += c.dir * c.speed * dt;
      if (c.ori === 'ns') { c.x = c.c; c.z = c.s; } else { c.x = c.s; c.z = c.c; }
    }
    c.y = terrainHeight(c.x, c.z);
  }

  startTurn(c, m) {
    // options at intersection (line k of our road, line m of the crossing road)
    const opts = [];
    const nextSame = m + c.dir;
    if (nextSame >= 0 && nextSame < N) opts.push('straight', 'straight');
    // right turn: southbound(+z) turns west(-x); northbound east; eastbound south; westbound north
    const rightDir = c.ori === 'ns' ? -c.dir : c.dir;
    const leftDir = -rightDir;
    const canGo = (d) => { const nk = c.k + d; return nk >= 0 && nk < N; };
    if (canGo(rightDir)) opts.push('right');
    if (canGo(leftDir)) opts.push('left');
    const choice = opts[Math.floor(Math.random() * opts.length)] || 'straight';
    const p0 = { x: c.x, z: c.z };
    let ori = c.ori, k = c.k, dir = c.dir, off = c.off;
    if (choice !== 'straight') {
      ori = c.ori === 'ns' ? 'ew' : 'ns';
      k = m;
      dir = choice === 'right' ? rightDir : leftDir;
      const offs = laneOffsets(ori === 'ns' ? xWidths[k] : zWidths[k], ori === 'ew' && LINES[k] === 0);
      off = offs[choice === 'right' ? offs.length - 1 : 0];
    }
    // exit point just past the intersection on the new road
    const lane = this.laneCoord(ori, k, dir, off);
    let exitLine = choice === 'straight' ? m : (ori === 'ns' ? c.k : c.k); // the line we leave from
    void exitLine;
    const crossHalf = choice === 'straight' ? this.crossHalfWidth(c.ori, m) : (ori === 'ns' ? zWidths[c.k] / 2 : xWidths[c.k] / 2);
    const base = choice === 'straight' ? LINES[m] : LINES[c.k];
    const sExit = base + dir * (crossHalf + 1.5);
    const p2 = ori === 'ns' ? { x: lane, z: sExit } : { x: sExit, z: lane };
    let p1;
    if (choice === 'straight') p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    else p1 = c.ori === 'ns' ? { x: p0.x, z: p2.z } : { x: p2.x, z: p0.z };
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) + Math.hypot(p2.x - p1.x, p2.z - p1.z);
    c.turn = { p0, p1, p2, u: 0, len: Math.max(1, len * 0.92), ori, k, dir, off };
  }

  // ------------------------------------------------------------ interaction
  pushPedestrian(x, z, r) {
    for (const c of this.cars) {
      if (Math.abs(c.x - x) > 6 || Math.abs(c.z - z) > 6) continue;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const dx = x - c.x, dz = z - c.z;
      const lf = dx * fx + dz * fz, lr = dx * -fz + dz * fx;
      const cf = clamp(lf, -c.halfL, c.halfL), cr = clamp(lr, -c.halfW, c.halfW);
      const ef = lf - cf, er = lr - cr, d = Math.hypot(ef, er);
      if (d >= r) continue;
      if (d < 1e-5) {
        const side = Math.sign(lr) || 1;
        const nr = side * (c.halfW + r);
        x = c.x + fx * lf + -fz * nr; z = c.z + fz * lf + fx * nr;
      } else {
        const k = r / d;
        const nf = cf + ef * k, nr = cr + er * k;
        x = c.x + fx * nf - fz * nr; z = c.z + fz * nf + fx * nr;
      }
    }
    return { x, z };
  }

  /** Circles used by the player's vehicle for collision. */
  carCircles(c) {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const r = c.halfW * 0.95, off = c.halfL - r;
    return [{ x: c.x + fx * off, z: c.z + fz * off, r }, { x: c.x, z: c.z, r }, { x: c.x - fx * off, z: c.z - fz * off, r }];
  }

  nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const ef = Math.max(0, Math.abs(dx * fx + dz * fz) - c.halfL), er = Math.max(0, Math.abs(dx * -fz + dz * fx) - c.halfW);
      const d = Math.hypot(ef, er);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Replace a traffic car with a physical Vehicle (after a crash or a carjack). */
  toVehicle(c, impulse = null) {
    const vs = this.game.vehicles;
    const v = vs.spawnDynamic(c.key, c.x, c.z, c.heading);
    if (!v) return null;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    v.vel.set(fx * c.speed, fz * c.speed);
    if (impulse) { v.vel.x += impulse.x; v.vel.y += impulse.z; v.yawRate += (Math.random() - 0.5) * 1.5; }
    this.remove(c);
    return v;
  }

  // ------------------------------------------------------------ rendering
  render(night) {
    for (const pool of Object.values(this.meshes)) { pool.im.count = 0; pool.li.count = 0; pool.used = 0; }
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const pool of Object.values(this.meshes)) for (let i = 0; i < POOL_PER_MODEL; i++) { pool.im.setMatrixAt(i, hidden); pool.li.setMatrixAt(i, hidden); }
    for (const c of this.cars) {
      this.q.setFromAxisAngle(this.up, c.heading);
      this.matrix.compose(new THREE.Vector3(c.x, c.y || 0, c.z), this.q, this.scale);
      c.pool.im.setMatrixAt(c.slot, this.matrix);
      c.pool.li.setMatrixAt(c.slot, this.matrix);
    }
    for (const pool of Object.values(this.meshes)) {
      pool.im.count = POOL_PER_MODEL;
      pool.li.count = POOL_PER_MODEL;
      pool.im.instanceMatrix.needsUpdate = true;
      pool.li.instanceMatrix.needsUpdate = true;
      const k = 0.25 + night * 2.6;
      pool.lampMat.color.setRGB(k, k, k);
    }
  }

  /** Fill the streets around a point immediately (start of play, teleports). */
  prefill(pos, count = 18) {
    for (let i = 0; i < count * 3 && this.cars.length < count; i++) this.spawnCar(pos, 12, 170, false);
  }

  reset() {
    for (const c of [...this.cars]) this.remove(c);
  }
}

function mergeSimple(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function blockDistrictAt(x, z) {
  if (x > 413) return 'sand';
  let i = 0, j = 0;
  for (let k = 0; k < LINES.length - 1; k++) { if (x >= LINES[k]) i = k; if (z >= LINES[k]) j = k; }
  return blockDistrict(clamp(i, 0, 7), clamp(j, 0, 7));
}
