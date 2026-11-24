import { CONFIG, type PowerId } from '../core/Config';
import type { PrayerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { $, el, escapeHtml, icon, setText } from './dom';
import { ICON } from './Icons';

const URGENCY = ['', 'Request', 'Important', 'Urgent'];

/** The power that usually answers a prayer, and where to aim (null: just wait). */
export function suggestedPower(sim: Simulation, p: PrayerData): { power: PowerId; x: number; z: number; hint: string } | null {
  const v = sim.village(p.villageId);
  if (!v) return null;
  const well = sim.building(v.wellId) ?? { x: v.centerX, z: v.centerZ };
  switch (p.type) {
    case 'THIRST':
    case 'PURIFY':
      return { power: 'rain', x: well.x, z: well.z, hint: 'Rain over the well' };
    case 'HUNGER': {
      const farm = sim.state.buildings.find((b) => b.villageId === v.id && b.type === 'farm' && !b.destroyed);
      return { power: 'rain', x: farm?.x ?? v.centerX, z: farm?.z ?? v.centerZ, hint: 'Rain on the fields' };
    }
    case 'FIRE': {
      const f = sim.state.fires.filter((q) => q.intensity > 0).sort((a, b) => Math.hypot(a.x - v.centerX, a.z - v.centerZ) - Math.hypot(b.x - v.centerX, b.z - v.centerZ))[0];
      return { power: 'rain', x: f?.x ?? v.centerX, z: f?.z ?? v.centerZ, hint: 'Rain on the fire' };
    }
    case 'GREEN':
    case 'PANIC':
      return { power: 'nature', x: p.targetX, z: p.targetZ, hint: p.type === 'PANIC' ? 'Something gentle: a tree' : 'Plant trees nearby' };
    case 'ROCK_KING': {
      const rock = sim.state.rocks.find((r) => r.id === sim.state.culture.rockKingId);
      return { power: 'lightning', x: rock?.x ?? p.targetX, z: rock?.z ?? p.targetZ, hint: 'A sign: lightning on the Rock King' };
    }
    case 'STILL_EMPLOYED':
    case 'EQUAL_TREATMENT':
      return { power: 'rain', x: well.x, z: well.z, hint: 'Any kind miracle here' };
    default:
      return null; // FLOOD, WIND: patience is the answer
  }
}

/**
 * v0.5 prayers (right side): at most two expanded cards, the rest in a compact
 * inbox. Each card says who is asking, what they want, the suggested action,
 * the reward and the urgency, with Focus, Suggested power (selects the power and
 * flies the camera there; the player still casts) and Minimize buttons.
 */
export class PrayerPanel {
  private readonly root = $('#prayer-panel');
  private readonly list = $('#prayer-list');
  private readonly inbox = $('#prayer-inbox');
  private readonly count = $('#prayer-count');
  private readonly cards = new Map<string, HTMLElement>();
  private readonly minimized = new Set<string>();
  private inboxOpen = false;
  private inboxKey = '';
  private sim: Simulation | null = null;
  onFocus: (p: PrayerData) => void = () => {};
  onSuggest: (p: PrayerData, power: PowerId, x: number, z: number) => void = () => {};
  onToggle: () => void = () => {};
  /** Collapse to the inbox chip (while the inspector uses the right side). */
  compact = false;

  constructor() {
    $('#prayer-toggle').addEventListener('click', () => {
      this.inboxOpen = !this.inboxOpen;
      this.inboxKey = '';
      $('#prayer-toggle').setAttribute('aria-expanded', String(this.inboxOpen));
      this.onToggle();
    });
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const node = t.closest<HTMLElement>('[data-prayer-id]');
      if (!node || !this.sim) return;
      const p = this.sim.state.prayers.find((x) => x.id === node.dataset.prayerId);
      if (!p) return;
      if (t.closest('[data-act=min]')) {
        this.minimized.add(p.id);
        this.inboxKey = '';
      } else if (t.closest('[data-act=expand]')) {
        this.minimized.delete(p.id);
        this.inboxOpen = false;
        this.inboxKey = '';
      } else if (t.closest('[data-act=suggest]')) {
        const s = suggestedPower(this.sim, p);
        if (s) this.onSuggest(p, s.power, s.x, s.z);
      } else if (t.closest('[data-act=focus]')) this.onFocus(p);
    });
  }

  setCollapsed(collapsed: boolean): void {
    this.compact = collapsed;
  }

  update(sim: Simulation): void {
    this.sim = sim;
    const s = sim.state;
    const active = s.prayers.filter((p) => p.status === 'active').sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    const expanded = this.compact ? [] : active.filter((p) => !this.minimized.has(p.id)).slice(0, 2);
    const rest = active.filter((p) => !expanded.includes(p));
    setText(this.count, String(active.length));
    this.root.classList.toggle('empty', active.length === 0);
    this.root.classList.toggle('compact', this.compact);
    $('#prayer-toggle').classList.toggle('has-more', rest.length > 0);
    setText($('#prayer-more'), rest.length ? `+${rest.length} in inbox` : active.length ? '' : 'None right now');
    const keep = new Set(expanded.map((p) => p.id));
    for (const p of expanded) {
      let card = this.cards.get(p.id);
      if (!card) {
        card = this.createCard(sim, p);
        this.cards.set(p.id, card);
        this.list.append(card);
      }
      card.querySelector<HTMLElement>('.bar i')!.style.width = `${Math.round(p.progress * 100)}%`;
      setText(card.querySelector<HTMLElement>('.pct')!, `${Math.round(p.progress * 100)}%`);
      const timer = card.querySelector<HTMLElement>('.timer')!;
      if (p.expiresAt !== undefined) {
        const left = Math.max(0, p.expiresAt - s.time);
        setText(timer, `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`);
        timer.classList.toggle('late', left < 30);
      }
    }
    for (const [id, card] of this.cards) {
      if (keep.has(id)) continue;
      if (card.dataset.leaving) continue;
      const p = s.prayers.find((x) => x.id === id);
      card.dataset.leaving = '1';
      if (p && p.status === 'active') {
        card.remove();
        this.cards.delete(id);
        continue;
      }
      card.classList.add(p?.status === 'failed' ? 'failed' : 'done');
      window.setTimeout(() => {
        card.remove();
        this.cards.delete(id);
      }, 900);
    }
    for (const id of [...this.minimized]) if (!active.some((p) => p.id === id)) this.minimized.delete(id);
    // Compact inbox list.
    this.inbox.classList.toggle('hidden', !this.inboxOpen || rest.length === 0);
    if (this.inboxOpen) {
      const key = rest.map((p) => p.id + p.priority).join();
      if (key !== this.inboxKey) {
        this.inboxKey = key;
        this.inbox.innerHTML = rest
          .map((p) => {
            const v = sim.village(p.villageId);
            return `<li data-prayer-id="${p.id}" class="p${p.priority}"><button type="button" data-act="expand"><b>${escapeHtml(p.title)}</b><small>${escapeHtml(v?.name ?? '')} · ${URGENCY[p.priority]}</small></button><button type="button" class="pi-focus" data-act="focus" aria-label="Focus ${escapeHtml(v?.name ?? '')}">${icon('pin')}</button></li>`;
          })
          .join('');
      }
    }
  }

  private createCard(sim: Simulation, p: PrayerData): HTMLElement {
    const village = sim.village(p.villageId);
    const sug = suggestedPower(sim, p);
    const card = el('article', `prayer p${p.priority}`);
    card.dataset.prayerId = p.id;
    card.dataset.prayer = p.type;
    const xp = CONFIG.career.xp.prayer + (p.type === 'THIRST' || p.type === 'HUNGER' ? CONFIG.career.xp.shortage : 0);
    const reward = sim.state.mode === 'career' ? `+${xp} XP · +${p.reward} ${icon('energy')}` : `+${p.reward} ${icon('energy')}`;
    card.innerHTML = `
      <div class="prayer-top"><span class="urgency u${p.priority}">${p.priority >= 3 ? '!! ' : p.priority === 2 ? '! ' : ''}${URGENCY[p.priority]}</span><small>${icon('pin')} ${escapeHtml(village?.name ?? 'Unknown')}</small><button type="button" class="pr-min" data-act="min" aria-label="Minimize prayer">${icon('chevron')}</button></div>
      <h5>${escapeHtml(p.title)}</h5>
      <q>${escapeHtml(p.description)}</q>
      <div class="objective"><span>${escapeHtml(p.objective)}</span><span class="pct">0%</span></div>
      <div class="bar"><i style="width:0%"></i></div>
      <div class="prayer-meta"><span class="reward">${reward}</span><span class="timer"></span></div>
      <div class="prayer-actions">
        <button type="button" class="btn small" data-act="focus">${icon('pin')} Focus</button>
        ${sug ? `<button type="button" class="btn small primary" data-act="suggest" title="${escapeHtml(sug.hint)}">${ICON[sug.power]} ${escapeHtml(sim.powers.powers[sug.power].name)}</button>` : '<span class="pr-wait">Just wait it out</span>'}
      </div>
      ${sug ? `<small class="pr-hint">Suggested: ${escapeHtml(sug.hint)}</small>` : ''}`;
    return card;
  }

  clear(): void {
    for (const card of this.cards.values()) card.remove();
    this.cards.clear();
    this.minimized.clear();
  }
}
