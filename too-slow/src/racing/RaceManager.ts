import { AI_PROFILES, PLAYER_PROFILE, SnailAI, type RacerProfile } from '../ai/SnailAI';
import { emptyIntent, RacerBody, stepWorld, type Intent } from '../physics/RacerBody';
import { CHECKPOINTS, FINISH_S, GRID_S, track } from '../world/Track';
import { ItemSystem } from './Items';

export type RacePhase = 'grid' | 'countdown' | 'racing' | 'finished';

export const FIXED_DT = 1 / 120;
export const RACER_COUNT = 6;
export const COUNTDOWN_TIME = 3.6;

export interface RaceEvent {
  type: 'countdown' | 'go' | 'checkpoint' | 'overtake' | 'overtaken' | 'finish' | 'aiFinish';
  value: number;
  racer: number;
}

/**
 * Owns the six racers, the fixed-step simulation and all race rules.
 * Deliberately DOM-free so the same code runs in the browser and in the
 * headless simulation used for tuning (scripts/sim.ts).
 */
export class RaceManager {
  readonly racers: RacerBody[] = [];
  readonly profiles: RacerProfile[] = [PLAYER_PROFILE, ...AI_PROFILES];
  readonly ais: (SnailAI | null)[] = [];
  readonly intents: Intent[] = [];
  /** Racer indices sorted by current race position. */
  readonly order: number[] = [];
  readonly rank: number[] = [];
  readonly events: RaceEvent[] = [];
  readonly playerIntent: Intent = emptyIntent();
  /** When true the player's snail is driven by an AI (attract mode / bot playtests). */
  autopilot = false;
  private readonly autoAI = new SnailAI(PLAYER_PROFILE);
  phase: RacePhase = 'grid';
  time = 0;
  countdown = COUNTDOWN_TIME;
  private lastCount = 4;
  finishedCount = 0;
  private checkpointIndex: number[] = [];
  readonly items = new ItemSystem();
  private rng: () => number = Math.random;

  constructor() {
    for (let i = 0; i < RACER_COUNT; i += 1) {
      this.racers.push(new RacerBody(i));
      this.ais.push(i === 0 ? null : new SnailAI(this.profiles[i]));
      this.intents.push(emptyIntent());
      this.order.push(i);
      this.rank.push(i);
      this.checkpointIndex.push(0);
    }
  }

  get player(): RacerBody {
    return this.racers[0];
  }

  reset(rng: () => number): void {
    this.rng = rng;
    // Player starts mid-grid; the rest are shuffled around them.
    const slots = [0, 1, 2, 3, 4, 5];
    for (let i = slots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const playerSlot = slots.indexOf(2);
    [slots[0], slots[playerSlot]] = [slots[playerSlot], slots[0]];
    for (let i = 0; i < RACER_COUNT; i += 1) {
      this.racers[i].reset(GRID_S, (slots[i] - 2.5) * 2.7);
      this.ais[i]?.reset(rng);
      this.order[i] = i;
      this.rank[i] = i;
      this.checkpointIndex[i] = 0;
    }
    this.autoAI.reset(rng);
    this.phase = 'grid';
    this.time = 0;
    this.countdown = COUNTDOWN_TIME;
    this.lastCount = 4;
    this.finishedCount = 0;
    this.events.length = 0;
    this.items.reset();
    this.updateOrder(false);
  }

  startCountdown(): void {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_TIME;
    this.lastCount = 4;
  }

  /** Advance exactly one fixed step. */
  step(): void {
    const dt = FIXED_DT;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const count = Math.ceil(this.countdown - 0.6);
      if (count !== this.lastCount && count >= 1 && count <= 3) {
        this.lastCount = count;
        this.events.push({ type: 'countdown', value: count, racer: 0 });
      }
      if (this.countdown <= 0.6) {
        this.phase = 'racing';
        for (const r of this.racers) r.frozen = false;
        this.events.push({ type: 'go', value: 0, racer: 0 });
      }
    }
    if (this.phase === 'racing' || this.phase === 'finished') this.time += dt;

    const racing = this.phase === 'racing' || this.phase === 'finished';
    for (let i = 0; i < RACER_COUNT; i += 1) {
      const r = this.racers[i];
      const ai = i === 0 ? (this.autopilot || r.finished ? this.autoAI : null) : this.ais[i];
      if (ai) {
        const src = ai.update(dt, r, this.racers, this.time, this.items);
        Object.assign(this.intents[i], src);
        if (r.finished) this.coast(this.intents[i], r);
      } else {
        Object.assign(this.intents[i], this.playerIntent);
      }
    }
    // Edge-triggered inputs are consumed by exactly one step.
    this.playerIntent.toggleRoll = false;
    this.playerIntent.boost = false;
    this.playerIntent.useItem = false;

    if (racing && this.items.enabled) this.items.preStep(dt, this.racers, this.intents, this.rank, this.rng);
    stepWorld(this.racers, this.intents, dt);
    if (racing && this.items.enabled) this.items.postStep(dt, this.racers);

    if (racing) {
      for (let i = 0; i < RACER_COUNT; i += 1) this.checkProgress(i);
      this.updateOrder(true);
    }
  }

  /** After the line a snail pops out of its shell and trundles to a stop. */
  private coast(intent: Intent, r: RacerBody): void {
    intent.slide = false;
    intent.boost = false;
    intent.spin = 0;
    intent.useItem = false;
    intent.toggleRoll = r.mode !== 'crawl' && r.airTime < 0.07;
    intent.throttle = r.s > FINISH_S + 55 ? 0 : 0.6;
  }

  private checkProgress(i: number): void {
    const r = this.racers[i];
    if (r.finished) return;
    const next = CHECKPOINTS[this.checkpointIndex[i]];
    if (next !== undefined && r.s >= next && Math.abs(r.d) < track.halfWidth(r.s) + 6) {
      this.checkpointIndex[i] += 1;
      r.checkpointS = next;
      if (i === 0) this.events.push({ type: 'checkpoint', value: this.checkpointIndex[i], racer: 0 });
    }
    // The line must be physically crossed, on the course.
    if (r.s >= FINISH_S && Math.abs(r.d) < track.halfWidth(FINISH_S) + 4) {
      r.finished = true;
      r.finishTime = this.time;
      this.finishedCount += 1;
      this.events.push({ type: i === 0 ? 'finish' : 'aiFinish', value: this.finishedCount, racer: i });
      if (i === 0) this.phase = 'finished';
    }
  }

  private updateOrder(emit: boolean): void {
    const racers = this.racers;
    const before = this.rank[0];
    this.order.sort((a, b) => {
      const ra = racers[a];
      const rb = racers[b];
      if (ra.finished && rb.finished) return ra.finishTime - rb.finishTime;
      if (ra.finished) return -1;
      if (rb.finished) return 1;
      return rb.s - ra.s;
    });
    for (let p = 0; p < RACER_COUNT; p += 1) this.rank[this.order[p]] = p;
    if (emit && !racers[0].finished && this.time > 2) {
      if (this.rank[0] < before) this.events.push({ type: 'overtake', value: this.rank[0] + 1, racer: 0 });
      else if (this.rank[0] > before) this.events.push({ type: 'overtaken', value: this.rank[0] + 1, racer: 0 });
    }
  }

  /** Remaining distance to the line for the player. */
  get distanceToFinish(): number {
    return Math.max(0, FINISH_S - this.player.s);
  }
}
