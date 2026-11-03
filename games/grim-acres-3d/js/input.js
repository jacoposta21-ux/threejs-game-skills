// Keyboard, mouse wheel and touch (virtual joystick + action button).
// Discrete presses are queued as named actions and consumed once per frame.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'action', Space: 'action', Enter: 'action', NumpadEnter: 'action',
  Tab: 'notebook', KeyN: 'notebook', Escape: 'pause', KeyP: 'pause', KeyI: 'bag', KeyB: 'bag', KeyM: 'mute',
  Digit1: 'hot0', Digit2: 'hot1', Digit3: 'hot2', Digit4: 'hot3', Digit5: 'hot4',
  Numpad1: 'hot0', Numpad2: 'hot1', Numpad3: 'hot2', Numpad4: 'hot3', Numpad5: 'hot4',
};
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Enter']);

export class Input {
  constructor() {
    this.held = new Set();   // movement directions currently held
    this.heldCodes = new Map(); // key code -> direction (so W and ArrowUp don't cancel each other)
    this.queue = [];
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchMode = false;
    this.onFirstGesture = null;
    this._wheelT = 0;
    this.pad = { x: 0, y: 0, prev: [], axisDir: null, active: false };

    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (PREVENT.has(e.code)) e.preventDefault();
      this._gesture();
      if (!a) return;
      if (['up', 'down', 'left', 'right'].includes(a)) { this.heldCodes.set(e.code, a); this._syncHeld(); }
      if (!e.repeat) this.queue.push(a);
    });
    window.addEventListener('keyup', (e) => {
      // With Cmd/Ctrl/Alt down, browsers often swallow the keyup of other keys: drop everything.
      if (['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'].includes(e.code)) { this.clearHeld(); return; }
      this.heldCodes.delete(e.code);
      this._syncHeld();
    });
    // Anything that can steal focus also releases all keys, so a missed keyup never leaves you walking.
    window.addEventListener('blur', () => this.clearHeld());
    document.addEventListener('visibilitychange', () => this.clearHeld());
    window.addEventListener('contextmenu', () => this.clearHeld());
    window.addEventListener('pointerdown', () => this._gesture(), { capture: true });
  }

  _syncHeld() { this.held = new Set(this.heldCodes.values()); }

  _gesture() { if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); } }

  // Hook up the canvas + touch widgets (created in index.html).
  attach(canvas, els) {
    this.els = els;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - this._wheelT < 90) return;
      this._wheelT = now;
      this.queue.push(e.deltaY > 0 ? 'hotNext' : 'hotPrev');
    }, { passive: false });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0 && !this.touchMode) this.queue.push('click'); });

    const zone = els.zone;
    zone.addEventListener('touchstart', (e) => {
      this.setTouchMode(true);
      for (const t of e.changedTouches) {
        if (this.joy.id === null) {
          this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY; this.joy.x = 0; this.joy.y = 0;
          this._joyShow(true);
        }
      }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const max = 42, len = Math.hypot(dx, dy);
        if (len > max) { this.joy.ox += (dx / len) * (len - max); this.joy.oy += (dy / len) * (len - max); dx = (dx / len) * max; dy = (dy / len) * max; }
        this.joy.x = dx / max; this.joy.y = dy / max;
        this._joyShow(true);
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.joy.id) this._joyEnd(); };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);

    els.action.addEventListener('touchstart', (e) => { e.preventDefault(); this.setTouchMode(true); this._gesture(); this.queue.push('action'); }, { passive: false });
    els.action.addEventListener('mousedown', (e) => { e.preventDefault(); this.queue.push('action'); });
    window.addEventListener('touchstart', () => this.setTouchMode(true), { passive: true, capture: true });
    // safety net: when no finger is on the screen any more, the joystick is released
    window.addEventListener('touchend', (e) => { if (!e.touches.length) this._joyEnd(); }, { passive: true });
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
  }

  _joyShow(on) {
    const { base, knob } = this.els;
    base.style.display = knob.style.display = on ? 'block' : 'none';
    if (!on) return;
    base.style.left = `${this.joy.ox}px`; base.style.top = `${this.joy.oy}px`;
    knob.style.left = `${this.joy.ox + this.joy.x * 42}px`; knob.style.top = `${this.joy.oy + this.joy.y * 42}px`;
  }

  _joyEnd() { this.joy.id = null; this.joy.x = this.joy.y = 0; if (this.els) this._joyShow(false); }

  // Gamepad (standard mapping): stick/d-pad move, A use, B back/pause, X bag, Y notebook, LB/RB hotbar.
  poll() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const gp = [...pads].find((p) => p && p.connected);
    this.pad.x = this.pad.y = 0;
    if (!gp) return;
    // Some PCs expose phantom "gamepads" with drifting sticks: ignore the pad until a real button press.
    if (!this.pad.active) {
      if (gp.buttons.some((b) => b.pressed)) this.pad.active = true; else return;
    }
    const map = { 0: 'action', 1: 'pause', 2: 'bag', 3: 'notebook', 4: 'hotPrev', 5: 'hotNext', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
    gp.buttons.forEach((b, i) => {
      const down = b.pressed || b.value > 0.5;
      if (down && !this.pad.prev[i] && map[i]) { this.queue.push(map[i]); this._gesture(); }
      this.pad.prev[i] = down;
    });
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    if (Math.hypot(x, y) < 0.35) x = y = 0;
    const b = gp.buttons;
    if (b[14] && b[14].pressed) x = -1; if (b[15] && b[15].pressed) x = 1;
    if (b[12] && b[12].pressed) y = -1; if (b[13] && b[13].pressed) y = 1;
    this.pad.x = x; this.pad.y = y;
    // the stick also navigates menus: one step each time it is pushed past the threshold
    const dir = Math.abs(x) > 0.6 || Math.abs(y) > 0.6 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up')) : null;
    if (dir && dir !== this.pad.axisDir) this.queue.push(dir);
    this.pad.axisDir = dir;
  }

  get move() {
    let x = this.pad.x, y = this.pad.y;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('up')) y -= 1;
    if (this.held.has('down')) y += 1;
    if (this.joy.id !== null) { x += this.joy.x; y += this.joy.y; }
    return { x, y };
  }

  consume() { const q = this.queue; this.queue = []; return q; }
  clearHeld() { this.heldCodes.clear(); this.held.clear(); this._joyEnd(); }
}
