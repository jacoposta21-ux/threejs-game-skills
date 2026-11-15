import * as THREE from 'three';
import { TUNE, type RacerBody } from '../physics/RacerBody';
import { track, type CritterKind } from '../world/Track';

/**
 * Insect hazards that move across the course. Their motion is a pure function of
 * race time, so the AI can read where they are and headless runs stay deterministic.
 *
 *   ants        — a marching column crossing the course; bumping one makes you stumble
 *   pillbug     — a woodlouse curled into a ball, rolling side to side
 *   beetle      — a big rhino beetle wandering about
 *   grasshopper — hops across in long arcs; only dangerous near the ground
 */

export interface CritterBody {
  kind: CritterKind;
  s: number;
  d: number;
  /** Height of the body centre above the ground. */
  lift: number;
  pos: THREE.Vector3;
  yaw: number;
  r: number;
  /** Pillbug roll angle, grasshopper hop phase, ant leg phase. */
  anim: number;
  /** Predicted lateral position a moment ahead, for the AI. */
  dAhead: number;
}

export interface CritterEvent {
  racer: number;
  kind: CritterKind;
  pos: THREE.Vector3;
}

function tri(x: number): number {
  // Triangle wave in [-1, 1] with period 2.
  const m = ((x % 2) + 2) % 2;
  return m < 1 ? m * 2 - 1 : 3 - m * 2;
}

export class CritterSystem {
  readonly bodies: CritterBody[] = [];
  readonly events: CritterEvent[] = [];
  private specIndex: number[] = [];

  reset(): void {
    this.bodies.length = 0;
    this.events.length = 0;
    this.specIndex = [];
    track.critters.forEach((spec, si) => {
      const n = spec.kind === 'ants' ? spec.count : 1;
      for (let k = 0; k < n; k += 1) {
        const r = spec.kind === 'ants' ? 0.42 : spec.kind === 'pillbug' ? 0.85 : spec.kind === 'beetle' ? 1.2 : 0.75;
        this.bodies.push({ kind: spec.kind, s: spec.s, d: 0, lift: r, pos: new THREE.Vector3(), yaw: 0, r, anim: 0, dAhead: 0 });
        this.specIndex.push(si);
      }
    });
    this.place(0);
  }

  private place(t: number): void {
    const counters = new Map<number, number>();
    this.bodies.forEach((b, bi) => {
      const si = this.specIndex[bi];
      const spec = track.critters[si];
      const k = counters.get(si) ?? 0;
      counters.set(si, k + 1);
      const hw = track.halfWidth(spec.s);
      const W = hw + 6;
      const phi = track.heading(spec.s);
      const ph = spec.phase;
      let yawLocal = 0;
      switch (b.kind) {
        case 'ants': {
          const dir = si % 2 ? 1 : -1;
          const speed = 2.2;
          // Little platoons of three with a snail-sized gap between them.
          const off = k * 1.4 + Math.floor(k / 3) * 6.5 + ph * 10;
          const u = (((t * speed + off) % (2 * W)) + 2 * W) % (2 * W);
          b.d = dir > 0 ? -W + u : W - u;
          b.dAhead = b.d + dir * speed * 0.8;
          b.s = spec.s + Math.sin(k * 1.7) * 0.7;
          b.lift = 0.25;
          b.anim = t * 14 + k;
          yawLocal = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          break;
        }
        case 'pillbug': {
          const w = 0.9;
          b.d = (hw - 1.5) * Math.sin(t * w + ph * 5);
          b.dAhead = (hw - 1.5) * Math.sin((t + 0.8) * w + ph * 5);
          b.s = spec.s;
          b.lift = b.r;
          b.anim = b.d / b.r;
          yawLocal = Math.cos(t * w + ph * 5) >= 0 ? Math.PI / 2 : -Math.PI / 2;
          break;
        }
        case 'beetle': {
          const a = t * 0.35 + ph * 3;
          b.d = hw * 0.55 * Math.sin(a);
          b.dAhead = hw * 0.55 * Math.sin(a + 0.28);
          b.s = spec.s + 8 * Math.sin(t * 0.23 + ph);
          b.lift = 0.55;
          b.anim = t * 6;
          const vd = Math.cos(a) * 0.35 * hw * 0.55;
          const vs = 8 * 0.23 * Math.cos(t * 0.23 + ph);
          yawLocal = Math.atan2(vd, vs);
          break;
        }
        case 'grasshopper': {
          const period = 1.6;
          const tt = t + ph * 3;
          const c = Math.floor(tt / period);
          const f = tt / period - c;
          const step = 0.4;
          const d0 = tri(c * step) * W;
          const d1 = tri((c + 1) * step) * W;
          const hop = Math.min(1, f / 0.47);
          b.d = d0 + (d1 - d0) * (f < 0.47 ? hop : 1);
          b.dAhead = d1;
          b.s = spec.s;
          b.lift = 0.45 + (f < 0.47 ? 4 * 2.6 * hop * (1 - hop) : 0);
          b.anim = f;
          yawLocal = d1 >= d0 ? Math.PI / 2 : -Math.PI / 2;
          break;
        }
      }
      track.toWorld(b.s, b.d, b.pos);
      b.pos.y += b.lift;
      b.yaw = phi + yawLocal;
    });
  }

  update(t: number, racers: RacerBody[]): void {
    this.place(t);
    const R = TUNE.radius;
    for (let i = 0; i < racers.length; i += 1) {
      const r = racers[i];
      if (r.frozen || r.finished || r.cannon > 0 || r.critterCooldown > 0) continue;
      for (const b of this.bodies) {
        if (Math.abs(track.rel(b.s, r.s)) > 3) continue;
        if (b.kind === 'grasshopper' && b.lift > 1.1) continue;
        const min = b.r + R;
        if (r.pos.distanceToSquared(b.pos) > min * min) continue;
        const hit = r.hitBy(b.kind === 'ants' ? 'ant' : 'bug');
        r.critterCooldown = 1.2;
        if (hit && b.kind !== 'ants') {
          // Knock the snail away from the bug.
          const dx = r.pos.x - b.pos.x;
          const dz = r.pos.z - b.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          r.vel.x += (dx / len) * 5;
          r.vel.z += (dz / len) * 5;
        }
        if (this.events.length < 16) this.events.push({ racer: i, kind: b.kind, pos: b.pos.clone() });
        break;
      }
    }
  }
}
