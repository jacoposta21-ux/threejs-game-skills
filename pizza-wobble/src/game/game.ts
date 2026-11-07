/**
 * Game orchestrator: fixed 60 Hz simulation separated from rendering, state machine
 * (title / select / playing / paused / end / garage / settings), shift rules, camera, juice.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh, Quaternion, Vector3 } from 'three';
import { GameRenderer, type Quality } from '../render/renderer.ts';
import { materials, timeUniform } from '../render/materials.ts';
import { ParticlePool } from '../render/particles.ts';
import { PhysicsSim, FIXED_DT } from '../physics/sim.ts';
import type { PizzaBox } from '../physics/pile.ts';
import { generateLevel, groundHeight } from '../levels/generator.ts';
import { PathGrid } from '../levels/pathfinding.ts';
import { CELL, Cell, type LevelData, type LevelSpec } from '../levels/types.ts';
import type { LevelsFile } from '../levels/progression.ts';
import { DISTRICT_ORDER, DISTRICT_UNLOCK_STARS, districtForTurn } from '../levels/districts.ts';
import { buildCity, type CityInfo } from '../world/city.ts';
import { Traffic } from '../world/traffic.ts';
import { Ambient } from '../world/ambient.ts';
import { ScooterView } from '../world/scooterView.ts';
import { Deliveries, makeArrow } from '../world/deliveries.ts';
import { Input } from './input.ts';
import { UI, type HudState } from '../ui/ui.ts';
import { audio } from '../audio/audio.ts';
import { loadSave, writeSave, totalStars, type SaveData } from './save.ts';
import {
  DELIVERY_MAX_SPEED,
  TURN_SECONDS,
  bumpScale,
  deliveryTip,
  heatLossPerSecond,
  maxSpeed,
  starsFor,
  upgradeCost,
  type UpgradeId,
} from './rules.ts';
import { StubAds, MidgamePolicy } from '../services/ads.ts';
import { analytics } from '../services/analytics.ts';
import { S } from '../strings.ts';
import { G, groups } from '../physics/groups.ts';

type R = typeof RAPIER_NS;
type State = 'title' | 'select' | 'playing' | 'paused' | 'end' | 'garage' | 'settings';

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const lostScratch: PizzaBox[] = [];
const topScratch: PizzaBox[] = [];

interface Shift {
  level: LevelData;
  elapsed: number;
  timeLeft: number;
  coins: number;
  delivered: number;
  lost: number;
  done: boolean[];
  cleanSinceDelivery: boolean;
  recoverUsed: boolean;
  extraUsed: boolean;
  ended: boolean;
  endTimer: number;
  endReason: string;
  lastLostHeat: number;
  started: boolean;
}

export class Game {
  rapier: R;
  gr: GameRenderer;
  ui: UI;
  input = new Input();
  save: SaveData;
  levels: LevelsFile;
  ads: StubAds;
  midgame = new MidgamePolicy();
  state: State = 'title';
  prevMenu: State = 'title';

  sim!: PhysicsSim;
  level!: LevelData;
  city!: CityInfo;
  traffic: Traffic | null = null;
  ambient: Ambient | null = null;
  world = new Group();
  scooterView = new ScooterView();
  deliveries = new Deliveries();
  arrow = makeArrow();
  grid!: PathGrid;
  route: number[] = [];
  routeTarget = -1;
  routeTimer = 0;
  shift: Shift | null = null;
  turn = 1;

  dust: ParticlePool;
  sparks: ParticlePool;
  confetti: ParticlePool;

  acc = 0;
  timeScale = 1;
  slowmo = 0;
  whoaCooldown = 0;
  whoaWatch = 0;
  lostSinceWhoa = 0;
  shake = 0;
  zoom = 0;
  time = 0;
  camPos = new Vector3();
  camLook = new Vector3();
  steamTimer = 0;
  dustTimer = 0;
  lastCause = { impact: -99, bump: -99, brake: -99 };
  orbit = 0;
  autopilot = false;
  debugOn = false;
  debugEl: HTMLElement | null = null;
  colliderLines: LineSegments | null = null;
  fpsFrames = 0;
  fpsTime = 0;
  fps = 60;
  autoQualityTimer = -1;
  autoQualityFrames = 0;
  qualityDetected: Quality | null = null;
  unlockAll = false;
  paused = false;
  sessionStart = performance.now();
  lastFrame = performance.now();
  private cobbleAmp = 0;
  private hudState: HudState = { time: 0, timeMax: TURN_SECONDS, heat: 100, coins: 0, speed: 0, stops: [], pile: 0, pileMax: 0 };
  private stopsView: { x: number; z: number; done: boolean; next: boolean }[] = [];
  private carsView: { x: number; z: number }[] = [];

  constructor(rapier: R, canvas: HTMLCanvasElement, uiRoot: HTMLElement, levels: LevelsFile) {
    this.rapier = rapier;
    this.levels = levels;
    this.gr = new GameRenderer(canvas);
    this.ui = new UI(uiRoot);
    this.save = loadSave();
    audio.muted = this.save.muted;
    this.ads = new StubAds(document.body, S.adStub);
    this.ads.onPauseChange = (p) => {
      if (p) audio.suspend();
      else if (!this.paused) audio.resume();
    };
    const mats = materials();
    this.dust = new ParticlePool(400, mats.dot, false);
    this.sparks = new ParticlePool(200, mats.dot, true);
    this.confetti = new ParticlePool(300, mats.dot, false);
    this.gr.scene.add(this.world, this.scooterView.root, this.deliveries.group, this.arrow, this.dust.points, this.sparks.points, this.confetti.points);
    this.arrow.visible = false;
    this.applyQuality();
    this.bindUi();
    this.bindInput();
    analytics.track('session_start');
    window.addEventListener('pagehide', () => analytics.track('session_end', { duration_s: Math.round((performance.now() - this.sessionStart) / 1000) }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    window.addEventListener('blur', () => this.autoPause());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    if (new URLSearchParams(location.search).get('debug') === '1') this.toggleDebug();
  }

  // ---------------- setup ----------------
  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gr.resize(w, h);
    document.documentElement.style.setProperty('--s', String(Math.max(0.55, Math.min(1.25, Math.min(w / 1280, h / 720)))));
    for (const p of [this.dust, this.sparks, this.confetti]) p.setScale(h * this.gr.renderer.getPixelRatio());
  }

  effectiveQuality(): Quality {
    if (this.save.quality !== 'auto') return this.save.quality;
    return this.qualityDetected ?? 'high';
  }
  applyQuality() {
    this.gr.setQuality(this.effectiveQuality());
    this.resize();
  }

  private persist() {
    writeSave(this.save);
  }

  private bindInput() {
    this.input.onReset = () => this.respawn();
    this.input.onPause = () => {
      if (this.state === 'playing') this.pauseGame();
      else if (this.state === 'paused') this.resumeGame();
    };
    this.input.onDebug = () => this.toggleDebug();
    this.input.onHorn = () => {
      if (this.state === 'playing') audio.horn();
    };
    const tb = this.ui.touchButtons();
    this.input.bindTouch(tb.left, 'left');
    this.input.bindTouch(tb.right, 'right');
    this.input.bindTouch(tb.gas, 'gas');
    this.input.bindTouch(tb.brake, 'brake');
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private bindUi() {
    const ui = this.ui;
    ui.onClick = () => audio.click();
    ui.onPlay = () => this.go('select');
    ui.onBack = () => this.go(this.state === 'garage' && this.prevMenu === 'end' ? 'end' : 'title');
    ui.onGarage = () => {
      this.prevMenu = this.state === 'end' ? 'end' : 'title';
      this.go('garage');
    };
    ui.onSettings = () => {
      this.prevMenu = 'title';
      this.go('settings');
    };
    ui.onTurn = (n) => this.startTurn(n);
    ui.onPause = () => this.pauseGame();
    ui.onResume = () => this.resumeGame();
    ui.onRestart = () => this.betweenShifts(this.turn);
    ui.onNext = () => this.betweenShifts(Math.min(30, this.turn + 1));
    ui.onMenu = () => {
      this.ads.gameplayStop();
      this.loadTitleScene();
      this.go('title');
    };
    ui.onMute = () => {
      this.save.muted = !this.save.muted;
      audio.setMuted(this.save.muted);
      this.persist();
      if (this.state === 'paused') ui.pause(this.save.muted);
      if (this.state === 'settings') ui.settings(this.save);
      if (this.state === 'title') ui.title(this.save, this.save.muted);
      this.go(this.state);
    };
    ui.onQuality = (q) => {
      this.save.quality = q;
      this.persist();
      this.applyQuality();
      ui.settings(this.save);
      this.go('settings');
    };
    ui.onBuy = (id) => this.buy(id);
    ui.onDouble = () => {
      const sh = this.shift;
      if (!sh) return;
      analytics.track('ad_rewarded_shown', { placement: 'double_tips' });
      this.ads.showRewarded(
        'double_tips',
        () => {
          analytics.track('booster_used', { placement: 'double_tips' });
          this.save.coins += sh.coins;
          this.persist();
          this.ui.setEndTips(sh.coins * 2);
          audio.coin(0);
        },
        () => {},
      );
    };
    ui.onReset = () => this.respawn();
  }

  go(s: State) {
    if (s !== 'paused' && s !== 'playing') this.ads.gameplayStop();
    this.state = s;
    const ui = this.ui;
    if (s === 'title') {
      ui.title(this.save, this.save.muted);
      ui.show('title');
    } else if (s === 'select') {
      ui.district = districtForTurn(this.save.lastTurn);
      if (this.unlockAll) this.save.stars = this.save.stars.map((x) => Math.max(x, 0));
      ui.select(this.unlockAll ? { ...this.save, stars: this.save.stars.map((x) => Math.max(x, 2)) } : this.save);
      ui.show('select');
    } else if (s === 'garage') {
      ui.garage(this.save);
      ui.show('garage');
    } else if (s === 'settings') {
      ui.settings(this.save);
      ui.show('settings');
    } else if (s === 'playing') ui.show('hud');
    else if (s === 'paused') ui.show('hud', 'pause');
    else if (s === 'end') ui.show('end');
  }

  // ---------------- world building ----------------
  private buildWorld(spec: LevelSpec) {
    // dispose old
    if (this.sim) {
      this.traffic?.dispose(this.sim.world);
      this.sim.world.free();
    }
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      c.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.level = generateLevel(spec);
    const map = this.level.map;
    this.grid = new PathGrid(map, 1.5);
    this.cobbleAmp = map.cobbleAmp;
    this.sim = new PhysicsSim(this.rapier, this.save.upgrades.rack);
    const low = this.effectiveQuality() === 'low';
    this.city = buildCity(map, this.rapier, this.sim.world, low);
    this.world.add(this.city.group);
    this.traffic = new Traffic(this.rapier, this.sim.world, this.level.traffic, this.ground, spec.seed);
    this.traffic.onHonk = () => audio.carHorn();
    this.sim.scooter.carColliderHandles = this.traffic.handles;
    this.world.add(this.traffic.group);
    this.ambient = new Ambient(this.city, this.ground, spec.seed, map.district, map.cols * CELL, map.waterLine);
    this.ambient.onFlutter = () => audio.flutter();
    this.ambient.onGull = () => audio.gull();
    this.world.add(this.ambient.group);
    this.scooterView.setRackLevel(this.save.upgrades.rack);
    this.ui.buildMinimap(map);
    // scooter at the pizzeria
    const p = map.pizzeria;
    this.sim.scooter.place(p.x, p.z, p.heading, this.ground(p.x, p.z));
    this.applyTuning();
    this.sim.pile.build(spec.pizzas);
    // settle the pile
    const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    for (let i = 0; i < 40; i++) this.sim.tick(idle, this.ground, this.cobble);
    this.snapCamera();
  }

  ground = (x: number, z: number) => groundHeight(this.level.map, x, z);
  cobble = (x: number, z: number) => {
    const map = this.level.map;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const t = map.cells[Math.max(0, Math.min(map.rows - 1, cz)) * map.cols + Math.max(0, Math.min(map.cols - 1, cx))];
    if (t !== Cell.ROAD && t !== Cell.PLAZA) return 0;
    return this.cobbleAmp * Math.sin(z * 3.9) * Math.sin(x * 4.1 + z * 1.3);
  };

  private applyTuning() {
    const u = this.save.upgrades;
    const t = this.sim.scooter.tuning;
    t.maxSpeed = maxSpeed(u.motor);
    t.bumpScale = bumpScale(u.suspension);
  }

  loadTitleScene() {
    const spec = this.levels.levels[Math.max(0, this.save.lastTurn - 1)] ?? this.levels.levels[0];
    this.buildWorld(spec);
    this.shift = null;
    this.deliveries.clear();
    this.ui.setLabels(0);
    this.arrow.visible = false;
  }

  // ---------------- shifts ----------------
  private betweenShifts(turn: number) {
    if (this.midgame.canShow(turn) && this.state === 'end') {
      this.midgame.mark();
      analytics.track('ad_interstitial_shown');
      this.ads.showMidgame('between_shifts');
    }
    this.startTurn(turn);
  }

  startTurn(turn: number) {
    const spec = this.levels.levels[turn - 1];
    if (!spec) return;
    this.turn = turn;
    this.save.lastTurn = turn;
    this.persist();
    this.buildWorld(spec);
    this.shift = {
      level: this.level,
      elapsed: 0,
      timeLeft: TURN_SECONDS,
      coins: 0,
      delivered: 0,
      lost: 0,
      done: this.level.stops.map(() => false),
      cleanSinceDelivery: true,
      recoverUsed: false,
      extraUsed: false,
      ended: false,
      endTimer: 0,
      endReason: '',
      lastLostHeat: 100,
      started: false,
    };
    this.deliveries.set(this.level.stops, this.ground);
    this.ui.setLabels(this.level.stops.length);
    // face the scooter toward the first suggested route
    this.updateRoute();
    if (this.route.length > 4) {
      const cols = this.level.map.cols;
      const c = this.route[4];
      const dx = (c % cols) * CELL + 1 - this.sim.scooter.x;
      const dz = Math.floor(c / cols) * CELL + 1 - this.sim.scooter.z;
      const base = this.level.map.pizzeria.heading;
      const h = Math.sin(base) * dx + Math.cos(base) * dz >= 0 ? base : base + Math.PI;
      const sc = this.sim.scooter;
      const fp = new Vector3().copy(sc.rackPos);
      const fr = new Quaternion().copy(sc.rackRot);
      sc.place(sc.x, sc.z, h, this.ground(sc.x, sc.z));
      this.sim.pile.teleport(fp, fr, sc.rackPos, sc.rackRot);
      this.snapCamera();
    }
    this.arrow.visible = true;
    this.route = [];
    this.routeTimer = 0;
    this.whoaCooldown = 2;
    this.slowmo = 0;
    this.timeScale = 1;
    this.input.clear();
    this.ui.showHint();
    setTimeout(() => this.ui.hideHint(), 6000);
    this.go('playing');
    this.paused = false;
    this.ads.gameplayStart();
    analytics.track('level_start', { turn, district: spec.district });
    if (this.save.quality === 'auto' && this.qualityDetected === null) {
      this.autoQualityTimer = 5;
      this.autoQualityFrames = 0;
    }
    this.ui.popup(S.shiftN(turn), 'small', 1600);
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.paused = true;
    this.ui.pause(this.save.muted);
    this.go('paused');
    this.ads.gameplayStop();
    audio.engine(0, 0, false);
  }
  resumeGame() {
    if (this.state !== 'paused') return;
    this.paused = false;
    this.go('playing');
    this.input.clear();
    this.ads.gameplayStart();
    this.lastFrame = performance.now();
  }
  private autoPause() {
    if (this.state === 'playing') this.pauseGame();
    audio.engine(0, 0, false);
  }

  private respawn() {
    if (this.state !== 'playing' || !this.shift || this.shift.ended) return;
    const sc = this.sim.scooter;
    const idx = this.grid.nearestPassable(this.grid.cellOf(sc.x, sc.z));
    // pick the nearest road cell and align to the road direction
    let best = idx;
    let bd = Infinity;
    const cols = this.level.map.cols;
    const cx0 = idx % cols;
    const cz0 = Math.floor(idx / cols);
    for (let dz = -6; dz <= 6; dz++)
      for (let dx = -6; dx <= 6; dx++) {
        const x = cx0 + dx;
        const z = cz0 + dz;
        if (x < 0 || z < 0 || x >= cols || z >= this.level.map.rows) continue;
        const t = this.level.map.cells[z * cols + x];
        if (t !== Cell.ROAD && t !== Cell.QUAY) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = z * cols + x;
        }
      }
    const x = (best % cols) * CELL + 1;
    const z = Math.floor(best / cols) * CELL + 1;
    const seg = this.level.map.segments.find((s) => x >= s.x0 * CELL && x <= s.x1 * CELL && z >= s.z0 * CELL && z <= s.z1 * CELL);
    let heading = sc.heading;
    if (seg) {
      const base = seg.axis === 'x' ? Math.PI / 2 : 0;
      heading = Math.cos(sc.heading - base) >= 0 ? base : base + Math.PI;
    }
    const fromPos = new Vector3().copy(sc.rackPos);
    const fromRot = new Quaternion().copy(sc.rackRot);
    sc.place(x, z, heading, this.ground(x, z));
    this.sim.pile.teleport(fromPos, fromRot, sc.rackPos, sc.rackRot);
    this.shift.timeLeft = Math.max(0, this.shift.timeLeft - 3);
    this.ui.popup('−3 s', 'small', 900);
    this.snapCamera();
  }

  private nextStopIndex(): number {
    return this.routeTarget;
  }

  private updateRoute() {
    const sh = this.shift;
    if (!sh) return;
    const sc = this.sim.scooter;
    const start = this.grid.nearestPassable(this.grid.cellOf(sc.x, sc.z));
    let best = -1;
    let bestD = Infinity;
    this.level.stops.forEach((s, i) => {
      if (sh.done[i]) return;
      const goal = this.grid.nearestPassable(this.grid.cellOf(s.address.x, s.address.z));
      const d = this.grid.astar(start, goal);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.routeTarget = best;
    if (best >= 0) {
      const s = this.level.stops[best];
      this.grid.astar(start, this.grid.nearestPassable(this.grid.cellOf(s.address.x, s.address.z)), this.route);
    } else this.route.length = 0;
  }

  private deliver(i: number) {
    const sh = this.shift!;
    const stop = this.level.stops[i];
    const top = this.sim.pile.topFirst(topScratch);
    const n = Math.min(stop.count, top.length);
    if (n <= 0) return;
    sh.done[i] = true;
    const heats: number[] = [];
    const target = this.deliveries.catchPoint(i, new Vector3());
    for (let k = 0; k < n; k++) {
      const b = top[k];
      heats.push(b.heat);
      const t = b.body.translation();
      const from = new Vector3(t.x, t.y, t.z);
      this.sim.pile.remove(b);
      setTimeout(() => {
        this.scooterView.launchThrow(from, target, () => {
          audio.thud(0.5);
          this.confetti.emit({ x: target.x, y: target.y + 0.3, z: target.z, vy: 3.5, spread: 2.2, count: 26, life: 1.4, size: 0.12, gravity: 5, drag: 1.2, color: [0xd7262c, 0xf2c761, 0x6f9a72, 0x58a8e6, 0xffffff][k % 5] });
          this.confetti.emit({ x: target.x, y: target.y + 0.3, z: target.z, vy: 3.5, spread: 2.2, count: 20, life: 1.4, size: 0.12, gravity: 5, drag: 1.2, color: 0xf2c761 });
        });
      }, k * 160);
    }
    const perfect = sh.cleanSinceDelivery;
    const tip = deliveryTip(heats, sh.elapsed, perfect);
    sh.coins += tip;
    sh.delivered += n;
    sh.cleanSinceDelivery = true;
    const avgHeat = heats.reduce((a, b) => a + b, 0) / heats.length;
    this.deliveries.complete(i, avgHeat >= 50);
    audio.bell();
    analytics.track('delivery', { turn: this.turn, heat: Math.round(avgHeat), perfect });
    this.ui.popup(`+${tip}`, 'gold', 1200);
    if (perfect) setTimeout(() => this.ui.popup(S.perfect, 'good', 1100), 350);
    const sp = this.project(target);
    this.ui.flyCoins(sp.x, sp.y, Math.min(10, 3 + Math.round(tip / 6)), (k) => audio.coin(k % 4));
    if (sh.done.every((d) => d)) this.finishShift(S.allDelivered, 1.4);
  }

  private finishShift(reason: string, delay = 0) {
    const sh = this.shift!;
    if (sh.ended) return;
    sh.ended = true;
    sh.endReason = reason;
    sh.endTimer = delay;
  }

  private showEnd() {
    const sh = this.shift!;
    const total = this.level.spec.pizzas;
    const stars = starsFor(sh.delivered, total, sh.lost);
    const prevTotal = totalStars(this.save);
    this.save.stars[this.turn - 1] = Math.max(this.save.stars[this.turn - 1], stars);
    this.save.coins += sh.coins;
    const nowTotal = totalStars(this.save);
    for (const d of DISTRICT_ORDER) {
      if (prevTotal < DISTRICT_UNLOCK_STARS[d] && nowTotal >= DISTRICT_UNLOCK_STARS[d] && !this.save.unlocked.includes(d)) {
        this.save.unlocked.push(d);
        analytics.track('district_unlocked', { district: d });
        setTimeout(() => this.ui.popup(`🔓 ${S.districts[d]}`, 'gold', 2200), 900);
      }
    }
    this.persist();
    if (stars > 0) analytics.track('level_complete', { turn: this.turn, stars, time: Math.round(sh.elapsed), pizzas_lost: sh.lost });
    else analytics.track('level_fail', { turn: this.turn, reason: sh.timeLeft <= 0 ? 'time' : 'pizzas', time: Math.round(sh.elapsed) });
    this.ui.end({
      turn: this.turn,
      stars,
      delivered: sh.delivered,
      total,
      lost: sh.lost,
      tips: sh.coins,
      reason: sh.endReason,
      canDouble: sh.coins > 0,
      hasNext: this.turn < 30 && (stars > 0 || this.save.stars[this.turn - 1] > 0),
    });
    audio.jingle(stars > 0);
    audio.engine(0, 0, false);
    this.go('end');
    this.ads.gameplayStop();
  }

  private buy(id: UpgradeId) {
    const lvl = this.save.upgrades[id];
    const cost = upgradeCost(id, lvl);
    if (this.save.coins < cost) return;
    this.save.coins -= cost;
    this.save.upgrades[id] = lvl + 1;
    this.persist();
    analytics.track('upgrade_bought', { id, level: lvl + 1 });
    audio.coin(2);
    if (id === 'rack') {
      this.sim.pile.setRackLevel(this.save.upgrades.rack);
      this.scooterView.setRackLevel(this.save.upgrades.rack);
    }
    this.applyTuning();
    this.ui.garage(this.save);
    this.go('garage');
  }

  // ---------------- simulation ----------------
  private fixedStep() {
    const sh = this.shift;
    const sc = this.sim.scooter;
    const playing = this.state === 'playing' && sh && !sh.ended;
    let inp = this.input.update(FIXED_DT);
    if (!playing) inp = { throttle: 0, brake: 0, steer: 0, handbrake: !!sh };
    else if (this.autopilot) inp = this.autopilotInput();
    if (playing && !sh.started && (inp.throttle > 0 || inp.brake > 0)) sh.started = true;
    this.sim.tick(inp, this.ground, this.cobble);
    this.traffic?.step(FIXED_DT, sc.x, sc.z, this.ground);
    const ev = sc.events;
    const now = this.time;
    if (ev.impact > 2) {
      this.lastCause.impact = now;
      const k = Math.min(1, ev.impact / 10);
      this.shake = Math.max(this.shake, 0.15 + k * 0.5);
      _v.set(sc.x + sc.forwardX * 0.9, sc.y + 0.6, sc.z + sc.forwardZ * 0.9);
      this.sparks.emit({ x: _v.x, y: _v.y, z: _v.z, vy: 2, spread: 3.5, count: 14 + Math.round(k * 20), life: 0.5, size: 0.09, gravity: 9, drag: 1, color: 0xffb347 });
      if (ev.impact > 4) audio.crash();
      else audio.thud(0.7);
      if (ev.impactCar) audio.carHorn();
      if (sh) sh.cleanSinceDelivery = false;
    }
    if (ev.landing > 1.2) {
      this.lastCause.bump = now;
      this.shake = Math.max(this.shake, Math.min(0.5, ev.landing * 0.08));
      audio.bump();
      for (let i = 0; i < 10; i++) this.dust.emit({ x: sc.x + (Math.random() - 0.5), y: sc.y + 0.05, z: sc.z + (Math.random() - 0.5), vy: 0.8, spread: 1.8, life: 0.9, size: 0.45, grow: 1.5, color: 0xd8c4a4, drag: 2 });
      if (sh) sh.cleanSinceDelivery = false;
    } else if (ev.bump > 14) {
      this.lastCause.bump = now;
      if (sh && ev.bump > 22) sh.cleanSinceDelivery = false;
    }
    if (sc.longAccel < -6) this.lastCause.brake = now;

    // pile losses
    const lost = this.sim.pile.update(this.ground, lostScratch);
    for (const b of lost) this.onBoxLost(b);

    if (!playing || !sh) return;
    sh.elapsed += FIXED_DT;
    if (sh.started || sh.elapsed > 3) sh.timeLeft -= FIXED_DT;
    // heat
    const loss = heatLossPerSecond(this.save.upgrades.bag) * FIXED_DT;
    for (const b of this.sim.pile.boxes) if (b.alive) b.heat = Math.max(0, b.heat - loss);

    // deliveries
    for (let i = 0; i < this.level.stops.length; i++) {
      if (sh.done[i]) continue;
      const a = this.level.stops[i].address;
      const d = Math.hypot(sc.x - a.x, sc.z - a.z);
      if (d < 2.1) {
        if (Math.abs(sc.speed) < DELIVERY_MAX_SPEED) this.deliver(i);
        else if (this.whoaCooldown < 4.5) {
          this.ui.popup(S.slowDown, 'small', 900);
          this.whoaCooldown = 5;
        }
      }
    }
    // near-miss WHOA
    this.whoaCooldown -= FIXED_DT;
    const inst = this.sim.pile.instability();
    if (inst > 0.12 && this.whoaCooldown <= 0 && this.sim.pile.aliveCount > 1) {
      this.whoaCooldown = 6;
      this.slowmo = 0.3;
      this.zoom = 1;
      this.whoaWatch = 1.2;
      this.lostSinceWhoa = 0;
      this.ui.popup(S.whoa, 'whoa', 1000);
      audio.whoa();
    }
    if (this.whoaWatch > 0) {
      this.whoaWatch -= FIXED_DT;
      if (this.whoaWatch <= 0 && this.lostSinceWhoa === 0) {
        this.ui.popup(S.saved, 'good small', 900);
      }
    }
    // time / pile outcomes
    if (sh.timeLeft <= 10 && !sh.extraUsed && sh.done.some((d) => !d) && sh.timeLeft > 0) {
      sh.extraUsed = true;
      this.ui.offer(S.extraTime, () => {
        analytics.track('ad_rewarded_shown', { placement: 'extra_time' });
        this.pauseForAd();
        this.ads.showRewarded(
          'extra_time',
          () => {
            analytics.track('booster_used', { placement: 'extra_time' });
            sh.timeLeft += 30;
            this.ui.popup('+30 s', 'good', 1100);
          },
          () => {},
        );
      }, 7000);
    }
    if (sh.timeLeft <= 0) {
      sh.timeLeft = 0;
      this.finishShift(S.timeUp, 0.6);
    } else if (this.sim.pile.aliveCount === 0 && sh.done.some((d) => !d)) {
      if (!sh.recoverUsed && sh.endTimer === 0 && !sh.ended) {
        // grace period so the recover offer can be taken
        sh.ended = true;
        sh.endReason = S.allLost;
        sh.endTimer = 4.5;
      } else this.finishShift(S.allLost, 1.2);
    }
  }

  private pauseForAd() {
    // ads stub pauses via gameplayStop/Start; freeze simulation while the overlay is visible
    this.paused = true;
    const was = this.ads.onPauseChange;
    this.ads.onPauseChange = (p) => {
      was(p);
      if (!p) {
        this.paused = false;
        this.ads.onPauseChange = was;
        this.lastFrame = performance.now();
      }
    };
  }

  private onBoxLost(b: PizzaBox) {
    const sh = this.shift;
    const t = b.body.translation();
    const r = b.body.rotation();
    const lv = b.body.linvel();
    this.scooterView.launchLost(_v.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _v2.set(lv.x, lv.y, lv.z));
    const heat = b.heat;
    this.sim.pile.remove(b);
    audio.lost();
    this.shake = Math.max(this.shake, 0.25);
    this.lostSinceWhoa++;
    if (!sh || sh.ended || this.state !== 'playing') return;
    sh.lost++;
    sh.cleanSinceDelivery = false;
    sh.lastLostHeat = heat;
    const now = this.time;
    const sc = this.sim.scooter;
    const recent = (x: number) => now - x < 1.5;
    const cause = recent(this.lastCause.impact) ? 'urto' : recent(this.lastCause.bump) ? 'dosso' : recent(this.lastCause.brake) ? 'frenata' : Math.abs(sc.latAccel) > 3 ? 'curva' : 'frenata';
    analytics.track('pizza_lost', { turn: this.turn, speed: Math.round(Math.abs(sc.speed) * 10) / 10, cause });
    this.ui.popup(S.lost, '', 1000);
    if (!sh.recoverUsed) {
      sh.recoverUsed = true;
      this.ui.offer(S.recoverPizza, () => {
        analytics.track('ad_rewarded_shown', { placement: 'recover_pizza' });
        this.pauseForAd();
        this.ads.showRewarded(
          'recover_pizza',
          () => {
            analytics.track('booster_used', { placement: 'recover_pizza' });
            this.sim.pile.pushTop(sh.lastLostHeat);
            sh.lost = Math.max(0, sh.lost - 1);
            if (sh.ended && sh.endReason === S.allLost) {
              sh.ended = false;
              sh.endTimer = 0;
            }
            this.ui.popup(S.saved, 'good', 1000);
          },
          () => {},
        );
      }, 6000);
    }
  }

  private apStuck = 0;
  private apReverse = 0;
  private autopilotInput() {
    const sc = this.sim.scooter;
    const inp = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    if (!this.route.length || this.routeTarget < 0) return inp;
    let ci = 0;
    let cd = Infinity;
    const cols = this.level.map.cols;
    for (let i = 0; i < this.route.length; i++) {
      const c = this.route[i];
      const d = Math.hypot((c % cols) * CELL + 1 - sc.x, Math.floor(c / cols) * CELL + 1 - sc.z);
      if (d < cd) {
        cd = d;
        ci = i;
      }
    }
    const look = this.route[Math.min(this.route.length - 1, ci + 3)];
    let tx = (look % cols) * CELL + 1;
    let tz = Math.floor(look / cols) * CELL + 1;
    const stop = this.level.stops[this.routeTarget].address;
    const dStop = Math.hypot(stop.x - sc.x, stop.z - sc.z);
    if (dStop < 6) {
      tx = stop.x;
      tz = stop.z;
    }
    const want = Math.atan2(tx - sc.x, tz - sc.z);
    let da = want - sc.heading;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    // stuck / facing backwards: reverse with opposite lock
    if (this.apReverse > 0) {
      this.apReverse -= FIXED_DT;
      inp.brake = 1;
      inp.steer = -Math.sign(da);
      return inp;
    }
    if (Math.abs(sc.speed) < 0.4) this.apStuck += FIXED_DT;
    else this.apStuck = 0;
    if (this.apStuck > 1.2) {
      this.apStuck = 0;
      this.apReverse = 1.1;
    }
    inp.steer = Math.max(-1, Math.min(1, da * 2.5));
    // look further ahead for upcoming turns
    const far = this.route[Math.min(this.route.length - 1, ci + 7)];
    const fa = Math.atan2((far % cols) * CELL + 1 - sc.x, Math.floor(far / cols) * CELL + 1 - sc.z) - sc.heading;
    const turnAhead = Math.abs(Math.atan2(Math.sin(fa), Math.cos(fa)));
    const targetSpeed = Math.abs(da) > 1.1 ? 1.6 : dStop < 9 ? 2.2 : Math.abs(da) > 0.6 || turnAhead > 0.7 ? 3.4 : 7;
    if (sc.speed < targetSpeed - 0.3) inp.throttle = 1;
    else if (sc.speed > targetSpeed + 0.6) inp.brake = 1;
    return inp;
  }

  // ---------------- camera ----------------
  private snapCamera() {
    this.computeCamera(1, true);
  }

  private computeCamera(dt: number, snap = false) {
    const sc = this.sim.scooter;
    const cam = this.gr.camera;
    const fx = sc.forwardX * Math.sign(sc.speed >= -0.5 ? 1 : 1);
    const fz = sc.forwardZ;
    let dist = 5.6 - this.zoom * 2.4;
    let height = 2.7 - this.zoom * 0.9;
    if (this.state === 'title' || this.state === 'select' || this.state === 'settings' || this.state === 'garage' || this.state === 'end') {
      const close = this.state === 'garage' || this.state === 'end';
      this.orbit += dt * 0.25;
      const sw = Math.sin(this.orbit) * (close ? 0.35 : 0.5);
      const rx = -fz;
      const rz = fx;
      const dF = close ? 3.0 : 4.6;
      const dS = close ? 1.3 + sw : 1.6 + sw;
      _v.set(sc.x + fx * dF + rx * dS, sc.y + (close ? 1.25 : 1.55), sc.z + fz * dF + rz * dS);
      if (close) _v2.set(sc.x - fx * 0.4 + rx * 0.9, sc.y + 0.95, sc.z - fz * 0.4 + rz * 0.9);
      else _v2.set(sc.x - fx * 1.2 - rx * 1.6, sc.y + 1.4, sc.z - fz * 1.2 - rz * 1.6);
      if (snap) {
        this.camPos.copy(_v);
        this.camLook.copy(_v2);
      }
      this.camPos.lerp(_v, 1 - Math.exp(-dt * 2));
      this.camLook.lerp(_v2, 1 - Math.exp(-dt * 3));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      cam.fov += ((close ? 50 : 55) - cam.fov) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();
      return;
    }
    // chase camera
    const desired = _v.set(sc.x - fx * dist, sc.y + height, sc.z - fz * dist);
    // pull in when a wall is behind
    const head = _v2.set(sc.x, sc.y + 1.6, sc.z);
    const dir = { x: desired.x - head.x, y: desired.y - head.y, z: desired.z - head.z };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (!this.camRay) this.camRay = new this.rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    const ray = this.camRay;
    ray.origin = { x: head.x, y: head.y, z: head.z };
    ray.dir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    const hit = this.sim.world.castRay(ray, len, true, undefined, groups(G.CHASSIS, G.WORLD));
    if (hit) {
      const t = Math.max(1.2, hit.timeOfImpact - 0.3);
      desired.set(head.x + (dir.x / len) * t, head.y + (dir.y / len) * t + 0.4, head.z + (dir.z / len) * t);
    }
    if (snap) this.camPos.copy(desired);
    const k = 1 - Math.exp(-dt * (this.zoom > 0 ? 6 : 4.2));
    this.camPos.lerp(desired, k);
    const look = _v2.set(sc.x + fx * 3 * (1 - this.zoom), sc.y + 1.0 + this.zoom * 0.1, sc.z + fz * 3 * (1 - this.zoom));
    if (this.zoom > 0) {
      const rp = sc.rackPos;
      look.lerp(rp, this.zoom * 0.8);
    }
    if (snap) this.camLook.copy(look);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 8));
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
      cam.position.z += (Math.random() - 0.5) * this.shake * 0.5;
    }
    cam.lookAt(this.camLook);
    const fovTarget = 58 + Math.min(12, Math.abs(sc.speed) * 0.85) - this.zoom * 8;
    cam.fov += (fovTarget - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  }

  private project(p: Vector3) {
    _v.copy(p).project(this.gr.camera);
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: _v.z > 1 };
  }

  // ---------------- frame ----------------
  frame = () => {
    requestAnimationFrame(this.frame);
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.paused || document.hidden) dt = 0;
    // fps
    this.fpsFrames++;
    this.fpsTime += (now - (this.fpsLast || now)) / 1000;
    this.fpsLast = now;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (this.autoQualityTimer > 0 && this.state === 'playing' && dt > 0) {
      this.autoQualityTimer -= dt;
      this.autoQualityFrames++;
      if (this.autoQualityTimer <= 0) {
        const avg = this.autoQualityFrames / 5;
        this.qualityDetected = avg < 45 ? 'low' : 'high';
        if (this.qualityDetected === 'low') this.applyQuality();
        console.debug('[quality] auto', avg.toFixed(1), 'fps ->', this.qualityDetected);
      }
    }
    if (!this.sim) return;
    // slow motion for near misses
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      this.timeScale = 0.3;
    } else this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 6);
    this.zoom = Math.max(0, this.zoom - dt * (this.slowmo > 0 ? 0 : 1.4));
    const sdt = dt * this.timeScale;
    this.time += sdt;
    timeUniform.value = this.time;
    if (this.state !== 'paused') {
      this.acc += sdt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.fixedStep();
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps >= 5) this.acc = 0;
    }
    const sh = this.shift;
    if (sh?.ended && this.state === 'playing') {
      sh.endTimer -= dt;
      if (sh.endTimer <= 0) this.showEnd();
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sc = this.sim.scooter;
    // visuals
    const jitter = this.cobble(sc.x, sc.z) * 3 * Math.min(1, Math.abs(sc.speed) / 6) * Math.sin(this.time * 47);
    this.scooterView.update(this.sim, jitter);
    this.scooterView.updateFlights(sdt);
    this.traffic?.render(this.time);
    this.ambient?.update(sdt, this.time, sc.x, sc.z, Math.abs(sc.speed));
    this.deliveries.update(sdt, this.time, sc.x, sc.z, this.routeTarget);
    this.effects(sdt);
    this.dust.update(sdt);
    this.sparks.update(sdt);
    this.confetti.update(sdt);
    this.computeCamera(Math.max(dt, 1e-4));
    this.gr.follow(sc.x, sc.y, sc.z);
    if (this.state === 'playing' || this.state === 'paused') this.updateHud(dt);
    // audio
    if (this.state === 'playing') {
      audio.engine(Math.abs(sc.speed) / 16, this.input.state.throttle, true);
      audio.ambience(this.level.map.district === 'porto' ? 0.05 : 0.025);
    } else if (this.state !== 'paused') {
      audio.engine(0, 0, false);
      audio.ambience(this.state === 'title' ? 0.02 : 0);
    }
    if (this.colliderLines) this.updateColliderLines();
    this.gr.render(dt);
    if (this.debugEl) this.updateDebug();
  };
  private fpsLast = 0;
  private camRay: RAPIER_NS.Ray | null = null;

  private effects(dt: number) {
    const sc = this.sim.scooter;
    const speed = Math.abs(sc.speed);
    // steam from the top hot box
    this.steamTimer -= dt;
    if (this.steamTimer <= 0) {
      this.steamTimer = 0.12;
      const top = this.sim.pile.topFirst(topScratch)[0];
      if (top && top.heat > 25) {
        const t = top.body.translation();
        this.dust.emit({ x: t.x + (Math.random() - 0.5) * 0.2, y: t.y + 0.05, z: t.z + (Math.random() - 0.5) * 0.2, vy: 0.6 + top.heat / 200, spread: 0.12, life: 1.1, size: 0.07 + top.heat / 1600, grow: 3, color: 0xe8e8e8, drag: 1.5, vx: -sc.forwardX * speed * 0.3, vz: -sc.forwardZ * speed * 0.3 });
      }
    }
    // dust from wheels
    this.dustTimer -= dt;
    const braking = sc.longAccel < -5 && speed > 3;
    if (this.dustTimer <= 0 && (speed > 7 || braking) && !sc.airborne) {
      this.dustTimer = braking ? 0.03 : 0.08;
      const bx = sc.x - sc.forwardX * 0.62;
      const bz = sc.z - sc.forwardZ * 0.62;
      this.dust.emit({ x: bx, y: sc.y + 0.08, z: bz, vy: 0.4, spread: 0.5, life: 0.8, size: braking ? 0.4 : 0.28, grow: 1.6, color: this.level.map.district === 'porto' ? 0xd0cbc6 : 0xdcc6a2, drag: 2.5 });
    }
    // puddle splashes
    if (speed > 3) {
      for (const p of this.city.puddles) {
        if (Math.hypot(p.x - sc.x, p.z - sc.z) < p.r) {
          if (Math.random() < 0.5) {
            this.dust.emit({ x: sc.x, y: sc.y + 0.1, z: sc.z, vy: 2.2, spread: 1.6, count: 6, life: 0.6, size: 0.14, gravity: 9, drag: 0.5, color: 0xcfe8f5 });
            if (Math.random() < 0.08) audio.splash();
          }
        }
      }
    }
  }

  private updateHud(dt: number) {
    const sh = this.shift;
    if (!sh) return;
    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.routeTimer = 0.5;
      this.updateRoute();
    }
    const sc = this.sim.scooter;
    // guide arrow
    const next = this.nextStopIndex();
    if (next >= 0 && !sh.ended) {
      const cols = this.level.map.cols;
      let tx: number;
      let tz: number;
      const st = this.level.stops[next].address;
      if (Math.hypot(st.x - sc.x, st.z - sc.z) < 12 || this.route.length < 2) {
        tx = st.x;
        tz = st.z;
      } else {
        // look-ahead along the route
        let ci = 0;
        let cd = Infinity;
        for (let i = 0; i < this.route.length; i += 1) {
          const c = this.route[i];
          const d = Math.hypot((c % cols) * CELL + 1 - sc.x, Math.floor(c / cols) * CELL + 1 - sc.z);
          if (d < cd) {
            cd = d;
            ci = i;
          }
        }
        const c = this.route[Math.min(this.route.length - 1, ci + 5)];
        tx = (c % cols) * CELL + 1;
        tz = Math.floor(c / cols) * CELL + 1;
      }
      this.arrow.visible = true;
      this.arrow.position.set(sc.x + sc.forwardX * 0.6, sc.y + 2.35 + Math.sin(this.time * 4) * 0.06, sc.z + sc.forwardZ * 0.6);
      const ang = Math.atan2(tx - sc.x, tz - sc.z) + Math.PI;
      let d = ang - this.arrow.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.arrow.rotation.y += d * Math.min(1, dt * 8);
      this.arrow.rotation.x = 0.75;
    } else this.arrow.visible = false;
    // HUD values
    const top = this.sim.pile.topFirst(topScratch);
    let heat = 0;
    for (const b of top) heat += b.heat;
    heat = top.length ? heat / top.length : 0;
    const hs = this.hudState;
    hs.time = sh.timeLeft;
    hs.heat = heat;
    hs.coins = sh.coins;
    hs.speed = sc.speed;
    hs.pile = top.length;
    hs.pileMax = this.level.spec.pizzas;
    hs.stops.length = this.level.stops.length;
    this.stopsView.length = this.level.stops.length;
    this.level.stops.forEach((s, i) => {
      hs.stops[i] = { count: s.count, done: sh.done[i], next: i === next };
      this.stopsView[i] = { x: s.address.x, z: s.address.z, done: sh.done[i], next: i === next };
      // 3D labels
      const lab = this.ui.labels[i];
      if (lab) {
        if (sh.done[i]) lab.style.display = 'none';
        else {
          const p = this.project(_v2.set(s.address.x, this.ground(s.address.x, s.address.z) + 5.2, s.address.z));
          const dist = Math.hypot(s.address.x - sc.x, s.address.z - sc.z);
          if (p.behind || dist > 120) lab.style.display = 'none';
          else {
            lab.style.display = 'block';
            lab.style.left = `${p.x}px`;
            lab.style.top = `${p.y}px`;
            const txt = `🍕×${s.count} · ${Math.round(dist)} m`;
            if (lab.textContent !== txt) lab.textContent = txt;
          }
        }
      }
    });
    this.ui.updateHud(hs);
    this.carsView.length = 0;
    if (this.traffic) for (const c of this.traffic.cars) this.carsView.push(c);
    this.ui.drawMinimap(sc.x, sc.z, sc.heading, this.stopsView, this.carsView, this.route, this.level.map.cols);
  }

  // ---------------- debug ----------------
  toggleDebug() {
    this.debugOn = !this.debugOn;
    if (!this.debugOn) {
      this.debugEl?.remove();
      this.debugEl = null;
      if (this.colliderLines) {
        this.gr.scene.remove(this.colliderLines);
        this.colliderLines = null;
      }
      return;
    }
    const el = document.createElement('div');
    el.id = 'debug';
    el.innerHTML = `<b>DEBUG (F1)</b><span data-d="stats"></span>
      <button data-d="tp">Teleport to next delivery</button><button data-d="coins">+1000 coins</button>
      <button data-d="unlock">Unlock all districts</button><button data-d="col">Show colliders</button><button data-d="auto">Autopilot</button>`;
    document.getElementById('ui')!.appendChild(el);
    this.debugEl = el;
    el.querySelector('[data-d=tp]')!.addEventListener('click', () => this.debugTeleport());
    el.querySelector('[data-d=coins]')!.addEventListener('click', () => {
      this.save.coins += 1000;
      this.persist();
      if (this.state === 'garage') this.go('garage');
      if (this.state === 'title') this.go('title');
    });
    el.querySelector('[data-d=unlock]')!.addEventListener('click', () => {
      this.unlockAll = true;
      if (this.state === 'select') this.go('select');
    });
    el.querySelector('[data-d=col]')!.addEventListener('click', () => this.toggleColliders());
    el.querySelector('[data-d=auto]')!.addEventListener('click', () => (this.autopilot = !this.autopilot));
  }

  debugTeleport() {
    if (!this.shift || this.state !== 'playing') return;
    this.updateRoute();
    const i = this.routeTarget;
    if (i < 0) return;
    const a = this.level.stops[i].address;
    const sc = this.sim.scooter;
    const fromPos = new Vector3().copy(sc.rackPos);
    const fromRot = new Quaternion().copy(sc.rackRot);
    const x = a.x + a.nx * 0.3;
    const z = a.z + a.nz * 0.3;
    sc.place(x, z, Math.atan2(-a.nz, -a.nx) + Math.PI / 2, this.ground(x, z));
    this.sim.pile.teleport(fromPos, fromRot, sc.rackPos, sc.rackRot);
    this.snapCamera();
  }

  private toggleColliders() {
    if (this.colliderLines) {
      this.gr.scene.remove(this.colliderLines);
      this.colliderLines = null;
      return;
    }
    this.colliderLines = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true }));
    this.colliderLines.frustumCulled = false;
    this.gr.scene.add(this.colliderLines);
  }
  private updateColliderLines() {
    const { vertices, colors } = this.sim.world.debugRender();
    const g = this.colliderLines!.geometry;
    g.setAttribute('position', new BufferAttribute(vertices, 3));
    g.setAttribute('color', new BufferAttribute(colors, 4));
  }
  private updateDebug() {
    const s = this.debugEl!.querySelector('[data-d=stats]')!;
    const sc = this.sim.scooter;
    s.textContent = `FPS ${this.fps.toFixed(0)} · draw calls ${this.gr.drawCalls} · tris ${(this.gr.triangles / 1000).toFixed(0)}k · q=${this.gr.quality} · v=${sc.speed.toFixed(1)} · auto=${this.autopilot}`;
  }

  /** Hooks for automated tests/screenshots. */
  exposeHooks() {
    (window as unknown as { __pw: unknown }).__pw = {
      game: this,
      startTurn: (n: number) => this.startTurn(n),
      autopilot: (on: boolean) => (this.autopilot = on),
      teleport: () => this.debugTeleport(),
      state: () => this.state,
      shift: () => (this.shift ? { done: this.shift.done, delivered: this.shift.delivered, lost: this.shift.lost, timeLeft: this.shift.timeLeft, ended: this.shift.ended } : null),
      stats: () => ({ fps: this.fps, calls: this.gr.drawCalls, tris: this.gr.triangles, quality: this.gr.quality }),
      go: (s: State) => this.go(s),
      setCoins: (c: number) => {
        this.save.coins = c;
        this.persist();
      },
      unlockAll: () => (this.unlockAll = true),
      pose: (x: number, z: number, h: number) => {
        const sc = this.sim.scooter;
        const fp = new Vector3().copy(sc.rackPos);
        const fr = new Quaternion().copy(sc.rackRot);
        sc.place(x, z, h, this.ground(x, z));
        this.sim.pile.teleport(fp, fr, sc.rackPos, sc.rackRot);
        this.snapCamera();
      },
      level: () => this.level,
      /** run the fixed-step simulation faster than real time (for slow headless browsers) */
      simulate: (seconds: number) => {
        const n = Math.round(seconds / FIXED_DT);
        for (let i = 0; i < n; i++) {
          if (i % 30 === 0) this.updateRoute();
          this.fixedStep();
          const sh = this.shift;
          if (sh?.ended) {
            sh.endTimer -= FIXED_DT;
            if (sh.endTimer <= 0) {
              this.showEnd();
              break;
            }
          }
        }
        this.snapCamera();
        return this.state;
      },
    };
  }
}
