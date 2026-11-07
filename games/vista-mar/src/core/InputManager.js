// Keyboard + mouse input with pointer lock, and a drag-to-look fallback when the
// page cannot lock the pointer (e.g. inside a sandboxed preview frame).
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.dragLook = false; // fallback mode
    this.dragging = false;
    this.enabled = true;
    this.onLockChange = null;
    this.lockFailed = false;
    this.lockedAt = 0;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (this.locked || (this.dragLook && this.dragging)) {
        // ignore the warp spike some browsers send right after locking
        if (performance.now() - this.lockedAt < 120) return;
        const cl = (v) => Math.max(-150, Math.min(150, v || 0));
        this.mouseDX += cl(e.movementX);
        this.mouseDY += cl(e.movementY);
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (this.dragLook) { this.dragging = true; return; }
      if (!this.locked && e.button === 0) this.requestLock();
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) { this.lockedAt = performance.now(); this.mouseDX = 0; this.mouseDY = 0; }
      if (this.onLockChange && was !== this.locked) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.useDragFallback());
  }

  useDragFallback() {
    this.lockFailed = true;
    this.dragLook = true;
  }

  requestLock() {
    if (this.dragLook) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => this.useDragFallback());
      if (!this.canvas.requestPointerLock) this.useDragFallback();
    } catch {
      this.useDragFallback();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.enabled && this.keys.has(code);
  }

  hit(code) {
    return this.enabled && this.pressed.has(code);
  }

  /** Consumes accumulated look deltas (also from arrow keys). */
  takeLook(dt) {
    let dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    if (this.enabled) {
      const k = 520 * dt;
      if (this.keys.has('ArrowLeft')) dx -= k;
      if (this.keys.has('ArrowRight')) dx += k;
      if (this.keys.has('ArrowUp')) dy -= k * 0.6;
      if (this.keys.has('ArrowDown')) dy += k * 0.6;
    }
    return { dx, dy };
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.pressed.clear();
  }
}
