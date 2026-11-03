import Phaser from 'phaser';
import { DEPTH } from '../core/constants';
import type { Light } from './Objects';

/**
 * Darkness overlay: a render texture glued to the camera's world view, filled with the level's
 * darkness and "erased" by soft radial lights each frame.
 */
export class Lighting {
  rt: Phaser.GameObjects.RenderTexture | null = null;
  brush: Phaser.GameObjects.Image;
  lights: Light[] = [];
  darkness: number;
  extra = 0; // added darkness (boss phase)
  constructor(private scene: Phaser.Scene, darkness: number, private color: number) {
    this.darkness = darkness;
    this.brush = scene.make.image({ x: 0, y: 0, key: 'light', add: false });
    this.resize();
  }
  resize() {
    const cam = this.scene.cameras.main;
    const w = Math.ceil(cam.width / cam.zoom) + 64, h = Math.ceil(cam.height / cam.zoom) + 64;
    if (this.rt) this.rt.destroy();
    // render at reduced resolution — light falloff is soft, so this is visually identical and much cheaper
    this.rt = this.scene.add.renderTexture(0, 0, Math.ceil(w / 2), Math.ceil(h / 2)).setOrigin(0).setScale(2).setDepth(DEPTH.darkness);
  }
  render() {
    const rt = this.rt;
    if (!rt) return;
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    const d = Math.min(0.97, this.darkness + this.extra);
    rt.setVisible(d > 0.02);
    if (d <= 0.02) return;
    rt.setPosition(v.x - 32, v.y - 32);
    rt.clear();
    rt.fill(this.color, d);
    for (const L of this.lights) {
      const lx = (L.x - rt.x) / 2, ly = (L.y - rt.y) / 2;
      const r = L.r / 2;
      if (lx < -r || ly < -r || lx > rt.width + r || ly > rt.height + r) continue;
      this.brush.setScale((r * 2) / 256).setAlpha(Math.min(1, L.i));
      rt.erase(this.brush, lx, ly);
    }
  }
  /** Light intensity 0..1 at a world point (used by stalkers). */
  at(x: number, y: number) {
    let best = 0;
    for (const L of this.lights) {
      const dd = Math.hypot(L.x - x, L.y - y);
      if (dd < L.r) best = Math.max(best, (1 - dd / L.r) * 1.25 * L.i);
    }
    return Math.min(1, best);
  }
}
