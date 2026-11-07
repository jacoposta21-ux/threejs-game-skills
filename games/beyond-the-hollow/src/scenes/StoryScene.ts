import Phaser from 'phaser';
import { t } from '../core/i18n';
import { LEVELS } from '../levels/levels';
import { Sound } from '../core/Audio';
import { Save } from '../core/Save';
import { COL, FONT_BODY, FONT_TITLE, ornament } from './ui';
import { BG_H, BG_W, buildBackgrounds } from '../art/backgrounds';
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
    // the chapter's full painted vista (all four parallax layers), drifting slowly like a camera pan
    const s = Math.max(h / BG_H, w / BG_W) * 1.08;
    for (let i = 0; i < 4; i++) {
      const layer = this.add.tileSprite(0, h, w / s + 120, BG_H, `bg-${L.theme}-${i}`).setOrigin(0, 1).setScale(s).setAlpha(0);
      this.tweens.add({ targets: layer, alpha: 0.75, duration: 2200, delay: i * 150 });
      this.tweens.add({ targets: layer, tilePositionX: 40 + i * 70, duration: 26000, ease: 'Sine.inOut' });
    }
    // drifting motes of light
    for (let i = 0; i < 26; i++) {
      const m = this.add.circle(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.2, 0xbfffee, 0).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: m, alpha: 0.15 + Math.random() * 0.45, duration: 1600 + Math.random() * 2000, yoyo: true, repeat: -1, delay: Math.random() * 2000 });
      this.tweens.add({ targets: m, y: m.y - 60 - Math.random() * 80, x: m.x + (Math.random() - 0.5) * 60, duration: 9000 + Math.random() * 7000, repeat: -1, yoyo: true, ease: 'Sine.inOut' });
    }
    // darken toward the centre so the narration stays readable
    const shade = this.add.graphics();
    shade.fillStyle(0x030406, 0.62).fillRect(0, 0, w, h);
    shade.fillGradientStyle(0x030406, 0x030406, 0x030406, 0x030406, 0.55, 0.55, 0, 0).fillRect(0, 0, w, h * 0.12);
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
    const cont = this.add.text(w / 2, h - 50, t('Press any key to continue'), { fontFamily: FONT_BODY, fontSize: '15px', color: COL.dim }).setOrigin(0.5).setAlpha(0);
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
