import Phaser from 'phaser';
import { DEPTH } from '../core/constants';
import { Sound } from '../core/Audio';
import type { GameScene } from '../scenes/GameScene';

export type PipMode = 'follow' | 'command' | 'activate' | 'lure' | 'return' | 'boost';

/**
 * Pip, the mechanical firefly. Spring-follows Elias, lights the dark, reveals light-glass,
 * wakes ancient mechanisms, boosts double jumps, and sings to lure creatures away.
 */
export class Pip extends Phaser.GameObjects.Sprite {
  vx = 0;
  vy = 0;
  mode: PipMode = 'follow';
  target = new Phaser.Math.Vector2();
  modeTime = 0;
  cooldown = 0;
  lightRadius = 170;
  luring = false;
  commandTarget: { x: number; y: number; activate: () => void } | null = null;
  halo: Phaser.GameObjects.Image;
  private t = Math.random() * 10;
  private chirpTimer = 2;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(public gs: GameScene, x: number, y: number) {
    super(gs, x, y, 'pip', 0);
    gs.add.existing(this);
    this.setScale(0.42).setDepth(DEPTH.pip);
    this.play('pip-fly');
    this.halo = gs.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc860).setAlpha(0.55).setScale(0.9).setDepth(DEPTH.glow);
    this.trail = gs.add.particles(0, 0, 'dot', {
      lifespan: 700,
      speed: { min: 2, max: 12 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: [0xffe39a, 0xffc860],
      blendMode: 'ADD',
      frequency: 70,
      follow: this,
    }).setDepth(DEPTH.glow);
  }

  /** Send Pip: activate the nearest mechanism in range, otherwise sing a lure ahead of Elias. */
  command(): string {
    if (this.cooldown > 0 || this.mode === 'command' || this.mode === 'activate') return '';
    const p = this.gs.player;
    const mech = this.gs.nearestMechanism(p.x, p.y - 30, 340);
    Sound.play('pipCommand');
    if (mech) {
      this.commandTarget = mech;
      this.setMode('command');
      return 'mechanism';
    }
    // lure: fly ahead and hover
    const tx = p.x + p.facing * 190;
    const ty = p.y - 70;
    this.target.set(tx, ty);
    this.setMode('lure');
    this.cooldown = 1.2;
    return 'lure';
  }

  boost(x: number, y: number) {
    this.x = x - this.gs.player.facing * 6;
    this.y = y + 6;
    this.vx = 0;
    this.vy = 260;
    this.setMode('boost');
  }

  private setMode(m: PipMode) {
    this.mode = m;
    this.modeTime = 0;
    this.luring = m === 'lure';
  }

  update(dt: number) {
    this.t += dt;
    this.modeTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = this.gs.player;
    let k = 26, damp = 7.5;
    switch (this.mode) {
      case 'follow':
      case 'boost': {
        const swimming = p.state === 'swim';
        const tx = p.x - p.facing * 30 + Math.sin(this.t * 1.7) * 12;
        const ty = p.y - (p.crouching ? 40 : swimming ? 52 : 66) + Math.sin(this.t * 2.6) * 7;
        this.target.set(tx, ty);
        if (this.mode === 'boost' && this.modeTime > 0.35) this.setMode('follow');
        if (this.mode === 'boost') k = 8;
        break;
      }
      case 'command': {
        const c = this.commandTarget!;
        this.target.set(c.x, c.y - 10);
        k = 40;
        damp = 9;
        if (Phaser.Math.Distance.Between(this.x, this.y, c.x, c.y - 10) < 14) {
          this.setMode('activate');
          c.activate();
        }
        if (this.modeTime > 4) this.setMode('return');
        break;
      }
      case 'activate':
        this.target.set(this.commandTarget!.x + Math.cos(this.t * 8) * 10, this.commandTarget!.y - 12 + Math.sin(this.t * 8) * 6);
        if (this.modeTime > 1.3) this.setMode('return');
        break;
      case 'lure':
        this.target.x += Math.sin(this.t * 3) * 0.6;
        k = 30;
        this.chirpTimer -= dt;
        if (this.chirpTimer <= 0) {
          this.chirpTimer = 0.45;
          Sound.play('pip', Phaser.Math.Clamp((this.x - this.gs.cameras.main.midPoint.x) / 400, -1, 1));
          this.gs.fx.note(this.x, this.y - 6);
        }
        if (this.modeTime > 4.5 || (this.modeTime > 1.5 && Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) > 620)) this.setMode('return');
        break;
      case 'return':
        this.target.set(p.x - p.facing * 30, p.y - 66);
        k = 34;
        if (Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 30) this.setMode('follow');
        break;
    }
    // critically-damped-ish spring
    const ax = (this.target.x - this.x) * k - this.vx * damp;
    const ay = (this.target.y - this.y) * k - this.vy * damp;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.setFlipX(this.vx < -10 ? true : this.vx > 10 ? false : this.flipX);
    this.rotation = Phaser.Math.Clamp(this.vx * 0.0015, -0.35, 0.35);
    // idle chirps
    if (this.mode === 'follow') {
      this.chirpTimer -= dt;
      if (this.chirpTimer <= 0) {
        this.chirpTimer = 6 + Math.random() * 8;
        Sound.play('pip');
      }
    }
    const pulse = 0.85 + Math.sin(this.t * 5) * 0.08 + (this.mode === 'activate' ? 0.4 : 0) + (this.mode === 'lure' ? 0.25 : 0);
    this.lightRadius = 175 * pulse;
    this.halo.setPosition(this.x, this.y).setScale(0.85 * pulse).setAlpha(0.5 + (pulse - 0.85));
  }

  destroy(fromScene?: boolean) {
    this.halo.destroy();
    this.trail.destroy();
    super.destroy(fromScene);
  }
}
