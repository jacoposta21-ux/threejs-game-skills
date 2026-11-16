import * as THREE from 'three';
import { TUNE, type Intent, type ItemKind, type RacerBody } from '../physics/RacerBody';
import { track } from '../world/Track';

/**
 * Kart-style items: boxes on the course hand out a random item after a short
 * roulette; racers fire them with the same Intent the physics uses. DOM-free and
 * driven by the race RNG, so headless simulations stay deterministic.
 */

export interface ItemBox {
  s: number;
  d: number;
  pos: THREE.Vector3;
  /** Seconds until it reappears (0 = available). */
  respawn: number;
}

export interface Banana {
  /** Peels spin you out; webs hold you back. */
  kind: 'banana' | 'web';
  pos: THREE.Vector3;
  s: number;
  d: number;
  owner: number;
  age: number;
  yaw: number;
}

export interface Acorn {
  pos: THREE.Vector3;
  s: number;
  d: number;
  vs: number;
  owner: number;
  age: number;
  target: number;
}

/** A ladybug flying along the course after the leader. */
export interface Ladybug {
  pos: THREE.Vector3;
  s: number;
  d: number;
  owner: number;
  target: number;
  age: number;
}

/** A honey puddle: sticky for a while, then it soaks away. */
export interface Puddle {
  pos: THREE.Vector3;
  s: number;
  d: number;
  owner: number;
  age: number;
}

export const HONEY_LIFE = 14;
export const HONEY_R = 2.4;

export type ItemEventType = 'pickup' | 'got' | 'use' | 'hit' | 'blocked' | 'acornBreak';

export interface ItemEvent {
  type: ItemEventType;
  racer: number;
  kind: ItemKind | null;
  pos: THREE.Vector3;
}

export const ITEM_NAMES: Record<ItemKind, string> = {
  mushroom: 'Turbo Mushroom',
  banana: 'Banana Peel',
  acorn: 'Acorn',
  slime: 'Super Slime',
  shield: 'Shell Shield',
  giant: 'Giant Snail',
  web: 'Spider Web',
  ladybug: 'Ladybug',
  honey: 'Honey Drop',
};

const KINDS: ItemKind[] = ['mushroom', 'banana', 'acorn', 'slime', 'shield', 'giant', 'web', 'ladybug', 'honey'];
/** Weights per item (same order as KINDS) by race position band: leader, chasers, back of the pack. */
const ODDS: number[][] = [
  [0, 40, 8, 12, 22, 0, 12, 0, 6],
  [16, 18, 24, 12, 8, 6, 8, 2, 6],
  [30, 4, 22, 14, 4, 12, 4, 8, 2],
];

const ROULETTE = 1.1;
const BOX_RESPAWN = 4;
const MAX_BANANAS = 18;
const MAX_ACORNS = 8;

export class ItemSystem {
  readonly boxes: ItemBox[] = [];
  readonly bananas: Banana[] = [];
  readonly acorns: Acorn[] = [];
  readonly ladybugs: Ladybug[] = [];
  readonly puddles: Puddle[] = [];
  readonly events: ItemEvent[] = [];
  enabled = true;

  reset(): void {
    this.boxes.length = 0;
    this.bananas.length = 0;
    this.acorns.length = 0;
    this.ladybugs.length = 0;
    this.puddles.length = 0;
    this.events.length = 0;
    if (!this.enabled) return;
    for (const s of track.itemRows) {
      const hw = track.halfWidth(s);
      for (const k of [-0.56, -0.19, 0.19, 0.56]) {
        const d = k * hw * 1.05;
        const pos = track.toWorld(s, d, new THREE.Vector3());
        pos.y += 1.3;
        this.boxes.push({ s, d, pos, respawn: 0 });
      }
    }
  }

  private emit(type: ItemEventType, racer: number, kind: ItemKind | null, pos: THREE.Vector3): void {
    if (this.events.length < 32) this.events.push({ type, racer, kind, pos: pos.clone() });
  }

  /** Roulette countdowns and item use. Runs before physics so a mushroom fires this step. */
  preStep(dt: number, racers: RacerBody[], intents: Intent[], rank: number[], rng: () => number): void {
    for (let i = 0; i < racers.length; i += 1) {
      const r = racers[i];
      if (r.itemRoulette > 0) {
        r.itemRoulette -= dt;
        if (r.itemRoulette <= 0) {
          r.itemRoulette = 0;
          r.item = this.roll(rank[i], rng);
          this.emit('got', i, r.item, r.pos);
        }
        continue;
      }
      if (!intents[i].useItem || !r.item || r.frozen || r.spinOut > 0) continue;
      const kind = r.item;
      r.item = null;
      this.use(i, kind, racers, rank);
      this.emit('use', i, kind, r.pos);
    }
  }

  private roll(rank: number, rng: () => number): ItemKind {
    const band = rank === 0 ? 0 : rank <= 2 ? 1 : 2;
    const w = ODDS[band];
    let total = 0;
    for (const x of w) total += x;
    let pick = rng() * total;
    for (let k = 0; k < KINDS.length; k += 1) {
      pick -= w[k];
      if (pick <= 0) return KINDS[k];
    }
    return KINDS[KINDS.length - 1];
  }

  private use(i: number, kind: ItemKind, racers: RacerBody[], rank: number[]): void {
    const r = racers[i];
    switch (kind) {
      case 'mushroom':
        r.useMushroom();
        break;
      case 'slime':
        r.superSlime = 5;
        r.slime = 1;
        break;
      case 'shield':
        r.shield = 10;
        break;
      case 'giant':
        r.giant = 6;
        r.emit('giant', 0);
        break;
      case 'ladybug': {
        // Flies after the leader (or the snail in second if you lead).
        let target = -1;
        for (let k = 0; k < racers.length; k += 1) if (k !== i && !racers[k].finished && !racers[k].inactive && rank[k] === (rank[i] === 0 ? 1 : 0)) target = k;
        if (target >= 0) this.ladybugs.push({ pos: r.pos.clone(), s: r.s, d: r.d, owner: i, target, age: 0 });
        break;
      }
      case 'banana':
      case 'web':
      case 'honey': {
        const phi = track.heading(r.s);
        const sp = r.speed;
        const bx = sp > 1 ? r.vel.x / sp : Math.sin(phi);
        const bz = sp > 1 ? r.vel.z / sp : -Math.cos(phi);
        const pos = new THREE.Vector3(r.pos.x - bx * 1.6, 0, r.pos.z - bz * 1.6);
        const pr = { s: 0, d: 0 };
        track.project(pos.x, pos.z, -1, pr);
        pos.y = track.height(pr.s, pr.d) + 0.12;
        if (kind === 'honey') {
          if (this.puddles.length >= 6) this.puddles.shift();
          this.puddles.push({ pos, s: pr.s, d: pr.d, owner: i, age: 0 });
          break;
        }
        if (this.bananas.length >= MAX_BANANAS) this.bananas.shift();
        this.bananas.push({ kind, pos, s: pr.s, d: pr.d, owner: i, age: 0, yaw: r.heading });
        break;
      }
      case 'acorn': {
        // Aim at the snail directly ahead in the standings.
        let target = -1;
        for (let k = 0; k < racers.length; k += 1) if (rank[k] === rank[i] - 1 && !racers[k].finished) target = k;
        const fwd = Math.max(0, r.vel.x * Math.sin(track.heading(r.s)) - r.vel.z * Math.cos(track.heading(r.s)));
        if (this.acorns.length >= MAX_ACORNS) this.acorns.shift();
        this.acorns.push({ pos: r.pos.clone(), s: r.s + 1.4, d: r.d, vs: Math.max(30, fwd + 18), owner: i, age: 0, target });
        break;
      }
    }
  }

  /** Pickups, projectiles and hits. Runs after physics. */
  postStep(dt: number, racers: RacerBody[]): void {
    for (const b of this.boxes) if (b.respawn > 0) b.respawn = Math.max(0, b.respawn - dt);

    for (let i = 0; i < racers.length; i += 1) {
      const r = racers[i];
      if (r.frozen || r.finished) continue;
      // Item boxes.
      for (const b of this.boxes) {
        if (b.respawn > 0 || Math.abs(track.rel(b.s, r.s)) > 3) continue;
        if (r.pos.distanceToSquared(b.pos) < 2.0 * 2.0) {
          b.respawn = BOX_RESPAWN;
          this.emit('pickup', i, null, b.pos);
          if (!r.item && r.itemRoulette <= 0) r.itemRoulette = ROULETTE;
        }
      }
      // Banana peels.
      for (let k = this.bananas.length - 1; k >= 0; k -= 1) {
        const ban = this.bananas[k];
        if (Math.abs(track.rel(ban.s, r.s)) > 3) continue;
        if (ban.owner === i && ban.age < 0.6) continue;
        if (r.pos.distanceToSquared(ban.pos) < (ban.kind === 'web' ? 1.6 : 1.0)) {
          const hit = ban.kind === 'web' ? r.catchWeb() : r.hitBy('banana');
          this.emit(hit ? 'hit' : 'blocked', i, ban.kind, ban.pos);
          this.bananas.splice(k, 1);
        }
      }
      // Honey puddles.
      for (const pd of this.puddles) {
        if (pd.owner === i && pd.age < 1) continue;
        if (Math.abs(track.rel(pd.s, r.s)) > HONEY_R + 1) continue;
        const dx = r.pos.x - pd.pos.x;
        const dz = r.pos.z - pd.pos.z;
        if (dx * dx + dz * dz < HONEY_R * HONEY_R && r.airTime < 0.1) {
          if (r.sticky <= 0) this.emit('hit', i, 'honey', r.pos);
          r.sticky = 0.15;
        }
      }
    }
    for (const ban of this.bananas) ban.age += dt;
    for (let k = this.puddles.length - 1; k >= 0; k -= 1) {
      this.puddles[k].age += dt;
      if (this.puddles[k].age > HONEY_LIFE) this.puddles.splice(k, 1);
    }

    // Ladybugs fly along the course above the track until they catch their target.
    for (let k = this.ladybugs.length - 1; k >= 0; k -= 1) {
      const lb = this.ladybugs[k];
      lb.age += dt;
      const t = racers[lb.target];
      let dead = lb.age > 14 || !t || t.finished;
      if (!dead) {
        const gap = track.rel(t.s, lb.s);
        const speed = Math.max(42, t.speed + 14);
        lb.s = track.wrap(lb.s + Math.min(Math.max(gap, -2), speed * dt));
        lb.d += Math.max(-10 * dt, Math.min(10 * dt, t.d - lb.d));
        track.toWorld(lb.s, lb.d, lb.pos);
        // Hover above the ground, swoop down when close.
        lb.pos.y = Math.max(lb.pos.y + 2.2 * Math.min(1, Math.abs(gap) / 12), t.pos.y - 0.2) + 0.4;
        if (Math.abs(gap) < 2.5 && t.pos.distanceToSquared(lb.pos) < 6) {
          const hit = t.hitBy('ladybug');
          this.emit(hit ? 'hit' : 'blocked', lb.target, 'ladybug', t.pos);
          dead = true;
        }
      }
      if (dead) this.ladybugs.splice(k, 1);
    }

    // Acorns roll along the course, home gently on their target, break on whatever they hit.
    for (let k = this.acorns.length - 1; k >= 0; k -= 1) {
      const a = this.acorns[k];
      a.age += dt;
      a.s += a.vs * dt;
      const t = a.target >= 0 ? racers[a.target] : null;
      const hw = track.halfWidth(a.s);
      if (t && !t.finished && track.rel(t.s, a.s) > -3) a.d += Math.max(-8 * dt, Math.min(8 * dt, t.d - a.d));
      a.d = Math.max(-hw - 1, Math.min(hw + 1, a.d));
      track.toWorld(a.s, a.d, a.pos);
      a.pos.y += 0.5;
      a.s = track.wrap(a.s);
      let dead = a.age > 3.5;
      if (!dead) {
        for (const o of track.obstaclesNear(a.s)) {
          if (o.kind === 'rail' || o.kind === 'post') continue;
          if (Math.abs(track.rel(o.s, a.s)) < o.r + 0.4 && Math.abs(o.d - a.d) < o.r + 0.4 && o.kind !== 'root') dead = true;
        }
      }
      if (!dead) {
        for (let b = this.bananas.length - 1; b >= 0; b -= 1) {
          if (this.bananas[b].pos.distanceToSquared(a.pos) < 1.2) {
            this.bananas.splice(b, 1);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let i = 0; i < racers.length; i += 1) {
          const r = racers[i];
          if ((i === a.owner && a.age < 0.5) || r.finished) continue;
          if (r.pos.distanceToSquared(a.pos) < (TUNE.radius + 0.6) ** 2) {
            const hit = r.hitBy('acorn');
            this.emit(hit ? 'hit' : 'blocked', i, 'acorn', a.pos);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this.emit('acornBreak', a.owner, 'acorn', a.pos);
        this.acorns.splice(k, 1);
      }
    }
  }
}
