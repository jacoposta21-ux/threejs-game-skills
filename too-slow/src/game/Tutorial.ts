import { t } from '../i18n';
import type { RacerBody } from '../physics/RacerBody';

type Device = 'keyboard' | 'gamepad' | 'touch';

interface Step {
  id: string;
  text: Record<Device, string>;
  /** Control label per device: keyboard, gamepad, touch. */
  keys: [string, string, string];
}

// Each step: a sentence with {key} filled from the device's control label.
const STEPS: Step[] = [
  { id: 'crawl', text: { keyboard: 'Hold {k} to crawl to the edge', gamepad: 'Hold {k} to crawl to the edge', touch: 'You crawl forward on your own' }, keys: ['W', 'RT', ''] },
  { id: 'roll', text: { keyboard: '{k} — tuck into your shell and roll', gamepad: '{k} — tuck into your shell and roll', touch: '{k} — tuck into your shell and roll' }, keys: ['SPACE', 'A', 'SHELL'] },
  { id: 'steer', text: { keyboard: '{k} steer · the slope gives the speed', gamepad: '{k} steer · the slope gives the speed', touch: '{k} steer · the slope gives the speed' }, keys: ['A</kbd> <kbd>D', 'Left stick', '◀</kbd> <kbd>▶'] },
  { id: 'slide', text: { keyboard: 'Hold {k} to slime-slide through bends', gamepad: 'Hold {k} to slime-slide through bends', touch: 'Hold {k} to slime-slide through bends' }, keys: ['SHIFT', 'B', 'SLIDE'] },
  { id: 'item', text: { keyboard: 'Here is a Turbo Mushroom — press {k}', gamepad: 'Here is a Turbo Mushroom — press {k}', touch: 'Here is a Turbo Mushroom — press {k}' }, keys: ['F', 'Y', 'ITEM'] },
  { id: 'boost', text: { keyboard: 'Shell boost is charged — press {k}', gamepad: 'Shell boost is charged — press {k}', touch: 'Shell boost is charged — press {k}' }, keys: ['E', 'X', 'BOOST'] },
  { id: 'spin', text: { keyboard: 'At the Boing Mushroom, spin with {k}', gamepad: 'At the Boing Mushroom, spin with {k}', touch: 'At the Boing Mushroom, spin with {k}' }, keys: ['Q</kbd> / <kbd>E', 'LB</kbd> / <kbd>X', 'BOOST'] },
  { id: 'finish', text: { keyboard: 'Cross the finish line!', gamepad: 'Cross the finish line!', touch: 'Cross the finish line!' }, keys: ['', '', ''] },
];

/** The guided practice lap: a checklist that ticks itself off as the player does each thing. */
export class Tutorial {
  active = false;
  index = 0;
  private timer = 0;
  private gaveItem = false;
  private readonly panel = document.getElementById('tutorial-panel');
  private readonly list = document.getElementById('tutorial-steps');
  private device: Device = 'keyboard';

  start(device: Device): void {
    this.active = true;
    this.index = 0;
    this.timer = 0;
    this.gaveItem = false;
    this.device = device;
    this.panel?.classList.remove('hidden');
    this.render();
  }

  stop(): void {
    this.active = false;
    this.panel?.classList.add('hidden');
  }

  /** Returns the id of a step that was just completed (for a toast), or null. */
  update(dt: number, p: RacerBody, throttle: number, steer: number, device: Device): string | null {
    if (!this.active) return null;
    if (device !== this.device) {
      this.device = device;
      this.render();
    }
    const step = STEPS[this.index];
    if (!step || step.id === 'finish') return null;
    let done = false;
    switch (step.id) {
      case 'crawl':
        if (p.mode === 'crawl' && throttle > 0 && p.speed > 1) this.timer += dt;
        done = this.timer > 1.2;
        break;
      case 'roll':
        done = p.mode === 'roll';
        break;
      case 'steer':
        if (p.mode !== 'crawl' && Math.abs(steer) > 0.5) this.timer += dt;
        done = this.timer > 1;
        break;
      case 'slide':
        if (p.mode === 'slide') this.timer += dt;
        done = this.timer > 0.5;
        break;
      case 'item':
        if (!this.gaveItem && !p.item) {
          p.item = 'mushroom';
          p.itemRoulette = 0;
          this.gaveItem = true;
        }
        done = this.gaveItem && !p.item;
        break;
      case 'boost':
        if (p.boost < 1 && p.boostTimer <= 0) p.boost = 1;
        done = p.boostTimer > 0;
        break;
      case 'spin':
        done = p.tricks > 0;
        break;
    }
    if (!done) return null;
    this.index += 1;
    this.timer = 0;
    this.render();
    return step.id;
  }

  get complete(): boolean {
    return this.index >= STEPS.length - 1;
  }

  private render(): void {
    if (!this.list) return;
    this.list.replaceChildren();
    STEPS.forEach((s, i) => {
      // Show what is done, the current step and the next one: the panel stays small.
      if (i > this.index + 1) return;
      const li = document.createElement('li');
      const di = this.device === 'keyboard' ? 0 : this.device === 'gamepad' ? 1 : 2;
      li.innerHTML = t(s.text[this.device], { k: `<kbd>${t(s.keys[di])}</kbd>` });
      li.className = i < this.index ? 'done' : i === this.index ? 'now' : '';
      this.list?.appendChild(li);
    });
  }
}
