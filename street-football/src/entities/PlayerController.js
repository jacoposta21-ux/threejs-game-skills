import * as THREE from 'three';
import { BALL, COURT, DRIBBLE, KICK, PLAYER, TACKLE } from '../config.js';
import { CLIP_EVENTS } from '../animation/FootballClips.js';
import { DEFENDER_READ, TRICKS, chooseTrick, rotateToward } from '../skills/Tricks.js';
import { TOUCH_U } from './Footballer.js';

const _rel = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _spin = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// A slide-tackle victim is on the floor this long.
const FALL_TIME = 1.25;
// Seconds between the separate ball touches of a skill move.
const TRICK_TOUCH = 0.11;
// How far ahead of the body the swinging boot meets the ball (m).
const TOUCH_REACH = 0.45;

// Holding the pass button this long turns the pass into a lob.
const LOB_HOLD = 0.24;
// A shot can be struck out of the air up to this height / horizontal reach.
const AERIAL_MIN_Y = 0.55;
const AERIAL_MAX_Y = 2.3;
const AERIAL_REACH = 1.7;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Drives one outfield Footballer from intents — the human's (camera-relative)
 * or an AI brain's (world-space). Momentum movement, physical dribbling with
 * contested possession, charged shots, targeted passes, poke tackles, and a
 * stagger when tackled. Possession is arbitrated by the shared MatchState.
 */
export class PlayerController {
  constructor(footballer, ball, events, rng, match) {
    this.p = footballer;
    this.ball = ball;
    this.events = events;
    this.rng = rng;
    this.match = match;
    this.team = footballer.team;
    this.attackSign = match.teams[this.team].attackSign;
    this.isHuman = false;
    this.speedFactor = 1;
    this.tackleSuccess = TACKLE.humanSuccess;
    // Player ratings (1–5, 3 = baseline): pace, shooting, skill.
    this.rating = { spd: 3, sht: 3, skl: 3 };
    footballer.ctrl = this;
    this.reset();
  }

  reset() {
    this.possession = false;
    this.touchCooldown = 0;
    this.touch = null; // a touch in progress: the leg is swinging, contact pending
    this.touchWanted = 0;
    this.lastFootfalls = 0;
    this.regainCooldown = 0;
    this.tackleCooldown = 0;
    this.stagger = 0;
    this.kick = null;
    this.tackle = null;
    this.pending = null;
    this.charge = { active: false, t: 0 };
    this.stamina = PLAYER.stamina;
    this.sprinting = false;
    this.turnRateNorm = 0;
    this.moveDir = new THREE.Vector3();
    this.hasInput = false;
    this.frozen = false;
    this.lastShotPower = 0;
    this.aimZ = null;
    this.trick = null;
    this.pendingTrick = null;
    this.trickCooldown = 0;
    this.skillBuffer = 0;
    this.skillSprint = false;
    this.skillSet = 1;
    this.passCharge = null; // Space held: tap = ground pass, hold = lob
    this.shotBoost = 1; // Gamebreaker: harder, truer shots
    if (this.p) {
      this.p.pitch = 0;
      this.p.lift = 0;
    }
    this.lastTrickKind = null;
    this.fooled = 0;
    this.fooledDir = new THREE.Vector3();
    this.ghostUntil = 0;
    this.fallTime = 0;
    if (this.p) this.p.extraYaw = 0;
  }

  get chargeLevel() {
    return this.charge.active ? Math.min(1, this.charge.t / KICK.chargeTime) : 0;
  }

  get busy() {
    return !!(this.kick || this.tackle || this.trick || this.stagger > 0);
  }

  /**
   * @param it intents. Human: moveX/moveY camera-relative + buttons. AI: world=true, worldX/worldZ (magnitude ≤ 1), sprint, faceX/faceZ.
   */
  update(dt, it, camYaw, time) {
    const p = this.p;
    p.beginStep();
    this.tackleCooldown -= dt;
    this.trickCooldown -= dt;
    this.fooled = Math.max(0, this.fooled - dt);
    this.updatePendingTrick(time);
    if (this.frozen) {
      if (this.trick) this.endTrick(time, true);
      p.speed = Math.max(0, p.speed - PLAYER.decel * dt);
      p.position.addScaledVector(p.facing(_fwd), p.speed * dt);
      this.charge.active = false;
      p.commitStep();
      return;
    }

    if (it.world) {
      this.moveDir.set(it.worldX, 0, it.worldZ);
    } else {
      // Camera-relative input. Screen up = away from the camera.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      this.moveDir.set(-cos * it.moveX + sin * it.moveY, 0, sin * it.moveX + cos * it.moveY);
    }
    const inputMag = Math.min(1, this.moveDir.length());
    this.hasInput = inputMag > 0.08;
    if (this.hasInput) this.moveDir.normalize();

    const wantsSprint = it.sprint && this.hasInput;
    if (wantsSprint && this.stamina > 0.02) {
      this.stamina = Math.max(0, this.stamina - PLAYER.staminaDrain * dt);
      this.sprinting = true;
    } else {
      this.stamina = Math.min(PLAYER.stamina, this.stamina + PLAYER.staminaRegen * dt * (this.hasInput ? 0.6 : 1));
      this.sprinting = false;
    }

    if (this.fallTime > 0) {
      // Tip over backwards, lie a moment, get up.
      this.fallTime -= dt;
      const t = FALL_TIME - this.fallTime;
      const down = Math.min(1, t / 0.28);
      const up = THREE.MathUtils.clamp((t - FALL_TIME + 0.45) / 0.45, 0, 1);
      p.pitch = 1.3 * down * down * (1 - up * up * (3 - 2 * up));
      if (this.fallTime <= 0) p.pitch = 0;
    }
    if (this.stagger > 0) {
      this.stagger -= dt;
      this.hasInput = false;
      this.charge.active = false;
    } else {
      if (it.skillPressed) this.requestTrickFromInput(it, false, 1);
      else if (it.skill2Pressed) this.requestTrickFromInput(it, false, 2);
      else if (this.skillBuffer > 0) {
        // A press that landed mid-touch / mid-kick fires as soon as the player is free.
        this.skillBuffer -= dt;
        if (!this.busy && this.trickCooldown <= 0) this.requestTrickFromInput({ sprint: this.skillSprint }, true, this.skillSet);
      }
      if (!this.trick) {
        this.updateCharge(dt, it);
        this.updatePassInput(dt, it);
        if (it.tacklePressed && !this.possession && this.fooled <= 0) this.requestTackle({ slide: !!it.sprint });
      }
    }

    if (this.trick) {
      this.updateTrick(dt, time);
      p.setGhost(true);
      p.commitStep();
      return;
    }

    // Movement with momentum: heading turns at a limited rate; turning bleeds speed.
    let targetSpeed = 0;
    if (this.hasInput) {
      const dribbling = this.possession;
      const top = this.sprinting
        ? (dribbling ? PLAYER.dribbleSprintSpeed : PLAYER.sprintSpeed)
        : (dribbling ? PLAYER.dribbleJogSpeed : PLAYER.jogSpeed);
      targetSpeed = top * Math.max(0.35, inputMag) * this.speedFactor;
    }
    // Dribbling: chase down a ball that has run past the lead distance.
    if (this.possession && this.hasInput && !this.kick) {
      const { ahead, dist, lateral } = this.ballRelation();
      const lead = DRIBBLE.baseLead + DRIBBLE.leadPerSpeed * p.speed;
      const bv = this.ball.velocity;
      const ballSpeed = Math.hypot(bv.x, bv.z);
      // While a fresh touch is still checking and rolling the way we run, the
      // ball comes back on its own: just keep running.
      const onLine = Math.abs(lateral) < 0.5 && bv.x * this.moveDir.x + bv.z * this.moveDir.z > ballSpeed * 0.75;
      const returning = this.ball.softTime > 0 && onLine && ahead < lead + 1.0;
      if ((ahead > TOUCH_REACH + 0.08 || dist > 0.9) && !returning) {
        // Out of touching range: run it down, bursting if it is really getting away.
        const far = THREE.MathUtils.clamp((dist - TOUCH_REACH - 0.08) / lead, 0, 1);
        const burst = dist > lead + 0.7 || !onLine;
        const cap = (this.sprinting || burst ? PLAYER.sprintSpeed * (1 + far * 0.1) : PLAYER.jogSpeed * (1.1 + far * 0.25)) * this.speedFactor;
        targetSpeed = Math.max(targetSpeed, Math.min(cap, ballSpeed + DRIBBLE.chaseBoost * (1 + far * 1.5)));
      }
    }
    // No input but the ball has rolled off the feet: walk onto it to sole it.
    let approach = null;
    if (this.possession && !this.hasInput && !this.kick) {
      const r = this.ballRelation();
      if (r.dist > 0.72) {
        const along = Math.max(0, this.ball.velocity.x * _fwd.x + this.ball.velocity.z * _fwd.z);
        targetSpeed = Math.min(PLAYER.sprintSpeed, along + (r.dist - 0.55) * 2.4);
        approach = Math.atan2(this.ball.position.x - p.position.x, this.ball.position.z - p.position.z);
      }
    }
    const kicking = this.kick && !this.kick.done;
    if (this.kick) targetSpeed *= 0.25;
    // Run-up: arrive with the ball half a metre in front of the standing foot at the contact frame.
    let runUp = null;
    if (kicking && !this.kick.aerial && !this.kick.whiff) {
      const r = this.ballRelation();
      if (r.dist < 2.6 && this.ball.position.y < 1) {
        const bv = this.ball.velocity;
        const along = bv.x * _fwd.x + bv.z * _fwd.z;
        const tt = Math.max(0.04, this.kick.contactAt - this.kick.t);
        runUp = THREE.MathUtils.clamp(along + (r.ahead - 0.5) / tt, 0, PLAYER.sprintSpeed * 1.15);
      }
    }
    if (this.charge.active) targetSpeed *= 0.8;
    if (this.stagger > 0) targetSpeed = 0;
    // Wrong-footed by an opponent's trick: heavy legs for a moment.
    if (this.fooled > 0) targetSpeed *= 0.45;

    let desiredHeading = p.heading;
    if (this.kick) desiredHeading = this.kick.heading;
    else if (this.tackle) desiredHeading = this.tackle.heading;
    else if (this.hasInput) {
      desiredHeading = Math.atan2(this.moveDir.x, this.moveDir.z);
      // Dribbling: run onto the ball's line first; the next touch then sends it where the stick points.
      if (this.possession && !this.touch) {
        const b = this.ball.position;
        const bx = b.x - p.position.x;
        const bz = b.z - p.position.z;
        const bd = Math.hypot(bx, bz);
        if (bd > 0.3 && bd < 1.8) {
          const toBall = Math.atan2(bx, bz);
          // Ahead along the stick: curve onto its line. Beside or behind (a sharp
          // change of direction): turn back to it first, then play it the new way.
          if (bx * this.moveDir.x + bz * this.moveDir.z > 0.05 * bd) desiredHeading += THREE.MathUtils.clamp(wrap(toBall - desiredHeading), -0.7, 0.7) * 0.85;
          else desiredHeading = toBall;
        }
      }
    }
    else if (approach != null) desiredHeading = approach;
    else if (it.faceX != null && Math.hypot(it.faceX, it.faceZ) > 0.01) desiredHeading = Math.atan2(it.faceX, it.faceZ);
    const turnRate = this.sprinting ? PLAYER.sprintTurnRate : PLAYER.turnRate;
    const diff = wrap(desiredHeading - p.heading);
    const maxTurn = (kicking ? 18 : this.tackle ? 9 : turnRate) * dt;
    const turn = THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
    p.heading = wrap(p.heading + turn);
    this.turnRateNorm = Math.abs(turn) / Math.max(1e-6, PLAYER.turnRate * dt);
    p.speed *= 1 - PLAYER.turnSpeedLoss * Math.abs(turn) * (p.speed / PLAYER.sprintSpeed);
    if (Math.abs(diff) > 2.2 && p.speed > 3) targetSpeed = Math.min(targetSpeed, 1.5);
    const accel = targetSpeed > p.speed ? (this.sprinting ? PLAYER.sprintAccel : PLAYER.accel) : PLAYER.decel;
    p.speed += THREE.MathUtils.clamp(targetSpeed - p.speed, -accel * dt, accel * dt);
    if (runUp != null) p.speed += THREE.MathUtils.clamp(runUp - p.speed, -40 * dt, 40 * dt);

    this.updateTackle(dt, time);

    p.facing(_fwd);
    p.velocity.copy(_fwd).multiplyScalar(p.speed);
    p.position.addScaledVector(p.velocity, dt);
    p.position.x = THREE.MathUtils.clamp(p.position.x, -COURT.halfLength + 0.35, COURT.halfLength - 0.35);
    p.position.z = THREE.MathUtils.clamp(p.position.z, -COURT.halfWidth + 0.35, COURT.halfWidth - 0.35);

    this.updateBall(dt, time);
    this.updateKick(dt, time);
    p.setGhost(this.possession || !!this.kick || this.regainCooldown > 0 || time < this.ghostUntil);
    p.commitStep();
  }

  // ------------------------------------------------------------------ tricks

  /** Human input → trick, relative to the player's facing. */
  requestTrickFromInput(it, buffered = false, set = 1) {
    if (!this.possession) {
      if (!buffered && this.isHuman) this.events.emit('trickDenied', { player: this.p, reason: 'noball' });
      this.skillBuffer = 0;
      return;
    }
    if (this.busy || this.trickCooldown > 0) {
      if (!buffered) {
        this.skillBuffer = 0.35;
        this.skillSprint = !!it.sprint;
        this.skillSet = set;
      }
      return;
    }
    this.skillBuffer = 0;
    const f = this.p.facing(new THREE.Vector3());
    const right = rotateToward(f, 1, 90);
    const relForward = this.hasInput ? this.moveDir.dot(f) : 0;
    const relSide = this.hasInput ? this.moveDir.dot(right) : 0;
    const victim = this.findVictim(f, 'nutmeg');
    const choice = chooseTrick({
      hasInput: this.hasInput,
      relForward,
      relSide,
      sprint: it.sprint,
      speed: this.p.speed,
      charging: this.charge.active,
      victimAhead: !!victim,
      set,
    });
    this.charge.active = false;
    this.requestTrick(choice.kind, choice.side, { solo: choice.solo });
  }

  /** The opponent the trick is played against: close and in front. */
  findVictim(f, kind = null) {
    const pos = this.p.position;
    let best = null;
    let bd = Infinity;
    for (const o of this.match.outfield(this.match.opponent(this.team))) {
      const dx = o.p.position.x - pos.x;
      const dz = o.p.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      const ahead = (dx * f.x + dz * f.z) / Math.max(d, 1e-3);
      const lateral = Math.abs(dx * f.z - dz * f.x);
      if (kind === 'nutmeg' && (d > 2.8 || lateral > 0.7 || ahead < 0.5)) continue;
      if (d < 3.2 && ahead > -0.15 && d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  requestTrick(kind, side = 0, { solo = false } = {}) {
    if (this.busy || !this.possession || this.trickCooldown > 0 || this.stagger > 0) return false;
    const def = TRICKS[kind];
    const p = this.p;
    const f = p.facing(new THREE.Vector3());
    const victim = this.findVictim(f, kind === 'nutmeg' ? 'nutmeg' : null);
    if (side === 0) {
      // Go away from the defender's side (or anywhere when alone).
      if (victim) side = (victim.p.position.x - p.position.x) * -f.z + (victim.p.position.z - p.position.z) * f.x > 0 ? -1 : 1;
      else side = this.rng() < 0.5 ? 1 : -1;
    }
    const opponentsLevel = this.match.teams[this.match.opponent(this.team)].ai?.difficulty ?? 'normal';
    let risk = def.risk + Math.max(0, p.speed - def.maxSpeed) * 0.08 + (3 - this.rating.skl) * 0.035;
    if (this.stamina < 0.3) risk += 0.08;
    if (victim) risk += DEFENDER_READ[opponentsLevel] ?? 0.05;
    if (kind === this.lastTrickKind) risk += 0.1; // spamming one move gets read
    if (!this.isHuman) risk += 0.05;
    const fail = this.rng() < risk;
    this.touch = null;
    p.legPulse = null;
    p.anim.play(`${def.clip}_${side > 0 ? 'R' : 'L'}`, { fadeIn: 0.06, fadeOut: 0.12 });
    this.trick = {
      kind, def, side, t: 0, f, e: rotateToward(f, side, 90), entrySpeed: p.speed, startHeading: p.heading,
      victim, fail, solo: solo || !victim, resolved: false, impulsed: false, byHuman: this.isHuman,
    };
    this.lastTrickKind = kind;
    this.events.emit('trickStart', { player: p, kind, label: def.label, side, victim: victim?.p ?? null, byHuman: this.isHuman });
    return true;
  }

  updateTrick(dt, time) {
    const tr = this.trick;
    const def = tr.def;
    const p = this.p;
    const ball = this.ball;
    tr.t += dt;
    const u = Math.min(1, tr.t / def.dur);
    const smooth = (k) => k * k * (3 - 2 * k);

    // Body: speed, heading change, visual spin, sideways travel.
    p.speed = typeof def.speed === 'function' ? def.speed(u, tr.entrySpeed) : def.speed;
    if (def.turn) {
      const [a, b, deg] = def.turn;
      const k = THREE.MathUtils.clamp((u - a) / (b - a), 0, 1);
      p.heading = wrap(tr.startHeading - tr.side * THREE.MathUtils.degToRad(deg) * smooth(k));
    }
    p.extraYaw = def.spin ? -tr.side * def.spin * smooth(THREE.MathUtils.clamp((u - 0.1) / 0.8, 0, 1)) : 0;
    p.facing(_fwd);
    p.velocity.copy(_fwd).multiplyScalar(p.speed);
    if (def.lateral) p.velocity.addScaledVector(tr.e, def.lateral);
    p.position.addScaledVector(p.velocity, dt);
    p.position.x = THREE.MathUtils.clamp(p.position.x, -COURT.halfLength + 0.35, COURT.halfLength - 0.35);
    p.position.z = THREE.MathUtils.clamp(p.position.z, -COURT.halfWidth + 0.35, COURT.halfWidth - 0.35);

    // Ball: held on a scripted line until it is played (stays a physical body).
    const [h0, h1, holdFn] = def.hold;
    if (!tr.impulsed && !(tr.fail && tr.resolved) && u >= h0 && u <= h1 && !ball.heldBy) {
      // The ball is worked with separate touches of the sole / instep: every
      // TRICK_TOUCH seconds it is played to where the move needs it next, and
      // rolls freely in between.
      tr.holdT = (tr.holdT ?? 0) - dt;
      if (tr.holdT <= 0) {
        tr.holdT = TRICK_TOUCH;
        const local = holdFn(Math.min(h1, u + TRICK_TOUCH / def.dur));
        _dir.copy(p.position).addScaledVector(p.velocity, TRICK_TOUCH).addScaledVector(tr.f, local.f).addScaledVector(tr.e, local.e).sub(ball.position);
        _dir.y = 0;
        _vel.copy(_dir).multiplyScalar(1 / TRICK_TOUCH);
        if (_vel.length() > 9) _vel.setLength(9);
        _vel.y = Math.min(ball.velocity.y, 0.3);
        ball.kick(_vel, null, p, time);
      }
    }

    // Key moment: success or failure is decided, the defender bites.
    if (!tr.resolved && u >= def.key) {
      tr.resolved = true;
      if (tr.fail) {
        const a = (this.rng() < 0.5 ? -1 : 1) * THREE.MathUtils.degToRad(30 + this.rng() * 50);
        _dir.copy(tr.f).applyAxisAngle(UP, a);
        _vel.copy(_dir).multiplyScalar(3.5 + this.rng() * 1.5);
        _vel.y = 0.25;
        ball.kick(_vel, null, p, time);
        this.possession = false;
        this.match.clearOwner(this);
        this.regainCooldown = 0.4;
        this.events.emit('trick', { player: p, kind: tr.kind, label: def.label, outcome: 'fail', victim: tr.victim?.p ?? null, byHuman: tr.byHuman });
      } else if (tr.victim && !tr.solo) {
        tr.victim.fooled = def.fool;
        // The beaten defender visibly bites: weight the wrong way, legs crossed.
        if (!tr.victim.busy) tr.victim.p.anim.play(`Stumble_${tr.side > 0 ? 'L' : 'R'}`, { speed: 0.7 / Math.max(0.45, def.fool), fadeIn: 0.05, fadeOut: 0.18 });
        tr.victim.fooledDir.copy(tr.e).multiplyScalar(-1);
        if (def.ghostVictim) tr.victim.ghostUntil = time + def.ghostVictim;
        tr.victim.charge.active = false;
        this.events.emit('fooled', { player: p, victim: tr.victim.p, kind: tr.kind });
      }
    }

    // The ball is played.
    const imp = def.impulse;
    if (!tr.impulsed && !tr.fail && u >= imp.u) {
      tr.impulsed = true;
      rotateToward(tr.f, tr.side, imp.angle, _dir);
      const speed = typeof imp.speed === 'function' ? imp.speed(tr.entrySpeed) : imp.speed;
      _vel.copy(_dir).multiplyScalar(speed);
      _vel.y = imp.vy ?? 0.15;
      _spin.copy(UP).cross(_dir).multiplyScalar(speed / BALL.radius * 0.6);
      ball.kick(_vel, _spin, p, time);
      this.touchCooldown = 0.25;
      this.events.emit('trickTouch', { player: p, kind: tr.kind, lift: (imp.vy ?? 0) > 1 });
    }

    if (u >= 1) this.endTrick(time, false);
  }

  endTrick(time, aborted) {
    const tr = this.trick;
    this.trick = null;
    this.p.extraYaw = 0;
    this.trickCooldown = 0.22;
    if (aborted || tr.fail) return;
    const def = tr.def;
    if (def.pending && !tr.solo) {
      this.pendingTrick = { kind: tr.kind, label: def.label, points: def.points, victim: tr.victim, until: time + def.pending, byHuman: tr.byHuman, f: tr.f.clone() };
      return;
    }
    const b = this.ball.position;
    const kept = this.match.owner === this || (!this.match.owner && Math.hypot(b.x - this.p.position.x, b.z - this.p.position.z) < 2.2);
    this.events.emit('trick', {
      player: this.p, kind: tr.kind, label: def.label, points: def.points,
      outcome: kept ? 'success' : 'lost', solo: tr.solo, victim: tr.victim?.p ?? null, byHuman: tr.byHuman,
    });
  }

  /** Rainbow / nutmeg: they count once the player gets the ball back behind the defender. */
  updatePendingTrick(time) {
    const pt = this.pendingTrick;
    if (!pt) return;
    const owner = this.match.owner;
    // Still on the ball and now beyond the beaten defender: it counts.
    if (owner === this && pt.victim) {
      const v = pt.victim.p.position;
      const past = (this.p.position.x - v.x) * pt.f.x + (this.p.position.z - v.z) * pt.f.z;
      const ballPast = (this.ball.position.x - v.x) * pt.f.x + (this.ball.position.z - v.z) * pt.f.z;
      if (past > 0.2 && ballPast > 0.2) {
        this.resolvePendingOnControl();
        return;
      }
    }
    const lostToOpponent = (owner && owner.team !== this.team) || this.ball.heldBy;
    if (time > pt.until || lostToOpponent) {
      this.pendingTrick = null;
      this.events.emit('trick', { player: this.p, kind: pt.kind, label: pt.label, outcome: 'lost', victim: pt.victim?.p ?? null, byHuman: pt.byHuman });
    }
  }

  resolvePendingOnControl() {
    const pt = this.pendingTrick;
    if (!pt) return;
    this.pendingTrick = null;
    this.events.emit('trick', { player: this.p, kind: pt.kind, label: pt.label, points: pt.points, outcome: 'success', solo: false, victim: pt.victim?.p ?? null, byHuman: pt.byHuman });
  }

  updateCharge(dt, it) {
    const c = this.charge;
    // A ball in the air close by is hit first time: no wind-up to hold.
    if (it.shootPressed && !c.active && !this.kick && !this.tackle && !this.possession && !this.ball.grounded && !this.ball.heldBy && this.ball.position.y > AERIAL_MIN_Y) {
      const bp = this.ball.position;
      if (Math.hypot(bp.x - this.p.position.x, bp.z - this.p.position.z) < 4.5) {
        this.requestKick('shot', 0.8);
        this.pending && (this.pending.t = 0.7);
        return;
      }
    }
    if (it.shootPressed && !c.active && !this.kick && !this.tackle) {
      c.active = true;
      c.t = 0;
      if (this.isHuman) this.events.emit('chargeStart');
    }
    if (c.active) {
      c.t += dt;
      if (!it.shootHeld || it.shootReleased || c.t >= KICK.maxHold) {
        const power = THREE.MathUtils.clamp(c.t / KICK.chargeTime, 0.18, 1);
        c.active = false;
        c.t = 0;
        this.requestKick('shot', power);
      }
    }
  }

  ballRelation() {
    const p = this.p;
    _rel.copy(this.ball.position).sub(p.position);
    _rel.y = 0;
    const dist = _rel.length();
    p.facing(_fwd);
    const ahead = _rel.dot(_fwd);
    const lateral = _rel.x * _fwd.z - _rel.z * _fwd.x;
    return { dist, ahead, lateral };
  }

  /** Called by the MatchState when someone else takes the ball, or by a tackle. */
  losePossession(reason, { slide = false } = {}) {
    if (this.trick) {
      const tr = this.trick;
      this.endTrick(0, true);
      if (reason !== 'handoff') {
        this.events.emit('trick', { player: this.p, kind: tr.kind, label: tr.def.label, outcome: 'lost', victim: tr.victim?.p ?? null, byHuman: tr.byHuman });
      }
    }
    this.touch = null;
    if (!this.possession) return;
    this.possession = false;
    this.regainCooldown = reason === 'tackled' ? 0.7 : 0.45;
    this.match.clearOwner(this);
    if (reason === 'tackled') {
      this.stagger = TACKLE.staggerTime;
      this.charge.active = false;
      if (slide) {
        // Taken off his feet: down on his back, then up again.
        this.stagger = FALL_TIME;
        this.fallTime = FALL_TIME;
        this.regainCooldown = FALL_TIME;
        this.p.anim.play('Fall_Back', { speed: 1.3 / FALL_TIME, fadeIn: 0.05, fadeOut: 0.25 });
      } else this.p.anim.play('Hit_Chest', { speed: 1.6, fadeIn: 0.05, fadeOut: 0.2 });
    }
    this.events.emit('possessionLost', { player: this.p, reason });
  }

  updateBall(dt, time) {
    const p = this.p;
    const ball = this.ball;
    this.touchCooldown -= dt;
    this.regainCooldown -= dt;
    if (ball.heldBy || ball.inGoal) {
      if (this.possession) {
        this.possession = false;
        this.match.clearOwner(this);
      }
      return;
    }
    if (this.possession && this.match.owner !== this) this.possession = false;
    const { dist, ahead, lateral } = this.ballRelation();
    const height = ball.position.y - BALL.radius;
    _vel.copy(ball.velocity).sub(p.velocity);
    _vel.y = 0;
    const relSpeed = _vel.length();
    const controllable =
      dist < DRIBBLE.controlRadius && height < DRIBBLE.controlMaxHeight && relSpeed < DRIBBLE.controlMaxRelSpeed;

    if (!this.possession) {
      // A wrong-footed defender cannot react to the ball until they recover.
      if (controllable && this.regainCooldown <= 0 && !this.kick && !this.tackle && this.stagger <= 0 && this.fooled <= 0 && this.match.canTake(this, dist)) {
        const previous = this.match.owner;
        if (previous && previous !== this) previous.losePossession(previous.team === this.team ? 'handoff' : 'stolen');
        this.possession = true;
        this.match.setOwner(this);
        this.touchCooldown = 0;
        ball.lastTouch = p;
        const cushion = Math.min(1, relSpeed / DRIBBLE.controlMaxRelSpeed);
        this.firstTouch(cushion, time);
        // A hard ball taken standing: the body gives with it.
        if (relSpeed > 5 && p.speed < 3 && !this.busy) p.anim.play('Receive', { fadeIn: 0.05, fadeOut: 0.15 });
        this.events.emit('control', { player: p, relSpeed, stolenFrom: previous && previous.team !== this.team ? previous.p : null });
        this.resolvePendingOnControl();
      }
      return;
    }

    if (dist > DRIBBLE.loseDistance || height > 1.0) {
      this.possession = false;
      this.match.clearOwner(this);
      this.events.emit('possessionLost', { player: p, reason: 'heavy' });
      return;
    }
    if (this.kick) {
      this.touch = null;
      return;
    }

    // A touch already under way: the boot meets the ball at the contact frame.
    if (this.touch) {
      this.updateTouch(dt, time);
      return;
    }
    if (this.touchCooldown > 0) return;

    const speed = p.speed;
    const lead = DRIBBLE.baseLead + DRIBBLE.leadPerSpeed * speed;
    p.facing(_fwd);
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);

    if (!this.hasInput) {
      // No input: the ball is never steered. Arriving at a rolling ball, the
      // player stops it with the sole once; a dead ball is simply stood over.
      if (dist < 0.95 && ahead > -0.2 && ballSpeed > 0.55 && speed < 2.5) this.startTouch('trap', time);
      return;
    }

    // Dribbling: pick the stride whose swing meets the ball at the toe. The
    // ball's position at the contact frame is predicted from the closing speed
    // and its deceleration; a swing starts on the footfall that fits best.
    const along = ball.velocity.x * _fwd.x + ball.velocity.z * _fwd.z;
    const closing = speed - along;
    const decel = BALL.rollingDecel + BALL.rollingDrag * ballSpeed + (ball.softTime > 0 ? ball.softDecel : 0);
    const aheadIn = (t) => ahead - closing * t - 0.5 * (along > 0.2 ? decel : 0) * t * t;
    const swing = this.touchSwing() * TOUCH_U;
    const now = aheadIn(swing);
    const footfalls = p.anim.footfalls;
    const onStride = footfalls !== this.lastFootfalls;
    this.lastFootfalls = footfalls;
    let start = false;
    if (onStride && now < TOUCH_REACH + 0.3) {
      const next = aheadIn(swing + p.anim.stepTime);
      start = Math.abs(now - TOUCH_REACH) <= Math.abs(next - TOUCH_REACH) || next < 0.15;
    }
    if (now < TOUCH_REACH) this.touchWanted += dt;
    else this.touchWanted = 0;
    // No stride lined up (or standing start, or the ball is about to go under the body): touch now.
    if (now < 0.18 || this.touchWanted > 0.3 || (speed < 1.2 && ahead < TOUCH_REACH + 0.16) || (ahead < 0.05 && dist < 0.85)) start = true;
    // Only swing at a ball that is within reach of the stride.
    if (start && dist < 1.25 && ahead > -0.3) this.startTouch('touch', time);
  }

  /** Duration of a dribble-touch swing: one step of the current stride. */
  touchSwing() {
    return this.p.speed < 2 ? 0.24 : THREE.MathUtils.clamp(this.p.anim.stepTime, 0.2, 0.4);
  }

  startTouch(kind, time) {
    const p = this.p;
    const side = p.rearFoot();
    const dur = kind === 'trap' ? 0.3 : this.touchSwing();
    p.kickLeg(side, { kind, dur, amp: kind === 'trap' ? 0.55 : p.speed > 5 ? 0.5 : 0.62 });
    this.touch = { kind, side, t: 0, contactAt: dur * (kind === 'trap' ? 0.45 : TOUCH_U) };
    this.touchWanted = 0;
  }

  updateTouch(dt, time) {
    const tc = this.touch;
    const p = this.p;
    const ball = this.ball;
    tc.t += dt;
    // Contact at the swing's contact frame, or earlier if the boot is already
    // on the ball, or the ball is about to pass under the body.
    const rel = this.ballRelation();
    if (tc.t < tc.contactAt) {
      const foot = p.footWorld(tc.side, _dir);
      const onBoot = tc.t > tc.contactAt * 0.4 && Math.hypot(foot.x - ball.position.x, foot.z - ball.position.z) < 0.25;
      const overrun = tc.kind === 'touch' && rel.ahead < 0.2;
      if (!onBoot && !overrun) return;
    }
    this.touch = null;
    const { dist, ahead } = rel;
    // The swing missed: the ball got away during the wind-up.
    if (dist > 1.15 || ahead < -0.4) {
      this.touchCooldown = 0.05;
      this.events.emit('touchMiss', { player: p });
      return;
    }
    p.facing(_fwd);
    if (tc.kind === 'trap') {
      // Sole on the ball: almost all of its pace is killed in one contact.
      const v = ball.velocity;
      _vel.set(v.x * 0.12 + p.velocity.x * 0.3, Math.min(v.y, 0.05), v.z * 0.12 + p.velocity.z * 0.3);
      ball.kick(_vel, null, p, time);
      this.touchCooldown = 0.4;
      this.events.emit('touch', { player: p, strength: 0.6, side: tc.side, trap: true });
      return;
    }
    const speed = p.speed;
    const sigma =
      ((this.sprinting ? DRIBBLE.sprintError : DRIBBLE.jogError) + DRIBBLE.turnError * Math.min(1, this.turnRateNorm)) * (1 + (3 - this.rating.skl) * 0.12);
    // The ball goes where the stick points (blended with the body line), from where it lies.
    const aim = this.hasInput ? this.moveDir : _fwd;
    _dir.copy(aim).lerp(_fwd, 0.25).setY(0).normalize().applyAxisAngle(UP, this.rng.gauss() * sigma);
    const margin = this.sprinting ? DRIBBLE.sprintTouchMargin : DRIBBLE.touchMargin;
    let ballSpeed = speed + margin * Math.min(1, 0.45 + speed / PLAYER.jogSpeed);
    if (ahead < 0.05) ballSpeed = Math.max(ballSpeed * 0.8, 1.6);
    // Keep it on the runner's line: cancel the ball's offset across the new direction.
    _rel.copy(ball.position).sub(p.position);
    const across = _rel.x * _dir.z - _rel.z * _dir.x;
    const correction = THREE.MathUtils.clamp(-across * 2.4, -2, 2);
    _vel.copy(_dir).multiplyScalar(ballSpeed);
    _vel.x += _dir.z * correction;
    _vel.z += -_dir.x * correction;
    _vel.y = 0.25 + speed * 0.04;
    _spin.copy(UP).cross(_dir).multiplyScalar(ballSpeed / BALL.radius);
    ball.touch(_vel, _spin, p, time, DRIBBLE.touchCheck, DRIBBLE.touchCheckTime);
    this.touchCooldown = DRIBBLE.minTouchInterval;
    this.events.emit('touch', { player: p, strength: ballSpeed, side: tc.side });
  }

  firstTouch(cushion, time) {
    const p = this.p;
    const ball = this.ball;
    // Cushion: the ball keeps some of its pace and only part of the runner's;
    // it drops off the boot instead of sticking to it.
    const keep = 0.3 + 0.25 * (1 - cushion);
    _vel.copy(ball.velocity).multiplyScalar(keep);
    _vel.addScaledVector(p.velocity, 0.7);
    _vel.y = Math.min(_vel.y, 0.4);
    ball.kick(_vel, null, p, time);
    p.kickLeg(p.rearFoot(), { kind: p.speed < 2 ? 'trap' : 'touch', dur: 0.24, amp: 0.45 });
    this.touchCooldown = 0.16;
  }

  // ------------------------------------------------------------------ actions

  /**
   * Pass button. Tap: ground pass. Hold (≥ LOB_HOLD s): lobbed pass. With
   * sprint held: through ball into the receiver's run. Intents without
   * passHeld (AI, tests) pass at once.
   */
  updatePassInput(dt, it) {
    const c = this.passCharge;
    if (it.passPressed && !c && !this.possession && it.passHeld !== undefined) {
      // Nowhere near the ball: no swing at thin air. (After your own pass this asks for the one-two.)
      const b = this.ball.position;
      if (Math.hypot(b.x - this.p.position.x, b.z - this.p.position.z) > KICK.reach + 0.4) {
        this.events.emit('passRequest', { player: this.p });
        return;
      }
    }
    if (it.passPressed && !c) {
      if (it.passHeld === undefined) this.requestPass();
      else this.passCharge = { t: 0, through: !!it.sprint };
      return;
    }
    if (!c) return;
    c.t += dt;
    if (!it.passHeld || it.passReleased || c.t >= LOB_HOLD + 0.12) {
      this.passCharge = null;
      this.requestPass({ lob: c.t >= LOB_HOLD, through: c.through });
    }
  }

  /** Human pass: picks the teammate in the input/facing direction. */
  requestPass({ lob = false, through = false } = {}) {
    const dir = this.hasInput ? this.moveDir.clone() : this.p.facing(new THREE.Vector3());
    const target = this.match.choosePassTarget(this, dir);
    this.requestKick('pass', 0.5, { target, lob, through: through && !lob });
  }

  requestKick(type, power, opts = {}) {
    if (this.kick || this.tackle || this.stagger > 0) return;
    this.pending = { type, power, opts, t: KICK.bufferTime };
    this.tryStartKick();
  }

  tryStartKick() {
    if (!this.pending || this.kick) return;
    const { dist } = this.ballRelation();
    const ball = this.ball;
    const by = ball.position.y;
    // A dropping ball can be struck out of the air: predict where it will be at the contact frame.
    let aerial = null;
    if (this.pending.type === 'shot' && !ball.heldBy && !ball.grounded && dist < 4.5) {
      const tc = CLIP_EVENTS.Kick_Volley.contact;
      const v = ball.velocity;
      const yc = by + v.y * tc - 0.5 * 9.81 * tc * tc;
      const dx = ball.position.x + v.x * tc - (this.p.position.x + this.p.velocity.x * tc);
      const dz = ball.position.z + v.z * tc - (this.p.position.z + this.p.velocity.z * tc);
      const back = this.p.facing(_fwd).x * this.attackSign < -0.15;
      if (yc > AERIAL_MIN_Y && yc < AERIAL_MAX_Y && Math.hypot(dx, dz) < AERIAL_REACH) {
        // Facing goal, a high ball is left to drop to volley height; back to goal it goes overhead.
        if (!back && yc > 1.3 && this.pending.t > 0.08) return;
        aerial = back || yc > 1.3 ? 'bicycle' : 'volley';
      } else if (yc > AERIAL_MIN_Y && this.pending.t > 0) return; // still coming down: wait for it
    }
    // On the dribble the ball may be a stride ahead: the run-up closes it by the contact frame.
    const reach = this.possession ? KICK.reach + 0.75 : KICK.reach;
    const reachable = !!aerial || (dist < reach && by < 1.0 && !ball.heldBy);
    if (!reachable && this.pending.t > 0) return;
    const { type, power, opts } = this.pending;
    this.pending = null;
    if (!reachable && !this.isHuman) return; // AI never swings at air
    const p = this.p;
    const dir = this.kickDirection(type, aerial ? { ...opts, anyFacing: true } : opts);
    // Back to goal (or the ball above the shoulders): overhead bicycle kick.
    if (aerial && p.facing(_fwd).dot(dir) < -0.15) aerial = 'bicycle';
    const clip = aerial === 'bicycle' ? 'Kick_Bicycle' : aerial ? 'Kick_Volley' : type === 'shot' ? 'Kick_Shot' : 'Kick_Pass';
    const speedScale = aerial ? 1 : type === 'shot' ? 1.05 : 1.1;
    const duration = p.anim.play(clip, { speed: speedScale, fadeIn: 0.05, fadeOut: 0.14 });
    this.kick = {
      type,
      power: aerial ? Math.max(power, 0.7) : power,
      dir,
      aerial,
      lob: !!opts.lob,
      through: !!opts.through,
      target: opts.target ?? null,
      // The bicycle is struck over the shoulder: the body faces away from the target.
      heading: aerial === 'bicycle' ? Math.atan2(-dir.x, -dir.z) : Math.atan2(dir.x, dir.z),
      t: 0,
      contactAt: (CLIP_EVENTS[clip] ?? CLIP_EVENTS.Kick_Shot).contact / speedScale,
      duration,
      done: false,
      whiff: !reachable,
    };
    this.lastShotPower = power;
    this.events.emit('kickStart', { type, power, player: p, aerial });
  }

  passLeadPoint(target, out = new THREE.Vector3(), through = false) {
    const from = this.ball.position;
    const tp = target.p.position;
    const dist = Math.hypot(tp.x - from.x, tp.z - from.z);
    const speed = this.passSpeed(dist);
    const t = dist / speed;
    out.copy(tp).addScaledVector(target.p.velocity, Math.min(1.1, t * 0.9));
    // Through ball: played into the space ahead of the runner, toward the goal being attacked.
    if (through) {
      out.x += this.attackSign * 3.2;
      out.addScaledVector(target.p.velocity, 0.35);
    }
    out.x = THREE.MathUtils.clamp(out.x, -COURT.halfLength + 0.6, COURT.halfLength - 0.6);
    out.z = THREE.MathUtils.clamp(out.z, -COURT.halfWidth + 0.6, COURT.halfWidth - 0.6);
    return out;
  }

  passSpeed(dist) {
    return THREE.MathUtils.clamp(6.5 + dist * 0.85, KICK.passSpeed * 0.7, 18);
  }

  kickDirection(type, opts) {
    const p = this.p;
    const out = new THREE.Vector3();
    const facing = p.facing(new THREE.Vector3());
    const aimSource = this.hasInput ? this.moveDir : facing;
    if (type === 'pass') {
      if (opts.target) {
        const lead = this.passLeadPoint(opts.target);
        return out.set(lead.x - this.ball.position.x, 0, lead.z - this.ball.position.z).normalize();
      }
      return out.copy(aimSource).setY(0).normalize();
    }
    const goalX = this.attackSign * (COURT.halfLength + 0.2);
    let aimZ;
    if (opts.aimZ != null) aimZ = opts.aimZ;
    else if (this.hasInput) aimZ = THREE.MathUtils.clamp(this.moveDir.z * 1.6, -1, 1) * COURT.goalHalfWidth * 0.82;
    else aimZ = THREE.MathUtils.clamp(-p.position.z * 0.12, -0.6, 0.6);
    out.set(goalX - this.ball.position.x, 0, aimZ - this.ball.position.z);
    this.aimZ = aimZ;
    const toGoal = out.clone().normalize();
    if (!opts.anyFacing && toGoal.dot(aimSource) < Math.cos(THREE.MathUtils.degToRad(110))) {
      this.aimZ = null;
      return out.copy(aimSource).setY(0).normalize();
    }
    return toGoal;
  }

  updateKick(dt, time) {
    if (this.pending) {
      this.pending.t -= dt;
      this.tryStartKick();
    }
    const k = this.kick;
    if (!k) return;
    k.t += dt;
    if (k.aerial === 'bicycle') {
      // Thrown back and up: the whole body tips over while the legs scissor.
      const u = Math.min(1, k.t / (k.duration * 0.8));
      const arc = Math.sin(Math.PI * u);
      this.p.lift = 0.55 * arc;
      this.p.pitch = 1.2 * Math.sin(Math.PI * Math.min(1, u * 1.15));
    }
    if (!k.done && k.t >= k.contactAt) {
      k.done = true;
      this.strike(k, time);
    }
    if (k.t >= k.duration * 0.8) {
      this.kick = null;
      this.p.lift = 0;
      this.p.pitch = 0;
    }
  }

  strike(k, time) {
    const p = this.p;
    const ball = this.ball;
    const { dist } = this.ballRelation();
    const miss = k.aerial
      ? dist > AERIAL_REACH + 0.3 || ball.position.y > AERIAL_MAX_Y + 0.3
      : dist > KICK.reach + 0.25 || ball.position.y > 1.1;
    if (miss || ball.heldBy) {
      this.events.emit('whiff', { player: p });
      return;
    }
    // Someone else may have taken it during the wind-up.
    if (this.match.owner && this.match.owner !== this && this.match.owner.team !== this.team) {
      this.events.emit('whiff', { player: p });
      return;
    }
    const dir = k.dir.clone();
    _vel.set(0, 0, 0);
    _spin.set(0, 0, 0);
    let passTo = null;
    if (k.type === 'shot') {
      const power = k.power;
      const sprintBonus = (this.sprinting ? 1.05 : 1) * (k.aerial ? 1.08 : 1) * this.shotBoost;
      const vh = THREE.MathUtils.lerp(KICK.shotMinSpeed, KICK.shotMaxSpeed, power) * sprintBonus * (1 + (this.rating.sht - 3) * 0.04);
      let sigma = 0.012 + power * power * 0.045 + (p.speed / PLAYER.sprintSpeed) * 0.025 + this.turnRateNorm * 0.03;
      if (k.aerial) sigma += k.aerial === 'bicycle' ? 0.05 : 0.025; // spectacular, but harder to place
      if (this.shotBoost > 1) sigma *= 0.35;
      sigma *= 1 - (this.rating.sht - 3) * 0.1;
      dir.applyAxisAngle(UP, this.rng.gauss() * sigma);
      const goalX = this.attackSign * (COURT.halfLength + 0.2);
      const distToGoal = Math.max(2, Math.abs((goalX - ball.position.x) / (dir.x || 1e-3)));
      const yTarget = 0.18 + power * power * 1.55 + this.rng.gauss() * 0.12 * power;
      const t = distToGoal / (vh * 0.9);
      let vy = (yTarget - ball.position.y) / t + 0.5 * 9.81 * t;
      vy = THREE.MathUtils.clamp(vy, 0.8, 11);
      _vel.copy(dir).multiplyScalar(vh);
      _vel.y = vy;
      _spin.copy(UP).cross(dir).multiplyScalar(18 * power);
      if (this.aimZ != null) _spin.y = -Math.sign(this.aimZ) * this.attackSign * 14 * power;
    } else {
      let vh = KICK.passSpeed + p.speed * 0.4;
      let d = 9;
      if (k.target) {
        // Re-aim at the receiver's run at the moment of contact.
        const lead = this.passLeadPoint(k.target, undefined, k.through);
        dir.set(lead.x - ball.position.x, 0, lead.z - ball.position.z);
        d = dir.length();
        dir.normalize();
        vh = this.passSpeed(d) * (k.through ? 1.08 : 1);
        passTo = k.target;
      }
      if (this.passError) dir.applyAxisAngle(UP, this.rng.gauss() * this.passError);
      if (k.lob) {
        // Lobbed pass: floated over the defenders to drop at the receiver.
        const vy = THREE.MathUtils.clamp(6.4 + d * 0.13, 6.4, 9.5);
        vh = (d * 9.81) / (2 * vy) * 1.06; // lands on the receiver (a touch long for drag)
        _vel.copy(dir).multiplyScalar(vh);
        _vel.y = vy;
        _spin.copy(UP).cross(dir).multiplyScalar(-10); // backspin: it sits down when it lands
      } else {
        _vel.copy(dir).multiplyScalar(vh);
        _vel.y = 0.9;
        _spin.copy(UP).cross(dir).multiplyScalar((vh / BALL.radius) * 0.5);
      }
    }
    ball.kick(_vel, _spin, p, time);
    this.possession = false;
    this.match.clearOwner(this);
    this.regainCooldown = KICK.regainCooldown;
    if (passTo) this.match.setPassTarget(passTo, time);
    this.events.emit('kick', { type: k.type, power: k.power, speed: _vel.length(), player: p, target: passTo, aerial: k.aerial, lob: k.lob, through: k.through });
  }

  /** Poke tackle: a short lunge; the contact frame resolves against the ball. */
  requestTackle({ slide = false } = {}) {
    if (this.busy || this.possession || this.tackleCooldown > 0) return false;
    const p = this.p;
    // Lunge toward the ball if it is roughly ahead, else straight on.
    const toBall = new THREE.Vector3(this.ball.position.x - p.position.x, 0, this.ball.position.z - p.position.z);
    const facing = p.facing(new THREE.Vector3());
    const heading = toBall.length() < 3 && toBall.normalize().dot(facing) > 0.2 ? Math.atan2(toBall.x, toBall.z) : p.heading;
    const duration = p.anim.play(slide ? 'Tackle_Slide' : 'Tackle_Poke', { speed: 1, fadeIn: 0.05, fadeOut: slide ? 0.22 : 0.16 });
    this.tackle = { t: 0, done: false, duration, heading, slide };
    this.tackleCooldown = slide ? TACKLE.slideCooldown : TACKLE.cooldown;
    this.events.emit('tackleStart', { player: p, slide });
    return true;
  }

  updateTackle(dt, time) {
    const tk = this.tackle;
    if (!tk) return;
    tk.t += dt;
    // Track the ball with the lunge until the contact frame.
    if (!tk.done) {
      const b = this.ball.position;
      const pp = this.p.position;
      if (Math.hypot(b.x - pp.x, b.z - pp.z) < 3) tk.heading = Math.atan2(b.x - pp.x, b.z - pp.z);
    }
    if (tk.slide) {
      // Slide: a long, fast, committed lunge along the ground. It takes the
      // ball anywhere along the slide, then leaves the tackler on the floor.
      this.p.speed = tk.t < 0.5 ? Math.max(this.p.speed * 0.985, TACKLE.slideSpeed * (1 - tk.t / 0.75)) : Math.min(this.p.speed, 0.6);
      if (!tk.done && tk.t >= 0.14 && tk.t <= 0.5) {
        const foot = this.p.footPoint(_dir, 0.9);
        const b = this.ball.position;
        if (Math.hypot(b.x - foot.x, b.z - foot.z) < TACKLE.slideReach && b.y < 0.7) {
          tk.done = true;
          this.resolveTackle(time, true);
        }
      }
      if (tk.t >= tk.duration * 0.95) this.tackle = null;
      return;
    }
    // Lunge burst into the contact frame, then a slow recovery.
    if (tk.t < TACKLE.contact + 0.06) this.p.speed = Math.max(this.p.speed, TACKLE.lungeSpeed * (1 - tk.t / 0.5));
    else this.p.speed = Math.min(this.p.speed, 1.2);
    if (!tk.done && tk.t >= TACKLE.contact) {
      tk.done = true;
      this.resolveTackle(time);
    }
    if (tk.t >= tk.duration * 0.9) this.tackle = null;
  }

  resolveTackle(time, slide = false) {
    const p = this.p;
    const ball = this.ball;
    const foot = p.footPoint(new THREE.Vector3(), slide ? 0.9 : 0.75);
    const dBall = Math.hypot(ball.position.x - foot.x, ball.position.z - foot.z);
    const owner = this.match.owner;
    if (ball.heldBy || ball.position.y > 0.7 || dBall > (slide ? TACKLE.slideReach : TACKLE.reach)) {
      this.events.emit('tackle', { tackler: p, success: false, reason: 'reach', dBall, ballY: ball.position.y, held: !!ball.heldBy });
      return;
    }
    let chance = owner && owner.team !== this.team ? this.tackleSuccess + (slide ? TACKLE.slideBonus : 0) : 0.95;
    if (owner && owner.team !== this.team) {
      // From behind is harder and riskier.
      const toTackler = new THREE.Vector3(p.position.x - owner.p.position.x, 0, p.position.z - owner.p.position.z).normalize();
      if (owner.p.facing(new THREE.Vector3()).dot(toTackler) < -0.3) chance -= TACKLE.fromBehindPenalty;
      // Sprinting dribblers with the ball far ahead are easier to rob.
      const sep = Math.hypot(ball.position.x - owner.p.position.x, ball.position.z - owner.p.position.z);
      chance += THREE.MathUtils.clamp((sep - 0.6) * 0.25, 0, 0.2);
      // Lunging at a player mid-trick mostly buys the move.
      if (owner.trick && !owner.trick.fail) chance *= 0.35;
    }
    if (this.rng() > THREE.MathUtils.clamp(chance, 0.05, 0.97)) {
      this.events.emit('tackle', { tackler: p, success: false, victim: owner?.p ?? null, reason: 'roll' });
      return;
    }
    const f = p.facing(new THREE.Vector3());
    const side = (this.rng() - 0.5) * 2.5;
    const away = slide ? 7 : 4.2;
    _vel.set(f.x * away - f.z * side, slide ? 0.6 : 0.3, f.z * away + f.x * side);
    if (owner && owner !== this) owner.losePossession(owner.team === this.team ? 'handoff' : 'tackled', { slide });
    ball.kick(_vel, null, p, time);
    this.regainCooldown = 0.12;
    this.events.emit('tackle', { tackler: p, success: true, slide, victim: owner && owner.team !== this.team ? owner.p : null, reason: owner ? 'won' : 'loose' });
  }
}
