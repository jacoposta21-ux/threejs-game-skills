import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { AudioManager } from './AudioManager.js';
import { CollisionSystem } from './CollisionSystem.js';
import { COLORS, PLAYER, POWERUPS, QUALITY, SCORE, SKINS, SPEED, THEMES, TIERS } from './Config.js';
import { difficultyAt, speedAt, tierAt } from './Difficulty.js';
import { InputManager } from './InputManager.js';
import { Obstacles } from './Obstacles.js';
import { PLAYER_HALF_ANGLE, angleDiff, clearance, rotationAt } from './ObstacleModel.js';
import { Dust, ParticleSystem, SpeedStreaks } from './ParticleSystem.js';
import { createPlatform } from './Platform.js';
import { Player } from './Player.js';
import { Progression, dailySeed, newRunStats } from './Progression.js';
import { PowerUps } from './PowerUps.js';
import { ProceduralGenerator } from './ProceduralGenerator.js';
import { SaveManager } from './SaveManager.js';
import { Tunnel } from './Tunnel.js';
import { UIManager } from './UIManager.js';

// Final full-screen pass: vignette, boost chromatic aberration, subtle grain.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0 },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    uniform float uTime;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * uAberration * r2 * 0.12;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= 1.0 - uVignette * smoothstep(0.08, 0.6, r2);
      float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.012;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const COLOR_WHITE = new THREE.Color(2.5, 2.5, 2.5);
const TYPE_COLORS = {
  spikes: new THREE.Color(0xff00e5).multiplyScalar(2.5),
  laser: new THREE.Color(0xff1f3d).multiplyScalar(2.5),
  blades: new THREE.Color(0xff9500).multiplyScalar(2.5),
  wall: new THREE.Color(0x7ffcff).multiplyScalar(2.2),
  gate: new THREE.Color(0x4d8dff).multiplyScalar(2.5),
};
const IGNITE_COLOR = new THREE.Color(3, 0.3, 0.4);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.save = new SaveManager();
    this.platform = createPlatform();
    this.audio = new AudioManager(this.save.settings);
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    // ---------------------------------------------------------- renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.setClearColor(COLORS.background, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.FogExp2(0x03030a, 0.0085);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x0a0614, 0.9));
    this.keyLight = new THREE.DirectionalLight(0xbfe8ff, 1.4);
    this.keyLight.position.set(0, 0, 1);
    this.camera.add(this.keyLight);
    this.keyLight.target.position.set(0, 0, -1);
    this.camera.add(this.keyLight.target);

    // ---------------------------------------------------------- world
    this.tunnel = new Tunnel(this.scene);
    this.obstacles = new Obstacles(this.scene);
    this.player = new Player(this.scene);
    this.powerups = new PowerUps(this.scene);
    this.particles = new ParticleSystem(this.scene, 2400);
    this.generator = new ProceduralGenerator(1);
    this.collision = new CollisionSystem();

    this.qualityName = null;
    this.autoQuality = this.save.settings.quality === 'auto';
    this.applyQuality(this.resolveQuality(this.save.settings.quality), true);

    // ---------------------------------------------------------- UI / input
    this.progression = new Progression(this.save);
    this.ui = new UIManager(this.save, this.audio, this.uiHandlers());
    this.ui.setProgression(this.progression);
    this.runsSinceBreak = 0;
    this.daily = false;
    this.run = newRunStats();
    this.input = new InputManager(document.getElementById('touch-layer'), {
      onPause: () => this.togglePause(),
      onConfirm: () => {
        if (this.state === 'gameover' && this.ui.current === 'gameover') this.retry();
        else if (this.state === 'menu' && this.ui.current === 'menu') this.startRun({ daily: false });
      },
      onMute: () => this.toggleMute(),
      onAnyInput: () => this.audio.unlock(),
    });
    this.input.setMode(this.save.settings.touchMode);

    // ---------------------------------------------------------- state
    this.state = 'loading';
    this.time = 0;
    this.distance = 0;
    this.frame = 0;
    this.timeScale = 1;
    this.frozen = false; // test hook: stop simulation, keep rendering
    this.fixedSeed = null;
    this.invincible = false;
    this.autopilot = false;
    this.trauma = 0;
    this.previewSkin = null;
    this.menuSpin = 0;
    this.camAngle = 0;
    this.camRoll = 0;
    this.fov = 70;
    this.frameTimes = new Float32Array(90);
    this.frameIdx = 0;
    this.qualityCooldown = 4;
    this.fps = 60;
    this.resetRunState();
    this.applySkin();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing' || this.state === 'countdown') this.pause();
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
    this.resize();
    this.installHooks();
  }

  async start() {
    this.platform.loadingStart();
    await this.platform.init();
    this.platform.onMuteChange((muted) => this.audio.setExternalMute(muted));
    try {
      await document.fonts?.load?.('700 20px Orbitron');
    } catch {
      /* fonts optional */
    }
    // warm up shaders so the first run does not hitch
    this.renderer.compile(this.scene, this.camera);
    this.platform.loadingStop();
    this.goMenu();
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  // ================================================================ quality

  resolveQuality(setting) {
    if (setting !== 'auto') return setting;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    return this.isTouch || small ? 'medium' : 'high';
  }

  applyQuality(name, initial = false) {
    if (name === this.qualityName && !initial) return;
    this.qualityName = name;
    const q = QUALITY[name];
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    this.renderer.setPixelRatio(dpr);
    this.particles.budget = q.particles;

    if (this.dust) {
      this.scene.remove(this.dust.points);
      this.dust.points.geometry.dispose();
      this.dust.points.material.dispose();
    }
    if (this.streaks) {
      this.scene.remove(this.streaks.lines);
      this.streaks.lines.geometry.dispose();
      this.streaks.lines.material.dispose();
    }
    this.dust = new Dust(this.scene, q.dust);
    this.dust.setColor(THEMES[this.tunnel.themeIndex].dust);
    this.streaks = new SpeedStreaks(this.scene, q.streaks);

    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (q.bloom) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
        type: THREE.HalfFloatType,
        samples: name === 'high' ? 4 : 0,
      });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomBase(), 0.38, 0.95);
      this.composer.addPass(this.bloom);
      this.finalPass = new ShaderPass(FinalShader);
      this.composer.addPass(this.finalPass);
      this.composer.addPass(new OutputPass());
    } else {
      this.bloom = null;
      this.finalPass = null;
    }
    if (!initial) this.resize();
    this.ui?.refreshSettings(this.qualityLabel());
  }

  /** Bloom strength from quality preset and the player's GLOW setting. */
  bloomBase() {
    return (this.qualityName === 'high' ? 0.55 : 0.48) * (this.save.settings.glow ?? 1);
  }

  qualityLabel() {
    return `${this.qualityName.toUpperCase()}${this.autoQuality ? ' (AUTO)' : ''} · ${this.renderer.getPixelRatio().toFixed(2)}x · ${this.quality.bloom ? 'BLOOM' : 'NO BLOOM'}`;
  }

  /** Adaptive quality: steps down when sustained frame time is too high. */
  monitorPerformance(realDt) {
    this.frameTimes[this.frameIdx] = realDt;
    this.frameIdx = (this.frameIdx + 1) % this.frameTimes.length;
    let sum = 0;
    for (let i = 0; i < this.frameTimes.length; i += 1) sum += this.frameTimes[i];
    const avg = sum / this.frameTimes.length;
    this.fps = avg > 0 ? 1 / avg : 60;
    if (!this.autoQuality || this.state !== 'playing') return;
    this.qualityCooldown -= realDt;
    if (this.qualityCooldown > 0) return;
    if (avg > 1 / 45) {
      const next = this.qualityName === 'high' ? 'medium' : this.qualityName === 'medium' ? 'low' : null;
      if (next) {
        this.applyQuality(next);
        this.frameTimes.fill(1 / 60);
      }
      this.qualityCooldown = 5;
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
    }
    this.portrait = h > w;
  }

  // ================================================================ UI wiring

  uiHandlers() {
    return {
      play: () => this.startRun({ daily: false }),
      daily: () => this.startRun({ daily: true }),
      retry: () => this.retry(),
      continue: () => this.continueRun(),
      double: () => this.doubleEnergy(),
      progress: () => {
        this.backTo = 'menu';
        this.ui.show('progress');
      },
      resume: () => this.resume(),
      pause: () => this.togglePause(),
      menu: () => this.goMenu(),
      mute: () => this.toggleMute(),
      skins: () => {
        this.ui.show('skins');
        this.backTo = 'menu';
      },
      settings: () => {
        this.backTo = this.state === 'paused' ? 'pause' : 'menu';
        this.ui.show('settings');
        this.ui.refreshSettings(this.qualityLabel());
      },
      howto: () => {
        this.backTo = 'menu';
        this.ui.show('howto');
      },
      back: () => {
        this.previewSkin = null;
        this.applySkin();
        this.ui.show(this.backTo || 'menu');
      },
      skin: (skin) => {
        if (this.save.isUnlocked(skin.id)) {
          this.save.selectSkin(skin.id);
        } else if (this.save.unlock(skin)) {
          this.save.selectSkin(skin.id);
          this.audio.powerUp('shield');
          this.ui.flash('#ffffff', 0.25);
        } else {
          this.audio.uiDenied();
        }
        this.previewSkin = null;
        this.applySkin();
        this.ui.refreshSkins();
      },
      previewSkin: (skin) => {
        this.previewSkin = skin;
        this.applySkin();
      },
      setting: (key, value) => {
        this.save.setSetting(key, value);
        if (key === 'touchMode') this.input.setMode(value);
        if (key === 'quality') {
          this.autoQuality = value === 'auto';
          this.applyQuality(this.resolveQuality(value));
        }
        this.audio.applyVolumes();
        this.ui.refreshMute();
      },
      'reset-progress': () => {
        this.ui.confirm('Reset best score, energy and skins?', () => {
          this.save.reset();
          this.progression.ensure();
          this.save.save();
          this.audio.settings = this.save.settings;
          this.audio.applyVolumes();
          this.applySkin();
          this.ui.refreshSettings(this.qualityLabel());
        });
      },
    };
  }

  toggleMute() {
    this.audio.unlock();
    this.save.setSetting('muted', !this.save.settings.muted);
    this.audio.applyVolumes();
    this.ui.refreshMute();
    this.ui.refreshSettings();
  }

  applySkin() {
    const id = this.save.data.selectedSkin;
    const skin = this.previewSkin || SKINS.find((s) => s.id === id) || SKINS[0];
    this.player.applySkin(skin);
    const c = new THREE.Color(skin.core);
    this.tunnel.uniforms.uPlayerColor.value.set(c.r * 0.55, c.g * 0.55, c.b * 0.55);
    if (skin.dark) this.tunnel.uniforms.uPlayerColor.value.set(0.35, 0, 0.32);
  }

  // ================================================================ states

  resetRunState() {
    this.elapsed = 0;
    this.distance = 0;
    this.prevDistance = 0;
    this.speed = SPEED.start;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.runEnergy = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.nearMisses = 0;
    this.tier = 0;
    this.invulnTimer = 0;
    this.boostGrace = 0;
    this.dyingTimer = 0;
    this.countdownTimer = 0;
    this.hitstop = 0;
    this.killer = null;
    this.nearMisses = 0;
  }

  goMenu() {
    this.state = 'menu';
    this.platform.gameplayStop();
    this.timeScale = 1;
    this.obstacles.clear();
    this.powerups.clear();
    this.particles.clear();
    this.player.reset();
    this.player.setVisible(true);
    this.input.setEnabled(false);
    this.ui.setHud(false);
    this.ui.showTouchHint(false);
    this.ui.show('menu');
    this.audio.setMode('menu');
    this.ui.setDaily(false);
  }

  /** Retry from game over; every few runs a portal may show a midgame break. */
  async retry() {
    if (this.breakPending) return;
    this.runsSinceBreak += 1;
    if (this.runsSinceBreak >= 3 && this.platform.name !== 'local') {
      this.breakPending = true;
      const r = await this.platform.requestBreak('midgame', this.adHooks());
      this.breakPending = false;
      if (r.shown) this.runsSinceBreak = 0;
    }
    this.startRun({ daily: this.daily });
  }

  adHooks() {
    return {
      pause: () => {
        this.audio.suspend();
        this.adPlaying = true;
      },
      resume: () => {
        this.adPlaying = false;
        this.audio.resume();
      },
    };
  }

  /** Rewarded continue: once per run, revives at the crash point with a safe window. */
  async continueRun() {
    if (this.state !== 'gameover' || this.continueUsed || !this.saveSnapshot || this.breakPending) return;
    this.breakPending = true;
    const r = await this.platform.requestBreak('rewarded', this.adHooks());
    this.breakPending = false;
    if (!r.shown || this.state !== 'gameover') return;
    // undo the recorded result: the run is not over yet
    this.save.data = this.saveSnapshot;
    this.save.save();
    this.progression.ensure();
    this.audio.settings = this.save.settings;
    this.saveSnapshot = null;
    this.continueUsed = true;
    this.distance = this.deathDistance;
    this.prevDistance = this.distance;
    for (const o of this.obstacles.active) {
      if (o.s > this.distance - 4 && o.s < this.distance + 50) {
        o.smashed = true;
        o.passed = true;
      }
    }
    this.obstacles.killer = null;
    this.killer = null;
    this.particles.clear();
    this.player.setVisible(true);
    this.player.omega = 0;
    this.invulnTimer = 3;
    this.timeScale = 1;
    this.trauma = 0;
    this.ui.setHud(true);
    this.ui.toast('SECOND CHANCE', 'Shield-up for 3 seconds');
    this.state = 'paused';
    this.resume();
  }

  async doubleEnergy() {
    if (this.state !== 'gameover' || this.doubleUsed || this.runEnergy <= 0 || this.breakPending) return;
    this.breakPending = true;
    const r = await this.platform.requestBreak('rewarded', this.adHooks());
    this.breakPending = false;
    if (!r.shown) return;
    this.doubleUsed = true;
    this.saveSnapshot = null; // energy has been banked twice: no more continue
    this.save.data.energyBank += this.runEnergy;
    this.save.save();
    this.ui.toast('ENERGY DOUBLED', `+${this.runEnergy} ⬢ banked`);
    this.ui.$('go-energy').textContent = `+${this.runEnergy * 2}`;
    this.ui.setRewarded({ continueAvailable: false, doubleAvailable: false });
  }

  startRun({ daily = this.daily } = {}) {
    this.daily = !!daily;
    this.continueUsed = false;
    this.doubleUsed = false;
    this.saveSnapshot = null;
    this.run = newRunStats();
    this.liveCheckTimer = 0;
    this.audio.unlock();
    this.resetRunState();
    const seed = this.daily ? dailySeed() : this.fixedSeed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.runSeed = seed;
    this.generator.reset(seed);
    this.obstacles.clear();
    this.powerups.clear();
    this.particles.clear();
    this.player.reset();
    this.player.setVisible(true);
    this.applySkin();
    this.tunnel.setTheme(0, true);
    this.audio.setZone(0);
    this.ui.setDaily(this.daily);
    this.dust.setColor(THEMES[0].dust);
    this.camAngle = 0;
    this.timeScale = 1;
    this.trauma = 0;
    this.state = 'playing';
    this.input.clear();
    this.input.setEnabled(true);
    this.ui.show(null);
    this.ui.setHud(true);
    this.ui.resetHud(this.save.data.best);
    this.ui.banner('ZONE 1', THEMES[0].name, '#00f5ff');
    this.showHintUntil = this.isTouch ? 3.5 : 0;
    this.ui.showTouchHint(this.isTouch, this.input.mode);
    this.tutorialStep = this.save.data.seenTutorial ? -1 : 0;
    this.tutorialTimer = 0;
    this.tutorialTurn = 0;
    this.generator.forceOrbRows = this.tutorialStep === 0 ? 5 : 0;
    this.ui.tutorial(this.tutorialStep === 0 ? this.tutorialText(0) : null);
    this.audio.setMode('game');
    this.audio.setIntensity(0);
    this.platform.gameplayStart();
    this.qualityCooldown = 4;
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused' && this.ui.current === 'pause') this.resume();
    else if (this.state === 'gameover' && this.ui.current === 'gameover') this.retry();
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.input.clear();
    this.ui.show('pause');
    this.audio.setMode('paused');
    this.platform.gameplayStop();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'countdown';
    this.countdownTimer = 1.2;
    this.countdownShown = 0;
    this.ui.show('countdown');
    this.ui.countdown('3');
    this.audio.countdown(false);
    this.input.setEnabled(true);
  }

  die(obstacle) {
    this.state = 'dying';
    this.killer = obstacle ?? null;
    this.obstacles.killer = obstacle ?? null;
    this.ui.tutorial(null);
    this.dyingTimer = 0;
    this.timeScale = 0.12;
    this.input.setEnabled(false);
    this.platform.gameplayStop();
    const pos = this.player.position.clone();
    const typeColor = { spikes: 0xff00e5, laser: 0xff1f3d, blades: 0xff9500, wall: 0x7ffcff, gate: 0x4d8dff }[obstacle?.type] ?? 0xffffff;
    const c1 = new THREE.Color(this.player.skin.spark).multiplyScalar(2.5);
    const c2 = new THREE.Color(typeColor).multiplyScalar(2.5);
    this.particles.burst(pos, c1, 220, 26, 0.5, 1.6, { drag: 1.3 });
    this.particles.burst(pos, c2, 140, 18, 0.45, 1.3, { drag: 1.6 });
    this.particles.burst(pos, COLOR_WHITE, 60, 40, 0.3, 0.6, { drag: 2.5 });
    this.particles.ring(pos, c1, 64, 22, 0.4, 0.9);
    this.player.setVisible(false);
    this.trauma = 1;
    this.tunnel.flash(c2, 1);
    this.ui.flash('#ffffff', 0.8, 500);
    this.audio.explosion();
    this.audio.setMode('over');
  }

  finishRun() {
    this.state = 'gameover';
    const score = Math.floor(this.score);
    this.deathDistance = this.distance;
    // snapshot so a rewarded continue can undo this result
    this.saveSnapshot = JSON.parse(JSON.stringify(this.save.data));
    this.syncRunStats();
    this.run.score = score;
    const isBest = this.save.recordRun(score, this.distance, this.runEnergy);
    const summary = this.progression.commitRun(this.run, { daily: this.daily });
    if (isBest || summary.achievements.length) this.platform.celebrate();
    this.ui.setHud(false);
    this.ui.showTouchHint(false);
    const canReward = this.platform.supportsRewarded;
    this.ui.showGameOver({
      score,
      best: this.save.data.best,
      distance: this.distance,
      energy: this.runEnergy,
      time: this.elapsed,
      isBest,
      cause: this.causeOf(this.killer),
      summary,
      daily: this.daily,
      dailyBest: !!summary.dailyBest,
      dailyBestScore: this.progression.dailyBestToday(),
      rewarded: { continueAvailable: canReward && !this.continueUsed && this.elapsed > 8, doubleAvailable: canReward && this.runEnergy > 0 },
    });

  }

  syncRunStats() {
    const r = this.run;
    r.distance = Math.floor(this.distance);
    r.energy = this.runEnergy;
    r.nearMisses = this.nearMisses;
    r.time = this.elapsed;
    r.zone = this.progression.zoneFor(this.distance);
    r.maxMultiplier = Math.max(r.maxMultiplier, this.multiplier);
  }

  causeOf(o) {
    if (!o) return null;
    const moving = o.motion !== 'static';
    switch (o.type) {
      case 'spikes':
        return { name: 'NEON SPIKES', color: '#ff00e5', tip: 'Spikes never move: pick your side early.' };
      case 'laser':
        return { name: moving ? 'ROTATING LASER' : 'LASER BARRIER', color: '#ff1f3d', tip: 'Dashed red lines are lasers charging. Choose your gap before they ignite.' };
      case 'blades':
        return { name: 'ENERGY BLADES', color: '#ff9500', tip: 'Watch the dashed orange ring and slip through as a gap sweeps past.' };
      case 'wall':
        return { name: moving ? 'MOVING WALL' : 'METAL WALL', color: '#7ffcff', tip: moving ? 'Walls slide: aim for where the gap will be, not where it is.' : 'Steer early: big walls need a long turn.' };
      case 'gate':
        return { name: 'ENERGY GATE', color: '#4d8dff', tip: 'Aim for the opening framed by the bright pylons.' };
      default:
        return null;
    }
  }

  tutorialText(step) {
    if (step === 0) {
      if (!this.isTouch) return 'HOLD <b>A / D</b> OR <b>← / →</b> TO ROTATE';
      return this.input.mode === 'drag' ? 'SLIDE ONE FINGER <b>LEFT</b> OR <b>RIGHT</b> TO ROTATE' : 'HOLD THE <b>LEFT</b> OR <b>RIGHT</b> SIDE TO ROTATE';
    }
    if (step === 1) return 'FOLLOW THE <b class="gold">ENERGY</b> TRAIL';
    return 'SKIM PAST HAZARDS FOR A <b class="pink">NEAR MISS</b> BONUS';
  }

  updateTutorial(dt) {
    if (this.tutorialStep < 0) return;
    this.tutorialTimer += dt;
    let next = false;
    if (this.tutorialStep === 0) {
      this.tutorialTurn += Math.abs(this.player.angle - this.player.prevAngle);
      next = this.tutorialTurn > 1.2 || this.tutorialTimer > 12;
    } else if (this.tutorialStep === 1) {
      next = this.runEnergy >= 4 || this.tutorialTimer > 7;
    } else {
      next = this.nearMisses > 0 || this.tutorialTimer > 5;
    }
    if (!next) return;
    this.tutorialStep += 1;
    this.tutorialTimer = 0;
    if (this.tutorialStep > 2) {
      this.tutorialStep = -1;
      this.ui.tutorial(null);
      this.save.data.seenTutorial = true;
      this.save.save();
    } else {
      this.ui.tutorial(this.tutorialText(this.tutorialStep));
    }
  }

  // ================================================================ loop

  tick(now) {
    this.renderer.info.reset();
    const realDt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frame += 1;
    this.monitorPerformance(realDt);
    if (this.state !== 'playing') this.input.consumeDrag(); // drop drags made outside play
    if (!this.frozen) this.update(realDt);
    this.render(realDt);
    this.publishDiagnostics();
  }

  update(realDt) {
    this.time += realDt;
    const state = this.state;
    if (state === 'playing') {
      this.updatePlay(realDt);
    } else if (state === 'countdown') {
      this.countdownTimer -= realDt;
      const shown = this.countdownTimer > 0.8 ? '3' : this.countdownTimer > 0.4 ? '2' : '1';
      if (shown !== this.countdownShown) {
        if (this.countdownShown) {
          this.ui.countdown(shown);
          this.audio.countdown(false);
        }
        this.countdownShown = shown;
      }
      if (this.countdownTimer <= 0) {
        this.state = 'playing';
        this.ui.show(null);
        this.audio.countdown(true);
        this.audio.setMode('game');
        this.platform.gameplayStart();
      }
      this.updateWorld(0, 0);
    } else if (state === 'paused') {
      this.updateWorld(0, 0);
    } else if (state === 'dying') {
      this.dyingTimer += realDt;
      this.timeScale = Math.min(0.7, 0.12 + this.dyingTimer * this.dyingTimer * 0.35);
      const dt = realDt * this.timeScale;
      this.prevDistance = this.distance;
      this.updateWorld(dt, 0);
      if (this.dyingTimer > 1.35) this.finishRun();
    } else {
      // menu / game over attract mode: gentle cruise through the tunnel
      const cruise = state === 'gameover' ? 6 : 16;
      const dt = realDt;
      this.prevDistance = this.distance;
      this.distance += cruise * dt;
      const themeIdx = Math.floor(this.time / 14) % THEMES.length;
      if (state === 'menu' && themeIdx !== this.tunnel.themeIndex) {
        this.tunnel.setTheme(themeIdx);
        this.audio.setZone(themeIdx);
        this.dust.setColor(THEMES[themeIdx].dust);
      }
      this.updateWorld(dt, cruise * dt);
    }
    this.updateCamera(realDt);
  }

  updatePlay(realDt) {
    let dt = realDt;
    if (this.hitstop > 0) {
      // brief slow-motion punch on near misses
      this.hitstop -= realDt;
      dt = realDt * 0.25;
    }
    this.elapsed += dt;
    const base = speedAt(this.elapsed);
    const boosting = this.powerups.isActive('boost');
    const target = boosting ? base * SPEED.boostMultiplier : base;
    this.speed += (target - this.speed) * (1 - Math.exp(-(boosting ? 5 : 2.5) * dt));

    this.prevDistance = this.distance;
    this.distance += this.speed * dt;

    let dir = this.input.direction();
    // one-finger drag: the finger sets a target angle the sphere chases at its
    // normal (fair) turning speed, so dragging can never out-turn the keys
    const drag = this.input.consumeDrag();
    if (drag.active) {
      if (drag.started) this.dragTarget = this.player.angle;
      this.dragTarget += drag.dx * (3.2 / Math.max(320, window.innerWidth));
      let err = this.dragTarget - this.player.angle;
      if (Math.abs(err) > 1.4) {
        this.dragTarget = this.player.angle + Math.sign(err) * 1.4;
        err = Math.sign(err) * 1.4;
      }
      if (dir === 0 && Math.abs(err) > 0.012) dir = Math.max(-1, Math.min(1, err * 5));
    }
    if (this.autopilot) dir = this.autopilotDirection();
    this.player.updateMovement(dt, dir, this.speed);

    // procedural generation ahead of the player
    this.generator.update(this.elapsed, this.distance, base);
    const out = this.generator.out;
    for (let i = 0; i < out.obstacles.length; i += 1) this.obstacles.add(out.obstacles[i]);
    for (let i = 0; i < out.pickups.length; i += 1) this.powerups.add(out.pickups[i]);
    out.obstacles.length = 0;
    out.pickups.length = 0;

    // collisions
    const hit = this.collision.check(this.obstacles.active, this.prevDistance, this.distance, this.player.prevAngle, this.player.angle, (o, c) => this.onNearMiss(o, c));
    if (hit) {
      if (boosting || this.boostGrace > 0 || this.invulnTimer > 0 || this.invincible) {
        this.smash(hit, boosting || this.boostGrace > 0);
      } else if (this.powerups.isActive('shield')) {
        this.powerups.timers.shield = 0;
        this.run.shieldSaves += 1;
        this.invulnTimer = 0.8;
        this.smash(hit, false);
        this.combo = 0;
        this.trauma = Math.min(1, this.trauma + 0.6);
        this.ui.flash('#39ff14', 0.45, 400);
        this.ui.popup('SHIELD <b>BROKEN</b>', 'power', '#39ff14');
        this.audio.shieldBreak();
      } else {
        this.die(hit);
        this.updateWorld(dt, this.speed * dt);
        return;
      }
    }
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // power-ups
    const wasBoost = boosting;
    this.powerups.tickTimers(dt);
    if (wasBoost && !this.powerups.isActive('boost')) {
      this.boostGrace = 0.9;
      this.audio.powerDown();
    }
    this.boostGrace = Math.max(0, this.boostGrace - dt);

    // scoring
    this.score += this.speed * dt * SCORE.perUnit * this.multiplier * 0.5;
    this.comboTimer += dt;
    if (this.comboTimer > SCORE.comboDecaySeconds && this.combo > 0) {
      this.combo = Math.max(0, this.combo - SCORE.comboPerMultiplier);
      this.comboTimer = SCORE.comboDecaySeconds * 0.6;
    }
    this.multiplier = Math.min(SCORE.maxMultiplier, 1 + Math.floor(this.combo / SCORE.comboPerMultiplier));
    this.chainTimer += dt;
    if (this.chainTimer > 0.9) this.chain = 0;

    // progression feedback
    const tier = tierAt(this.elapsed);
    if (tier !== this.tier) {
      this.tier = tier;
      this.ui.banner('SPEED UP', TIERS[tier].name, ['#00f5ff', '#39ff14', '#ff9500', '#ff00e5'][tier]);
      this.audio.tierUp();
      this.trauma = Math.min(1, this.trauma + 0.2);
    }
    const themeIdx = this.tunnel.themeForDistance(this.distance);
    if (themeIdx !== this.tunnel.themeIndex) {
      this.tunnel.setTheme(themeIdx);
      this.dust.setColor(THEMES[themeIdx].dust);
      const zone = Math.floor(this.distance / 1800) + 1;
      const a = THEMES[themeIdx].neonA;
      this.ui.banner(`ZONE ${zone}`, THEMES[themeIdx].name, `rgb(${Math.min(255, a[0] * 110)},${Math.min(255, a[1] * 110)},${Math.min(255, a[2] * 110)})`);
      this.audio.themeChange();
      this.audio.setZone(themeIdx);
      this.particles.ring(TMP.set(0, 0, -20), new THREE.Color(a[0], a[1], a[2]), 90, 4, 0.7, 2.2);
    }

    this.updateTutorial(dt);
    this.liveCheckTimer += dt;
    if (this.liveCheckTimer > 0.5) {
      this.liveCheckTimer = 0;
      this.syncRunStats();
      for (const m of this.progression.checkLive(this.run)) {
        this.ui.toast('MISSION COMPLETE', `${this.progression.missionText(m)} · +${m.reward} ⬢`);
        this.audio.tierUp();
      }
    }
    if (this.showHintUntil > 0 && this.elapsed > this.showHintUntil) {
      this.showHintUntil = 0;
      this.ui.showTouchHint(false);
    }

    // audio feedback
    const speedNorm = (this.speed - SPEED.start) / (SPEED.max - SPEED.start);
    this.audio.setIntensity(Math.max(speedNorm, difficultyAt(this.elapsed) * 0.9));
    this.audio.setMovement(Math.min(1, Math.abs(this.player.omega) / 3.5), speedNorm);

    // player sparks
    const pp = this.player.position;
    if (Math.random() < 0.7 * this.quality.particles) {
      const c = this.player.sparkColor;
      this.particles.spawn(pp.x + (Math.random() - 0.5) * 0.3, pp.y + (Math.random() - 0.5) * 0.3, pp.z + 0.3, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, c, 0.12 + Math.random() * 0.1, 0.45, 2, 1);
    }
    if (boosting && Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2;
      this.particles.spawn(Math.cos(a) * 4.5, Math.sin(a) * 4.5, -30 - Math.random() * 30, 0, 0, 0, COLOR_WHITE, 0.25, 0.6, 0, 1);
    }

    this.updateWorld(dt, this.speed * dt);
    this.ui.updateHud(dt, {
      score: this.score,
      best: this.save.data.best,
      multiplier: this.multiplier,
      comboFrac: (this.combo % SCORE.comboPerMultiplier) / SCORE.comboPerMultiplier + (this.multiplier >= SCORE.maxMultiplier ? 1 : 0),
      distance: this.distance,
      speed: this.speed,
      timers: this.powerups.timers,
      held: this.input.heldSides(),
    });
  }

  updateWorld(dt, scroll) {
    const playing = this.state === 'playing';
    const menuMode = this.state === 'menu';
    this.obstacles.prune(this.distance);
    this.obstacles.update(dt, this.distance, this.time, Math.max(this.speed, 16));
    const ev = this.obstacles.events;
    for (let i = 0; i < ev.length; i += 1) {
      const e = ev[i];
      TMP.set(e.x, e.y, e.z);
      this.particles.burst(TMP, IGNITE_COLOR, 16, 5, 0.35, 0.5, { drag: 3 });
    }
    if (ev.length && playing && this.time - (this.lastChargeSfx ?? -1) > 0.25) {
      this.lastChargeSfx = this.time;
      this.audio.laserCharge();
    }
    ev.length = 0;
    this.powerups.update(
      dt,
      this.prevDistance,
      this.distance,
      this.time,
      this.player.angle,
      this.player.prevAngle,
      (x, y, z) => this.onEnergy(x, y, z),
      (type, pos) => this.onPowerUp(type, pos),
      playing,
    );
    const boost = this.powerups.isActive('boost') ? 1 : 0;
    this.boostFx = (this.boostFx ?? 0) + (boost - (this.boostFx ?? 0)) * (1 - Math.exp(-4 * Math.max(dt, 0.016)));
    this.player.updateVisual(dt || 0.016, this.time, this.distance, this.powerups.isActive('shield'), boost > 0, menuMode);
    if (menuMode) this.placeMenuSphere();
    this.particles.update(dt, scroll);
    this.dust.update(dt, scroll, this.time);
    this.streaks.update(dt, scroll, menuMode ? 20 : this.speed, this.boostFx);
    this.streaks.setTint(this.tunnel.uniforms.uNeonA.value);
    this.tunnel.update(dt, this.distance, this.time, this.player.visible ? this.player : null, this.boostFx, this.audio.beat() * (playing ? 1 : 0.3));
    const fog = this.tunnel.fogColor;
    this.scene.fog.color.setRGB(fog.x, fog.y, fog.z);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
  }

  placeMenuSphere() {
    const g = this.player.group;
    const wide = !this.portrait && this.camera.aspect > 1.15;
    g.position.set(wide ? 2.2 : 0, wide ? -0.2 : 2.75, wide ? 0 : 2.6);
    this.player.visual.scale.multiplyScalar(wide ? 1 : 0.42);
    this.menuSpin += 0.01;
    this.player.visual.rotation.y = this.menuSpin;
    this.player.visual.rotation.x = Math.sin(this.menuSpin * 0.7) * 0.3;
    this.player.belt.scale.copy(this.player.visual.scale);
  }

  onNearMiss(o, clearanceWorld) {
    if (this.state !== 'playing') return;
    this.nearMisses += 1;
    const pts = SCORE.nearMiss * this.multiplier;
    this.score += pts;
    this.combo += 3;
    this.comboTimer = 0;
    this.trauma = Math.min(1, this.trauma + 0.18);
    this.ui.popup(`NEAR MISS <b>+${pts}</b>`, 'near');
    this.ui.bumpMultiplier();
    this.audio.nearMiss();
    this.hitstop = 0.07;
    // sparks fly off the exact edge the sphere skimmed
    const rot = rotationAt(o, 0);
    const pa = this.player.angle;
    let edge = pa;
    let best = Infinity;
    for (const arc of o.arcs) {
      for (const sgn of [-1, 1]) {
        const e = rot + arc.a + sgn * arc.h;
        const d = Math.abs(angleDiff(pa, e));
        if (d < best) {
          best = d;
          edge = pa + angleDiff(e, pa);
        }
      }
    }
    const rp = PLAYER.orbitRadius;
    const ex = Math.sin(edge) * rp;
    const ey = -Math.cos(edge) * rp;
    const ez = -(o.s - this.distance);
    const typeColor = TYPE_COLORS[o.type] ?? COLOR_WHITE;
    const n = Math.round(26 * this.quality.particles);
    for (let i = 0; i < n; i += 1) {
      const t = Math.cos(edge) * (Math.random() - 0.5) * 14;
      const u = Math.sin(edge) * (Math.random() - 0.5) * 14;
      this.particles.spawn(ex, ey, ez, t + (Math.random() - 0.5) * 3, u + (Math.random() - 0.5) * 3, 2 + Math.random() * 8, i % 3 === 0 ? COLOR_WHITE : typeColor, 0.16, 0.45, 3, 1);
    }
    void clearanceWorld;
  }

  onEnergy(x, y, z) {
    this.runEnergy += 1;
    this.combo += 1;
    this.comboTimer = 0;
    this.chain += 1;
    this.chainTimer = 0;
    this.score += SCORE.energy * this.multiplier;
    this.audio.collect(this.chain);
    TMP.set(x, y, z);
    this.particles.burst(TMP, new THREE.Color(3, 2.5, 0.5), 14, 6, 0.22, 0.45, { drag: 3 });
  }

  onPowerUp(type, pos) {
    this.powerups.activate(type);
    this.run.powerups += 1;
    const color = new THREE.Color(POWERUPS[type].color);
    const hdrColor = color.clone().multiplyScalar(2.5);
    this.particles.ring(this.player.position, hdrColor, 48, 9, 0.35, 0.7);
    this.particles.burst(pos, hdrColor, 40, 10, 0.3, 0.7);
    this.tunnel.flash(hdrColor, 0.8);
    this.ui.flash(`#${color.getHexString()}`, 0.28, 350);
    this.ui.popup(`${POWERUPS[type].icon} ${POWERUPS[type].label}`, 'power', `#${color.getHexString()}`);
    this.audio.powerUp(type);
    if (type === 'boost') this.trauma = Math.min(1, this.trauma + 0.35);
  }

  smash(o, boosted) {
    o.smashed = true;
    o.passed = true;
    const typeColor = { spikes: 0xff00e5, laser: 0xff1f3d, blades: 0xff9500, wall: 0x9ffcff, gate: 0x4d8dff }[o.type] ?? 0xffffff;
    const c = new THREE.Color(typeColor).multiplyScalar(2.5);
    TMP.set(0, 0, -(o.s - this.distance));
    const pp = this.player.position;
    TMP.x = pp.x;
    TMP.y = pp.y;
    this.particles.burst(TMP, c, 70, 16, 0.35, 0.8, { drag: 2 });
    this.particles.ring(TMP.set(0, 0, TMP.z), c, 40, 7, 0.3, 0.6);
    this.trauma = Math.min(1, this.trauma + 0.3);
    if (boosted) {
      this.run.smashes += 1;
      const pts = SCORE.smashBonus * this.multiplier;
      this.score += pts;
      this.ui.popup(`SMASH <b>+${pts}</b>`, 'near', '#ff9500');
    }
    this.audio.smash();
  }

  // ================================================================ camera

  updateCamera(realDt) {
    const cam = this.camera;
    const menuLike = this.state === 'menu';
    const shakeOn = this.save.settings.shake;
    const shake = shakeOn ? this.trauma * this.trauma : 0;
    const t = this.time;
    const sx = shake * 0.32 * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 91.1) * 0.4);
    const sy = shake * 0.32 * (Math.sin(t * 53.7 + 1.3) * 0.6 + Math.sin(t * 79.9) * 0.4);
    const sr = shake * 0.03 * Math.sin(t * 61.7);

    if (menuLike) {
      cam.up.set(0, 1, 0);
      cam.position.set(Math.sin(t * 0.25) * 0.4 + sx, 0.3 + Math.cos(t * 0.21) * 0.25 + sy, 7.2);
      cam.lookAt(0, -0.1, -20);
      this.setFov(this.baseFov(66), realDt);
      return;
    }

    // follow the sphere's angle with lag; the tunnel appears to rotate while
    // the sphere stays near the bottom of the screen, so the next obstacles
    // are always laid out directly ahead of it.
    const target = this.player.angle;
    this.camAngle += angleDiff(target, this.camAngle) * (1 - Math.exp(-7.5 * realDt));
    const roll = THREE.MathUtils.clamp(-this.player.omega * 0.022, -0.09, 0.09);
    this.camRoll += (roll - this.camRoll) * (1 - Math.exp(-6 * realDt));
    const a = this.camAngle;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const camR = 2.55;
    const pull = this.state === 'dying' ? Math.min(1, this.dyingTimer * 1.5) * 2.2 : 0;
    cam.position.set(dx * (camR - pull * 0.4) + sx, dy * (camR - pull * 0.4) + sy, 7.4 + pull);
    const ra = this.camRoll + sr;
    cam.up.set(-dx, -dy, 0);
    cam.up.applyAxisAngle(TMP2.set(0, 0, 1), ra);
    cam.lookAt(dx * 1.0, dy * 1.0, -34);

    const speedNorm = THREE.MathUtils.clamp((this.speed - SPEED.start) / (SPEED.max - SPEED.start), 0, 1);
    this.setFov(this.baseFov(68) + speedNorm * 8 + (this.boostFx ?? 0) * 10, realDt);
  }

  /** Portrait screens get a wider vertical FOV so the tunnel walls stay in view. */
  baseFov(fov) {
    const aspect = this.camera.aspect;
    return aspect < 1 ? fov + (1 - aspect) * 38 : fov;
  }

  setFov(target, dt) {
    this.fov += (target - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  render(realDt) {
    const size = this.renderer.getDrawingBufferSize(TMP2.set(0, 0, 0));
    this.particles.setScale(size.y, this.camera.fov);
    this.dust.uniforms.uScale.value = this.particles.uniforms.uScale.value;
    if (this.composer) {
      this.finalPass.uniforms.uTime.value = this.time % 100;
      this.finalPass.uniforms.uAberration.value = (this.boostFx ?? 0) * 1.2 + this.trauma * 0.6;
      if (this.bloom) this.bloom.strength = this.bloomBase() + (this.boostFx ?? 0) * 0.15 * this.save.settings.glow;
      this.composer.render(realDt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ================================================================ autopilot (tests / attract)

  /** Greedy steering bot used by test hooks: aims for the safest reachable angle of the next rows. */
  autopilotDirection() {
    const pa = this.player.angle;
    let next = null;
    for (const o of this.obstacles.active) {
      if (o.passed || o.smashed) continue;
      if (o.s + o.hd < this.distance) continue;
      if (!next || o.s < next.s) next = o;
    }
    if (!next) return 0;
    let best = pa;
    let bestScore = -Infinity;
    const rot = rotationAt(next, 0);
    for (let k = -40; k <= 40; k += 1) {
      const cand = pa + k * 0.05;
      const c = clearance(next, rot, cand);
      const score = Math.min(c, 0.35) - Math.abs(k) * 0.002;
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    const d = best - pa;
    if (Math.abs(d) < PLAYER_HALF_ANGLE * 0.3) return 0;
    return d > 0 ? 1 : -1;
  }

  // ================================================================ diagnostics & hooks

  publishDiagnostics() {
    const info = this.renderer.info;
    const d = this.diag || (this.diag = { player: { position: {} }, renderer: {} });
    d.frame = this.frame;
    d.state = this.state;
    d.elapsed = this.elapsed;
    d.score = Math.floor(this.score);
    d.distance = this.distance;
    d.speed = this.speed;
    d.multiplier = this.multiplier;
    d.obstacles = this.obstacles.active.length;
    d.energy = this.runEnergy;
    d.seed = this.runSeed ?? null;
    d.quality = this.qualityName;
    d.fps = Math.round(this.fps);
    d.player.angle = this.player.angle;
    d.player.omega = this.player.omega;
    d.player.position.x = this.player.position.x;
    d.player.position.y = this.player.position.y;
    d.player.position.z = this.player.position.z;
    d.renderer.calls = info.render.calls;
    d.renderer.triangles = info.render.triangles;
    d.renderer.geometries = info.memory.geometries;
    d.renderer.textures = info.memory.textures;
    d.timers = this.powerups.timers;
    window.__THREE_GAME_DIAGNOSTICS__ = d;
  }

  /** Runs the simulation forward quickly with the autopilot (and optional invincibility). */
  fastForward(seconds, invincible = true) {
    const prevAuto = this.autopilot;
    const prevInv = this.invincible;
    this.autopilot = true;
    this.invincible = invincible;
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps && this.state === 'playing'; i += 1) {
      this.time += 1 / 60;
      this.updatePlay(1 / 60);
      this.updateCamera(1 / 60);
    }
    this.autopilot = prevAuto;
    this.invincible = prevInv;
  }

  installHooks() {
    const hooks = {
      seed: (n) => {
        this.fixedSeed = n >>> 0;
        return { seed: this.fixedSeed };
      },
      setPausedForScreenshot: (paused) => {
        this.frozen = !!paused;
        return { paused: this.frozen };
      },
      setInvincible: (v) => {
        this.invincible = !!v;
      },
      setAutopilot: (v) => {
        this.autopilot = !!v;
      },
      startRun: () => this.startRun({ daily: false }),
      /** Deterministic frame stepping for promo video capture (simulation is frozen between calls). */
      step: (frames = 1, dt = 1 / 30) => {
        for (let i = 0; i < frames; i += 1) {
          this.update(dt);
          this.updateCamera(dt);
        }
        this.render(dt);
        this.publishDiagnostics();
        return this.state;
      },
      getState: () => this.state,
      setState: async (name) => {
        this.frozen = false;
        switch (name) {
          case 'menu':
            document.body.classList.remove('promo-cover');
            this.goMenu();
            break;
          case 'cover':
            this.goMenu();
            document.body.classList.add('promo-cover');
            break;
          case 'skins':
          case 'settings':
          case 'howto':
            this.goMenu();
            this.uiHandlers()[name]();
            break;
          case 'active-play':
            this.startRun({ daily: false });
            this.fastForward(7);
            this.ui.showTouchHint(false);
            break;
          case 'late-game':
            this.startRun({ daily: false });
            this.elapsed = 125;
            this.speed = speedAt(125);
            this.distance = 1800 * 2 + 40;
            this.generator.lastRowS = this.distance + 30;
            this.generator.feasible.fill(1);
            this.tunnel.setTheme(2, true);
            this.dust.setColor(THEMES[2].dust);
            this.score = 24000;
            this.combo = 30;
            this.powerups.activate('shield');
            this.fastForward(4);
            break;
          case 'theme-1':
          case 'theme-2':
          case 'theme-3':
          case 'theme-4': {
            const n = Number(name.slice(-1));
            this.startRun({ daily: false });
            this.elapsed = 40 + n * 20;
            this.speed = speedAt(this.elapsed);
            this.distance = 1800 * n + 40;
            this.generator.lastRowS = this.distance + 30;
            this.generator.feasible.fill(1);
            this.tunnel.setTheme(n, true);
            this.dust.setColor(THEMES[n].dust);
            this.fastForward(3);
            break;
          }
          case 'portal':
            this.startRun({ daily: false });
            this.distance = 1800 - 70;
            this.elapsed = 45;
            this.speed = speedAt(45);
            this.generator.lastRowS = this.distance + 60;
            this.fastForward(0.5);
            break;
          case 'boost':
            this.startRun({ daily: false });
            this.fastForward(5);
            this.powerups.activate('boost');
            this.fastForward(1.2);
            break;
          case 'paused':
            this.startRun({ daily: false });
            this.fastForward(4);
            this.pause();
            break;
          case 'game-over':
            this.startRun({ daily: false });
            this.fastForward(6);
            {
              // die against the next real obstacle so the cause UI is exercised
              let next = null;
              for (const o of this.obstacles.active) if (!o.passed && !o.smashed && (!next || o.s < next.s)) next = o;
              if (next) {
                this.distance = next.s;
                this.player.angle = rotationAt(next, 0) + next.arcs[0].a;
              }
              this.die(next);
            }
            for (let i = 0; i < 120 && this.state === 'dying'; i += 1) this.update(1 / 60);
            break;
          default:
            throw new Error(`Unknown state: ${name}`);
        }
        // render a couple of frames so the capture reflects the new state
        this.render(1 / 60);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { state: name };
      },
    };
    window.__THREE_GAME_TEST_HOOKS__ = hooks;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.composer?.dispose();
  }
}

