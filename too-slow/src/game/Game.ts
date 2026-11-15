import * as THREE from 'three';
import { AudioManager, type Sfx } from '../audio/AudioManager';
import { FollowCamera } from '../camera/FollowCamera';
import { SnailModel, type SnailPose } from '../characters/SnailModel';
import { ItemView } from '../fx/ItemView';
import { ITEM_NAMES } from '../racing/Items';
import { Input } from '../core/Input';
import { Platform } from '../core/Platform';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Particles, SpeedLines, Trail } from '../fx/Effects';
import { TUNE, type RacerBody } from '../physics/RacerBody';
import { FIXED_DT, RACER_COUNT, RaceManager, type Difficulty, type RaceMode } from '../racing/RaceManager';
import { addFame, addStats, COSMETICS, earnedCosmetics, GP_POINTS, TRAILS, loadGhost, medalFor, MEDAL_TIMES, saveGhost, saveMedal, saveTrophy, setTutorialDone } from '../ui/Progress';
import { Hud2 } from '../ui/Hud2';
import { GhostRunner } from './GhostRunner';
import { Tutorial } from './Tutorial';
import { formatTime, Hud, ordinal } from '../ui/Hud';
import { loadBest, loadRaceCount, loadUnlocked, Menus, saveBest, saveRaceCount, unlockAfter, type PlayerLook, type Settings } from '../ui/Menus';
import { TRACKS } from '../world/tracks';
import { createSeededRandom } from '../utils/random';
import { buildBackyard, type BackyardResult } from '../world/Backyard';
import { buildEnvironment, type EnvironmentResult } from '../world/Environment';
import { buildTerrain, type TerrainResult } from '../world/Terrain';
import { createNameTag } from '../world/Textures';
import { KICKER, SECTIONS, loadTrack, track } from '../world/Track';
import { CritterView } from '../fx/CritterView';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Weather } from '../fx/Weather';

type GameState = 'menu' | 'racing' | 'results';

/** Displayed speed: arcade "km/h", calibrated for feel rather than physics. */
const KMH = 3.6;
const R = TUNE.radius;
// Up to a quarter of a second of fixed steps per rendered frame: the race stays real-time down to ~4 fps.
const MAX_STEPS_PER_FRAME = 30;

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
  blueSpark: new THREE.Color(0x6fd0ff),
  orangeSpark: new THREE.Color(0xffa02e),
  peel: new THREE.Color(0xffe04a),
  acorn: new THREE.Color(0xa0662e),
  shield: new THREE.Color(0x9fe0ff),
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
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.15, 800);
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
  private terrain: TerrainResult;
  private backyard: BackyardResult;
  private readonly itemView = new ItemView();
  private readonly critterView = new CritterView();
  private readonly weather = new Weather();
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );
  private readonly fadeEl = document.getElementById('fade');
  private readonly appEl = document.getElementById('app');
  /** Player two's view in split-screen. */
  private readonly camera2 = new THREE.PerspectiveCamera(58, 1, 0.15, 800);
  private readonly rig2 = new FollowCamera(this.camera2);
  private readonly hud2 = new Hud2();
  private readonly ghost: GhostRunner;
  private readonly tutorial = new Tutorial();
  private mode: RaceMode = 'race';
  private readonly platform = new Platform();
  /** A rewarded ad was watched: the next race starts with a Turbo Mushroom. */
  private rewardStart = false;
  private adPlaying = false;
  /** Bloom for night tracks, built on first use. */
  private composer: EffectComposer | null = null;
  private composerSize = '';
  private gp: { tracks: string[]; index: number; points: number[] } | null = null;
  private p2Tag: THREE.Texture | null = null;
  private rivalNames: string[] = [];
  private readonly ttPanel = document.getElementById('tt-panel');
  private readonly ttMedal = document.getElementById('tt-medal');
  private readonly ttGhost = document.getElementById('tt-ghost');

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
  private dprOverride = 0;
  /** Automatic graphics easing: 0 = as set, 3 = lowest. */
  private autoLevel = 0;
  private lowFpsTime = 0;
  private perfTimer = 0;
  private frameMs = 16;
  private readonly perfEl = document.getElementById('perf');
  private finishTimer = 0;
  private resultsShown = false;
  private boostWasReady = false;
  private raceCount = loadRaceCount();
  private readonly seen = { roll: false, slide: false, boost: false, spin: false, item: false, steerTime: 0, stallTime: 0, wrongWay: 0 };
  private lastSection = -1;
  private lastOvertakeToast = -9;
  private menuAngle = 2.2;
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
    spinOut: 0,
    shield: false,
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.env = buildEnvironment(this.scene, this.renderer);
    this.scene.add(this.env.group);

    this.hud = new Hud(this.race.profiles);
    this.menus = new Menus(
      {
        chooseTrack: (id, mode) => {
          this.mode = mode;
          this.gp = null;
          this.startRace(id);
        },
        startGp: () => {
          this.mode = 'gp';
          const open = loadUnlocked();
          this.gp = { tracks: TRACKS.filter((d) => open.has(d.id)).map((d) => d.id), index: 0, points: new Array(RACER_COUNT).fill(0) };
          this.startRace(this.gp.tracks[0]);
        },
        startTutorial: () => {
          this.mode = 'tutorial';
          this.gp = null;
          this.startRace('backyard');
        },
        nextTrack: () => {
          if (this.gp) {
            if (this.gp.index >= this.gp.tracks.length - 1) this.showPodium();
            else {
              this.gp.index += 1;
              this.startRace(this.gp.tracks[this.gp.index]);
            }
            return;
          }
          const open = loadUnlocked();
          const i = TRACKS.findIndex((d) => d.id === track.def.id);
          for (let k = 1; k <= TRACKS.length; k += 1) {
            const next = TRACKS[(i + k) % TRACKS.length];
            if (open.has(next.id)) {
              this.startRace(next.id);
              return;
            }
          }
        },
        lookChanged: (look) => this.applyLook(look),
        resume: () => this.setPaused(false),
        restart: () => this.startRace(track.def.id),
        toMenu: () => this.toMenu(),
        settingsChanged: (s) => this.applySettings(s),
        sound: (name) => {
          this.audio.unlock();
          this.audio.play(name);
        },
      },
      this.race.profiles,
    );
    // URL overrides for low-spec machines and automated tests: ?q=0..2 (graphics), ?dpr=0.5..2 (render scale).
    const params = new URLSearchParams(window.location.search);
    if (params.has('q')) this.menus.settings.quality = THREE.MathUtils.clamp(Number(params.get('q')) | 0, -1, 2);
    if (params.has('dpr')) this.dprOverride = THREE.MathUtils.clamp(Number(params.get('dpr')) || 1, 0.25, 2);
    this.terrain = buildTerrain(this.menus.settings.quality);
    this.scene.add(this.terrain.group);
    this.backyard = buildBackyard(this.menus.settings.quality);
    this.scene.add(this.backyard.group);
    this.scene.add(this.itemView.group, this.critterView.group, this.weather.points);
    this.env.setTheme(track.def.theme);
    this.weather.setKind(track.def.theme.weather);
    this.applyLook(this.menus.look, false);

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
    this.rivalNames = this.race.profiles.map((p) => p.name);
    this.ghost = new GhostRunner(this.scene);
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
      debug: () => this.perfEl?.classList.toggle('hidden'),
    });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
    this.platform.loadingStart();
    this.platform.setHooks({
      adStart: () => {
        this.adPlaying = true;
        this.audio.setMuted(true);
        this.input.clear();
      },
      adEnd: () => {
        this.adPlaying = false;
        this.audio.setMuted(this.muted);
      },
    });
    const reward = document.getElementById('btn-reward') as HTMLButtonElement | null;
    reward?.addEventListener('click', () => {
      reward.disabled = true;
      reward.textContent = 'Loading ad…';
      void this.platform.rewarded().then((ok) => {
        this.rewardStart = ok;
        reward.textContent = ok ? '🍄 Turbo Mushroom ready for the next race!' : 'No ad right now — try again later';
        reward.disabled = ok;
        if (!ok) window.setTimeout(() => (reward.disabled = false), 1500);
      });
    });

    this.applySettings(this.menus.settings);
    this.views[0].model.setLook(this.menus.look);
    this.race.reset(this.rng);
    this.itemView.reset(this.race.items);
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
    void this.platform.ready.then(() => this.platform.loadingStop());
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

  /** Player colours, pattern, hat and name from the garage. */
  private applyLook(look: PlayerLook, rebuild = true): void {
    const p = this.race.profiles[0];
    p.shell = look.shell;
    p.shellDark = look.shellDark;
    p.skin = look.skin;
    p.pattern = look.pattern;
    p.hat = look.hat;
    p.name = look.name;
    if (this.views[0]) this.views[0].slime.color.set(TRAILS[look.trail] ?? TRAILS.lime);
    if (rebuild && this.views[0]) {
      this.views[0].model.setLook(look);
      this.hud.refreshColors();
    }
  }

  /** Swap the course: rebuild terrain and props, recolour the sky. */
  private setTrack(id: string): void {
    if (id === track.def.id) return;
    loadTrack(id);
    const dispose = (g: THREE.Object3D) => {
      this.scene.remove(g);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
    };
    dispose(this.terrain.group);
    dispose(this.backyard.group);
    this.terrain = buildTerrain(this.menus.settings.quality);
    this.backyard = buildBackyard(this.menus.settings.quality);
    this.scene.add(this.terrain.group, this.backyard.group);
    this.env.setTheme(track.def.theme);
    this.weather.setKind(track.def.theme.weather);
    this.hud.setTrack();
    this.audio.setMusicTheme(id);
    this.renderer.shadowMap.needsUpdate = true;
  }

  private applySettings(s: Settings): void {
    this.race.items.enabled = s.items && this.mode !== 'tt';
    this.audio.setVolumes(s.music, s.sfx);
    this.rig.shakeEnabled = s.shake;
    const auto = s.autoQuality ? this.autoLevel : 0;
    this.maxDpr = this.dprOverride || Math.min(s.quality >= 2 ? 2 : s.quality === 1 ? 1.5 : s.quality === 0 ? 1 : 0.85, [9, 1.25, 1, 0.75][auto]);
    this.env.setShadowQuality(Math.max(0, Math.min(s.quality, [2, 2, 1, 0][auto])));
    this.env.setViewDistance(Math.min(s.quality >= 2 ? 800 : s.quality === 1 ? 520 : s.quality === 0 ? 280 : 220, [800, 800, 520, 320][auto]), this.camera);
    this.camera2.far = this.camera.far;
    this.camera2.updateProjectionMatrix();
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
    this.itemView.reset(this.race.items);
    this.critterView.reset(this.race.critters);
    this.seen.roll = this.seen.slide = this.seen.boost = this.seen.spin = this.seen.item = false;
    this.seen.steerTime = 0;
    this.seen.stallTime = 0;
    this.seen.wrongWay = 0;
  }

  private toMenu(immediate = false): void {
    const go = () => {
      this.state = 'menu';
      this.paused = false;
      this.race.autopilot = false;
      this.gp = null;
      this.mode = 'race';
      this.setDuo(false);
      this.race.configure('race', this.menus.settings.difficulty as Difficulty);
      this.tutorial.stop();
      this.ghost.stop();
      this.ttPanel?.classList.add('hidden');
      for (const v of this.views) v.model.root.visible = true;
      this.race.reset(this.rng);
      this.resetRaceVisuals();
      this.hud.show(false);
      this.hud.reset();
      this.menus.setBest(track.def.name, loadBest(track.def.id));
      this.menus.show('main');
      this.audio.silenceMotion();
      this.audio.setMusic(true, 100);
      this.rig.snap(this.race.player.pos, this.race.player.heading + Math.PI);
    };
    if (immediate) go();
    else this.fade(go);
  }

  private startRace(trackId: string): void {
    this.onGesture();
    // Between races (never mid-race) the platform may show an interstitial.
    if (this.state === 'results') {
      this.state = 'menu';
      void this.platform.midgame().then(() => this.startRace(trackId));
      return;
    }
    this.fade(() => {
      this.setTrack(trackId);
      this.beginRace();
    });
  }

  private beginRace(): void {
    this.state = 'racing';
    this.paused = false;
    this.seed += 1;
    this.rng = createSeededRandom(this.seed);
    const mode = this.mode;
    this.race.configure(mode, this.menus.settings.difficulty as Difficulty);
    this.race.items.enabled = this.menus.settings.items && mode !== 'tt';
    this.setDuo(mode === 'duo');
    this.race.reset(this.rng);
    if (this.rewardStart && mode !== 'tt') {
      this.race.player.item = 'mushroom';
      this.race.player.itemRoulette = 0;
      this.rewardStart = false;
    }
    if (mode === 'tt') this.ghost.start(loadGhost(track.def.id), this.race.profiles[0]);
    else this.ghost.stop();
    if (mode === 'tutorial') this.tutorial.start(this.input.lastDevice);
    else this.tutorial.stop();
    this.ttPanel?.classList.toggle('hidden', mode !== 'tt');
    this.resetRaceVisuals();
    this.hud.reset();
    this.hud.show(true);
    this.menus.show('none');
    this.input.clear();
    this.rig.snap(this.race.player.pos, this.race.player.heading);
    if (mode === 'duo') this.rig2.snap(this.race.racers[1].pos, this.race.racers[1].heading);
    for (let i = 0; i < RACER_COUNT; i += 1) this.views[i].model.root.visible = !this.race.racers[i].inactive;
    this.race.startCountdown();
    this.audio.setMusic(true, 128);
    this.canvas.focus();
  }

  /** Split-screen on/off: player two takes over racer 1 with its own camera and HUD. */
  private setDuo(on: boolean): void {
    this.input.duo = on;
    this.appEl?.classList.toggle('duo', on);
    this.hud2.show(on && this.state === 'racing');
    const p2 = this.race.profiles[1];
    p2.name = on ? 'Player 2' : this.rivalNames[1];
    const tag = this.views[1]?.tag;
    if (tag) {
      if (on && !this.p2Tag) this.p2Tag = createNameTag('Player 2', p2.shell);
      const mat = tag.material as THREE.SpriteMaterial;
      if (on) {
        if (!mat.userData.rival) mat.userData.rival = mat.map;
        mat.map = this.p2Tag;
      } else if (mat.userData.rival) mat.map = mat.userData.rival as THREE.Texture;
      mat.needsUpdate = true;
    }
    this.hud.refreshColors();
    if (!on) {
      this.camera.aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
      this.camera.updateProjectionMatrix();
    }
  }

  /** F3 overlay, and easing the graphics when a real machine cannot keep up. */
  private watchPerformance(delta: number): void {
    this.perfTimer -= delta;
    if (this.perfEl && !this.perfEl.classList.contains('hidden') && this.perfTimer <= 0) {
      this.perfTimer = 0.25;
      const info = this.renderer.info.render;
      this.perfEl.textContent = `${Math.round(this.fps)} fps · ${this.frameMs.toFixed(1)} ms · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris · Q${this.menus.settings.quality} · DPR ${Math.min(window.devicePixelRatio || 1, this.maxDpr).toFixed(2)}${this.autoLevel ? ` · auto −${this.autoLevel}` : ''}`;
    }
    const racing = this.state === 'racing' && !this.paused && this.race.phase === 'racing';
    if (!racing || !this.menus.settings.autoQuality || this.dprOverride || this.autoLevel >= 3) return;
    if (this.fps < 38 && delta < 0.5) this.lowFpsTime += delta;
    else this.lowFpsTime = Math.max(0, this.lowFpsTime - delta * 0.5);
    if (this.lowFpsTime > 4) {
      this.lowFpsTime = 0;
      this.autoLevel += 1;
      this.applySettings(this.menus.settings);
      this.hud.toast('GRAPHICS EASED', 'info', 'for a smoother race');
    }
  }

  private showPodium(): void {
    const gp = this.gp;
    if (!gp) return;
    const rows = gp.points.map((points, racer) => ({ racer, points })).sort((a, b) => b.points - a.points || a.racer - b.racer);
    const place = rows.findIndex((r) => r.racer === 0) + 1;
    const earnedBefore = earnedCosmetics();
    const improved = saveTrophy(this.menus.settings.difficulty, place);
    if (place === 1) addStats({ cups: 1 });
    const cosmetics = this.newCosmetics(earnedBefore);
    this.audio.play(place <= 3 ? 'finish' : 'checkpoint');
    this.menus.showPodium({ rows, place, difficulty: this.menus.settings.difficulty, improved, cosmetics });
    this.gp = null;
  }

  // ----------------------------------------------------------- update

  private update(delta: number, _elapsed: number): void {
    this.frame += 1;
    this.fps += (1 / Math.max(delta, 1e-3) - this.fps) * 0.05;
    this.frameMs += (delta * 1000 - this.frameMs) * 0.1;
    this.watchPerformance(delta);
    if (resizeRenderer(this.renderer, this.camera, this.maxDpr)) this.particles.setViewportHeight(this.canvas.clientHeight);
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }
    if (this.adPlaying) {
      this.publishDiagnostics();
      return;
    }
    const playing = this.state === 'racing' && !this.paused && this.race.phase !== 'finished';
    if (playing) this.platform.gameplayStart();
    else this.platform.gameplayStop();
    this.input.poll(delta, this.paused || this.state !== 'racing');
    this.input.setTouchVisible(this.state === 'racing' && !this.paused);
    if (this.paused) {
      this.publishDiagnostics();
      return;
    }
    this.time += delta;

    if (this.state === 'racing') {
      this.readInput();
      this.accumulator += Math.min(delta, 0.25);
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        this.race.step();
        this.accumulator -= FIXED_DT;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
      this.alpha = this.accumulator / FIXED_DT;
      this.updateModes(delta);
      this.handleEvents();
      this.updateRaceUi(delta);
    } else {
      this.alpha = 1;
    }

    this.syncVisuals(delta);
    this.publishDiagnostics();
  }

  /** Per-frame work for the special modes: ghost, time-trial panel, tutorial checklist. */
  private updateModes(delta: number): void {
    const race = this.race;
    const p = race.player;
    if (this.mode === 'tt') {
      if (race.phase === 'racing' && !p.finished) this.ghost.record(race.time, p);
      this.ghost.update(race.phase === 'racing' ? race.time : 0, delta);
      const gold = MEDAL_TIMES[track.def.id];
      if (this.ttMedal && gold) {
        const t = race.time;
        const target = t <= gold[0] ? `🥇 ${formatTime(gold[0])}` : t <= gold[1] ? `🥈 ${formatTime(gold[1])}` : t <= gold[2] ? `🥉 ${formatTime(gold[2])}` : 'No medal pace';
        if (this.ttMedal.textContent !== target) this.ttMedal.textContent = target;
      }
      const gt = this.ghost.ghostTime;
      if (this.ttGhost) {
        const txt = gt ? `👻 ${formatTime(gt)}` : '';
        if (this.ttGhost.textContent !== txt) this.ttGhost.textContent = txt;
      }
    }
    if (this.mode === 'tutorial' && race.phase === 'racing') {
      const it = race.playerIntent;
      const done = this.tutorial.update(delta, p, this.input.throttle(0), this.input.steer(0), this.input.lastDevice);
      void it;
      if (done) {
        this.audio.play('checkpoint');
        this.hud.toast('NICE!', 'good');
        if (this.tutorial.complete) {
          setTutorialDone();
          this.hud.toast('ALL MOVES LEARNED!', 'great', 'now finish the lap');
        }
      }
    }
    if (this.mode === 'duo') {
      const r = race.racers[1];
      this.hud2.update(delta, r, race.rank[1] + 1, race.lap(1), race.laps, r.speed * KMH);
    }
  }

  private readInput(): void {
    const live = this.race.phase === 'racing';
    for (let k = 0; k < this.race.humans.length; k += 1) {
      const it = this.race.playerIntents[k];
      it.steer = live ? this.input.steer(k) : 0;
      it.throttle = live ? this.input.throttle(k) : 0;
      it.slide = live && this.input.slide(k);
      it.spin = live ? this.input.spin(k) : 0;
      const roll = this.input.take(k, 'roll');
      const boost = this.input.take(k, 'boost');
      const item = this.input.take(k, 'item');
      if (live) {
        if (roll) it.toggleRoll = true;
        if (boost) it.boost = true;
        if (item) it.useItem = true;
      }
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
      if (i === 1 && this.mode === 'duo') {
        if (r.events.some((e) => e.type === 'hardLand' || e.type === 'hit' || e.type === 'spinout' || e.type === 'cannon')) this.rig2.addShake(0.4);
        if (r.events.some((e) => e.type === 'respawn')) this.rig2.snap(r.pos, r.heading);
      }
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
          case 'pad':
            this.sfxFor(i, 'pad');
            this.particles.burst(foot, 12, COLORS.boost, 5, 0.22, 0.5, 3, 0.8, this.fxRng);
            if (me) {
              this.rig.addShake(0.15);
              this.hud.toast('DASH!', 'good');
            }
            break;
          case 'draft':
            if (me) {
              this.audio.play('draft');
              this.hud.toast('SLIPSTREAM!', 'good', 'tucked in behind');
            } else if (i === 1 && this.mode === 'duo') this.hud2.toast('SLIPSTREAM!');
            break;
          case 'driftCharge':
            if (me) this.audio.play('spark', e.value);
            break;
          case 'miniturbo':
            this.sfxFor(i, 'miniturbo');
            this.particles.burst(r.pos, 16, e.value === 2 ? COLORS.orangeSpark : COLORS.blueSpark, 5, 0.22, 0.5, 2, 0.6, this.fxRng);
            if (me) {
              this.hud.toast(e.value === 2 ? 'SUPER MINI-TURBO!' : 'MINI-TURBO!', e.value === 2 ? 'great' : 'good');
              this.rig.addShake(0.15);
            }
            break;
          case 'mushroom':
            this.sfxFor(i, 'boost');
            this.particles.burst(r.pos, 18, COLORS.boost, 6, 0.26, 0.6, 2, 0.6, this.fxRng);
            if (me) this.rig.addShake(0.25);
            break;
          case 'spinout':
            view.sinceHit = 0;
            view.model.impact(0.8);
            this.particles.burst(r.pos.clone().setY(r.pos.y + 0.9), 14, COLORS.star, 3, 0.2, 0.9, 1, 0.4, this.fxRng);
            this.sfxFor(i, 'spinout');
            if (me) {
              this.rig.addShake(e.value === 4 ? 0.2 : 0.5);
              const label = e.value === 2 ? 'BONK!' : e.value === 3 ? 'BUG BUMP!' : e.value === 4 ? 'ANT TRAFFIC!' : 'WHOOPS!';
              this.hud.toast(label, 'bad', e.value === 4 ? 'stumbled' : 'spun out');
            }
            break;
          case 'shieldBlock':
            this.particles.burst(r.pos, 18, COLORS.shield, 5, 0.24, 0.5, 2, 1, this.fxRng);
            this.sfxFor(i, 'shieldBreak');
            if (me) this.hud.toast('BLOCKED!', 'good');
            break;
          case 'cannon':
            this.sfxFor(i, 'cannon');
            this.backyard.boing(Math.min(1, r.speed / 40));
            view.model.impact(1.2);
            this.particles.burst(foot, 26, COLORS.confetti[i % 5], 8, 0.3, 0.8, 6, 1.5, this.fxRng);
            if (me) {
              this.rig.addShake(0.4);
              this.hud.toast('BOING!', 'great', 'Q / E to spin');
            }
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

    for (const e of this.race.items.events) {
      const me = e.racer === 0;
      switch (e.type) {
        case 'pickup':
          this.particles.burst(e.pos, 14, COLORS.confetti[e.racer % 5], 4, 0.2, 0.5, 4, 1, this.fxRng);
          if (me) this.audio.play('itemBox');
          break;
        case 'got':
          if (me && e.kind) this.audio.play('itemGot');
          break;
        case 'use':
          if (me) this.seen.item = true;
          if (e.kind === 'banana') this.sfxFor(e.racer, 'drop');
          else if (e.kind === 'acorn') this.sfxFor(e.racer, 'throw');
          else if (e.kind === 'shield') this.sfxFor(e.racer, 'shield');
          else if (e.kind === 'slime') {
            this.sfxFor(e.racer, 'slimeUp');
            this.particles.burst(e.pos, 16, COLORS.slime, 4, 0.22, 0.6, 4, 1, this.fxRng);
          }
          if (me && e.kind && e.kind !== 'mushroom') this.hud.toast(ITEM_NAMES[e.kind].toUpperCase(), 'info');
          break;
        case 'hit':
          this.particles.burst(e.pos, 10, e.kind === 'acorn' ? COLORS.acorn : COLORS.peel, 4, 0.22, 0.5, 8, 1, this.fxRng);
          if (!me && this.race.items.events.some((x) => x.type === 'use' && x.racer === 0)) this.hud.toast('HIT!', 'great');
          break;
        case 'acornBreak':
          this.particles.burst(e.pos, 8, COLORS.acorn, 3, 0.2, 0.4, 8, 1, this.fxRng);
          break;
        default:
          break;
      }
    }
    this.race.items.events.length = 0;

    for (const e of this.race.critters.events) {
      this.particles.burst(e.pos, 8, e.kind === 'ants' ? COLORS.mud : COLORS.star, 3, 0.18, 0.4, 6, 1, this.fxRng);
      this.sfxFor(e.racer, e.kind === 'ants' ? 'squelch' : 'bump');
    }
    this.race.critters.events.length = 0;

    for (const e of this.race.events) {
      if (e.racer === 1 && this.mode === 'duo' && e.type !== 'countdown' && e.type !== 'go') {
        if (e.type === 'lap') this.hud2.toast(e.value === this.race.laps ? 'FINAL LAP!' : `LAP ${e.value}`);
        else if (e.type === 'finish') this.hud2.toast(`FINISH! ${e.value}${ordinal(e.value)}`);
        else if (e.type === 'overtake') this.hud2.toast('OVERTAKE!');
        continue;
      }
      switch (e.type) {
        case 'countdown':
          this.hud.countdown(String(e.value));
          this.audio.play('count');
          break;
        case 'go':
          this.hud.countdown('GO!', true);
          this.audio.play('go');
          break;
        case 'lap':
          this.hud.toast(e.value === this.race.laps ? 'FINAL LAP!' : `LAP ${e.value}`, e.value === this.race.laps ? 'great' : 'info', formatTime(this.race.lapTimes[this.race.lapTimes.length - 1] ?? 0));
          this.audio.play(e.value === this.race.laps ? 'finalLap' : 'checkpoint');
          if (e.value === this.race.laps) this.audio.setMusic(true, 142);
          break;
        case 'checkpoint':
          this.hud.toast('CHECKPOINT', 'info', formatTime(this.race.time));
          this.audio.play('checkpoint');
          break;
        case 'overtake':
          // Side-by-side jostling flips the order rapidly; celebrate at most every couple of seconds.
          if (this.time - this.lastOvertakeToast > 2) {
            this.lastOvertakeToast = this.time;
            this.hud.toast('OVERTAKE!', 'good', `${e.value}${ordinal(e.value)}`);
            this.audio.play('overtake');
          }
          break;
        case 'overtaken':
          this.audio.play('overtaken');
          break;
        case 'aiFinish':
          if (!this.race.player.finished && this.mode !== 'duo') this.hud.toast(`${this.race.profiles[e.racer].name} finished`, 'info', `${e.value}${ordinal(e.value)}`);
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
      progress: race.racers.map((r) => r.dist / race.totalDist),
      lap: race.lap(0),
      laps: race.laps,
      order: race.order,
      sectionIndex: section,
      offTrack: live && p.offTrack > 0.5,
      item: p.item,
      rolling: p.itemRoulette > 0,
      itemsEnabled: race.items.enabled,
      field: race.field,
      p2: this.mode === 'duo' ? 1 : undefined,
    });
    if (p.itemRoulette > 0 && this.frame % 4 === 0) this.audio.play('roulette');

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

    const yawOff = Math.abs(lerpAngle(0, p.heading - track.heading(p.s), 1));
    if (yawOff > 2 && p.speed > 1) this.seen.wrongWay += delta;
    else this.seen.wrongWay = 0;

    let hint: string | null = null;
    if (this.seen.wrongWay > 1.2) hint = '<b>Wrong way!</b> Turn around — or press <kbd>R</kbd> for the last checkpoint';
    else if (this.seen.stallTime > 0.8) hint = 'Out of momentum! <kbd>SPACE</kbd> to pop out and crawl';
    else if (!novice || this.mode === 'tutorial') hint = null;
    else if (!this.seen.roll && p.mode === 'crawl' && slope > 0.045) hint = 'Downhill! Press <kbd>SPACE</kbd> to tuck into your shell and <b>ROLL</b>';
    else if (!this.seen.roll && this.race.time < 6) hint = 'Hold <kbd>W</kbd> to crawl to the edge of the hill';
    else if (this.seen.roll && this.seen.steerTime > 0.5 && this.seen.steerTime < 5) hint = '<kbd>A</kbd> <kbd>D</kbd> steer · speed comes from the slope, not from <kbd>W</kbd>';
    else if (p.item && p.itemRoulette <= 0 && this.race.time < 60 && !this.seen.item) hint = `Got ${/^[AEIOU]/.test(ITEM_NAMES[p.item]) ? 'an' : 'a'} <b>${ITEM_NAMES[p.item]}</b>! Press <kbd>F</kbd> to use it`;
    else if (!this.seen.boost && p.boost >= 1 && p.mode !== 'crawl') hint = 'Shell boost charged — press <kbd>E</kbd>!';
    else if (!this.seen.slide && p.s > SECTIONS[2].s0 && p.s < SECTIONS[3].s0 && p.slime > 0.4 && p.mode === 'roll' && p.speed > 9) hint = 'Hold <kbd>SHIFT</kbd> to slime-slide and keep your momentum';
    else if (p.cannon > 0) hint = 'BOING! Spin with <kbd>Q</kbd> / <kbd>E</kbd> on the way up — land it clean';
    else if (!this.seen.spin && KICKER && track.rel(p.s, KICKER.s0) > -70 && track.rel(p.s, KICKER.s1) < 60 && (airborne || track.rel(p.s, KICKER.s1) < 0)) hint = 'Big jump! <kbd>Q</kbd> / <kbd>E</kbd> to spin in the air — land it clean';
    this.hud.hint(hint);
  }

  /** Names of cosmetics earned since `before`. */
  private newCosmetics(before: Set<string>): string[] {
    const now = earnedCosmetics();
    return COSMETICS.filter((c) => now.has(c.id) && !before.has(c.id)).map((c) => `${c.label} ${c.kind === 'pattern' ? 'shell' : c.kind === 'trail' ? 'trail' : 'hat'}`);
  }

  private showResults(): void {
    this.resultsShown = true;
    const earnedBefore = earnedCosmetics();
    const race = this.race;
    const p = race.player;
    const mode = this.mode;
    const id = track.def.id;
    const place = race.rank[0] + 1;
    const ranked = mode === 'race' || mode === 'gp';
    // Personal bests and unlocks come from real races against the rivals.
    const previous = loadBest(id);
    const newBestRace = ranked && (previous === null || p.finishTime < previous);
    if (newBestRace) saveBest(id, p.finishTime);
    const unlocked = ranked && race.rank[0] <= 2 ? unlockAfter(id) : null;
    if (unlocked) this.audio.play('trick');
    this.raceCount += 1;
    saveRaceCount(this.raceCount);
    addStats({ races: 1, wins: ranked && place === 1 ? 1 : 0, podiums: ranked && place <= 3 ? 1 : 0, tricks: p.tricks, distance: Math.round(Math.max(0, p.dist)) });
    const fameRank = mode !== 'tutorial' ? addFame(id, { name: this.menus.look.name, time: p.finishTime, date: new Date().toISOString().slice(0, 10), mode }) : 0;
    if ((ranked && place === 1) || newBestRace) this.platform.happytime();

    let best = newBestRace ? p.finishTime : previous;
    let newBest = newBestRace;
    let medal: { medal: 0 | 1 | 2 | 3; improved: boolean; nextTarget: number | null; ghostSaved: boolean } | undefined;
    if (mode === 'tt') {
      const ghostBest = this.ghost.ghostTime;
      const m = medalFor(id, p.finishTime);
      const improved = saveMedal(id, m);
      const ghostSaved = ghostBest === null || p.finishTime < ghostBest;
      if (ghostSaved) saveGhost(this.ghost.result(id, p.finishTime, this.menus.look.name, this.menus.look.shell));
      const targets = MEDAL_TIMES[id];
      medal = { medal: m, improved, ghostSaved, nextTarget: m < 3 && targets ? targets[2 - m] : null };
      best = ghostSaved ? p.finishTime : ghostBest;
      newBest = ghostSaved && ghostBest !== null;
    }
    let gp: { rows: { racer: number; points: number; gained: number }[]; race: number; of: number; last: boolean } | undefined;
    if (mode === 'gp' && this.gp) {
      const gained = new Array(RACER_COUNT).fill(0);
      race.order.forEach((racer, k) => {
        gained[racer] = GP_POINTS[k] ?? 0;
        this.gp!.points[racer] += gained[racer];
      });
      const rows = this.gp.points.map((points, racer) => ({ racer, points, gained: gained[racer] })).sort((a, b) => b.points - a.points || a.racer - b.racer);
      gp = { rows, race: this.gp.index + 1, of: this.gp.tracks.length, last: this.gp.index >= this.gp.tracks.length - 1 };
    }
    if (mode === 'tutorial') setTutorialDone();

    this.hud.show(false);
    this.hud2.show(false);
    this.tutorial.stop();
    this.ttPanel?.classList.add('hidden');
    this.menus.showResults({
      place,
      time: p.finishTime,
      best,
      newBest,
      topSpeedKmh: p.maxSpeed * KMH,
      tricks: p.tricks,
      trickScore: p.trickScore,
      rows: race.order.filter((i) => !race.racers[i].inactive).map((i) => ({ racer: i, time: race.racers[i].finished ? race.racers[i].finishTime : null })),
      trackName: track.def.name,
      hasNext: TRACKS.some((d) => d.id !== id && loadUnlocked().has(d.id)),
      lapTimes: [...race.lapTimes],
      unlocked,
      cosmetics: this.newCosmetics(earnedBefore),
      mode,
      medal,
      gp,
      p2Place: mode === 'duo' ? race.rank[1] + 1 : undefined,
      fameRank,
      rewardAvailable: this.platform.adsAvailable && !this.rewardStart,
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
      this.accumulator += Math.min(delta, 0.25);
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        race.step();
        this.accumulator -= FIXED_DT;
        steps += 1;
      }
      this.alpha = this.accumulator / FIXED_DT;
      for (const r of race.racers) r.events.length = 0;
      race.events.length = 0;
      race.items.events.length = 0;
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
      pose.spinOut = r.spinOutAngle;
      pose.shield = r.shield > 0;
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

    if (this.menus.look.trail === 'rainbow') this.views[0].slime.color.setHSL((this.time * 0.35) % 1, 0.85, 0.62);

    // Camera.
    const p = race.player;
    const target = this.views[0].pos;
    if (this.state === 'menu') {
      this.tmp2.copy(target).setY(target.y - 0.1);
      this.rig.orbit(this.reducedMotion ? 0 : delta, this.tmp2, 3.6, 1.2, 0.22, Math.PI - p.heading - this.menuAngle, 0.3);
    } else if (race.phase === 'grid' || race.phase === 'countdown') {
      this.rig.update(delta, target, p, false);
    } else if (race.phase === 'finished' || p.finished) {
      this.rig.orbit(delta, target, 6.5, 2.2, 0.5);
    } else {
      this.rig.update(delta, target, p, p.boostTimer > 0);
    }
    if (this.mode === 'duo' && this.state !== 'menu') {
      const r2 = race.racers[1];
      const t2 = this.views[1].pos;
      if (r2.finished) this.rig2.orbit(delta, t2, 6.5, 2.2, 0.5);
      else this.rig2.update(delta, t2, r2, r2.boostTimer > 0);
    }
    const racing = this.state === 'racing' && race.phase === 'racing' && this.mode !== 'duo';
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
    this.itemView.update(race.items, this.reducedMotion ? 0 : this.time);
    this.critterView.update(race.critters, this.reducedMotion ? 0 : this.time, race.racers);
    this.weather.update(this.reducedMotion ? 0 : delta, this.time, this.camera);
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
    if (r.mode === 'slide' && r.driftLevel > 0 && rnd() < delta * 70) {
      // Drift sparks from both sides of the foot: blue, then orange.
      const c = r.driftLevel === 2 ? COLORS.orangeSpark : COLORS.blueSpark;
      const side = rnd() < 0.5 ? -1 : 1;
      const rx = -r.vel.z / Math.max(speed, 1);
      const rz = r.vel.x / Math.max(speed, 1);
      this.particles.emit(foot.x + rx * side * 0.45, foot.y + 0.08, foot.z + rz * side * 0.45, -r.vel.x * 0.1 + rx * side * 2, 1.5 + rnd() * 2, -r.vel.z * 0.1 + rz * side * 2, c, 0.12 + rnd() * 0.06, 0.3, 10);
    }
    if (r.superSlime > 0 && rnd() < delta * 30) {
      this.particles.emit(view.pos.x + (rnd() - 0.5), view.pos.y + rnd() * 0.6, view.pos.z + (rnd() - 0.5), 0, 1.2, 0, COLORS.slime, 0.14, 0.6, 0);
    }
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
    if (this.mode !== 'duo' || this.state === 'menu') {
      if (track.def.theme.bloom && this.menus.settings.quality >= 1 && this.autoLevel < 3) this.renderBloom();
      else this.renderer.render(this.scene, this.camera);
      return;
    }
    // Split-screen: player one on top, player two below.
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const half = Math.floor(h / 2);
    const aspect = w / Math.max(1, half);
    for (const cam of [this.camera, this.camera2]) {
      if (Math.abs(cam.aspect - aspect) > 1e-3) {
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
      }
    }
    const r = this.renderer;
    r.setScissorTest(true);
    r.setViewport(0, h - half, w, half);
    r.setScissor(0, h - half, w, half);
    this.fitTags(this.camera, 0);
    r.render(this.scene, this.camera);
    r.setViewport(0, 0, w, h - half);
    r.setScissor(0, 0, w, h - half);
    this.fitTags(this.camera2, 1);
    r.render(this.scene, this.camera2);
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
  }

  /** Show and size the rivals' name tags for one camera (split-screen renders twice); `self` gets none. */
  private fitTags(cam: THREE.Camera, self: number): void {
    for (let i = 0; i < RACER_COUNT; i += 1) {
      const view = this.views[i];
      if (!view.tag) continue;
      const dist = view.pos.distanceTo(cam.position);
      view.tag.visible = i !== self && dist < 70 && dist > 4.5 && this.state !== 'menu' && !this.race.racers[i].inactive;
      const k = THREE.MathUtils.clamp(dist / 22, 0.42, 2.6);
      view.tag.scale.set(2.6 * k, 0.65 * k, 1);
    }
  }

  private renderBloom(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dpr = this.renderer.getPixelRatio();
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      // High threshold: only the unlit glowing caps, lanterns, fireflies and pads bloom.
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.5, 0.92));
      this.composer.addPass(new OutputPass());
    }
    const key = `${w}x${h}@${dpr}`;
    if (key !== this.composerSize) {
      this.composerSize = key;
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }
    this.composer.render();
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
      const p2 = this.race.racers[1];
      if (this.mode === 'duo') this.rig2.snap(p2.pos, p2.speed > 2 ? Math.atan2(p2.vel.x, -p2.vel.z) : p2.heading);
      // A second of real stepping + visual updates so camera, trails and particles are representative.
      for (let i = 0; i < 70; i += 1) {
        this.race.step();
        this.race.step();
        this.handleEvents();
        this.updateRaceUi(1 / 60);
        if (this.mode === 'duo') this.updateModes(1 / 60);
        this.syncVisuals(1 / 60);
      }
      this.render();
      this.publishDiagnostics();
    };
    /** Autopilot the player to a distance into the race (s on lap 1 = distance from the line). */
    const raceTo = (s: number, extra?: () => boolean, trackId = 'backyard') => {
      this.setTrack(trackId);
      this.beginRace();
      this.race.autopilot = true;
      const target = track.rel(s, track.def.startS);
      simulateUntil(() => this.race.player.dist >= (target < 0 ? target + track.length : target) && (extra ? extra() : true), 200);
      settle();
    };
    const kicker = (id: string) => () => {
      loadTrack(id);
      const k = KICKER!;
      raceTo(k.s1 + 6, () => !this.race.player.grounded, id);
    };
    const states: Record<string, () => void> = {
      menu: () => {
        this.setTrack('backyard');
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
      'big-drop': kicker('backyard'),
      'pre-cannon': () => {
        loadTrack('backyard');
        raceTo(track.cannon.launchS - 30);
      },
      cannon: () => {
        loadTrack('backyard');
        raceTo(track.cannon.launchS + 25, () => this.race.player.cannon > 1.4);
      },
      'veggie-play': () => raceTo(270, undefined, 'veggie'),
      'veggie-drop': kicker('veggie'),
      'pond-play': () => raceTo(300, undefined, 'pond'),
      'pond-leap': kicker('pond'),
      'sandbox-play': () => raceTo(250, undefined, 'sandbox'),
      'sandbox-zigzag': () => raceTo(520, undefined, 'sandbox'),
      'frost-play': () => raceTo(240, undefined, 'frost'),
      'frost-pond': () => raceTo(560, undefined, 'frost'),
      'glow-play': () => raceTo(230, undefined, 'glow'),
      'glow-hollow': () => raceTo(430, undefined, 'glow'),
      'glow-jump': kicker('glow'),
      tracks: () => {
        this.toMenu(true);
        (document.getElementById('btn-play') as HTMLButtonElement).click();
        this.render();
      },
      garage: () => {
        this.setTrack('backyard');
        this.toMenu(true);
        this.menus.show('garage');
        for (let i = 0; i < 30; i += 1) this.syncVisuals(1 / 60);
        this.render();
      },
      modes: () => {
        this.toMenu(true);
        (document.getElementById('btn-play') as HTMLButtonElement).click();
        this.render();
      },
      tutorial: () => {
        this.mode = 'tutorial';
        raceTo(150);
        this.render();
      },
      'tt-play': () => {
        // Record a full autopilot run first so a ghost exists, then race against it.
        this.mode = 'tt';
        this.setTrack('backyard');
        this.beginRace();
        this.race.autopilot = true;
        let last = -1;
        simulateUntil(() => {
          if (this.race.time !== last && this.race.phase === 'racing') this.ghost.record(this.race.time, this.race.player);
          last = this.race.time;
          return this.race.player.finished;
        }, 400);
        saveGhost(this.ghost.result('backyard', this.race.player.finishTime + 0.8, 'ghost', 0x7fd8ff));
        this.seed += 7;
        raceTo(236);
        this.updateModes(1 / 60);
        this.syncVisuals(1 / 60);
        this.render();
      },
      'duo-play': () => {
        this.mode = 'duo';
        this.setTrack('backyard');
        this.beginRace();
        this.race.autopilot = true;
        // Let the rival AI drive player two for the capture.
        this.race.humans = [0];
        simulateUntil(() => this.race.player.dist >= 236, 200);
        this.race.humans = [0, 1];
        settle();
        this.render();
      },
      fame: () => {
        this.toMenu(true);
        (document.getElementById('btn-fame') as HTMLButtonElement).click();
        this.render();
      },
      podium: () => {
        this.toMenu(true);
        this.gp = { tracks: TRACKS.map((d) => d.id), index: 4, points: [44, 38, 31, 22, 12, 9] };
        this.showPodium();
        this.render();
      },
      'garage-wizard': () => {
        this.setTrack('backyard');
        this.toMenu(true);
        const look = { ...this.menus.look, hat: 'wizard' as const, pattern: 'galaxy' as const, trail: 'rainbow' };
        this.applyLook(look);
        this.menus.show('garage');
        for (let i = 0; i < 30; i += 1) this.syncVisuals(1 / 60);
        this.render();
      },
      'garage-viking': () => {
        this.setTrack('backyard');
        this.toMenu(true);
        this.applyLook({ ...this.menus.look, hat: 'viking', pattern: 'gold' });
        this.menus.show('garage');
        for (let i = 0; i < 30; i += 1) this.syncVisuals(1 / 60);
        this.render();
      },
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
        this.mode = 'race';
        this.gp = null;
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
      /** Advance one real frame (physics, visuals, render) while screenshots are frozen: for promo clips. */
      stepFrame: (dt: number) => {
        const was = this.pausedForScreenshot;
        this.pausedForScreenshot = false;
        this.update(dt, 0);
        this.render();
        this.pausedForScreenshot = was;
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
      score: Math.round(p.dist),
      targetScore: Math.round(race.totalDist),
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
      player: {
        position: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        speed: p.speed,
        // Downhill grade of the ground just ahead (+ = descending), bumps included.
        grade: -(track.height(p.s + 1.5, p.d) - track.height(p.s - 0.5, p.d)) / 2,
        // Travel direction relative to the course (0 = straight down the track, + = pointing right).
        trackYaw: lerpAngle(0, (p.speed > 1.5 && p.mode !== 'crawl' ? Math.atan2(p.vel.x, -p.vel.z) : p.heading) - track.heading(p.s), 1),
      },
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


