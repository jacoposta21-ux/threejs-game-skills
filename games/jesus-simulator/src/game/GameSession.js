import * as THREE from 'three';
import { EventBus } from '../core/EventBus.js';
import { Input } from '../core/Input.js';
import { Loop } from '../core/Loop.js';
import { createRenderer, resizeRenderer, QUALITY_PRESETS } from '../core/Renderer.js';
import { createRng, damp } from '../core/rng.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { World } from '../world/World.js';
import {
  SPAWN, MARKET, LANDMARKS, CHECKPOINT, CHAPTER_ONE, CHAPTER_TWO, FARM, GOAT_HILL, HAMLET, ISLE, OUTPOST, CIRCUIT, OASIS, CAMP,
  terrainHeight, lakeDistance, restrictedZoneAt, regionAt,
} from '../world/layout.js';
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
import { RagdollSystem } from '../physics/Ragdoll.js';
import { RomanManager } from '../roman/RomanManager.js';
import { VehicleManager } from '../vehicles/VehicleManager.js';
import { MissionManager } from '../missions/MissionManager.js';
import { MISSIONS, LOST_DONKEY } from '../missions/missions.js';
import { FOLLOW_INVITE } from '../npc/dialogue.js';
import { faithTitle, chaosTier, BLESSING_COSTS, MAX_FOLLOWERS } from './reputation.js';
import { zoneAccess } from '../world/layout.js';

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
    this.ragdolls = new RagdollSystem(this.physics, this.scene);
    this.npcs = new NPCManager({ scene: this.scene, physics: this.physics, bus: this.bus, rng: this.rng, anchors: this.world.anchors, ragdolls: this.ragdolls });
    this.npcs.build();
    ui.setLoading(0.9, 'Posting the Roman garrison…');
    await new Promise((r) => setTimeout(r, 0));
    this.romans = new RomanManager({ scene: this.scene, physics: this.physics, bus: this.bus, rng: this.rng, npcs: this.npcs, anchors: this.world.anchors, ragdolls: this.ragdolls });
    this.romans.build();
    this.vehicles = new VehicleManager({ scene: this.scene, physics: this.physics, bus: this.bus, rng: this.rng, sites: this.world.sites });
    this.vehicles.build();
    this.npcs.animals.buildWild(this.world.sites);
    this.missions = new MissionManager(this.bus, {
      matches: (filter, e) => (filter === 'hungry' ? !!e.hungry : true),
      vehiclePos: (id) => { const v = this.vehicles.byId.get(id); return v ? { x: v.pos.x, z: v.pos.z } : null; },
      npcPos: (id) => { const n = this.npcs.byId.get(id) || this.romans.byId.get(id); return n ? { x: n.pos.x, z: n.pos.z } : null; },
      targetPos: (id) => { const w = this.world.waterTargets.find((t) => t.id === id); return w ? { x: w.x, z: w.z } : null; },
    });
    ui.setLoading(0.94, 'Dressing Jesus in his finest tunic…');

    this.createLights();
    this.dayCycle = new DayCycle({ sun: this.sunLight, hemi: this.hemi, sky: this.world.sky, fog: this.scene.fog, clouds: this.world.clouds, scene: this.scene });
    this.dialogue = new DialogueController({ bus: this.bus, ui: this.ui, rng: this.rng, getContext: () => this.dialogueContext() });
    this.dialogue.getExtras = (npc) => this.dialogueExtras(npc);
    this.playerState = new PlayerState();
    this.romans.state = this.playerState;
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
      bus: this.bus, effects: this.effects, audio: this.audio, npcs: this.npcs, romans: this.romans, props: this.world.propSystem, world: this.world,
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
    bus.on('ui:bless', ({ miracleId }) => this.buyBlessing(miracleId));
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
    bus.on('player:boundary', () => this.ui.toast('This is the edge of Galilee. Beyond lie lands for another day.', 'boundary', 6));
    bus.on('player:respawn', () => this.ui.toast('Back on solid ground.'));
    bus.on('landmark:discover', ({ name, blurb, count, total, chapter }) => {
      this.audio.discovery();
      this.ui.banner(chapter === 2 ? `PLACE DISCOVERED · GALILEE ${count}/${total}` : `LANDMARK DISCOVERED · ${count}/${total}`, name, blurb);
      if (chapter === 2) this.addFaith(2);
      this.saveGame();
    });
    bus.on('mission:complete', ({ missionId }) => {
      if (missionId === 'mission.explore-galilee') {
        this.addFaith(10);
        this.ui.banner('CHAPTER II COMPLETE', 'Galilee Explored', 'Farm, lake, fort and desert: you have walked (and ridden) all of it. Faith +10');
      } else {
        this.ui.banner('CHAPTER I COMPLETE', 'Nazareth Explored', 'You know every corner of home. Now the roads of Galilee are yours — borrow a donkey and go.');
      }
      this.saveGame();
    });

    // ---- missions (Chapter III — The Ministry)
    bus.on('mission:accepted', ({ missionId, title, onAccept, step }) => {
      this.audio.chime();
      this.ui.banner('NEW MISSION', title, step.text);
      if (onAccept === 'hide-donkey') {
        const v = this.vehicles.byId.get('vehicle.donkey.farm');
        if (v && this.vehicles.ridden !== v) this.vehicles.place(v, LOST_DONKEY.x, LOST_DONKEY.z, LOST_DONKEY.yaw);
        if (v) v.home = { ...LOST_DONKEY };
      } else if (onAccept === 'give-bread') this.giveBread();
      else if (onAccept === 'fort-pass') this.flags['pass.outpost'] = true;
      this.applyPerks();
      this.saveGame();
      this.bus.emit('session:mission', { missionId });
    });
    bus.on('mission:step', ({ missionId, step, finished }) => {
      this.audio.chime();
      if (finished?.done === 'fish') this.fishMiracle();
      this.ui.toast(`${MISSIONS.find((m) => m.id === missionId).title}: ${step.text}`, `mstep-${missionId}`, 1);
      if (missionId === 'mission.caravan' && step.kind === 'event') this.giveBread();
    });
    bus.on('mission:progress', ({ missionId, progress, count }) => this.ui.toast(`Fed ${progress}/${count}`, `mprog-${missionId}`, 0.5));
    bus.on('mission:done', ({ missionId, title, reward }) => {
      this.audio.discovery();
      this.ui.banner('MISSION COMPLETE', title, reward?.text || '');
      if (reward?.faith) this.addFaith(reward.faith);
      if (reward?.chaos) this.playerState.chaos = Math.max(0, this.playerState.chaos + reward.chaos);
      if (reward?.perk) this.flags[`perk.${reward.perk}`] = true;
      if (reward?.follower) this.recruitFollower(this.npcs.byId.get(reward.follower), 'mission');
      if (missionId === 'mission.wedding') this.flags['wine.wedding'] = true;
      if (missionId === 'mission.donkey') {
        const v = this.vehicles.byId.get('vehicle.donkey.farm');
        if (v) v.home = { ...v.def.spot };
      }
      this.playerState.stats.missions = (this.playerState.stats.missions || 0) + 1;
      this.applyPerks();
      this.saveGame();
      if (this.missions.done().length === MISSIONS.length) {
        this.addFaith(20);
        this.ui.banner('CHAPTER III COMPLETE', 'The Ministry', 'Every task in Galilee is done. Faith +20');
      }
    });
    bus.on('follower:wait', () => { const n = this.followerCommandTarget; if (n?.follower) { n.follower.waiting = true; n.follower.wait = { x: n.pos.x, z: n.pos.z }; } });
    bus.on('follower:resume', () => { const n = this.followerCommandTarget; if (n?.follower) { n.follower.waiting = false; n.follower.wait = null; } });
    bus.on('follower:joined', ({ name }) => {
      this.audio.discovery();
      this.ui.toast(`${name} is now following you. (G: wait / follow)`, `follow-${name}`, 2);
    });
    bus.on('miracle:cast', ({ miracleId, healed, npc, injury }) => {
      if (miracleId !== 'miracle.healing-touch' || !healed) return;
      this.playerState.chaos = Math.max(0, this.playerState.chaos - 1);
      const n = this.npcs.byId.get(npc);
      // the long-suffering (bad knees, fevers that aren't the centurion's) follow the one who healed them
      if (n && injury === 'chronic' && !n.def.post) this.recruitFollower(n, 'healed');
    });

    // ---- riding
    bus.on('vehicle:enter', ({ kind, roman, vehicleId }) => {
      const v = this.vehicles.byId.get(vehicleId);
      this.audio.mountCall(kind);
      if (!this.flags['hint.ride']) {
        this.flags['hint.ride'] = true;
        this.ui.toast('W/S set the pace, A/D steer, Shift to gallop, F to get off.', 'hint-ride', 30);
      }
      if (roman) this.ui.toast(kind === 'chariot' ? 'You are borrowing a Roman chariot. Rome calls it stealing.' : 'That is a legion horse. Rome will want it back.', `steal-${vehicleId}`, 8);
      else if (v) this.ui.toast(`You climb onto ${this.vehicles.displayName(v)}.`, 'mounted', 2);
    });
    bus.on('vehicle:exit', ({ reason }) => {
      if (reason === 'pulled') this.ui.toast('A legionary drags you off your ride!', 'pulled', 3);
      this.audio.thud(0.5);
    });
    bus.on('vehicle:step', ({ kind, gallop, wheels }) => this.audio.hoof(kind, gallop, wheels));
    bus.on('vehicle:jump', () => this.audio.jump());
    bus.on('vehicle:land', () => this.audio.land(0.6));
    bus.on('vehicle:refuse', ({ kind }) => {
      this.audio.mountCall(kind === 'cart' ? 'donkey' : kind === 'chariot' ? 'horse' : kind);
      this.ui.toast(this.miracles.isUnlocked('miracle.walk-on-water') ? 'Your ride refuses to go into deep water. (You could walk on it, though.)' : 'Your ride refuses to go into deep water.', 'refuse', 5);
    });
    bus.on('vehicle:hit', ({ speed }) => { if (speed > 3) this.audio.thud(Math.min(1.6, speed / 6)); });
    bus.on('circuit:start', () => this.ui.toast('Lap started! Go once around the spina and back through the white line.', 'lap-start', 10));
    bus.on('circuit:abort', () => this.ui.toast('You left the track. Lap cancelled.', 'lap-abort', 3));
    bus.on('circuit:lap', ({ time, record, laps }) => {
      this.audio.discovery();
      this.ui.banner(record ? 'NEW CIRCUS RECORD' : 'LAP COMPLETE', `${time.toFixed(2)} s`, record ? 'The crowd (two bored legionaries) goes wild.' : `Lap ${laps}. The record stands at ${this.playerState.stats.bestLap.toFixed(2)} s.`);
      if (laps === 1 || record) this.addFaith(record && laps > 1 ? 3 : 5);
      this.saveGame();
    });
    bus.on('vehicle:returned', ({ kind }) => {
      if (this.screen === 'playing' && kind === 'donkey') this.ui.toast('Somewhere, a donkey trots home on its own.', 'returned', 30);
    });
    bus.on('animal:flee', ({ kind, x, z }) => {
      const g = this.audioGain(x, z);
      if (kind === 'goat') this.audio.bleat(g);
      else if (kind === 'bird') this.audio.flutter(g);
      else if (kind === 'camel') this.audio.mountCall('camel', g);
    });
    bus.on('fish:jump', ({ x, z }) => {
      this.effects.ring({ x, y: 0.05, z, color: '#e6f6ff', from: 0.2, to: 1.6, life: 0.8, opacity: 0.6 });
      this.audio.splash(this.audioGain(x, z) * 0.35);
    });
    // mess only counts against Yeshua when it happens around him (not a villager bumping a pot across town)
    const nearPlayer = (x, z) => x === undefined || Math.hypot(x - this.playerState.position.x, z - this.playerState.position.z) < 14;
    bus.on('prop:disturbed', ({ type, x, z }) => {
      if (this.screen !== 'playing' || !nearPlayer(x, z)) return;
      this.playerState.stats.propsDisturbed += 1;
      if (type === 'fruit') this.addChaos(0.2);
      this.audio.thud(type === 'fruit' ? 0.4 : 1);
    });
    bus.on('prop:broken', ({ x, z }) => {
      if (this.screen !== 'playing' || !nearPlayer(x, z)) return;
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
    bus.on('dialogue:effect', ({ npcId, faith, chaos, flag, event, mission, missionTalk, invite }) => {
      if (mission) this.missions.accept(mission);
      if (missionTalk) this.missions.talked(missionTalk);
      if (invite) this.recruitFollower(this.npcs.byId.get(invite), 'invite');
      const first = !flag || !this.flags[flag];
      if (flag) this.flags[flag] = true;
      if (faith && first) this.addFaith(faith);
      if (chaos) this.addChaos(chaos);
      if (event) bus.emit(event, { npcId });
    });
    bus.on('dialogue:end', ({ npc }) => {
      (npc.owner || this.npcs).endTalk(npc);
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

    // ---- the Roman garrison
    bus.on('roman:wanted', ({ stars, before, crime }) => {
      const st = this.playerState;
      st.stats.maxStars = Math.max(st.stats.maxStars || 0, stars);
      this.ui.toast(`${crime}! Roman Attention ${'★'.repeat(stars)}`, `wanted-${stars}`, 1);
      if (before === 0 && !this.flags['hint.wanted']) {
        this.flags['hint.wanted'] = true;
        this.ui.toast('The Romans are after you! Break their line of sight and stay hidden until they give up.', 'hint-wanted', 30);
      }
      this.audio.thud(0.8);
    });
    bus.on('roman:horn', () => this.audio.horn());
    bus.on('roman:reinforcement', ({ active }) => { if (active === 1) this.ui.toast('Reinforcements are coming from the checkpoint!', 'reinforce', 20); });
    bus.on('roman:lost', () => {
      if (this.screen !== 'playing') return;
      this.playerState.stats.escapes = (this.playerState.stats.escapes || 0) + 1;
      this.ui.toast('You lost them. The legion goes back to counting goats.', 'lost', 4);
      this.audio.escaped();
    });
    bus.on('roman:forgiven', ({ stars }) => this.ui.toast(stars > 0 ? `The legionary looks the other way. Roman Attention ${'★'.repeat(stars)}` : 'The legionary looks the other way. You are no longer wanted.', 'forgiven', 3));
    bus.on('roman:warning', () => this.ui.toast('Restricted military area! Leave the compound before the guards act.', 'restricted', 10));
    bus.on('roman:distracted', ({ count }) => this.ui.toast(count > 1 ? 'The soldiers wander off to "inspect" the wine.' : 'A soldier wanders off to "inspect" the wine.', 'distracted', 6));
    bus.on('roman:ragdoll', () => {
      this.playerState.stats.soldiersToppled = (this.playerState.stats.soldiersToppled || 0) + 1;
      this.audio.clank(1);
    });
    bus.on('roman:getup', ({ entityId }) => {
      const s = this.romans.byId.get(entityId);
      if (s) this.audio.clank(this.audioGain(s.pos.x, s.pos.z) * 0.6);
    });
    bus.on('npc:ragdoll', () => this.audio.thud(1.2));
    bus.on('roman:arrest', (e) => this.startArrest(e));

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
    if (this.vehicles.ridden) this.vehicles.dismount(this.player, this.playerState, { force: true, reason: 'reset' });
    this.playerState.reset();
    this.world.resetAllProps();
    this.vehicles.reset();
    this.player.collider.setEnabled(true);
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
    this.romans.reset();
    this.restoreMinistry(data);
    this.ui.hideArrest();
    this.arrest = null;
    this.player.speedScale = 1;
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
    this.ui.setRideHud(null);
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
      followerNames: this.npcs.followers().map((n) => n.name),
      missions: this.missions,
      missionDefs: MISSIONS,
      levels: { ...this.miracles.levels },
      title: faithTitle(this.playerState.stats.faithEarned || this.playerState.faith),
      tier: chaosTier(this.playerState.chaos),
      perks: Object.keys(this.flags).filter((k) => k.startsWith('perk.')),
      markers: this.missionDots(),
      met: this.met.size,
    };
  }

  addFaith(n) {
    this.playerState.faith += n;
    this.playerState.stats.faithEarned = (this.playerState.stats.faithEarned || 0) + n;
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
      next, discovered: this.worldState.discovered.size, total: LANDMARKS.length, followers: this.npcs.followers().length,
    };
  }

  saveGame() {
    const p = this.playerState;
    const ok = this.saves.saveGame({
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw },
      discovered: [...this.worldState.discovered],
      unlockedMiracles: p.unlockedMiracles,
      missions: { 'mission.discover-nazareth': { complete: this.worldState.explorationComplete }, 'mission.explore-galilee': { complete: !!this.worldState.galileeComplete } },
      ministry: this.missions.serialize(),
      followers: this.npcs.followers().map((n) => ({ id: n.id, waiting: !!n.follower.waiting })),
      miracleLevels: { ...this.miracles.levels },
      vehicles: this.vehicles.list.filter((v) => v !== this.vehicles.ridden && Math.hypot(v.pos.x - v.def.spot.x, v.pos.z - v.def.spot.z) > 3).map((v) => ({ id: v.id, x: +v.pos.x.toFixed(2), z: +v.pos.z.toFixed(2), yaw: +v.yaw.toFixed(3) })),
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
      if (!this.vehicles.ridden) this.player.fixedUpdate(dt, intent, this.cam.yaw);
    }
    this.vehicles.fixedUpdate(dt, this.screen === 'playing' && this.vehicles.ridden ? this.intent : null, this.player, this.playerState);
    if (this.screen !== 'menu' || this.npcsInMenu) {
      this.npcs.fixedUpdate(dt, {
        playerPos: this.playerState.position, playerSpeed: this.playerState.speed, playerYaw: this.playerState.yaw, clock: this.clock,
        chaos: this.playerState.chaos, flags: { ...this.flags, ...this.npcs.flags },
      });
    }
    // the garrison freezes while paused / arrested (no free ground gained during a pause)
    if (this.screen === 'playing' || (this.screen === 'menu' && this.npcsInMenu)) {
      const st = this.playerState;
      this.camera.getWorldDirection(this.camDir || (this.camDir = new THREE.Vector3()));
      this.romans.fixedUpdate(dt, {
        playerPos: st.position, playerVel: st.velocity, playerOnWater: !!st.onWater || st.waterDepth > 0.6,
        night: (this.night || 0) > 0.5, cameraDir: this.camDir, cameraPos: this.camera.position,
        playing: this.screen === 'playing', chaos: st.chaos, mount: st.mount || null,
        sightScale: (chaosTier(st.chaos).id === 'notorious' ? 1.2 : 1) * (this.flags['perk.favour'] ? 0.85 : 1),
      });
      this.player.speedScale = this.screen === 'playing' ? 1 - 0.45 * Math.min(1, this.romans.grab * 2) : 1;
      // a legionary with a grip on you pulls you off your ride
      if (this.vehicles.ridden && this.romans.grab > 0.15 && this.screen === 'playing') this.vehicles.dismount(this.player, st, { force: true, reason: 'pulled' });
    }
    if (this.screen === 'playing') this.tickReputation(dt);
    if (this.screen === 'playing') this.miracles.fixedUpdate(dt, { castHeld: (this.testCastHeld || !!this.intent?.castHeld) && !this.dialogue.active });
    this.ragdolls.fixedUpdate(dt);
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
    } else if (this.screen === 'arrested') {
      this.intent = null;
      this.updateArrest(dt, raw);
    } else {
      this.intent = null;
      if (this.screen === 'menu') {
        this.menuTime += animDt;
        this.placeMenuCamera(this.menuTime);
      }
    }
    this.vehicles.update(animDt, alpha, this.camera.position);
    const renderPos = this.syncModel(animDt, alpha);

    this.world.update(animDt, this.reducedMotion ? 0 : elapsed, this.camera.position, this.camera.far);
    this.dialogue.tick(dt);
    this.effects.update(animDt);
    this.npcs.update(animDt, alpha, { cameraPos: this.camera.position, playerPos: renderPos });
    this.romans.update(animDt, alpha, { cameraPos: this.camera.position, playerPos: renderPos, night: (this.night || 0) > 0.5 });
    this.ragdolls.sync();
    const sky = this.dayCycle.apply(this.screen === 'menu' ? 0.18 : this.clock, this.camera.position, this.camera.far);
    this.sunDir = sky.lightDir;
    this.night = sky.night;
    this.updateSun();
    if (this.screen === 'playing' || this.screen === 'map') {
      const canvas = this.renderer.domElement;
      this.ui.updateBubbles(this.allBubbles(), this.camera, canvas.clientWidth, canvas.clientHeight);
    } else this.ui.updateBubbles([], this.camera, 1, 1);
    this.audio.setPursuit(this.screen === 'playing' ? this.romans.attention.stars : 0);
    const p = this.playerState.position;
    const marketD = Math.hypot(p.x - 0, p.z + 27);
    this.audio.update(dt, { marketProximity: Math.max(0, 1 - marketD / 32), playing: this.screen === 'playing', night: this.night });
    this.monitorPerformance(dt);
    this.publishDiagnostics();
  }

  /** Place and animate the Jesus model: on foot, or seated on the current ride. */
  syncModel(animDt, alpha) {
    const renderPos = this.player.interpolate(alpha);
    const st = this.playerState;
    const ride = this.vehicles.ridden;
    if (ride) {
      // sit the rider on the (slope-following) saddle
      const pose = this.vehicles.riderPose(ride);
      const g = this.model.group;
      g.position.set(pose.x, pose.y, pose.z);
      g.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      g.translateX(pose.seat.x);
      g.translateZ(pose.seat.z);
      g.translateY(pose.seat.y - (pose.standing ? 0 : 0.93));
      renderPos.copy(g.position);
    } else {
      this.model.group.position.copy(renderPos);
      this.model.group.rotation.set(0, this.playerState.yaw, 0);
    }
    this.model.update(animDt, {
      speed: st.speed, sprint: st.sprinting, grounded: st.grounded || !!ride, vy: st.velocity.y, aiming: st.aiming && this.screen === 'playing',
      ride: ride ? (ride.model.standing ? 'stand' : ride.kind === 'cart' ? 'sit' : 'straddle') : null,
    });
    return renderPos;
  }

  updatePlaying(dt, alpha, intent) {
    const st = this.playerState;
    st.stats.playTime += dt;
    st.aiming = intent.aim;
    intent.sprinting = st.sprinting;
    const ride = this.vehicles.ridden;
    const renderPos = ride ? this.model.group.position : this.player.interpolate(alpha);
    this.cam.dialogueTarget = this.dialogue.active ? this.dialogue.npc.render : null;
    this.cam.mount = ride ? { yaw: ride.renderYaw, speed: ride.speed, extra: ride.k.cam, lift: ride.model.standing ? 0.4 : 0.15 } : null;
    this.cam.update(dt, intent, renderPos, this.settings, this.physics, ride ? ride.collider : this.player.collider);
    this.ui.setLockHint(!this.input.pointerLocked && !this.hideDebugUi);

    // discovery + interaction
    this.worldState.checkDiscovery(st.id, st.position);
    let talk = this.dialogue.active ? this.dialogue.npc : ride ? null : this.npcs.findTalkTarget(st.position, st.yaw);
    if (!this.dialogue.active) {
      const soldier = ride ? null : this.romans.findTalkTarget(st.position, st.yaw);
      if (soldier && (!talk || Math.hypot(soldier.pos.x - st.position.x, soldier.pos.z - st.position.z) < Math.hypot(talk.pos.x - st.position.x, talk.pos.z - st.position.z))) talk = soldier;
    }
    this.talkTarget = talk;
    this.romans.talkTarget = talk?.soldier ? talk : null;
    const it = talk || ride ? null : this.worldState.nearestInteractable(st.position);
    // riding: F to get on (nearest mount) or off
    const mountTarget = ride || this.dialogue.active || this.arrest ? null : this.vehicles.findMountTarget(st.position);
    this.ui.setRidePrompt(this.dialogue.active ? null : ride ? null : mountTarget ? this.vehicles.promptFor(mountTarget) : null);
    if (intent.vehicle && !this.dialogue.active) {
      if (ride) {
        if (!this.vehicles.dismount(this.player, st)) this.ui.toast('No room to get off here.', 'no-room', 2);
      } else if (mountTarget) {
        if (this.miracles.water) this.miracles.endWaterWalk('mounted');
        if (this.miracles.lift) this.miracles.releaseLift();
        this.ui.hideDialog();
        this.vehicles.mount(mountTarget, this.player, st);
      } else this.ui.toast('Nothing to ride here. Donkeys wait by the workshop, the farm and the camp.', 'no-vehicle', 4);
    }
    this.updateRideHud();
    if (intent.command && !this.dialogue.active) this.toggleFollowers();
    this.missions.update({ x: st.position.x, z: st.position.z, onWater: !!st.onWater, vehicle: st.mount?.id || null });
    this.updateReputation(dt);
    this.updateCenturion();
    this.ui.setPrompt(this.dialogue.active ? null : talk ? `Talk to ${talk.name}` : it ? it.label : null);
    if (intent.interact && !this.dialogue.active && talk) {
      this.ui.hideDialog();
      (talk.owner || this.npcs).beginTalk(talk);
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
    if (intent.cast && !this.dialogue.active && this.vehicles.ridden && selected.id === 'miracle.walk-on-water') {
      this.audio.uiDenied();
      this.ui.toast('Get off your ride first — it refuses to walk on water.', 'ride-water', 3);
    } else if (intent.cast && !this.dialogue.active) {
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
    if (intent.map) this.openMap();

    // objective HUD
    this.updateObjective();

    this.ui.setRegion(this.regionName(st.position.x, st.position.z));
    this.ui.setClock(clockLabel(this.clock), this.dayCycle.nightWeight(this.clock) > 0.5);
    this.ui.setFollowers(st.followers.length);
    const att = this.romans.attention;
    this.ui.setAttention(att.stars, { searching: att.wanted && att.unseen > 0.6, search: att.searchProgress, grab: this.romans.grab });

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      const next = this.worldState.nextLandmark(st.position, this.worldState.explorationComplete ? 2 : 1) || this.worldState.nextLandmark(st.position);
      this.minimap.draw(renderPos, st.yaw, this.cam.yaw, this.worldState.discovered, next?.landmark.id, this.time, [...this.npcs.minimapDots(), ...this.romans.minimapDots((this.night || 0) > 0.5), ...this.vehicles.minimapDots(), ...this.missionDots()]);
      this.minimapTimer = 1 / 30;
    }

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.saveGame();
      this.autosaveTimer = AUTOSAVE_SECONDS;
    }
  }

  // ---------------------------------------------------------------- Phase 6
  /** Missions, followers, Blessings and parked rides from a save (or a clean slate). */
  restoreMinistry(data) {
    this.missions.reset(data?.ministry || null);
    // the Lost Sheep errand predates the mission system: rebuild it from its flags
    const sh = this.missions.state['mission.sheep'];
    if (this.flags['sheep.returned']) Object.assign(sh, { status: 'done', step: 1 });
    else if (this.flags['sheep.asked'] && sh.status === 'available') Object.assign(sh, { status: 'active', step: 0 });
    this.miracles.levels = { ...(data?.miracleLevels || {}) };
    for (const v of data?.vehicles || []) {
      const ride = this.vehicles.byId.get(v.id);
      if (ride) this.vehicles.place(ride, v.x, v.z, v.yaw);
    }
    const donkey = this.vehicles.byId.get('vehicle.donkey.farm');
    if (donkey) donkey.home = { ...donkey.def.spot };
    const dm = this.missions.state['mission.donkey'];
    if (dm.status === 'active' && donkey) {
      donkey.home = { ...LOST_DONKEY };
      if (dm.step === 0) this.vehicles.place(donkey, LOST_DONKEY.x, LOST_DONKEY.z, LOST_DONKEY.yaw);
    }
    if (this.missions.step('mission.caravan')?.kind === 'event') this.giveBread();
    const p = this.playerState.position;
    for (const f of data?.followers || []) {
      const n = this.npcs.byId.get(f.id);
      if (!n || !this.npcs.recruit(n)) continue;
      this.npcs.place(n, p.x - 1.5 - n.follower.slot * 0.4, terrainHeight(p.x, p.z + 2), p.z + 2 + n.follower.slot * 0.6);
      if (f.waiting) { n.follower.waiting = true; n.follower.wait = { x: n.pos.x, z: n.pos.z }; }
    }
    this.playerState.followers = this.npcs.followers().map((n) => n.id);
    this.applyPerks();
    this.lastTier = null;
  }

  /** Mission offers / talk steps added to a conversation, plus the follow invite. */
  dialogueExtras(npc) {
    const options = [];
    const nodes = {};
    for (const e of this.missions.dialogueFor(npc.id, { wanted: this.romans.attention.wanted })) {
      const m = e.mission;
      if (e.type === 'offer') {
        options.push({ label: `★ ${m.title}`, next: `m:${m.id}` });
        nodes[`m:${m.id}`] = {
          text: m.dialog.offer,
          options: [{ label: m.dialog.accept, next: `m:${m.id}:yes`, effect: { mission: m.id } }, { label: m.dialog.decline, end: true }],
        };
        nodes[`m:${m.id}:yes`] = { text: m.dialog.accepted, options: [{ label: 'On my way.', end: true }] };
      } else {
        options.push({ label: `★ ${e.step.option}`, next: `t:${m.id}`, effect: { missionTalk: npc.id } });
        nodes[`t:${m.id}`] = { text: e.step.line, options: [{ label: '(continue)', end: true }] };
      }
    }
    const canInvite = !npc.soldier && !npc.follower && !npc.def.kid && !npc.def.post && this.playerState.faith >= 25 && !npc.def.stall && !['npc.mary', 'npc.joseph'].includes(npc.id);
    if (canInvite) {
      const full = this.npcs.followers().length >= MAX_FOLLOWERS;
      options.push({ label: FOLLOW_INVITE.option, next: full ? 'inv:full' : 'inv:yes', effect: full ? undefined : { invite: npc.id } });
      nodes['inv:yes'] = FOLLOW_INVITE.node;
      nodes['inv:full'] = FOLLOW_INVITE.full;
    }
    if (npc.follower) {
      options.push({ label: npc.follower.waiting ? 'Come with me again.' : 'Wait here for me.', next: 'f:ok', effect: { event: npc.follower.waiting ? 'follower:resume' : 'follower:wait', flag: undefined } });
      nodes['f:ok'] = { text: npc.follower.waiting ? 'Right behind you, Rabbi.' : 'I\'ll be right here.', options: [{ label: 'Good.', end: true }] };
      this.followerCommandTarget = npc;
    }
    return options.length ? { options, nodes } : null;
  }

  recruitFollower(npc, why) {
    if (!npc || npc.follower || npc.soldier) return false;
    if (this.npcs.followers().length >= MAX_FOLLOWERS) {
      this.ui.toast('You already have twelve followers. That seems like plenty.', 'max-followers', 10);
      return false;
    }
    const ok = this.npcs.recruit(npc);
    if (ok) {
      this.playerState.followers = this.npcs.followers().map((n) => n.id);
      this.playerState.stats.followersEver = (this.playerState.stats.followersEver || 0) + 1;
      this.bus.emit('player:follower', { entityId: npc.id, why });
      this.saveGame();
    }
    return ok;
  }

  toggleFollowers() {
    const list = this.npcs.followers();
    if (!list.length) { this.ui.toast('No followers yet. Heal the long-suffering, finish missions, or ask (Faith 25+).', 'no-followers', 6); return; }
    const waiting = !list.some((n) => n.follower.waiting);
    this.npcs.setFollowersWaiting(waiting);
    this.ui.toast(waiting ? 'Your followers wait here. (G to call them)' : 'Your followers come with you.', 'follow-cmd', 0.5);
    this.audio.uiClick();
  }

  /** Bread for the hungry caravan: one loaf next to Hiram (again if it's all gone). */
  giveBread() {
    const h = this.npcs.byId.get('npc.hiram');
    if (!h) return;
    const near = this.world.propSystem.copies.some((c) => { const t = c.body.translation(); return Math.hypot(t.x - h.pos.x, t.z - h.pos.z) < 12; });
    if (near) return;
    const x = h.pos.x - 1.6;
    const z = h.pos.z - 2.2;
    this.world.propSystem.spawnCopy('bread', x, terrainHeight(x, z) + 0.6, z, this.simTime || 0);
  }

  /** Reaching the deep water on the fishing mission: the lake boils with fish. */
  fishMiracle() {
    const p = this.playerState.position;
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      const r = 2 + (i % 3) * 1.6;
      this.effects.ring({ x: p.x + Math.cos(a) * r, y: 0.05, z: p.z + Math.sin(a) * r, color: '#e6f6ff', from: 0.2, to: 1.8, life: 1 + (i % 4) * 0.25, opacity: 0.7 });
    }
    this.effects.burst({ x: p.x, y: 0.2, z: p.z, count: 60, color: '#d4f1ff', color2: '#b8c6cc', speed: 4, up: 2, life: 1.4, gravity: -7, size: 0.3, radius: 3 });
    const w = this.npcs.animals.wildlife;
    if (w) for (const f of w.fish) Object.assign(f, { t: 0, x: p.x + (Math.random() - 0.5) * 8, z: p.z + (Math.random() - 0.5) * 8, dx: Math.random() - 0.5, dz: Math.random() - 0.5, dur: 0.9, h: 1.4, len: 2, yaw: Math.random() * 6 });
    this.audio.splash(0.8);
    this.ui.toast('The water boils with fish! Simon\'s crew is hauling in nets that won\'t stop filling.', 'fish', 8);
  }

  /**
   * The centurion's mission starts at the camp gate: when Yeshua comes close
   * (and isn't wanted), Gaius walks over so they can talk without trespassing.
   */
  updateCenturion() {
    const g = this.romans.byId.get('roman.gaius');
    if (!g) return;
    const gate = this.world.anchors.romanPosts.gateInside;
    const p = this.playerState.position;
    const wants = this.missions.isAvailable('mission.centurion') || this.missions.step('mission.centurion')?.kind === 'talk';
    const near = Math.hypot(p.x - gate.x, p.z - gate.z) < 12 && !this.romans.attention.wanted;
    const was = !!g.summoned;
    g.summoned = wants && near ? { x: gate.x - 1.2, y: gate.y, z: gate.z, yaw: -Math.PI / 2 } : null; // just inside the gate
    if (g.summoned && !was) this.romans.say(g, 'Carpenter! A word — at the gate.', 2.6, 'neutral');
  }

  /** Perks and zone passes that come from flags (missions). */
  applyPerks() {
    zoneAccess.outpost = !!this.flags['pass.outpost'];
  }

  /** Followers bring Faith; Chaos fades over time; tier changes are announced. */
  /** Game-time part (fixed step): followers' Faith trickle and Chaos fading. */
  tickReputation(dt) {
    const st = this.playerState;
    const n = this.npcs.followers().length;
    this.faithTick = (this.faithTick || 0) + dt * n;
    if (this.faithTick >= 90) { this.faithTick -= 90; this.addFaith(1); }
    st.chaos = Math.max(0, st.chaos - dt / 60 * 0.5);
  }

  updateReputation() {
    const st = this.playerState;
    st.followers = this.npcs.followers().map((f) => f.id);
    const tier = chaosTier(st.chaos);
    if (this.lastTier && tier.id !== this.lastTier) this.ui.toast(`Reputation: ${tier.label}. ${tier.note}`, `tier-${tier.id}`, 20);
    this.lastTier = tier.id;
    this.ui.setReputation({ faith: st.faith, chaos: st.chaos, title: faithTitle(st.stats.faithEarned || st.faith), tier });
  }

  buyBlessing(id) {
    const lvl = this.miracles.level(id);
    const cost = BLESSING_COSTS[lvl];
    const st = this.playerState;
    if (cost === undefined || !this.miracles.isUnlocked(id) || st.faith < cost) { this.audio.uiDenied(); return false; }
    st.faith -= cost;
    this.miracles.levels[id] = lvl + 1;
    st.stats.blessings = (st.stats.blessings || 0) + 1;
    this.audio.discovery();
    this.bus.emit('miracle:blessed', { miracleId: id, level: lvl + 1, cost });
    this.saveGame();
    if (this.screen === 'paused') this.ui.openPause(this.pauseContext(), 'miracles');
    return true;
  }

  missionDots() {
    const out = [];
    const t = this.missions.tracked;
    for (const m of this.missions.active()) {
      const at = this.missions.markerOf(m.id);
      if (at) out.push({ x: at.x, z: at.z, kind: 'mission', tracked: m.id === t });
    }
    for (const m of MISSIONS) {
      if (!this.missions.isAvailable(m.id) || m.legacy) continue;
      const at = this.missions.world.npcPos(m.giver);
      if (at) out.push({ x: at.x, z: at.z, kind: 'giver' });
    }
    return out;
  }

  questBubbles() {
    const out = [];
    const cam = this.camera.position;
    const add = (who, text) => {
      if (!who || who.hidden || (who.rig && !who.rig.group.visible)) return;
      const r = who.render || who.pos;
      const d = Math.hypot(r.x - cam.x, r.z - cam.z);
      if (d > 40) return;
      const h = (who.def.look?.scale || 1) * 2.35 + 0.55;
      out.push({ id: `q-${who.id}`, kind: 'quest', text, x: r.x, y: r.y + h, z: r.z, d });
    };
    for (const m of MISSIONS) {
      if (m.legacy) continue;
      const giver = this.npcs.byId.get(m.giver) || this.romans.byId.get(m.giver);
      if (this.missions.isAvailable(m.id) && !(m.requiresCalm && this.romans.attention.wanted)) add(giver, '!');
      const st = this.missions.step(m.id);
      if (st?.kind === 'talk') add(this.npcs.byId.get(st.npc) || this.romans.byId.get(st.npc), '★');
    }
    return out;
  }

  regionName(x, z) {
    const near = (c, r) => Math.hypot(x - c.x, z - c.z) < r;
    const zone = restrictedZoneAt(x, z);
    if (zone === 'checkpoint') return 'Roman Camp (restricted)';
    if (zone === 'outpost') return 'Castra Galilaea (restricted)';
    if (near(ISLE, ISLE.r + 4)) return 'The Lonely Isle';
    if (near(HAMLET, 30)) return "Fishers' Hamlet";
    if (lakeDistance(x, z) < 1.15) return 'Sea of Galilee';
    if (near(CIRCUIT, 34)) return 'The Little Circus';
    if (near(OUTPOST, 40)) return 'Roman Outpost';
    if (near(CHECKPOINT, 36)) return 'Roman Checkpoint';
    if (near(OASIS, 26)) return 'Palm Oasis';
    if (near(CAMP, 28)) return 'Caravan Camp';
    if (near(FARM, 40)) return 'Bar-Tolmai Farm';
    if (near(GOAT_HILL, 30)) return 'Goat Hill';
    if (near({ x: 64, z: 46 }, 22)) return 'Olive Grove';
    if (near({ x: -80, z: -62 }, 24)) return 'Watchtower Ridge';
    const r = regionAt(x, z);
    if (r === 'desert') return 'The Desert';
    if (r === 'countryside') return 'Galilean Countryside';
    if (r === 'outpost') return 'The North Road';
    return Math.hypot(x, z) < 64 ? 'Nazareth' : 'Nazareth Valley';
  }

  updateObjective() {
    const ws = this.worldState;
    const st = this.playerState;
    const tracked = this.missions.tracked;
    if (tracked) {
      const m = MISSIONS.find((x) => x.id === tracked);
      const at = this.missions.markerOf(tracked);
      const dist = at ? ` · <b>${Math.round(Math.hypot(at.x - st.position.x, at.z - st.position.z) / 5) * 5} m</b> ${this.compass(at)}` : '';
      const more = this.missions.active().length > 1 ? ` · +${this.missions.active().length - 1} more` : '';
      this.ui.setObjective(`MISSION · ${m.region.toUpperCase()}`, m.title, `${this.missions.stepText(tracked)}${dist}${more}`);
      return;
    }
    const pipsFor = (list) => `<div class="obj-pips">${list.map((l) => `<i class="${ws.discovered.has(l.id) ? 'on' : ''}"></i>`).join('')}</div>`;
    const n1 = ws.chapterCount(1);
    const n2 = ws.chapterCount(2);
    if (!ws.explorationComplete) {
      const next = ws.nextLandmark(st.position, 1);
      const dist = Math.round(next.distance / 5) * 5;
      const extra = n2 ? ` · Galilee ${n2}/${CHAPTER_TWO.length}` : '';
      this.ui.setObjective('CURRENT MISSION', 'Discover Nazareth', `${n1}/${CHAPTER_ONE.length} landmarks · nearest unknown pin <b>${dist} m</b> away${extra}${pipsFor(CHAPTER_ONE)}`);
    } else if (!ws.galileeComplete) {
      const next = ws.nextLandmark(st.position, 2);
      const dist = Math.round(next.distance / 10) * 10;
      this.ui.setObjective('CHAPTER II', 'Explore Galilee', `${n2}/${CHAPTER_TWO.length} places · nearest: <b>${dist} m</b> ${this.compass(next.landmark)}${pipsFor(CHAPTER_TWO)}`);
    } else {
      const best = st.stats.bestLap ? ` · best lap ${st.stats.bestLap.toFixed(2)} s` : '';
      this.ui.setObjective('CHAPTER II COMPLETE', 'Galilee Explored', `All ${LANDMARKS.length} places found${best}. More stories come with the next chapter.${pipsFor(CHAPTER_TWO)}`);
    }
  }

  compass(l) {
    const p = this.playerState.position;
    const a = Math.atan2(l.x - p.x, -(l.z - p.z)); // 0 = north
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8];
  }

  updateRideHud() {
    const v = this.vehicles.ridden;
    if (!v) {
      this.ui.setRideHud(null);
      return;
    }
    const sp = v.speed;
    const gait = sp < -0.2 ? 'Backing up' : sp < 0.3 ? 'Standing' : sp < v.k.trot * 0.55 ? 'Walk' : sp <= v.k.trot + 0.6 ? (v.k.wheels ? 'Rolling' : 'Trot') : 'Gallop';
    const lap = this.vehicles.lap.active ? { time: this.vehicles.lapTime, best: this.playerState.stats.bestLap || 0 } : null;
    this.ui.setRideHud({ name: v.name, kindLabel: v.k.label, stolen: v.roman, gait, fill: Math.min(1, Math.abs(sp) / v.k.gallop), lap });
  }

  allBubbles() {
    const list = [...this.npcs.bubbles(this.talkTarget), ...this.romans.bubbles(), ...this.questBubbles()];
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, 6);
  }

  // ---------------------------------------------------------------- arrest
  startArrest({ stars, peak }) {
    if (this.screen !== 'playing' || this.arrest) return;
    if (this.dialogue.active) this.dialogue.close();
    if (this.miracles.water) this.miracles.endWaterWalk('arrested');
    if (this.miracles.lift) this.miracles.releaseLift();
    if (this.vehicles.ridden) this.vehicles.dismount(this.player, this.playerState, { force: true, reason: 'arrested' });
    this.ui.setRideHud(null);
    this.ui.setRidePrompt(null);
    this.screen = 'arrested';
    this.input.releaseAll();
    const st = this.playerState;
    const level = Math.max(stars || 0, peak || 0, 1);
    const fine = Math.min(Math.floor(st.faith), Math.ceil((2 + level * 2) * (this.flags['perk.favour'] ? 0.5 : 1)));
    this.arrest = { t: 0, fine, level };
    const lines = [
      'Jesus spent the night at the Roman checkpoint, explaining very patiently that he is a carpenter.',
      'The centurion filled in four scrolls of paperwork about "the glowing one" and let him go at dawn.',
      'Detained for disturbing the peace of Rome. Released for being far too polite to keep.',
      'The legionaries confiscated nothing, because he owns nothing. Released with a stern warning.',
    ];
    this.ui.showArrest({
      line: lines[(st.stats.arrests || 0) % lines.length],
      facts: [
        `Roman Attention at arrest: ${'★'.repeat(level)}`,
        fine > 0 ? `Fined by the tax collector: −${fine} Faith` : 'Fine waived (you have no Faith to give… yet)',
        'Released at the Roman checkpoint, a few hours later',
      ],
    });
    this.audio.arrest();
    this.audio.setPursuit(0);
    this.bus.emit('player:arrested', { entityId: st.id, stars: level, fine });
  }

  updateArrest(dt, raw) {
    const a = this.arrest;
    if (!a) return;
    a.t += dt;
    if (a.t > 1.2 && (raw.interact || raw.jump || a.t > 12)) this.finishArrest();
  }

  finishArrest() {
    const a = this.arrest;
    const st = this.playerState;
    st.faith = Math.max(0, st.faith - a.fine);
    st.chaos *= 0.75;
    st.stats.arrests = (st.stats.arrests || 0) + 1;
    this.flags['roman.arrested'] = true;
    this.clock = (this.clock + 3 / 24) % 1;
    this.romans.resetDuty(true);
    this.romans.syncState();
    const r = CHECKPOINT.release;
    this.player.teleport(r.x, terrainHeight(r.x, r.z), r.z, r.yaw);
    this.cam.snap(this.playerState.position, r.yaw + Math.PI);
    this.cam.pitch = 0.28;
    this.player.speedScale = 1;
    this.ui.hideArrest();
    this.arrest = null;
    this.screen = 'playing';
    this.input.releaseAll();
    this.input.requestLock();
    this.ui.toast('Released at the Roman checkpoint. Nazareth is back down the road to the south.', 'released', 8);
    this.saveGame();
    this.bus.emit('player:released', { entityId: st.id });
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
      'roman-patrol': () => {
        states['active-play']();
        this.simulate(2);
        // the north patrol pair on the square, watching Jesus walk by
        const pair = [['roman.brutus', 3.2, 4.6], ['roman.sextus', 4.6, 6.2]];
        const px = -3.6;
        const pz = 11.5;
        for (const [id, x, z] of pair) {
          const s = this.romans.byId.get(id);
          const yaw = Math.atan2(px - x, pz - z) - 0.25;
          this.romans.place(s, x, terrainHeight(x, z), z);
          s.post = { x, z, y: terrainHeight(x, z), yaw };
          s.yaw = yaw;
          this.romans.setMode(s, 'duty', { force: true });
        }
        this.player.teleport(px, 0, pz, 2.3);
        const b = this.romans.byId.get('roman.brutus');
        const look = Math.atan2(b.pos.x + 0.7 - px, b.pos.z + 0.8 - pz);
        this.cam.snap(this.playerState.position, look + Math.PI + 0.3);
        this.cam.pitch = 0.16;
        this.cam.targetDistance = 5;
        this.cam.currentDistance = 5;
      },
      'roman-checkpoint': () => {
        states['active-play']();
        this.simulate(1);
        this.player.teleport(-6.5, 0, -88, Math.PI - 0.4);
        this.cam.snap(this.playerState.position, -0.55);
        this.cam.pitch = 0.16;
        this.cam.targetDistance = 7;
        this.cam.currentDistance = 7;
      },
      'roman-pursuit': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.simulate(1);
        // three stars on the square: legionaries closing in from the market side
        this.player.teleport(-1.5, 0, 8.5, Math.PI - 0.3);
        this.romans.markSeen(this.playerState.position);
        this.romans.attention.heat = 3.2;
        this.romans.syncState();
        const ids = ['roman.brutus', 'roman.sextus', 'roman.flavius', 'roman.quintus'];
        const spots = [[-9, -4], [-5.5, -7], [5, -6], [8.5, -2]];
        ids.forEach((id, i) => { const s = this.romans.byId.get(id); this.romans.place(s, spots[i][0], terrainHeight(spots[i][0], spots[i][1]), spots[i][1]); this.romans.setMode(s, 'pursue', { force: true }); });
        this.simulate(0.7);
        this.cam.snap(this.playerState.position, 0.25);
        this.cam.pitch = 0.22;
        this.cam.targetDistance = 6.5;
        this.cam.currentDistance = 6.5;
      },
      'roman-ragdoll': () => {
        states['active-play']();
        this.unlockAllForTest();
        this.simulate(1);
        const s = this.romans.byId.get('roman.flavius');
        this.romans.place(s, 3, terrainHeight(3, 8.6), 8.6);
        this.romans.setMode(s, 'duty', { force: true });
        s.yaw = 0;
        this.player.teleport(3, 0, 11, Math.PI);
        this.cam.snap(this.playerState.position, 0);
        this.camera.position.set(3, 3, 15);
        this.camera.lookAt(3, 1.5, 8);
        this.castForTest(0, 0.3);
        this.cam.snap(this.playerState.position, 0.95);
        this.cam.pitch = 0.16;
        this.cam.targetDistance = 6;
        this.cam.currentDistance = 6;
      },
      'roman-arrest': () => {
        states['active-play']();
        this.playerState.faith = 12;
        this.romans.attention.heat = 2.4;
        this.startArrest({ stars: 2, peak: 2 });
      },
      // ---- Phase 5: the open world and riding
      'ride-donkey': () => {
        states['active-play']();
        this.romans.setActive(false);
        this.mountForTest('vehicle.donkey.joseph');
        this.driveForTest([[-8, 3], [-2, 6]], 1.6, false);
        const v = this.vehicles.ridden;
        this.cam.snap(this.model.group.position, v.yaw + Math.PI - 0.35);
        this.cam.pitch = 0.2;
        this.cam.targetDistance = 5;
        this.cam.currentDistance = 7;
        this.romans.setActive(true);
      },
      'ride-chariot': () => {
        states['active-play']();
        this.romans.setActive(false);
        this.mountForTest('vehicle.chariot.1');
        const v = this.vehicles.ridden;
        this.vehicles.place(v, CIRCUIT.x + 14, CIRCUIT.z + 9.6, -Math.PI / 2);
        this.driveForTest([[CIRCUIT.x - 2, CIRCUIT.z + 9.8], [CIRCUIT.x - 14, CIRCUIT.z + 9.5]], 1.8, true);
        this.cam.snap(this.model.group.position, v.yaw + Math.PI + 0.45);
        this.cam.pitch = 0.18;
        this.cam.targetDistance = 5;
        this.cam.currentDistance = 8;
        this.romans.setActive(true);
      },
      'region-farm': () => {
        states['active-play']();
        this.player.teleport(FARM.x + 6, 0, FARM.z - 22, 0.2);
        this.simulate(0.5);
        this.cam.snap(this.playerState.position, Math.PI + 0.25);
        this.cam.pitch = 0.32;
        this.cam.targetDistance = 9;
        this.cam.currentDistance = 9;
      },
      'region-lake': () => {
        states['active-play']();
        // on the hamlet beach, looking down the jetty to the open lake
        this.player.teleport(HAMLET.jettyX - 4.5, 0, -99, 0.25);
        this.simulate(2.5);
        this.cam.snap(this.playerState.position, Math.PI + 0.25);
        this.cam.pitch = 0.26;
        this.cam.targetDistance = 8;
        this.cam.currentDistance = 8;
      },
      'region-outpost': () => {
        states['active-play']();
        this.player.teleport(4, 0, -170, Math.PI / 2 - 0.3);
        this.simulate(0.5);
        this.cam.snap(this.playerState.position, -Math.PI / 2 - 0.35);
        this.cam.pitch = 0.3;
        this.cam.targetDistance = 9;
        this.cam.currentDistance = 9;
      },
      'region-desert': () => {
        states['active-play']();
        this.clock = 0.3;
        this.player.teleport(OASIS.x - 14, 0, OASIS.z - 12, 0.9);
        this.simulate(1);
        this.cam.snap(this.playerState.position, Math.PI + 0.6);
        this.cam.pitch = 0.22;
        this.cam.targetDistance = 8;
        this.cam.currentDistance = 8;
      },
      // ---- Phase 6: missions, followers, Blessings
      'mission-wedding': () => {
        states['active-play']();
        this.romans.setActive(false);
        this.unlockAllForTest();
        this.missions.accept('mission.wedding');
        this.player.teleport(18.5, 0, 4.2, -0.75);
        this.simulate(1);
        this.cam.snap(this.playerState.position, -0.75 + Math.PI + 0.2);
        this.cam.pitch = 0.22;
        this.cam.targetDistance = 6;
        this.cam.currentDistance = 6;
        this.romans.setActive(true);
      },
      followers: () => {
        states['active-play']();
        this.romans.setActive(false);
        this.playerState.faith = 30;
        for (const id of ['npc.benjamin', 'npc.villager.2', 'npc.villager.5', 'npc.simon', 'npc.villager.8']) this.recruitFollower(this.npcs.byId.get(id), 'test');
        this.player.teleport(-2, 0, 30, Math.PI * 0.95);
        this.simulate(1.5);
        this.intent = { moveX: 0, moveY: 1, sprint: false, jump: false, lookX: 0, lookY: 0, zoom: 0 };
        this.cam.yaw = this.playerState.yaw + Math.PI;
        for (let i = 0; i < 150; i += 1) this.fixedUpdate(1 / 60);
        this.intent = this.input.read();
        this.simulate(0.6);
        this.cam.snap(this.playerState.position, this.playerState.yaw + 0.5);
        this.cam.pitch = 0.3;
        this.cam.targetDistance = 7.5;
        this.cam.currentDistance = 7.5;
        this.romans.setActive(true);
      },
      journal: () => {
        states['active-play']();
        this.missions.accept('mission.wedding');
        this.missions.accept('mission.fishers');
        this.missions.advance('mission.wedding');
        this.missions.state['mission.caravan'].status = 'done';
        this.recruitFollower(this.npcs.byId.get('npc.benjamin'), 'test');
        this.screen = 'playing';
        this.pause();
        this.ui.openPause(this.pauseContext(), 'missions');
        this.ui.$scrollPause?.();
      },
      blessings: () => {
        states['active-play']();
        this.unlockAllForTest();
        this.playerState.faith = 52;
        this.miracles.levels = { 'miracle.divine-push': 2, 'miracle.healing-touch': 1 };
        this.screen = 'playing';
        this.pause();
        this.ui.openPause(this.pauseContext(), 'miracles');
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
        // overlays (pause, map, arrest) sit on top of a settled gameplay camera, as they do in play
        if (['paused', 'map', 'arrested'].includes(this.screen)) {
          const pos = this.player.interpolate(1);
          for (let i = 0; i < 30; i += 1) this.cam.update(1 / 60, { lookX: 0, lookY: 0, zoom: 0, aim: false }, pos, this.settings, this.physics, this.player.collider);
          this.vehicles.update(0, 1, this.camera.position);
        }
        for (let i = 0; i < 20; i += 1) this.fixedUpdate(1 / 60);
        if (this.screen === 'playing') {
          for (let i = 0; i < 20; i += 1) this.vehicles.update(1 / 60, 1, this.camera.position);
          const pos = this.syncModel(0, 1).clone();
          const ride = this.vehicles.ridden;
          this.cam.mount = ride ? { yaw: ride.renderYaw, speed: ride.speed, extra: ride.k.cam, lift: ride.model.standing ? 0.4 : 0.15 } : null;
          if (!this.keepTestCamera) for (let i = 0; i < 30; i += 1) this.cam.update(1 / 60, { lookX: 0, lookY: 0, zoom: 0, aim: false }, pos, this.settings, this.physics, ride ? ride.collider : this.player.collider);
          // let the animation rig settle into its pose (idle, or riding); rides culled from the final camera
          for (let i = 0; i < 5; i += 1) this.vehicles.update(1 / 60, 1, this.camera.position);
          for (let i = 0; i < 60; i += 1) this.syncModel(1 / 60, 1);
          this.updatePlaying(0, 1, this.input.read());
        }
        for (let i = 0; i < 30; i += 1) {
          const ctx = { cameraPos: this.camera.position, playerPos: this.playerState.position, night: (this.night || 0) > 0.5 };
          this.npcs.update(1 / 60, 1, ctx);
          this.romans.update(1 / 60, 1, ctx);
        }
        this.ragdolls.sync();
        this.vehicles.update(0, 1, this.camera.position);
        this.world.update(0, this.simTime || 0, this.camera.position, this.camera.far);
        const sky = this.dayCycle.apply(this.screen === 'menu' ? 0.18 : this.clock, this.camera.position, this.camera.far);
        this.sunDir = sky.lightDir;
        this.night = sky.night;
        this.updateSun();
        if (this.screen === 'playing' || this.screen === 'map') {
          const c = this.renderer.domElement;
          this.ui.updateBubbles(this.allBubbles(), this.camera, c.clientWidth, c.clientHeight);
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

  mountForTest(id) {
    const v = this.vehicles.byId.get(id);
    if (this.vehicles.ridden) this.vehicles.dismount(this.player, this.playerState, { force: true });
    this.player.teleport(v.pos.x + Math.cos(v.yaw) * 1.6, v.pos.y, v.pos.z - Math.sin(v.yaw) * 1.6, v.yaw);
    this.vehicles.mount(v, this.player, this.playerState);
    return v.id;
  }

  /**
   * Test autopilot: steer the current ride through waypoints with synthetic
   * W/A/D(/Shift) intents for `seconds` of simulated time.
   */
  driveForTest(points, seconds, sprint = false) {
    const v = this.vehicles.ridden;
    if (!v) return null;
    let i = 0;
    const steps = Math.round(seconds * 60);
    for (let k = 0; k < steps; k += 1) {
      const [tx, tz] = points[Math.min(i, points.length - 1)];
      if (Math.hypot(tx - v.pos.x, tz - v.pos.z) < 4 && i < points.length - 1) i += 1;
      const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
      let d = want - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.intent = { moveX: Math.max(-1, Math.min(1, -d * 3)), moveY: 1, sprint, jump: false, lookX: 0, lookY: 0, zoom: 0 };
      this.fixedUpdate(1 / 60);
    }
    this.intent = this.input.read();
    for (let k = 0; k < 10; k += 1) this.vehicles.update(1 / 60, 1, this.camera.position);
    this.syncModel(1 / 60, 1);
    return { x: v.pos.x, z: v.pos.z, speed: v.speed, lap: { ...this.vehicles.lap, quads: this.vehicles.lap.quads.size } };
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
    const ctx = { cameraPos: this.camera.position, playerPos: this.playerState.position, night: (this.night || 0) > 0.5 };
    this.npcs.update(1 / 60, 1, ctx);
    this.romans.update(1 / 60, 1, ctx);
    this.vehicles.update(1 / 60, 1, this.camera.position);
    this.ragdolls.sync();
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
      romans: this.romans?.stats(),
      vehicles: this.vehicles?.stats(),
      wildlife: this.npcs?.animals?.wildlife ? {
        ...this.npcs.animals.wildlife.stats(),
        goats: this.npcs.animals.list.filter((a) => a.kind === 'goat').map((a) => [Math.round(a.x * 10) / 10, Math.round(a.z * 10) / 10, a.flee > 0]),
        camels: this.npcs.animals.list.filter((a) => a.kind === 'camel').map((a) => [Math.round(a.x * 10) / 10, Math.round(a.z * 10) / 10, !!a.resting]),
      } : null,
      mode: this.playerState?.mode,
      region: this.playerState ? this.regionName(this.playerState.position.x, this.playerState.position.z) : null,
      missions: this.missions?.stats(),
      followers: this.npcs ? this.npcs.followers().map((n) => ({ id: n.id, waiting: n.follower.waiting, d: +n.distP.toFixed(1) })) : [],
      levels: this.miracles ? { ...this.miracles.levels } : {},
      reputation: this.playerState ? { faith: this.playerState.faith, chaos: +this.playerState.chaos.toFixed(2), tier: chaosTier(this.playerState.chaos).id, title: faithTitle(this.playerState.stats.faithEarned || this.playerState.faith) } : null,
      perks: Object.keys(this.flags || {}).filter((k) => k.startsWith('perk.') || k.startsWith('pass.')),
      chapters: this.worldState ? { one: this.worldState.chapterCount(1), two: this.worldState.chapterCount(2), complete1: this.worldState.explorationComplete, complete2: !!this.worldState.galileeComplete } : null,
      ragdolls: this.ragdolls?.stats(),
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
