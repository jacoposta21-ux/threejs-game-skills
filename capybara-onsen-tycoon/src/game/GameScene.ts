import Phaser from 'phaser';
import { CONFIG } from '../economy/config.ts';
import { formatDuration, formatNumber } from '../economy/format.ts';
import {
  type GameState,
  type UpgradeId,
  UPGRADE_IDS,
  activateBoost,
  activateGolden,
  boostReady,
  buyUpgrade,
  canBuyUpgrade,
  canMerge,
  collectOffline,
  computeOffline,
  createTickEvents,
  dig,
  digCost,
  discover,
  firstEmptySlot,
  isGridFull,
  moveOrMerge,
  nextUpgradeCost,
  offlineCapSec,
  poolRate,
  productionPerSec,
  spawnProgress,
  tick,
  unlockedCount,
  upgradeMaxed,
} from '../economy/model.ts';
import { MidgamePolicy } from '../services/adPolicy.ts';
import { type RewardedPlacement, ads } from '../services/ads.ts';
import { analytics } from '../services/analytics.ts';
import { CAPYS, S } from '../strings.ts';
import { ART_SCALE, CAPY_ORIGIN_Y, DECOS, PALETTE, WATER } from './art.ts';
import { sfx } from './audio.ts';
import { storage } from './storage.ts';
import { Button, FONT, panelImage, pillImage, textStyle } from './ui.ts';

// ---------------------------------------------------------------- layout
const GRID_X = 50;
const GRID_Y = 120;
const SLOT_W = 140;
const SLOT_H = 116;
const GAP = 10;
const POOL_Y = 16; // pool offset inside the slot container
const CAPY_Y = POOL_Y - 3;
const CAPY_SCALE = ART_SCALE * 1.18;
const PANEL_X = 872;
const PANEL_Y = 108;
const PANEL_W = 392;
const PANEL_H = 600;

const params = new URLSearchParams(location.search);

function slotX(i: number): number {
  return GRID_X + (i % CONFIG.cols) * (SLOT_W + GAP) + SLOT_W / 2;
}
function slotY(i: number): number {
  return GRID_Y + Math.floor(i / CONFIG.cols) * (SLOT_H + GAP) + SLOT_H / 2;
}

/** Visual for one grid slot (persistent, re-skinned when the level changes). */
class PoolView {
  readonly c: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Image;
  readonly capy: Phaser.GameObjects.Image;
  readonly acc: Phaser.GameObjects.Image;
  readonly front: Phaser.GameObjects.Image;
  readonly steam: Phaser.GameObjects.Image[] = [];
  readonly glow: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  level = 0;
  readonly phase: number;
  readonly jump = { v: 0 };
  readonly homeX: number;
  readonly homeY: number;

  readonly index: number;

  constructor(scene: Phaser.Scene, index: number) {
    this.index = index;
    this.homeX = slotX(index);
    this.homeY = slotY(index);
    this.phase = index * 1.7;
    this.glow = scene.add.image(this.homeX, this.homeY, 'glow').setScale(ART_SCALE).setDepth(9).setVisible(false);
    this.shadow = scene.add.image(0, 0, 'shadow').setScale(ART_SCALE).setDepth(99).setVisible(false);
    this.back = scene.add.image(0, POOL_Y, 'pool_back_1').setScale(ART_SCALE);
    this.capy = scene.add.image(0, CAPY_Y, 'capy').setScale(CAPY_SCALE).setOrigin(0.5, CAPY_ORIGIN_Y);
    this.acc = scene.add.image(0, CAPY_Y, 'acc_1').setScale(CAPY_SCALE).setOrigin(0.5, CAPY_ORIGIN_Y);
    this.front = scene.add.image(0, POOL_Y, 'pool_front_1').setScale(ART_SCALE);
    this.c = scene.add.container(this.homeX, this.homeY, [this.back, this.capy, this.acc, this.front]);
    for (let k = 0; k < 2; k++) {
      const s = scene.add.image(k ? 26 : -24, POOL_Y - 10, 'steam').setScale(0.3).setAlpha(0);
      this.steam.push(s);
      this.c.add(s);
      scene.tweens.add({
        targets: s,
        y: POOL_Y - 56,
        alpha: { from: 0.55, to: 0 },
        scale: { from: 0.25, to: 0.7 },
        duration: 2400,
        delay: (index * 397 + k * 1200) % 2400,
        repeat: -1,
      });
    }
    this.c.setSize(SLOT_W, SLOT_H).setDepth(20 + Math.floor(index / CONFIG.cols));
    this.c.setInteractive({ draggable: true, useHandCursor: true });
    this.c.setVisible(false);
  }

  setLevel(level: number): void {
    this.level = level;
    if (level <= 0) {
      this.c.setVisible(false);
      return;
    }
    this.back.setTexture(`pool_back_${level}`);
    this.front.setTexture(`pool_front_${level}`);
    this.acc.setTexture(`acc_${level}`);
    this.c.setVisible(true);
  }

  resetTransform(): void {
    this.c.setPosition(this.homeX, this.homeY).setScale(1).setDepth(20 + Math.floor(this.index / CONFIG.cols));
    this.shadow.setVisible(false);
  }

  animate(t: number): void {
    if (this.level <= 0) return;
    const bob = Math.sin(t * 1.7 + this.phase) * 2.2;
    const rot = Math.sin(t * 1.1 + this.phase) * 0.045;
    this.capy.y = CAPY_Y + bob + this.jump.v;
    this.acc.y = this.capy.y;
    this.capy.rotation = rot;
    this.acc.rotation = rot;
  }
}

type PopupBuilder = (root: Phaser.GameObjects.Container, close: () => void) => void;

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private restored = false;
  private views: PoolView[] = [];
  private ev = createTickEvents();
  private time0 = 0;
  private sessionStart = 0;

  // HUD
  private coinsText!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private goldenChip!: Phaser.GameObjects.Container;
  private goldenChipText!: Phaser.GameObjects.Text;
  private boostChip!: Phaser.GameObjects.Container;
  private boostChipText!: Phaser.GameObjects.Text;
  private albumBtn!: Button;
  private albumBadge!: Phaser.GameObjects.Container;
  private muteBtn!: Button;
  private upgradeButtons = new Map<UpgradeId, Button>();
  private upgradeLevelTexts = new Map<UpgradeId, Phaser.GameObjects.Text>();
  private boostBtn!: Button;
  private digBtn!: Button;
  private digBar!: Phaser.GameObjects.Image;
  private digBarW = 0;
  private lastBarP = -1;
  private digBarText!: Phaser.GameObjects.Text;
  private fullHint!: Phaser.GameObjects.Text;
  private tutorial?: Phaser.GameObjects.Container;
  private decoImages: Phaser.GameObjects.Image[] = [];

  // effects
  private splash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private floaters: Phaser.GameObjects.Text[] = [];
  private floaterCursor = 0;
  private coinCursor = 0;

  // timers
  private hudAcc = 0;
  private coinAcc = 0;
  private saveAcc = 0;
  private timeScale = 1;
  private paused = false;
  private hiddenAt = 0;
  private dragging: PoolView | null = null;
  private resetting = false;
  private trackedMax = 0;
  private forcedOfflineUsed = false;

  // popups
  private popupQueue: PopupBuilder[] = [];
  private popupOpen = false;
  private unseenAlbum = 0;
  private midgame = new MidgamePolicy();

  // golden guest
  private guest!: Phaser.GameObjects.Container;
  private guestActive = false;

  // debug
  private debugPanel?: Phaser.GameObjects.Container;
  private debugSpawnLevel = 5;

  constructor() {
    super('game');
  }

  create(): void {
    const loaded = storage.load();
    this.state = loaded.state;
    this.restored = loaded.restored;
    this.sessionStart = performance.now();
    this.trackedMax = this.state.maxLevel;
    sfx.setMuted(this.state.muted);

    this.add.image(0, 0, 'bg').setOrigin(0).setScale(1 / 1.5).setDepth(-10);
    this.buildDecos();
    this.buildGrid();
    this.buildHud();
    this.buildPanel();
    this.buildEffects();
    this.buildGuest();
    this.setupInput();
    this.setupLifecycle();
    this.refreshAll();

    ads.hooks = {
      onAdStart: () => {
        this.paused = true;
        sfx.setAdPause(true);
      },
      onAdEnd: () => {
        this.paused = false;
        sfx.setAdPause(false);
      },
    };

    analytics.track('session_start', { restored: this.restored ? 'yes' : 'no', max_level: this.state.maxLevel });
    if (params.has('debug')) this.toggleDebug();
    this.checkOffline(this.restored ? (Date.now() - this.state.lastSeen) / 1000 : 0);
    ads.gameplayStart();
    window.dispatchEvent(new Event('cot-ready'));
    // expose for automated tests / screenshots
    (window as unknown as { cot: unknown }).cot = { scene: this, state: () => this.state };
  }

  // ================================================================ build

  private buildDecos(): void {
    DECOS.forEach((d, i) => {
      const img = this.add
        .image(d.x, d.y, d.key)
        .setScale(ART_SCALE)
        .setDepth(-5 + d.depth * 0.1 + (d.y > 600 ? 3 : 0))
        .setVisible(this.state.unlocked[i]);
      if (i === 0 || i === 4) img.setOrigin(0.5, 0);
      if (d.sway) this.tweens.add({ targets: img, angle: { from: -d.sway * 57, to: d.sway * 57 }, duration: 2600 + i * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      if (i === 9) this.tweens.add({ targets: img, alpha: { from: 1, to: 0.75 }, duration: 900, yoyo: true, repeat: -1 });
      this.decoImages.push(img);
    });
  }

  private buildGrid(): void {
    for (let i = 0; i < CONFIG.cols * CONFIG.rows; i++) {
      this.add.image(slotX(i), slotY(i), 'slot').setScale(ART_SCALE).setDepth(8);
      this.views.push(new PoolView(this, i));
    }
    for (const v of this.views) v.setLevel(this.state.grid[v.index]);
  }

  private buildHud(): void {
    panelImage(this, 14, 10, 380, 86, 24).setDepth(50);
    this.add.image(58, 53, 'coin').setScale(ART_SCALE * 1.4).setDepth(51);
    this.coinsText = this.add.text(94, 18, '0', textStyle(40)).setDepth(51);
    this.rateText = this.add.text(96, 62, '', textStyle(22, '#7a8f4a')).setDepth(51);

    const chip = (x: number, color: number, label: string) => {
      const c = this.add.container(x, 52).setDepth(52);
      const bg = pillImage(this, 0, 0, 236, 48, color);
      const t = this.add.text(0, 0, label, textStyle(22, '#ffffff')).setOrigin(0.5);
      c.add([bg, t]);
      c.setVisible(false);
      this.tweens.add({ targets: c, scale: { from: 1, to: 1.06 }, duration: 500, yoyo: true, repeat: -1 });
      return { c, t };
    };
    const gc = chip(540, 0xe0a823, '');
    this.goldenChip = gc.c;
    this.goldenChipText = gc.t;
    const bc = chip(800, PALETTE.cherryDark, '');
    this.boostChip = bc.c;
    this.boostChipText = bc.t;

    this.albumBtn = new Button(this, 1112, 54, { w: 92, h: 92, color: PALETTE.cherry, icon: 'icon_book', iconScale: 1, radius: 24, onClick: () => this.openAlbum() });
    this.albumBtn.icon!.setPosition(0, -2);
    this.albumBtn.setDepth(52);
    this.albumBadge = this.add.container(1146, 18).setDepth(53).setVisible(false);
    const bg = pillImage(this, 0, 0, 30, 30, 0xe94b4b);
    this.albumBadge.add([bg, this.add.text(0, 0, '!', textStyle(20, '#ffffff')).setOrigin(0.5)]);
    this.muteBtn = new Button(this, 1214, 54, { w: 92, h: 92, color: PALETTE.teal, icon: 'icon_sound', iconScale: 1, radius: 24, onClick: () => this.toggleMute() });
    this.muteBtn.icon!.setPosition(0, -2);
    this.muteBtn.setDepth(52);

    // first-merge tutorial
    if (this.state.merges === 0) {
      const c = this.add.container(420, 664).setDepth(60);
      const b = pillImage(this, 0, 0, 460, 52, 0xffffff, PALETTE.wood, 3, 0.92);
      c.add([b, this.add.text(0, 0, S.tutorialMerge, textStyle(24)).setOrigin(0.5)]);
      this.tweens.add({ targets: c, y: 656, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tutorial = c;
    }
  }

  private buildPanel(): void {
    panelImage(this, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 26, 0xfff4e0).setDepth(40);
    this.add.text(PANEL_X + PANEL_W / 2, PANEL_Y + 22, S.upgradesTitle, textStyle(26)).setOrigin(0.5).setDepth(41);

    const icons: Record<UpgradeId, string> = { hotWater: 'icon_flame', shovel: 'icon_shovel', longRest: 'icon_moon' };
    UPGRADE_IDS.forEach((id, i) => {
      const y = PANEL_Y + 48 + i * 112;
      panelImage(this, PANEL_X + 12, y, PANEL_W - 24, 104, 18, 0xf6e6c8, 0xd9c09a, 2, false).setDepth(41);
      this.add.image(PANEL_X + 46, y + 52, icons[id]).setScale(ART_SCALE * 1.05).setDepth(42);
      this.upgradeLevelTexts.set(id, this.add.text(PANEL_X + 80, y + 70, '', textStyle(16, '#c4627f')).setDepth(42));
      this.add.text(PANEL_X + 80, y + 14, S.upgrades[id].name, textStyle(21)).setDepth(42);
      this.add.text(PANEL_X + 80, y + 44, S.upgrades[id].effect, textStyle(16, '#8a6a4a')).setDepth(42);
      const btn = new Button(this, PANEL_X + PANEL_W - 92, y + 52, {
        w: 144,
        h: 92,
        color: PALETTE.sage,
        label: '',
        fontSize: 24,
        radius: 18,
        onClick: () => this.buyUpgrade(id),
      });
      btn.setDepth(43);
      this.upgradeButtons.set(id, btn);
    });

    this.boostBtn = new Button(this, PANEL_X + PANEL_W / 2, PANEL_Y + 434, {
      w: PANEL_W - 24,
      h: 92,
      color: PALETTE.cherry,
      label: S.boostIdle,
      sub: S.video,
      icon: 'icon_video',
      iconScale: 0.9,
      fontSize: 28,
      onClick: () => this.useBoost(),
    }).setDepth(43);

    this.digBtn = new Button(this, PANEL_X + PANEL_W / 2, PANEL_Y + 538, {
      w: PANEL_W - 24,
      h: 104,
      color: PALETTE.orange,
      label: S.dig,
      sub: '',
      icon: 'icon_shovel',
      iconScale: 1.05,
      fontSize: 34,
      subSize: 22,
      onClick: () => this.doDig(),
    }).setDepth(43);
    this.digBtn.label.setY(-24);
    this.digBtn.sub.setY(10);
    const barW = PANEL_W - 140;
    pillImage(this, PANEL_X + 92 + barW / 2, PANEL_Y + 574, barW, 16, 0x000000, 0, 0, 0.18).setDepth(44);
    this.digBar = pillImage(this, PANEL_X + 92 + barW / 2, PANEL_Y + 574, barW, 16, 0xfff3c4, 0, 0).setDepth(44);
    this.digBarW = this.digBar.width;
    this.digBarText = this.add.text(PANEL_X + PANEL_W / 2 + 22, PANEL_Y + 573, '', textStyle(15, '#ffffff')).setOrigin(0.5).setDepth(45);
    this.fullHint = this.add.text(420, 664, S.gridFull, textStyle(26, '#ffffff', { stroke: '#c97a37', strokeThickness: 6 })).setOrigin(0.5).setDepth(61).setVisible(false);
    this.tweens.add({ targets: this.fullHint, alpha: { from: 1, to: 0.45 }, duration: 600, yoyo: true, repeat: -1 });
  }

  private buildEffects(): void {
    this.splash = this.add.particles(0, 0, 'drop', {
      emitting: false,
      speed: { min: 160, max: 380 },
      angle: { min: 200, max: 340 },
      gravityY: 900,
      lifespan: { min: 500, max: 900 },
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1, end: 0.2 },
    });
    this.splash.setDepth(90);
    this.sparkles = this.add.particles(0, 0, 'sparkle', {
      emitting: false,
      speed: { min: 140, max: 360 },
      lifespan: { min: 500, max: 1000 },
      scale: { start: 0.7, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0xffe680, 0xffffff, 0xffc4d6],
    });
    this.sparkles.setDepth(1500);
    this.coinBurst = this.add.particles(0, 0, 'coin', {
      emitting: false,
      speed: { min: 200, max: 480 },
      angle: { min: 210, max: 330 },
      gravityY: 800,
      lifespan: 1000,
      scale: { start: 0.55, end: 0.3 },
      rotate: { min: -180, max: 180 },
    });
    this.coinBurst.setDepth(1500);
    for (let i = 0; i < 32; i++) {
      this.floaters.push(this.add.text(0, 0, '', textStyle(22, '#ffffff', { stroke: '#a8700f', strokeThickness: 5 })).setOrigin(0.5).setDepth(95).setVisible(false));
    }
  }

  private buildGuest(): void {
    const tube = this.add.image(0, 22, 'tube').setScale(ART_SCALE);
    const capy = this.add.image(0, 24, 'capy_gold').setScale(ART_SCALE * 0.8).setOrigin(0.5, CAPY_ORIGIN_Y);
    const acc = this.add.image(0, 24, 'acc_12').setScale(ART_SCALE * 0.8).setOrigin(0.5, CAPY_ORIGIN_Y);
    const front = pillImage(this, 0, 30, 112, 22, 0xff6b6b, 0xa8343a, 2.5);
    this.guest = this.add.container(-120, 668, [tube, capy, acc, front]).setDepth(70).setVisible(false);
    this.guest.setSize(150, 130);
    this.guest.setInteractive({ useHandCursor: true });
    this.guest.on('pointerdown', () => this.tapGuest());
  }

  private setupInput(): void {
    this.input.dragDistanceThreshold = 4;
    this.input.on('pointerdown', () => sfx.unlock());
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const v = this.viewOf(obj);
      if (!v || v.level <= 0 || this.popupOpen) return;
      this.dragging = v;
      v.c.setDepth(100).setScale(1.12);
      v.shadow.setVisible(true);
      for (const o of this.views) o.glow.setVisible(o !== v && canMerge(v.level, o.level));
    });
    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, x: number, y: number) => {
      const v = this.viewOf(obj);
      if (!v || v !== this.dragging) return;
      v.c.setPosition(x, y);
      v.shadow.setPosition(x, y + 52);
    });
    this.input.on('dragend', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const v = this.viewOf(obj);
      if (!v || v !== this.dragging) return;
      this.dragging = null;
      for (const o of this.views) o.glow.setVisible(false);
      this.drop(v, this.slotAt(p.worldX, p.worldY));
    });
    for (const v of this.views) this.tweens.add({ targets: v.glow, alpha: { from: 1, to: 0.45 }, duration: 380, yoyo: true, repeat: -1 });
    this.input.keyboard?.on('keydown-D', () => this.toggleDebug());
  }

  private setupLifecycle(): void {
    const save = () => {
      if (!this.resetting) storage.save(this.state);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        save();
      } else if (this.hiddenAt > 0) {
        const away = (Date.now() - this.hiddenAt) / 1000;
        this.hiddenAt = 0;
        if (away >= CONFIG.offline.minAwaySec) this.checkOffline(away);
        else this.advance(away);
      }
    });
    window.addEventListener('beforeunload', save);
    window.addEventListener('pagehide', () => {
      save();
      analytics.track('session_end', { duration_sec: Math.round((performance.now() - this.sessionStart) / 1000) });
    });
  }

  // ================================================================ loop

  update(_time: number, deltaMs: number): void {
    const t = (this.time0 += deltaMs / 1000);
    const dt = Math.min(deltaMs / 1000, 0.25);
    if (!this.paused) this.advance(dt * this.timeScale);
    for (let i = 0; i < this.views.length; i++) this.views[i].animate(t);

    this.hudAcc += dt;
    if (this.hudAcc >= 0.2) {
      this.hudAcc = 0;
      this.refreshHud();
    }
    this.drawDigBar();
    this.coinAcc += dt * this.timeScale;
    if (this.coinAcc >= 1) {
      this.coinAcc = 0;
      this.floatCoins();
    }
    this.saveAcc += dt;
    if (this.saveAcc >= 5) {
      this.saveAcc = 0;
      if (!this.resetting) storage.save(this.state);
    }
  }

  /** Advance the economy by dt seconds (any size) and react to events. */
  private advance(dt: number): void {
    const prevMax = this.state.maxLevel;
    tick(this.state, dt, this.ev);
    for (let i = 0; i < this.ev.spawnedCount; i++) this.popIn(this.ev.spawned[i]);
    if (this.ev.newLevel) this.onDiscovered(this.ev.newLevel);
    if (this.state.maxLevel > prevMax) this.trackMax();
    if (this.ev.guestAppeared) this.launchGuest();
  }

  // ================================================================ actions

  private viewOf(obj: Phaser.GameObjects.GameObject): PoolView | undefined {
    for (const v of this.views) if (v.c === obj) return v;
    return undefined;
  }

  private slotAt(x: number, y: number): number {
    const col = Math.floor((x - GRID_X + GAP / 2) / (SLOT_W + GAP));
    const row = Math.floor((y - GRID_Y + GAP / 2) / (SLOT_H + GAP));
    if (col < 0 || col >= CONFIG.cols || row < 0 || row >= CONFIG.rows) return -1;
    return row * CONFIG.cols + col;
  }

  private drop(v: PoolView, to: number): void {
    const from = v.index;
    const fromLevel = v.level;
    if (to < 0 || to === from) {
      this.tweens.add({ targets: v.c, x: v.homeX, y: v.homeY, scale: 1, duration: 180, ease: 'Back.out', onComplete: () => v.resetTransform() });
      v.shadow.setVisible(false);
      return;
    }
    const prevMax = this.state.maxLevel;
    const res = moveOrMerge(this.state, from, to);
    const tv = this.views[to];
    v.shadow.setVisible(false);
    if (res.kind === 'merge') {
      this.tweens.add({
        targets: v.c,
        x: tv.homeX,
        y: tv.homeY,
        scaleX: 1.3,
        scaleY: 0.7,
        duration: 110,
        ease: 'Quad.in',
        onComplete: () => {
          v.setLevel(0);
          v.resetTransform();
        },
      });
      this.time.delayedCall(100, () => this.mergeFx(tv, res.level));
      analytics.track('merge', { level: res.level });
      if (this.state.maxLevel > prevMax) this.trackMax();
      if (res.isNew) this.onDiscovered(res.level);
      this.dismissTutorial();
    } else if (res.kind === 'move') {
      v.setLevel(0);
      v.resetTransform();
      tv.setLevel(fromLevel);
      this.squash(tv, 0.25);
      sfx.pop();
    } else if (res.kind === 'swap') {
      const x = v.c.x;
      const y = v.c.y;
      v.setLevel(this.state.grid[from]);
      v.resetTransform();
      v.c.setPosition(x, y);
      this.tweens.add({ targets: v.c, x: v.homeX, y: v.homeY, duration: 200, ease: 'Quad.out' });
      tv.setLevel(fromLevel);
      this.squash(tv, 0.25);
      sfx.pop();
    } else {
      this.tweens.add({ targets: v.c, x: v.homeX, y: v.homeY, scale: 1, duration: 180, ease: 'Back.out', onComplete: () => v.resetTransform() });
    }
    this.refreshButtons();
  }

  private mergeFx(tv: PoolView, level: number): void {
    tv.setLevel(level);
    tv.c.setScale(1);
    tv.c.setDepth(90);
    this.tweens.add({
      targets: tv.c,
      scaleX: { from: 1.4, to: 1 },
      scaleY: { from: 0.62, to: 1 },
      duration: 650,
      ease: 'Elastic.out',
      easeParams: [1.2, 0.45],
      onComplete: () => tv.resetTransform(),
    });
    tv.jump.v = 30;
    this.tweens.chain({
      targets: tv.jump,
      tweens: [
        { v: -46, duration: 190, ease: 'Quad.out' },
        { v: 0, duration: 520, ease: 'Bounce.out' },
      ],
    });
    this.splash.setParticleTint(WATER[level - 1]);
    this.splash.explode(28, tv.homeX, tv.homeY + POOL_Y - 4);
    this.splash.setParticleTint(0xffffff);
    this.splash.explode(10, tv.homeX, tv.homeY + POOL_Y - 4);
    this.sparkles.explode(8, tv.homeX, tv.homeY - 20);
    this.cameras.main.shake(140, 0.005);
    sfx.plop(level);
    this.floatText(tv.homeX, tv.homeY - 46, `+${formatNumber(poolRate(this.state, level))}/s`, 34, '#ffffff', '#e0702c', 1100, 90);
  }

  private squash(v: PoolView, amt: number): void {
    this.tweens.add({ targets: v.c, scaleX: { from: 1 + amt, to: 1 }, scaleY: { from: 1 - amt, to: 1 }, duration: 380, ease: 'Elastic.out', easeParams: [1, 0.5] });
  }

  private popIn(slot: number): void {
    const v = this.views[slot];
    v.setLevel(this.state.grid[slot]);
    v.resetTransform();
    this.tweens.add({ targets: v.c, scale: { from: 0.2, to: 1 }, duration: 420, ease: 'Back.out' });
    v.jump.v = 26;
    this.tweens.add({ targets: v.jump, v: 0, duration: 500, ease: 'Back.out' });
    this.splash.setParticleTint(WATER[v.level - 1]);
    this.splash.explode(10, v.homeX, v.homeY + POOL_Y);
    sfx.pop();
  }

  private doDig(): void {
    const cost = digCost(this.state);
    const r = dig(this.state);
    if (!r) return;
    this.popIn(r.slot);
    sfx.cling(0.22);
    analytics.track('pool_bought', { cost, level: r.level, total: this.state.poolsBought });
    if (r.isNew) this.onDiscovered(r.level);
    this.trackMax();
    this.refreshButtons();
  }

  private buyUpgrade(id: UpgradeId): void {
    if (!buyUpgrade(this.state, id)) return;
    analytics.track('upgrade_bought', { id, level: this.state.upgrades[id] });
    sfx.cling(0.25);
    const btn = this.upgradeButtons.get(id)!;
    this.sparkles.explode(14, btn.x, btn.y);
    this.refreshAll();
  }

  private useBoost(): void {
    if (!boostReady(this.state)) return;
    this.rewarded('boost_x2', () => {
      if (activateBoost(this.state)) {
        analytics.track('booster_used', { type: 'boost_x2' });
        this.sparkles.explode(24, this.boostBtn.x, this.boostBtn.y);
        sfx.sparkle();
      }
    });
  }

  private toggleMute(): void {
    this.state.muted = !this.state.muted;
    sfx.setMuted(this.state.muted);
    this.muteBtn.icon!.setTexture(this.state.muted ? 'icon_mute' : 'icon_sound');
    storage.save(this.state);
  }

  /** Wrapper that tracks + guards rewarded ads; the game always continues. */
  private rewarded(placement: RewardedPlacement, onReward: () => void, onSkip?: () => void): void {
    analytics.track('ad_rewarded_shown', { placement });
    try {
      ads.showRewarded(placement, onReward, () => {
        this.toast(S.adUnavailable);
        onSkip?.();
      });
    } catch {
      this.toast(S.adUnavailable);
      onSkip?.();
    }
  }

  /** Fires max_level_reached (≈ level_complete) once per new record. */
  private trackMax(): void {
    const s = this.state;
    if (s.maxLevel > this.trackedMax) {
      this.trackedMax = s.maxLevel;
      analytics.track('max_level_reached', { level: s.maxLevel, play_sec: Math.round(s.playTime) });
    }
  }

  // ================================================================ golden guest

  private launchGuest(): void {
    if (this.guestActive) return;
    this.guestActive = true;
    const g = this.guest;
    g.setVisible(true).setPosition(-120, 668).setAlpha(1).setScale(1);
    sfx.sparkle();
    this.tweens.add({ targets: g, x: 1400, duration: CONFIG.golden.crossSec * 1000, ease: 'Linear', onComplete: () => this.hideGuest() });
    this.tweens.add({ targets: g, y: 650, duration: 260, yoyo: true, repeat: Math.ceil((CONFIG.golden.crossSec * 1000) / 520), ease: 'Sine.out' });
  }

  private hideGuest(): void {
    this.guestActive = false;
    this.tweens.killTweensOf(this.guest);
    this.guest.setVisible(false);
  }

  private tapGuest(): void {
    if (!this.guestActive) return;
    const x = this.guest.x;
    const y = this.guest.y;
    this.hideGuest();
    activateGolden(this.state, CONFIG.golden.tapDurationSec);
    analytics.track('golden_guest_tapped', {});
    analytics.track('booster_used', { type: 'golden_guest' });
    this.sparkles.explode(30, x, y - 20);
    this.coinBurst.explode(10, x, y - 20);
    sfx.sparkle();
    this.floatText(x, y - 70, '×3!', 40, '#fff3a0', '#a8700f', 1200, 110);
    this.queuePopup((root, close) => {
      this.popupFrame(root, 600, 360, S.goldenTitle);
      const tube = this.add.image(-180, 22, 'tube').setScale(ART_SCALE * 1.2);
      const capy = this.add.image(-180, 26, 'capy_gold').setScale(ART_SCALE * 1.1).setOrigin(0.5, CAPY_ORIGIN_Y);
      const crown = this.add.image(-180, 26, 'acc_12').setScale(ART_SCALE * 1.1).setOrigin(0.5, CAPY_ORIGIN_Y);
      const ring = pillImage(this, -180, 40, 134, 34, 0xff6b6b, 0xa8343a, 2.5);
      root.add([tube, capy, crown, ring]);
      this.tweens.add({ targets: [tube, capy, crown, ring], y: '-=8', duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      root.add(this.add.text(70, -60, S.goldenBody, textStyle(26, '#a8700f', { align: 'center', wordWrap: { width: 380 } })).setOrigin(0.5));
      root.add(this.add.text(70, -4, S.goldenOffer, textStyle(22, '#5a3a26', { align: 'center', wordWrap: { width: 380 } })).setOrigin(0.5));
      const watch = new Button(this, 160, 120, {
        w: 220,
        h: 92,
        color: PALETTE.cherry,
        label: S.watch,
        sub: '×3 · 3 min',
        icon: 'icon_video',
        iconScale: 0.8,
        onClick: () => {
          close();
          this.rewarded('golden_guest_x3', () => {
            activateGolden(this.state, CONFIG.golden.videoDurationSec);
            analytics.track('booster_used', { type: 'golden_guest_x3' });
            sfx.sparkle();
          });
        },
      });
      const no = new Button(this, -60, 120, { w: 200, h: 92, color: PALETTE.disabled, label: S.noThanks, fontSize: 24, onClick: close });
      root.add([no, watch]);
    });
  }

  // ================================================================ offline

  private checkOffline(awaySec: number): void {
    const forced = params.get('offline');
    if (forced !== null && !this.forcedOfflineUsed) {
      this.forcedOfflineUsed = true; // debug: ?offline=3600 simulates 1 h away on load
      awaySec = Number(forced) || 0;
    } else if (awaySec < CONFIG.offline.minAwaySec) return;
    // boosts expire while away; no auto-spawn offline
    this.state.goldenTime = Math.max(0, this.state.goldenTime - awaySec);
    this.state.boostTime = Math.max(0, this.state.boostTime - awaySec);
    const off = computeOffline(this.state, awaySec);
    if (off.amount <= 0) return;
    this.queuePopup((root, close) => {
      this.popupFrame(root, 640, 440, S.welcomeTitle);
      root.add(this.add.text(0, -86, S.welcomeBody(formatDuration(off.awaySec)), textStyle(24, '#7a5a3a')).setOrigin(0.5));
      root.add(this.add.image(-90, -16, 'coin').setScale(ART_SCALE * 1.6));
      root.add(this.add.text(-56, -16, `+${formatNumber(off.amount)}`, textStyle(52, '#e0a823', { stroke: '#7a4f12', strokeThickness: 6 })).setOrigin(0, 0.5));
      if (off.awaySec > off.creditedSec) root.add(this.add.text(0, 40, S.welcomeCap(formatDuration(offlineCapSec(this.state))), textStyle(18, '#9a7a5a')).setOrigin(0.5));
      const collect = (doubled: boolean) => {
        const got = collectOffline(this.state, off.amount, doubled);
        analytics.track('offline_collected', { amount: Math.round(got), doubled: doubled ? 'yes' : 'no' });
        this.coinBurst.explode(doubled ? 30 : 16, 640, 360);
        sfx.cling(0.3);
        this.refreshAll();
      };
      const b1 = new Button(this, -140, 130, { w: 240, h: 92, color: PALETTE.sage, label: S.collect, onClick: () => { close(); collect(false); } });
      const b2 = new Button(this, 140, 130, {
        w: 260,
        h: 92,
        color: PALETTE.cherry,
        label: S.collectX2,
        sub: S.video,
        icon: 'icon_video',
        iconScale: 0.8,
        onClick: () => {
          close();
          this.rewarded('offline_x2', () => collect(true), () => collect(false));
        },
      });
      root.add([b1, b2]);
    });
  }

  // ================================================================ album

  private onDiscovered(level: number): void {
    this.unseenAlbum++;
    // let the merge juice play before the celebration popup
    this.time.delayedCall(850, () => this.celebrate(level));
  }

  private celebrate(level: number): void {
    const info = CAPYS[level - 1];
    this.queuePopup((root, close) => {
      this.popupFrame(root, 620, 560, S.newCapy, true);
      const rays = this.add.image(0, -60, 'rays').setScale(0.75).setAlpha(0.85);
      this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
      root.add(rays);
      const portrait = this.portrait(level, true);
      portrait.setPosition(0, -70).setScale(2);
      root.add(portrait);
      this.tweens.add({ targets: portrait, scale: { from: 0.4, to: 2 }, duration: 600, ease: 'Back.out' });
      root.add(this.add.text(0, 72, info.name, textStyle(38, '#c4627f', { stroke: '#ffffff', strokeThickness: 6 })).setOrigin(0.5));
      root.add(this.add.text(0, 116, `“${info.quote}”`, textStyle(22, '#7a5a3a', { fontStyle: 'italic bold' })).setOrigin(0.5));
      root.add(this.add.text(0, 152, S.decoUnlocked(info.deco), textStyle(20, '#5d8a5a')).setOrigin(0.5));
      root.add(new Button(this, 0, 222, { w: 240, h: 92, color: PALETTE.sage, label: S.yay, fontSize: 32, onClick: close }));
      sfx.jingle();
      this.sparkles.explode(20, 470, 250);
      this.sparkles.explode(20, 810, 250);
      return () => {
        this.revealDeco(level);
        this.maybeMidgame();
      };
    });
  }

  private revealDeco(level: number): void {
    const img = this.decoImages[level - 1];
    if (!img || img.visible) return;
    img.setVisible(true);
    const s = img.scale;
    this.tweens.add({ targets: img, scale: { from: 0, to: s }, duration: 700, ease: 'Back.out' });
    this.sparkles.explode(24, img.x, img.y + (img.originY === 0 ? 40 : 0));
    sfx.sparkle();
  }

  private maybeMidgame(): void {
    const sec = (performance.now() - this.sessionStart) / 1000;
    if (!this.midgame.canShow(sec, true)) return;
    this.midgame.markShown(sec);
    analytics.track('ad_interstitial_shown', { placement: 'album_unlock' });
    try {
      ads.showMidgame('album_unlock');
    } catch {
      /* game continues */
    }
  }

  /** Pool + capybara + accessory composition (for album / popups). */
  private portrait(level: number, unlocked: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const back = this.add.image(0, POOL_Y, `pool_back_${unlocked ? level : 1}`).setScale(ART_SCALE);
    const capy = this.add.image(0, CAPY_Y, 'capy').setScale(CAPY_SCALE).setOrigin(0.5, CAPY_ORIGIN_Y);
    const acc = this.add.image(0, CAPY_Y, `acc_${level}`).setScale(CAPY_SCALE).setOrigin(0.5, CAPY_ORIGIN_Y);
    const front = this.add.image(0, POOL_Y, `pool_front_${unlocked ? level : 1}`).setScale(ART_SCALE);
    if (!unlocked) {
      for (const o of [back, front]) o.setTint(0xbdb2a2);
      for (const o of [capy, acc]) o.setTintFill(0x6e5a48).setAlpha(0.55);
    }
    c.add([back, capy, acc, front]);
    return c;
  }

  private openAlbum(): void {
    if (this.popupOpen) return;
    analytics.track('album_opened', { unlocked: unlockedCount(this.state) });
    this.unseenAlbum = 0;
    this.queuePopup((root, close) => {
      this.popupFrame(root, 1060, 640, `${S.albumTitle}  ${unlockedCount(this.state)}/12`, false, close);
      const cw = 160;
      const ch = 238;
      for (let i = 0; i < 12; i++) {
        const L = i + 1;
        const un = this.state.unlocked[i];
        const x = -2.5 * (cw + 10) + (i % 6) * (cw + 10);
        const y = -130 + Math.floor(i / 6) * (ch + 12) + 10;
        root.add(panelImage(this, x - cw / 2, y - ch / 2, cw, ch, 18, un ? 0xfffaf0 : 0xe6dccb, un ? WATER[i] : 0xc9bfb1, 3, false));
        const p = this.portrait(L, un).setPosition(x, y - 30).setScale(0.95);
        root.add(p);
        root.add(this.add.text(x, y + 56, un ? CAPYS[i].name : S.albumLocked, textStyle(18, un ? '#5a3a26' : '#9a8a7a', { align: 'center', wordWrap: { width: cw - 14 } })).setOrigin(0.5));
        root.add(this.add.text(x, y + 96, `${S.level} ${L}`, textStyle(15, '#9a7a5a')).setOrigin(0.5));
      }
      root.add(this.add.text(0, 290, S.albumHint, textStyle(18, '#9a7a5a')).setOrigin(0.5));
    });
  }

  // ================================================================ popups

  private queuePopup(build: (root: Phaser.GameObjects.Container, close: () => void) => void | (() => void)): void {
    this.popupQueue.push(build as PopupBuilder);
    if (!this.popupOpen) this.showNextPopup();
  }

  private showNextPopup(): void {
    const build = this.popupQueue.shift();
    if (!build) {
      this.popupOpen = false;
      ads.gameplayStart();
      return;
    }
    if (!this.popupOpen) ads.gameplayStop();
    this.popupOpen = true;
    if (this.dragging) {
      const v = this.dragging;
      this.dragging = null;
      for (const o of this.views) o.glow.setVisible(false);
      v.resetTransform();
    }
    const dim = this.add.rectangle(640, 360, 1280, 720, 0x2a1a10, 0.5).setDepth(1000).setInteractive();
    const root = this.add.container(640, 360).setDepth(1001);
    let after: void | (() => void);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.tweens.add({
        targets: root,
        scale: 0.85,
        alpha: 0,
        duration: 140,
        onComplete: () => {
          root.destroy();
          dim.destroy();
          if (typeof after === 'function') after();
          this.showNextPopup();
        },
      });
    };
    after = (build as (r: Phaser.GameObjects.Container, c: () => void) => void | (() => void))(root, close);
    root.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
  }

  private popupFrame(root: Phaser.GameObjects.Container, w: number, h: number, title: string, festive = false, onClose?: () => void): void {
    root.add(panelImage(this, -w / 2, -h / 2, w, h, 30, PALETTE.cream));
    root.add(panelImage(this, -w / 2 + 40, -h / 2 - 30, w - 80, 64, 28, festive ? PALETTE.cherry : PALETTE.woodLight, PALETTE.wood, 4, false));
    root.add(this.add.text(0, -h / 2 + 2, title, textStyle(32, '#ffffff', { stroke: '#5e3b22', strokeThickness: 6 })).setOrigin(0.5));
    if (onClose) {
      const x = new Button(this, w / 2 - 20, -h / 2 + 4, { w: 92, h: 92, color: 0xd9534f, icon: 'icon_close', iconScale: 0.9, radius: 46, onClick: onClose });
      x.icon!.setPosition(0, -2);
      root.add(x);
    }
  }

  private toast(msg: string): void {
    const t = this.add.text(640, 600, msg, textStyle(24, '#ffffff', { backgroundColor: '#5a3a26dd', padding: { x: 18, y: 10 } })).setOrigin(0.5).setDepth(2000);
    this.tweens.add({ targets: t, alpha: 0, y: 570, delay: 1800, duration: 500, onComplete: () => t.destroy() });
  }

  private dismissTutorial(): void {
    if (!this.tutorial) return;
    const t = this.tutorial;
    this.tutorial = undefined;
    this.tweens.killTweensOf(t);
    this.tweens.add({ targets: t, alpha: 0, scale: 0.6, duration: 250, onComplete: () => t.destroy() });
  }

  // ================================================================ floating text

  private floatText(x: number, y: number, s: string, size: number, color: string, stroke: string, dur: number, rise: number): void {
    const t = this.floaters[this.floaterCursor];
    this.floaterCursor = (this.floaterCursor + 1) % this.floaters.length;
    this.tweens.killTweensOf(t);
    t.setText(s).setFontSize(size).setColor(color).setStroke(stroke, size > 26 ? 7 : 5);
    t.setPosition(x, y).setAlpha(1).setScale(0.6).setVisible(true);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - rise, alpha: 0, delay: dur * 0.35, duration: dur * 0.65, ease: 'Quad.in', onComplete: () => t.setVisible(false) });
  }

  /** Grouped coin numbers: each second a few pools show ~5 s of income. */
  private floatCoins(): void {
    const n = this.views.length;
    let shown = 0;
    for (let k = 0; k < n && shown < 4; k++) {
      const v = this.views[this.coinCursor];
      this.coinCursor = (this.coinCursor + 1) % n;
      if (v.level <= 0 || v === this.dragging) continue;
      const amount = poolRate(this.state, v.level) * 5;
      this.floatText(v.homeX + 30, v.homeY - 34, `+${formatNumber(amount)}`, 20, '#fff6c8', '#a8700f', 1300, 46);
      shown++;
    }
    if (shown > 0 && Math.random() < 0.25) sfx.cling(0.05);
  }

  // ================================================================ refresh

  private refreshAll(): void {
    for (const v of this.views) v.setLevel(this.state.grid[v.index]);
    this.muteBtn.icon!.setTexture(this.state.muted ? 'icon_mute' : 'icon_sound');
    this.refreshHud();
    this.refreshButtons();
  }

  private refreshHud(): void {
    const s = this.state;
    const coins = formatNumber(s.coins);
    if (this.coinsText.text !== coins) this.coinsText.setText(coins);
    const rate = `+${formatNumber(productionPerSec(s))}${S.perSec}`;
    if (this.rateText.text !== rate) this.rateText.setText(rate);
    this.goldenChip.setVisible(s.goldenTime > 0);
    if (s.goldenTime > 0) this.goldenChipText.setText(`×3 ${S.golden} ${formatDuration(s.goldenTime)}`);
    this.boostChip.setVisible(s.boostTime > 0);
    if (s.boostTime > 0) this.boostChipText.setText(`×2 ${S.boost} ${formatDuration(s.boostTime)}`);
    this.albumBadge.setVisible(this.unseenAlbum > 0);
    this.refreshButtons();
  }

  private refreshButtons(): void {
    const s = this.state;
    for (const id of UPGRADE_IDS) {
      const b = this.upgradeButtons.get(id)!;
      const maxed = upgradeMaxed(s, id);
      b.setTexts(maxed ? S.max : formatNumber(nextUpgradeCost(s, id)));
      b.setEnabled(!maxed && canBuyUpgrade(s, id));
      b.setHighlight(!maxed && canBuyUpgrade(s, id));
      const lt = this.upgradeLevelTexts.get(id)!;
      const txt = `${S.level} ${s.upgrades[id]}/${CONFIG.upgrades[id].max}`;
      if (lt.text !== txt) lt.setText(txt);
    }
    const full = isGridFull(s);
    const cost = digCost(s);
    this.digBtn.setTexts(S.dig, full ? S.gridFull : formatNumber(cost));
    this.digBtn.setEnabled(!full && s.coins >= cost);
    this.fullHint.setVisible(full);
    const ready = boostReady(s);
    this.boostBtn.setEnabled(ready);
    this.boostBtn.setTexts(ready ? S.boostIdle : `${S.boostActive} ${formatDuration(s.boostTime)}`, ready ? S.video : '');
  }

  private drawDigBar(): void {
    const full = isGridFull(this.state);
    const p = full ? 1 : spawnProgress(this.state);
    const q = Math.round(p * 200) / 200;
    if (q !== this.lastBarP) {
      this.lastBarP = q;
      // texture = 8 px pad + bar + 8 px pad, drawn at 2×
      const barW = PANEL_W - 140;
      const px = (8 + Math.max(16, barW * q)) * 2;
      this.digBar.setCrop(0, 0, Math.min(this.digBarW, px), this.digBar.height);
    }
    const left = Math.ceil(CONFIG.autoSpawnSec * (1 - spawnProgress(this.state)));
    const txt = full ? '' : `${S.digFree} ${left}s`;
    if (this.digBarText.text !== txt) this.digBarText.setText(txt);
  }

  // ================================================================ debug

  private toggleDebug(): void {
    if (this.debugPanel) {
      this.debugPanel.setVisible(!this.debugPanel.visible);
      return;
    }
    const c = this.add.container(40, 112).setDepth(3000);
    c.add(panelImage(this, 0, 0, 300, 470, 16, 0x1f1510, 0xffd36b, 2, false).setAlpha(0.92));
    c.add(this.add.text(150, 18, S.debug.title, textStyle(20, '#ffd36b')).setOrigin(0.5));
    const mk = (y: number, label: string, fn: (b: Button) => void, color = 0x4a6a8a) => {
      const b: Button = new Button(this, 150, y, { w: 270, h: 56, color, label, fontSize: 20, radius: 12, onClick: () => fn(b) });
      c.add(b);
      return b;
    };
    mk(70, S.debug.coins, () => {
      this.state.coins += 1e6;
      this.refreshAll();
    });
    const spawnBtn = mk(134, S.debug.spawn(this.debugSpawnLevel), () => {
      const slot = firstEmptySlot(this.state.grid);
      if (slot < 0) return;
      this.state.grid[slot] = this.debugSpawnLevel;
      const isNew = discover(this.state, this.debugSpawnLevel);
      this.popIn(slot);
      if (isNew) this.onDiscovered(this.debugSpawnLevel);
    });
    const minus = new Button(this, 30, 134, { w: 44, h: 56, color: 0x6a4a8a, label: '−', radius: 10, onClick: () => setLvl(-1) });
    const plus = new Button(this, 270, 134, { w: 44, h: 56, color: 0x6a4a8a, label: '+', radius: 10, onClick: () => setLvl(1) });
    spawnBtn.setScale(0.72, 1);
    spawnBtn.label.setScale(1 / 0.72, 1);
    c.add([minus, plus]);
    const setLvl = (d: number) => {
      this.debugSpawnLevel = Phaser.Math.Clamp(this.debugSpawnLevel + d, 1, 12);
      spawnBtn.setTexts(S.debug.spawn(this.debugSpawnLevel));
    };
    mk(198, S.debug.speed(false), (b) => {
      this.timeScale = this.timeScale === 1 ? 10 : 1;
      b.setTexts(S.debug.speed(this.timeScale > 1));
    });
    mk(262, S.debug.guest, () => {
      this.state.nextGuestIn = 0;
    });
    mk(326, S.debug.unlockAll, () => {
      for (let L = 1; L <= 12; L++) if (discover(this.state, L)) this.revealDeco(L);
      this.trackMax();
    });
    mk(
      390,
      S.debug.reset,
      () => {
        this.resetting = true;
        storage.clear();
        location.reload();
      },
      0xa83a3a,
    );
    this.debugPanel = c;
  }
}

export const LAYOUT = { GRID_X, GRID_Y, SLOT_W, SLOT_H, GAP, slotX, slotY, FONT };
