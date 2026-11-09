// Converts keyboard, mouse and touch into per-frame game intents.
// Gameplay reads `intents` only; it never touches DOM events directly.

const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const ACTION_KEYS = {
  Space: 'pass',
  KeyJ: 'shoot',
  KeyE: 'skill',
  KeyQ: 'switch',
  KeyF: 'tackle',
  Escape: 'pause',
  KeyP: 'pause',
};

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.held = { shoot: false, pass: false, sprint: false };
    this.pressed = new Set();
    this.released = new Set();
    this.touchMove = { x: 0, y: 0, active: false };
    this.touchHeld = { shoot: false, pass: false, sprint: false };
    this.enabled = true;
    this.lastDevice = 'keyboard';
    this.intents = {
      moveX: 0, moveY: 0, sprint: false,
      shootHeld: false, shootPressed: false, shootReleased: false,
      passPressed: false, skillPressed: false, switchPressed: false,
      tacklePressed: false, pausePressed: false, anyPressed: false,
    };
    this.disposers = [];
    this.bindKeyboard();
    this.bindMouse();
    if (touchRoot) this.bindTouch(touchRoot);
  }

  listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.disposers.push(() => target.removeEventListener(type, fn, opts));
  }

  bindKeyboard() {
    this.listen(window, 'keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const gameKey = MOVE_KEYS[e.code] || ACTION_KEYS[e.code] || e.code === 'ShiftLeft' || e.code === 'ShiftRight';
      if (gameKey) e.preventDefault();
      this.lastDevice = 'keyboard';
      if (e.repeat) return;
      this.keys.add(e.code);
      const action = ACTION_KEYS[e.code];
      if (action) {
        this.pressed.add(action);
        if (action in this.held) this.held[action] = true;
      }
      this.pressed.add('any');
    });
    this.listen(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      const action = ACTION_KEYS[e.code];
      if (action) {
        this.released.add(action);
        if (action in this.held) this.held[action] = false;
      }
    });
    // Losing focus must never leave a key stuck down.
    this.listen(window, 'blur', () => this.releaseAll());
  }

  bindMouse() {
    this.listen(this.canvas, 'mousedown', (e) => {
      if (e.button !== 0) return;
      this.lastDevice = 'keyboard';
      this.held.shoot = true;
      this.pressed.add('shoot');
      this.pressed.add('any');
    });
    this.listen(window, 'mouseup', (e) => {
      if (e.button !== 0 || !this.held.shoot) return;
      if (!this.keys.has('KeyJ')) {
        this.held.shoot = false;
        this.released.add('shoot');
      }
    });
    this.listen(this.canvas, 'contextmenu', (e) => e.preventDefault());
  }

  bindTouch(root) {
    const stick = root.querySelector('#touch-stick');
    const knob = root.querySelector('#touch-knob');
    let stickPointer = null;
    let origin = { x: 0, y: 0 };
    const radius = () => stick.getBoundingClientRect().width * 0.42;

    const moveKnob = (dx, dy) => {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const endStick = () => {
      stickPointer = null;
      this.touchMove = { x: 0, y: 0, active: false };
      moveKnob(0, 0);
      stick.classList.remove('active');
    };
    this.listen(stick, 'pointerdown', (e) => {
      e.preventDefault();
      this.lastDevice = 'touch';
      stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      stick.classList.add('active');
      this.pressed.add('any');
    });
    this.listen(stick, 'pointermove', (e) => {
      if (e.pointerId !== stickPointer) return;
      const rad = radius();
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > rad) {
        dx = (dx / len) * rad;
        dy = (dy / len) * rad;
      }
      moveKnob(dx, dy);
      const mag = Math.min(1, len / rad);
      const dead = 0.12;
      const scale = mag < dead ? 0 : (mag - dead) / (1 - dead) / Math.max(mag, 1e-6);
      this.touchMove = { x: (dx / rad) * scale, y: (-dy / rad) * scale, active: true };
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.listen(stick, type, (e) => {
        if (e.pointerId === stickPointer) endStick();
      });
    }

    for (const button of root.querySelectorAll('[data-action]')) {
      const action = button.dataset.action;
      let pointer = null;
      const release = (e) => {
        if (e.pointerId !== pointer) return;
        pointer = null;
        button.classList.remove('pressed');
        if (action in this.touchHeld) this.touchHeld[action] = false;
        this.released.add(action);
      };
      this.listen(button, 'pointerdown', (e) => {
        e.preventDefault();
        this.lastDevice = 'touch';
        pointer = e.pointerId;
        button.setPointerCapture(e.pointerId);
        button.classList.add('pressed');
        if (action in this.touchHeld) this.touchHeld[action] = true;
        this.pressed.add(action);
        this.pressed.add('any');
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        this.listen(button, type, release);
      }
    }
  }

  releaseAll() {
    this.keys.clear();
    for (const k of Object.keys(this.held)) {
      if (this.held[k]) this.released.add(k);
      this.held[k] = false;
    }
    for (const k of Object.keys(this.touchHeld)) this.touchHeld[k] = false;
    this.touchMove = { x: 0, y: 0, active: false };
  }

  /** Build this frame's intents. Call once per rendered frame, before gameplay. */
  poll() {
    const it = this.intents;
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const dir = MOVE_KEYS[code];
      if (dir) {
        x += dir[0];
        y += dir[1];
      }
    }
    if (this.touchMove.active) {
      x = this.touchMove.x;
      y = this.touchMove.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const on = this.enabled;
    it.moveX = on ? x : 0;
    it.moveY = on ? y : 0;
    it.sprint = on && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchHeld.sprint);
    it.shootHeld = on && (this.held.shoot || this.touchHeld.shoot);
    it.shootPressed = on && this.pressed.has('shoot');
    it.shootReleased = on && this.released.has('shoot');
    it.passPressed = on && this.pressed.has('pass');
    it.skillPressed = on && this.pressed.has('skill');
    it.switchPressed = on && this.pressed.has('switch');
    it.tacklePressed = on && this.pressed.has('tackle');
    it.pausePressed = this.pressed.has('pause');
    it.anyPressed = this.pressed.has('any');
    this.pressed.clear();
    this.released.clear();
    return it;
  }

  dispose() {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
