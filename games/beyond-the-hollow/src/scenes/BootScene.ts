import Phaser from 'phaser';
import { applyLanguage, detectLanguage, type LangCode } from '../core/i18n';
import { buildElias } from '../art/elias';
import { buildCreatures } from '../art/creatures';
import { buildCommonProps, buildFx, buildThemeProps } from '../art/props';
import { buildBackgrounds } from '../art/backgrounds';
import { buildChapter2Common } from '../art/chapter2';
import { buildChapter3 } from '../art/chapter3';
import { buildChapter4 } from '../art/chapter4';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Portal } from '../core/Portal';

/** Paints every shared texture procedurally (no image downloads), then opens the title screen. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  preload() {
  }
  create() {
    Portal.loadingStart();
    const s = Save.load();
    applyLanguage((s.settings.lang as LangCode) || detectLanguage(Portal.language()));
    Sound.setVolumes(s.settings.music, s.settings.sfx);
    const steps: (() => void)[] = [
      () => buildFx(this),
      () => buildElias(this),
      () => buildCreatures(this),
      () => buildCommonProps(this),
      () => buildChapter2Common(this),
      () => buildChapter3(this),
      () => buildChapter4(this),
      () => buildBackgrounds(this, 'forest'),
      () => buildThemeProps(this, 'forest'),
    ];
    const w = this.scale.width, h = this.scale.height;
    const bar = this.add.graphics();
    let i = 0;
    const next = () => {
      if (i < steps.length) {
        steps[i++]();
        Portal.loadingProgress((100 * i) / steps.length);
        bar.clear();
        bar.fillStyle(0x7ff5e0, 0.8);
        bar.fillRect(w / 2 - 120, h / 2 + 40, (240 * i) / steps.length, 2);
        this.time.delayedCall(1, next);
      } else {
        const el = document.getElementById('boot');
        if (el) {
          el.style.opacity = '0';
          setTimeout(() => el.remove(), 700);
        }
        Portal.loadingStop();
        this.scene.start('Menu');
      }
    };
    next();
  }
}
