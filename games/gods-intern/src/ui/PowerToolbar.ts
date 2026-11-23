import { CONFIG, POWER_ORDER, type PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, el, icon } from './dom';
import { ICON } from './Icons';

export const POWER_ACCENT: Record<PowerId, string> = {
  rain: '#3aa0ff',
  lightning: '#ffcf33',
  nature: '#4fbf5a',
  fire: '#ff7a33',
  mutation: '#b86bff',
};

const EFFECTS: Record<PowerId, string> = {
  rain: 'Fills wells · grows crops · douses fire',
  lightning: 'Ignites trees · damages buildings · inspires faith',
  nature: 'Grows a tree · calms villagers · future wood',
  fire: 'Burns and spreads · rain stops it',
  mutation: 'Villager → giant head · tree → gold · rock → legs',
};

/** Bottom power bar: selection, key hints, cost, cooldown sweep, lock and tooltip. */
export class PowerToolbar {
  private readonly root = $('#toolbar');
  private readonly tip = $('#tool-tip');
  private readonly buttons = new Map<PowerId | 'inspect', HTMLButtonElement>();
  onSelect: (id: PowerId | null) => void = () => {};
  onHover: () => void = () => {};
  highlight: PowerId | null = null;

  constructor(sim: Simulation) {
    const inspect = el('button', 'power inspect', `<span class="p-key">0</span><span class="p-icon">${ICON.hand}</span><span class="p-name">Look</span>`);
    inspect.type = 'button';
    inspect.addEventListener('click', () => this.onSelect(null));
    this.attachTip(inspect, () => `<h4>Inspect <small>0 / Esc</small></h4><p>Hover villagers to read their minds. Click a building to inspect its village.</p>`);
    this.buttons.set('inspect', inspect);
    this.root.append(inspect, el('span', 'tool-divider'));

    POWER_ORDER.forEach((id, index) => {
      const p = sim.powers.powers[id];
      const button = el(
        'button',
        'power',
        `<span class="p-key">${index + 1}</span><span class="p-lock">${ICON.lock}</span><span class="p-icon">${ICON[id]}</span>` +
          `<span class="p-name">${p.name}</span><span class="p-cost">${icon('energy')}${p.energyCost}</span><span class="p-cool"></span>`,
      );
      button.type = 'button';
      button.style.setProperty('--accent', POWER_ACCENT[id]);
      button.dataset.power = id;
      button.addEventListener('click', () => this.onSelect(id));
      this.attachTip(button, () => {
        const locked = !sim.state.unlockedPowers.includes(id);
        return `<h4>${p.name} <small>key ${index + 1}</small></h4><p>${p.description}</p>` +
          `<div class="tip-stats"><span>⚡ ${p.energyCost} energy</span><span>⟳ ${p.cooldown}s</span></div>` +
          `<p style="margin-top:6px;opacity:.75">${locked ? (id === 'mutation' ? `🔒 Unlocks at ${CONFIG.powers.mutation.unlockChaos} Chaos (now ${Math.floor(sim.state.chaos)})` : '🔒 Unlocks after the tutorial') : EFFECTS[id]}</p>`;
      });
      this.buttons.set(id, button);
      this.root.append(button);
    });
  }

  private attachTip(button: HTMLElement, html: () => string): void {
    button.addEventListener('pointerenter', () => {
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
      const b = this.buttons.get(id);
      if (!b) continue;
      b.classList.remove('unlocked-flash');
      void b.offsetWidth;
      b.classList.add('unlocked-flash');
    }
  }

  update(sim: Simulation, selected: PowerId | null): void {
    const s = sim.state;
    this.buttons.get('inspect')!.classList.toggle('selected', selected === null);
    for (const id of POWER_ORDER) {
      const b = this.buttons.get(id)!;
      const p = sim.powers.powers[id];
      const locked = !s.unlockedPowers.includes(id);
      b.classList.toggle('locked', locked);
      b.classList.toggle('selected', selected === id);
      b.classList.toggle('poor', !locked && !sim.unlimitedEnergy && s.energy < p.energyCost);
      b.classList.toggle('highlight', this.highlight === id && selected !== id);
      const cd = s.cooldowns[id] / p.cooldown;
      b.style.setProperty('--cool', `${Math.max(0, Math.min(1, cd)) * 100}%`);
      b.setAttribute('aria-pressed', String(selected === id));
      b.setAttribute('aria-disabled', String(locked));
    }
    void CONFIG;
  }

  rect(id: PowerId): DOMRect | null {
    return this.buttons.get(id)?.getBoundingClientRect() ?? null;
  }
}
