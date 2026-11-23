import { ARCHETYPES } from '../culture/Archetypes';
import { STAGE_NAMES } from '../culture/SacredSystem';
import type { Simulation } from '../simulation/SimulationManager';
import { $, el, escapeHtml, icon } from './dom';

type Tab = 'history' | 'beliefs' | 'sacred';

const KIND_ICON: Record<string, string> = {
  religion: '✦',
  sacred: '★',
  festival: '♪',
  monument: '▲',
  build: '⌂',
  mutation: '⚗',
  curse: '☠',
  loss: '✖',
  disaster: '🔥',
  argument: '⚡',
  event: '•',
};

/**
 * THE BOOK OF QUESTIONABLE MIRACLES — a collapsible drawer with three tabs:
 * History (persisted, bounded log; click to fly the camera there), Beliefs
 * (the religion inspector) and Sacred Places. It never stays open by itself
 * and re-renders only while visible.
 */
export class HistoryBookPanel {
  private readonly root = $('#book');
  private readonly badge = $('#book-badge');
  private tab: Tab = 'history';
  private seen = 0;
  private renderKey = '';
  onFocus: (x: number, z: number) => void = () => {};
  onSacred: (id: string) => void = () => {};
  onToggle: (open: boolean) => void = () => {};

  constructor() {
    $('#btn-book').addEventListener('click', () => this.toggle());
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const tab = target.closest<HTMLElement>('[data-tab]');
      if (tab) {
        this.tab = tab.dataset.tab as Tab;
        this.renderKey = '';
        return;
      }
      if (target.closest('.book-close')) {
        this.close();
        return;
      }
      const entry = target.closest<HTMLElement>('[data-x]');
      if (entry && entry.dataset.x !== '') this.onFocus(Number(entry.dataset.x), Number(entry.dataset.z));
      const sacred = target.closest<HTMLElement>('[data-sacred]');
      if (sacred) this.onSacred(sacred.dataset.sacred!);
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
    this.renderKey = '';
    this.onToggle(true);
  }

  close(): void {
    this.root.classList.add('hidden');
    this.onToggle(false);
  }

  update(sim: Simulation): void {
    const s = sim.state;
    const unread = Math.max(0, s.history.length - this.seen);
    this.badge.textContent = unread > 9 ? '9+' : String(unread);
    this.badge.classList.toggle('hidden', unread === 0 || this.open);
    if (!this.open) return;
    this.seen = s.history.length;
    const key = `${this.tab}|${s.history.length}|${s.history[s.history.length - 1]?.id}|${s.religions.map((r) => `${r.id}${r.followers.length}${r.active}`).join()}|${s.sacred.map((x) => `${x.stage}${x.decorations}${x.shrineProgress.toFixed(1)}${x.monumentProgress.toFixed(1)}`).join()}`;
    if (key === this.renderKey) return;
    this.renderKey = key;
    this.root.innerHTML = `
      <header class="book-head">
        <div><small>Property of the Intern · Do not show God</small><h2>${icon('book')} The Book of Questionable Miracles</h2></div>
        <button class="book-close insp-close" type="button" aria-label="Close">${icon('close')}</button>
      </header>
      <nav class="book-tabs">
        ${(['history', 'beliefs', 'sacred'] as Tab[])
          .map((t) => `<button type="button" data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${t === 'history' ? 'History' : t === 'beliefs' ? `Beliefs <b>${s.religions.filter((r) => r.active).length}</b>` : `Sacred Places <b>${s.sacred.length}</b>`}</button>`)
          .join('')}
      </nav>
      <div class="book-body">${this.tab === 'history' ? this.history(sim) : this.tab === 'beliefs' ? this.beliefs(sim) : this.sacredList(sim)}</div>`;
  }

  private history(sim: Simulation): string {
    const list = [...sim.state.history].reverse();
    if (!list.length) return `<p class="book-empty">Nothing questionable has happened yet. Give it a minute.</p>`;
    return `<ol class="chronicle">${list
      .map(
        (h) => `<li data-x="${h.x ?? ''}" data-z="${h.z ?? ''}" class="${h.x !== undefined ? 'linked' : ''} k-${h.kind}">
          <span class="c-day">Day ${h.day}</span>
          <span class="c-icon">${KIND_ICON[h.kind] ?? '•'}</span>
          <div><b>${escapeHtml(h.title)}</b><p>${escapeHtml(h.text)}</p></div>
        </li>`,
      )
      .join('')}</ol>`;
  }

  private beliefs(sim: Simulation): string {
    const rs = [...sim.state.religions].sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt);
    if (!rs.length) return `<p class="book-empty">No religions yet. The villagers are waiting for something remarkable to misunderstand.</p>`;
    return rs
      .map((r) => {
        const leader = r.leaderId ? sim.villager(r.leaderId) : undefined;
        const sacred = r.sacredEntityId ? sim.state.sacred.find((x) => x.id === r.sacredEntityId) : undefined;
        const color = `#${r.color.toString(16).padStart(6, '0')}`;
        const ritual = r.rituals[0];
        const hour = Math.floor(ritual.timeOfDay * 24);
        return `<article class="faith ${r.active ? '' : 'faded'}" style="--faith:${color}">
          <header><span class="faith-dot"></span><div><b>${escapeHtml(r.name)}</b><small>${r.active ? `Founded day ${Math.floor(r.createdAt / 360) + 1} · ${r.followers.length} followers · influence ${Math.round(r.influence * 100)}%` : 'Faded'}</small></div></header>
          ${r.active ? `<div class="bar"><i style="width:${Math.round(r.influence * 100)}%"></i></div>` : ''}
          <ul class="doctrine">${r.doctrine.map((d) => `<li>“${escapeHtml(d)}”</li>`).join('')}</ul>
          <div class="faith-meta">
            <span>Ritual: <b>${escapeHtml(ritual.name)}</b> daily at ${String(hour).padStart(2, '0')}:00${ritual.activeUntil > sim.state.time ? ' · <em>happening now</em>' : ''}</span>
            <span>Symbols: ${r.symbols.map(escapeHtml).join(', ')}</span>
            ${leader ? `<span>Leader: <b>${escapeHtml(leader.name)}</b>${leader.title ? `, ${escapeHtml(leader.title)}` : ''}</span>` : ''}
            ${sacred ? `<button type="button" class="link" data-sacred="${sacred.id}">${escapeHtml(sacred.label)} · ${STAGE_NAMES[sacred.stage]}</button>` : ''}
          </div>
          <small class="origin">${escapeHtml(ARCHETYPES[r.archetype]?.shouts[0] ?? '')}</small>
        </article>`;
      })
      .join('');
  }

  private sacredList(sim: Simulation): string {
    if (!sim.state.sacred.length) return `<p class="book-empty">No sacred places yet. Any rock can become one. Any.</p>`;
    return sim.state.sacred
      .map((x) => {
        const r = x.religionId ? sim.state.religions.find((q) => q.id === x.religionId) : undefined;
        return `<button type="button" class="sacred-row" data-sacred="${x.id}">
          <span class="stage">${'★'.repeat(x.stage)}${'☆'.repeat(5 - x.stage)}</span>
          <span><b>${escapeHtml(x.label)}</b><small>${STAGE_NAMES[x.stage]}${r ? ` · ${escapeHtml(r.name)}` : ''} · ${x.decorations} decorations</small></span>
        </button>`;
      })
      .join('');
  }
}

/** Small helper for the HUD indicator of major cultural events. */
export function cultureTicker(sim: Simulation): string {
  const c = sim.state.culture;
  const t = sim.state.time;
  const tags: string[] = [];
  if (c.festivalUntil > t) tags.push('Festival');
  if (c.picnicUntil > t) tags.push('Eternal Picnic');
  if (c.upsideDownUntil > t) tags.push('Upside-Down Day');
  if (c.trial) tags.push('Cloud Trial');
  if (c.cursedWell) tags.push('Cursed Well');
  if (c.silence) tags.push('Great Silence');
  if (c.decree && c.decree.until > t) tags.push(`Decree: ${c.decree.kind.replace('-', ' ')}`);
  if (sim.state.religions.some((r) => r.active && r.rituals.some((x) => x.activeUntil > t))) tags.push('Ritual');
  return tags.join(' · ');
}

export { el };
