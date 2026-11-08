// Keyboard + mouse + multi-touch steering. Direction is -1 (rotate left /
// counter-clockwise view), 0 or +1. When both directions are held, the most
// recently pressed one wins, which feels better than cancelling out.

const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const STICK_RADIUS = 56; // CSS px of finger travel for full turn speed
const STICK_DEADZONE = 6;
const STICK_IDLE = Object.freeze({ active: false, value: 0, anchorX: 0, x: 0, y: 0 });
const STICK_STATE = { active: false, value: 0, anchorX: 0, x: 0, y: 0 };
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

export class InputManager {
  constructor(touchLayer, handlers) {
    this.touchLayer = touchLayer;
    this.handlers = handlers;
    this.keys = new Map(); // code -> press order
    this.pointers = new Map(); // pointerId -> { side, order }
    this.order = 0;
    this.enabled = false;
    this.lastPointerType = 'mouse';
    // 'drag': one-finger floating joystick. Put a finger anywhere and slide
    //   it: while it stays left of where it landed the sphere keeps turning
    //   left (faster the further you slide), until you slide it back.
    // 'sides': hold the left or right half of the screen.
    this.mode = 'drag';
    this.dragDx = 0;
    this.dragStarted = false;

    this.onKeyDown = (e) => {
      if (e.repeat && (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code))) {
        e.preventDefault();
        return;
      }
      if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code)) {
        this.keys.set(e.code, ++this.order);
        e.preventDefault();
      }
      if (e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyP') {
        if (!e.repeat) handlers.onPause?.(e.code);
        e.preventDefault();
      }
      if ((e.code === 'Enter' || e.code === 'KeyR') && !e.repeat) handlers.onConfirm?.(e.code);
      if (e.code === 'KeyM' && !e.repeat) handlers.onMute?.();
      handlers.onAnyInput?.();
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this.onBlur = () => {
      this.keys.clear();
      this.pointers.clear();
    };

    this.onPointerDown = (e) => {
      this.lastPointerType = e.pointerType;
      handlers.onAnyInput?.();
      if (!this.enabled) return;
      this.pointers.set(e.pointerId, { side: this.sideOf(e.clientX), order: ++this.order, x: e.clientX, y: e.clientY, anchorX: e.clientX });
      this.dragStarted = true;
      try {
        touchLayer.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
    };
    this.onPointerMove = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      // only the most recent finger steers in drag mode
      if (this.isLatest(p)) this.dragDx += e.clientX - p.x;
      p.x = e.clientX;
      p.y = e.clientY;
      // floating anchor: past the stick radius the anchor is dragged along, so
      // reversing direction takes only a short slide back
      const off = p.x - p.anchorX;
      if (Math.abs(off) > STICK_RADIUS) p.anchorX = p.x - Math.sign(off) * STICK_RADIUS;
      const side = this.sideOf(e.clientX);
      if (side !== p.side) {
        p.side = side;
        p.order = ++this.order;
      }
    };
    this.onPointerUp = (e) => {
      this.pointers.delete(e.pointerId);
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    touchLayer.addEventListener('pointerdown', this.onPointerDown);
    touchLayer.addEventListener('pointermove', this.onPointerMove);
    touchLayer.addEventListener('pointerup', this.onPointerUp);
    touchLayer.addEventListener('pointercancel', this.onPointerUp);
    touchLayer.addEventListener('lostpointercapture', this.onPointerUp);
    touchLayer.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', () => handlers.onAnyInput?.(), { capture: true });
  }

  isLatest(p) {
    for (const q of this.pointers.values()) if (q.order > p.order) return false;
    return true;
  }

  setMode(mode) {
    this.mode = mode === 'sides' ? 'sides' : 'drag';
    this.pointers.clear();
  }

  /** Floating joystick state for the latest finger: value in -1..1 (0 inside the dead zone). */
  stick() {
    if (this.mode !== 'drag' || this.pointers.size === 0) return STICK_IDLE;
    let p = null;
    for (const q of this.pointers.values()) if (!p || q.order > p.order) p = q;
    const off = p.x - p.anchorX;
    const mag = Math.max(0, Math.abs(off) - STICK_DEADZONE) / (STICK_RADIUS - STICK_DEADZONE);
    STICK_STATE.active = true;
    STICK_STATE.value = Math.sign(off) * Math.min(1, mag);
    STICK_STATE.anchorX = p.anchorX;
    STICK_STATE.x = p.x;
    STICK_STATE.y = p.y;
    return STICK_STATE;
  }

  /** Drag steering since the last call: { active, started, dx (px) }. */
  consumeDrag() {
    const active = this.mode === 'drag' && this.pointers.size > 0;
    const out = { active, started: this.dragStarted, dx: this.dragDx };
    this.dragDx = 0;
    this.dragStarted = false;
    return out;
  }

  sideOf(x) {
    return x < window.innerWidth / 2 ? -1 : 1;
  }

  setEnabled(v) {
    this.enabled = v;
    this.touchLayer.style.pointerEvents = v ? 'auto' : 'none';
    if (!v) this.pointers.clear();
  }

  /** -1, 0 or +1 */
  direction() {
    let bestOrder = -1;
    let dir = 0;
    for (const [code, order] of this.keys) {
      if (order > bestOrder) {
        bestOrder = order;
        dir = LEFT_KEYS.has(code) ? -1 : 1;
      }
    }
    if (this.mode === 'sides') {
      for (const p of this.pointers.values()) {
        if (p.order > bestOrder) {
          bestOrder = p.order;
          dir = p.side;
        }
      }
    }
    return dir;
  }

  /** Side currently held by touch/mouse, used for the on-screen hint glow. */
  heldSides() {
    let l = false;
    let r = false;
    if (this.mode === 'sides') {
      for (const p of this.pointers.values()) {
        if (p.side < 0) l = true;
        else r = true;
      }
    }
    for (const code of this.keys.keys()) {
      if (LEFT_KEYS.has(code)) l = true;
      else r = true;
    }
    return { l, r };
  }

  clear() {
    this.keys.clear();
    this.pointers.clear();
  }
}
