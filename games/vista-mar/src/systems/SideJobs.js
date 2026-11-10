import * as THREE from 'three';
import { LINES, xWidths, zWidths, ROAD_NAMES, terrainHeight } from '../world/Layout.js';

// Repeatable side activities that keep the city worth driving around in after
// (and between) story missions:
//  - Taxi shifts: in any Sunshine Cab press T, pick people up, get them there in
//    time. Fares grow with distance, speed tips and an unbroken streak.
//  - Time trials: three checkpoint courses with bronze / silver / gold times.

const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

export const COURSES = [
  {
    id: 'dash', name: 'Downtown Dash', start: { x: 50, z: -100, h: Math.PI / 2 },
    pts: [[100, -100], [100, -200], [200, -200], [200, -100], [200, 0], [100, 0], [0, 0], [0, -100], [50, -100]],
    gold: 52, silver: 64, bronze: 82,
  },
  {
    id: 'ocean', name: 'Ocean Drive Sprint', start: { x: 400, z: 350, h: Math.PI },
    pts: [[400, 300], [400, 200], [400, 100], [400, 0], [400, -100], [400, -200], [400, -300], [300, -300], [300, -200], [300, -100], [300, 0], [300, 50]],
    gold: 50, silver: 61, bronze: 78,
  },
  {
    id: 'tour', name: 'Grand Tour', start: { x: -350, z: -400, h: Math.PI / 2 },
    pts: [[-200, -400], [0, -400], [200, -400], [400, -400], [400, -200], [400, 0], [400, 200], [400, 400], [200, 400], [0, 400], [-200, 400], [-400, 400], [-400, 200], [-400, 0], [-400, -200], [-400, -400], [-350, -400]],
    gold: 100, silver: 122, bronze: 155,
  },
];
const MEDAL_PAY = { gold: 3000, silver: 1500, bronze: 600 };
const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };

export class SideJobs {
  constructor(game) {
    this.game = game;
    this.taxi = null; // active shift
    this.race = null; // active time trial
    this.records = { fares: 0, bestStreak: 0, taxiEarned: 0, races: {} };
    this.hinted = null;

    // one shared world marker (beam + ring) for the current pickup / drop-off / checkpoint,
    // and a fainter one for the checkpoint after it
    const beamGeo = new THREE.CylinderGeometry(1, 1.3, 46, 18, 1, true).translate(0, 23, 0);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x3fe0e8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.4), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const make = (beam) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      ring.position.y = 0.07;
      g.add(ring);
      if (beam) g.add(new THREE.Mesh(beamGeo, this.beamMat));
      g.visible = false;
      game.scene.add(g);
      return g;
    };
    this.marker = make(true);
    this.marker2 = make(false);

    // time-trial start pads (drive in and press E)
    this.places = COURSES.map((c) => ({ job: 'race', course: c, x: c.start.x, z: c.start.z, r: 6, car: true, label: '', icon: '⚑', color: '#3fe0e8', name: `Time trial: ${c.name}` }));
    const padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.7, 1.9), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    this.padMat = padMat;
    for (const p of this.places) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.86, p.r, 40).rotateX(-Math.PI / 2), padMat);
      ring.position.set(p.x, terrainHeight(p.x, p.z) + 0.06, p.z);
      game.scene.add(ring);
      p.ring = ring;
    }
    game.events.on('enterVehicle', (v) => {
      if (v.spec && v.spec.asset === 'taxi' && !this.taxi && this.hinted !== v) { this.hinted = v; setTimeout(() => !this.taxi && game.player.vehicle === v && game.hud.toast('SUNSHINE CAB', 'Press T to start a taxi shift and earn fares.'), 2600); }
    });
  }

  get active() { return !!(this.taxi || this.race); }

  // ------------------------------------------------------------ interaction
  current() {
    const g = this.game, pl = g.player, v = pl.vehicle;
    if (this.active || !v || v.isAircraft || g.story.active || g.interior) return null;
    for (const p of this.places) {
      if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r) {
        const best = this.records.races[p.course.id];
        p.label = `Start time trial: ${p.course.name}${best ? ` (best ${fmt(best.time)}, ${best.medal})` : ` (gold ${fmt(p.course.gold)})`}`;
        return p;
      }
    }
    return null;
  }

  use(p) { if (p.job === 'race') this.startRace(p.course); }

  // ------------------------------------------------------------ taxi
  startTaxi() {
    const g = this.game, v = g.player.vehicle;
    if (!v || v.spec.asset !== 'taxi' || this.active) return;
    if (g.story.active) { g.hud.toast('NOT NOW', 'Finish the mission first.'); return; }
    if (g.police.level > 0) { g.hud.toast('NOT NOW', 'Nobody rides with a wanted driver. Lose the cops first.'); return; }
    this.taxi = { cab: v, fares: 0, earned: 0, streak: 0, away: 0, phase: 'pickup' };
    g.hud.banner('TAXI SHIFT', 'Pick up the fare · T ends the shift', 'mission');
    g.audio.missionStart();
    this.nextFare();
  }

  /** A random kerbside spot: { x, z } for the person, { sx, sz } for the cab, with a street name. */
  kerb(from, minD, maxD) {
    const col = this.game.collision;
    for (let tries = 0; tries < 60; tries++) {
      const ns = Math.random() < 0.5;
      const k = Math.floor(Math.random() * LINES.length);
      const L = LINES[k], w = ns ? xWidths[k] : zWidths[k];
      const a = -370 + Math.random() * 740;
      if (LINES.some((q) => Math.abs(a - q) < 24)) continue; // not in an intersection
      const side = Math.random() < 0.5 ? -1 : 1;
      if (!ns && L === 400 && side > 0) continue;
      const off = w / 2 + 1.7, stop = w / 2 - 2.6;
      const p = ns ? { x: L + side * off, z: a, sx: L + side * stop, sz: a } : { x: a, z: L + side * off, sx: a, sz: L + side * stop };
      const d = Math.hypot(p.sx - from.x, p.sz - from.z);
      if (d < minD || d > maxD) continue;
      if (col.blockedCircle(p.x, p.z, 0.5)) continue;
      const cross = LINES.reduce((b, q) => (Math.abs(a - q) < Math.abs(a - b) ? q : b), LINES[0]);
      p.name = ns ? `${ROAD_NAMES.x[L]} near ${ROAD_NAMES.z[cross]}` : `${ROAD_NAMES.z[L]} near ${ROAD_NAMES.x[cross]}`;
      p.h = ns ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0); // facing the road
      return p;
    }
    return null;
  }

  nextFare() {
    const t = this.taxi, g = this.game;
    const pick = this.kerb(g.player.pos, 90, 300) || this.kerb(g.player.pos, 40, 900);
    if (!pick) { this.endTaxi('No fares around right now.'); return; }
    t.phase = 'pickup';
    t.pick = pick;
    t.dest = null;
    t.timer = 40 + Math.hypot(pick.sx - g.player.pos.x, pick.sz - g.player.pos.z) / 7;
    this.dropActor();
    g.hud.toast('NEW FARE', `Waiting on ${pick.name}.`);
  }

  spawnPassenger(p) {
    const npcs = this.game.npcs;
    const keys = Object.keys(npcs.bakedByKey);
    if (!keys.length) return null;
    return npcs.spawnActor(keys[Math.floor(Math.random() * keys.length)], p.x, p.z, p.h, 'Idle_Talking_Loop');
  }

  dropActor() {
    const t = this.taxi;
    if (t && t.actor) { if (t.actor.active) this.game.npcs.despawn(t.actor); t.actor = null; }
  }

  updateTaxi(dt) {
    const t = this.taxi, g = this.game, pl = g.player, v = t.cab;
    if (g.input.hit('KeyT') && pl.vehicle === v) return this.endTaxi('Shift over.');
    if (v.wrecked) return this.endTaxi('The cab is wrecked.');
    if (g.story.active) return this.endTaxi('Shift over: mission started.');
    if (g.police.level >= 2) return this.endTaxi('The fare bailed: too much heat.');
    if (pl.vehicle !== v) { t.away += dt; if (t.away > 12) return this.endTaxi('You left the cab.'); } else t.away = 0;
    t.timer -= dt;
    const tg = t.phase === 'pickup' ? t.pick : t.dest;
    const d = Math.hypot(pl.pos.x - tg.sx, pl.pos.z - tg.sz);
    if (t.phase === 'pickup') {
      if (!t.actor && d < 130) t.actor = this.spawnPassenger(t.pick);
      if (t.timer <= 0) { t.streak = 0; g.hud.toast('FARE LOST', 'They found another ride.', 'alert'); return this.nextFare(); }
      if (d < 7 && Math.abs(v.speed) < 1.5 && pl.vehicle === v) {
        this.dropActor();
        g.audio.door();
        const dest = this.kerb(pl.pos, 220, 620) || this.kerb(pl.pos, 120, 1200);
        if (!dest) return this.endTaxi('No destination found.');
        t.dest = dest;
        t.phase = 'dropoff';
        t.dist = Math.abs(dest.sx - pl.pos.x) + Math.abs(dest.sz - pl.pos.z); // street distance
        t.total = t.timer = 16 + t.dist / 10.5;
        t.health0 = v.health;
        g.hud.toast('PASSENGER ABOARD', `"${dest.name}, and step on it."`);
      }
    } else {
      if (t.timer <= 0) { t.streak = 0; g.audio.missionFailed(); g.hud.toast('TOO SLOW', 'The passenger got out without paying.', 'alert'); return this.nextFare(); }
      if (d < 8 && Math.abs(v.speed) < 1.5 && pl.vehicle === v) {
        const base = 30 + t.dist * 0.5;
        const tip = base * 0.5 * Math.max(0, t.timer / t.total);
        const rough = Math.max(0, t.health0 - v.health);
        t.streak++;
        const mult = (1 + Math.min(10, t.streak - 1) * 0.1) * (g.economy.owned.has('cabs') ? 1.25 : 1);
        const pay = Math.max(20, Math.round((base + tip - rough * 6) * mult));
        g.addMoney(pay);
        t.fares++; t.earned += pay;
        const r = this.records;
        r.fares++; r.taxiEarned += pay; r.bestStreak = Math.max(r.bestStreak, t.streak);
        g.audio.cash(); g.audio.door();
        g.hud.toast(`FARE PAID  +${money(pay)}`, `${rough > 3 ? 'Rough ride. ' : tip > base * 0.3 ? 'Fast! Big tip. ' : ''}Streak x${t.streak}`, 'reward');
        g.events.emit('fareDone', pay);
        // the passenger steps out onto the kerb and stays a moment
        const a = this.spawnPassenger(t.dest);
        if (a) setTimeout(() => a.active && g.npcs.despawn(a), 9000);
        this.nextFare();
      }
    }
  }

  endTaxi(reason) {
    const t = this.taxi, g = this.game;
    if (!t) return;
    this.dropActor();
    this.taxi = null;
    if (t.fares) g.hud.banner('SHIFT OVER', `${t.fares} fare${t.fares > 1 ? 's' : ''} · ${money(t.earned)} earned`, 'passed');
    else g.hud.toast('TAXI SHIFT ENDED', reason);
    g.events.emit('jobEnded');
  }

  // ------------------------------------------------------------ time trials
  startRace(course) {
    const g = this.game, v = g.player.vehicle;
    if (!v || this.active) return;
    const s = course.start;
    v.pos.set(s.x, terrainHeight(s.x, s.z), s.z);
    v.heading = s.h; v.vel.set(0, 0); v.yawRate = 0; v.syncTransform();
    g.camera3p.yaw = s.h;
    this.race = { course, v, i: 0, phase: 'count', t: 3.2, elapsed: 0, lastBeep: 4 };
    g.hud.banner(course.name.toUpperCase(), `Gold ${fmt(course.gold)} · Silver ${fmt(course.silver)} · Bronze ${fmt(course.bronze)}`, 'mission');
  }

  updateRace(dt) {
    const r = this.race, g = this.game, v = r.v, c = r.course;
    if (g.player.vehicle !== v) return this.failRace('You left the car.');
    if (v.wrecked) return this.failRace('Your car is wrecked.');
    if (g.story.active) return this.failRace('Mission started.');
    if (r.phase === 'count') {
      r.t -= dt;
      const s = c.start;
      v.pos.x = s.x; v.pos.z = s.z; v.vel.set(0, 0); v.heading = s.h; v.yawRate = 0;
      const n = Math.ceil(r.t);
      if (n < r.lastBeep && n > 0 && n <= 3) { r.lastBeep = n; g.audio.tone(660, 0.14, { type: 'square', gain: 0.07 }); g.hud.banner(String(n), 'Get ready', 'mission'); }
      if (r.t <= 0) { r.phase = 'run'; g.audio.tone(1320, 0.4, { type: 'square', gain: 0.08 }); g.hud.banner('GO!', c.name, 'passed'); }
      return;
    }
    r.elapsed += dt;
    if (r.elapsed > c.bronze * 1.25) return this.failRace('Too slow: no medal this time.');
    const p = c.pts[r.i];
    if (Math.hypot(v.pos.x - p[0], v.pos.z - p[1]) < 13) {
      r.i++;
      g.audio.tone(990, 0.12, { type: 'triangle', gain: 0.1 });
      g.audio.tone(1480, 0.2, { type: 'triangle', gain: 0.08, when: 0.08 });
      if (r.i >= c.pts.length) this.finishRace();
    }
  }

  finishRace() {
    const r = this.race, g = this.game, c = r.course;
    this.race = null;
    const time = r.elapsed;
    const medal = time <= c.gold ? 'gold' : time <= c.silver ? 'silver' : time <= c.bronze ? 'bronze' : null;
    const prev = this.records.races[c.id];
    if (!medal) { g.hud.banner('FINISHED', `${fmt(time)} · no medal (bronze is ${fmt(c.bronze)})`, 'failed'); g.audio.missionFailed(); g.events.emit('jobEnded'); return; }
    const better = !prev || MEDAL_RANK[medal] > MEDAL_RANK[prev.medal];
    const pay = better ? MEDAL_PAY[medal] - (prev ? MEDAL_PAY[prev.medal] : 0) : Math.round(MEDAL_PAY[medal] * 0.1);
    g.addMoney(pay);
    if (!prev || time < prev.time) this.records.races[c.id] = { time, medal: better ? medal : prev.medal };
    else if (better) prev.medal = medal;
    g.hud.banner(`${medal.toUpperCase()} MEDAL`, `${c.name} in ${fmt(time)}${prev && time < prev.time ? ' · new record' : ''} · +${money(pay)}`, 'passed');
    g.audio.missionPassed();
    g.events.emit('raceDone', { course: c, time, medal });
    g.events.emit('jobEnded');
  }

  failRace(reason) {
    if (!this.race) return;
    this.race = null;
    this.game.hud.banner('TIME TRIAL OVER', reason, 'failed');
    this.game.audio.missionFailed();
    this.game.events.emit('jobEnded');
  }

  /** Busted, wasted, restart. */
  abort() {
    if (this.taxi) this.endTaxi('Shift over.');
    if (this.race) this.failRace('Time trial abandoned.');
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game, t = g.world.elapsed;
    this.padMat.opacity = this.active ? 0 : 0.35 + Math.sin(t * 3) * 0.2;
    if (this.taxi) this.updateTaxi(dt);
    else if (this.race) this.updateRace(dt);
    else if (g.input.hit('KeyT') && g.player.vehicle && g.player.vehicle.spec.asset === 'taxi') this.startTaxi();

    // world markers
    const m = this.marker, m2 = this.marker2;
    let a = null, b = null, r = 5;
    if (this.taxi) { const tg = this.taxi.phase === 'pickup' ? this.taxi.pick : this.taxi.dest; if (tg) a = [tg.sx, tg.sz]; }
    else if (this.race) { const c = this.race.course; a = c.pts[this.race.i]; b = c.pts[this.race.i + 1]; r = 9; }
    m.visible = !!a; m2.visible = !!b;
    if (a) {
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      m.position.set(a[0], terrainHeight(a[0], a[1]), a[1]);
      m.children[0].scale.setScalar(r * pulse);
      m.children[1].scale.set(r * 0.3, 1, r * 0.3);
      this.beamMat.opacity = 0.18 + g.world.night * 0.14;
    }
    if (b) { m2.position.set(b[0], terrainHeight(b[0], b[1]), b[1]); m2.children[0].scale.setScalar(r * 0.7); }
  }

  /** HUD objective while a job runs (null otherwise). */
  objective() {
    const t = this.taxi, r = this.race;
    if (t) {
      const away = this.game.player.vehicle !== t.cab;
      const sub = `Fares ${t.fares} · ${money(t.earned)} · streak x${t.streak}`;
      if (away) return { kicker: 'TAXI SHIFT', title: 'Get back in the cab', sub, timer: 12 - t.away };
      if (t.phase === 'pickup') return { kicker: 'TAXI SHIFT', title: `Pick up the fare on ${t.pick.name}`, sub, timer: t.timer };
      return { kicker: 'TAXI SHIFT', title: `Drive to ${t.dest.name}`, sub: `${sub} · stop at the marker`, timer: t.timer };
    }
    if (r) {
      const c = r.course;
      if (r.phase === 'count') return { kicker: 'TIME TRIAL', title: c.name, sub: 'Get ready…', timer: null };
      const next = r.elapsed <= c.gold ? ['gold', c.gold] : r.elapsed <= c.silver ? ['silver', c.silver] : ['bronze', c.bronze];
      return { kicker: `TIME TRIAL · ${c.name.toUpperCase()}`, title: `Checkpoint ${r.i + 1} / ${c.pts.length}`, sub: `Elapsed ${fmt(r.elapsed)} · ${next[0]} time left`, timer: next[1] - r.elapsed + 0.99 };
    }
    return null;
  }

  /** Current target for the GPS line. Races return the remaining checkpoints as a ready-made route. */
  target() {
    const t = this.taxi;
    if (t) { const tg = t.phase === 'pickup' ? t.pick : t.dest; return tg ? { x: tg.sx, z: tg.sz } : null; }
    return null;
  }

  routeLine() {
    const r = this.race;
    if (!r) return null;
    const p = this.game.player.pos;
    return [{ x: p.x, z: p.z }, ...r.course.pts.slice(r.i, r.i + 4).map((q) => ({ x: q[0], z: q[1] }))];
  }

  markers() {
    const out = [];
    if (this.taxi) {
      const tg = this.taxi.phase === 'pickup' ? this.taxi.pick : this.taxi.dest;
      if (tg) out.push({ x: tg.sx, z: tg.sz, color: '#3fe0e8', shape: 'diamond', size: 8, edge: true });
    } else if (this.race) {
      const c = this.race.course, a = c.pts[this.race.i];
      if (a) out.push({ x: a[0], z: a[1], color: '#3fe0e8', shape: 'diamond', size: 8, edge: true });
    } else for (const p of this.places) out.push({ x: p.x, z: p.z, color: p.color, shape: 'dot', size: 6, label: p.icon });
    return out;
  }

  medals() {
    return COURSES.map((c) => ({ course: c, best: this.records.races[c.id] || null }));
  }

  serialize() { return JSON.parse(JSON.stringify(this.records)); }

  restore(d) {
    if (!d) return;
    this.records = { fares: d.fares || 0, bestStreak: d.bestStreak || 0, taxiEarned: d.taxiEarned || 0, races: d.races || {} };
  }

  reset() {
    this.abort();
    this.records = { fares: 0, bestStreak: 0, taxiEarned: 0, races: {} };
  }
}
