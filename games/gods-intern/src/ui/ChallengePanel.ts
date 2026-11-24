import { COSMETIC_LABEL, type ChallengeDefinition } from '../civ/ChallengeDefinitions';
import type { PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon, mayRebuild } from './dom';

export type ChallengeView = 'Recommended' | 'Miracles' | 'Civilization' | 'Culture' | 'Chaos' | 'Advanced' | 'Completed';
const VIEWS: ChallengeView[] = ['Recommended', 'Miracles', 'Civilization', 'Culture', 'Chaos', 'Advanced', 'Completed'];

/** Powers a challenge needs (none = any play style). */
export const CHALLENGE_POWERS: Record<string, PowerId[]> = {
  'let-there-be-rain': ['rain'],
  'amateur-botanist': ['nature'],
  firefighter: ['fire', 'rain'],
  'rock-has-spoken': ['lightning'],
  'golden-age': ['mutation'],
  'wind-management': ['tornado'],
  'cold-reception': ['freeze'],
  'unqualified-astronaut': ['gravity'],
  'department-geography': ['terraform'],
  'time-suggestion': ['timewarp'],
  'undercover-management': ['possession'],
  'big-rock-problem': ['meteor'],
  'clerical-error': ['resurrection'],
};

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

function viewOf(d: ChallengeDefinition): Exclude<ChallengeView, 'Recommended' | 'Completed' | 'Advanced'> {
  return d.category === 'Miracle' ? 'Miracles' : d.category === 'Cultural' ? 'Culture' : d.category === 'Chaos' ? 'Chaos' : 'Civilization';
}

const missingPowers = (sim: Simulation, d: ChallengeDefinition) => (CHALLENGE_POWERS[d.id] ?? []).filter((p) => !sim.state.unlockedPowers.includes(p));

/** Advanced: hard challenges, or ones that need a power the player does not have yet. */
const isAdvanced = (sim: Simulation, d: ChallengeDefinition) => d.difficulty === 'hard' || missingPowers(sim, d).length > 0;

/** A few achievable challenges for the player's current abilities, closest first. */
export function recommendedChallenges(sim: Simulation, limit = 4): ChallengeDefinition[] {
  const order = { easy: 0, medium: 1, hard: 2 } as const;
  return sim.challenges.definitions
    .filter((d) => {
      const st = sim.challenges.state(d.id).status;
      return (st === 'available' || st === 'active') && !isAdvanced(sim, d) && d.id !== 'employee-of-the-month';
    })
    .sort((a, b) => order[a.difficulty] - order[b.difficulty] || sim.challenges.fraction(b) - sim.challenges.fraction(a))
    .slice(0, limit);
}

/**
 * CHALLENGES: all 30 challenges organized as Recommended (default view, only
 * challenges the current powers can achieve), Miracles, Civilization, Culture,
 * Chaos, Advanced and Completed. Each card shows objective, progress, reward,
 * difficulty and required powers. Up to 3 pins; early on, one recommended goal
 * is pinned automatically until the player chooses their own.
 */
export class ChallengePanel {
  private readonly root = $('#challenges');
  private readonly pins = $('#challenge-pins');
  private readonly toast = $('#challenge-toast');
  private readonly badge = $('#challenge-badge');
  private view: ChallengeView = 'Recommended';
  private key = '';
  private pinKey = '';
  private toastTimer = 0;
  private seenCompleted = -1;
  onToggle: (open: boolean) => void = () => {};
  onPinFail: () => void = () => {};
  private sim: Simulation | null = null;

  constructor() {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest<HTMLElement>('[data-filter]');
      if (f) {
        this.view = f.dataset.filter as ChallengeView;
        this.key = '';
        return;
      }
      if (t.closest('.ch-close')) {
        this.close();
        return;
      }
      const pin = t.closest<HTMLElement>('[data-pin]');
      if (pin && this.sim) {
        this.sim.state.civ.pinsTouched = true;
        if (!this.sim.challenges.togglePin(pin.dataset.pin!)) {
          if (!this.sim.state.civ.pinned.includes(pin.dataset.pin!)) this.onPinFail();
        }
        this.key = '';
        this.pinKey = '';
        return;
      }
      const title = t.closest<HTMLElement>('[data-title]');
      if (title && this.sim) {
        this.sim.state.civ.selectedTitle = title.dataset.title || null;
        this.key = '';
      }
    });
    this.pins.addEventListener('click', () => this.show());
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(view?: ChallengeView): void {
    if (view) this.view = view;
    this.root.classList.remove('hidden');
    this.key = '';
    this.onToggle(true);
  }

  close(): void {
    if (!this.open) return;
    this.root.classList.add('hidden');
    this.onToggle(false);
  }

  /** Celebratory completion toast (non-blocking; clicks pass through). */
  celebrate(title: string, reward: string): void {
    this.toast.innerHTML = `<div class="ct-burst" aria-hidden="true">${'<i></i>'.repeat(12)}</div><small>${icon('trophy')} Challenge complete</small><b>${escapeHtml(title.toUpperCase())}</b><span>${escapeHtml(reward)}</span>`;
    this.toast.classList.remove('hidden', 'leaving');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    this.toastTimer = 3.6;
  }

  update(sim: Simulation, dt: number, hidePins: boolean): void {
    this.sim = sim;
    const civ = sim.state.civ;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0.4) this.toast.classList.add('leaving');
      if (this.toastTimer <= 0) this.toast.classList.add('hidden');
    }
    // One recommended goal stays pinned until the player picks their own pins.
    if (sim.state.tutorial.done && !civ.pinsTouched && civ.pinned.length === 0) {
      const next = recommendedChallenges(sim, 1)[0];
      if (next) sim.challenges.pin(next.id);
    }
    const done = sim.challenges.completedCount();
    if (this.seenCompleted < 0) this.seenCompleted = done;
    if (this.open) this.seenCompleted = done;
    const unseen = done - this.seenCompleted;
    this.badge.textContent = String(unseen);
    this.badge.classList.toggle('hidden', unseen <= 0);

    const pinned = civ.pinned.map((id) => sim.challenges.definitions.find((d) => d.id === id)).filter((d): d is ChallengeDefinition => !!d);
    const showPins = pinned.length > 0 && !this.open && !hidePins;
    this.pins.classList.toggle('hidden', !showPins);
    if (showPins) {
      const pk = pinned.map((d) => `${d.id}:${sim.challenges.progress(d).map((p) => Math.floor(p.value)).join('/')}`).join('|');
      if (pk !== this.pinKey) {
        this.pinKey = pk;
        this.pins.innerHTML = `<header>${icon('trophy')} ${pinned.length > 1 ? 'Goals' : 'Goal'}</header>${pinned
          .map((d) => {
            const p = sim.challenges.progress(d);
            const main = p.find((x) => !x.done) ?? p[0];
            const frac = Math.round(sim.challenges.fraction(d) * 100);
            return `<div class="pin-row"><b>${escapeHtml(d.title)}</b><small>${escapeHtml(main.objective.label)}: ${Math.min(main.objective.target, Math.floor(main.value))}/${main.objective.target}</small><div class="bar"><i style="width:${frac}%"></i></div></div>`;
          })
          .join('')}`;
      }
    }

    if (!this.open) return;
    const defs = sim.challenges.definitions;
    const key = `${this.view}|${civ.pinned.join()}|${civ.selectedTitle}|${civ.titles.length}|${sim.state.unlockedPowers.length}|${defs.map((d) => `${sim.challenges.state(d.id).status}${sim.challenges.progress(d).map((p) => Math.floor(p.value)).join('.')}`).join()}`;
    if (key === this.key || !mayRebuild(this.root, this.key === '')) return;
    this.key = key;
    const status = (d: ChallengeDefinition) => sim.challenges.state(d.id).status;
    const list =
      this.view === 'Recommended' ? recommendedChallenges(sim, 5)
        : this.view === 'Completed' ? defs.filter((d) => status(d) === 'completed')
          : this.view === 'Advanced' ? defs.filter((d) => status(d) !== 'completed' && isAdvanced(sim, d))
            : defs.filter((d) => status(d) !== 'completed' && !isAdvanced(sim, d) && viewOf(d) === this.view);
    const count = (v: ChallengeView) =>
      v === 'Recommended' ? recommendedChallenges(sim, 5).length
        : v === 'Completed' ? done
          : v === 'Advanced' ? defs.filter((d) => status(d) !== 'completed' && isAdvanced(sim, d)).length
            : defs.filter((d) => status(d) !== 'completed' && !isAdvanced(sim, d) && viewOf(d) === v).length;
    const empty = this.view === 'Completed' ? 'Nothing completed yet. Start with a recommended one.' : this.view === 'Recommended' ? 'Nothing you can do right now. New powers bring new challenges.' : 'Nothing here right now.';
    this.root.innerHTML = `
      <header class="side-head">
        <div><small>Department of Miracles · ${done}/${defs.length} complete</small><h2>${icon('trophy')} Challenges</h2></div>
        <button class="ch-close insp-close" type="button" aria-label="Close challenges">${icon('close')}</button>
      </header>
      <nav class="ch-filters" role="tablist">${VIEWS.map((f) => `<button type="button" role="tab" data-filter="${f}" aria-selected="${this.view === f}" class="${this.view === f ? 'on' : ''}">${f} <b>${count(f)}</b></button>`).join('')}</nav>
      <div class="side-body">
        ${this.view === 'Recommended' ? `<p class="ch-intro">Pin up to 3 goals to keep them on screen. ${civ.pinned.length}/3 pinned.</p>` : ''}
        ${list.length ? list.map((d) => this.card(sim, d)).join('') : `<p class="muted">${empty}</p>`}
        ${this.view === 'Completed' ? this.profile(sim) : ''}
      </div>`;
  }

  private profile(sim: Simulation): string {
    const civ = sim.state.civ;
    const cosmetics = civ.cosmetics.map((c) => `<span class="cosm">${escapeHtml(COSMETIC_LABEL[c] ?? c)}</span>`).join('');
    const titles = civ.titles.map((t) => `<button type="button" data-title="${escapeHtml(t)}" class="${t === civ.selectedTitle ? 'on' : ''}" aria-pressed="${t === civ.selectedTitle}">${escapeHtml(t)}</button>`).join('');
    return `<section class="ch-profile"><h3>Your titles and cosmetics</h3>
      ${titles ? `<div class="ch-titles">${titles}</div>` : '<p class="muted">Challenges and promotions give titles.</p>'}
      ${cosmetics ? `<div class="ch-cosmetics">${cosmetics}</div>` : ''}</section>`;
  }

  private card(sim: Simulation, d: ChallengeDefinition): string {
    const st = sim.challenges.state(d.id);
    const locked = st.status === 'locked';
    const pinned = sim.state.civ.pinned.includes(d.id);
    const need = CHALLENGE_POWERS[d.id] ?? [];
    const missing = missingPowers(sim, d);
    const lockText = d.difficulty === 'medium' ? 'Opens after your first miracle.' : 'Opens after you complete any 3 challenges.';
    const rewards = [
      d.reward.energy ? `+${d.reward.energy} energy` : '',
      d.reward.approval ? `${d.reward.approval > 0 ? '+' : ''}${d.reward.approval} approval` : '',
      d.reward.chaos ? `+${d.reward.chaos} chaos` : '',
      d.reward.title ? `Title “${d.reward.title}”` : '',
      d.reward.cosmetic ? `${COSMETIC_LABEL[d.reward.cosmetic] ?? d.reward.cosmetic}` : '',
      'Career XP',
    ].filter(Boolean);
    const objectives = sim.challenges
      .progress(d)
      .map((p) => {
        const frac = Math.min(1, p.value / p.objective.target);
        const shown = p.objective.kind === 'duration' ? `${Math.floor(Math.min(p.value, p.objective.target))}s / ${p.objective.target}s` : `${Math.min(p.objective.target, Math.floor(p.value))} / ${p.objective.target}`;
        return `<li class="${p.done ? 'done' : ''}"><span>${p.done ? '✓ ' : ''}${escapeHtml(p.objective.label)}</span><b>${shown}</b><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div></li>`;
      })
      .join('');
    const canPin = st.status !== 'completed' && !locked;
    return `<article class="ch-card s-${st.status} d-${d.difficulty}" data-id="${d.id}">
      <header>
        <div><b>${escapeHtml(d.title)}</b><small><span class="diff d-${d.difficulty}">${DIFFICULTY_LABEL[d.difficulty]}</span>${st.status === 'completed' ? ' · ✓ Completed' : st.status === 'active' ? ' · In progress' : ''}</small></div>
        ${canPin ? `<button type="button" class="ch-pin ${pinned ? 'on' : ''}" data-pin="${d.id}" aria-pressed="${pinned}">${icon('pin')} ${pinned ? 'Pinned' : 'Pin'}</button>` : st.status === 'completed' ? '<span class="ch-done">✓</span>' : `<span class="ch-lock">${icon('lock')} Locked</span>`}
      </header>
      <p>${escapeHtml(locked ? lockText : d.description)}</p>
      ${need.length ? `<p class="ch-need">Needs: ${need.map((p) => `<span class="${missing.includes(p) ? 'missing' : ''}">${missing.includes(p) ? `${icon('lock')} ` : ''}${escapeHtml(sim.powers.powers[p].name)}</span>`).join(' ')}</p>` : ''}
      ${locked ? '' : `<ul class="ch-obj">${objectives}</ul>`}
      <footer>${rewards.map((r) => `<span>${escapeHtml(r)}</span>`).join('')}</footer>
    </article>`;
  }
}
