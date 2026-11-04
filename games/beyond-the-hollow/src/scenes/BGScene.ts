import Phaser from 'phaser';
import { BG_H, BG_W } from '../art/backgrounds';
import { THEMES, ThemeKey } from '../art/themes';

/** Painted parallax layers rendered behind the game world, driven by the game camera. */
export class BGScene extends Phaser.Scene {
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private theme: ThemeKey = 'station';
  private factors = [0.03, 0.1, 0.22, 0.4];
  auto = 0; // auto-scroll speed for menus
  private ax = 0;
  constructor() {
    super('BG');
  }
  init(data: { theme: ThemeKey; auto?: number }) {
    this.theme = data.theme;
    this.auto = data.auto ?? 0;
    this.ax = 0;
  }
  create() {
    this.layers = [];
    this.cameras.main.setBackgroundColor(THEMES[this.theme].sky[0]);
    for (let i = 0; i < 4; i++) this.layers.push(this.add.tileSprite(0, 0, BG_W, BG_H, `bg-${this.theme}-${i}`).setOrigin(0, 0));
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }
  private layout() {
    const w = this.scale.width, h = this.scale.height;
    const s = Math.max(h / BG_H, 0.5) * 1.12;
    for (const l of this.layers) {
      l.setScale(s);
      l.width = w / s + 4;
      l.height = BG_H;
    }
  }
  /** Warm golden grade for the Keepers' past (Pip's Echo). */
  setWarm(on: boolean) {
    const tint = on ? 0xffd9a0 : 0xffffff;
    for (const l of this.layers) l.setTint(tint);
  }
  update(_t: number, dms: number) {
    const w = this.scale.width, h = this.scale.height;
    const game = this.scene.get('Game');
    let sx = 0, sy = 0, maxSy = 1;
    if (game && game.scene.isActive() || game?.scene.isPaused()) {
      const cam = game.cameras.main;
      sx = cam.scrollX + cam.width / 2;
      sy = cam.scrollY;
      maxSy = Math.max(1, cam.getBounds().height - cam.height / cam.zoom);
    }
    this.ax += (this.auto * dms) / 1000;
    sx += this.ax;
    const s = this.layers[0]?.scaleX || 1;
    this.layers.forEach((l, i) => {
      const f = this.factors[i];
      l.tilePositionX = (sx * f) / s;
      const base = h - BG_H * s;
      l.y = base + (maxSy - Math.min(sy, maxSy)) * f * 0.35 + (i === 0 ? 0 : 6 * i);
      l.x = 0;
    });
    void w;
  }
}
