import Phaser from 'phaser';
import { Sound } from '../core/Audio';
import { Save } from '../core/Save';
import { CHAPTERS, LEVELS } from '../levels/levels';
import { COL, FONT_BODY, FONT_TITLE, ornament } from './ui';
import { linear, paintTexture, radial, rng } from '../art/paint';
import { buildBackgrounds } from '../art/backgrounds';

/** Dawn on Hollow Ridge: the closing cinematic and credits. */
export class EndingScene extends Phaser.Scene {
  constructor() {
    super('Ending');
  }
  create(data: { chapter?: number; next?: number }) {
    const chapter = data.chapter ?? 1;
    const next = data.next ?? -1;
    const ch = CHAPTERS[chapter - 1];
    const w = this.scale.width, h = this.scale.height;
    Sound.playTheme('ending');
    paintTexture(this, 'dawn', 1024, 640, (c) => {
      c.fillStyle = linear(c, 0, 0, 0, 640, [[0, '#1a2448'], [0.45, '#e08a6a'], [0.62, '#ffd59a'], [1, '#3a2a3a']]);
      c.fillRect(0, 0, 1024, 640);
      c.fillStyle = radial(c, 620, 420, 260, [[0, 'rgba(255,250,220,1)'], [0.2, 'rgba(255,220,150,0.6)'], [1, 'rgba(255,200,120,0)']]);
      c.fillRect(0, 0, 1024, 640);
      const r = rng(4);
      for (let layer = 0; layer < 3; layer++) {
        c.fillStyle = ['#7a4a5a', '#4a2c3c', '#1a0f18'][layer];
        c.beginPath();
        c.moveTo(0, 640);
        for (let x = 0; x <= 1024; x += 32) c.lineTo(x, 420 + layer * 50 + Math.sin(x * 0.01 + layer) * 30 + r() * 20);
        c.lineTo(1024, 640);
        c.fill();
      }
      // the old station on the ridge
      c.fillStyle = '#1a0f18';
      c.fillRect(170, 470, 70, 50);
      c.fillRect(200, 420, 12, 60);
      c.fillRect(150, 500, 120, 30);
    });
    const bg = this.add.image(w / 2, h / 2, 'dawn').setDisplaySize(Math.max(w, h * 1.6), Math.max(h, w / 1.6));
    this.tweens.add({ targets: bg, scale: bg.scale * 1.06, duration: 30000 });
    const el = this.add.sprite(w * 0.42, h * 0.86, 'elias', 0).setScale(0.8).setOrigin(0.5, 0.95).play('elias-idle').setTint(0x2a1a22);
    const pip = this.add.sprite(w * 0.42 + 40, h * 0.86 - 80, 'pip', 0).setScale(0.6).play('pip-fly');
    const glow = this.add.image(pip.x, pip.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd27a).setScale(1.3);
    this.tweens.add({ targets: [pip, glow], y: '-=14', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.cameras.main.fadeIn(2500, 255, 255, 255);
    const lines = ch.ending;
    if (chapter === 2) {
      buildBackgrounds(this, 'ruins');
      // the open capsule in the deep vault, lit by the temple's glow instead of a dawn sky
      bg.setTexture('bg-ruins-0');
      this.add.image(w / 2, h / 2, 'bg-ruins-2').setDisplaySize(Math.max(w, h * 1.6), Math.max(h, w / 1.6)).setAlpha(0.9);
      el.setDepth(5).clearTint();
      pip.setDepth(5);
      glow.setDepth(5);
    }
    lines.forEach((l, i) => {
      const t = this.add.text(w / 2, h * 0.16 + i * 44, l, { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: `${Math.min(21, w / 36)}px`, color: '#fff6e8', stroke: '#2a1420', strokeThickness: 4, align: 'center', wordWrap: { width: w - 60 } }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 2000 + i * 3000, duration: 1500 });
      this.tweens.add({ targets: t, alpha: 0, delay: 15000, duration: 1500 });
    });
    const c = this.add.container(w / 2, h * 0.36).setAlpha(0);
    const t = this.add.text(0, 0, `CHAPTER ${ch.roman} · ${ch.title.toUpperCase()}`, { fontFamily: FONT_TITLE, fontSize: `${Math.min(48, w / 16)}px`, color: '#fff6e8', stroke: '#2a1420', strokeThickness: 6 }).setOrigin(0.5).setLetterSpacing(6);
    const g = this.add.graphics();
    ornament(g, 0, 40, 380, 0xfff0d0, 0.9);
    const found = Save.data.lore.length;
    const total = LEVELS.reduce((n, L) => n + L.lore.length, 0);
    const credits = this.add.text(0, 70, `${next >= 0 ? 'Chapter complete' : 'Thank you for playing'}\n\nRecordings found  ${found} / ${total}      Falls  ${Save.data.deaths}\n\n${ch.next ? 'Next — ' + ch.next : ''}`, { fontFamily: FONT_BODY, fontSize: '17px', color: '#fff6e8', align: 'center', stroke: '#2a1420', strokeThickness: 3 }).setOrigin(0.5, 0);
    c.add([g, t, credits]);
    this.tweens.add({ targets: c, alpha: 1, delay: 16500, duration: 2000 });
    const back = this.add.text(w / 2, h - 36, next >= 0 ? 'Press any key to begin the next chapter' : 'Press any key to return to the title', { fontFamily: FONT_BODY, fontSize: '15px', color: COL.text }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: back, alpha: 0.85, delay: 18000, duration: 1000 });
    this.time.delayedCall(4000, () => {
      const go = () => {
        this.cameras.main.fadeOut(900, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => (next >= 0 ? this.scene.start('Story', { level: next }) : this.scene.start('Menu')));
      };
      this.input.keyboard!.once('keydown', go);
      this.input.once('pointerdown', go);
    });
  }
}
