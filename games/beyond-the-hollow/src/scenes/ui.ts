import Phaser from 'phaser';
import { Sound } from '../core/Audio';

export const FONT_TITLE = 'Cinzel, Georgia, serif';
export const FONT_BODY = 'Spectral, Georgia, serif';
export const COL = { ink: '#05070a', text: '#efe6d2', dim: '#9aa3a8', accent: '#7ff5e0', warm: '#ffc878' };

export interface MenuItem {
  label: string | (() => string);
  action: () => void;
  enabled?: () => boolean;
  /** a universal icon drawn before the label (language selector, settings) */
  icon?: 'globe' | 'gear';
}

/** Keyboard / mouse / touch navigable vertical menu with painted pill buttons. */
export class Menu {
  container: Phaser.GameObjects.Container;
  index = 0;
  private rows: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; item: MenuItem; w: number; h: number; icon?: Phaser.GameObjects.Graphics }[] = [];
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
      const icon = item.icon ? scene.add.graphics() : undefined;
      if (icon) icon.y = i * gap;
      this.container.add(icon ? [bg, text, icon, zone] : [bg, text, zone]);
      this.rows.push({ bg, text, item, w, h: gap - 10, icon });
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
      // longer translations shrink to stay inside the pill
      r.text.setScale(Math.min(1, (r.w - (r.icon ? 84 : 48)) / Math.max(1, r.text.width)));
      if (r.icon) {
        // shift the label right to make room for the icon, then draw it just before the text
        const tw = r.text.width * r.text.scaleX;
        r.text.x = 14;
        drawMenuIcon(r.icon, r.item.icon!, 14 - tw / 2 - 20, 0, !en ? 0x4d555a : sel ? 0xffffff : 0xefe6d2);
      }
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

/** Small line icons (no emoji): a globe for languages, a gear for settings. */
export function drawMenuIcon(g: Phaser.GameObjects.Graphics, kind: 'globe' | 'gear', x: number, y: number, color: number) {
  g.clear();
  g.lineStyle(2, color, 1);
  if (kind === 'globe') {
    const r = 9;
    g.strokeCircle(x, y, r);
    g.strokeEllipse(x, y, r * 0.9, r * 2);
    g.lineBetween(x - r, y, x + r, y);
    g.beginPath();
    g.arc(x, y + r * 1.25, r * 1.05, Phaser.Math.DegToRad(-125), Phaser.Math.DegToRad(-55));
    g.strokePath();
    g.beginPath();
    g.arc(x, y - r * 1.25, r * 1.05, Phaser.Math.DegToRad(55), Phaser.Math.DegToRad(125));
    g.strokePath();
  } else {
    const r = 6.5;
    g.strokeCircle(x, y, r * 0.45);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.lineBetween(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
    }
    g.strokeCircle(x, y, r * 0.8);
  }
}
