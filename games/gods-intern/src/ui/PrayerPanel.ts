import type { PrayerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { $, el, escapeHtml, icon, setText } from './dom';

const URGENCY = ['', 'Request', 'Important', 'URGENT'];

/** Right-side prayer inbox. Cards are keyed by prayer id and updated in place. */
export class PrayerPanel {
  private readonly root = $('#prayer-panel');
  private readonly list = $('#prayer-list');
  private readonly count = $('#prayer-count');
  private readonly cards = new Map<string, HTMLButtonElement>();
  private readonly empty = el('div', 'empty-inbox', '<b>Inbox zero.</b>The mortals are… fine? For now.');
  onFocus: (p: PrayerData) => void = () => {};
  onToggle: () => void = () => {};

  constructor() {
    $('#prayer-toggle').addEventListener('click', () => {
      this.root.classList.toggle('collapsed');
      $('#prayer-toggle').setAttribute('aria-expanded', String(!this.root.classList.contains('collapsed')));
      this.onToggle();
    });
    this.list.append(this.empty);
  }

  setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('collapsed', collapsed);
  }

  update(sim: Simulation): void {
    const s = sim.state;
    const active = s.prayers.filter((p) => p.status === 'active').sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    setText(this.count, String(active.length));
    this.count.classList.toggle('zero', active.length === 0);
    const keep = new Set<string>();
    for (const p of active) {
      keep.add(p.id);
      let card = this.cards.get(p.id);
      if (!card) {
        card = this.createCard(sim, p);
        this.cards.set(p.id, card);
        this.list.prepend(card);
      }
      const bar = card.querySelector<HTMLElement>('.bar i')!;
      bar.style.width = `${Math.round(p.progress * 100)}%`;
      const pct = card.querySelector<HTMLElement>('.pct')!;
      setText(pct, `${Math.round(p.progress * 100)}%`);
      const timer = card.querySelector<HTMLElement>('.timer')!;
      if (p.expiresAt !== undefined) {
        const left = Math.max(0, p.expiresAt - s.time);
        setText(timer, `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`);
        timer.classList.toggle('late', left < 30);
      }
    }
    // Resolved cards animate out, then disappear.
    for (const [id, card] of this.cards) {
      if (keep.has(id)) continue;
      if (!card.dataset.leaving) {
        const p = s.prayers.find((x) => x.id === id);
        card.dataset.leaving = '1';
        card.classList.add(p?.status === 'failed' ? 'failed' : 'done');
        window.setTimeout(() => {
          card.remove();
          this.cards.delete(id);
        }, 900);
      }
    }
    this.empty.classList.toggle('hidden', active.length > 0);
  }

  private createCard(sim: Simulation, p: PrayerData): HTMLButtonElement {
    const village = sim.village(p.villageId);
    const card = el('button', `prayer p${p.priority}`) as HTMLButtonElement;
    card.type = 'button';
    card.dataset.prayer = p.type;
    card.innerHTML = `
      <div class="prayer-top"><h5>${escapeHtml(p.title)}</h5><span class="urgency">${URGENCY[p.priority]}</span></div>
      <q>${escapeHtml(p.description)}</q>
      <div class="objective"><span>${escapeHtml(p.objective)}</span><span class="pct">0%</span></div>
      <div class="bar"><i style="width:0%"></i></div>
      <div class="prayer-meta">
        <span>${icon('pin')}${escapeHtml(village?.name ?? 'Unknown')}</span>
        <span>${icon('energy')}+${p.reward}</span>
        <span class="timer"></span>
      </div>`;
    card.title = 'Click to fly to the location';
    card.addEventListener('click', () => this.onFocus(p));
    return card;
  }

  clear(): void {
    for (const card of this.cards.values()) card.remove();
    this.cards.clear();
  }
}
