import * as THREE from 'three';
import { emptyIntent, TUNE, type Intent, type RacerBody } from '../physics/RacerBody';
import { KICKER, SPLITS, SURFACES, track } from '../world/Track';

export interface RacerProfile {
  name: string;
  shell: number;
  shellDark: number;
  skin: number;
  /** Preferred lateral line, -1 (left) … +1 (right). */
  line: number;
  /** 0 … 1: shortcut appetite, cornering commitment, trick attempts. */
  risk: number;
  /** 0 … 1: how little room it leaves when passing. */
  aggression: number;
  /** 0 … 1: steering steadiness. */
  precision: number;
  /** Seconds before it reacts to the downhill and tucks in. */
  reaction: number;
  /** Slime level at which it starts a slide. */
  slideAt: number;
  /** Seconds it sits on a full boost before firing. */
  boostDelay: number;
}

export const PLAYER_PROFILE: RacerProfile = {
  name: 'You',
  shell: 0xff7a2f,
  shellDark: 0xb8431a,
  skin: 0xf2c45a,
  line: 0,
  risk: 0.8,
  aggression: 0.5,
  precision: 0.95,
  reaction: 0.2,
  slideAt: 0.5,
  boostDelay: 0.2,
};

export const AI_PROFILES: RacerProfile[] = [
  { name: 'Turbo', shell: 0xe8413c, shellDark: 0x8f1f2b, skin: 0xf0b98a, line: 0.1, risk: 0.9, aggression: 0.9, precision: 0.93, reaction: 0.35, slideAt: 0.45, boostDelay: 0.3 },
  { name: 'Shelldon', shell: 0x3f8fe8, shellDark: 0x24508f, skin: 0xb9d77a, line: -0.45, risk: 0.35, aggression: 0.3, precision: 0.9, reaction: 0.7, slideAt: 0.6, boostDelay: 1.2 },
  { name: 'Gooey Louie', shell: 0x58c26a, shellDark: 0x2c7a45, skin: 0xe6cf72, line: 0.5, risk: 0.6, aggression: 0.5, precision: 0.8, reaction: 0.9, slideAt: 0.3, boostDelay: 2.0 },
  { name: 'Slimothy', shell: 0xa968e0, shellDark: 0x62379a, skin: 0xf0a8c6, line: -0.75, risk: 0.75, aggression: 0.7, precision: 0.72, reaction: 0.55, slideAt: 0.7, boostDelay: 0.8 },
  { name: 'Escargo', shell: 0xf2c230, shellDark: 0xa87a12, skin: 0xd6b07e, line: 0.8, risk: 0.2, aggression: 0.2, precision: 0.84, reaction: 1.3, slideAt: 0.8, boostDelay: 3.0 },
];

const target = new THREE.Vector3();

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Racing-line AI. It only ever produces an Intent; the racer it drives obeys
 * exactly the same physics as the player.
 */
export class SnailAI {
  readonly intent: Intent = emptyIntent();
  private routes: Record<string, string> = {};
  private phase = 0;
  private stuck = 0;
  private reverse = 0;
  private slow = 0;
  private stall = 0;
  private boostWait = 0;
  private sliding = false;
  private rollCooldown = 0;
  /** Debug: last target lateral offset. */
  targetD = 0;

  constructor(readonly profile: RacerProfile) {}

  reset(rng: () => number): void {
    const p = this.profile;
    this.routes = {
      leaf: rng() < p.risk * 0.75 ? 'risky' : 'safe',
      maze: rng() < p.risk * 0.9 ? 'risky' : 'safe',
    };
    this.phase = rng() * 10;
    this.stuck = 0;
    this.reverse = 0;
    this.slow = 0;
    this.stall = 0;
    this.boostWait = 0;
    this.sliding = false;
    this.rollCooldown = 0;
  }

  update(dt: number, me: RacerBody, all: RacerBody[], raceTime: number): Intent {
    const it = this.intent;
    const p = this.profile;
    it.toggleRoll = false;
    it.boost = false;
    it.slide = false;
    it.spin = 0;
    it.throttle = 1;
    it.steer = 0;
    if (me.frozen) return it;
    this.rollCooldown -= dt;

    const speed = me.speed;
    const look = 8 + speed * 0.5;
    const sT = me.s + look;
    const hw = track.halfWidth(sT);
    const kAhead = track.curvature(me.s + look * 1.4);

    // Preferred line: personal lane, pulled toward the inside of the next bend.
    let dT = p.line * hw * 0.42 + Math.max(-hw * 0.45, Math.min(hw * 0.45, kAhead * 300));
    dT += Math.sin(raceTime * 0.9 + this.phase) * (1 - p.precision) * 4;
    dT = Math.max(-hw + 1.4, Math.min(hw - 1.4, dT));

    // Past a divider the route is whatever side we actually ended up on.
    for (const sp of SPLITS) {
      if (me.s > sp.s0 && me.s < sp.s1) this.routes[sp.group] = me.d > sp.d ? sp.right : sp.left;
    }

    // Gates: pass-through windows around roots, the bridge and chosen routes.
    let g0 = -Infinity;
    let g1 = Infinity;
    let pull = 0;
    let gateBrake = 0;
    const reach = 12 + speed * 1.3;
    let gateSoon = false;
    for (const g of track.gates) {
      if (g.s0 > me.s + 130) break;
      if (g.s1 > me.s && (!g.group || this.routes[g.group] === g.option)) gateSoon = true;
    }
    for (const g of track.gates) {
      if (g.s0 > me.s + reach) break;
      if (g.s1 < me.s - 0.5) continue;
      if (g.group && this.routes[g.group] !== g.option) continue;
      if (g.s0 > me.s && gateBrake === 0) {
        // Can we still make this window? If not, scrub speed before the roots do it for us.
        const need = me.d < g.d0 ? g.d0 - me.d : me.d > g.d1 ? me.d - g.d1 : 0;
        const tGate = (g.s0 - me.s) / Math.max(speed, 1);
        gateBrake = need > 1.2 && (2 * need) / (tGate * tGate) > 9 + p.risk * 4 ? 1 : -1;
      }
      const n0 = Math.max(g0, g.d0);
      const n1 = Math.min(g1, g.d1);
      if (n0 <= n1) {
        g0 = n0;
        g1 = n1;
      } else {
        // Next window is offset from this one: hug the edge that leads into it.
        if (g.d1 < g0) pull = -1;
        else pull = 1;
        break;
      }
    }
    dT = Math.max(g0, Math.min(g1, dT));
    if (pull < 0 && g0 > -Infinity) dT = g0;
    if (pull > 0 && g1 < Infinity) dT = g1;

    // Loose obstacles: pebbles, mushrooms, stumps.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const o of track.obstaclesNear(me.s + pass * 12)) {
        if (o.avoid <= 0 || o.s < me.s - 1 || o.s > me.s + look + 8) continue;
        if (Math.abs(o.d - dT) < o.avoid) {
          const side = me.d >= o.d ? 1 : -1;
          let c = o.d + side * (o.avoid + 0.5);
          if (c > g1 || c < g0 || Math.abs(c) > hw - 1) c = o.d - side * (o.avoid + 0.5);
          dT = c;
        }
      }
    }

    // Other snails: pick a side to pass on.
    const room = 2.2 - p.aggression * 0.9;
    for (const o of all) {
      if (o === me) continue;
      const ds = o.s - me.s;
      if (ds > 0.3 && ds < 5 + speed * 0.25 && Math.abs(o.d - dT) < room && speed > o.speed + 0.5) {
        const side = me.d >= o.d ? 1 : -1;
        const c = o.d + side * room;
        if (c >= g0 && c <= g1) dT = c;
      }
    }
    this.targetD = dT;

    track.toWorld(sT, dT, target);
    const desired = Math.atan2(target.x - me.pos.x, -(target.z - me.pos.z));
    const moving = speed > 1.5 && me.mode !== 'crawl';
    const yaw = moving ? Math.atan2(me.vel.x, -me.vel.z) : me.heading;
    const err = wrap(desired - yaw);
    it.steer = Math.max(-1, Math.min(1, err * (me.mode === 'crawl' ? 2.4 : 3.4)));

    const slope = track.slope(me.s + 3);
    const contact = me.airTime < 0.07;

    if (me.mode === 'crawl') {
      // Tuck in once the hill will carry us.
      const ready = raceTime > p.reaction && this.rollCooldown <= 0 && Math.abs(err) < 0.7;
      const pace = TUNE.crawlMax * SURFACES[me.surface].crawl;
      if (ready && ((slope > 0.05 && speed > pace - 0.5 && me.surface !== 'mud' && me.surface !== 'water') || speed > TUNE.crawlMax + 0.6)) it.toggleRoll = true;
    } else {
      // Momentum gone on the flat or uphill: get out and crawl.
      if (contact && speed < 1.4 && slope < 0.05) this.slow += dt;
      else this.slow = 0;
      if (this.slow > 0.35 && me.mode === 'roll') {
        it.toggleRoll = true;
        this.slow = 0;
        this.rollCooldown = 1.2;
      }

      // Slime: spend it where rolling resistance bites and the line is calm.
      const drag = SURFACES[me.surface].roll;
      const worth = drag > 0.03 || slope < 0.07;
      if (this.sliding) this.sliding = me.slime > 0.04 && speed > 6 && worth && Math.abs(err) < 0.5;
      else this.sliding = me.slime > p.slideAt && speed > 9 && worth && Math.abs(err) < 0.22 && Math.abs(kAhead) < 0.009 && contact;
      it.slide = this.sliding;

      // Boost only with clear road: no root windows coming, no bend, pointing the right way.
      if (me.boost >= 1 && contact && !gateSoon && Math.abs(err) < 0.18 && Math.abs(kAhead) < 0.007 && speed > 7) {
        this.boostWait += dt;
        if (this.boostWait > p.boostDelay) {
          it.boost = true;
          this.boostWait = 0;
        }
      }
    }

    // Arriving too hot for the next bend: drag the shell (risk-takers brake later).
    if (me.mode === 'roll' && contact) {
      const kMax = Math.max(Math.abs(kAhead), Math.abs(track.curvature(me.s + look * 0.7)), Math.abs(track.curvature(me.s + look * 2.2)));
      const safe = Math.sqrt((16 * SURFACES[me.surface].grip) / Math.max(kMax, 0.002)) * (0.95 + p.risk * 0.2);
      if (speed > safe || (gateBrake > 0 && speed > 9)) it.throttle = -1;
    }

    // One clean spin off the big kicker for the showboats.
    if (!contact && p.risk > 0.55 && me.s > KICKER.s1 && me.s < KICKER.s1 + 60 && me.flightTime > 0.2) {
      if (Math.abs(me.spinAngle) < Math.PI * 2 - 0.25) it.spin = p.line >= 0 ? 1 : -1;
    }

    // Recovery: reverse out, and as a last resort use the checkpoint like a player would.
    if (me.finished) return it;
    if (speed < 0.7 && contact) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (speed < 1.6) this.stall += dt;
    else this.stall = Math.max(0, this.stall - dt * 0.5);
    if (this.stuck > 1.3 && this.reverse <= 0) {
      this.reverse = 0.9;
      // Crawl clear of whatever we hit before trusting the shell again.
      this.rollCooldown = 3.2;
    }
    if (this.reverse > 0) {
      this.reverse -= dt;
      if (me.mode !== 'crawl' && contact) it.toggleRoll = true;
      it.slide = false;
      it.throttle = -1;
      it.steer = -it.steer;
    }
    if (this.stall > 7) {
      me.respawn();
      this.stall = 0;
      this.stuck = 0;
    }
    return it;
  }
}
