import type { RacerBody } from '../physics/RacerBody';

type Device = 'keyboard' | 'gamepad' | 'touch';

interface Step {
  id: string;
  text: Record<Device, string>;
}

const STEPS: Step[] = [
  { id: 'crawl', text: { keyboard: 'Hold <kbd>W</kbd> to crawl to the edge', gamepad: 'Hold <kbd>RT</kbd> to crawl to the edge', touch: 'You crawl forward on your own' } },
  { id: 'roll', text: { keyboard: '<kbd>SPACE</kbd> — tuck into your shell and roll', gamepad: '<kbd>A</kbd> — tuck into your shell and roll', touch: '<kbd>SHELL</kbd> — tuck in and roll' } },
  { id: 'steer', text: { keyboard: '<kbd>A</kbd> <kbd>D</kbd> steer · the slope gives the speed', gamepad: 'Left stick steers · the slope gives the speed', touch: '<kbd>◀</kbd> <kbd>▶</kbd> steer · the slope gives the speed' } },
  { id: 'slide', text: { keyboard: 'Hold <kbd>SHIFT</kbd> to slime-slide through bends', gamepad: 'Hold <kbd>B</kbd> to slime-slide through bends', touch: 'Hold <kbd>SLIDE</kbd> through bends' } },
  { id: 'item', text: { keyboard: 'Here is a Turbo Mushroom — press <kbd>F</kbd>', gamepad: 'Here is a Turbo Mushroom — press <kbd>Y</kbd>', touch: 'Here is a Turbo Mushroom — tap <kbd>ITEM</kbd>' } },
  { id: 'boost', text: { keyboard: 'Shell boost is charged — press <kbd>E</kbd>', gamepad: 'Shell boost is charged — press <kbd>X</kbd>', touch: 'Shell boost is charged — tap <kbd>BOOST</kbd>' } },
  { id: 'spin', text: { keyboard: 'At the Boing Mushroom, spin with <kbd>Q</kbd> / <kbd>E</kbd>', gamepad: 'At the Boing Mushroom, spin with <kbd>LB</kbd> / <kbd>X</kbd>', touch: 'At the Boing Mushroom, hold <kbd>BOOST</kbd> to spin' } },
  { id: 'finish', text: { keyboard: 'Cross the finish line!', gamepad: 'Cross the finish line!', touch: 'Cross the finish line!' } },
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
      li.innerHTML = s.text[this.device];
      li.className = i < this.index ? 'done' : i === this.index ? 'now' : '';
      this.list?.appendChild(li);
    });
  }
}
