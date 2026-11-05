export type Action = 'interact' | 'lumo' | 'crawl' | 'jump' | 'pause' | 'throw';

export interface Intents {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  pressed: Set<Action>;
}

/**
 * Collects keyboard, mouse (pointer lock) and touch input into per-frame
 * intents. Gameplay only ever reads `consume()`; it never touches DOM events.
 */
export class InputManager {
  private keys = new Set<string>();
  private pressedQueue = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  private touchMove = { x: 0, y: 0 };
  private autopilotMove: { x: number; y: number } | null = null;
  enabled = true;
  pointerLocked = false;
  sensitivity = 1;
  invertY = false;
  onPointerLockChange: (locked: boolean) => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
  }

  requestPointerLock(): void {
    if (this.isTouchDevice()) return;
    if (document.pointerLockElement === this.canvas) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {});
      }
    } catch {
      /* pointer lock unavailable (iframe without permission); mouse-drag look still works */
    }
  }

  releasePointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isTouchDevice(): boolean {
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  /** Touch joystick vector in [-1, 1]. y > 0 means forward. */
  setTouchMove(x: number, y: number): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  press(action: Action): void {
    this.pressedQueue.add(action);
  }

  /** Test/autopilot override of the move axis (still goes through the controller). */
  setAutopilot(move: { x: number; y: number } | null): void {
    this.autopilotMove = move;
  }

  consume(): Intents {
    let moveX = 0;
    let moveY = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
      moveX += this.touchMove.x;
      moveY += this.touchMove.y;
      if (this.autopilotMove) {
        moveX = this.autopilotMove.x;
        moveY = this.autopilotMove.y;
      }
    }
    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }
    const intents: Intents = {
      moveX,
      moveY,
      lookX: this.lookX * this.sensitivity,
      lookY: this.lookY * this.sensitivity * (this.invertY ? -1 : 1),
      pressed: new Set(this.enabled ? this.pressedQueue : []),
    };
    // Pause must always get through, even when gameplay input is disabled.
    if (this.pressedQueue.has('pause')) intents.pressed.add('pause');
    this.lookX = 0;
    this.lookY = 0;
    this.pressedQueue.clear();
    return intents;
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.keys.add(event.code);
    switch (event.code) {
      case 'KeyE':
        this.pressedQueue.add('interact');
        break;
      case 'KeyF':
        this.pressedQueue.add('lumo');
        break;
      case 'KeyC':
      case 'ControlLeft':
        this.pressedQueue.add('crawl');
        break;
      case 'Space':
        this.pressedQueue.add('jump');
        break;
      case 'Escape':
      case 'KeyP':
        this.pressedQueue.add('pause');
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.touchMove.x = 0;
    this.touchMove.y = 0;
  };

  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.lookX += event.movementX * 0.0022;
    this.lookY += event.movementY * 0.0022;
  };

  private readonly onMouseDown = (event: MouseEvent) => {
    if (this.isTouchDevice()) return;
    if (!this.pointerLocked) return;
    if (event.button === 0) this.pressedQueue.add('throw');
    if (event.button === 2) this.pressedQueue.add('lumo');
  };

  private readonly onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) this.keys.clear();
    this.onPointerLockChange(this.pointerLocked);
  };
}
