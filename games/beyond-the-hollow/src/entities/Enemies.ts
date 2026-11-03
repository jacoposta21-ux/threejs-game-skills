import Phaser from 'phaser';
import { DEPTH, TILE } from '../core/constants';
import { Sound } from '../core/Audio';
import type { GameScene } from '../scenes/GameScene';

export type EnemyKind = 'crawler' | 'stalker' | 'burrower' | 'guardian' | 'boss';

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
      if (this.chasing && this.pounceCd <= 0 && this.distToPlayer() < 130 && seen) this.pounce();
    } else {
      this.rotation *= 0.85;
      if (this.body.blocked.down && this.stateT > 0.1) this.land();
      this.stateT += dt;
      if (this.stateT > 2.5 || this.y > this.gs.level.heightPx + 50) this.die();
    }
  }
  private pounce() {
    this.mode = 'leap';
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
    return !L.solid(tx, ty) && L.solid(tx, ty + 1) && !L.hazardAtWorld(x, this.floorY - 4);
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
  constructor(gs: GameScene, x: number, y: number, boss: boolean, bounds: [number, number]) {
    super(gs, x, y, boss ? 'heartguard' : 'guardian');
    this.isBoss = boss;
    this.kind = boss ? 'boss' : 'guardian';
    this.key = boss ? 'heartguard' : 'guardian';
    this.hp = this.maxHp = boss ? 46 : 16;
    this.sc = boss ? 0.62 : 0.5;
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
          if (this.spitT < 0) {
            this.spitT = this.phase === 3 ? 2.2 : 3.4;
            for (let i = -1; i <= 1; i++) this.gs.spawnSpit(this.x + this.facing * 60, this.y - 100, p.x + i * 70, p.y - 30);
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
        if (this.stateT > 0.55 / speedMul) {
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
        if (this.stateT > 0.75) this.setMode('charge');
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
    this.anims.timeScale = 1;
    if (m === 'windup' || m === 'slam') {
      if (m === 'windup') this.play(this.key + '-slam');
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
    }
    if (m === 'charge') {
      this.play(this.key + '-walk');
      this.chargeHit = false;
      this.facing = Math.sign(this.player.x - this.x) || this.facing;
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
