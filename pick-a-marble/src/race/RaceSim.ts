import * as THREE from 'three';
import { getBuild } from '../track/PieceRegistry';
import { pieceMatrix } from '../track/Track';
import type { PieceData } from '../track/types';
import { createSeededRandom } from '../core/random';
import { DT, MARBLE_R, PhysicsWorld, type ZoneEvent } from '../physics/PhysicsWorld';
import { RaceGraph } from './RaceGraph';

export interface MarbleRaceState {
  index: number;
  finished: boolean;
  finishTime: number;
  dnf: boolean;
  falls: number;
  lane: number;
  sample: number;
  remaining: number;
  bestRemaining: number;
  lastImprove: number;
  nudges: number;
  offTrackTime: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  speed: number;
  loops: number;
  jumps: number;
  funnels: number;
  boosts: number;
  pieces: Set<number>;
  lastGood: { lane: number; sample: number };
  rank: number;
}

export type RaceEvent =
  | { type: 'finish'; marble: number; time: number; place: number }
  | { type: 'fall'; marble: number; eliminated: boolean; at: string }
  | { type: 'zone'; marble: number; effect: string; sfx?: string; pieceId: number; pos: THREE.Vector3 }
  | { type: 'nudge'; marble: number; at: string }
  | { type: 'done' };

export interface RaceSimOptions {
  seed: number;
  marbles: number;
  maxTime?: number;
  graceAfterWinner?: number;
}

const _p = new THREE.Vector3();

export class RaceSim {
  readonly physics: PhysicsWorld;
  readonly graph: RaceGraph;
  readonly states: MarbleRaceState[] = [];
  readonly events: RaceEvent[] = [];
  phase: 'ready' | 'running' | 'done' = 'ready';
  time = 0;
  steps = 0;
  finishOrder: number[] = [];
  firstFinishTime = -1;
  private rng: () => number;
  private spawnPoints: THREE.Vector3[] = [];
  readonly maxTime: number;
  readonly grace: number;

  constructor(
    readonly pieces: PieceData[],
    readonly opts: RaceSimOptions,
  ) {
    this.physics = new PhysicsWorld(pieces);
    this.graph = new RaceGraph(pieces);
    this.rng = createSeededRandom(opts.seed);
    this.maxTime = opts.maxTime ?? 240;
    this.grace = opts.graceAfterWinner ?? 30;
    const start = pieces.find((p) => p.t === 'start');
    if (start) {
      const m = pieceMatrix(start);
      this.spawnPoints = getBuild(start.t, !!start.m).spawns.map((s) => s.clone().applyMatrix4(m));
    }
    for (let i = 0; i < opts.marbles; i += 1) {
      const sp = this.spawnPoints[i] ?? new THREE.Vector3(i, 10, 0);
      const body = this.physics.addMarble(sp);
      body.setGravityScale(0, true);
      this.states.push({
        index: i,
        finished: false,
        finishTime: 0,
        dnf: false,
        falls: 0,
        lane: this.graph.startLane,
        sample: 0,
        remaining: this.graph.totalLength,
        bestRemaining: Infinity,
        lastImprove: 0,
        nudges: 0,
        offTrackTime: 0,
        pos: sp.clone(),
        vel: new THREE.Vector3(),
        speed: 0,
        loops: 0,
        jumps: 0,
        funnels: 0,
        boosts: 0,
        pieces: new Set(),
        lastGood: { lane: this.graph.startLane, sample: 0 },
        rank: i,
      });
    }
    this.locateAll();
  }

  /** Release the marbles. */
  go(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'running';
    this.physics.openGate();
    this.physics.marbles.forEach((b) => {
      b.setGravityScale(1, true);
      b.setLinvel({ x: (this.rng() - 0.5) * 0.3, y: 0, z: (this.rng() - 0.5) * 0.3 }, true);
    });
  }

  step(): void {
    const frozen = this.phase === 'ready';
    if (frozen) {
      this.physics.marbles.forEach((b, i) => {
        const sp = this.spawnPoints[i];
        if (sp) b.setTranslation({ x: sp.x, y: sp.y, z: sp.z }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      });
    }
    this.physics.step((e) => this.onZone(e), frozen || this.phase === 'done');
    this.steps += 1;
    if (this.phase !== 'running') {
      this.syncStates();
      return;
    }
    this.time += DT;
    this.syncStates();
    if (this.steps % 6 === 0) this.locateAll();
    this.checkRules();
  }

  private syncStates(): void {
    this.physics.marbles.forEach((b, i) => {
      const s = this.states[i];
      const t = b.translation();
      const v = b.linvel();
      s.pos.set(t.x, t.y, t.z);
      s.vel.set(v.x, v.y, v.z);
      s.speed = s.vel.length();
    });
  }

  private locateAll(): void {
    for (const s of this.states) {
      if (s.dnf) continue;
      const loc = this.graph.locate(s.pos, s.lane);
      if (!loc) continue;
      s.lane = loc.lane;
      s.sample = loc.sample;
      if (!s.finished) s.remaining = loc.remaining;
      if (loc.dist < 1.4) {
        s.lastGood = { lane: loc.lane, sample: loc.sample };
        s.pieces.add(this.graph.lanes[loc.lane].pieceId);
        s.offTrackTime = 0;
      }
      if (this.phase === 'running' && !s.finished && s.remaining < s.bestRemaining - 0.4) {
        s.bestRemaining = s.remaining;
        s.lastImprove = this.time;
        s.nudges = 0;
      }
    }
    this.rank();
  }

  rank(): void {
    const order = this.states.slice().sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      return a.remaining - b.remaining;
    });
    order.forEach((s, i) => (s.rank = i));
  }

  private onZone(e: ZoneEvent): void {
    const s = this.states[e.marble];
    if (!s || s.dnf) return;
    const eff = e.zone.zone.effect;
    const pos = s.pos.clone();
    if (eff.type === 'finish') {
      if (!s.finished && this.phase === 'running') {
        s.finished = true;
        s.finishTime = this.time;
        s.remaining = 0;
        this.finishOrder.push(s.index);
        if (this.firstFinishTime < 0) this.firstFinishTime = this.time;
        this.events.push({ type: 'finish', marble: s.index, time: this.time, place: this.finishOrder.length });
      }
      return;
    }
    if (eff.type === 'tag') {
      if (eff.tag === 'loop') s.loops += 1;
      if (eff.tag === 'jump') s.jumps += 1;
      if (eff.tag === 'funnel') s.funnels += 1;
      this.events.push({ type: 'zone', marble: s.index, effect: eff.tag, pieceId: e.zone.pieceId, pos });
      return;
    }
    if (eff.type === 'boost' || eff.type === 'kick') s.boosts += 1;
    this.events.push({ type: 'zone', marble: s.index, effect: eff.type, sfx: eff.type === 'launch' ? eff.sfx : undefined, pieceId: e.zone.pieceId, pos });
  }

  private checkRules(): void {
    for (let i = 0; i < this.states.length; i += 1) {
      const s = this.states[i];
      if (s.dnf || s.finished) continue;
      const body = this.physics.marbles[i];
      const loc = this.graph.lanes[s.lane];
      const lanePoint = loc ? loc.points[s.sample] : undefined;
      const distToLane = lanePoint ? _p.copy(s.pos).sub(lanePoint).length() : 99;
      const onPlatform = s.pos.y < MARBLE_R + 0.15 && distToLane > 1.6;
      if (s.pos.y < -12 || onPlatform || distToLane > 7) s.offTrackTime += DT;
      else if (distToLane < 2.5) s.offTrackTime = 0;
      const fell = s.pos.y < -12 || (onPlatform && s.offTrackTime > 0.4) || s.offTrackTime > 1.5;
      if (fell) {
        s.falls += 1;
        s.offTrackTime = 0;
        if (s.falls >= 3) {
          s.dnf = true;
          body.setEnabled(false);
          this.events.push({ type: 'fall', marble: i, eliminated: true, at: this.graph.lanes[s.lastGood.lane]?.defId ?? '?' });
        } else {
          const back = this.graph.pointBefore(s.lastGood.lane, s.lastGood.sample, 1.2);
          this.respawn(i, back.pos, back.dir, 3);
          this.events.push({ type: 'fall', marble: i, eliminated: false, at: this.graph.lanes[s.lastGood.lane]?.defId ?? '?' });
        }
        continue;
      }
      // stuck detection
      const def = this.graph.lanes[s.lane]?.defId ?? '';
      const patient = (def.startsWith('funnel') || def === 'half_pipe') && s.speed > 1.2;
      if (this.time - s.lastImprove > (patient ? 14 : 4.5)) {
        s.lastImprove = this.time;
        s.nudges += 1;
        if (s.nudges <= 2) {
          const ahead = this.graph.pointAhead(s.lane, s.sample, 0.6);
          body.setLinvel({ x: ahead.dir.x * 7, y: ahead.dir.y * 7 + 2.5, z: ahead.dir.z * 7 }, true);
        } else {
          const ahead = this.graph.pointAhead(s.lane, s.sample, 3.5);
          this.respawn(i, ahead.pos, ahead.dir, 5);
          s.nudges = 0;
        }
        this.events.push({ type: 'nudge', marble: i, at: this.graph.lanes[s.lane]?.defId ?? '?' });
      }
    }
    const allDone = this.states.every((s) => s.finished || s.dnf);
    const timeUp = this.time > this.maxTime || (this.firstFinishTime >= 0 && this.time - this.firstFinishTime > this.grace);
    if (allDone || timeUp) {
      if (!allDone) for (const s of this.states) if (!s.finished) s.dnf = true;
      this.phase = 'done';
      this.rank();
      this.events.push({ type: 'done' });
    }
  }

  private respawn(i: number, pos: THREE.Vector3, dir: THREE.Vector3, speed: number): void {
    const body = this.physics.marbles[i];
    // lane points are floor points; lift to marble centre
    body.setTranslation({ x: pos.x, y: pos.y + 0.55, z: pos.z }, true);
    body.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.physics.resetInside(i);
  }

  /** Run headless until done or the time budget is spent. */
  runHeadless(maxSeconds = 200): void {
    this.go();
    const maxSteps = Math.ceil(maxSeconds / DT);
    for (let i = 0; i < maxSteps && this.phase !== 'done'; i += 1) this.step();
  }

  dispose(): void {
    this.physics.dispose();
  }
}
