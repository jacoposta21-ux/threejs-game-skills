import { RANK_TITLES, RANK_UNLOCKS } from '../career/CareerSystem';
import { CONFIG } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon, setText } from './dom';

type Tab = 'path' | 'inbox';

/**
 * Heavenly Career UI: the compact HUD chip (rank, title, XP bar, next unlock),
 * the career drawer (full progression path + Heaven's inbox archive + Divine
 * Overtime) and the non-modal promotion ceremony.
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

  /** Small "+XP" ticker next to the chip (aggregated so it never spams). */
  xp(amount: number): void {
    this.xpSum += amount;
    this.xpTimer = 1.6;
    this.xpFloat.textContent = `+${this.xpSum} XP`;
    this.xpFloat.classList.remove('hidden', 'pop');
    void this.xpFloat.offsetWidth;
    this.xpFloat.classList.add('pop');
  }

  promoted(rank: number, title: string, unlocks: string[], line: string): void {
    this.toast.innerHTML = `<div class="pt-rays" aria-hidden="true"></div><small>${icon('star')} Promotion · Rank ${rank}</small><b>${escapeHtml(title.toUpperCase())}</b><p>${escapeHtml(line)}</p><span>Unlocked: ${escapeHtml(unlocks.join(', '))}</span>`;
    this.toast.classList.remove('hidden', 'leaving');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    this.toastTimer = 6;
    this.chip.classList.remove('bump');
    void this.chip.offsetWidth;
    this.chip.classList.add('bump');
  }

  update(sim: Simulation, dt: number): void {
    const c = sim.state.career;
    const creative = sim.state.mode === 'creative';
    setText(this.chipRank, creative ? '∞' : String(c.rank));
    setText(this.chipTitle, creative ? 'Creative Mode' : sim.career.title);
    this.chipBar.style.width = `${creative ? 100 : Math.round(sim.career.progress() * 100)}%`;
    const next = sim.career.nextThreshold();
    setText(this.chipNext, creative ? 'Sandbox · no career XP' : next === null ? 'Top of the ladder' : `${c.xp}/${next} XP → ${RANK_UNLOCKS[c.rank][0]}`);
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
    const key = `${this.tab}|${c.xp}|${c.rank}|${h.archive.length}|${sim.career.overtimeAvailable()}|${sim.career.overtimeActive()}|${sim.state.mode}`;
    if (key === this.key) return;
    this.key = key;
    const t = CONFIG.career.thresholds;
    const overtime = c.rank >= 10 || creative
      ? `<div class="cp-overtime"><div><b>Divine Overtime</b><small>Cooldowns ×0.25, energy ×4 for 30 s. Recharges in 3 min.</small></div><button type="button" class="btn primary" data-overtime ${sim.career.overtimeAvailable() ? '' : 'disabled'}>${sim.career.overtimeActive() ? 'Active!' : sim.career.overtimeAvailable() ? 'Start (O)' : 'Recharging'}</button></div>`
      : '';
    const path = RANK_TITLES.map((title, i) => {
      const r = i + 1;
      const state = creative ? 'future' : r < c.rank ? 'done' : r === c.rank ? 'now' : 'future';
      return `<li class="cp-${state}"><span class="cp-num">${r}</span><div><b>${escapeHtml(title)}</b><small>${t[i]} XP · ${escapeHtml(RANK_UNLOCKS[i].join(', '))}</small></div>${state === 'done' ? '<em>✓</em>' : state === 'now' ? '<em>you</em>' : ''}</li>`;
    }).join('');
    const inbox = h.archive.length
      ? [...h.archive].reverse().map((m) => `<li><small>Day ${Math.floor(m.t / CONFIG.time.dayLength) + 1} · ${escapeHtml(m.from)}</small><p>${escapeHtml(m.text)}</p></li>`).join('')
      : '<li class="muted">No mail yet. Heaven is pretending not to watch.</li>';
    this.root.innerHTML = `
      <header class="cp-head"><div><small>Heavenly Career · ${creative ? 'Creative Mode (no XP)' : 'Career Mode'}</small><h2>${icon('star')} ${escapeHtml(creative ? 'Creative Mode' : sim.career.title)}</h2></div>
      <button class="cp-close insp-close" type="button" aria-label="Close">${icon('close')}</button></header>
      <section class="cp-summary">
        <div class="cp-badge ${c.rank >= 10 ? 'gold' : ''}">${creative ? '∞' : c.rank}</div>
        <div><b>${creative ? 'Experimenting freely' : `${c.xp} Divine Experience`}</b><div class="bar"><i style="width:${creative ? 100 : Math.round(sim.career.progress() * 100)}%"></i></div>
        <small>${creative ? 'Career progress is kept in its own save.' : next === null ? 'You have reached the top. The sandbox continues.' : `${next - c.xp} XP to ${escapeHtml(RANK_TITLES[c.rank])}`}</small></div>
      </section>
      ${overtime}
      <nav class="cp-tabs"><button type="button" data-ctab="path" class="${this.tab === 'path' ? 'on' : ''}">Career path</button><button type="button" data-ctab="inbox" class="${this.tab === 'inbox' ? 'on' : ''}">Heaven's inbox <b>${h.archive.length}</b></button></nav>
      <div class="cp-body">${this.tab === 'path' ? `<ol class="cp-path">${path}</ol>` : `<ul class="cp-inbox">${inbox}</ul>`}</div>`;
  }
}
