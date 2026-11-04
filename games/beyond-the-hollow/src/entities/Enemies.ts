import Phaser from 'phaser';
import { t } from '../core/i18n';
import { DEPTH, TILE } from '../core/constants';
import { Sound } from '../core/Audio';
import type { GameScene } from '../scenes/GameScene';

export type EnemyKind = 'crawler' | 'stalker' | 'burrower' | 'guardian' | 'boss' | 'drone' | 'mimic' | 'jelly';

export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  abstract kind: EnemyKind;
  hp = 2;
  maxHp = 2;
  alive = true;
  contactDamage = 1;
  flashT = 0;
  stateT = 0;
  constructor(public gs: GameScene, x: number, y: number, tex: string) {
    super(gs, x, y, tex, 0);
    gs.add.existing(this);
    gs.physics.add.existing(this);
    this.setDepth(DEPTH.enemies);
  }
  get player() {
    return this.gs.player;
  }
  abstract tick(dt: number): void;
  /** Can bolts currently damage/collide with this enemy? */
  vulnerable() {
    return this.alive;
  }
  /** Returns true if the hit connected (consumes the bolt). */
  hit(dmg: number, srcX: number, _big: boolean, _bx = 0, _by = 0): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flashT = 0.09;
    this.setTintFill(0xffffff);
    Sound.play('enemyHit', this.pan());
    this.gs.fx.hitSparks(this.x, this.y - this.displayHeight * 0.4, srcX < this.x ? 1 : -1);
    this.gs.fx.hitstop(35);
    if (this.hp <= 0) this.die();
    return true;
  }
  pan() {
    return Phaser.Math.Clamp((this.x - this.gs.cameras.main.midPoint.x) / 500, -1, 1);
  }
  die() {
    this.alive = false;
    Sound.play('enemyDie', this.pan());
    this.gs.fx.deathBurst(this.x, this.y - this.displayHeight * 0.4, this.kind);
    this.gs.fx.shake(0.006, 140);
    this.body.enable = false;
    this.gs.tweens.add({ targets: this, alpha: 0, scaleY: this.scaleY * 0.6, duration: 380, onComplete: () => this.destroy() });
  }
  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt);
    if (this.flashT > 0) {
      this.flashT -= dt / 1000;
      if (this.flashT <= 0) this.clearTint();
    }
  }
  distToPlayer() {
    return Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y);
  }
  /** Line of sight against solid tiles. */
  sees(range: number, fromY = this.y - 10) {
    const p = this.player;
    if (p.hidden || p.state === 'dead') return false;
    const d = Phaser.Math.Distance.Between(this.x, fromY, p.x, p.y - 30);
    if (d > range) return false;
    const steps = Math.ceil(d / 14);
    for (let i = 1; i < steps; i++) {
      const x = Phaser.Math.Linear(this.x, p.x, i / steps), y = Phaser.Math.Linear(fromY, p.y - 30, i / steps);
      if (this.gs.level.solidAtWorld(x, y)) return false;
    }
    return true;
  }
  lure(range: number) {
    const pip = this.gs.pip;
    if (!pip.luring) return null;
    return Phaser.Math.Distance.Between(this.x, this.y, pip.x, pip.y) < range ? pip : null;
  }
}

// ---------------------------------------------------------------- CRAWLER
/** Crawls along any surface (floors, walls, ceilings) by walking the tile grid, then pounces. */
export class Crawler extends Enemy {
  kind: EnemyKind = 'crawler';
  cx = 0; cy = 0; nx = 0; ny = 1; tx = 1; ty = 0;
  fromX = 0; fromY = 0; toX = 0; toY = 0; prog = 1; dur = 0.4;
  fromRot = 0; toRot = 0;
  mode: 'crawl' | 'leap' = 'crawl';
  chasing = false;
  pounceCd = 1;
  private chitter = 0;

  constructor(gs: GameScene, x: number, y: number, tx: number, ty: number) {
    super(gs, x, y, 'crawler');
    this.hp = this.maxHp = 2;
    this.setScale(0.5).setOrigin(0.5, 60 / 64);
    this.play('crawler-walk');
    this.body.setSize(60, 40).setOffset(18, 20);
    this.body.setAllowGravity(false);
    this.body.moves = false;
    this.cx = tx;
    this.cy = ty;
    const L = gs.level;
    const n = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([a, b]) => L.solid(tx + a, ty + b)) || [0, 1];
    this.nx = n[0];
    this.ny = n[1];
    [this.tx, this.ty] = this.ny !== 0 ? [Math.random() < 0.5 ? 1 : -1, 0] : [0, -1];
    const p = this.surf(this.cx, this.cy, this.nx, this.ny);
    this.setPosition(p.x, p.y);
    this.toX = p.x;
    this.toY = p.y;
    this.rotation = this.toRot = this.rotFor(this.nx, this.ny);
  }
  surf(cx: number, cy: number, nx: number, ny: number) {
    return { x: cx * TILE + 16 + nx * 15, y: cy * TILE + 16 + ny * 15 };
  }
  rotFor(nx: number, ny: number) {
    return Math.atan2(ny, nx) - Math.PI / 2;
  }
  solid(x: number, y: number) {
    return this.gs.level.solid(x, y);
  }
  private nextStep() {
    const L = this.gs.level;
    // choose direction while chasing / lured
    const goal = this.lure(420) || (this.chasing ? this.player : null);
    if (goal) {
      const px = this.x, py = this.y;
      const dot = (goal.x - px) * this.tx + (goal.y - py) * this.ty;
      if (dot < -24) {
        this.tx = -this.tx;
        this.ty = -this.ty;
      }
    } else if (Math.random() < 0.04) {
      this.tx = -this.tx;
      this.ty = -this.ty;
    }
    let { cx, cy, nx, ny, tx, ty } = this;
    const ax = cx + tx, ay = cy + ty;
    const fromRot = this.rotFor(nx, ny);
    const wet = (x: number, y: number) => L.isWater(x, y) || L.ch(x, y) === 'a';
    if (wet(ax, ay) || (!this.solid(ax, ay) && !this.solid(ax + nx, ay + ny) && wet(ax + nx, ay + ny))) {
      // crawlers never walk into water or acid: turn back
      this.tx = -tx; this.ty = -ty;
      this.beginMove(cx, cy, fromRot, 0.1);
      return;
    }
    if (this.solid(ax, ay) || L.hazardAtWorld(ax * TILE + 16, ay * TILE + 16)) {
      // concave: climb the wall ahead
      if (this.solid(ax, ay)) {
        this.nx = tx; this.ny = ty; this.tx = -nx; this.ty = -ny;
      } else {
        this.tx = -tx; this.ty = -ty;
      }
      this.beginMove(cx, cy, fromRot, 0.16);
    } else if (this.solid(ax + nx, ay + ny)) {
      this.cx = ax; this.cy = ay;
      this.beginMove(ax, ay, fromRot, 1);
    } else {
      // convex corner: wrap around it
      const wx = ax + nx, wy = ay + ny;
      if (this.solid(wx, wy) || wx < 0 || wy < 0 || wx >= L.W || wy >= L.H) {
        this.tx = -tx; this.ty = -ty;
        this.beginMove(cx, cy, fromRot, 0.1);
        return;
      }
      this.cx = wx; this.cy = wy;
      this.nx = -tx; this.ny = -ty; this.tx = nx; this.ty = ny;
      this.beginMove(wx, wy, fromRot, 1.4);
    }
  }
  private beginMove(cx: number, cy: number, fromRot: number, len: number) {
    const p = this.surf(cx, cy, this.nx, this.ny);
    this.fromX = this.x; this.fromY = this.y;
    this.toX = p.x; this.toY = p.y;
    this.fromRot = fromRot;
    let to = this.rotFor(this.nx, this.ny);
    while (to - fromRot > Math.PI) to -= Math.PI * 2;
    while (to - fromRot < -Math.PI) to += Math.PI * 2;
    this.toRot = to;
    const speed = this.chasing || this.lure(420) ? 175 : 70;
    this.dur = Math.max(0.06, (TILE * len) / speed);
    this.prog = 0;
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.pounceCd -= dt;
    const seen = this.sees(260, this.y);
    if (seen && !this.chasing) {
      Sound.play('crawler', this.pan());
      this.gs.fx.alert(this.x, this.y - 24);
    }
    this.chasing = seen || (this.chasing && this.distToPlayer() < 360 && !this.player.hidden);
    if (this.mode === 'crawl') {
      this.prog += dt / this.dur;
      const k = Math.min(1, this.prog);
      this.x = Phaser.Math.Linear(this.fromX, this.toX, k);
      this.y = Phaser.Math.Linear(this.fromY, this.toY, k);
      this.rotation = Phaser.Math.Linear(this.fromRot, this.toRot, Math.min(1, k * 1.5));
      if (this.prog >= 1) this.nextStep();
      this.fitBody();
      this.body.reset(this.x, this.y);
      // local facing
      const lx = Math.cos(this.rotation), ly = Math.sin(this.rotation);
      this.setFlipX(lx * this.tx + ly * this.ty < 0);
      this.anims.timeScale = this.chasing ? 2.2 : 1;
      this.chitter -= dt;
      if (this.chasing && this.chitter < 0) {
        this.chitter = 0.6;
        Sound.play('crawler', this.pan());
      }
      if (this.chasing && this.pounceCd <= 0 && this.distToPlayer() < 130 && seen && this.player.state !== 'swim' && !this.gs.level.waterAtWorld(this.player.x, this.player.y - 20)) this.pounce();
    } else {
      this.rotation *= 0.85;
      if (this.gs.level.waterAtWorld(this.x, this.y - 8)) {
        // fell into water: it can't swim — it drowns
        this.gs.fx.splash(this.x, this.y);
        this.gs.fx.bubble(this.x, this.y);
        this.die();
        return;
      }
      if (this.body.blocked.down && this.stateT > 0.1) this.land();
      this.stateT += dt;
      if (this.stateT > 2.5 || this.y > this.gs.level.heightPx + 50) this.die();
    }
  }
  /** While crawling the sprite is rotated onto walls and ceilings, but an arcade body never rotates:
   *  keep a square hitbox centred on what the player actually sees. */
  private fitBody() {
    const half = 15;
    const cx = this.x - this.nx * 10, cy = this.y - this.ny * 10;
    this.body.setSize((half * 2) / this.scaleX, (half * 2) / this.scaleY, false);
    this.body.setOffset((cx - half - this.x) / this.scaleX + this.displayOriginX, (cy - half - this.y) / this.scaleY + this.displayOriginY);
  }
  private pounce() {
    this.mode = 'leap';
    this.body.setSize(60, 40).setOffset(18, 20);
    this.stateT = 0;
    this.pounceCd = 2.2;
    this.play('crawler-pounce');
    Sound.play('crawler', this.pan());
    this.body.moves = true;
    this.body.setAllowGravity(true);
    const p = this.player;
    const dx = p.x - this.x, dy = p.y - 30 - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.body.setVelocity((dx / d) * 300, this.ny === 1 ? -300 : (dy / d) * 300);
  }
  private land() {
    this.mode = 'crawl';
    this.body.moves = false;
    this.body.setAllowGravity(false);
    this.body.setVelocity(0, 0);
    this.play('crawler-walk');
    let cx = Math.floor(this.x / TILE), cy = Math.floor((this.body.bottom - 4) / TILE);
    while (this.solid(cx, cy) && cy > 0) cy--;
    this.cx = cx; this.cy = cy; this.nx = 0; this.ny = 1;
    this.tx = this.player.x > this.x ? 1 : -1; this.ty = 0;
    this.rotation = 0;
    this.beginMove(cx, cy, 0, 0.3);
  }
  hit(dmg: number, srcX: number, big: boolean) {
    const r = super.hit(dmg, srcX, big);
    if (this.alive) this.chasing = true;
    return r;
  }
}

// ---------------------------------------------------------------- STALKER
/** A shadow that hunts through darkness and recoils from light. */
export class Stalker extends Enemy {
  kind: EnemyKind = 'stalker';
  /** Ombra Velata: splits into two smaller shades the first time it is destroyed */
  veiled = false;
  small = false;
  /** optional prey other than Elias (Ilse during a ritual) */
  prey: { x: number; y: number; hurt: (n: number) => void; mode?: string } | null = null;
  vx = 0;
  vy = 0;
  mode: 'drift' | 'hunt' | 'flee' | 'attack' | 'stunned' = 'drift';
  home: Phaser.Math.Vector2;
  vis = 0.1;
  private whisper = 0;
  constructor(gs: GameScene, x: number, y: number) {
    super(gs, x, y - 40, 'stalker');
    this.hp = this.maxHp = 4;
    this.setScale(0.5).setOrigin(0.5, 0.55);
    this.play('stalker-drift');
    this.body.setAllowGravity(false);
    this.body.setSize(50, 110).setOffset(39, 30);
    this.home = new Phaser.Math.Vector2(this.x, this.y);
    this.setAlpha(0.1);
    this.setBlendMode(Phaser.BlendModes.NORMAL);
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.stateT += dt;
    const p = this.player;
    const light = this.gs.lightAt(this.x, this.y);
    const d = this.distToPlayer();
    let tx = 0, ty = 0, sp = 0;
    if (light > 0.55 && this.mode !== 'stunned') {
      if (this.mode !== 'flee') {
        this.mode = 'flee';
        this.stateT = 0;
        Sound.play('stalker', this.pan());
      }
      if (light > 0.85) {
        this.hp -= dt * 0.6;
        if (Math.random() < 0.3) this.gs.fx.smokeWisp(this.x, this.y);
        if (this.hp <= 0) return this.die();
      }
    }
    switch (this.mode) {
      case 'drift':
        tx = this.home.x + Math.sin(this.stateT * 0.5) * 60;
        ty = this.home.y + Math.sin(this.stateT * 0.9) * 20;
        sp = 40;
        if (d < 640 && !p.hidden && p.state !== 'dead' && light < 0.4) {
          this.mode = 'hunt';
          this.stateT = 0;
          Sound.play('stalker', this.pan());
        }
        break;
      case 'hunt':
        if (this.prey && this.prey.mode !== 'down') {
          tx = this.prey.x;
          ty = this.prey.y - 40;
          if (Phaser.Math.Distance.Between(this.x, this.y, this.prey.x, this.prey.y - 40) < 40) {
            this.prey.hurt(1);
            this.mode = 'flee';
            this.stateT = 0;
          }
          break;
        }
        tx = p.x;
        ty = p.y - 40;
        sp = 70 + Math.min(90, this.stateT * 25);
        if (p.hidden || d > 900) this.mode = 'drift';
        if (d < 46) {
          this.mode = 'attack';
          this.stateT = 0;
          this.play('stalker-lunge');
        }
        this.whisper -= dt;
        if (this.whisper < 0) {
          this.whisper = 3 + Math.random() * 2;
          Sound.play('stalker', this.pan());
        }
        break;
      case 'attack':
        tx = p.x;
        ty = p.y - 40;
        sp = 200;
        if (this.stateT > 0.18 && d < 56) p.hurt(1, this.x);
        if (this.stateT > 0.45) {
          this.mode = 'flee';
          this.stateT = 0;
          this.play('stalker-drift');
        }
        break;
      case 'flee': {
        const src = this.gs.pip;
        const ax = this.x - src.x, ay = this.y - src.y;
        const l = Math.max(1, Math.hypot(ax, ay));
        tx = this.x + (ax / l) * 200;
        ty = this.y + (ay / l) * 120;
        sp = 210;
        if (this.stateT > 1.2 && light < 0.3) {
          this.mode = 'hunt';
          this.stateT = 0;
        }
        break;
      }
      case 'stunned':
        sp = 0;
        if (this.stateT > 0.6) this.mode = 'flee';
        break;
    }
    const dx = tx - this.x, dy = ty - this.y;
    const l = Math.max(1, Math.hypot(dx, dy));
    this.vx = Phaser.Math.Linear(this.vx, (dx / l) * sp, Math.min(1, dt * 3));
    this.vy = Phaser.Math.Linear(this.vy, (dy / l) * sp, Math.min(1, dt * 3));
    if (this.mode === 'stunned') {
      this.vx *= 0.9;
      this.vy *= 0.9;
    }
    this.body.setVelocity(this.vx, this.vy);
    this.setFlipX(this.vx < 0);
    // visibility: they are hard to see until close
    const target = this.mode === 'flee' ? 0.35 + Math.random() * 0.3 : Phaser.Math.Clamp(1.15 - d / 380, 0.12, 0.95);
    this.vis = Phaser.Math.Linear(this.vis, target, Math.min(1, dt * 4));
    this.setAlpha(this.flashT > 0 ? 1 : this.vis);
  }
  hit(dmg: number, srcX: number, big: boolean) {
    const r = super.hit(dmg, srcX, big);
    if (this.alive) {
      this.mode = 'stunned';
      this.stateT = 0;
      this.vx = (this.x - srcX > 0 ? 1 : -1) * 260;
    }
    return r;
  }
}

// ---------------------------------------------------------------- BURROWER
/** Tunnels under the floor toward prey, erupts, bites or spits, and is only vulnerable while surfaced. */
export class Burrower extends Enemy {
  kind: EnemyKind = 'burrower';
  mode: 'under' | 'rise' | 'up' | 'sink' = 'under';
  floorY: number;
  mound: Phaser.GameObjects.Image;
  cd = 1;
  spat = false;
  bit = false;
  private dirtTimer = 0;
  constructor(gs: GameScene, x: number, y: number) {
    super(gs, x, y, 'burrower');
    this.hp = this.maxHp = 3;
    this.floorY = y;
    this.setScale(0.5).setOrigin(0.5, 1);
    this.body.setAllowGravity(false);
    this.body.moves = false;
    this.body.setSize(60, 140).setOffset(34, 30);
    this.play('burrower-idle');
    this.setVisible(false);
    this.mound = gs.add.image(x, y + 2, 'mound').setOrigin(0.5, 1).setScale(0.5).setDepth(DEPTH.decorFront);
  }
  vulnerable() {
    return this.alive && (this.mode === 'up' || (this.mode === 'rise' && this.stateT > 0.2));
  }
  private canMoveTo(x: number) {
    const L = this.gs.level;
    const tx = Math.floor(x / TILE), ty = Math.floor((this.floorY - 4) / TILE);
    return !L.solid(tx, ty) && L.solid(tx, ty + 1) && !L.hazardAtWorld(x, this.floorY - 4) && !L.isWater(tx, ty);
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.stateT += dt;
    const p = this.player;
    const lure = this.lure(380);
    const goal = lure || (Math.abs(p.y - this.floorY) < 140 && !p.hidden ? p : null);
    switch (this.mode) {
      case 'under': {
        this.cd -= dt;
        if (goal && Math.abs(goal.x - this.x) < 340) {
          const dir = Math.sign(goal.x - this.x);
          const nx = this.x + dir * 70 * dt;
          if (Math.abs(goal.x - this.x) > 8 && this.canMoveTo(nx + dir * 14)) this.x = nx;
          this.dirtTimer -= dt;
          if (this.dirtTimer < 0) {
            this.dirtTimer = 0.12;
            this.gs.fx.dirt(this.x, this.floorY);
          }
          if (Math.abs(goal.x - this.x) < 46 && this.cd <= 0) {
            this.mode = 'rise';
            this.stateT = 0;
            this.setVisible(true);
            Sound.play('burrow', this.pan());
            this.gs.fx.dirtBurst(this.x, this.floorY);
            this.gs.fx.shake(0.004, 150);
          }
        }
        this.mound.setPosition(this.x, this.floorY + 2 + Math.sin(this.stateT * 9) * 0.8);
        break;
      }
      case 'rise': {
        const k = Math.min(1, this.stateT / 0.35);
        this.showFrac(k);
        if (k >= 1) {
          this.mode = 'up';
          this.stateT = 0;
          this.spat = this.bit = false;
          this.play('burrower-bite');
        }
        break;
      }
      case 'up': {
        this.showFrac(1);
        this.setFlipX(p.x < this.x);
        if (!this.bit && this.stateT > 0.12) {
          this.bit = true;
          if (Math.abs(p.x - this.x) < 52 && p.y > this.floorY - 110) p.hurt(1, this.x);
        }
        if (this.stateT > 0.5 && !this.anims.isPlaying) this.play('burrower-idle');
        if (!this.spat && this.stateT > 0.7 && this.distToPlayer() > 80 && this.distToPlayer() < 420) {
          this.spat = true;
          this.gs.spawnSpit(this.x, this.floorY - 64, p.x, p.y - 30);
        }
        if (this.stateT > 1.9) {
          this.mode = 'sink';
          this.stateT = 0;
          Sound.play('burrow', this.pan());
        }
        break;
      }
      case 'sink': {
        const k = 1 - Math.min(1, this.stateT / 0.3);
        this.showFrac(k);
        if (k <= 0) {
          this.mode = 'under';
          this.stateT = 0;
          this.cd = 1.3;
          this.setVisible(false);
        }
        break;
      }
    }
    this.contactDamage = this.mode === 'up' || this.mode === 'rise' ? 1 : 0;
    this.body.enable = this.mode !== 'under';
    if (this.body.enable) this.body.reset(this.x, this.y);
  }
  private showFrac(k: number) {
    const fh = 176;
    const hidden = (1 - k) * fh;
    this.setCrop(0, 0, 128, fh - hidden + 1);
    this.y = this.floorY + hidden * 0.5 + 4;
  }
  die() {
    this.mound.destroy();
    super.die();
  }
}

// ---------------------------------------------------------------- GUARDIAN (+ BOSS)
/** Massive armoured protector. Slams the ground (shockwaves), charges, and exposes its core after attacks. */
export class Guardian extends Enemy {
  kind: EnemyKind = 'guardian';
  mode: 'patrol' | 'chase' | 'windup' | 'slam' | 'open' | 'roar' | 'charge' | 'lured' | 'intro' = 'patrol';
  facing = -1;
  minX: number;
  maxX: number;
  sc: number;
  key: string;
  coreOpen = false;
  attackCd = 1.5;
  aggro = false;
  isBoss: boolean;
  phase = 1;
  private stepT = 0;
  private chargeHit = false;
  private spitT = 0;
  private spitTargets: { x: number; y: number }[] | null = null;
  constructor(gs: GameScene, x: number, y: number, boss: boolean, bounds: [number, number], tex?: string) {
    super(gs, x, y, tex ?? (boss ? 'heartguard' : 'guardian'));
    this.isBoss = boss;
    this.kind = boss ? 'boss' : 'guardian';
    this.key = tex ?? (boss ? 'heartguard' : 'guardian');
    this.hp = this.maxHp = boss ? 36 : tex === 'keeper' ? 22 : 16;
    this.sc = boss ? 0.62 : tex === 'keeper' ? 0.56 : 0.5;
    this.setScale(this.sc).setOrigin(0.5, 236 / 240);
    this.setDepth(DEPTH.enemies + 1);
    this.body.setSize(200, 150).setOffset(50, 84);
    this.body.setMaxVelocity(420, 900);
    this.body.pushable = false;
    this.contactDamage = boss ? 2 : 1;
    this.minX = bounds[0];
    this.maxX = bounds[1];
    this.play(this.key + '-walk');
    if (boss) this.mode = 'intro';
  }
  corePos() {
    return { x: this.x + 54 * this.sc * this.facing, y: this.y - 82 * this.sc };
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.stateT += dt;
    this.attackCd -= dt;
    const p = this.player;
    const d = Math.abs(p.x - this.x);
    const body = this.body;
    const lure = this.isBoss ? null : this.lure(560);
    if (this.isBoss) {
      const f = this.hp / this.maxHp;
      const np = f < 0.33 ? 3 : f < 0.66 ? 2 : 1;
      if (np !== this.phase) {
        this.phase = np;
        this.gs.onBossPhase(np);
        this.setMode('roar');
      }
    }
    const speedMul = this.isBoss ? (this.phase === 3 ? 1.5 : this.phase === 2 ? 1.25 : 1) : 1;
    if (this.mode === 'intro') {
      body.setVelocityX(0);
      return;
    }
    if (!this.aggro && (d < 300 && Math.abs(p.y - this.y) < 160 && !p.hidden)) {
      this.aggro = true;
    }
    if (lure && this.mode !== 'windup' && this.mode !== 'slam' && this.mode !== 'charge' && this.mode !== 'open' && this.mode !== 'roar') {
      this.mode = 'lured';
    }
    switch (this.mode) {
      case 'patrol':
      case 'chase': {
        let target = this.mode === 'patrol' || !this.aggro ? (this.facing > 0 ? this.maxX : this.minX) : p.x;
        if (this.aggro) this.mode = 'chase';
        if (Math.abs(target - this.x) < 12) {
          if (this.mode === 'patrol') this.facing = -this.facing;
          target = this.x;
        }
        const dir = Math.sign(target - this.x);
        if (dir) this.facing = dir;
        const sp = (this.mode === 'chase' ? 95 : 55) * speedMul;
        body.setVelocityX(dir * sp);
        if (this.x <= this.minX && dir < 0) body.setVelocityX(0);
        if (this.x >= this.maxX && dir > 0) body.setVelocityX(0);
        if (this.anims.currentAnim?.key !== this.key + '-walk') this.play(this.key + '-walk');
        this.anims.timeScale = Math.abs(body.velocity.x) / 70 + 0.3;
        this.stepT -= dt;
        if (this.stepT < 0 && Math.abs(body.velocity.x) > 10) {
          this.stepT = 0.42;
          this.gs.fx.shake(0.0025, 80);
          this.gs.fx.dust(this.x + this.facing * 30, this.y, 4);
          Sound.play('land', this.pan());
        }
        if (this.mode === 'chase' && this.attackCd <= 0 && !p.hidden) {
          if (d < 190) this.setMode('windup');
          else if (d > 230 && d < 620) this.setMode('roar');
        }
        if (this.mode === 'chase' && p.hidden && !this.isBoss) {
          this.aggro = false;
          this.mode = 'patrol';
        }
        if (this.isBoss && this.phase >= 2) {
          this.spitT -= dt;
          // telegraph: glow at the mouth and red rings where the spores will land
          if (this.spitT < 0.7 && !this.spitTargets) {
            this.spitTargets = [-1, 0, 1].map((i) => ({ x: p.x + i * 70, y: p.y }));
            this.gs.fx.chargeFlash(this.x + this.facing * 60, this.y - 100, 0xb0ff6a, this.gs.bossMs(0.7));
            for (const tg of this.spitTargets) this.gs.fx.warnCircle(tg.x, tg.y, 26, this.gs.bossMs(0.7) + 600, 0xb0ff6a);
            Sound.play('warn', this.pan());
          }
          if (this.spitT < 0) {
            this.spitT = this.phase === 3 ? 2.6 : 3.6;
            for (const tg of this.spitTargets ?? []) this.gs.spawnSpit(this.x + this.facing * 60, this.y - 100, tg.x, tg.y - 30);
            this.spitTargets = null;
            Sound.play('spore', this.pan());
          }
        }
        break;
      }
      case 'lured': {
        const pip = this.gs.pip;
        if (!pip.luring) {
          this.mode = 'patrol';
          break;
        }
        const dir = Math.sign(pip.x - this.x);
        if (dir) this.facing = dir;
        const can = (dir < 0 && this.x > this.minX - 200) || (dir > 0 && this.x < this.maxX + 200);
        body.setVelocityX(Math.abs(pip.x - this.x) > 30 && can ? dir * 80 : 0);
        this.anims.timeScale = Math.abs(body.velocity.x) / 70 + 0.3;
        if (d < 70 && !p.hidden) {
          this.aggro = true;
          this.mode = 'chase';
        }
        break;
      }
      case 'windup':
        body.setVelocityX(0);
        if (this.stateT > (this.isBoss ? 0.8 : 0.55) / speedMul) {
          this.setMode('slam');
        }
        break;
      case 'slam':
        if (this.stateT < 0.05) break;
        if (!this.anims.isPlaying || this.stateT > 0.5) {
          this.gs.fx.shake(0.02, 300);
          Sound.play('slam', this.pan());
          this.gs.fx.dust(this.x + this.facing * 50, this.y, 18);
          this.gs.spawnShockwave(this.x + this.facing * 40, this.y, this.facing);
          this.gs.spawnShockwave(this.x - this.facing * 40, this.y, -this.facing);
          if (this.isBoss) this.gs.dropStalactites(this.x, 2);
          this.setMode('open');
        }
        break;
      case 'open':
        body.setVelocityX(0);
        if (this.stateT > (this.isBoss ? 2.0 : 1.8)) {
          this.coreOpen = false;
          this.setFrame(0);
          this.setMode('chase');
          this.attackCd = this.isBoss ? 1.2 : 2;
        }
        break;
      case 'roar':
        body.setVelocityX(0);
        if (this.stateT > (this.isBoss ? 1.0 : 0.75)) this.setMode('charge');
        break;
      case 'charge': {
        body.setVelocityX(this.facing * 360 * speedMul);
        this.anims.timeScale = 2.4;
        this.stepT -= dt;
        if (this.stepT < 0) {
          this.stepT = 0.18;
          this.gs.fx.dust(this.x - this.facing * 40, this.y, 3);
          this.gs.fx.shake(0.004, 60);
        }
        const hitWall = body.blocked.left || body.blocked.right || this.x < this.minX - 40 || this.x > this.maxX + 40;
        if (!this.chargeHit && Math.abs(p.x - this.x) < 80 && Math.abs(p.y - this.y) < 100) {
          this.chargeHit = true;
          p.hurt(2, this.x);
        }
        if (hitWall || this.stateT > 1.4) {
          if (hitWall) {
            this.gs.fx.shake(0.015, 250);
            Sound.play('slam', this.pan());
            if (this.isBoss) this.gs.dropStalactites(this.x, 1);
            this.setMode('open');
          } else this.setMode('chase');
          body.setVelocityX(0);
          this.attackCd = 1.6;
        }
        break;
      }
    }
    this.setFlipX(this.facing < 0);
  }
  setMode(m: Guardian['mode']) {
    this.mode = m;
    this.stateT = 0;
    // the core is only open while it is stunned after a slam or a crash
    if (m !== 'open') this.coreOpen = false;
    this.anims.timeScale = 1;
    if (m === 'windup' || m === 'slam') {
      if (m === 'windup') {
        this.play(this.key + '-slam');
        if (this.isBoss) {
          // the slam sends shockwaves both ways along the floor: jump them
          const sp = this.phase === 3 ? 1.5 : this.phase === 2 ? 1.25 : 1;
          const ms = this.gs.bossMs(0.8 / sp) + 300;
          this.gs.fx.warnFloor(this.x + 40, this.x + 470, this.y, ms);
          this.gs.fx.warnFloor(this.x - 40, this.x - 470, this.y, ms);
          this.gs.fx.alert(this.x, this.y - 170);
          Sound.play('warn', this.pan());
        }
      }
    }
    if (m === 'open') {
      this.coreOpen = true;
      this.play(this.key + '-open');
      Sound.play('core', this.pan());
    }
    if (m === 'roar') {
      this.play(this.key + '-roar');
      Sound.play('roar', this.pan());
      this.gs.fx.shake(0.008, 500);
      if (this.isBoss) {
        // a charge follows the roar: mark its lane toward Elias
        this.facing = Math.sign(this.player.x - this.x) || this.facing;
        const end = this.facing > 0 ? this.maxX + 60 : this.minX - 60;
        this.gs.fx.warnLane(this.x + this.facing * 60, end, this.y, 120, this.gs.bossMs(this.isBoss ? 1.0 : 0.75));
      }
    }
    if (m === 'charge') {
      this.play(this.key + '-walk');
      this.chargeHit = false;
      // the boss keeps the direction it announced; ordinary guardians aim at Elias
      if (!this.isBoss) this.facing = Math.sign(this.player.x - this.x) || this.facing;
    }
  }
  vulnerable() {
    return this.alive && this.mode !== 'intro';
  }
  hit(dmg: number, srcX: number, big: boolean, bx = 0, by = 0) {
    if (!this.alive || this.mode === 'intro') return false;
    const c = this.corePos();
    const onCore = this.coreOpen && Phaser.Math.Distance.Between(bx, by, c.x, c.y) < 60 * this.sc + 14;
    this.aggro = true;
    if (this.mode === 'lured' || this.mode === 'patrol') this.mode = 'chase';
    if (onCore) {
      super.hit(big ? dmg + 2 : dmg + 1, srcX, big, bx, by);
      this.gs.fx.coreHit(c.x, c.y);
      return true;
    }
    // armour: sparks, chip damage only from charged blasts
    Sound.play('hit', this.pan());
    this.gs.fx.armorSparks(bx, by);
    if (big) {
      this.hp -= 1;
      this.flashT = 0.06;
      this.setTintFill(0xffe0c0);
      if (this.hp <= 0) this.die();
    }
    return true;
  }
  beginFight() {
    this.mode = 'chase';
    this.aggro = true;
    this.attackCd = 1.5;
  }
  roar() {
    this.setMode('roar');
  }
  /** A falling stalactite struck the boss. */
  crushed() {
    if (!this.alive) return;
    this.hp -= 4;
    this.flashT = 0.12;
    this.setTintFill(0xffffff);
    Sound.play('enemyHit', this.pan());
    this.gs.fx.shake(0.012, 200);
    if (this.hp <= 0) this.die();
    else this.setMode('open');
  }
  die() {
    if (this.isBoss) {
      this.alive = false;
      this.body.enable = false;
      this.gs.onBossDefeated(this);
      return;
    }
    super.die();
  }
}

// ---------------------------------------------------------------- SENTRY DRONE
/** Hovering machine: patrols, locks on with a visible laser sight, then fires a three-shot burst. */
export class Drone extends Enemy {
  kind: EnemyKind = 'drone';
  home: Phaser.Math.Vector2;
  mode: 'patrol' | 'aim' | 'fire' | 'stun' = 'patrol';
  t = Math.random() * 10;
  cd = 1;
  shots = 0;
  sight: Phaser.GameObjects.Graphics;
  aimX = 0;
  aimY = 0;
  constructor(gs: GameScene, x: number, y: number) {
    super(gs, x, y - 48, 'drone');
    this.hp = this.maxHp = 3;
    this.setScale(0.5);
    this.play('drone-fly');
    this.body.setAllowGravity(false);
    this.body.setSize(50, 40).setOffset(23, 20);
    this.home = new Phaser.Math.Vector2(this.x, this.y);
    this.sight = gs.add.graphics().setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.t += dt;
    this.stateT += dt;
    this.cd -= dt;
    const p = this.player;
    const lure = this.lure(460);
    let tx = this.home.x + Math.sin(this.t * 0.6) * 110, ty = this.home.y + Math.sin(this.t * 1.9) * 10;
    this.sight.clear();
    switch (this.mode) {
      case 'patrol':
        if (lure) { tx = lure.x; ty = lure.y - 20; }
        else if (this.cd <= 0 && this.sees(540, this.y)) {
          this.mode = 'aim';
          this.stateT = 0;
          Sound.play('chargeReady', this.pan());
        }
        break;
      case 'aim': {
        tx = this.x; ty = this.y;
        this.aimX = Phaser.Math.Linear(this.aimX || p.x, p.x, 0.15);
        this.aimY = Phaser.Math.Linear(this.aimY || p.y - 30, p.y - 30, 0.15);
        const a = Math.min(1, this.stateT / 0.75);
        this.sight.lineStyle(1 + a * 2, 0xd07aff, 0.35 + a * 0.5);
        this.sight.lineBetween(this.x, this.y + 8, this.aimX, this.aimY);
        if (this.stateT > 0.8) { this.mode = 'fire'; this.stateT = 0; this.shots = 0; }
        if (lure) this.mode = 'patrol';
        break;
      }
      case 'fire':
        tx = this.x; ty = this.y;
        if (this.stateT > this.shots * 0.16) {
          const ang = Math.atan2(this.aimY - this.y, this.aimX - this.x) + (this.shots - 1) * 0.06;
          this.gs.spawnShot(this.x + Math.cos(ang) * 14, this.y + 8 + Math.sin(ang) * 14, Math.cos(ang) * 380, Math.sin(ang) * 380);
          Sound.play('shoot', this.pan());
          this.shots++;
        }
        if (this.shots >= 3) { this.mode = 'patrol'; this.cd = 2.2; this.aimX = 0; }
        break;
      case 'stun':
        tx = this.x; ty = this.y;
        if (this.stateT > 0.5) this.mode = 'patrol';
        break;
    }
    const sp = this.mode === 'stun' ? 0 : lure ? 120 : 70;
    const dx = tx - this.x, dy = ty - this.y, d = Math.max(1, Math.hypot(dx, dy));
    this.body.setVelocity(d > 4 ? (dx / d) * Math.min(sp, d * 3) : 0, d > 4 ? (dy / d) * Math.min(sp, d * 3) : 0);
    this.setFlipX(p.x < this.x);
    this.rotation = Phaser.Math.Clamp(this.body.velocity.x * 0.002, -0.25, 0.25);
  }
  hit(dmg: number, srcX: number, big: boolean) {
    const r = super.hit(dmg, srcX, big);
    if (this.alive) { this.mode = 'stun'; this.stateT = 0; this.sight.clear(); }
    return r;
  }
  die() {
    this.sight.destroy();
    super.die();
    this.body.setAllowGravity(true);
  }
}

// ---------------------------------------------------------------- THE IRON WARDEN (Chapter II boss)
/**
 * A hovering war-machine. Drops bombs, sweeps the arena with telegraphed laser columns, and dives
 * to slam the floor — after a slam it is stuck and overheated, its core exposed.
 */
export class Warden extends Enemy {
  kind: EnemyKind = 'boss';
  mode: 'intro' | 'hover' | 'bombs' | 'laser' | 'dive' | 'stuck' | 'rise' | 'roar' = 'intro';
  phase = 1;
  coreOpen = false;
  minX: number;
  maxX: number;
  floorY: number;
  hoverY: number;
  sc = 0.62;
  cd = 2;
  count = 0;
  next: 'bombs' | 'laser' | 'dive' = 'bombs';
  private diveX: number | null = null;
  beam: Phaser.GameObjects.Graphics;
  laserX = 0;
  constructor(gs: GameScene, x: number, y: number, bounds: [number, number]) {
    super(gs, x, y - 230, 'warden');
    this.hp = this.maxHp = 46;
    this.minX = bounds[0];
    this.maxX = bounds[1];
    this.floorY = y;
    this.hoverY = y - 250;
    this.setScale(this.sc).setDepth(DEPTH.enemies + 1);
    this.play('warden-hover');
    this.body.setAllowGravity(false);
    this.body.setSize(240, 170).setOffset(60, 45);
    this.body.pushable = false;
    this.contactDamage = 2;
    this.beam = gs.add.graphics().setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
  }
  corePos() {
    return { x: this.x, y: this.y + (124 - 150) * this.sc };
  }
  beginFight() {
    this.setMode('hover');
    this.cd = 1.2;
  }
  roar() {
    this.setMode('roar');
  }
  setMode(m: Warden['mode']) {
    if (m === 'dive') this.diveX = null;
    this.mode = m;
    this.stateT = 0;
    this.count = 0;
    this.beam.clear();
    if (m === 'roar') {
      Sound.play('roar', this.pan());
      this.gs.fx.shake(0.01, 600);
      this.play('warden-charge');
    }
    if (m === 'stuck') {
      this.coreOpen = true;
      this.play('warden-open');
      Sound.play('core', this.pan());
    } else if (m !== 'roar') {
      this.coreOpen = false;
      if (m === 'laser') this.play('warden-charge');
      else this.play('warden-hover', true);
    }
  }
  vulnerable() {
    return this.alive && this.mode !== 'intro';
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.stateT += dt;
    const f = this.hp / this.maxHp;
    const np = f < 0.33 ? 3 : f < 0.66 ? 2 : 1;
    if (np !== this.phase) {
      this.phase = np;
      this.gs.onBossPhase(np);
      this.setMode('roar');
    }
    const speed = this.phase === 3 ? 1.45 : this.phase === 2 ? 1.2 : 1;
    const p = this.player;
    const body = this.body;
    const bob = Math.sin(this.stateT * 3) * 6;
    const goX = (x: number, k: number) => body.setVelocityX(Phaser.Math.Clamp((Phaser.Math.Clamp(x, this.minX, this.maxX) - this.x) * k, -260 * speed, 260 * speed));
    const goY = (y: number, k: number) => body.setVelocityY(Phaser.Math.Clamp((y - this.y) * k, -300, 600));
    this.beam.clear();
    switch (this.mode) {
      case 'intro':
        body.setVelocity(0, 0);
        return;
      case 'roar':
        body.setVelocity(0, 0);
        if (this.stateT > 1) this.setMode('hover');
        break;
      case 'hover':
        goX(p.x, 1.2);
        goY(this.hoverY + bob, 3);
        this.cd -= dt * speed;
        if (this.cd <= 0) {
          this.setMode(this.next);
          this.next = this.next === 'bombs' ? 'laser' : this.next === 'laser' ? 'dive' : 'bombs';
        }
        break;
      case 'bombs': {
        // sweep across the arena dropping bombs
        const target = this.count % 2 === 0 ? this.maxX : this.minX;
        goX(target, 1.6);
        goY(this.hoverY + bob, 3);
        if (this.stateT > 0.35) {
          this.stateT = 0;
          this.gs.spawnBomb(this.x + (Math.random() - 0.5) * 60, this.y + 40);
          this.count++;
        }
        if (this.count >= 6 + this.phase * 2) { this.setMode('hover'); this.cd = 1.4; }
        break;
      }
      case 'laser': {
        goY(this.hoverY - 20 + bob, 3);
        const shots = this.phase === 3 ? 5 : 3;
        const tele = 0.85 / speed;
        if (this.stateT < 0.05) this.laserX = p.x;
        if (this.stateT < tele) {
          goX(this.laserX, 0.8);
          this.laserX = Phaser.Math.Linear(this.laserX, p.x, 0.04);
          const a = this.stateT / tele;
          this.beam.lineStyle(2 + a * 4, 0xd07aff, 0.25 + a * 0.4);
          this.beam.lineBetween(this.laserX, this.y + 20, this.laserX, this.floorY);
        } else if (this.stateT < tele + 0.35) {
          body.setVelocityX(0);
          if (this.stateT - dt < tele) { Sound.play('chargeShot', this.pan()); this.gs.fx.shake(0.008, 200); this.gs.fx.dust(this.laserX, this.floorY, 10); }
          this.beam.lineStyle(26, 0xb05aff, 0.45);
          this.beam.lineBetween(this.laserX, this.y + 20, this.laserX, this.floorY);
          this.beam.lineStyle(8, 0xf4e8ff, 0.95);
          this.beam.lineBetween(this.laserX, this.y + 20, this.laserX, this.floorY);
          const pb = p.body;
          if (Math.abs(pb.center.x - this.laserX) < 18 && pb.bottom > this.y) p.hurt(1, this.laserX);
        } else {
          this.count++;
          this.stateT = 0;
          if (this.count >= shots) { this.setMode('hover'); this.cd = 1.3; }
        }
        break;
      }
      case 'dive':
        if (this.diveX === null) {
          this.diveX = Phaser.Math.Clamp(p.x, this.minX, this.maxX);
          const ms = this.gs.bossMs(0.95) + 250;
          this.gs.fx.warnFloor(this.diveX - 90, this.diveX + 90, this.floorY, ms);
          this.gs.fx.warnFloor(this.diveX + 90, this.diveX + 420, this.floorY, ms, 0xff8a3a);
          this.gs.fx.warnFloor(this.diveX - 90, this.diveX - 420, this.floorY, ms, 0xff8a3a);
          Sound.play('warn', this.pan());
        }
        if (this.stateT < 0.95) {
          goX(this.diveX ?? p.x, 2);
          goY(this.hoverY - 40, 3);
        } else {
          body.setVelocityX(0);
          body.setVelocityY(700);
          if (this.y >= this.floorY - 64) {
            this.y = this.floorY - 64;
            body.setVelocity(0, 0);
            this.gs.fx.shake(0.025, 400);
            Sound.play('slam', this.pan());
            this.gs.fx.dust(this.x, this.floorY, 22);
            this.gs.spawnShockwave(this.x + 60, this.floorY, 1);
            this.gs.spawnShockwave(this.x - 60, this.floorY, -1);
            this.diveX = null;
            this.setMode('stuck');
          }
        }
        break;
      case 'stuck':
        body.setVelocity(0, 0);
        if (Math.random() < 0.3) this.gs.fx.sparkE.explode(1, this.x + (Math.random() - 0.5) * 120, this.y + 20);
        if (this.stateT > 2.6) this.setMode('rise');
        break;
      case 'rise':
        goY(this.hoverY, 2.5);
        body.setVelocityX(0);
        if (Math.abs(this.y - this.hoverY) < 12 || this.stateT > 1.5) { this.setMode('hover'); this.cd = 1.6 / speed; }
        break;
    }
  }
  hit(dmg: number, srcX: number, big: boolean, bx = 0, by = 0) {
    if (!this.alive || this.mode === 'intro') return false;
    const c = this.corePos();
    if (this.coreOpen) {
      // grounded and overheated: every hit gets through its open vents
      super.hit(big ? dmg + 2 : dmg + 1, srcX, big, bx, by);
      this.gs.fx.coreHit(c.x, c.y);
      return true;
    }
    Sound.play('hit', this.pan());
    this.gs.fx.armorSparks(bx, by);
    if (big) {
      this.hp -= 1;
      this.flashT = 0.06;
      this.setTintFill(0xffe0c0);
      if (this.hp <= 0) this.die();
    }
    return true;
  }
  die() {
    this.alive = false;
    this.beam.destroy();
    this.body.enable = false;
    this.gs.onBossDefeated(this);
  }
}

// ---------------------------------------------------------------- Chapter III enemies
/** Ombra Velata: a stalker wrapped in shadow veils that splits into two small shades. */
export class VeiledShade extends Stalker {
  constructor(gs: GameScene, x: number, y: number, small = false) {
    super(gs, x, y);
    this.veiled = !small;
    this.small = small;
    this.setTint(0xb08aff);
    if (small) {
      this.setScale(0.34);
      this.hp = this.maxHp = 1;
    }
  }
  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt);
    if (this.flashT <= 0) this.setTint(0xb08aff);
  }
  die() {
    if (this.veiled) {
      this.gs.fx.smokeWisp(this.x, this.y);
      for (const s of [-1, 1]) this.gs.spawnEnemy(new VeiledShade(this.gs, this.x + s * 30, this.y + 40, true));
    }
    super.die();
  }
}

/** Fungo Mimo: looks like a bounce cap, bites whoever comes close or lands on it. */
export class Mimic extends Enemy {
  kind: EnemyKind = 'mimic';
  mode: 'wait' | 'bite' | 'rest' = 'wait';
  bit = false;
  constructor(gs: GameScene, x: number, y: number) {
    super(gs, x, y + 1, 'mimic');
    this.hp = this.maxHp = 2;
    this.setScale(0.5 * 1.3).setOrigin(0.5, 1);
    this.body.setAllowGravity(false);
    this.body.moves = false;
    this.body.setSize(80, 44).setOffset(8, 30);
    this.contactDamage = 0;
    this.play('mimic-idle');
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.stateT += dt;
    const p = this.player.body;
    const dx = Math.abs(p.center.x - this.x), dy = this.y - p.bottom;
    switch (this.mode) {
      case 'wait':
        if (dx < 56 && dy > -10 && dy < 70) {
          this.mode = 'bite';
          this.stateT = 0;
          this.bit = false;
          this.play('mimic-bite');
          Sound.play('crawler', this.pan());
        }
        break;
      case 'bite':
        if (!this.bit && this.stateT > 0.16) {
          this.bit = true;
          if (Math.abs(p.center.x - this.x) < 46 && this.y - p.bottom < 60 && this.y - p.bottom > -12) {
            this.player.hurt(1, this.x);
            if (this.player.body.velocity.y > 0) this.player.body.setVelocityY(-380);
          }
        }
        if (this.stateT > 0.7) { this.mode = 'rest'; this.stateT = 0; this.play('mimic-idle'); }
        break;
      case 'rest':
        if (this.stateT > 1.1) this.mode = 'wait';
        break;
    }
  }
}

/**
 * L'Ombra Prima. Untouchable in darkness: only lantern light — or, from phase 2, the golden light of
 * the past seen through Pip's Echo — makes it solid. Snuffs lanterns, spawns veiled shades, eats light.
 */
export class ShadowBoss extends Enemy {
  kind: EnemyKind = 'boss';
  mode: 'intro' | 'drift' | 'windup' | 'lunge' | 'roar' = 'intro';
  private orbWarned = false;
  private lungeTo: { x: number; y: number } | null = null;
  phase = 1;
  coreOpen = false;
  vx = 0;
  vy = 0;
  orbT = 2;
  snuffT = 7;
  lungeCd = 2;
  warned = false;
  minX: number;
  maxX: number;
  constructor(gs: GameScene, x: number, y: number, bounds: [number, number]) {
    super(gs, x, y - 200, 'ombra');
    this.hp = this.maxHp = 40;
    this.minX = bounds[0];
    this.maxX = bounds[1];
    this.setScale(0.62).setDepth(DEPTH.enemies + 1);
    this.play('ombra-drift');
    this.body.setAllowGravity(false);
    this.body.setSize(220, 200).setOffset(70, 60);
    this.contactDamage = 2;
    this.setAlpha(0.8);
    this.eyes = gs.add.image(x, y, 'glow').setTint(0xc87aff).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setAlpha(0.7).setDepth(DEPTH.glow);
  }
  eyes: Phaser.GameObjects.Image;
  preUpdate(t: number, d: number) {
    super.preUpdate(t, d);
    this.eyes?.setPosition(this.x, this.y - 30).setAlpha(this.alive ? (this.coreOpen ? 0.95 : 0.6) : 0);
    if (this.mode !== 'windup') this.eyes?.setTint(this.coreOpen ? 0xffd27a : 0xc87aff);
  }
  corePos() {
    return { x: this.x, y: this.y - 20 };
  }
  beginFight() { this.mode = 'drift'; }
  roar() {
    this.mode = 'roar';
    this.stateT = 0;
    this.play('ombra-lunge');
    Sound.play('stalker', this.pan());
    Sound.play('roar', this.pan());
    this.gs.fx.shake(0.01, 700);
  }
  /** Is the shadow currently made solid by light? */
  exposed() {
    if (this.gs.lanternLightAt(this.x, this.y) > 0.25) return true;
    return this.phase >= 2 && this.gs.past;
  }
  vulnerable() {
    return this.alive && this.mode !== 'intro';
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.stateT += dt;
    const f = this.hp / this.maxHp;
    const np = f < 0.33 ? 3 : f < 0.66 ? 2 : 1;
    if (np !== this.phase) {
      this.phase = np;
      this.gs.onBossPhase(np);
      this.roar();
    }
    this.coreOpen = this.exposed();
    this.setAlpha(this.flashT > 0 ? 1 : this.coreOpen ? 1 : 0.62 + Math.sin(this.stateT * 3) * 0.08);
    const p = this.player;
    const sp = this.phase === 3 ? 125 : this.phase === 2 ? 105 : 85;
    let tx = Phaser.Math.Clamp(p.x, this.minX, this.maxX), ty = p.y - 150 + Math.sin(this.stateT * 1.3) * 30;
    switch (this.mode) {
      case 'intro':
        this.body.setVelocity(0, 0);
        return;
      case 'roar':
        tx = this.x; ty = this.y;
        if (this.stateT > 1.1) { this.mode = 'drift'; this.play('ombra-drift'); }
        break;
      case 'drift': {
        this.lungeCd -= dt;
        this.orbT -= dt;
        this.snuffT -= dt;
        if (this.orbT < 0.6 && !this.orbWarned) {
          this.orbWarned = true;
          this.gs.fx.chargeFlash(this.x, this.y - 10, 0xc87aff, this.gs.bossMs(0.6));
          Sound.play('warn', this.pan());
        }
        if (this.orbT <= 0) {
          this.orbT = this.phase === 3 ? 2.6 : 3.4;
          this.orbWarned = false;
          for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(p.y - 30 - this.y, p.x - this.x) + i * 0.25;
            this.gs.spawnShot(this.x + Math.cos(a) * 40, this.y + Math.sin(a) * 40, Math.cos(a) * 260, Math.sin(a) * 260);
          }
          Sound.play('stalker', this.pan());
        }
        if (this.phase >= 2 && this.snuffT <= 0) {
          this.snuffT = this.phase === 3 ? 6 : 9;
          this.gs.snuffLanterns();
          this.gs.spawnShadesAround(this.x, this.y);
        }
        if (this.lungeCd <= 0 && this.distToPlayer() < 230) {
          // wind-up: it stops, its eyes flare red and a line shows where it will strike
          this.mode = 'windup';
          this.stateT = 0;
          this.play('ombra-lunge');
          Sound.play('warn', this.pan());
          this.lungeTo = { x: p.x, y: p.y - 30 };
          this.gs.fx.warnLine(this.x, this.y, this.x + (p.x - this.x) * 1.4, this.y + (p.y - 30 - this.y) * 1.4, this.gs.bossMs(0.55));
        }
        break;
      }
      case 'windup': {
        this.body.setVelocity(0, 0);
        this.eyes.setTint(0xff4a3a);
        if (this.stateT > 0.55) {
          this.mode = 'lunge';
          this.stateT = 0;
          Sound.play('stalker', this.pan());
          const t = this.lungeTo ?? { x: p.x, y: p.y - 30 };
          const d = Math.max(1, Math.hypot(t.x - this.x, t.y - this.y));
          this.vx = ((t.x - this.x) / d) * 430;
          this.vy = ((t.y - this.y) / d) * 430;
        }
        return;
      }
      case 'lunge':
        this.body.setVelocity(this.vx, this.vy);
        if (this.stateT > 0.45) {
          this.mode = 'drift';
          this.lungeCd = this.phase === 3 ? 1.8 : 2.8;
          this.play('ombra-drift');
        }
        this.setFlipX(this.vx < 0);
        return;
    }
    const dx = tx - this.x, dy = ty - this.y, d = Math.max(1, Math.hypot(dx, dy));
    this.vx = Phaser.Math.Linear(this.vx, (dx / d) * Math.min(sp, d * 2), Math.min(1, dt * 2));
    this.vy = Phaser.Math.Linear(this.vy, (dy / d) * Math.min(sp, d * 2), Math.min(1, dt * 2));
    this.body.setVelocity(this.vx, this.vy);
    this.setFlipX(p.x < this.x);
    if (Math.random() < 0.15) this.gs.fx.smokeWisp(this.x + (Math.random() - 0.5) * 100, this.y + 40);
  }
  hit(dmg: number, srcX: number, big: boolean, bx = 0, by = 0) {
    if (!this.alive || this.mode === 'intro') return false;
    if (!this.coreOpen) {
      // the bolt passes through living darkness
      this.gs.fx.smokeWisp(bx, by);
      if (!this.warned) {
        this.warned = true;
        this.gs.toast(this.phase >= 2 ? t('Only light can wound it — lanterns, or the light of the past') : t('It cannot be hurt in the dark — light the lanterns!'), 2600);
      }
      return false;
    }
    super.hit(big ? dmg + 1 : dmg, srcX, big, bx, by);
    return true;
  }
  die() {
    this.alive = false;
    this.body.enable = false;
    this.gs.tweens.add({ targets: this.eyes, alpha: 0, duration: 800, onComplete: () => this.eyes.destroy() });
    this.gs.onBossDefeated(this);
  }
}

// ---------------------------------------------------------------- Chapter IV
/** Lucimante: a jelly of sap-light that drifts toward Pip and stings on contact. */
export class Jelly extends Enemy {
  kind: EnemyKind = 'jelly';
  home: Phaser.Math.Vector2;
  t = Math.random() * 10;
  constructor(gs: GameScene, x: number, y: number) {
    super(gs, x, y - 40, 'jelly');
    this.hp = this.maxHp = 2;
    this.setScale(0.5).setAlpha(0.92);
    this.play('jelly-swim');
    this.body.setAllowGravity(false);
    this.body.setSize(60, 60).setOffset(18, 10);
    this.home = new Phaser.Math.Vector2(this.x, this.y);
    this.setBlendMode(Phaser.BlendModes.SCREEN);
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.t += dt;
    const pip = this.gs.pip;
    const dPip = Phaser.Math.Distance.Between(this.x, this.y, pip.x, pip.y);
    let tx = this.home.x + Math.sin(this.t * 0.5) * 50, ty = this.home.y + Math.sin(this.t * 1.1) * 30;
    let sp = 35;
    if (dPip < 300) { tx = pip.x; ty = pip.y + 20; sp = 70; }
    // pulsing swim
    sp *= 0.6 + Math.max(0, Math.sin(this.t * 4)) * 0.9;
    const dx = tx - this.x, dy = ty - this.y, d = Math.max(1, Math.hypot(dx, dy));
    this.body.setVelocity((dx / d) * sp, (dy / d) * sp);
  }
}

/**
 * Il Cuore d'Ombra — the First Shadow fused with the Seed.
 * Phase 1: purify the infected thread-nodes by hanging from them.
 * Phase 2: waves that exist in only one time (dodge with the Echo); after each volley the core tears open.
 * Phase 3: Elias is struck down — Pip gathers Seed motes to wake him, Ilse holds the core open for the last shot.
 */
export class ShadowHeart extends Enemy {
  kind: EnemyKind = 'boss';
  mode: 'intro' | 'p1' | 'p2' | 'open' | 'p3pip' | 'p3final' | 'roar' = 'intro';
  phase = 1;
  coreOpen = false;
  orbT = 2;
  waveT = 2;
  waves = 0;
  slamT = 4;
  beam: Phaser.GameObjects.Graphics;
  laserX = 0;
  laserT = -1;
  private orbWarned = false;
  constructor(gs: GameScene, x: number, y: number) {
    super(gs, x, y - 260, 'heartshadow');
    this.hp = this.maxHp = 90;
    this.setScale(0.6).setDepth(DEPTH.enemies - 1);
    this.play('heart-pulse');
    this.body.setAllowGravity(false);
    this.body.moves = false;
    this.body.setSize(200, 230).setOffset(90, 75);
    this.contactDamage = 1;
    this.beam = gs.add.graphics().setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
  }
  corePos() {
    return { x: this.x, y: this.y + 6 };
  }
  beginFight() {
    this.mode = 'p1';
    this.gs.infectNodes(3);
    this.gs.toast(t('Hang from the infected nodes with the Light Thread (F) to purify them'), 3200);
  }
  roar() {
    Sound.play('roar', this.pan());
    this.gs.fx.shake(0.012, 700);
  }
  vulnerable() {
    return this.alive && this.mode !== 'intro';
  }
  /** called by the scene when an infected node is purified */
  nodePurified() {
    this.hp -= 10;
    this.flashT = 0.15;
    this.setTintFill(0xffffff);
    this.gs.fx.coreHit(this.x, this.y);
    Sound.play('mechanism');
    if (this.mode === 'p1' && this.gs.darkNodes() === 0) {
      this.phase = 2;
      this.mode = 'p2';
      this.waves = 0;
      this.waveT = 2.5;
      this.roar();
      this.gs.onBossPhase(2);
    }
  }
  tick(dt: number) {
    if (!this.alive) return;
    this.stateT += dt;
    this.beam.clear();
    const p = this.player;
    this.y += Math.sin(this.stateT * 1.5) * 0.15;
    this.body.reset(this.x, this.y);
    if (this.mode === 'intro' || this.mode === 'p3pip') return;
    // common attacks while the core is shut
    if (this.mode === 'p1' || this.mode === 'p2') {
      this.orbT -= dt;
      if (this.orbT < 0.6 && !this.orbWarned) {
        this.orbWarned = true;
        this.gs.fx.chargeFlash(this.x, this.y, 0xb06aff, this.gs.bossMs(0.6));
        Sound.play('warn', this.pan());
      }
      if (this.orbT <= 0) {
        this.orbWarned = false;
        this.orbT = this.mode === 'p1' ? 3.4 : 4.2;
        for (let i = -2; i <= 2; i++) {
          const a = Math.atan2(p.y - 30 - this.y, p.x - this.x) + i * 0.22;
          this.gs.spawnShot(this.x + Math.cos(a) * 60, this.y + Math.sin(a) * 60, Math.cos(a) * 240, Math.sin(a) * 240);
        }
        Sound.play('stalker', this.pan());
      }
      // shadow column: telegraphed strike under Elias
      this.slamT -= dt;
      if (this.slamT <= 0 && this.laserT < 0) { this.laserT = 0; this.laserX = p.x; this.slamT = this.mode === 'p1' ? 4.5 : 6; }
      if (this.laserT >= 0) {
        this.laserT += dt;
        const floorY = this.gs.level.heightPx - 5 * 32;
        if (this.laserT < 0.9) {
          this.beam.lineStyle(2 + this.laserT * 6, 0xb06aff, 0.3 + this.laserT * 0.4);
          this.beam.lineBetween(this.laserX, 0, this.laserX, floorY);
        } else if (this.laserT < 1.25) {
          if (this.laserT - dt < 0.9) { Sound.play('slam', this.pan()); this.gs.fx.shake(0.01, 200); }
          this.beam.lineStyle(30, 0x6a2ad0, 0.5); this.beam.lineBetween(this.laserX, 0, this.laserX, floorY);
          this.beam.lineStyle(9, 0xf0e0ff, 0.9); this.beam.lineBetween(this.laserX, 0, this.laserX, floorY);
          if (Math.abs(p.body.center.x - this.laserX) < 20 && p.state !== 'cutscene') p.hurt(1, this.laserX);
        } else this.laserT = -1;
      }
    }
    if (this.mode === 'p2') {
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.waveT = 2.3;
        const past = Math.random() < 0.5;
        this.gs.spawnTimeWave(this.x, past);
        this.waves++;
        if (this.waves >= 4) {
          this.mode = 'open';
          this.stateT = 0;
          this.coreOpen = true;
          this.play('heart-open');
          Sound.play('core', this.pan());
          this.gs.toast(t('Its core is torn open — strike!'), 1600);
        }
      }
    }
    if (this.mode === 'open') {
      if (this.stateT > 6) {
        this.coreOpen = false;
        this.play('heart-pulse');
        this.mode = 'p2';
        this.waves = 0;
        this.waveT = 2;
      }
    }
    if (this.mode === 'p2' || this.mode === 'open') {
      if (this.hp <= this.maxHp * 0.3) {
        this.phase = 3;
        this.coreOpen = false;
        this.mode = 'p3pip';
        this.play('heart-pulse');
        this.gs.onBossPhase(3);
      }
    }
  }
  /** Retry after a fall: pick the fight up again at the phase Elias had reached. */
  resumeAt(phase: number) {
    this.gs.hooks.forEach((h) => h.setDark(false));
    this.phase = 2;
    this.mode = 'p2';
    this.waves = 0;
    this.waveT = 2.5;
    this.hp = phase >= 3 ? Math.floor(this.maxHp * 0.3) : this.maxHp - 30;
    this.gs.onBossPhase(2);
  }
  /** Ilse tears the core open for good. */
  holdOpen() {
    this.mode = 'p3final';
    this.coreOpen = true;
    this.play('heart-open');
  }
  hit(dmg: number, srcX: number, big: boolean, bx = 0, by = 0) {
    if (!this.alive || this.mode === 'intro') return false;
    if (!this.coreOpen) {
      this.gs.fx.smokeWisp(bx, by);
      return true;
    }
    super.hit(big ? dmg + 2 : dmg + 1, srcX, big, bx, by);
    this.gs.fx.coreHit(this.x, this.y);
    return true;
  }
  die() {
    this.alive = false;
    this.body.enable = false;
    this.beam.destroy();
    this.gs.onBossDefeated(this);
  }
}
