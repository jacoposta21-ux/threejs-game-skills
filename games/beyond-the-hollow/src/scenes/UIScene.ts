import Phaser from 'phaser';
import { CHEATS } from '../core/cheats';
import { t } from '../core/i18n';
import { Sound } from '../core/Audio';
import { Save } from '../core/Save';
import { TouchState } from '../core/Controls';
import { Portal } from '../core/Portal';
import { COL, FONT_BODY, FONT_TITLE, Menu, isTouchDevice, ornament, toggleFullscreen } from './ui';
import type { GameScene } from './GameScene';

/** HUD and every overlay that sits above the game: menus, cinematics, captions, touch controls. */
export class UIScene extends Phaser.Scene {
  gs: GameScene | null = null;
  private hud!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Image;
  private warm!: Phaser.GameObjects.Rectangle;
  private pastOn = false;
  private ilseLabel: Phaser.GameObjects.Text | null = null;
  private pipIcon!: Phaser.GameObjects.Image;
  private barTop!: Phaser.GameObjects.Rectangle;
  private barBot!: Phaser.GameObjects.Rectangle;
  private toastText!: Phaser.GameObjects.Text;
  private cheatTag: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private menu: Menu | null = null;
  private bossBar = false;
  private bossName!: Phaser.GameObjects.Text;
  private shownHp = 5;
  private touchUI: Phaser.GameObjects.Container | null = null;
  private buttons!: Phaser.GameObjects.Container;
  private logOpen = false;
  private letterboxOn = false;
  private t = 0;
  private escKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('UI');
  }

  ready = false;

  create() {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(-1);
    this.warm = this.add.rectangle(0, 0, 10, 10, 0xffc070, 0).setOrigin(0).setDepth(-2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.hud = this.add.graphics();
    this.pipIcon = this.add.image(0, 0, 'pip', 0).setScale(0.55);
    const w = this.scale.width, h = this.scale.height;
    this.barTop = this.add.rectangle(0, 0, w, 0, 0x000000).setOrigin(0, 0).setDepth(50);
    this.barBot = this.add.rectangle(0, h, w, 0, 0x000000).setOrigin(0, 1).setDepth(50);
    this.toastText = this.add.text(w / 2, h - 90, '', { fontFamily: FONT_BODY, fontSize: '18px', color: COL.text, stroke: '#000', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(60);
    this.cheatTag = CHEATS.infiniteLives ? this.add.text(w / 2, 20, '∞', { fontFamily: FONT_TITLE, fontSize: '22px', color: '#ffd27a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0.8).setDepth(60) : null;
    this.bossName = this.add.text(w / 2, h - 58, '', { fontFamily: FONT_TITLE, fontSize: '16px', color: '#ffd0c0', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setVisible(false);
    this.buildButtons();
    if (isTouchDevice(this)) this.buildTouch();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch && !this.touchUI) this.buildTouch();
    });
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (this.logOpen && ['KeyE', 'Enter', 'Space', 'Escape', 'KeyL'].includes(e.code)) this.closeLog();
      else if (this.overlay && (e.code === 'Escape' || e.code === 'KeyP') && this.gs && this.gs.scene.isPaused() && !this.logOpen && this.overlay.getData('kind') === 'pause') this.closePause();
    });
    this.layout();
  }

  setPast(on: boolean) {
    this.pastOn = on;
    // an invisible full-screen additive rectangle still costs a full-screen pass: hide it when unused
    if (on) this.warm.setVisible(true);
    this.tweens.add({ targets: this.warm, fillAlpha: on ? 0.13 : 0, duration: 350, onComplete: () => this.warm.setVisible(on) });
  }

  attach(gs: GameScene) {
    this.gs = gs;
    this.pastOn = false;
    this.warm?.setFillStyle(0xffc070, 0).setVisible(false);
    if (this.touchUI) { this.touchUI.destroy(); this.touchUI = null; this.buildTouch(); }
    this.shownHp = gs.player.hp;
    this.closeOverlay();
    this.showBossBar(false);
    this.letterbox(false, true);
  }

  // ---------------------------------------------------------------- layout
  private layout() {
    const w = this.scale.width, h = this.scale.height;
    this.vignette.setDisplaySize(w, h);
    this.warm.setSize(w, h);
    this.barTop.width = w;
    this.barBot.width = w;
    this.barBot.y = h;
    this.toastText.setPosition(w / 2, h - (this.touchUI ? 200 : 96));
    this.bossName.setPosition(w / 2, h - 64);
    this.buttons.setPosition(w - 20, 20);
    if (this.touchUI) {
      this.touchUI.destroy();
      this.touchUI = null;
      this.buildTouch();
    }
  }

  private iconButton(x: number, draw: (g: Phaser.GameObjects.Graphics) => void, cb: () => void) {
    const c = this.add.container(x, 0);
    const g = this.add.graphics();
    const paint = (hover: boolean) => {
      g.clear();
      g.fillStyle(0x05070a, hover ? 0.75 : 0.45);
      g.fillCircle(0, 22, 21);
      g.lineStyle(1.5, 0x7ff5e0, hover ? 0.9 : 0.4);
      g.strokeCircle(0, 22, 21);
      g.fillStyle(0xefe6d2, 1);
      g.lineStyle(2.5, 0xefe6d2, 1);
      draw(g);
    };
    paint(false);
    const z = this.add.zone(0, 22, 44, 44).setInteractive({ useHandCursor: true });
    z.on('pointerover', () => paint(true));
    z.on('pointerout', () => paint(false));
    z.on('pointerdown', (_p: any, _x: any, _y: any, ev: any) => {
      ev?.stopPropagation?.();
      Sound.unlock();
      cb();
    });
    c.add([g, z]);
    return c;
  }

  private buildButtons() {
    this.buttons = this.add.container(0, 0).setDepth(40);
    const pause = this.iconButton(-22, (g) => {
      g.fillRect(-7, 13, 5, 18);
      g.fillRect(2, 13, 5, 18);
    }, () => this.gs && !this.gs.finished && this.gs.player.state !== 'dead' && this.openPause());
    const fs = this.iconButton(-74, (g) => {
      g.strokeRect(-9, 13, 18, 18);
      g.fillStyle(0x05070a, 1);
      g.fillRect(-4, 10, 8, 24);
      g.fillRect(-12, 18, 24, 8);
    }, () => toggleFullscreen(this));
    const snd = this.iconButton(-126, (g) => {
      g.fillTriangle(-9, 22, 0, 13, 0, 31);
      g.fillRect(-11, 18, 5, 8);
      if (!Sound.muted) {
        g.beginPath();
        g.arc(2, 22, 6, -0.9, 0.9);
        g.strokePath();
      } else {
        g.lineBetween(4, 16, 12, 28);
      }
    }, () => {
      Sound.setMuted(!Sound.muted);
      this.buttons.destroy();
      this.buildButtons();
      this.layout();
    });
    this.buttons.add([pause, fs, snd]);
  }

  // ---------------------------------------------------------------- touch controls
  private buildTouch() {
    TouchState.active = true;
    const w = this.scale.width, h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(30);
    this.touchUI = c;
    this.input.addPointer(3);
    const r = Math.max(30, Math.min(46, h * 0.075));
    const pad = (x: number, y: number, label: string, key: keyof typeof TouchState, rad = r) => {
      const g = this.add.graphics();
      const draw = (on: boolean) => {
        g.clear();
        g.fillStyle(on ? 0x7ff5e0 : 0x05070a, on ? 0.35 : 0.35);
        g.fillCircle(x, y, rad);
        g.lineStyle(2, 0xefe6d2, on ? 0.9 : 0.35);
        g.strokeCircle(x, y, rad);
      };
      draw(false);
      const t = this.add.text(x, y, label, { fontFamily: FONT_TITLE, fontSize: `${Math.round(rad * 0.55)}px`, color: COL.text }).setOrigin(0.5).setAlpha(0.85);
      const z = this.add.zone(x, y, rad * 2.2, rad * 2.2).setInteractive();
      const set = (v: boolean) => {
        (TouchState as any)[key] = v;
        draw(v);
      };
      z.on('pointerdown', () => { Sound.unlock(); set(true); });
      z.on('pointerup', () => set(false));
      z.on('pointerout', () => set(false));
      c.add([g, t, z]);
    };
    const by = h - r * 1.6;
    pad(r * 1.5, by, '◀', 'left');
    pad(r * 4.0, by, '▶', 'right');
    pad(r * 2.75, by - r * 2.1, '▲', 'up', r * 0.8);
    pad(r * 6.3, by + r * 0.2, '▼', 'down', r * 0.75);
    pad(w - r * 1.6, by, 'JUMP', 'jump', r * 1.15);
    pad(w - r * 4.1, by + r * 0.3, 'FIRE', 'shoot');
    pad(w - r * 3.3, by - r * 2.2, 'PIP', 'pip', r * 0.85);
    pad(w - r * 1.4, by - r * 2.5, 'USE', 'interact', r * 0.7);
    if (this.gs?.levelDef.eco) pad(w - r * 5.4, by - r * 2.0, 'ECO', 'eco', r * 0.8);
    if (this.gs?.levelDef.hook) pad(w - r * 6.5, by + r * 0.2, 'HOOK', 'hook', r * 0.8);
  }

  // ---------------------------------------------------------------- HUD
  update(_t: number, dms: number) {
    this.t += dms / 1000;
    this.cheatTag?.setX(this.scale.width / 2);
    const gs = this.gs;
    this.hud.clear();
    if (!gs || !gs.player || !gs.scene.isActive() && !gs.scene.isPaused()) {
      this.pipIcon.setVisible(false);
      return;
    }
    if (this.escKey.isDown && this.logOpen) this.closeLog();
    const p = gs.player;
    const g = this.hud;
    const x0 = 26, y0 = 26;
    const hide = this.letterboxOn ? 0.25 : 1;
    this.shownHp = Phaser.Math.Linear(this.shownHp, p.hp, 0.2);
    // vitality: luminous seed-shaped cells inside a dark lozenge frame
    g.fillStyle(0x05070a, 0.5 * hide);
    const cells = Math.min(p.maxHp, 12);
    g.fillRoundedRect(x0 - 12, y0 - 14, 36 + cells * 24, 42, 21);
    g.lineStyle(1, 0x7ff5e0, 0.25 * hide);
    g.strokeRoundedRect(x0 - 12, y0 - 14, 36 + cells * 24, 42, 21);
    this.pipIcon.setVisible(true).setPosition(x0 + 8, y0 + 6).setAlpha(hide).setFrame(Math.floor(this.t * 20) % 4);
    const pipReady = gs.pip.cooldown <= 0 && gs.pip.mode === 'follow';
    g.lineStyle(2, pipReady ? 0xffd27a : 0x6a6050, 0.9 * hide);
    g.beginPath();
    g.arc(x0 + 8, y0 + 6, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pipReady ? 1 : 1 - gs.pip.cooldown / 1.2));
    g.strokePath();
    for (let i = 0; i < p.maxHp && i < 12; i++) {
      const cx = x0 + 38 + i * 24, cy = y0 + 7;
      const fill = Phaser.Math.Clamp(this.shownHp - i, 0, 1);
      g.fillStyle(0x1a1012, 0.9 * hide);
      g.fillEllipse(cx, cy, 13, 19);
      if (fill > 0.02) {
        const pulse = p.hp <= 1 ? 0.7 + Math.sin(this.t * 8) * 0.3 : 1;
        g.fillStyle(0xff8a6a, 0.25 * fill * pulse * hide);
        g.fillEllipse(cx, cy, 22, 28);
        g.fillStyle(0xffb08a, fill * pulse * hide);
        g.fillEllipse(cx, cy, 10 * fill + 1, 16 * fill + 1);
        g.fillStyle(0xfff0e0, 0.9 * fill * hide);
        g.fillEllipse(cx - 1.5, cy - 3, 3, 5);
      }
      g.lineStyle(1.2, 0xefe6d2, 0.5 * hide);
      g.strokeEllipse(cx, cy, 13, 19);
    }
    // Echo indicator (Chapter III): an hourglass that glows gold in the past
    if (gs.levelDef.eco) {
      const ex = x0 + 48 + Math.min(p.maxHp, 12) * 24, ey = y0 + 7;
      g.fillStyle(0x05070a, 0.5 * hide);
      g.fillCircle(ex, ey, 17);
      g.lineStyle(1.5, this.pastOn ? 0xffd27a : 0x9f8aff, 0.9 * hide);
      g.strokeCircle(ex, ey, 17);
      g.fillStyle(this.pastOn ? 0xffd27a : 0x9f8aff, hide);
      g.fillTriangle(ex - 7, ey - 9, ex + 7, ey - 9, ex, ey);
      g.fillTriangle(ex - 7, ey + 9, ex + 7, ey + 9, ex, ey);
    }
    // Ilse's vitality (Chapter IV)
    if (gs.ilse) {
      const il = gs.ilse;
      const bx = x0 + 38, by = y0 + 36;
      g.fillStyle(0x05070a, 0.55 * hide);
      g.fillRoundedRect(bx - 6, by - 6, 140, 16, 8);
      g.fillStyle(0x3a1810, hide);
      g.fillRoundedRect(bx, by - 1, 110, 6, 3);
      g.fillStyle(0xff7a5a, hide);
      g.fillRoundedRect(bx, by - 1, Math.max(1, 110 * Math.max(0, il.hp) / il.maxHp), 6, 3);
      if (!this.ilseLabel) this.ilseLabel = this.add.text(0, 0, 'ILSE', { fontFamily: FONT_TITLE, fontSize: '11px', color: '#ffc8b8' }).setOrigin(0, 0.5);
      this.ilseLabel.setPosition(bx + 114, by + 2).setVisible(true).setAlpha(hide);
    } else this.ilseLabel?.setVisible(false);
    // charge ring under the vitality
    if (p.charging && p.charge > 0.15) {
      const k = Math.min(1, p.charge / 0.6);
      const cx = x0 + 8, cy = y0 + 54;
      g.fillStyle(0x05070a, 0.5);
      g.fillCircle(cx, cy, 14);
      g.lineStyle(3, k >= 1 ? 0xffffff : 0x7ff5e0, 1);
      g.beginPath();
      g.arc(cx, cy, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      g.strokePath();
    }
    // air bubbles
    if (p.air < 0.999) {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const filled = p.air * n > i;
        const bx = x0 + 38 + i * 18, by = y0 + 44;
        g.lineStyle(1.5, 0xbffff4, filled ? 0.9 : 0.25);
        g.strokeCircle(bx, by, 6);
        if (filled) {
          g.fillStyle(0xbffff4, 0.25);
          g.fillCircle(bx, by, 6);
        }
      }
    }
    // boss
    if (this.bossBar && gs.boss) {
      const w = Math.min(560, this.scale.width - 80), h = this.scale.height;
      const bx = this.scale.width / 2 - w / 2, by = h - 44;
      const f = Math.max(0, gs.boss.hp / gs.boss.maxHp);
      g.fillStyle(0x05070a, 0.7);
      g.fillRoundedRect(bx - 4, by - 4, w + 8, 16, 8);
      g.fillStyle(0x5a1020, 1);
      g.fillRoundedRect(bx, by, w, 8, 4);
      g.fillStyle(0xff5e6e, 1);
      g.fillRoundedRect(bx, by, Math.max(1, w * f), 8, 4);
      g.fillStyle(0xffe0d0, 0.7);
      g.fillRect(bx + 4, by + 1, Math.max(0, w * f - 8), 2);
      g.lineStyle(1, 0xffd0c0, 0.5);
      for (const k of [0.33, 0.66]) g.lineBetween(bx + w * k, by - 2, bx + w * k, by + 10);
    }
  }

  // ---------------------------------------------------------------- cinematic helpers
  letterbox(on: boolean, instant = false) {
    this.letterboxOn = on;
    const h = on ? Math.round(this.scale.height * 0.1) : 0;
    this.tweens.killTweensOf([this.barTop, this.barBot]);
    if (instant) {
      this.barTop.height = h;
      this.barBot.height = h;
      return;
    }
    this.tweens.add({ targets: [this.barTop, this.barBot], height: h, duration: 600, ease: 'Sine.inOut' });
  }

  chapterCard(sub: string, name: string) {
    const w = this.scale.width, h = this.scale.height;
    const c = this.add.container(w / 2, h * 0.3).setDepth(55).setAlpha(0);
    const s = this.add.text(0, -40, sub.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: '16px', color: COL.accent }).setOrigin(0.5).setLetterSpacing(8);
    const t = this.add.text(0, 0, name, { fontFamily: FONT_TITLE, fontSize: `${Math.min(52, w / 16)}px`, color: COL.text, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setLetterSpacing(3);
    const g = this.add.graphics();
    ornament(g, 0, 44, Math.min(420, w * 0.6));
    c.add([g, s, t]);
    this.tweens.add({ targets: c, alpha: 1, y: h * 0.28, duration: 1200, ease: 'Sine.out' });
    this.tweens.add({ targets: c, alpha: 0, delay: 3400, duration: 1200, onComplete: () => c.destroy() });
  }

  bossTitle(name: string, sub: string) {
    const w = this.scale.width, h = this.scale.height;
    const c = this.add.container(w / 2, h * 0.7).setDepth(55).setAlpha(0);
    const t = this.add.text(0, 0, name, { fontFamily: FONT_TITLE, fontSize: `${Math.min(46, w / 18)}px`, color: '#ffd0c0', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setLetterSpacing(6);
    const s = this.add.text(0, 40, sub, { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: '18px', color: COL.text }).setOrigin(0.5);
    c.add([t, s]);
    this.tweens.add({ targets: c, alpha: 1, duration: 700 });
    this.tweens.add({ targets: c, alpha: 0, delay: 2000, duration: 700, onComplete: () => c.destroy() });
  }

  showBossBar(on: boolean, name = '') {
    this.bossBar = on;
    this.bossName.setVisible(on).setText(on ? name : '');
  }

  toast(msg: string, ms = 2200) {
    this.toastText.setWordWrapWidth(this.scale.width - 40).setText(t(msg));
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setAlpha(0);
    this.tweens.add({ targets: this.toastText, alpha: 1, duration: 250 });
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(ms, () => this.tweens.add({ targets: this.toastText, alpha: 0, duration: 500 }));
  }

  // ---------------------------------------------------------------- overlays
  private panel(kind: string, title: string, subtitle?: string) {
    this.closeOverlay();
    const w = this.scale.width, h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(70);
    c.setData('kind', kind);
    const dim = this.add.rectangle(0, 0, w, h, 0x020305, 0.72).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    const t = this.add.text(w / 2, h * 0.24, title, { fontFamily: FONT_TITLE, fontSize: `${Math.min(46, w / 14)}px`, color: COL.text, stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setLetterSpacing(4);
    ornament(g, w / 2, h * 0.24 + 40, Math.min(360, w * 0.6));
    c.add([dim, g, t]);
    if (subtitle) c.add(this.add.text(w / 2, h * 0.24 + 66, subtitle, { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: '17px', color: COL.dim, align: 'center' }).setOrigin(0.5));
    this.overlay = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 220 });
    return c;
  }

  private closeOverlay() {
    this.menu?.destroy();
    this.menu = null;
    this.overlay?.destroy();
    this.overlay = null;
  }

  openPause() {
    const gs = this.gs;
    if (!gs || this.overlay) return;
    gs.scene.pause();
    Portal.gameplayStop();
    Sound.stopCharge();
    const c = this.panel('pause', t('Paused'), gs.levelDef.subtitle + ' · ' + gs.levelDef.name);
    const h = this.scale.height;
    this.menu = new Menu(this, this.scale.width / 2, h * 0.24 + 120, [
      { label: t('Resume'), action: () => this.closePause() },
      { label: t('Restart from checkpoint'), action: () => this.restart(true) },
      { label: t('Restart chapter'), action: () => this.restart(false) },
      { label: () => (this.scale.isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')), action: () => toggleFullscreen(this) },
      { label: () => `${t('Sound')}: ${Sound.muted ? t('Off') : t('On')}`, action: () => Sound.setMuted(!Sound.muted) },
      { label: t('Quit to title'), action: () => this.quit() },
    ], { width: 340, gap: Math.min(52, (h * 0.6) / 6) });
    c.add(this.menu.container);
    this.controlsLegend(c);
  }

  private controlsLegend(c: Phaser.GameObjects.Container) {
    const w = this.scale.width, h = this.scale.height;
    if (h < 520) return;
    const txt = isTouchDevice(this)
      ? t('Touch: ◀ ▶ move · JUMP (tap again to boost) · FIRE (hold to charge) · PIP · ▲ climb · ▼ crouch')
      : t('Move A/D ←→ · Jump SPACE · Crouch S ↓ · Climb W ↑ · Fire X/J/Click (hold = charge) · Pip Q/K/Right-click · Pause ESC · Fullscreen in menu');
    c.add(this.add.text(w / 2, h - 40, txt, { fontFamily: FONT_BODY, fontSize: '14px', color: COL.dim, align: 'center', wordWrap: { width: w - 60 } }).setOrigin(0.5, 1));
  }

  closePause() {
    if (!this.gs) return;
    this.closeOverlay();
    this.gs.scene.resume();
    Portal.gameplayStart();
  }

  showGameOver() {
    const gs = this.gs;
    if (!gs) return;
    const lines = ['The Hollow is patient.', 'Pip will not leave you.', 'Not like this. Not yet.', 'The dark remembers your name.'].map((s) => t(s));
    const c = this.panel('gameover', t('Elias has fallen'), lines[Save.data.deaths % lines.length]);
    const h = this.scale.height;
    this.menu = new Menu(this, this.scale.width / 2, h * 0.24 + 130, [
      { label: t('Retry from checkpoint'), action: () => this.restart(true) },
      ...(gs.canEaseBoss() ? [{ label: t('Make boss fights easier (Story)'), action: () => this.easeBoss() }] : []),
      ...(gs.canSkipBoss() ? [{ label: t('Skip this fight'), action: () => this.skipBoss() }] : []),
      { label: t('Restart chapter'), action: () => this.restart(false) },
      { label: t('Quit to title'), action: () => this.quit() },
    ], { width: 340 });
    if (gs.canSkipBoss()) c.add(this.add.text(this.scale.width / 2, h - 70, t('Too hard? You can skip this fight and carry on with the story.'), { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: '15px', color: COL.dim, align: 'center', wordWrap: { width: this.scale.width - 60 } }).setOrigin(0.5, 1));
    c.add(this.menu.container);
    gs.scene.pause();
  }

  private easeBoss() {
    const gs = this.gs;
    if (!gs) return;
    this.closeOverlay();
    gs.scene.resume();
    this.letterbox(false, true);
    gs.easeBoss();
  }

  private skipBoss() {
    const gs = this.gs;
    if (!gs) return;
    this.closeOverlay();
    gs.scene.resume();
    this.letterbox(false, true);
    gs.skipBoss();
  }

  private restart(fromCp: boolean) {
    const gs = this.gs;
    if (!gs) return;
    this.closeOverlay();
    gs.scene.resume();
    this.letterbox(false, true);
    gs.retry(fromCp);
  }

  private quit() {
    this.closeOverlay();
    Portal.gameplayStop();
    this.scene.stop('BG');
    this.scene.stop('Game');
    this.scene.start('Menu');
  }

  showLog(text: string) {
    const gs = this.gs;
    if (!gs) return;
    this.logOpen = true;
    gs.scene.pause();
    const w = this.scale.width, h = this.scale.height;
    this.closeOverlay();
    const c = this.add.container(0, 0).setDepth(70);
    c.setData('kind', 'log');
    const dim = this.add.rectangle(0, 0, w, h, 0x020305, 0.6).setOrigin(0).setInteractive();
    dim.on('pointerdown', () => this.closeLog());
    const pw = Math.min(560, w - 40), ph = Math.min(300, h - 60);
    const g = this.add.graphics();
    g.fillStyle(0x0b1418, 0.95);
    g.fillRoundedRect(w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, 14);
    g.lineStyle(1.5, 0x7ff5e0, 0.5);
    g.strokeRoundedRect(w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, 14);
    g.lineStyle(1, 0x7ff5e0, 0.15);
    for (let y = h / 2 - ph / 2 + 70; y < h / 2 + ph / 2 - 40; y += 26) g.lineBetween(w / 2 - pw / 2 + 24, y, w / 2 + pw / 2 - 24, y);
    const [head, ...rest] = text.split('\n');
    const t1 = this.add.text(w / 2 - pw / 2 + 28, h / 2 - ph / 2 + 24, head, { fontFamily: FONT_TITLE, fontSize: '16px', color: COL.accent }).setLetterSpacing(3);
    const t2 = this.add.text(w / 2 - pw / 2 + 28, h / 2 - ph / 2 + 60, rest.join('\n'), { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: '19px', color: COL.text, wordWrap: { width: pw - 56 }, lineSpacing: 6 });
    const found = Save.data.lore.length;
    const t3 = this.add.text(w / 2, h / 2 + ph / 2 - 22, isTouchDevice(this) ? t('Recordings found: {0} · tap to continue', found) : t('Recordings found: {0} · press E to continue', found), { fontFamily: FONT_BODY, fontSize: '14px', color: COL.dim }).setOrigin(0.5);
    c.add([dim, g, t1, t2, t3]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 300 });
    this.overlay = c;
  }

  closeLog() {
    if (!this.logOpen) return;
    this.logOpen = false;
    this.closeOverlay();
    this.gs?.scene.resume();
  }
}
