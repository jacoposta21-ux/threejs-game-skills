import * as THREE from 'three';
import { RenderPipeline, QUALITY } from './RenderPipeline';
import { InputManager, type Intents } from './InputManager';
import { Emitter } from './Events';
import { Flags, type GameContext, type GameEvents } from './Context';
import { loadSettings, saveSettings, type SettingsData } from './Settings';
import { SaveManager, type SaveData } from './SaveManager';
import { CHAPTERS, type ChapterId } from './types';
import { CollisionWorld } from '../physics/CollisionWorld';
import { AudioManager } from '../audio/AudioManager';
import { PlayerController } from '../player/PlayerController';
import { Hands, type HandPose } from '../player/Hands';
import { InteractionSystem } from '../player/InteractionSystem';
import { LumoController } from '../companion/LumoController';
import { NoiseSystem } from '../systems/NoiseSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { DarkHazardSystem } from '../systems/DarkHazardSystem';
import { CinematicSystem } from '../systems/CinematicSystem';
import { FearSystem } from '../systems/FearSystem';
import { EnemyManager } from '../enemies/EnemyManager';
import { HUD } from '../ui/HUD';
import { Menus } from '../ui/Menus';
import { TouchControls } from '../ui/TouchControls';
import { CrazyGames } from '../integration/CrazyGamesSDK';
import { createSeededRandom } from '../utils/random';
import type { Level } from '../levels/Level';
import { Bedroom } from '../levels/Bedroom';
import { Kitchen } from '../levels/Kitchen';
import { Attic } from '../levels/Attic';

type GameState = 'boot' | 'menu' | 'playing' | 'paused' | 'transition' | 'ending';

const PROGRESS_KEY = 'littlenight.chapters.v1';

export class Game {
  readonly pipeline: RenderPipeline;
  readonly input: InputManager;
  readonly audio = new AudioManager();
  readonly events = new Emitter<GameEvents>();
  readonly world = new CollisionWorld();
  readonly flags = new Flags();
  readonly inventory = new InventorySystem();
  readonly noise: NoiseSystem;
  readonly player: PlayerController;
  readonly hands: Hands;
  readonly interactions = new InteractionSystem();
  readonly lumo: LumoController;
  readonly hazards: DarkHazardSystem;
  readonly cinematics = new CinematicSystem();
  readonly enemies: EnemyManager;
  readonly fear = new FearSystem();
  readonly saves = new SaveManager();
  readonly hud: HUD;
  readonly menus: Menus;
  readonly touch: TouchControls;
  settings: SettingsData;
  ctx: GameContext;
  state: GameState = 'boot';
  level: Level | null = null;
  chapter: ChapterId = 'bedroom';
  private snapshot: SaveData | null = null;
  private lastTime = 0;
  private time = 0;
  private frame = 0;
  private flash = 0;
  private hurt = 0;
  private fadeAmount = 0;
  private menuCamT = 0;
  private catching = false;
  private pausedForScreenshot = false;
  private completed: ChapterId[] = [];
  private rafId = 0;
  private fps = 60;
  private loading = false;
  /** Simulation steps per frame (test harness fast-forward only). */
  testSteps = 1;

  constructor(private readonly canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = loadSettings();
    this.pipeline = new RenderPipeline(canvas);
    this.pipeline.setQuality(this.settings.quality);
    const scene = this.pipeline.scene;
    const camera = this.pipeline.camera;
    scene.add(camera);
    this.input = new InputManager(canvas);
    this.noise = new NoiseSystem(this.events);
    this.hazards = new DarkHazardSystem(scene);
    this.enemies = new EnemyManager(scene);
    this.lumo = new LumoController(scene);
    this.hands = new Hands(camera);
    this.hud = new HUD(uiRoot);
    this.player = new PlayerController(this.world, camera, {
      onStep: (pos, surface, crawling) => {
        this.audio.play(crawling ? 'crawl' : 'step', { surface, volume: crawling ? 0.8 : 0.9 });
        this.noise.emit(pos, crawling ? 1.2 : surface === 'carpet' || surface === 'fabric' ? 3.2 : 4.5, crawling ? 'crawl' : 'step');
        this.level?.onStep(this.ctx, pos, surface, crawling);
      },
      onLand: (pos, fall, surface) => {
        this.audio.play('land', { volume: Math.min(1, fall) });
        this.noise.emit(pos, Math.min(8, 3 + fall * 4), 'land');
        void surface;
      },
      onClimb: (pos) => {
        this.audio.play('climb');
        this.noise.emit(pos, 2, 'climb');
        this.hands.set('climb', 0.7);
      },
      onHint: (text) => this.hud.hint(text, 2.5),
      onPushStep: (pos) => {
        this.audio.play('scrape', { pos: this.player.pushTarget?.center() ?? pos });
        this.noise.emit(pos, 4, 'push');
      },
    });
    this.menus = new Menus(uiRoot, {
      newGame: () => this.newGame(),
      continueGame: () => this.continueGame(),
      chapter: (id) => this.startChapterFresh(id),
      resume: () => this.resume(),
      restartCheckpoint: () => this.restartCheckpoint(),
      mainMenu: () => this.toMainMenu(),
      settingsChanged: (s) => this.applySettings(s),
      uiSound: (k) => this.audio.play(k === 'click' ? 'uiClick' : 'uiHover'),
    });
    this.touch = new TouchControls(uiRoot, this.input, () => this.pause());
    this.ctx = {
      scene,
      camera,
      world: this.world,
      audio: this.audio,
      events: this.events,
      flags: this.flags,
      inventory: this.inventory,
      noise: this.noise,
      player: this.player,
      hands: this.hands,
      lumo: this.lumo,
      interactions: this.interactions,
      hazards: this.hazards,
      cinematics: this.cinematics,
      enemies: this.enemies,
      ui: this.hud,
      checkpoint: (id) => this.saveCheckpoint(id),
      completeChapter: () => this.completeChapter(),
      rng: createSeededRandom(1337),
      time: 0,
      particleScale: QUALITY[this.settings.quality].particles,
      reducedMotion: false,
    };
    this.wireEvents();
    this.applySettings(this.settings, false);
    this.loadProgress();
    this.installTestHooks();
  }

  /* ------------------------------ lifecycle ------------------------------ */

  async start(): Promise<void> {
    CrazyGames.loadingStart();
    this.menus.show('loading');
    this.loop(performance.now());
    const sdkReady = CrazyGames.init();
    // Build the menu backdrop while the SDK initialises.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    this.buildMenuBackdrop();
    await sdkReady;
    CrazyGames.onMuteChange((m) => this.audio.setPlatformMuted(m));
    this.audio.setPlatformMuted(CrazyGames.platformMuted);
    CrazyGames.loadingStop();
    this.toMainMenu(true);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.pipeline.dispose();
  }

  private wireEvents(): void {
    this.events.on('noise', (e) => this.enemies.hear(this.ctx, e.pos, e.radius, e.kind));
    this.events.on('lightning', (e) => (this.flash = e.strength));
    this.events.on('fade', (e) => (this.fadeAmount = e.amount));
    this.events.on('hurt', (e) => {
      this.hurt = Math.max(this.hurt, e.amount);
      this.fear.addSpike(0.7);
    });
    this.inventory.onChange = () => (this.menus.inventory = this.inventory.list());
    this.hud.onExamineClose = () => {};

    this.input.onPointerLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.input.isTouchDevice() && !this.loading) this.pause();
    };
    this.canvas.addEventListener('click', () => {
      this.audio.unlock();
      if (this.state === 'playing' && !this.input.pointerLocked) this.input.requestPointerLock();
    });
    window.addEventListener('pointerdown', () => {
      const first = !this.audio.ready;
      this.audio.unlock();
      if (first && this.audio.ready && this.state === 'menu') {
        this.audio.startAmbience(0.45, 0.25);
        this.audio.setPad('menu');
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        this.audio.suspend();
      } else if (this.state !== 'playing') {
        this.audio.resume();
      } else {
        this.audio.resume();
      }
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing' && !this.pausedForScreenshot && !navigator.webdriver) this.pause();
    });
    window.addEventListener('resize', () => this.pipeline.resize());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.hud.examineOpen) {
          this.hud.closeExamine();
          e.preventDefault();
        } else if (this.state === 'paused') {
          if (this.menus.current === 'pause') this.resume();
          else this.menus.back();
        }
      }
    });
    // Mobile Safari: prevent page scroll/zoom stealing gestures.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /* ------------------------------ settings ------------------------------- */

  applySettings(s: SettingsData, persist = true): void {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = s;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setVolumes(s.master, s.music, s.sfx);
    this.hud.subtitlesEnabled = s.subtitles;
    this.menus.setSettings(s);
    if (qualityChanged) {
      this.pipeline.setQuality(s.quality);
      this.ctx.particleScale = QUALITY[s.quality].particles;
    }
    if (persist) saveSettings(s);
  }

  private loadProgress(): void {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      this.completed = raw ? (JSON.parse(raw) as ChapterId[]) : [];
    } catch {
      this.completed = [];
    }
    const save = this.saves.load();
    if (save) for (const c of save.completedChapters) if (!this.completed.includes(c)) this.completed.push(c);
  }

  private markCompleted(id: ChapterId): void {
    if (!this.completed.includes(id)) this.completed.push(id);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.completed));
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------ flow ---------------------------------- */

  private buildMenuBackdrop(): void {
    this.flags.load({});
    this.inventory.load([]);
    this.buildLevel('bedroom');
    this.lumo.restore(false, 0, this.pipeline.camera);
    this.lumo.model.root.visible = false;
    this.player.teleport(new THREE.Vector3(1.3, 0, 1.4), 2.3);
    this.player.mode = 'locked';
    this.menuCamT = 0;
  }

  toMainMenu(fromBoot = false): void {
    CrazyGames.gameplayStop();
    this.input.releasePointerLock();
    this.touch.setVisible(false);
    this.cinematics.stop();
    this.catching = false;
    if (!fromBoot && (this.state !== 'menu' || this.level?.id !== 'bedroom')) this.buildMenuBackdrop();
    this.state = 'menu';
    this.menus.hasSave = this.saves.hasSave();
    this.menus.completed = [...this.completed];
    this.menus.show('main');
    this.hud.clearTransient();
    this.audio.stopAll();
    this.audio.setChase(0);
    if (this.audio.ready) {
      this.audio.startAmbience(0.45, 0.25);
      this.audio.setPad('menu');
    }
    this.fadeAmount = 0;
  }

  newGame(): void {
    this.audio.unlock();
    this.saves.clear();
    this.startChapterFresh('bedroom');
  }

  continueGame(): void {
    this.audio.unlock();
    const save = this.saves.load();
    if (!save) {
      this.startChapterFresh('bedroom');
      return;
    }
    this.loadFromSave(save);
  }

  startChapterFresh(id: ChapterId): void {
    this.audio.unlock();
    const data: SaveData = {
      version: 2,
      chapter: id,
      checkpoint: 'start',
      flags: {},
      inventory: id === 'attic' ? ['wind-key'] : [],
      lumoEnergy: id === 'bedroom' ? 25 : 70,
      lumoFound: id !== 'bedroom',
      completedChapters: [...this.completed],
      gameComplete: false,
      savedAt: Date.now(),
    };
    this.loadFromSave(data, true);
  }

  private loadFromSave(save: SaveData, fresh = false): void {
    this.menus.hide();
    this.snapshot = save;
    void this.transitionTo(() => {
      this.flags.load(save.flags);
      this.inventory.load(save.inventory);
      this.buildLevel(save.chapter);
      this.level!.applyState(this.ctx);
      const cp = this.level!.checkpoints[save.checkpoint] ?? this.level!.checkpoints.start;
      this.player.teleport(cp.pos, cp.yaw, cp.crawl);
      this.lumo.restore(save.lumoFound, save.lumoEnergy, this.pipeline.camera);
      if (save.lumoFound) this.audio.startTrackedLoop('lumo-wings', 'lumo', this.lumo.model.root, 0.05);
      this.level!.begin(this.ctx, save.checkpoint);
      if (save.checkpoint === 'start') {
        const c = CHAPTERS.find((x) => x.id === save.chapter)!;
        this.hud.chapterCard(c.numeral, c.title);
      }
      if (fresh || save.checkpoint === 'start') this.saveCheckpoint(save.checkpoint, true);
    });
  }

  private buildLevel(id: ChapterId): void {
    this.level?.dispose(this.ctx);
    this.enemies.clear(this.ctx);
    this.interactions.clear();
    this.hazards.clear();
    this.world.clear();
    this.noise.clear();
    this.cinematics.stop();
    this.fear.floor = 0;
    this.fear.value = 0;
    this.audio.stopAll();
    this.audio.setChase(0);
    this.chapter = id;
    const level = id === 'bedroom' ? new Bedroom() : id === 'kitchen' ? new Kitchen() : new Attic();
    this.level = level;
    level.build(this.ctx, (l) => this.pipeline.configureShadowLight(l));
    const p = level.palette;
    this.pipeline.renderer.toneMappingExposure = p.exposure;
    this.pipeline.uniforms.uLift.value.setRGB(...p.lift);
    this.pipeline.uniforms.uGain.value.setRGB(...p.gain);
    this.pipeline.setQuality(this.settings.quality);
    if (this.audio.ready) {
      this.audio.startAmbience(p.rain, p.wind);
      this.audio.setPad(p.pad);
    }
  }

  private async transitionTo(work: () => void, fadeOut = 0.45): Promise<void> {
    this.state = 'transition';
    this.loading = true;
    this.touch.setVisible(false);
    await this.animateFade(this.fadeAmount, 1, fadeOut);
    try {
      work();
    } catch (error) {
      console.error(error);
    }
    this.loading = false;
    this.state = 'playing';
    this.catching = false;
    this.player.mode = this.cinematics.active ? 'locked' : this.player.mode === 'locked' ? 'normal' : this.player.mode;
    CrazyGames.gameplayStart();
    this.touch.setVisible(this.input.isTouchDevice());
    if (!this.input.isTouchDevice()) this.input.requestPointerLock();
    await this.animateFade(1, 0, 0.8);
  }

  private animateFade(from: number, to: number, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
        this.fadeAmount = from + (to - from) * t;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
  }

  saveCheckpoint(id: string, silent = false): void {
    const data = {
      chapter: this.chapter,
      checkpoint: id,
      flags: this.flags.snapshot(),
      inventory: this.inventory.list(),
      lumoEnergy: Math.max(this.lumo.energy, this.lumo.found ? 35 : 25),
      lumoFound: this.lumo.found,
      completedChapters: [...this.completed],
      gameComplete: false,
    };
    this.snapshot = this.saves.save(data);
    this.events.emit('checkpoint', { id });
    if (!silent) this.hud.hint('✦ Checkpoint', 1.6);
  }

  restartCheckpoint(): void {
    if (!this.snapshot) return;
    this.input.requestPointerLock();
    this.loadFromSave(this.snapshot);
  }

  pause(): void {
    if (this.state !== 'playing' || this.catching) return;
    this.state = 'paused';
    CrazyGames.gameplayStop();
    this.input.releasePointerLock();
    this.touch.setVisible(false);
    this.menus.objective = this.hud.currentObjective;
    this.menus.inventory = this.inventory.list();
    this.menus.show('pause');
    this.audio.setMuted(false);
    this.audio.suspend();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.menus.hide();
    this.state = 'playing';
    this.audio.resume();
    this.audio.unlock();
    CrazyGames.gameplayStart();
    this.input.requestPointerLock();
    this.touch.setVisible(this.input.isTouchDevice());
    this.hud.showObjective(3);
  }

  completeChapter(): void {
    const id = this.chapter;
    this.markCompleted(id);
    CrazyGames.happytime();
    const index = CHAPTERS.findIndex((c) => c.id === id);
    const next = CHAPTERS[index + 1];
    if (!next) {
      this.showEnding();
      return;
    }
    this.state = 'transition';
    this.player.mode = 'locked';
    const carry = { energy: this.lumo.energy, inventory: this.inventory.list() };
    const go = async () => {
      await this.animateFade(this.fadeAmount, 1, 1.2);
      CrazyGames.gameplayStop();
      // Natural break between chapters (only when running on CrazyGames).
      await CrazyGames.midgameBreak(() => this.audio.setMuted(true));
      this.audio.setMuted(false);
      const data: SaveData = {
        version: 2,
        chapter: next.id,
        checkpoint: 'start',
        flags: {},
        inventory: carry.inventory.filter((i) => i === 'wind-key'),
        lumoEnergy: Math.max(60, carry.energy),
        lumoFound: true,
        completedChapters: [...this.completed],
        gameComplete: false,
        savedAt: Date.now(),
      };
      this.loadFromSave(data, true);
    };
    void go();
  }

  private showEnding(): void {
    this.state = 'ending';
    CrazyGames.gameplayStop();
    this.input.releasePointerLock();
    this.touch.setVisible(false);
    const save = this.saves.load();
    if (save) this.saves.save({ ...save, gameComplete: true, completedChapters: [...this.completed] });
    this.menus.show('ending');
    this.audio.setPad('ending');
  }

  /* ------------------------------ caught -------------------------------- */

  private onCaught(): void {
    if (this.catching) return;
    this.catching = true;
    const hush = this.enemies.hush!;
    const p = this.player;
    if (p.mode === 'hidden') p.exitHide();
    p.stopPush();
    p.mode = 'locked';
    this.audio.play('stinger', { volume: 0.9 });
    this.audio.play('hushWhisper', { volume: 1.3 });
    this.fear.addSpike(1);
    const head = new THREE.Vector3();
    this.cinematics.play(
      [
        {
          dur: 0.45,
          start: () => {
            hush.model.headTop.getWorldPosition(head);
            p.lookOverride = { target: head.clone(), weight: 0 };
            this.hands.set('cover', 2);
          },
          update: (t) => {
            hush.model.headTop.getWorldPosition(head);
            p.lookOverride!.target.copy(head);
            p.lookOverride!.weight = Math.min(1, t * 2.5);
            hush.model.setReveal(t);
          },
        },
        {
          dur: 0.7,
          update: (t) => {
            // It leans in, close.
            const toPlayer = p.position.clone().sub(hush.position).setY(0).normalize();
            hush.position.addScaledVector(toPlayer, 0.012);
            hush.model.lean = t * 0.5;
            hush.model.headTop.getWorldPosition(head);
            p.lookOverride!.target.copy(head);
            this.hurt = t;
          },
        },
        { dur: 0.5, update: (t) => (this.fadeAmount = t) },
        { dur: 0.6 },
      ],
      () => {
        hush.model.lean = 0;
        hush.model.setReveal(0);
        p.lookOverride = null;
        this.hurt = 0;
        this.hud.subtitle('[Shhhh…]', 2);
        if (this.snapshot) this.loadFromSave(this.snapshot);
      },
    );
  }

  /* ------------------------------ frame --------------------------------- */

  private loop = (now: number) => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - (this.lastTime || now)) / 1000);
    this.lastTime = now;
    if (dt > 0) this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    if (this.testSteps > 1 && !this.pausedForScreenshot) {
      // Test fast-forward: several fixed simulation steps per rendered frame.
      for (let i = 0; i < this.testSteps; i++) this.update(1 / 30);
    } else {
      this.update(this.pausedForScreenshot ? 0 : dt);
    }
    this.render();
    this.frame++;
  };

  private update(dt: number): void {
    this.time += dt;
    this.ctx.time = this.time;
    const intents = this.input.consume();
    if (this.enemies.hush && !this.enemies.hush.onCatch) this.enemies.hush.onCatch = () => this.onCaught();

    if (this.state === 'menu') {
      this.updateMenuCamera(dt);
      this.level?.update(dt, this.ctx);
      this.lumo.update(dt, this.ctx);
      this.audio.updateListener(this.pipeline.camera, dt);
      this.hud.update(this.hudState(false));
      return;
    }
    if (this.state === 'paused' || this.state === 'ending' || this.state === 'boot') {
      this.hud.update(this.hudState(false));
      if (this.state === 'ending') {
        this.level?.update(dt, this.ctx);
        this.lumo.update(dt, this.ctx);
        this.audio.updateListener(this.pipeline.camera, dt);
      }
      return;
    }

    if (intents.pressed.has('pause') && this.state === 'playing' && !this.hud.examineOpen) {
      this.pause();
      return;
    }
    // Reading a note: soft pause until closed.
    if (this.hud.examineOpen) {
      if (intents.pressed.has('interact') || intents.pressed.has('throw')) this.hud.closeExamine();
      this.hud.update(this.hudState(true));
      this.audio.updateListener(this.pipeline.camera, dt);
      return;
    }

    const playing = this.state === 'playing';
    const gameplayIntents: Intents = playing && !this.cinematics.active ? intents : { moveX: 0, moveY: 0, lookX: 0, lookY: 0, pressed: new Set() };
    if (this.cinematics.active && this.cinematics.skippable && intents.pressed.has('interact')) this.cinematics.skip();
    this.cinematics.update(dt);
    if (this.cinematics.active && this.player.mode !== 'hidden') this.player.mode = 'locked';

    this.player.update(dt, gameplayIntents);
    this.interactions.update(dt, this.ctx, playing && !this.cinematics.active ? gameplayIntents : null);
    if (gameplayIntents.pressed.has('lumo')) this.lumo.toggle(this.ctx);
    this.lumo.update(dt, this.ctx);
    this.enemies.update(dt, this.ctx);
    this.hazards.update(dt, this.ctx);
    this.noise.update(dt);
    this.level?.update(dt, this.ctx);

    const fear = this.fear.update(dt, this.ctx);
    this.player.fear = fear;
    this.audio.fear = fear;
    const hush = this.enemies.hush;
    this.audio.setChase(hush && hush.state === 'chase' ? 1 : 0);
    this.audio.updateListener(this.pipeline.camera, dt);

    // Hands pose
    let pose: HandPose = 'hidden';
    if (this.player.mode === 'pushing') pose = 'push';
    else if (this.player.mode === 'climbing') pose = 'climb';
    else if (this.player.mode === 'hidden') pose = 'hide';
    else if (this.interactions.held) pose = 'hold';
    else if (this.player.crawling && this.player.speed > 0.2) pose = 'crawl';
    this.hands.update(dt, pose, this.player.speed);

    this.hud.update(this.hudState(playing && !this.cinematics.active));
    const pr = this.interactions.prompt;
    this.touch.setInteract(pr && !pr.disabled ? pr.verb : pr?.verb ?? null, Boolean(pr?.disabled), Boolean(this.interactions.held));
    this.touch.setLumo(this.lumo.found, this.player.crawling);
    this.publishDiagnostics();
  }

  private updateMenuCamera(dt: number): void {
    this.menuCamT += dt;
    const t = this.menuCamT * 0.05;
    const cam = this.pipeline.camera;
    cam.position.set(1.2 + Math.sin(t) * 0.5, 0.62 + Math.sin(t * 1.3) * 0.05, 1.5 + Math.cos(t) * 0.35);
    cam.lookAt(-1.4 + Math.sin(t * 0.7) * 0.4, 0.75, -2.2);
  }

  private hudState(visible: boolean) {
    const lumo = this.lumo;
    let mode: 'glow' | 'dim' | 'away' | 'charging' | 'tired' = lumo.isLit ? 'glow' : 'dim';
    if (lumo.state === 'perched' || lumo.state === 'travel') mode = 'away';
    if (lumo.state === 'docked') mode = 'charging';
    if (lumo.energy <= 0) mode = 'tired';
    return {
      prompt: this.interactions.prompt,
      energy: lumo.energy,
      lumoFound: lumo.found,
      lumoMode: mode,
      noise: this.noise.lastPlayerNoise,
      hidden: this.player.mode === 'hidden',
      crawling: this.player.crawling,
      targeting: Boolean(this.interactions.target),
      fear: this.fear.value,
      visible: visible && this.state === 'playing',
      touch: this.input.isTouchDevice(),
      needsClick: visible && this.state === 'playing' && !this.input.isTouchDevice() && !this.input.pointerLocked && !this.cinematics.active,
    };
  }

  private render(): void {
    this.pipeline.resize();
    const u = this.pipeline.uniforms;
    u.uFear.value = this.state === 'menu' ? 0.08 : this.fear.value;
    u.uFlash.value = Math.max(0, this.flash) * 0.35;
    this.hurt = Math.max(0, this.hurt - 0.02);
    u.uHurt.value = Math.max(this.hurt, this.hazards.grab * 0.8);
    u.uFade.value = 0;
    this.hud.setFade(this.fadeAmount);
    this.pipeline.render(this.time);
  }

  /* ---------------------------- diagnostics ----------------------------- */

  private publishDiagnostics(): void {
    if (this.frame % 10 !== 0) return;
    const info = this.pipeline.renderer.info;
    const p = this.player.position;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.time,
      score: this.completed.length,
      targetScore: 3,
      complete: this.state === 'ending',
      player: { position: { x: p.x, y: p.y, z: p.z }, speed: this.player.speed },
      renderer: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.pipeline.renderer.getPixelRatio(),
      },
      game: {
        state: this.state,
        chapter: this.chapter,
        checkpoint: this.snapshot?.checkpoint ?? '',
        fps: Math.round(this.fps),
        fear: Number(this.fear.value.toFixed(2)),
        lumoEnergy: Math.round(this.lumo.energy),
        lumoState: this.lumo.state,
        hush: this.enemies.hush?.state ?? 'none',
        prompt: this.interactions.prompt?.verb ?? '',
        quality: this.settings.quality,
      },
    };
  }

  private installTestHooks(): void {
    // Test hooks only exist in dev builds or with ?test (never for regular players).
    const params = new URLSearchParams(location.search);
    if (!import.meta.env.DEV && !params.has('test')) return;
    const hooks = new TestHooks(this);
    window.__THREE_GAME_TEST_HOOKS__ = hooks.public();
    window.__LN__ = hooks.dev();
  }

  /** Internal access for the test harness. */
  get internals() {
    return {
      level: this.level,
      snapshot: this.snapshot,
      setPausedForScreenshot: (p: boolean) => (this.pausedForScreenshot = p),
      setFade: (f: number) => (this.fadeAmount = f),
      loadFromSave: (s: SaveData) => this.loadFromSave(s),
      menuCamera: () => this.updateMenuCamera(0),
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Test hooks: deterministic states for the canvas inspector + a dev API     */
/* used by the automated start-to-finish playthrough.                       */
/* ------------------------------------------------------------------------ */

class TestHooks {
  constructor(private readonly game: Game) {}

  private waitFrames(n: number): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  }

  private async load(chapter: ChapterId, checkpoint: string, flags: Record<string, unknown> = {}, inventory: string[] = [], energy = 80): Promise<void> {
    const g = this.game;
    g.internals.loadFromSave({
      version: 2,
      chapter,
      checkpoint,
      flags,
      inventory,
      lumoEnergy: energy,
      lumoFound: !(chapter === 'bedroom' && (checkpoint === 'start' || !flags['lumo-found'])),
      completedChapters: [],
      gameComplete: false,
      savedAt: Date.now(),
    });
    for (let i = 0; i < 200 && (g.state as string) !== 'playing'; i++) await this.waitFrames(1);
    // Fast-forward settling (LUMO flight, fades) so captures are quick even on software GL.
    const steps = g.testSteps;
    g.testSteps = 12;
    await this.waitFrames(4);
    g.testSteps = steps;
    g.internals.setFade(0);
  }

  public() {
    const g = this.game;
    return {
      seed: (value: number) => {
        g.ctx.rng = createSeededRandom(value);
      },
      setState: async (name: string) => {
        g.audio.unlock();
        g.internals.setPausedForScreenshot(false);
        switch (name) {
          case 'menu':
            g.toMainMenu();
            g.internals.menuCamera();
            break;
          case 'active-play':
          case 'bedroom':
            await this.load('bedroom', 'lumo', { 'lumo-found': true, 'drawer:dresser-0': true, 'got:lumo': true }, [], 70);
            g.player.yaw = 2.0;
            g.player.pitch = -0.08;
            break;
          case 'hallway':
            await this.load('bedroom', 'door', { 'lumo-found': true, 'drawer:dresser-0': true, 'got:lumo': true, 'door:bedroom-door': true, 'ch1-door': true, 'pos:chest': [1.65, 2.75] }, [], 80);
            g.player.teleport(new THREE.Vector3(0.9, 0, 4.4), Math.PI / 2);
            g.lumo.sendTo(g.ctx, g.interactions.find('hall-a') as never);
            g.testSteps = 12;
            await this.waitFrames(4);
            g.testSteps = 1;
            break;
          case 'kitchen':
            await this.load('kitchen', 'start', {}, [], 80);
            g.player.teleport(new THREE.Vector3(-2.2, 0, 0.6), -1.25);
            break;
          case 'kitchen-hush':
            await this.load('kitchen', 'start', {}, [], 80);
            g.player.teleport(new THREE.Vector3(-1.6, 0, 1.8), -1.2, true);
            g.enemies.hush?.spawn(new THREE.Vector3(1.0, 0, 0.2), Math.PI * 0.6, 'lookaround', g.ctx, true);
            await this.waitFrames(30);
            break;
          case 'attic':
            await this.load('attic', 'start', {}, ['wind-key'], 80);
            break;
          case 'attic-hush':
            await this.load('attic', 'gate', { 'socket:gate-gear': true, 'socket:gate-spring': true, 'socket:gate-crank': true, 'attic-gate-open': true }, ['wind-key'], 80);
            g.enemies.hush?.spawn(new THREE.Vector3(1.5, 0, -0.4), -Math.PI / 2, 'lookaround', g.ctx, true);
            await this.waitFrames(30);
            break;
          case 'ending':
            await this.load('attic', 'finale', { 'socket:gate-gear': true, 'socket:gate-spring': true, 'socket:gate-crank': true, 'attic-gate-open': true, 'attic-cage-open': true }, ['wind-key'], 100);
            (g.internals.level as unknown as { debugEnding?: () => void }).debugEnding?.();
            await this.waitFrames(30);
            break;
          default:
            throw new Error(`Unknown test state: ${name}`);
        }
        await this.waitFrames(4);
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        g.internals.setPausedForScreenshot(paused);
      },
      setReducedMotion: (enabled: boolean) => {
        g.ctx.reducedMotion = enabled;
        g.player.reducedMotion = enabled;
      },
      hideDebugUi: () => {},
    };
  }

  dev() {
    const g = this.game;
    return {
      game: g,
      THREE,
      state: () => ({
        state: g.state,
        chapter: g.chapter,
        pos: g.player.position.toArray(),
        yaw: g.player.yaw,
        crawling: g.player.crawling,
        mode: g.player.mode,
        prompt: g.interactions.prompt?.verb ?? null,
        promptDisabled: Boolean(g.interactions.prompt?.disabled),
        target: g.interactions.target?.id ?? null,
        lumo: { state: g.lumo.state, energy: g.lumo.energy, found: g.lumo.found, glowing: g.lumo.glowing },
        hush: g.enemies.hush ? { state: g.enemies.hush.state, pos: g.enemies.hush.position.toArray() } : null,
        flags: g.flags.snapshot(),
        inventory: g.inventory.list(),
        checkpoint: g.internals.snapshot?.checkpoint,
        hazard: { grab: g.hazards.grab, inZone: g.hazards.inZone?.id ?? null, lit: g.hazards.lit },
        cinematic: g.cinematics.active,
        held: g.interactions.held?.id ?? null,
      }),
      teleport: (x: number, y: number, z: number, yaw?: number, crawl?: boolean) => g.player.teleport(new THREE.Vector3(x, y, z), yaw ?? g.player.yaw, crawl ?? g.player.crawling),
      lookAt: (x: number, y: number, z: number) => {
        const cam = g.pipeline.camera.position;
        const dx = x - cam.x;
        const dy = y - cam.y;
        const dz = z - cam.z;
        g.player.yaw = Math.atan2(-dx, -dz);
        g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        g.player.syncCamera(0);
      },
      setYaw: (yaw: number, pitch = 0) => {
        g.player.yaw = yaw;
        g.player.pitch = pitch;
      },
      press: (a: 'interact' | 'lumo' | 'crawl' | 'jump' | 'pause' | 'throw') => g.input.press(a),
      move: (x: number, y: number) => g.input.setAutopilot({ x, y }),
      stop: () => g.input.setAutopilot(null),
      skipCinematic: () => g.cinematics.skip(),
      hushOff: () => g.enemies.hush?.despawn(g.ctx, true),
      setEnergy: (e: number) => (g.lumo.energy = e),
      saveRaw: () => localStorage.getItem('littlenight.save'),
      setSpeed: (steps: number) => (g.testSteps = Math.max(1, Math.floor(steps))),
      time: () => g.ctx.time,
    };
  }
}

declare global {
  interface Window {
    __LN__?: ReturnType<TestHooks['dev']>;
  }
}
