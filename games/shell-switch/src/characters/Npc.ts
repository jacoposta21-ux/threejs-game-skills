import * as THREE from 'three';
import type { Character } from './Character';
import type { Game } from '../game/Game';
import type { NpcSpawn, Weakness } from '../gameplay/types';
import type { Collider } from '../world/Collision';
import type { Emotion, Pose } from './CharacterModel';
import { ALARM, DANCE, DAZED, pickReact, SCARED, SHADY, SWOON, WATCH, ZAPPED } from './Lines';

export type NpcState = 'wander' | 'idle' | 'post' | 'sit' | 'sleep' | 'eat' | 'watch' | 'follow' | 'flee' | 'chase' | 'goto' | 'dazed' | 'dance' | 'perform' | 'sing' | 'shocked' | 'return';

const tmpA = new THREE.Vector3();

export type NpcIcon = '?' | '!' | '★' | '♥' | 'zz' | '♪' | null;

export class Npc {
  state: NpcState = 'idle';
  private stateT = 0;
  readonly home = new THREE.Vector3();
  homeYaw = 0;
  readonly target = new THREE.Vector3();
  private hasTarget = false;
  suspicion = 0;
  /** Seconds left watching a show / following a song etc. */
  busyT = 0;
  readonly focus = new THREE.Vector3();
  private followChar: Character | null = null;
  private wanderT = 0;
  moved = false;
  pocketTaken = false;
  private reactT = 0;
  private chaseT = 0;
  blocker: Collider | null = null;
  baseMode: NpcSpawn['mode'];
  icon: NpcIcon = null;
  private relocated = false;
  private stuckT = 0;
  private readonly lastPos = new THREE.Vector3();
  /** Spot in the audience ring. */
  private ringAngle = 0;
  awake = 1;
  emotionBase: Emotion = 'neutral';
  private refuseT = 0;
  autoPerformT = 0;
  autoSingT = 0;
  zapCount = 0;

  constructor(
    readonly ch: Character,
    readonly spawn: NpcSpawn,
    g: Game,
  ) {
    this.home.set(spawn.x, 0, spawn.z);
    this.homeYaw = spawn.yaw ?? 0;
    this.baseMode = spawn.mode;
    this.ringAngle = g.rng() * Math.PI * 2;
    this.emotionBase = (spawn.emotion as Emotion) ?? (spawn.personality === 'sleepy' ? 'sleepy' : 'neutral');
    if (spawn.guard) {
      const [x, z, w, d] = spawn.guard.blocker;
      if (w > 0 && d > 0) {
        this.blocker = g.col.addDynamic({ minX: x - w / 2, maxX: x + w / 2, minY: 0, maxY: 3, minZ: z - d / 2, maxZ: z + d / 2, enabled: true, pass: 'none', tag: `post:${spawn.id}` });
      }
    }
    this.enter(this.modeState(spawn.mode));
    this.wanderT = g.rng() * 3;
  }

  get personality() {
    return this.spawn.personality;
  }

  get isGuard(): boolean {
    return !!this.spawn.guard && !this.moved;
  }

  /** Re-apply persistent flags (after load or flag changes). */
  syncFlags(g: Game): void {
    const gd = this.spawn.guard;
    if (gd?.movedFlag && g.progress.flag(gd.movedFlag) && !this.moved) {
      this.moved = true;
      if (gd.moveTo) this.home.set(gd.moveTo[0], 0, gd.moveTo[1]);
      this.baseMode = gd.afterMoveMode ?? this.spawn.afterMove ?? 'sit';
      this.goHome();
    }
    const r = this.spawn.relocate;
    if (r && g.progress.flag(r.flag) && !this.relocated) {
      this.relocated = true;
      this.home.set(r.to[0], 0, r.to[1]);
      if (r.yaw !== undefined) this.homeYaw = r.yaw;
      this.baseMode = r.mode;
      if (r.emotion) this.emotionBase = r.emotion;
      this.goHome();
    }
    if (this.spawn.pocket && g.progress.flag(`pocket:${this.spawn.id}`)) this.pocketTaken = true;
  }

  /** Teleport to home (load). */
  snapHome(): void {
    this.ch.place(this.home.x, 0, this.home.z, this.homeYaw);
    this.enter(this.modeState(this.baseMode));
  }

  private modeState(m: NpcSpawn['mode']): NpcState {
    switch (m) {
      case 'post':
        return 'post';
      case 'sit':
        return 'sit';
      case 'sleep':
        return 'sleep';
      case 'idle':
      case 'queue':
        return 'idle';
      default:
        return 'wander';
    }
  }

  private enter(s: NpcState): void {
    this.state = s;
    this.stateT = 0;
    this.hasTarget = false;
  }

  goHome(): void {
    this.target.copy(this.home);
    this.hasTarget = true;
    this.state = 'return';
    this.stateT = 0;
  }

  // ------------------------------------------------------------- events

  /** Clown show / spectacle nearby. */
  onShow(g: Game, pos: THREE.Vector3, duration: number): void {
    if (this.spawn.busy || this.state === 'flee' || this.state === 'sleep' || this.state === 'eat' || this.state === 'chase') return;
    if (this.isGuard && !this.spawn.guard!.weak.includes('distract')) {
      this.refuse(g, 'distract', 'Nice try. I\'m working.');
      return;
    }
    const was = this.state === 'watch';
    this.focus.copy(pos);
    this.busyT = Math.max(this.busyT, duration);
    this.suspicion = 0;
    if (!was) {
      this.enter('watch');
      this.ringAngle = Math.atan2(this.ch.pos.x - pos.x, this.ch.pos.z - pos.z) + (g.rng() - 0.5) * 0.4;
      if (g.rng() < 0.5) g.say(this.ch, WATCH[Math.floor(g.rng() * WATCH.length)]);
    }
  }

  onWhistle(g: Game, pos: THREE.Vector3): void {
    if (this.state === 'flee') return;
    const gd = this.spawn.guard;
    if (gd && !this.moved && gd.weak.includes('intimidate')) {
      this.weaknessHit(g, 'intimidate');
      return;
    }
    if (gd && !this.moved) {
      this.refuse(g, 'intimidate', 'Whistle all you like, officer.');
      return;
    }
    if (this.state === 'sleep') {
      this.state = 'idle';
      this.stateT = 0;
      g.say(this.ch, 'WHA— I\'m up! I\'m up!');
      return;
    }
    this.ch.faceToward(pos.x, pos.z);
    this.ch.model.pose = 'scared';
    this.ch.model.emotion = 'alarmed';
    this.reactT = 1.2;
    if (g.rng() < 0.4) g.say(this.ch, this.personality === 'nervous' ? 'I\'ll go quietly!' : 'Yes, officer!');
  }

  /** Called every frame while a song plays. */
  onSong(g: Game, singer: Character, strong: boolean): void {
    if (this.spawn.busy || this.state === 'flee' || this.state === 'sleep' || this.state === 'eat' || this.state === 'chase') return;
    const gd = this.spawn.guard;
    if (gd && !this.moved && !gd.weak.includes('lure')) {
      this.refuse(g, 'lure', 'Lovely voice. Still not moving.');
      return;
    }
    if (!strong) {
      if (this.state !== 'follow' && g.rng() < 0.01) g.say(this.ch, 'Is she... humming? Weakly?');
      return;
    }
    if (this.state !== 'follow') {
      this.enter('follow');
      if (g.rng() < 0.6) g.say(this.ch, SWOON[Math.floor(g.rng() * SWOON.length)]);
    }
    this.followChar = singer;
    this.busyT = 6;
    this.suspicion = 0;
  }

  onScare(g: Game, pos: THREE.Vector3): void {
    if (this.ch.possessed) return;
    const gd = this.spawn.guard;
    if (gd && !this.moved && gd.weak.includes('scare')) {
      this.weaknessHit(g, 'scare');
      this.flee(g, pos, 3);
      return;
    }
    this.flee(g, pos, 4.5);
    g.say(this.ch, SCARED[Math.floor(g.rng() * SCARED.length)]);
    g.progress.bump('scares');
  }

  onDecree(g: Game): void {
    const gd = this.spawn.guard;
    if (gd && !this.moved && gd.weak.includes('decree')) this.weaknessHit(g, 'decree');
    if (this.state === 'flee' || this.ch.possessed) return;
    this.enter('dance');
    this.busyT = 7;
    if (g.rng() < 0.5) g.say(this.ch, DANCE[Math.floor(g.rng() * DANCE.length)]);
  }

  onZap(g: Game): void {
    this.enter('shocked');
    this.busyT = 1.6;
    this.zapCount += 1;
    g.say(this.ch, ZAPPED[Math.floor(g.rng() * ZAPPED.length)]);
  }

  onFed(g: Game): void {
    this.weaknessHit(g, 'feed');
  }

  /** Possession just ended: wobbly confusion, then adopt this spot as home. */
  onExit(g: Game): void {
    this.home.copy(this.ch.pos);
    this.home.y = 0;
    this.homeYaw = this.ch.yaw;
    if (this.spawn.type === 'host' && this.baseMode === 'post') this.baseMode = 'idle';
    if (this.autoPerformT > 0) {
      this.enter('perform');
      return;
    }
    if (this.autoSingT > 0) {
      this.enter('sing');
      return;
    }
    this.enter('dazed');
    this.busyT = 2.2;
    g.say(this.ch, DAZED[Math.floor(g.rng() * DAZED.length)]);
  }

  private weaknessHit(g: Game, w: Weakness): void {
    const gd = this.spawn.guard!;
    const permanent = gd.permanent?.includes(w) ?? true;
    if (permanent && gd.movedFlag) {
      g.setFlag(gd.movedFlag);
      this.syncFlags(g);
      const line =
        w === 'intimidate' ? 'Alright, alright! I\'m going!' : w === 'feed' ? 'Is that for ME?! *nom*' : w === 'scare' ? 'NOPE! I quit! I QUIT!' : w === 'decree' ? 'A holiday? Don\'t mind if I do!' : 'Fine!';
      g.say(this.ch, line);
      if (w === 'feed') this.baseMode = 'sit';
    }
  }

  private refuse(g: Game, w: Weakness | 'block', fallback: string): void {
    if (this.refuseT > 0) return;
    this.refuseT = 6;
    g.say(this.ch, this.spawn.guard?.refuse?.[w] ?? fallback);
    this.ch.faceToward(g.controlled.pos.x, g.controlled.pos.z);
  }

  flee(g: Game, from: THREE.Vector3, seconds: number): void {
    if (this.ch.possessed) return;
    this.enter('flee');
    this.busyT = seconds;
    this.focus.copy(from);
    tmpA.subVectors(this.ch.pos, from).setY(0);
    if (tmpA.lengthSq() < 0.01) tmpA.set(g.rng() - 0.5, 0, g.rng() - 0.5);
    tmpA.normalize().multiplyScalar(9);
    this.target.copy(this.ch.pos).add(tmpA);
    this.hasTarget = true;
  }

  /** Witnessed something strange at pos (shady: illegal-looking). */
  witness(g: Game, pos: THREE.Vector3, amount: number, shady: boolean): void {
    if (!this.canSee(g, pos, 11)) return;
    this.suspicion = Math.min(1.2, this.suspicion + amount * (this.spawn.guard?.strict ? 1.6 : 1));
    if (shady && this.suspicion >= 1 && (this.spawn.guard?.strict || this.spawn.personality === 'guard')) {
      g.say(this.ch, SHADY[Math.floor(g.rng() * SHADY.length)]);
    }
  }

  canSee(g: Game, p: THREE.Vector3, range: number): boolean {
    if (this.ch.possessed || this.state === 'sleep' || this.state === 'watch' || this.state === 'follow' || this.state === 'flee' || this.state === 'dance' || this.state === 'eat' || this.state === 'dazed') return false;
    const dx = p.x - this.ch.pos.x;
    const dz = p.z - this.ch.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 1.5) {
      const fx = Math.sin(this.ch.yaw);
      const fz = Math.cos(this.ch.yaw);
      if ((dx * fx + dz * fz) / d < 0.35) return false;
    }
    return g.col.lineOfSight(this.ch.pos.x, this.ch.pos.z, p.x, p.z, 1.3);
  }

  /** Thief can lift pockets from distracted marks or from behind. */
  canPickpocket(g: Game): boolean {
    if (!this.spawn.pocket || this.pocketTaken) return false;
    if (this.state === 'watch' || this.state === 'follow' || this.state === 'sleep' || this.state === 'dance' || this.state === 'eat' || this.state === 'sit') return true;
    const p = g.controlled.pos;
    const dx = p.x - this.ch.pos.x;
    const dz = p.z - this.ch.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = Math.sin(this.ch.yaw);
    const fz = Math.cos(this.ch.yaw);
    return (dx * fx + dz * fz) / d < -0.2;
  }

  // ------------------------------------------------------------- update
  update(dt: number, g: Game): void {
    const ch = this.ch;
    this.stateT += dt;
    this.reactT = Math.max(0, this.reactT - dt);
    this.refuseT = Math.max(0, this.refuseT - dt);
    this.ch.barkCooldown = Math.max(0, this.ch.barkCooldown - dt);
    this.autoPerformT = Math.max(0, this.autoPerformT - dt);
    this.autoSingT = Math.max(0, this.autoSingT - dt);
    ch.wish.set(0, 0);
    ch.wishRun = false;
    let pose: Pose = 'none';
    let emotion: Emotion = this.emotionBase;
    const player = g.controlled;
    const pp = player.pos;
    const distToPlayer = Math.hypot(pp.x - ch.pos.x, pp.z - ch.pos.z);

    // ---- perception of the naked alien
    const alien = g.hostKind === 'alien' && !g.ejecting && !g.launching;
    if (alien && this.canSee(g, pp, 9.5)) {
      const k = (this.spawn.guard?.strict || this.personality === 'guard' ? 0.9 : 0.5) * (1 - distToPlayer / 11);
      this.suspicion = Math.min(1.2, this.suspicion + dt * k * 1.4);
    } else if (this.state !== 'chase') {
      this.suspicion = Math.max(0, this.suspicion - dt * 0.18);
    }

    if (this.suspicion >= 1 && this.state !== 'chase' && this.state !== 'flee') {
      const strict = this.spawn.guard?.strict || this.personality === 'guard';
      if (strict) {
        this.enter('chase');
        this.chaseT = 6;
        g.say(ch, alien ? 'HEY! Get back here, you!' : 'Stop right there!');
        g.audio.play('alert', { pos: ch.pos });
      } else {
        g.say(ch, alien ? ALARM[Math.floor(g.rng() * ALARM.length)] : 'THIEF! THIEF!');
        g.audio.play('scream', { pos: ch.pos, pitch: 0.9 + g.rng() * 0.4 });
        this.flee(g, pp, 4);
        this.suspicion = 0.35;
        g.panicNear(ch.pos, this);
      }
    }

    // ---- reactions to the current host (barks)
    if (this.state !== 'chase' && this.state !== 'flee' && this.state !== 'sleep' && !alien && distToPlayer < 3.6 && ch.barkCooldown <= 0 && g.hostKind !== 'alien' && player !== ch) {
      ch.barkCooldown = 9 + g.rng() * 6;
      const hk = g.hostKind;
      if (hk === 'ghost' && this.state !== 'dance') {
        this.onScare(g, pp);
      } else {
        g.say(ch, pickReact(hk, this.personality, g.rng));
        this.reactT = 1.6;
        ch.faceToward(pp.x, pp.z);
      }
    }

    // ---- state machine
    switch (this.state) {
      case 'wander': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + g.rng() * 4;
          if (!this.hasTarget && g.rng() < 0.7) {
            const r = this.spawn.radius ?? 4;
            const a = g.rng() * Math.PI * 2;
            const d = r * Math.sqrt(g.rng());
            this.target.set(this.home.x + Math.cos(a) * d, 0, this.home.z + Math.sin(a) * d);
            this.hasTarget = true;
          }
        }
        if (this.hasTarget && this.moveTo(this.target, 0.5, false)) this.hasTarget = false;
        break;
      }
      case 'return': {
        if (this.moveTo(this.home, 0.35, false)) {
          ch.targetYaw = this.homeYaw;
          this.enter(this.modeState(this.baseMode));
        }
        break;
      }
      case 'idle':
      case 'post': {
        if (Math.hypot(ch.pos.x - this.home.x, ch.pos.z - this.home.z) > 0.6) {
          this.moveTo(this.home, 0.3, false);
        } else if (this.reactT <= 0) {
          ch.targetYaw = this.homeYaw;
        }
        if (this.state === 'post' && distToPlayer < 3 && player !== ch && this.refuseT <= 0 && this.blocker) {
          this.refuse(g, 'block', 'Sorry. Nobody gets past me.');
        }
        if (this.state === 'post') emotion = this.suspicion > 0.3 ? 'suspicious' : this.emotionBase === 'neutral' ? 'smug' : this.emotionBase;
        break;
      }
      case 'sit':
      case 'sleep':
      case 'eat': {
        if (Math.hypot(ch.pos.x - this.home.x, ch.pos.z - this.home.z) > 0.6) {
          this.moveTo(this.home, 0.3, false);
        } else {
          ch.targetYaw = this.homeYaw;
          pose = this.state === 'sleep' ? 'sleep' : this.state === 'eat' || (this.moved && this.spawn.guard?.weak.includes('feed')) ? 'eat' : 'sit';
          if (this.state === 'sleep') {
            emotion = 'sleepy';
            if (g.rng() < dt * 0.8 && g.near(ch.pos, 25)) g.vfx.spawn('zzz', ch.pos.x + 0.2, ch.pos.y + ch.model.height, ch.pos.z, 0.2, 0.6, 0, '#ffffff', 0.35, 2, 0, 0.1, 0.2);
          }
          if (pose === 'eat') emotion = 'happy';
        }
        break;
      }
      case 'watch': {
        this.busyT -= dt;
        // Stand in a ring around the show.
        const r = 2.6 + ((this.spawn.id.charCodeAt(0) + this.spawn.id.length) % 3) * 0.6;
        tmpA.set(this.focus.x + Math.sin(this.ringAngle) * r, 0, this.focus.z + Math.cos(this.ringAngle) * r);
        if (!this.moveTo(tmpA, 0.5, false)) {
          /* walking over */
        } else ch.faceToward(this.focus.x, this.focus.z);
        pose = Math.sin(g.time * 3 + this.ringAngle * 5) > 0.3 ? 'clap' : 'cheer';
        if (this.stateT < 0.6) pose = 'none';
        emotion = 'happy';
        this.icon = '★';
        if (this.busyT <= 0) {
          if (g.rng() < 0.4) g.say(ch, 'What a show!');
          this.goHome();
        }
        break;
      }
      case 'follow': {
        this.busyT -= dt;
        const s = this.followChar;
        if (s) {
          const d = Math.hypot(s.pos.x - ch.pos.x, s.pos.z - ch.pos.z);
          if (d > 2.2) this.moveTo(s.pos, 2.0, d > 6);
          else ch.faceToward(s.pos.x, s.pos.z);
        }
        pose = 'swoon';
        emotion = 'love';
        if (g.rng() < dt * 2) g.vfx.spawn('heart', ch.pos.x, ch.pos.y + ch.model.height + 0.2, ch.pos.z, 0, 0.8, 0, '#ff6fb5', 0.3, 1);
        if (this.busyT <= 0) {
          this.followChar = null;
          // Stay put a moment, humming, then wander back.
          this.enter('idle');
          this.home.copy(ch.pos);
          this.stateT = 0;
          this.lingerHome = 8;
        }
        break;
      }
      case 'flee': {
        this.busyT -= dt;
        ch.wishRun = true;
        if (this.hasTarget && this.moveTo(this.target, 0.6, true)) {
          tmpA.subVectors(ch.pos, this.focus).setY(0).normalize().multiplyScalar(4);
          this.target.add(tmpA);
        }
        if (this.stuckT > 0.6) {
          this.target.set(ch.pos.x + (g.rng() - 0.5) * 8, 0, ch.pos.z + (g.rng() - 0.5) * 8);
          this.stuckT = 0;
        }
        pose = 'scared';
        emotion = 'scared';
        if (this.busyT <= 0) this.goHome();
        break;
      }
      case 'chase': {
        this.chaseT -= dt;
        emotion = 'angry';
        if (g.ejecting || g.launching) {
          this.chaseT = 0;
        } else {
          const d = this.moveTo(pp, 0.2, true);
          if (!d && distToPlayer < 0.95 + player.model.radius) {
            g.caught(this);
            this.chaseT = 0;
            this.suspicion = 0;
          }
        }
        if (this.chaseT <= 0) {
          this.suspicion = 0.2;
          g.say(ch, 'Hmph. Slippery little...');
          this.goHome();
        }
        break;
      }
      case 'dazed': {
        this.busyT -= dt;
        emotion = 'dazed';
        if (this.busyT <= 0) this.enter(this.modeState(this.baseMode));
        break;
      }
      case 'dance': {
        this.busyT -= dt;
        pose = 'dance';
        emotion = 'happy';
        if (this.busyT <= 0) this.goHome();
        break;
      }
      case 'shocked': {
        this.busyT -= dt;
        pose = 'shocked';
        emotion = 'alarmed';
        if (g.rng() < dt * 10) g.vfx.spawn('spark', ch.pos.x + (g.rng() - 0.5) * 0.5, ch.pos.y + ch.model.height * (0.5 + g.rng() * 0.5), ch.pos.z, 0, 0.5, 0, '#9fe8ff', 0.25, 0.3);
        if (this.busyT <= 0) this.enter(this.modeState(this.baseMode));
        break;
      }
      case 'perform': {
        pose = 'perform';
        emotion = 'happy';
        g.npcPerform(this);
        if (this.autoPerformT <= 0) this.enter('idle');
        break;
      }
      case 'sing': {
        pose = 'sing';
        emotion = 'love';
        g.npcSing(this);
        if (this.autoSingT <= 0) this.enter('idle');
        break;
      }
      case 'goto': {
        if (this.moveTo(this.target, 0.4, false)) this.enter(this.modeState(this.baseMode));
        break;
      }
    }

    if (this.lingerHome > 0) {
      this.lingerHome -= dt;
      if (this.lingerHome <= 0 && this.state === 'idle' && this.baseMode !== 'idle') {
        this.home.set(this.spawn.x, 0, this.spawn.z);
        if (this.moved && this.spawn.guard?.moveTo) this.home.set(this.spawn.guard.moveTo[0], 0, this.spawn.guard.moveTo[1]);
        this.goHome();
      }
    }

    // Stuck detection (walking into a wall).
    if (ch.wish.lengthSq() > 0.01) {
      const moved = Math.hypot(ch.pos.x - this.lastPos.x, ch.pos.z - this.lastPos.z);
      if (moved < dt * 0.3) this.stuckT += dt;
      else this.stuckT = 0;
      if (this.stuckT > 2.5 && (this.state === 'wander' || this.state === 'return' || this.state === 'goto')) {
        // Give up and teleport-settle home if out of view, else pick a new target.
        if (this.state === 'wander') this.hasTarget = false;
        else if (!g.near(ch.pos, 14)) ch.place(this.home.x, 0, this.home.z, this.homeYaw);
        this.stuckT = 0;
      }
    } else this.stuckT = 0;
    this.lastPos.copy(ch.pos);

    // Reaction pose override.
    if (this.reactT > 0 && pose === 'none') {
      pose = g.hostKind === 'police' && this.personality === 'nervous' ? 'scared' : g.hostKind === 'singer' ? 'swoon' : g.hostKind === 'clown' && this.personality === 'kid' ? 'cheer' : g.hostKind === 'mayor' ? 'clap' : g.hostKind === 'strongman' ? 'cheer' : 'wave';
      emotion = g.hostKind === 'alien' ? 'alarmed' : this.personality === 'snooty' || this.personality === 'grumpy' ? 'suspicious' : 'happy';
    }
    if (this.suspicion > 0.3 && emotion === this.emotionBase) emotion = 'suspicious';
    ch.model.pose = pose;
    ch.model.emotion = emotion;

    // Look at the player when close.
    if (distToPlayer < 6 && player !== ch) {
      const a = Math.atan2(pp.x - ch.pos.x, pp.z - ch.pos.z) - ch.yaw;
      ch.model.lookYaw = Math.atan2(Math.sin(a), Math.cos(a));
      ch.model.lookPitch = (pp.y + player.model.height * 0.8 - (ch.pos.y + ch.model.headY)) / Math.max(1, distToPlayer) * 0.5;
      if (Math.abs(ch.model.lookYaw) > 1.4) ch.model.lookYaw = 0;
    } else {
      ch.model.lookYaw = 0;
      ch.model.lookPitch = 0;
    }

    // Icon.
    if (this.state !== 'watch') {
      this.icon =
        this.state === 'chase' || this.suspicion >= 1
          ? '!'
          : this.suspicion > 0.25
            ? '?'
            : this.state === 'follow'
              ? '♥'
              : this.state === 'sleep'
                ? 'zz'
                : this.state === 'sing' || this.state === 'perform'
                  ? '♪'
                  : null;
    }

    // Guard post blocker follows the guard's presence at the post.
    if (this.blocker) {
      const atPost = !this.moved && this.state !== 'watch' && this.state !== 'follow' && this.state !== 'flee' && Math.hypot(ch.pos.x - this.spawn.x, ch.pos.z - this.spawn.z) < 1.4;
      this.blocker.enabled = atPost;
    }
  }

  private lingerHome = 0;

  /** Steer toward p. Returns true when arrived. */
  private moveTo(p: THREE.Vector3, arrive: number, run: boolean): boolean {
    const ch = this.ch;
    const dx = p.x - ch.pos.x;
    const dz = p.z - ch.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < arrive) return true;
    ch.wish.set(dx / d, dz / d);
    if (d < 1.2) ch.wish.multiplyScalar(0.5 + d * 0.4);
    ch.wishRun = run;
    return false;
  }
}

