import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { createSeededRandom } from '../core/random';
import { TrackBuilder } from '../editor/TrackBuilder';
import type { RaceMarble } from '../marbles/MarbleManager';
import { MarbleManager } from '../marbles/MarbleManager';
import { SKINS, getSkin } from '../marbles/MarbleSkins';
import { ProgressionManager, type Reward } from '../meta/ProgressionManager';
import { SaveManager } from '../meta/SaveManager';
import { Settings } from '../meta/Settings';
import { CHALLENGES, evaluate, type ChallengeDef } from '../modes/ChallengeManager';
import { RandomTrackGenerator, type Difficulty } from '../modes/RandomTrackGenerator';
import { BUILTIN_TRACKS, menuTrack } from '../modes/builtinTracks';
import { initPhysics } from '../physics/PhysicsWorld';
import { CrazyGamesPlatform } from '../platform/CrazyGames';
import { CameraManager, type CamMode } from '../race/CameraManager';
import { Effects } from '../race/Effects';
import { RaceManager, type RaceResult } from '../race/RaceManager';
import { SceneManager } from '../scene/SceneManager';
import { ThumbnailRenderer } from '../scene/ThumbnailRenderer';
import { TrackView } from '../scene/TrackView';
import { PIECES, getDef } from '../track/catalog';
import { getBuild } from '../track/PieceRegistry';
import { cloneTrack, newTrack, trackBounds } from '../track/Track';
import { validateTrack } from '../track/TrackValidator';
import type { TrackData } from '../track/types';
import { UIManager } from '../ui/UIManager';

export type Screen = 'loading' | 'menu' | 'play' | 'editor' | 'race' | 'results' | 'challenges' | 'random' | 'collection';
export type EditMode = 'creative' | 'challenge' | 'random' | 'saved';

export interface Session {
  mode: EditMode;
  challenge?: ChallengeDef;
  /** Where "back" goes from the editor. */
  returnTo: Screen;
  savedId?: string;
  lastRace?: { marbles: RaceMarble[]; picked: number; seed: number };
}

export class GameManager {
  readonly scene: SceneManager;
  readonly cams: CameraManager;
  readonly view = new TrackView();
  readonly marbles = new MarbleManager();
  readonly effects = new Effects();
  readonly audio = new AudioManager();
  readonly settings = new Settings();
  readonly progress = new ProgressionManager();
  readonly saves = new SaveManager();
  readonly platform = new CrazyGamesPlatform();
  readonly builder: TrackBuilder;
  readonly race: RaceManager;
  readonly thumbs: ThumbnailRenderer;
  readonly ui: UIManager;
  readonly generator = new RandomTrackGenerator(44);
  screen: Screen = 'loading';
  session: Session = { mode: 'creative', returnTo: 'menu' };
  /** Track currently shown in the world (editor / race / preview). */
  track: TrackData = newTrack();
  selectedMarble = -1;
  paused = false;
  private clock = new THREE.Timer();
  private elapsed = 0;
  private frame = 0;
  private fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private menuOrbit = 0;
  private autosaveTimer = 0;
  private racesSinceAd = 0;
  private hiddenPause = false;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private rng = createSeededRandom(Date.now() % 100000);

  constructor(readonly canvas: HTMLCanvasElement) {
    this.scene = new SceneManager(canvas);
    this.cams = new CameraManager(this.scene.camera, canvas);
    this.scene.world.add(this.view.root, this.marbles.root, this.effects.root);
    this.builder = new TrackBuilder(this.scene.camera, canvas, this.view, this.cams, this.audio);
    this.scene.world.add(this.builder.root);
    this.race = new RaceManager(this.marbles, this.view, this.effects, this.cams, this.audio);
    this.thumbs = new ThumbnailRenderer(this.scene.renderer);
    this.ui = new UIManager(this);
    this.applySettings();
    this.settings.onChange(() => this.applySettings());
    this.platform.onAudioMute = (m) => this.audio.setVolumes(this.settings.data.master, this.settings.data.music, this.settings.data.sfx, m || this.settings.data.muted);
    this.platform.onAdPause = (p) => {
      this.audio.setPaused(p);
      this.paused = p;
    };
    this.builder.onChange(() => {
      if (this.screen === 'editor') {
        this.ui.updateEditor();
        this.scheduleAutosave();
      }
    });
    this.race.callbacks = {
      countdown: (n) => this.ui.countdown(String(n)),
      go: () => this.ui.countdown('GO!'),
      finish: (m, place, time) => this.ui.raceFinish(m, place, time),
      fall: (m, elim) => this.ui.raceFall(m, elim),
      done: (r) => this.onRaceDone(r),
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenPause = true;
        this.audio.setPaused(true);
      } else if (this.hiddenPause) {
        this.hiddenPause = false;
        this.audio.setPaused(false);
        this.clock.update();
      }
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    this.installTestHooks();
  }

  /* -------------------------------------------------------------- boot */

  async boot(): Promise<void> {
    this.ui.loading(0.05, 'Warming up the marbles…');
    this.platform.loadingStart();
    const cg = this.platform.init();
    await initPhysics();
    this.ui.loading(0.25, 'Polishing track pieces…');
    // build geometry in chunks so the loading bar moves
    for (let i = 0; i < PIECES.length; i += 1) {
      getBuild(PIECES[i].id);
      if (i % 5 === 0) {
        this.ui.loading(0.25 + (0.5 * i) / PIECES.length, 'Polishing track pieces…');
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this.ui.loading(0.8, 'Painting thumbnails…');
    await new Promise((r) => setTimeout(r, 0));
    for (const p of PIECES) this.thumbs.piece(p.id);
    this.ui.loading(0.95, 'Opening the workshop…');
    await Promise.race([cg, new Promise((r) => setTimeout(r, 1500))]);
    this.platform.loadingStop();
    this.ui.loading(1, 'Ready!');
    this.loop();
    this.goMenu();
    this.ui.hideLoading();
  }

  private applySettings(): void {
    const s = this.settings.data;
    this.audio.setVolumes(s.master, s.music, s.sfx, s.muted);
    if (this.scene.quality !== s.quality || this.frame === 0) this.scene.setQuality(s.quality);
    this.effects.enabled = s.quality !== 'low';
  }

  /* -------------------------------------------------------------- loop */

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    this.clock.update();
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.1);
    this.frame += 1;
    this.fpsAcc += raw;
    this.fpsFrames += 1;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.ui.fps(this.fps);
    }
    if (this.hiddenPause) return;
    const frozen = this.pausedForScreenshot;
    const simDt = frozen || this.paused ? 0 : dt;
    if (!frozen) this.elapsed += dt;
    const t = this.reducedMotion ? 0 : this.elapsed;
    this.scene.update(simDt, t);
    if (this.screen === 'race' || this.screen === 'results' || this.screen === 'menu') {
      if (!frozen) this.race.update(simDt);
      this.view.animate(this.race.sim ? this.race.sim.physics.time : t, simDt, this.race.sim ? this.race.moverPose : undefined, this.race.gateOpen);
    } else {
      this.view.animate(t, simDt, undefined, 0);
    }
    if (this.screen === 'menu') this.updateMenuCamera(simDt);
    else if (this.screen === 'race' || this.screen === 'results') {
      if (this.cams.mode === 'free') this.cams.update(simDt, null);
      else this.cams.update(simDt, this.race.camContext(this.selectedMarble));
      if (this.screen === 'race' && this.frame % 6 === 0) this.ui.updateRaceHud();
    } else {
      this.cams.updateTween(simDt);
      this.cams.controls.update();
    }
    this.marbles.selected = this.selectedMarble;
    this.marbles.update(this.scene.camera, t);
    this.effects.update(simDt);
    this.builder.update(t);
    this.scene.render();
    if (this.screen === 'race') this.ui.updateLabels();
    this.publishDiagnostics();
  };

  private updateMenuCamera(dt: number): void {
    this.menuOrbit += dt * 0.06;
    const c = new THREE.Vector3(-4, 8, 4);
    const r = 34;
    this.scene.camera.position.set(c.x + Math.cos(this.menuOrbit) * r, 21 + Math.sin(this.menuOrbit * 0.7) * 3, c.z + Math.sin(this.menuOrbit) * r);
    this.scene.camera.lookAt(c);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.scene.camera.setViewOffset(w, h, w > h ? -w * 0.2 : 0, w > h ? 0 : h * 0.12, w, h);
    // keep the demo race running forever
    if (this.race.state === 'finished' || (this.race.sim && this.race.sim.time > 60)) this.race.restart(false);
  }

  /* ----------------------------------------------------------- screens */

  setScreen(s: Screen): void {
    this.screen = s;
    if (s !== 'menu') this.scene.camera.clearViewOffset();
    const editing = s === 'editor';
    this.builder.setActive(editing);
    this.cams.useOrbit(editing || s === 'random' || s === 'play' || s === 'challenges' || s === 'collection');
    if (s === 'editor' || s === 'race') this.platform.gameplayStart();
    else this.platform.gameplayStop();
    this.audio.setMood(s === 'race' ? 'race' : s === 'editor' ? 'editor' : 'menu');
  }

  goMenu(): void {
    this.race.stop();
    this.paused = false;
    this.loadWorld(menuTrack());
    this.setScreen('menu');
    this.cams.useOrbit(false);
    const marbles = this.defaultMarbles(8);
    this.race.start({ track: this.track, marbles, seed: 11, picked: -1, demo: true });
    this.ui.showMenu();
  }

  /** Show a track in the world without editing (play hub, random preview). */
  loadWorld(track: TrackData): void {
    this.track = cloneTrack(track);
    this.scene.setArea(track.meta?.area ?? 32);
    this.scene.applyEnv(track.env && this.progress.envUnlocked(track.env) ? track.env : this.currentEnv());
    this.builder.load(this.track, {});
    this.view.sync(this.track);
  }

  currentEnv(): string {
    const env = (this.settings.data as unknown as { env?: string }).env ?? 'sky';
    return this.progress.envUnlocked(env) ? env : 'sky';
  }

  setEnv(id: string): void {
    if (!this.progress.envUnlocked(id)) return;
    (this.settings.data as unknown as { env?: string }).env = id;
    this.settings.save();
    this.track.env = id;
    this.scene.applyEnv(id);
  }

  openPlayHub(): void {
    this.race.stop();
    this.setScreen('play');
    this.ui.showPlayHub();
  }

  /** Open the editor with a track. */
  openEditor(track: TrackData, session: Partial<Session> = {}): void {
    this.race.stop();
    this.paused = false;
    this.session = { mode: 'creative', returnTo: 'menu', ...session };
    this.track = cloneTrack(track);
    this.scene.setArea(this.track.meta?.area ?? 32);
    this.scene.applyEnv(this.track.env && this.progress.envUnlocked(this.track.env) ? this.track.env : this.currentEnv());
    const ch = this.session.challenge;
    const locked = new Set<number>(ch ? ch.setup().locked : []);
    this.builder.load(this.track, {
      allowed: (id) => {
        if (ch) return ch.allowed ? ch.allowed(id) : true;
        if (this.session.mode === 'random') return true;
        return this.progress.pieceUnlocked(id);
      },
      locked,
      maxPieces: ch?.maxPieces,
    });
    this.builder.setArea(this.track.meta?.area ?? 32);
    this.track = this.builder.track;
    this.setScreen('editor');
    const box = trackBounds(this.track);
    if (this.track.pieces.length === 0) box.setFromCenterAndSize(new THREE.Vector3(0, 6, 0), new THREE.Vector3(40, 12, 40));
    this.cams.frame(box, true);
    this.ui.showEditor();
  }

  newCreativeTrack(): void {
    const t = newTrack('My Marble Run');
    t.meta = { source: 'creative', area: 32 };
    this.openEditor(t, { mode: 'creative', returnTo: 'menu' });
    // seed with a starting gate so beginners can extend right away
    this.builder.startPlacing('start');
  }

  continueCreative(): void {
    const auto = this.saves.loadAutosave();
    if (auto && auto.pieces.length) this.openEditor(auto, { mode: auto.meta?.source === 'random' ? 'random' : 'creative', returnTo: 'menu', savedId: this.saves.get(auto.id) ? auto.id : undefined });
    else this.newCreativeTrack();
  }

  openChallenge(ch: ChallengeDef): void {
    const { track } = ch.setup();
    track.name = ch.title;
    this.openEditor(track, { mode: 'challenge', challenge: ch, returnTo: 'challenges' });
  }

  private scheduleAutosave(): void {
    window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      if (this.session.mode !== 'challenge') this.saves.autosave(this.builder.track);
    }, 600);
  }

  /** Save current editor track into My Tracks. */
  saveTrack(): boolean {
    const t = this.builder.track;
    t.meta = { ...(t.meta ?? {}), source: t.meta?.source === 'random' ? 'random' : 'creative' };
    t.thumb = this.thumbnail();
    const ok = this.saves.put(t);
    this.session.savedId = t.id;
    if (ok) this.progress.data.stats.built += 0;
    return ok;
  }

  thumbnail(): string | undefined {
    try {
      return this.thumbs.track(this.scene.scene, trackBounds(this.builder.track));
    } catch {
      return undefined;
    }
  }

  /* -------------------------------------------------------------- race */

  defaultMarbles(n: number): RaceMarble[] {
    const owned = this.progress.ownedSkins();
    const last = this.settings.data.lastSkins.filter((s) => owned.includes(s));
    const pool = [...last, ...owned.filter((s) => !last.includes(s))];
    const out: RaceMarble[] = [];
    for (let i = 0; i < n; i += 1) {
      const skin = pool[i % pool.length] ?? SKINS[i % SKINS.length].id;
      out.push({ index: i, skin, name: this.settings.data.lastNames[skin] ?? getSkin(skin).name });
    }
    return out;
  }

  /** Validate and open race setup for the current editor track. */
  testRace(): void {
    const v = validateTrack(this.builder.track.pieces);
    if (!v.ok) {
      this.audio.error();
      this.ui.toast(v.issues.find((i) => i.level === 'error')?.msg ?? 'Track is not ready', 'error');
      this.builder.setShowIssues(true);
      return;
    }
    const ch = this.session.challenge;
    const count = ch ? ch.marbles : this.settings.data.marbleCount;
    const prev = this.session.lastRace;
    const marbles = prev && prev.marbles.length === count ? prev.marbles : this.defaultMarbles(count);
    this.ui.showRaceSetup(marbles, prev?.picked ?? 0, !!ch, (cfg) => {
      this.settings.data.marbleCount = ch ? this.settings.data.marbleCount : cfg.marbles.length;
      this.settings.data.lastSkins = cfg.marbles.map((m) => m.skin);
      for (const m of cfg.marbles) if (m.name !== getSkin(m.skin).name) this.settings.data.lastNames[m.skin] = m.name;
      this.settings.save();
      this.startRace(cfg.marbles, cfg.picked);
    });
  }

  startRace(marbles: RaceMarble[], picked: number, seed = Math.floor(this.rng() * 1e9)): void {
    this.track = cloneTrack(this.builder.track);
    this.session.lastRace = { marbles, picked, seed };
    this.builder.setActive(false);
    this.selectedMarble = -1;
    this.setScreen('race');
    this.cams.setMode('cinematic');
    this.race.start({ track: this.track, marbles, seed, picked });
    const box = trackBounds(this.track);
    this.scene.focusShadows(box.getCenter(new THREE.Vector3()), box.getSize(new THREE.Vector3()).length() * 0.6);
    this.ui.showRaceHud();
  }

  restartRace(sameSeed: boolean): void {
    const last = this.session.lastRace;
    if (!last) return;
    const seed = sameSeed ? last.seed : Math.floor(this.rng() * 1e9);
    this.ui.hideModal();
    this.startRace(last.marbles, last.picked, seed);
  }

  setCamera(mode: CamMode): void {
    if (mode === 'free') this.cams.controls.target.copy(this.cams.target3);
    this.cams.setMode(mode);
    this.ui.updateRaceHud();
  }

  selectMarble(i: number): void {
    this.selectedMarble = i;
    if (this.cams.mode !== 'selected') this.cams.setMode('selected');
    this.ui.updateRaceHud();
  }

  exitRaceToEditor(): void {
    this.race.stop();
    this.paused = false;
    this.ui.hideModal();
    this.openEditor(this.builder.track, { ...this.session });
  }

  togglePause(): void {
    if (this.screen !== 'race') return;
    this.paused = !this.paused;
    this.race.paused = this.paused;
    this.ui.showPause(this.paused);
  }

  private onRaceDone(result: RaceResult): void {
    const track = this.track;
    const v = validateTrack(track.pieces);
    let reward: Reward | null = null;
    let chEval: { states: (boolean | null)[]; passed: boolean } | null = null;
    const ch = this.session.challenge;
    if (ch) {
      chEval = evaluate(ch, { track, validation: v, result, marbles: result.rows.length });
      if (chEval.passed) {
        reward = this.progress.completeChallenge(ch.id, ch.reward);
        this.platform.happytime();
      }
    }
    const raceReward = this.progress.rewardRace({
      track,
      marbles: result.rows.length,
      finished: result.finished,
      pickedPlace: result.pickedPlace,
      duration: result.duration,
      usedPieces: result.usedPieces,
      valid: v.ok,
      source: track.meta?.source ?? 'creative',
    });
    if (result.pickedPlace === 1) this.platform.happytime();
    const merged: Reward = reward
      ? { xp: reward.xp + raceReward.xp, coins: reward.coins + raceReward.coins, lines: [...reward.lines, ...raceReward.lines], levelUps: [...reward.levelUps, ...raceReward.levelUps], unlocked: [...reward.unlocked, ...raceReward.unlocked] }
      : raceReward;
    this.racesSinceAd += 1;
    window.setTimeout(() => {
      if (this.screen !== 'race') return;
      this.setScreen('results');
      this.ui.showResults(result, merged, ch ?? null, chEval);
      if (merged.levelUps.length) this.audio.levelUp();
      else this.audio.coin();
    }, 1800);
  }

  /** Natural break between races: optional midgame ad, never during a race. */
  async breakThen(fn: () => void): Promise<void> {
    if (this.racesSinceAd >= 3) {
      this.racesSinceAd = 0;
      await this.platform.midgameBreak();
    }
    fn();
  }

  /* -------------------------------------------------------- race mode */

  raceBuiltin(id: string): void {
    const info = BUILTIN_TRACKS.find((b) => b.id === id);
    if (!info) return;
    this.raceTrack(info.make(), 'play');
  }

  raceTrack(track: TrackData, returnTo: Screen): void {
    this.openEditor(track, { mode: track.meta?.source === 'builtin' ? 'saved' : 'saved', returnTo, savedId: this.saves.get(track.id) ? track.id : undefined });
    this.testRace();
  }

  quickRace(): void {
    const pool = [...BUILTIN_TRACKS.map((b) => b.make()), ...this.saves.list().filter((t) => validateTrack(t.pieces).ok)];
    const track = pool[Math.floor(this.rng() * pool.length)];
    const owned = this.progress.ownedSkins();
    const n = 6 + Math.floor(this.rng() * 5);
    const skins = owned.slice().sort(() => this.rng() - 0.5);
    const marbles: RaceMarble[] = Array.from({ length: n }, (_, i) => {
      const skin = skins[i % skins.length];
      return { index: i, skin, name: getSkin(skin).name };
    });
    this.openEditor(track, { mode: 'saved', returnTo: 'play' });
    this.ui.showRaceSetup(marbles, Math.floor(this.rng() * n), false, (cfg) => this.startRace(cfg.marbles, cfg.picked));
  }

  /* ------------------------------------------------------- random mode */

  openRandom(): void {
    this.race.stop();
    this.setScreen('random');
    this.ui.showRandom();
  }

  generateRandom(difficulty: Difficulty, seed = Math.floor(this.rng() * 1e6)): { track: TrackData; finishers: number; attempts: number } {
    const r = this.generator.generate(seed, difficulty);
    r.track.env = this.currentEnv();
    this.loadWorld(r.track);
    this.cams.frame(trackBounds(r.track), false);
    return r;
  }

  /* -------------------------------------------------------- utilities */

  pieceThumb(id: string): string {
    return this.thumbs.piece(id);
  }

  fullscreen(): void {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  private onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (this.screen === 'editor') {
      const b = this.builder;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) b.redo();
        else b.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        b.redo();
      } else if (mod && e.key.toLowerCase() === 'c') b.copy();
      else if (mod && e.key.toLowerCase() === 'v') b.paste();
      else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        b.duplicate();
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) b.ungroup();
        else b.group();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        b.selectAll();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.ui.saveCurrent();
      } else if (e.key === 'r' || e.key === 'R') b.rotate(e.shiftKey ? -1 : 1);
      else if (e.key === 'm' || e.key === 'M') b.toggleMirror();
      else if (e.key === 'Delete' || e.key === 'Backspace') b.deleteSelection();
      else if (e.key === 'Escape') {
        if (b.placing) b.cancelPlacing();
        else b.clearSelection();
      } else if (e.key === 'PageUp' || e.key === 'q' || e.key === 'Q') b.setHeight(e.shiftKey ? 2 : 0.5);
      else if (e.key === 'PageDown' || e.key === 'e' || e.key === 'E') b.setHeight(e.shiftKey ? -2 : -0.5);
      else if (e.key === 'g' || e.key === 'G') {
        b.gridSnap = !b.gridSnap;
        this.ui.updateEditor();
      } else if (e.key === 'f' || e.key === 'F') b.focusSelection();
      else if (e.key === 'Enter' && b.placing) b.placeGhost();
      else if (e.key === ' ' && !b.placing) {
        e.preventDefault();
        this.testRace();
      }
    } else if (this.screen === 'race') {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.togglePause();
      else if (e.key >= '1' && e.key <= '6') this.setCamera((['cinematic', 'leader', 'selected', 'overview', 'finish', 'free'] as CamMode[])[Number(e.key) - 1]);
      else if (e.key === 'r' || e.key === 'R') this.restartRace(false);
    }
  }

  /* --------------------------------------------------------- QA hooks */

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
      },
      setState: async (name: string) => {
        this.ui.hideModal();
        if (name === 'menu') {
          this.goMenu();
          for (let i = 0; i < 60; i += 1) this.race.update(1 / 60);
        } else if (name === 'editor' || name === 'active-play' || name === 'race' || name === 'results') {
          const t = BUILTIN_TRACKS[2].make();
          if (name === 'editor') {
            this.openEditor(t, { mode: 'saved', returnTo: 'menu' });
            this.ui.dismissTutorial();
          } else {
            this.openEditor(t, { mode: 'saved', returnTo: 'menu' });
            this.ui.dismissTutorial();
            this.startRace(this.defaultMarbles(8), 0, 4242);
            const target = name === 'results' ? 200 : 9;
            for (let i = 0; i < target * 60 && this.race.state !== 'finished'; i += 1) this.race.update(1 / 60);
            if (name === 'results') {
              this.race.update(0);
              this.setScreen('results');
              if (this.race.result) this.ui.showResults(this.race.result, { xp: 0, coins: 0, lines: ['Race complete +40 XP'], levelUps: [], unlocked: [] }, null, null);
            }
          }
        } else if (name === 'challenges') {
          this.goMenu();
          this.setScreen('challenges');
          this.ui.showChallenges();
        } else if (name === 'collection') {
          this.goMenu();
          this.setScreen('collection');
          this.ui.showCollection();
        } else throw new Error(`Unknown test state: ${name}`);
        this.scene.render();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => undefined,
    };
    (window as unknown as { __PAM__: unknown }).__PAM__ = this;
  }

  private publishDiagnostics(): void {
    const info = this.scene.renderer.info;
    const sim = this.race.sim;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.race.raceTime,
      score: sim ? sim.states.filter((s) => s.finished).length : 0,
      targetScore: sim ? sim.states.length : 0,
      complete: this.race.state === 'finished',
      player: {
        position: sim && sim.states[0] ? { x: sim.states[0].pos.x, y: sim.states[0].pos.y, z: sim.states[0].pos.z } : { x: 0, y: 0, z: 0 },
        speed: sim?.states[0]?.speed ?? 0,
      },
      renderer: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
      canvas: { clientWidth: this.canvas.clientWidth, clientHeight: this.canvas.clientHeight, width: this.canvas.width, height: this.canvas.height, dpr: this.scene.renderer.getPixelRatio() },
      screen: this.screen,
      fps: this.fps,
      pieces: this.builder.track.pieces.length,
      raceState: this.race.state,
    } as ThreeGameDiagnostics;
  }

  get challenges(): ChallengeDef[] {
    return CHALLENGES;
  }

  defName(id: string): string {
    return getDef(id).name;
  }
}
