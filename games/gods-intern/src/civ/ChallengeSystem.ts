import type { ChallengeState, ChallengeStatus } from '../core/types';
import type { GameEventName } from '../core/EventBus';
import { CONFIG } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { CHALLENGES, COSMETIC_LABEL, type ChallengeDefinition, type ChallengeObjective } from './ChallengeDefinitions';

export interface ObjectiveProgress {
  objective: ChallengeObjective;
  value: number;
  done: boolean;
}

/**
 * Event-driven Divine Challenges.
 *
 * - Unlocking: easy challenges are available from the start; medium ones after the
 *   tutorial; hard ones once any three challenges are completed (plus any per-challenge rule).
 * - Counters only advance while a challenge is unlocked and not yet completed, so
 *   completed challenges cannot be farmed and locked ones cannot be pre-filled.
 * - Duration objectives count continuous seconds and RESET to zero when interrupted
 *   (they do not pause). Saving and loading keeps the accumulated seconds.
 * - Completion is checked against the objectives every 0.5 s; the reward is applied
 *   exactly once (guarded by rewardApplied, which is saved).
 */
export class ChallengeSystem {
  private timer = 0;

  constructor(private readonly sim: Simulation) {
    this.ensureStates();
    const names = new Set<GameEventName>();
    for (const def of CHALLENGES) for (const k of Object.keys(def.on ?? {})) names.add(k as GameEventName);
    for (const name of names) {
      sim.bus.on(name, (payload) => {
        for (const def of CHALLENGES) {
          const handler = def.on?.[name] as ((s: Simulation, e: unknown, st: ChallengeState) => void) | undefined;
          if (!handler) continue;
          const st = this.state(def.id);
          if (st.status === 'locked' || st.status === 'completed') continue;
          handler(sim, payload, st);
        }
      });
    }
  }

  /** Fill missing records (new games, migrated saves). Never resets existing progress. */
  ensureStates(): void {
    const map = this.sim.state.civ.challenges;
    for (const def of CHALLENGES) {
      map[def.id] ??= { status: 'locked', counters: {}, held: 0, rewardApplied: false };
    }
  }

  state(id: string): ChallengeState {
    const map = this.sim.state.civ.challenges;
    return (map[id] ??= { status: 'locked', counters: {}, held: 0, rewardApplied: false });
  }

  get definitions(): ChallengeDefinition[] {
    return CHALLENGES;
  }

  completedCount(): number {
    return CHALLENGES.filter((d) => this.state(d.id).status === 'completed').length;
  }

  private unlocked(def: ChallengeDefinition): boolean {
    const s = this.sim.state;
    if (def.difficulty === 'medium' && !s.tutorial.done) return false;
    if (def.difficulty === 'hard' && this.completedCount() < 3) return false;
    return def.unlock ? def.unlock(this.sim) : true;
  }

  progress(def: ChallengeDefinition): ObjectiveProgress[] {
    const st = this.state(def.id);
    return def.objectives.map((o) => {
      const value = o.kind === 'counter' ? st.counters[o.id] ?? 0 : o.kind === 'duration' ? st.held : o.value?.(this.sim, st) ?? 0;
      const v = st.status === 'completed' ? Math.max(value, o.target) : value;
      return { objective: o, value: v, done: v >= o.target };
    });
  }

  /** 0..1 overall progress (mean of objective fractions). */
  fraction(def: ChallengeDefinition): number {
    const p = this.progress(def);
    return p.reduce((a, x) => a + Math.min(1, x.value / x.objective.target), 0) / Math.max(1, p.length);
  }

  update(dt: number): void {
    // Duration objectives need every tick's dt, but only while unlocked.
    for (const def of CHALLENGES) {
      const st = this.state(def.id);
      if (st.status === 'locked' || st.status === 'completed') continue;
      for (const o of def.objectives) {
        if (o.kind !== 'duration' || !o.holds) continue;
        st.held = o.holds(this.sim) ? st.held + dt : 0;
      }
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    for (const def of CHALLENGES) {
      const st = this.state(def.id);
      if (st.status === 'completed') continue;
      if (st.status === 'locked') {
        if (!this.unlocked(def)) continue;
        this.setStatus(def, st, 'available');
        this.sim.bus.emit('CHALLENGE_UNLOCKED', { id: def.id });
      }
      const p = this.progress(def);
      if (p.every((x) => x.done)) {
        this.complete(def, st);
        continue;
      }
      if (st.status === 'available' && p.some((x) => x.value > 0)) this.setStatus(def, st, 'active');
    }
  }

  private setStatus(_def: ChallengeDefinition, st: ChallengeState, status: ChallengeStatus): void {
    st.status = status;
  }

  private complete(def: ChallengeDefinition, st: ChallengeState): void {
    const sim = this.sim;
    st.status = 'completed';
    st.completedAt = sim.state.time;
    const rewardText = this.applyReward(def, st);
    // The UI shows a dedicated celebratory toast for CHALLENGE_COMPLETED (no duplicate notification).
    sim.history.add(`Challenge: ${def.title}`, `${def.description} Reward: ${rewardText}.`, { kind: 'challenge' });
    sim.bus.emit('CHALLENGE_COMPLETED', { id: def.id, title: def.title, rewardText });
    this.unpin(def.id);
  }

  /** Apply the reward exactly once. Returns a human summary. */
  applyReward(def: ChallengeDefinition, st: ChallengeState): string {
    const sim = this.sim;
    const r = def.reward;
    const parts: string[] = [];
    if (r.energy) parts.push(`+${r.energy} energy`);
    if (r.approval) parts.push(`${r.approval > 0 ? '+' : ''}${r.approval} approval`);
    if (r.chaos) parts.push(`+${r.chaos} chaos`);
    if (r.title) parts.push(`title "${r.title}"`);
    if (r.cosmetic) parts.push(COSMETIC_LABEL[r.cosmetic] ?? r.cosmetic);
    const text = parts.join(', ') || 'bragging rights';
    if (st.rewardApplied) return text;
    st.rewardApplied = true;
    const s = sim.state;
    if (r.energy) s.energy = Math.min(CONFIG.energy.max, s.energy + r.energy);
    if (r.approval) sim.addApproval(r.approval, `Challenge: ${def.title}`);
    if (r.chaos) sim.addChaos(r.chaos, `Challenge: ${def.title}`);
    if (r.title && !s.civ.titles.includes(r.title)) {
      s.civ.titles.push(r.title);
      s.civ.selectedTitle ??= r.title;
    }
    if (r.cosmetic && !s.civ.cosmetics.includes(r.cosmetic)) s.civ.cosmetics.push(r.cosmetic);
    if (r.history) sim.history.add(r.history.title, r.history.text, { kind: 'challenge' });
    return text;
  }

  pin(id: string): boolean {
    const civ = this.sim.state.civ;
    if (civ.pinned.includes(id)) return true;
    if (civ.pinned.length >= 3 || this.state(id).status === 'completed') return false;
    civ.pinned.push(id);
    return true;
  }

  unpin(id: string): void {
    const civ = this.sim.state.civ;
    civ.pinned = civ.pinned.filter((x) => x !== id);
  }

  togglePin(id: string): boolean {
    if (this.sim.state.civ.pinned.includes(id)) {
      this.unpin(id);
      return false;
    }
    return this.pin(id);
  }
}
