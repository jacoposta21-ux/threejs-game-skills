import Phaser from 'phaser';
import { Sound } from '../core/Audio';

export const FONT_TITLE = 'Cinzel, Georgia, serif';
export const FONT_BODY = 'Spectral, Georgia, serif';
export const COL = { ink: '#05070a', text: '#efe6d2', dim: '#9aa3a8', accent: '#7ff5e0', warm: '#ffc878' };

export interface MenuItem {
  label: string | (() => string);
  action: () => void;
  enabled?: () => boolean;
}

/** Keyboard / mouse / touch navigable vertical menu with painted pill buttons. */
export class Menu {
  container: Phaser.GameObjects.Container;
  index = 0;
  private rows: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; item: MenuItem; w: number; h: number }[] = [];
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private active = true;
  private padPrev = { up: false, down: false, a: false };

  constructor(private scene: Phaser.Scene, x: number, y: number, items: MenuItem[], opts: { width?: number; gap?: number; size?: number } = {}) {
    this.container = scene.add.container(x, y);
    const w = opts.width ?? 300, gap = opts.gap ?? 54, size = opts.size ?? 22;
    items.forEach((item, i) => {
      const bg = scene.add.graphics();
      const text = scene.add.text(0, i * gap, '', { fontFamily: FONT_TITLE, fontSize: `${size}px`, color: COL.text }).setOrigin(0.5);
      const zone = scene.add.zone(0, i * gap, w, gap - 8).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i));
      zone.on('pointerdown', () => {
        this.select(i);
        this.fire();
      });
      this.container.add([bg, text, zone]);
      this.rows.push({ bg, text, item, w, h: gap - 10 });
      bg.y = i * gap;
    });
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const up = () => this.active && this.select((this.index + this.rows.length - 1) % this.rows.length, true);
    const down = () => this.active && this.select((this.index + 1) % this.rows.length, true);
    const fire = () => this.active && this.fire();
    for (const [code, fn] of [[K.UP, up], [K.W, up], [K.DOWN, down], [K.S, down], [K.ENTER, fire], [K.SPACE, fire], [K.E, fire]] as const) {
      const k = kb.addKey(code, false);
      k.on('down', fn);
      this.keys.push(k);
    }
    scene.events.on('update', this.pollPad, this);
    this.select(this.firstEnabled(), false);
  }
  private pollPad() {
    const pad = this.scene.input.gamepad?.total ? this.scene.input.gamepad.getPad(0) : null;
    if (!pad || !this.active) return;
    const up = pad.up || pad.leftStick.y < -0.5, down = pad.down || pad.leftStick.y > 0.5, a = !!pad.buttons[0]?.pressed;
    if (up && !this.padPrev.up) this.select((this.index + this.rows.length - 1) % this.rows.length, true);
    if (down && !this.padPrev.down) this.select((this.index + 1) % this.rows.length, true);
    if (a && !this.padPrev.a) this.fire();
    this.padPrev = { up, down, a };
  }
  private firstEnabled() {
    return Math.max(0, this.rows.findIndex((r) => !r.item.enabled || r.item.enabled()));
  }
  refresh() {
    if (this.destroyed) return;
    this.rows.forEach((r, i) => {
      const en = !r.item.enabled || r.item.enabled();
      const sel = i === this.index;
      r.text.setText(typeof r.item.label === 'function' ? r.item.label() : r.item.label);
      r.text.setColor(!en ? '#4d555a' : sel ? '#ffffff' : COL.text);
      r.bg.clear();
      if (sel && en) {
        r.bg.fillStyle(0x7ff5e0, 0.1);
        r.bg.fillRoundedRect(-r.w / 2, -r.h / 2, r.w, r.h, r.h / 2);
        r.bg.lineStyle(1.5, 0x7ff5e0, 0.7);
        r.bg.strokeRoundedRect(-r.w / 2, -r.h / 2, r.w, r.h, r.h / 2);
        r.bg.fillStyle(0x7ff5e0, 1);
        r.bg.fillCircle(-r.w / 2 + 18, 0, 3.5);
        r.bg.fillCircle(r.w / 2 - 18, 0, 3.5);
      }
    });
  }
  select(i: number, sound = true) {
    const en = (k: number) => !this.rows[k].item.enabled || this.rows[k].item.enabled!();
    if (!en(i)) {
      // skip disabled rows in the travel direction
      const dir = i > this.index ? 1 : -1;
      let k = i;
      for (let n = 0; n < this.rows.length && !en(k); n++) k = (k + dir + this.rows.length) % this.rows.length;
      i = k;
    }
    if (i !== this.index && sound) Sound.play('ui');
    this.index = i;
    this.refresh();
  }
  fire() {
    const r = this.rows[this.index];
    if (!r || (r.item.enabled && !r.item.enabled())) return;
    Sound.unlock();
    Sound.play('uiSelect');
    r.item.action();
    if (!this.destroyed) this.refresh();
  }
  private destroyed = false;
  setActive(a: boolean) {
    this.active = a;
    this.container.setVisible(a);
  }
  destroy() {
    this.destroyed = true;
    this.active = false;
    this.keys.forEach((k) => k.removeAllListeners());
    this.scene.events.off('update', this.pollPad, this);
    this.container.destroy();
  }
}

export function ornament(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, color = 0x7ff5e0, alpha = 0.7) {
  g.lineStyle(1, color, alpha);
  g.lineBetween(x - w / 2, y, x - 10, y);
  g.lineBetween(x + 10, y, x + w / 2, y);
  g.fillStyle(color, alpha);
  g.fillTriangle(x - 6, y, x, y - 5, x + 6, y);
  g.fillTriangle(x - 6, y, x, y + 5, x + 6, y);
  g.fillCircle(x - w / 2, y, 2);
  g.fillCircle(x + w / 2, y, 2);
}

export function isTouchDevice(scene: Phaser.Scene) {
  return scene.sys.game.device.input.touch && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}

export function toggleFullscreen(scene: Phaser.Scene) {
  try {
    if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
    else scene.scale.startFullscreen();
  } catch {
    /* fullscreen not permitted in this frame */
  }
}
