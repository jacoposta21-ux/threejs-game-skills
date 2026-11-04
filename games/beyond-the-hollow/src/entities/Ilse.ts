import Phaser from 'phaser';
import { DEPTH, TILE } from '../core/constants';
import { Sound } from '../core/Audio';
import type { GameScene } from '../scenes/GameScene';
import type { Door } from '../world/Objects';

/**
 * Ilse Varga. Follows Elias through the Sanctuary; at a ritual door she kneels and channels her
 * Keeper blood to open it, while the Shadow sends its creatures. She must not fall.
 */
export class Ilse extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp = 8;
  maxHp = 8;
  invuln = 0;
  mode: 'follow' | 'channel' | 'hold' | 'down' = 'follow';
  channelT = 0;
  door: Door | null = null;
  glow: Phaser.GameObjects.Image;
  private lastAnim = '';
  private stuckT = 0;
  constructor(public gs: GameScene, x: number, y: number) {
    super(gs, x, y, 'ilse', 0);
    gs.add.existing(this);
    gs.physics.add.existing(this);
    this.setScale(0.53).setOrigin(0.5, 152 / 160).setDepth(DEPTH.player - 1);
    this.body.setSize(36, 88).setOffset(46, 64);
    this.body.setMaxVelocity(400, 900);
    this.glow = gs.add.image(x, y, 'glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(2).setDepth(DEPTH.glow);
  }
  hurt(dmg: number) {
    if (this.invuln > 0 || this.mode === 'down') return;
    this.hp -= dmg;
    this.invuln = 1;
    Sound.play('hurt');
    this.setTintFill(0xffffff);
    this.gs.time.delayedCall(90, () => this.clearTint());
    if (this.hp <= 0) {
      this.mode = 'down';
      this.play('ilse-death');
      this.body.setVelocityX(0);
      this.gs.onIlseDown();
    }
  }
  heal() {
    this.hp = this.maxHp;
  }
  /** Boss finale: she walks to the Seed and holds its core open. */
  holdAt(x: number) {
    this.mode = 'hold';
    this.door = null;
    this.channelT = 0;
    (this as any).holdX = x;
  }
  update(dt: number) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 14) % 2 ? 0.5 : 1) : 1);
    const p = this.gs.player;
    const b = this.body;
    const onFloor = b.blocked.down || b.touching.down;
    let anim = 'idle';
    this.glow.setPosition(this.x, this.y - 30);
    switch (this.mode) {
      case 'down':
        return;
      case 'follow': {
        const ritual = this.gs.doors.find((d) => d.ritual && !d.open && Math.abs(d.s.x - this.x) < 360 && Math.abs(d.s.y - this.y) < 120);
        if (ritual) {
          const tx = ritual.s.x - 40;
          if (Math.abs(tx - this.x) < 10 && onFloor) {
            this.mode = 'channel';
            this.door = ritual;
            this.channelT = 0;
            b.setVelocityX(0);
            this.gs.onRitualStart(ritual);
            break;
          }
          this.walkTo(tx, dt, onFloor);
        } else {
          const tx = p.x - p.facing * 70;
          if (Math.abs(tx - this.x) > 40) this.walkTo(tx, dt, onFloor);
          else b.setVelocityX(0);
        }
        // fell behind or got stuck: catch up like a companion should
        if (Math.abs(p.x - this.x) > 640 || this.y > this.gs.level.heightPx + 20) this.catchUp();
        anim = Math.abs(b.velocity.x) > 20 ? 'run' : onFloor ? 'idle' : b.velocity.y < 0 ? 'jump' : 'fall';
        break;
      }
      case 'channel':
        b.setVelocityX(0);
        anim = 'crouch';
        this.channelT += dt;
        this.glow.setAlpha(0.6 + Math.sin(this.channelT * 8) * 0.2);
        if (Math.random() < 0.4) this.gs.fx.glowE.explode(1, this.x + (Math.random() - 0.5) * 30, this.y - 20);
        if (this.channelT >= 4) {
          this.glow.setAlpha(0);
          this.door?.openPermanent();
          this.gs.toast('The Keeper door opens for Ilse', 1800);
          this.mode = 'follow';
          this.door = null;
        }
        break;
      case 'hold': {
        const hx = (this as any).holdX as number;
        if (Math.abs(hx - this.x) > 16) this.walkTo(hx, dt, onFloor);
        else { b.setVelocityX(0); anim = 'crouch'; this.glow.setAlpha(0.8); }
        if (Math.abs(b.velocity.x) > 20) anim = 'run';
        break;
      }
    }
    this.setFlipX(b.velocity.x < -5 ? true : b.velocity.x > 5 ? false : this.flipX);
    if (anim !== this.lastAnim) {
      this.play('ilse-' + anim, true);
      this.lastAnim = anim;
    }
  }
  private walkTo(tx: number, dt: number, onFloor: boolean) {
    const b = this.body;
    const dir = Math.sign(tx - this.x);
    b.setVelocityX(dir * 200);
    const L = this.gs.level;
    const ahead = Math.floor((this.x + dir * 24) / TILE), foot = Math.floor((b.bottom - 4) / TILE);
    const wall = L.solid(ahead, foot) || L.solid(ahead, foot - 1);
    const gap = !L.solid(ahead, foot + 1) && !L.solid(ahead, foot + 2);
    if (onFloor && (wall || gap)) b.setVelocityY(-620);
    this.stuckT = Math.abs(b.velocity.x) < 5 ? this.stuckT + dt : 0;
    if (this.stuckT > 1.5) this.catchUp();
  }
  private catchUp() {
    const p = this.gs.player;
    this.stuckT = 0;
    this.body.reset(p.x - p.facing * 50, p.y - 4);
    this.gs.fx.glowE.explode(10, this.x, this.y - 30);
  }
  destroy(fromScene?: boolean) {
    this.glow.destroy();
    super.destroy(fromScene);
  }
}
