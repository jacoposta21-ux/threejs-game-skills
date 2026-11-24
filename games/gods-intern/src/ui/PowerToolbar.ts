import { RANK_TITLES } from '../career/CareerSystem';
import { CONFIG, POWER_CATEGORY, POWER_ORDER, POWER_UNLOCK_RANK, type PowerCategory, type PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, el, escapeHtml, icon, setText } from './dom';
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

/** One-line pitch per power (All Powers cards). */
export const POWER_PITCH: Record<PowerId, string> = {
  rain: 'Fill wells, water crops and put out fires. Too much floods the village.',
  lightning: 'A bolt from above. Sets things alight, impresses rocks, inspires religions.',
  nature: 'Grow a tree wherever you point. Calms villagers, feeds future carpenters.',
  fire: 'Start a fire. It spreads. Rain stops it. Villagers have opinions.',
  mutation: 'Make something wonderfully wrong: a giant head, a golden tree, a rock with legs.',
  tornado: 'A wandering wind that rearranges rocks, trees and the occasional roof.',
  freeze: 'Freeze an area: fires go out, growth pauses, everyone moves slowly.',
  gravity: 'Switch gravity off for a while. Villagers and rocks float, then settle.',
  terraform: 'Raise hills or dig hollows. Buildings and water are protected.',
  timewarp: 'Speed time up or slow it down inside a bubble.',
  possession: 'Become a villager for 45 seconds. Walk, talk, visit other villages.',
  meteor: 'Bring a very large problem down from the sky.',
  resurrection: 'Bring a departed villager back from their grave. The same one.',
};

/** How to use it (shown on the card and in the targeting bar). */
export const POWER_HOWTO: Record<PowerId, string> = {
  rain: 'Click near a well or field.',
  lightning: 'Click a tree, rock or building.',
  nature: 'Click open ground.',
  fire: 'Click a tree or a building.',
  mutation: 'Click a villager, tree or rock.',
  tornado: 'Click open ground. It wanders from there.',
  freeze: 'Click an area, ideally one that is on fire.',
  gravity: 'Click a crowd or a pile of rocks.',
  terraform: 'Choose Raise or Lower, then click open ground.',
  timewarp: 'Choose Accelerate or Slow, then click an area.',
  possession: 'Click a villager. Walk with the on-screen pad or WASD.',
  meteor: 'Click a spot. You get a 3-second warning.',
  resurrection: 'Click a grave marker.',
};

export const DEFAULT_SLOTS: PowerId[] = ['rain', 'lightning', 'nature', 'fire', 'mutation', 'tornado', 'freeze'];
export const SLOT_COUNT = 7;
const CATEGORIES: Array<{ id: PowerCategory; blurb: string }> = [
  { id: 'Creation', blurb: 'Make things. Mostly trees.' },
  { id: 'Weather', blurb: 'The sky, but on purpose.' },
  { id: 'Destruction', blurb: 'For when things are too fine.' },
  { id: 'Reality', blurb: 'Physics is more of a suggestion.' },
];

export type TargetState = { valid: boolean; reason: string } | null;

/**
 * v0.5 power dock (bottom center): icon, name, cost, cooldown, selection and lock
 * state for 6–7 quick slots, a labeled ALL POWERS button, and a targeting bar that
 * appears when a power is selected (what to click, valid/invalid target, mode
 * buttons for Terraform/Time Warp, and an explicit Cancel button).
 * The All Powers panel lists every power by category with unlock requirements,
 * progress and mastery, and assigns powers to slots by tap or click.
 */
export class PowerToolbar {
  private readonly root = $('#toolbar');
  private readonly tip = $('#tool-tip');
  private readonly menu = $('#power-menu');
  private readonly row: HTMLElement;
  private readonly context: HTMLElement;
  private readonly slotButtons: HTMLButtonElement[] = [];
  private readonly more: HTMLButtonElement;
  private menuKey = '';
  private contextKey = '';
  private assigning: PowerId | null = null;
  private sim: Simulation;
  slots: PowerId[];
  onSelect: (id: PowerId | null) => void = () => {};
  onHover: () => void = () => {};
  onSlotsChanged: (slots: PowerId[]) => void = () => {};
  onToggleMode: () => void = () => {};
  onSetMode: (mode: string) => void = () => {};
  onMenu: (open: boolean) => void = () => {};
  highlight: PowerId | null = null;
  target: TargetState = null;

  constructor(sim: Simulation, slots: PowerId[] = DEFAULT_SLOTS) {
    this.sim = sim;
    this.slots = slots.length === SLOT_COUNT && new Set(slots).size === SLOT_COUNT ? [...slots] : [...DEFAULT_SLOTS];
    this.context = el('div', 'dock-context hidden');
    this.context.setAttribute('role', 'status');
    this.context.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-cancel]')) this.onSelect(null);
      const mode = t.closest<HTMLElement>('[data-mode]');
      if (mode) this.onSetMode(mode.dataset.mode!);
    });
    this.row = el('div', 'dock-row');
    for (let i = 0; i < SLOT_COUNT; i++) {
      const b = el('button', 'power') as HTMLButtonElement;
      b.type = 'button';
      b.dataset.slot = String(i);
      b.addEventListener('click', () => {
        const id = this.slots[i];
        if (this.selectedId === id) this.onSelect(null);
        else this.onSelect(id);
      });
      this.attachTip(b, () => this.tipFor(this.slots[i], i + 1));
      this.slotButtons.push(b);
      this.row.append(b);
    }
    this.more = el('button', 'power more', `<span class="p-icon">${ICON.grid}</span><span class="p-name">ALL POWERS</span><span class="p-badge hidden"></span>`) as HTMLButtonElement;
    this.more.type = 'button';
    this.more.setAttribute('aria-haspopup', 'dialog');
    this.more.addEventListener('click', () => this.toggleMenu());
    this.row.append(this.more);
    this.root.append(this.context, this.row);
    this.menu.setAttribute('role', 'dialog');
    this.menu.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.pm-close')) return this.closeMenu();
      const assign = t.closest<HTMLElement>('[data-assign]');
      if (assign) {
        this.assign(assign.dataset.power as PowerId, Number(assign.dataset.assign));
        return;
      }
      const start = t.closest<HTMLElement>('[data-start-assign]');
      if (start) {
        const id = start.dataset.startAssign as PowerId;
        this.assigning = this.assigning === id ? null : id;
        this.menuKey = '';
        return;
      }
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (pick && !(pick as HTMLButtonElement).disabled) {
        this.onSelect(pick.dataset.pick as PowerId);
        this.closeMenu();
      }
    });
    this.renderSlots();
  }

  private selectedId: PowerId | null = null;

  get menuOpen(): boolean {
    return !this.menu.classList.contains('hidden');
  }

  toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else {
      this.menu.classList.remove('hidden');
      this.menuKey = '';
      this.assigning = null;
      this.onMenu(true);
      this.renderMenu(this.sim, this.selectedId);
      this.menu.querySelector<HTMLButtonElement>('.pm-close')?.focus({ preventScroll: true });
    }
  }

  closeMenu(): void {
    if (!this.menuOpen) return;
    this.menu.classList.add('hidden');
    this.assigning = null;
    this.onMenu(false);
  }

  slot(i: number): PowerId | undefined {
    return this.slots[i];
  }

  private assign(id: PowerId, slot: number): void {
    const prev = this.slots.indexOf(id);
    if (prev >= 0) this.slots[prev] = this.slots[slot];
    this.slots[slot] = id;
    this.assigning = null;
    this.menuKey = '';
    this.renderSlots();
    this.onSlotsChanged([...this.slots]);
  }

  private tipFor(id: PowerId, key: number | null): string {
    const p = this.sim.powers.powers[id];
    const lock = this.sim.powers.lockReason(id);
    return `<h4>${p.name}${key ? ` <small>key ${key}</small>` : ''}</h4><p>${POWER_PITCH[id]}</p>` +
      `<div class="tip-stats"><span>${icon('energy')} ${p.energyCost} energy</span><span>⟳ ${p.cooldown}s cooldown</span></div>` +
      `<p class="tip-foot">${lock ? `${icon('lock')} ${escapeHtml(lock)}` : escapeHtml(POWER_HOWTO[id])}</p>`;
  }

  private renderSlots(): void {
    this.slotButtons.forEach((b, i) => {
      const id = this.slots[i];
      const p = this.sim.powers.powers[id];
      b.dataset.power = id;
      b.style.setProperty('--accent', POWER_ACCENT[id]);
      b.setAttribute('aria-label', `${p.name}, key ${i + 1}`);
      b.innerHTML =
        `<span class="p-key" aria-hidden="true">${i + 1}</span><span class="p-icon">${ICON[id]}</span>` +
        `<span class="p-name">${p.name}</span><span class="p-state"><span class="p-cost">${icon('energy')}${p.energyCost}</span></span>` +
        `<span class="p-cool" aria-hidden="true"></span><span class="p-lock" aria-hidden="true">${ICON.lock}</span>`;
    });
  }

  private attachTip(button: HTMLElement, html: () => string): void {
    button.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') return;
      this.tip.innerHTML = html();
      this.tip.classList.remove('hidden');
      const rect = button.getBoundingClientRect();
      const bar = this.root.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 150, Math.max(150, rect.left + rect.width / 2));
      this.tip.style.left = `${x}px`;
      this.tip.style.bottom = `${window.innerHeight - bar.top + 10}px`;
      this.onHover();
    });
    button.addEventListener('pointerleave', () => this.tip.classList.add('hidden'));
    button.addEventListener('click', () => this.tip.classList.add('hidden'));
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

  /** State text for a slot: never color-only. */
  private stateOf(sim: Simulation, id: PowerId): { cls: string; text: string } {
    const s = sim.state;
    const p = sim.powers.powers[id];
    if (!s.unlockedPowers.includes(id)) return { cls: 'locked', text: 'Locked' };
    const cd = s.cooldowns[id];
    if (cd > 0.05) return { cls: 'cooling', text: `${cd.toFixed(cd < 10 ? 1 : 0)}s` };
    if (!sim.unlimitedEnergy && s.energy < p.energyCost) return { cls: 'poor', text: `Need ${p.energyCost}` };
    return { cls: 'ready', text: '' };
  }

  update(sim: Simulation, selected: PowerId | null): void {
    this.sim = sim;
    this.selectedId = selected;
    this.slotButtons.forEach((b, i) => {
      const id = this.slots[i];
      const p = sim.powers.powers[id];
      const st = this.stateOf(sim, id);
      b.classList.toggle('locked', st.cls === 'locked');
      b.classList.toggle('poor', st.cls === 'poor');
      b.classList.toggle('cooling', st.cls === 'cooling');
      b.classList.toggle('selected', selected === id);
      b.classList.toggle('highlight', this.highlight === id && selected !== id);
      const cd = sim.state.cooldowns[id] / Math.max(0.01, sim.powers.cooldownFor(id));
      b.style.setProperty('--cool', `${Math.max(0, Math.min(1, cd)) * 100}%`);
      const stateNode = b.querySelector<HTMLElement>('.p-state')!;
      const text = st.text || `${p.energyCost}`;
      if (stateNode.dataset.t !== `${st.cls}|${text}`) {
        stateNode.dataset.t = `${st.cls}|${text}`;
        stateNode.innerHTML = st.cls === 'ready' ? `<span class="p-cost">${icon('energy')}${p.energyCost}</span>` : st.cls === 'locked' ? `${icon('lock')} Locked` : st.cls === 'poor' ? `${icon('energy')}${text}` : `⟳ ${text}`;
      }
      b.setAttribute('aria-pressed', String(selected === id));
      b.setAttribute('aria-disabled', String(st.cls === 'locked'));
    });
    const offBar = !!selected && !this.slots.includes(selected);
    this.more.classList.toggle('selected', offBar);
    if (offBar) this.more.style.setProperty('--accent', POWER_ACCENT[selected]);
    this.more.classList.toggle('open', this.menuOpen);
    const unlockedOff = POWER_ORDER.filter((id) => !this.slots.includes(id) && sim.state.unlockedPowers.includes(id)).length;
    const badge = this.more.querySelector<HTMLElement>('.p-badge')!;
    setText(badge, String(unlockedOff));
    badge.classList.toggle('hidden', unlockedOff === 0);
    this.renderContext(sim, selected);
    if (this.menuOpen) this.renderMenu(sim, selected);
  }

  /** Targeting bar above the dock. */
  private renderContext(sim: Simulation, selected: PowerId | null): void {
    this.context.classList.toggle('hidden', !selected);
    this.root.classList.toggle('targeting', !!selected);
    if (!selected) {
      this.contextKey = '';
      return;
    }
    const p = sim.powers.powers[selected];
    const t = this.target;
    const st = this.stateOf(sim, selected);
    const status = st.cls === 'poor' ? { cls: 'bad', text: `Not enough energy (${p.energyCost} needed)` }
      : st.cls === 'cooling' ? { cls: 'wait', text: `Recharging · ${st.text}` }
        : !t ? { cls: 'idle', text: 'Point at the island' }
          : t.valid ? { cls: 'ok', text: '✓ Valid target' } : { cls: 'bad', text: `✕ ${t.reason}` };
    let modes = '';
    if (selected === 'terraform') {
      const m = sim.powers.terraform.mode;
      modes = `<div class="dc-modes" role="group" aria-label="Terraform mode"><button type="button" data-mode="raise" class="${m === 'raise' ? 'on' : ''}" aria-pressed="${m === 'raise'}">▲ Raise</button><button type="button" data-mode="lower" class="${m === 'lower' ? 'on' : ''}" aria-pressed="${m === 'lower'}">▼ Lower</button></div>`;
    } else if (selected === 'timewarp') {
      const m = sim.powers.timewarp.mode;
      modes = `<div class="dc-modes" role="group" aria-label="Time Warp mode"><button type="button" data-mode="fast" class="${m === 'fast' ? 'on' : ''}" aria-pressed="${m === 'fast'}">⏩ Accelerate</button><button type="button" data-mode="slow" class="${m === 'slow' ? 'on' : ''}" aria-pressed="${m === 'slow'}">⏪ Slow</button></div>`;
    }
    const key = `${selected}|${status.cls}|${status.text}|${modes}`;
    if (key === this.contextKey) return;
    this.contextKey = key;
    this.context.style.setProperty('--accent', POWER_ACCENT[selected]);
    this.context.innerHTML = `<span class="dc-icon">${ICON[selected]}</span>
      <div class="dc-text"><b>${p.name}</b><small>${escapeHtml(POWER_HOWTO[selected])}</small></div>
      <span class="dc-status ${status.cls}">${escapeHtml(status.text)}</span>${modes}
      <button type="button" class="dc-cancel" data-cancel aria-label="Cancel ${p.name}">${icon('close')} Cancel</button>`;
  }

  /** Unlock requirement and progress for the All Powers panel. */
  private requirement(sim: Simulation, id: PowerId): { text: string; progress: number; detail: string } | null {
    const s = sim.state;
    if (s.unlockedPowers.includes(id)) return null;
    if (!s.tutorial.done) return { text: 'Finish your first miracle', progress: 0, detail: '' };
    if (s.mode === 'creative') return null;
    const xp = s.career.xp;
    if (id === 'mutation') {
      const need = CONFIG.career.mutationXp;
      return { text: `Unlock: Probation review (${need} career XP)`, progress: Math.min(1, xp / need), detail: `${xp} / ${need} XP · sooner with high Chaos` };
    }
    const rank = POWER_UNLOCK_RANK[id];
    if (!rank) return { text: 'Locked', progress: 0, detail: '' };
    const need = CONFIG.career.thresholds[rank - 1];
    return { text: `Unlock: Heavenly Career Rank ${rank} · ${RANK_TITLES[rank - 1]}`, progress: Math.min(1, xp / need), detail: `${xp} / ${need} XP` };
  }

  private renderMenu(sim: Simulation, selected: PowerId | null): void {
    const s = sim.state;
    const key = `${s.unlockedPowers.join()}|${this.slots.join()}|${selected}|${this.assigning}|${s.career.xp}|${Object.keys(s.career.awarded).length}|${s.mode}`;
    if (key === this.menuKey) return;
    this.menuKey = key;
    const card = (id: PowerId) => {
      const p = sim.powers.powers[id];
      const req = this.requirement(sim, id);
      const slot = this.slots.indexOf(id);
      const mastery = req ? [] : sim.mastery.goals(id);
      const assigning = this.assigning === id;
      return `<article class="pm-card ${req ? 'locked' : ''} ${selected === id ? 'on' : ''}" style="--accent:${POWER_ACCENT[id]}" data-card="${id}">
        <header><span class="p-icon">${ICON[id]}</span><div><b>${escapeHtml(p.name.toUpperCase())}</b><small>${icon('energy')} ${p.energyCost} · ⟳ ${p.cooldown}s${slot >= 0 ? ` · key ${slot + 1}` : ''}</small></div>${req ? `<span class="pm-lock">${icon('lock')} Locked</span>` : ''}</header>
        <p>${escapeHtml(POWER_PITCH[id])}</p>
        <p class="pm-how"><b>How:</b> ${escapeHtml(POWER_HOWTO[id])}</p>
        ${req ? `<div class="pm-req"><span>${escapeHtml(req.text)}</span><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(req.progress * 100)}"><i style="width:${Math.round(req.progress * 100)}%"></i></div>${req.detail ? `<small>${escapeHtml(req.detail)}</small>` : ''}</div>` : ''}
        ${mastery.length ? `<ul class="pm-mastery" aria-label="Mastery">${mastery.map((g) => `<li class="${g.done ? 'done' : ''}">${g.done ? '✓' : '○'} ${escapeHtml(g.label)}</li>`).join('')}</ul>` : ''}
        <footer>
          <button type="button" class="btn primary pm-pick" data-pick="${id}" ${req ? 'disabled' : ''}>${req ? 'Locked' : selected === id ? 'Selected' : 'Use'}</button>
          <button type="button" class="btn pm-assign-btn ${assigning ? 'on' : ''}" data-start-assign="${id}" aria-expanded="${assigning}">${slot >= 0 ? `In slot ${slot + 1} · Move` : 'Put in dock'}</button>
        </footer>
        ${assigning ? `<div class="pm-slots" role="group" aria-label="Choose a dock slot for ${escapeHtml(p.name)}">${this.slots.map((sid, i) => `<button type="button" data-assign="${i}" data-power="${id}" class="${slot === i ? 'on' : ''}" title="Slot ${i + 1}: ${escapeHtml(sim.powers.powers[sid].name)}"><b>${i + 1}</b><small>${escapeHtml(sim.powers.powers[sid].name)}</small></button>`).join('')}</div>` : ''}
      </article>`;
    };
    this.menu.innerHTML = `
      <header class="pm-head"><div><small>Requisition form 13-B</small><h2>All Powers</h2></div>
      <button class="pm-close insp-close" type="button" aria-label="Close all powers">${icon('close')}</button></header>
      <div class="pm-body">${CATEGORIES.map(
        (cat) => `<section><h3>${cat.id}<small>${cat.blurb}</small></h3><div class="pm-row">${POWER_ORDER.filter((id) => POWER_CATEGORY[id] === cat.id).map(card).join('')}</div></section>`,
      ).join('')}</div>`;
  }

  rect(id: PowerId): DOMRect | null {
    const i = this.slots.indexOf(id);
    return (i >= 0 ? this.slotButtons[i] : this.more).getBoundingClientRect();
  }
}
