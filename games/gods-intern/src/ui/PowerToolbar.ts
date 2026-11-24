import { POWER_CATEGORY, POWER_ORDER, type PowerCategory, type PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, el, escapeHtml, icon } from './dom';
import { ICON } from './Icons';

export const POWER_ACCENT: Record<PowerId, string> = {
  rain: '#3aa0ff',
  lightning: '#ffcf33',
  nature: '#4fbf5a',
  fire: '#ff7a33',
  mutation: '#b86bff',
  tornado: '#6cc4b8',
  freeze: '#7cc8f2',
  gravity: '#9d86f0',
  terraform: '#a8c86a',
  timewarp: '#e8b04a',
  possession: '#5fd3b0',
  meteor: '#ff5c3a',
  resurrection: '#f2d36b',
};

const EFFECTS: Record<PowerId, string> = {
  rain: 'Fills wells · grows crops · douses fire',
  lightning: 'Ignites trees · damages buildings · inspires faith',
  nature: 'Grows a tree · calms villagers · future wood',
  fire: 'Burns and spreads · rain stops it',
  mutation: 'Villager → giant head · tree → gold · rock → legs',
  tornado: 'Scatters rocks · uproots trees · fans or snuffs fire',
  freeze: 'Puts out fire · pauses growth · slows everyone',
  gravity: 'Villagers and rocks float, then settle',
  terraform: 'T toggles raise / lower · buildings protected',
  timewarp: 'T toggles fast / slow time in a bubble',
  possession: 'Walk as a villager · E interacts · Q exits',
  meteor: '3 s warning · crater · fire · a sacred fragment',
  resurrection: 'Click a grave · the same villager returns',
};

export const DEFAULT_SLOTS: PowerId[] = ['rain', 'lightning', 'nature', 'fire', 'mutation', 'tornado'];
const CATEGORIES: PowerCategory[] = ['Creation', 'Weather', 'Destruction', 'Reality', 'Life'];

/**
 * Scalable power selection: Look + six assignable quick slots on the bar (keys 1–6),
 * and a categorized menu (key G) with every power, lock reasons and slot assignment.
 */
export class PowerToolbar {
  private readonly root = $('#toolbar');
  private readonly tip = $('#tool-tip');
  private readonly menu: HTMLElement;
  private readonly slotButtons: HTMLButtonElement[] = [];
  private readonly inspect: HTMLButtonElement;
  private readonly more: HTMLButtonElement;
  private readonly modeChip: HTMLButtonElement;
  private menuKey = '';
  private sim: Simulation;
  slots: PowerId[];
  onSelect: (id: PowerId | null) => void = () => {};
  onHover: () => void = () => {};
  onSlotsChanged: (slots: PowerId[]) => void = () => {};
  onToggleMode: () => void = () => {};
  onMenu: (open: boolean) => void = () => {};
  highlight: PowerId | null = null;

  constructor(sim: Simulation, slots: PowerId[] = DEFAULT_SLOTS) {
    this.sim = sim;
    this.slots = slots.length === 6 ? [...slots] : [...DEFAULT_SLOTS];
    this.inspect = el('button', 'power inspect', `<span class="p-key">0</span><span class="p-icon">${ICON.hand}</span><span class="p-name">Look</span>`);
    this.inspect.type = 'button';
    this.inspect.addEventListener('click', () => this.onSelect(null));
    this.attachTip(this.inspect, () => `<h4>Look <small>0 / Esc</small></h4><p>Hover or tap villagers to read their minds. Click a building to inspect its village.</p>`);
    this.root.append(this.inspect, el('span', 'tool-divider'));
    for (let i = 0; i < 6; i++) {
      const b = el('button', 'power') as HTMLButtonElement;
      b.type = 'button';
      b.dataset.slot = String(i);
      b.addEventListener('click', () => this.onSelect(this.slots[i]));
      this.attachTip(b, () => this.tipFor(this.slots[i], i + 1));
      this.slotButtons.push(b);
      this.root.append(b);
    }
    this.more = el('button', 'power more', `<span class="p-key">G</span><span class="p-icon">${ICON.grid}</span><span class="p-name">All powers</span><span class="p-badge hidden"></span>`) as HTMLButtonElement;
    this.more.type = 'button';
    this.more.addEventListener('click', () => this.toggleMenu());
    this.attachTip(this.more, () => '<h4>All powers <small>G</small></h4><p>Every power by category. Assign any power to a quick slot.</p>');
    this.root.append(this.more);
    this.modeChip = el('button', 'mode-chip hidden', '') as HTMLButtonElement;
    this.modeChip.type = 'button';
    this.modeChip.addEventListener('click', () => this.onToggleMode());
    this.root.append(this.modeChip);
    this.menu = $('#power-menu');
    this.menu.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.pm-close')) return this.closeMenu();
      const assign = t.closest<HTMLElement>('[data-assign]');
      if (assign) {
        const id = assign.dataset.power as PowerId;
        const slot = Number(assign.dataset.assign);
        const prev = this.slots.indexOf(id);
        if (prev >= 0) this.slots[prev] = this.slots[slot];
        this.slots[slot] = id;
        this.menuKey = '';
        this.renderSlots();
        this.onSlotsChanged([...this.slots]);
        return;
      }
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (pick) {
        this.onSelect(pick.dataset.pick as PowerId);
        this.closeMenu();
      }
    });
    this.renderSlots();
  }

  get menuOpen(): boolean {
    return !this.menu.classList.contains('hidden');
  }

  toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else {
      this.menu.classList.remove('hidden');
      this.menuKey = '';
      this.onMenu(true);
    }
  }

  closeMenu(): void {
    if (!this.menuOpen) return;
    this.menu.classList.add('hidden');
    this.onMenu(false);
  }

  slot(i: number): PowerId | undefined {
    return this.slots[i];
  }

  private tipFor(id: PowerId, key: number | null): string {
    const sim = this.sim;
    const p = sim.powers.powers[id];
    const lock = sim.powers.lockReason(id);
    return `<h4>${p.name} <small>${key ? `key ${key} · ` : ''}${POWER_CATEGORY[id]}</small></h4><p>${p.description}</p>` +
      `<div class="tip-stats"><span>⚡ ${p.energyCost} energy</span><span>⟳ ${p.cooldown}s</span></div>` +
      `<p style="margin-top:6px;opacity:.75">${lock ? `🔒 ${escapeHtml(lock)}` : EFFECTS[id]}</p>`;
  }

  private renderSlots(): void {
    this.slotButtons.forEach((b, i) => {
      const id = this.slots[i];
      const p = this.sim.powers.powers[id];
      b.dataset.power = id;
      b.style.setProperty('--accent', POWER_ACCENT[id]);
      b.innerHTML =
        `<span class="p-key">${i + 1}</span><span class="p-lock">${ICON.lock}</span><span class="p-icon">${ICON[id]}</span>` +
        `<span class="p-name">${p.name}</span><span class="p-cost">${icon('energy')}${p.energyCost}</span><span class="p-cool"></span>`;
    });
  }

  private attachTip(button: HTMLElement, html: () => string): void {
    button.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      this.tip.innerHTML = html();
      this.tip.classList.remove('hidden');
      const rect = button.getBoundingClientRect();
      const bar = this.root.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 140, Math.max(140, rect.left + rect.width / 2));
      this.tip.style.left = `${x}px`;
      this.tip.style.bottom = `${window.innerHeight - bar.top + 12}px`;
      this.onHover();
    });
    button.addEventListener('pointerleave', () => this.tip.classList.add('hidden'));
  }

  flashUnlocked(ids: PowerId[]): void {
    for (const id of ids) {
      const i = this.slots.indexOf(id);
      const b = i >= 0 ? this.slotButtons[i] : this.more;
      b.classList.remove('unlocked-flash');
      void b.offsetWidth;
      b.classList.add('unlocked-flash');
    }
  }

  update(sim: Simulation, selected: PowerId | null): void {
    this.sim = sim;
    const s = sim.state;
    this.inspect.classList.toggle('selected', selected === null);
    this.slotButtons.forEach((b, i) => {
      const id = this.slots[i];
      const p = sim.powers.powers[id];
      const locked = !s.unlockedPowers.includes(id);
      b.classList.toggle('locked', locked);
      b.classList.toggle('selected', selected === id);
      b.classList.toggle('poor', !locked && !sim.unlimitedEnergy && s.energy < p.energyCost);
      b.classList.toggle('highlight', this.highlight === id && selected !== id);
      const cd = s.cooldowns[id] / Math.max(0.01, sim.powers.cooldownFor(id));
      b.style.setProperty('--cool', `${Math.max(0, Math.min(1, cd)) * 100}%`);
      b.setAttribute('aria-pressed', String(selected === id));
      b.setAttribute('aria-disabled', String(locked));
    });
    // Selected power outside the quick slots shows on the "All powers" button.
    const offBar = selected && !this.slots.includes(selected);
    this.more.classList.toggle('selected', !!offBar);
    if (offBar) this.more.style.setProperty('--accent', POWER_ACCENT[selected]);
    const unlockedOff = POWER_ORDER.filter((id) => !this.slots.includes(id) && s.unlockedPowers.includes(id)).length;
    const badge = this.more.querySelector<HTMLElement>('.p-badge')!;
    badge.textContent = String(unlockedOff);
    badge.classList.toggle('hidden', unlockedOff === 0);
    // Mode toggle for Terraform / Time Warp.
    const modal = selected === 'terraform' || selected === 'timewarp';
    this.modeChip.classList.toggle('hidden', !modal);
    if (modal) {
      const text = selected === 'terraform' ? (sim.powers.terraform.mode === 'raise' ? '▲ Raise' : '▼ Lower') : sim.powers.timewarp.mode === 'fast' ? '⏩ Fast' : '⏪ Slow';
      if (this.modeChip.textContent !== `${text} · T`) this.modeChip.textContent = `${text} · T`;
    }
    if (this.menuOpen) this.renderMenu(sim, selected);
  }

  private renderMenu(sim: Simulation, selected: PowerId | null): void {
    const s = sim.state;
    const key = `${s.unlockedPowers.join()}|${this.slots.join()}|${selected}|${Math.floor(s.energy / 5)}`;
    if (key === this.menuKey) return;
    this.menuKey = key;
    this.menu.innerHTML = `
      <header class="pm-head"><div><small>Requisition form 13-B</small><h2>${icon('grid')} Divine Powers</h2></div>
      <button class="pm-close insp-close" type="button" aria-label="Close">${icon('close')}</button></header>
      <div class="pm-body">${CATEGORIES.map(
        (cat) => `<section><h3>${cat}</h3><div class="pm-row">${POWER_ORDER.filter((id) => POWER_CATEGORY[id] === cat)
          .map((id) => {
            const p = sim.powers.powers[id];
            const lock = sim.powers.lockReason(id);
            const slot = this.slots.indexOf(id);
            return `<article class="pm-card ${lock ? 'locked' : ''} ${selected === id ? 'on' : ''}" style="--accent:${POWER_ACCENT[id]}">
              <button type="button" class="pm-pick" data-pick="${id}" ${lock ? 'disabled' : ''}><span class="p-icon">${ICON[id]}</span><b>${p.name}</b><small>${lock ? `🔒 ${escapeHtml(lock)}` : EFFECTS[id]}</small><em>⚡${p.energyCost} · ⟳${p.cooldown}s${slot >= 0 ? ` · key ${slot + 1}` : ''}</em></button>
              <div class="pm-slots" aria-label="Assign ${p.name} to a quick slot">${[0, 1, 2, 3, 4, 5].map((i) => `<button type="button" data-assign="${i}" data-power="${id}" class="${slot === i ? 'on' : ''}" title="Put ${p.name} on key ${i + 1}">${i + 1}</button>`).join('')}</div>
            </article>`;
          })
          .join('')}</div></section>`,
      ).join('')}</div>`;
  }

  rect(id: PowerId): DOMRect | null {
    const i = this.slots.indexOf(id);
    return (i >= 0 ? this.slotButtons[i] : this.more).getBoundingClientRect();
  }
}
