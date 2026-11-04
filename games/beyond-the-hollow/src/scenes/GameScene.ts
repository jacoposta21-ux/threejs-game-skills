import Phaser from 'phaser';
import { t } from '../core/i18n';
import { DEPTH, TILE, VIEW_H, VIEW_W_MIN } from '../core/constants';
import { Controls } from '../core/Controls';
import { Sound } from '../core/Audio';
import { Save } from '../core/Save';
import { Crazy } from '../core/CrazySDK';
import { LEVELS, LevelDef } from '../levels/levels';
import { LevelMap, Spawn } from '../world/LevelMap';
import { Fx } from '../world/Fx';
import { Lighting } from '../world/Lighting';
import { ArcEmitter, Bouncer, Checkpoint, Cocoon, Crate, Door, Exit, GhostPlatform, HideSpot, Hint, Lamp, Light, Lore, Mechanism, Orb, Plate, SporeVent, Stalactite } from '../world/Objects';
import { Player } from '../entities/Player';
import { Pip } from '../entities/Pip';
import { Burrower, Crawler, Drone, Enemy, Guardian, Jelly, Mimic, ShadowBoss, ShadowHeart, Stalker, VeiledShade, Warden } from '../entities/Enemies';
import { Ilse } from '../entities/Ilse';
import { HookNode } from '../world/Objects';
import { EcoBlock, Lantern, Updraft, VineBud } from '../world/Objects';
import type { BGScene } from './BGScene';
import { BreakWall, Belt, Crusher, Mover, Pendulum } from '../world/Objects';
import { buildChapter2ThemeProps } from '../art/chapter2';
import { THEMES } from '../art/themes';
import { buildTileset } from '../art/tiles';
import { buildBackgrounds } from '../art/backgrounds';
import { buildThemeProps } from '../art/props';
import type { UIScene } from './UIScene';

const ADD = Phaser.BlendModes.ADD;

interface Bolt extends Phaser.Physics.Arcade.Image {
  big: boolean;
  life: number;
  hitSet: Set<Enemy>;
}

export class GameScene extends Phaser.Scene {
  levelIndex = 0;
  levelDef!: LevelDef;
  startCheckpoint = -1;
  level!: LevelMap;
  controls!: Controls;
  player!: Player;
  pip!: Pip;
  fx!: Fx;
  lighting!: Lighting;
  enemies: Enemy[] = [];
  boss: Guardian | Warden | ShadowBoss | ShadowHeart | null = null;
  hooks: HookNode[] = [];
  ilse: Ilse | null = null;
  pipControl = false;
  motes: Phaser.GameObjects.Image[] = [];
  timeWaves: { img: Phaser.GameObjects.Rectangle; dir: number; past: boolean; life: number }[] = [];
  private rope!: Phaser.GameObjects.Graphics;
  private orbPipT = 0;
  past = false;
  ecoBlocks: EcoBlock[] = [];
  updrafts: Updraft[] = [];
  buds: VineBud[] = [];
  lanterns: Lantern[] = [];
  private ecoCd = 0;
  breaks: BreakWall[] = [];
  movers: Mover[] = [];
  belts: Belt[] = [];
  crushers: Crusher[] = [];
  pendulums: Pendulum[] = [];
  shots!: Phaser.Physics.Arcade.Group;
  bombs!: Phaser.Physics.Arcade.Group;
  doors: Door[] = [];
  plates: Plate[] = [];
  mechs: Mechanism[] = [];
  checkpoints: Checkpoint[] = [];
  lores: Lore[] = [];
  hints: Hint[] = [];
  orbs: Orb[] = [];
  exits: Exit[] = [];
  hides: HideSpot[] = [];
  cocoons: Cocoon[] = [];
  ghosts: GhostPlatform[] = [];
  crates: Crate[] = [];
  arcs: ArcEmitter[] = [];
  rocks: Stalactite[] = [];
  bouncers: Bouncer[] = [];
  vents: SporeVent[] = [];
  lamps: Lamp[] = [];
  bolts!: Phaser.Physics.Arcade.Group;
  enemyGroup!: Phaser.Physics.Arcade.Group;
  spits!: Phaser.Physics.Arcade.Group;
  shocks: Phaser.GameObjects.Image[] = [];
  paused = false;
  cutscene = false;
  finished = false;
  bossStarted = false;
  bossArena: [number, number] | null = null;
  private lookAhead = 0;
  private boltTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fogs: Phaser.GameObjects.TileSprite[] = [];
  private shotLights: Light[] = [];
  private elapsed = 0;
  private focusTween: Phaser.Tweens.Tween | null = null;
  private heartbeatT = 0;
  private screenshotFreeze = false;

  constructor() {
    super('Game');
  }

  init(data: { level?: number; checkpoint?: number }) {
    this.levelIndex = data.level ?? Save.data.level ?? 0;
    this.startCheckpoint = data.checkpoint ?? -1;
    this.levelDef = LEVELS[this.levelIndex];
    this.enemies = [];
    this.doors = [];
    this.plates = [];
    this.mechs = [];
    this.checkpoints = [];
    this.lores = [];
    this.hints = [];
    this.orbs = [];
    this.exits = [];
    this.hides = [];
    this.cocoons = [];
    this.ghosts = [];
    this.crates = [];
    this.arcs = [];
    this.rocks = [];
    this.bouncers = [];
    this.vents = [];
    this.lamps = [];
    this.shocks = [];
    this.fogs = [];
    this.boss = null;
    this.hooks = [];
    this.ilse = null;
    this.pipControl = false;
    this.motes = [];
    this.timeWaves = [];
    this.past = false;
    this.ecoBlocks = [];
    this.updrafts = [];
    this.buds = [];
    this.lanterns = [];
    this.breaks = [];
    this.movers = [];
    this.belts = [];
    this.crushers = [];
    this.pendulums = [];
    this.bossStarted = false;
    this.bossArena = null;
    this.paused = false;
    this.cutscene = false;
    this.finished = false;
    this.elapsed = 0;
  }

  get ui() {
    return this.scene.get('UI') as UIScene;
  }

  create() {
    const def = this.levelDef;
    const th = THEMES[def.theme];
    buildTileset(this, def.theme);
    buildBackgrounds(this, def.theme);
    buildThemeProps(this, def.theme);
    buildChapter2ThemeProps(this, def.theme);
    this.physics.world.TILE_BIAS = 20;
    this.level = new LevelMap(this, def);
    this.level.build();
    const L = this.level;
    this.physics.world.setBounds(0, 0, L.widthPx, L.heightPx + 400);
    this.physics.world.setBoundsCollision(true, true, true, false);
    this.controls = new Controls(this);
    this.fx = new Fx(this);
    this.lighting = new Lighting(this, def.darkness, th.darkColor);

    // spawn everything
    const sp = (c: string) => L.spawns.filter((s) => s.ch === c).sort((a, b) => a.tx - b.tx);
    const start = sp('P')[0];
    const persist = this.persisted();
    sp('D').forEach((s) => this.doors.push(new Door(this, s)));
    sp('R').forEach((s) => this.doors.push(new Door(this, s)));
    sp('n').forEach((s) => this.hooks.push(new HookNode(this, s.x, s.y - 16)));
    sp('_').forEach((s) => this.plates.push(new Plate(this, s)));
    sp('M').forEach((s) => this.mechs.push(new Mechanism(this, s)));
    sp('C').forEach((s, i) => this.checkpoints.push(new Checkpoint(this, s, i)));
    sp('o').forEach((s, i) => this.lores.push(new Lore(this, s, i)));
    sp('i').forEach((s, i) => def.hints[i] && this.hints.push(new Hint(this, s, def.hints[i])));
    sp('+').forEach((s) => this.orbs.push(new Orb(this, s)));
    sp('E').forEach((s) => this.exits.push(new Exit(this, s)));
    sp('G').forEach((s) => this.hides.push(new HideSpot(this, s)));
    sp('w').forEach((s) => this.cocoons.push(new Cocoon(this, s)));
    sp('h').forEach((s) => this.ghosts.push(new GhostPlatform(this, s)));
    sp('B').forEach((s) => this.crates.push(new Crate(this, s)));
    sp('!').forEach((s) => this.arcs.push(new ArcEmitter(this, s)));
    sp('r').forEach((s) => this.rocks.push(new Stalactite(this, s)));
    sp('m').forEach((s) => this.bouncers.push(new Bouncer(this, s)));
    sp('%').forEach((s) => this.vents.push(new SporeVent(this, s)));
    sp('L').forEach((s) => this.lamps.push(new Lamp(this, s)));
    sp('N').forEach((s) => this.mechs.push(new Mechanism(this, s)));
    sp('Q').forEach((s) => this.ecoBlocks.push(new EcoBlock(this, s, true)));
    sp('q').forEach((s) => this.ecoBlocks.push(new EcoBlock(this, s, false)));
    this.ecoBlocks.forEach((b) => b.apply(true));
    sp('u').forEach((s) => this.updrafts.push(new Updraft(this, s)));
    sp('g').forEach((s, i) => this.buds.push(new VineBud(this, s, i)));
    sp('l').forEach((s) => this.lanterns.push(new Lantern(this, s)));
    sp('K').forEach((s) => this.breaks.push(new BreakWall(this, s)));
    sp('T').forEach((s) => this.movers.push(new Mover(this, s)));
    sp('Y').forEach((s) => this.movers.push(new Mover(this, s)));
    sp('Z').forEach((s) => this.crushers.push(new Crusher(this, s)));
    sp('p').forEach((s) => this.pendulums.push(new Pendulum(this, s)));
    // conveyor runs
    for (let y = 0; y < L.H; y++)
      for (let x = 0; x < L.W; x++) {
        const c = L.grid[y][x];
        if ((c === '{' || c === '}') && L.grid[y][x - 1] !== c) {
          let e = x;
          while (L.grid[y][e + 1] === c) e++;
          this.belts.push(new Belt(this, x, e, y, c === '}' ? 1 : -1));
        }
      }
    // link switches to their nearest door
    const nearestDoor = (s: Spawn) => this.doors.filter((d) => !d.ritual).reduce<Door | null>((best, d) => (!best || Math.abs(d.s.x - s.x) + Math.abs(d.s.y - s.y) < Math.abs(best.s.x - s.x) + Math.abs(best.s.y - s.y) ? d : best), null);
    this.plates.forEach((p) => (p.door = nearestDoor(p.s)));
    this.mechs.forEach((m) => (m.door = nearestDoor(m.s)));
    this.lores.forEach((l) => {
      if (Save.data.lore.includes(`${def.id}-${l.index}`)) l.img.setAlpha(0.35);
    });

    // player & pip
    let px = start.x, py = start.y;
    if (this.startCheckpoint >= 0 && this.checkpoints[this.startCheckpoint]) {
      const cp = this.checkpoints[this.startCheckpoint];
      px = cp.s.x + 24;
      py = cp.s.y;
      for (let i = 0; i <= this.startCheckpoint; i++) this.checkpoints[i].light(true);
    }
    this.player = new Player(this, px, py);
    const ilseSpawn = sp('I')[0];
    if (ilseSpawn) {
      const ix = this.startCheckpoint >= 0 && this.checkpoints[this.startCheckpoint].s.x > ilseSpawn.x ? px - 50 : ilseSpawn.x;
      this.ilse = new Ilse(this, ix, this.startCheckpoint >= 0 && ix === px - 50 ? py : ilseSpawn.y);
    }
    this.pip = new Pip(this, px - 30, py - 80);
    // restore persisted puzzle progress for this chapter run
    this.mechs.forEach((m, i) => {
      if (persist.mechs.includes(i)) {
        m.active = true;
        m.img.setFrame(1);
        m.glow.setAlpha(0.55);
        m.door?.openPermanent();
        if (m.door) m.door.progress = 1;
      }
    });
    this.cocoons.forEach((c, i) => persist.cocoons.includes(i) && c.hit(true));
    this.buds.forEach((b, i) => (persist.vines || []).includes(i) && b.grow(true));

    // enemies
    for (const s of L.spawns) {
      if (s.ch === 'c') this.enemies.push(new Crawler(this, s.x, s.y, s.tx, s.ty));
      if (s.ch === 's') this.enemies.push(new Stalker(this, s.x, s.y));
      if (s.ch === 'b') this.enemies.push(new Burrower(this, s.x, s.y));
      if (s.ch === 'X') this.enemies.push(new Guardian(this, s.x, s.y, false, [s.x - 9 * TILE, s.x + 7 * TILE]));
      if (s.ch === 'd') this.enemies.push(new Drone(this, s.x, s.y));
      if (s.ch === 'f') this.enemies.push(new Mimic(this, s.x, s.y));
      if (s.ch === 'J') this.enemies.push(new Jelly(this, s.x, s.y));
      if (s.ch === 'S') this.enemies.push(new VeiledShade(this, s.x, s.y));
      if (s.ch === 'k') this.enemies.push(new Guardian(this, s.x, s.y, false, [s.x - 8 * TILE, s.x + 8 * TILE], 'keeper'));
      if (s.ch === 'W' || s.ch === 'V' || s.ch === 'O' || s.ch === 'U') {
        // arena = open floor span around the boss
        let a = s.tx, b = s.tx;
        while (a > 0 && !L.solid(a - 1, s.ty) && s.tx - a < 24) a--;
        while (b < L.W - 1 && !L.solid(b + 1, s.ty) && !this.doors.some((d) => d.s.tx === b + 1) && b - s.tx < 24) b++;
        this.bossArena = [a * TILE, (b + 1) * TILE];
        const g = s.ch === 'W' ? new Guardian(this, s.x, s.y, true, [a * TILE + 90, (b + 1) * TILE - 90]) : s.ch === 'V' ? new Warden(this, s.x, s.y, [a * TILE + 120, (b + 1) * TILE - 120]) : s.ch === 'O' ? new ShadowBoss(this, s.x, s.y, [a * TILE + 100, (b + 1) * TILE - 100]) : new ShadowHeart(this, s.x, s.y);
        this.boss = g;
        this.enemies.push(g);
      }
    }
    // lift scattered enemies out of persisted-cleared state not needed: enemies respawn per attempt

    // groups & colliders
    const doorZones0 = () => this.doors.map((d) => d.zone);
    this.bolts = this.physics.add.group({ allowGravity: false });
    this.spits = this.physics.add.group({ allowGravity: true });
    const doorZones = this.doors.map((d) => d.zone);
    const cocoonImgs = this.cocoons.map((c) => c.img);
    const ghostImgs = this.ghosts.map((g) => g.img);
    const crateImgs = this.crates.map((c) => c.img);
    const breakImgs = this.breaks.map((b) => b.img);
    const moverImgs = this.movers.map((m) => m.img);
    const moverOneWay = (a: any, b: any) => {
      const rider = (moverImgs.includes(a) ? b : a) as any;
      const rb = rider.body as Phaser.Physics.Arcade.Body;
      if (rider === this.player && (this.player.dropThrough > 0 || this.player.state === 'climb')) return false;
      const mb = ((moverImgs.includes(a) ? a : b) as any).body as Phaser.Physics.Arcade.Body;
      return rb.velocity.y >= -5 && rb.bottom - rb.velocity.y / 60 - 16 <= mb.top;
    };
    this.physics.add.collider(this.player, moverImgs, undefined, moverOneWay);
    this.physics.add.collider(crateImgs, moverImgs, undefined, moverOneWay);
    this.physics.add.collider(this.player, breakImgs);
    const ecoImgs = this.ecoBlocks.map((b) => b.img);
    this.physics.add.collider(this.player, ecoImgs);
    this.physics.add.collider(crateImgs, ecoImgs);
    this.physics.add.collider(crateImgs, breakImgs);
    const oneWay = (obj: any, tile: Phaser.Tilemaps.Tile) => {
      if (tile.index === 32 || tile.index === 33) {
        if (obj === this.player && (this.player.dropThrough > 0 || this.player.state === 'climb')) return false;
      }
      return true;
    };
    this.physics.add.collider(this.player, L.ground, undefined, oneWay as any);
    if (this.ilse) {
      this.physics.add.collider(this.ilse, L.ground, undefined, ((_i: any, t: Phaser.Tilemaps.Tile) => t.index !== 33 || true) as any);
      this.physics.add.collider(this.ilse, doorZones0());
    }
    this.physics.add.collider(this.player, doorZones);
    this.physics.add.collider(this.player, cocoonImgs);
    this.physics.add.collider(this.player, ghostImgs);
    this.physics.add.collider(this.player, crateImgs);
    this.physics.add.collider(crateImgs, L.ground);
    this.physics.add.collider(crateImgs, crateImgs);
    this.physics.add.collider(crateImgs, doorZones);
    this.physics.add.collider(crateImgs, cocoonImgs);
    this.physics.add.collider(crateImgs, ghostImgs);
    const enemyBodies = this.enemies.filter((e) => e instanceof Guardian || e instanceof Crawler);
    this.physics.add.collider(enemyBodies, L.ground, undefined, ((e: any) => !(e instanceof Crawler) || e.mode === 'leap') as any);
    this.physics.add.collider(enemyBodies.filter((e) => e instanceof Guardian), doorZones);
    // NB: Arcade may hand group-vs-array overlap pairs over in either order, so every callback sorts its pair.
    const isBolt = (o: any): o is Bolt => !!o && o.hitSet instanceof Set;
    const pick = <T,>(a: any, b: any, test: (o: any) => boolean): [T, any] => (test(a) ? [a, b] : [b, a]);
    this.physics.add.collider(this.bolts, L.ground, (a, b) => this.boltImpact(pick<Bolt>(a, b, isBolt)[0]));
    this.physics.add.collider(this.bolts, doorZones, (a, b) => this.boltImpact(pick<Bolt>(a, b, isBolt)[0]));
    this.physics.add.overlap(this.bolts, cocoonImgs, (a, b) => {
      const [bolt, c] = pick<Bolt>(a, b, isBolt);
      const co = this.cocoons.find((x) => x.img === c);
      if (co && co.alive) {
        co.hit(bolt.big);
        if (!co.alive) this.persistAdd('cocoons', this.cocoons.indexOf(co));
      }
      this.boltImpact(bolt);
    });
    this.enemyGroup = this.physics.add.group();
    this.enemies.forEach((e) => this.addEnemyToGroup(e));
    this.physics.add.overlap(this.bolts, this.enemyGroup, (a, b) => {
      const [bolt, e] = pick<Bolt>(a, b, isBolt);
      this.boltHitsEnemy(bolt, e as Enemy);
    });
    this.physics.add.overlap(this.bolts, this.rocks.map((r) => r.img), (a, b) => {
      const [bolt, r] = pick<Bolt>(a, b, isBolt);
      const rock = this.rocks.find((x) => x.img === r);
      if (rock && rock.mode === 'hang') {
        rock.trigger();
        this.boltImpact(bolt);
      }
    });
    const isSpit = (o: any) => !!o && o.texture?.key === 'spit';
    this.physics.add.collider(this.spits, L.ground, (a, b) => this.spitSplat(pick<Phaser.Physics.Arcade.Image>(a, b, isSpit)[0]));
    this.physics.add.overlap(this.bolts, breakImgs, (a, b) => {
      const [bolt, w] = pick<Bolt>(a, b, isBolt);
      const bw = this.breaks.find((x) => x.img === w);
      if (bw && bw.alive) bw.hit(bolt.big);
      this.boltImpact(bolt);
    });
    this.physics.add.overlap(this.bolts, this.buds.map((b) => b.img), (a, b) => {
      const [bolt, im] = pick<Bolt>(a, b, isBolt);
      const bud = this.buds.find((x) => x.img === im);
      if (bud && !bud.grown) {
        bud.hit(bolt.big);
        if (bud.grown) this.persistAdd('vines', bud.index);
        this.boltImpact(bolt);
      }
    });
    this.shots = this.physics.add.group({ allowGravity: false });
    this.bombs = this.physics.add.group({ allowGravity: true });
    const isShot = (o: any) => !!o && o.getData?.('shot');
    const isBomb = (o: any) => !!o && o.getData?.('bomb');
    this.physics.add.collider(this.shots, L.ground, (a, b) => this.spitSplat(pick<Phaser.Physics.Arcade.Image>(a, b, isShot)[0]));
    this.physics.add.collider(this.shots, doorZones, (a, b) => this.spitSplat(pick<Phaser.Physics.Arcade.Image>(a, b, isShot)[0]));
    this.physics.add.overlap(this.shots, this.player, (a, b) => {
      const [sh] = pick<Phaser.Physics.Arcade.Image>(a, b, isShot);
      this.player.hurt(1, sh.x);
      this.spitSplat(sh);
    });
    this.physics.add.collider(this.bombs, L.ground, (a, b) => this.explodeBomb(pick<Phaser.Physics.Arcade.Image>(a, b, isBomb)[0]));
    this.physics.add.overlap(this.bombs, this.player, (a, b) => this.explodeBomb(pick<Phaser.Physics.Arcade.Image>(a, b, isBomb)[0]));
    this.physics.add.overlap(this.spits, this.player, (a, b) => {
      const [sp] = pick<Phaser.Physics.Arcade.Image>(a, b, isSpit);
      this.player.hurt(1, sp.x);
      this.spitSplat(sp);
    });
    if (this.ilse) {
      const il = this.ilse;
      this.physics.add.collider(il, this.movers.map((m) => m.img));
      this.physics.add.overlap(il, this.enemyGroup, (a, b) => {
        const en = (a === il ? b : a) as Enemy;
        if (en.alive && en.contactDamage > 0 && en.body.enable) il.hurt(1);
      });
      this.physics.add.overlap(il, this.shots, (a, b) => { const sh = (a === il ? b : a) as Phaser.Physics.Arcade.Image; il.hurt(1); this.spitSplat(sh); });
    }
    this.physics.add.overlap(this.player, this.enemyGroup, (a, b) => {
      const en = (a === this.player ? b : a) as Enemy;
      if (en.alive && en.contactDamage > 0 && en.body.enable) this.player.hurt(en.contactDamage, en.x);
    });
    this.rope = this.add.graphics().setDepth(DEPTH.glow).setBlendMode(ADD);
    this.boltTrail = this.add.particles(0, 0, 'dot', {
      emitting: false, lifespan: 260, speed: { min: 0, max: 20 }, scale: { start: 0.45, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0x7ff5e0, 0xd0fff8], blendMode: 'ADD',
    }).setDepth(DEPTH.glow);

    this.buildAtmosphere();

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.widthPx, L.heightPx);
    cam.startFollow(this.player, true, 0.085, 0.1, 0, 30);
    cam.setDeadzone(40, 70);
    cam.setBackgroundColor('rgba(0,0,0,0)');
    this.applyZoom();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    // background parallax + UI overlays
    this.scene.launch('BG', { theme: def.theme });
    this.scene.sendToBack('BG');
    const ready = () => {
      this.scene.bringToTop('UI');
      this.ui.attach(this);
      this.introCinematic();
    };
    const ui = this.ui as UIScene & { ready?: boolean };
    if (ui.ready && this.scene.isActive('UI')) ready();
    else {
      ui.events.once('create', ready);
      if (!this.scene.isActive('UI')) this.scene.launch('UI');
    }
    Sound.playTheme(def.music);
    Crazy.gameplayStart();
    this.installHooks();
  }

  // ------------------------------------------------------------------ atmosphere
  private buildAtmosphere() {
    const L = this.level;
    const th = THEMES[this.levelDef.theme];
    const fogTint = Phaser.Display.Color.HexStringToColor(th.fog).color;
    const accent = Phaser.Display.Color.HexStringToColor(th.accent).color;
    const r = Phaser.Math.RND;
    r.sow([this.levelDef.id]);
    // drifting fog bands
    const bands: [number, number, number][] = [
      [L.heightPx - 230, 0.22, DEPTH.decorBack - 1],
      [L.heightPx - 190, 0.16, DEPTH.fog],
      [L.heightPx * 0.42, 0.1, DEPTH.decorBack - 1],
    ];
    for (const [y, a, d] of bands) {
      const f = this.add.tileSprite(L.widthPx / 2, y, L.widthPx, 160, 'fog').setTint(fogTint).setAlpha(a).setDepth(d).setScale(1, 1.6);
      if (d === DEPTH.fog) f.setBlendMode(ADD);
      this.fogs.push(f);
    }
    // god-ray light shafts falling from openings in the ceiling
    for (let x = 300 + r.between(0, 300); x < L.widthPx - 200; x += r.between(420, 820)) {
      const tx = Math.floor(x / TILE);
      let ty = 1;
      while (ty < L.H - 2 && L.solid(tx, ty)) ty++;
      if (ty > L.H - 6) continue;
      const beam = this.add.image(x, ty * TILE - 10, 'beam').setOrigin(0.5, 0).setTint(accent).setBlendMode(ADD)
        .setAlpha(0.07 + r.frac() * 0.07).setScale(1.4 + r.frac(), 0.9).setAngle(r.between(-14, 14)).setDepth(DEPTH.decorBack);
      this.tweens.add({ targets: beam, alpha: beam.alpha * 0.4, duration: r.between(2500, 4500), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    // foreground silhouettes (parallax nearer than the playfield)
    for (let x = r.between(500, 1000); x < L.widthPx * 1.3; x += r.between(1400, 2200)) {
      const top = r.frac() < 0.35;
      const img = this.add.image(x, top ? -140 : L.heightPx + 250, `fg-${this.levelDef.theme}-${r.between(0, 2)}`).setOrigin(0.5, top ? 0 : 1).setScrollFactor(1.3, 1.05)
        .setDepth(DEPTH.fgSilhouette).setScale(0.6 + r.frac() * 0.25).setFlipX(r.frac() < 0.5).setFlipY(top).setAlpha(0.9);
      void img;
    }
  }

  /** Register a (possibly late-spawned) enemy with the overlap group without disturbing its body settings. */
  addEnemyToGroup(e: Enemy) {
    const b = e.body;
    const saved = { g: b.allowGravity, m: b.moves, i: b.immovable };
    this.enemyGroup.add(e, false);
    b.setAllowGravity(saved.g);
    b.moves = saved.m;
    b.immovable = saved.i;
  }

  // ------------------------------------------------------------------ camera
  private onResize() {
    this.applyZoom();
    this.lighting.resize();
  }
  applyZoom() {
    const w = this.scale.width, h = this.scale.height;
    const z = Phaser.Math.Clamp(Math.min(h / VIEW_H, w / VIEW_W_MIN), 0.5, 2.4);
    this.cameras.main.setZoom(z);
  }
  cinematicFocus(x: number, y: number, ms: number) {
    const cam = this.cameras.main;
    if (this.focusTween) this.focusTween.stop();
    cam.stopFollow();
    cam.pan(x, y, 700, 'Sine.easeInOut');
    this.time.delayedCall(ms, () => {
      if (!this.scene.isActive()) return;
      cam.pan(this.player.x, this.player.y, 500, 'Sine.easeInOut', false, (_c: any, p: number) => {
        if (p >= 1) cam.startFollow(this.player, true, 0.085, 0.1, 0, 30);
      });
    });
  }

  private introCinematic() {
    const def = this.levelDef;
    this.cutscene = true;
    this.player.setPState('cutscene');
    const cam = this.cameras.main;
    const z = cam.zoom;
    cam.setZoom(z * 1.18);
    this.tweens.add({ targets: cam, zoom: z, duration: 2600, ease: 'Sine.inOut' });
    cam.fadeIn(1200, 0, 0, 0);
    this.ui.letterbox(true);
    if (this.startCheckpoint < 0) this.ui.chapterCard(def.subtitle, def.name);
    const wake = this.levelIndex === 0 && this.startCheckpoint < 0;
    if (wake) {
      this.player.play('elias-wake');
      (this.player as any).lastAnim = 'wake';
      this.player.anims.pause();
      this.pip.x = this.player.x + 120;
      this.pip.y = this.player.y - 140;
      this.time.delayedCall(1400, () => {
        this.player.anims.resume();
        Sound.play('wake');
      });
    }
    this.time.delayedCall(wake ? 2600 : 1300, () => {
      this.cutscene = false;
      this.player.setPState('air');
      this.ui.letterbox(false);
    });
  }

  // ------------------------------------------------------------------ main loop
  update(_t: number, dms: number) {
    const dt = Math.min(dms, 50) / 1000;
    if (this.screenshotFreeze) {
      this.lighting.render();
      return;
    }
    this.elapsed += dt;
    this.controls.update();
    if (this.controls.pressed.pause && !this.finished && this.player.state !== 'dead') {
      this.ui.openPause();
      return;
    }
    if (this.fx.inHitstop) {
      this.collectLights();
      this.lighting.render();
      return;
    }
    const p = this.player;
    // Pip's Echo: switch between the present and the Keepers' past
    this.ecoCd = Math.max(0, this.ecoCd - dt);
    if (this.controls.pressed.eco && this.levelDef.eco && !this.cutscene && p.state !== 'dead') this.toggleEco();
    // Pip command
    if (this.controls.pressed.pip && !this.cutscene && p.state !== 'dead') {
      const r = this.pip.command();
      if (r === 'lure') this.toast(t('Pip sings — creatures will follow her'), 1400);
    }
    if (!this.cutscene && !this.pipControl) p.update(dt);
    else p.animate();
    this.ilse?.update(dt);
    this.updateHooks(dt);
    this.pip.update(dt);
    for (const e of this.enemies) if (e.active) e.tick(dt);
    this.enemies = this.enemies.filter((e) => e.active);
    for (const d of this.doors) d.update(dt);
    for (const pl of this.plates) pl.update();
    for (const m of this.mechs) m.update(dt);
    for (const g of this.ghosts) g.update(this.elapsed);
    for (const c of this.crates) c.update(dt);
    for (const a of this.arcs) a.update(dt);
    for (const r of this.rocks) r.update(dt);
    for (const b of this.bouncers) b.update(dt);
    for (const v of this.vents) v.update(dt);
    for (const l of this.lamps) l.update(dt);
    for (const m of this.movers) m.update(dt);
    for (const b of this.belts) b.update(dt);
    for (const c of this.crushers) c.update(dt);
    for (const pd of this.pendulums) pd.update(dt);
    for (const u of this.updrafts) u.update(dt);
    this.updateBolts(dt);
    this.updateShocks(dt);
    this.updateTriggers();
    for (const h of this.hints) h.update(p.x, p.y);
    this.updateCamera(dt);
    for (const [i, f] of this.fogs.entries()) f.tilePositionX += dt * (8 + i * 6);
    this.collectLights();
    this.lighting.render();
    this.updateBoss(dt);
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    const p = this.player;
    const target = p.state === 'swim' ? 0 : -p.facing * (Math.abs(p.body.velocity.x) > 40 ? 90 : 50);
    this.lookAhead = Phaser.Math.Linear(this.lookAhead, target, Math.min(1, dt * 1.6));
    const lookDown = p.state === 'ground' && p.crouching && Math.abs(p.body.velocity.x) < 10 && p.stateTime > 0.6 ? -60 : 0;
    cam.setFollowOffset(this.lookAhead, 30 + lookDown);
  }

  private collectLights() {
    const lights: Light[] = [];
    const p = this.player;
    lights.push({ x: this.pip.x, y: this.pip.y, r: this.pip.lightRadius * 2.1, i: 1 });
    lights.push({ x: p.x, y: p.y - 30, r: 120, i: 0.55 });
    for (const l of this.lamps) lights.push(l.light());
    for (const h of this.hooks) lights.push(h.light());
    for (const m of this.motes) lights.push({ x: m.x, y: m.y, r: 120, i: 0.9 });
    if (this.ilse) lights.push({ x: this.ilse.x, y: this.ilse.y - 30, r: this.ilse.mode === 'channel' || this.ilse.mode === 'hold' ? 260 : 110, i: 0.8 });
    for (const ln of this.lanterns) { const L = ln.light(); if (L) lights.push(L); }
    for (const a of this.arcs) {
      const L = a.light();
      if (L) lights.push(L);
    }
    for (const m of this.mechs) lights.push({ x: m.orb.x, y: m.orb.y, r: m.active ? 230 : 110, i: m.active ? 0.9 : 0.5 });
    for (const c of this.checkpoints) if (c.lit) lights.push({ x: c.s.x, y: c.s.y - 50, r: 220, i: 0.9 });
    for (const e of this.exits) lights.push({ x: e.s.x, y: e.s.y - 40, r: 300, i: 1 });
    for (const l of this.lores) lights.push({ x: l.s.x, y: l.s.y - 20, r: 90, i: 0.6 });
    for (const o of this.orbs) if (!o.taken) lights.push({ x: o.s.x, y: o.s.y - 16, r: 80, i: 0.6 });
    for (const b of this.bouncers) lights.push({ x: b.s.x, y: b.s.y - 10, r: 120, i: 0.6 });
    for (const g of this.ghosts) if (g.revealed) lights.push({ x: g.s.x, y: g.img.y, r: 70, i: 0.5 });
    for (const b of this.bolts.getChildren() as Bolt[]) lights.push({ x: b.x, y: b.y, r: b.big ? 220 : 130, i: 1 });
    for (const sl of this.shotLights) lights.push(sl);
    if (this.boss && this.boss.coreOpen) {
      const c = this.boss.corePos();
      lights.push({ x: c.x, y: c.y, r: 260, i: 1 });
    }
    this.shotLights = this.shotLights.filter((l) => (l.i -= 0.12) > 0);
    this.lighting.lights = lights;
  }

  lightAt(x: number, y: number) {
    // Pip, lamps and live bolts only (the player's own faint glow doesn't count)
    let best = 0;
    for (const L of this.lighting.lights.slice(0, 1).concat(this.lighting.lights.slice(2))) {
      const d = Math.hypot(L.x - x, L.y - y), r = L.r * 0.55;
      if (d < r) best = Math.max(best, (1 - d / r) * 1.6 * L.i);
    }
    return Math.min(1, best);
  }

  // ------------------------------------------------------------------ triggers
  private updateTriggers() {
    const p = this.player;
    if (p.state === 'dead' || this.finished) return;
    const px = p.x, py = p.y;
    for (const c of this.checkpoints) {
      if (!c.lit && Math.abs(px - c.s.x) < 22 && Math.abs(py - c.s.y) < 60) {
        c.light();
        p.heal(p.maxHp);
        this.ilse?.heal();
        Save.setCheckpoint(this.levelIndex, c.index);
      }
    }
    for (const l of this.lores) {
      if (!l.taken && Math.abs(px - l.s.x) < 24 && Math.abs(py - l.s.y) < 50) {
        l.taken = true;
        const id = `${this.levelDef.id}-${l.index}`;
        Save.addLore(id);
        Sound.play('lore');
        this.fx.glowE.explode(16, l.s.x, l.s.y - 20);
        this.tweens.add({ targets: [l.img, l.glow], alpha: 0, duration: 400 });
        this.ui.showLog(this.levelDef.lore[l.index] || '');
      }
    }
    for (const o of this.orbs) {
      if (!o.taken && Math.abs(px - o.s.x) < 24 && Math.abs(py - 16 - o.s.y) < 40) {
        o.taken = true;
        p.heal(1);
        Sound.play('pickup');
        this.fx.glowE.explode(14, o.s.x, o.s.y - 16);
        o.img.destroy();
      }
    }
    p.inHideZone = this.hides.some((h) => h.contains(px, py));
    for (const e of this.exits) {
      if (Math.abs(px - e.s.x) < 26 && Math.abs(py - e.s.y) < 50 && !this.finished && (!this.boss || !this.boss.alive)) this.completeLevel(e);
    }
    // boss arena entry
    if (this.boss && !this.bossStarted && this.bossArena && px > this.bossArena[0] + 7 * TILE) this.startBoss();
  }

  touchingCrate(p: Player, dir: number) {
    return this.crates.some((c) => {
      const b = c.body;
      return Math.abs(b.center.y - p.body.center.y) < 40 && (dir > 0 ? Math.abs(b.left - p.body.right) < 4 : Math.abs(p.body.left - b.right) < 4);
    });
  }

  enemyNear(x: number, y: number, r: number) {
    return this.enemies.some((e) => e.alive && Phaser.Math.Distance.Between(e.x, e.y, x, y) < r);
  }

  // ------------------------------------------------------------------ Chapter IV: Light Thread, Ilse, the final battle
  findHookNode(x: number, y: number) {
    let best: HookNode | null = null, bd = 290, bs = Infinity;
    const p = this.player;
    for (const h of this.hooks) {
      if (h.y > y + 40) continue;
      if (p.lastAnchor && p.lastAnchor.x === h.x && p.lastAnchor.y === h.y && this.time.now - p.lastRelease < 500) continue;
      const d = Phaser.Math.Distance.Between(x, y, h.x, h.y);
      if (d >= bd) continue;
      // prefer nodes ahead of Elias
      const score = d - (Math.sign(h.x - x) === p.facing ? 90 : 0);
      if (score >= bs) continue;
      const steps = Math.ceil(d / 16);
      let blocked = false;
      for (let i = 1; i < steps - 1 && !blocked; i++) blocked = this.level.solidAtWorld(x + ((h.x - x) * i) / steps, y + ((h.y - y) * i) / steps);
      if (blocked) continue;
      bs = score;
      best = h;
    }
    return best;
  }

  private updateHooks(dt: number) {
    const p = this.player;
    this.rope.clear();
    if (p.state === 'swing' && p.anchor) {
      const hx = p.x + p.facing * 8, hy = p.y - 40;
      this.rope.lineStyle(5, 0xffd27a, 0.35).lineBetween(hx, hy, p.anchor.x, p.anchor.y);
      this.rope.lineStyle(1.6, 0xfff6d0, 1).lineBetween(hx, hy, p.anchor.x, p.anchor.y);
      const node = this.hooks.find((h) => h.dark && Math.abs(h.x - p.anchor!.x) < 4 && Math.abs(h.y - p.anchor!.y) < 4);
      if (node) {
        node.purify += dt;
        if (Math.random() < 0.5) this.fx.glowE.explode(1, node.x, node.y);
        if (node.purify >= 1.6) {
          node.setDark(false);
          this.fx.ring(node.x, node.y, 0xffd27a);
          if (this.boss instanceof ShadowHeart) this.boss.nodePurified();
        }
      }
    }
    // shadow infection makes the node hurt to hang from... briefly
    for (const w of this.timeWaves) {
      w.img.x += w.dir * 230 * dt;
      w.life -= dt;
      const active = w.past === this.past;
      w.img.setAlpha(active ? 0.75 : 0.16);
      const b = p.body;
      if (active && p.state !== 'cutscene' && Math.abs(b.center.x - w.img.x) < 16 && b.bottom > w.img.y - w.img.height && b.top < w.img.y) p.hurt(1, w.img.x - w.dir * 10);
    }
    this.timeWaves = this.timeWaves.filter((w) => {
      if (w.life <= 0 || (this.bossArena && (w.img.x < this.bossArena[0] || w.img.x > this.bossArena[1]))) { w.img.destroy(); return false; }
      return true;
    });
    if (this.pipControl) this.updatePipControl(dt);
  }

  infectNodes(n: number) {
    const b = this.boss!;
    this.hooks.slice().sort((a, c) => Math.abs(a.x - b.x) - Math.abs(c.x - b.x)).slice(0, n).forEach((h) => h.setDark(true));
  }

  darkNodes() {
    return this.hooks.filter((h) => h.dark).length;
  }

  /** A wall of shadow that exists only in one time (gold = past, violet = present). */
  spawnTimeWave(x: number, past: boolean) {
    const floor = this.level.heightPx - 5 * TILE;
    for (const dir of [-1, 1]) {
      const r = this.add.rectangle(x + dir * 40, floor, 22, 120, past ? 0xffc860 : 0x9a4ae0, 0.75).setOrigin(0.5, 1).setDepth(DEPTH.glow).setBlendMode(ADD);
      this.timeWaves.push({ img: r, dir, past, life: 6 });
    }
    Sound.play(past ? 'reveal' : 'stalker');
  }

  onRitualStart(door: Door) {
    this.toast(t('Protect Ilse while she opens the Keeper door!'), 2200);
    const il = this.ilse!;
    for (const dx of [-260, 260]) {
      const s = new VeiledShade(this, door.s.x + dx, door.s.y - 40, true);
      s.prey = il;
      s.mode = 'hunt';
      this.spawnEnemy(s);
    }
    const s2 = new VeiledShade(this, door.s.x - 380, door.s.y - 60);
    s2.prey = il;
    this.spawnEnemy(s2);
  }

  onIlseDown() {
    this.player.die();
    this.time.delayedCall(800, () => this.toast(t('Ilse has fallen'), 2000));
  }

  private updatePipControl(dt: number) {
    const pip = this.pip;
    for (const m of this.motes) {
      if (m.active && Phaser.Math.Distance.Between(pip.x, pip.y, m.x, m.y) < 28) {
        m.destroy();
        Sound.play('pickup');
        this.fx.glowE.explode(16, m.x, m.y);
      }
    }
    this.motes = this.motes.filter((m) => m.active);
    // shadow orbs hunt Pip
    this.orbPipT -= dt;
    if (this.orbPipT <= 0 && this.boss) {
      this.orbPipT = 1.1;
      const a = Math.atan2(pip.y - this.boss.y, pip.x - this.boss.x);
      const s = this.shots.create(this.boss.x + Math.cos(a) * 60, this.boss.y + Math.sin(a) * 60, 'spit') as Phaser.Physics.Arcade.Image;
      s.setData('shot', true).setData('pip', true).setScale(0.55).setTint(0xb06aff).setBlendMode(ADD).setDepth(DEPTH.glow);
      (s.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * 200, Math.sin(a) * 200);
      this.time.delayedCall(3000, () => s.active && s.destroy());
    }
    for (const s of this.shots.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (s.getData('pip') && Phaser.Math.Distance.Between(s.x, s.y, pip.x, pip.y) < 18) {
        s.destroy();
        pip.vx -= Math.sign(this.boss!.x - pip.x || 1) * -380;
        pip.vy -= 200;
        Sound.play('hurt');
        this.fx.flashScreen(0x6a2ad0, 0.2);
      }
    }
    if (this.motes.length === 0) this.endPipControl();
  }

  private endPipControl() {
    this.pipControl = false;
    this.pip.takeControl(false);
    const p = this.player;
    p.heal(p.maxHp);
    p.invuln = 2;
    p.setPState('air');
    Sound.play('checkpoint');
    this.fx.ring(p.x, p.y - 30, 0xffd27a);
    this.toast(t('Elias rises. Ilse runs to the Seed —'), 2000);
    const b = this.boss as ShadowHeart;
    if (!this.ilse) {
      this.ilse = new Ilse(this, this.bossArena![0] + 40, this.level.heightPx - 5 * TILE);
      this.physics.add.collider(this.ilse, this.level.ground);
    }
    this.ilse.holdAt(b.x - 30);
    const wait = this.time.addEvent({
      delay: 100, loop: true, callback: () => {
        if (!this.ilse || Math.abs(this.ilse.x - (b.x - 30)) < 24) {
          wait.remove();
          b.holdOpen();
          this.toast(t('Ilse holds the core open — now, Elias!'), 2400);
        }
      },
    });
  }

  /** Brightness 0..1 from lit Keeper lanterns at a point (what makes the Shadow solid). */
  lanternLightAt(x: number, y: number) {
    let best = 0;
    for (const l of this.lanterns) if (l.lit) best = Math.max(best, 1 - Phaser.Math.Distance.Between(x, y, l.s.x, l.ly) / 300);
    return best;
  }

  snuffLanterns() {
    if (!this.lanterns.some((l) => l.lit)) return;
    this.lanterns.forEach((l) => l.setLit(false));
    this.toast(t('The Shadow snuffs out the lanterns!'), 1600);
  }

  spawnEnemy(e: Enemy) {
    this.enemies.push(e);
    this.addEnemyToGroup(e);
  }

  spawnShadesAround(x: number, y: number) {
    const alive = this.enemies.filter((e) => e instanceof VeiledShade && e.alive).length;
    for (let i = 0; i < Math.min(2, 4 - alive); i++) this.spawnEnemy(new VeiledShade(this, x + (i ? 120 : -120), y + 60));
  }

  toggleEco() {
    if (this.ecoCd > 0) return;
    // refuse if a block of the other time would appear inside Elias or a crate
    const blockers = this.ecoBlocks.filter((b) => b.pastOnly !== this.past);
    const bodies = [this.player.body, ...this.crates.map((c) => c.body)];
    if (blockers.some((b) => bodies.some((bd) => b.overlaps(bd)))) {
      Sound.play('hurt');
      this.toast(t('Something stands in the way in the other time'), 1400);
      this.ecoCd = 0.4;
      return;
    }
    this.past = !this.past;
    this.ecoCd = 0.45;
    this.ecoBlocks.forEach((b) => b.apply());
    Sound.play(this.past ? 'reveal' : 'wake');
    this.fx.ring(this.pip.x, this.pip.y, this.past ? 0xffd27a : 0x9f8aff);
    this.cameras.main.flash(220, this.past ? 255 : 160, this.past ? 220 : 140, this.past ? 150 : 255);
    this.tweens.add({ targets: this.lighting, extra: this.past ? -0.28 : 0, duration: 400 });
    (this.scene.get('BG') as BGScene).setWarm(this.past);
    this.level.back?.forEachTile((t) => (t.tint = this.past ? 0xd8b070 : 0x585e6c));
    this.ui.setPast(this.past);
  }

  nearestMechanism(x: number, y: number, range: number) {
    let best: Mechanism | null = null, bd = range;
    for (const m of this.mechs) {
      if (m.active) continue;
      const d = Phaser.Math.Distance.Between(x, y, m.orb.x, m.orb.y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    // unlit Keeper lanterns are lit by Pip too
    let lan: Lantern | null = null;
    for (const l of this.lanterns) {
      if (l.lit) continue;
      const d = Phaser.Math.Distance.Between(x, y, l.s.x, l.ly);
      if (d < bd) { bd = d; lan = l; }
    }
    if (lan) {
      const l = lan;
      return { x: l.s.x, y: l.ly, activate: () => l.setLit(true) };
    }
    if (!best) return null;
    const m = best;
    return { x: m.orb.x, y: m.orb.y, activate: () => { m.activate(); this.persistAdd('mechs', this.mechs.indexOf(m)); } };
  }

  // ------------------------------------------------------------------ projectiles
  /** Gentle keyboard aim assist: bend the shot toward the best enemy within a cone. */
  aimAssist(x: number, y: number, base: number): number | null {
    let best: number | null = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !e.vulnerable() || !e.visible) continue;
      const b = e.body;
      const tx = b ? b.center.x : e.x, ty = b ? b.center.y : e.y;
      const d = Math.hypot(tx - x, ty - y);
      if (d > 560 || d < 8) continue;
      const a = Math.atan2(ty - y, tx - x);
      const diff = Math.abs(Phaser.Math.Angle.Wrap(a - base));
      if (diff > 0.5) continue;
      let blocked = false;
      const steps = Math.ceil(d / 16);
      for (let i = 1; i < steps && !blocked; i++) blocked = this.level.solidAtWorld(x + ((tx - x) * i) / steps, y + ((ty - y) * i) / steps);
      if (blocked) continue;
      const score = diff * 300 + d;
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  spawnBolt(x: number, y: number, ang: number, big: boolean) {
    const b = this.bolts.create(x, y, big ? 'boltbig' : 'bolt') as Bolt;
    b.big = big;
    b.life = big ? 1.1 : 0.8;
    b.hitSet = new Set();
    b.setScale(0.5).setBlendMode(ADD).setDepth(DEPTH.glow).setRotation(ang);
    const sp = big ? 760 : 900;
    b.body!.setSize(big ? 30 : 16, big ? 30 : 12);
    (b.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
    this.shotLights.push({ x, y, r: big ? 260 : 170, i: 1 });
    this.fx.glowE.explode(big ? 10 : 4, x, y);
  }

  private updateBolts(dt: number) {
    for (const b of this.bolts.getChildren() as Bolt[]) {
      b.life -= dt;
      if (Math.random() < 0.9) this.boltTrail.explode(1, b.x, b.y);
      if (this.level.waterAtWorld(b.x, b.y)) b.life -= dt * 2;
      if (b.big) for (const l of this.lanterns) if (!l.lit && Phaser.Math.Distance.Between(b.x, b.y, l.s.x, l.ly) < 26) l.setLit(true);
      if (b.life <= 0) this.boltImpact(b, true);
    }
  }

  private boltImpact(b: Bolt, fizzle = false) {
    if (!b.active) return;
    if (!fizzle) {
      this.fx.impact(b.x, b.y, b.big);
      Sound.play('hit');
      this.shotLights.push({ x: b.x, y: b.y, r: b.big ? 200 : 110, i: 0.8 });
    }
    b.destroy();
  }

  private boltHitsEnemy(b: Bolt, e: Enemy) {
    if (!b.active || !e.alive || !e.vulnerable() || b.hitSet.has(e)) return;
    if (e instanceof Burrower && !e.vulnerable()) return;
    b.hitSet.add(e);
    // overlap callbacks run before sprites sync with their bodies, so use the body's (current) position
    const bc = (b.body as Phaser.Physics.Arcade.Body).center;
    const ok = e.hit(b.big ? 3 : 1, bc.x - (b.body!.velocity.x > 0 ? 20 : -20), b.big, bc.x, bc.y);
    if (ok) {
      this.fx.impact(bc.x, bc.y, b.big);
      if (!b.big || e instanceof Guardian) b.destroy();
    }
  }

  spawnSpit(x: number, y: number, tx: number, ty: number) {
    const s = this.spits.create(x, y, 'spit') as Phaser.Physics.Arcade.Image;
    s.setScale(0.6).setBlendMode(ADD).setDepth(DEPTH.glow);
    const t = 0.85;
    const vx = (tx - x) / t;
    const vy = (ty - y - 0.5 * 1650 * t * t) / t;
    (s.body as Phaser.Physics.Arcade.Body).setVelocity(Phaser.Math.Clamp(vx, -420, 420), Phaser.Math.Clamp(vy, -900, 300));
    (s.body as Phaser.Physics.Arcade.Body).setSize(14, 14);
    this.time.delayedCall(3000, () => s.active && s.destroy());
  }

  private spitSplat(s: Phaser.Physics.Arcade.Image) {
    if (!s.active) return;
    this.fx.sparkE.explode(6, s.x, s.y);
    s.destroy();
  }

  spawnShot(x: number, y: number, vx: number, vy: number) {
    const s = this.shots.create(x, y, 'spit') as Phaser.Physics.Arcade.Image;
    s.setData('shot', true).setScale(0.45).setTint(0xd07aff).setBlendMode(ADD).setDepth(DEPTH.glow);
    (s.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy).setSize(12, 12);
    this.shotLights.push({ x, y, r: 90, i: 0.8 });
    this.time.delayedCall(2500, () => s.active && s.destroy());
  }

  spawnBomb(x: number, y: number) {
    const b = this.bombs.create(x, y, 'bomb') as Phaser.Physics.Arcade.Image;
    b.setData('bomb', true).setScale(0.7).setDepth(DEPTH.enemies + 2);
    (b.body as Phaser.Physics.Arcade.Body).setVelocity((Math.random() - 0.5) * 60, 60).setSize(18, 18).setAngularVelocity(200);
    this.time.delayedCall(4000, () => b.active && this.explodeBomb(b));
  }

  explodeBomb(b: Phaser.Physics.Arcade.Image) {
    if (!b.active) return;
    const x = b.x, y = b.y;
    b.destroy();
    Sound.play('rock', Phaser.Math.Clamp((x - this.cameras.main.midPoint.x) / 400, -1, 1));
    this.fx.impact(x, y, true);
    this.fx.dust(x, y, 10);
    this.fx.ring(x, y, 0xd07aff);
    this.shotLights.push({ x, y, r: 220, i: 1 });
    const p = this.player.body;
    if (Phaser.Math.Distance.Between(p.center.x, p.center.y, x, y) < 58) this.player.hurt(1, x);
  }

  spawnShockwave(x: number, y: number, dir: number) {
    const w = this.add.image(x, y + 2, 'shock').setOrigin(0.5, 1).setScale(0.8, 0.9).setBlendMode(ADD).setDepth(DEPTH.glow).setTint(this.boss ? 0xff9a7a : 0xbff4ff);
    w.setData('dir', dir);
    w.setData('life', 1.3);
    this.shocks.push(w);
  }

  private updateShocks(dt: number) {
    const p = this.player.body;
    for (const w of this.shocks) {
      const dir = w.getData('dir');
      w.x += dir * 330 * dt;
      const life = w.getData('life') - dt;
      w.setData('life', life);
      w.setAlpha(Math.min(1, life * 2));
      if (Math.random() < 0.5) this.fx.dust(w.x, w.y, 1);
      if (this.level.solidAtWorld(w.x + dir * 20, w.y - 10) || !this.level.solidAtWorld(w.x, w.y + 6)) w.setData('life', 0);
      if (Math.abs(p.center.x - w.x) < 22 && p.bottom > w.y - 26 && p.bottom <= w.y + 4) this.player.hurt(1, w.x - dir * 10);
    }
    this.shocks = this.shocks.filter((w) => {
      if (w.getData('life') <= 0) {
        w.destroy();
        return false;
      }
      return true;
    });
  }

  dropStalactites(x: number, n: number) {
    const cand = this.rocks.filter((r) => r.mode === 'hang').sort((a, b) => Math.abs(a.s.x - x) - Math.abs(b.s.x - x));
    cand.slice(0, n).forEach((r, i) => this.time.delayedCall(i * 250, () => r.trigger()));
  }

  beam(x1: number, y1: number, x2: number, y2: number) {
    const g = this.add.graphics().setDepth(DEPTH.glow).setBlendMode(ADD);
    let t = 0;
    const ev = this.time.addEvent({
      delay: 16, repeat: 60, callback: () => {
        t += 1 / 60;
        g.clear();
        g.lineStyle(6 * (1 - t), 0x7ff5e0, 0.5 * (1 - t));
        g.lineBetween(x1, y1, x2, y2);
        g.lineStyle(2 * (1 - t), 0xffffff, 1 - t);
        g.lineBetween(x1, y1, x2, y2);
        if (t >= 1) {
          g.destroy();
          ev.remove();
        }
      },
    });
  }

  toast(msg: string, ms = 2200) {
    this.ui.toast(msg, ms);
  }

  // ------------------------------------------------------------------ persistence within a chapter attempt
  private persisted(): { mechs: number[]; cocoons: number[]; vines?: number[] } {
    const k = 'persist-' + this.levelIndex;
    return this.registry.get(k) || { mechs: [], cocoons: [], vines: [] };
  }
  private persistAdd(kind: 'mechs' | 'cocoons' | 'vines', i: number) {
    const k = 'persist-' + this.levelIndex;
    const v = this.persisted();
    v[kind] = v[kind] || [];
    if (!v[kind]!.includes(i)) v[kind]!.push(i);
    this.registry.set(k, v);
  }

  // ------------------------------------------------------------------ death / respawn
  respawnAtSafe() {
    const p = this.player;
    this.cameras.main.flash(250, 0, 0, 0);
    p.body.setVelocity(0, 0);
    p.setCrouch(false);
    p.setPosition(p.lastSafe.x, p.lastSafe.y);
    p.body.reset(p.lastSafe.x, p.lastSafe.y);
    p.setPState('air');
    p.invuln = 1.2;
    this.pip.x = p.x - 30;
    this.pip.y = p.y - 70;
  }

  onPlayerDeath() {
    Save.data.deaths++;
    Save.write();
    Crazy.gameplayStop();
    this.time.timeScale = 0.45;
    this.tweens.timeScale = 0.45;
    this.cameras.main.zoomTo(this.cameras.main.zoom * 1.15, 1200, 'Sine.easeOut');
    this.ui.letterbox(true);
    this.time.delayedCall(700, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      this.ui.showGameOver();
    });
  }

  retry(fromCheckpoint: boolean) {
    const cp = fromCheckpoint ? this.lastLitCheckpoint() : -1;
    if (!fromCheckpoint) this.registry.remove('persist-' + this.levelIndex);
    this.scene.stop('BG');
    this.scene.restart({ level: this.levelIndex, checkpoint: cp });
  }

  lastLitCheckpoint() {
    let cp = -1;
    for (const c of this.checkpoints) if (c.lit) cp = c.index;
    return cp;
  }

  // ------------------------------------------------------------------ boss
  private startBoss() {
    const boss = this.boss!;
    this.bossStarted = true;
    const [a, b] = this.bossArena!;
    const cam = this.cameras.main;
    this.cutscene = true;
    this.player.body.setVelocity(0, 0);
    this.player.setPState('cutscene');
    this.ui.letterbox(true);
    Sound.stopMusic();
    cam.stopFollow();
    cam.pan(boss.x, Math.max(boss.y - 120, this.level.heightPx - 7 * TILE - 200), 1400, 'Sine.easeInOut');
    this.time.delayedCall(1500, () => {
      boss.roar();
      const info = this.levelDef.boss!;
      this.ui.bossTitle(info.name, info.sub);
    });
    this.time.delayedCall(3600, () => {
      cam.setBounds(a - 40, 0, b - a + 80, this.level.heightPx);
      // the arena is closed while the fight lasts: Elias can't wander off-camera
      this.physics.world.setBounds(a, 0, b - a, this.level.heightPx + 400);
      cam.startFollow(this.player, true, 0.08, 0.1, 0, 30);
      this.cutscene = false;
      this.player.setPState('air');
      this.ui.letterbox(false);
      boss.beginFight();
      Sound.playTheme(this.levelDef.boss!.music);
      this.ui.showBossBar(true, this.levelDef.boss!.name);
    });
  }

  onBossPhase(n: number) {
    if (this.boss instanceof ShadowHeart) {
      if (n === 2) this.toast(t('Its waves live in one time only — switch with the Echo (R)'), 2600);
      if (n === 3) {
        const p = this.player;
        p.setPState('cutscene');
        p.body.setVelocity(0, 0);
        p.play('elias-death');
        (p as any).lastAnim = 'death';
        this.fx.shake(0.02, 600);
        Sound.play('death');
        this.pipControl = true;
        this.pip.takeControl(true);
        this.toast(t('Elias is struck down! Fly Pip (arrows) to gather the light of the Seed'), 3200);
        const [a, b] = this.bossArena!;
        for (const fx of [0.18, 0.5, 0.82]) {
          const m = this.add.image(a + (b - a) * fx, this.level.heightPx - 5 * TILE - 120 - Math.random() * 120, 'mote').setScale(0.6).setBlendMode(ADD).setDepth(DEPTH.glow);
          this.tweens.add({ targets: m, y: m.y - 14, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
          this.motes.push(m);
        }
      }
      return;
    }
    if (this.boss instanceof ShadowBoss) {
      if (n === 2) this.toast(t('It snuffs the light — look into the past (Echo)'), 2400);
      if (n === 3) {
        this.toast(t('It is eating the light! Stay close to Pip'), 2200);
        this.tweens.add({ targets: this.lighting, darkness: Math.min(0.97, this.lighting.darkness + 0.15), duration: 1500 });
      }
      return;
    }
    if (this.boss instanceof Warden) {
      if (n === 2) {
        this.toast(t('The Warden launches its sentries!'), 1800);
        const [a, b] = this.bossArena!;
        for (const fx of [a + 160, b - 160]) {
          const d = new Drone(this, fx, this.level.heightPx - 7 * TILE);
          this.enemies.push(d);
          this.addEnemyToGroup(d);
        }
      }
      if (n === 3) {
        this.toast(t('Overheating! It strikes faster'), 1800);
        this.crushers.forEach((c) => (c.t = 0));
      }
      return;
    }
    if (n === 2) {
      this.toast(t('The Guardian calls its brood!'), 1800);
      const L = this.level;
      const [a, b] = this.bossArena!;
      for (const fx of [a + 120, b - 120]) {
        const tx = Math.floor(fx / TILE);
        let ty = 1;
        while (ty < L.H && L.solid(tx, ty)) ty++;
        const c = new Crawler(this, fx, ty * TILE, tx, ty);
        this.enemies.push(c);
        this.addEnemyToGroup(c);
        this.physics.add.collider(c, L.ground, undefined, ((e: any) => e.mode === 'leap') as any);
      }
    }
    if (n === 3) {
      this.toast(t('The Heart dims — stay in the light'), 1800);
      this.tweens.add({ targets: this.lighting, extra: 0.2, duration: 1500 });
      const s = new Stalker(this, this.bossArena![0] + 80, this.level.heightPx - 200);
      this.enemies.push(s);
      this.addEnemyToGroup(s);
    }
  }

  onBossDefeated(g: Enemy) {
    this.ui.showBossBar(false);
    Crazy.happytime();
    this.time.timeScale = 0.3;
    this.tweens.timeScale = 0.3;
    this.fx.shake(0.03, 1500);
    Sound.play('roar');
    Sound.stopMusic();
    this.cameras.main.flash(1200, 255, 230, 220);
    for (const e of this.enemies) if (e !== g && e.alive) e.die();
    this.tweens.add({ targets: g, alpha: 0, duration: 900, delay: 200, onComplete: () => g.destroy() });
    this.fx.deathBurst(g.x, g.y - 60, 'guardian');
    this.time.delayedCall(500, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      for (const d of this.doors) d.openPermanent();
      this.lighting.extra = -0.3;
      this.cameras.main.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
      this.physics.world.setBounds(0, 0, this.level.widthPx, this.level.heightPx + 400);
      if (g instanceof ShadowHeart) this.hooks.forEach((h) => h.setDark(false));
      this.toast(g instanceof ShadowHeart ? t('The Seed is free') : g instanceof Warden ? t('The Ancient Sentinel falls silent') : g instanceof ShadowBoss ? t('The Shadow flees into the Seed') : t('The lock is open'), 2500);
      Sound.playTheme('ending');
    });
  }

  private updateBoss(dt: number) {
    if (!this.boss || !this.bossStarted || !this.boss.alive) return;
    this.heartbeatT -= dt;
    if (this.heartbeatT <= 0) {
      this.heartbeatT = this.boss.phase === 3 ? 0.9 : 1.4;
      Sound.play('heartbeat');
    }
  }

  // ------------------------------------------------------------------ level end
  private completeLevel(e: Exit) {
    this.finished = true;
    this.cutscene = true;
    const p = this.player;
    p.setPState('cutscene');
    p.body.setVelocity(0, 0);
    Crazy.gameplayStop();
    Sound.play('mechanism');
    this.ui.letterbox(true);
    this.tweens.add({ targets: p, x: e.s.x, duration: 600, ease: 'Sine.inOut' });
    this.tweens.add({ targets: [p], alpha: 0, scale: 0.35, delay: 700, duration: 900 });
    this.tweens.add({ targets: this.pip, alpha: 0, delay: 900, duration: 700 });
    this.cameras.main.zoomTo(this.cameras.main.zoom * 1.25, 1800, 'Sine.easeInOut');
    this.time.delayedCall(1200, () => this.cameras.main.fade(900, 235, 255, 250));
    this.time.delayedCall(2200, () => {
      Save.completeLevel(this.levelIndex);
      this.registry.remove('persist-' + this.levelIndex);
      this.scene.stop('BG');
      this.scene.stop('UI');
      const next = this.levelIndex + 1;
      const chapterDone = next >= LEVELS.length || LEVELS[next].chapter !== this.levelDef.chapter;
      if (next >= LEVELS.length) {
        Save.data.completed = true;
        Save.write();
      }
      if (chapterDone) {
        Crazy.midgameAd().then(() => this.scene.start('Ending', { chapter: this.levelDef.chapter, next: next < LEVELS.length ? next : -1 }));
      } else {
        Crazy.midgameAd().then(() => this.scene.start('Story', { level: next }));
      }
    });
  }

  // ------------------------------------------------------------------ test & QA hooks
  private installHooks() {
    const w = window as any;
    w.__BTH = {
      scene: this,
      state: () => ({
        level: this.levelIndex,
        player: { x: Math.round(this.player.x), y: Math.round(this.player.y), state: this.player.state, hp: this.player.hp, hidden: this.player.hidden },
        pip: { x: Math.round(this.pip.x), y: Math.round(this.pip.y), mode: this.pip.mode },
        enemies: this.enemies.map((e) => ({ kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, alive: e.alive })),
        doors: this.doors.map((d) => ({ x: d.s.x, open: d.open, progress: +d.progress.toFixed(2) })),
        checkpoints: this.checkpoints.map((c) => c.lit),
        boss: this.boss ? { hp: this.boss.hp, mode: this.boss.mode, phase: this.boss.phase, alive: this.boss.alive } : null,
        finished: this.finished,
        fps: Math.round(this.game.loop.actualFps),
      }),
      teleport: (tx: number, ty: number) => {
        this.player.body.reset(tx * TILE + 16, (ty + 1) * TILE);
        this.player.setPState('air');
        this.pip.x = this.player.x - 30;
        this.pip.y = this.player.y - 70;
      },
      goto: (level: number, checkpoint = -1) => {
        this.scene.stop('BG');
        this.scene.start('Game', { level, checkpoint });
      },
      godMode: (on = true) => {
        this.player.maxHp = on ? 999 : 5;
        this.player.hp = this.player.maxHp;
      },
      setPausedForScreenshot: (p: boolean) => {
        this.screenshotFreeze = p;
        p ? this.physics.world.pause() : this.physics.world.resume();
        return { paused: p };
      },
    };
  }
}
