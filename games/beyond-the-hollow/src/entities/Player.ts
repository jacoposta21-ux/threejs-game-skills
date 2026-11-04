import Phaser from 'phaser';
import { PHYS, TILE, DEPTH } from '../core/constants';
import { Sound } from '../core/Audio';
import type { GameScene } from '../scenes/GameScene';

export type PState = 'ground' | 'air' | 'climb' | 'ledge' | 'ledgeup' | 'swim' | 'hurt' | 'dead' | 'cutscene';

const BODY_W = 36, BODY_H = 88, CROUCH_H = 52, FEET = 152; // frame pixels (sprite is drawn at 2x)

/**
 * Elias. A finite state machine drives both physics behaviour and the animation that plays:
 * ground (idle/run/crouch/crawl/push/shoot) · air (jump/fall/djump) · climb · ledge · ledgeup · swim · hurt · dead · cutscene
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  state: PState = 'air';
  facing = 1;
  hp = 5;
  maxHp = 5;
  air = 1; // 0..1 breath
  invuln = 0;
  coyote = 0;
  jumpBuffer = 0;
  canDouble = false;
  usedDouble = false;
  crouching = false;
  hidden = false;
  inHideZone = false;
  pushing = false;
  charge = 0;
  charging = false;
  shootCooldown = 0;
  shootPose = 0;
  aimUp = false;
  dropThrough = 0;
  stateTime = 0;
  landLock = 0;
  airTime = 0;
  lastSafe = new Phaser.Math.Vector2();
  ledgeX = 0;
  ledgeY = 0;
  private stepTimer = 0;
  private breathTimer = 0;
  private wasInWater = false;
  private hazardCooldown = 0;
  private chargeReadyPlayed = false;
  private lastAnim = '';

  constructor(public gs: GameScene, x: number, y: number) {
    super(gs, x, y, 'elias', 0);
    gs.add.existing(this);
    gs.physics.add.existing(this);
    this.setScale(0.5).setOrigin(0.5, FEET / 160);
    this.setDepth(DEPTH.player);
    this.body.setSize(BODY_W, BODY_H).setOffset((128 - BODY_W) / 2, FEET - BODY_H);
    this.body.setMaxVelocity(600, 1400);
    this.body.pushable = false;
    this.body.setCollideWorldBounds(true);
    this.lastSafe.set(x, y);
  }

  get ctl() {
    return this.gs.controls;
  }
  get lvl() {
    return this.gs.level;
  }

  setPState(s: PState) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.stateTime = 0;
    this.body.setAllowGravity(!(s === 'climb' || s === 'ledge' || s === 'ledgeup' || s === 'swim' || s === 'cutscene'));
    if (s === 'ground' && prev === 'air' && this.airTime > 0.32) {
      this.landLock = 0.09;
      this.gs.fx.dust(this.x, this.body.bottom, 8);
      Sound.play('land');
      this.gs.tweens.add({ targets: this, scaleX: 0.56, scaleY: 0.44, duration: 70, yoyo: true, ease: 'Quad.out' });
    }
  }

  setCrouch(c: boolean) {
    if (c === this.crouching) return;
    if (!c && this.ceilingAbove()) return; // can't stand up under a low ceiling
    this.crouching = c;
    const h = c ? CROUCH_H : BODY_H;
    const bottom = this.body.bottom;
    this.body.setSize(BODY_W, h).setOffset((128 - BODY_W) / 2, FEET - h);
    this.body.y = bottom - this.body.height;
  }

  private ceilingAbove() {
    const top = this.body.bottom - BODY_H / 2 - 2; // where a standing head would be
    return this.lvl.solidAtWorld(this.body.left + 2, top) || this.lvl.solidAtWorld(this.body.right - 2, top);
  }

  hurt(dmg: number, fromX: number, opts: { respawn?: boolean; force?: boolean } = {}) {
    if (this.state === 'dead' || this.state === 'cutscene') return;
    if (this.invuln > 0 && !opts.force) return;
    this.hp -= dmg;
    this.invuln = 1.3;
    Sound.play('hurt');
    this.gs.fx.shake(0.012, 220);
    this.gs.fx.hitstop(70);
    this.gs.fx.flashScreen(0x8a1020, 0.25);
    this.charging = false;
    Sound.stopCharge();
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (opts.respawn) {
      this.gs.respawnAtSafe();
      return;
    }
    this.setCrouch(false);
    this.setPState('hurt');
    const dir = Math.sign(this.x - fromX) || -this.facing;
    this.body.setVelocity(dir * 230, -320);
    this.body.setAllowGravity(true);
  }

  die() {
    this.hp = 0;
    this.setPState('dead');
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(true);
    this.play('elias-death', true);
    Sound.play('death');
    this.gs.onPlayerDeath();
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  update(dt: number) {
    const ctl = this.ctl;
    this.stateTime += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.shootPose = Math.max(0, this.shootPose - dt);
    this.landLock = Math.max(0, this.landLock - dt);
    this.dropThrough = Math.max(0, this.dropThrough - dt);
    this.hazardCooldown = Math.max(0, this.hazardCooldown - dt);
    this.setAlpha(this.invuln > 0 && this.state !== 'dead' ? (Math.floor(this.invuln * 14) % 2 ? 0.35 : 1) : this.hidden ? 0.45 : 1);
    this.setTint(this.hidden ? 0x7080a0 : 0xffffff);
    if (this.state === 'dead' || this.state === 'cutscene') {
      if (this.state === 'cutscene') this.animate();
      return;
    }

    const body = this.body;
    if (body.velocity.y > PHYS.maxFall) body.velocity.y = PHYS.maxFall; // cap falling only (bounces may exceed it upward)
    const onFloor = body.blocked.down || body.touching.down;
    const cx = body.center.x;
    const inWater = this.lvl.waterAtWorld(cx, body.center.y);
    const headInWater = this.lvl.waterAtWorld(cx, body.top + 4);

    // water transitions
    if (inWater && this.state !== 'swim' && this.state !== 'hurt') {
      this.setCrouch(false);
      this.setPState('swim');
      if (!this.wasInWater) {
        Sound.play('splash');
        this.gs.fx.splash(cx, body.center.y);
        body.velocity.y *= 0.35;
      }
    }
    this.wasInWater = inWater;

    // jump buffering
    if (ctl.pressed.jump) this.jumpBuffer = PHYS.jumpBuffer;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    switch (this.state) {
      case 'ground':
      case 'air':
        this.updateMove(dt, onFloor);
        break;
      case 'climb':
        this.updateClimb(dt);
        break;
      case 'ledge':
        this.updateLedge();
        break;
      case 'ledgeup':
        break;
      case 'swim':
        this.updateSwim(dt, inWater, headInWater);
        break;
      case 'hurt':
        if (this.stateTime > 0.35 && (onFloor || this.stateTime > 0.8)) this.setPState(onFloor ? 'ground' : 'air');
        break;
    }

    // breath
    if (headInWater && this.state === 'swim') {
      this.air = Math.max(0, this.air - dt / 11);
      this.breathTimer += dt;
      if (this.breathTimer > 0.7) {
        this.breathTimer = 0;
        this.gs.fx.bubble(this.x + this.facing * 8, body.top + 6);
      }
      if (this.air <= 0 && this.invuln <= 0) this.hurt(1, this.x);
    } else this.air = Math.min(1, this.air + dt / 1.5);

    this.updateShooting(dt);
    this.checkHazards();
    this.animate();
  }

  private updateMove(dt: number, onFloor: boolean) {
    const ctl = this.ctl;
    const body = this.body;
    const dir = (ctl.held.right ? 1 : 0) - (ctl.held.left ? 1 : 0);
    if (onFloor) {
      if (this.state !== 'ground') this.setPState('ground');
      this.coyote = PHYS.coyote;
      this.usedDouble = false;
      this.airTime = 0;
      this.trackSafe();
    } else {
      if (this.airTime === 0) this.lastHandY = 0;
      this.coyote = Math.max(0, this.coyote - dt);
      this.airTime += dt;
      if (this.state === 'ground') this.setPState('air');
    }
    // crouch
    const wantCrouch = onFloor && ctl.held.down;
    this.setCrouch(wantCrouch || (this.crouching && this.ceilingAbove()));
    this.hidden = this.crouching && this.inHideZone && Math.abs(body.velocity.x) < 30;
    // horizontal
    const speed = this.crouching ? PHYS.crouchSpeed : PHYS.runSpeed;
    const target = this.landLock > 0 ? dir * speed * 0.5 : dir * speed;
    const icy = onFloor && !!this.gs.levelDef.ice && body.blocked.down;
    const accel = onFloor ? (dir !== 0 ? (icy ? 950 : PHYS.accelGround) : icy ? 320 : PHYS.decelGround) : PHYS.accelAir;
    const vx = body.velocity.x;
    body.setVelocityX(Phaser.Math.Linear(vx, target, 1) === target ? approach(vx, target, accel * dt) : approach(vx, target, accel * dt));
    if (dir !== 0 && !(this.charging && this.ctl.usingMouse)) this.facing = dir;
    // conveyor belts carry Elias
    if (onFloor) body.x += this.lvl.beltAtWorld(body.center.x, body.bottom + 4) * 85 * dt;
    // pushing (touching a crate horizontally)
    this.pushing = onFloor && dir !== 0 && (body.touching.left || body.touching.right) && this.gs.touchingCrate(this, dir);
    // footsteps
    if (onFloor && Math.abs(body.velocity.x) > 60) {
      this.stepTimer -= dt * (this.crouching ? 0.5 : 1);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.28;
        Sound.play('step');
        if (!this.crouching && Math.random() < 0.5) this.gs.fx.dust(this.x - this.facing * 6, body.bottom, 1);
      }
    }
    // ladder grab
    const onLadder = this.lvl.ladderAtWorld(body.center.x, body.center.y) || this.lvl.ladderAtWorld(body.center.x, body.bottom + 2);
    this.ladderCd = Math.max(0, this.ladderCd - dt);
    if (onLadder && this.ladderCd <= 0 && (ctl.held.up && !this.ctl.jumpOnlyPressed || (ctl.held.down && !onFloor) || (ctl.held.down && this.lvl.ladderAtWorld(body.center.x, body.bottom + 4)))) {
      const tx = Math.floor(body.center.x / TILE);
      if (this.lvl.ch(tx, Math.floor((body.center.y) / TILE)) === 'H' || this.lvl.ch(tx, Math.floor((body.bottom + 4) / TILE)) === 'H') {
        this.setCrouch(false);
        this.setPState('climb');
        this.x = tx * TILE + TILE / 2;
        body.setVelocity(0, 0);
        if (ctl.held.down) this.dropThrough = 0.25;
        return;
      }
    }
    // jumping
    if (this.jumpBuffer > 0) {
      if (onFloor && ctl.held.down && this.onOneWay()) {
        this.dropThrough = 0.25;
        this.jumpBuffer = 0;
        body.y += 2;
      } else if (onFloor || this.coyote > 0) {
        if (this.crouching && this.ceilingAbove()) {
          this.jumpBuffer = 0;
        } else {
          this.doJump(PHYS.jumpVel);
        }
      } else if (this.gs.levelDef.doubleJump && !this.usedDouble && this.airTime > 0.05) {
        this.usedDouble = true;
        this.jumpBuffer = 0;
        body.setVelocityY(-PHYS.doubleJumpVel);
        this.play('elias-djump', true);
        this.lastAnim = 'djump';
        Sound.play('djump');
        this.gs.pip.boost(this.x, body.bottom);
        this.gs.fx.ring(this.x, body.bottom, 0xffd27a);
      }
    }
    // variable jump height & apex hang
    if (!onFloor) {
      if (ctl.released.jump && body.velocity.y < -120) body.setVelocityY(body.velocity.y * 0.45);
      const apex = Math.abs(body.velocity.y) < 70 && ctl.held.jump;
      body.setGravityY(apex ? -PHYS.gravity * 0.45 : body.velocity.y > 0 ? PHYS.gravity * 0.18 : 0);
      this.tryLedgeGrab(dir);
    } else body.setGravityY(0);
  }

  private onOneWay() {
    const t = this.lvl.ground.getTileAtWorldXY(this.body.center.x, this.body.bottom + 4);
    return !!t && (t.index === 32 || t.index === 33);
  }

  doJump(v: number) {
    const body = this.body;
    this.setCrouch(false);
    body.setVelocityY(-v);
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.setPState('air');
    this.airTime = 0.01;
    Sound.play('jump');
    this.gs.fx.dust(this.x, body.bottom, 5);
    this.gs.tweens.add({ targets: this, scaleX: 0.44, scaleY: 0.57, duration: 90, yoyo: true, ease: 'Quad.out' });
  }

  private lastHandY = 0;
  ladderCd = 0;
  private tryLedgeGrab(dir: number) {
    const body = this.body;
    const handY = body.top + 6;
    const prevHand = this.lastHandY || handY;
    this.lastHandY = handY;
    if (body.velocity.y < -60 || dir === 0) return;
    if (this.ctl.held.down) return;
    const fx = dir > 0 ? body.right + 3 : body.left - 3;
    const tx = Math.floor(fx / TILE);
    // sweep from last frame's hand height to this frame's, so low frame rates never skip the ledge corner
    let ty = -1;
    for (let y = Math.min(prevHand, handY) - 4; y <= handY; y += 4) {
      const t = Math.floor(y / TILE);
      if (this.lvl.solid(tx, t) && !this.lvl.solid(tx, t - 1) && !this.lvl.solid(tx, t - 2) && handY - t * TILE <= 26) { ty = t; break; }
    }
    if (ty < 0) return;
    const ledgeTop = ty * TILE;
    // must also have space where the body hangs
    if (this.lvl.solid(Math.floor(body.center.x / TILE), ty - 1)) return;
    this.setPState('ledge');
    this.facing = dir;
    this.ledgeX = tx;
    this.ledgeY = ty;
    body.setVelocity(0, 0);
    body.y = ledgeTop - 4;
    body.x = dir > 0 ? tx * TILE - body.width - 1 : (tx + 1) * TILE + 1;
    this.x = body.x + body.width / 2;
    this.y = body.y + body.height + (FEET - 152);
    Sound.play('step');
  }

  private updateLedge() {
    const ctl = this.ctl;
    this.body.setVelocity(0, 0);
    if (ctl.pressed.jump || ctl.held.up || (this.facing > 0 ? ctl.held.right : ctl.held.left) && this.stateTime > 0.25) {
      this.setPState('ledgeup');
      this.play('elias-ledgeup', true);
      this.lastAnim = 'ledgeup';
      const tx = this.ledgeX, ty = this.ledgeY;
      const targetX = tx * TILE + TILE / 2;
      const targetY = ty * TILE; // feet on ledge top
      this.body.enable = false;
      this.gs.tweens.add({
        targets: this,
        x: targetX,
        y: targetY,
        duration: 330,
        ease: 'Sine.inOut',
        onComplete: () => {
          this.body.enable = true;
          this.body.reset(this.x, this.y);
          this.setPState('ground');
        },
      });
    } else if (ctl.pressed.down || (this.facing > 0 ? ctl.held.left : ctl.held.right)) {
      this.setPState('air');
      this.airTime = 0.2;
      this.body.y += 6;
    }
  }

  private updateClimb(dt: number) {
    const ctl = this.ctl;
    const body = this.body;
    const vy = (ctl.held.down ? 1 : 0) - (ctl.held.up ? 1 : 0);
    body.setVelocity(0, vy * PHYS.climbSpeed);
    this.dropThrough = 0.1;
    const onLadder = this.lvl.ladderAtWorld(body.center.x, body.center.y) || this.lvl.ladderAtWorld(body.center.x, body.bottom - 2);
    const side = (ctl.held.right ? 1 : 0) - (ctl.held.left ? 1 : 0);
    if (side !== 0 && !this.lvl.solid(Math.floor((body.center.x + side * 20) / TILE), Math.floor(body.center.y / TILE))) {
      // step sideways off the ladder
      this.facing = side;
      this.ladderCd = 0.35;
      body.setVelocityX(side * PHYS.runSpeed * 0.6);
      this.setPState('air');
      this.airTime = 0.1;
      return;
    }
    if (!onLadder) {
      // reached the top or bottom
      if (vy < 0) {
        body.setVelocityY(-180);
        this.dropThrough = 0;
        this.ladderCd = 0.5;
      }
      this.setPState('air');
      this.airTime = 0.1;
      return;
    }
    if ((body.blocked.down) && vy > 0) {
      this.setPState('ground');
      return;
    }
    if (this.ctl.jumpOnlyPressed) {
      const d = (ctl.held.right ? 1 : 0) - (ctl.held.left ? 1 : 0);
      this.dropThrough = 0.15;
      this.doJump(PHYS.jumpVel * 0.85);
      body.setVelocityX(d * PHYS.runSpeed);
      if (d) this.facing = d;
      return;
    }
    if (vy !== 0) {
      this.stepTimer -= dt;
      if (this.stepTimer < 0) {
        this.stepTimer = 0.3;
        Sound.play('step');
      }
    }
  }

  private updateSwim(dt: number, inWater: boolean, headInWater: boolean) {
    const ctl = this.ctl;
    const body = this.body;
    this.usedDouble = false;
    if (!inWater) {
      this.setPState('air');
      this.airTime = 0.2;
      Sound.play('splashOut');
      return;
    }
    const dx = (ctl.held.right ? 1 : 0) - (ctl.held.left ? 1 : 0);
    const dy = (ctl.held.down ? 1 : 0) - (ctl.held.up || ctl.held.jump ? 1 : 0);
    if (dx) this.facing = dx;
    const cur = this.lvl.currentAtWorld(body.center.x, body.center.y) * 150;
    body.setVelocityX(approach(body.velocity.x, dx * PHYS.swimSpeed + cur, 600 * dt));
    let vy = body.velocity.y + 140 * dt; // slow sink
    if (dy < 0) vy = approach(vy, -PHYS.swimSpeed, 700 * dt);
    else if (dy > 0) vy = approach(vy, PHYS.swimSpeed, 700 * dt);
    else vy = approach(vy, 30, 200 * dt);
    body.setVelocityY(vy);
    // jump out at the surface
    if (!headInWater && this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      this.setPState('air');
      body.setAllowGravity(true);
      this.doJump(PHYS.jumpVel);
      Sound.play('splash');
      this.gs.fx.splash(body.center.x, body.top + 6);
    }
    if (!headInWater && body.velocity.y < 0 && !ctl.held.jump && !ctl.held.up) body.setVelocityY(0);
  }

  private updateShooting(dt: number) {
    const ctl = this.ctl;
    if (this.state === 'climb' || this.state === 'ledge' || this.state === 'ledgeup' || this.state === 'hurt') {
      if (this.charging) {
        this.charging = false;
        Sound.stopCharge();
      }
      return;
    }
    this.aimUp = ctl.held.up && !ctl.usingMouse && this.state !== 'swim';
    if (ctl.pressed.shoot && this.shootCooldown <= 0) {
      this.charging = true;
      this.charge = 0;
      this.chargeReadyPlayed = false;
    }
    if (this.charging) {
      this.charge += dt;
      if (this.charge > 0.18) Sound.startCharge();
      if (this.charge > 0.6 && !this.chargeReadyPlayed) {
        this.chargeReadyPlayed = true;
        Sound.play('chargeReady');
      }
      if (this.charge > 0.18) this.gs.fx.chargeMotes(this.muzzle().x, this.muzzle().y, Math.min(1, this.charge / 0.6));
      if (!ctl.held.shoot) {
        this.charging = false;
        Sound.stopCharge();
        this.fire(this.charge >= 0.6);
      }
    }
  }

  muzzle() {
    const ang = this.aimAngle();
    const ox = this.crouching ? 10 : 14;
    const oy = this.crouching ? -18 : -34;
    return { x: this.x + Math.cos(ang) * 20 + this.facing * ox * 0.3, y: this.y + oy + Math.sin(ang) * 12, ang };
  }

  aimAngle() {
    const aw = this.ctl.aimWorld;
    if (aw) {
      const a = Math.atan2(aw.y - (this.y - 34), aw.x - this.x);
      this.facing = Math.cos(a) >= 0 ? 1 : -1;
      return a;
    }
    const base = this.aimUp ? (this.facing > 0 ? -Math.PI / 4 : (-Math.PI * 3) / 4) : this.facing > 0 ? 0 : Math.PI;
    return this.gs.aimAssist(this.x, this.y - (this.crouching ? 18 : 34), base) ?? base;
  }

  private fire(big: boolean) {
    const m = this.muzzle();
    this.gs.spawnBolt(m.x, m.y, m.ang, big);
    this.shootCooldown = big ? 0.35 : 0.16;
    this.shootPose = 0.22;
    Sound.play(big ? 'chargeShot' : 'shoot');
    if (big) {
      this.gs.fx.shake(0.006, 120);
      if (this.state !== 'swim') this.body.setVelocityX(this.body.velocity.x - Math.cos(m.ang) * 160);
    }
  }

  private trackSafe() {
    const b = this.body;
    const l = this.lvl;
    const ty = Math.floor((b.bottom + 4) / TILE);
    const ok = (x: number) => l.solid(Math.floor(x / TILE), ty) && !l.hazardAtWorld(x, b.bottom - 4);
    if (ok(b.left - 10) && ok(b.right + 10) && ok(b.center.x) && !this.gs.enemyNear(b.center.x, b.center.y, 100)) this.lastSafe.set(this.x, this.y);
  }

  private checkHazards() {
    const b = this.body;
    const l = this.lvl;
    const pts: [number, number][] = [[b.left + 3, b.bottom - 2], [b.right - 3, b.bottom - 2], [b.center.x, b.center.y], [b.center.x, b.top + 3]];
    for (const [x, y] of pts) {
      const h = l.hazardAtWorld(x, y);
      if (h && this.hazardCooldown <= 0) {
        this.hazardCooldown = 0.5;
        this.hurt(1, x, { respawn: true, force: true });
        return;
      }
    }
    if (b.top > l.heightPx + 40) this.hurt(1, this.x, { respawn: true, force: true });
  }

  animate() {
    const b = this.body;
    let anim = 'idle';
    switch (this.state) {
      case 'ground': {
        const moving = Math.abs(b.velocity.x) > 25;
        if (this.landLock > 0) anim = 'land';
        else if (this.crouching) anim = moving ? 'crawl' : 'crouch';
        else if (this.pushing) anim = 'push';
        else if (this.charging && this.charge > 0.15 && !moving) anim = 'charge';
        else if (this.shootPose > 0 && !moving) anim = this.aimUp ? 'aimup' : 'shoot';
        else if (this.aimUp && !moving) anim = 'aimup';
        else anim = moving ? 'run' : 'idle';
        break;
      }
      case 'air':
        if (this.lastAnim === 'djump' && this.anims.isPlaying) anim = 'djump';
        else anim = b.velocity.y < -40 ? 'jump' : 'fall';
        break;
      case 'climb':
        anim = 'climb';
        break;
      case 'ledge':
        anim = 'hang';
        break;
      case 'ledgeup':
        anim = 'ledgeup';
        break;
      case 'swim':
        anim = 'swim';
        break;
      case 'hurt':
        anim = 'hurt';
        break;
      case 'dead':
        anim = 'death';
        break;
      case 'cutscene':
        anim = Math.abs(b.velocity.x) > 20 ? 'run' : this.lastAnim === 'wake' ? 'wake' : 'idle';
        break;
    }
    if (anim !== this.lastAnim) {
      this.play('elias-' + anim, true);
      this.lastAnim = anim;
    }
    if (anim === 'climb') this.anims.timeScale = Math.abs(b.velocity.y) > 5 ? 1 : 0;
    else if (anim === 'run') this.anims.timeScale = Phaser.Math.Clamp(Math.abs(b.velocity.x) / PHYS.runSpeed, 0.5, 1.2);
    else if (anim === 'crawl') this.anims.timeScale = Phaser.Math.Clamp(Math.abs(b.velocity.x) / PHYS.crouchSpeed, 0.4, 1.2);
    else this.anims.timeScale = 1;
    this.setFlipX(this.facing < 0);
    if (anim === 'swim') {
      const vx = b.velocity.x, vy = b.velocity.y;
      this.rotation = Phaser.Math.Clamp(Math.atan2(vy, Math.abs(vx) + 40) * 0.6, -0.6, 0.6) * this.facing;
    } else this.rotation = 0;
  }
}

function approach(v: number, t: number, d: number) {
  return v < t ? Math.min(t, v + d) : Math.max(t, v - d);
}
