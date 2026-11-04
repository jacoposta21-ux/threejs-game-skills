import Phaser from 'phaser';
import { DEPTH, PHYS, TILE } from '../core/constants';
import { Sound } from '../core/Audio';
import { PROP_SCALE } from '../art/props';
import { THEMES } from '../art/themes';
import type { GameScene } from '../scenes/GameScene';
import type { Spawn } from './LevelMap';

const ADD = Phaser.BlendModes.ADD;

export interface Light {
  x: number;
  y: number;
  r: number;
  i: number;
}

// ------------------------------------------------------------------ doors & switches
export class Door {
  img: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Zone;
  open = false;
  progress = 0; // 0 closed .. 1 open
  holdOpen = 0;
  permanent = false;
  cells: number[] = [];
  topY: number;
  h: number;
  constructor(public gs: GameScene, public s: Spawn) {
    this.h = (s.h || 3) * TILE;
    const tex = gs.levelDef.theme === 'station' ? 'door-metal' : 'door-ancient';
    this.topY = s.y - this.h;
    this.img = gs.add.image(s.x, this.topY, tex).setOrigin(0.5, 0).setDisplaySize(TILE, this.h).setDepth(DEPTH.interact);
    this.zone = gs.add.zone(s.x, this.topY + this.h / 2, TILE, this.h);
    gs.physics.add.existing(this.zone);
    const b = this.zone.body as Phaser.Physics.Arcade.Body;
    b.setAllowGravity(false);
    b.setImmovable(true);
    b.pushable = false;
    for (let k = 0; k < (s.h || 3); k++) this.cells.push((s.ty + k) * gs.level.W + s.tx);
    this.block(true);
  }
  private block(b: boolean) {
    for (const c of this.cells) b ? this.gs.level.blocked.add(c) : this.gs.level.blocked.delete(c);
  }
  openPermanent() {
    if (this.permanent) return;
    this.permanent = true;
    this.setOpen(true);
  }
  setOpen(o: boolean) {
    if (o === this.open) return;
    this.open = o;
    Sound.play('door');
    this.gs.fx.shake(0.003, 300);
    this.gs.fx.dust(this.s.x, this.s.y, 6);
  }
  update(dt: number) {
    if (!this.permanent && this.holdOpen > 0) {
      this.holdOpen -= dt;
      if (this.holdOpen <= 0) {
        // never crush whoever stands in the doorway
        const p = this.gs.player.body;
        const inside = Math.abs(p.center.x - this.s.x) < 26 && p.bottom > this.topY && p.top < this.s.y;
        if (inside) this.holdOpen = 0.2;
        else this.setOpen(false);
      }
    }
    const target = this.open ? 1 : 0;
    this.progress = Phaser.Math.Clamp(this.progress + Math.sign(target - this.progress) * dt * 1.8, 0, 1);
    const vis = Math.max(0.001, this.h * (1 - this.progress));
    const fh = this.img.frame.height;
    this.img.setCrop(0, fh * this.progress, this.img.frame.width, fh * (1 - this.progress));
    this.img.y = this.topY - this.h * this.progress;
    const solid = this.progress < 0.75;
    const b = this.zone.body as Phaser.Physics.Arcade.Body;
    b.enable = solid;
    if (solid) {
      this.zone.setSize(TILE, vis);
      b.setSize(TILE, vis);
      this.zone.setPosition(this.s.x, this.topY + vis / 2);
    }
    this.block(solid);
  }
}

export class Plate {
  img: Phaser.GameObjects.Image;
  pressed = false;
  door: Door | null = null;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.add.image(s.x, s.y, 'plate', 0).setOrigin(0.5, 1).setScale(PROP_SCALE).setDepth(DEPTH.interact);
  }
  update() {
    const zx = this.s.x, zy = this.s.y - 6;
    const on = (b: Phaser.Physics.Arcade.Body) => b.right > zx - 20 && b.left < zx + 20 && b.bottom > zy - 6 && b.bottom < zy + 10;
    let p = on(this.gs.player.body);
    for (const c of this.gs.crates) if (on(c.body)) p = true;
    if (p !== this.pressed) {
      this.pressed = p;
      this.img.setFrame(p ? 1 : 0);
      Sound.play('plate');
    }
    if (p && this.door) {
      this.door.setOpen(true);
      this.door.holdOpen = 0.5;
    }
  }
}

export class Mechanism {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  active = false;
  door: Door | null = null;
  t = Math.random() * 6;
  timed = 0;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.add.image(s.x, s.y, 'mech', 0).setOrigin(0.5, 1).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.glow = gs.add.image(s.x, s.y - 36, 'glow').setBlendMode(ADD).setTint(0x7ff5e0).setAlpha(0.25).setScale(0.5).setDepth(DEPTH.glow);
    if (s.ch === 'N') {
      this.timed = 7;
      this.img.setTint(0xffc070);
      this.glow.setTint(0xffb040);
    }
  }
  get orb() {
    return { x: this.s.x, y: this.s.y - 38 };
  }
  activate() {
    if (this.active) return;
    this.active = true;
    this.img.setFrame(1);
    Sound.play('mechanism');
    this.gs.fx.ring(this.orb.x, this.orb.y, 0x7ff5e0);
    this.gs.fx.glowE.explode(24, this.orb.x, this.orb.y);
    this.gs.tweens.add({ targets: this.glow, alpha: 0.9, scale: 1.4, duration: 600, yoyo: true, hold: 200, onComplete: () => this.glow.setAlpha(0.55).setScale(0.9) });
    if (this.timed) {
      const d = this.door;
      if (d) {
        this.gs.beam(this.orb.x, this.orb.y, d.s.x, d.topY + 40);
        d.setOpen(true);
        d.holdOpen = this.timed;
      }
      this.gs.toast(`The gate opens — ${this.timed} seconds!`, 1600);
      for (let k = 1; k < this.timed; k++) this.gs.time.delayedCall(k * 1000, () => Sound.play(k >= this.timed - 2 ? 'chargeReady' : 'ui'));
      this.gs.time.delayedCall(this.timed * 1000, () => {
        this.active = false;
        this.img.setFrame(0);
        this.glow.setAlpha(0.25).setScale(0.5);
      });
      return;
    }
    if (this.door) {
      const d = this.door;
      this.gs.beam(this.orb.x, this.orb.y, d.s.x, d.topY + 40);
      this.gs.time.delayedCall(700, () => d.openPermanent());
      this.gs.cinematicFocus(d.s.x, d.topY + 40, 1300);
    }
    this.gs.toast('Ancient mechanism awakened');
  }
  update(dt: number) {
    this.t += dt;
    if (!this.active) this.glow.setAlpha(0.18 + Math.sin(this.t * 2) * 0.08);
  }
}

// ------------------------------------------------------------------ pickups & markers
export class Checkpoint {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  lit = false;
  constructor(public gs: GameScene, public s: Spawn, public index: number) {
    this.img = gs.add.image(s.x, s.y, 'beacon', 0).setOrigin(0.5, 1).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.glow = gs.add.image(s.x, s.y - 50, 'glow').setBlendMode(ADD).setTint(0xffc060).setAlpha(0).setDepth(DEPTH.glow);
  }
  light(silent = false) {
    if (this.lit) return;
    this.lit = true;
    this.img.setFrame(1);
    this.glow.setAlpha(0.8);
    if (!silent) {
      Sound.play('checkpoint');
      this.gs.fx.glowE.explode(20, this.s.x, this.s.y - 50);
      this.gs.toast('Checkpoint — your progress is saved');
    }
  }
}

export class Lore {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  taken = false;
  constructor(public gs: GameScene, public s: Spawn, public index: number) {
    this.img = gs.add.image(s.x, s.y - 14, 'lore').setOrigin(0.5, 1).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.glow = gs.add.image(s.x, s.y - 20, 'glow').setBlendMode(ADD).setTint(0x9fe9ff).setAlpha(0.45).setScale(0.45).setDepth(DEPTH.glow);
    gs.tweens.add({ targets: [this.img], y: s.y - 20, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
}

export class Hint {
  text: Phaser.GameObjects.Text;
  shown = false;
  constructor(public gs: GameScene, public s: Spawn, msg: string) {
    this.text = gs.add.text(s.x, s.y - 92, msg, {
      fontFamily: 'Spectral, Georgia, serif', fontSize: '15px', color: '#f2ead8', align: 'center', stroke: '#05070a', strokeThickness: 4,
      wordWrap: { width: 300 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(DEPTH.hint);
  }
  update(px: number, py: number) {
    const near = !this.gs.cutscene && Math.abs(px - this.s.x) < 150 && Math.abs(py - this.s.y) < 200;
    const a = this.text.alpha;
    this.text.setAlpha(Phaser.Math.Linear(a, near ? 1 : 0, 0.08));
  }
}

export class Orb {
  img: Phaser.GameObjects.Image;
  taken = false;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.add.image(s.x, s.y - 16, 'orb').setScale(PROP_SCALE).setBlendMode(ADD).setDepth(DEPTH.glow);
    gs.tweens.add({ targets: this.img, y: s.y - 24, scale: PROP_SCALE * 1.2, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
}

export class Exit {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  beam: Phaser.GameObjects.Image;
  constructor(public gs: GameScene, public s: Spawn) {
    this.beam = gs.add.image(s.x, s.y + 10, 'beam').setOrigin(0.5, 1).setScale(1.2, 0.5).setBlendMode(ADD).setTint(0xbffff4).setAlpha(0.5).setDepth(DEPTH.glow).setFlipY(true);
    this.img = gs.add.image(s.x, s.y - 2, 'rift').setOrigin(0.5, 1).setScale(PROP_SCALE * 1.2).setBlendMode(ADD).setDepth(DEPTH.glow);
    this.glow = gs.add.image(s.x, s.y - 36, 'glow').setBlendMode(ADD).setTint(0x7ff5e0).setScale(2).setAlpha(0.6).setDepth(DEPTH.glow);
    gs.tweens.add({ targets: this.img, scaleX: PROP_SCALE * 1.35, alpha: 0.75, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    gs.tweens.add({ targets: this.glow, alpha: 0.35, duration: 1500, yoyo: true, repeat: -1 });
  }
}

export class HideSpot {
  img: Phaser.GameObjects.Image;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.add.image(s.x, s.y + 2, `hide-${gs.levelDef.theme}`).setOrigin(0.5, 1).setScale(PROP_SCALE * 1.1).setDepth(gs.levelDef.theme === 'station' ? DEPTH.decorBack : DEPTH.decorFront);
  }
  contains(x: number, y: number) {
    return Math.abs(x - this.s.x) < 20 && y > this.s.y - 70 && y <= this.s.y + 4;
  }
}

export class Cocoon {
  img: Phaser.Physics.Arcade.Image;
  alive = true;
  constructor(public gs: GameScene, public s: Spawn) {
    const h = (s.h || 3) * TILE;
    this.img = gs.physics.add.staticImage(s.x, s.y - h / 2, 'cocoon').setDisplaySize(TILE * 1.1, h).setDepth(DEPTH.interact);
    this.img.refreshBody();
    for (let k = 0; k < (s.h || 3); k++) gs.level.blocked.add((s.ty + k) * gs.level.W + s.tx);
    gs.tweens.add({ targets: this.img, scaleX: this.img.scaleX * 1.05, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  hit(big: boolean) {
    if (!this.alive) return;
    if (!big) {
      Sound.play('hit');
      this.gs.fx.armorSparks(this.s.x, this.img.y);
      this.gs.toast('The web holds — charge your shot (hold FIRE)');
      return;
    }
    this.alive = false;
    Sound.play('crumble');
    this.gs.fx.rockShatter(this.s.x, this.img.y, 0xe0d8ff);
    this.img.destroy();
    for (let k = 0; k < (this.s.h || 3); k++) this.gs.level.blocked.delete((this.s.ty + k) * this.gs.level.W + this.s.tx);
  }
}

/** Light-glass: invisible and intangible until Pip's light touches it. */
export class GhostPlatform {
  img: Phaser.Physics.Arcade.Image;
  revealed = false;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.physics.add.staticImage(s.x, s.y - TILE + 6, 'ghostplat').setScale(PROP_SCALE).setAlpha(0.04).setBlendMode(ADD).setDepth(DEPTH.interact);
    this.img.refreshBody();
    (this.img.body as Phaser.Physics.Arcade.StaticBody).enable = false;
  }
  update(t: number) {
    if (this.revealed) {
      this.img.setAlpha(0.75 + Math.sin(t * 2 + this.s.tx) * 0.2);
      return;
    }
    this.img.setAlpha(0.03 + Math.max(0, Math.sin(t * 1.3 + this.s.tx * 0.7)) * 0.06);
    const pip = this.gs.pip;
    if (Phaser.Math.Distance.Between(pip.x, pip.y, this.s.x, this.img.y) < pip.lightRadius * 1.35) this.reveal();
  }
  reveal() {
    this.revealed = true;
    (this.img.body as Phaser.Physics.Arcade.StaticBody).enable = true;
    Sound.play('reveal');
    this.gs.fx.glowE.explode(6, this.s.x, this.img.y);
  }
}

export class Crate {
  img: Phaser.Physics.Arcade.Image;
  private respawning = false;
  private doorSide = new Map<Door, number>();
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.physics.add.image(s.x, s.y - 16, 'crate').setScale(PROP_SCALE).setDepth(DEPTH.crate);
    const b = this.body;
    b.setSize(60, 62).setOffset(2, 1);
    b.setDragX(1400);
    b.setMaxVelocity(140, 700);
    b.setBounce(0, 0);
    b.setMass(3);
  }
  get body() {
    return this.img.body as Phaser.Physics.Arcade.Body;
  }
  update(dt: number) {
    const b = this.body;
    const L = this.gs.level;
    if (L.waterAtWorld(b.center.x, b.center.y + 4)) {
      // buoyancy as body gravity, so it is integrated per physics step (frame-rate independent)
      b.setGravityY(-PHYS.gravity * 1.5);
      b.setMaxVelocityY(110);
      b.velocity.x += L.currentAtWorld(b.center.x, b.center.y) * 40 * dt;
      b.setDragX(200);
    } else {
      b.setGravityY(0);
      b.setMaxVelocityY(700);
      b.setDragX(b.blocked.down ? 1400 : 100);
    }
    if (b.blocked.down) b.x += L.beltAtWorld(b.center.x, b.bottom + 4) * 70 * dt;
    // doorways are hard walls for crates (open or closed), so a crate can never end up on the far side of a door
    for (const d of this.gs.doors) {
      if (b.bottom <= d.topY + 2 || b.top >= d.s.y) continue;
      const side = this.doorSide.get(d) ?? Math.sign(b.center.x - d.s.x);
      const edge = d.s.x + side * (TILE / 2 + b.halfWidth + 0.5);
      if ((side < 0 && b.center.x > edge) || (side > 0 && b.center.x < edge)) {
        b.x = edge - b.halfWidth;
        b.updateCenter();
        this.img.x = edge;
        if (Math.sign(b.velocity.x) === -side) b.velocity.x = 0;
      }
      this.doorSide.set(d, side);
    }
    // lost crates (fell in a pit, spikes or acid) come back to where they started
    if (!this.respawning && (b.top > L.heightPx + 40 || L.hazardAtWorld(b.center.x, b.bottom - 4))) this.respawn();
  }
  respawn() {
    this.respawning = true;
    this.gs.fx.dust(this.img.x, this.img.y, 8);
    this.gs.tweens.add({
      targets: this.img, alpha: 0, duration: 250,
      onComplete: () => {
        this.body.reset(this.s.x, this.s.y - 16);
        this.doorSide.clear();
        this.body.setVelocity(0, 0);
        this.gs.tweens.add({ targets: this.img, alpha: 1, duration: 400, onComplete: () => (this.respawning = false) });
      },
    });
  }
}

// ------------------------------------------------------------------ hazards
export class ArcEmitter {
  img: Phaser.GameObjects.Image;
  g: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
  t: number;
  active = false;
  bottom: number;
  static ON = 1.0;
  static OFF = 1.7;
  constructor(public gs: GameScene, public s: Spawn) {
    const top = s.ty * TILE;
    this.img = gs.add.image(s.x, top, 'emitter').setOrigin(0.5, 0).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    let ty = s.ty + 1;
    while (ty < gs.level.H && !gs.level.solid(s.tx, ty)) ty++;
    this.bottom = ty * TILE;
    this.g = gs.add.graphics().setDepth(DEPTH.glow).setBlendMode(ADD);
    this.glow = gs.add.image(s.x, (top + this.bottom) / 2, 'beam').setDisplaySize(70, this.bottom - top).setTint(0x7fe0ff).setBlendMode(ADD).setAlpha(0).setDepth(DEPTH.glow);
    this.t = (s.tx * 0.37) % (ArcEmitter.ON + ArcEmitter.OFF);
  }
  update(dt: number) {
    const cycle = ArcEmitter.ON + ArcEmitter.OFF;
    this.t = (this.t + dt) % cycle;
    const wasActive = this.active;
    this.active = this.t < ArcEmitter.ON;
    const warn = !this.active && this.t > cycle - 0.45;
    this.g.clear();
    const top = this.s.ty * TILE + 14;
    if (this.active) {
      if (!wasActive) Sound.play('spark', Phaser.Math.Clamp((this.s.x - this.gs.cameras.main.midPoint.x) / 400, -1, 1));
      for (let k = 0; k < 2; k++) {
        this.g.lineStyle(k ? 1.5 : 4, k ? 0xffffff : 0x6fd8ff, k ? 1 : 0.6);
        this.g.beginPath();
        this.g.moveTo(this.s.x, top);
        const n = 9;
        for (let i = 1; i <= n; i++) {
          const y = top + ((this.bottom - top) * i) / n;
          this.g.lineTo(this.s.x + (i === n ? 0 : (Math.random() - 0.5) * 18), y);
        }
        this.g.strokePath();
      }
      this.glow.setAlpha(0.35 + Math.random() * 0.2);
      if (Math.random() < 0.3) this.gs.fx.sparkE.explode(2, this.s.x, this.bottom - 2);
    } else {
      this.glow.setAlpha(warn ? 0.08 : 0);
      if (warn && Math.random() < 0.4) this.gs.fx.sparkE.explode(1, this.s.x, top);
    }
    const p = this.gs.player.body;
    if (this.active && Math.abs(p.center.x - this.s.x) < 14 && p.bottom > top && p.top < this.bottom) this.gs.player.hurt(1, this.s.x);
  }
  light(): Light | null {
    return this.active ? { x: this.s.x, y: (this.s.ty * TILE + this.bottom) / 2, r: 130, i: 0.8 } : null;
  }
}

export class Stalactite {
  img: Phaser.Physics.Arcade.Image;
  mode: 'hang' | 'shake' | 'fall' | 'gone' = 'hang';
  t = 0;
  homeY: number;
  constructor(public gs: GameScene, public s: Spawn) {
    this.homeY = s.ty * TILE;
    this.img = gs.physics.add.image(s.x, this.homeY, 'stalactite').setOrigin(0.5, 0).setScale(PROP_SCALE * 1.1).setDepth(DEPTH.interact);
    const b = this.img.body as Phaser.Physics.Arcade.Body;
    b.setAllowGravity(false);
    b.setSize(24, 80).setOffset(10, 8);
    b.moves = false;
  }
  get body() {
    return this.img.body as Phaser.Physics.Arcade.Body;
  }
  trigger() {
    if (this.mode !== 'hang') return;
    this.mode = 'shake';
    this.t = 0;
    Sound.play('crack');
  }
  update(dt: number) {
    this.t += dt;
    const p = this.gs.player;
    switch (this.mode) {
      case 'hang':
        if (Math.abs(p.x - this.s.x) < 44 && p.y > this.homeY && p.y - this.homeY < 420 && !this.gs.levelDef.id.startsWith('heart')) this.trigger();
        break;
      case 'shake':
        this.img.x = this.s.x + Math.sin(this.t * 60) * 1.5;
        if (this.t > 0.45) {
          this.mode = 'fall';
          this.body.moves = true;
          this.body.setAllowGravity(true);
          this.img.x = this.s.x;
        }
        break;
      case 'fall': {
        const b = this.body;
        if (Math.abs(p.body.center.x - b.center.x) < 18 && p.body.top < b.bottom && p.body.bottom > b.top) {
          p.hurt(1, this.s.x);
          this.shatter();
        }
        const boss = this.gs.boss;
        if (boss && 'crushed' in boss && boss.alive && Math.abs(boss.x - b.center.x) < 80 && b.bottom > boss.y - 120 && b.bottom < boss.y) {
          boss.crushed();
          this.shatter();
          break;
        }
        if (b.blocked.down || this.gs.level.solidAtWorld(b.center.x, b.bottom + 2)) this.shatter();
        break;
      }
      case 'gone':
        if (this.t > 7) {
          this.mode = 'hang';
          this.body.moves = false;
          this.body.setAllowGravity(false);
          this.body.setVelocity(0, 0);
          this.img.setPosition(this.s.x, this.homeY).setVisible(true).setAlpha(0);
          this.body.reset(this.s.x, this.homeY);
          this.body.enable = true;
          this.gs.tweens.add({ targets: this.img, alpha: 1, duration: 800 });
        }
        break;
    }
  }
  shatter() {
    this.mode = 'gone';
    this.t = 0;
    this.gs.fx.rockShatter(this.img.x, this.body.bottom - 6, Phaser.Display.Color.HexStringToColor(THEMES[this.gs.levelDef.theme].rock[2]).color);
    Sound.play('rock', Phaser.Math.Clamp((this.s.x - this.gs.cameras.main.midPoint.x) / 400, -1, 1));
    this.gs.fx.shake(0.005, 150);
    this.img.setVisible(false);
    this.body.enable = false;
  }
}

export class Bouncer {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  t = 0;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.add.image(s.x, s.y + 1, 'bouncer', 0).setOrigin(0.5, 1).setScale(PROP_SCALE * 1.3).setDepth(DEPTH.interact);
    this.glow = gs.add.image(s.x, s.y - 10, 'glow').setTint(0xff7ad9).setBlendMode(ADD).setAlpha(0.5).setScale(0.8).setDepth(DEPTH.glow);
  }
  cd = 0;
  update(dt: number) {
    this.t += dt;
    this.cd -= dt;
    const p = this.gs.player;
    const b = p.body;
    if (this.cd <= 0 && b.velocity.y >= -10 && Math.abs(b.center.x - this.s.x) < 28 && b.bottom > this.s.y - 30 && b.bottom <= this.s.y + 2 && p.state !== 'climb' && p.state !== 'dead') {
      this.cd = 0.3;
      b.setVelocityY(-PHYS.bounceVel);
      p.usedDouble = false;
      p.setPState('air');
      p.airTime = 0.05;
      Sound.play('bounce');
      this.gs.fx.ring(this.s.x, this.s.y - 20, 0xff7ad9);
      this.gs.fx.glowE.explode(10, this.s.x, this.s.y - 20);
      this.img.setFrame(1);
      this.gs.tweens.add({ targets: this.img, scaleY: PROP_SCALE * 1.0, duration: 80, yoyo: true, onComplete: () => this.img.setFrame(0) });
    }
    this.glow.setAlpha(0.4 + Math.sin(this.t * 2.2) * 0.12);
  }
}

export class SporeVent {
  img: Phaser.GameObjects.Image;
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  t: number;
  erupting = false;
  dmgT = 0;
  static CYCLE = 4.0;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.add.image(s.x, s.y + 1, 'vent').setOrigin(0.5, 1).setScale(PROP_SCALE * 1.2).setDepth(DEPTH.interact);
    const tint = gs.levelDef.theme === 'heart' ? [0xffa060, 0xff6a5a] : [0xc8ff7a, 0x9affc8];
    this.emitter = gs.add.particles(s.x, s.y - 6, 'smoke', {
      emitting: false, lifespan: { min: 700, max: 1200 }, speedY: { min: -150, max: -80 }, speedX: { min: -25, max: 25 },
      scale: { start: 0.35, end: 1.1 }, alpha: { start: 0.55, end: 0 }, tint, blendMode: 'ADD', frequency: 40,
    }).setDepth(DEPTH.fx);
    this.t = (s.tx * 0.53) % SporeVent.CYCLE;
  }
  update(dt: number) {
    this.t = (this.t + dt) % SporeVent.CYCLE;
    const erupt = this.t > 2.4;
    const warn = this.t > 1.9 && !erupt;
    if (erupt !== this.erupting) {
      this.erupting = erupt;
      erupt ? this.emitter.start() : this.emitter.stop();
      if (erupt) Sound.play('spore', Phaser.Math.Clamp((this.s.x - this.gs.cameras.main.midPoint.x) / 400, -1, 1));
    }
    if (warn && Math.random() < 0.25) this.emitter.explode(1, this.s.x, this.s.y - 6);
    this.dmgT -= dt;
    const p = this.gs.player.body;
    if (this.erupting && this.t > 2.6 && Math.abs(p.center.x - this.s.x) < 22 && p.bottom > this.s.y - 120 && this.dmgT <= 0) {
      this.dmgT = 0.8;
      this.gs.player.hurt(1, this.s.x);
    }
  }
}

export class Lamp {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  t = Math.random() * 10;
  ly: number;
  constructor(public gs: GameScene, public s: Spawn) {
    const th = gs.levelDef.theme;
    const hangs = th === 'station' || th === 'heart';
    let y = s.y - 16;
    if (hangs) {
      // hang from the nearest ceiling above with a cable
      let ty = s.ty;
      while (ty > 0 && !gs.level.solid(s.tx, ty - 1)) ty--;
      const g = gs.add.graphics().setDepth(DEPTH.decorBack);
      g.lineStyle(1.5, 0x07090c, 1);
      g.lineBetween(s.x, ty * TILE, s.x, s.y - 30);
      y = s.y - 30;
      this.img = gs.add.image(s.x, y, `lamp-${th}`).setOrigin(0.5, 0).setScale(PROP_SCALE).setDepth(DEPTH.interact);
      this.ly = y + 14;
    } else {
      // grows from the nearest floor below
      let ty = s.ty;
      while (ty < gs.level.H - 1 && !gs.level.solid(s.tx, ty + 1)) ty++;
      y = (ty + 1) * TILE + 2;
      this.img = gs.add.image(s.x, y, `lamp-${th}`).setOrigin(0.5, 1).setScale(PROP_SCALE * 1.3).setDepth(DEPTH.decorBack);
      this.ly = y - 22;
    }
    this.glow = gs.add.image(s.x, this.ly, 'glow').setTint(THEMES[th].lamp).setBlendMode(ADD).setAlpha(0.6).setScale(1.6).setDepth(DEPTH.glow);
  }
  update(dt: number) {
    this.t += dt;
    const flick = this.gs.levelDef.theme === 'station' ? (Math.sin(this.t * 31) > 0.97 ? 0.4 : 1) : 1;
    this.glow.setAlpha((0.5 + Math.sin(this.t * 1.7) * 0.06) * flick);
  }
  light(): Light {
    return { x: this.s.x, y: this.ly, r: 210, i: 0.95 };
  }
}

// ================================================================== Chapter II objects

/** Cracked wall block: three normal hits or one charged blast breaks it. */
export class BreakWall {
  img: Phaser.Physics.Arcade.Image;
  hp = 3;
  alive = true;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.physics.add.staticImage(s.x, s.y - TILE / 2, `crack-${gs.levelDef.theme}`).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.img.refreshBody();
    gs.level.blocked.add(s.ty * gs.level.W + s.tx);
  }
  hit(big: boolean) {
    if (!this.alive) return;
    this.hp -= big ? 3 : 1;
    Sound.play(this.hp > 0 ? 'crack' : 'crumble');
    this.gs.tweens.add({ targets: this.img, x: this.s.x + 2, duration: 40, yoyo: true, repeat: 1 });
    this.img.setAlpha(0.55 + this.hp * 0.15);
    if (this.hp > 0) return;
    this.alive = false;
    const tint = this.gs.levelDef.theme === 'ice' ? 0xcfeeff : Phaser.Display.Color.HexStringToColor(THEMES[this.gs.levelDef.theme].rock[2]).color;
    this.gs.fx.rockShatter(this.s.x, this.img.y, tint);
    this.img.destroy();
    this.gs.level.blocked.delete(this.s.ty * this.gs.level.W + this.s.tx);
  }
}

/** Mine lift / rail platform. 'T' rides a horizontal '-' track, 'Y' a vertical '|' track. One-way from below. */
export class Mover {
  img: Phaser.Physics.Arcade.Image;
  a: number;
  b: number;
  vertical: boolean;
  dir = 1;
  pause = 0;
  speed = 72;
  prevX = 0;
  prevY = 0;
  constructor(public gs: GameScene, public s: Spawn) {
    const L = gs.level;
    this.vertical = s.ch === 'Y';
    const track = this.vertical ? '|' : '-';
    let lo = this.vertical ? s.ty : s.tx, hi = lo;
    const at = (k: number) => (this.vertical ? L.ch(s.tx, k) : L.ch(k, s.ty));
    while (at(lo - 1) === track) lo--;
    while (at(hi + 1) === track) hi++;
    this.a = lo * TILE + TILE / 2;
    this.b = hi * TILE + TILE / 2;
    const y0 = s.y - TILE + 8;
    this.img = gs.physics.add.image(s.x, y0, `mover-${gs.levelDef.theme}`).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    const body = this.body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.pushable = false;
    body.setFriction(0, 0); // riders are carried explicitly in update(), never twice
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
    body.setSize(192, 22).setOffset(0, 0);
    // rail
    const g = gs.add.graphics().setDepth(DEPTH.decorBack);
    g.lineStyle(3, 0x07090c, 0.9);
    if (this.vertical) g.lineBetween(s.x, this.a - TILE / 2 - 8, s.x, this.b + 8);
    else g.lineBetween(this.a - 48, y0, this.b + 48, y0);
    g.lineStyle(1, 0xc9a050, 0.6);
    if (this.vertical) g.lineBetween(s.x + 2, this.a - TILE / 2 - 8, s.x + 2, this.b + 8);
    else g.lineBetween(this.a - 48, y0 - 2, this.b + 48, y0 - 2);
    this.prevX = this.img.x;
    this.prevY = this.img.y;
  }
  get body() {
    return this.img.body as Phaser.Physics.Arcade.Body;
  }
  update(dt: number) {
    const b = this.body;
    if (this.pause > 0) {
      this.pause -= dt;
      b.setVelocity(0, 0);
    } else {
      const pos = this.vertical ? this.img.y + TILE / 2 - 8 : this.img.x;
      if (this.dir > 0 && pos >= this.b) { this.dir = -1; this.pause = 0.7; }
      else if (this.dir < 0 && pos <= this.a) { this.dir = 1; this.pause = 0.7; }
      if (this.vertical) b.setVelocity(0, this.dir * this.speed);
      else b.setVelocity(this.dir * this.speed, 0);
    }
    // carry whoever stands on top (player and crates)
    const dx = this.img.x - this.prevX, dy = this.img.y - this.prevY;
    this.prevX = this.img.x;
    this.prevY = this.img.y;
    const riders: Phaser.Physics.Arcade.Body[] = [this.gs.player.body, ...this.gs.crates.map((c) => c.body)];
    for (const r of riders) {
      if (r.right > b.left + 2 && r.left < b.right - 2 && Math.abs(r.bottom - b.top) < 6 && r.velocity.y >= -20) {
        r.x += dx;
        if (dy > 0) r.y += dy;
      }
    }
  }
}

/** Conveyor belt overlay on a run of '{' or '}' floor tiles. */
export class Belt {
  strip: Phaser.GameObjects.TileSprite;
  constructor(public gs: GameScene, tx0: number, tx1: number, ty: number, public dir: number) {
    const w = (tx1 - tx0 + 1) * TILE;
    this.strip = gs.add.tileSprite(tx0 * TILE, ty * TILE - 2, w, 12, 'belt').setOrigin(0, 0).setDepth(DEPTH.tiles + 1);
    if (dir < 0) this.strip.setFlipX(true);
  }
  update(dt: number) {
    this.strip.tilePositionX -= this.dir * 60 * dt * (this.strip.flipX ? -1 : 1);
  }
}

/** Ceiling piston: telegraphs, slams to the floor, retracts. Being caught is a heavy hit. */
export class Crusher {
  head: Phaser.GameObjects.Image;
  shaft: Phaser.GameObjects.TileSprite;
  top: number;
  floor: number;
  t: number;
  y: number;
  static CYCLE = 3.4;
  constructor(public gs: GameScene, public s: Spawn) {
    this.top = s.ty * TILE;
    let ty = s.ty;
    while (ty < gs.level.H - 1 && !gs.level.solid(s.tx, ty + 1)) ty++;
    this.floor = (ty + 1) * TILE;
    this.shaft = gs.add.tileSprite(s.x, this.top, 16, 4, 'shaft').setOrigin(0.5, 0).setDepth(DEPTH.interact);
    this.head = gs.add.image(s.x, this.top, 'crusher').setOrigin(0.5, 0).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.t = (s.tx * 0.61) % Crusher.CYCLE;
    this.y = this.top;
  }
  update(dt: number) {
    this.t = (this.t + dt) % Crusher.CYCLE;
    const t = this.t;
    const low = this.floor - 40, up = this.top;
    let y: number;
    let lethal = false;
    if (t < 1.4) y = up;
    else if (t < 1.9) y = up + Math.sin((t - 1.4) * 60) * 1.5 + (t - 1.4) * 10; // shiver warning
    else if (t < 2.05) { y = Phaser.Math.Linear(up + 5, low, (t - 1.9) / 0.15); lethal = true; }
    else if (t < 2.55) { y = low; lethal = true; }
    else y = Phaser.Math.Linear(low, up, (t - 2.55) / 0.85);
    if (this.y < low - 1 && y >= low - 1) {
      Sound.play('slam', Phaser.Math.Clamp((this.s.x - this.gs.cameras.main.midPoint.x) / 400, -1, 1));
      this.gs.fx.dust(this.s.x, this.floor, 10);
      const near = Math.abs(this.gs.player.x - this.s.x) < 260;
      if (near) this.gs.fx.shake(0.006, 160);
    }
    this.y = y;
    this.head.y = y;
    this.shaft.height = Math.max(1, y - this.top + 2);
    const p = this.gs.player.body;
    if (lethal && Math.abs(p.center.x - this.s.x) < 20 && p.top < y + 40 && p.bottom > this.top) this.gs.player.hurt(2, this.s.x, { respawn: true });
  }
}

/** Swinging blade on a chain, hung from the ceiling. */
export class Pendulum {
  blade: Phaser.GameObjects.Image;
  g: Phaser.GameObjects.Graphics;
  len: number;
  t: number;
  ax: number;
  ay: number;
  constructor(public gs: GameScene, public s: Spawn) {
    this.ax = s.x;
    this.ay = s.ty * TILE;
    let ty = s.ty;
    while (ty < gs.level.H - 1 && !gs.level.solid(s.tx, ty + 1)) ty++;
    this.len = Phaser.Math.Clamp((ty + 1) * TILE - this.ay - 44, 70, 230);
    this.g = gs.add.graphics().setDepth(DEPTH.interact);
    this.blade = gs.add.image(s.x, this.ay + this.len, 'blade').setScale(PROP_SCALE * 1.3).setDepth(DEPTH.interact + 1);
    this.t = s.tx * 0.9;
  }
  update(dt: number) {
    this.t += dt;
    const ang = Math.sin(this.t * 2.4) * 1.05;
    const bx = this.ax + Math.sin(ang) * this.len, by = this.ay + Math.cos(ang) * this.len;
    this.blade.setPosition(bx, by).setRotation(-ang);
    this.g.clear();
    this.g.lineStyle(3, 0x07090c, 1);
    this.g.lineBetween(this.ax, this.ay, bx, by);
    this.g.lineStyle(1, 0x9a8a5a, 1);
    this.g.lineBetween(this.ax, this.ay, bx, by);
    this.g.fillStyle(0x07090c, 1).fillCircle(this.ax, this.ay + 3, 5);
    const p = this.gs.player.body;
    if (Phaser.Math.Distance.Between(p.center.x, p.center.y, bx, by + 6) < 26) this.gs.player.hurt(1, bx);
    if (Math.abs(Math.cos(this.t * 2.4)) > 0.995 && Math.abs(this.gs.player.x - this.ax) < 500) Sound.play('spark');
  }
}

// ================================================================== Chapter III objects

/** A block that exists only in one time: 'Q' only in the past, 'q' only in the present. */
export class EcoBlock {
  img: Phaser.Physics.Arcade.Image;
  cell: number;
  constructor(public gs: GameScene, public s: Spawn, public pastOnly: boolean) {
    this.img = gs.physics.add.staticImage(s.x, s.y - TILE / 2, pastOnly ? 'eco-past' : 'eco-present').setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.img.refreshBody();
    this.cell = s.ty * gs.level.W + s.tx;
    // like tile faces: no collision on sides that touch solid ground or another block of the same time,
    // so Elias walks smoothly from the floor onto a bridge of the past
    const L = gs.level;
    const same = (x: number, y: number) => L.isSolidCh(L.ch(x, y)) || L.ch(x, y) === s.ch;
    const cc = (this.img.body as Phaser.Physics.Arcade.StaticBody).checkCollision;
    cc.left = !same(s.tx - 1, s.ty);
    cc.right = !same(s.tx + 1, s.ty);
    cc.up = !same(s.tx, s.ty - 1);
    cc.down = !same(s.tx, s.ty + 1);
  }
  get solidNow() {
    return this.pastOnly === this.gs.past;
  }
  apply(instant = false) {
    const on = this.solidNow;
    (this.img.body as Phaser.Physics.Arcade.StaticBody).enable = on;
    if (on) this.gs.level.blocked.add(this.cell);
    else this.gs.level.blocked.delete(this.cell);
    const a = on ? 1 : 0.13;
    if (instant) this.img.setAlpha(a);
    else this.gs.tweens.add({ targets: this.img, alpha: a, duration: 260 });
    this.img.setBlendMode(on ? Phaser.BlendModes.NORMAL : ADD);
  }
  overlaps(b: Phaser.Physics.Arcade.Body) {
    const x0 = this.s.x - TILE / 2, y0 = this.s.y - TILE;
    return b.right > x0 + 1 && b.left < x0 + TILE - 1 && b.bottom > y0 + 1 && b.top < y0 + TILE - 1;
  }
}

/** Column of rising glow-spores that lifts Elias. */
export class Updraft {
  top: number;
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  constructor(public gs: GameScene, public s: Spawn) {
    let ty = s.ty;
    while (ty > 0 && !gs.level.solid(s.tx, ty - 1)) ty--;
    this.top = ty * TILE;
    const h = s.y - this.top;
    gs.add.image(s.x, s.y, 'beam').setOrigin(0.5, 1).setDisplaySize(52, h).setFlipY(true).setTint(0x9ff5c8).setAlpha(0.18).setBlendMode(ADD).setDepth(DEPTH.decorBack);
    this.emitter = gs.add.particles(0, 0, 'spore', {
      x: { min: s.x - 14, max: s.x + 14 }, y: s.y - 4, lifespan: (h / 140) * 1000, speedY: { min: -170, max: -110 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.6, end: 0.2 }, alpha: { start: 0.9, end: 0 }, tint: [0x9ff5c8, 0xd07aff, 0x7ff5e0], blendMode: 'ADD', frequency: 90,
    }).setDepth(DEPTH.glow);
  }
  update(dt: number) {
    const p = this.gs.player;
    const b = p.body;
    if (p.state === 'dead' || p.state === 'climb' || p.state === 'swim') return;
    if (Math.abs(b.center.x - this.s.x) < 20 && b.bottom > this.top + 8 && b.top < this.s.y) {
      b.setVelocityY(Math.max(b.velocity.y - 3000 * dt, -400));
      if (p.state === 'ground') p.setPState('air');
      p.usedDouble = false;
      p.airTime = Math.max(p.airTime, 0.1);
    }
  }
}

/** A seed of the Keepers' gardens: a charged blast makes it grow into a climbable vine (grid cells ':' above it). */
export class VineBud {
  img: Phaser.Physics.Arcade.Image;
  grown = false;
  constructor(public gs: GameScene, public s: Spawn, public index: number) {
    this.img = gs.physics.add.staticImage(s.x, s.y - 8, 'vinebud').setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.img.refreshBody();
    // generous hitbox: a straight shot from a standing Elias must reach the seed on the floor
    (this.img.body as Phaser.Physics.Arcade.StaticBody).setSize(30, 64);
    gs.tweens.add({ targets: this.img, scaleY: PROP_SCALE * 1.12, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  hit(big: boolean) {
    if (this.grown) return;
    if (!big) {
      Sound.play('hit');
      this.gs.toast('The seed needs more light — charge your shot', 1600);
      return;
    }
    this.grow();
  }
  grow(instant = false) {
    if (this.grown) return;
    this.grown = true;
    const L = this.gs.level;
    const cells: number[] = [this.s.ty];
    for (let ty = this.s.ty - 1; ty > 0 && L.grid[ty][this.s.tx] === ':'; ty--) cells.push(ty);
    if (!instant) Sound.play('reveal');
    cells.forEach((ty, k) => {
      const make = () => {
        L.grid[ty][this.s.tx] = 'H';
        const t = L.ground.putTileAt(33, this.s.tx, ty);
        if (k === cells.length - 1) t.setCollision(false, false, true, false);
        if (!instant) this.gs.fx.glowE.explode(3, this.s.tx * TILE + 16, ty * TILE + 16);
      };
      if (instant) make();
      else this.gs.time.delayedCall(k * 70, make);
    });
    // the tile below the old top is no longer the ladder top
    this.img.setVisible(false);
    (this.img.body as Phaser.Physics.Arcade.StaticBody).enable = false;
  }
}

/** Keeper lantern: lit by Pip or a charged blast; light that shadows fear. The Shadow can snuff it. */
export class Lantern {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  lit = false;
  ly: number;
  constructor(public gs: GameScene, public s: Spawn) {
    this.img = gs.add.image(s.x, s.y + 1, 'lantern', 0).setOrigin(0.5, 1).setScale(PROP_SCALE).setDepth(DEPTH.interact);
    this.ly = s.y - 34;
    this.glow = gs.add.image(s.x, this.ly, 'glow').setTint(0xffd27a).setBlendMode(ADD).setAlpha(0).setScale(2.2).setDepth(DEPTH.glow);
  }
  setLit(on: boolean, quiet = false) {
    if (on === this.lit) return;
    this.lit = on;
    this.img.setFrame(on ? 1 : 0);
    this.gs.tweens.add({ targets: this.glow, alpha: on ? 0.75 : 0, duration: on ? 300 : 600 });
    if (!quiet) {
      Sound.play(on ? 'checkpoint' : 'stalker');
      if (on) this.gs.fx.glowE.explode(14, this.s.x, this.ly);
      else this.gs.fx.smokeWisp(this.s.x, this.ly);
    }
  }
  light(): Light | null {
    return this.lit ? { x: this.s.x, y: this.ly, r: 300, i: 1 } : null;
  }
}
