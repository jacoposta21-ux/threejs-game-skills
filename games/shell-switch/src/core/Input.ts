/**
 * Unified intents for keyboard/mouse and touch. Gameplay reads `intent` each
 * frame and calls `endFrame()` to clear one-shot presses.
 */
export interface Intents {
  moveX: number;
  moveY: number;
  run: boolean;
  jump: boolean;
  interact: boolean;
  exit: boolean;
  ability: boolean;
  abilityHeld: boolean;
  pause: boolean;
  journal: boolean;
  hint: boolean;
  lookX: number;
  lookY: number;
  zoom: number;
}

export class Input {
  readonly intent: Intents = {
    moveX: 0,
    moveY: 0,
    run: false,
    jump: false,
    interact: false,
    exit: false,
    ability: false,
    abilityHeld: false,
    pause: false,
    journal: false,
    hint: false,
    lookX: 0,
    lookY: 0,
    zoom: 0,
  };
  private readonly keys = new Set<string>();
  private readonly cleanups: (() => void)[] = [];
  sensitivity = 1;
  invertY = false;
  enabled = true;
  touchActive = false;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private dragMouse = false;
  onFirstGesture: (() => void) | null = null;
  private gestured = false;

  constructor(
    canvas: HTMLCanvasElement,
    touchRoot: HTMLElement,
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
  ) {
    this.on(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.on(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.on(window, 'blur', () => this.clearAll());
    this.on(document, 'visibilitychange', () => {
      if (document.hidden) this.clearAll();
    });
    this.on(canvas, 'mousedown', (e) => {
      const me = e as MouseEvent;
      this.gesture();
      if (this.touchActive || !this.enabled) return;
      if (me.button === 0 && document.pointerLockElement !== canvas) {
        try {
          const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          if (p && typeof p.catch === 'function') p.catch(() => (this.dragMouse = true));
        } catch {
          this.dragMouse = true;
        }
      }
      if (me.button === 2) this.dragMouse = true;
    });
    this.on(window, 'mouseup', () => (this.dragMouse = false));
    this.on(canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'mousemove', (e) => {
      const me = e as MouseEvent;
      if (!this.enabled) return;
      if (document.pointerLockElement === canvas || this.dragMouse) {
        this.intent.lookX += me.movementX * 0.0026 * this.sensitivity;
        this.intent.lookY += me.movementY * 0.0026 * this.sensitivity * (this.invertY ? -1 : 1);
      }
    });
    this.on(canvas, 'wheel', (e) => {
      this.intent.zoom += Math.sign((e as WheelEvent).deltaY);
    });

    // Touch: left half of the screen = floating joystick, right half = camera drag.
    const opts: AddEventListenerOptions = { passive: false };
    this.on(touchRoot, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent), opts);
    this.on(window, 'pointermove', (e) => this.onPointerMove(e as PointerEvent), opts);
    this.on(window, 'pointerup', (e) => this.onPointerUp(e as PointerEvent));
    this.on(window, 'pointercancel', (e) => this.onPointerUp(e as PointerEvent));
    this.on(touchRoot, 'lostpointercapture', (e) => this.onPointerUp(e as PointerEvent));
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  private gesture(): void {
    if (this.gestured) return;
    this.gestured = true;
    this.onFirstGesture?.();
  }

  /** Bind a touch button to an intent. Uses pointer events so cancel/blur release it. */
  bindButton(el: HTMLElement, action: 'jump' | 'interact' | 'exit' | 'ability' | 'pause' | 'run' | 'journal'): void {
    const down = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.gesture();
      this.touchActive = true;
      el.classList.add('pressed');
      if (action === 'run') this.touchRun = !this.touchRun;
      else if (action === 'ability') {
        this.intent.ability = true;
        this.touchAbilityHeld = true;
      } else this.intent[action] = true;
    };
    const up = (e: Event) => {
      e.stopPropagation();
      el.classList.remove('pressed');
      if (action === 'ability') this.touchAbilityHeld = false;
    };
    this.on(el, 'pointerdown', down, { passive: false });
    this.on(el, 'pointerup', up);
    this.on(el, 'pointercancel', up);
    this.on(el, 'pointerleave', up);
  }

  private touchRun = false;
  private touchAbilityHeld = false;

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    this.gesture();
    this.touchActive = true;
    e.preventDefault();
    const w = window.innerWidth;
    if (e.clientX < w * 0.45 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickVec = { x: 0, y: 0 };
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      e.preventDefault();
      const dx = e.clientX - this.stickOrigin.x;
      const dy = e.clientY - this.stickOrigin.y;
      const max = 52;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      this.stickVec = { x: (dx * k) / max, y: (dy * k) / max };
      this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    } else if (e.pointerId === this.lookId) {
      e.preventDefault();
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.intent.lookX += dx * 0.0062 * this.sensitivity;
      this.intent.lookY += dy * 0.0062 * this.sensitivity * (this.invertY ? -1 : 1);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickVec = { x: 0, y: 0 };
      this.stick.classList.remove('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
    if (e.pointerId === this.lookId) this.lookId = null;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.code;
    if (down) this.gesture();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    if (down && !e.repeat) {
      if (k === 'Space') this.intent.jump = true;
      if (k === 'KeyE') this.intent.interact = true;
      if (k === 'KeyQ') this.intent.exit = true;
      if (k === 'KeyF') this.intent.ability = true;
      if (k === 'Escape' || k === 'KeyP') this.intent.pause = true;
      if (k === 'Tab' || k === 'KeyJ') this.intent.journal = true;
      if (k === 'KeyH') this.intent.hint = true;
      if (this.touchActive && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k)) this.touchActive = false;
    }
    if (down) this.keys.add(k);
    else this.keys.delete(k);
  }

  private clearAll(): void {
    this.keys.clear();
    this.stickId = null;
    this.lookId = null;
    this.stickVec = { x: 0, y: 0 };
    this.stick.classList.remove('active');
    this.dragMouse = false;
    this.touchAbilityHeld = false;
  }

  /** Recompute continuous intents; call once at the start of each frame. */
  poll(): void {
    const i = this.intent;
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x !== 0 || y !== 0) {
      const l = Math.hypot(x, y);
      x /= l;
      y /= l;
    } else {
      x = this.stickVec.x;
      y = this.stickVec.y;
    }
    i.moveX = x;
    i.moveY = y;
    const stickLen = Math.hypot(this.stickVec.x, this.stickVec.y);
    i.run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || (this.stickId !== null && (stickLen > 0.92 || this.touchRun));
    i.abilityHeld = this.keys.has('KeyF') || this.touchAbilityHeld;
    if (!this.enabled) {
      i.moveX = i.moveY = 0;
    }
  }

  endFrame(): void {
    const i = this.intent;
    i.jump = i.interact = i.exit = i.ability = i.pause = i.journal = i.hint = false;
    i.lookX = i.lookY = 0;
    i.zoom = 0;
  }

  releasePointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Test helper: simulate held keys. */
  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
  }
}
