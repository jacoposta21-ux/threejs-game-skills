import { AI_PROFILES, PLAYER_PROFILE, SnailAI, type RacerProfile } from '../ai/SnailAI';
import { emptyIntent, RacerBody, stepWorld, WORLD, type Intent } from '../physics/RacerBody';
import { CHECKPOINTS, START_S, track } from '../world/Track';
import { CritterSystem } from './Critters';
import { ItemSystem } from './Items';

export type RacePhase = 'grid' | 'countdown' | 'racing' | 'finished';

export const FIXED_DT = 1 / 120;
export const RACER_COUNT = 6;
export const COUNTDOWN_TIME = 3.6;

export type RaceMode = 'race' | 'gp' | 'tt' | 'tutorial' | 'duo' | 'daily';
export type Difficulty = 0 | 1 | 2;

export interface RaceEvent {
  type: 'countdown' | 'go' | 'checkpoint' | 'overtake' | 'overtaken' | 'finish' | 'aiFinish' | 'lap' | 'rain' | 'wind';
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
  /** Intents from the human players (index 0 = player one, 1 = player two in split-screen). */
  readonly playerIntents: Intent[] = [emptyIntent(), emptyIntent()];
  /** Racer indices driven by humans. */
  humans: number[] = [0];
  mode: RaceMode = 'race';
  /** The rival out to get the player this race (-1: none). */
  nemesis = -1;
  difficulty: Difficulty = 1;
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
  readonly critters = new CritterSystem();
  laps = 3;
  /** Race time when rain starts (-1: dry race). */
  rainAt = -1;
  /** 0 … 1, how hard it is raining now. */
  rain = 0;
  /** Base wind push on airborne snails (m/s²), gusting around this. */
  windX = 0;
  windZ = 0;
  /** Forced conditions (daily challenge, tests); null = decided per race. */
  forceWeather: 'rain' | 'wind' | 'clear' | null = null;
  /** Fixed lap count for special modes (0 = the track's own). */
  lapsOverride = 0;
  /** Player's lap times (seconds), filled as laps complete. */
  readonly lapTimes: number[] = [];
  private lapStart = 0;
  private readonly lapOf: number[] = [];
  private rng: () => number = Math.random;

  constructor() {
    for (let i = 0; i < RACER_COUNT; i += 1) {
      this.racers.push(new RacerBody(i));
      this.ais.push(i === 0 ? null : new SnailAI(this.profiles[i]));
      this.intents.push(emptyIntent());
      this.order.push(i);
      this.rank.push(i);
      this.checkpointIndex.push(0);
      this.lapOf.push(1);
    }
  }

  get player(): RacerBody {
    return this.racers[0];
  }

  get playerIntent(): Intent {
    return this.playerIntents[0];
  }

  /** Who races: time trials and the tutorial are solo, split-screen has two humans. */
  configure(mode: RaceMode, difficulty: Difficulty): void {
    this.mode = mode;
    this.difficulty = difficulty;
    this.humans = mode === 'duo' ? [0, 1] : [0];
    this.lapsOverride = mode === 'tutorial' ? 1 : 0;
  }

  isActive(i: number): boolean {
    return i === 0 || (this.mode !== 'tt' && this.mode !== 'tutorial');
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
      // Two staggered rows on the plateau, just behind the line.
      const row = slots[i] % 2;
      const r = this.racers[i];
      r.reset(START_S - 10 - row * 5, (slots[i] - 2.5) * 2.9);
      r.dist = -10 - row * 5;
      r.checkpointDist = r.dist;
      this.lapOf[i] = 1;
      this.ais[i]?.reset(rng, this.difficulty, i === this.nemesis && this.mode !== 'tt' && this.mode !== 'tutorial');
      r.inactive = !this.isActive(i);
      if (r.inactive) {
        // Parked far below the world: no collisions, no rank.
        r.pos.set(0, -5000 - i * 10, 0);
        r.prevPos.copy(r.pos);
        r.dist = -1e6;
      }
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
    this.items.nemesis = this.mode === 'tt' || this.mode === 'tutorial' ? -1 : this.nemesis;
    this.critters.reset();
    this.laps = this.lapsOverride || track.def.laps;
    this.lapTimes.length = 0;
    this.lapStart = 0;
    this.rollWeather(rng);
    this.updateOrder(false);
  }

  /** Garden tracks may cloud over and rain mid-race; open ones get gusty wind. Time trials stay calm. */
  private rollWeather(rng: () => number): void {
    const flora = track.def.theme.flora;
    const wetTrack = flora === 'garden' || flora === 'veggie' || flora === 'pond' || flora === 'glow';
    const a = rng();
    const b = rng();
    const c = rng();
    let kind = this.forceWeather ?? (this.mode === 'tt' || this.mode === 'tutorial' ? 'clear' : wetTrack ? (a < 0.35 ? 'rain' : a < 0.5 ? 'wind' : 'clear') : a < 0.55 ? 'wind' : 'clear');
    if (kind === 'rain' && !wetTrack && !this.forceWeather) kind = 'clear';
    this.rainAt = kind === 'rain' ? (this.forceWeather ? 8 : 25 + b * 45) : -1;
    this.rain = 0;
    const strength = kind === 'wind' ? 0.6 + c * 0.6 : 0;
    const ang = b * Math.PI * 2;
    this.windX = Math.cos(ang) * strength;
    this.windZ = Math.sin(ang) * strength;
    WORLD.wet = 0;
    WORLD.windX = 0;
    WORLD.windZ = 0;
  }

  get windy(): boolean {
    return this.windX !== 0 || this.windZ !== 0;
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
        for (const r of this.racers) r.frozen = r.inactive;
        this.events.push({ type: 'go', value: 0, racer: 0 });
      }
    }
    if (this.phase === 'racing' || this.phase === 'finished') {
      this.time += dt;
      if (this.rainAt >= 0) {
        if (this.rain === 0 && this.time >= this.rainAt) this.events.push({ type: 'rain', value: 0, racer: 0 });
        this.rain = Math.max(0, Math.min(1, (this.time - this.rainAt) / 8));
      }
      if (this.windy && this.time < dt * 1.5) this.events.push({ type: 'wind', value: 0, racer: 0 });
      // Gusts: the wind breathes in and out over a few seconds.
      const gust = 0.6 + 0.4 * Math.sin(this.time * 0.6) * Math.sin(this.time * 0.23 + 1);
      WORLD.windX = this.windX * gust;
      WORLD.windZ = this.windZ * gust;
      WORLD.wet = this.rain;
    }

    const racing = this.phase === 'racing' || this.phase === 'finished';
    for (let i = 0; i < RACER_COUNT; i += 1) {
      const r = this.racers[i];
      if (r.inactive) continue;
      const human = this.humans.indexOf(i);
      const ai = human < 0 ? this.ais[i] : (human === 0 && this.autopilot) || r.finished ? (i === 0 ? this.autoAI : this.ais[i]) : null;
      if (ai) {
        const src = ai.update(dt, r, this.racers, this.time, this.items, this.critters);
        Object.assign(this.intents[i], src);
        if (r.finished) this.coast(this.intents[i], r);
      } else {
        Object.assign(this.intents[i], this.playerIntents[human]);
      }
    }
    // Edge-triggered inputs are consumed by exactly one step.
    for (const pi of this.playerIntents) {
      pi.toggleRoll = false;
      pi.boost = false;
      pi.useItem = false;
    }

    if (racing && this.items.enabled) this.items.preStep(dt, this.racers, this.intents, this.rank, this.rng);
    stepWorld(this.racers, this.intents, dt);
    if (racing && this.items.enabled) this.items.postStep(dt, this.racers);
    if (racing) this.critters.update(this.time, this.racers);

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
    intent.throttle = r.dist > this.totalDist + 55 ? 0 : 0.6;
  }

  get totalDist(): number {
    return this.laps * track.length;
  }

  /** Unwrapped distance from the line to checkpoint number k (counting across laps). */
  private checkpointTarget(k: number): number {
    const per = CHECKPOINTS.length;
    const lap = Math.floor(k / per);
    return lap * track.length + track.wrap(CHECKPOINTS[k % per] - START_S);
  }

  private checkProgress(i: number): void {
    const r = this.racers[i];
    if (r.finished) return;
    const per = CHECKPOINTS.length;
    const k = this.checkpointIndex[i];
    if (k < per * this.laps && r.dist >= this.checkpointTarget(k) && Math.abs(r.d) < track.halfWidth(r.s) + 6) {
      this.checkpointIndex[i] += 1;
      r.checkpointS = CHECKPOINTS[k % per];
      r.checkpointDist = this.checkpointTarget(k);
      if (this.humans.includes(i)) this.events.push({ type: 'checkpoint', value: this.checkpointIndex[i], racer: i });
    }
    // A lap only counts once every checkpoint of it has been passed: no infield cuts.
    const lap = Math.min(this.laps, Math.floor(Math.max(0, r.dist) / track.length) + 1);
    if (lap > this.lapOf[i] && this.checkpointIndex[i] >= (lap - 1) * per) {
      this.lapOf[i] = lap;
      if (i === 0) {
        this.lapTimes.push(this.time - this.lapStart);
        this.lapStart = this.time;
      }
      if (this.humans.includes(i)) this.events.push({ type: 'lap', value: lap, racer: i });
    }
    // The line must be physically crossed, on the course, after every checkpoint.
    if (r.dist >= this.totalDist && this.checkpointIndex[i] >= per * this.laps && Math.abs(r.d) < track.halfWidth(START_S) + 4) {
      r.finished = true;
      r.finishTime = this.time;
      this.finishedCount += 1;
      if (i === 0) this.lapTimes.push(this.time - this.lapStart);
      const human = this.humans.includes(i);
      this.events.push({ type: human ? 'finish' : 'aiFinish', value: this.finishedCount, racer: i });
      if (this.humans.every((h) => this.racers[h].finished)) this.phase = 'finished';
    }
  }

  lap(i: number): number {
    return this.lapOf[i];
  }

  private updateOrder(emit: boolean): void {
    const racers = this.racers;
    const before = this.humans.map((h) => this.rank[h]);
    this.order.sort((a, b) => {
      const ra = racers[a];
      const rb = racers[b];
      if (ra.inactive !== rb.inactive) return ra.inactive ? 1 : -1;
      if (ra.finished && rb.finished) return ra.finishTime - rb.finishTime;
      if (ra.finished) return -1;
      if (rb.finished) return 1;
      return rb.dist - ra.dist;
    });
    for (let p = 0; p < RACER_COUNT; p += 1) this.rank[this.order[p]] = p;
    if (!emit || this.time <= 2) return;
    this.humans.forEach((h, k) => {
      if (racers[h].finished) return;
      if (this.rank[h] < before[k]) this.events.push({ type: 'overtake', value: this.rank[h] + 1, racer: h });
      else if (this.rank[h] > before[k]) this.events.push({ type: 'overtaken', value: this.rank[h] + 1, racer: h });
    });
  }

  /** Number of snails actually racing. */
  get field(): number {
    return this.racers.filter((r) => !r.inactive).length;
  }

  /** Remaining distance to the line for the player. */
  get distanceToFinish(): number {
    return Math.max(0, this.totalDist - this.player.dist);
  }
}
