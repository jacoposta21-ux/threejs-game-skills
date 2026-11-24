import type { PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon } from './dom';

export interface TipDef {
  id: string;
  title: string;
  text: string;
}

export const TIPS: TipDef[] = [
  { id: 'camera', title: 'Looking around', text: 'Drag to pan. Right-drag (or twist two fingers) to rotate. Scroll (or pinch) to zoom.' },
  { id: 'prayers', title: 'Prayers', text: 'New prayers appear on the right. Focus flies you there; the power button picks the usual fix. You still cast it.' },
  { id: 'inspect', title: 'Inspecting', text: 'With no power selected, click a villager, building or sacred object to see what is going on.' },
  { id: 'fire', title: 'Fire', text: 'Fire spreads to trees and roofs nearby. Rain puts it out. Villagers remember who started it.' },
  { id: 'goal', title: 'Goals', text: 'Your current goal is pinned on the left. CHALLENGES lists more you can do with your powers.' },
  { id: 'career', title: 'Your career', text: 'You are earning career XP. Open CAREER to see your next promotion and the power it unlocks.' },
  { id: 'religion', title: 'A religion was born', text: 'Villagers now interpret your miracles. HISTORY → Beliefs shows what they think you want.' },
  { id: 'diplomacy', title: 'Village relations', text: 'Villages have opinions about each other. Favoring one makes the others jealous. WORLD → Diplomacy shows where they stand.' },
  { id: 'mutation', title: 'Mutation', text: 'Click a villager, tree or rock to make it wonderfully wrong. Some results become sacred.' },
  { id: 'modes', title: 'Power modes', text: 'Terraform and Time Warp have two modes. Switch with the buttons above the dock (or T).' },
  { id: 'possession', title: 'Possession', text: 'Click a villager. Walk with the on-screen pad or WASD; Interact and Leave are buttons too.' },
  { id: 'unlock', title: 'New power', text: 'A promotion added a power. ALL POWERS shows what it does and lets you put it in any dock slot.' },
];

/**
 * Contextual tips (v0.5): short, dismissible, non-blocking, each shown once per
 * career and listed afterwards in the Help panel. One at a time; queued tips wait.
 */
export class Tips {
  private readonly card = $('#tip-card');
  private readonly help = $('#help');
  private queue: string[] = [];
  private current: string | null = null;
  private timer = 0;
  private sim: Simulation | null = null;
  private unsub: Array<() => void> = [];
  private xpAtStart = 0;
  private sinceTutorial = 0;
  enabled = true;
  onToggle: (open: boolean) => void = () => {};

  constructor() {
    this.card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-tip-ok]')) this.dismiss();
    });
    this.help.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.help-close')) this.close();
    });
  }

  bind(sim: Simulation): void {
    for (const u of this.unsub) u();
    this.sim = sim;
    this.queue = [];
    this.current = null;
    this.card.classList.add('hidden');
    this.sinceTutorial = 0;
    this.xpAtStart = sim.state.career.xp;
    const bus = sim.bus;
    this.unsub = [
      bus.on('RELIGION_FOUNDED', () => this.show('religion')),
      bus.on('RELATIONSHIP_CHANGED', () => this.show('diplomacy')),
      bus.on('PRAYER_CREATED', () => sim.state.tutorial.done && this.show('prayers')),
      bus.on('FIRE_STARTED', (e) => e.byPlayer && this.show('fire')),
      bus.on('POWERS_UNLOCKED', (e) => {
        if (!sim.state.tutorial.done || sim.state.mode === 'creative') return;
        if (e.powers.includes('mutation')) this.show('mutation');
        else if (e.powers.some((p) => !['rain', 'lightning', 'nature', 'fire'].includes(p))) this.show('unlock');
      }),
    ];
  }

  /** Power selection hook (Fire, modes, Possession). */
  selected(id: PowerId | null): void {
    if (id === 'fire') this.show('fire');
    if (id === 'terraform' || id === 'timewarp') this.show('modes');
    if (id === 'possession') this.show('possession');
  }

  private seen(): string[] {
    const t = this.sim!.state.tutorial;
    t.tipsSeen ??= [];
    return t.tipsSeen;
  }

  show(id: string): void {
    if (!this.sim || !this.sim.state.tutorial.done || !this.enabled) return;
    if (this.seen().includes(id) || this.current === id || this.queue.includes(id)) return;
    this.queue.push(id);
    if (!this.current) this.next();
  }

  private next(): void {
    const id = this.queue.shift();
    if (!id || !this.sim) {
      this.current = null;
      this.card.classList.add('hidden');
      return;
    }
    const tip = TIPS.find((t) => t.id === id);
    if (!tip) return this.next();
    this.current = id;
    this.seen().push(id);
    this.timer = 12;
    this.card.innerHTML = `<small>${icon('question')} Tip</small><b>${escapeHtml(tip.title)}</b><p>${escapeHtml(tip.text)}</p><button type="button" class="btn small" data-tip-ok>Got it</button>`;
    this.card.classList.remove('hidden');
  }

  dismiss(): void {
    this.current = null;
    this.card.classList.add('hidden');
    this.timer = 1.2;
  }

  update(sim: Simulation, dt: number): void {
    this.sim = sim;
    if (sim.state.tutorial.done) {
      this.sinceTutorial += dt;
      if (this.sinceTutorial > 8) this.show('camera');
      if (this.sinceTutorial > 40) this.show('inspect');
      if (this.sinceTutorial > 70 && sim.state.civ.pinned.length) this.show('goal');
      if (sim.state.mode === 'career' && sim.state.career.xp - this.xpAtStart >= 60) this.show('career');
    }
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.current) this.dismiss();
        else this.next();
      }
    } else if (!this.current && this.queue.length) this.next();
  }

  // ---- Help panel (optional; lists the tips you have seen plus the basics) ----
  get open(): boolean {
    return !this.help.classList.contains('hidden');
  }

  toggle(): void {
    if (this.open) this.close();
    else this.showHelp();
  }

  showHelp(): void {
    const seen = this.sim ? this.seen() : [];
    const tips = TIPS.filter((t) => seen.includes(t.id));
    this.help.innerHTML = `<header class="side-head"><div><small>Intern handbook</small><h2>${icon('question')} Help</h2></div><button class="help-close insp-close" type="button" aria-label="Close help">${icon('close')}</button></header>
      <div class="side-body">
        <h3>The basics</h3>
        <ul class="help-list">
          <li><b>Use a power:</b> pick it in the dock at the bottom, then click the island. <b>Cancel</b> (or Esc) puts it away.</li>
          <li><b>Inspect:</b> with no power selected, click villagers, buildings and sacred objects.</li>
          <li><b>Camera:</b> drag to pan, right-drag or two fingers to rotate, scroll or pinch to zoom.</li>
          <li><b>Panels:</b> WORLD, CAREER, CHALLENGES and HISTORY on the left. Click outside a panel to close it.</li>
          <li><b>Keys (optional):</b> 1–7 dock slots, G all powers, T power mode, Space pause, Esc cancel or menu.</li>
        </ul>
        <h3>Tips you have seen</h3>
        <ul class="help-list">${tips.length ? tips.map((t) => `<li><b>${escapeHtml(t.title)}:</b> ${escapeHtml(t.text)}</li>`).join('') : '<li class="muted">Tips appear as you play.</li>'}</ul>
      </div>`;
    this.help.classList.remove('hidden');
    this.onToggle(true);
  }

  close(): void {
    if (!this.open) return;
    this.help.classList.add('hidden');
    this.onToggle(false);
  }
}
