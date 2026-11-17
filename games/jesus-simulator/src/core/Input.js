/**
 * Converts raw keyboard/mouse into per-frame intents. Systems read intents,
 * never DOM events, so input can later come from a network or replay source.
 */
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyF', 'KeyQ', 'KeyG', 'Tab',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = 0;
    this.mousePressed = new Set();
    this.enabled = false;
    this.pointerLocked = false;
    this.onPointerLockChange = null;

    this._key = (e) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.type === 'keydown') {
        if (!e.repeat) this.pressed.add(e.code);
        this.down.add(e.code);
      } else {
        this.down.delete(e.code);
      }
    };
    this._mouseMove = (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._mouseDown = (e) => {
      if (!this.enabled) return;
      if (!this.pointerLocked && e.target === canvas) this.requestLock();
      this.buttons = e.buttons;
      this.mousePressed.add(e.button);
    };
    this._mouseUp = (e) => {
      this.buttons = e.buttons;
    };
    this._wheel = (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
    };
    this._lockChange = () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      this.onPointerLockChange?.(this.pointerLocked);
    };
    this._blur = () => this.releaseAll();
    this._context = (e) => e.preventDefault();

    window.addEventListener('keydown', this._key);
    window.addEventListener('keyup', this._key);
    window.addEventListener('mousemove', this._mouseMove);
    window.addEventListener('mousedown', this._mouseDown);
    window.addEventListener('mouseup', this._mouseUp);
    window.addEventListener('wheel', this._wheel, { passive: true });
    window.addEventListener('blur', this._blur);
    document.addEventListener('pointerlockchange', this._lockChange);
    canvas.addEventListener('contextmenu', this._context);
  }

  requestLock() {
    try {
      const result = this.canvas.requestPointerLock?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* pointer lock can be refused (iframe policy); camera keys still work */
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  releaseAll() {
    this.down.clear();
    this.pressed.clear();
    this.mousePressed.clear();
    this.buttons = 0;
    this.mouseDX = this.mouseDY = this.wheel = 0;
  }

  /** Snapshot intents for this frame, then clear edge-triggered state. */
  read() {
    const d = this.down;
    const intent = {
      moveX: (d.has('KeyD') ? 1 : 0) - (d.has('KeyA') ? 1 : 0),
      moveY: (d.has('KeyW') ? 1 : 0) - (d.has('KeyS') ? 1 : 0),
      sprint: d.has('ShiftLeft') || d.has('ShiftRight'),
      jump: this.pressed.has('Space'),
      jumpHeld: d.has('Space'),
      interact: this.pressed.has('KeyE'),
      vehicle: this.pressed.has('KeyF'),
      command: this.pressed.has('KeyG'),
      map: this.pressed.has('Tab'),
      primary: this.mousePressed.has(0),
      // cast = left click (while the pointer is captured) or Q; held versions for sustained miracles
      cast: (this.mousePressed.has(0) && this.pointerLocked) || this.pressed.has('KeyQ'),
      castHeld: ((this.buttons & 1) !== 0 && this.pointerLocked) || d.has('KeyQ'),
      aim: (this.buttons & 2) !== 0,
      slot: null,
      lookX: this.mouseDX + ((d.has('ArrowRight') ? 1 : 0) - (d.has('ArrowLeft') ? 1 : 0)) * 14,
      lookY: this.mouseDY + ((d.has('ArrowDown') ? 1 : 0) - (d.has('ArrowUp') ? 1 : 0)) * 10,
      zoom: this.wheel,
    };
    for (let i = 1; i <= 6; i += 1) if (this.pressed.has(`Digit${i}`)) intent.slot = i - 1;
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
    return intent;
  }

  dispose() {
    window.removeEventListener('keydown', this._key);
    window.removeEventListener('keyup', this._key);
    window.removeEventListener('mousemove', this._mouseMove);
    window.removeEventListener('mousedown', this._mouseDown);
    window.removeEventListener('mouseup', this._mouseUp);
    window.removeEventListener('wheel', this._wheel);
    window.removeEventListener('blur', this._blur);
    document.removeEventListener('pointerlockchange', this._lockChange);
    this.canvas.removeEventListener('contextmenu', this._context);
  }
}
