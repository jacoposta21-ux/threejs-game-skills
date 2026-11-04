import * as THREE from 'three';
import { createRenderer, resizeRenderer, IS_MOBILE } from '../core/Renderer';
import { Loop } from '../core/Loop';
import { Input } from '../core/Input';
import { CameraRig } from '../core/CameraRig';
import { Materials } from '../world/Materials';
import { CollisionWorld } from '../world/Collision';
import { KitBuilder } from '../world/GeoBuilder';
import { Props } from '../world/Props';
import { SignAtlas } from '../world/Signs';
import { buildBackdrop, buildClouds, buildGround, buildHub, buildSky, type AreaCtx } from '../world/World';
import { buildStation } from '../world/areas/Station';
import { buildMall } from '../world/areas/Mall';
import { buildCircus } from '../world/areas/Circus';
import { buildMuseum } from '../world/areas/Museum';
import { buildCityHall } from '../world/areas/CityHall';
import { Vfx } from '../fx/Vfx';
import { AudioSystem } from '../audio/AudioSystem';
import { Character } from '../characters/Character';
import { Npc } from '../characters/Npc';
import { HOSTS, HOST_ORDER, NAMED, civilianSpec, type HostKind } from '../characters/Archetypes';
import type { Pose } from '../characters/CharacterModel';
import { CHAT, PICKED, POSSESS_SEEN } from '../characters/Lines';
import { Progress, loadSettings, type Settings } from '../gameplay/Progress';
import { AREAS, ITEM_INFO, areaAt, areaInfo, type AreaId, type ItemId, type NpcSpawn } from '../gameplay/types';
import { Crate, CorePickup, Postcard, Saucer, type WorldObject } from '../gameplay/Objects';
import { StarBits, type BitDef } from '../gameplay/StarBits';
import { MISSIONS, currentStep, type Mission, type Target } from '../gameplay/Missions';
import { ACHIEVEMENTS } from '../gameplay/Achievements';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { renderPortraits } from '../ui/Portraits';
import { createSeededRandom } from '../utils/random';
import { Portal } from '../platform/Portal';

interface Act {
  label: string;
  pos: THREE.Vector3;
  dist: number;
  run: () => void;
}

interface PostcardInfo {
  id: string;
  area: AreaId;
  title: string;
  text: string;
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmp2 = new THREE.Vector2();

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  readonly mats = new Materials();
  readonly col = new CollisionWorld();
  readonly vfx = new Vfx();
  readonly audio = new AudioSystem();
  readonly input: Input;
  readonly cam: CameraRig;
  readonly hud: Hud;
  readonly menus: Menus;
  progress: Progress = new Progress();
  readonly settings: Settings = loadSettings();
  readonly characters: Character[] = [];
  readonly npcs: Npc[] = [];
  readonly npcById = new Map<string, Npc>();
  readonly hostChars = new Map<HostKind, Character>();
  readonly objects: WorldObject[] = [];
  readonly objById = new Map<string, WorldObject>();
  readonly crates: Crate[] = [];
  readonly postcards: PostcardInfo[] = [];
  bits!: StarBits;
  glim!: Character;
  controlled!: Character;
  carrying: Crate | null = null;
  portraits = {} as Record<HostKind, string>;
  time = 0;
  private rngFn = createSeededRandom(7);
  state: 'title' | 'play' | 'paused' | 'card' | 'ending' = 'title';
  private readonly loop: Loop;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private action: { t: number; dur: number; label: string; pose: Pose; cb: () => void; shady: boolean } | null = null;
  ejecting = false;
  private ejectT = 0;
  launching = false;
  private launchS: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; kind: 'perfect' | 'miss' } | null = null;
  private possessS: { from: THREE.Vector3; target: Character; t: number } | null = null;
  trackedMission: Mission | null = null;
  currentArea: AreaId = 'station';
  private performT = 0;
  private performTick = 0;
  private singT = 0;
  private phaseT = 0;
  private dashT = 0;
  private hitstopT = 0;
  private autosaveT = 0;
  private shadowT = 0;
  private endingT = 0;
  private replayEnding = false;
  private saucer!: Saucer;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private lastStepKey = '';
  private titleT = 0;
  private bitsTotal = 0;
  private suspicionMax = 0;
  private readonly worldRoot = new THREE.Group();
  private testMode = false;
  private readonly frameInfo = { calls: 0, triangles: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.input = new Input(canvas, document.querySelector('#touch')!, document.querySelector('#stick')!, document.querySelector('#knob')!);
    this.input.onFirstGesture = () => this.audio.unlock();
    this.cam = new CameraRig(this.camera);
    this.hud = new Hud(this.camera);
    this.menus = new Menus(this);
    this.vfx.rng = () => this.rngFn();
    this.scene.add(this.worldRoot);
    this.scene.add(this.vfx.points);
    this.buildWorld();
    this.applySettings();
    this.portraits = renderPortraits(this.renderer, this.mats);
    this.bindUi();
    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    this.installHooks();
    if (IS_MOBILE) document.body.classList.add('touch');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') {
        this.saveNow();
        this.pause();
      }
    });
    window.addEventListener('beforeunload', () => {
      if (this.state === 'play' || this.state === 'paused') this.saveNow();
    });
  }

  rng(): number {
    return this.rngFn();
  }

  get hostKind(): HostKind {
    return this.controlled?.host?.id ?? 'alien';
  }

  get actionPose(): Pose | null {
    return this.action?.pose ?? null;
  }

  start(): void {
    this.loop.start();
    this.menus.title();
    this.audio.setMusic('menu');
    this.hud.show(false);
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }

  // ===================================================================== world
  private buildWorld(): void {
    const scene = this.scene;
    scene.background = new THREE.Color('#bfe6ff');
    scene.fog = new THREE.Fog('#cdebff', 75, 210);
    this.hemi = new THREE.HemisphereLight('#fff4e0', '#7a9a6a', 1.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d0', 2.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(buildSky());
    this.worldRoot.add(buildGround(this.mats));
    this.col.bounds = { minX: -66, maxX: 70, minZ: -90, maxZ: 64 };

    const signs = new SignAtlas();
    const spawns: NpcSpawn[] = [];
    const bitDefs: BitDef[] = [];
    let bitN = 0;
    const builders: [AreaId, (c: AreaCtx) => void][] = [
      ['hub', buildHub],
      ['station', buildStation],
      ['mall', buildMall],
      ['circus', buildCircus],
      ['museum', buildMuseum],
      ['cityhall', buildCityHall],
    ];
    for (const [area, fn] of builders) {
      const k = new KitBuilder();
      const ctx: AreaCtx = {
        g: this,
        area,
        k,
        props: new Props(k, this.col),
        col: this.col,
        signs,
        mats: this.mats,
        spawns,
        bits: bitDefs,
        add: <T extends WorldObject>(o: T) => this.addObject(o),
        bit: (x, y, z) => {
          bitDefs.push({ id: `bit-${area}-${bitN++}`, area, x, y, z });
        },
        rng: () => this.rngFn(),
      };
      fn(ctx);
      const g = new THREE.Group();
      g.name = `area-${area}`;
      k.buildInto(g, this.mats, area);
      this.worldRoot.add(g);
    }
    const back = new KitBuilder();
    buildBackdrop(back, () => this.rngFn());
    buildClouds(back, () => this.rngFn());
    const bg = new THREE.Group();
    back.buildInto(bg, this.mats, 'backdrop', false);
    for (const c of bg.children) (c as THREE.Mesh).receiveShadow = false;
    this.worldRoot.add(bg);
    const signMesh = signs.build();
    if (signMesh) this.worldRoot.add(signMesh);

    this.bits = new StarBits(bitDefs, this.mats);
    this.bitsTotal = bitDefs.length;
    this.scene.add(this.bits.mesh);

    // Glim.
    this.glim = new Character('glim', 'Glim', 'alien', HOSTS.alien.spec, this.mats, HOSTS.alien, 0, 'station');
    this.addCharacter(this.glim);
    this.controlled = this.glim;
    // NPCs.
    let seed = 1;
    for (const s of spawns) {
      let ch: Character;
      if (s.type === 'host' && s.host) {
        const h = HOSTS[s.host];
        ch = new Character(s.id, h.name, s.host, h.spec, this.mats, h, seed++, s.area);
        this.hostChars.set(s.host, ch);
      } else if (s.type === 'named' && s.named) {
        const n = NAMED[s.named];
        ch = new Character(s.id, n.name, 'civilian', n.spec, this.mats, null, seed++, s.area);
      } else {
        const r = createSeededRandom(seed * 97 + 13);
        ch = new Character(s.id, s.civ === 'kid' ? 'Kid' : 'Local', 'civilian', civilianSpec(s.civ ?? 'shopper', r), this.mats, null, seed++, s.area);
      }
      ch.place(s.x, s.y ?? 0, s.z, s.yaw ?? 0);
      this.addCharacter(ch);
      const npc = new Npc(ch, s, this);
      this.npcs.push(npc);
      this.npcById.set(s.id, npc);
    }
    this.saucer = this.objById.get('saucer') as Saucer;
  }

  addObject<T extends WorldObject>(o: T): T {
    this.objects.push(o);
    this.objById.set(o.id, o);
    this.worldRoot.add(o.group);
    if (o instanceof Crate) this.crates.push(o);
    if (o instanceof Postcard) this.postcards.push({ id: o.id, area: o.area, title: o.title, text: o.text });
    return o;
  }

  /** Postcards that live in pockets rather than the world. */
  registerPostcard(id: string, area: AreaId, title: string, text: string): void {
    this.postcards.push({ id, area, title, text });
  }

  private addCharacter(c: Character): void {
    this.characters.push(c);
    this.worldRoot.add(c.model.root);
    c.onStep = (ch) => {
      if (this.near(ch.pos, 16)) this.audio.footstep(ch.kind, ch.pos);
      if (ch === this.controlled && ch.host?.id === 'strongman') this.cam.addTrauma(0.05);
    };
    c.onLand = (ch, impact) => {
      if (ch === this.controlled) {
        this.audio.play('land', { pos: ch.pos, volume: 0.4 + impact });
        if (impact > 0.3) this.vfx.burst('puff', ch.pos.x, ch.pos.y + 0.05, ch.pos.z, { count: 8, color: '#f4ecd8', speed: 2.5, up: 0.4 });
        if (ch.host?.id === 'strongman' && impact > 0.2) this.shake(0.3);
      }
    };
  }

  // ===================================================================== flow
  startGame(fresh: boolean): void {
    this.audio.unlock();
    if (fresh) Progress.clear();
    this.progress = (!fresh && Progress.load()) || new Progress();
    this.restoreFromProgress();
    this.menus.close();
    this.state = 'play';
    Portal.gameplay(true);
    this.hud.show(true);
    document.querySelector('#touch')!.classList.toggle('hidden', !IS_MOBILE);
    this.updateArea(true);
    if (fresh) {
      window.setTimeout(() => {
        if (this.testMode) return;
        this.hint('You crash-landed! Brick the porter looks strong. Walk up to him and press <b>E</b> to hop inside.', 7);
      }, 1800);
      this.say(this.glim, 'Blorp?! My saucer!', true);
    }
    this.saveNow();
  }

  private restoreFromProgress(): void {
    const p = this.progress;
    // Reset dynamic state.
    if (this.controlled !== this.glim) this.forceUnpossess();
    this.carrying = null;
    this.action = null;
    this.launchS = null;
    this.launching = false;
    this.ejecting = false;
    this.performT = this.singT = this.phaseT = 0;
    this.audio.stopLoop('sing');
    this.audio.stopLoop('phaseLoop');
    for (const c of this.crates) {
      c.state = 'rest';
      c.pos.copy(c.home);
      c.group.position.copy(c.home);
      c.syncCollider();
    }
    for (const o of this.objects) o.init(this);
    for (const n of this.npcs) {
      n.moved = false;
      n.pocketTaken = false;
      n.home.set(n.spawn.x, n.spawn.y ?? 0, n.spawn.z);
      n.homeYaw = n.spawn.yaw ?? 0;
      n.baseMode = n.spawn.mode;
      n.syncFlags(this);
      const hp = n.ch.host ? p.hosts[n.spawn.id] : undefined;
      if (hp) n.home.set(hp[0], hp[1], hp[2]);
      n.snapHome();
      n.suspicion = 0;
    }
    this.bits.markCollected(p.collected);
    const pl = p.player;
    if (pl && this.isSafeSpot(pl[0], pl[2])) this.glim.place(pl[0], pl[1], pl[2], pl[3] ?? 0);
    else {
      const sp = areaInfo(p.lastArea).spawn;
      this.glim.place(sp[0], 0, sp[1], sp[2]);
    }
    if (!p.player && p.missions.size === 0) this.glim.place(-6, 0, 50, Math.PI);
    this.controlled = this.glim;
    this.glim.model.root.visible = true;
    this.glim.active = true;
    this.cam.yaw = this.glim.yaw + Math.PI;
    this.cam.pitch = 0.4;
    this.cam.snap(this.glim.pos);
    this.trackedMission = MISSIONS.find((m) => m.id === p.tracked) ?? null;
    this.applySettings();
  }

  private isSafeSpot(x: number, z: number): boolean {
    return !this.col.overlapsSolid(x, 0.05, z, this.glim.mover) && Number.isFinite(x) && Number.isFinite(z);
  }

  pause(): void {
    if (this.state !== 'play') return;
    this.state = 'paused';
    Portal.gameplay(false);
    this.input.releasePointerLock();
    this.audio.setPaused(true);
    this.audio.play('uiOpen');
    this.menus.pause();
  }

  resume(): void {
    this.menus.close();
    this.state = 'play';
    Portal.gameplay(true);
    this.audio.setPaused(false);
  }

  quitToTitle(): void {
    this.saveNow();
    this.menus.close();
    this.state = 'title';
    Portal.gameplay(false);
    this.hud.show(false);
    this.hud.clearBubbles();
    document.querySelector('#touch')!.classList.add('hidden');
    this.audio.setPaused(false);
    this.audio.stopLoop('sing');
    this.audio.stopLoop('phaseLoop');
    this.audio.stopLoop('laserHum');
    this.audio.setMusic('menu');
    this.menus.title();
  }

  unstuck(): void {
    if (this.controlled !== this.glim) this.exitHost(true);
    const sp = areaInfo(this.currentArea).spawn;
    this.glim.place(sp[0], 0, sp[1], sp[2]);
    this.cam.snap(this.glim.pos);
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.setVolumes(s.music, s.sfx);
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.cam.reducedShake = s.reducedMotion;
    const high = s.quality === 'high';
    const mapSize = high ? (IS_MOBILE ? 1024 : 2048) : 512;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.enabled = true;
    this.maxDpr = high ? (IS_MOBILE ? 1.5 : 2) : 1;
    this.vfx.density = high ? 1 : 0.5;
    resizeRenderer(this.renderer, this.camera, this.maxDpr);
  }
  private maxDpr = 2;

  private bindUi(): void {
    document.querySelector('#btn-pause')!.addEventListener('click', () => {
      this.audio.play('uiClick');
      this.pause();
    });
    this.input.bindButton(document.querySelector('#t-ability')!, 'ability');
    this.input.bindButton(document.querySelector('#t-interact')!, 'interact');
    this.input.bindButton(document.querySelector('#t-jump')!, 'jump');
    this.input.bindButton(document.querySelector('#t-exit')!, 'exit');
    this.input.bindButton(document.querySelector('#t-run')!, 'run');
  }

  // ===================================================================== helpers for systems
  near(p: THREE.Vector3, r: number): boolean {
    const c = this.controlled.pos;
    return (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < r * r;
  }

  setFlag(name: string, on = true): void {
    if (this.progress.set(name, on) && on) this.onFlag(name);
  }

  hasItem(id: ItemId): boolean {
    return this.progress.items.has(id);
  }

  giveItem(id: ItemId): void {
    if (this.progress.items.has(id)) return;
    this.progress.items.add(id);
    this.progress.dirty = true;
    this.audio.play('collect', { pitch: 0.8 });
    this.hud.toast(`Got <b>${ITEM_INFO[id].icon} ${ITEM_INFO[id].name}</b> — ${ITEM_INFO[id].desc}`, 'mint', 3.6);
  }

  takeItem(id: ItemId): void {
    this.progress.items.delete(id);
    this.progress.dirty = true;
  }

  hint(text: string, seconds = 4.2): void {
    this.hud.toast(text, 'hint', seconds);
  }

  say(ch: Character, text: string, me = false): void {
    if (!this.near(ch.pos, 26)) return;
    this.hud.say(text, () => (ch.model.root.visible ? ch.model.topWorld(tmpV2).clone() : null), me || ch === this.controlled);
    ch.barkCooldown = Math.max(ch.barkCooldown, 3);
    const pitch = ch.host ? ch.host.voice : (NAMED[ch.id]?.voice ?? 1) * (ch.model.height < 1.3 ? 1.5 : 1);
    this.audio.voice(ch.kind, Math.min(8, 2 + Math.floor(text.length / 6)), pitch, ch.pos);
  }

  shake(a: number): void {
    if (!this.settings.reducedMotion) this.cam.addTrauma(a);
  }

  hitstop(seconds: number): void {
    this.hitstopT = Math.max(this.hitstopT, seconds);
  }

  beginAction(dur: number, label: string, pose: Pose, cb: () => void, shady = false): void {
    if (this.action) return;
    this.action = { t: 0, dur, label, pose, cb, shady };
    this.controlled.vel.x = this.controlled.vel.z = 0;
    if (pose === 'pick') this.audio.play('pickLock', { pos: this.controlled.pos });
  }

  awardBits(n: number, pos: THREE.Vector3, msg: string): void {
    // Bonus bits are real star bits spawned as a ring around pos (counted in totals at build time? no — they are a bonus counter).
    this.progress.bump('bonusBits', n);
    this.audio.play('collect', { pos, pitch: 1.2 });
    this.vfx.burst('star', pos.x, pos.y + 1.5, pos.z, { count: 14, color: '#ffd64a', speed: 3, up: 3 });
    this.hud.toast(`${msg} <b>+${n} Star Bits</b>`, 'gold');
  }

  bitsCount(area?: AreaId): [number, number] {
    const [got, total] = this.bits.countIn(area ?? null);
    if (area) return [got, total];
    return [got + this.progress.stat('bonusBits'), total];
  }

  private achieve(id: string): void {
    if (this.progress.achievements.has(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    this.progress.achievements.add(id);
    this.progress.dirty = true;
    this.audio.play('achievement');
    this.hud.toast(`🏅 Achievement: <b>${a.name}</b><br><small>${a.desc}</small>`, 'gold', 4.5);
  }

  track(id: string): void {
    this.trackedMission = MISSIONS.find((m) => m.id === id) ?? null;
    this.progress.tracked = id;
    this.progress.dirty = true;
  }

  // ===================================================================== flag reactions
  private onFlag(name: string): void {
    const p = this.progress;
    switch (name) {
      case 'passGranted':
        this.hud.showBanner('Turnstiles open!', 'The Mall and the Circus are now open to you', '#5fe0b8');
        this.audio.play('gate');
        break;
      case 'spikeGone':
      case 'gertieBreak':
      case 'waldoFed':
      case 'tankFed':
        for (const n of this.npcs) n.syncFlags(this);
        break;
      case 'power':
        this.hud.toast('⚡ Power restored! The east wing doors hum open.', 'mint');
        break;
      case 'lasersOff':
        this.hud.toast('The laser grid flickers off.', 'mint');
        break;
      case 'archiveLever':
        this.hud.toast('A heavy CLUNK echoes: the vault corridor is open.', 'mint');
        this.shake(0.4);
        break;
      case 'candyKid':
        this.awardBits(3, this.controlled.pos, 'Sugar rush! The kid shares a secret stash:');
        break;
      case 'cannonAimed':
        this.hud.toast('The cannon now points at the trapeze platform!', 'mint');
        break;
      default:
        break;
    }
    if (name.startsWith('door:') || name.startsWith('core:')) p.dirty = true;
    for (const n of this.npcs) if (n.spawn.relocate?.flag === name || n.spawn.guard?.movedFlag === name) n.syncFlags(this);
  }

  collectCore(core: CorePickup): void {
    this.setFlag(core.flagName);
    const n = this.progress.cores;
    this.audio.play('core');
    this.hitstop(0.12);
    this.shake(0.5);
    this.flash();
    this.vfx.burst('star', core.pos.x, core.pos.y, core.pos.z, { count: 40, color: ['#ffe27a', '#ff8fc0', '#ffffff'], speed: 6, up: 4, size: 0.5 });
    this.vfx.ring(core.pos.x, core.pos.y, core.pos.z, '#fff4b0', 5, 0.6);
    this.hud.showBanner(`Star Core ${n}/5!`, n >= 5 ? 'All cores found! Return to your saucer at the station.' : n === 3 ? 'The Museum gate has opened!' : n === 4 ? 'City Hall is now open!' : 'Your saucer hums a little louder.', '#ffe27a');
    this.say(this.controlled, n >= 5 ? 'Blorp blorp! Going HOME!' : 'Shiny! Blorp!', true);
    this.saveNow();
  }

  collectPostcard(pc: Postcard | PostcardInfo): void {
    this.progress.collected.add(pc.id);
    this.progress.dirty = true;
    this.audio.play('discover');
    this.hud.toast(`✉ Secret postcard: <b>${pc.title}</b><br><small>${pc.text}</small>`, 'pink', 6);
    const total = this.postcards.length;
    const got = this.postcards.filter((x) => this.progress.collected.has(x.id)).length;
    if (got >= total) this.achieve('postcards_all');
  }

  /** Screams spread: nearby civilians panic too. */
  panicNear(pos: THREE.Vector3, src: Npc): void {
    let fleeing = 0;
    for (const n of this.npcs) {
      if (n === src || n.ch.possessed || n.isGuard) continue;
      const d = Math.hypot(n.ch.pos.x - pos.x, n.ch.pos.z - pos.z);
      if (d < 6 && n.state !== 'flee' && n.state !== 'sleep' && !n.spawn.busy) {
        n.flee(this, this.controlled.pos, 3.5);
        if (this.rng() < 0.4) this.say(n.ch, 'AAAAH!');
      }
      if (n.state === 'flee') fleeing += 1;
    }
    if (fleeing >= 5) this.achieve('panic');
  }

  // ===================================================================== possession
  private startPossess(target: Character): void {
    if (this.possessS || this.controlled !== this.glim) return;
    this.possessS = { from: this.glim.pos.clone(), target, t: 0 };
    this.glim.locked = 1;
    this.audio.play('possess', { pos: target.pos });
    const npc = this.npcById.get(target.id);
    if (npc) {
      npc.state = 'idle';
      target.wish.set(0, 0);
      target.faceToward(this.glim.pos.x, this.glim.pos.z);
      target.model.emotion = 'alarmed';
    }
  }

  private finishPossess(target: Character): void {
    const firstTime = !this.progress.discovered.has(target.host!.id);
    this.possessS = null;
    this.glim.model.root.visible = false;
    this.glim.active = false;
    target.possessed = true;
    target.model.setPossessed(true);
    target.model.kick(-5);
    target.model.wobble(1);
    this.controlled = target;
    this.cam.heightOffset = Math.max(1.0, target.model.height * 0.75);
    this.vfx.burst('star', target.pos.x, target.pos.y + target.model.height, target.pos.z, { count: 18, color: ['#5fe0b8', '#ff6fb5', '#ffffff'], speed: 4, up: 3 });
    this.vfx.ring(target.pos.x, target.pos.y + target.model.height * 0.5, target.pos.z, '#5fe0b8', 3, 0.4);
    this.progress.bump('possessions');
    this.achieve('first_ride');
    // Witnesses.
    let said = false;
    for (const n of this.npcs) {
      if (n.ch === target) continue;
      if (n.canSee(this, target.pos, 10)) {
        n.suspicion = Math.min(1.2, n.suspicion + 0.75);
        if (!said) {
          this.say(n.ch, POSSESS_SEEN[Math.floor(this.rng() * POSSESS_SEEN.length)]);
          said = true;
        }
      }
    }
    const h = target.host!;
    if (firstTime) {
      this.progress.discovered.add(h.id);
      this.progress.dirty = true;
      this.audio.play('discover');
      if (this.progress.discovered.size >= HOST_ORDER.length) this.achieve('wardrobe');
      this.state = 'card';
      this.input.releasePointerLock();
      this.menus.discover(h.id, () => {
        this.state = 'play';
      });
    } else {
      this.hud.toast(`You are now <b>${h.name}</b> · F: ${h.ability}`, '', 2.2);
    }
    if (h.id === 'singer' && this.hasItem('mic') && !this.progress.flag('velvetMic')) {
      this.setFlag('velvetMic');
      this.say(target, 'My lucky mic! Now we\'re cooking with glitter!', true);
    }
    this.saveSoon();
  }

  /** Hop out of the current host. */
  exitHost(silent = false): void {
    const host = this.controlled;
    if (host === this.glim) return;
    if (this.carrying) this.carrying.drop(this);
    const npc = this.npcById.get(host.id);
    if (npc) {
      npc.autoPerformT = this.performT > 0 ? this.performT + 6 : 0;
      npc.autoSingT = this.singT > 0 ? this.singT + 5 : 0;
    }
    this.performT = 0;
    if (this.singT > 0) {
      this.singT = 0;
      if (!npc || npc.autoSingT <= 0) this.audio.stopLoop('sing');
    }
    if (this.phaseT > 0) this.endPhase(true);
    this.action = null;
    host.possessed = false;
    host.model.setPossessed(false);
    host.model.kick(3);
    host.model.pose = 'none';
    // Find a free spot beside the host for Glim.
    const yaw = host.yaw;
    const tries = [Math.PI, Math.PI / 2, -Math.PI / 2, 0, Math.PI * 0.75, -Math.PI * 0.75];
    let placed = false;
    for (const a of tries) {
      const d = host.model.radius + 0.55;
      const x = host.pos.x + Math.sin(yaw + a) * d;
      const z = host.pos.z + Math.cos(yaw + a) * d;
      if (!this.col.overlapsSolid(x, host.pos.y + 0.05, z, this.glim.mover)) {
        this.glim.place(x, host.pos.y, z, yaw + a);
        placed = true;
        break;
      }
    }
    if (!placed) this.glim.place(host.pos.x, host.pos.y + host.model.height, host.pos.z, yaw);
    this.glim.vel.set(Math.sin(this.glim.yaw) * 3, 7, Math.cos(this.glim.yaw) * 3);
    this.glim.grounded = false;
    this.glim.model.root.visible = true;
    this.glim.active = true;
    this.glim.locked = 0;
    this.controlled = this.glim;
    this.cam.heightOffset = 1.0;
    if (npc) npc.onExit(this);
    this.progress.hosts[host.id] = [host.pos.x, host.pos.y, host.pos.z];
    if (!silent) {
      this.audio.play('unpossess', { pos: host.pos });
      this.vfx.burst('puff', host.pos.x, host.pos.y + host.model.height, host.pos.z, { count: 12, color: ['#5fe0b8', '#ffffff'], speed: 3, up: 2 });
      for (const n of this.npcs) if (n.ch !== host && n.canSee(this, host.pos, 9)) n.suspicion = Math.min(1.2, n.suspicion + 0.45);
    }
    this.saveSoon();
  }

  private forceUnpossess(): void {
    const host = this.controlled;
    host.possessed = false;
    host.model.setPossessed(false);
    this.controlled = this.glim;
    this.glim.model.root.visible = true;
    this.glim.active = true;
  }

  // ===================================================================== consequences
  caught(npc: Npc): void {
    if (this.ejecting) return;
    this.progress.bump('caught');
    this.achieve('busted');
    this.say(npc.ch, 'GOTCHA! Out you go!');
    this.audio.play('caught');
    this.eject(`Busted by <b>${npc.ch.name}</b>! Glim got tossed back to the entrance. Try staying out of sight.`, 'caught');
  }

  eject(msg: string, _reason: string): void {
    if (this.ejecting) return;
    this.ejecting = true;
    this.ejectT = 1.1;
    this.flash();
    this.shake(0.6);
    this.hitstop(0.1);
    if (this.controlled !== this.glim) this.exitHost(true);
    this.hud.toast(msg, 'pink', 4.5);
  }

  private finishEject(): void {
    this.ejecting = false;
    const sp = areaInfo(this.currentArea).spawn;
    this.glim.place(sp[0], 0, sp[1], sp[2]);
    this.glim.model.kick(-4);
    this.glim.model.emotion = 'dazed';
    this.cam.yaw = sp[2] + Math.PI;
    this.cam.snap(this.glim.pos);
    for (const n of this.npcs) {
      n.suspicion = 0;
      if (n.state === 'chase') n.goHome();
    }
  }

  launch(from: THREE.Vector3, to: THREE.Vector3, dur: number, kind: 'perfect' | 'miss'): void {
    if (this.carrying) this.carrying.drop(this);
    this.launchS = { from: from.clone(), to: to.clone(), t: 0, dur, kind };
    this.launching = true;
    this.cam.punchFov(1);
    if (this.hostKind === 'strongman') this.achieve('cannon_brick');
    if (kind === 'miss') this.achieve('miss');
  }

  proclaim(): void {
    const c = this.controlled;
    this.audio.play('proclaim', { pos: c.pos });
    this.audio.play('cheer', { pos: c.pos });
    this.say(c, 'By decree of the Mayor: HOLIDAY!', true);
    c.model.pose = 'proclaim';
    this.vfx.burst('confetti', c.pos.x, c.pos.y + 2.5, c.pos.z, { count: 60, color: ['#ff8fc0', '#ffe27a', '#5fe0b8', '#4a8fe0', '#e2473f'], speed: 6, up: 5, gravity: 5, life: 2 });
    for (const n of this.npcs) if (!n.ch.possessed && Math.hypot(n.ch.pos.x - c.pos.x, n.ch.pos.z - c.pos.z) < 13) n.onDecree(this);
  }

  flash(): void {
    const f = document.querySelector('#flash')!;
    f.classList.add('on');
    window.setTimeout(() => f.classList.remove('on'), 60);
  }

  // ===================================================================== npc-driven abilities
  npcPerform(npc: Npc): void {
    if (this.time - (npc as unknown as { _pt?: number })._pt! < 0.3) return;
    (npc as unknown as { _pt?: number })._pt = this.time;
    this.showAt(npc.ch.pos, npc.autoPerformT + 2, npc.ch);
  }

  npcSing(npc: Npc): void {
    this.songAt(npc.ch, this.progress.flag('velvetMic'));
    this.audio.setLoopPosition('sing', npc.ch.pos);
    if (npc.autoSingT <= 0.1) this.audio.stopLoop('sing');
  }

  private showAt(pos: THREE.Vector3, duration: number, performer: Character): void {
    let watchers = 0;
    for (const n of this.npcs) {
      if (n.ch === performer || n.ch.possessed) continue;
      const d = Math.hypot(n.ch.pos.x - pos.x, n.ch.pos.z - pos.z);
      if (d < 9) n.onShow(this, pos, duration);
      if (n.state === 'watch' && Math.hypot(n.focus.x - pos.x, n.focus.z - pos.z) < 2) watchers += 1;
    }
    if (watchers >= 6) this.achieve('encore');
    if (this.rng() < 0.5) {
      this.vfx.spawn('star', pos.x + (this.rng() - 0.5), pos.y + 2.2, pos.z + (this.rng() - 0.5), (this.rng() - 0.5) * 2, 2.5, (this.rng() - 0.5) * 2, ['#ffe27a', '#ff8fc0', '#5fe0b8'][Math.floor(this.rng() * 3)], 0.3, 1, 3);
    }
  }

  private songAt(singer: Character, strong: boolean): void {
    for (const n of this.npcs) {
      if (n.ch === singer || n.ch.possessed) continue;
      const d = Math.hypot(n.ch.pos.x - singer.pos.x, n.ch.pos.z - singer.pos.z);
      const r = strong ? (n.spawn.fan ? 15 : 9) : 3;
      if (d < r) n.onSong(this, singer, strong);
    }
    if (this.rng() < 0.25) {
      this.vfx.spawn('note', singer.pos.x + (this.rng() - 0.5) * 0.6, singer.pos.y + singer.model.height + 0.2, singer.pos.z, (this.rng() - 0.5) * 1.5, 1.2, (this.rng() - 0.5) * 1.5, strong ? ['#ff6fb5', '#b79cf0', '#ffe27a'][Math.floor(this.rng() * 3)] : '#9a90b0', strong ? 0.45 : 0.3, 1.6);
    }
  }

  private endPhase(silent: boolean): void {
    this.phaseT = 0;
    this.controlled.mover.phasing = false;
    this.controlled.model.setGhostOpacity(0.72);
    this.audio.stopLoop('phaseLoop');
    if (!silent) this.audio.play('phase', { pitch: 0.8 });
  }

  // ===================================================================== interaction resolution
  private resolve(): { e: Act | null; f: Act | null; fDefault: string } {
    const c = this.controlled;
    const p = c.pos;
    const hk = this.hostKind;
    let e: Act | null = null;
    let f: Act | null = null;
    const consider = (slot: 'e' | 'f', a: Act) => {
      const cur = slot === 'e' ? e : f;
      if (!cur || a.dist < cur.dist) {
        if (slot === 'e') e = a;
        else f = a;
      }
    };
    if (!this.carrying || true) {
      for (const o of this.objects) {
        if (o.range <= 0) continue;
        const d = o.distanceTo(p);
        if (d > o.range) continue;
        if (Math.abs(o.pos.y - p.y) > 2.4 && Math.abs(o.pos.y + 1 - p.y) > 2.4) continue;
        const le = o.promptE(this);
        if (le) consider('e', { label: le, pos: tmpV.set(o.pos.x, o.pos.y + o.markerY, o.pos.z).clone(), dist: d, run: () => o.useE(this) });
        const lf = o.promptF(this);
        if (lf) consider('f', { label: lf, pos: tmpV.set(o.pos.x, o.pos.y + o.markerY, o.pos.z).clone(), dist: d - 0.3, run: () => o.useF(this) });
      }
    }
    for (const n of this.npcs) {
      const ch = n.ch;
      if (ch === c || !ch.active || !ch.model.root.visible) continue;
      const d = Math.hypot(ch.pos.x - p.x, ch.pos.z - p.z) - ch.model.radius;
      if (d > 1.6 || Math.abs(ch.pos.y - p.y) > 1.5) continue;
      const top = ch.model.topWorld(new THREE.Vector3());
      if (hk === 'alien' && ch.host) {
        consider('e', { label: `Possess ${ch.host.name}`, pos: top, dist: d - 1, run: () => this.startPossess(ch) });
        continue;
      }
      const gd = n.spawn.guard;
      if (gd?.dish && !n.moved && this.hasItem(gd.dish as ItemId)) {
        const dish = gd.dish as ItemId;
        consider('e', {
          label: `Give ${ITEM_INFO[dish].name}`,
          pos: top,
          dist: d - 0.8,
          run: () => {
            this.takeItem(dish);
            this.audio.play('eat', { pos: ch.pos });
            this.vfx.burst('heart', ch.pos.x, ch.pos.y + ch.model.height, ch.pos.z, { count: 10, color: '#ff6fb5', speed: 2, up: 2 });
            n.onFed(this);
          },
        });
      } else if (n.spawn.talk) {
        consider('e', { label: `Talk to ${ch.name}`, pos: top, dist: d, run: () => this.talk(n) });
      } else if (hk !== 'alien') {
        consider('e', { label: `Chat`, pos: top, dist: d + 0.5, run: () => this.chat(n) });
      }
      if (hk === 'thief' && n.spawn.pocket && !n.pocketTaken) {
        consider('f', { label: `Pickpocket ${ch.name}`, pos: top, dist: d - 0.5, run: () => this.pickpocket(n) });
      }
      if (hk === 'scientist' && !ch.host) {
        consider('f', { label: `Zap ${ch.name}?!`, pos: top, dist: d + 1.2, run: () => this.zapNpc(n) });
      }
    }
    let fDefault = this.defaultAbilityLabel();
    if (this.carrying) {
      f = null;
      fDefault = c.running ? 'Throw it!' : 'Put it down';
    }
    if (hk === 'singer' && this.singT > 0) {
      f = null;
      fDefault = 'Stop singing';
    }
    return { e, f, fDefault };
  }

  private defaultAbilityLabel(): string {
    switch (this.hostKind) {
      case 'alien':
        return 'Hop-dash';
      case 'strongman':
        return 'Flex';
      case 'police':
        return 'Whistle';
      case 'clown':
        return this.performT > 0 ? 'Keep juggling' : 'Showtime!';
      case 'chef':
        return 'Taste test';
      case 'thief':
        return 'Swipe';
      case 'singer':
        return this.progress.flag('velvetMic') ? 'Sing' : 'Hum (no mic)';
      case 'ghost':
        return this.phaseT > 0 ? 'Phasing…' : 'Phase & Boo';
      case 'scientist':
        return 'Zap';
      case 'mayor':
        return 'Proclaim!';
    }
  }

  private useDefaultAbility(): void {
    const c = this.controlled;
    const fwd = tmpV.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    switch (this.hostKind) {
      case 'alien': {
        if (this.dashT > 0) return;
        this.dashT = 0.7;
        c.vel.x = fwd.x * 13;
        c.vel.z = fwd.z * 13;
        if (c.grounded) c.vel.y = 3.5;
        c.model.kick(2);
        this.audio.play('dash', { pos: c.pos });
        this.vfx.burst('puff', c.pos.x, c.pos.y + 0.2, c.pos.z, { count: 8, color: '#9ff0cf', speed: 2, up: 0.5 });
        break;
      }
      case 'strongman': {
        if (this.carrying) {
          if (!this.carrying.place(this, c.running)) {
            this.audio.play('denied');
            this.say(c, 'No room here!', true);
          } else if (this.progress.stat('throws') >= 10) this.achieve('heavy');
          return;
        }
        this.beginAction(1.0, 'Flexing…', 'flex', () => undefined);
        this.audio.play('flex', { pos: c.pos });
        for (const n of this.npcs) {
          if (n.ch.possessed || Math.hypot(n.ch.pos.x - c.pos.x, n.ch.pos.z - c.pos.z) > 6) continue;
          if (this.rng() < 0.6) this.say(n.ch, ['Whoa!', 'Do the other arm!', 'Is that legal?', '*swoon*'][Math.floor(this.rng() * 4)]);
          n.ch.faceToward(c.pos.x, c.pos.z);
        }
        break;
      }
      case 'police': {
        this.beginAction(0.7, 'FWEEEET!', 'whistle', () => undefined);
        this.audio.play('whistle', { pos: c.pos });
        this.vfx.burst('ring', c.pos.x + fwd.x, c.pos.y + 1.6, c.pos.z + fwd.z, { count: 3, color: '#ffffff', speed: 1, up: 0, size: 0.4, grow: 4, life: 0.5 });
        let any = false;
        for (const n of this.npcs) {
          if (n.ch.possessed) continue;
          const dx = n.ch.pos.x - c.pos.x;
          const dz = n.ch.pos.z - c.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 8 || (d > 1.5 && (dx * fwd.x + dz * fwd.z) / d < 0.2)) continue;
          n.onWhistle(this, c.pos);
          any = true;
          if (n.ch.host?.id === 'mayor') this.achieve('fashion');
        }
        if (!any) this.say(c, 'Move along! ...Nobody? Okay.', true);
        break;
      }
      case 'clown': {
        if (this.performT <= 0) {
          this.audio.play('honk', { pos: c.pos });
          this.say(c, ['Ta-daaa!', 'Behold! Noodle!', 'HONK HONK!'][Math.floor(this.rng() * 3)], true);
        }
        this.performT = 9;
        break;
      }
      case 'chef': {
        let best: Npc | null = null;
        let bd = 3;
        for (const n of this.npcs) {
          const d = Math.hypot(n.ch.pos.x - c.pos.x, n.ch.pos.z - c.pos.z);
          if (!n.ch.possessed && d < bd) {
            bd = d;
            best = n;
          }
        }
        this.beginAction(0.6, 'Here, try this!', 'cook', () => undefined);
        this.audio.play('serve', { pos: c.pos });
        if (best) {
          this.say(best.ch, best.spawn.guard?.dish ? 'A snack is nice, but I want a proper meal.' : ['Mmm! Is that cinnamon?', 'Delicious!', 'More please!', 'Tastes like Tuesday!'][Math.floor(this.rng() * 4)]);
          this.vfx.burst('heart', best.ch.pos.x, best.ch.pos.y + best.ch.model.height, best.ch.pos.z, { count: 5, color: '#ff6fb5', speed: 1.5, up: 1.5 });
        } else this.say(c, 'Needs more butter.', true);
        break;
      }
      case 'thief':
        this.say(c, 'Nothing worth swiping here...', true);
        break;
      case 'singer': {
        if (this.singT > 0) {
          this.singT = 0;
          this.audio.stopLoop('sing');
          return;
        }
        this.singT = 12;
        this.audio.startLoop('sing', c.pos);
        if (!this.progress.flag('velvetMic')) {
          this.say(c, 'La la... my voice! I need my lucky mic!', true);
          this.singT = 3;
        }
        break;
      }
      case 'ghost': {
        if (this.phaseT > 0) return;
        this.phaseT = 4.5;
        c.mover.phasing = true;
        c.model.setGhostOpacity(0.3);
        this.audio.play('boo', { pos: c.pos });
        this.audio.play('phase', { pos: c.pos });
        this.audio.startLoop('phaseLoop', c.pos);
        this.vfx.burst('puff', c.pos.x, c.pos.y + 1, c.pos.z, { count: 16, color: ['#9fdcff', '#d8ecff'], speed: 3, up: 1 });
        for (const n of this.npcs) {
          if (n.ch.possessed || Math.hypot(n.ch.pos.x - c.pos.x, n.ch.pos.z - c.pos.z) > 6.5) continue;
          n.onScare(this, c.pos);
        }
        if (this.progress.stat('scares') >= 10) this.achieve('boo10');
        break;
      }
      case 'scientist': {
        this.beginAction(0.6, 'Bzzzt!', 'zap', () => undefined);
        this.audio.play('zap', { pos: c.pos });
        const a = c.model.handWorld(new THREE.Vector3());
        const b = tmpV2.set(c.pos.x + fwd.x * 2.5, c.pos.y + 1.2, c.pos.z + fwd.z * 2.5);
        this.vfx.arc(a, b);
        break;
      }
      case 'mayor': {
        this.beginAction(1.2, 'Hear ye!', 'proclaim', () => undefined);
        this.proclaim();
        break;
      }
    }
  }

  private pickpocket(n: Npc): void {
    if (!n.canPickpocket(this)) {
      this.say(n.ch, 'Hey! Hands off my pockets!');
      n.suspicion = Math.min(1.2, n.suspicion + 0.8);
      n.ch.faceToward(this.controlled.pos.x, this.controlled.pos.z);
      this.audio.play('denied');
      this.hint('They saw you coming. Distract them first, or sneak up from behind.');
      return;
    }
    this.beginAction(0.7, 'Swiping…', 'pick', () => {
      const pk = n.spawn.pocket!;
      n.pocketTaken = true;
      this.setFlag(`pocket:${n.spawn.id}`);
      this.audio.play('pickpocket', { pos: n.ch.pos });
      this.progress.bump('pickpockets');
      if (this.progress.stat('pickpockets') >= 5) this.achieve('sticky');
      if (pk.item) this.giveItem(pk.item as ItemId);
      else if (pk.postcard) {
        const pc = this.postcards.find((x) => x.id === pk.postcard);
        if (pc && !this.progress.collected.has(pc.id)) this.collectPostcard(pc);
      } else {
        this.hud.toast(`Swiped <b>${pk.label}</b>!`, '', 2.5);
      }
      if (pk.bits) this.awardBits(pk.bits, n.ch.pos, `Swiped ${pk.label}!`);
      if (n.spawn.guard?.movedFlag && pk.item) this.setFlag(n.spawn.guard.movedFlag);
      window.setTimeout(() => this.say(n.ch, PICKED[Math.floor(this.rng() * PICKED.length)]), 900);
    }, true);
  }

  private zapNpc(n: Npc): void {
    this.beginAction(0.5, 'Bzzzt!', 'zap', () => {
      this.audio.play('zap', { pos: n.ch.pos });
      this.vfx.arc(this.controlled.model.handWorld(new THREE.Vector3()), n.ch.model.topWorld(new THREE.Vector3()));
      n.onZap(this);
      this.achieve('shock');
    });
  }

  private chat(n: Npc): void {
    const lines = CHAT[n.personality];
    this.say(n.ch, lines[Math.floor(this.rng() * lines.length)]);
    n.ch.faceToward(this.controlled.pos.x, this.controlled.pos.z);
  }

  private talk(n: Npc): void {
    const p = this.progress;
    const say = (t: string) => this.say(n.ch, t);
    n.ch.faceToward(this.controlled.pos.x, this.controlled.pos.z);
    switch (n.spawn.talk) {
      case 'mabel':
        if (!p.flag('spikeGone')) say('That punk Spike won\'t leave my window! I\'m not going back until he\'s gone. Where\'s a police officer when you need one?');
        else if (!p.flag('passGranted')) {
          say('Oh, thank goodness he\'s gone! Here, have a City Pass — on the house, sweetie.');
          this.giveItem('cityPass');
          this.setFlag('passGranted');
        } else say('Mind the gap! And the jellybean. Wait, what jellybean?');
        break;
      case 'gertie':
        say(p.flag('gertieBreak') ? 'My first break since 1997. Bliss.' : 'No climbing on the newsstand. Station rules. Only an officer could give me the afternoon off.');
        break;
      case 'gus':
        say(p.flag('showDone') ? 'What a show! Velvet is a star!' : 'I need FOUR people in that circle before the show can start! Velvet could pull a crowd... if she had her mic.');
        break;
      case 'rosalind':
        say(p.flag('bigTopOpen') ? 'Welcome, welcome to the Big Top! Mind the cannon.' : 'The queue is far too bored! Get four of them cheering and I\'ll open the Big Top.');
        break;
      case 'tilly':
        say('Tickets! ...Actually it\'s free today. The ringmaster lost the ticket machine. Again.');
        break;
      case 'orla':
        say(!p.flag('power') ? 'The power\'s been out since that "meteor" flew over. Professor Volta knows the generator.' : p.flag('lasersOff') ? 'The lasers are off?! Who authorised that?' : 'Our new Fizzwick Meteorite is behind lasers and glass. Perfectly safe. Totally ghost-proof. Probably.');
        break;
      case 'otto':
        say('Zzz... the meteorite... is perfectly... safe... zzz...');
        break;
      case 'doris':
        if (p.flag('permitOk')) say('Permit on file. Up you go, dear.');
        else if (this.hasItem('permit')) {
          this.takeItem('permit');
          this.setFlag('permitOk');
          say('Form 27-B, stamped and everything! The rope is down. Up you go.');
        } else if (p.flag('stampFixed')) say('You\'ll need Form 27-B from the stamp machine. It\'s working again, apparently.');
        else say('Nobody goes upstairs without a stamped permit. The stamp machine is broken. So: nobody goes upstairs.');
        break;
      case 'velvet':
        say(this.hasItem('mic') || p.flag('velvetMic') ? 'Is that my lucky mic?! Oh, I could sing forever!' : 'I can\'t sing a note without my lucky mic. I left it in the staff room... behind Waldo.');
        break;
      default:
        this.chat(n);
    }
  }

  // ===================================================================== rules (mission flags from world state)
  private rules(): void {
    const p = this.progress;
    const trunk = this.objById.get('trunk') as Crate | undefined;
    if (trunk && !p.flag('trunkMoved') && trunk.state === 'rest' && !trunk.isInside(-1.4, 1.4, 45, 47)) this.setFlag('trunkMoved');

    const performing = (this.hostKind === 'clown' && this.performT > 0) || this.npcs.some((n) => n.state === 'perform');
    if (performing) {
      const clown = this.hostChars.get('clown');
      if (clown) {
        if (!p.flag('bigTopOpen') && Math.hypot(clown.pos.x - 33, clown.pos.z) < 8) {
          const watchers = this.npcs.filter((n) => n.state === 'watch' && Math.hypot(n.ch.pos.x - 33, n.ch.pos.z) < 10).length;
          if (watchers >= 4) {
            this.setFlag('bigTopOpen');
            const ros = this.npcById.get('rosalind');
            if (ros) this.say(ros.ch, 'Listen to that crowd! The Big Top is OPEN!');
            this.audio.play('cheer');
          }
        }
      }
    }
    const moose = this.npcById.get('moose');
    if (moose && moose.state === 'watch') this.setFlag('mooseDistracted');
    const facet = this.npcById.get('facet');
    if (facet && (facet.state === 'watch' || facet.state === 'follow') && Math.hypot(facet.ch.pos.x - facet.spawn.x, facet.ch.pos.z - facet.spawn.z) > 1.5) this.setFlag('facetAway');

    if (!p.flag('showDone') && p.flag('velvetMic')) {
      const singing = (this.hostKind === 'singer' && this.singT > 0) || this.npcs.some((n) => n.state === 'sing');
      if (singing) {
        const audience = this.npcs.filter((n) => (n.state === 'follow' || n.state === 'idle') && n.busyT >= 0 && Math.hypot(n.ch.pos.x + 42, n.ch.pos.z + 7) < 4.2 && !n.ch.host && n.spawn.id !== 'gus').length;
        if (audience >= 4) {
          this.setFlag('showDone');
          const gus = this.npcById.get('gus');
          if (gus) this.say(gus.ch, 'FOUR! We have a crowd! Velvet, you\'re ON!');
          this.audio.play('cheer');
          this.audio.play('clap');
          this.vfx.burst('confetti', -42, 4, -10, { count: 80, color: ['#ff8fc0', '#ffe27a', '#b79cf0', '#5fe0b8'], speed: 7, up: 5, gravity: 4, life: 2.5 });
          this.awardBits(5, new THREE.Vector3(-42, 0, -9), 'Standing ovation!');
        }
      }
    }
    // Missions.
    for (const m of MISSIONS) {
      if (p.missions.has(m.id) || !m.available(this)) continue;
      if (currentStep(m, this) >= m.steps.length) {
        p.missions.add(m.id);
        p.dirty = true;
        this.audio.play('missionComplete');
        Portal.happy();
        this.hud.showBanner('Mission complete!', `${m.title} · ${m.reward}`, '#5fe0b8');
        if (this.trackedMission?.id === m.id) this.trackedMission = null;
        this.saveSoon();
      }
    }
    if (p.flag('saucerFixed')) this.achieve('homeward');
    const [bg, bt] = this.bits.countIn(null);
    if (bg >= bt && bt > 0) this.achieve('bits_all');
  }

  private pickMission(): Mission | null {
    const p = this.progress;
    if (this.trackedMission && !p.missions.has(this.trackedMission.id) && this.trackedMission.available(this)) return this.trackedMission;
    const avail = MISSIONS.filter((m) => !p.missions.has(m.id) && m.available(this));
    if (!avail.length) return null;
    return avail.find((m) => m.area === this.currentArea) ?? avail[0];
  }

  private targetPos(t: Target | undefined): THREE.Vector3 | null {
    if (!t) return null;
    if ('npc' in t) {
      const n = this.npcById.get(t.npc);
      if (!n) return null;
      return n.ch.model.topWorld(new THREE.Vector3()).add(tmpV.set(0, 0.5, 0));
    }
    if ('obj' in t) {
      const o = this.objById.get(t.obj);
      if (!o) return null;
      return new THREE.Vector3(o.pos.x, o.pos.y + o.markerY + 0.4, o.pos.z);
    }
    return new THREE.Vector3(t.pos[0], t.pos[1], t.pos[2]);
  }

  // ===================================================================== update
  private update(rawDt: number): void {
    if (this.pausedForScreenshot) return;
    resizeRenderer(this.renderer, this.camera, this.maxDpr);
    this.hud.resize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.vfx.setScale(this.canvas.clientHeight);
    const dt = this.hitstopT > 0 ? rawDt * 0.08 : rawDt;
    this.hitstopT = Math.max(0, this.hitstopT - rawDt);
    this.input.poll();
    const i = this.input.intent;

    if (this.state === 'title') {
      this.glim.model.root.visible = false;
      this.titleT += rawDt;
      this.time += rawDt;
      this.updateWorld(dt, false);
      const a = this.titleT * 0.06;
      this.camera.position.set(Math.sin(a) * 22, 16 + Math.sin(this.titleT * 0.2) * 2, Math.cos(a) * 22 + 4);
      this.camera.lookAt(0, 2.5, 2);
      this.audio.update(rawDt, this.camera.position, a + Math.PI);
      this.input.endFrame();
      this.publish();
      return;
    }
    if (this.state === 'ending') {
      this.updateEnding(rawDt);
      this.input.endFrame();
      this.publish();
      return;
    }
    if (this.state !== 'play') {
      if (i.pause && this.state === 'paused') this.resume();
      this.input.endFrame();
      this.hud.update(rawDt);
      this.publish();
      return;
    }
    if (i.pause) {
      this.pause();
      this.input.endFrame();
      return;
    }
    if (i.journal) {
      this.state = 'paused';
      this.input.releasePointerLock();
      this.audio.setPaused(true);
      this.menus.journal('none');
      const close = () => {
        this.state = 'play';
        this.audio.setPaused(false);
      };
      const obs = new MutationObserver(() => {
        if (this.menus.screen === 'none' || this.menus.screen === 'pause') {
          obs.disconnect();
          if (this.menus.screen === 'none') close();
        }
      });
      obs.observe(document.querySelector('#menus')!, { childList: true });
      this.input.endFrame();
      return;
    }

    this.time += dt;
    this.progress.playTime += rawDt;
    this.cam.look(i.lookX, i.lookY);
    if (i.zoom) this.cam.zoom(i.zoom);
    this.updatePlayer(dt);
    this.updateWorld(dt, true);
    this.rules();
    this.updateArea(false);
    this.updateHud(rawDt);

    // Camera.
    this.cam.update(rawDt, this.controlled.pos, this.col);
    this.audio.update(rawDt, this.camera.position, this.cam.yaw + Math.PI);
    // Sun follows the player for crisp local shadows.
    const cp = this.controlled.pos;
    this.sun.position.set(cp.x - 18, cp.y + 30, cp.z + 14);
    this.sun.target.position.set(cp.x, cp.y, cp.z);

    this.autosaveT += rawDt;
    if (this.autosaveT > 12 && this.progress.dirty) this.saveNow();
    this.input.endFrame();
    this.publish();
  }

  private updatePlayer(dt: number): void {
    const c = this.controlled;
    const i = this.input.intent;
    if (this.ejecting) {
      this.ejectT -= dt;
      if (this.ejectT <= 0) this.finishEject();
    }
    const busy = !!this.action || this.ejecting || this.launching || !!this.possessS;
    // Movement relative to camera.
    this.cam.forward(tmp2);
    const fx = tmp2.x;
    const fz = tmp2.y;
    const mx = fx * -i.moveY + -fz * i.moveX;
    const mz = fz * -i.moveY + fx * i.moveX;
    c.wish.set(mx, mz);
    if (c.wish.lengthSq() > 1) c.wish.normalize();
    c.wishRun = i.run;
    if (this.performT > 0) c.wish.multiplyScalar(0.15);
    if (this.singT > 0) c.wish.multiplyScalar(0.7);
    if (busy) c.wish.set(0, 0);
    if (i.jump && !busy) {
      c.wantJump = true;
      if (c.grounded && c.stats.jump > 0) this.audio.play('jump', { pos: c.pos, pitch: c.host?.id === 'clown' ? 1.5 : c.host?.id === 'strongman' ? 0.6 : 1 });
    }
    this.dashT = Math.max(0, this.dashT - dt);

    // Possession flight.
    if (this.possessS) {
      const s = this.possessS;
      s.t += dt / 0.45;
      const t = Math.min(1, s.t);
      const to = s.target.model.topWorld(tmpV);
      this.glim.pos.lerpVectors(s.from, to, t);
      this.glim.pos.y += Math.sin(t * Math.PI) * 1.6;
      this.glim.model.root.rotation.x = t * Math.PI * 2;
      this.glim.model.root.scale.setScalar(1 - t * 0.7);
      this.glim.vel.set(0, 0, 0);
      if (t >= 1) {
        this.glim.model.root.rotation.x = 0;
        this.glim.model.root.scale.setScalar(1);
        this.finishPossess(s.target);
      }
      return;
    }

    // Launch arc.
    if (this.launchS) {
      const s = this.launchS;
      s.t += dt / s.dur;
      const t = Math.min(1, s.t);
      c.pos.lerpVectors(s.from, s.to, t);
      c.pos.y += Math.sin(t * Math.PI) * 5;
      c.vel.set(0, 0, 0);
      c.model.root.rotation.x = t * Math.PI * 4;
      if (this.rng() < 0.5) this.vfx.spawn('star', c.pos.x, c.pos.y + 0.5, c.pos.z, 0, 0, 0, '#ffe27a', 0.3, 0.6);
      if (t >= 1) {
        c.model.root.rotation.x = 0;
        this.launchS = null;
        this.launching = false;
        c.grounded = false;
        c.vel.y = -1;
        this.shake(0.4);
        this.audio.play(s.kind === 'perfect' ? 'cheer' : 'thud', { pos: c.pos });
        this.vfx.burst('puff', c.pos.x, c.pos.y, c.pos.z, { count: 16, color: s.kind === 'perfect' ? '#ffe27a' : '#e8d080', speed: 3, up: 1 });
        if (s.kind === 'miss') this.say(c, c.host ? 'Ow. Hay. Everywhere.' : 'Blorp... wrong target.', true);
      }
      return;
    }

    // Hop out is always available (cancels any running action).
    if (i.exit && c !== this.glim && !this.ejecting) {
      this.action = null;
      this.exitHost();
      return;
    }
    // Action progress.
    if (this.action) {
      const a = this.action;
      a.t += dt;
      c.model.pose = a.pose;
      if (a.shady) {
        const k = c.host?.id === 'thief' ? 0.55 : 1;
        for (const n of this.npcs) if (n.ch !== c) n.witness(this, c.pos, dt * 1.1 * k, true);
      }
      if (a.t >= a.dur) {
        this.action = null;
        a.cb();
      }
    } else if (!this.ejecting) {
      const res = this.resolve();
      if (i.interact && res.e) {
        this.audio.play('uiClick', { volume: 0.3 });
        res.e.run();
      }
      if (i.ability) {
        if (res.f) res.f.run();
        else this.useDefaultAbility();
      }
      this.currentPrompts = res;
    }

    // Continuous abilities.
    if (this.performT > 0) {
      this.performT -= dt;
      c.model.pose = 'perform';
      c.model.emotion = 'happy';
      this.performTick -= dt;
      if (this.performTick <= 0) {
        this.performTick = 0.3;
        this.showAt(c.pos, this.performT + 3, c);
        if (this.rng() < 0.35) this.audio.play('juggle', { pos: c.pos });
      }
      if (this.performT <= 0) {
        this.audio.play('honk', { pos: c.pos });
        this.audio.play('clap', { pos: c.pos });
      }
    } else if (this.singT > 0) {
      this.singT -= dt;
      c.model.pose = 'sing';
      c.model.emotion = 'love';
      this.songAt(c, this.progress.flag('velvetMic'));
      this.audio.setLoopPosition('sing', c.pos);
      if (this.singT <= 0) this.audio.stopLoop('sing');
    } else if (!this.action) {
      c.model.pose = this.carrying ? 'carry' : 'none';
      if (c !== this.glim) c.model.emotion = this.suspicionMax > 0.6 ? 'alarmed' : c.running ? 'happy' : 'neutral';
      else c.model.emotion = this.suspicionMax > 0.6 ? 'alarmed' : 'happy';
    }
    if (this.phaseT > 0) {
      this.phaseT -= dt;
      if (this.rng() < 0.4) this.vfx.spawn('puff', c.pos.x + (this.rng() - 0.5), c.pos.y + 0.8, c.pos.z + (this.rng() - 0.5), 0, 0.3, 0, '#bfe6ff', 0.4, 0.8);
      this.audio.setLoopPosition('phaseLoop', c.pos);
      if (this.phaseT <= 0) {
        // Never end phasing inside a wall.
        c.mover.phasing = false;
        if (this.col.overlapsSolid(c.pos.x, c.pos.y, c.pos.z, c.mover)) {
          c.mover.phasing = true;
          this.phaseT = 0.3;
        } else this.endPhase(false);
      }
    }
    if (this.carrying) this.carrying.updateCarry(this);
  }

  private currentPrompts: { e: Act | null; f: Act | null; fDefault: string } = { e: null, f: null, fDefault: '' };

  private updateWorld(dt: number, playing: boolean): void {
    const cp = this.controlled.pos;
    // Characters.
    for (const n of this.npcs) {
      const ch = n.ch;
      const d = Math.hypot(ch.pos.x - cp.x, ch.pos.z - cp.z);
      const visible = d < 75;
      ch.model.root.visible = visible;
      ch.active = visible;
      if (!visible) continue;
      if (!ch.possessed && playing && d < 60) n.update(dt, this);
      else if (!playing) {
        ch.wish.set(0, 0);
        if (n.state === 'wander' || n.state === 'idle') n.update(dt, this);
      }
    }
    // Simple character separation (player is pushed, NPCs nudge each other).
    const list = this.characters;
    for (let a = 0; a < list.length; a += 1) {
      const A = list[a];
      if (!A.active || !A.model.root.visible) continue;
      for (let b = a + 1; b < list.length; b += 1) {
        const B = list[b];
        if (!B.active || !B.model.root.visible) continue;
        const dx = B.pos.x - A.pos.x;
        const dz = B.pos.z - A.pos.z;
        const r = A.model.radius + B.model.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-6 || Math.abs(A.pos.y - B.pos.y) > 1.2) continue;
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        const aIsPlayer = A === this.controlled;
        const bIsPlayer = B === this.controlled;
        const wa = aIsPlayer ? 0.85 : bIsPlayer ? 0.15 : 0.5;
        A.pos.x -= dx * push * wa;
        A.pos.z -= dz * push * wa;
        B.pos.x += dx * push * (1 - wa);
        B.pos.z += dz * push * (1 - wa);
        A.pushed = true;
        B.pushed = true;
      }
    }
    // Crowd pushes must never shove anyone through a wall or door.
    for (const ch of list) {
      if (!ch.pushed) continue;
      ch.pushed = false;
      this.col.resolveHorizontal(ch.pos, ch.mover, 0.42);
    }
    for (const ch of this.characters) {
      if (!ch.active) continue;
      const sim = playing && (ch === this.controlled ? !this.possessS && !this.launchS : !ch.possessed) && !(ch === this.glim && !this.glim.model.root.visible);
      if (ch === this.glim && this.possessS) {
        ch.model.update(dt, 0, false, false, 1, this.time);
        continue;
      }
      ch.update(dt, this.col, this.time, sim || (!playing && ch !== this.glim));
    }
    // Objects.
    for (const o of this.objects) {
      const d = Math.hypot(o.pos.x - cp.x, o.pos.z - cp.z);
      o.group.visible = d < 90 && (o.group.visible || !o.done || !(o instanceof CorePickup));
      if (d < 70 || o instanceof Crate) o.update(dt, this);
    }
    if (playing) {
      const idx = this.bits.check(cp.x, cp.y, cp.z, 0.85);
      if (idx >= 0) {
        const d = this.bits.defs[idx];
        this.progress.collected.add(d.id);
        this.progress.dirty = true;
        this.audio.play('collect', { pos: cp, pitch: 1 + (this.progress.collected.size % 8) * 0.06 });
        this.vfx.burst('spark', d.x, d.y, d.z, { count: 8, color: '#ffe27a', speed: 3, up: 1.5, size: 0.3 });
      }
    }
    this.bits.update(dt, this.time);
    this.vfx.update(this.reducedMotion && this.pausedForScreenshot ? 0 : dt);
    // Water shimmer + misc.
    this.shadowT -= dt;
    if (this.shadowT <= 0) {
      this.shadowT = 0.5;
      for (const ch of this.characters) {
        const near = Math.hypot(ch.pos.x - cp.x, ch.pos.z - cp.z) < 22;
        for (const m of ch.model.meshes) m.castShadow = near;
      }
    }
  }

  private updateArea(force: boolean): void {
    const a = areaAt(this.controlled.pos.x, this.controlled.pos.z);
    if (a === this.currentArea && !force) return;
    this.currentArea = a;
    if (a !== 'hub') this.progress.lastArea = a;
    this.audio.setMusic(a);
    const info = areaInfo(a);
    if (!force || this.state === 'play') this.hud.showBanner(info.name, info.tagline, info.color);
  }

  private updateHud(dt: number): void {
    const c = this.controlled;
    const h = c.host ?? HOSTS.alien;
    this.hud.setHost(h.name, `F · ${h.ability}`, this.portraits[h.id] ?? '', h.color === '#2a2238' ? '#7d6fb0' : h.color);
    const pr = this.currentPrompts;
    const busy = !!this.action || this.ejecting || this.launching || !!this.possessS;
    const eLabel = busy ? null : pr.e?.label ?? null;
    const fLabel = busy ? null : pr.f?.label ?? pr.fDefault;
    this.hud.setPrompts(eLabel, fLabel, c !== this.glim);
    const wp = !busy ? (pr.e ?? pr.f) : null;
    this.hud.setWorldPrompt(wp ? wp.pos : null, wp === pr.e ? 'E' : 'F', wp?.label ?? '');
    this.hud.setAction(this.action ? this.action.t / this.action.dur : null, this.action?.label ?? '');
    const [bits, total] = this.bitsCount();
    this.hud.setStats(bits, total, this.progress.cores);
    this.hud.setInventory([...this.progress.items].filter((x) => x !== 'cityPass' || !this.progress.flag('passGranted') || true));
    // Tracker.
    const m = this.pickMission();
    if (m) {
      const step = currentStep(m, this);
      const area = areaInfo(m.area);
      const here = m.area === this.currentArea;
      const steps = m.steps.map((s, idx) => ({ text: s.text, state: (idx < step ? 'done' : idx === step ? 'now' : 'todo') as 'done' | 'now' | 'todo' }));
      if (!here) steps.unshift({ text: `Head to ${area.name}`, state: 'now' });
      if (!here) steps[1].state = 'todo';
      this.hud.setTracker(area.name, area.color, m.title, steps);
      const key = m.id + step;
      if (key !== this.lastStepKey) {
        this.lastStepKey = key;
        if (step > 0 && step < m.steps.length) this.audio.play('missionStart', { volume: 0.5 });
      }
      let tp: THREE.Vector3 | null = null;
      if (this.settings.showHints) {
        if (!here) {
          const sp = area.spawn;
          tp = new THREE.Vector3(sp[0], 2.5, sp[1]);
        } else tp = this.targetPos(m.steps[Math.min(step, m.steps.length - 1)].target);
      }
      this.hud.setObjective(tp, here ? 'Objective' : area.name, c.pos);
    } else {
      const [b, t] = this.bitsCount();
      this.hud.setTracker('Fizzwick', '#4a8fe0', 'Free roam', [{ text: `Hunt Star Bits (${b}/${t}) and secret postcards`, state: 'now' }]);
      this.hud.setObjective(null, '', c.pos);
    }
    // Suspicion + NPC icons.
    let sMax = 0;
    this.hud.beginIcons();
    for (const n of this.npcs) {
      if (!n.ch.model.root.visible) continue;
      const d = Math.hypot(n.ch.pos.x - c.pos.x, n.ch.pos.z - c.pos.z);
      if (d < 16) sMax = Math.max(sMax, n.suspicion);
      if (n.icon && d < 24) this.hud.icon(n.ch.model.topWorld(tmpV).add(tmpV2.set(0, 0.2, 0)), n.icon);
    }
    this.hud.endIcons();
    this.suspicionMax = sMax;
    this.hud.setSuspicion(sMax);
    this.hud.update(dt);
  }

  // ===================================================================== ending
  startEnding(replay: boolean): void {
    this.replayEnding = replay;
    if (this.controlled !== this.glim) this.exitHost(true);
    this.state = 'ending';
    Portal.gameplay(false);
    this.endingT = 0;
    this.hud.show(false);
    this.input.releasePointerLock();
    document.querySelector('#touch')!.classList.add('hidden');
    this.audio.setMusic('finale');
    this.audio.play('core');
    this.saveNow();
  }

  private updateEnding(dt: number): void {
    this.endingT += dt;
    this.time += dt;
    const t = this.endingT;
    const s = this.saucer;
    // Glim hops in.
    if (t < 1.2) {
      const k = t / 1.2;
      this.glim.pos.lerp(tmpV.set(s.pos.x, 1.6, s.pos.z), k * 0.2);
      this.glim.pos.y = 1.6 * Math.sin(k * Math.PI) + 1;
    } else this.glim.model.root.visible = false;
    s.launching = Math.max(0, (t - 2.2) / 3);
    if (t > 1.5 && this.rng() < 0.6) {
      const a = this.rng() * Math.PI * 2;
      this.vfx.burst('star', s.pos.x + Math.cos(a) * 12, 12 + this.rng() * 10, s.pos.z + Math.sin(a) * 12 - 8, { count: 20, color: [['#ff6fb5', '#ffe27a', '#5fe0b8', '#9fd8ff'][Math.floor(this.rng() * 4)]], speed: 6, up: 0, gravity: 3, life: 1.4, size: 0.5 });
      if (this.rng() < 0.15) this.audio.play('chime', { volume: 0.4 });
    }
    this.updateWorld(dt, false);
    const a = t * 0.25;
    const lift = s.launching * s.launching * 40;
    this.camera.position.set(s.pos.x + Math.sin(a) * 14, 4 + t * 1.2, s.pos.z - 10 + Math.cos(a) * 6);
    this.camera.lookAt(s.pos.x, 1.5 + lift * 0.8, s.pos.z);
    this.audio.update(dt, this.camera.position, a);
    if (t > 6.5 && this.menus.screen !== 'ending') this.menus.ending();
  }

  endEnding(): void {
    this.menus.close();
    this.saucer.launching = 0;
    this.state = 'play';
    Portal.gameplay(true);
    this.hud.show(true);
    document.querySelector('#touch')!.classList.toggle('hidden', !IS_MOBILE);
    this.glim.model.root.visible = true;
    this.glim.active = true;
    this.glim.place(this.saucer.pos.x + 4, 0, this.saucer.pos.z - 3, Math.PI);
    this.cam.snap(this.glim.pos);
    this.audio.setMusic(this.currentArea);
    if (!this.replayEnding) this.hint('Glim decided to stay a little longer. Fizzwick still hides Star Bits, postcards and secrets...', 6);
  }

  // ===================================================================== save
  private saveSoon(): void {
    this.autosaveT = 10;
    this.progress.dirty = true;
  }

  saveNow(): void {
    const p = this.progress;
    const c = this.controlled;
    p.player = [c.pos.x, c.pos.y, c.pos.z, c.yaw];
    for (const [, ch] of this.hostChars) p.hosts[ch.id] = [ch.pos.x, ch.pos.y, ch.pos.z];
    p.save();
    this.autosaveT = 0;
  }

  // ===================================================================== render + diagnostics
  private render(): void {
    this.renderer.render(this.scene, this.camera);
    this.frameInfo.calls = this.renderer.info.render.calls;
    this.frameInfo.triangles = this.renderer.info.render.triangles;
  }

  private publish(): void {
    const info = this.renderer.info;
    const c = this.controlled;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: info.render.frame,
      elapsed: this.time,
      score: this.progress.cores,
      targetScore: 5,
      complete: this.progress.flag('saucerFixed'),
      player: { position: { x: c.pos.x, y: c.pos.y, z: c.pos.z }, speed: Math.hypot(c.vel.x, c.vel.z) },
      renderer: { calls: this.frameInfo.calls, triangles: this.frameInfo.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
      canvas: { clientWidth: this.canvas.clientWidth, clientHeight: this.canvas.clientHeight, width: this.canvas.width, height: this.canvas.height, dpr: Math.min(window.devicePixelRatio || 1, this.maxDpr) },
      game: {
        state: this.state,
        area: this.currentArea,
        host: this.hostKind,
        missions: [...this.progress.missions],
        flags: [...this.progress.flags],
        items: [...this.progress.items],
        suspicion: this.suspicionMax,
        prompts: { e: this.currentPrompts.e?.label ?? null, f: this.currentPrompts.f?.label ?? this.currentPrompts.fDefault },
        npcs: this.npcs.filter((n) => n.ch.model.root.visible).length,
        particles: this.vfx.count,
        bitsTotal: this.bitsTotal,
      },
    };
  }

  private installHooks(): void {
    const states = ['title', 'active-play', 'possessed', 'station-core', 'mall', 'circus', 'museum', 'cityhall', 'journal', 'collection', 'ending'];
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (v: number) => {
        this.rngFn = createSeededRandom(v);
      },
      setState: (name: string) => {
        if (!states.includes(name)) throw new Error(`Unknown state ${name}`);
        this.applyTestState(name);
        this.render();
        this.publish();
        return { state: name };
      },
      setPausedForScreenshot: (p: boolean) => {
        this.pausedForScreenshot = p;
      },
      setReducedMotion: (on: boolean) => {
        this.reducedMotion = on;
      },
      hideDebugUi: () => undefined,
    };
    // Scripted-input helpers for the bot playtest (no gameplay shortcuts beyond teleport for setup).
    window.__SHELL__ = {
      game: this,
      key: (code: string, down: boolean) => this.input.setKey(code, down),
      press: (what: 'interact' | 'ability' | 'exit' | 'jump' | 'pause') => {
        this.input.intent[what] = true;
      },
      teleport: (x: number, z: number, yaw = 0) => {
        this.controlled.place(x, 0, z, yaw);
        this.cam.yaw = yaw + Math.PI;
        this.cam.snap(this.controlled.pos);
      },
      lookAt: (x: number, z: number) => {
        const c = this.controlled.pos;
        const yaw = Math.atan2(x - c.x, z - c.z);
        this.controlled.yaw = this.controlled.targetYaw = yaw;
        this.cam.yaw = yaw + Math.PI;
      },
    };
  }

  private applyTestState(name: string): void {
    if (name === 'title') {
      if (this.state !== 'title') this.quitToTitle();
      this.titleT = 8;
      return;
    }
    if (this.state === 'title' || this.state === 'ending') {
      this.startGame(true);
    }
    this.menus.close();
    this.state = 'play';
    this.hud.show(true);
    const setup = (flags: string[], cores: AreaId[], pos: [number, number, number], host?: HostKind) => {
      for (const f of flags) this.setFlag(f);
      for (const a of cores) this.progress.set(`core:${a}`);
      for (const o of this.objects) o.init(this);
      for (const n of this.npcs) {
        n.syncFlags(this);
        n.snapHome();
      }
      if (this.controlled !== this.glim) this.exitHost(true);
      this.glim.place(pos[0], 0, pos[1], pos[2]);
      this.cam.yaw = pos[2] + Math.PI;
      this.cam.pitch = 0.38;
      if (host) {
        const h = this.hostChars.get(host)!;
        h.place(pos[0], 0, pos[1], pos[2]);
        this.progress.discovered.add(host);
        this.glim.model.root.visible = false;
        this.glim.active = false;
        h.possessed = true;
        h.model.setPossessed(true);
        this.controlled = h;
        this.cam.heightOffset = Math.max(1, h.model.height * 0.75);
      }
      this.cam.snap(this.controlled.pos);
      this.updateArea(true);
      for (let k = 0; k < 20; k += 1) this.updateWorld(1 / 60, true);
      this.rules();
      this.hud.clearTransient();
      this.testMode = true;
      this.updateHud(1 / 60);
      this.cam.update(1, this.controlled.pos, this.col);
    };
    switch (name) {
      case 'active-play':
        setup([], [], [-4, 49.5, Math.PI * 0.85]);
        break;
      case 'possessed':
        setup(['trunkMoved'], [], [-2, 40, Math.PI * 0.9], 'strongman');
        break;
      case 'station-core':
        setup(['trunkMoved', 'spikeGone', 'passGranted', 'gertieBreak'], [], [10, 43, Math.PI * 0.9], 'police');
        break;
      case 'mall':
        setup(['trunkMoved', 'spikeGone', 'passGranted'], ['station'], [-30, 2, -Math.PI / 2], 'chef');
        break;
      case 'circus':
        setup(['trunkMoved', 'spikeGone', 'passGranted'], ['station', 'mall'], [30, 3, Math.PI / 2], 'clown');
        break;
      case 'museum':
        setup(['trunkMoved', 'spikeGone', 'passGranted'], ['station', 'mall', 'circus'], [-31, -27, -Math.PI / 2], 'scientist');
        break;
      case 'cityhall':
        setup(['trunkMoved', 'spikeGone', 'passGranted'], ['station', 'mall', 'circus', 'museum'], [0, -40, Math.PI], 'mayor');
        break;
      case 'journal':
        setup([], [], [-4, 49.5, Math.PI * 0.85]);
        this.state = 'paused';
        this.menus.journal('pause');
        break;
      case 'collection':
        setup([], [], [-4, 49.5, Math.PI * 0.85]);
        this.state = 'paused';
        this.menus.collection('pause');
        break;
      case 'ending':
        setup(['saucerFixed'], ['station', 'mall', 'circus', 'museum', 'cityhall'], [-8, 47, Math.PI]);
        this.startEnding(true);
        for (let k = 0; k < 420; k += 1) this.updateEnding(1 / 60);
        break;
    }
  }
}

declare global {
  interface Window {
    __SHELL__?: {
      game: Game;
      key: (code: string, down: boolean) => void;
      press: (what: 'interact' | 'ability' | 'exit' | 'jump' | 'pause') => void;
      teleport: (x: number, z: number, yaw?: number) => void;
      lookAt: (x: number, z: number) => void;
    };
  }
}

export { AREAS };
