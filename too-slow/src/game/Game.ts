import * as THREE from 'three';
import { AudioManager, type Sfx } from '../audio/AudioManager';
import { FollowCamera } from '../camera/FollowCamera';
import { SnailModel, type SnailPose } from '../characters/SnailModel';
import { Input } from '../core/Input';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Particles, SpeedLines, Trail } from '../fx/Effects';
import { TUNE, type RacerBody } from '../physics/RacerBody';
import { FIXED_DT, RACER_COUNT, RaceManager } from '../racing/RaceManager';
import { formatTime, Hud, ordinal } from '../ui/Hud';
import { loadBest, loadRaceCount, Menus, saveBest, saveRaceCount, type Settings } from '../ui/Menus';
import { createSeededRandom } from '../utils/random';
import { buildBackyard, type BackyardResult } from '../world/Backyard';
import { buildEnvironment, type EnvironmentResult } from '../world/Environment';
import { buildTerrain, type TerrainResult } from '../world/Terrain';
import { createNameTag } from '../world/Textures';
import { FINISH_S, KICKER, SECTIONS, track } from '../world/Track';

type GameState = 'menu' | 'racing' | 'results';

/** Displayed speed: arcade "km/h", calibrated for feel rather than physics. */
const KMH = 3.6;
const R = TUNE.radius;
const MAX_STEPS_PER_FRAME = 12;

const COLORS = {
  dust: new THREE.Color(0xe9dcc0),
  slime: new THREE.Color(0x9cf05a),
  water: new THREE.Color(0xc8f0ff),
  leaf: new THREE.Color(0xf0a02c),
  leafRed: new THREE.Color(0xd9542a),
  star: new THREE.Color(0xfff07a),
  boost: new THREE.Color(0xffb02e),
  white: new THREE.Color(0xffffff),
  mud: new THREE.Color(0x6b4a2e),
  grass: new THREE.Color(0x8fd060),
  confetti: [0xff5a4a, 0xffd23a, 0x4fb8ff, 0x7ad65a, 0xff8fd0].map((c) => new THREE.Color(c)),
};

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

interface RacerView {
  model: SnailModel;
  up: THREE.Vector3;
  pos: THREE.Vector3;
  slime: Trail;
  boost: Trail;
  tag: THREE.Sprite | null;
  sinceHit: number;
  dustTimer: number;
  crawlPhase: number;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.15, 1100);
  private readonly rig = new FollowCamera(this.camera);
  private readonly race = new RaceManager();
  private readonly views: RacerView[] = [];
  private readonly particles = new Particles();
  private readonly speedLines: SpeedLines;
  private readonly audio = new AudioManager();
  private readonly hud: Hud;
  private readonly menus: Menus;
  private readonly input: Input;
  private readonly env: EnvironmentResult;
  private readonly terrain: TerrainResult;
  private readonly backyard: BackyardResult;
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );
  private readonly fadeEl = document.getElementById('fade');

  private state: GameState = 'menu';
  private paused = false;
  private accumulator = 0;
  private alpha = 1;
  private frame = 0;
  private time = 0;
  private fps = 60;
  private seed = (Date.now() & 0xffff) + 1;
  private rng = createSeededRandom(this.seed);
  /** Visual-only randomness (particles): separate stream so it never perturbs the race. */
  private readonly fxRng = createSeededRandom(99);
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private muted = false;
  private maxDpr = 2;
  private finishTimer = 0;
  private resultsShown = false;
  private boostWasReady = false;
  private raceCount = loadRaceCount();
  private readonly seen = { roll: false, slide: false, boost: false, spin: false, steerTime: 0, stallTime: 0 };
  private lastSection = -1;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly basisX = new THREE.Vector3();
  private readonly basisZ = new THREE.Vector3();
  private readonly mat = new THREE.Matrix4();
  private readonly pose: SnailPose = {
    mode: 'crawl',
    speed: 0,
    forwardSpeed: 0,
    steer: 0,
    grounded: true,
    verticalSpeed: 0,
    rollAngle: 0,
    spinAngle: 0,
    boosting: false,
    sinceHit: 9,
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.env = buildEnvironment(this.scene, this.renderer);
    this.scene.add(this.env.group);
    this.terrain = buildTerrain();
    this.scene.add(this.terrain.group);

    this.hud = new Hud(this.race.profiles);
    this.menus = new Menus(
      {
        play: () => this.startRace(),
        resume: () => this.setPaused(false),
        restart: () => this.startRace(),
        toMenu: () => this.toMenu(),
        settingsChanged: (s) => this.applySettings(s),
        sound: (name) => {
          this.audio.unlock();
          this.audio.play(name);
        },
      },
      this.race.profiles,
    );
    this.backyard = buildBackyard(this.menus.settings.quality);
    this.scene.add(this.backyard.group);

    for (let i = 0; i < RACER_COUNT; i += 1) {
      const profile = this.race.profiles[i];
      const model = new SnailModel(profile, i / RACER_COUNT);
      this.scene.add(model.root);
      const slime = new Trail(new THREE.Color(0xa6f060), 0.85, 2.6, false);
      const boost = new Trail(new THREE.Color(profile.shell).lerp(COLORS.star, 0.45), 0.9, 0.5, true, 0.6);
      this.scene.add(slime.mesh, boost.mesh);
      let tag: THREE.Sprite | null = null;
      if (i > 0) {
        tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: createNameTag(profile.name, profile.shell), depthWrite: false, transparent: true }));
        tag.scale.set(2.6, 0.65, 1);
        tag.renderOrder = 6;
        this.scene.add(tag);
      }
      this.views.push({ model, up: new THREE.Vector3(0, 1, 0), pos: new THREE.Vector3(), slime, boost, tag, sinceHit: 9, dustTimer: 0, crawlPhase: 0 });
    }
    this.scene.add(this.particles.points);
    this.speedLines = new SpeedLines(this.fxRng);
    this.scene.add(this.speedLines.mesh);

    this.input = new Input({
      pause: () => this.onEscape(),
      respawn: () => {
        if (this.state === 'racing' && !this.paused && this.race.phase === 'racing') this.race.player.respawn();
      },
      mute: () => {
        this.muted = !this.muted;
        this.audio.setMuted(this.muted);
      },
      gesture: () => this.onGesture(),
    });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);

    this.applySettings(this.menus.settings);
    this.race.reset(this.rng);
    this.toMenu(true);
    resizeRenderer(this.renderer, this.camera, this.maxDpr);
    this.particles.setViewportHeight(this.canvas.clientHeight);
    this.installTestHooks();
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
    this.syncVisuals(1 / 60);
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    for (const v of this.views) v.model.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  // ------------------------------------------------------------- flow

  private readonly onBlur = () => {
    this.input.clear();
    if (this.state === 'racing' && !this.paused && this.race.phase !== 'finished' && (document.hidden || !document.hasFocus())) this.setPaused(true);
  };

  private onGesture(): void {
    const wasReady = this.audio.ready;
    this.audio.unlock();
    if (!wasReady && this.audio.ready) {
      this.applySettings(this.menus.settings);
      this.audio.setMusic(true, this.state === 'racing' ? 128 : 100);
    }
  }

  private onEscape(): void {
    if (this.menus.escape()) return;
    if (this.state !== 'racing' || this.race.phase === 'finished') return;
    this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.audio.play('pause');
    this.menus.show(paused ? 'pause' : 'none');
    if (paused) this.audio.silenceMotion();
    this.input.clear();
    this.canvas.focus();
  }

  private applySettings(s: Settings): void {
    this.audio.setVolumes(s.music, s.sfx);
    this.rig.shakeEnabled = s.shake;
    this.maxDpr = s.quality >= 2 ? 2 : s.quality === 1 ? 1.5 : 1;
    this.env.setShadowQuality(s.quality);
    this.renderer.shadowMap.needsUpdate = true;
  }

  private fade(then: () => void): void {
    const el = this.fadeEl;
    if (!el) {
      then();
      return;
    }
    el.classList.add('on');
    window.setTimeout(() => {
      then();
      el.classList.remove('on');
    }, 280);
  }

  private resetRaceVisuals(): void {
    this.particles.clear();
    for (const v of this.views) {
      v.slime.clear();
      v.boost.clear();
      v.sinceHit = 9;
      v.up.set(0, 1, 0);
    }
    this.accumulator = 0;
    this.alpha = 1;
    this.finishTimer = 0;
    this.resultsShown = false;
    this.boostWasReady = false;
    this.lastSection = -1;
    this.seen.roll = this.seen.slide = this.seen.boost = this.seen.spin = false;
    this.seen.steerTime = 0;
    this.seen.stallTime = 0;
  }

  private toMenu(immediate = false): void {
    const go = () => {
      this.state = 'menu';
      this.paused = false;
      this.race.autopilot = false;
      this.race.reset(this.rng);
      this.resetRaceVisuals();
      this.hud.show(false);
      this.hud.reset();
      this.menus.setBest(loadBest());
      this.menus.show('main');
      this.audio.silenceMotion();
      this.audio.setMusic(true, 100);
      this.rig.snap(this.race.player.pos, this.race.player.heading + Math.PI);
    };
    if (immediate) go();
    else this.fade(go);
  }

  private startRace(): void {
    this.onGesture();
    this.fade(() => this.beginRace());
  }

  private beginRace(): void {
    this.state = 'racing';
    this.paused = false;
    this.seed += 1;
    this.rng = createSeededRandom(this.seed);
    this.race.reset(this.rng);
    this.resetRaceVisuals();
    this.hud.reset();
    this.hud.show(true);
    this.menus.show('none');
    this.input.clear();
    this.rig.snap(this.race.player.pos, this.race.player.heading);
    this.race.startCountdown();
    this.audio.setMusic(true, 128);
    this.canvas.focus();
  }

  // ----------------------------------------------------------- update

  private update(delta: number, _elapsed: number): void {
    this.frame += 1;
    this.fps += (1 / Math.max(delta, 1e-3) - this.fps) * 0.05;
    if (resizeRenderer(this.renderer, this.camera, this.maxDpr)) this.particles.setViewportHeight(this.canvas.clientHeight);
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }
    if (this.paused) {
      this.publishDiagnostics();
      return;
    }
    this.time += delta;

    if (this.state === 'racing') {
      this.readInput();
      this.accumulator += Math.min(delta, 0.1);
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        this.race.step();
        this.accumulator -= FIXED_DT;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
      this.alpha = this.accumulator / FIXED_DT;
      this.handleEvents();
      this.updateRaceUi(delta);
    } else {
      this.alpha = 1;
    }

    this.syncVisuals(delta);
    this.publishDiagnostics();
  }

  private readInput(): void {
    const it = this.race.playerIntent;
    const live = this.race.phase === 'racing';
    it.steer = live ? this.input.steer : 0;
    it.throttle = live ? this.input.throttle : 0;
    it.slide = live && this.input.slide;
    it.spin = live ? this.input.spin : 0;
    const roll = this.input.takeRoll();
    const boost = this.input.takeBoost();
    if (live) {
      if (roll) it.toggleRoll = true;
      if (boost) it.boost = true;
    }
  }

  private sfxFor(index: number, name: Sfx, intensity = 1): void {
    if (index === 0) {
      this.audio.play(name, intensity);
      return;
    }
    // Rivals are audible only when they are close.
    const d = this.race.racers[index].pos.distanceTo(this.race.player.pos);
    if (d < 14) this.audio.play(name, intensity * (1 - d / 14) * 0.6);
  }

  private handleEvents(): void {
    const racers = this.race.racers;
    for (let i = 0; i < RACER_COUNT; i += 1) {
      const r = racers[i];
      if (r.events.length === 0) continue;
      const view = this.views[i];
      const me = i === 0;
      const foot = this.tmp.copy(r.pos).addScaledVector(r.normal, -R * 0.9);
      for (const e of r.events) {
        switch (e.type) {
          case 'land':
          case 'perfect':
          case 'hardLand':
          case 'sloppy': {
            const power = Math.min(1, e.value / 22);
            view.model.impact(0.35 + power);
            this.surfaceBurst(r, foot, 6 + Math.round(power * 14), 3 + power * 4);
            this.sfxFor(i, e.type === 'hardLand' ? 'hardLand' : 'land', 0.4 + power);
            if (me) {
              this.rig.addShake(e.type === 'hardLand' ? 0.6 : 0.12 + power * 0.3);
              if (e.type === 'perfect') {
                this.hud.toast('PERFECT LANDING!', 'great');
                this.audio.play('perfect');
              } else if (e.type === 'hardLand') this.hud.toast('HARD LANDING', 'bad');
              else if (e.type === 'sloppy') {
                this.hud.toast('SLOPPY LANDING!', 'bad', 'speed lost');
                this.audio.play('sloppy');
              }
            }
            break;
          }
          case 'trick':
            if (me) {
              const n = e.value;
              this.hud.toast(n === 1 ? 'SPIN!' : n === 2 ? 'DOUBLE SPIN!' : n === 3 ? 'TRIPLE SPIN!' : `${n}x SPIN!`, 'great', `+${n * n * 100}`);
              this.audio.play('trick');
              this.seen.spin = true;
            }
            this.particles.burst(r.pos, 14, COLORS.star, 4, 0.22, 0.7, 4, 1, this.fxRng);
            break;
          case 'bigAir':
            if (me) this.hud.toast('BIG AIR!', 'good', `${e.value.toFixed(1)}s`);
            break;
          case 'jump':
            this.sfxFor(i, 'jump');
            break;
          case 'hit':
          case 'boing': {
            const power = Math.min(1, e.value / 20);
            view.model.impact(0.3 + power * 0.6);
            view.sinceHit = 0;
            this.particles.burst(r.pos, 6 + Math.round(power * 10), COLORS.star, 4 + power * 4, 0.2, 0.5, 6, 1, this.fxRng);
            this.sfxFor(i, e.type === 'boing' ? 'boing' : 'hit', 0.4 + power);
            if (me) this.rig.addShake(0.2 + power * 0.5);
            break;
          }
          case 'bump':
            view.model.impact(0.25);
            this.particles.burst(r.pos, 4, COLORS.white, 3, 0.16, 0.35, 4, 1, this.fxRng);
            this.sfxFor(i, 'bump', Math.min(1, e.value / 8));
            if (me) this.rig.addShake(0.12);
            break;
          case 'boost':
            this.sfxFor(i, 'boost');
            this.particles.burst(r.pos, 18, COLORS.boost, 6, 0.26, 0.6, 2, 0.6, this.fxRng);
            if (me) {
              this.hud.toast('SHELL BOOST!', 'great');
              this.rig.addShake(0.25);
              this.seen.boost = true;
            }
            break;
          case 'splash':
            this.particles.burst(foot, 20, COLORS.water, 5, 0.24, 0.7, 12, 1.3, this.fxRng);
            this.sfxFor(i, 'splash', Math.min(1, e.value / 20));
            break;
          case 'enterShell':
            this.sfxFor(i, 'enterShell');
            if (me) this.seen.roll = true;
            break;
          case 'exitShell':
            this.sfxFor(i, 'exitShell');
            break;
          case 'slideStart':
            this.sfxFor(i, 'slideStart');
            if (me) this.seen.slide = true;
            break;
          case 'respawn':
            view.slime.clear();
            view.boost.clear();
            if (me) {
              this.audio.play('respawn');
              this.hud.toast('Back to checkpoint', 'info');
              this.rig.snap(r.pos, r.heading);
            }
            break;
        }
      }
      r.events.length = 0;
    }

    for (const e of this.race.events) {
      switch (e.type) {
        case 'countdown':
          this.hud.countdown(String(e.value));
          this.audio.play('count');
          break;
        case 'go':
          this.hud.countdown('GO!', true);
          this.audio.play('go');
          break;
        case 'checkpoint':
          this.hud.toast('CHECKPOINT', 'info', formatTime(this.race.time));
          this.audio.play('checkpoint');
          break;
        case 'overtake':
          this.hud.toast('OVERTAKE!', 'good', `${e.value}${ordinal(e.value)}`);
          this.audio.play('overtake');
          break;
        case 'overtaken':
          this.audio.play('overtaken');
          break;
        case 'aiFinish':
          if (!this.race.player.finished) this.hud.toast(`${this.race.profiles[e.racer].name} finished`, 'info', `${e.value}${ordinal(e.value)}`);
          break;
        case 'finish':
          this.audio.play('finish');
          this.audio.silenceMotion();
          this.hud.toast('FINISH!', 'great', `${e.value}${ordinal(e.value)} place`);
          for (let k = 0; k < 5; k += 1) this.particles.burst(this.race.player.pos, 16, COLORS.confetti[k], 9, 0.3, 1.6, 9, 1.4, this.fxRng);
          break;
      }
    }
    this.race.events.length = 0;
  }

  private surfaceBurst(r: RacerBody, p: THREE.Vector3, count: number, speed: number): void {
    const s = r.surface;
    const color = s === 'water' ? COLORS.water : s === 'leaves' ? COLORS.leaf : s === 'mud' ? COLORS.mud : s === 'grass' || s === 'rough' ? COLORS.grass : COLORS.dust;
    this.particles.burst(p, count, color, speed, 0.26, 0.6, 9, 0.8, this.fxRng);
  }

  private updateRaceUi(delta: number): void {
    const race = this.race;
    const p = race.player;
    const live = race.phase === 'racing';

    let section = 0;
    for (let i = 0; i < SECTIONS.length; i += 1) if (p.s >= SECTIONS[i].s0) section = i;
    if (section !== this.lastSection) {
      if (this.lastSection >= 0 && live) this.hud.toast(SECTIONS[section].name.toUpperCase(), 'info');
      this.lastSection = section;
    }

    const airborne = !p.grounded && p.flightTime > 0.2;
    this.hud.update({
      rank: race.rank[0] + 1,
      time: p.finished ? p.finishTime : race.time,
      speedKmh: p.speed * KMH,
      slime: p.slime,
      sliding: p.mode === 'slide',
      boost: p.boost,
      boosting: p.boostTimer > 0,
      mode: airborne ? 'air' : p.mode,
      distance: race.distanceToFinish,
      progress: race.racers.map((r) => r.s),
      order: race.order,
      sectionIndex: section,
      offTrack: live && p.offTrack > 0.5,
    });

    if (live) {
      const ready = p.boost >= 1;
      if (ready && !this.boostWasReady) this.audio.play('boostReady');
      this.boostWasReady = ready;
      this.updateHints(delta, p, airborne);
    } else {
      this.hud.hint(null);
    }

    this.audio.updateMotion(p.mode, p.speed, p.airTime < 0.1, live, delta);

    if (race.phase === 'finished' && !this.resultsShown) {
      this.finishTimer += delta;
      if (this.finishTimer > 2.6) this.showResults();
    }
  }

  private updateHints(delta: number, p: RacerBody, airborne: boolean): void {
    const slope = track.slope(p.s + 2);
    const novice = this.raceCount < 3;
    if (p.mode === 'roll' && p.speed > 4) this.seen.steerTime += delta;
    if (p.mode !== 'crawl' && p.speed < 1 && p.grounded) this.seen.stallTime += delta;
    else this.seen.stallTime = 0;

    let hint: string | null = null;
    if (this.seen.stallTime > 0.8) hint = 'Out of momentum! <kbd>SPACE</kbd> to pop out and crawl';
    else if (!novice) hint = null;
    else if (!this.seen.roll && p.mode === 'crawl' && slope > 0.045) hint = 'Downhill! Press <kbd>SPACE</kbd> to tuck into your shell and <b>ROLL</b>';
    else if (!this.seen.roll && this.race.time < 6) hint = 'Hold <kbd>W</kbd> to crawl to the edge of the hill';
    else if (this.seen.roll && this.seen.steerTime > 0.5 && this.seen.steerTime < 5) hint = '<kbd>A</kbd> <kbd>D</kbd> steer · speed comes from the slope, not from <kbd>W</kbd>';
    else if (!this.seen.boost && p.boost >= 1 && p.mode !== 'crawl') hint = 'Shell boost charged — press <kbd>E</kbd>!';
    else if (!this.seen.slide && p.s > 545 && p.s < 900 && p.slime > 0.4 && p.mode === 'roll') hint = 'Hold <kbd>SHIFT</kbd> to slime-slide and keep your momentum';
    else if (!this.seen.spin && p.s > KICKER.s0 - 70 && p.s < KICKER.s1 + 60 && (airborne || p.s < KICKER.s1)) hint = 'Big jump! <kbd>Q</kbd> / <kbd>E</kbd> to spin in the air — land it clean';
    this.hud.hint(hint);
  }

  private showResults(): void {
    this.resultsShown = true;
    const race = this.race;
    const p = race.player;
    const previous = loadBest();
    const newBest = previous === null || p.finishTime < previous;
    if (newBest) saveBest(p.finishTime);
    this.raceCount += 1;
    saveRaceCount(this.raceCount);
    this.hud.show(false);
    this.menus.showResults({
      place: race.rank[0] + 1,
      time: p.finishTime,
      best: newBest ? p.finishTime : previous,
      newBest,
      topSpeedKmh: p.maxSpeed * KMH,
      tricks: p.tricks,
      trickScore: p.trickScore,
      rows: race.order.map((i) => ({ racer: i, time: race.racers[i].finished ? race.racers[i].finishTime : null })),
    });
    this.state = 'results';
    this.audio.setMusic(true, 100);
  }

  // ---------------------------------------------------------- visuals

  /** Pose every snail from interpolated physics state, then camera, trails, particles, ambience. */
  private syncVisuals(delta: number): void {
    const race = this.race;
    const animDt = this.reducedMotion ? 0 : delta;
    const simulating = this.state !== 'menu';
    // On the menu the physics is frozen, so results keep simulating (snails coast) but the menu idles.
    if (this.state === 'results' && !this.paused) {
      this.accumulator += Math.min(delta, 0.1);
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        race.step();
        this.accumulator -= FIXED_DT;
        steps += 1;
      }
      this.alpha = this.accumulator / FIXED_DT;
      for (const r of race.racers) r.events.length = 0;
      race.events.length = 0;
    }

    const pose = this.pose;
    for (let i = 0; i < RACER_COUNT; i += 1) {
      const r = race.racers[i];
      const view = this.views[i];
      view.pos.lerpVectors(r.prevPos, r.pos, this.alpha);
      const heading = lerpAngle(r.prevHeading, r.heading, this.alpha);
      view.up.lerp(r.normal, Math.min(1, delta * 12)).normalize();
      view.sinceHit += delta;

      // Basis: Y = ground normal, Z = facing projected onto the ground plane.
      const fz = this.basisZ.set(Math.sin(heading), 0, -Math.cos(heading));
      fz.addScaledVector(view.up, -fz.dot(view.up)).normalize();
      this.basisX.crossVectors(view.up, fz);
      this.mat.makeBasis(this.basisX, view.up, fz);
      view.model.root.quaternion.setFromRotationMatrix(this.mat);
      view.model.root.position.copy(view.pos).addScaledVector(view.up, -R);

      const speed = r.speed;
      pose.mode = r.mode;
      pose.speed = speed;
      pose.forwardSpeed = r.vel.x * Math.sin(heading) - r.vel.z * Math.cos(heading);
      pose.steer = r.steer;
      pose.grounded = r.airTime < 0.12;
      pose.verticalSpeed = r.vel.y;
      pose.rollAngle = r.rollAngle;
      pose.spinAngle = r.spinAngle;
      pose.boosting = r.boostTimer > 0;
      pose.sinceHit = view.sinceHit;
      view.model.update(animDt, pose);

      const grounded = r.airTime < 0.08;
      const foot = this.tmp.copy(view.pos).addScaledVector(view.up, -R + 0.07);
      const dirX = speed > 0.5 ? r.vel.x / speed : Math.sin(heading);
      const dirZ = speed > 0.5 ? r.vel.z / speed : -Math.cos(heading);
      view.slime.update(delta, foot, view.up, dirX, dirZ, simulating && r.mode === 'slide' && grounded && speed > 1);
      view.boost.update(delta, view.pos, this.basisX.set(-dirZ, 0, dirX), dirX, dirZ, simulating && r.boostTimer > 0);

      if (simulating && !r.frozen) this.motionParticles(r, view, foot, delta, i === 0);

      if (view.tag) {
        const dist = view.pos.distanceTo(this.camera.position);
        view.tag.visible = dist < 70 && dist > 4.5 && this.state !== 'menu';
        if (view.tag.visible) {
          view.tag.position.copy(view.pos).addScaledVector(view.up, r.mode === 'roll' ? 1.3 : 2.0);
          const k = THREE.MathUtils.clamp(dist / 22, 0.42, 2.6);
          view.tag.scale.set(2.6 * k, 0.65 * k, 1);
        }
      }
    }

    // Camera.
    const p = race.player;
    const target = this.views[0].pos;
    if (this.state === 'menu') {
      this.tmp2.copy(target).setY(target.y - 0.1);
      this.rig.orbit(this.reducedMotion ? 0 : delta, this.tmp2, 4.4, 1.25, 0.16, 2.4);
    } else if (race.phase === 'grid' || race.phase === 'countdown') {
      this.rig.update(delta, target, p, false);
    } else if (race.phase === 'finished') {
      this.rig.orbit(delta, target, 6.5, 2.2, 0.5);
    } else {
      this.rig.update(delta, target, p, p.boostTimer > 0);
    }
    const racing = this.state === 'racing' && race.phase === 'racing';
    this.speedLines.update(delta, this.camera, racing ? this.rig.speedFactor : 0, racing && p.boostTimer > 0);

    // Wind motes streaming past at speed (cheap sense of velocity).
    if (racing && p.speed > 14 && this.fxRng() < delta * p.speed * 0.9) {
      const rnd = this.fxRng;
      const ahead = 18 + rnd() * 14;
      const vx = p.vel.x / p.speed;
      const vz = p.vel.z / p.speed;
      this.particles.emit(
        target.x + vx * ahead + (rnd() - 0.5) * 16,
        target.y + 0.5 + rnd() * 5,
        target.z + vz * ahead + (rnd() - 0.5) * 16,
        -vx * 3,
        (rnd() - 0.5) * 0.6,
        -vz * 3,
        COLORS.white,
        0.07 + rnd() * 0.06,
        0.9,
        0,
        0.7,
      );
    }

    this.particles.update(delta);
    const ambient = this.reducedMotion ? 0 : this.time;
    this.backyard.update(ambient, animDt);
    this.terrain.update(ambient);
    this.env.follow(target, this.camera);
  }

  private motionParticles(r: RacerBody, view: RacerView, foot: THREE.Vector3, delta: number, isPlayer: boolean): void {
    const grounded = r.airTime < 0.08;
    const speed = r.speed;
    if (!grounded) return;
    const rnd = this.fxRng;
    view.dustTimer -= delta * (isPlayer ? 1 : 0.5);
    if (r.mode === 'slide' && speed > 2) {
      if (view.dustTimer <= 0) {
        view.dustTimer = 0.03;
        this.particles.emit(foot.x + (rnd() - 0.5) * 0.5, foot.y + 0.1, foot.z + (rnd() - 0.5) * 0.5, -r.vel.x * 0.15 + (rnd() - 0.5) * 2, 1 + rnd() * 2.2, -r.vel.z * 0.15 + (rnd() - 0.5) * 2, COLORS.slime, 0.14 + rnd() * 0.1, 0.5, 8);
      }
    } else if (r.mode === 'roll' && speed > 7) {
      if (view.dustTimer <= 0) {
        view.dustTimer = Math.max(0.02, 0.5 / speed);
        const s = r.surface;
        const color = s === 'water' ? COLORS.water : s === 'leaves' ? (rnd() < 0.5 ? COLORS.leaf : COLORS.leafRed) : s === 'mud' ? COLORS.mud : s === 'grass' || s === 'rough' ? COLORS.grass : COLORS.dust;
        const lift = s === 'water' ? 4 : s === 'leaves' ? 2.6 : 1.4;
        this.particles.emit(foot.x + (rnd() - 0.5) * 0.6, foot.y + 0.05, foot.z + (rnd() - 0.5) * 0.6, -r.vel.x * 0.1 + (rnd() - 0.5) * 2.4, lift * (0.5 + rnd()), -r.vel.z * 0.1 + (rnd() - 0.5) * 2.4, color, s === 'leaves' ? 0.2 : 0.16 + rnd() * 0.1, 0.55, s === 'water' ? 12 : 5, 0.85);
      }
    } else if (r.mode === 'crawl' && isPlayer && speed > 1) {
      // Squelchy footsteps on the crawl cycle.
      view.crawlPhase += speed * delta;
      if (view.crawlPhase > 1.9) {
        view.crawlPhase = 0;
        this.audio.play('squelch', 0.7);
      }
    }
    if (r.boostTimer > 0 && rnd() < delta * 60) {
      this.particles.emit(view.pos.x, view.pos.y, view.pos.z, -r.vel.x * 0.2 + (rnd() - 0.5) * 3, (rnd() - 0.3) * 3, -r.vel.z * 0.2 + (rnd() - 0.5) * 3, rnd() < 0.5 ? COLORS.boost : COLORS.star, 0.24, 0.45, 0);
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------- hooks & diagnostics

  private installTestHooks(): void {
    const simulateUntil = (done: () => boolean, limitSeconds: number) => {
      let steps = 0;
      const max = limitSeconds / FIXED_DT;
      while (!done() && steps < max) {
        this.race.step();
        for (const r of this.race.racers) r.events.length = 0;
        this.race.events.length = 0;
        steps += 1;
      }
    };
    const settle = () => {
      this.accumulator = 0;
      this.alpha = 1;
      const p = this.race.player;
      for (const v of this.views) {
        v.slime.clear();
        v.boost.clear();
      }
      this.rig.snap(p.pos, p.speed > 2 ? Math.atan2(p.vel.x, -p.vel.z) : p.heading);
      // A second of real stepping + visual updates so camera, trails and particles are representative.
      for (let i = 0; i < 70; i += 1) {
        this.race.step();
        this.race.step();
        this.handleEvents();
        this.updateRaceUi(1 / 60);
        this.syncVisuals(1 / 60);
      }
      this.render();
      this.publishDiagnostics();
    };
    const raceTo = (s: number, extra?: () => boolean) => {
      this.beginRace();
      this.race.autopilot = true;
      simulateUntil(() => this.race.player.s >= s && (extra ? extra() : true), 200);
      settle();
    };
    const states: Record<string, () => void> = {
      menu: () => {
        this.toMenu(true);
        for (let i = 0; i < 30; i += 1) this.syncVisuals(1 / 60);
        this.render();
      },
      countdown: () => {
        this.beginRace();
        simulateUntil(() => this.race.countdown < 2.2, 5);
        this.handleEvents();
        this.updateRaceUi(1 / 60);
        for (let i = 0; i < 20; i += 1) this.syncVisuals(1 / 60);
        this.render();
      },
      'active-play': () => raceTo(236),
      'leaf-slide': () => raceTo(400),
      'root-maze': () => raceTo(640),
      'big-drop': () => raceTo(KICKER.s1 + 6, () => !this.race.player.grounded),
      'final-sprint': () => raceTo(1330),
      paused: () => {
        raceTo(236);
        this.setPaused(true);
      },
      results: () => {
        this.beginRace();
        this.race.autopilot = true;
        simulateUntil(() => this.race.player.finished, 300);
        this.handleEvents();
        this.showResults();
        for (let i = 0; i < 30; i += 1) this.syncVisuals(1 / 60);
        this.render();
      },
    };
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.seed = value >>> 0;
        this.rng = createSeededRandom(this.seed);
      },
      setState: (name: string) => {
        const fn = states[name];
        if (!fn) throw new Error(`Unknown test state: ${name}`);
        this.pausedForScreenshot = false;
        this.paused = false;
        fn();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => {
        /* no debug UI ships with the game */
      },
      autopilot: (enabled: boolean) => {
        this.race.autopilot = enabled;
      },
      simulate: (seconds: number) => {
        simulateUntil(() => false, seconds);
        return this.race.time;
      },
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const race = this.race;
    const p = race.player;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: race.time,
      score: Math.round(p.s),
      targetScore: FINISH_S,
      complete: p.finished,
      state: this.state === 'racing' ? race.phase : this.state,
      paused: this.paused,
      rank: race.rank[0] + 1,
      mode: p.mode,
      speedKmh: p.speed * KMH,
      airborne: !p.grounded,
      slime: p.slime,
      boost: p.boost,
      fps: this.fps,
      racers: race.racers.map((r, i) => ({ name: race.profiles[i].name, s: r.s, d: r.d, finished: r.finished, time: r.finishTime, mode: r.mode })),
      player: { position: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, speed: p.speed },
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
        dpr: Math.min(window.devicePixelRatio || 1, this.maxDpr),
      },
    };
  }
}


