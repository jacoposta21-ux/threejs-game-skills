/** Keyboard + on-screen touch controls merged into one ScooterInput. */
import type { ScooterInput } from '../physics/scooter.ts';

export class Input {
  readonly state: ScooterInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private keys = new Set<string>();
  touch = { left: false, right: false, gas: false, brake: false };
  onReset: () => void = () => {};
  onPause: () => void = () => {};
  onDebug: () => void = () => {};
  onHorn: () => void = () => {};
  private steerAxis = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat && ['KeyR', 'Escape', 'KeyP', 'F1', 'KeyH'].includes(e.code)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.onReset();
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause();
      if (e.code === 'F1') {
        e.preventDefault();
        this.onDebug();
      }
      if (e.code === 'KeyH') this.onHorn();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(el: HTMLElement, key: keyof Input['touch']) {
    const on = (e: PointerEvent) => {
      e.preventDefault();
      this.touch[key] = true;
      el.classList.add('down');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const off = (e: PointerEvent) => {
      e.preventDefault();
      this.touch[key] = false;
      el.classList.remove('down');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', () => {
      this.touch[key] = false;
      el.classList.remove('down');
    });
  }

  clear() {
    this.keys.clear();
    this.touch.left = this.touch.right = this.touch.gas = this.touch.brake = false;
  }

  update(dt: number): ScooterInput {
    const k = this.keys;
    const up = k.has('KeyW') || k.has('ArrowUp') || this.touch.gas;
    const down = k.has('KeyS') || k.has('ArrowDown') || this.touch.brake;
    const left = k.has('KeyA') || k.has('ArrowLeft') || this.touch.left;
    const right = k.has('KeyD') || k.has('ArrowRight') || this.touch.right;
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    // digital steering ramps in so taps stay gentle
    const rate = target === 0 ? 8 : Math.sign(target) !== Math.sign(this.steerAxis) ? 9 : 4.5;
    this.steerAxis += Math.sign(target - this.steerAxis) * Math.min(Math.abs(target - this.steerAxis), rate * dt);
    this.state.throttle = up ? 1 : 0;
    this.state.brake = down ? 1 : 0;
    this.state.steer = this.steerAxis;
    this.state.handbrake = k.has('Space');
    return this.state;
  }
}
