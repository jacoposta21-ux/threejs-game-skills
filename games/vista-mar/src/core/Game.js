import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createGradePass, Seagulls, SunFlare, windUniforms } from '../world/Effects.js';
import { InputManager } from './InputManager.js';
import { loadAssets } from './AssetLoader.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { CityGenerator } from '../world/CityGenerator.js';
import { World } from '../world/World.js';
import { setMaxAnisotropy } from '../world/textures.js';
import { PlayerController } from '../player/PlayerController.js';
import { CameraController } from '../camera/CameraController.js';
import { AudioManager } from '../audio/AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { Menus, loadSettings } from '../ui/Menus.js';
import { MissionSystem, LostTapes } from '../systems/MissionSystem.js';
import { VehicleSystem } from '../vehicles/VehicleSystem.js';
import { VehicleController } from '../vehicles/VehicleController.js';
import { TrafficSystem } from '../traffic/TrafficSystem.js';
import { NPCSystem } from '../npc/NPCSystem.js';
import { PoliceSystem } from '../systems/PoliceSystem.js';
import { MissionManager } from '../missions/MissionManager.js';
import { MISSIONS } from '../missions/missions.js';
import { STORY } from '../missions/story.js';
import { Locations, POLICE_STATION, HOSPITAL } from '../systems/Locations.js';
import { route } from '../systems/RoadGraph.js';
import { terrainHeight } from '../world/Layout.js';
import { classify, BEACH } from '../world/Layout.js';
import { lerp } from '../utils/random.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { Cutscene, ShopMenu, Lockpick } from '../ui/Overlays.js';
import { Economy } from '../systems/Economy.js';
import { Interiors } from '../world/Interiors.js';
import { SideJobs } from '../systems/SideJobs.js';
import { Weather } from '../world/Weather.js';
import { saveSettings } from '../ui/Menus.js';

const SAVE_KEY = 'vistamar.save';
const newStats = () => ({ walked: 0, driven: 0, flown: 0, topSpeed: 0, stolen: 0, busted: 0, wasted: 0, earned: 0, spent: 0, passed: 0, failed: 0 });

// automatic-performance tiers, mildest first
const PERF_TIERS = [
  { res: 1, msaa: true, bloom: true, shadowMap: 4096, shadowEvery: 2, crowd: 1 },
  { res: 0.85, msaa: true, bloom: true, shadowMap: 4096, shadowEvery: 2, crowd: 1 },
  { res: 0.75, msaa: false, bloom: true, shadowMap: 2048, shadowEvery: 2, crowd: 1 },
  { res: 0.65, msaa: false, bloom: false, shadowMap: 2048, shadowEvery: 3, crowd: 1 },
  // fast path: draw straight to the screen (no post-processing passes / render-target switches)
  { res: 0.55, msaa: false, bloom: false, shadowMap: 1024, shadowEvery: 3, crowd: 0.8, direct: true },
  { res: 0.5, msaa: false, bloom: false, shadowMap: 1024, shadowEvery: 4, crowd: 0.5, direct: true, shadows: false },
];

const QUALITY = {
  low: { dpr: 1, shadow: 1024, bloom: false, samples: 0 },
  medium: { dpr: 1.25, shadow: 2048, bloom: true, samples: 0 },
  high: { dpr: 2, shadow: 2048, bloom: true, samples: 4 },
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.state = 'loading'; // loading | ready | playing | paused | map
    this.money = 500;
    this.playTime = 0;
    this.stats = newStats();
    this.frame = 0;
    this.pausedForScreenshot = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // refreshed every other frame in tick()
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.1, 6000);
    this.input = new InputManager(canvas);
    this.collision = new CollisionSystem();
    this.audio = new AudioManager();
    this.audio.volume = this.settings.volume;
    this.timer = new THREE.Timer();
    // tiny event bus: gameplay systems announce crimes and mission events
    const handlers = {};
    this.events = {
      on: (n, f) => (handlers[n] = handlers[n] || []).push(f),
      emit: (n, d) => (handlers[n] || []).forEach((f) => f(d)),
    };
    this.lastDamage = -99;
    this.routeTimer = 0;
    this.route = null;
    this.renderer.info.autoReset = false;

    window.addEventListener('resize', () => this.resize());
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.suppressUnlockPause) this.pause();
      this.suppressUnlockPause = false;
    };
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  async init() {
    this.menus = new Menus(this);
    this.menus.setLoading(0.02, 'Loading models…');
    const assets = await loadAssets((f, k) => this.menus.setLoading(0.05 + f * 0.6, `Loading ${k}…`));
    this.assets = assets;
    this.menus.setLoading(0.7, 'Building Vista Mar…');
    await nextFrame();
    this.world = new World(this);
    this.weather = new Weather(this);
    this.city = new CityGenerator(this.scene, this.collision, assets).generate();
    this.world.attachCity(this.city);
    this.menus.setLoading(0.88, 'Waking up the locals…');
    await nextFrame();
    this.vehicles = new VehicleSystem(this, assets);
    this.driver = new VehicleController(this);
    this.player = new PlayerController(this, assets);
    this.menus.setLoading(0.93, 'Filling the streets…');
    await nextFrame();
    this.traffic = new TrafficSystem(this, this.city.carModels);
    this.npcs = new NPCSystem(this, assets);
    this.combat = new CombatSystem(this);
    this.cutscene = new Cutscene(this);
    this.shop = new ShopMenu(this);
    this.lockpick = new Lockpick(this);
    this.camera3p = new CameraController(this);
    this.camera3p.reset(this.player.heading);
    this.hud = new HUD(this);
    this.minimap = new Minimap(this.city);
    this.missions = new MissionSystem(this);
    this.tapes = this.missions.add(new LostTapes(this));
    this.police = new PoliceSystem(this);
    this.story = new MissionManager(this, [...MISSIONS, ...STORY]);
    this.locations = new Locations(this);
    this.interiors = new Interiors(this);
    this.economy = new Economy(this);
    this.jobs = new SideJobs(this);
    this.bindProgressEvents();
    this.seagulls = new Seagulls(this.scene);
    this.sunFlare = new SunFlare(this.scene);
    this.setupComposer();
    this.applyQuality();
    this.applyDaySpeed();
    this.resize();
    this.installHooks();
    // warm up everything behind the loading bar: streets filled, every shader compiled,
    // textures uploaded and a few real frames rendered, so Play starts without a hitch
    this.menus.setLoading(0.95, 'Filling the streets…');
    await nextFrame();
    this.world.update(0.016, this.player.pos);
    this.camera3p.update(0.016);
    this.traffic.prefill(this.player.pos);
    this.npcs.prefill(this.player.pos);
    this.prefilled = true;
    for (let i = 0; i < 3; i++) { this.npcs.update(1 / 60); this.traffic.update(1 / 60); }
    this.menus.setLoading(0.97, 'Compiling shaders…');
    await nextFrame();
    const hidden = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { if (this.renderer.compileAsync && this.renderer.extensions.has('KHR_parallel_shader_compile')) await this.renderer.compileAsync(this.scene, this.camera); else this.renderer.compile(this.scene, this.camera); } catch (e) { this.renderer.compile(this.scene, this.camera); }
    this.menus.setLoading(0.99, 'Uploading textures…');
    await nextFrame();
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    for (const o of hidden) o.visible = false;
    this.updateChunkVisibility();
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render(0.016);
    this.renderer.render(this.scene, this.camera);
    await nextFrame();
    this.state = 'ready';
    this.menus.setLoading(1, 'Ready');
    this.menus.ready();
    this.renderer.setAnimationLoop(() => this.tick());
    if (this.onReady) this.onReady();
  }

  setupComposer() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = createGradePass();
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.composerSamples = q.samples;
  }

  applyQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    this.bloom.enabled = q.bloom;
    if (this.smaa) this.smaa.enabled = q.samples === 0;
    if (this.composerSamples !== q.samples) {
      this.composer.renderTarget1.samples = q.samples;
      this.composer.renderTarget2.samples = q.samples;
      this.composerSamples = q.samples;
    }
    const sun = this.world.sun;
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.resize();
    this.applyPerfLevel(this.perfLevel || 0);
  }

  applyDaySpeed() {
    const m = this.settings.dayMinutes;
    this.world.daySpeed = m > 0 ? 24 / (m * 60) : 0;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
    }
  }

  // ------------------------------------------------------------- flow
  hasSave() {
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return !!d && d.v >= 1 && d.v <= 3; } catch { return false; }
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
  }

  /** Counters for the stats page and the triggers that autosave progress. */
  bindProgressEvents() {
    const ev = this.events, st = () => this.stats;
    ev.on('carjack', () => st().stolen++);
    ev.on('carStolen', () => st().stolen++);
    ev.on('missionPassed', () => { st().passed++; this.autosave(); });
    for (const n of ['propertyBought', 'fareDone', 'raceDone', 'tapeCollected', 'purchase', 'payday']) ev.on(n, () => this.autosave());
  }

  /** Progress (not position) is written a moment after anything worth keeping happens. */
  autosave() {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      if (this.state === 'loading' || this.state === 'ready' || this.respawning) return;
      if (this.save()) this.hud.saved();
    }, 1500);
  }

  /** Overall completion, 0..100: story 40, tapes 20, properties 15, time trials 15, taxi 10. */
  completion() {
    const j = this.jobs.records;
    const medal = { gold: 1, silver: 0.7, bronze: 0.4 };
    const races = this.jobs.medals().reduce((a, m) => a + (m.best ? medal[m.best.medal] : 0), 0) / this.jobs.medals().length;
    return Math.round((this.story.done.size / this.story.defs.length) * 40 + (this.tapes.count / this.tapes.tapes.length) * 20 + (this.economy.owned.size / 5) * 15 + races * 15 + Math.min(1, j.fares / 10) * 10);
  }

  begin(fresh = false) {
    if (this.state !== 'ready') return;
    if (fresh) this.clearSave();
    this.audio.start();
    this.audio.setVolume(this.settings.volume);
    this.menus.showStart(false);
    this.hud.show(true);
    this.state = 'playing';
    if (!this.prefilled) { this.traffic.prefill(this.player.pos); this.npcs.prefill(this.player.pos); }
    this.prefilled = false;
    if (this.loadSave()) setTimeout(() => this.hud.toast('SAVE LOADED', 'Progress restored from your last safehouse visit.', 'reward'), 1200);
    this.input.requestLock();
    this.hud.toast('WELCOME TO VISTA MAR', 'Twelve lost mixtapes are hidden around the city. Follow the pink beams.');
    setTimeout(() => this.state === 'playing' && this.hud.toast('NEED A RIDE?', 'A sports car is parked on Palm Boulevard right ahead. Walk up and press E.'), 4500);
    if (!this.stats.passed && !this.story.done.size) setTimeout(() => this.state === 'playing' && this.hud.toast('MAKE A LIVING', 'Yellow markers start story missions. Cabs (T) and time trials (⚑ on the map) pay too.'), 11000);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.input.enabled = false;
    this.menus.showPause(true);
    this.audio.suspend();
  }

  resume() {
    if (this.state !== 'paused' && this.state !== 'map') return;
    this.menus.showPause(false);
    this.menus.showMap(false);
    this.state = 'playing';
    this.input.enabled = true;
    this.input.keys.clear();
    this.input.wheel = 0;
    this.audio.resume();
    this.input.requestLock();
  }

  openMap() {
    if (this.state !== 'playing') return;
    this.state = 'map';
    this.suppressUnlockPause = true;
    this.input.exitLock();
    this.input.enabled = false;
    this.minimap.resetBig();
    this.menus.showMap(true);
  }

  restart() {
    if (this.driver.vehicle) this.driver.exit();
    clearTimeout(this.autosaveTimer);
    this.clearSave();
    this.jobs.reset();
    this.stats = newStats();
    this.waypoint = null; this.waypointRoute = null;
    this.weather.set('clear', true);
    this.story.reset();
    this.police.reset();
    this.traffic.reset();
    this.npcs.reset();
    this.vehicles.reset();
    this.player.respawn();
    this.camera3p.reset(this.player.heading);
    this.money = 500;
    this.hud.shownMoney = 500;
    this.missions.reset();
    this.combat.reset();
    this.economy.reset();
    this.world.setTime(17.3);
    this.playTime = 0;
    this.hud.toast('NEW GAME', 'Back at Palm Boulevard with a clean slate.');
  }

  onKey(e) {
    if (this.state === 'shop' || this.state === 'minigame' || this.cutscene?.active) return;
    if (e.code === 'Escape') {
      if (this.state === 'map') { this.resume(); return; }
      if (this.state === 'playing' && !this.input.locked) this.pause();
      else if (this.state === 'paused' && performance.now() - (this.pausedAt || 0) > 350) this.resume();
    }
    if (e.code === 'KeyM') {
      if (this.state === 'playing') this.openMap();
      else if (this.state === 'map') this.resume();
    }
  }

  /** Pull the driver out of a traffic car and take it. */
  carjack(c) {
    const v = this.traffic.toVehicle(c);
    if (!v) return;
    v.vel.set(0, 0);
    const door = v.doorPoint(1);
    this.npcs.spawnAt(door.x, door.z, this.player.pos);
    this.events.emit('carjack', v);
    this.audio.grunt();
    this.driver.enter(v);
    this.audio.radio.index < 0 || this.hud.radio(this.audio.radio.label);
  }

  /** A parked prop car becomes a real one once the lock is picked. */
  stealParked(c) {
    const v = this.vehicles.spawnDynamic(c.key, c.x, c.z, c.rot);
    if (!v) return;
    this.city.takeParked(c);
    v.vel.set(0, 0);
    this.events.emit('carStolen', v);
    this.driver.beginEnter(v);
  }

  /** Player was hurt (vehicle impacts, being run over). */
  damagePlayer(amount) {
    const p = this.player;
    if (this.respawning || amount <= 0 || this.cinematic) return;
    const c = this.combat;
    if (c && c.armor > 0) { const soak = Math.min(c.armor, amount * 0.7); c.armor -= soak; amount -= soak; }
    p.health = Math.max(0, p.health - amount);
    this.lastDamage = this.playTime;
    this.hud.flashDamage();
  }

  busted() {
    if (this.respawning) return;
    const fine = Math.min(this.money, Math.max(100, Math.round(this.money * 0.1)));
    this.stats.busted++;
    this.endLife('BUSTED', `Fine: -$${fine.toLocaleString('en-US')} · released at VMPD headquarters`, POLICE_STATION, fine);
    this.audio.busted();
  }

  wasted() {
    if (this.respawning) return;
    if (!this.player.vehicle) this.player.knocked = 2.6;
    const bill = Math.min(this.money, 250);
    this.stats.wasted++;
    this.endLife('WASTED', `Hospital bill: -$${bill}`, HOSPITAL, bill);
    this.audio.busted();
  }

  endLife(title, sub, spawn, cost) {
    this.respawning = true;
    this.story.abort(title === 'BUSTED' ? 'You were busted.' : 'You were wasted.');
    this.jobs.abort();
    this.hud.banner(title, sub, 'failed');
    this.hud.fade(true);
    setTimeout(() => {
      if (this.driver.vehicle) this.driver.exit();
      this.police.reset();
      this.money = Math.max(0, this.money - cost);
      const pl = this.player;
      pl.teleport(spawn.x, spawn.z);
      pl.health = 100;
      pl.knocked = 0;
      pl.heading = 0;
      this.camera3p.reset(0);
      this.world.setTime((this.world.timeOfDay + 4) % 24);
      this.hud.fade(false);
      this.respawning = false;
    }, 2600);
  }

  sleepUntil(hour) {
    this.hud.fade(true);
    setTimeout(() => {
      this.world.setTime(hour);
      this.player.health = 100;
      this.hud.fade(false);
      this.hud.toast('GAME SAVED', `Rested until ${String(hour).padStart(2, '0')}:00 at the safehouse.`, 'reward');
    }, 1400);
  }

  save() {
    const data = { v: 3, money: this.money, tapes: this.tapes.tapes.map((t) => t.collected), missions: [...this.story.done], time: this.world.timeOfDay, combat: this.combat.serialize(), econ: this.economy.serialize(), jobs: this.jobs.serialize(), stats: this.stats, playTime: Math.round(this.playTime) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch { if (!this.saveWarned) { this.saveWarned = true; this.hud.toast('SAVE FAILED', 'This browser blocks local storage.'); } return false; }
  }

  loadSave() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { data = null; }
    if (!data || !(data.v >= 1 && data.v <= 3)) return false;
    if (typeof data.time === 'number') this.world.setTime(data.time);
    if (data.playTime) this.playTime = data.playTime;
    if (data.stats) this.stats = { ...newStats(), ...data.stats };
    this.jobs.restore(data.jobs);
    this.money = data.money ?? this.money;
    this.hud.shownMoney = this.money;
    (data.tapes || []).forEach((c, i) => { const t = this.tapes.tapes[i]; if (t && c) { t.collected = true; t.mesh.visible = false; } });
    for (const id of data.missions || []) this.story.done.add(id);
    this.story.refreshStartMarkers();
    try { this.combat.restore(data.combat); this.economy.restore(data.econ); } catch (e) { console.warn('[save] partial restore', e); }
    return true;
  }

  /** Every point of interest for the map list (category order matters). */
  places() {
    const out = [];
    const add = (cat, name, x, z, icon, color) => out.push({ cat, name, x, z, icon, color });
    for (const d of this.story.available()) add('Story missions', d.title.replace(/^MISSION \d+ — /, ''), d.start.x, d.start.z, d.letter || 'M', '#ffd23f');
    const E = this.economy;
    const shop = { guns: 'Sunline Arms (weapons)', clothes: 'Threads & Co. (clothes)', tuning: 'Vista Customs (tuning)', clubdoor: 'Club Velvet' };
    for (const pl of E.places) if (shop[pl.kind]) add('Shops & fun', shop[pl.kind], pl.x, pl.z, pl.icon, pl.color);
    for (const pl of this.locations.places) {
      if (pl.kind === 'spray') add('Shops & fun', 'Spray & Go (respray)', pl.x, pl.z, pl.icon, pl.color);
      if (pl.kind === 'repair') add('Fuel & repairs', pl.name || 'Gas station', pl.x, pl.z, pl.icon, pl.color);
    }
    for (const pl of this.locations.places) if (pl.kind === 'food') add('Food', pl.name, pl.x, pl.z, pl.icon, pl.color);
    for (const m of this.jobs.medals()) add('Activities', `Time trial: ${m.course.name}${m.best ? ` (${m.best.medal})` : ''}`, m.course.start.x, m.course.start.z, '⚑', '#3fe0e8');
    add('Activities', 'Sunshine Cab stand (taxi shifts)', 305, -40, 'T', '#ffd23f');
    add('Safehouses', 'Safehouse (Palm Blvd)', this.locations.places[0].x, this.locations.places[0].z, 'H', '#7dff9b');
    for (const pl of E.places) if (pl.kind === 'property') add(E.owned.has(pl.prop.id) ? 'Your properties' : 'Properties for sale', pl.prop.name, pl.x, pl.z, '$', E.owned.has(pl.prop.id) ? '#ffd23f' : '#7dff9b');
    add('Services', 'Vista Mar Airport', 60, -470, '✈', '#9ad8ff');
    add('Services', 'VMPD Headquarters', 109, -60, 'P', '#4f7cff');
    add('Services', 'Hospital', 93, 150, '+', '#ff6b6b');
    const order = ['Story missions', 'Activities', 'Shops & fun', 'Fuel & repairs', 'Food', 'Safehouses', 'Your properties', 'Properties for sale', 'Services'];
    return out.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
  }

  setWaypoint(p) {
    this.waypoint = p ? { x: p.x, z: p.z, name: p.name } : null;
    this.waypointRoute = p ? route({ x: this.player.pos.x, z: this.player.pos.z }, p) : null;
    if (p) this.hud.toast('GPS SET', p.name);
  }

  addMoney(v) {
    this.money += v;
    if (v > 0) this.stats.earned += v; else this.stats.spent -= v;
  }

  markers() {
    const out = [...this.locations.markers(), ...this.economy.markers(), ...this.vehicles.markers(this.player.pos), ...this.missions.markers(), ...this.story.startMarkers(), ...this.police.markers(), ...this.combat.markers(), ...(this.interior ? [] : this.jobs.markers())];
    for (const n of this.npcs.npcs) if (n.role && n.role !== 'actor' && n.state !== 'DOWN' && n.alerted) out.push({ x: n.pos.x, z: n.pos.z, color: n.role === 'cop' ? '#4f7cff' : '#ff4f4f', shape: 'dot', size: 4 });
    const obj = this.story.objective();
    if (obj && obj.target) out.push({ x: obj.target.x, z: obj.target.z, color: '#ffd23f', shape: 'diamond', size: 8, edge: true });
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, color: '#c77dff', shape: 'diamond', size: 8, edge: true });
    return out;
  }

  // ------------------------------------------------------------- loop
  tick() {
    this.timer.update();
    const rawDt = this.timer.getDelta();
    if (this.state === 'playing' && !this.pausedForScreenshot) this.autoPerformance(rawDt);
    this.renderer.info.reset();
    const dt = Math.min(rawDt, 1 / 20);
    this.frame++;
    const tA = performance.now();
    if (!this.pausedForScreenshot) {
      if (this.state === 'playing') this.update(dt);
      else if (this.state === 'ready') {
        // slow cinematic orbit behind the start screen
        this.world.update(dt, this.player.pos);
        this.camera3p.yaw += dt * 0.05;
        this.camera3p.update(dt);
        this.player.rig && this.player.rig.update(dt);
      } else if (this.state === 'minigame') {
        this.lockpick.update(dt);
      } else if (this.state === 'map' && this.frame % 20 === 0) {
        this.menus.showMap(true);
      }
    }
    const tB = performance.now();
    this.updateChunkVisibility();
    this.renderer.shadowMap.needsUpdate = this.frame % (this.shadowEvery || 2) === 0 || this.state !== 'playing';
    if (this.directRender) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
    const tC = performance.now();
    // CPU time per frame (smoothed): game logic vs. render submission, plus the real frame interval
    const k = 0.05;
    this.cpuUpdate = (this.cpuUpdate || 0) * (1 - k) + (tB - tA) * k;
    this.cpuRender = (this.cpuRender || 0) * (1 - k) + (tC - tB) * k;
    this.frameMs = (this.frameMs || 16) * (1 - k) + rawDt * 1000 * k;
    this.lastCalls = this.renderer.info.render.calls;
    this.input.endFrame();
    this.publishDiagnostics();
  }

  update(dt) {
    this.playTime += dt;
    const p = this.player;
    this.input.enabled = !this.cinematic;
    this.cutscene.update(dt);
    if (this.driver.vehicle) { this.driver.update(dt); this.combat.aiming = false; }
    else if (this.driver.entering) { this.driver.updateEntering(dt); this.combat.aiming = false; }
    else this.player.update(dt, this.camera3p.yaw);
    this.vehicles.update(dt, this.driver.vehicle);
    this.police.update(dt);
    this.traffic.update(dt);
    this.npcs.update(dt);
    this.combat.update(dt);
    this.camera3p.update(dt);
    this.weather.update(dt);
    this.world.update(dt, p.pos);
    this.missions.update(dt);
    this.story.update(dt);
    this.locations.update(dt);
    this.economy.update(dt);
    this.interiors.update(dt);
    this.jobs.update(dt);
    this.trackStats(dt);
    // interaction: places first, then pickups, then the nearest vehicle
    const place = this.locations.current() || this.economy.current() || this.jobs.current();
    const usePlace = (pl) => (pl.job ? this.jobs.use(pl) : pl.kind && this.economy.places.includes(pl) ? this.economy.use(pl) : this.locations.use(pl));
    if (!this.driver.vehicle) {
      const inside = !!this.interior;
      const it = place || inside ? null : this.missions.nearestInteractable(p.pos);
      const car = place || it || inside ? null : this.vehicles.nearest(p.pos, 1.6);
      const jack = place || it || car || inside ? null : this.traffic.nearest(p.pos, 1.6);
      const parked = place || it || car || jack || inside ? null : this.city.parkedNear(p.pos, 1.3);
      const carLabel = car ? (car.locked ? `Break into the ${car.spec.label}` : `Enter ${car.spec.label}${car.wrecked ? ' (wrecked)' : ''}`) : '';
      this.hud.prompt(this.driver.entering ? '' : place ? place.label : it ? it.label : car ? carLabel : jack ? 'Take this car' : parked ? 'Break into this parked car' : '');
      if (this.input.hit('KeyE') && !p.knocked && !this.driver.entering) {
        if (place) usePlace(place);
        else if (it) it.action();
        else if (car && car.locked) this.lockpick.start(() => { car.locked = false; this.events.emit('carStolen', car); this.driver.beginEnter(car); });
        else if (car) this.driver.beginEnter(car);
        else if (jack) this.carjack(jack);
        else if (parked) this.lockpick.start(() => this.stealParked(parked));
      }
    } else {
      this.hud.prompt(place ? place.label : '');
      if (this.input.hit('KeyE') && !this.cinematic) {
        if (place) usePlace(place);
        else this.driver.exit(true);
        this.input.pressed.delete('KeyE');
      }
    }
    // objective: an active mission overrides the free-roam activity
    const obj = this.story.objective();
    const job = obj ? null : this.jobs.objective();
    this.hud.setKicker(obj ? 'STORY MISSION' : job ? job.kicker : this.police.level > 0 ? 'WANTED · LOSE THE COPS' : 'EXPLORE · VISTA MAR');
    if (obj) this.hud.setObjective(obj.text, obj.title, obj.timer);
    else if (job) this.hud.setObjective(job.title, job.sub, job.timer);
    else this.hud.setObjective(this.tapes.objectiveTitle, this.tapes.objectiveSub, null, this.story.available().length ? 'Yellow markers on the radar start story missions.' : '');
    // GPS route to the mission target
    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.routeTimer = 0.5;
      const tg = (obj && obj.target) || this.jobs.target();
      this.route = tg ? route({ x: p.pos.x, z: p.pos.z }, tg) : null;
      if (this.waypoint) {
        this.waypointRoute = route({ x: p.pos.x, z: p.pos.z }, this.waypoint);
        if (Math.hypot(p.pos.x - this.waypoint.x, p.pos.z - this.waypoint.z) < 12) { this.hud.toast('ARRIVED', this.waypoint.name, 'reward'); this.waypoint = null; this.waypointRoute = null; }
      }
      if (!this.route && this.waypointRoute) this.route = this.waypointRoute;
      this.route = this.jobs.routeLine() || this.route;
    }
    // health: slow regeneration out of danger, wasted at zero
    if (p.health > 0 && p.health < 100 && this.playTime - this.lastDamage > 8 && this.police.level === 0) p.health = Math.min(100, p.health + dt * 1.5);
    if (p.health <= 0 && !this.respawning) this.wasted();
    // bloom by time of day
    this.bloom.strength = lerp(0.22, 0.85, this.world.night);
    const e = this.world.sunDir.y;
    this.grade.uniforms.uNight.value = this.world.night;
    this.grade.uniforms.uGolden.value = e > 0 ? Math.max(0, 1 - Math.abs(e - 0.1) / 0.14) : 0;
    windUniforms.uTime.value = this.world.elapsed;
    this.seagulls.update(dt);
    this.sunFlare.update(this.camera, this.world.sunDir);
    if (this.weather.overcast > 0.45) this.sunFlare.flare.visible = false;
    // car radio: R cycles the stations
    const drv = this.driver.vehicle;
    if (drv && !drv.isAircraft && this.input.hit('KeyR')) {
      this.hud.radio(this.audio.radio.next());
      this.settings.station = this.audio.radio.index;
      saveSettings(this.settings);
    }
    this.bloom.threshold = lerp(0.95, 0.82, this.world.night);
    // audio environment
    const c = classify(p.pos.x, p.pos.z);
    const oceanProx = Math.max(0, Math.min(1, 1 - (BEACH.oceanStart - p.pos.x) / 140));
    const dense = { downtown: 1, nightlife: 0.9, midtown: 0.8, apartments: 0.5, beach: 0.6, industrial: 0.55, residential: 0.25, park: 0.3, sand: 0.2 }[c.district] ?? 0.4;
    this.audio.update(dt, { oceanProximity: oceanProx, cityDensity: dense, night: this.world.night, park: c.type === 'grass' ? 1 : 0, rain: this.weather.rain, inCar: !!p.vehicle, indoors: !!this.interior });
    this.hud.update(dt);
    // the radar is a 2D canvas redraw: every other frame is plenty and halves its CPU cost
    this.radarTick = !this.radarTick;
    if (this.radarTick) this.minimap.drawRadar(p, this.camera3p.yaw, this.markers(), p.vehicle ? Math.max(0.45, 1.05 - p.speed * 0.012) : p.speed > 6 ? 0.85 : 1.1, {
      route: this.route,
      search: this.police.level > 0 && !this.police.seen && this.police.lastKnown ? { ...this.police.lastKnown, r: this.police.searchRadius } : null,
    });
    // periodic autosave while nothing is at stake
    this.autosaveClock = (this.autosaveClock || 0) + dt;
    if (this.autosaveClock > 90 && !this.story.active && !this.jobs.active && this.police.level === 0) { this.autosaveClock = 0; this.autosave(); }
  }

  trackStats(dt) {
    const p = this.player, st = this.stats, v = p.vehicle;
    const lp = this.lastStatPos || (this.lastStatPos = p.pos.clone());
    const d = Math.hypot(p.pos.x - lp.x, p.pos.z - lp.z);
    lp.copy(p.pos);
    if (d > 0 && d < 90 * dt + 2) { // ignore teleports
      if (!v) st.walked += d; else if (v.isAircraft) st.flown += d; else st.driven += d;
    }
    if (v && !v.isAircraft && v.kmh > st.topSpeed) st.topSpeed = v.kmh;
  }

  updateChunkVisibility() {
    const cam = this.camera.position;
    const dd = this.settings.drawDistance || 1;
    const fogFar = this.scene.fog ? this.scene.fog.far : 1000;
    const far = fogFar + 160;
    const near = 170 * dd; // full-detail buildings within this distance, simplified beyond
    this.lodTick = ((this.lodTick || 0) + 1) % 6;
    if (this.lodTick === 0) for (const b of this.city.batches) b.update(cam, Math.min(1, fogFar / 1000) * dd);
    for (const m of this.city.chunkMeshes) {
      const bs = m.geometry.boundingSphere;
      const d = Math.hypot(cam.x - bs.center.x, cam.z - bs.center.z) - bs.radius;
      if (m.userData.building) m.visible = d < near;
      else if (m.userData.far) m.visible = d >= near * 0.92 && d < far;
      else m.visible = d < far;
    }
  }

  /**
   * Automatic performance: steps through tiers when the measured FPS is low
   * (resolution first, then MSAA, bloom, shadow resolution, crowds, shadows)
   * and climbs back when there is headroom.
   */
  autoPerformance(rawDt) {
    this.perfAcc = (this.perfAcc || 0) + rawDt;
    this.perfFrames = (this.perfFrames || 0) + 1;
    if (this.perfAcc < 2) return;
    const fps = this.perfFrames / this.perfAcc;
    this.perfAcc = 0; this.perfFrames = 0;
    this.measuredFps = fps;
    if (!this.settings.autoPerf) { if (this.perfLevel) this.applyPerfLevel(0); return; }
    const lvl = this.perfLevel || 0;
    if (fps < 45 && lvl < PERF_TIERS.length - 1) { this.perfGood = 0; this.applyPerfLevel(lvl + 1); }
    else if (fps > 58 && lvl > 0) { this.perfGood = (this.perfGood || 0) + 1; if (this.perfGood >= 3) { this.perfGood = 0; this.applyPerfLevel(lvl - 1); } }
  }

  applyPerfLevel(level) {
    this.perfLevel = level;
    const t = PERF_TIERS[level];
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.perfScale = t.crowd;
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, q.dpr) * t.res);
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    const samples = t.msaa ? q.samples : 0;
    if (this.composerSamples !== samples) {
      this.composer.renderTarget1.samples = samples;
      this.composer.renderTarget2.samples = samples;
      this.composerSamples = samples;
    }
    this.smaa.enabled = samples === 0;
    this.bloom.enabled = q.bloom && t.bloom;
    const sun = this.world.sun;
    const size = Math.min(q.shadow, t.shadowMap);
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    this.shadowEvery = t.shadowEvery;
    // the Low preset always uses the direct path; the last tier also drops sun shadows
    this.directRender = !!t.direct || this.settings.quality === 'low';
    const wantShadows = t.shadows !== false;
    if (sun.castShadow !== wantShadows) sun.castShadow = wantShadows;
    this.resize();
  }

  get gpuName() {
    if (this._gpu !== undefined) return this._gpu;
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this._gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch { this._gpu = 'unknown'; }
    return this._gpu;
  }

  // ------------------------------------------------------------- test hooks
  installHooks() {
    const game = this;
    const states = {
      start: () => { game.menus.showStart(true); game.hud.show(false); game.state = 'ready'; },
      'explore-golden': () => game.stage(17.6, 28, -15.4, Math.PI / 2),
      'wanted-3': () => { game.stageDrive(14, 'sports', 60, -8, Math.PI / 2); game.police.setLevel(3); for (let i = 0; i < 3; i++) game.police.spawnUnit('pursue'); },
      'mission-01': () => { game.stage(16.5, 46, -15.5, Math.PI / 2); game.story.start(game.story.defs[0]); for (let i = 0; i < 20; i++) game.update(1 / 60); },
      'drive-golden': () => game.stageDrive(17.6, 'sports', 60, -8, Math.PI / 2),
      'drive-night': () => game.stageDrive(21.8, 'police', 300, 60, Math.PI, true),
      'drive-day-ocean': () => game.stageDrive(12, 'sports', 400, 120, Math.PI),
      'explore-day': () => game.stage(11.5, 28, -15.4, Math.PI / 2),
      'rain-day': () => { game.weather.set('rain', true); game.stageDrive(14, 'sports', 60, -8, Math.PI / 2); },
      'rain-night': () => { game.weather.set('rain', true); game.stage(22.5, 300, -40, Math.PI); },
      'cloudy-day': () => { game.weather.set('cloudy', true); game.stage(11.5, 28, -15.4, Math.PI / 2); },
      'taxi-shift': () => { game.stageDrive(12, 'taxi', 300, -60, Math.PI); game.jobs.startTaxi(); for (let i = 0; i < 5; i++) game.update(1 / 60); },
      'race-dash': () => { game.stageDrive(12, 'sports', 50, -100, Math.PI / 2); game.jobs.startRace(game.jobs.places[0].course); for (let i = 0; i < 230; i++) game.update(1 / 60); },
      'explore-night': () => game.stage(21.5, 28, -15.4, Math.PI / 2),
      'downtown-day': () => game.stage(13, 92, -100, Math.PI * 0.85),
      'neon-night': () => game.stage(22.5, 300, -40, Math.PI),
      'beach-sunset': () => game.stage(18.1, 430, 60, Math.PI * 0.62),
      'residential-day': () => game.stage(10.5, -200, 150, -Math.PI / 2),
      'industrial-day': () => game.stage(15, -200, -250, -Math.PI / 2),
      map: () => { game.stage(17.6, 28, -15.4, Math.PI / 2); game.openMap(); },
      pause: () => { game.stage(17.6, 28, -15.4, Math.PI / 2); game.pause(); },
    };
    window.__THREE_GAME_TEST_HOOKS__ = {
      states: Object.keys(states),
      setState(name) {
        if (!states[name]) throw new Error(`unknown state ${name}`);
        states[name]();
        return { state: name };
      },
      setPausedForScreenshot(v) { game.pausedForScreenshot = !!v; return true; },
      seed() { return true; },
      hideDebugUi() { return true; },
      press(code, ms = 100) {
        game.input.keys.add(code); game.input.pressed.add(code);
        return new Promise((r) => setTimeout(() => { game.input.keys.delete(code); r(true); }, ms));
      },
      look(dx, dy) { game.input.mouseDX += dx; game.input.mouseDY += dy; },
      teleport(x, z) { game.player.teleport(x, z); },
      setTime(h) { game.world.setTime(h); },
      setWeather(k) { game.settings.weather = k === 'dynamic' ? 'dynamic' : k; game.weather.set(k === 'dynamic' ? 'clear' : k, true); return true; },
      breakdown() {
        game.updateChunkVisibility();
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(game.camera.projectionMatrix, game.camera.matrixWorldInverse));
        const out = {};
        game.scene.traverseVisible((o) => {
          if (!o.isMesh) return;
          if (o.frustumCulled && o.geometry.boundingSphere) {
            const bs = (o.isInstancedMesh ? o.boundingSphere : o.geometry.boundingSphere).clone().applyMatrix4(o.matrixWorld);
            if (!fr.intersectsSphere(bs)) return;
          }
          const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
          const key = (o.isInstancedMesh ? 'inst:' : 'mesh:') + (Array.isArray(o.material) ? o.material.map((m) => m.name || m.type).join('+') : (o.material.name || o.material.type)) + ':' + Math.round(o.geometry.attributes.position.count);
          out[key] = out[key] || { n: 0, tris: 0 };
          out[key].n++; out[key].tris += Math.round(t);
        });
        return Object.entries(out).sort((a, b) => b[1].tris - a[1].tris).slice(0, 15);
      },
      /** Runs the simulation at a fixed 60 Hz with the given keys held (independent of render speed). */
      simulate(seconds, codes = [], tap = []) {
        const inp = game.input;
        codes.forEach((c) => inp.keys.add(c));
        tap.forEach((c) => inp.pressed.add(c));
        const steps = Math.round(seconds * 60);
        let maxY = -1e9;
        for (let i = 0; i < steps; i++) { game.update(1 / 60); inp.endFrame(); maxY = Math.max(maxY, game.player.pos.y); }
        codes.forEach((c) => inp.keys.delete(c));
        game.publishDiagnostics();
        return { ...window.__THREE_GAME_DIAGNOSTICS__, maxY };
      },
      callBreakdown() {
        // which visible meshes cost draw calls (one per material group), grouped by role
        game.updateChunkVisibility();
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(game.camera.projectionMatrix, game.camera.matrixWorldInverse));
        const out = {};
        game.scene.traverseVisible((o) => {
          if (!o.isMesh && !o.isSprite) return;
          if (o.frustumCulled !== false && o.geometry && o.geometry.boundingSphere) {
            const bs = (o.isInstancedMesh ? o.boundingSphere || o.geometry.boundingSphere : o.geometry.boundingSphere).clone().applyMatrix4(o.matrixWorld);
            if (!fr.intersectsSphere(bs)) return;
          }
          const calls = Array.isArray(o.material) ? o.material.length : 1;
          let key = o.userData.chunk ? 'chunk:' + (o.material.name || '') : o.isInstancedMesh ? 'instanced' : o.isSkinnedMesh ? 'skinned' : o.isSprite ? 'sprite' : 'mesh';
          if (o.userData.chunk) key = 'chunkStatic';
          out[key] = (out[key] || 0) + calls;
        });
        return out;
      },
      tapes() { return game.tapes.tapes.map((t) => ({ x: t.x, z: t.z, collected: t.collected })); },
    };
  }

  /** Puts the game into a deterministic playing state for captures. */
  /** Puts the player into a vehicle of `type`, moved to x,z, for captures/tests. */
  stageDrive(time, type, x, z, heading, siren = false) {
    if (this.driver.vehicle) this.driver.exit();
    this.stage(time, x - 6, z, heading);
    const v = this.vehicles.vehicles.find((c) => c.spec.asset === type || c.spec.label.toLowerCase().includes(type));
    if (!v) throw new Error(`no vehicle ${type}`);
    v.pos.set(x, 0, z); v.heading = heading; v.vel.set(Math.sin(heading) * 14, Math.cos(heading) * 14); v.syncTransform();
    this.driver.enter(v);
    v.headlights = this.world.night > 0.3;
    if (siren) { v.siren = true; }
    this.camera3p.yaw = heading;
    for (let i = 0; i < 40; i++) { this.input.keys.add('KeyW'); this.update(1 / 60); }
    this.input.keys.delete('KeyW');
  }

  stage(time, x, z, heading) {
    if (this.driver.vehicle) this.driver.exit();
    this.menus.showStart(false);
    this.menus.showPause(false);
    this.menus.showMap(false);
    this.hud.show(true);
    this.state = 'playing';
    this.input.enabled = true;
    this.playTime = 30;
    this.jobs.abort();
    this.world.setTime(time);
    this.player.teleport(x, z);
    this.player.heading = heading;
    this.camera3p.reset(heading);
    this.traffic.reset(); this.npcs.reset();
    this.traffic.prefill(this.player.pos); this.npcs.prefill(this.player.pos);
    // settle a few frames so camera, env map and HUD are current
    for (let i = 0; i < 30; i++) this.update(1 / 60);
    this.world.envTimer = 999;
    this.world.update(0.001, this.player.pos);
  }

  publishDiagnostics() {
    if (!this.player) return;
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      state: this.state,
      time: this.world.timeOfDay,
      money: this.money,
      tapes: this.tapes.count,
      npcs: this.npcs ? this.npcs.stats() : null,
      wanted: this.police ? { log: this.police.log, level: this.police.level, seen: this.police.seen, units: this.police.units.length, roadblocks: this.police.roadblocks.length, evade: this.police.evade } : null,
      mission: this.story && this.story.active ? { id: this.story.active.id, step: this.story.stepIndex, timer: this.story.stepTimer } : null,
      missionsDone: this.story ? [...this.story.done] : [],
      health: this.player.health,
      traffic: this.traffic ? { cars: this.traffic.cars.length, stopped: this.traffic.cars.filter((c) => c.speed < 0.3).length, turning: this.traffic.cars.filter((c) => c.turn).length } : null,
      vehicle: this.driver.vehicle ? { label: this.driver.vehicle.spec.label, kmh: this.driver.vehicle.kmh, health: this.driver.vehicle.health, heading: this.driver.vehicle.heading, slip: this.driver.vehicle.slip, gear: this.driver.vehicle.gear } : null,
      player: { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, speed: this.player.speed, grounded: this.player.grounded, stamina: this.player.stamina, crouched: this.player.crouched, anim: this.player.rig?.currentName },
      weather: { target: this.weather.target, overcast: this.weather.overcast, rain: this.weather.rain, wet: this.weather.wet },
      job: this.jobs.taxi ? { kind: 'taxi', phase: this.jobs.taxi.phase, fares: this.jobs.taxi.fares, earned: this.jobs.taxi.earned, timer: this.jobs.taxi.timer } : this.jobs.race ? { kind: 'race', phase: this.jobs.race.phase, i: this.jobs.race.i, elapsed: this.jobs.race.elapsed } : null,
      radio: this.audio.radio.label, completion: this.completion(), stats: this.stats,
      camera: { yaw: this.camera3p.yaw, pitch: this.camera3p.pitch, dist: this.camera3p.currentDist },
      pointerLock: this.input.locked, dragLook: this.input.dragLook,
      render: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
    };
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}
