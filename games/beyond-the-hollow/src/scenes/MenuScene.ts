import Phaser from 'phaser';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { LEVELS } from '../levels/levels';
import { COL, FONT_BODY, FONT_TITLE, Menu, MenuItem, isTouchDevice, ornament, toggleFullscreen } from './ui';

/** Title screen: painted vista, Elias on a ledge with Pip, and the main menu. */
export class MenuScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private root!: Phaser.GameObjects.Container;
  private elias!: Phaser.GameObjects.Sprite;
  private pip!: Phaser.GameObjects.Sprite;
  private pipGlow!: Phaser.GameObjects.Image;
  private started = false;
  private t = 0;
  private prompt!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Container;
  private ledge!: Phaser.GameObjects.Graphics;
  private page: 'main' | 'chapters' | 'settings' | 'controls' = 'main';

  constructor() {
    super('Menu');
  }

  create() {
    this.started = false;
    this.scene.launch('BG', { theme: 'forest', auto: 14 });
    this.scene.sendToBack('BG');
    this.cameras.main.fadeIn(900, 0, 0, 0);
    this.ledge = this.add.graphics();
    this.elias = this.add.sprite(0, 0, 'elias', 0).setScale(0.75).setOrigin(0.5, 152 / 160).play('elias-idle');
    this.pip = this.add.sprite(0, 0, 'pip', 0).setScale(0.6).play('pip-fly');
    this.pipGlow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc860).setAlpha(0.7).setScale(1.4);
    this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: 2000 }, y: { min: 0, max: 1200 }, lifespan: 6000, speedY: { min: -18, max: -4 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.05, end: 0.3 }, alpha: { start: 0, end: 0.9, ease: 'Sine.inOut' }, tint: [0x7fffd0, 0xff9ae6, 0xffe39a], blendMode: 'ADD', frequency: 90,
    });
    this.root = this.add.container(0, 0);
    this.title = this.add.container(0, 0);
    const sub = this.add.text(0, -54, 'A   T A L E   O F   E L I A S   A N D   P I P', { fontFamily: FONT_BODY, fontSize: '13px', color: COL.accent }).setOrigin(0.5);
    const t1 = this.add.text(0, 0, 'BEYOND', { fontFamily: FONT_TITLE, fontSize: '30px', color: COL.text, stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setLetterSpacing(18);
    const t2 = this.add.text(0, 50, 'THE HOLLOW', { fontFamily: FONT_TITLE, fontSize: '68px', fontStyle: '600', color: '#f7efdc', stroke: '#05070a', strokeThickness: 8 }).setOrigin(0.5).setLetterSpacing(8);
    const g = this.add.graphics();
    ornament(g, 0, 100, 420, 0x7ff5e0, 0.8);
    this.title.add([g, sub, t1, t2]);
    if (this.game.renderer.type === Phaser.WEBGL) t2.postFX?.addGlow(0x7ff5e0, 2, 0, false, 0.1, 12);
    this.prompt = this.add.text(0, 0, isTouchDevice(this) ? 'Tap to begin' : 'Press any key', { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: '20px', color: COL.text }).setOrigin(0.5);
    this.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 1100, yoyo: true, repeat: -1 });
    const go = () => {
      if (this.started) return;
      this.started = true;
      Sound.unlock();
      Sound.playTheme('menu');
      Sound.play('uiSelect');
      this.tweens.killTweensOf(this.prompt);
      this.tweens.add({ targets: this.prompt, alpha: 0, duration: 300, onComplete: () => this.prompt.setVisible(false) });
      this.showMain();
    };
    this.input.keyboard!.once('keydown', go);
    this.input.once('pointerdown', go);
    this.input.gamepad?.once('down', go);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.menu?.destroy();
      this.menu = null;
    });
    // If audio was already unlocked (returning from a game), skip the prompt
    if (Sound.ctx) {
      this.time.delayedCall(10, go);
      this.prompt.setVisible(false);
    }
  }

  private layout() {
    const w = this.scale.width, h = this.scale.height;
    const portrait = h > w;
    const s = Math.min(1, w / 900, h / 620);
    this.title.setPosition(portrait ? w / 2 : w * 0.66, h * (portrait ? 0.2 : 0.24) + (1 - s) * -20).setScale(s);
    this.prompt.setPosition(this.title.x, h * 0.62);
    this.root.setPosition(this.title.x, this.title.y + 150 * s + 24).setScale(Math.max(0.62, s));
    const lx = portrait ? w * 0.5 : w * 0.2, ly = h * 0.86;
    this.elias.setPosition(lx, ly);
    this.ledge.clear();
    this.ledge.fillStyle(0x07040c, 1);
    this.ledge.beginPath();
    this.ledge.moveTo(lx - 260, h + 10);
    this.ledge.lineTo(lx - 200, ly + 4);
    this.ledge.lineTo(lx + 70, ly);
    this.ledge.lineTo(lx + 120, ly + 30);
    this.ledge.lineTo(lx + 150, h + 10);
    this.ledge.closePath();
    this.ledge.fillPath();
    this.ledge.fillStyle(0x2f8f6f, 0.9);
    for (let i = 0; i < 26; i++) this.ledge.fillTriangle(lx - 200 + i * 10, ly + 3, lx - 196 + i * 10, ly - 6 - (i % 3) * 3, lx - 192 + i * 10, ly + 3);
    if (this.page === 'main' && this.menu) this.showMain();
  }

  update(_t: number, dms: number) {
    this.t += dms / 1000;
    const ex = this.elias.x, ey = this.elias.y;
    this.pip.setPosition(ex + 40 + Math.cos(this.t * 0.9) * 46, ey - 92 + Math.sin(this.t * 1.7) * 16);
    this.pip.setFlipX(Math.sin(this.t * 0.9) > 0);
    this.pipGlow.setPosition(this.pip.x, this.pip.y).setAlpha(0.6 + Math.sin(this.t * 5) * 0.1);
  }

  private setMenu(items: MenuItem[], width = 320) {
    this.menu?.destroy();
    this.menu = new Menu(this, 0, 0, items, { width, gap: Math.max(40, Math.min(54, this.scale.height / 11)) });
    this.root.removeAll(true);
    this.root.add(this.menu.container);
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 300 });
  }

  private showMain() {
    this.page = 'main';
    const has = Save.hasProgress() && !Save.data.completed;
    const items: MenuItem[] = [];
    if (has) items.push({ label: `Continue — ${LEVELS[Save.data.level]?.subtitle ?? ''}`, action: () => this.startGame(Save.data.level, Save.data.checkpoint) });
    items.push({ label: has || Save.data.completed ? 'New Journey' : 'Begin the Journey', action: () => { Save.newGame(); this.registry.getAll && Object.keys(this.registry.getAll()).forEach((k) => k.startsWith('persist-') && this.registry.remove(k)); this.startStory(0); } });
    items.push({ label: 'Chapters', action: () => this.showChapters() });
    items.push({ label: 'Settings', action: () => this.showSettings() });
    items.push({ label: 'How to Play', action: () => this.showControls() });
    items.push({ label: () => (this.scale.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'), action: () => toggleFullscreen(this) });
    this.setMenu(items, 360);
  }

  private showChapters() {
    this.page = 'chapters';
    const items: MenuItem[] = LEVELS.map((L, i) => ({
      label: i <= Save.data.unlocked ? `${L.subtitle} · ${L.name}` : `${L.subtitle} · ???`,
      enabled: () => i <= Save.data.unlocked,
      action: () => this.startStory(i),
    }));
    items.push({ label: 'Back', action: () => this.showMain() });
    this.setMenu(items, 460);
  }

  private showSettings() {
    this.page = 'settings';
    const st = Save.data.settings;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const cyc = (v: number) => (v >= 1 ? 0 : Math.round((v + 0.25) * 100) / 100);
    const apply = () => {
      Sound.setVolumes(st.music, st.sfx);
      Save.write();
    };
    this.setMenu([
      { label: () => `Music  ${pct(st.music)}`, action: () => { st.music = cyc(st.music); apply(); } },
      { label: () => `Effects  ${pct(st.sfx)}`, action: () => { st.sfx = cyc(st.sfx); apply(); Sound.play('pip'); } },
      { label: () => `Visual quality  ${st.quality === 'high' ? 'High' : 'Performance'}`, action: () => { st.quality = st.quality === 'high' ? 'low' : 'high'; apply(); } },
      { label: () => `Screen shake  ${st.shake ? 'On' : 'Off'}`, action: () => { st.shake = !st.shake; apply(); } },
      { label: 'Back', action: () => this.showMain() },
    ], 380);
  }

  private showControls() {
    this.page = 'controls';
    const lines = isTouchDevice(this)
      ? ['◀ ▶  move', 'JUMP  jump · tap again in the air: Pip-boost', '▲  climb ladders and ledges · ▼ crouch, hide', 'FIRE  Lumen Coil · hold to charge', 'PIP  send Pip to mechanisms or to lure creatures']
      : ['A D / ← →  move        SPACE / Z  jump (again in the air: Pip-boost)', 'W / ↑  climb ladders and ledges        S / ↓  crouch, crawl, hide', 'X / J / Left-click  fire the Lumen Coil · hold to charge', 'Q / K / Right-click  send Pip to mechanisms, or to lure creatures', 'ESC / P  pause        Gamepad supported'];
    const t = this.add.text(0, -20, lines.join('\n\n'), { fontFamily: FONT_BODY, fontSize: `${Math.min(18, this.scale.width / 40)}px`, color: COL.text, align: 'center', lineSpacing: 2 }).setOrigin(0.5, 0);
    this.setMenu([{ label: 'Back', action: () => this.showMain() }], 200);
    this.menu!.container.y = t.height + 30;
    this.root.add(t);
  }

  private startStory(level: number) {
    this.menu?.setActive(false);
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('BG');
      this.scene.start('Story', { level });
    });
  }

  private startGame(level: number, checkpoint: number) {
    this.menu?.setActive(false);
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('BG');
      this.scene.start('Game', { level, checkpoint });
    });
  }
}
