import { CONFIG, POWER_UNLOCK_RANK, type PowerId } from '../core/Config';
import type { CareerState } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

export const RANK_TITLES = [
  'Unpaid Intern',
  'Junior Miracle Assistant',
  'Cloud Department Employee',
  'Certified Demigod',
  'Regional Deity',
  'Senior God',
  'Director of Creation',
  'Supreme Cosmic Manager',
  "God's Replacement",
  'God of Questionable Decisions',
];

export const PROMOTION_LINES = [
  '',
  'CONGRATULATIONS! YOUR PERFORMANCE HAS BEEN QUESTIONABLE, BUT WE ARE SHORT-STAFFED.',
  'YOU NOW HAVE ACCESS TO THE CLOUD DEPARTMENT. PLEASE DO NOT TOUCH THE GOOD CLOUDS.',
  'CERTIFICATION COMPLETE. THE CERTIFICATE IS MADE OF LIGHTLY USED PARCHMENT.',
  'A WHOLE REGION. WE ARE AS SURPRISED AS YOU ARE.',
  'SENIORITY ACHIEVED. THIS COMES WITH A SLIGHTLY LARGER CLOUD.',
  'YOU MAY NOW DIRECT CREATION. PLEASE DIRECT IT SOMEWHERE SENSIBLE.',
  'SUPREME. COSMIC. MANAGER. NOBODY ELSE APPLIED.',
  "GOD HAS BEEN INFORMED. GOD SAID 'WHO?'",
  'I HAVE REVIEWED YOUR WORK. I WILL BE EXTENDING MY VACATION INDEFINITELY. — GOD',
];

/** What each rank unlocks (Career Mode). Shown in the career panel and the promotion toast. */
export const RANK_UNLOCKS: string[][] = [
  ['Rain, Lightning, Nature, Fire (after training)'],
  ['Tornado'],
  ['Freeze'],
  ['Gravity'],
  ['Terraform'],
  ['Time Warp'],
  ['Possession'],
  ['Meteor'],
  ['Resurrection'],
  ['Divine Overtime', 'Cosmic aura', 'Golden career badge', 'Monument of the Intern'],
];

export interface AwardOptions {
  /** Only ever award this key once. */
  once?: boolean;
  /** Diminishing returns: at most `max` awards of this key inside `window` seconds. */
  window?: number;
  max?: number;
}

export function rankForXp(xp: number): number {
  const t = CONFIG.career.thresholds;
  let r = 1;
  for (let i = 0; i < t.length; i++) if (xp >= t[i]) r = i + 1;
  return r;
}

export function defaultCareer(): CareerState {
  return { xp: 0, rank: 1, awarded: {}, promotions: [], overtimeUntil: 0, overtimeReadyAt: 0, usedPowers: [], finalReview: false };
}

/**
 * HEAVENLY CAREER. Divine Experience comes from meaningful, deduplicated events
 * (never from clicking the same spot). Both benevolent and chaotic play earn XP.
 * Creative Mode never awards XP (Career progress is a separate save).
 */
export class CareerSystem {
  constructor(private readonly sim: Simulation) {
    const bus = sim.bus;
    const near = (x: number, z: number, extra = 14) => {
      const { village, distance } = sim.nearestVillage(x, z);
      return village && distance < village.radius + extra ? village : null;
    };
    bus.on('PRAYER_COMPLETED', ({ prayer }) => {
      this.award(`prayer:${prayer.id}`, 25, 'Prayer answered', { once: true });
      if (prayer.type === 'THIRST' || prayer.type === 'HUNGER') this.award(`shortage:${prayer.id}`, 10, 'Shortage resolved', { once: true });
    });
    bus.on('CHALLENGE_COMPLETED', (e) => {
      const diff = sim.challenges.definitions.find((d) => d.id === e.id)?.difficulty ?? 'easy';
      this.award(`challenge:${e.id}`, diff === 'hard' ? 120 : diff === 'medium' ? 60 : 30, `Challenge: ${e.title}`, { once: true });
    });
    bus.on('SURREAL_EVENT', (e) => this.award(`surreal:${e.id}`, 40, `Discovered: ${e.title}`, { once: true }));
    bus.on('RELIGION_FOUNDED', (e) => this.award(`religion:${e.religion.id}`, 30, 'A religion was born', { once: true }));
    bus.on('SACRED_STAGE', (e) => {
      if (e.stage >= 3) this.award(`sacred:${e.sacred.id}:${e.stage}`, 15, 'Sacred site grew', { once: true });
    });
    bus.on('MONUMENT_COMPLETED', (e) => this.award(`monument:${e.sacredId}`, 40, 'Monument completed', { once: true }));
    bus.on('FIRE_EXTINGUISHED', (e) => {
      if (e.byRain && near(e.x, e.z, 12)) this.award('rescue', 4, 'Saved a village from fire', { window: 60, max: 5 });
    });
    bus.on('RELATIONSHIP_CHANGED', (e) => {
      const order = ['hostile', 'rival', 'neutral', 'friendly', 'allied'];
      if (order.indexOf(e.to) > order.indexOf(e.from)) this.award(`relation:${e.a}|${e.b}:${e.to}`, 20, 'Relations improved', { once: true });
    });
    bus.on('MIRACLE_WITNESSED', (e) => {
      if (e.witnesses >= 5) this.award('witnessed', 3, 'Miracle witnessed', { window: 120, max: 6 });
    });
    bus.on('POWER_USED', (e) => {
      const c = sim.state.career;
      if (!c.usedPowers.includes(e.power)) {
        c.usedPowers.push(e.power);
        this.award(`first-use:${e.power}`, 10, `First ${e.power}`, { once: true });
      }
    });
    bus.on('VILLAGER_RESURRECTED', (e) => this.award(`resurrect:${e.villagerId}`, 25, 'Saved a villager (late)', { once: true }));
    bus.on('FLOOD_STARTED', (e) => this.award(`flood:${e.villageId}`, 10, 'Caused a memorable flood', { once: true }));
    bus.on('CONSEQUENCE_TRIGGERED', (e) => this.award(`consequence:${e.id}`, 15, `Consequence: ${e.title}`, { window: 240, max: 1 }));
    bus.on('METEOR_IMPACT', () => this.award('meteor', 20, 'Spectacular impact', { window: 120, max: 1 }));
  }

  /** Per-step bookkeeping: the training bonus and rank unlocks once the tutorial ends. */
  update(): void {
    const s = this.sim.state;
    if (s.tutorial.done && !s.career.awarded.tutorial) {
      this.award('tutorial', 25, 'Finished training', { once: true });
      this.applyUnlocks();
    }
  }

  get state(): CareerState {
    return this.sim.state.career;
  }

  get title(): string {
    return RANK_TITLES[this.state.rank - 1];
  }

  nextThreshold(): number | null {
    const t = CONFIG.career.thresholds;
    return this.state.rank < t.length ? t[this.state.rank] : null;
  }

  /** XP progress within the current rank, 0..1. */
  progress(): number {
    const t = CONFIG.career.thresholds;
    const next = this.nextThreshold();
    if (next === null) return 1;
    const base = t[this.state.rank - 1];
    return Math.min(1, (this.state.xp - base) / (next - base));
  }

  /**
   * Award Divine Experience. Returns the amount actually awarded (0 when
   * deduplicated, rate-limited, or in Creative Mode).
   */
  award(key: string, amount: number, reason: string, opts: AwardOptions = {}): number {
    const sim = this.sim;
    const s = sim.state;
    if (s.mode !== 'career' || amount <= 0) return 0;
    const c = s.career;
    const rec = c.awarded[key];
    if (opts.once && rec) return 0;
    if (opts.window && opts.max) {
      if (rec && s.time - rec.t < opts.window && rec.n >= opts.max) return 0;
      if (rec && s.time - rec.t >= opts.window) rec.n = 0;
    }
    c.awarded[key] = { n: (rec?.n ?? 0) + 1, t: opts.window && rec && s.time - rec.t < opts.window ? rec.t : s.time };
    c.xp += amount;
    sim.bus.emit('XP_GAINED', { amount, reason, total: c.xp });
    const rank = rankForXp(c.xp);
    while (c.rank < rank) this.promote(c.rank + 1);
    return amount;
  }

  private promote(rank: number): void {
    const sim = this.sim;
    const c = sim.state.career;
    c.rank = rank;
    c.promotions.push({ rank, t: sim.state.time });
    this.applyUnlocks();
    const title = RANK_TITLES[rank - 1];
    const unlocks = RANK_UNLOCKS[rank - 1];
    sim.history.add(`Promoted: ${title}`, `${PROMOTION_LINES[rank - 1]} Unlocked: ${unlocks.join(', ')}.`, { kind: 'career' });
    if (rank === 10) {
      for (const cos of ['cosmic-aura', 'golden-badge', 'god-monument']) if (!sim.state.civ.cosmetics.includes(cos)) sim.state.civ.cosmetics.push(cos);
      if (!c.finalReview) {
        c.finalReview = true;
        sim.heaven.send('final-review', 'GOD (ON VACATION)', 'I HAVE REVIEWED YOUR WORK. I WILL BE EXTENDING MY VACATION INDEFINITELY.', { force: true });
      }
    } else if (rank >= 3) {
      sim.heaven.send(`committee-${rank}`, 'ANGEL HR COMMITTEE', 'YOUR PROMOTION WAS APPROVED BY A COMMITTEE OF ANGELS WHO DID NOT READ THE REPORT.');
    }
    sim.bus.emit('PROMOTED', { rank, title, unlocks });
  }

  /** Career Mode: grant every power the current rank allows. Idempotent (used on load too). */
  applyUnlocks(): void {
    const sim = this.sim;
    const s = sim.state;
    if (s.mode === 'creative') return;
    if (!s.tutorial.done) return;
    const ids = (Object.entries(POWER_UNLOCK_RANK) as Array<[PowerId, number]>).filter(([, r]) => s.career.rank >= r).map(([id]) => id);
    if (s.career.rank >= 4) ids.push('mutation');
    if (ids.length) sim.powers.unlock(ids);
  }

  // -------------------------------------------------------------- Divine Overtime (rank 10)

  overtimeAvailable(): boolean {
    const s = this.sim.state;
    return (s.career.rank >= 10 || s.mode === 'creative') && s.time >= s.career.overtimeReadyAt && s.time >= s.career.overtimeUntil;
  }

  overtimeActive(): boolean {
    return this.sim.state.time < this.sim.state.career.overtimeUntil;
  }

  startOvertime(): boolean {
    const s = this.sim.state;
    if (!this.overtimeAvailable()) return false;
    const o = CONFIG.career.overtime;
    s.career.overtimeUntil = s.time + o.duration;
    s.career.overtimeReadyAt = s.time + o.duration + o.cooldown;
    this.sim.notify('DIVINE OVERTIME!', 'chaos', 'Cooldowns ×0.25 and energy regeneration ×4 for 30 seconds. Unpaid, obviously.', 2);
    this.sim.bus.emit('OVERTIME_STARTED', { until: s.career.overtimeUntil });
    return true;
  }
}
