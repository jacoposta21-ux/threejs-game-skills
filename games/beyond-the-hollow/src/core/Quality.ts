/**
 * Visual quality. 'high' is the full look; 'low' ("Performance") trims the costliest layers for
 * weaker PCs: two of the four parallax layers, the ambient motes, a coarser darkness overlay,
 * and a 60 fps cap on high-refresh monitors. The game also switches to 'low' by itself if the
 * frame rate stays low (see GameScene.watchFrameRate).
 */
import Phaser from 'phaser';
import { Save } from './Save';

export const Quality = {
  get low() {
    return Save.data.settings.quality === 'low';
  },
  /** auto-switching is off for tests and screenshots (?noauto or the slow ?canvas renderer) */
  autoAllowed() {
    try {
      return !/[?&](noauto|canvas)\b/.test(location.search);
    } catch {
      return true;
    }
  },
  /** cap rendering at 60 fps in Performance mode (a 144 Hz screen would otherwise draw 2.4x as often) */
  applyLoop(game: Phaser.Game) {
    const loop = game.loop as any;
    const want = this.low ? 60 : 0;
    if ((loop.fpsLimit || 0) === want) return;
    try {
      loop.fpsLimit = want;
      loop.hasFpsLimit = want > 0;
      loop._limitRate = want > 0 ? 1000 / want : 0;
      loop.sleep();
      loop.wake();
    } catch { /* keep running uncapped */ }
  },
};
