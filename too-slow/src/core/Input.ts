export interface InputCallbacks {
  pause(): void;
  respawn(): void;
  mute(): void;
  /** Any key or pointer press: used to unlock audio. */
  gesture(): void;
  /** F3: performance overlay. */
  debug?(): void;
}

type Edge = 'roll' | 'boost' | 'item';

const GAME_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ShiftLeft', 'ShiftRight', 'KeyF', 'Enter', 'NumpadEnter', 'Period', 'Comma', 'Slash', 'Numpad0', 'F3',
]);

/** Key layout for one player. */
interface KeyMap {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  slide: string[];
  spinL: string[];
  spinR: string[];
  roll: string[];
  boost: string[];
  item: string[];
}

const SOLO: KeyMap = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  slide: ['ShiftLeft', 'ShiftRight'],
  spinL: ['KeyQ'],
  spinR: ['KeyE'],
  roll: ['Space'],
  boost: ['KeyE'],
  item: ['KeyF'],
};

/** Split-screen: player one keeps WASD, player two takes the arrows and the keys around them. */
const DUO: [KeyMap, KeyMap] = [
  { ...SOLO, left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], slide: ['ShiftLeft'] },
  {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    slide: ['ShiftRight', 'Numpad0'],
    spinL: ['Comma'],
    spinR: ['Period'],
    roll: ['Enter', 'NumpadEnter'],
    boost: ['Period'],
    item: ['Slash', 'NumpadDecimal'],
  },
];

/** Standard-mapping gamepad buttons. */
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

interface PadRead {
  steer: number;
  throttle: number;
  slide: boolean;
  spin: number;
}

/**
 * Keyboard, gamepad and touch state for up to two players, plus gamepad menu navigation.
 * Translating controls into race intents is the Game's job.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly edges: [Set<Edge>, Set<Edge>] = [new Set(), new Set()];
  private readonly pads: (PadRead | null)[] = [null, null];
  private readonly prevButtons = new Map<number, boolean[]>();
  private navCooldown = 0;
  private touchRoot: HTMLElement | null = null;
  private readonly touchHeld = new Set<string>();
  enabled = true;
  /** Two humans on one keyboard / two pads. */
  duo = false;
  /** Touch controls have been used: crawling forward becomes automatic. */
  touchActive = false;
  /** Last device used, for prompts. */
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';

  constructor(private readonly callbacks: InputCallbacks) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.buildTouch();
    if (window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) {
      this.touchActive = true;
      this.lastDevice = 'touch';
    }
  }

  private map(k: number): KeyMap {
    return this.duo ? DUO[k] : SOLO;
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.callbacks.gesture();
    const typing = e.target instanceof HTMLInputElement && e.target.type === 'text';
    if (GAME_KEYS.has(e.code) && !typing && !(e.code === 'Enter' && !this.enabled)) e.preventDefault();
    if (e.repeat || typing) return;
    this.lastDevice = 'keyboard';
    this.down.add(e.code);
    if (e.code === 'Escape') this.callbacks.pause();
    if (e.code === 'KeyM') this.callbacks.mute();
    if (e.code === 'F3') this.callbacks.debug?.();
    if (!this.enabled) return;
    for (let k = 0; k < (this.duo ? 2 : 1); k += 1) {
      const m = this.map(k);
      if (m.roll.includes(e.code)) this.edges[k].add('roll');
      if (m.boost.includes(e.code)) this.edges[k].add('boost');
      if (m.item.includes(e.code)) this.edges[k].add('item');
    }
    if (e.code === 'KeyR') this.callbacks.respawn();
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private readonly onBlur = () => {
    this.down.clear();
    this.touchHeld.clear();
  };

  private readonly onPointer = () => {
    this.callbacks.gesture();
  };

  private readonly onTouchStart = () => {
    this.callbacks.gesture();
    if (!this.touchActive) {
      this.touchActive = true;
      this.setTouchVisible(this.touchVisible);
    }
    this.lastDevice = 'touch';
  };

  private held(codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  // ---------- per-player controls ----------

  steer(k = 0): number {
    const m = this.map(k);
    let v = (this.held(m.right) ? 1 : 0) - (this.held(m.left) ? 1 : 0);
    const pad = this.pads[k];
    if (pad && Math.abs(pad.steer) > Math.abs(v)) v = pad.steer;
    if (k === 0) v += (this.touchHeld.has('right') ? 1 : 0) - (this.touchHeld.has('left') ? 1 : 0);
    return Math.max(-1, Math.min(1, v));
  }

  throttle(k = 0): number {
    const m = this.map(k);
    let v = (this.held(m.up) ? 1 : 0) - (this.held(m.down) ? 1 : 0);
    const pad = this.pads[k];
    if (pad && Math.abs(pad.throttle) > Math.abs(v)) v = pad.throttle;
    if (k === 0 && this.touchActive && v === 0) v = this.touchHeld.has('brake') ? -1 : 1;
    return v;
  }

  slide(k = 0): boolean {
    return this.held(this.map(k).slide) || !!this.pads[k]?.slide || (k === 0 && this.touchHeld.has('slide'));
  }

  spin(k = 0): number {
    const m = this.map(k);
    let v = (this.held(m.spinR) ? 1 : 0) - (this.held(m.spinL) ? 1 : 0);
    const pad = this.pads[k];
    if (pad && pad.spin !== 0) v = pad.spin;
    if (k === 0 && this.touchHeld.has('boost')) v = 1;
    return v;
  }

  take(k: number, edge: Edge): boolean {
    const had = this.edges[k].has(edge);
    this.edges[k].delete(edge);
    return had;
  }

  /** Back-compat helpers for player one. */
  takeRoll(): boolean {
    return this.take(0, 'roll');
  }

  takeItem(): boolean {
    return this.take(0, 'item');
  }

  takeBoost(): boolean {
    return this.take(0, 'boost');
  }

  clear(): void {
    this.down.clear();
    this.touchHeld.clear();
    for (const e of this.edges) e.clear();
  }

  // ---------- gamepads ----------

  /** Read connected gamepads once per frame. `menu` turns the pad into a menu cursor. */
  poll(dt: number, menu: boolean): void {
    const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pads = Array.from(list ?? []).filter((p): p is Gamepad => !!p && p.connected);
    this.pads[0] = null;
    this.pads[1] = null;
    this.navCooldown = Math.max(0, this.navCooldown - dt);
    pads.forEach((gp, n) => {
      // One pad in split-screen goes to player two (player one keeps the keyboard).
      const player = this.duo ? (pads.length >= 2 ? n : 1) : 0;
      if (player > 1 || (!this.duo && n > 0 && this.pads[0])) return;
      const b = gp.buttons.map((x) => x.pressed);
      const prev = this.prevButtons.get(gp.index) ?? [];
      const pressed = (i: number) => !!b[i] && !prev[i];
      this.prevButtons.set(gp.index, b);
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const rt = gp.buttons[PAD.RT]?.value ?? 0;
      const lt = gp.buttons[PAD.LT]?.value ?? 0;
      const any = b.some(Boolean) || Math.abs(ax) > 0.3 || Math.abs(ay) > 0.3;
      if (any) this.lastDevice = 'gamepad';
      if (any) this.callbacks.gesture();
      if (pressed(PAD.START)) this.callbacks.pause();

      if (menu) {
        this.menuNav(gp, b, pressed, ax, ay);
        return;
      }
      const dpadSteer = (b[PAD.RIGHT] ? 1 : 0) - (b[PAD.LEFT] ? 1 : 0);
      this.pads[player] = {
        steer: dpadSteer || dz(ax),
        throttle: rt > 0.15 ? rt : lt > 0.15 ? -lt : b[PAD.UP] ? 1 : b[PAD.DOWN] ? -1 : -dz(ay) * (Math.abs(ay) > 0.6 ? 1 : 0),
        slide: !!b[PAD.B] || !!b[PAD.RB],
        spin: (b[PAD.X] ? 1 : 0) - (b[PAD.LB] ? 1 : 0),
      };
      if (!this.enabled) return;
      if (pressed(PAD.A)) this.edges[player].add('roll');
      if (pressed(PAD.X)) this.edges[player].add('boost');
      if (pressed(PAD.Y)) this.edges[player].add('item');
      if (pressed(PAD.BACK)) this.callbacks.respawn();
    });
  }

  private menuNav(_gp: Gamepad, b: boolean[], pressed: (i: number) => boolean, ax: number, ay: number): void {
    const screen = Array.from(document.querySelectorAll<HTMLElement>('.screen')).find((s) => !s.classList.contains('hidden'));
    if (!screen) return;
    const items = Array.from(screen.querySelectorAll<HTMLElement>('button, input, [data-nav]')).filter(
      (el) => el.offsetParent !== null && !(el as HTMLButtonElement).disabled,
    );
    if (items.length === 0) return;
    let current = document.activeElement as HTMLElement | null;
    if (!current || !items.includes(current)) current = null;
    const focus = (el: HTMLElement) => {
      el.focus({ preventScroll: false });
      el.classList.add('pad-focus');
      el.addEventListener('blur', () => el.classList.remove('pad-focus'), { once: true });
    };

    let dx = (b[PAD.RIGHT] ? 1 : 0) - (b[PAD.LEFT] ? 1 : 0);
    let dy = (b[PAD.DOWN] ? 1 : 0) - (b[PAD.UP] ? 1 : 0);
    if (!dx && Math.abs(ax) > 0.55) dx = Math.sign(ax);
    if (!dy && Math.abs(ay) > 0.55) dy = Math.sign(ay);
    if ((dx || dy) && this.navCooldown <= 0) {
      this.navCooldown = 0.2;
      if (!current) {
        focus(screen.querySelector<HTMLElement>('.btn-primary:not([disabled])') ?? items[0]);
      } else if (current instanceof HTMLInputElement && current.type === 'range' && dx) {
        current.value = String(Number(current.value) + dx * 10);
        current.dispatchEvent(new Event('input', { bubbles: true }));
        current.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const from = current.getBoundingClientRect();
        const cx = from.left + from.width / 2;
        const cy = from.top + from.height / 2;
        let best: HTMLElement | null = null;
        let bestScore = Infinity;
        for (const el of items) {
          if (el === current) continue;
          const r = el.getBoundingClientRect();
          const ex = r.left + r.width / 2 - cx;
          const ey = r.top + r.height / 2 - cy;
          const along = ex * dx + ey * dy;
          if (along <= 4) continue;
          const across = Math.abs(dx ? ey : ex);
          const score = along + across * 2.5;
          if (score < bestScore) {
            bestScore = score;
            best = el;
          }
        }
        if (best) focus(best);
      }
    }
    if (!dx && !dy && Math.abs(ax) < 0.3 && Math.abs(ay) < 0.3) this.navCooldown = 0;

    if (pressed(PAD.A)) {
      if (!current) focus(screen.querySelector<HTMLElement>('.btn-primary:not([disabled])') ?? items[0]);
      else current.click();
    }
    if (pressed(PAD.B)) {
      const back = screen.querySelector<HTMLElement>('[data-back], #btn-resume');
      back?.click();
    }
  }

  // ---------- touch ----------

  private touchVisible = false;

  private buildTouch(): void {
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="tc-left">
        <button type="button" data-t="left" aria-label="Steer left">◀</button>
        <button type="button" data-t="right" aria-label="Steer right">▶</button>
      </div>
      <div class="tc-right">
        <button type="button" data-t="item" class="tc-small" aria-label="Use item">ITEM</button>
        <button type="button" data-t="boost" class="tc-small" aria-label="Boost">BOOST</button>
        <button type="button" data-t="brake" class="tc-small" aria-label="Brake">BRAKE</button>
        <button type="button" data-t="slide" aria-label="Slide">SLIDE</button>
        <button type="button" data-t="roll" class="tc-main" aria-label="Shell">SHELL</button>
      </div>`;
    const press = (name: string, on: boolean) => {
      if (on) {
        this.touchHeld.add(name);
        if (!this.enabled) return;
        if (name === 'roll') this.edges[0].add('roll');
        if (name === 'boost') this.edges[0].add('boost');
        if (name === 'item') this.edges[0].add('item');
      } else {
        this.touchHeld.delete(name);
      }
    };
    root.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      const name = btn.dataset.t ?? '';
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('on');
        press(name, true);
      });
      const up = () => {
        btn.classList.remove('on');
        press(name, false);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    (document.getElementById('app') ?? document.body).appendChild(root);
    this.touchRoot = root;
  }

  /** Touch buttons show only during a race on touch devices. */
  setTouchVisible(on: boolean): void {
    this.touchVisible = on;
    this.touchRoot?.classList.toggle('hidden', !(on && this.touchActive));
    document.body.classList.toggle('touch-ui', on && this.touchActive);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('touchstart', this.onTouchStart);
    this.touchRoot?.remove();
  }
}
