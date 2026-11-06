import Phaser from 'phaser';
import { BOSS_DIFFS, bossDiff } from '../core/BossTuning';
import { LANGS, applyLanguage, lang, t } from '../core/i18n';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { CHAPTERS, LEVELS } from '../levels/levels';
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
  private page: 'main' | 'chapters' | 'settings' | 'controls' | 'languages' = 'main';

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
    this.title.add(this.buildTitle());
    this.prompt = this.add.text(0, 0, isTouchDevice(this) ? t('Tap to begin') : t('Press any key'), { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: '20px', color: COL.text }).setOrigin(0.5);
    this.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 1100, yoyo: true, repeat: -1 });
    this.prompt.setDepth(101);
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
    this.prompt.setPosition(w / 2, h * 0.9);
    this.root.setPosition(this.title.x, this.title.y + 130 * s + 34).setScale(Math.max(0.62, s));
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
    // fit the rows between the title and the bottom edge (7 rows on the title page, 7 languages + Back)
    const room = (this.scale.height - 24 - this.root.y) / Math.max(0.62, this.root.scaleY);
    const gap = Phaser.Math.Clamp(room / Math.max(1, items.length - 0.4), 36, 54);
    this.menu = new Menu(this, 0, 0, items, { width, gap });
    this.root.removeAll(true);
    this.root.add(this.menu.container);
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 300 });
  }

  /** Title lockup modelled on the key art: silver BEYOND, glowing green THE HOLLOW, vines and a glow-cap. */
  private buildTitle() {
    const items: Phaser.GameObjects.GameObject[] = [];
    const g = this.add.graphics();
    // glow-cap above the lettering
    g.fillStyle(0x7ff5e0, 0.18);
    g.fillCircle(0, -92, 34);
    g.fillStyle(0xe8dcc8, 1);
    g.fillRect(-3, -96, 6, 18);
    g.fillStyle(0x2fbf90, 1);
    g.slice(0, -95, 23, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0xc8fff4, 0.7);
    g.fillRect(-22, -96, 44, 2);
    g.fillStyle(0xc8fff4, 0.9);
    for (const [x, y] of [[-10, -103], [6, -107], [14, -100]]) g.fillCircle(x, y, 2.5);
    // lines either side of BEYOND
    g.lineStyle(2, 0xd8dce4, 0.85);
    g.lineBetween(-260, -48, -120, -48);
    g.lineBetween(120, -48, 260, -48);
    g.fillStyle(0xd8dce4, 1);
    g.fillTriangle(-266, -48, -258, -52, -258, -44);
    g.fillTriangle(266, -48, 258, -52, 258, -44);
    items.push(g);
    const t1 = this.add.text(0, -48, 'BEYOND', { fontFamily: FONT_TITLE, fontSize: '38px', fontStyle: '600', color: '#e8eaf0', stroke: '#05070a', strokeThickness: 6 }).setOrigin(0.5).setLetterSpacing(6);
    const t2 = this.add.text(0, 22, 'THE HOLLOW', { fontFamily: FONT_TITLE, fontSize: '78px', fontStyle: '600', color: '#b8ffd8', stroke: '#05110c', strokeThickness: 10 }).setOrigin(0.5).setLetterSpacing(4);
    const grad = t2.context.createLinearGradient(0, 0, 0, t2.height);
    grad.addColorStop(0, '#eafff4');
    grad.addColorStop(0.5, '#8ff5c0');
    grad.addColorStop(1, '#3fbf8a');
    t2.setFill(grad);
    t2.setShadow(0, 0, '#3fff9a', 22, false, true);
    items.push(t1, t2);
    // curling vines under the name
    const v = this.add.graphics();
    v.lineStyle(4, 0x2f8f4f, 1);
    for (const s of [-1, 1]) {
      v.beginPath();
      v.moveTo(s * 20, 70);
      for (let i = 1; i <= 24; i++) v.lineTo(s * (20 + i * 11), 70 + Math.sin(i * 0.7) * 9 - i * 0.6);
      v.strokePath();
      v.fillStyle(0x4fc06a, 1);
      for (let i = 3; i <= 24; i += 4) v.fillEllipse(s * (20 + i * 11), 62 + Math.sin(i * 0.7) * 9 - i * 0.6, 9, 5);
      v.lineStyle(3, 0x2f8f4f, 1);
      v.beginPath();
      v.arc(s * 290, 52, 10, 0, Math.PI * 1.6, s < 0);
      v.strokePath();
      v.lineStyle(4, 0x2f8f4f, 1);
    }
    v.fillStyle(0x9ff5c8, 0.9);
    v.fillCircle(0, 72, 4);
    items.push(v);
    return items;
  }

  private showMain() {
    this.page = 'main';
    const has = Save.hasProgress() && !Save.data.completed;
    const items: MenuItem[] = [];
    if (has) items.push({ label: t('Continue — {0}', LEVELS[Save.data.level]?.subtitle ?? ''), action: () => this.startGame(Save.data.level, Save.data.checkpoint) });
    items.push({ label: has || Save.data.completed ? t('New Journey') : t('Begin the Journey'), action: () => { Save.newGame(); this.registry.getAll && Object.keys(this.registry.getAll()).forEach((k) => k.startsWith('persist-') && this.registry.remove(k)); this.startStory(0); } });
    items.push({ label: t('Chapters'), action: () => this.showChapters() });
    items.push({ label: t('Settings'), icon: 'gear', action: () => this.showSettings() });
    items.push({ label: t('How to Play'), action: () => this.showControls() });
    items.push({ label: () => `${t('Language')}  ·  ${LANGS.find((l) => l.code === lang())!.name}`, icon: 'globe', action: () => this.showLanguages('main') });
    items.push({ label: () => (this.scale.isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')), action: () => toggleFullscreen(this) });
    this.setMenu(items, 360);
  }

  private showChapters() {
    this.page = 'chapters';
    const items: MenuItem[] = CHAPTERS.map((C, ci) => {
      const first = LEVELS.findIndex((L) => L.chapter === ci + 1);
      return {
        label: t('Chapter {0} · {1}', C.roman, first <= Save.data.unlocked ? C.title : '???'),
        enabled: () => first <= Save.data.unlocked,
        action: () => this.showParts(ci + 1),
      };
    });
    items.push({ label: t('Back'), action: () => this.showMain() });
    this.setMenu(items, 460);
  }

  private showParts(chapter: number) {
    const items: MenuItem[] = [];
    LEVELS.forEach((L, i) => {
      if (L.chapter !== chapter) return;
      items.push({
        label: i <= Save.data.unlocked ? `${L.subtitle.split('· ')[1]} · ${L.name}` : `${L.subtitle.split('· ')[1]} · ???`,
        enabled: () => i <= Save.data.unlocked,
        action: () => this.startStory(i),
      });
    });
    items.push({ label: t('Back'), action: () => this.showChapters() });
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
      { label: () => `${t('Music')}  ${pct(st.music)}`, action: () => { st.music = cyc(st.music); apply(); } },
      { label: () => `${t('Effects')}  ${pct(st.sfx)}`, action: () => { st.sfx = cyc(st.sfx); apply(); Sound.play('pip'); } },
      { label: () => `${t('Visual quality')}  ${st.quality === 'high' ? t('High') : t('Performance')}`, action: () => { st.quality = st.quality === 'high' ? 'low' : 'high'; apply(); } },
      { label: () => `${t('Language')}  ·  ${LANGS.find((l) => l.code === lang())!.name}`, icon: 'globe', action: () => this.showLanguages('settings') },
      {
        // only the boss fights change; the rest of the game stays the same
        label: () => `${t('Boss difficulty')}  ${{ story: t('Story'), normal: t('Normal'), hard: t('Hard') }[bossDiff()]}`,
        action: () => { st.bossDiff = BOSS_DIFFS[(BOSS_DIFFS.indexOf(bossDiff()) + 1) % BOSS_DIFFS.length]; Save.write(); this.showBossNote(); },
      },
      { label: () => `${t('Screen shake')}  ${st.shake ? t('On') : t('Off')}`, action: () => { st.shake = !st.shake; apply(); } },
      { label: t('Back'), action: () => this.showMain() },
    ], 380);
    this.bossNote = null;
    this.showBossNote();
  }

  private bossNote: Phaser.GameObjects.Text | null = null;
  /** one line under the settings explaining what the boss difficulty does */
  private showBossNote() {
    const notes = { story: t('Story: slower bosses, more hearts, every hit costs one heart.'), normal: t('Normal: the fights as designed.'), hard: t('Hard: faster, tougher bosses, no healing between phases.') };
    const txt = notes[bossDiff()];
    if (!this.bossNote || !this.bossNote.active) {
      this.bossNote = this.add.text(0, 0, txt, { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: '15px', color: COL.dim, align: 'center', wordWrap: { width: 420 } }).setOrigin(0.5, 0);
      this.root.add(this.bossNote);
    } else this.bossNote.setText(txt);
    const rows = this.menu ? (this.menu as any).rows.length : 7;
    const gap = this.menu ? ((this.menu as any).rows[1]?.text.y ?? 54) : 54;
    this.bossNote.setPosition(0, rows * gap - gap * 0.35);
  }

  /** The list of languages; picking one switches the whole game at once. */
  private showLanguages(from: 'main' | 'settings') {
    this.page = 'languages';
    const back = () => {
      this.prompt.setText(isTouchDevice(this) ? t('Tap to begin') : t('Press any key'));
      if (from === 'settings') {
        this.showSettings();
        this.menu?.select(3, false);
      } else this.showMain();
    };
    const items: MenuItem[] = LANGS.map((L) => ({
      label: () => (L.code === lang() ? `◆  ${L.name}  ◆` : L.name),
      action: () => {
        Save.data.settings.lang = L.code;
        applyLanguage(L.code);
        Save.write();
        back();
      },
    }));
    items.push({ label: () => t('Back'), action: back });
    this.setMenu(items, 320);
    this.menu?.select(Math.max(0, LANGS.findIndex((L) => L.code === lang())), false);
  }

  private showControls() {
    this.page = 'controls';
    const lines = isTouchDevice(this)
      ? ['◀ ▶  move', 'JUMP  jump · tap again in the air: Pip-boost', '▲  climb ladders and ledges · ▼ crouch, hide', '▼ (hold)  drop through thin ledges', 'FIRE  Lumen Coil · hold to charge', 'PIP  send Pip to mechanisms or to lure creatures', 'ECO  Echo: switch present / past', 'HOOK  Light Thread: swing from glowing nodes'].map((s) => t(s))
      : ['A D / ← →  move        SPACE / Z  jump (again in the air: Pip-boost)', 'W / ↑  climb ladders and ledges        S / ↓  crouch, crawl, hide', 'Hold S / ↓ (or ↓ + SPACE)  drop through thin ledges', 'X / J / Left-click  fire the Lumen Coil · hold to charge', 'Q / K / Right-click  send Pip to mechanisms, or to lure creatures', 'R / U  Echo: switch present / past        F / O  Light Thread', 'P  pause        Gamepad supported'].map((s) => t(s));
    const txt = this.add.text(0, -20, lines.join('\n'), { fontFamily: FONT_BODY, fontSize: `${Math.min(18, this.scale.width / 40)}px`, color: COL.text, align: 'center', lineSpacing: 12 }).setOrigin(0.5, 0);
    this.setMenu([{ label: t('Back'), action: () => this.showMain() }], 200);
    this.menu!.container.y = txt.height + 30;
    this.root.add(txt);
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
