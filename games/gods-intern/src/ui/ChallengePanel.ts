import { COSMETIC_LABEL, type ChallengeCategory, type ChallengeDefinition } from '../civ/ChallengeDefinitions';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon } from './dom';

type Filter = 'All' | ChallengeCategory;
const FILTERS: Filter[] = ['All', 'Miracle', 'Civilization', 'Cultural', 'Chaos', 'Diplomacy'];
const CAT_ICON: Record<ChallengeCategory, string> = { Miracle: '✦', Civilization: '⌂', Cultural: '♪', Chaos: '⚡', Diplomacy: '⚖' };

/**
 * Divine Challenges: filterable list with live objective progress, pinning (max 3),
 * the intern's profile (titles and cosmetics), a compact pinned-goals HUD widget
 * and a celebratory, non-modal completion toast.
 */
export class ChallengePanel {
  private readonly root = $('#challenges');
  private readonly pins = $('#challenge-pins');
  private readonly toast = $('#challenge-toast');
  private readonly badge = $('#challenge-badge');
  private filter: Filter = 'All';
  private key = '';
  private pinKey = '';
  private toastTimer = 0;
  private seenCompleted = -1;
  onToggle: (open: boolean) => void = () => {};
  onPinFail: () => void = () => {};
  private sim: Simulation | null = null;

  constructor() {
    $('#btn-challenges').addEventListener('click', () => this.toggle());
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest<HTMLElement>('[data-filter]');
      if (f) {
        this.filter = f.dataset.filter as Filter;
        this.key = '';
        return;
      }
      if (t.closest('.ch-close')) {
        this.close();
        return;
      }
      const pin = t.closest<HTMLElement>('[data-pin]');
      if (pin && this.sim) {
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

  show(filter?: Filter): void {
    if (filter) this.filter = filter;
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
    this.toast.innerHTML = `<div class="ct-burst" aria-hidden="true">${'<i></i>'.repeat(12)}</div><small>${icon('trophy')} Challenge complete</small><b>${escapeHtml(title)}</b><span>${escapeHtml(reward)}</span>`;
    this.toast.classList.remove('hidden', 'leaving');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    this.toastTimer = 4.5;
  }

  update(sim: Simulation, dt: number, leftDrawerOpen: boolean): void {
    this.sim = sim;
    const civ = sim.state.civ;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0.4) this.toast.classList.add('leaving');
      if (this.toastTimer <= 0) this.toast.classList.add('hidden');
    }
    const done = sim.challenges.completedCount();
    if (this.seenCompleted < 0) this.seenCompleted = done;
    if (this.open) this.seenCompleted = done;
    const unseen = done - this.seenCompleted;
    this.badge.textContent = String(unseen);
    this.badge.classList.toggle('hidden', unseen <= 0);

    // Pinned widget (hidden while a left-hand drawer is open).
    const pinned = civ.pinned.map((id) => sim.challenges.definitions.find((d) => d.id === id)).filter((d): d is ChallengeDefinition => !!d);
    const showPins = pinned.length > 0 && !this.open && !leftDrawerOpen;
    this.pins.classList.toggle('hidden', !showPins);
    if (showPins) {
      const pk = pinned.map((d) => `${d.id}:${sim.challenges.progress(d).map((p) => Math.floor(p.value)).join('/')}`).join('|');
      if (pk !== this.pinKey) {
        this.pinKey = pk;
        this.pins.innerHTML = `<header>${icon('trophy')} Pinned goals</header>${pinned
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
    const key = `${this.filter}|${civ.pinned.join()}|${civ.selectedTitle}|${civ.titles.length}|${defs.map((d) => `${sim.challenges.state(d.id).status}${sim.challenges.progress(d).map((p) => Math.floor(p.value)).join('.')}`).join()}`;
    if (key === this.key) return;
    this.key = key;
    const visible = defs.filter((d) => this.filter === 'All' || d.category === this.filter);
    const order = { active: 0, available: 1, completed: 2, locked: 3 } as const;
    visible.sort((a, b) => order[sim.challenges.state(a.id).status] - order[sim.challenges.state(b.id).status]);
    this.root.innerHTML = `
      <header class="ch-head">
        <div><small>Department of Miracles · Performance Review</small><h2>${icon('trophy')} Divine Challenges <em>${done}/${defs.length}</em></h2></div>
        <button class="ch-close insp-close" type="button" aria-label="Close">${icon('close')}</button>
      </header>
      ${this.profile(sim)}
      <nav class="ch-filters">${FILTERS.map((f) => `<button type="button" data-filter="${f}" class="${this.filter === f ? 'on' : ''}">${f === 'All' ? 'All' : `${CAT_ICON[f]} ${f}`}</button>`).join('')}</nav>
      <div class="ch-body">${visible.map((d) => this.card(sim, d)).join('')}</div>`;
  }

  private profile(sim: Simulation): string {
    const civ = sim.state.civ;
    const title = civ.selectedTitle ?? 'Unpaid Intern';
    const cosmetics = civ.cosmetics.map((c) => `<span class="cosm">${escapeHtml(COSMETIC_LABEL[c] ?? c)}</span>`).join('');
    const titles = civ.titles
      .map((t) => `<button type="button" data-title="${escapeHtml(t)}" class="${t === civ.selectedTitle ? 'on' : ''}">${escapeHtml(t)}</button>`)
      .join('');
    return `<section class="ch-profile">
      <div class="badge-seal">${icon('halo')}</div>
      <div><small>Your title</small><b class="ch-title">${escapeHtml(title)}</b>
      ${titles ? `<div class="ch-titles">${titles}</div>` : '<p class="muted">Complete challenges to earn titles.</p>'}
      ${cosmetics ? `<div class="ch-cosmetics">${cosmetics}</div>` : ''}</div>
    </section>`;
  }

  private card(sim: Simulation, d: ChallengeDefinition): string {
    const st = sim.challenges.state(d.id);
    const locked = st.status === 'locked';
    const pinned = sim.state.civ.pinned.includes(d.id);
    const lockText = d.difficulty === 'medium' ? 'Unlocks after the tutorial' : 'Unlocks after completing any 3 challenges';
    const rewards = [
      d.reward.energy ? `+${d.reward.energy} energy` : '',
      d.reward.approval ? `${d.reward.approval > 0 ? '+' : ''}${d.reward.approval} approval` : '',
      d.reward.chaos ? `+${d.reward.chaos} chaos` : '',
      d.reward.title ? `Title: “${d.reward.title}”` : '',
      d.reward.cosmetic ? `Cosmetic: ${COSMETIC_LABEL[d.reward.cosmetic] ?? d.reward.cosmetic}` : '',
      d.reward.history ? 'History entry' : '',
    ].filter(Boolean);
    const objectives = sim.challenges
      .progress(d)
      .map((p) => {
        const frac = Math.min(1, p.value / p.objective.target);
        const shown = p.objective.kind === 'duration' ? `${Math.floor(Math.min(p.value, p.objective.target))}s/${p.objective.target}s` : `${Math.min(p.objective.target, Math.floor(p.value))}/${p.objective.target}`;
        return `<li class="${p.done ? 'done' : ''}"><span>${escapeHtml(p.objective.label)}</span><b>${shown}</b><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div></li>`;
      })
      .join('');
    return `<article class="ch-card s-${st.status} d-${d.difficulty}" data-id="${d.id}">
      <header>
        <span class="ch-cat" title="${d.category}">${CAT_ICON[d.category]}</span>
        <div><b>${escapeHtml(d.title)}</b><small>${d.category} · ${d.difficulty}${st.status === 'completed' ? ' · completed' : st.status === 'active' ? ' · in progress' : ''}</small></div>
        ${st.status !== 'completed' && !locked ? `<button type="button" class="ch-pin ${pinned ? 'on' : ''}" data-pin="${d.id}" aria-pressed="${pinned}" title="${pinned ? 'Unpin' : 'Pin to HUD (max 3)'}">${icon('pin')}</button>` : st.status === 'completed' ? `<span class="ch-done">✓</span>` : `<span class="ch-lock">${icon('lock')}</span>`}
      </header>
      <p>${escapeHtml(locked ? lockText : d.description)}</p>
      ${locked ? '' : `<ul class="ch-obj">${objectives}</ul>`}
      <footer>${rewards.map((r) => `<span>${escapeHtml(r)}</span>`).join('')}</footer>
    </article>`;
  }
}
