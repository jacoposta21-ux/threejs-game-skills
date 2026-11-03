import Phaser from 'phaser';

/** Touch buttons write into this shared state (owned by UIScene). */
export const TouchState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  shoot: false,
  pip: false,
  interact: false,
  active: false,
};

type Btn = 'left' | 'right' | 'up' | 'down' | 'jump' | 'shoot' | 'pip' | 'interact' | 'pause';

/**
 * Unified input: keyboard (arrows/WASD + action keys), mouse aim/shoot, gamepad, and touch.
 * Edge-triggered "pressed" flags are valid for exactly one update().
 */
export class Controls {
  held: Record<Btn, boolean> = { left: false, right: false, up: false, down: false, jump: false, shoot: false, pip: false, interact: false, pause: false };
  private prev: Record<Btn, boolean> = { ...this.held };
  pressed: Record<Btn, boolean> = { ...this.held };
  released: Record<Btn, boolean> = { ...this.held };
  aimWorld: Phaser.Math.Vector2 | null = null;
  usingMouse = false;
  enabled = true;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private mouseShoot = false;
  private mousePip = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const map: Record<string, number> = {
      left: K.LEFT, a: K.A, right: K.RIGHT, d: K.D, up: K.UP, w: K.W, down: K.DOWN, s: K.S,
      space: K.SPACE, z: K.Z, x: K.X, j: K.J, q: K.Q, k: K.K, e: K.E, l: K.L, esc: K.ESC, p: K.P, c: K.C, shift: K.SHIFT,
    };
    for (const [n, code] of Object.entries(map)) this.keys[n] = kb.addKey(code, true, false);
    kb.addCapture([K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT]);
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch || TouchState.active) return;
      this.usingMouse = true;
      if (p.rightButtonDown()) this.mousePip = true;
      else this.mouseShoot = true;
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      if (!p.rightButtonDown()) this.mouseShoot = false;
      this.mousePip = false;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch && !TouchState.active) this.usingMouse = true;
    });
    kb.on('keydown', () => {
      this.usingMouse = false;
    });
  }

  private k(...names: string[]) {
    return names.some((n) => this.keys[n]?.isDown);
  }

  update() {
    const pad = this.scene.input.gamepad?.total ? this.scene.input.gamepad.getPad(0) : null;
    const ax = pad ? pad.leftStick.x : 0;
    const ay = pad ? pad.leftStick.y : 0;
    const pb = (i: number) => !!pad && !!pad.buttons[i] && pad.buttons[i].pressed;
    const T = TouchState;
    const h = this.held;
    h.left = this.k('left', 'a') || ax < -0.4 || pb(14) || T.left;
    h.right = this.k('right', 'd') || ax > 0.4 || pb(15) || T.right;
    h.up = this.k('up', 'w') || ay < -0.5 || pb(12) || T.up;
    h.down = this.k('down', 's', 'c') || ay > 0.5 || pb(13) || T.down;
    h.jump = this.k('space', 'z', 'w', 'up') || pb(0) || T.jump;
    h.shoot = this.k('x', 'j') || pb(2) || pb(7) || T.shoot || this.mouseShoot;
    h.pip = this.k('q', 'k') || pb(3) || pb(6) || T.pip || this.mousePip;
    h.interact = this.k('e', 'l', 'shift') || pb(1) || T.interact;
    h.pause = this.k('esc', 'p') || pb(9);
    if (!this.enabled) {
      for (const b of Object.keys(h) as Btn[]) if (b !== 'pause') h[b] = false;
    }
    for (const b of Object.keys(h) as Btn[]) {
      this.pressed[b] = h[b] && !this.prev[b];
      this.released[b] = !h[b] && this.prev[b];
      this.prev[b] = h[b];
    }
    if (this.usingMouse && !TouchState.active) {
      const p = this.scene.input.activePointer;
      const cam = this.scene.cameras.main;
      this.aimWorld = cam.getWorldPoint(p.x, p.y, this.aimWorld ?? new Phaser.Math.Vector2());
    } else this.aimWorld = null;
    this.mousePip = false; // pip via mouse is a single click
  }

  /** jump key without the up/W aliases (so climbing up doesn't jump) */
  get jumpOnlyPressed() {
    return this.pressed.jump && (this.k('space', 'z') || TouchState.jump || !!this.scene.input.gamepad?.getPad(0)?.buttons[0]?.pressed);
  }
}
