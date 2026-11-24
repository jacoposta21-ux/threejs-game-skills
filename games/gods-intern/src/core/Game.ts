import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { CameraController } from '../camera/CameraController';
import { VisualEffects } from '../effects/VisualEffects';
import { BuildingRenderer } from '../entities/BuildingRenderer';
import { VillagerRenderer } from '../entities/VillagerRenderer';
import { CultureRenderer } from '../entities/CultureRenderer';
import { VillageDecor } from '../world/VillageDecor';
import { buildBridges } from '../world/Bridges';
import { ChallengePanel } from '../ui/ChallengePanel';
import { VillagePanel } from '../ui/VillagePanel';
import { relationKey } from '../world/Settlements';
import { HistoryBookPanel, cultureTicker } from '../ui/HistoryBookPanel';
import { PerfOverlay } from '../ui/PerfOverlay';
import type { VillagerData } from './types';
import { browserStore, SaveManager, slotKey } from '../persistence/SaveManager';
import { PowerEffectsRenderer } from '../effects/PowerEffectsRenderer';
import { CareerPanel } from '../ui/CareerPanel';
import { PROMOTION_LINES, RANK_TITLES } from '../career/CareerSystem';
import { createPlatform, type GamePlatform } from '../platform/Platform';
import { Simulation } from '../simulation/SimulationManager';
import { $, hydrateIcons, setText } from '../ui/dom';
import { ICON } from '../ui/Icons';
import { HUD } from '../ui/HUD';
import { Menus } from '../ui/Menus';
import { Notifications } from '../ui/Notifications';
import { POWER_ACCENT, PowerToolbar } from '../ui/PowerToolbar';
import { PrayerPanel } from '../ui/PrayerPanel';
import { Tutorial } from '../ui/Tutorial';
import { Tips } from '../ui/Tips';
import { MainMenu } from '../ui/MainMenu';
import { VillageInspector } from '../ui/VillageInspector';
import { WorldLabels } from '../ui/WorldLabels';
import { Ambient } from '../world/Ambient';
import { DayNightCycle } from '../world/DayNightCycle';
import { TerrainMesh } from '../world/Terrain';
import { Vegetation } from '../world/Vegetation';
import { Water } from '../world/Water';
import { Weather } from '../world/Weather';
import { createInitialState } from '../world/WorldGen';
import { BASIC_POWERS, CONFIG, type PowerId } from './Config';
import { GameLoop } from './GameLoop';
import { loadSettings, saveSettings, type QualityLevel, type Settings } from './Settings';

export const WORLD_SEED = 42;
const PROMO_LINES: Record<number, string> = Object.fromEntries(RANK_TITLES.map((_, i) => [i + 1, PROMOTION_LINES[i] ?? '']));
/** Merchant pack colors by cargo. */
const RESOURCE_COLOR: Record<string, number> = { food: 0xe8a13a, water: 0x4fa3e0, wood: 0x9b6a3e, stone: 0x9aa0a6 };
type Quality = Exclude<QualityLevel, 'auto'>;
type Panel = 'world' | 'career' | 'challenges' | 'history' | 'help';

/**
 * Composition root. Owns the renderer and wires the pure simulation to the
 * Three.js presentation, HTML UI, audio, persistence and test hooks.
 */
export class Game {
  readonly sim: Simulation;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1200);
  private readonly cam: CameraController;
  private readonly terrainMesh: TerrainMesh;
  private readonly water: Water;
  private readonly vegetation: Vegetation;
  private readonly buildings: BuildingRenderer;
  private readonly villagers: VillagerRenderer;
  private readonly weather: Weather;
  private readonly ambient: Ambient;
  private readonly vfx: VisualEffects;
  private readonly culture: CultureRenderer;
  private readonly decors: VillageDecor[];
  private readonly powerFx: PowerEffectsRenderer;
  private readonly careerUi = new CareerPanel();
  /** Camera view saved before possession / cinematic mode. */
  private savedView: { x: number; z: number; d: number; yaw: number; pitch: number } | null = null;
  /** Possession: walk-to target (click/tap), or null when steering with keys. */
  private walkTarget: { x: number; z: number } | null = null;
  private cinematic = false;
  private screenshotMode = false;
  private possessLabelKey = '';
  private readonly challengesUi = new ChallengePanel();
  private readonly villagesUi = new VillagePanel();
  private readonly packColors = new Map<string, number>();
  private readonly book = new HistoryBookPanel();
  private readonly perf: PerfOverlay;
  private pinTimer = 0;
  private cpuMs = 0;
  private glMs = 0;
  private simMs = 0;
  private readonly dayNight: DayNightCycle;
  private readonly hud = new HUD();
  private readonly toolbar: PowerToolbar;
  private readonly prayers = new PrayerPanel();
  private readonly inspector = new VillageInspector();
  private readonly notes = new Notifications();
  private readonly labels = new WorldLabels();
  private readonly menus: Menus;
  private readonly tutorial: Tutorial;
  private readonly tips = new Tips();
  private readonly mainMenu: MainMenu;
  /** v0.5: one side panel at a time (World, Career, Challenges, History, Help). */
  private panel: Panel | null = null;
  /** A pointer press that closed a panel must not also cast or inspect. */
  private swallowClick = false;
  /** Possession on-screen pad directions currently held. */
  private readonly padDirs = new Set<string>();
  /** Real seconds since the player entered gameplay from the main menu (diagnostics). */
  private playSeconds = 0;
  private readonly audio = new AudioManager();
  private readonly store = browserStore();
  private readonly saves = new SaveManager(this.store);
  private readonly platform: GamePlatform = createPlatform();
  private readonly loop: GameLoop;
  private settings: Settings;
  private quality: Quality = 'high';
  private selected: PowerId | null = null;
  private paused = false;
  private speed = 1;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private pauseShown: boolean | null = null;
  private elapsed = 0;
  private frame = 0;
  private autosaveTimer = CONFIG.autosaveInterval;
  private readonly pointer = { x: 0, y: 0, inside: false, downX: 0, downY: 0, down: false };
  private readonly ground = new THREE.Vector3();
  private groundValid = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly chimneyTops: THREE.Vector3[] = [];
  private fpsSamples: number[] = [];
  private fps = 60;
  private qualityTimer = 0;
  private cursorToastTimer = 0;
  private readonly unsubs: Array<() => void> = [];
  /** Recent player-facing messages, exposed to diagnostics for automated checks. */
  private readonly eventLog: string[] = [];
  private readonly params = new URLSearchParams(window.location.search);
  /** Keys currently held (possession steering). */
  private readonly heldKeys = new Set<string>();
  private readonly tmpV = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    hydrateIcons();
    this.settings = loadSettings(this.store);
    const forced = this.params.get('quality') as Quality | null;
    this.quality = forced && ['low', 'medium', 'high'].includes(forced) ? forced : this.settings.quality === 'auto' ? 'high' : this.settings.quality;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Simulation: resume the autosave if there is one, unless ?fresh.
    let initial;
    if (!this.params.has('fresh')) {
      const res = this.saves.load(slotKey(this.settings.mode, true));
      if (res.ok && res.state.seed === WORLD_SEED) initial = res.state;
    }
    this.sim = new Simulation(WORLD_SEED, initial);
    if (!initial && this.settings.mode === 'creative') {
      this.sim.state.mode = 'creative';
      this.sim.applyMode();
    }
    this.applyModeOptions();

    const village = this.sim.state.villages[0];
    this.dayNight = new DayNightCycle(this.scene);
    this.terrainMesh = new TerrainMesh(
      this.sim.terrain,
      this.sim.state.buildings,
      this.sim.state.villages.map((v) => ({ id: v.id, x: v.centerX, z: v.centerZ })),
      this.roadSegments(),
    );
    this.water = new Water(this.sim.terrain);
    this.vegetation = new Vegetation(this.sim.terrain);
    this.buildings = new BuildingRenderer(this.sim.state.buildings, this.sim.terrain);
    this.villagers = new VillagerRenderer();
    this.weather = new Weather();
    this.ambient = new Ambient(this.sim.terrain, this.sim.state.villages.map((v) => ({ x: v.centerX, z: v.centerZ })));
    this.vfx = new VisualEffects(this.sim.bus, this.sim.terrain, () => this.sim.state);
    this.culture = new CultureRenderer(this.sim.terrain);
    this.decors = this.sim.state.villages.map((v) => new VillageDecor(this.sim.terrain, v, this.sim.state.buildings));
    this.powerFx = new PowerEffectsRenderer(this.sim.terrain, this.vfx);
    this.scene.add(this.terrainMesh.mesh, this.water.group, this.vegetation.group, this.buildings.group, this.villagers.group, this.weather.group, this.ambient.group, this.vfx.group, this.culture.group, buildBridges(this.sim.terrain), this.powerFx.group, ...this.decors.map((d) => d.group));
    if (this.sim.state.terrainEdits.length) this.refreshTerrainVisuals(-80, -80, 80, 80);
    this.perf = new PerfOverlay(import.meta.env.DEV || this.params.has('debug'), this.params.has('debug'));

    this.cam = new CameraController(this.camera, canvas, this.sim.terrain);
    this.cam.snap(village.centerX + 4, village.centerZ - 2, 62, 0.55, 0.88);
    this.vfx.onShake = (a) => this.cam.addShake(a);
    this.vfx.onFlash = (a) => this.screenFlash(a);

    this.toolbar = new PowerToolbar(this.sim, this.settings.quickSlots);
    this.toolbar.onSelect = (id) => this.select(id);
    this.toolbar.onSlotsChanged = (slots) => {
      this.audio.uiClick();
      this.settings.quickSlots = slots;
      saveSettings(this.store, this.settings);
    };
    this.toolbar.onToggleMode = () => this.toggleSubMode();
    this.toolbar.onSetMode = (mode) => this.setSubMode(mode);
    this.toolbar.onMenu = (open) => {
      this.audio.click();
      if (open) this.openPanel(null);
    };
    this.careerUi.onToggle = (open) => this.panelToggled('career', open);
    this.tips.onToggle = (open) => this.panelToggled('help', open);
    this.careerUi.onOvertime = () => this.startOvertime();
    this.toolbar.onHover = () => this.audio.hover();
    this.prayers.onFocus = (p) => {
      this.audio.click();
      this.cam.focus(p.targetX, p.targetZ, 46, 1.2);
    };
    // Suggested power: select it and fly there. The player still casts the miracle.
    this.prayers.onSuggest = (_p, power, x, z) => {
      this.cam.focus(x, z, 44, 1.1);
      if (this.selected !== power) this.select(power);
      else this.audio.click();
    };
    this.inspector.onFollow = () => this.audio.click();
    this.prayers.onToggle = () => this.audio.click();
    this.inspector.onClose = () => this.audio.click();
    this.notes.onShow = (kind) => this.audio.notify(kind);
    this.notes.onMemo = () => this.audio.godMessage();

    this.menus = new Menus({
      resume: () => this.setPaused(false),
      restart: () => this.restart(),
      save: () => this.saves.save(this.sim.state, slotKey(this.sim.state.mode, false)),
      load: () => this.loadFrom(slotKey(this.sim.state.mode, false)),
      hasSave: () => this.saves.has(slotKey(this.sim.state.mode, false)),
      hasAutosave: () => this.saves.has(slotKey(this.sim.state.mode, true)),
      loadAutosave: () => this.loadFrom(slotKey(this.sim.state.mode, true)),
      mode: () => this.sim.state.mode,
      switchMode: (mode) => this.switchMode(mode),
      cinematic: () => this.setCinematic(true),
      screenshot: () => this.setScreenshotMode(true),
      settings: () => this.settings,
      applySettings: (s) => this.applySettings(s),
      fullscreen: () => this.toggleFullscreen(),
      click: () => this.audio.click(),
      mainMenu: () => this.toMainMenu(),
      fullscreenAllowed: () => !this.platform.hostFullscreen,
    });
    this.mainMenu = new MainMenu({
      career: () => this.slotInfo('career'),
      creative: () => this.slotInfo('creative'),
      continueCareer: () => this.leaveMenu('continue'),
      newCareer: () => this.leaveMenu('new'),
      creativeMode: () => this.leaveMenu('creative'),
      settings: () => this.menus.settings(null),
      click: () => this.audio.click(),
    });

    this.tutorial = new Tutorial({
      sim: () => this.sim,
      selected: () => this.selected,
      focusVillage: (d, t) => this.cam.focus(village.centerX + 3, village.centerZ - 3, d, t, 0.5, 0.82),
      introCamera: () => this.cam.snap(village.centerX, village.centerZ - 10, 140, 2.4, 1.15),
      highlight: (id) => (this.toolbar.highlight = id),
      powerRect: (id) => this.toolbar.rect(id),
      marker: (label, at, s) => this.labels.marker(label, at, s),
      removeMarker: (n) => this.labels.removeNode(n),
      onComplete: () => {
        this.settings.tutorialSeen = true;
        saveSettings(this.store, this.settings);
        this.tips.bind(this.sim);
      },
    });
    this.tips.bind(this.sim);

    this.bindSimEvents();
    this.bindInput();
    this.applySettings(this.settings, false);
    this.applyQuality(this.quality);

    this.loop = new GameLoop(
      (dt) => this.simStep(dt),
      (dt, now, wall) => this.render(dt, now, wall),
      () => (this.paused || this.pausedForScreenshot || this.menus.open ? 0 : this.speed),
    );
    // Test hooks can fast-forward the simulation and stage scenes, so they are only
    // installed in development builds or when explicitly requested with ?test.
    // v0.4: compile-time only. Production builds contain no test hooks at all
    // (import.meta.env.DEV is replaced by `false` and the call is dead-code eliminated).
    if (import.meta.env.DEV) void import('../dev/TestHooks').then((m) => m.installTestHooks(this));
    this.resize();
  }

  async start(): Promise<void> {
    this.platform.loadingStart();
    await this.platform.init();
    this.platform.onMuteChange = () => this.applySettings(this.settings, false);
    this.applySettings(this.settings, false);
    // Compile shaders before revealing the world to avoid a first-frame hitch.
    this.renderer.compile(this.scene, this.camera);
    this.loop.start();
    window.setTimeout(() => $('#loading').classList.add('done'), 150);
    this.platform.loadingStop();
    // v0.5: the main menu over the living island, unless a test/dev URL asks to play directly.
    const direct = ['fresh', 'skipTutorial', 'tutorial', 'play'].some((k) => this.params.has(k));
    if (direct) this.enterGameplay();
    else this.showMainMenu();
  }

  /** Begin (or resume) gameplay with the current world. */
  private enterGameplay(): void {
    this.mainMenu.hide();
    this.cam.cinematic = false;
    this.inMenu = false;
    this.playSeconds = 0;
    this.platform.gameplayStart();
    if (this.params.has('skipTutorial')) this.sim.state.tutorial.done = true;
    if (this.sim.state.tutorial.done && this.sim.state.time > 120) this.sim.notify('WELCOME BACK, INTERN', 'info', 'Your island was autosaved.', 2);
    this.tutorial.start();
    if (this.sim.state.tutorial.done) {
      this.sim.powers.unlock(BASIC_POWERS);
      this.sim.missions.autoGenerate = true;
    }
    this.sim.career.applyUnlocks();
    this.tips.bind(this.sim);
  }

  private inMenu = false;

  private showMainMenu(): void {
    this.inMenu = true;
    this.select(null);
    this.openPanel(null);
    this.toolbar.closeMenu();
    this.inspector.hide();
    this.tutorial.dispose();
    this.sim.missions.autoGenerate = false;
    this.cam.cinematic = !this.reducedMotion;
    this.mainMenu.show();
  }

  /** Pause menu → Main menu: save, then show the menu over the island. */
  private toMainMenu(): void {
    this.autosave();
    this.menus.closeAll();
    this.setPaused(false, false);
    this.platform.gameplayStop();
    this.showMainMenu();
  }

  private slotInfo(mode: 'career' | 'creative'): { rank: number; title: string; day: number } | null {
    const res = this.saves.load(slotKey(mode, true));
    if (!res.ok || res.state.seed !== WORLD_SEED || res.state.mode !== mode) return null;
    if (mode === 'career' && !res.state.tutorial.done && res.state.time < 60) return null;
    const c = res.state.career;
    return { rank: c.rank, title: RANK_TITLES[c.rank - 1] ?? '', day: Math.floor(res.state.time / CONFIG.time.dayLength) + 1 };
  }

  private leaveMenu(choice: 'continue' | 'new' | 'creative'): void {
    if (choice === 'continue') {
      const res = this.saves.load(slotKey('career', true));
      if (res.ok && res.state.seed === WORLD_SEED) this.applyState(res.state, false);
      this.settings.mode = 'career';
    } else if (choice === 'new') {
      this.settings.mode = 'career';
      this.newWorld('career', true);
    } else {
      this.settings.mode = 'creative';
      const res = this.saves.load(slotKey('creative', true));
      if (res.ok && res.state.seed === WORLD_SEED && res.state.mode === 'creative') this.applyState(res.state, false);
      else this.newWorld('creative', false);
    }
    saveSettings(this.store, this.settings);
    this.applyModeOptions();
    this.refreshTerrainVisuals(-80, -80, 80, 80);
    this.enterGameplay();
  }

  // ---------------------------------------------------------------- events

  private bindSimEvents(): void {
    const bus = this.sim.bus;
    this.labels.faithLine = (v: VillagerData) => {
      const r = v.religionId ? this.sim.state.religions.find((x) => x.id === v.religionId) : undefined;
      const memories = v.memoryIds.length;
      return `${r ? `Believer: ${r.name}` : 'No religion (yet)'}${memories ? ` · remembers ${memories} miracle${memories > 1 ? 's' : ''}` : ''}${v.mutation === 'giant-head' ? ' · enormous head' : ''}`;
    };
    this.labels.onPinClick = (id) => {
      this.audio.click();
      const sacred = this.sim.state.sacred.find((x) => x.id === id);
      if (sacred) {
        this.inspector.showSacred(this.sim, id);
        this.cam.focus(sacred.x, sacred.z, 38, 1);
      }
    };
    this.book.onFocus = (x, z) => {
      this.audio.click();
      this.cam.focus(x, z, 42, 1.1);
    };
    this.book.onSacred = (id) => this.labels.onPinClick(id);
    this.book.onToggle = (open) => this.panelToggled('history', open);
    this.challengesUi.onToggle = (open) => this.panelToggled('challenges', open);
    this.challengesUi.onPinFail = () => {
      this.audio.reject();
      this.cursorToast('You can pin at most 3 challenges', false, true);
    };
    this.villagesUi.onToggle = (open) => this.panelToggled('world', open);
    this.villagesUi.onFocus = (v) => {
      this.audio.click();
      this.cam.focus(v.centerX + 2, v.centerZ - 2, 52, 1.2, 0.55, 0.86);
    };
    const v3 = (x: number, z: number, dy = 2) => new THREE.Vector3(x, this.sim.terrain.heightAt(x, z) + dy, z);
    const log = (s: string) => {
      this.eventLog.push(s);
      if (this.eventLog.length > 120) this.eventLog.shift();
    };
    this.unsubs.push(
      bus.on('NOTIFY', (e) => {
        log(`notify:${e.text}`);
        this.notes.push(e.text, e.kind, e.sub, e.priority ?? 1);
      }),
      bus.on('GOD_MESSAGE', (e) => {
        log(`god:${e.text}`);
        this.notes.memo(e.text, e.from ?? 'GOD');
      }),
      bus.on('SPEECH', (e) => {
        log(`speech:${e.text}`);
        const id = e.villagerId;
        const tmp = new THREE.Vector3();
        this.labels.speech(e.text, () => this.villagers.headPosition(id, tmp)?.add(new THREE.Vector3(0, 0.6, 0)) ?? null, e.duration, true, e.priority ?? 1);
      }),
      bus.on('POWER_USED', (e) => {
        if (e.power === 'rain') this.audio.rainStart();
        if (e.power === 'nature') this.audio.sprout();
        if (e.power === 'fire') this.audio.ignite();
        if (!this.sim.unlimitedEnergy) this.labels.float(`-${this.sim.powers.powers[e.power].energyCost} ⚡`, v3(e.x, e.z, 3), 'gold');
      }),
      bus.on('POWER_REJECTED', (e) => {
        log(`reject:${e.power}:${e.reason}`);
        this.audio.reject();
        this.cursorToast(e.reason, false);
        if (/energy/i.test(e.reason)) this.hud.flashLowEnergy();
      }),
      bus.on('RELIGION_FOUNDED', (e) => {
        log(`religion:${e.religion.name}`);
        this.audio.choir();
      }),
      bus.on('SACRED_CREATED', (e) => log(`sacred:${e.sacred.label}`)),
      bus.on('SACRED_STAGE', (e) => {
        log(`stage:${e.sacred.label}:${e.stage}`);
        this.audio.chime();
      }),
      bus.on('RITUAL_STARTED', (e) => {
        log(`ritual:${e.ritual.name}`);
        this.audio.celebrate();
      }),
      bus.on('MUTATION_APPLIED', (e) => {
        log(`mutation:${e.mutation.kind}`);
        this.audio.mutation();
      }),
      bus.on('SURREAL_EVENT', (e) => log(`surreal:${e.id}`)),
      bus.on('HISTORY_ADDED', (e) => log(`history:${e.entry.title}`)),
      bus.on('LIGHTNING_STRUCK', (e) => {
        log(`lightning:trees=${e.treesIgnited}:buildings=${e.buildingsHit}`);
        this.audio.thunder();
      }),
      bus.on('FIRE_EXTINGUISHED', (e) => e.byRain && log('extinguished:rain')),
      bus.on('PRAYER_CREATED', () => this.audio.prayer()),
      bus.on('PRAYER_COMPLETED', (e) => {
        this.audio.missionComplete();
        this.labels.float(`+${e.prayer.reward} ⚡`, v3(e.prayer.targetX, e.prayer.targetZ, 5), 'gold');
      }),
      bus.on('PRAYER_FAILED', () => this.audio.fail()),
      bus.on('VILLAGERS_CELEBRATE', () => this.audio.celebrate()),
      bus.on('FIRE_EXTINGUISHED', (e) => e.byRain && this.audio.extinguish()),
      bus.on('HARVEST', (e) => {
        const farm = this.sim.state.buildings.find((b) => b.type === 'farm' && b.villageId === e.villageId);
        if (farm) this.labels.float(`+${e.amount} food`, v3(farm.x, farm.z, 2.5), 'good');
      }),
      bus.on('BUILDING_DAMAGED', (e) => {
        const b = this.sim.building(e.buildingId);
        if (b && e.health > 0) this.labels.float(`${Math.round(e.health)}%`, v3(b.x, b.z, 5), 'bad');
      }),
      bus.on('VILLAGER_BORN', (e) => {
        const v = this.sim.villager(e.villagerId);
        if (v) this.labels.float('+1 villager', v3(v.position.x, v.position.z, 2.5), 'good');
      }),
      bus.on('VILLAGER_DIED', (e) => this.labels.float(`RIP ${e.name.split(' ')[0]}`, v3(e.x, e.z, 2.2), 'bad')),
      bus.on('POWERS_UNLOCKED', (e) => this.toolbar.flashUnlocked(e.powers)),
      bus.on('RAIN_STARTED', (e) => {
        for (const v of this.sim.state.villages) {
          const well = this.sim.building(v.wellId);
          if (well && Math.hypot(well.x - e.x, well.z - e.z) <= e.radius) this.labels.float('Well filling!', v3(well.x, well.z, 3.5), 'water');
        }
      }),
      // ---- v0.4 career, powers, discoveries ----
      bus.on('XP_GAINED', (e) => {
        log(`xp:${e.amount}:${e.reason}`);
        this.careerUi.xp(e.amount);
      }),
      bus.on('PROMOTED', (e) => {
        log(`promoted:${e.rank}`);
        this.careerUi.promoted(e.rank, e.title, e.unlocks, PROMO_LINES[e.rank] ?? '');
        this.audio.promotion();
        this.platform.celebrate();
      }),
      bus.on('COMBO_DISCOVERED', (e) => {
        log(`combo:${e.id}`);
        this.audio.discovery();
        this.vfx.sparkle(e.x, this.sim.terrain.heightAt(e.x, e.z) + 1, e.z, 0xb86bff, 30);
      }),
      bus.on('HEAVEN_MESSAGE', (e) => log(`heaven:${e.id}`)),
      bus.on('POWER_USED', (e) => {
        log(`power:${e.power}`);
        if (e.power === 'tornado') this.audio.tornado();
        if (e.power === 'freeze') this.audio.freeze();
        if (e.power === 'gravity') this.audio.gravity();
        if (e.power === 'timewarp') this.audio.timewarp(this.sim.powers.timewarp.mode === 'fast');
        if (e.power === 'meteor') this.audio.meteorIncoming();
      }),
      bus.on('METEOR_IMPACT', (e) => {
        log(`meteor:${e.buildings}:${e.trees}`);
        this.powerFx.meteorImpact(e.x, e.z);
        this.audio.meteorImpact();
        this.cam.addShake(1.1);
        this.screenFlash(0.7);
      }),
      bus.on('TERRAIN_CHANGED', (e) => {
        log(`terrain:${e.delta > 0 ? 'raise' : 'lower'}`);
        const r = e.radius + 2;
        this.refreshTerrainVisuals(e.x - r, e.z - r, e.x + r, e.z + r);
        this.powerFx.terraform(e.x, e.z, e.radius, e.delta > 0);
        this.audio.terraform(e.delta > 0);
      }),
      bus.on('VILLAGER_RESURRECTED', (e) => {
        log(`resurrected:${e.name}`);
        this.powerFx.resurrection(e.x, e.z);
        this.audio.resurrection();
      }),
      bus.on('POSSESSION_STARTED', () => {
        log('possess:start');
        this.audio.possession(true);
        this.savedView ??= this.cam.snapshot();
        this.cam.keysEnabled = false;
        this.cam.minDistance = 10;
        this.walkTarget = null;
        this.select(null);
      }),
      bus.on('POSSESSION_ENDED', (e) => {
        log(`possess:end:${e.visited.join(',')}`);
        this.audio.possession(false);
        this.cam.keysEnabled = true;
        this.cam.minDistance = 18;
        this.walkTarget = null;
        const v = this.savedView;
        this.savedView = null;
        if (v) this.cam.focus(v.x, v.z, v.d, 1.2, v.yaw, v.pitch);
        $('#possess-hud').classList.add('hidden');
      }),
      bus.on('OVERTIME_STARTED', () => {
        this.audio.promotion();
        this.screenFlash(0.4);
      }),
      bus.on('CHALLENGE_UNLOCKED', () => undefined),
      // ---- v0.3 civilization ----
      bus.on('TRADE_STARTED', (e) => log(`trade-start:${e.caravan.originId}>${e.caravan.destId}:${e.caravan.cargo.resource}`)),
      bus.on('TRADE_COMPLETED', (e) => {
        log(`trade:${e.caravan.originId}>${e.caravan.destId}`);
        const o = this.sim.village(e.caravan.originId);
        if (o && e.caravan.payment) this.labels.float(`+${Math.round(e.caravan.payment.amount)} ${e.caravan.payment.resource}`, v3(o.centerX, o.centerZ, 4), 'good');
      }),
      bus.on('TRADE_FAILED', (e) => log(`trade-failed:${e.reason}`)),
      bus.on('MIGRATION_STARTED', (e) => log(`migration-start:${e.fromId}>${e.toId}`)),
      bus.on('VILLAGER_MIGRATED', (e) => {
        log(`migrated:${e.name}:${e.fromId}>${e.toId}`);
        const v = this.sim.village(e.toId);
        if (v) this.labels.float(`Welcome, ${e.name.split(' ')[0]}!`, v3(v.centerX, v.centerZ, 3.5), 'good');
      }),
      bus.on('RELIGION_SPREAD', (e) => {
        log(`spread:${e.religionId}:${e.villageId}:${e.via}`);
        this.audio.choir();
      }),
      bus.on('RELATIONSHIP_CHANGED', (e) => log(`relation:${e.a}|${e.b}:${e.from}>${e.to}`)),
      bus.on('FAVORITISM', (e) => log(`favoritism:${e.kind}:${e.jealousId}`)),
      bus.on('CAMERA_VISIT', (e) => log(`visit:${e.villageId}`)),
      bus.on('CHALLENGE_COMPLETED', (e) => {
        log(`challenge:${e.id}`);
        this.challengesUi.celebrate(e.title, e.rewardText);
        this.audio.missionComplete();
        this.platform.celebrate();
      }),
    );
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    const canvas = this.canvas;
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    // iOS: an "interrupted" AudioContext may only resume inside a touchend/click gesture.
    window.addEventListener('touchend', unlock, { capture: true });
    window.addEventListener('click', unlock, { capture: true });

    canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.labels.showVillagerTip(null, 0, 0);
    });
    canvas.addEventListener('pointerdown', (e) => {
      canvas.focus({ preventScroll: true });
      // Clicking the island outside an open panel closes it; that press does nothing else.
      if (e.button === 0 && (this.panel || this.toolbar.menuOpen || this.hud.explaining)) {
        this.swallowClick = true;
        this.openPanel(null);
        this.toolbar.closeMenu();
        this.hud.close();
      }
      if (e.button === 0) {
        this.pointer.down = true;
        this.pointer.downX = e.clientX;
        this.pointer.downY = e.clientY;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.pointer.down) return;
      this.pointer.down = false;
      if (this.swallowClick) {
        this.swallowClick = false;
        return;
      }
      if (Math.hypot(e.clientX - this.pointer.downX, e.clientY - this.pointer.downY) > 8) return;
      this.click(e.clientX, e.clientY);
    });

    window.addEventListener('keydown', (e) => this.heldKeys.add(e.code));
    window.addEventListener('keyup', (e) => this.heldKeys.delete(e.code));
    window.addEventListener('blur', () => this.heldKeys.clear());
    window.addEventListener('keydown', (e) => {
      if (e.repeat && e.code !== 'KeyW' && e.code !== 'KeyA' && e.code !== 'KeyS' && e.code !== 'KeyD') return;
      if (e.target instanceof HTMLInputElement) return;
      if (this.cinematic || this.screenshotMode) {
        e.preventDefault();
        this.setCinematic(false);
        this.setScreenshotMode(false);
        return;
      }
      if (this.sim.state.possession && !this.menus.open) {
        if (e.code === 'KeyQ' || e.code === 'Escape') {
          e.preventDefault();
          this.sim.possession.end('the intern let go');
          return;
        }
        if (e.code === 'KeyE') {
          const what = this.sim.possession.interact();
          if (what) this.cursorToast(what, true, true);
          return;
        }
      }
      if (this.inMenu) {
        if (e.code === 'Escape' && this.menus.open) this.menus.close(false);
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        // Escape cancels the selected power first (the on-screen Cancel button does the same).
        if (this.menus.open) this.menus.close(true);
        else if (e.code === 'Escape' && this.selected) this.select(null);
        else if (this.toolbar.menuOpen) this.toolbar.closeMenu();
        else if (this.hud.explaining) this.hud.close();
        else if (this.panel) this.openPanel(null);
        else if (this.inspector.open) this.inspector.hide();
        else this.openMenu();
        return;
      }
      if (this.menus.open) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.setPaused(!this.paused);
      } else if (e.code === 'KeyF') {
        this.toggleSpeed();
      } else if (e.code === 'KeyB') {
        this.togglePanel('history');
      } else if (e.code === 'KeyC') {
        this.togglePanel('challenges');
      } else if (e.code === 'KeyV') {
        this.togglePanel('world');
      } else if (/^Digit[0-7]$/.test(e.code) || /^Numpad[0-7]$/.test(e.code)) {
        const n = Number(e.code.slice(-1));
        const id = n === 0 ? null : (this.toolbar.slot(n - 1) ?? null);
        this.select(id && id === this.selected ? null : id);
      } else if (e.code === 'KeyG' || e.code === 'Tab') {
        e.preventDefault();
        this.toolbar.toggleMenu();
      } else if (e.code === 'KeyT') {
        this.toggleSubMode();
      } else if (e.code === 'KeyJ') {
        this.togglePanel('career');
      } else if (e.code === 'KeyO') {
        this.startOvertime();
      } else if (e.code === 'KeyK') {
        this.setCinematic(true);
      } else if (e.code === 'KeyH') {
        this.setScreenshotMode(true);
      }
    });

    document.querySelectorAll<HTMLElement>('#sidenav [data-nav]').forEach((b) =>
      b.addEventListener('click', () => this.togglePanel(b.dataset.nav as Panel)),
    );
    $('#career-chip').addEventListener('click', () => this.syncPanelState());
    this.hud.onExplain = (open) => {
      this.audio.click();
      if (open) {
        this.openPanel(null);
        this.toolbar.closeMenu();
      }
    };
    // Possession: on-screen pad (hold to walk), Interact and Leave buttons (touch and mouse).
    const pad = $('#possess-pad');
    pad.querySelectorAll<HTMLElement>('[data-dir]').forEach((b) => {
      const on = (e: PointerEvent) => {
        e.preventDefault();
        this.padDirs.add(b.dataset.dir!);
        b.classList.add('held');
      };
      const off = () => {
        this.padDirs.delete(b.dataset.dir!);
        b.classList.remove('held');
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('pointercancel', off);
    });
    pad.querySelector('[data-pe]')!.addEventListener('click', () => {
      const what = this.sim.possession.interact();
      this.cursorToast(what ?? 'Nothing to interact with here', true, true);
    });
    pad.querySelector('[data-pq]')!.addEventListener('click', () => this.sim.possession.end('the intern let go'));

    $('#btn-pause').addEventListener('click', () => {
      this.audio.click();
      this.setPaused(!this.paused);
    });
    $('#btn-settings').addEventListener('click', () => {
      this.audio.click();
      this.openMenu();
    });
    $('#btn-speed').addEventListener('click', () => {
      this.audio.click();
      this.toggleSpeed();
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autosave();
      // CrazyGames handles focus/visibility itself; only other hosts need the lifecycle here.
      if (this.platform.handlesVisibility) return;
      if (document.hidden) this.platform.gameplayStop();
      else this.platform.gameplayStart();
    });
    window.addEventListener('beforeunload', () => this.autosave());
    // Keep the page itself from scrolling or zooming.
    window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** v0.5: one side panel at a time. `null` closes whichever is open. */
  openPanel(p: Panel | null): void {
    const ui = { world: this.villagesUi, career: this.careerUi, challenges: this.challengesUi, history: this.book, help: this.tips };
    for (const [k, v] of Object.entries(ui) as Array<[Panel, { open: boolean; close(): void }]>) if (k !== p && v.open) v.close();
    if (p) {
      this.toolbar.closeMenu();
      this.hud.close();
      const target = ui[p] as { open: boolean; show?: () => void; showHelp?: () => void };
      if (!target.open) (p === 'help' ? this.tips.showHelp() : (target as { show(): void }).show());
    }
    this.syncPanelState();
  }

  private togglePanel(p: Panel): void {
    this.openPanel(this.panel === p ? null : p);
  }

  /** Called by each panel when it opens or closes itself (close buttons). */
  private panelToggled(p: Panel, open: boolean): void {
    this.audio.click();
    if (open) {
      const ui = { world: this.villagesUi, career: this.careerUi, challenges: this.challengesUi, history: this.book, help: this.tips };
      for (const [k, v] of Object.entries(ui) as Array<[Panel, { open: boolean; close(): void }]>) if (k !== p && v.open) v.close();
      this.toolbar.closeMenu();
    }
    this.syncPanelState();
  }

  private syncPanelState(): void {
    const open = this.villagesUi.open ? 'world' : this.careerUi.open ? 'career' : this.challengesUi.open ? 'challenges' : this.book.open ? 'history' : this.tips.open ? 'help' : null;
    this.panel = open;
    document.body.classList.toggle('panel-open', !!open);
    document.querySelectorAll<HTMLElement>('#sidenav [data-nav]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.nav === open)));
  }

  /** Compatibility for older call sites. */
  private closeDrawers(_keep: string): void {
    this.openPanel(null);
  }

  /** Dirt roads drawn along the real A* routes caravans use between plazas (decimated). */
  private roadSegments(): number[] {
    const vs = this.sim.state.villages;
    const out: number[] = [];
    const pairs: Array<[number, number]> = [];
    for (let i = 1; i < vs.length; i++) pairs.push([0, i]);
    for (const [a, b] of pairs) {
      const p = this.sim.pathfinding.findPath(vs[a].centerX, vs[a].centerZ, vs[b].centerX, vs[b].centerZ, 12000);
      if (!p) continue;
      let px = vs[a].centerX;
      let pz = vs[a].centerZ;
      for (let i = 0; i < p.length; i += 2) {
        if (i + 2 < p.length && Math.hypot(p[i] - px, p[i + 1] - pz) < 3) continue;
        out.push(px, pz, p[i], p[i + 1]);
        px = p[i];
        pz = p[i + 1];
      }
    }
    return out;
  }

  private openMenu(): void {
    this.setPaused(true, false);
    this.menus.pause();
  }

  private setPaused(paused: boolean, showBadge = true): void {
    this.paused = paused;
    $('#paused-badge').classList.toggle('hidden', !(paused && showBadge && !this.menus.open));
    this.audio.suspend(paused);
    if (paused) this.platform.gameplayStop();
    else this.platform.gameplayStart();
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
  }

  select(id: PowerId | null): void {
    if (id && !this.sim.state.unlockedPowers.includes(id)) {
      this.audio.reject();
      this.cursorToast(this.sim.powers.lockReason(id) ?? 'Locked', false, true);
      return;
    }
    this.selected = this.selected === id ? null : id;
    if (this.selected) {
      this.inspector.hide();
      this.toolbar.closeMenu();
    }
    this.tips.selected(this.selected);
    document.body.classList.toggle('targeting', !!this.selected);
    this.labels.showVillagerTip(null, 0, 0);
    this.audio.click();
  }

  private click(x: number, y: number): void {
    if (this.cam.touchGesture) return; // a touch drag/pinch, not a tap
    if (this.cinematic || this.screenshotMode) {
      this.setCinematic(false);
      this.setScreenshotMode(false);
      return;
    }
    if (this.sim.state.possession) {
      if (this.pickGround(x, y, this.ground)) this.walkTarget = { x: this.ground.x, z: this.ground.z };
      return;
    }
    if (this.selected) {
      if (!this.pickGround(x, y, this.ground)) return;
      this.sim.powers.activate(this.selected, this.ground.x, this.ground.z);
      return;
    }
    // Look mode: inspect villagers (and caravans through their merchants), sacred
    // objects, buildings, disaster sites and villages.
    const villager = this.pickVillager(x, y);
    if (villager) {
      this.audio.click();
      this.inspector.showVillager(this.sim, villager.id);
      return;
    }
    const onGround = this.pickGround(x, y, this.ground);
    if (onGround) {
      const sacred = this.sim.sacredSys.nearest(this.ground.x, this.ground.z, 3);
      if (sacred) {
        this.audio.click();
        this.inspector.showSacred(this.sim, sacred.id);
        return;
      }
    }
    this.setNdc(x, y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.buildings.pickables, false);
    const hit = hits.find((h) => h.object.visible);
    if (hit) {
      const b = this.sim.building(hit.object.userData.buildingId as number);
      if (b) {
        this.audio.click();
        this.inspector.show(this.sim, b.villageId, b.id);
        return;
      }
    }
    if (onGround) {
      const gx = this.ground.x;
      const gz = this.ground.z;
      const s = this.sim.state;
      const fires = s.fires.filter((f) => f.intensity > 0 && Math.hypot(f.x - gx, f.z - gz) < 5).length;
      const crater = s.craters.find((c) => Math.hypot(c.x - gx, c.z - gz) < c.radius + 1);
      const effect = s.effects.find((e) => Math.hypot(e.x - gx, e.z - gz) < 6);
      if (fires || crater || effect) {
        this.audio.click();
        const label = fires ? 'Fire' : crater ? 'Meteor crater' : effect!.kind === 'tornado' ? 'Tornado' : effect!.kind === 'freeze' ? 'Frozen ground' : effect!.kind === 'gravity' ? 'Low gravity' : effect!.kind === 'timewarp' ? 'Time bubble' : 'Impact site';
        const text = fires ? `${fires} fire${fires > 1 ? 's' : ''} burning here. Rain or Freeze puts them out; left alone they spread.` : crater ? 'A fresh crater. Rain cools it and lets the grass return.' : `An active ${label.toLowerCase()}. It ends on its own in ${Math.max(1, Math.round(effect!.until - s.time))} s.`;
        this.inspector.showSite(this.sim, gx, gz, label, text);
        return;
      }
      const near = this.sim.nearestVillage(gx, gz);
      if (near.village && near.distance < near.village.radius * 0.6) {
        this.audio.click();
        this.inspector.show(this.sim, near.village.id, null);
        return;
      }
    }
    this.inspector.hide();
  }

  private setNdc(x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  }

  /** Ray-march against the heightfield (cheaper and exact versus mesh raycasts). */
  private pickGround(x: number, y: number, out: THREE.Vector3): boolean {
    this.setNdc(x, y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const o = this.raycaster.ray.origin;
    const d = this.raycaster.ray.direction;
    const terrain = this.sim.terrain;
    let prev = 0;
    for (let t = 1; t < 600; t += 0.8) {
      const px = o.x + d.x * t;
      const py = o.y + d.y * t;
      const pz = o.z + d.z * t;
      if (py < terrain.surfaceAt(px, pz)) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const my = o.y + d.y * mid;
          if (my < terrain.surfaceAt(o.x + d.x * mid, o.z + d.z * mid)) hi = mid;
          else lo = mid;
        }
        out.set(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
        return Math.abs(out.x) < 80 && Math.abs(out.z) < 80;
      }
      prev = t;
      if (py < -10) break;
    }
    return false;
  }

  private pickVillager(x: number, y: number) {
    this.setNdc(x, y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.villagers.pickMesh, false);
    if (!hits.length || hits[0].instanceId === undefined) return undefined;
    return this.villagers.villagerAt(hits[0].instanceId);
  }

  private cursorToast(text: string, info: boolean, center = false): void {
    const node = $('#cursor-toast');
    node.textContent = text;
    node.classList.toggle('info', info);
    node.classList.remove('hidden');
    node.style.left = `${center ? window.innerWidth / 2 - 80 : this.pointer.x}px`;
    node.style.top = `${center ? window.innerHeight - 150 : this.pointer.y}px`;
    this.cursorToastTimer = 1.4;
  }

  // ---------------------------------------------------------------- frame

  private syncPins(): void {
    const s = this.sim.state;
    this.labels.syncPins(
      s.sacred
        .filter((x) => x.stage >= 2)
        .map((x) => {
          const r = x.religionId ? s.religions.find((q) => q.id === x.religionId) : undefined;
          const lift = x.stage >= 5 ? 7.5 : x.kind === 'tree' ? 6 : 4.2;
          return { id: x.id, label: x.label, stage: x.stage, x: x.x, y: this.sim.terrain.heightAt(x.x, x.z) + lift, z: x.z, color: r?.color ?? 0xf2c14e };
        }),
    );
  }

  private simStep(dt: number): void {
    const t0 = performance.now();
    this.sim.step(dt);
    this.simMs = this.simMs * 0.9 + (performance.now() - t0) * 0.1;
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = CONFIG.autosaveInterval;
      this.autosave();
    }
  }

  private autosave(): void {
    if (this.inMenu) return;
    this.saves.save(this.sim.state, slotKey(this.sim.state.mode, true));
  }

  private render(dt: number, now: number, wallDt = dt): void {
    const cpu0 = performance.now();
    this.frame++;
    const frozen = this.pausedForScreenshot;
    const animDt = this.reducedMotion || frozen ? 0 : dt;
    this.elapsed += animDt;
    const sim = this.sim;
    const s = sim.state;

    this.resize();
    // v0.4 possession: keys/taps steer the villager; the camera follows close behind.
    const pv = this.sim.possession.villager;
    if (pv && !frozen) {
      let dx = 0;
      let dz = 0;
      if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp') || this.padDirs.has('up')) dz -= 1;
      if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown') || this.padDirs.has('down')) dz += 1;
      if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft') || this.padDirs.has('left')) dx -= 1;
      if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight') || this.padDirs.has('right')) dx += 1;
      let wx = 0;
      let wz = 0;
      if (dx || dz) {
        this.walkTarget = null;
        // Camera-relative: forward is away from the camera.
        const yaw = this.cam.yaw;
        wx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
        wz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
      } else if (this.walkTarget) {
        wx = this.walkTarget.x - pv.position.x;
        wz = this.walkTarget.z - pv.position.z;
        if (Math.hypot(wx, wz) < 0.6) {
          this.walkTarget = null;
          wx = wz = 0;
        }
      }
      this.sim.possession.steer(wx, wz);
      this.cam.track(pv.position.x, pv.position.y, pv.position.z, pv.heading, dt);
    }
    // Inspector "Follow with camera".
    const followId = this.inspector.following;
    if (followId && !pv && !frozen) {
      const fv = this.sim.villager(followId);
      if (fv?.alive) this.cam.follow(fv.position.x, fv.position.z, dt);
    }
    if (!frozen) this.cam.update(dt);
    const gameDt = this.paused || this.menus.open || frozen || this.inMenu ? 0 : wallDt;
    this.tutorial.update(gameDt);
    this.tips.update(this.sim, gameDt);
    if (!this.inMenu) this.playSeconds += gameDt;

    // Targeting preview.
    const live = this.pointer.inside && !this.cam.dragging && !this.menus.open;
    this.groundValid = live && this.pickGround(this.pointer.x, this.pointer.y, this.ground);
    if (this.selected && this.groundValid) {
      const check = sim.powers.check(this.selected, this.ground.x, this.ground.z);
      const valid = check.ok || /Recharging|energy/.test(check.reason ?? '');
      this.toolbar.target = { valid: check.ok || valid, reason: check.reason ?? '' };
      const radius = sim.powers.powers[this.selected].radius;
      this.terrainMesh.setCursor(this.ground.x, this.ground.z, Math.max(1.2, radius), valid ? POWER_ACCENT[this.selected] : '#e5484d', true);
      this.canvas.className = valid ? 'targeting' : 'invalid';
    } else {
      this.toolbar.target = null;
      this.terrainMesh.setCursor(0, 0, 0, '#fff', false);
      this.canvas.className = this.cam.dragging ? 'grabbing' : '';
    }
    // Hover villager tip in Look mode.
    if (!this.selected && live && this.frame % 3 === 0) {
      const v = this.pickVillager(this.pointer.x, this.pointer.y);
      this.labels.showVillagerTip(v ?? null, this.pointer.x, this.pointer.y);
    }
    if (this.cursorToastTimer > 0) {
      this.cursorToastTimer -= dt;
      if (this.cursorToastTimer <= 0) $('#cursor-toast').classList.add('hidden');
    }

    // World presentation from logical state.
    const tod = sim.timeOfDay;
    this.dayNight.update(tod, this.cam.target, this.camera.position);
    const night = this.dayNight.night;
    this.terrainMesh.uniforms.uTime.value = this.elapsed;
    this.terrainMesh.setClouds(s.clouds);
    this.terrainMesh.updateWetness(s.moisture, s.flood, dt);
    this.water.update(this.elapsed, this.dayNight.sunDir, this.dayNight.sunColor, this.dayNight.horizon, night);
    this.vegetation.sync(s.trees, sim.terrain, animDt, this.elapsed);
    const activePrayers = s.prayers.filter((p) => p.status === 'active').length;
    this.buildings.update(s.villages, night, activePrayers, this.elapsed, animDt);
    const religionColors = new Map(s.religions.filter((r) => r.active).map((r) => [r.id, r.color] as [string, number]));
    this.packColors.clear();
    for (const c of s.civ.caravans) {
      const res = c.phase === 'outbound' ? c.cargo.resource : c.payment?.resource ?? c.cargo.resource;
      for (const id of c.merchantIds) this.packColors.set(id, RESOURCE_COLOR[res] ?? 0xc8a46a);
    }
    this.villagers.update(s.villagers, sim.terrain, animDt, this.elapsed, this.reducedMotion, religionColors, s.culture.upsideDownUntil > s.time, this.packColors, s.time);
    this.culture.update(s, this.elapsed, night, this.reducedMotion);
    const possessedPos = pv ? this.tmpV.set(pv.position.x, pv.position.y, pv.position.z) : null;
    this.powerFx.resurrectionSelected = this.selected === 'resurrection';
    this.powerFx.update(s, animDt, this.elapsed, this.reducedMotion, possessedPos);
    const unlocks = [...s.culture.improvements, ...s.civ.cosmetics];
    this.decors.forEach((d, i) => {
      const v = s.villages[i];
      const faith = v?.identity.dominantReligionId ? s.religions.find((r) => r.id === v.identity.dominantReligionId && r.active) : undefined;
      d.update(unlocks, night, faith ? faith.color : null, !!v && v.prosperity > 0.74);
    });
    this.weather.rainbow = s.civ.cosmetics.includes('rainbow-rain');
    this.vfx.setGoldenLightning(s.civ.cosmetics.includes('golden-lightning'));
    if (!frozen) sim.civ.cameraAt(this.cam.target.x, this.cam.target.z, wallDt);
    this.weather.update(s.clouds, sim.terrain, animDt, this.elapsed, this.vfx.bits, night);
    this.ambient.update(this.elapsed, night, this.reducedMotion);
    this.vfx.update(s, animDt, this.elapsed, night, this.buildings.chimneys(this.chimneyTops));

    // UI.
    const cost = this.selected ? sim.powers.powers[this.selected].energyCost : 0;
    this.hud.update(sim, this.paused || this.menus.open, this.speed, cost);
    this.toolbar.update(sim, this.selected);
    this.prayers.setCollapsed(this.inspector.open);
    document.body.classList.toggle('inspecting', this.inspector.open);
    document.body.classList.toggle('possessing', !!s.possession);
    this.prayers.update(sim);
    this.inspector.update(sim, dt);
    if (this.paused !== this.pauseShown) {
      this.pauseShown = this.paused;
      const btn = $('#btn-pause');
      btn.querySelector('[data-icon]')!.innerHTML = ICON[this.paused ? 'play' : 'pause'];
      $('#pause-label').textContent = this.paused ? 'Resume' : 'Pause';
      btn.classList.toggle('active', this.paused);
      btn.setAttribute('aria-label', this.paused ? 'Resume' : 'Pause');
    }
    setText($('#speed-label'), `${this.speed}×`);
    this.book.update(sim);
    this.villagesUi.update(sim);
    this.careerUi.update(sim, wallDt);
    this.updateOverlays(sim);
    this.challengesUi.update(sim, wallDt, !!this.panel || this.toolbar.menuOpen || this.inMenu);
    this.notes.update();
    this.pinTimer -= dt;
    if (this.pinTimer <= 0) {
      this.pinTimer = 0.4;
      this.syncPins();
      const ticker = cultureTicker(sim);
      const node = $('#culture-ticker');
      if (node.textContent !== ticker) node.textContent = ticker;
      node.classList.toggle('hidden', !ticker);
    }
    this.labels.update(this.camera, this.canvas.clientWidth, this.canvas.clientHeight);
    if (this.frame % 10 === 0) this.labels.renderTip();
    this.audio.update(dt, s.clouds.length, s.fires.length, night, this.paused || this.menus.open);

    const gl0 = performance.now();
    this.cpuMs = this.cpuMs * 0.9 + (gl0 - cpu0) * 0.1;
    this.renderer.render(this.scene, this.camera);
    this.glMs = this.glMs * 0.9 + (performance.now() - gl0) * 0.1;
    this.trackPerformance(dt);
    this.perf.update(dt, {
      fps: this.fps,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      villagers: s.villagers.filter((p) => p.alive).length,
      fires: s.fires.length,
      particles: this.vfx.glow.active + this.vfx.smoke.active + this.vfx.bits.active,
      religions: s.religions.filter((r) => r.active).length,
      events: cultureTicker(sim).split(' · ').filter(Boolean).length,
      memories: s.memories.length,
      sacred: s.sacred.length,
      quality: this.quality,
      simMs: this.simMs,
      caravans: s.civ.caravans.length,
      travellers: s.villagers.filter((p) => p.alive && p.travel).length,
      rituals: s.religions.filter((r) => r.active && r.rituals.some((x) => x.activeUntil > s.time)).length,
    });
    this.publishDiagnostics(now);
  }

  private trackPerformance(dt: number): void {
    if (dt <= 0) return;
    this.fpsSamples.push(1 / dt);
    if (this.fpsSamples.length > 90) this.fpsSamples.shift();
    this.fps = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    if (this.settings.quality !== 'auto' || this.params.has('quality')) return;
    this.qualityTimer += dt;
    if (this.qualityTimer > 4 && this.fpsSamples.length >= 90) {
      this.qualityTimer = 0;
      if (this.fps < 38 && this.quality !== 'low') this.applyQuality(this.quality === 'high' ? 'medium' : 'low');
    }
  }

  private screenFlash(amount: number): void {
    const node = $('#screen-flash');
    const strength = this.settings.reducedMotion ? 0 : this.settings.reducedShake ? 0.25 : 0.7;
    node.animate([{ opacity: amount * strength }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  }

  private resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const maxDpr = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w / h < 1 ? 55 : 40;
      this.camera.updateProjectionMatrix();
      this.vfx.setViewportHeight(h * dpr);
    }
  }

  // ---------------------------------------------------------------- settings

  private applySettings(s: Settings, persist = true): void {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = s;
    this.audio.setVolumes(this.platform.muted ? 0 : s.masterVolume, s.sfxVolume, s.musicVolume, s.ambientVolume, s.uiVolume);
    this.cam.sensitivity = s.cameraSensitivity;
    this.cam.reducedShake = s.reducedShake || !s.cameraShake;
    this.reducedMotion = s.reducedMotion;
    document.body.classList.toggle('reduced-motion', s.reducedMotion);
    this.applyModeOptions();
    if (qualityChanged) this.applyQuality(s.quality === 'auto' ? 'high' : s.quality);
    if (persist) saveSettings(this.store, s);
  }

  private applyQuality(q: Quality): void {
    this.quality = q;
    const shadow = q === 'high' ? 2048 : q === 'medium' ? 1024 : 0;
    this.renderer.shadowMap.enabled = shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.dayNight.setShadowQuality(shadow);
    this.vfx.setDensity(q === 'high' ? 1 : q === 'medium' ? 0.75 : 0.45);
    this.weather.density = q === 'high' ? 1 : q === 'medium' ? 0.7 : 0.4;
    this.vegetation.setDetail(q);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.canvas.width = 0; // force resize with new DPR cap
    this.resize();
  }

  private toggleFullscreen(): void {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    if (document.fullscreenElement || doc.webkitFullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  // ---------------------------------------------------------------- world reset / load

  private restart(mode = this.sim.state.mode): void {
    const fresh = createInitialState(WORLD_SEED, this.sim.terrain);
    fresh.mode = mode;
    this.applyState(fresh);
    this.sim.state.tutorial.done = true;
    this.sim.powers.unlock(BASIC_POWERS);
    this.sim.applyMode();
    this.sim.career.applyUnlocks();
    this.sim.missions.autoGenerate = true;
    this.saves.clear(slotKey(mode, true));
    this.refreshTerrainVisuals(-80, -80, 80, 80);
    this.sim.notify('A FRESH ISLAND', 'info', mode === 'creative' ? 'Creative Mode: every power, no career on the line.' : 'Day one again. Try to keep it that way.');
  }

  /** Career ↔ Creative: save the current slot, then open the other mode's autosave (or a new island). */
  private switchMode(mode: 'career' | 'creative'): void {
    if (mode === this.sim.state.mode) return;
    this.autosave();
    this.settings.mode = mode;
    saveSettings(this.store, this.settings);
    const res = this.saves.load(slotKey(mode, true));
    if (res.ok && res.state.seed === WORLD_SEED && res.state.mode === mode) {
      this.applyState(res.state);
      this.refreshTerrainVisuals(-80, -80, 80, 80);
      this.sim.notify(mode === 'creative' ? 'CREATIVE MODE' : 'CAREER MODE', 'info', 'Welcome back to this slot.');
    } else this.restart(mode);
    this.applyModeOptions();
  }

  /** Creative-only options: unlimited energy and reduced cooldowns never apply to Career Mode. */
  private applyModeOptions(): void {
    const creative = this.sim.state.mode === 'creative';
    this.sim.unlimitedEnergy = creative && this.settings.unlimitedEnergy;
    this.sim.reducedCooldowns = creative && this.settings.reducedCooldowns;
  }

  /** Terrain mesh, ground clutter and grounding after heightfield edits (local box). */
  private refreshTerrainVisuals(x0: number, z0: number, x1: number, z1: number): void {
    this.terrainMesh.updateRegion(x0, z0, x1, z1);
    this.vegetation.reground(this.sim.terrain, x0, z0, x1, z1);
  }

  /** Explicit mode buttons in the targeting bar (Raise/Lower, Accelerate/Slow). */
  private setSubMode(mode: string): void {
    if (mode === 'raise' || mode === 'lower') this.sim.powers.terraform.mode = mode;
    else if (mode === 'fast' || mode === 'slow') this.sim.powers.timewarp.mode = mode;
    else return;
    this.audio.uiClick();
  }

  private toggleSubMode(): void {
    if (this.selected === 'terraform') {
      const t = this.sim.powers.terraform;
      t.mode = t.mode === 'raise' ? 'lower' : 'raise';
      this.cursorToast(t.mode === 'raise' ? 'Terraform: raise' : 'Terraform: lower', true, true);
    } else if (this.selected === 'timewarp') {
      const t = this.sim.powers.timewarp;
      t.mode = t.mode === 'fast' ? 'slow' : 'fast';
      this.cursorToast(t.mode === 'fast' ? 'Time Warp: fast' : 'Time Warp: slow', true, true);
    } else return;
    this.audio.uiClick();
  }

  private startOvertime(): void {
    if (!this.sim.career.startOvertime()) {
      this.audio.reject();
      this.cursorToast(this.sim.state.career.rank < 10 && this.sim.state.mode === 'career' ? 'Divine Overtime unlocks at rank 10' : 'Overtime is recharging', false, true);
    }
  }

  setCinematic(on: boolean): void {
    if (on === this.cinematic) return;
    this.cinematic = on;
    document.body.classList.toggle('cinematic', on);
    $('#cine-exit').classList.toggle('hidden', !on);
    if (on) {
      this.savedView = this.cam.snapshot();
      this.select(null);
      this.closeDrawers('book');
      this.book.close();
    } else if (this.savedView && !this.sim.state.possession) {
      const v = this.savedView;
      this.savedView = null;
      this.cam.focus(v.x, v.z, v.d, 1.2, v.yaw, v.pitch);
    }
    this.cam.cinematic = on;
  }

  setScreenshotMode(on: boolean): void {
    if (on === this.screenshotMode) return;
    this.screenshotMode = on;
    document.body.classList.toggle('screenshot', on);
    if (on) this.cursorToast('Screenshot mode · any key or click to exit', true, true);
  }

  /** Possession HUD, mode badge and overtime glow. */
  private updateOverlays(sim: Simulation): void {
    const p = sim.state.possession;
    const hud = $('#possess-hud');
    if (p) {
      const v = sim.villager(p.villagerId);
      const left = Math.max(0, Math.ceil(p.until - sim.state.time));
      const key = `${p.villagerId}|${left}|${p.visited.length}`;
      if (v && key !== this.possessLabelKey) {
        this.possessLabelKey = key;
        const village = sim.village(v.villageId);
        hud.innerHTML = `<div><small>Possessing · ${left}s</small><b>${v.name}</b><span>${v.traits.join(' · ')} · ${village?.name ?? ''}</span></div>
          <p>Walk with the pad, tap the ground, or WASD · Interact (E) · Leave (Q)</p>`;
      }
      hud.classList.remove('hidden');
      $('#possess-pad').classList.remove('hidden');
    } else {
      hud.classList.add('hidden');
      $('#possess-pad').classList.add('hidden');
      this.padDirs.clear();
    }
    const badge = $('#mode-badge');
    const creative = sim.state.mode === 'creative';
    badge.classList.toggle('hidden', !creative);
    if (creative && badge.textContent !== 'CREATIVE MODE · no career XP') badge.textContent = 'CREATIVE MODE · no career XP';
    document.body.classList.toggle('overtime', sim.career.overtimeActive());
    document.body.classList.toggle('aura', sim.state.civ.cosmetics.includes('cosmic-aura'));
  }

  private loadFrom(key: string): boolean {
    const res = this.saves.load(key);
    if (!res.ok || res.state.seed !== WORLD_SEED) {
      this.sim.notify('SAVE COULD NOT BE LOADED', 'bad', res.ok ? 'It belongs to a different universe.' : `The save is ${res.reason}.`);
      return false;
    }
    this.applyState(res.state);
    this.sim.notify('GAME LOADED', 'good', `Day ${this.sim.day}. Everything is exactly as you left it.`);
    return true;
  }

  private applyState(state: ReturnType<typeof createInitialState>, startTutorial = true): void {
    this.sim.replaceState(state);
    this.buildings.rebind(state.buildings);
    this.villagers.reset();
    this.vfx.clear();
    this.labels.clear();
    this.prayers.clear();
    this.book.close();
    this.challengesUi.close();
    this.villagesUi.close();
    this.inspector.hide();
    this.notes.clear();
    this.tutorial.dispose();
    this.select(null);
    this.openPanel(null);
    this.toolbar.closeMenu();
    this.sim.missions.autoGenerate = state.tutorial.done;
    if (state.tutorial.done) this.sim.powers.unlock(BASIC_POWERS);
    this.tips.bind(this.sim);
    if (startTutorial) this.tutorial.start();
  }

  /** A brand-new island for a mode. A new Career begins with the short onboarding. */
  private newWorld(mode: 'career' | 'creative', onboarding: boolean): void {
    const fresh = createInitialState(WORLD_SEED, this.sim.terrain);
    fresh.mode = mode;
    if (!onboarding) fresh.tutorial.done = true;
    this.applyState(fresh, false);
    this.sim.applyMode();
    if (!onboarding) {
      this.sim.powers.unlock(BASIC_POWERS);
      this.sim.career.applyUnlocks();
    }
    this.saves.clear(slotKey(mode, true));
    this.saves.clear(slotKey(mode, false));
  }

  // ---------------------------------------------------------------- test hooks

  private civDiagnostics() {
    const sim = this.sim;
    const s = sim.state;
    const travellers: Record<string, number> = {};
    for (const p of s.villagers) if (p.alive && p.travel) travellers[p.travel.kind] = (travellers[p.travel.kind] ?? 0) + 1;
    const relations: Record<string, { score: number; category: string }> = {};
    for (let i = 0; i < s.villages.length; i++) {
      for (let j = i + 1; j < s.villages.length; j++) {
        const key = relationKey(s.villages[i].id, s.villages[j].id);
        const r = s.civ.relations[key];
        if (r) relations[key] = { score: +r.score.toFixed(2), category: r.category };
      }
    }
    return {
      villages: s.villages.map((v) => ({
        id: v.id,
        name: v.name,
        culture: v.identity.culture,
        population: v.population,
        food: +v.food.toFixed(1),
        water: +v.water.toFixed(1),
        wood: +v.wood.toFixed(1),
        stone: +v.stone.toFixed(1),
        prosperity: +v.prosperity.toFixed(3),
        favor: +v.identity.divineFavor.toFixed(1),
        favorPos: +sim.civ.favorSum(v.id, 1).toFixed(1),
        favorNeg: +sim.civ.favorSum(v.id, -1).toFixed(1),
        dominantReligion: v.identity.dominantReligionId ?? null,
        center: { x: v.centerX, z: v.centerZ },
      })),
      relations,
      caravans: s.civ.caravans.map((c) => ({
        id: c.id,
        origin: c.originId,
        dest: c.destId,
        phase: c.phase,
        kind: c.kind,
        cargo: { ...c.cargo },
        payment: c.payment ? { ...c.payment } : null,
        merchants: c.merchantIds.map((id) => {
          const m = sim.villager(id);
          return m ? { id, x: +m.position.x.toFixed(2), z: +m.position.z.toFixed(2), y: +m.position.y.toFixed(2) } : { id };
        }),
      })),
      travellers,
      stats: { trades: s.stats.tradesCompleted, tradesFailed: s.stats.tradesFailed, migrations: s.stats.migrations, religionSpreads: s.stats.religionSpreads },
      challenges: {
        completed: sim.challenges.completedCount(),
        status: Object.fromEntries(sim.challenges.definitions.map((d) => [d.id, sim.challenges.state(d.id).status])),
        rewardApplied: Object.fromEntries(sim.challenges.definitions.map((d) => [d.id, sim.challenges.state(d.id).rewardApplied])),
        pinned: [...s.civ.pinned],
        titles: [...s.civ.titles],
        selectedTitle: s.civ.selectedTitle,
        cosmetics: [...s.civ.cosmetics],
      },
      visited: [...s.civ.visited],
      panels: { challenges: this.challengesUi.open, villages: this.villagesUi.open, pins: !document.querySelector('#challenge-pins')?.classList.contains('hidden') },
    };
  }

  private publishDiagnostics(now: number): void {
    if (this.frame % 5 !== 0) return;
    const info = this.renderer.info;
    const s = this.sim.state;
    const v = s.villages[0];
    const states: Record<string, number> = {};
    for (const p of s.villagers) states[p.currentTask.state] = (states[p.currentTask.state] ?? 0) + 1;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: now,
      fps: Math.round(this.fps),
      timing: { frameCpuMs: +this.cpuMs.toFixed(2), renderSubmitMs: +this.glMs.toFixed(2), simMs: +this.simMs.toFixed(3) },
      counts: {
        villagers: s.villagers.filter((p) => p.alive).length,
        caravans: s.civ.caravans.length,
        travellers: s.villagers.filter((p) => p.alive && p.travel).length,
        rituals: s.religions.filter((r) => r.active && r.rituals.some((x) => x.activeUntil > s.time)).length,
        particles: this.vfx.glow.active + this.vfx.smoke.active + this.vfx.bits.active,
      },
      quality: this.quality,
      paused: this.paused,
      selected: this.selected,
      tutorial: { step: s.tutorial.step, done: s.tutorial.done },
      culture: {
        religions: s.religions.filter((r) => r.active).map((r) => ({ name: r.name, archetype: r.archetype, followers: r.followers.length })),
        sacred: s.sacred.map((x) => ({ label: x.label, stage: x.stage, decorations: x.decorations, shrine: x.shrineProgress, monument: x.monumentProgress })),
        memories: s.memories.length,
        history: s.history.length,
        historyTitles: s.history.slice(-8).map((h) => h.title),
        mutations: s.mutations.map((m) => m.kind),
        crownedRock: s.culture.rockKingId,
        events: s.culture.eventsFired,
        ticker: cultureTicker(this.sim),
        bookOpen: this.book.open,
      },
      sim: {
        time: s.time,
        day: this.sim.day,
        energy: s.energy,
        approval: s.approval,
        chaos: s.chaos,
        population: v.population,
        food: v.food,
        water: v.water,
        wood: v.wood,
        faith: v.faith,
        fear: v.fear,
        happiness: v.happiness,
        flood: v.flood,
        fires: s.fires.length,
        clouds: s.clouds.length,
        trees: s.trees.length,
        prayers: s.prayers.filter((p) => p.status === 'active').map((p) => p.type),
        prayersAnswered: s.stats.prayersAnswered,
        villagerStates: states,
        unlocked: s.unlockedPowers,
        cursor: this.groundValid ? { x: this.ground.x, z: this.ground.z } : null,
      },
      civ: this.civDiagnostics(),
      v4: {
        mode: s.mode,
        career: { xp: s.career.xp, rank: s.career.rank, title: this.sim.career.title, promotions: s.career.promotions.map((x) => x.rank), overtime: this.sim.career.overtimeActive() },
        effects: s.effects.map((e) => ({ kind: e.kind, x: +e.x.toFixed(1), z: +e.z.toFixed(1), left: +(e.until - s.time).toFixed(1) })),
        possession: s.possession ? { id: s.possession.villagerId, visited: [...s.possession.visited] } : null,
        discoveries: s.discoveries.map((x) => x.id),
        graves: s.graveyard.length,
        terrainEdits: s.terrainEdits.length,
        unlocked: [...s.unlockedPowers],
        heaven: s.heaven.archive.length,
        slots: [...this.toolbar.slots],
        menu: this.toolbar.menuOpen,
        cinematic: this.cinematic,
        challengesCompleted: this.sim.challenges.completedCount(),
      },
      v5: {
        panel: this.panel,
        mainMenu: this.mainMenu.open,
        inMenu: this.inMenu,
        tipsSeen: [...(s.tutorial.tipsSeen ?? [])],
        tutorialSeconds: +this.tutorial.elapsed.toFixed(1),
        playSeconds: +this.playSeconds.toFixed(1),
        inspector: this.inspector.kind,
        following: this.inspector.following,
        target: this.toolbar.target,
        explain: this.hud.explaining,
        allPowers: this.toolbar.menuOpen,
        prayerCards: document.querySelectorAll('#prayer-list .prayer:not(.done):not(.failed)').length,
        reducedMotion: this.reducedMotion,
      },
      camera: { distance: this.cam.distance, yaw: this.cam.yaw, pitch: this.cam.pitch, x: this.cam.target.x, z: this.cam.target.z },
      menu: this.menus.current,
      events: [...this.eventLog],
      inspectorOpen: this.inspector.open,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.renderer.getPixelRatio(),
      },
    };
  }

  dispose(): void {
    this.loop.stop();
    this.cam.dispose();
    this.audio.dispose();
    for (const u of this.unsubs) u();
    this.renderer.dispose();
  }
}
