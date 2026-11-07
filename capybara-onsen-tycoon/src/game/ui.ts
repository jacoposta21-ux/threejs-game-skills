import Phaser from 'phaser';
import { ART_SCALE, PALETTE, canvasTex, cssColor, darken, lighten, roundRectPath } from './art.ts';
import { sfx } from './audio.ts';

export const FONT = '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

export function textStyle(size: number, color = '#5a3a26', extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', resolution: 2, ...extra };
}

/*
 * All UI shapes are baked into cached canvas textures: Phaser Graphics are
 * re-tessellated every frame in WebGL, which dominated the frame cost.
 */
const PAD = 8; // room for drop shadows / glow around a shape

/** Rounded panel texture (shadow + fill + border). Origin of the returned image = top-left of the shape. */
export function panelImage(scene: Phaser.Scene, x: number, y: number, w: number, h: number, r = 22, fill = PALETTE.cream, border = PALETTE.wood, borderW = 4, shadow = true): Phaser.GameObjects.Image {
  const key = canvasTex(scene, `panel_${w}x${h}_${r}_${fill}_${border}_${borderW}_${shadow}`, w + PAD * 2, h + PAD * 2, (ctx) => {
    if (shadow) {
      roundRectPath(ctx, PAD + 2, PAD + 6, w, h, r);
      ctx.fillStyle = 'rgba(59,36,20,0.22)';
      ctx.fill();
    }
    roundRectPath(ctx, PAD, PAD, w, h, r);
    ctx.fillStyle = cssColor(fill);
    ctx.fill();
    if (borderW > 0) {
      roundRectPath(ctx, PAD + borderW / 2, PAD + borderW / 2, w - borderW, h - borderW, r);
      ctx.strokeStyle = cssColor(border);
      ctx.lineWidth = borderW;
      ctx.stroke();
    }
  });
  return scene.add.image(x - PAD, y - PAD, key).setOrigin(0).setScale(ART_SCALE);
}

/** Centered pill/circle texture. */
export function pillImage(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number, border = 0xffffff, borderW = 3, alpha = 1): Phaser.GameObjects.Image {
  const key = canvasTex(scene, `pill_${w}x${h}_${fill}_${border}_${borderW}_${alpha}`, w + PAD * 2, h + PAD * 2, (ctx) => {
    roundRectPath(ctx, PAD, PAD, w, h, Math.min(w, h) / 2);
    ctx.fillStyle = cssColor(fill, alpha);
    ctx.fill();
    if (borderW > 0) {
      roundRectPath(ctx, PAD + borderW / 2, PAD + borderW / 2, w - borderW, h - borderW, Math.min(w, h) / 2);
      ctx.strokeStyle = cssColor(border);
      ctx.lineWidth = borderW;
      ctx.stroke();
    }
  });
  return scene.add.image(x, y, key).setScale(ART_SCALE);
}

function buttonTex(scene: Phaser.Scene, w: number, h: number, r: number, c: number, hl: boolean): string {
  return canvasTex(scene, `btn_${w}x${h}_${r}_${c}_${hl}`, w + PAD * 2, h + PAD * 2, (ctx) => {
    const x = PAD;
    const y = PAD;
    if (hl) {
      roundRectPath(ctx, x - 6, y - 6, w + 12, h + 12, r + 6);
      ctx.fillStyle = 'rgba(255,243,160,0.8)';
      ctx.fill();
    }
    roundRectPath(ctx, x, y + 5, w, h - 5, r);
    ctx.fillStyle = cssColor(darken(c, 0.25));
    ctx.fill();
    roundRectPath(ctx, x, y, w, h - 4, r);
    ctx.fillStyle = cssColor(c);
    ctx.fill();
    roundRectPath(ctx, x + 8, y + 5, w - 16, (h - 4) * 0.36, Math.max(4, r - 8));
    ctx.fillStyle = cssColor(lighten(c, 0.3), 0.55);
    ctx.fill();
  });
}

export interface ButtonOpts {
  w: number;
  h: number;
  color: number;
  label?: string;
  sub?: string;
  icon?: string;
  iconScale?: number;
  fontSize?: number;
  subSize?: number;
  radius?: number;
  onClick: () => void;
}

/** Rounded "chunky" button with press feedback. Min touch size is enforced by the caller (≥ 89 logical px at 844×390). */
export class Button extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
  private enabled = true;
  private color: number;
  private highlighted = false;
  private opts: ButtonOpts;
  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts) {
    super(scene, x, y);
    this.opts = opts;
    this.color = opts.color;
    this.bg = scene.add.image(0, 0, '__WHITE').setScale(ART_SCALE);
    this.add(this.bg);
    const tx = opts.icon ? 22 : 0;
    if (opts.icon) {
      this.icon = scene.add.image(-opts.w / 2 + 38, 0, opts.icon).setScale((opts.iconScale ?? 0.75) * ART_SCALE);
      this.add(this.icon);
    }
    const subSize = opts.subSize ?? 20;
    this.label = scene.add.text(tx, opts.sub ? -subSize * 0.55 : 0, opts.label ?? '', textStyle(opts.fontSize ?? 28, '#ffffff')).setOrigin(0.5);
    this.sub = scene.add.text(tx, (opts.fontSize ?? 28) * 0.5, opts.sub ?? '', textStyle(subSize, '#ffffffdd')).setOrigin(0.5);
    this.add([this.label, this.sub]);
    this.setSize(opts.w, opts.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      sfx.unlock();
      this.scene.tweens.add({ targets: this, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true });
      if (this.enabled) {
        sfx.click();
        this.opts.onClick();
      } else sfx.deny();
    });
    this.redraw();
    scene.add.existing(this);
  }

  setEnabled(on: boolean): this {
    if (on !== this.enabled) {
      this.enabled = on;
      this.redraw();
    }
    return this;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setColor(c: number): this {
    if (c !== this.color) {
      this.color = c;
      this.redraw();
    }
    return this;
  }

  setHighlight(on: boolean): this {
    if (on !== this.highlighted) {
      this.highlighted = on;
      this.redraw();
    }
    return this;
  }

  setTexts(label: string, sub?: string): this {
    if (this.label.text !== label) this.label.setText(label);
    if (sub !== undefined && this.sub.text !== sub) this.sub.setText(sub);
    return this;
  }

  private redraw(): void {
    const { w, h } = this.opts;
    const c = this.enabled ? this.color : PALETTE.disabled;
    this.bg.setTexture(buttonTex(this.scene, w, h, this.opts.radius ?? 20, c, this.highlighted && this.enabled));
    this.label.setAlpha(this.enabled ? 1 : 0.85);
    this.icon?.setAlpha(this.enabled ? 1 : 0.6);
  }
}
