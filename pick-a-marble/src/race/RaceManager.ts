import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import { getSkin } from '../marbles/MarbleSkins';
import type { MarbleManager, RaceMarble } from '../marbles/MarbleManager';
import { DT, GRAVITY } from '../physics/PhysicsWorld';
import type { TrackView } from '../scene/TrackView';
import { getBuild } from '../track/PieceRegistry';
import { pieceMatrix, trackBounds } from '../track/Track';
import type { TrackData } from '../track/types';
import { CameraManager, type CamContext } from './CameraManager';
import type { Effects } from './Effects';
import { RaceSim } from './RaceSim';

export interface RaceConfig {
  track: TrackData;
  marbles: RaceMarble[];
  seed: number;
  picked: number;
  demo?: boolean;
  /** Online role: guests follow host snapshots. */
  online?: 'host' | 'guest';
}

export interface RankRow {
  index: number;
  name: string;
  skin: string;
  time: number | null;
  dnf: boolean;
  falls: number;
  place: number;
  remaining: number;
  speed: number;
}

export interface RaceResult {
  rows: RankRow[];
  duration: number;
  winner: number;
  picked: number;
  pickedPlace: number | null;
  finished: number;
  totalFalls: number;
  maxLoops: number;
  maxJumps: number;
  funnelsTraversed: number;
  splitRoutesUsed: number;
  seed: number;
  usedPieces: string[];
}

export interface RaceCallbacks {
  countdown?: (n: number) => void;
  go?: () => void;
  finish?: (marble: number, place: number, time: number) => void;
  fall?: (marble: number, eliminated: boolean) => void;
  done?: (result: RaceResult) => void;
}

export class RaceManager {
  sim: RaceSim | null = null;
  config: RaceConfig | null = null;
  state: 'idle' | 'countdown' | 'running' | 'finished' = 'idle';
  paused = false;
  speed = 1;
  private acc = 0;
  private countdownT = 0;
  private lastCount = 4;
  private prevVel: THREE.Vector3[] = [];
  private boostCooldown = new Map<string, number>();
  private finishPos: THREE.Vector3 | null = null;
  private finishDir: THREE.Vector3 | null = null;
  private bounds = new THREE.Box3();
  private doneFired = false;
  private time = 0;
  callbacks: RaceCallbacks = {};
  result: RaceResult | null = null;

  constructor(
    private readonly marbles: MarbleManager,
    private readonly trackView: TrackView,
    private readonly effects: Effects,
    readonly cameras: CameraManager,
    private readonly audio: AudioManager,
  ) {}

  start(cfg: RaceConfig): void {
    this.stop();
    this.config = cfg;
    const pieces = cfg.track.pieces;
    this.sim = new RaceSim(pieces, { seed: cfg.seed, marbles: cfg.marbles.length });
    this.sim.follower = cfg.online === 'guest';
    this.marbles.build(cfg.marbles);
    this.marbles.picked = cfg.picked;
    this.marbles.selected = -1;
    this.prevVel = cfg.marbles.map(() => new THREE.Vector3());
    this.state = 'countdown';
    this.countdownT = cfg.demo ? 0.6 : 3.4;
    this.lastCount = 4;
    this.acc = 0;
    this.time = 0;
    this.doneFired = false;
    this.result = null;
    this.paused = false;
    this.bounds = trackBounds(cfg.track);
    const fin = pieces.find((p) => p.t === 'finish');
    if (fin) {
      const m = pieceMatrix(fin);
      const fx = getBuild('finish').finishX ?? 2;
      this.finishPos = new THREE.Vector3(fx, 0.3, 0).applyMatrix4(m);
      this.finishDir = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(m));
    } else {
      this.finishPos = null;
      this.finishDir = null;
    }
    this.trackView.setLights(0, false);
    this.syncVisuals();
    this.marbles.resetTrails();
    this.effects.clear();
    if (!cfg.demo) this.cameras.beginRace();
  }

  stop(): void {
    this.sim?.dispose();
    this.sim = null;
    this.state = 'idle';
    this.marbles.clear();
    this.audio.rolling(0, 0);
    this.trackView.setLights(0, false);
  }

  restart(sameSeed: boolean): void {
    if (!this.config) return;
    const cfg = { ...this.config, seed: sameSeed ? this.config.seed : (this.config.seed * 16807 + 12345) % 2147483647 };
    this.start(cfg);
  }

  update(dt: number): void {
    if (!this.sim || this.paused) {
      this.audio.rolling(0, 0);
      return;
    }
    const cfg = this.config as RaceConfig;
    if (this.state === 'countdown') {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT);
      if (!cfg.demo && n !== this.lastCount && n >= 1 && n <= 3) {
        this.lastCount = n;
        this.callbacks.countdown?.(n);
        this.audio.countdown(false);
        this.trackView.setLights(4 - n, false);
      }
      if (this.countdownT <= 0) {
        this.state = 'running';
        this.sim.go();
        this.trackView.setLights(3, true);
        if (!cfg.demo) {
          this.callbacks.go?.();
          this.audio.countdown(true);
          this.audio.gate();
        }
      }
      // keep the physics world ticking so movers animate
      this.stepPhysics(dt);
    } else if (this.state === 'running' || this.state === 'finished') {
      this.stepPhysics(dt * this.speed);
      this.time = this.sim.time;
    }
    this.syncVisuals();
    this.processEvents();
    this.updateAudio(dt);
  }

  private stepPhysics(dt: number): void {
    if (!this.sim) return;
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= DT && steps < 24) {
      this.sim.step();
      this.acc -= DT;
      steps += 1;
    }
  }

  private syncVisuals(): void {
    const sim = this.sim;
    if (!sim) return;
    sim.physics.marbles.forEach((b, i) => {
      this.marbles.sync(i, b.translation(), b.rotation(), b.isEnabled());
    });
  }

  moverPose = (pieceId: number, index: number): { pos: THREE.Vector3; quat: THREE.Quaternion } | null => {
    if (!this.sim) return null;
    let k = 0;
    for (const m of this.sim.physics.movers) {
      if (m.pieceId !== pieceId) continue;
      if (k === index) return { pos: m.worldPos, quat: m.worldQuat };
      k += 1;
    }
    return null;
  };

  /** Guest: apply authoritative host state. */
  applyRemote(snap: { t: number; m: number[] }): void {
    if (!this.sim || this.config?.online !== 'guest') return;
    if (this.state === 'countdown') {
      // host already released the marbles: catch up now
      this.countdownT = 0;
      this.update(0);
    }
    this.sim.applySnapshot(snap);
    this.time = this.sim.time;
  }

  /** Guest: finish with the host's official result. */
  finishRemote(result: RaceResult): void {
    if (!this.sim || this.doneFired) return;
    this.sim.forceDone();
    this.doneFired = true;
    this.state = 'finished';
    this.result = { ...result, picked: this.config?.picked ?? result.picked, pickedPlace: (() => {
      const row = result.rows.find((r) => r.index === this.config?.picked);
      return row && !row.dnf ? row.place : null;
    })() };
    this.callbacks.done?.(this.result);
  }

  get gateOpen(): number {
    return this.sim?.physics.gateOpen ?? 0;
  }

  private processEvents(): void {
    const sim = this.sim;
    if (!sim) return;
    const cfg = this.config as RaceConfig;
    const demo = !!cfg.demo;
    const camPos = this.cameras.camera.position;
    for (const e of sim.events.splice(0)) {
      if (e.type === 'finish') {
        const skin = getSkin(cfg.marbles[e.marble].skin);
        const p = this.marbles.position(e.marble)?.clone() ?? new THREE.Vector3();
        if (!demo) {
          this.audio.finish(e.place);
          this.effects.burst(p, skin.colors[0], 18, 5);
          if (e.place === 1) {
            this.effects.celebrate(p);
            this.audio.victory();
          }
        }
        this.callbacks.finish?.(e.marble, e.place, e.time);
      } else if (e.type === 'fall') {
        if (!demo) this.audio.fall();
        this.callbacks.fall?.(e.marble, e.eliminated);
      } else if (e.type === 'zone') {
        const near = e.pos.distanceTo(camPos) < 60;
        const key = `${e.pieceId}:${e.effect}`;
        const now = sim.time;
        const cool = this.boostCooldown.get(key) ?? -1;
        if (e.effect === 'boost' || e.effect === 'kick') {
          const v = sim.states[e.marble].vel.clone().normalize();
          for (let k = 0; k < 6; k += 1) this.effects.trail(e.pos, v, '#00f5d4');
          if (near && !demo && now - cool > 0.25) {
            this.audio.boost();
            this.boostCooldown.set(key, now);
          }
        } else if (e.effect === 'launch') {
          if (e.sfx === 'cannon') {
            this.trackView.fireCannon(e.pieceId);
            this.effects.smoke(e.pos);
            if (near && !demo) this.audio.cannon();
          } else if (e.sfx === 'bounce') {
            this.trackView.bouncePad(e.pieceId);
            this.effects.burst(e.pos, '#ff006e', 8, 3);
            if (near && !demo) this.audio.bounce();
          } else {
            this.effects.burst(e.pos, '#ffbe0b', 6, 3, 0.25);
            if (near && !demo && now - cool > 0.12) {
              this.audio.jump();
              this.boostCooldown.set(key, now);
            }
          }
        } else if (e.effect === 'loop' || e.effect === 'jump') {
          this.effects.burst(e.pos, '#ffffff', 5, 2, 0.2);
        }
      } else if (e.type === 'done') {
        if (!this.doneFired) {
          this.doneFired = true;
          this.state = 'finished';
          this.result = this.buildResult();
          this.callbacks.done?.(this.result);
        }
      }
    }
  }

  private updateAudio(dt: number): void {
    const sim = this.sim;
    if (!sim || this.config?.demo) {
      this.audio.rolling(0, 0);
      return;
    }
    const camPos = this.cameras.camera.position;
    let roll = 0;
    let spd = 0;
    sim.states.forEach((s, i) => {
      if (s.dnf) return;
      const d = s.pos.distanceTo(camPos);
      const att = 1 / (1 + d * 0.06);
      roll += Math.min(1, s.speed / 12) * att;
      spd = Math.max(spd, s.speed);
      // impact detection from velocity change (gravity removed)
      const prev = this.prevVel[i];
      const dv = new THREE.Vector3().subVectors(s.vel, prev);
      dv.y += GRAVITY * dt;
      const mag = dv.length();
      if (mag > 3.2 && dt > 0 && this.state === 'running') {
        const glassy = sim.states.some((o, j) => j !== i && !o.dnf && o.pos.distanceTo(s.pos) < 0.62);
        const strength = Math.min(1, (mag - 3) / 12) * att * 1.6;
        if (strength > 0.05) {
          this.audio.clack(strength, glassy);
          if (mag > 9 && d < 35) this.effects.sparks(s.pos, strength);
        }
      }
      prev.copy(s.vel);
    });
    this.audio.rolling(Math.min(1, roll / 3), Math.min(1, spd / 20));
  }

  camContext(selected: number): CamContext | null {
    const sim = this.sim;
    if (!sim) return null;
    const order = sim.states
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((s) => s.index);
    const leader = order.find((i) => !sim.states[i].finished && !sim.states[i].dnf) ?? order[0];
    return {
      positions: sim.states.map((s) => s.pos),
      velocities: sim.states.map((s) => s.vel),
      active: sim.states.map((s) => !s.dnf),
      leader: leader ?? 0,
      selected,
      order,
      leaderRemaining: leader !== undefined ? sim.states[leader].remaining : 99,
      finishPos: this.finishPos,
      finishDir: this.finishDir,
      bounds: this.bounds,
    };
  }

  rankings(): RankRow[] {
    const sim = this.sim;
    const cfg = this.config;
    if (!sim || !cfg) return [];
    return sim.states
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((s) => ({
        index: s.index,
        name: cfg.marbles[s.index].name,
        skin: cfg.marbles[s.index].skin,
        time: s.finished ? s.finishTime : null,
        dnf: s.dnf,
        falls: s.falls,
        place: s.rank + 1,
        remaining: s.remaining,
        speed: s.speed,
      }));
  }

  get raceTime(): number {
    return this.time;
  }

  get totalLength(): number {
    return this.sim?.graph.totalLength ?? 0;
  }

  private buildResult(): RaceResult {
    const sim = this.sim as RaceSim;
    const cfg = this.config as RaceConfig;
    const rows = this.rankings();
    const picked = cfg.picked;
    const pickedRow = rows.find((r) => r.index === picked);
    // splitter routes used by finishers
    const splitLanes = new Map<number, Set<number>>();
    for (const s of sim.states) {
      if (!s.finished) continue;
      for (const li of s.lanes) {
        const lane = sim.graph.lanes[li];
        if (lane.defId !== 'splitter') continue;
        const set = splitLanes.get(lane.pieceId) ?? new Set<number>();
        set.add(li);
        splitLanes.set(lane.pieceId, set);
      }
    }
    let routes = 0;
    for (const set of splitLanes.values()) routes = Math.max(routes, set.size);
    const used = new Set<string>();
    for (const s of sim.states) for (const li of s.lanes) used.add(sim.graph.lanes[li].defId);
    return {
      rows,
      duration: sim.time,
      winner: rows[0]?.index ?? 0,
      picked,
      pickedPlace: pickedRow && !pickedRow.dnf ? pickedRow.place : null,
      finished: sim.states.filter((s) => s.finished).length,
      totalFalls: sim.states.reduce((a, s) => a + s.falls, 0),
      maxLoops: Math.max(0, ...sim.states.map((s) => s.loops)),
      maxJumps: Math.max(0, ...sim.states.map((s) => s.jumps)),
      funnelsTraversed: Math.max(0, ...sim.states.map((s) => s.funnels)),
      splitRoutesUsed: routes,
      seed: cfg.seed,
      usedPieces: [...used],
    };
  }
}
