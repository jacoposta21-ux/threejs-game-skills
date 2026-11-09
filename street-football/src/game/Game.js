import * as THREE from 'three';
import { BALL, CAMERA, COURT, FORMATION, MATCH, QUALITY, ROSTERS, TEAMS } from '../config.js';
import { TeamAI } from '../ai/TeamAI.js';
import { MatchState } from './MatchState.js';
import { Indicators } from '../systems/Indicators.js';
import { PostFX } from '../systems/PostFX.js';
import { Replay } from '../systems/Replay.js';
import { PerfMonitor } from '../debug/PerfMonitor.js';
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
import { buildFestoons } from '../world/Festoons.js';

function outfieldLook(teamId, r) {
  return { ...r, team: TEAMS[teamId], teamId };
}

function keeperLook(teamId, r) {
  return { ...r, team: { ...TEAMS[teamId], ...r.kit }, teamId };
}

const SETTINGS_KEY = 'settings';
const BEST_KEY = 'best';
const NEUTRAL_INTENTS = Object.freeze({
  moveX: 0, moveY: 0, sprint: false, shootHeld: false, shootPressed: false, shootReleased: false,
  passPressed: false, skillPressed: false, switchPressed: false, tacklePressed: false, pausePressed: false, anyPressed: false,
});

export class Game {
  constructor({ canvas, physics, lib, platform, storage, qa = false }) {
    this.qa = qa;
    this.canvas = canvas;
    this.physics = physics;
    this.lib = lib;
    this.platform = platform;
    this.storage = storage;
    // Phones and tablets default to Low (mobile render budget); desktops to Medium.
    const handheld = matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 500;
    this.settings = { quality: handheld ? 'low' : 'medium', difficulty: 'normal', shake: true, ...this.loadJson(SETTINGS_KEY) };
    if (!QUALITY[this.settings.quality]) this.settings.quality = 'medium';
    this.quality = QUALITY[this.settings.quality];

    this.renderer = createRenderer(canvas, this.quality);
    this.renderer.info.autoReset = false;
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
    this.hood = buildNeighborhood(this.scene, this.rng, this.settings.quality, { boardTexture: this.court.boardTexture });
    this.crowd = new Crowd(this.scene, lib, this.rng, this.quality.crowd);
    this.festoons = buildFestoons(this.scene, this.rng);

    // Actors: two teams of three outfield players plus a keeper each.
    this.ball = new Ball(physics, this.scene, this.rng);
    this.match = new MatchState(this.ball);
    this.footballers = [];
    for (const teamId of ['home', 'away']) {
      const team = this.match.teams[teamId];
      for (const r of ROSTERS[teamId]) {
        const f = new Footballer({ lib, physics, scene: this.scene, look: outfieldLook(teamId, r) });
        const c = new PlayerController(f, this.ball, this.events, this.rng, this.match);
        f.anim.onFootstep = (speed) => {
          if (c === this.human) this.audio.play('step', { volume: 0.12 + speed * 0.025, at: f.holder.position, cooldown: 0.12, variance: 0.15 });
        };
        team.players.push(c);
        this.footballers.push(f);
      }
      // Home defends +X (attacks -X); away defends -X.
      const kf = new Footballer({ lib, physics, scene: this.scene, look: keeperLook(teamId, ROSTERS[`${teamId}Keeper`]) });
      team.keeper = new KeeperAI(kf, this.ball, this.events, this.rng, -team.attackSign, this.match);
      team.keeper.difficulty = this.settings.difficulty;
      team.ai = new TeamAI(this.match, teamId, this.rng);
      team.ai.difficulty = this.settings.difficulty;
      this.footballers.push(kf);
    }
    this.human = null;
    this.setHuman(this.match.teams.home.players[0]);
    this.replay = new Replay(this.footballers, this.ball, this.camera);

    // Systems.
    this.cameraRig = new CameraRig(this.camera);
    this.cameraRig.shakeEnabled = this.settings.shake;
    this.vfx = new Vfx(this.scene, this.rng);
    this.audio = new AudioSystem(this.rng, storage);
    this.audio.setCamera(this.camera);
    this.hud = new Hud();
    this.hud.setPlayer(this.human.p.look);
    this.indicators = new Indicators(this.scene);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.postfx.setEnabled(this.quality.post);
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
    this.postfx.resize();
    this.cameraRig.snap(this.human.p, this.ball);
    // Test hooks and per-frame diagnostics only in dev or with ?qa (not in the shipped game).
    if (qa) this.installTestHooks();
    this.perf = new PerfMonitor(this.renderer);
    const params = new URLSearchParams(window.location.search);
    if (params.has('fps')) this.perf.toggle(true);
    this.loop = new Loop((dt) => this.timedUpdate(dt), () => this.render(), (err) => this.onLoopError(err));
    if (params.has('bench')) this.benchmarkPending = true;
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
    return { shots: 0, onTarget: 0, saves: 0, goals: 0, conceded: 0, tackles: 0, interceptions: 0, passes: 0, awayShots: 0, bestCombo: 0, tricks: 0, nutmegs: 0, failedTricks: 0 };
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
    if (key === 'difficulty') {
      for (const t of Object.values(this.match.teams)) {
        t.keeper.difficulty = value;
        t.ai.difficulty = value;
      }
    }
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
      this.postfx.setEnabled(this.quality.post);
      this.postfx.resize();
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

  /** Kick-off shape. The kicking team's first player stands on the ball. */
  resetPositions(kickoffTeam = 'home') {
    this.ball.placeAt(0, BALL.radius + 0.002, 0);
    this.match.owner = null;
    this.match.passTarget = null;
    this.match.lastPossessionTeam = kickoffTeam;
    for (const teamId of ['home', 'away']) {
      const team = this.match.teams[teamId];
      const s = team.attackSign;
      const heading = s < 0 ? -Math.PI / 2 : Math.PI / 2;
      team.players.forEach((c, i) => {
        const f = FORMATION.kickoff[i];
        let x = -s * f[0] * COURT.halfLength;
        const z = f[1] * COURT.halfWidth;
        if (teamId === kickoffTeam && i === 0) x = -s * 0.55;
        else if (Math.abs(x) < COURT.centerCircleRadius + 0.6) x = -s * (COURT.centerCircleRadius + 0.6);
        c.reset();
        c.p.anim.stopAll();
        c.p.teleport(x, z, heading);
        c.p.setGhost(false);
      });
      team.keeper.reset();
      team.ai.reset();
    }
    if (kickoffTeam === 'home') this.setHuman(this.match.teams.home.players[0]);
    this.flight = this.freshFlight();
  }

  /** Give keyboard/touch control to a home outfield player. */
  setHuman(ctrl) {
    if (!ctrl || ctrl === this.human) return;
    if (this.human) {
      this.human.isHuman = false;
      this.human.charge.active = false;
    }
    this.human = ctrl;
    // Autoplay (QA): the "human" slot is tracked for the camera but driven by AI.
    ctrl.isHuman = !this.autoplay;
    this.hud?.setPlayer(ctrl.p.look);
  }

  /** Q: switch to the teammate best placed for the ball (cycles on repeat presses). */
  switchPlayer() {
    const ball = this.ball.position;
    const mates = this.match.teams.home.players
      .filter((c) => c !== this.human)
      .sort((a, b) => Math.hypot(a.p.position.x - ball.x, a.p.position.z - ball.z) - Math.hypot(b.p.position.x - ball.x, b.p.position.z - ball.z));
    const pick = mates[0];
    if (!pick || this.human?.possession) return;
    this.setHuman(pick);
    this.audio.play('click', { group: 'ui', variance: 0, volume: 0.6 });
  }

  startMatch() {
    this.audio.unlock().catch(() => {});
    this.score = { home: 0, away: 0 };
    this.timeLeft = MATCH.duration;
    this.style = 0;
    this.combo = 0;
    this.hud.setCombo(0);
    this.stats = this.freshStats();
    this.resetPositions();
    this.menus.hideAll();
    this.hud.reset();
    this.hud.show(true);
    this.cameraRig.setMode('play');
    this.cameraRig.snap(this.human.p, this.ball);
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

  isHome(footballer) {
    return footballer?.team === 'home';
  }

  wireFeedback() {
    const ev = this.events;
    ev.on('touch', ({ player, strength }) => {
      this.audio.play('touch', { volume: (player === this.human?.p ? 0.35 : 0.2) + strength * 0.04, at: player.holder.position, cooldown: 0.05 });
    });
    ev.on('control', ({ player, relSpeed, stolenFrom }) => {
      this.audio.play('touch', { volume: 0.5 + relSpeed * 0.05, at: this.ball.mesh.position });
      this.flight.controlTime = this.time;
      if (this.phase !== 'playing') return;
      const home = this.isHome(player);
      // Interception: won a ball the other team had just played or was dribbling.
      const fromPass = this.flight.type === 'pass' && this.flight.team && this.flight.team !== player.team && this.time - this.flight.kickTime < 2;
      if (stolenFrom || fromPass) {
        if (home) {
          this.stats.interceptions += 1;
          this.addStyle(100, stolenFrom ? 'STEAL' : 'INTERCEPTION', new THREE.Vector3(player.position.x, 2.2, player.position.z));
        }
        this.crowd.react(0.3);
      }
      // The other team won the ball: the combo is over.
      if (!home) this.endCombo();
      // Control follows the ball inside the human's team.
      if (home && player.ctrl && player.ctrl !== this.human) this.setHuman(player.ctrl);
    });
    ev.on('chargeStart', () => this.audio.play('charge', { volume: 0.12, variance: 0 }));
    this.wireTricks();
    ev.on('kick', ({ type, power, player, target }) => {
      const at = this.ball.mesh.position;
      const firstTime = this.flight.controlTime != null && this.time - this.flight.controlTime < 0.55;
      this.flight = { ...this.freshFlight(), kickTime: this.time, power, type, firstTime, scorerX: player.position.x, team: player.team, kicker: player };
      const home = this.isHome(player);
      if (type === 'shot') {
        if (home) this.stats.shots += 1;
        else this.stats.awayShots += 1;
        this.audio.play(power > 0.6 ? 'kickHard' : 'kickSoft', { volume: 0.7 + power * 0.5, at });
        this.cameraRig.addTrauma((0.12 + power * 0.28) * (home ? 1 : 0.6));
        this.cameraRig.punchFov(1.5 + power * 4);
        this.vfx.dust(player.footPoint(new THREE.Vector3(), 0.5), 0.6 + power);
        if (power > 0.85 && home) this.hitstop(0.06);
        this.shotTracking = 1.6;
      } else {
        if (home) this.stats.passes += 1;
        this.audio.play('kickSoft', { volume: 0.55, at, rate: 1.15 });
        this.vfx.dust(at, 0.4);
        this.passFocus = target ?? null;
      }
    });
    ev.on('whiff', ({ player }) => {
      if (player === this.human?.p) this.hud.toast('Missed the ball — get closer before you strike', 1.5);
    });
    ev.on('possessionLost', ({ player, reason }) => {
      if (this.phase === 'playing' && player === this.human?.p && reason === 'heavy' && player.speed > 5) this.hud.toast('Heavy touch!', 1);
    });
    ev.on('tackleStart', ({ player }) => this.audio.play('step', { volume: 0.5, rate: 0.8, at: player.holder.position }));
    ev.on('tackle', ({ tackler, success, victim }) => {
      if (!success) return;
      const at = this.ball.mesh.position;
      this.audio.play('kickSoft', { volume: 0.7, rate: 0.85, at });
      this.vfx.dust(at, 0.8);
      if (victim) {
        this.cameraRig.addTrauma(0.22);
        this.crowd.react(0.35);
        if (this.isHome(tackler)) {
          this.stats.tackles += 1;
          this.addStyle(150, 'TACKLE', new THREE.Vector3(tackler.position.x, 2.2, tackler.position.z));
        }
      }
    });
    ev.on('save', ({ keeper, type }) => {
      if (type === 'claim') return;
      if (keeper.team === 'away') {
        this.stats.saves += 1;
        this.stats.onTarget += 1;
      }
      this.audio.play('ooh', { group: 'crowd', volume: 0.9 });
      this.audio.play(type === 'catch' ? 'touch' : 'kickSoft', { volume: 0.9, at: this.ball.mesh.position });
      this.crowd.react(0.55);
      this.cameraRig.addTrauma(0.2);
      this.hud.popup(type === 'catch' ? 'SAVED!' : 'PARRIED!', new THREE.Vector3(keeper.position.x, 2.4, keeper.position.z), this.camera, { big: true });
    });
    ev.on('keeperDive', () => this.audio.play('step', { volume: 0.5, rate: 0.7 }));
    ev.on('keeperThrow', () => this.audio.play('kickSoft', { volume: 0.35, rate: 1.3 }));
  }

  // ------------------------------------------------------------- freestyle

  wireTricks() {
    this.combo = 0;
    const ev = this.events;
    ev.on('trickStart', ({ player, kind }) => {
      this.audio.play('swish', { volume: player === this.human?.p ? 0.6 : 0.35, at: player.holder.position, variance: 0.12 });
      // Fake shot near goal: the keeper buys it.
      if (kind === 'fakeshot') {
        const opp = this.match.teams[this.match.opponent(player.team)].keeper;
        if (Math.abs(player.position.x - opp.goalX) < 13) opp.bite((this.rng() < 0.5 ? -1 : 1) * 0.8, this.time);
      }
    });
    ev.on('trickTouch', ({ player, lift }) => this.audio.play(lift ? 'kickSoft' : 'touch', { volume: 0.45, rate: lift ? 1.3 : 1, at: player.holder.position }));
    ev.on('fooled', ({ player }) => {
      this.crowd.react(0.35);
      if (this.isHome(player)) this.cameraRig.addTrauma(0.06);
    });
    ev.on('trick', (e) => this.onTrick(e));
  }

  onTrick({ player, label, points, outcome, solo, kind, byHuman }) {
    const at = new THREE.Vector3(player.position.x, 2.3, player.position.z);
    const home = this.isHome(player);
    if (this.phase !== 'playing') return;
    if (!home) {
      // AI opponents' moves: crowd reaction only.
      if (outcome === 'success' && !solo) {
        this.hud.popup(label, at, this.camera);
        this.crowd.react(0.3);
      }
      return;
    }
    if (outcome === 'fail' || outcome === 'lost') {
      if (byHuman) {
        this.stats.failedTricks += 1;
        this.hud.popup(outcome === 'fail' ? 'FAILED!' : 'LOST IT', at, this.camera);
        this.audio.play('fail', { volume: 0.5, variance: 0.05 });
      }
      this.endCombo();
      return;
    }
    if (solo || !points) {
      // No defender to beat: show the move, no score.
      if (byHuman) this.hud.popup(label, at, this.camera);
      return;
    }
    this.combo += 1;
    const mult = Math.min(5, this.combo);
    const pts = points * mult;
    this.stats.tricks += 1;
    if (kind === 'nutmeg') this.stats.nutmegs += 1;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    this.addStyle(pts, label, at, kind === 'nutmeg' || kind === 'rainbow');
    if (this.combo >= 2) {
      setTimeout(() => this.hud.popup(`COMBO x${this.combo}`, at.clone().add(new THREE.Vector3(0, 0.6, 0)), this.camera, { big: true }), 220);
    }
    this.hud.setCombo(this.combo);
    this.audio.play('combo', { group: 'ui', volume: 0.5, rate: 1 + Math.min(4, this.combo - 1) * 0.12, variance: 0 });
    this.crowd.react(Math.min(0.9, 0.35 + this.combo * 0.1));
  }

  endCombo() {
    if (this.combo >= 2) this.hud.toast(`Combo x${this.combo} ended`, 1.2);
    this.combo = 0;
    this.hud.setCombo(0);
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
      case 'player': {
        this.audio.play('touch', { volume: 0.3 + vol * 0.6, at, cooldown: 0.08 });
        // A defender's body in the way of a shot.
        const who = other.who;
        if (this.flight.type === 'shot' && who && who.team !== this.flight.team && speed > 8 && !this.flight.blocked) {
          this.flight.blocked = true;
          this.hud.popup('BLOCKED!', new THREE.Vector3(who.position.x, 2.2, who.position.z), this.camera);
          if (this.isHome(who)) this.addStyle(100, 'BLOCK', new THREE.Vector3(who.position.x, 1.8, who.position.z));
        }
        break;
      }
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
    if (this.phase === 'menu') {
      for (const f of this.footballers) {
        f.beginStep();
        f.commitStep();
      }
      this.ball.preStep(dt);
      return;
    }
    if (active && it.switchPressed) this.switchPlayer();
    if (active) {
      this.match.teams.home.ai.update(dt, this.time);
      this.match.teams.away.ai.update(dt, this.time);
    }
    if (this.phase === 'goal') {
      this.updateCelebration(dt);
    } else {
      for (const c of this.match.allOutfield()) {
        c.frozen = !active;
        const intents = !active ? NEUTRAL_INTENTS : c.isHuman ? it : c.aiIntents ?? NEUTRAL_INTENTS;
        c.update(dt, intents, this.cameraRig.yaw, this.time);
      }
    }
    for (const t of Object.values(this.match.teams)) t.keeper.update(dt, this.time);
    this.separateAll();
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

  /** Bodies never overlap: pairwise circle separation (keepers mid-dive excluded). */
  separateAll() {
    const fs = this.footballers;
    const min = 0.62;
    for (let i = 0; i < fs.length; i += 1) {
      for (let j = i + 1; j < fs.length; j += 1) {
        const a = fs[i];
        const b = fs[j];
        if (Math.abs(a.roll) > 0.2 || Math.abs(b.roll) > 0.2) continue;
        // A nutmeg / rainbow victim is slipped past, not bumped into.
        if ((a.ctrl && a.ctrl.ghostUntil > this.time) || (b.ctrl && b.ctrl.ghostUntil > this.time)) continue;
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-4) {
          const push = ((min - d) / d) * 0.5;
          a.position.x += dx * push;
          a.position.z += dz * push;
          b.position.x -= dx * push;
          b.position.z -= dz * push;
        }
      }
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
    // Home attacks -X, away attacks +X.
    this.onGoal(p.x < 0 ? 'home' : 'away');
  }

  checkStuckBall(dt) {
    const p = this.ball.position;
    const v = this.ball.velocity;
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
    this.lastGoalX = Math.sign(at.x) * COURT.halfLength;
    this.events.emit('goal', { team, flight: { ...this.flight, kicker: undefined }, lastTouch: this.ball.lastTouch?.look?.name, lastTouchTeam: this.ball.lastTouch?.team, lastTouchKeeper: !this.ball.lastTouch?.ctrl, at: { x: at.x, y: at.y, z: at.z }, since: this.time - this.flight.kickTime });
    this.setPhase('goal');
    this.input.enabled = false;
    this.slowMo = 1.0;
    this.kickoffTeam = home ? 'away' : 'home';
    this.audio.play('cheer', { group: 'crowd', volume: home ? 1 : 0.55, variance: 0 });
    this.audio.play('whistle', { volume: 0.5, variance: 0 });
    this.audio.play('net', { volume: 1, at });
    this.audio.setLoopIntensity('crowdBed', home ? 2.2 : 1.4);
    this.crowd.react(home ? 1 : 0.45);
    this.cameraRig.addTrauma(home ? 0.45 : 0.25);
    this.cameraRig.punchFov(6);
    this.postfx.pulse(home ? 0.5 : 0.2);
    const colors = home ? ['#f6c915', '#1f8a4c', '#1d4fa3', '#ffffff'] : ['#c8102e', '#141414', '#ffffff'];
    this.vfx.confetti(new THREE.Vector3(Math.sign(at.x) * (COURT.halfLength + 0.4), 0.6, 0), colors);
    if (home) this.vfx.confetti(new THREE.Vector3(at.x * 0.7, 3, COURT.halfWidth + 1.5), colors);
    if (home) this.platform.happytime();
    this.match.owner = null;

    // Scorer: last touch if it was the scoring team, otherwise (own goal) their nearest player.
    const last = this.ball.lastTouch;
    let scorer = last?.ctrl && last.team === team ? last : null;
    const ownGoal = !scorer && last && last.team && last.team !== team;
    if (!scorer) scorer = this.match.closest(team, at)?.p ?? null;
    const concedingKeeper = this.match.teams[this.match.opponent(team)].keeper;
    concedingKeeper.concede();

    for (const c of this.match.allOutfield()) {
      c.frozen = true;
      c.charge.active = false;
      c.p.anim.stopAll();
      if (c.team !== team) c.p.anim.setOverlay('Dejected', { fade: 0.4 });
    }
    if (scorer) {
      scorer.anim.stopAll();
      scorer.anim.setOverlay('Celebrate_Airplane', { fade: 0.25 });
    }
    this.celebration = { scorer, turn: (Math.sign(scorer?.position.z ?? 1) || 1) * 0.9 };
    this.cameraRig.setMode('goal', scorer ?? this.human.p);

    const scoreLine = `${TEAMS.home.short} ${this.score.home} - ${this.score.away} ${TEAMS.away.short}`;
    if (home) {
      this.stats.goals += 1;
      this.stats.onTarget += 1;
      const f = this.flight;
      const pos = new THREE.Vector3(at.x, 2.4, at.z);
      this.addStyle(1000, ownGoal ? 'OWN GOAL' : 'GOAL', pos, true);
      const bonus = [];
      if (!ownGoal) {
        if (f.power > 0.85) bonus.push([500, 'ROCKET']);
        if (at.y > 1.35 && Math.abs(at.z) > COURT.goalHalfWidth * 0.55) bonus.push([500, 'TOP BINS']);
        if (f.post) bonus.push([300, 'OFF THE POST']);
        if (f.bank) bonus.push([400, 'WALL BANK']);
        if (f.firstTime) bonus.push([250, 'FIRST TIME']);
        if (f.scorerX != null && Math.abs(f.scorerX - Math.sign(at.x) * COURT.halfLength) > 13) bonus.push([600, 'FROM DISTANCE']);
      }
      bonus.forEach(([pts, label], i) => {
        setTimeout(() => this.addStyle(pts, label, pos.clone().add(new THREE.Vector3(0, -0.5 - i * 0.45, 0))), 350 + i * 260);
      });
      // A goal at the end of a trick combo cashes in a style bonus.
      if (this.combo >= 2) {
        const bonusPts = 250 * this.combo;
        setTimeout(() => this.addStyle(bonusPts, 'STYLE BONUS', pos.clone().add(new THREE.Vector3(0, 0.7, 0)), true), 200);
      }
      this.combo = 0;
      this.hud.setCombo(0);
      this.hud.banner('GOOOL!', `${scorer?.look.name ?? ''} • ${scoreLine}`);
    } else {
      this.stats.conceded += 1;
      this.hud.banner(ownGoal ? 'OWN GOAL' : 'GOAL', `${TEAMS.away.name} • ${scoreLine}`);
    }
  }

  updateCelebration(dt) {
    const c = this.celebration;
    for (const ctrl of this.match.allOutfield()) {
      const p = ctrl.p;
      p.beginStep();
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
  }

  // ------------------------------------------------------------- frame

  /** update() wrapped with CPU timing for the perf monitor / benchmark. */
  timedUpdate(dt) {
    const t0 = performance.now();
    this.update(dt);
    const cpu = performance.now() - t0;
    this.perf.frame(cpu);
    // Wall-clock frame time (the game delta is clamped, so it cannot show hitches).
    this.perf.sample(this.perf.lastWallMs, cpu);
    if (this.benchmarkPending && this.phase === 'menu' && this.frame > 10) this.startBenchmark();
    if (this.bench && performance.now() - this.bench.t0 > 20000) this.finishBenchmark();
  }

  /** ?bench: 20 s of AI-vs-AI play with the full scene, then a summary card. */
  startBenchmark() {
    this.benchmarkPending = false;
    this.autoplay = true;
    this.skipReplays = true;
    this.startMatch();
    this.human.isHuman = false;
    this.phaseTime = MATCH.countdown + 0.01;
    this.countdownStep = MATCH.countdown;
    this.setPhase('playing');
    this.hud.hideBanner();
    this.bench = { t0: performance.now() };
    this.perfChecked = true; // no auto-downgrade while measuring
    this.perf.startRun();
    this.perf.toggle(true);
  }

  finishBenchmark() {
    const result = this.perf.endRun({ quality: this.settings.quality, canvas: `${this.canvas.width}x${this.canvas.height}` });
    this.bench = null;
    this.autoplay = false;
    this.human.isHuman = true;
    this.quitToMenu();
    window.__RUA10_BENCH__ = result;
    const box = document.createElement('pre');
    box.id = 'bench-result';
    box.textContent = `BENCHMARK (20 s, ${result.quality})\n${JSON.stringify(result, null, 2)}\n\nClick to copy.`;
    box.addEventListener('click', () => navigator.clipboard?.writeText(JSON.stringify(result)).catch(() => {}));
    document.getElementById('app').appendChild(box);
  }

  /** Loop errors: keep playing through a one-off, stop cleanly if it repeats every frame. */
  onLoopError(err) {
    this.loopErrors = (this.loopErrors ?? 0) + 1;
    if (this.loopErrors === 1) console.error('[game] frame error', err);
    if (this.loopErrors > 30) {
      this.loop.stop();
      this.menus.fatal('The game hit an unexpected error. Please reload the page.');
    }
  }

  update(dt) {
    this.frame += 1;
    this.loopErrors = 0;
    this.lastDt = dt;
    if (resizeRenderer(this.renderer, this.camera, this.quality.dpr)) this.postfx.resize();
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


    let scale = 1;
    if (this.slowMo > 0) {
      this.slowMo -= dt;
      scale = 0.35;
    }
    if (this.hitstopTime > 0) {
      this.hitstopTime -= dt;
      scale = Math.min(scale, 0.08);
    }
    if (this.phase === 'replay') {
      this.updateReplay(dt, it.anyPressed);
      this.crowd.update(this.reducedMotion ? 0 : dt);
      this.festoons.update(performance.now() / 1000);
      this.vfx.update(dt, this.ball, this.camera);
      this.hud.update(dt, this.hudState());
      this.publishDiagnostics();
      return;
    }

    this.stepIntents = it;
    const alpha = this.physics.update(dt * scale);
    this.stepIntents = null;

    this.syncVisuals(alpha, dt * scale);
    this.recordReplay(dt);
    this.crowd.update(this.reducedMotion ? 0 : dt);
    // The batucada swells with the crowd's excitement.
    this.audio.setLoopIntensity('batucada', 0.8 + this.crowd.excitement * 2.2);
    this.festoons.update(this.reducedMotion ? 0 : performance.now() / 1000);
    if (this.shotTracking > 0) this.shotTracking -= dt;
    if (this.cameraRig.mode === 'menu') this.updateMenuCamera(dt);
    else this.cameraRig.update(dt, { player: this.human.p, ball: this.ball, shotTracking: this.shotTracking > 0 && this.phase === 'playing' });
    this.vfx.update(dt * scale, this.ball, this.camera);
    this.court.nearFenceMaterial.opacity = this.cameraRig.mode === 'goal' ? 0.15 : 0.32;
    const pt = this.match.passTarget;
    const showTarget = pt && pt.ctrl.team === 'home' && !this.match.owner && this.time - pt.time < 1.5 ? pt.ctrl : null;
    this.indicators.update(dt, this.human, showTarget, ['playing', 'countdown', 'kickoff'].includes(this.phase));

    this.hud.update(dt, this.hudState());
    if (!this.pausedForScreenshot) this.watchPerformance(dt);
    this.publishDiagnostics();
  }

  recordReplay(dt) {
    if (this.phase === 'playing' || (this.phase === 'goal' && this.phaseTime < 0.8)) this.replay.record(dt);
  }

  startReplay() {
    this.setPhase('replay');
    this.hud.hideBanner();
    document.getElementById('letterbox').classList.remove('hidden');
    document.getElementById('hud').classList.add('replay');
    this.replay.start(this.lastGoalX ?? -COURT.halfLength);
  }

  /** Advance the instant replay; any input skips it. */
  updateReplay(dt, skip) {
    const running = this.replay.update(dt);
    if (!running || (skip && this.phaseTime > 0.4)) this.endReplay();
  }

  endReplay() {
    this.replay.stop();
    document.getElementById('letterbox').classList.add('hidden');
    document.getElementById('hud').classList.remove('replay');
    this.beginKickoff();
  }

  beginKickoff() {
    this.audio.setLoopIntensity('crowdBed', 1);
    this.replay.clear();
    this.resetPositions(this.kickoffTeam ?? 'home');
    this.cameraRig.setMode('play');
    this.cameraRig.snap(this.human.p, this.ball);
    this.setPhase('kickoff');
    this.hud.banner('READY', this.kickoffTeam === 'away' ? `${TEAMS.away.name} kick off` : '', { seconds: 0.8, count: true });
  }

  syncVisuals(alpha, animDt) {
    this.ball.syncVisual(alpha);
    for (const f of this.footballers) f.syncVisual(alpha, animDt);
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
    const h = this.human;
    return {
      score: this.score,
      timeLeft: this.timeLeft,
      style: this.style,
      stamina: h.stamina,
      possession: h.possession,
      charge: h.chargeLevel,
      phase: this.phase,
      screenPos: this.screenPos(h.p.holder.position, 1.9),
    };
  }

  updatePhase(dt) {
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
            this.hud.banner('JOGA!', '3 v 3 • first to the most goals', { seconds: 1.1 });
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
          if (this.replay.available && !this.skipReplays) this.startReplay();
          else this.beginKickoff();
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
    for (const c of this.match.allOutfield()) c.frozen = true;
    this.audio.play('whistleLong', { variance: 0 });
    const won = this.score.home > this.score.away;
    this.crowd.react(won ? 1 : 0.4);
    this.hud.banner(won ? 'YOU WIN!' : this.score.home === this.score.away ? 'DRAW' : 'FULL TIME', `${this.score.home} - ${this.score.away}`, { seconds: 2.2 });
    this.platform.gameplayStop();
  }

  showResults() {
    const best = this.best();
    const newBest = !best || this.stats.goals > best.goals || (this.stats.goals === best.goals && this.style > best.style);
    if (newBest) this.storage.set(BEST_KEY, JSON.stringify({ goals: this.stats.goals, style: this.style }));
    this.hud.show(false);
    this.hud.hideBanner();
    this.syncTouchUi();
    const s = this.stats;
    this.menus.showResults(this.score, {
      SHOTS: `${s.shots} - ${s.awayShots}`,
      'PASSES': s.passes,
      'TACKLES WON': s.tackles,
      'STEALS & INTERCEPTIONS': s.interceptions,
      'TRICKS LANDED': `${s.tricks}${s.nutmegs ? ` (${s.nutmegs} nutmeg${s.nutmegs > 1 ? 's' : ''})` : ''}`,
      'BEST COMBO': s.bestCombo >= 2 ? `x${s.bestCombo}` : '—',
      'STYLE POINTS': this.style,
      [newBest ? 'NEW BEST!' : 'BEST']: newBest ? `${s.goals} goals / ${this.style}` : `${best.goals} goals / ${best.style}`,
    });
  }

  updateMenuCamera(dt) {
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
    // Count every pass of the frame (post-processing renders several times).
    this.renderer.info.reset();
    if (this.postfx.enabled) this.postfx.render(this.lastDt ?? 1 / 60);
    else this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------- QA hooks

  publishDiagnostics() {
    if (!this.qa) return;
    const info = this.renderer.info;
    const b = this.ball.position;
    const h = this.human;
    const owner = this.match.owner;
    const pos = (f) => ({ x: +f.position.x.toFixed(3), z: +f.position.z.toFixed(3) });
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
        name: h.p.look.name,
        position: { x: h.p.position.x, y: h.p.position.y, z: h.p.position.z },
        speed: h.p.speed,
        heading: h.p.heading,
        possession: h.possession,
        stamina: h.stamina,
        kicking: !!h.kick,
        tackling: !!h.tackle,
      },
      possession: { team: this.match.possessionTeam, owner: owner ? owner.p.look.name : null },
      combo: this.combo,
      trick: h.trick ? h.trick.kind : null,
      teams: Object.fromEntries(
        Object.entries(this.match.teams).map(([id, t]) => [
          id,
          {
            players: t.players.map((c) => ({ name: c.p.look.name, ...pos(c.p), role: t.ai.roles.get(c)?.type ?? (c.isHuman ? 'human' : null), human: c.isHuman })),
            keeper: { state: t.keeper.state, ...pos(t.keeper.k) },
          },
        ]),
      ),
      keeper: { state: this.match.teams.away.keeper.state, position: pos(this.match.teams.away.keeper.k) },
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
      if (this.phase === 'replay') {
        this.phaseTime += 1 / 60;
        this.updateReplay(1 / 60, false);
        continue;
      }
      this.stepIntents = intents;
      this.physics.update(1 / 60);
      this.updatePhase(1 / 60);
      this.phaseTime += 1 / 60;
      this.syncVisuals(1, 1 / 60);
      this.recordReplay(1 / 60);
      this.crowd.update(1 / 60);
      if (this.cameraRig.mode !== 'menu') this.cameraRig.update(1 / 60, { player: this.human.p, ball: this.ball, shotTracking: false });
      this.vfx.update(1 / 60, this.ball, this.camera);
    }
    this.stepIntents = null;
    this.indicators.update(0, this.human, null, this.phase === 'playing');
  }

  /** Place a team's players (test hooks). */
  place(teamId, spots) {
    const team = this.match.teams[teamId];
    team.players.forEach((c, i) => {
      if (spots[i]) c.p.teleport(spots[i][0], spots[i][1], spots[i][2] ?? (team.attackSign < 0 ? -Math.PI / 2 : Math.PI / 2));
    });
  }

  installTestHooks() {
    const STATES = ['menu', 'active-play', 'dribble', 'shot', 'pass', 'defending', 'tackle', 'trick', 'combo', 'keeper-save', 'goal', 'replay', 'fulltime'];
    window.__THREE_GAME_TEST_HOOKS__ = {
      states: STATES,
      seed: (value) => {
        this.rng = createRng(value);
        for (const c of this.match.allOutfield()) c.rng = this.rng;
        for (const t of Object.values(this.match.teams)) {
          t.keeper.rng = this.rng;
          t.ai.rng = this.rng;
        }
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
          const home = this.match.teams.home.players;
          const away = this.match.teams.away.players;
          const hk = this.human;
          if (name === 'active-play') {
            this.place('home', [[4, 0], [2, 4.5], [7, -4]]);
            this.place('away', [[-3, -1.5], [-6, 3], [-9, -2]]);
            this.ball.placeAt(3.4, BALL.radius, 0.1);
            this.simulate(1.2, run);
          } else if (name === 'dribble') {
            this.place('home', [[6, 0], [4, 5], [9, -4]]);
            this.place('away', [[-4, 2], [-7, -3], [-10, 1]]);
            this.ball.placeAt(5.4, BALL.radius, 0);
            this.simulate(1.6, { ...run, sprint: true });
          } else if (name === 'shot') {
            this.place('home', [[-6, 0], [-3, 5], [1, -4]]);
            this.place('away', [[-10, 3.5], [-4, -5], [2, 2]]);
            this.ball.placeAt(-6.6, BALL.radius, 0.3);
            this.simulate(0.4, run);
            hk.requestKick('shot', 0.9);
            this.simulate(0.36, run);
          } else if (name === 'pass') {
            this.place('home', [[4, -2], [-2, 4], [8, 3]]);
            this.place('away', [[0, -4], [-6, 0], [-9, -3]]);
            this.ball.placeAt(3.45, BALL.radius, -2);
            this.simulate(0.3, { ...NEUTRAL_INTENTS, moveX: 1, moveY: 0.6 });
            hk.requestPass();
            this.simulate(0.45, NEUTRAL_INTENTS);
          } else if (name === 'defending') {
            this.place('home', [[-1, 0, Math.PI / 2], [-4, 4], [5, -3]]);
            this.place('away', [[2, 0.3], [-2, -4], [6, 4]]);
            this.ball.placeAt(2.6, BALL.radius, 0.3);
            this.simulate(1.0, { ...NEUTRAL_INTENTS, moveX: -0.6 });
          } else if (name === 'tackle') {
            this.place('home', [[1.4, 0, Math.PI / 2], [-4, 4], [5, -3]]);
            this.place('away', [[2.6, 0, -Math.PI / 2], [-2, -4], [7, 4]]);
            this.ball.placeAt(2.15, BALL.radius, 0);
            this.simulate(0.15, NEUTRAL_INTENTS);
            hk.requestTackle();
            this.simulate(0.24, NEUTRAL_INTENTS);
          } else if (name === 'trick' || name === 'combo') {
            // Ball at the feet, a defender closing in: a roulette mid-spin (or a landed combo).
            this.place('home', [[3, 0], [0, 5], [7, -4]]);
            this.place('away', [[1.2, 0.2, Math.PI / 2], [-3, -4], [-8, 2]]);
            this.ball.placeAt(2.55, BALL.radius, 0);
            this.simulate(0.25, { ...NEUTRAL_INTENTS, moveX: 0.4 });
            if (name === 'combo') {
              this.combo = 2;
              hk.lastTrickKind = null;
            }
            const rng = this.rng;
            hk.rng = () => 0.99; // force the success roll for a deterministic capture
            hk.rng.gauss = rng.gauss;
            hk.rng.range = rng.range;
            hk.requestTrick(name === 'combo' ? 'stepover' : 'roulette', 1);
            this.simulate(name === 'combo' ? 0.78 : 0.45, NEUTRAL_INTENTS);
            hk.rng = rng;
          } else if (name === 'keeper-save') {
            const k = this.match.teams.away.keeper;
            k.difficulty = 'hard';
            this.place('home', [[-8, 0], [-3, 5], [1, -4]]);
            this.place('away', [[2, 3], [4, -5], [6, 2]]);
            this.ball.placeAt(-8.6, BALL.radius, 0.6);
            this.simulate(0.3, run);
            hk.requestKick('shot', 0.45);
            this.simulate(0.62, NEUTRAL_INTENTS);
            k.difficulty = this.settings.difficulty;
          } else if (name === 'goal') {
            this.place('home', [[-11, 0], [-6, 4], [-2, -4]]);
            this.place('away', [[-9, 4], [-8, -3], [0, 2]]);
            this.ball.placeAt(-COURT.halfLength - 0.4, BALL.radius, 0.6);
            this.ball.lastTouch = home[0].p;
            this.flight = { ...this.freshFlight(), kickTime: this.time, power: 0.9, type: 'shot', scorerX: -11, team: 'home' };
            this.simulate(1.4, NEUTRAL_INTENTS);
          } else if (name === 'replay') {
            // Dribble in and finish, then let the celebration hand over to the replay.
            this.place('home', [[-8, 0.5], [-4, 4], [-1, -4]]);
            this.place('away', [[-3, -2], [2, 4], [4, -3]]);
            this.ball.placeAt(-8.6, BALL.radius, 0.4);
            this.simulate(0.9, run);
            this.match.teams.away.keeper.k.teleport(this.match.teams.away.keeper.homeX, 1.4, Math.PI / 2);
            this.ball.kick(new THREE.Vector3(-22, 1.2, -1.6), null, hk.p, this.time);
            this.simulate(0.6 + MATCH.goalCelebration, NEUTRAL_INTENTS);
            this.simulate(1.6, NEUTRAL_INTENTS);
          } else if (name === 'fulltime') {
            this.score = { home: 3, away: 2 };
            this.stats = { ...this.freshStats(), shots: 9, awayShots: 7, onTarget: 6, saves: 3, goals: 3, conceded: 2, tackles: 4, interceptions: 5, passes: 21 };
            this.style = 4950;
            this.timeLeft = 0.01;
            this.simulate(2.6, NEUTRAL_INTENTS);
          }
          void away;
        }
        this.hud.update(0, this.hudState());
        this.render();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused) => {
        this.pausedForScreenshot = paused;
      },
      setAutoplay: (enabled) => {
        this.autoplay = enabled;
        this.human.isHuman = !enabled;
      },
      setDifficulty: (level) => this.setSetting('difficulty', level),
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
