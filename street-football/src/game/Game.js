import * as THREE from 'three';
import { BALL, CAMERA, COURT, MATCH, QUALITY, TEAMS } from '../config.js';
import { Events } from '../core/Events.js';
import { Input } from '../core/Input.js';
import { Loop } from '../core/Loop.js';
import { createRenderer, resizeRenderer } from '../core/Renderer.js';
import { createRng } from '../core/rng.js';
import { Ball } from '../entities/Ball.js';
import { Footballer } from '../entities/Footballer.js';
import { KeeperAI } from '../entities/KeeperAI.js';
import { PlayerController } from '../entities/PlayerController.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Vfx } from '../systems/Vfx.js';
import { Hud } from '../ui/Hud.js';
import { Menus } from '../ui/Menus.js';
import { buildCourt } from '../world/Court.js';
import { Crowd } from '../world/Crowd.js';
import { buildEnvironment } from '../world/Environment.js';
import { buildNeighborhood } from '../world/Neighborhood.js';

const PLAYER_LOOK = {
  name: 'ZÉ',
  number: 10,
  team: TEAMS.home,
  teamId: 'home',
  skin: '#7a4a2a',
  hair: 'twists',
  hairColor: '#17100b',
  headband: '#1f8a4c',
  height: 1.76,
};

const KEEPER_LOOK = {
  name: 'BETO',
  number: 1,
  team: { ...TEAMS.away, jersey: '#00a88f', jersey2: '#141414', shorts: '#141414', socks: '#00a88f', sockStripe: '#141414', pattern: 1 },
  teamId: 'away',
  skin: '#d9a066',
  hair: 'buzz',
  hairColor: '#2a1a10',
  shoes: '#141414',
  height: 1.86,
};

const SETTINGS_KEY = 'settings';
const BEST_KEY = 'best';
const NEUTRAL_INTENTS = Object.freeze({
  moveX: 0, moveY: 0, sprint: false, shootHeld: false, shootPressed: false, shootReleased: false,
  passPressed: false, skillPressed: false, switchPressed: false, tacklePressed: false, pausePressed: false, anyPressed: false,
});

export class Game {
  constructor({ canvas, physics, lib, platform, storage }) {
    this.canvas = canvas;
    this.physics = physics;
    this.lib = lib;
    this.platform = platform;
    this.storage = storage;
    this.settings = { quality: 'medium', difficulty: 'normal', shake: true, ...this.loadJson(SETTINGS_KEY) };
    if (!QUALITY[this.settings.quality]) this.settings.quality = 'medium';
    this.quality = QUALITY[this.settings.quality];

    this.renderer = createRenderer(canvas, this.quality);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.1, 900);
    this.rng = createRng(20260611);
    this.events = new Events();
    this.frame = 0;
    this.time = 0;
    this.timeScale = 1;
    this.slowMo = 0;
    this.paused = false;
    this.pausedForScreenshot = false;
    this.reducedMotion = false;
    this.phase = 'menu';
    this.phaseTime = 0;
    this.score = { home: 0, away: 0 };
    this.timeLeft = MATCH.duration;
    this.style = 0;
    this.stats = this.freshStats();
    this.flight = this.freshFlight();
    this.stuckTime = 0;
    this.countdownStep = -1;

    // World.
    this.env = buildEnvironment(this.scene, this.renderer, this.quality);
    this.court = buildCourt(this.scene, physics, this.rng);
    this.hood = buildNeighborhood(this.scene, this.rng, this.settings.quality);
    this.crowd = new Crowd(this.scene, lib, this.rng, this.quality.crowd);

    // Actors.
    this.ball = new Ball(physics, this.scene, this.rng);
    this.player = new Footballer({ lib, physics, scene: this.scene, look: PLAYER_LOOK, tag: 'player' });
    this.controller = new PlayerController(this.player, this.ball, this.events, this.rng);
    this.keeper = new Footballer({ lib, physics, scene: this.scene, look: KEEPER_LOOK, tag: 'keeper' });
    this.keeperAI = new KeeperAI(this.keeper, this.ball, this.events, this.rng, -1);
    this.keeperAI.difficulty = this.settings.difficulty;
    this.player.anim.onFootstep = (speed) => {
      this.audio.play('step', { volume: 0.12 + speed * 0.025, at: this.player.holder.position, cooldown: 0.12, variance: 0.15 });
    };

    // Systems.
    this.cameraRig = new CameraRig(this.camera);
    this.cameraRig.shakeEnabled = this.settings.shake;
    this.vfx = new Vfx(this.scene, this.rng);
    this.audio = new AudioSystem(this.rng, storage);
    this.audio.setCamera(this.camera);
    this.hud = new Hud();
    this.hud.setPlayer(PLAYER_LOOK);
    this.input = new Input(canvas, document.getElementById('touch-controls'));
    this.menus = new Menus(
      {
        play: () => this.startMatch(),
        resume: () => this.resume(),
        restart: () => this.restartFromMenu(),
        quit: () => this.quitToMenu(),
        setMuted: (m) => this.setMuted(m),
        setSetting: (k, v) => this.setSetting(k, v),
      },
      this.audio,
      this.settings,
    );
    this.wireFeedback();
    this.wireDom();

    physics.preStep.push((dt) => this.fixedUpdate(dt));
    physics.postStep.push((dt) => this.postFixed(dt));
    physics.onContact((a, b) => this.onContact(a, b));

    this.resetPositions();
    this.enterMenu();
    resizeRenderer(this.renderer, this.camera, this.quality.dpr);
    this.cameraRig.snap(this.player, this.ball);
    this.installTestHooks();
    this.loop = new Loop((dt) => this.update(dt), () => this.render());
  }

  // ---------------------------------------------------------------- setup

  loadJson(key) {
    try {
      return JSON.parse(this.storage.get(key) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }

  freshStats() {
    return { shots: 0, onTarget: 0, saves: 0, goals: 0, bestCombo: 0 };
  }

  freshFlight() {
    return { kickTime: -1, power: 0, post: false, bank: false, firstTime: false, nearMissed: false, type: null };
  }

  wireDom() {
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.classList.toggle('muted', this.audio.settings.muted);
    muteBtn.addEventListener('click', () => this.setMuted(!this.audio.settings.muted));
    document.getElementById('pause-btn').addEventListener('click', () => this.pause());

    // First gesture unlocks audio (autoplay policy).
    const unlock = () => this.audio.unlock().catch(() => {});
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.touchUi = touch;
    window.addEventListener('touchstart', () => {
      this.touchUi = true;
      this.syncTouchUi();
    }, { once: true, passive: true });

    // Focus loss pauses play.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('blur', () => this.pause());

    // WebGL context loss: stop, show overlay; three.js restores GPU state on restore.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.loop.stop();
      this.menus.showOnly('context-lost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.menus.hideAll();
      if (this.phase === 'menu') this.menus.showMain(this.best());
      else this.pause(true);
      this.loop.start();
    });

    this.platform.onMuteChange = (muted) => this.audio.setExternalMute(muted);
    this.platform.onAdPause = (active) => {
      this.adActive = active;
      this.audio.setExternalMute(active || this.platform.platformMuted);
    };
    this.audio.setExternalMute(this.platform.platformMuted);
  }

  syncTouchUi() {
    const show = this.touchUi && ['countdown', 'playing', 'kickoff', 'goal'].includes(this.phase) && !this.paused;
    document.getElementById('touch-controls').classList.toggle('hidden', !show);
    document.getElementById('stamina').classList.toggle('hidden', false);
  }

  setMuted(muted) {
    this.audio.setMuted(muted);
    document.getElementById('mute-btn').classList.toggle('muted', muted);
    this.menus.setMuteChecked(muted);
  }

  setSetting(key, value) {
    this.settings[key] = value;
    this.storage.set(SETTINGS_KEY, JSON.stringify(this.settings));
    if (key === 'difficulty') this.keeperAI.difficulty = value;
    if (key === 'shake') this.cameraRig.shakeEnabled = value;
    if (key === 'quality') {
      this.quality = QUALITY[value];
      const sun = this.env.sun;
      sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.castShadow = this.quality.shadows;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.dpr));
      resizeRenderer(this.renderer, this.camera, this.quality.dpr);
      this.menus.note('Resolution and shadows updated. Crowd size and antialiasing apply after reloading the game.');
    }
  }

  start() {
    this.loop.start();
  }

  best() {
    const b = this.loadJson(BEST_KEY);
    return b.goals != null ? b : null;
  }

  // ------------------------------------------------------------- phases

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    this.syncTouchUi();
  }

  enterMenu() {
    this.setPhase('menu');
    this.paused = false;
    this.hud.show(false);
    this.cameraRig.setMode('menu');
    this.menus.showMain(this.best());
    this.platform.gameplayStop();
    this.input.enabled = false;
  }

  resetPositions() {
    this.ball.placeAt(0, BALL.radius + 0.002, 0);
    // Ball at the feet, attacking toward -X.
    this.player.teleport(0.55, 0, -Math.PI / 2);
    this.controller.reset();
    this.keeperAI.reset();
    this.flight = this.freshFlight();
    this.player.anim.stopAll();
  }

  startMatch() {
    this.audio.unlock().catch(() => {});
    this.score = { home: 0, away: 0 };
    this.timeLeft = MATCH.duration;
    this.style = 0;
    this.stats = this.freshStats();
    this.resetPositions();
    this.menus.hideAll();
    this.hud.reset();
    this.hud.show(true);
    this.cameraRig.setMode('play');
    this.cameraRig.snap(this.player, this.ball);
    this.paused = false;
    this.countdownStep = -1;
    this.setPhase('countdown');
    this.input.enabled = false;
    this.platform.gameplayStart();
  }

  async restartFromMenu() {
    // Natural break between matches: the place for a midgame ad.
    if (this.phase === 'fulltime') {
      this.loop.stop();
      await this.platform.requestMidgameAd();
      this.loop.start();
    }
    this.startMatch();
  }

  quitToMenu() {
    this.paused = false;
    this.audio.resume();
    this.resetPositions();
    this.enterMenu();
  }

  pause(force = false) {
    if (this.paused || this.contextLost) return;
    if (!force && !['countdown', 'playing', 'kickoff', 'goal'].includes(this.phase)) return;
    this.paused = true;
    this.input.releaseAll();
    this.menus.open('pause');
    this.audio.pause();
    this.platform.gameplayStop();
    this.syncTouchUi();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.menus.hideAll();
    this.audio.resume();
    this.platform.gameplayStart();
    this.syncTouchUi();
  }

  // ------------------------------------------------------------- feedback

  wireFeedback() {
    const ev = this.events;
    ev.on('touch', ({ player, strength }) => {
      this.audio.play('touch', { volume: 0.35 + strength * 0.04, at: player.holder.position, cooldown: 0.05 });
    });
    ev.on('control', ({ relSpeed }) => {
      this.audio.play('touch', { volume: 0.5 + relSpeed * 0.05, at: this.ball.mesh.position });
      this.flight.controlTime = this.time;
    });
    ev.on('chargeStart', () => this.audio.play('charge', { volume: 0.12, variance: 0 }));
    ev.on('kick', ({ type, power, speed }) => {
      const at = this.ball.mesh.position;
      const firstTime = this.flight.controlTime != null && this.time - this.flight.controlTime < 0.55;
      this.flight = { ...this.freshFlight(), kickTime: this.time, power, type, firstTime, scorerX: this.player.position.x };
      if (type === 'shot') {
        this.stats.shots += 1;
        this.audio.play(power > 0.6 ? 'kickHard' : 'kickSoft', { volume: 0.7 + power * 0.5, at });
        this.cameraRig.addTrauma(0.12 + power * 0.28);
        this.cameraRig.punchFov(1.5 + power * 4);
        this.vfx.dust(this.player.footPoint(new THREE.Vector3(), 0.5), 0.6 + power);
        if (power > 0.85) this.hitstop(0.06);
      } else {
        this.audio.play('kickSoft', { volume: 0.55, at, rate: 1.15 });
        this.vfx.dust(at, 0.4);
      }
      this.shotTracking = type === 'shot' ? 1.6 : 0;
    });
    ev.on('whiff', () => this.hud.toast('Missed the ball — get closer before you strike', 1.5));
    ev.on('possessionLost', () => {
      if (this.phase === 'playing' && this.player.speed > 5) this.hud.toast('Heavy touch!', 1);
    });
    ev.on('save', ({ keeper, type }) => {
      if (type === 'claim') return;
      this.stats.saves += 1;
      this.stats.onTarget += 1;
      this.audio.play('ooh', { group: 'crowd', volume: 0.9 });
      this.audio.play(type === 'catch' ? 'touch' : 'kickSoft', { volume: 0.9, at: this.ball.mesh.position });
      this.crowd.react(0.55);
      this.cameraRig.addTrauma(0.2);
      this.hud.popup(type === 'catch' ? 'SAVED!' : 'PARRIED!', new THREE.Vector3(keeper.position.x, 2.4, keeper.position.z), this.camera, { big: true });
    });
    ev.on('keeperDive', () => this.audio.play('step', { volume: 0.5, rate: 0.7 }));
    ev.on('keeperThrow', () => this.audio.play('kickSoft', { volume: 0.35, rate: 1.3 }));
  }

  onContact(a, b) {
    const other = a?.type === 'ball' ? b : b?.type === 'ball' ? a : null;
    if (!other) return;
    const v = this.ball.velocity;
    const speed = v.length();
    const at = this.ball.position;
    if (speed < 1.2 && other.type !== 'player') return;
    const vol = Math.min(1, speed / 18);
    switch (other.type) {
      case 'ground':
        if (Math.abs(v.y) > 1.2) this.audio.play('bounce', { volume: 0.25 + vol * 0.6, at, cooldown: 0.06 });
        break;
      case 'board':
        this.audio.play('board', { volume: 0.3 + vol * 0.8, at });
        if (this.flight.kickTime > 0) this.flight.bank = true;
        if (speed > 9) this.cameraRig.addTrauma(0.08);
        break;
      case 'fence':
        this.audio.play('fence', { volume: 0.25 + vol * 0.85, at, cooldown: 0.08 });
        if (this.flight.kickTime > 0) this.flight.bank = true;
        if (speed > 10) {
          this.vfx.sparks(at, 6);
          this.cameraRig.addTrauma(0.1);
        }
        this.checkNearMiss(at);
        break;
      case 'post':
        this.audio.play('post', { volume: 0.4 + vol * 0.7, at });
        this.flight.post = true;
        this.vfx.sparks(at, 14);
        this.cameraRig.addTrauma(0.25);
        if (Math.abs(at.x) > COURT.halfLength - 1) {
          this.crowd.react(0.6);
          this.audio.play('ooh', { group: 'crowd', volume: 1 });
        }
        break;
      case 'net':
        this.audio.play('net', { volume: 0.4 + vol * 0.6, at, cooldown: 0.2 });
        break;
      case 'player':
        this.audio.play('touch', { volume: 0.3 + vol * 0.6, at, cooldown: 0.08 });
        break;
      default:
        break;
    }
  }

  checkNearMiss(at) {
    const f = this.flight;
    if (f.type !== 'shot' || f.nearMissed || this.phase !== 'playing') return;
    if (Math.abs(at.x) > COURT.halfLength - 0.5 && Math.abs(at.z) < COURT.goalHalfWidth + 1.4 && at.y < COURT.goalHeight + 1.4) {
      f.nearMissed = true;
      this.crowd.react(0.5);
      this.audio.play('ooh', { group: 'crowd', volume: 0.8 });
      this.hud.popup('SO CLOSE!', new THREE.Vector3(at.x, 2.2, at.z), this.camera);
    }
  }

  hitstop(seconds) {
    if (this.reducedMotion) return;
    this.hitstopTime = Math.max(this.hitstopTime ?? 0, seconds);
  }

  addStyle(points, label, at, big = false) {
    this.style += points;
    this.hud.popup(`${label} +${points}`, at, this.camera, { big });
  }

  // ------------------------------------------------------------- simulation

  fixedUpdate(dt) {
    const it = this.stepIntents ?? NEUTRAL_INTENTS;
    const active = this.phase === 'playing';
    if (this.phase === 'goal') {
      this.updateCelebration(dt);
    } else {
      this.controller.frozen = !active;
      this.controller.update(dt, active ? it : NEUTRAL_INTENTS, this.cameraRig.yaw, this.time);
    }
    if (this.phase !== 'menu') this.keeperAI.update(dt, this.time);
    else {
      this.keeper.beginStep();
      this.keeper.commitStep();
    }
    this.separate(this.player, this.keeper);
    this.ball.preStep(dt);
    // Edge-triggered intents only fire on the first sub-step of a frame.
    if (this.stepIntents && this.stepIntents !== NEUTRAL_INTENTS) {
      this.stepIntents = {
        ...this.stepIntents,
        shootPressed: false,
        shootReleased: false,
        passPressed: false,
        skillPressed: false,
        switchPressed: false,
        tacklePressed: false,
      };
    }
  }

  separate(a, b) {
    const dx = a.position.x - b.position.x;
    const dz = a.position.z - b.position.z;
    const d = Math.hypot(dx, dz);
    const min = 0.62;
    if (d < min && d > 1e-4 && Math.abs(b.roll) < 0.2) {
      const push = (min - d) / d;
      a.position.x += dx * push;
      a.position.z += dz * push;
    }
  }

  postFixed(dt) {
    this.ball.postStep();
    this.time += dt;
    if (this.phase === 'playing' || this.phase === 'goal') this.checkGoal();
    this.checkStuckBall(dt);
  }

  checkGoal() {
    if (this.ball.inGoal) return;
    const p = this.ball.position;
    const line = COURT.halfLength + BALL.radius;
    if (Math.abs(p.x) < line || Math.abs(p.z) > COURT.goalHalfWidth || p.y > COURT.goalHeight) return;
    if (this.phase !== 'playing') return;
    this.ball.inGoal = true;
    // Home attacks -X; a ball into +X is an own goal.
    this.onGoal(p.x < 0 ? 'home' : 'away');
  }

  checkStuckBall(dt) {
    const p = this.ball.position;
    const v = this.ball.velocity;
    // Resting on a goal roof or wedged high up: knock it back into play.
    if (!this.ball.heldBy && p.y > 1.0 && v.length() < 0.4) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.2) {
        this.stuckTime = 0;
        this.ball.kick(new THREE.Vector3(-Math.sign(p.x) * 2.5, 1.5, -Math.sign(p.z) * 0.5), null, null, this.time);
      }
    } else this.stuckTime = 0;
    if (Math.abs(p.x) > COURT.halfLength + COURT.goalDepth + 1.5 || Math.abs(p.z) > COURT.halfWidth + 1.5 || p.y < -1) {
      this.ball.placeAt(0, 1.5, 0);
    }
  }

  onGoal(team) {
    this.score[team] += 1;
    const home = team === 'home';
    const at = this.ball.position.clone();
    this.setPhase('goal');
    this.input.enabled = false;
    this.slowMo = 1.0;
    this.audio.play('cheer', { group: 'crowd', volume: home ? 1 : 0.5, variance: 0 });
    this.audio.play('whistle', { volume: 0.5, variance: 0 });
    this.audio.play('net', { volume: 1, at });
    this.audio.setLoopIntensity('crowdBed', 2.2);
    this.crowd.react(home ? 1 : 0.4);
    this.cameraRig.addTrauma(0.45);
    this.cameraRig.punchFov(6);
    const colors = home ? ['#f6c915', '#1f8a4c', '#1d4fa3', '#ffffff'] : ['#c8102e', '#141414', '#ffffff'];
    this.vfx.confetti(new THREE.Vector3(Math.sign(at.x) * (COURT.halfLength + 0.4), 0.6, 0), colors);
    this.vfx.confetti(new THREE.Vector3(at.x * 0.7, 3, COURT.halfWidth + 1.5), colors);
    this.platform.happytime();

    if (home) {
      this.stats.goals += 1;
      this.stats.onTarget += 1;
      const f = this.flight;
      const pos = new THREE.Vector3(at.x, 2.4, at.z);
      this.addStyle(1000, 'GOAL', pos, true);
      const bonus = [];
      if (f.power > 0.85) bonus.push([500, 'ROCKET']);
      if (at.y > 1.35 && Math.abs(at.z) > COURT.goalHalfWidth * 0.55) bonus.push([500, 'TOP BINS']);
      if (f.post) bonus.push([300, 'OFF THE POST']);
      if (f.bank) bonus.push([400, 'WALL BANK']);
      if (f.firstTime) bonus.push([250, 'FIRST TIME']);
      if (f.scorerX != null && Math.abs(f.scorerX - Math.sign(at.x) * COURT.halfLength) > 13) bonus.push([600, 'FROM DISTANCE']);
      bonus.forEach(([pts, label], i) => {
        setTimeout(() => this.addStyle(pts, label, pos.clone().add(new THREE.Vector3(0, -0.5 - i * 0.45, 0))), 350 + i * 260);
      });
      this.hud.banner('GOOOL!', `${TEAMS.home.name} ${this.score.home} - ${this.score.away}`);
      this.keeperAI.concede();
      this.player.anim.stopAll();
      this.player.anim.setOverlay('Celebrate_Airplane', { fade: 0.25 });
      this.celebration = { scorer: this.player, turn: (Math.sign(this.player.position.z) || 1) * 0.9 };
      this.cameraRig.setMode('goal', this.player);
    } else {
      this.hud.banner('OWN GOAL', `${TEAMS.home.name} ${this.score.home} - ${this.score.away}`);
      this.player.anim.stopAll();
      this.player.anim.setOverlay('Dejected', { fade: 0.3 });
      this.celebration = { scorer: null };
      this.cameraRig.setMode('goal', this.player);
    }
  }

  updateCelebration(dt) {
    const p = this.player;
    p.beginStep();
    const c = this.celebration;
    if (c?.scorer === p) {
      // Run arcs at the celebration clip's natural jog speed: feet stay planted.
      const speed = this.lib.locomotion.Jog_Fwd_Loop.natural;
      p.speed = 0; // locomotion layer is replaced by the celebration overlay
      const f = p.facing(new THREE.Vector3());
      const nx = p.position.x + f.x * 1.5;
      const nz = p.position.z + f.z * 1.5;
      const nearWall = Math.abs(nx) > COURT.halfLength - 1.2 || Math.abs(nz) > COURT.halfWidth - 1.2;
      p.heading += (nearWall ? 2.6 * Math.sign(c.turn) : c.turn) * dt;
      p.position.addScaledVector(p.facing(f), speed * dt);
      p.position.x = THREE.MathUtils.clamp(p.position.x, -COURT.halfLength + 0.4, COURT.halfLength - 0.4);
      p.position.z = THREE.MathUtils.clamp(p.position.z, -COURT.halfWidth + 0.4, COURT.halfWidth - 0.4);
    } else {
      p.speed = Math.max(0, p.speed - 12 * dt);
      p.position.addScaledVector(p.facing(new THREE.Vector3()), p.speed * dt);
    }
    p.setGhost(true);
    p.commitStep();
  }

  // ------------------------------------------------------------- frame

  update(dt) {
    this.frame += 1;
    resizeRenderer(this.renderer, this.camera, this.quality.dpr);
    this.vfx.setPixelScale(this.renderer.domElement.height, this.camera.fov);
    const it = this.input.poll();

    if (it.pausePressed) {
      if (this.paused) this.resume();
      else this.pause();
    }
    if (this.pausedForScreenshot || this.paused) {
      this.publishDiagnostics();
      return;
    }
    if (it.anyPressed) this.audio.unlock().catch(() => {});
    this.phaseTime += dt;
    this.updatePhase(dt, it);

    if (this.phase === 'playing') {
      if (it.skillPressed) this.hud.toast('Skill moves (stepovers, roulettes, nutmegs) arrive in Phase 3');
      if (it.switchPressed) this.hud.toast('Player switching arrives with 3v3 in Phase 2');
      if (it.tacklePressed) this.hud.toast('Tackles arrive with opponents in Phase 2');
    }

    // Gameplay time scaling: goal slow-mo and heavy-contact hitstop.
    let scale = 1;
    if (this.slowMo > 0) {
      this.slowMo -= dt;
      scale = 0.35;
    }
    if (this.hitstopTime > 0) {
      this.hitstopTime -= dt;
      scale = Math.min(scale, 0.08);
    }
    this.stepIntents = it;
    const alpha = this.physics.update(dt * scale);
    this.stepIntents = null;

    const animDt = dt * scale;
    this.ball.syncVisual(alpha);
    this.player.syncVisual(alpha, animDt);
    this.keeper.syncVisual(alpha, animDt);
    this.crowd.update(this.reducedMotion ? 0 : dt);
    if (this.shotTracking > 0) this.shotTracking -= dt;
    if (this.cameraRig.mode === 'menu') this.updateMenuCamera(dt);
    else this.cameraRig.update(dt, { player: this.player, ball: this.ball, shotTracking: this.shotTracking > 0 && this.phase === 'playing' });
    this.vfx.update(dt * scale, this.ball, this.camera);
    this.court.nearFenceMaterial.opacity = this.cameraRig.mode === 'goal' ? 0.15 : 0.32;

    this.hud.update(dt, this.hudState());
    if (!this.pausedForScreenshot) this.watchPerformance(dt);
    this.publishDiagnostics();
  }

  /** One-time automatic downgrade when the first seconds of play run slowly. */
  watchPerformance(dt) {
    if (this.perfChecked || this.phase !== 'playing' || this.settings.quality === 'low') return;
    this.perfSamples = (this.perfSamples ?? 0) + 1;
    this.perfTime = (this.perfTime ?? 0) + dt;
    if (this.perfTime < 4) return;
    this.perfChecked = true;
    const avg = this.perfTime / this.perfSamples;
    if (avg > 1 / 28) {
      this.setSetting('quality', 'low');
      this.hud.toast('Graphics set to LOW for smoother play (change in Settings)', 3);
    }
  }

  hudState() {
    return {
      score: this.score,
      timeLeft: this.timeLeft,
      style: this.style,
      stamina: this.controller.stamina,
      possession: this.controller.possession,
      charge: this.controller.chargeLevel,
      phase: this.phase,
      screenPos: this.screenPos(this.player.holder.position, 1.9),
    };
  }

  updatePhase(dt, it) {
    switch (this.phase) {
      case 'countdown': {
        const step = Math.floor(this.phaseTime);
        if (step !== this.countdownStep) {
          this.countdownStep = step;
          const left = MATCH.countdown - step;
          if (left > 0) {
            this.hud.banner(String(left), '', { seconds: 0.95, count: true });
            this.audio.play('beep', { group: 'ui', variance: 0 });
          } else {
            this.hud.banner('JOGA!', 'Beat the keeper', { seconds: 1.1 });
            this.audio.play('beepGo', { group: 'ui', variance: 0 });
            this.audio.play('whistle', { variance: 0 });
            this.setPhase('playing');
            this.input.enabled = true;
          }
        }
        break;
      }
      case 'playing':
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.fullTime();
        }
        break;
      case 'goal':
        if (this.phaseTime >= MATCH.goalCelebration) {
          this.audio.setLoopIntensity('crowdBed', 1);
          this.resetPositions();
          this.cameraRig.setMode('play');
          this.cameraRig.snap(this.player, this.ball);
          this.setPhase('kickoff');
          this.hud.banner('READY', '', { seconds: 0.8, count: true });
        }
        break;
      case 'kickoff':
        if (this.phaseTime >= MATCH.kickoffCountdown) {
          this.audio.play('whistle', { variance: 0 });
          this.hud.banner('GO!', '', { seconds: 0.7, count: true });
          this.setPhase('playing');
          this.input.enabled = true;
        }
        break;
      case 'fulltime':
        if (this.phaseTime > 2.2 && !this.resultsShown) {
          this.resultsShown = true;
          this.showResults();
        }
        break;
      default:
        break;
    }
  }

  fullTime() {
    this.setPhase('fulltime');
    this.resultsShown = false;
    this.input.enabled = false;
    this.audio.play('whistleLong', { variance: 0 });
    this.crowd.react(0.6);
    this.hud.banner('FULL TIME', `${this.score.home} - ${this.score.away}`, { seconds: 2.2 });
    this.platform.gameplayStop();
  }

  showResults() {
    const best = this.best();
    const newBest = !best || this.stats.goals > best.goals || (this.stats.goals === best.goals && this.style > best.style);
    if (newBest) this.storage.set(BEST_KEY, JSON.stringify({ goals: this.stats.goals, style: this.style }));
    this.hud.show(false);
    this.hud.hideBanner();
    this.syncTouchUi();
    this.menus.showResults(this.score, {
      GOALS: this.stats.goals,
      SHOTS: this.stats.shots,
      'KEEPER SAVES': this.stats.saves,
      'STYLE POINTS': this.style,
      [newBest ? 'NEW BEST!' : 'BEST']: newBest ? `${this.stats.goals} / ${this.style}` : `${best.goals} / ${best.style}`,
    });
  }

  updateMenuCamera(dt) {
    // Attract mode: slow orbit high over the court.
    this.menuOrbit = (this.menuOrbit ?? 0.6) + dt * 0.05;
    const a = this.menuOrbit;
    this.camera.position.set(Math.sin(a) * 6 - 4, 6.5, -Math.cos(a) * 3 - 15);
    this.camera.lookAt(-3, 1.2, 1);
    this.cameraRig.position.copy(this.camera.position);
  }

  screenPos(world, lift) {
    const v = new THREE.Vector3(world.x, world.y + lift, world.z).project(this.camera);
    const c = this.canvas;
    return { x: ((v.x + 1) / 2) * c.clientWidth, y: ((1 - v.y) / 2) * c.clientHeight };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------- QA hooks

  publishDiagnostics() {
    const info = this.renderer.info;
    const b = this.ball.position;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      phase: this.phase,
      paused: this.paused,
      time: this.time,
      timeLeft: this.timeLeft,
      score: { ...this.score },
      style: this.style,
      stats: { ...this.stats },
      player: {
        position: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
        speed: this.player.speed,
        heading: this.player.heading,
        possession: this.controller.possession,
        stamina: this.controller.stamina,
        kicking: !!this.controller.kick,
      },
      keeper: { state: this.keeperAI.state, position: { x: this.keeper.position.x, z: this.keeper.position.z } },
      ball: {
        position: { x: b.x, y: b.y, z: b.z },
        speed: this.ball.velocity.length(),
        held: !!this.ball.heldBy,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      },
      physics: this.physics.diagnostics(),
      quality: this.settings.quality,
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.quality.dpr),
      },
      platform: this.platform.environment,
    };
  }

  /** Advance the simulation synchronously (test hooks only). */
  simulate(seconds, intents = NEUTRAL_INTENTS) {
    const steps = Math.ceil(seconds * 60);
    for (let i = 0; i < steps; i += 1) {
      this.stepIntents = intents;
      this.physics.update(1 / 60);
      this.updatePhase(1 / 60, intents);
      this.phaseTime += 1 / 60;
      this.ball.syncVisual(1);
      this.player.syncVisual(1, 1 / 60);
      this.keeper.syncVisual(1, 1 / 60);
      this.crowd.update(1 / 60);
      if (this.cameraRig.mode !== 'menu') this.cameraRig.update(1 / 60, { player: this.player, ball: this.ball, shotTracking: false });
      this.vfx.update(1 / 60, this.ball, this.camera);
    }
    this.stepIntents = null;
  }

  installTestHooks() {
    const STATES = ['menu', 'active-play', 'dribble', 'shot', 'keeper-save', 'goal', 'fulltime'];
    window.__THREE_GAME_TEST_HOOKS__ = {
      states: STATES,
      seed: (value) => {
        this.rng = createRng(value);
        this.controller.rng = this.rng;
        this.keeperAI.rng = this.rng;
        this.vfx.rng = this.rng;
      },
      setState: (name) => {
        if (!STATES.includes(name)) throw new Error(`Unknown test state: ${name}`);
        this.pausedForScreenshot = false;
        this.audio.pause();
        if (name === 'menu') {
          this.quitToMenu();
        } else {
          this.startMatch();
          this.phaseTime = MATCH.countdown + 0.01;
          this.countdownStep = MATCH.countdown;
          this.setPhase('playing');
          this.input.enabled = true;
          this.hud.hideBanner();
          const run = { ...NEUTRAL_INTENTS, moveX: 1, moveY: 0.25 };
          if (name === 'active-play') {
            this.player.teleport(4, 0, -Math.PI / 2);
            this.ball.placeAt(3.4, BALL.radius, 0.1);
            this.simulate(1.2, run);
          } else if (name === 'dribble') {
            this.player.teleport(6, 0, -Math.PI / 2);
            this.ball.placeAt(5.4, BALL.radius, 0);
            this.simulate(1.6, { ...run, sprint: true });
          } else if (name === 'shot') {
            this.player.teleport(-6, 0, -Math.PI / 2);
            this.ball.placeAt(-6.6, BALL.radius, 0.3);
            this.simulate(0.4, run);
            this.controller.requestKick('shot', 0.9);
            this.simulate(0.36, run);
          } else if (name === 'keeper-save') {
            this.keeperAI.difficulty = 'hard';
            this.player.teleport(-8, 0, -Math.PI / 2);
            this.ball.placeAt(-8.6, BALL.radius, 0.6);
            this.simulate(0.3, run);
            this.controller.requestKick('shot', 0.45);
            this.simulate(0.62, NEUTRAL_INTENTS);
            this.keeperAI.difficulty = this.settings.difficulty;
          } else if (name === 'goal') {
            this.player.teleport(-11, 0, -Math.PI / 2);
            this.ball.placeAt(-COURT.halfLength - 0.4, BALL.radius, 0.6);
            this.flight = { ...this.freshFlight(), kickTime: this.time, power: 0.9, type: 'shot', scorerX: -11 };
            this.simulate(1.4, NEUTRAL_INTENTS);
          } else if (name === 'fulltime') {
            this.score = { home: 3, away: 1 };
            this.stats = { shots: 9, onTarget: 6, saves: 3, goals: 3, bestCombo: 0 };
            this.style = 4150;
            this.timeLeft = 0.01;
            this.simulate(2.6, NEUTRAL_INTENTS);
          }
        }
        this.hud.update(0, this.hudState());
        this.render();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => {},
      simulate: (seconds, intents) => this.simulate(seconds, { ...NEUTRAL_INTENTS, ...intents }),
    };
  }

  dispose() {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.physics.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }
}
