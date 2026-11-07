import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
import { classify, BEACH } from '../world/Layout.js';
import { lerp } from '../utils/random.js';

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
    this.frame = 0;
    this.pausedForScreenshot = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.1, 6000);
    this.input = new InputManager(canvas);
    this.collision = new CollisionSystem();
    this.audio = new AudioManager();
    this.audio.volume = this.settings.volume;
    this.timer = new THREE.Timer();
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
    this.city = new CityGenerator(this.scene, this.collision, assets).generate();
    this.world.attachCity(this.city);
    this.menus.setLoading(0.88, 'Waking up the locals…');
    await nextFrame();
    this.vehicles = new VehicleSystem(this, assets);
    this.driver = new VehicleController(this);
    this.player = new PlayerController(this, assets);
    this.camera3p = new CameraController(this);
    this.camera3p.reset(this.player.heading);
    this.hud = new HUD(this);
    this.minimap = new Minimap(this.city);
    this.missions = new MissionSystem(this);
    this.tapes = this.missions.add(new LostTapes(this));
    this.setupComposer();
    this.applyQuality();
    this.applyDaySpeed();
    this.resize();
    this.installHooks();
    // warm up shaders/textures behind the start screen
    this.world.update(0.016, this.player.pos);
    this.camera3p.update(0.016);
    this.renderer.compile(this.scene, this.camera);
    this.state = 'ready';
    this.menus.setLoading(1, 'Ready');
    this.menus.ready();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  setupComposer() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composerSamples = q.samples;
  }

  applyQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    this.bloom.enabled = q.bloom;
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
  begin() {
    if (this.state !== 'ready') return;
    this.audio.start();
    this.audio.setVolume(this.settings.volume);
    this.menus.showStart(false);
    this.hud.show(true);
    this.state = 'playing';
    this.input.requestLock();
    this.hud.toast('WELCOME TO VISTA MAR', 'Twelve lost mixtapes are hidden around the city. Follow the pink beams.');
    setTimeout(() => this.state === 'playing' && this.hud.toast('NEED A RIDE?', 'A sports car is parked on Palm Boulevard right ahead. Walk up and press E.'), 4500);
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
    this.audio.resume();
    this.input.requestLock();
  }

  openMap() {
    if (this.state !== 'playing') return;
    this.state = 'map';
    this.suppressUnlockPause = true;
    this.input.exitLock();
    this.input.enabled = false;
    this.menus.showMap(true);
  }

  restart() {
    if (this.driver.vehicle) this.driver.exit();
    this.vehicles.reset();
    this.player.respawn();
    this.camera3p.reset(this.player.heading);
    this.money = 500;
    this.hud.shownMoney = 500;
    this.missions.reset();
    this.world.setTime(17.3);
    this.playTime = 0;
    this.hud.toast('RESTARTED', 'Back at Palm Boulevard.');
  }

  onKey(e) {
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

  addMoney(v) {
    this.money += v;
  }

  markers() {
    return [...this.vehicles.markers(this.player.pos), ...this.missions.markers()];
  }

  // ------------------------------------------------------------- loop
  tick() {
    this.timer.update();
    const rawDt = this.timer.getDelta();
    this.renderer.info.reset();
    const dt = Math.min(rawDt, 1 / 20);
    this.frame++;
    if (!this.pausedForScreenshot) {
      if (this.state === 'playing') this.update(dt);
      else if (this.state === 'ready') {
        // slow cinematic orbit behind the start screen
        this.world.update(dt, this.player.pos);
        this.camera3p.yaw += dt * 0.05;
        this.camera3p.update(dt);
        this.player.rig && this.player.rig.update(dt);
      } else if (this.state === 'map' && this.frame % 20 === 0) {
        this.menus.showMap(true);
      }
    }
    this.updateChunkVisibility();
    this.composer.render(dt);
    this.input.endFrame();
    this.publishDiagnostics();
  }

  update(dt) {
    this.playTime += dt;
    const p = this.player;
    if (this.driver.vehicle) this.driver.update(dt);
    else this.player.update(dt, this.camera3p.yaw);
    this.vehicles.update(dt, this.driver.vehicle);
    this.camera3p.update(dt);
    this.world.update(dt, p.pos);
    this.missions.update(dt);
    // interaction: pickups first, then the nearest vehicle
    if (!this.driver.vehicle) {
      const it = this.missions.nearestInteractable(p.pos);
      const car = it ? null : this.vehicles.nearest(p.pos, 1.6);
      this.hud.prompt(it ? it.label : car ? `Enter ${car.spec.label}${car.wrecked ? ' (wrecked)' : ''}` : '');
      if (this.input.hit('KeyE')) {
        if (it) it.action();
        else if (car) this.driver.enter(car);
      }
    } else this.hud.prompt('');
    // bloom by time of day
    this.bloom.strength = lerp(0.22, 0.85, this.world.night);
    this.bloom.threshold = lerp(0.95, 0.82, this.world.night);
    // audio environment
    const c = classify(p.pos.x, p.pos.z);
    const oceanProx = Math.max(0, Math.min(1, 1 - (BEACH.oceanStart - p.pos.x) / 140));
    const dense = { downtown: 1, nightlife: 0.9, midtown: 0.8, apartments: 0.5, beach: 0.6, industrial: 0.55, residential: 0.25, park: 0.3, sand: 0.2 }[c.district] ?? 0.4;
    this.audio.update(dt, { oceanProximity: oceanProx, cityDensity: dense, night: this.world.night, park: c.type === 'grass' ? 1 : 0 });
    this.hud.update(dt);
    this.minimap.drawRadar(p, this.camera3p.yaw, this.markers(), p.vehicle ? Math.max(0.45, 1.05 - p.speed * 0.012) : p.speed > 6 ? 0.85 : 1.1);
  }

  updateChunkVisibility() {
    const cam = this.camera.position;
    const far = (this.scene.fog ? this.scene.fog.far : 1000) + 160;
    this.city.instancer.update(cam, this.scene.fog ? this.scene.fog.far : 1000);
    for (const m of this.city.chunkMeshes) {
      const bs = m.geometry.boundingSphere;
      const d = Math.hypot(cam.x - bs.center.x, cam.z - bs.center.z) - bs.radius;
      m.visible = d < far;
    }
  }

  // ------------------------------------------------------------- test hooks
  installHooks() {
    const game = this;
    const states = {
      start: () => { game.menus.showStart(true); game.hud.show(false); game.state = 'ready'; },
      'explore-golden': () => game.stage(17.6, 28, -15.4, Math.PI / 2),
      'drive-golden': () => game.stageDrive(17.6, 'sports', 60, -8, Math.PI / 2),
      'drive-night': () => game.stageDrive(21.8, 'police', 300, 60, Math.PI, true),
      'drive-day-ocean': () => game.stageDrive(12, 'sports', 400, 120, Math.PI),
      'explore-day': () => game.stage(11.5, 28, -15.4, Math.PI / 2),
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
    this.world.setTime(time);
    this.player.teleport(x, z);
    this.player.heading = heading;
    this.camera3p.reset(heading);
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
      vehicle: this.driver.vehicle ? { label: this.driver.vehicle.spec.label, kmh: this.driver.vehicle.kmh, health: this.driver.vehicle.health, heading: this.driver.vehicle.heading, slip: this.driver.vehicle.slip, gear: this.driver.vehicle.gear } : null,
      player: { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, speed: this.player.speed, grounded: this.player.grounded, stamina: this.player.stamina, crouched: this.player.crouched, anim: this.player.rig?.currentName },
      camera: { yaw: this.camera3p.yaw, pitch: this.camera3p.pitch, dist: this.camera3p.currentDist },
      pointerLock: this.input.locked, dragLook: this.input.dragLook,
      render: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
    };
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}
