import * as THREE from 'three';
import { EventBus } from '../core/EventBus.js';
import { Input } from '../core/Input.js';
import { Loop } from '../core/Loop.js';
import { createRenderer, resizeRenderer, QUALITY_PRESETS } from '../core/Renderer.js';
import { createRng, damp } from '../core/rng.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { World } from '../world/World.js';
import { SPAWN, MARKET, LANDMARKS, terrainHeight, lakeDistance } from '../world/layout.js';
import { PlayerState } from './PlayerState.js';
import { WorldState } from './WorldState.js';
import { MIRACLES } from './miracles.js';
import { PlayerController } from '../player/PlayerController.js';
import { JesusModel } from '../player/JesusModel.js';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera.js';
import { AudioManager } from '../audio/AudioManager.js';
import { SaveManager } from '../save/SaveManager.js';
import { UI } from '../ui/UI.js';
import { Minimap, buildMapBase } from '../ui/Minimap.js';
import { NPCManager } from '../npc/NPCManager.js';
import { DialogueController } from './DialogueController.js';
import { DayCycle, DAY_LENGTH, clockLabel } from '../world/DayCycle.js';
import { MiracleManager } from '../miracles/MiracleManager.js';
import { Effects } from '../vfx/Effects.js';
import { MIRACLE_REVEALS } from './miracles.js';

const AUTOSAVE_SECONDS = 30;

/**
 * One local play session. Owns the systems and their update order:
 *   input -> fixed (player controller -> physics -> props) -> camera/model/world -> UI/audio -> render.
 * A future multiplayer build would host several PlayerStates in one session.
 */
export class GameSession {
  constructor(canvas) {
    this.canvas = canvas;
    this.bus = new EventBus();
    this.saves = new SaveManager();
    this.settings = this.saves.loadSettings();
    this.audio = new AudioManager();
    this.audio.setVolumes(this.settings);
    this.ui = new UI(this.bus, this.audio);
    this.ui.settings = this.settings;
    this.screen = 'loading';
    this.rng = createRng(20260);
    this.pausedForScreenshot = false;
    this.reducedMotion = false;
    this.frame = 0;
    this.menuTime = 0;
    this.autosaveTimer = AUTOSAVE_SECONDS;
    this.minimapTimer = 0;
    this.lowFpsTime = 0;
    this.pending = { jump: false };
    this.intent = null;
    this.time = 0;
    this.clock = 0.1; // 07:38
    this.flags = {};
    this.met = new Set();
    this.talkTarget = null;
    this.npcsInMenu = true; // the village keeps living behind the main menu
  }

  async init() {
    const ui = this.ui;
    ui.setLoading(0.05, 'Waking up the physics engine…');
    this.renderer = createRenderer(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 520);
    this.physics = await PhysicsWorld.create();

    this.world = new World(this.scene, this.physics, this.rng, this.bus);
    const steps = this.world.buildSteps();
    let i = 0;
    for (let step = steps.next(); !step.done; step = steps.next()) {
      ui.setLoading(0.12 + i * 0.16, `${step.value}…`);
      i += 1;
      await new Promise((r) => setTimeout(r, 0));
    }
    ui.setLoading(0.86, 'Waking up the villagers…');
    await new Promise((r) => setTimeout(r, 0));
    this.npcs = new NPCManager({ scene: this.scene, physics: this.physics, bus: this.bus, rng: this.rng, anchors: this.world.anchors });
    this.npcs.build();
    ui.setLoading(0.94, 'Dressing Jesus in his finest tunic…');

    this.createLights();
    this.dayCycle = new DayCycle({ sun: this.sunLight, hemi: this.hemi, sky: this.world.sky, fog: this.scene.fog, clouds: this.world.clouds, scene: this.scene });
    this.dialogue = new DialogueController({ bus: this.bus, ui: this.ui, rng: this.rng, getContext: () => this.dialogueContext() });
    this.playerState = new PlayerState();
    this.worldState = new WorldState(this.bus);
    // the sign interactable follows the generated workshop sign
    const sign = this.worldState.interactables.find((it) => it.id === 'sign.workshop');
    if (sign && this.world.workshopSign) Object.assign(sign, { x: this.world.workshopSign.x, z: this.world.workshopSign.z });

    this.playerState.position.set(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z);
    this.playerState.yaw = SPAWN.yaw;
    this.player = new PlayerController(this.physics, this.playerState, this.bus);
    this.model = new JesusModel();
    this.scene.add(this.model.group);
    this.cam = new ThirdPersonCamera(this.camera);
    this.effects = new Effects(this.scene);
    this.miracles = new MiracleManager({
      bus: this.bus, effects: this.effects, audio: this.audio, npcs: this.npcs, props: this.world.propSystem, world: this.world,
      player: this.player, state: this.playerState, model: this.model, camera: this.camera, rng: this.rng,
    });

    this.mapBase = buildMapBase(this.world.splat, this.world.footprints);
    this.minimap = new Minimap(document.getElementById('minimap'), this.mapBase);

    this.input = new Input(this.canvas);
    this.input.onPointerLockChange = (locked) => this.onPointerLock(locked);
    this.applyQuality(this.settings.quality);
    this.bindEvents();
    this.installTestHooks();

    this.loop = new Loop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt, alpha, elapsed) => this.update(dt, alpha, elapsed),
      render: () => this.render(),
    });
    // warm up shaders so the first gameplay frame does not hitch
    this.placeMenuCamera(0);
    resizeRenderer(this.renderer, this.camera, QUALITY_PRESETS[this.settings.quality].dpr);
    this.renderer.compile(this.scene, this.camera);
    ui.setLoading(1, 'Ready.');
    this.loop.start();
    this.goToMenu();
    ui.hideLoading();
  }

  createLights() {
    const sunDir = this.world.sun;
    this.hemi = new THREE.HemisphereLight('#d8e8ff', '#b48a5a', 1.25);
    this.scene.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight('#fff0d2', 3.1);
    this.sunLight.castShadow = true;
    const s = this.sunLight.shadow;
    s.camera.near = 1;
    s.camera.far = 220;
    s.camera.left = -42;
    s.camera.right = 42;
    s.camera.top = 42;
    s.camera.bottom = -42;
    s.bias = -0.0004;
    s.normalBias = 0.04;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.sunDir = sunDir;
    this.scene.fog = new THREE.Fog('#ecd8ae', 70, 440);
  }

  applyQuality(name) {
    const q = QUALITY_PRESETS[name] || QUALITY_PRESETS.high;
    this.quality = name;
    this.qualityPreset = q;
    const shadowChanged = this.renderer.shadowMap.enabled !== q.shadows;
    this.renderer.shadowMap.enabled = q.shadows;
    this.sunLight.castShadow = q.shadows;
    if (this.sunLight.shadow.mapSize.x !== q.shadowMap) {
      this.sunLight.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    if (shadowChanged) this.scene.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
    this.camera.far = q.far;
    this.camera.updateProjectionMatrix();
    this.scene.fog.far = q.far * 0.85;
    this.scene.fog.near = Math.min(70, q.far * 0.2);
    this.world.setGrassDensity(q.grass);
    resizeRenderer(this.renderer, this.camera, q.dpr);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  }

  bindEvents() {
    const bus = this.bus;
    bus.on('ui:play', ({ newGame }) => this.startPlay(newGame));
    bus.on('ui:resume', () => this.resume());
    bus.on('ui:save-quit', () => {
      this.saveGame();
      this.ui.closePause();
      this.goToMenu();
      this.ui.toast('Game saved.');
    });
    bus.on('ui:settings', (s) => {
      const qualityChanged = s.quality !== this.settings.quality;
      Object.assign(this.settings, s);
      this.saves.saveSettings(this.settings);
      this.audio.setVolumes(this.settings);
      if (qualityChanged) this.applyQuality(s.quality);
    });
    bus.on('player:footstep', ({ sprint }) => {
      const p = this.playerState.position;
      if (this.playerState.waterDepth > 0.05) {
        this.effects.ring({ x: p.x, y: 0.04, z: p.z, color: this.playerState.onWater ? '#fff6d0' : '#d8f2ff', from: 0.2, to: this.playerState.onWater ? 2.2 : 1.2, life: 0.9, opacity: 0.6 });
        this.effects.burst({ x: p.x, y: 0.05, z: p.z, count: 6, color: '#e9f7ff', speed: 1.2, up: 0.8, life: 0.5, gravity: -6, size: 0.15 });
        this.audio.splash(this.playerState.onWater ? 0.25 : 0.45);
        return;
      }
      const paved = Math.hypot(p.x, p.z) < 13 || (p.x > MARKET.x0 && p.x < MARKET.x1 && p.z > MARKET.z0 && p.z < MARKET.z1) || p.y > 3.5;
      this.audio.footstep(paved ? 'stone' : 'sand', sprint);
    });
    bus.on('player:jump', () => this.audio.jump());
    bus.on('player:land', ({ airTime }) => {
      this.audio.land(airTime);
      this.model.land(airTime * 10);
    });
    bus.on('player:boundary', () => this.ui.toast('The road beyond the valley opens in a coming chapter.', 'boundary', 6));
    bus.on('player:respawn', () => this.ui.toast('Back on solid ground.'));
    bus.on('landmark:discover', ({ name, blurb, count, total }) => {
      this.audio.discovery();
      this.ui.banner(`LANDMARK DISCOVERED · ${count}/${total}`, name, blurb);
      this.saveGame();
    });
    bus.on('mission:complete', () => {
      this.ui.banner('CHAPTER I COMPLETE', 'Nazareth Explored', 'You know every corner of home. The wider road to Galilee opens in the next chapter.');
      this.saveGame();
    });
    bus.on('prop:disturbed', ({ type }) => {
      if (this.screen !== 'playing') return;
      this.playerState.stats.propsDisturbed += 1;
      if (type === 'fruit') this.addChaos(0.2);
      this.audio.thud(type === 'fruit' ? 0.4 : 1);
    });
    bus.on('prop:broken', ({ x, z }) => {
      if (this.screen !== 'playing') return;
      this.playerState.stats.potsBroken = (this.playerState.stats.potsBroken || 0) + 1;
      this.addChaos(2);
      this.audio.crash(this.audioGain(x, z));
    });
    bus.on('npc:knocked', () => {
      this.playerState.stats.peopleKnocked = (this.playerState.stats.peopleKnocked || 0) + 1;
      this.addChaos(1);
      this.audio.thud(1.4);
    });
    bus.on('npc:bark', ({ voice, x, z, length, dialogue }) => {
      if (this.screen !== 'playing') return;
      this.audio.babble(voice, length, dialogue ? 1 : this.audioGain(x, z));
    });
    bus.on('animal:flee', ({ kind, x, z }) => kind === 'chicken' && this.audio.cluck(this.audioGain(x, z)));
    bus.on('sheep:asked', () => this.ui.toast('Amos lost a sheep near the Old Watchtower (north-west).', 'sheep-asked', 6));
    bus.on('sheep:following', () => {
      this.audio.baa(1);
      this.ui.toast('The runaway sheep is following you. Lead her back to Amos.', 'sheep-follow', 6);
    });
    bus.on('sheep:returned', () => {
      this.flags['sheep.returned'] = true;
      this.addFaith(5);
      this.audio.baa(1);
      this.audio.discovery();
      this.ui.banner('GOOD DEED', 'The Lost Sheep', 'Amos\'s runaway is back with the flock. Faith +5');
      const amos = this.npcs.byId.get('npc.amos');
      if (amos) this.npcs.say(amos, 'You found her! Bless you, Yeshua!', 3, 'smile');
      this.saveGame();
    });
    bus.on('dialogue:effect', ({ npcId, faith, chaos, flag, event }) => {
      const first = !flag || !this.flags[flag];
      if (flag) this.flags[flag] = true;
      if (faith && first) this.addFaith(faith);
      if (chaos) this.addChaos(chaos);
      if (event) bus.emit(event, { npcId });
    });
    bus.on('dialogue:end', ({ npc }) => {
      this.npcs.endTalk(npc);
      this.input.releaseAll();
    });
    bus.on('ui:dialogue-choice', ({ index }) => this.dialogue.choose(index));

    // ---- miracles
    bus.on('landmark:discover', ({ landmarkId }) => {
      const id = MIRACLE_REVEALS[landmarkId];
      if (id) this.miracles.unlock(id);
    });
    bus.on('miracle:reveal', ({ miracle }) => {
      this.audio.discovery();
      this.ui.banner('A GIFT IS REVEALED', miracle.name, `${miracle.description}  —  press ${miracle.key}, then click or Q`);
      this.playerState.selectedMiracle = miracle.key - 1;
      this.ui.setSelectedMiracle(this.playerState.selectedMiracle, this.playerState.unlockedMiracles);
      this.saveGame();
    });
    bus.on('npc:fetched', ({ copy }) => {
      const t = copy.body.translation();
      this.effects.burst({ x: t.x, y: t.y + 0.2, z: t.z, count: 10, color: '#ffe9a8', speed: 1, up: 1, life: 0.7, size: 0.2 });
      this.world.propSystem.removeCopy(copy);
      this.playerState.stats.fed = (this.playerState.stats.fed || 0) + 1;
      this.addFaith(1);
    });
    bus.on('copy:recycled', ({ x, y, z }) => this.effects.burst({ x, y: y + 0.1, z, count: 8, color: '#fff3c4', speed: 1, up: 0.8, life: 0.5, size: 0.2 }));
    bus.on('player:deep-water', () => this.ui.toast(this.miracles.isUnlocked('miracle.walk-on-water') ? 'Too deep to wade. Press 4 and cast Walk on Water.' : 'Too deep to wade any further.', 'deep', 5));
    bus.on('miracle:fading', () => this.ui.toast('Your steps feel heavier… get back to shore!', 'fading', 4));
    bus.on('miracle:end', ({ miracleId, reason }) => {
      if (miracleId === 'miracle.walk-on-water' && reason === 'sank') {
        this.ui.toast('O ye of little faith! (You sank. Someone fished you out onto the dock.)', 'sank', 6);
        this.addChaos(0.5);
      }
    });
    bus.on('miracle:witnessed', ({ witnesses }) => { if (witnesses > 0) this.addFaith(3); });
    bus.on('wine:faded', ({ name }) => this.ui.toast(`${name} runs clear again.`, `faded-${name}`, 5));
    bus.on('miracle:cast', ({ miracleId, crowd }) => {
      this.playerState.stats.miracles = (this.playerState.stats.miracles || 0) + 1;
      if (miracleId === 'miracle.multiplication' && crowd > 25) this.ui.toast('The street is filling up with bread…', 'crowd', 8);
    });

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.ui.sheetOpen) {
        this.ui.closeSheet();
        return;
      }
      if (this.screen === 'playing' && this.dialogue.active) {
        this.dialogue.close();
        return;
      }
      if (this.screen === 'playing') this.pause();
      else if (this.screen === 'paused') this.resume();
      else if (this.screen === 'map') this.closeMap();
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.screen === 'map') {
        e.preventDefault();
        e.stopPropagation(); // keep Input from re-reading this press as "open map"
        this.closeMap();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.screen === 'playing') this.pause();
        this.audio.stopAll();
      } else {
        this.audio.resume();
      }
    });
    window.addEventListener('beforeunload', () => {
      if (this.screen === 'playing' || this.screen === 'paused' || this.screen === 'map') this.saveGame();
    });
  }

  // ---------------------------------------------------------------- screens
  goToMenu() {
    this.screen = 'menu';
    this.input.enabled = false;
    this.input.exitLock();
    this.ui.hideHud();
    this.ui.closeMap();
    this.ui.showMenu(this.saves.hasSave());
    this.bus.emit('session:menu');
  }

  startPlay(newGame) {
    this.audio.unlock();
    this.audio.startAmbience();
    const { data, corrupted } = newGame ? { data: null, corrupted: false } : this.saves.loadGame();
    if (newGame) this.saves.deleteGame();
    this.playerState.reset();
    this.world.resetAllProps();
    if (data) {
      this.worldState.reset(data.discovered);
      Object.assign(this.playerState.stats, data.stats);
      this.playerState.faith = data.faith;
      this.playerState.chaos = data.chaos;
      this.playerState.unlockedMiracles = data.unlockedMiracles.filter((id) => MIRACLES.some((m) => m.id === id));
      this.player.teleport(data.player.x, data.player.y, data.player.z, data.player.yaw);
      this.flags = { ...data.flags };
      this.met = new Set(data.met);
      this.clock = data.clock;
    } else {
      this.worldState.reset([]);
      this.flags = {};
      this.met = new Set();
      this.clock = 0.1;
      this.player.teleport(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z, SPAWN.yaw);
    }
    this.cam.snap(this.playerState.position, this.playerState.yaw + Math.PI);
    this.cam.pitch = 0.3;
    if (this.dialogue.active) this.dialogue.close();
    this.cam.dialogueTarget = null;
    this.miracles.reset();
    for (const id of this.worldState.discovered) if (MIRACLE_REVEALS[id]) this.miracles.unlock(MIRACLE_REVEALS[id], false);
    this.npcs.reset({ ...this.flags });
    this.ui.hideMenu();
    this.ui.showHud();
    this.ui.setSelectedMiracle(this.playerState.selectedMiracle, this.playerState.unlockedMiracles);
    this.screen = 'playing';
    this.input.enabled = true;
    this.input.releaseAll();
    this.input.requestLock();
    this.autosaveTimer = AUTOSAVE_SECONDS;
    if (corrupted) this.ui.toast('Your previous save could not be read, so a fresh journey begins.', 'corrupt', 8);
    if (!data) this.ui.banner('CHAPTER I', 'Nazareth', 'Explore your home village. Discover all eight landmarks — and the gifts hidden among them.');
    else this.ui.toast('Welcome back to Galilee.');
    this.bus.emit('session:start', { entityId: this.playerState.id, newGame: !data });
  }

  pause() {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.input.releaseAll();
    this.input.exitLock();
    this.ui.hideDialog();
    if (this.dialogue.active) this.dialogue.close();
    this.ui.openPause(this.pauseContext());
    this.bus.emit('session:pause');
  }

  resume() {
    if (this.screen !== 'paused') return;
    this.ui.closePause();
    this.screen = 'playing';
    this.input.releaseAll();
    this.input.requestLock();
    this.bus.emit('session:resume');
  }

  openMap() {
    this.screen = 'map';
    this.input.releaseAll();
    this.ui.openMap(this.pauseContext());
  }

  closeMap() {
    this.ui.closeMap();
    this.screen = 'playing';
    this.input.releaseAll();
  }

  onPointerLock(locked) {
    // Browsers swallow Esc while the pointer is locked and just release it: treat that as pause.
    if (!locked && this.screen === 'playing' && !this.suppressLockPause) this.pause();
  }

  pauseContext() {
    const next = this.worldState.nextLandmark(this.playerState.position);
    return {
      mapBase: this.mapBase,
      position: this.playerState.position,
      yaw: this.playerState.yaw,
      discovered: this.worldState.discovered,
      nextId: next?.landmark.id,
      unlocked: this.playerState.unlockedMiracles,
      stats: this.playerState.stats,
      faith: this.playerState.faith,
      chaos: this.playerState.chaos,
      followers: this.playerState.followers.length,
      met: this.met.size,
    };
  }

  addFaith(n) {
    this.playerState.faith += n;
    this.ui.toast(`Faith +${n}`, `faith-${this.frame}`, 0.5);
  }

  addChaos(n) {
    const before = Math.floor(this.playerState.chaos);
    this.playerState.chaos += n;
    if (Math.floor(this.playerState.chaos) > before && Math.floor(this.playerState.chaos) % 5 === 0) this.ui.toast(`Chaos rising: ${Math.floor(this.playerState.chaos)}`, 'chaos', 3);
  }

  audioGain(x, z) {
    const p = this.playerState.position;
    return Math.max(0, 1 - Math.hypot(x - p.x, z - p.z) / 30);
  }

  dialogueContext() {
    const next = this.worldState.nextLandmark(this.playerState.position);
    return {
      flags: { ...this.flags, ...this.npcs.flags }, chaos: this.playerState.chaos, faith: this.playerState.faith,
      hour: clockLabel(this.clock), night: this.dayCycle.nightWeight(this.clock) > 0.5,
      next, discovered: this.worldState.discovered.size, total: LANDMARKS.length,
    };
  }

  saveGame() {
    const p = this.playerState;
    const ok = this.saves.saveGame({
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw },
      discovered: [...this.worldState.discovered],
      unlockedMiracles: p.unlockedMiracles,
      missions: { 'mission.discover-nazareth': { complete: this.worldState.explorationComplete } },
      faith: p.faith,
      chaos: p.chaos,
      stats: p.stats,
      flags: { ...this.flags, ...this.npcs.flags },
      met: [...this.met],
      clock: this.clock,
    });
    if (!ok && this.saves.available) this.ui.toast('Could not save progress (storage full?).', 'save-failed', 10);
    this.bus.emit('session:saved', { ok });
    return ok;
  }

  // ---------------------------------------------------------------- loop
  fixedUpdate(dt) {
    if (this.pausedForScreenshot) return;
    if (this.screen === 'playing' && this.intent) {
      const intent = this.intent;
      intent.jump = this.pending.jump;
      this.pending.jump = false;
      this.player.fixedUpdate(dt, intent, this.cam.yaw);
    }
    if (this.screen !== 'menu' || this.npcsInMenu) {
      this.npcs.fixedUpdate(dt, {
        playerPos: this.playerState.position, playerSpeed: this.playerState.speed, clock: this.clock,
        chaos: this.playerState.chaos, flags: { ...this.flags, ...this.npcs.flags },
      });
    }
    if (this.screen === 'playing') this.miracles.fixedUpdate(dt, { castHeld: (this.testCastHeld || !!this.intent?.castHeld) && !this.dialogue.active });
    this.physics.step();
    this.simTime = (this.simTime || 0) + dt;
    this.world.propSystem.simTime = this.simTime;
    this.world.propSystem.playerPos.copy(this.playerState.position);
    this.world.syncProps(this.simTime);
  }

  update(dt, alpha, elapsed) {
    this.frame += 1;
    this.time = elapsed;
    resizeRenderer(this.renderer, this.camera, this.qualityPreset.dpr);
    this.ui.tick(dt);
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }
    const raw = this.input.read();
    if (raw.jump) this.pending.jump = true;
    const animDt = this.reducedMotion ? 0 : dt;

    if (this.screen === 'playing') {
      if (!this.reducedMotion) this.clock = (this.clock + dt / DAY_LENGTH) % 1;
      if (this.dialogue.active) {
        // conversation mode: no walking, keys pick answers
        this.handleDialogueInput(raw);
        this.intent = { ...raw, moveX: 0, moveY: 0, jump: false, sprint: false };
        this.pending.jump = false;
      } else this.intent = raw;
      this.updatePlaying(dt, alpha, this.intent);
    } else {
      this.intent = null;
      if (this.screen === 'menu') {
        this.menuTime += animDt;
        this.placeMenuCamera(this.menuTime);
      }
    }
    const renderPos = this.player.interpolate(alpha);
    this.model.group.position.copy(renderPos);
    this.model.group.rotation.y = this.playerState.yaw;
    const st = this.playerState;
    this.model.update(animDt, { speed: st.speed, sprint: st.sprinting, grounded: st.grounded, vy: st.velocity.y, aiming: st.aiming && this.screen === 'playing' });

    this.world.update(animDt, this.reducedMotion ? 0 : elapsed, this.camera.position, this.camera.far);
    this.dialogue.tick(dt);
    this.effects.update(animDt);
    this.npcs.update(animDt, alpha, { cameraPos: this.camera.position, playerPos: renderPos });
    const sky = this.dayCycle.apply(this.screen === 'menu' ? 0.18 : this.clock, this.camera.position, this.camera.far);
    this.sunDir = sky.lightDir;
    this.night = sky.night;
    this.updateSun();
    if (this.screen === 'playing' || this.screen === 'map') {
      const canvas = this.renderer.domElement;
      this.ui.updateBubbles(this.npcs.bubbles(this.talkTarget), this.camera, canvas.clientWidth, canvas.clientHeight);
    } else this.ui.updateBubbles([], this.camera, 1, 1);
    const p = st.position;
    const marketD = Math.hypot(p.x - 0, p.z + 27);
    this.audio.update(dt, { marketProximity: Math.max(0, 1 - marketD / 32), playing: this.screen === 'playing', night: this.night });
    this.monitorPerformance(dt);
    this.publishDiagnostics();
  }

  updatePlaying(dt, alpha, intent) {
    const st = this.playerState;
    st.stats.playTime += dt;
    st.aiming = intent.aim;
    intent.sprinting = st.sprinting;
    const renderPos = this.player.interpolate(alpha);
    this.cam.dialogueTarget = this.dialogue.active ? this.dialogue.npc.render : null;
    this.cam.update(dt, intent, renderPos, this.settings, this.physics, this.player.collider);
    this.ui.setLockHint(!this.input.pointerLocked && !this.hideDebugUi);

    // discovery + interaction
    this.worldState.checkDiscovery(st.id, st.position);
    const talk = this.dialogue.active ? this.dialogue.npc : this.npcs.findTalkTarget(st.position, st.yaw);
    this.talkTarget = talk;
    const it = talk ? null : this.worldState.nearestInteractable(st.position);
    this.ui.setPrompt(this.dialogue.active ? null : talk ? `Talk to ${talk.name}` : it ? it.label : null);
    if (intent.interact && !this.dialogue.active && talk) {
      this.ui.hideDialog();
      this.npcs.beginTalk(talk);
      this.met.add(talk.id);
      st.stats.conversations += 1;
      this.dialogue.open(talk);
    } else if (intent.interact && !this.dialogue.active) {
      if (this.ui.dialogOpen) this.ui.hideDialog();
      else if (it) {
        st.stats.conversations += 1;
        this.audio.chime();
        this.ui.showDialog(it.label.toUpperCase(), it.text);
        this.bus.emit('object:interact', { entityId: st.id, targetId: it.id });
      }
    }
    if (this.ui.dialogOpen && it === null) this.ui.hideDialog();

    if (intent.slot !== null) {
      st.selectedMiracle = intent.slot;
      const m = MIRACLES[intent.slot];
      if (!st.unlockedMiracles.includes(m.id)) {
        this.audio.uiDenied();
        this.ui.toast(`${m.name} has not yet been revealed to you. (Revealed at: ${m.revealAt})`, `locked-${m.id}`);
      } else this.audio.uiClick();
    }
    const selected = MIRACLES[st.selectedMiracle];
    if (intent.cast && !this.dialogue.active) {
      const res = this.miracles.tryCast(selected.id);
      if (res.ok) {
        if (res.faith) this.addFaith(res.faith);
        if (res.chaos) this.addChaos(res.chaos);
      } else if (!res.quiet) {
        this.audio.uiDenied();
        this.ui.toast(res.reason, `cast-fail-${selected.id}`, 2);
      }
    }
    // multiplication auto-repeats while the button is held — the fun part
    if (selected.id === 'miracle.multiplication' && intent.castHeld && !intent.cast && !this.dialogue.active && this.miracles.cooldownLeft(selected.id) <= 0 && this.miracles.isUnlocked(selected.id)) {
      const res = this.miracles.tryCast(selected.id);
      if (res.ok && res.chaos) this.addChaos(res.chaos);
    }
    const targeting = ['miracle.multiplication', 'miracle.water-to-wine', 'miracle.healing-touch', 'miracle.holy-levitation'].includes(selected.id) && st.unlockedMiracles.includes(selected.id);
    const target = this.miracles.update(dt, selected.id, targeting && !this.dialogue.active);
    this.ui.setMiracleHud({
      index: st.selectedMiracle,
      unlocked: st.unlockedMiracles,
      cooldown: MIRACLES.map((m) => this.miracles.cooldownLeft(m.id) / m.cooldown),
      label: this.miracles.describe(selected.id, target),
    });
    this.ui.setAiming(intent.aim || targeting);
    if (intent.vehicle) this.ui.toast('Nothing to ride here yet — the donkeys are still on their way.', 'no-vehicle', 4);
    if (intent.map) this.openMap();

    // objective HUD
    const total = LANDMARKS.length;
    const found = this.worldState.discovered.size;
    const pips = `<div class="obj-pips">${LANDMARKS.map((l) => `<i class="${this.worldState.discovered.has(l.id) ? 'on' : ''}"></i>`).join('')}</div>`;
    if (this.worldState.explorationComplete) {
      this.ui.setObjective('CHAPTER I COMPLETE', 'Nazareth Explored', `All ${total} landmarks found. The road to the rest of Galilee opens in the next chapter.${pips}`);
    } else {
      const next = this.worldState.nextLandmark(st.position);
      const dist = Math.round(next.distance / 5) * 5;
      this.ui.setObjective('CURRENT MISSION', 'Discover Nazareth', `${found}/${total} landmarks · nearest unknown pin <b>${dist} m</b> away${pips}`);
    }

    const d = Math.hypot(st.position.x, st.position.z);
    let region = d < 64 ? 'Nazareth' : 'Nazareth Valley';
    if (lakeDistance(st.position.x, st.position.z) < 1.15) region = 'Sea of Galilee';
    else if (Math.hypot(st.position.x - 64, st.position.z - 46) < 22) region = 'Olive Grove';
    else if (Math.hypot(st.position.x + 80, st.position.z + 62) < 24) region = 'Watchtower Ridge';
    this.ui.setRegion(region);
    this.ui.setClock(clockLabel(this.clock), this.dayCycle.nightWeight(this.clock) > 0.5);
    this.ui.setFollowers(st.followers.length);
    this.ui.setAttention(st.romanAttention);

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      const next = this.worldState.nextLandmark(st.position);
      this.minimap.draw(renderPos, st.yaw, this.cam.yaw, this.worldState.discovered, next?.landmark.id, this.time, this.npcs.minimapDots());
      this.minimapTimer = 1 / 30;
    }

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.saveGame();
      this.autosaveTimer = AUTOSAVE_SECONDS;
    }
  }

  handleDialogueInput(raw) {
    if (raw.slot !== null && raw.slot < this.dialogue.options.length) {
      this.audio.uiClick();
      this.dialogue.choose(raw.slot);
    } else if (raw.interact || raw.jump) {
      this.dialogue.advance();
    }
    // walking away is not possible mid-conversation; ESC leaves (handled on keydown)
    raw.slot = null;
    raw.interact = false;
  }

  placeMenuCamera(t) {
    const a = 0.6 + t * 0.045;
    const r = 30;
    this.camera.position.set(Math.cos(a) * r - 4, 13 + Math.sin(t * 0.2) * 1.5, Math.sin(a) * r - 6);
    this.camera.lookAt(-2, 3.5, -8);
  }

  updateSun() {
    const focus = this.screen === 'menu' ? new THREE.Vector3(-2, 0, -8) : this.playerState.position;
    // snap the shadow frustum to texels to avoid shimmering while walking
    const texel = 84 / this.sunLight.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sunLight.target.position.set(fx, focus.y, fz);
    this.sunLight.position.set(fx + this.sunDir.x * 100, focus.y + this.sunDir.y * 100, fz + this.sunDir.z * 100);
  }

  monitorPerformance(dt) {
    if (this.screen !== 'playing') return;
    const fps = this.loop.averageFps();
    this.ui.setFps(this.settings.showFps, fps, `· ${this.quality} · ${this.renderer.info.render.calls} calls`);
    if (fps < 38 && this.quality !== 'low') {
      this.lowFpsTime += dt;
      if (this.lowFpsTime > 5) {
        const next = this.quality === 'high' ? 'medium' : 'low';
        this.settings.quality = next;
        this.saves.saveSettings(this.settings);
        this.applyQuality(next);
        this.ui.toast(`Graphics set to ${next} to keep things smooth.`, 'auto-quality', 10);
        this.lowFpsTime = 0;
      }
    } else {
      this.lowFpsTime = Math.max(0, this.lowFpsTime - dt);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- test hooks
  installTestHooks() {
    const states = {
      menu: () => {
        this.ui.closePause();
        this.goToMenu();
        this.menuTime = 4;
        this.placeMenuCamera(this.menuTime);
      },
      'active-play': () => {
        this.suppressLockPause = true;
        this.startPlay(true);
        this.cam.update(1 / 60, this.input.read(), this.playerState.position, this.settings, this.physics, this.player.collider);
      },
      market: () => {
        states['active-play']();
        // stand in the aisle looking east along the stalls
        this.player.teleport(-3, terrainHeight(-3, -27), -27, Math.PI / 2 + 0.2);
        this.cam.snap(this.playerState.position, -Math.PI / 2 + 0.25);
        this.cam.pitch = 0.22;
        this.cam.targetDistance = 5.5;
      },
      rooftop: () => {
        states['active-play']();
        this.player.teleport(-29, 9, -47, -2.3);
        this.cam.snap(this.playerState.position, -2.3 + Math.PI);
        this.cam.pitch = 0.35;
        this.cam.targetDistance = 7.5;
      },
      portrait: () => {
        states['active-play']();
        this.player.teleport(-3.5, 0, 6.5, 0.35);
        this.cam.snap(this.playerState.position, 0.35);
        this.cam.pitch = 0.1;
        this.cam.targetDistance = 3.2;
        this.cam.currentDistance = 3.2;
      },
      'plaza-life': () => {
        states['active-play']();
        this.simulate(40);
        this.player.teleport(-2.5, 0, 10.5, Math.PI);
        this.cam.snap(this.playerState.position, 0.15);
        this.cam.pitch = 0.32;
        this.cam.targetDistance = 7;
        this.cam.currentDistance = 7;
      },
      'market-life': () => {
        states['active-play']();
        this.simulate(40);
        this.player.teleport(-15, 0, -27, Math.PI / 2);
        this.cam.snap(this.playerState.position, -Math.PI / 2 - 0.12);
        this.cam.pitch = 0.2;
        this.cam.targetDistance = 5;
        this.cam.currentDistance = 5;
      },
      'npc-dialogue': () => {
        states['active-play']();
        this.simulate(5);
        const eli = this.npcs.byId.get('npc.eli');
        const f = this.world.anchors.stalls[eli.def.stall].front;
        this.player.teleport(f.x, 0, f.z, f.yaw);
        this.cam.snap(this.playerState.position, f.yaw + Math.PI - 0.5);
        this.cam.pitch = 0.18;
        this.cam.targetDistance = 4;
        this.cam.currentDistance = 4;
        this.npcs.beginTalk(eli);
        this.met.add(eli.id);
        this.dialogue.open(eli);
        this.npcs.update(1 / 60, 1, { cameraPos: this.camera.position, playerPos: this.playerState.position });
        this.cam.dialogueTarget = eli.render;
        for (let i = 0; i < 120; i += 1) this.cam.update(1 / 60, { lookX: 0, lookY: 0, zoom: 0, aim: false }, this.playerState.position, this.settings, this.physics, this.player.collider);
      },
      'miracle-push': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.simulate(25);
        // crowd a few villagers in front of Jesus at the market
        const people = this.npcs.npcs.filter((n) => !n.anchored && !n.tag).slice(0, 4);
        people.forEach((n, i) => { n.override = { type: 'look', t: 5, age: 0 }; this.npcs.place(n, -2 + i * 1.3, terrainHeight(-2 + i * 1.3, -24), -24 - (i % 2)); });
        this.player.teleport(-0.5, 0, -19.5, Math.PI);
        this.cam.snap(this.playerState.position, 0.35);
        this.cam.pitch = 0.25;
        this.castForTest(0, 0.18);
      },
      'miracle-multiply': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.simulate(3);
        const eli = this.npcs.byId.get('npc.eli');
        const f = this.world.anchors.stalls[eli.def.stall].front;
        this.player.teleport(f.x, 0, f.z, f.yaw);
        this.cam.snap(this.playerState.position, f.yaw + Math.PI - 0.6);
        this.cam.pitch = 0.3;
        for (let i = 0; i < 8; i += 1) this.castForTest(1, 0.35);
        this.simulate(0.4);
      },
      'miracle-wine': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.simulate(10);
        this.player.teleport(2.6, 0, 3.2, Math.atan2(-2.6, -3.2));
        this.cam.snap(this.playerState.position, Math.atan2(2.6, 3.2) + 0.5);
        this.cam.pitch = 0.4;
        this.castForTest(2, 1.2);
      },
      'miracle-water': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.player.teleport(118, 0, -9, Math.PI / 2);
        this.castForTest(3, 0.1);
        this.player.teleport(133, 0.1, -16, 1.9);
        this.simulate(1.2);
        this.cam.snap(this.playerState.position, 1.9 + Math.PI - 0.4);
        this.cam.pitch = 0.22;
        this.cam.targetDistance = 7;
        this.cam.currentDistance = 7;
      },
      'miracle-heal': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.simulate(4);
        const b = this.npcs.byId.get('npc.benjamin');
        this.npcs.leaveAnchor(b, true);
        this.npcs.place(b, 4, terrainHeight(4, 9), 9);
        b.override = { type: 'look', t: 3, age: 0 };
        this.player.teleport(4, 0, 11.2, Math.PI);
        this.cam.snap(this.playerState.position, Math.PI * 0.5 + 0.2);
        this.cam.pitch = 0.2;
        this.cam.targetDistance = 4.5;
        this.cam.currentDistance = 4.5;
        this.castForTest(4, 0.45);
      },
      'miracle-levitate': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.simulate(4);
        const n = this.npcs.byId.get('npc.villager.1');
        this.npcs.leaveAnchor(n, true);
        this.npcs.place(n, 2, terrainHeight(2, 10), 10);
        n.override = { type: 'look', t: 3, age: 0 };
        this.player.teleport(2, 0, 12.6, Math.PI);
        this.cam.snap(this.playerState.position, 0.6);
        this.cam.pitch = 0.18;
        this.testCastHeld = true;
        this.castForTest(5, 1.3);
      },
      night: () => {
        states['active-play']();
        this.clock = 0.885;
        this.simulate(30);
        this.player.teleport(-3, 0, 8, Math.PI);
        this.cam.snap(this.playerState.position, 0.3);
        this.cam.pitch = 0.3;
      },
      map: () => {
        states['active-play']();
        this.worldState.reset(['landmark.town-well', 'landmark.workshop']);
        this.openMap();
      },
      pause: () => {
        states['active-play']();
        this.screen = 'playing';
        this.pause();
      },
    };
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value) => {
        this.rng = createRng(value);
      },
      setState: (name) => {
        const fn = states[name];
        if (!fn) throw new Error(`Unknown test state: ${name}`);
        this.pausedForScreenshot = false;
        this.testCastHeld = false;
        fn();
        // settle physics/camera for a few steps so the frame is representative
        if (this.screen === 'playing') this.intent = this.input.read();
        for (let i = 0; i < 20; i += 1) this.fixedUpdate(1 / 60);
        if (this.screen === 'playing') {
          const pos = this.player.interpolate(1);
          for (let i = 0; i < 30; i += 1) this.cam.update(1 / 60, { lookX: 0, lookY: 0, zoom: 0, aim: false }, pos, this.settings, this.physics, this.player.collider);
          this.model.group.position.copy(pos);
          this.model.group.rotation.y = this.playerState.yaw;
          // let the animation rig settle into the grounded idle pose
          const st = this.playerState;
          for (let i = 0; i < 60; i += 1) this.model.update(1 / 60, { speed: 0, sprint: false, grounded: st.grounded, vy: 0, aiming: false });
          this.updatePlaying(0, 1, this.input.read());
        }
        for (let i = 0; i < 30; i += 1) this.npcs.update(1 / 60, 1, { cameraPos: this.camera.position, playerPos: this.playerState.position });
        const sky = this.dayCycle.apply(this.screen === 'menu' ? 0.18 : this.clock, this.camera.position, this.camera.far);
        this.sunDir = sky.lightDir;
        this.night = sky.night;
        this.updateSun();
        if (this.screen === 'playing' || this.screen === 'map') {
          const c = this.renderer.domElement;
          this.ui.updateBubbles(this.npcs.bubbles(this.talkTarget), this.camera, c.clientWidth, c.clientHeight);
        }
        this.render();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled) => {
        this.reducedMotion = enabled;
        if (enabled) this.model.stabilize();
      },
      hideDebugUi: (hidden) => {
        this.hideDebugUi = hidden;
        document.getElementById('fps').hidden = hidden || !this.settings.showFps;
        if (hidden) this.ui.setLockHint(false);
      },
    };
  }

  unlockAllForTest() {
    for (const m of MIRACLES) this.miracles.unlock(m.id, false);
  }

  /** Test hooks: select a slot, cast through the real MiracleManager path, then advance time. */
  castForTest(slot, seconds) {
    this.playerState.selectedMiracle = slot;
    const res = this.miracles.tryCast(MIRACLES[slot].id);
    if (res.ok) {
      if (res.faith) this.addFaith(res.faith);
      if (res.chaos) this.addChaos(res.chaos);
    }
    this.simulate(seconds);
    for (let i = 0; i < Math.round(seconds * 60); i += 1) {
      this.effects.update(1 / 60);
      this.world.update(1 / 60, this.simTime || 0, this.camera.position, this.camera.far);
    }
    this.lastTestCast = res;
    return res;
  }

  /** Advance the simulation (NPCs, animals, props, clock) without rendering — used by test hooks. */
  simulate(seconds) {
    const steps = Math.round(seconds * 60);
    const wasIntent = this.intent;
    this.intent = this.input.read();
    for (let i = 0; i < steps; i += 1) {
      this.fixedUpdate(1 / 60);
      this.clock = (this.clock + 1 / 60 / DAY_LENGTH) % 1;
    }
    this.intent = wasIntent;
    this.npcs.update(1 / 60, 1, { cameraPos: this.camera.position, playerPos: this.playerState.position });
  }

  publishDiagnostics() {
    const info = this.renderer.info;
    const p = this.playerState?.position;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      screen: this.screen,
      quality: this.quality,
      fps: this.loop ? this.loop.averageFps() : 0,
      player: p && {
        position: { x: p.x, y: p.y, z: p.z },
        speed: this.playerState.speed,
        grounded: this.playerState.grounded,
        yaw: this.playerState.yaw,
      },
      camera: { yaw: this.cam?.yaw, distance: this.cam?.currentDistance },
      discovered: this.worldState ? [...this.worldState.discovered] : [],
      clock: this.clock,
      night: this.night,
      flags: this.flags,
      faith: this.playerState?.faith,
      chaos: this.playerState?.chaos,
      dialogue: this.dialogue?.active ? { npc: this.dialogue.npc.id, options: this.dialogue.options.length } : null,
      talkTarget: this.talkTarget?.id ?? null,
      npcs: this.npcs?.stats(),
      miracles: this.miracles?.stats(),
      unlocked: this.playerState?.unlockedMiracles,
      selected: this.playerState?.selectedMiracle,
      effects: this.effects?.stats(),
      water: this.playerState ? { depth: +(this.playerState.waterDepth || 0).toFixed(2), onWater: !!this.playerState.onWater } : null,
      props: this.world?.propSystem?.stats(),
      stats: this.playerState?.stats,
      physics: this.physics?.stats(),
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
      },
    };
  }
}

export { damp };
