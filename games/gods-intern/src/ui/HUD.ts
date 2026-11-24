import { CONFIG } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon, setText } from './dom';

type Explain = 'energy' | 'approval' | 'chaos' | null;

const approvalWord = (v: number) => (v >= 85 ? 'Delighted' : v >= 65 ? 'Pleased' : v >= 40 ? 'Watching' : v >= 20 ? 'Concerned' : 'Furious');
const chaosWord = (v: number) => (v >= 85 ? 'Legendary' : v >= 60 ? 'Unhinged' : v >= 35 ? 'Eccentric' : v >= 12 ? 'Quirky' : 'Boring');

/**
 * v0.5 top HUD: only four indicators. Energy (most prominent, with a cost preview
 * and refill timer), Career (rendered by CareerPanel), Approval and Chaos. Approval
 * and Chaos open a short explanation when clicked. Animations are restrained:
 * a short bump on change, a shake-free pulse when energy is short.
 */
export class HUD {
  private readonly energy = $('#hud-energy-value');
  private readonly energyBar = $('#hud-energy-bar');
  private readonly energyGhost = $('#hud-energy-ghost');
  private readonly energySub = $('#hud-energy-sub');
  private readonly approval = $('#hud-approval-value');
  private readonly approvalWord = $('#hud-approval-word');
  private readonly approvalBar = $('#hud-approval-bar');
  private readonly chaos = $('#hud-chaos-value');
  private readonly chaosWord = $('#hud-chaos-word');
  private readonly chaosBar = $('#hud-chaos-bar');
  private readonly explain = $('#hud-explain');
  private open: Explain = null;
  private lastApproval = -1;
  private lastChaos = -1;
  private lastEnergy = -1;
  private explainKey = '';
  private readonly reasons: Record<'approval' | 'chaos', string[]> = { approval: [], chaos: [] };
  onExplain: (open: boolean) => void = () => {};

  constructor() {
    for (const k of ['energy', 'approval', 'chaos'] as const) {
      $(`#hud-${k}`).addEventListener('click', () => this.toggle(k));
    }
  }

  get explaining(): boolean {
    return this.open !== null;
  }

  /** Recent causes, shown in the explanation popover. */
  note(kind: 'approval' | 'chaos', delta: number, reason: string): void {
    if (Math.abs(delta) < 0.5 || !reason) return;
    const list = this.reasons[kind];
    const line = `${delta > 0 ? '+' : ''}${Math.round(delta)} ${reason}`;
    if (list[0] === line) return;
    list.unshift(line);
    if (list.length > 3) list.pop();
    this.explainKey = '';
  }

  toggle(k: Explain): void {
    this.open = this.open === k ? null : k;
    this.explainKey = '';
    this.explain.classList.toggle('hidden', !this.open);
    document.querySelectorAll('#hud .ind').forEach((n) => n.setAttribute('aria-expanded', String(n.id === `hud-${this.open}`)));
    this.onExplain(this.open !== null);
  }

  close(): void {
    if (this.open) this.toggle(this.open);
  }

  update(sim: Simulation, _paused: boolean, _speed: number, previewCost: number): void {
    const s = sim.state;
    const max = CONFIG.energy.max;
    const e = sim.unlimitedEnergy ? max : s.energy;
    const shown = Math.floor(e);
    setText(this.energy, sim.unlimitedEnergy ? '∞' : `${shown}`);
    this.energyBar.style.width = `${(e / max) * 100}%`;
    const cost = sim.unlimitedEnergy ? 0 : Math.min(e, previewCost);
    this.energyGhost.style.left = `${((e - cost) / max) * 100}%`;
    this.energyGhost.style.width = `${(cost / max) * 100}%`;
    const regen = CONFIG.energy.regen * (sim.career.overtimeActive() ? CONFIG.career.overtime.regenMult : 1);
    const toFull = Math.ceil((max - e) / Math.max(0.1, regen));
    setText(this.energySub, sim.unlimitedEnergy ? 'Unlimited (Creative)' : e >= max - 0.01 ? 'Full' : `+${regen}/s · full in ${toFull}s`);
    if (this.lastEnergy >= 0 && shown < this.lastEnergy - 1) this.bump('#hud-energy', 'spend');
    this.lastEnergy = shown;

    const approval = Math.round(s.approval);
    if (approval !== this.lastApproval) {
      if (this.lastApproval >= 0) this.bump('#hud-approval');
      this.lastApproval = approval;
      setText(this.approval, String(approval));
      setText(this.approvalWord, approvalWord(approval));
      this.approvalBar.style.width = `${approval}%`;
    }
    const chaos = Math.round(s.chaos);
    if (chaos !== this.lastChaos) {
      if (this.lastChaos >= 0 && chaos > this.lastChaos) this.bump('#hud-chaos');
      this.lastChaos = chaos;
      setText(this.chaos, String(chaos));
      setText(this.chaosWord, chaosWord(chaos));
      this.chaosBar.style.width = `${chaos}%`;
    }
    if (this.open) this.renderExplain(sim);
  }

  private renderExplain(sim: Simulation): void {
    const s = sim.state;
    const k = this.open!;
    const key = `${k}|${Math.round(s.approval)}|${Math.round(s.chaos)}|${Math.floor(s.energy / 10)}`;
    if (key === this.explainKey) return;
    this.explainKey = key;
    const recent = (list: string[]) => (list.length ? `<h5>Recently</h5><ul>${list.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '');
    const body =
      k === 'energy'
        ? `<h4>${icon('energy')} Divine Energy</h4><p>Every miracle costs energy. It refills by itself over time; answered prayers refill it faster.</p><p>The dock shows each power's cost. A power you can't afford says <b>Need N</b>.</p>`
        : k === 'approval'
          ? `<h4>${icon('halo')} God's Approval · ${Math.round(s.approval)} (${approvalWord(s.approval)})</h4><p>How helpful God thinks you are. It rises when you answer prayers and keep villages fed, watered and calm. It falls when villagers suffer or prayers expire.</p><p>Low approval brings worried memos from Heaven. It never ends your career.</p>${recent(this.reasons.approval)}`
          : `<h4>${icon('chaos')} Chaos Reputation · ${Math.round(s.chaos)} (${chaosWord(s.chaos)})</h4><p>How unpredictable you are. Surprising miracles, disasters and strange results raise it; quiet days lower it slowly.</p><p>High Chaos makes villagers invent stranger beliefs and can unlock Mutation sooner. It is not good or bad. It is a lifestyle.</p>${recent(this.reasons.chaos)}`;
    this.explain.innerHTML = `${body}<button type="button" class="btn small" data-close-explain>Got it</button>`;
    this.explain.querySelector('[data-close-explain]')?.addEventListener('click', () => this.close());
    const anchor = $(`#hud-${k}`).getBoundingClientRect();
    this.explain.style.left = `${Math.max(12, Math.min(window.innerWidth - 332, anchor.left + anchor.width / 2 - 160))}px`;
    this.explain.style.top = `${anchor.bottom + 8}px`;
  }

  flashLowEnergy(): void {
    this.bump('#hud-energy', 'pulse-low');
  }

  private bump(selector: string, cls = 'bump'): void {
    const node = $(selector);
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }
}
