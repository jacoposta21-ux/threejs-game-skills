import Phaser from 'phaser';
import { LEVELS } from '../levels/levels';
import { Sound } from '../core/Audio';
import { Save } from '../core/Save';
import { COL, FONT_BODY, FONT_TITLE, ornament } from './ui';
import { buildBackgrounds } from '../art/backgrounds';
import { buildTileset } from '../art/tiles';
import { buildThemeProps } from '../art/props';

/** Narrated interlude before each chapter. Also pre-paints that chapter's textures while the player reads. */
export class StoryScene extends Phaser.Scene {
  constructor() {
    super('Story');
  }
  create(data: { level: number }) {
    const L = LEVELS[data.level];
    Save.data.level = data.level;
    Save.data.checkpoint = -1;
    Save.write();
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setBackgroundColor('#030406');
    this.cameras.main.fadeIn(800, 0, 0, 0);
    Sound.playTheme('menu');
    // pre-build the chapter's art during the narration
    buildBackgrounds(this, L.theme);
    buildTileset(this, L.theme);
    buildThemeProps(this, L.theme);
    const vista = this.add.image(w / 2, h / 2, `bg-${L.theme}-1`).setDisplaySize(w * 1.1, h * 1.1).setAlpha(0);
    this.tweens.add({ targets: vista, alpha: 0.35, duration: 2500 });
    this.tweens.add({ targets: vista, x: w / 2 - 30, duration: 20000 });
    this.add.rectangle(0, 0, w, h, 0x030406, 0.45).setOrigin(0);
    const head = this.add.text(w / 2, h * 0.2, `${L.subtitle.toUpperCase()}`, { fontFamily: FONT_TITLE, fontSize: '15px', color: COL.accent }).setOrigin(0.5).setLetterSpacing(8).setAlpha(0);
    const name = this.add.text(w / 2, h * 0.2 + 34, L.name, { fontFamily: FONT_TITLE, fontSize: `${Math.min(40, w / 18)}px`, color: COL.text }).setOrigin(0.5).setAlpha(0);
    const g = this.add.graphics().setAlpha(0);
    ornament(g, w / 2, h * 0.2 + 70, Math.min(360, w * 0.6));
    this.tweens.add({ targets: [head, name, g], alpha: 1, duration: 1200 });
    let y = h * 0.2 + 110;
    const texts: Phaser.GameObjects.Text[] = [];
    L.intro.forEach((line, i) => {
      const t = this.add.text(w / 2, y, line, { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: `${Math.min(21, w / 34)}px`, color: COL.text, align: 'center', wordWrap: { width: Math.min(720, w - 60) }, lineSpacing: 6 }).setOrigin(0.5, 0).setAlpha(0);
      y += t.height + 22;
      texts.push(t);
      this.tweens.add({ targets: t, alpha: 1, delay: 900 + i * 2200, duration: 1400 });
    });
    const cont = this.add.text(w / 2, h - 50, 'Press any key to continue', { fontFamily: FONT_BODY, fontSize: '15px', color: COL.dim }).setOrigin(0.5).setAlpha(0);
    const ready = 900 + L.intro.length * 2200;
    this.tweens.add({ targets: cont, alpha: 0.8, delay: Math.min(ready, 2500), duration: 800 });
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      Sound.unlock();
      this.cameras.main.fadeOut(700, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { level: data.level, checkpoint: -1 }));
    };
    this.time.delayedCall(700, () => {
      this.input.keyboard!.on('keydown', go);
      this.input.on('pointerdown', go);
      this.input.gamepad?.on('down', go);
    });
  }
}
