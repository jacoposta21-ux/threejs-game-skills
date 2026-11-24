import { RANK_TITLES, RANK_UNLOCKS } from '../career/CareerSystem';
import { CONFIG } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon, setText, mayRebuild } from './dom';

type Tab = 'path' | 'inbox';

/** Non-power rewards for each promotion (shown on the path). */
const RANK_REWARDS = (rank: number) => (rank === 1 ? ['Your own dock'] : rank === 10 ? ['Energy refill', 'Cosmic aura', 'Golden badge', 'Monument of the Intern'] : ['Energy refill', `Title “${RANK_TITLES[rank - 1]}”`]);

/**
 * CAREER: the HUD chip (rank, title, XP bar, next unlock), the career panel (the
 * 10-rank path with XP, unlocks, rewards and completion, the next milestone
 * highlighted with a progress bar, the Mutation review, Heaven's inbox, Divine
 * Overtime) and a short, non-modal promotion ceremony.
 */
export class CareerPanel {
  private readonly chip = $('#career-chip');
  private readonly chipRank = $('#career-rank');
  private readonly chipTitle = $('#career-title');
  private readonly chipBar = $('#career-bar');
  private readonly chipNext = $('#career-next');
  private readonly root = $('#career');
  private readonly toast = $('#promo-toast');
  private readonly xpFloat = $('#xp-float');
  private tab: Tab = 'path';
  private key = '';
  private toastTimer = 0;
  private xpTimer = 0;
  private xpSum = 0;
  onToggle: (open: boolean) => void = () => {};
  onOvertime: () => void = () => {};

  constructor() {
    this.chip.addEventListener('click', () => this.toggle());
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.cp-close')) return this.close();
      const tab = t.closest<HTMLElement>('[data-ctab]');
      if (tab) {
        this.tab = tab.dataset.ctab as Tab;
        this.key = '';
      }
      if (t.closest('[data-overtime]')) this.onOvertime();
    });
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(tab?: Tab): void {
    if (tab) this.tab = tab;
    this.root.classList.remove('hidden');
    this.key = '';
    this.onToggle(true);
  }

  close(): void {
    if (!this.open) return;
    this.root.classList.add('hidden');
    this.onToggle(false);
  }

  /** Small "+XP" ticker under the chip (aggregated so it never spams). */
  xp(amount: number): void {
    this.xpSum += amount;
    this.xpTimer = 1.6;
    this.xpFloat.textContent = `+${this.xpSum} XP`;
    this.xpFloat.classList.remove('hidden', 'pop');
    void this.xpFloat.offsetWidth;
    this.xpFloat.classList.add('pop');
  }

  promoted(rank: number, title: string, unlocks: string[], line: string): void {
    this.toast.innerHTML = `<div class="pt-rays" aria-hidden="true"></div><small>${icon('star')} Promoted to rank ${rank}</small><b>${escapeHtml(title.toUpperCase())}</b><p>${escapeHtml(line)}</p><span>New: ${escapeHtml(unlocks.join(', '))}</span>`;
    this.toast.classList.remove('hidden', 'leaving');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    this.toastTimer = 4.2;
    this.chip.classList.remove('bump');
    void this.chip.offsetWidth;
    this.chip.classList.add('bump');
  }

  /** Next milestone: the Mutation review if it is closer than the next rank. */
  private milestone(sim: Simulation): { label: string; xp: number; from: number } | null {
    const s = sim.state;
    const c = s.career;
    const next = sim.career.nextThreshold();
    if (!s.unlockedPowers.includes('mutation') && s.mode === 'career' && (next === null || CONFIG.career.mutationXp < next)) {
      return { label: 'Mutation (probation review)', xp: CONFIG.career.mutationXp, from: CONFIG.career.thresholds[c.rank - 1] };
    }
    if (next === null) return null;
    return { label: `Rank ${c.rank + 1} · ${RANK_TITLES[c.rank]} → ${RANK_UNLOCKS[c.rank][0]}`, xp: next, from: CONFIG.career.thresholds[c.rank - 1] };
  }

  update(sim: Simulation, dt: number): void {
    const c = sim.state.career;
    const creative = sim.state.mode === 'creative';
    const ms = this.milestone(sim);
    setText(this.chipRank, creative ? '∞' : String(c.rank));
    setText(this.chipTitle, creative ? 'Creative Mode' : sim.career.title);
    const frac = creative || !ms ? 1 : Math.max(0, Math.min(1, (c.xp - ms.from) / Math.max(1, ms.xp - ms.from)));
    this.chipBar.style.width = `${Math.round(frac * 100)}%`;
    setText(this.chipNext, creative ? 'No career XP in Creative' : !ms ? 'Top of the ladder' : `${c.xp} / ${ms.xp} XP · next: ${ms.label.includes('Mutation') ? 'Mutation' : RANK_UNLOCKS[c.rank][0]}`);
    this.chip.classList.toggle('creative', creative);
    this.chip.classList.toggle('overtime', sim.career.overtimeActive());
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0.4) this.toast.classList.add('leaving');
      if (this.toastTimer <= 0) this.toast.classList.add('hidden');
    }
    if (this.xpTimer > 0) {
      this.xpTimer -= dt;
      if (this.xpTimer <= 0) {
        this.xpSum = 0;
        this.xpFloat.classList.add('hidden');
      }
    }
    if (!this.open) return;
    const h = sim.state.heaven;
    const key = `${this.tab}|${c.xp}|${c.rank}|${h.archive.length}|${sim.career.overtimeAvailable()}|${sim.career.overtimeActive()}|${sim.state.mode}|${sim.state.unlockedPowers.length}`;
    if (key === this.key || !mayRebuild(this.root, this.key === '')) return;
    this.key = key;
    const t = CONFIG.career.thresholds;
    const overtime = c.rank >= 10 || creative
      ? `<div class="cp-overtime"><div><b>Divine Overtime</b><small>Cooldowns ×0.25, energy ×4 for 30 s. Recharges in 3 min.</small></div><button type="button" class="btn primary" data-overtime ${sim.career.overtimeAvailable() ? '' : 'disabled'}>${sim.career.overtimeActive() ? 'Active!' : sim.career.overtimeAvailable() ? 'Start' : 'Recharging'}</button></div>`
      : '';
    const mutationRow = !creative
      ? `<li class="cp-side ${sim.state.unlockedPowers.includes('mutation') ? 'cp-done' : ms?.label.includes('Mutation') ? 'cp-next' : 'cp-future'}"><span class="cp-num">★</span><div><b>Probation review</b><small>${CONFIG.career.mutationXp} XP · unlocks Mutation (sooner with high Chaos)</small></div>${sim.state.unlockedPowers.includes('mutation') ? '<em>✓ Done</em>' : ''}</li>`
      : '';
    const path = RANK_TITLES.map((title, i) => {
      const r = i + 1;
      const state = creative ? 'future' : r < c.rank ? 'done' : r === c.rank ? 'now' : r === c.rank + 1 ? 'next' : 'future';
      const pct = state === 'next' ? Math.round(sim.career.progress() * 100) : 0;
      const row = `<li class="cp-${state}"><span class="cp-num">${r}</span><div><b>${escapeHtml(title)}</b><small>${t[i]} XP · ${r === 1 ? 'Starts with' : 'Unlocks'} ${escapeHtml(RANK_UNLOCKS[i].join(', '))}</small><small class="cp-rewards">Rewards: ${escapeHtml(RANK_REWARDS(r).join(' · '))}</small>${state === 'next' ? `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><small><b>${t[i] - c.xp} XP to go</b></small>` : ''}</div>${state === 'done' ? '<em>✓ Done</em>' : state === 'now' ? '<em>You are here</em>' : state === 'next' ? '<em>Next</em>' : ''}</li>`;
      return r === 1 ? row + mutationRow : row;
    }).join('');
    const inbox = h.archive.length
      ? [...h.archive].reverse().map((m) => `<li><small>Day ${Math.floor(m.t / CONFIG.time.dayLength) + 1} · ${escapeHtml(m.from)}</small><p>${escapeHtml(m.text)}</p></li>`).join('')
      : '<li class="muted">No mail yet. Heaven is pretending not to watch.</li>';
    const upcoming = (['tornado', 'freeze', 'gravity', 'terraform', 'timewarp', 'possession', 'meteor', 'resurrection', 'mutation'] as const).filter((id) => !sim.state.unlockedPowers.includes(id)).slice(0, 3).map((id) => sim.powers.powers[id].name);
    this.root.innerHTML = `
      <header class="side-head"><div><small>Heavenly Career · ${creative ? 'Creative Mode (no XP)' : 'Career Mode'}</small><h2>${icon('star')} Career</h2></div>
      <button class="cp-close insp-close" type="button" aria-label="Close career panel">${icon('close')}</button></header>
      <div class="side-body">
      <section class="cp-summary">
        <div class="cp-badge ${c.rank >= 10 ? 'gold' : ''}">${creative ? '∞' : c.rank}</div>
        <div><b>${escapeHtml(creative ? 'Experimenting freely' : sim.career.title)}</b><small>${creative ? 'Career progress is kept in its own save.' : `${c.xp} Divine Experience`}</small>
        ${!creative && ms ? `<div class="cp-next-box"><small>Next milestone</small><b>${escapeHtml(ms.label)}</b><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div><small>${c.xp} / ${ms.xp} XP · earn XP by answering prayers, finishing challenges, discoveries and mastering powers</small></div>` : ''}
        ${!creative && upcoming.length ? `<small>Coming up: ${escapeHtml(upcoming.join(', '))}</small>` : ''}</div>
      </section>
      ${overtime}
      <nav class="cp-tabs" role="tablist"><button type="button" role="tab" data-ctab="path" aria-selected="${this.tab === 'path'}" class="${this.tab === 'path' ? 'on' : ''}">Career path</button><button type="button" role="tab" data-ctab="inbox" aria-selected="${this.tab === 'inbox'}" class="${this.tab === 'inbox' ? 'on' : ''}">Heaven's mail <b>${h.archive.length}</b></button></nav>
      ${this.tab === 'path' ? `<ol class="cp-path">${path}</ol>` : `<ul class="cp-inbox">${inbox}</ul>`}
      </div>`;
  }
}
