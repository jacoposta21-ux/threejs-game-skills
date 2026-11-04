import Phaser from 'phaser';
import { DEPTH } from '../core/constants';
import { Save } from '../core/Save';
import { THEMES } from '../art/themes';
import type { GameScene } from '../scenes/GameScene';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/** Shared particle emitters and screen feedback (shake, flash, hit-stop). */
export class Fx {
  dustE: Emitter;
  sparkE: Emitter;
  glowE: Emitter;
  bubbleE: Emitter;
  smokeE: Emitter;
  shardE: Emitter;
  ambientE: Emitter;
  private hitstopUntil = 0;
  private flash: Phaser.GameObjects.Rectangle;

  constructor(private gs: GameScene) {
    const th = THEMES[gs.levelDef.theme];
    const dustTint = Phaser.Display.Color.HexStringToColor(th.rock[2]).color;
    const mk = (tex: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth = DEPTH.fx) =>
      gs.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(depth);
    this.dustE = mk('smoke', { lifespan: { min: 350, max: 700 }, speed: { min: 15, max: 70 }, angle: { min: 200, max: 340 }, scale: { start: 0.25, end: 0.6 }, alpha: { start: 0.45, end: 0 }, tint: dustTint, gravityY: -20 });
    this.sparkE = mk('spark', { lifespan: { min: 150, max: 380 }, speed: { min: 120, max: 380 }, scale: { start: 0.8, end: 0.1 }, alpha: { start: 1, end: 0 }, rotate: 0, blendMode: 'ADD', tint: [0xbffff4, 0x7ff5e0, 0xffffff], gravityY: 400 }, DEPTH.glow);
    this.glowE = mk('dot', { lifespan: { min: 400, max: 900 }, speed: { min: 20, max: 140 }, scale: { start: 0.6, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', tint: [0x7ff5e0, 0xffffff] }, DEPTH.glow);
    this.bubbleE = mk('bubble', { lifespan: { min: 900, max: 1600 }, speedY: { min: -70, max: -30 }, speedX: { min: -12, max: 12 }, scale: { start: 0.6, end: 1 }, alpha: { start: 0.9, end: 0 } }, DEPTH.water + 1);
    this.smokeE = mk('smoke', { lifespan: { min: 600, max: 1200 }, speed: { min: 10, max: 50 }, scale: { start: 0.5, end: 1.4 }, alpha: { start: 0.5, end: 0 }, tint: 0x150a20 });
    this.shardE = mk('shard', { lifespan: { min: 500, max: 1000 }, speed: { min: 80, max: 260 }, angle: { min: 200, max: 340 }, gravityY: 900, scale: { start: 1.2, end: 0.6 }, alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 } });
    // ambient motes floating through the level, colored by theme
    const motes: Record<string, number[]> = { station: [0xffd6a0, 0x9ec8d0], forest: [0x7fffd0, 0xff9ae6, 0xd0ffa0], caverns: [0xa0c4ff, 0xd8b0ff], ocean: [0x9ffff0, 0xffc0d8], heart: [0xffa090, 0xffe0a0] };
    this.ambientE = gs.add.particles(0, 0, 'dot', {
      x: { min: 0, max: 1 }, y: { min: 0, max: 1 },
      lifespan: 6000, speedX: { min: -12, max: 12 }, speedY: { min: -14, max: 6 },
      scale: { start: 0.05, end: 0.28 }, alpha: { start: 0, end: 0.9, ease: 'Sine.inOut' },
      tint: motes[gs.levelDef.theme], blendMode: 'ADD', frequency: 70,
      emitCallback: (p: Phaser.GameObjects.Particles.Particle) => {
        const v = gs.cameras.main.worldView;
        p.x = v.x + Math.random() * v.width;
        p.y = v.y + Math.random() * v.height;
      },
    }).setDepth(DEPTH.glow);
    this.flash = gs.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.letterbox - 1);
  }

  /** Performance mode: no ambient motes */
  applyQuality(low: boolean) {
    if (this.ambientE.emitting === low) low ? this.ambientE.stop() : this.ambientE.start();
  }

  dust(x: number, y: number, n: number) {
    this.dustE.explode(n, x, y - 2);
  }
  splash(x: number, y: number) {
    this.glowE.explode(10, x, y);
    this.bubbleE.explode(8, x, y + 10);
  }
  bubble(x: number, y: number) {
    this.bubbleE.explode(1, x, y);
  }
  ring(x: number, y: number, color: number) {
    const r = this.gs.add.image(x, y, 'ring').setScale(0.05, 0.02).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow);
    this.gs.tweens.add({ targets: r, scaleX: 0.45, scaleY: 0.16, alpha: 0, duration: 320, ease: 'Cubic.out', onComplete: () => r.destroy() });
  }
  chargeMotes(x: number, y: number, k: number) {
    if (Math.random() < 0.5 + k * 0.5) {
      const a = Math.random() * Math.PI * 2, d = 26 * (1 - k * 0.3);
      const p = this.gs.add.image(x + Math.cos(a) * d, y + Math.sin(a) * d, 'dot').setScale(0.3 + k * 0.3).setBlendMode(Phaser.BlendModes.ADD).setTint(k >= 1 ? 0xffffff : 0x7ff5e0).setDepth(DEPTH.glow);
      this.gs.tweens.add({ targets: p, x, y, alpha: 0.2, duration: 180, onComplete: () => p.destroy() });
    }
  }
  hitSparks(x: number, y: number, dir: number) {
    this.sparkE.setParticleTint(0xffffff);
    this.sparkE.explode(10, x, y);
    this.glowE.explode(5, x - dir * 6, y);
  }
  armorSparks(x: number, y: number) {
    this.sparkE.explode(8, x, y);
  }
  impact(x: number, y: number, big: boolean) {
    this.sparkE.explode(big ? 16 : 7, x, y);
    this.glowE.explode(big ? 12 : 4, x, y);
    if (big) this.ring(x, y, 0x7ff5e0);
  }
  coreHit(x: number, y: number) {
    this.glowE.explode(20, x, y);
    this.ring(x, y, 0xffffff);
    this.shake(0.01, 160);
  }
  deathBurst(x: number, y: number, kind: string) {
    const tint = kind === 'stalker' ? 0x2a1040 : kind === 'crawler' ? 0xe8dcc4 : kind === 'burrower' ? 0xb7839f : 0x8fb5b0;
    this.smokeE.setParticleTint(kind === 'stalker' ? 0x150a20 : 0x3a3040);
    this.smokeE.explode(kind === 'stalker' ? 22 : 10, x, y);
    this.shardE.setParticleTint(tint);
    this.shardE.explode(14, x, y);
    this.glowE.explode(12, x, y);
  }
  rockShatter(x: number, y: number, tint = 0x8a9ab8) {
    this.shardE.setParticleTint(tint);
    this.shardE.explode(16, x, y);
    this.dust(x, y, 10);
  }
  dirt(x: number, y: number) {
    this.shardE.setParticleTint(0x6a4a3a);
    this.shardE.explode(1, x + (Math.random() - 0.5) * 20, y - 2);
  }
  dirtBurst(x: number, y: number) {
    this.shardE.setParticleTint(0x6a4a3a);
    this.shardE.explode(22, x, y - 4);
    this.dust(x, y, 12);
  }
  smokeWisp(x: number, y: number) {
    this.smokeE.setParticleTint(0x150a20);
    this.smokeE.explode(1, x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 30);
  }
  alert(x: number, y: number) {
    const t = this.gs.add.text(x, y, '!', { fontFamily: 'Cinzel, Georgia, serif', fontSize: '22px', color: '#ff6aa8', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(DEPTH.hint);
    this.gs.tweens.add({ targets: t, y: y - 18, alpha: 0, duration: 700, ease: 'Quad.out', onComplete: () => t.destroy() });
  }
  note(x: number, y: number) {
    const t = this.gs.add.text(x + (Math.random() - 0.5) * 10, y, Math.random() < 0.5 ? '♪' : '♫', { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#ffe39a' }).setOrigin(0.5).setDepth(DEPTH.hint);
    this.gs.tweens.add({ targets: t, y: y - 26, x: t.x + (Math.random() - 0.5) * 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }
  shake(intensity: number, duration: number) {
    if (!Save.data.settings.shake) return;
    this.gs.cameras.main.shake(duration, intensity * 0.9, false);
  }
  flashScreen(color: number, alpha: number) {
    const cam = this.gs.cameras.main;
    this.flash.setSize(cam.width / Math.min(1, cam.zoom) + 200, cam.height / Math.min(1, cam.zoom) + 200);
    this.flash.setPosition(cam.width / 2, cam.height / 2);
    this.flash.setFillStyle(color, alpha);
    this.gs.tweens.killTweensOf(this.flash);
    this.gs.tweens.add({ targets: this.flash, fillAlpha: 0, duration: 260 });
  }
  hitstop(ms: number) {
    const now = this.gs.time.now;
    if (now < this.hitstopUntil) return;
    this.hitstopUntil = now + ms;
    this.gs.physics.world.pause();
    this.gs.time.delayedCall(ms, () => {
      if (!this.gs.paused) this.gs.physics.world.resume();
    });
  }
  get inHitstop() {
    return this.gs.time.now < this.hitstopUntil;
  }
}
