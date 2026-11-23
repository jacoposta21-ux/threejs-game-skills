import * as THREE from 'three';
import type { PowerId } from '../core/Config';
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
 * First-minute script. Teaches by doing: a real thirst prayer, a real rain
 * cloud, a real flood if the player overdoes it. Every step has a timeout
 * fallback and the whole thing can be skipped; nothing ever freezes the sim.
 *
 * Steps: 0 intro · 1 select rain · 2 cast near well · 3 watch well fill ·
 *        4 tempt a second rain · 5 wrap-up · 6 done
 */
export class Tutorial {
  private readonly title = $('#tutorial-title');
  private readonly hint = $('#tutorial-hint');
  private readonly skip = $('#tutorial-skip');
  private marker: HTMLElement | null = null;
  private unsub: Array<() => void> = [];
  private titleTimers: number[] = [];
  private floodSeen = false;
  private rainAfterAnswer = 0;

  constructor(private readonly host: TutorialHost) {
    this.skip.addEventListener('click', () => this.finish(true));
  }

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
    sim.missions.autoGenerate = false;
    this.skip.classList.remove('hidden');
    const bus = sim.bus;
    this.unsub.push(
      bus.on('POWER_USED', (e) => {
        if (e.power !== 'rain') return;
        t.rainsCast++;
        if (t.step <= 2) this.go(3);
        else if (t.step === 4) this.rainAfterAnswer++;
      }),
      bus.on('PRAYER_COMPLETED', (e) => {
        if (e.prayer.type === 'THIRST' && t.step <= 3) this.go(4);
      }),
      bus.on('FLOOD_STARTED', () => {
        if (t.step >= 3 && !this.floodSeen) {
          this.floodSeen = true;
          window.setTimeout(() => sim.godMessage('WHAT DID YOU DO?!', 3), 2200);
          this.go(5);
        }
      }),
    );
    if (t.step === 0) {
      this.host.introCamera();
      this.showTitle('GOD IS ON VACATION.', 400, 2300, false);
      this.showTitle('YOU ARE IN CHARGE.', 2700, 4600, true);
      this.titleTimers.push(window.setTimeout(() => this.host.focusVillage(46, 3.2), 300));
    } else {
      this.go(t.step);
    }
  }

  private showTitle(text: string, at: number, until: number, gold: boolean): void {
    this.titleTimers.push(
      window.setTimeout(() => {
        this.title.classList.remove('hidden');
        this.title.innerHTML = '';
        const h = el('h2', gold ? 'gold' : '', text);
        this.title.append(h);
      }, at),
      window.setTimeout(() => {
        const h = this.title.querySelector('h2');
        h?.classList.add('out');
      }, until),
    );
  }

  private setHint(html: string, arrowAt: PowerId | null = null): void {
    this.hint.innerHTML = html;
    this.hint.classList.remove('hidden');
    if (arrowAt) {
      const r = this.host.powerRect(arrowAt);
      const hr = this.hint.getBoundingClientRect();
      if (r && hr.width) {
        const x = Math.max(16, Math.min(hr.width - 16, r.left + r.width / 2 - hr.left));
        this.hint.style.setProperty('--arrow-x', `${x}px`);
      }
    } else this.hint.style.setProperty('--arrow-x', '50%');
  }

  private go(step: number): void {
    const sim = this.host.sim();
    const t = sim.state.tutorial;
    t.step = step;
    t.timer = 0;
    sim.bus.emit('TUTORIAL_STEP', { step });
    const village = sim.state.villages[0];
    switch (step) {
      case 1: {
        this.title.classList.add('hidden');
        if (!sim.missions.hasActive('THIRST', village.id)) {
          village.water = Math.min(village.water, 24);
          sim.missions.create('THIRST', village, true);
        }
        this.host.highlight('rain');
        this.setHint('The villagers are praying for <b>water</b>! Select <b>Rain</b> <kbd>1</kbd>', 'rain');
        break;
      }
      case 2:
        this.host.highlight(null);
        this.setHint('Now <b>click near the well</b> in the village square to summon a rain cloud.');
        this.showWellMarker();
        break;
      case 3:
        this.host.highlight(null);
        this.clearMarker();
        this.setHint('It’s working! Watch the <b>well fill up</b> as the rain falls.');
        break;
      case 4:
        this.setHint('The crops look thirsty too… maybe <b>a little more rain</b>? <kbd>1</kbd>', 'rain');
        this.rainAfterAnswer = 0;
        break;
      case 5:
        this.host.highlight(null);
        this.setHint(this.floodSeen ? 'Oops. <b>Too much rain floods the village.</b> Floods drain on their own — just stop raining.' : 'Nice work, intern. You’re getting the hang of this.');
        break;
      case 6:
        this.finish(false);
        break;
    }
  }

  update(dt: number): void {
    const sim = this.host.sim();
    const t = sim.state.tutorial;
    if (t.done) return;
    t.timer += dt;
    switch (t.step) {
      case 0:
        if (t.timer > 5.2) this.go(1);
        break;
      case 1:
        if (this.host.selected() === 'rain') this.go(2);
        else if (t.timer > 25 && t.timer - dt <= 25) this.setHint('Press <kbd>1</kbd> or click the glowing <b>Rain</b> card to choose it.', 'rain');
        else if (t.timer > 60 && t.timer - dt <= 60) this.setHint('Not a rain person? You can <b>skip the tutorial</b> any time (bottom-right).', 'rain');
        break;
      case 2:
        if (this.host.selected() !== 'rain' && t.timer > 1) this.go(1);
        else if (t.timer > 30 && t.timer - dt <= 30) this.setHint('Tip: the <b>well</b> is marked with a <b>!</b> in the middle of the village. Click there.');
        break;
      case 3:
        // Fallback if the player rained somewhere unhelpful.
        if (t.timer > 14) {
          const village = sim.state.villages[0];
          if (village.water < 60 && t.rainsCast < 3) {
            this.setHint('Try raining <b>right over the well</b> so it fills up. <kbd>1</kbd>', 'rain');
            this.host.highlight('rain');
            t.step = 2;
            t.timer = 0;
            this.showWellMarker();
          } else this.go(4);
        }
        break;
      case 4:
        if (t.timer > 3 && sim.state.clouds.length === 0 && this.rainAfterAnswer === 0) this.host.highlight('rain');
        else this.host.highlight(null);
        if (this.rainAfterAnswer > 0 && t.timer > 20 && sim.state.clouds.length === 0 && sim.state.villages[0].flood < 0.1) {
          sim.godMessage('…FINE. CARRY ON.', 3);
          this.go(5);
        } else if (this.rainAfterAnswer === 0 && t.timer > 18) {
          sim.godMessage('NOT BAD FOR A FIRST DAY. DON’T TOUCH ANYTHING ELSE.', 3);
          this.go(5);
        }
        break;
      case 5:
        if (t.timer > 7) this.go(6);
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

  finish(skipped: boolean): void {
    const sim = this.host.sim();
    const t = sim.state.tutorial;
    if (t.done) return;
    t.done = true;
    t.step = 6;
    this.hideAll();
    this.unbind();
    sim.missions.autoGenerate = true;
    sim.powers.unlock(['rain', 'lightning', 'nature', 'fire']);
    sim.notify('ALL POWERS UNLOCKED', 'good', 'Lightning, Nature and Fire are yours. Please be responsible.');
    if (skipped) sim.godMessage('SKIPPING TRAINING. BOLD. I LIKE IT. (I DO NOT.)', 3);
    this.host.onComplete();
    this.setHint('Sandbox unlocked! Keys <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> for more powers. Answer prayers to keep God happy.');
    window.setTimeout(() => this.hint.classList.add('hidden'), 7000);
  }

  private hideAll(): void {
    this.titleTimers.forEach((id) => window.clearTimeout(id));
    this.titleTimers = [];
    this.title.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.skip.classList.add('hidden');
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
