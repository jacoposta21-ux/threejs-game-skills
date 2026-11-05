import type { InputManager, Action } from '../core/InputManager';
import { icon } from './Icons';

/**
 * Mobile controls: floating joystick on the left half, drag-to-look on the
 * right, and contextual action buttons. They emit the same intents as keys.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private interactBtn: HTMLButtonElement;
  private interactLabel: HTMLElement;
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookPointers = new Map<number, { x: number; y: number }>();
  enabled = false;

  constructor(parent: HTMLElement, private readonly input: InputManager, onPause: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `
      <div class="touch-move"></div>
      <div class="touch-look"></div>
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <button class="tbtn t-interact" data-a="interact" aria-label="Interact">${icon('hand')}<span class="lbl"></span></button>
      <button class="tbtn t-lumo" data-a="lumo" aria-label="LUMO light">${icon('lumo')}</button>
      <button class="tbtn t-crawl" data-a="crawl" aria-label="Crawl">${icon('crawl')}</button>
      <button class="tbtn t-jump" data-a="jump" aria-label="Climb or hop">${icon('climb')}</button>
      <button class="tbtn t-pause" aria-label="Pause">${icon('pause')}</button>`;
    parent.appendChild(this.root);
    this.stick = this.root.querySelector('.touch-stick')!;
    this.knob = this.root.querySelector('.touch-knob')!;
    this.interactBtn = this.root.querySelector('.t-interact')!;
    this.interactLabel = this.root.querySelector('.t-interact .lbl')!;

    const move = this.root.querySelector<HTMLElement>('.touch-move')!;
    move.addEventListener('pointerdown', this.onStickDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => this.reset());

    const look = this.root.querySelector<HTMLElement>('.touch-look')!;
    look.addEventListener('pointerdown', (e) => {
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      look.setPointerCapture?.(e.pointerId);
    });
    look.addEventListener('lostpointercapture', (e) => this.lookPointers.delete(e.pointerId));

    this.root.querySelectorAll<HTMLButtonElement>('.tbtn[data-a]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('down');
        this.input.press(b.dataset.a as Action);
      });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
    this.root.querySelector<HTMLButtonElement>('.t-pause')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPause();
    });
  }

  setVisible(v: boolean): void {
    this.enabled = v;
    this.root.classList.toggle('show', v);
    if (!v) this.reset();
  }

  /** Contextual label on the interact button. */
  setInteract(label: string | null, disabled: boolean, holding: boolean): void {
    const text = label ?? (holding ? 'Throw' : '');
    this.interactLabel.textContent = text;
    this.interactBtn.classList.toggle('active', Boolean(text) && !disabled);
    this.interactBtn.classList.toggle('muted', disabled || !text);
  }

  setLumo(found: boolean, crawling: boolean): void {
    this.root.querySelector('.t-lumo')!.classList.toggle('hidden', !found);
    this.root.querySelector('.t-crawl')!.classList.toggle('on', crawling);
  }

  private reset(): void {
    this.stickPointer = null;
    this.lookPointers.clear();
    this.input.setTouchMove(0, 0);
    this.stick.classList.remove('active');
  }

  private readonly onStickDown = (e: PointerEvent) => {
    if (this.stickPointer !== null) return;
    this.stickPointer = e.pointerId;
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    this.stick.style.left = `${e.clientX}px`;
    this.stick.style.top = `${e.clientY}px`;
    this.stick.classList.add('active');
    this.knob.style.transform = 'translate(-50%, -50%)';
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) {
      e.preventDefault();
      const dx = e.clientX - this.stickOrigin.x;
      const dy = e.clientY - this.stickOrigin.y;
      const max = 52;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      const nx = (dx * k) / max;
      const ny = (-dy * k) / max;
      const dead = 0.12;
      const mag = Math.hypot(nx, ny);
      if (mag < dead) this.input.setTouchMove(0, 0);
      else this.input.setTouchMove(nx, ny);
      return;
    }
    const last = this.lookPointers.get(e.pointerId);
    if (last) {
      e.preventDefault();
      this.input.addLook((e.clientX - last.x) * 0.0055, (e.clientY - last.y) * 0.0055);
      last.x = e.clientX;
      last.y = e.clientY;
    }
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) {
      this.stickPointer = null;
      this.input.setTouchMove(0, 0);
      this.stick.classList.remove('active');
    }
    this.lookPointers.delete(e.pointerId);
  };
}
