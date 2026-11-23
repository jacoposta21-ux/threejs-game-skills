import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { CameraController } from '../camera/CameraController';
import { VisualEffects } from '../effects/VisualEffects';
import { BuildingRenderer } from '../entities/BuildingRenderer';
import { VillagerRenderer } from '../entities/VillagerRenderer';
import { CultureRenderer } from '../entities/CultureRenderer';
import { VillageDecor } from '../world/VillageDecor';
import { HistoryBookPanel, cultureTicker } from '../ui/HistoryBookPanel';
import { PerfOverlay } from '../ui/PerfOverlay';
import type { VillagerData } from './types';
import { AUTOSAVE_KEY, browserStore, SaveManager, SAVE_KEY } from '../persistence/SaveManager';
import { createPlatform, type GamePlatform } from '../platform/Platform';
import { Simulation } from '../simulation/SimulationManager';
import { $, hydrateIcons } from '../ui/dom';
import { HUD } from '../ui/HUD';
import { Menus } from '../ui/Menus';
import { Notifications } from '../ui/Notifications';
import { POWER_ACCENT, PowerToolbar } from '../ui/PowerToolbar';
import { PrayerPanel } from '../ui/PrayerPanel';
import { Tutorial } from '../ui/Tutorial';
import { VillageInspector } from '../ui/VillageInspector';
import { WorldLabels } from '../ui/WorldLabels';
import { Ambient } from '../world/Ambient';
import { DayNightCycle } from '../world/DayNightCycle';
import { TerrainMesh } from '../world/Terrain';
import { Vegetation } from '../world/Vegetation';
import { Water } from '../world/Water';
import { Weather } from '../world/Weather';
import { createInitialState } from '../world/WorldGen';
import { BASIC_POWERS, CONFIG, POWER_ORDER, type PowerId } from './Config';
import { GameLoop } from './GameLoop';
import { Rng } from './Rng';
import { loadSettings, saveSettings, type QualityLevel, type Settings } from './Settings';

export const WORLD_SEED = 42;
type Quality = Exclude<QualityLevel, 'auto'>;

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
  private readonly decor: VillageDecor;
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
      const res = this.saves.load(AUTOSAVE_KEY);
      if (res.ok && res.state.seed === WORLD_SEED) initial = res.state;
    }
    this.sim = new Simulation(WORLD_SEED, initial);
    this.sim.unlimitedEnergy = this.settings.unlimitedEnergy;

    const village = this.sim.state.villages[0];
    this.dayNight = new DayNightCycle(this.scene);
    this.terrainMesh = new TerrainMesh(this.sim.terrain, this.sim.state.buildings, { x: village.centerX, z: village.centerZ });
    this.water = new Water(this.sim.terrain);
    this.vegetation = new Vegetation(this.sim.terrain);
    this.buildings = new BuildingRenderer(this.sim.state.buildings, this.sim.terrain);
    this.villagers = new VillagerRenderer();
    this.weather = new Weather();
    this.ambient = new Ambient(this.sim.terrain, { x: village.centerX, z: village.centerZ });
    this.vfx = new VisualEffects(this.sim.bus, this.sim.terrain, () => this.sim.state);
    this.culture = new CultureRenderer(this.sim.terrain);
    this.decor = new VillageDecor(this.sim.terrain, village, this.sim.state.buildings);
    this.scene.add(this.terrainMesh.mesh, this.water.group, this.vegetation.group, this.buildings.group, this.villagers.group, this.weather.group, this.ambient.group, this.vfx.group, this.culture.group, this.decor.group);
    this.perf = new PerfOverlay(import.meta.env.DEV || this.params.has('debug'), this.params.has('debug'));

    this.cam = new CameraController(this.camera, canvas, this.sim.terrain);
    this.cam.snap(village.centerX + 4, village.centerZ - 2, 62, 0.55, 0.88);
    this.vfx.onShake = (a) => this.cam.addShake(a);
    this.vfx.onFlash = (a) => this.screenFlash(a);

    this.toolbar = new PowerToolbar(this.sim);
    this.toolbar.onSelect = (id) => this.select(id);
    this.toolbar.onHover = () => this.audio.hover();
    this.prayers.onFocus = (p) => {
      this.audio.click();
      this.cam.focus(p.targetX, p.targetZ, 46, 1.2);
    };
    this.prayers.onToggle = () => this.audio.click();
    this.inspector.onClose = () => this.audio.click();
    this.notes.onShow = (kind) => this.audio.notify(kind);
    this.notes.onMemo = () => this.audio.godMessage();

    this.menus = new Menus({
      resume: () => this.setPaused(false),
      restart: () => this.restart(),
      save: () => this.saves.save(this.sim.state, SAVE_KEY),
      load: () => this.loadFrom(SAVE_KEY),
      hasSave: () => this.saves.has(SAVE_KEY),
      hasAutosave: () => this.saves.has(AUTOSAVE_KEY),
      loadAutosave: () => this.loadFrom(AUTOSAVE_KEY),
      settings: () => this.settings,
      applySettings: (s) => this.applySettings(s),
      fullscreen: () => this.toggleFullscreen(),
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
      },
    });

    this.bindSimEvents();
    this.bindInput();
    this.applySettings(this.settings, false);
    this.applyQuality(this.quality);

    this.loop = new GameLoop(
      (dt) => this.simStep(dt),
      (dt, now, wall) => this.render(dt, now, wall),
      () => (this.paused || this.pausedForScreenshot || this.menus.open ? 0 : this.speed),
    );
    this.installTestHooks();
    this.resize();
  }

  async start(): Promise<void> {
    this.platform.loadingStart();
    await this.platform.init();
    // Compile shaders before revealing the world to avoid a first-frame hitch.
    this.renderer.compile(this.scene, this.camera);
    this.loop.start();
    window.setTimeout(() => $('#loading').classList.add('done'), 150);
    this.platform.loadingStop();
    this.platform.gameplayStart();
    if (this.params.has('skipTutorial')) this.sim.state.tutorial.done = true;
    if (!this.sim.state.tutorial.done && this.settings.tutorialSeen && this.sim.state.time < 200 && !this.params.has('tutorial')) {
      // Returning player on a fresh world: skip straight to the sandbox.
      this.sim.state.tutorial.done = true;
      this.sim.powers.unlock(BASIC_POWERS);
      this.sim.notify('BACK FOR ANOTHER SHIFT?', 'info', 'All powers unlocked. Press ? in the menu for help.');
    } else if (this.sim.state.tutorial.done && this.sim.state.time > 120) {
      this.sim.notify('WELCOME BACK, INTERN', 'info', 'Your island was autosaved.');
    }
    this.tutorial.start();
    if (this.sim.state.tutorial.done) this.sim.powers.unlock(BASIC_POWERS);
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
    this.book.onToggle = () => this.audio.click();
    const v3 = (x: number, z: number, dy = 2) => new THREE.Vector3(x, this.sim.terrain.heightAt(x, z) + dy, z);
    const log = (s: string) => {
      this.eventLog.push(s);
      if (this.eventLog.length > 40) this.eventLog.shift();
    };
    this.unsubs.push(
      bus.on('NOTIFY', (e) => {
        log(`notify:${e.text}`);
        this.notes.push(e.text, e.kind, e.sub, e.priority ?? 1);
      }),
      bus.on('GOD_MESSAGE', (e) => {
        log(`god:${e.text}`);
        this.notes.memo(e.text);
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
        this.platform.celebrate();
        this.labels.float(`+${e.prayer.reward} ⚡`, v3(e.prayer.targetX, e.prayer.targetZ, 5), 'gold');
      }),
      bus.on('PRAYER_FAILED', () => this.audio.fail()),
      bus.on('VILLAGERS_CELEBRATE', () => this.audio.celebrate()),
      bus.on('FIRE_EXTINGUISHED', (e) => e.byRain && this.audio.extinguish()),
      bus.on('HARVEST', (e) => {
        const farm = this.sim.state.buildings.find((b) => b.type === 'farm');
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
        const v = this.sim.state.villages[0];
        const well = this.sim.building(v.wellId);
        if (well && Math.hypot(well.x - e.x, well.z - e.z) <= e.radius) this.labels.float('Well filling!', v3(well.x, well.z, 3.5), 'water');
      }),
    );
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    const canvas = this.canvas;
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

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
      if (e.button === 0) {
        this.pointer.down = true;
        this.pointer.downX = e.clientX;
        this.pointer.downY = e.clientY;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.pointer.down) return;
      this.pointer.down = false;
      if (Math.hypot(e.clientX - this.pointer.downX, e.clientY - this.pointer.downY) > 8) return;
      this.click(e.clientX, e.clientY);
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat && e.code !== 'KeyW' && e.code !== 'KeyA' && e.code !== 'KeyS' && e.code !== 'KeyD') return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.menus.open) this.menus.close(true);
        else if (this.book.open) this.book.close();
        else if (this.inspector.open) this.inspector.hide();
        else if (this.selected) this.select(null);
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
        this.audio.click();
        this.book.toggle();
      } else if (/^Digit[0-5]$/.test(e.code) || /^Numpad[0-5]$/.test(e.code)) {
        const n = Number(e.code.slice(-1));
        this.select(n === 0 ? null : POWER_ORDER[n - 1]);
      }
    });

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
      if (document.hidden) {
        this.autosave();
        this.platform.gameplayStop();
      } else this.platform.gameplayStart();
    });
    window.addEventListener('beforeunload', () => this.autosave());
    // Keep the page itself from scrolling or zooming.
    window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
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
      this.cursorToast('Finish the tutorial to unlock', false, true);
      return;
    }
    this.selected = this.selected === id ? null : id;
    if (this.selected) this.inspector.hide();
    this.labels.showVillagerTip(null, 0, 0);
    this.audio.click();
  }

  private click(x: number, y: number): void {
    if (this.selected) {
      if (!this.pickGround(x, y, this.ground)) return;
      this.sim.powers.activate(this.selected, this.ground.x, this.ground.z);
      return;
    }
    // Look mode: inspect sacred places, buildings or villagers.
    if (this.pickGround(x, y, this.ground)) {
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
    const v = this.pickVillager(x, y);
    if (v) {
      this.audio.click();
      this.inspector.show(this.sim, v.villageId, null);
      return;
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
    this.saves.save(this.sim.state, AUTOSAVE_KEY);
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
    if (!frozen) this.cam.update(dt);
    this.tutorial.update(this.paused || this.menus.open || frozen ? 0 : wallDt);

    // Targeting preview.
    const live = this.pointer.inside && !this.cam.dragging && !this.menus.open;
    this.groundValid = live && this.pickGround(this.pointer.x, this.pointer.y, this.ground);
    if (this.selected && this.groundValid) {
      const check = sim.powers.check(this.selected, this.ground.x, this.ground.z);
      const valid = check.ok || /Recharging/.test(check.reason ?? '');
      const radius = sim.powers.powers[this.selected].radius;
      this.terrainMesh.setCursor(this.ground.x, this.ground.z, Math.max(1.2, radius), valid ? POWER_ACCENT[this.selected] : '#e5484d', true);
      this.canvas.className = valid ? 'targeting' : 'invalid';
    } else {
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
    this.buildings.update(s.villages[0], night, activePrayers, this.elapsed, animDt);
    const religionColors = new Map(s.religions.filter((r) => r.active).map((r) => [r.id, r.color] as [string, number]));
    this.villagers.update(s.villagers, sim.terrain, animDt, this.elapsed, this.reducedMotion, religionColors, s.culture.upsideDownUntil > s.time);
    this.culture.update(s, this.elapsed, night, this.reducedMotion);
    this.decor.update(s.culture.improvements, night);
    this.weather.update(s.clouds, sim.terrain, animDt, this.elapsed, this.vfx.bits, night);
    this.ambient.update(this.elapsed, night, this.reducedMotion);
    this.vfx.update(s, animDt, this.elapsed, night, this.buildings.chimneys(this.chimneyTops));

    // UI.
    const cost = this.selected ? sim.powers.powers[this.selected].energyCost : 0;
    this.hud.update(sim, this.paused || this.menus.open, this.speed, cost);
    this.toolbar.update(sim, this.selected);
    this.prayers.update(sim);
    this.inspector.update(sim, dt);
    this.book.update(sim);
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
    const strength = this.settings.reducedShake ? 0.25 : 0.7;
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
    this.audio.setVolumes(s.masterVolume, s.sfxVolume);
    this.cam.sensitivity = s.cameraSensitivity;
    this.cam.reducedShake = s.reducedShake;
    this.sim.unlimitedEnergy = s.unlimitedEnergy;
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

  private restart(): void {
    this.applyState(createInitialState(WORLD_SEED, this.sim.terrain));
    this.sim.state.tutorial.done = true;
    this.sim.powers.unlock(BASIC_POWERS);
    this.sim.missions.autoGenerate = true;
    this.saves.clear(AUTOSAVE_KEY);
    this.sim.notify('A FRESH ISLAND', 'info', 'Day one again. Try to keep it that way.');
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

  private applyState(state: ReturnType<typeof createInitialState>): void {
    this.sim.replaceState(state);
    this.buildings.rebind(state.buildings);
    this.villagers.reset();
    this.vfx.clear();
    this.labels.clear();
    this.prayers.clear();
    this.book.close();
    this.inspector.hide();
    this.notes.clear();
    this.tutorial.dispose();
    this.sim.missions.autoGenerate = state.tutorial.done;
    if (state.tutorial.done) this.sim.powers.unlock(BASIC_POWERS);
    this.tutorial.start();
  }

  // ---------------------------------------------------------------- test hooks

  private installTestHooks(): void {
    const village = () => this.sim.state.villages[0];
    const warm = (seconds: number) => {
      for (let i = 0; i < seconds * CONFIG.sim.hz; i++) this.sim.step(1 / CONFIG.sim.hz);
    };
    const fresh = (tod = 0.42) => {
      this.applyState(createInitialState(WORLD_SEED, this.sim.terrain));
      const s = this.sim.state;
      s.tutorial.done = true;
      this.tutorial.dispose();
      this.sim.powers.unlock(BASIC_POWERS);
      this.sim.missions.autoGenerate = true;
      s.time = CONFIG.time.dayLength * tod;
      this.selected = null;
      this.menus.close(false);
      this.setPaused(false);
    };
    const v = () => village();
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.sim.rng = new Rng(value);
      },
      setState: (name: string) => {
        switch (name) {
          case 'active-play':
            fresh();
            warm(25);
            this.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
            break;
          case 'overview':
            fresh(0.38);
            warm(10);
            this.cam.snap(0, 0, 150, 0.6, 1.0);
            break;
          case 'tutorial':
            this.applyState(createInitialState(WORLD_SEED, this.sim.terrain));
            this.sim.state.tutorial.step = 1;
            this.tutorial.start();
            warm(4);
            this.cam.snap(v().centerX + 3, v().centerZ - 3, 46, 0.5, 0.82);
            break;
          case 'rain': {
            fresh();
            warm(15);
            const well = this.sim.building(v().wellId)!;
            this.sim.powers.activate('rain', well.x, well.z);
            warm(2);
            this.cam.snap(v().centerX + 2, v().centerZ, 52, 0.5, 0.7);
            break;
          }
          case 'forest-fire': {
            fresh();
            warm(10);
            const t = this.sim.state.trees.filter((tr) => !tr.charred && tr.kind !== 'bush' && Math.hypot(tr.x - v().centerX, tr.z - v().centerZ) > 20 && Math.hypot(tr.x - v().centerX, tr.z - v().centerZ) < 34);
            for (const tr of t.slice(0, 4)) this.sim.fire.ignite(this.sim, 'tree', tr.id, true);
            warm(8);
            this.cam.snap(t[0]?.x ?? v().centerX, t[0]?.z ?? v().centerZ, 55, 0.7, 0.8);
            break;
          }
          case 'flood': {
            fresh();
            const well = this.sim.building(v().wellId)!;
            this.sim.powers.activate('rain', well.x, well.z);
            warm(9);
            this.sim.state.cooldowns.rain = 0;
            this.sim.powers.activate('rain', well.x, well.z);
            warm(9);
            this.cam.snap(v().centerX + 2, v().centerZ + 2, 48, 0.5, 0.85);
            break;
          }
          case 'night':
            fresh(0.9);
            warm(8);
            this.cam.snap(v().centerX + 4, v().centerZ - 2, 55, 0.55, 0.8);
            break;
          case 'menu':
            fresh();
            warm(5);
            this.openMenu();
            break;
          case 'inspector': {
            fresh();
            warm(10);
            const well = this.sim.building(v().wellId)!;
            this.inspector.show(this.sim, v().id, well.id);
            this.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
            break;
          }
          case 'religion':
          case 'book': {
            fresh();
            warm(4);
            this.stageRockKing(false);
            if (name === 'book') this.book.show('history');
            break;
          }
          case 'monuments': {
            fresh();
            warm(4);
            this.stageRockKing(true);
            const farm = this.sim.building(v().farmIds[0])!;
            this.sim.state.culture.lastMajorEvent = -9999;
            this.sim.bus.emit('FIRE_EXTINGUISHED', { fireId: 0, x: farm.x + 4, z: farm.z, byRain: true, kind: 'ground', targetId: -1, byPlayer: false });
            for (const sc of this.sim.state.sacred) {
              this.sim.sacredSys.addSacredness(sc, 12);
              sc.shrineProgress = 1;
              this.sim.sacredSys.addSacredness(sc, 0.1);
              sc.monumentProgress = 1;
              sc.decorations = 8;
            }
            this.sim.state.culture.festivalUntil = this.sim.state.time + 60;
            this.sim.state.culture.improvements = ['gardens', 'lanterns', 'market', 'shrine-expansion'];
            warm(3);
            this.cam.snap(v().centerX + 6, v().centerZ + 1, 62, 0.55, 0.9);
            break;
          }
          case 'mutations': {
            fresh();
            warm(6);
            this.sim.unlimitedEnergy = true;
            this.sim.powers.unlock(['mutation']);
            const rock = this.sim.state.rocks[0];
            const near = this.sim.state.villagers.filter((p) => p.alive).slice(0, 2);
            near.forEach((p, i) => {
              p.position.x = rock.x - 3 + i * 2;
              p.position.z = rock.z + 3;
              this.sim.ai.setIdle(p, 20);
            });
            this.sim.rebuildIndexes();
            for (const p of near) {
              this.sim.state.cooldowns.mutation = 0;
              this.sim.powers.activate('mutation', p.position.x, p.position.z);
            }
            const tree = this.sim.state.trees.find((t) => !t.charred && t.growth >= 1 && Math.hypot(t.x - rock.x, t.z - rock.z) < 14 && Math.hypot(t.x - rock.x, t.z - rock.z) > 5)!;
            this.sim.state.cooldowns.mutation = 0;
            this.sim.powers.activate('mutation', tree.x, tree.z);
            this.sim.state.cooldowns.mutation = 0;
            this.sim.powers.activate('mutation', rock.x, rock.z);
            this.sim.unlimitedEnergy = this.settings.unlimitedEnergy;
            warm(6);
            this.cam.snap(rock.x, rock.z, 34, 0.5, 0.78);
            break;
          }
          case 'culture-events': {
            fresh(0.55);
            warm(3);
            this.sim.state.culture.prosperityTime = 200;
            warm(4);
            for (let k = 0; k < 3; k++) this.sim.remember('rain-damage');
            this.sim.state.culture.lastMajorEvent = -9999;
            warm(4);
            this.sim.state.culture.festivalUntil = this.sim.state.time + 60;
            warm(8);
            this.cam.snap(v().centerX - 4, v().centerZ, 60, 0.4, 0.9);
            break;
          }
          default:
            throw new Error(`Unknown test state: ${name}`);
        }
        this.render(0, performance.now() / 1000);
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => {},
      // Extra hooks for the browser playtest.
      selectPower: (id: PowerId | null) => this.select(id),
      worldToScreen: (x: number, z: number) => {
        const p = new THREE.Vector3(x, this.sim.terrain.surfaceAt(x, z), z).project(this.camera);
        const rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      },
      skipTutorial: () => this.tutorial.finish(true),
      simulate: (seconds: number) => warm(seconds),
      /** Test-only: grant Chaos so Mutation can be exercised deterministically. */
      grantChaos: (amount: number) => this.sim.addChaos(amount, 'Test grant'),
      openBook: () => this.book.show('history'),
    };
    // Read-only state accessor for the browser playtest (positions of buildings/trees).
    (window as unknown as { __GI_STATE__?: () => unknown }).__GI_STATE__ = () => this.sim.state;
  }

  /** Deterministic Rock King scene: villagers on the plaza, lightning on the plaza rock, a ritual. */
  private stageRockKing(complete: boolean): void {
    const sim = this.sim;
    const rock = sim.state.rocks[0];
    const crowd = sim.state.villagers.filter((p) => p.alive).slice(0, 12);
    crowd.forEach((p, i) => {
      const a = (i / crowd.length) * Math.PI * 2;
      p.position.x = rock.x + Math.cos(a) * 6;
      p.position.z = rock.z + Math.sin(a) * 6;
      sim.ai.setIdle(p, 4);
    });
    sim.rebuildIndexes();
    sim.unlimitedEnergy = true;
    sim.powers.activate('lightning', rock.x + 0.3, rock.z + 0.3);
    sim.unlimitedEnergy = this.settings.unlimitedEnergy;
    for (const f of [...sim.state.fires]) f.intensity = 0;
    const r = sim.religion.byArchetype('rock');
    const sacred = sim.sacredSys.find('rock', rock.id);
    if (sacred) {
      sim.sacredSys.addSacredness(sacred, 4);
      sacred.decorations = 6;
      sacred.shrineProgress = complete ? 1 : 0.5;
    }
    if (r) {
      sim.religion.startRitual(r, r.rituals[0]);
      for (let i = 0; i < 6 * CONFIG.sim.hz; i++) sim.step(1 / CONFIG.sim.hz);
    }
    this.cam.snap(rock.x - 2, rock.z + 1, 30, 0.35, 0.75);
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
