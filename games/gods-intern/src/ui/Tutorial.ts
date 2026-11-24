import * as THREE from 'three';
import { BASIC_POWERS, CONFIG, type PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, el } from './dom';

export interface TutorialHost {
  sim(): Simulation;
  selected(): PowerId | null;
  focusVillage(distance: number, duration: number): void;
  introCamera(): void;
  highlight(id: PowerId | null): void;
  powerRect(id: PowerId): DOMRect | null;
  marker(label: string, at: () => THREE.Vector3 | null, seconds: number): HTMLElement;
  removeMarker(node: HTMLElement): void;
  onComplete(): void;
}

/**
 * v0.5 onboarding (about 30–45 seconds, mandatory but never blocking the sim):
 *   0 intro lines · 1 a village asks for rain (Rain is highlighted) · 2 cast near the
 *   farms and the well · 3 the villagers react · 4 reward · done.
 * Every step has a gentle fallback hint; the four starter powers are in the dock
 * from the first second. Everything else is taught later by contextual tips.
 */
export class Tutorial {
  private readonly title = $('#tutorial-title');
  private readonly hint = $('#tutorial-hint');
  private marker: HTMLElement | null = null;
  private unsub: Array<() => void> = [];
  private titleTimers: number[] = [];
  /** Real seconds since the onboarding began (diagnostics). */
  elapsed = 0;

  constructor(private readonly host: TutorialHost) {}

  get active(): boolean {
    return !this.host.sim().state.tutorial.done;
  }

  start(): void {
    const sim = this.host.sim();
    const t = sim.state.tutorial;
    this.unbind();
    if (t.done) {
      this.hideAll();
      return;
    }
    this.elapsed = 0;
    sim.missions.autoGenerate = false;
    sim.powers.unlock(BASIC_POWERS);
    this.unsub.push(
      sim.bus.on('POWER_USED', (e) => {
        if (e.power !== 'rain') return;
        t.rainsCast++;
        if (t.step <= 2) this.go(3);
      }),
    );
    if (t.step === 0) {
      this.host.introCamera();
      this.showTitle('GOD IS ON VACATION.', 200, 1700, '');
      this.showTitle('YOU’RE IN CHARGE.', 1800, 3300, 'gold');
      this.showTitle('PLEASE DON’T MAKE IT WORSE.', 3400, 5000, 'small');
      this.titleTimers.push(window.setTimeout(() => this.host.focusVillage(46, 3.2), 300));
    } else {
      this.go(Math.min(t.step, 2));
    }
  }

  private showTitle(text: string, at: number, until: number, cls: string): void {
    this.titleTimers.push(
      window.setTimeout(() => {
        this.title.classList.remove('hidden');
        this.title.innerHTML = '';
        this.title.append(el('h2', cls, text));
      }, at),
      window.setTimeout(() => this.title.querySelector('h2')?.classList.add('out'), until),
    );
  }

  private setHint(html: string, arrowAt: PowerId | null = null): void {
    this.hint.innerHTML = html;
    this.hint.classList.remove('hidden');
    this.hint.classList.toggle('arrow', !!arrowAt);
    if (arrowAt) {
      const r = this.host.powerRect(arrowAt);
      const hr = this.hint.getBoundingClientRect();
      if (r && hr.width) {
        const x = Math.max(16, Math.min(hr.width - 16, r.left + r.width / 2 - hr.left));
        this.hint.style.setProperty('--arrow-x', `${x}px`);
      }
    }
  }

  private go(step: number): void {
    const sim = this.host.sim();
    const t = sim.state.tutorial;
    t.step = step;
    t.timer = 0;
    sim.bus.emit('TUTORIAL_STEP', { step });
    const village = sim.state.villages[0];
    switch (step) {
      case 1:
        this.title.classList.add('hidden');
        if (!sim.missions.hasActive('THIRST', village.id)) {
          village.water = Math.min(village.water, 24);
          sim.missions.create('THIRST', village, true);
        }
        this.host.highlight('rain');
        this.setHint(`<b>${village.name}</b> is praying for rain. Select <b>Rain</b> in the dock.`, 'rain');
        break;
      case 2:
        this.host.highlight(null);
        this.setHint('Now <b>click near the well</b> (the <b>!</b> marker) to send a rain cloud over the farms.');
        this.showWellMarker();
        break;
      case 3:
        this.host.highlight(null);
        this.clearMarker();
        this.setHint('They noticed. <b>Villagers react to every miracle</b> and remember it.');
        sim.godMessage('ACCEPTABLE. DO NOT LET IT GO TO YOUR HEAD.', 2);
        break;
      case 4: {
        sim.state.energy = Math.min(CONFIG.energy.max, sim.state.energy + 15);
        sim.addApproval(4, 'First miracle');
        this.setHint('First miracle: <b>+10 career XP</b>, +15 energy. Answer prayers and finish goals to earn promotions and new powers.');
        break;
      }
      case 5:
        this.finish(false);
        break;
    }
  }

  update(dt: number): void {
    const sim = this.host.sim();
    const t = sim.state.tutorial;
    if (t.done) return;
    this.elapsed += dt;
    t.timer += dt;
    switch (t.step) {
      case 0:
        if (t.timer > 5.1) this.go(1);
        break;
      case 1:
        if (this.host.selected() === 'rain') this.go(2);
        else if (t.timer > 15 && t.timer - dt <= 15) this.setHint('Click the glowing <b>Rain</b> button at the bottom (or press <kbd>1</kbd>).', 'rain');
        break;
      case 2:
        if (this.host.selected() !== 'rain' && t.timer > 1) this.go(1);
        else if (t.timer > 15 && t.timer - dt <= 15) this.setHint('The <b>!</b> marks the well in the middle of the village. Click anywhere near it.');
        break;
      case 3:
        if (t.timer > 6) this.go(4);
        break;
      case 4:
        if (t.timer > 6) this.go(5);
        break;
    }
  }

  private showWellMarker(): void {
    this.clearMarker();
    const sim = this.host.sim();
    const well = sim.building(sim.state.villages[0].wellId);
    if (!well) return;
    const p = new THREE.Vector3(well.x, sim.terrain.heightAt(well.x, well.z) + 4.5, well.z);
    this.marker = this.host.marker('!', () => p, 120);
  }

  private clearMarker(): void {
    if (this.marker) this.host.removeMarker(this.marker);
    this.marker = null;
  }

  /** `skipped` is only used by test hooks and returning players; there is no skip button. */
  finish(skipped: boolean): void {
    const sim = this.host.sim();
    const t = sim.state.tutorial;
    if (t.done) return;
    t.done = true;
    t.step = 6;
    this.hideAll();
    this.unbind();
    sim.missions.autoGenerate = true;
    sim.powers.unlock(BASIC_POWERS);
    if (skipped) sim.notify('BACK FOR ANOTHER SHIFT?', 'info', 'Training already done. The dock is yours.', 2);
    this.host.onComplete();
  }

  private hideAll(): void {
    this.titleTimers.forEach((id) => window.clearTimeout(id));
    this.titleTimers = [];
    this.title.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.clearMarker();
    this.host.highlight(null);
  }

  private unbind(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  dispose(): void {
    this.hideAll();
    this.unbind();
  }
}
