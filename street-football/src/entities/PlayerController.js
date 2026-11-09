import * as THREE from 'three';
import { BALL, COURT, DRIBBLE, KICK, PLAYER, TACKLE } from '../config.js';
import { CLIP_EVENTS } from '../animation/FootballClips.js';

const _rel = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _spin = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

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
    footballer.ctrl = this;
    this.reset();
  }

  reset() {
    this.possession = false;
    this.touchCooldown = 0;
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
  }

  get chargeLevel() {
    return this.charge.active ? Math.min(1, this.charge.t / KICK.chargeTime) : 0;
  }

  get busy() {
    return !!(this.kick || this.tackle || this.stagger > 0);
  }

  /**
   * @param it intents. Human: moveX/moveY camera-relative + buttons. AI: world=true, worldX/worldZ (magnitude ≤ 1), sprint, faceX/faceZ.
   */
  update(dt, it, camYaw, time) {
    const p = this.p;
    p.beginStep();
    this.tackleCooldown -= dt;
    if (this.frozen) {
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

    if (this.stagger > 0) {
      this.stagger -= dt;
      this.hasInput = false;
      this.charge.active = false;
    } else {
      this.updateCharge(dt, it);
      if (it.passPressed) this.requestPass();
      if (it.tacklePressed && !this.possession) this.requestTackle();
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
      const { ahead } = this.ballRelation();
      const lead = DRIBBLE.baseLead + DRIBBLE.leadPerSpeed * p.speed;
      const ballSpeed = Math.hypot(this.ball.velocity.x, this.ball.velocity.z);
      if (ahead > lead * 1.05) {
        const cap = (this.sprinting ? PLAYER.sprintSpeed : PLAYER.jogSpeed * 1.08) * this.speedFactor;
        targetSpeed = Math.max(targetSpeed, Math.min(cap, ballSpeed + DRIBBLE.chaseBoost));
      }
    }
    const kicking = this.kick && !this.kick.done;
    if (this.kick) targetSpeed *= 0.25;
    if (this.charge.active) targetSpeed *= 0.8;
    if (this.stagger > 0) targetSpeed = 0;

    let desiredHeading = p.heading;
    if (this.kick) desiredHeading = this.kick.heading;
    else if (this.tackle) desiredHeading = this.tackle.heading;
    else if (this.hasInput) desiredHeading = Math.atan2(this.moveDir.x, this.moveDir.z);
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

    this.updateTackle(dt, time);

    p.facing(_fwd);
    p.velocity.copy(_fwd).multiplyScalar(p.speed);
    p.position.addScaledVector(p.velocity, dt);
    p.position.x = THREE.MathUtils.clamp(p.position.x, -COURT.halfLength + 0.35, COURT.halfLength - 0.35);
    p.position.z = THREE.MathUtils.clamp(p.position.z, -COURT.halfWidth + 0.35, COURT.halfWidth - 0.35);

    this.updateBall(dt, time);
    this.updateKick(dt, time);
    p.setGhost(this.possession || !!this.kick || this.regainCooldown > 0);
    p.commitStep();
  }

  updateCharge(dt, it) {
    const c = this.charge;
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
  losePossession(reason) {
    if (!this.possession) return;
    this.possession = false;
    this.regainCooldown = reason === 'tackled' ? 0.7 : 0.45;
    this.match.clearOwner(this);
    if (reason === 'tackled') {
      this.stagger = TACKLE.staggerTime;
      this.charge.active = false;
      this.p.anim.play('Hit_Chest', { speed: 1.6, fadeIn: 0.05, fadeOut: 0.2 });
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
      if (controllable && this.regainCooldown <= 0 && !this.kick && !this.tackle && this.stagger <= 0 && this.match.canTake(this, dist)) {
        const previous = this.match.owner;
        if (previous && previous !== this) previous.losePossession(previous.team === this.team ? 'handoff' : 'stolen');
        this.possession = true;
        this.match.setOwner(this);
        this.touchCooldown = 0;
        ball.lastTouch = p;
        const cushion = Math.min(1, relSpeed / DRIBBLE.controlMaxRelSpeed);
        this.firstTouch(cushion, time);
        this.events.emit('control', { player: p, relSpeed, stolenFrom: previous && previous.team !== this.team ? previous.p : null });
      }
      return;
    }

    if (dist > DRIBBLE.loseDistance || height > 1.0) {
      this.possession = false;
      this.match.clearOwner(this);
      this.events.emit('possessionLost', { player: p, reason: 'heavy' });
      return;
    }
    if (this.kick) return;

    const speed = p.speed;
    const lead = DRIBBLE.baseLead + DRIBBLE.leadPerSpeed * speed;
    p.facing(_fwd);

    if (speed < 0.8 && !this.hasInput) {
      // Shielding at a standstill: sole the ball back to just in front of the feet.
      if (dist < 1.1) {
        p.footPoint(_dir, 0.45);
        _dir.sub(ball.position);
        _dir.y = 0;
        const pull = Math.min(2.2, _dir.length() * 5);
        if (_dir.lengthSq() > 1e-6) _dir.normalize();
        const v = ball.velocity;
        const k = 1 - Math.exp(-dt * 9);
        ball.body.setLinvel({ x: v.x + (_dir.x * pull - v.x) * k, y: v.y, z: v.z + (_dir.z * pull - v.z) * k }, true);
      }
      return;
    }

    if (this.touchCooldown > 0) return;
    const behind = ahead < 0.05;
    if (ahead < lead * 0.7 || (behind && dist < 0.85)) {
      const sigma =
        (this.sprinting ? DRIBBLE.sprintError : DRIBBLE.jogError) + DRIBBLE.turnError * Math.min(1, this.turnRateNorm);
      const err = this.rng.gauss() * sigma;
      _dir.copy(_fwd).applyAxisAngle(UP, err);
      const margin = this.sprinting ? DRIBBLE.sprintTouchMargin : DRIBBLE.touchMargin;
      let ballSpeed = speed + margin * Math.min(1, 0.45 + speed / PLAYER.jogSpeed);
      if (behind) ballSpeed = Math.max(ballSpeed * 0.8, 1.6);
      const correction = THREE.MathUtils.clamp(-lateral * 3.2, -2.2, 2.2);
      _vel.copy(_dir).multiplyScalar(ballSpeed);
      _vel.x += _fwd.z * correction;
      _vel.z += -_fwd.x * correction;
      _vel.y = 0.25 + speed * 0.04;
      _spin.copy(UP).cross(_dir).multiplyScalar(ballSpeed / BALL.radius);
      ball.kick(_vel, _spin, p, time);
      this.touchCooldown = THREE.MathUtils.clamp(
        DRIBBLE.maxTouchInterval - speed * 0.035,
        DRIBBLE.minTouchInterval,
        DRIBBLE.maxTouchInterval,
      );
      this.events.emit('touch', { player: p, strength: ballSpeed });
    }
  }

  firstTouch(cushion, time) {
    const p = this.p;
    const ball = this.ball;
    const keep = 0.25 + 0.25 * (1 - cushion);
    _vel.copy(ball.velocity).multiplyScalar(keep);
    _vel.addScaledVector(p.velocity, 0.85);
    _vel.y = Math.min(_vel.y, 0.4);
    ball.kick(_vel, null, p, time);
    this.touchCooldown = 0.12;
  }

  // ------------------------------------------------------------------ actions

  /** Human pass: picks the teammate in the input/facing direction. */
  requestPass() {
    const dir = this.hasInput ? this.moveDir.clone() : this.p.facing(new THREE.Vector3());
    const target = this.match.choosePassTarget(this, dir);
    this.requestKick('pass', 0.5, { target });
  }

  requestKick(type, power, opts = {}) {
    if (this.kick || this.tackle || this.stagger > 0) return;
    this.pending = { type, power, opts, t: KICK.bufferTime };
    this.tryStartKick();
  }

  tryStartKick() {
    if (!this.pending || this.kick) return;
    const { dist } = this.ballRelation();
    const reachable = dist < KICK.reach && this.ball.position.y < 1.0 && !this.ball.heldBy;
    if (!reachable && this.pending.t > 0) return;
    const { type, power, opts } = this.pending;
    this.pending = null;
    if (!reachable && !this.isHuman) return; // AI never swings at air
    const p = this.p;
    const dir = this.kickDirection(type, opts);
    const clip = type === 'shot' ? 'Kick_Shot' : 'Kick_Pass';
    const speedScale = type === 'shot' ? 1.05 : 1.1;
    const duration = p.anim.play(clip, { speed: speedScale, fadeIn: 0.05, fadeOut: 0.14 });
    this.kick = {
      type,
      power,
      dir,
      target: opts.target ?? null,
      heading: Math.atan2(dir.x, dir.z),
      t: 0,
      contactAt: CLIP_EVENTS[clip].contact / speedScale,
      duration,
      done: false,
      whiff: !reachable,
    };
    this.lastShotPower = power;
    this.events.emit('kickStart', { type, power, player: p });
  }

  passLeadPoint(target, out = new THREE.Vector3()) {
    const from = this.ball.position;
    const tp = target.p.position;
    const dist = Math.hypot(tp.x - from.x, tp.z - from.z);
    const speed = this.passSpeed(dist);
    const t = dist / speed;
    out.copy(tp).addScaledVector(target.p.velocity, Math.min(1.1, t * 0.9));
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
    if (toGoal.dot(aimSource) < Math.cos(THREE.MathUtils.degToRad(110))) {
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
    if (!k.done && k.t >= k.contactAt) {
      k.done = true;
      this.strike(k, time);
    }
    if (k.t >= k.duration * 0.8) this.kick = null;
  }

  strike(k, time) {
    const p = this.p;
    const ball = this.ball;
    const { dist } = this.ballRelation();
    if (dist > KICK.reach + 0.25 || ball.position.y > 1.1 || ball.heldBy) {
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
      const sprintBonus = this.sprinting ? 1.05 : 1;
      const vh = THREE.MathUtils.lerp(KICK.shotMinSpeed, KICK.shotMaxSpeed, power) * sprintBonus;
      const sigma = 0.012 + power * power * 0.045 + (p.speed / PLAYER.sprintSpeed) * 0.025 + this.turnRateNorm * 0.03;
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
      if (k.target) {
        // Re-aim at the receiver's run at the moment of contact.
        const lead = this.passLeadPoint(k.target);
        dir.set(lead.x - ball.position.x, 0, lead.z - ball.position.z);
        const d = dir.length();
        dir.normalize();
        vh = this.passSpeed(d);
        passTo = k.target;
      }
      if (this.passError) dir.applyAxisAngle(UP, this.rng.gauss() * this.passError);
      _vel.copy(dir).multiplyScalar(vh);
      _vel.y = 0.9;
      _spin.copy(UP).cross(dir).multiplyScalar((vh / BALL.radius) * 0.5);
    }
    ball.kick(_vel, _spin, p, time);
    this.possession = false;
    this.match.clearOwner(this);
    this.regainCooldown = KICK.regainCooldown;
    if (passTo) this.match.setPassTarget(passTo, time);
    this.events.emit('kick', { type: k.type, power: k.power, speed: _vel.length(), player: p, target: passTo });
  }

  /** Poke tackle: a short lunge; the contact frame resolves against the ball. */
  requestTackle() {
    if (this.busy || this.possession || this.tackleCooldown > 0) return false;
    const p = this.p;
    // Lunge toward the ball if it is roughly ahead, else straight on.
    const toBall = new THREE.Vector3(this.ball.position.x - p.position.x, 0, this.ball.position.z - p.position.z);
    const facing = p.facing(new THREE.Vector3());
    const heading = toBall.length() < 3 && toBall.normalize().dot(facing) > 0.2 ? Math.atan2(toBall.x, toBall.z) : p.heading;
    const duration = p.anim.play('Tackle_Poke', { speed: 1, fadeIn: 0.05, fadeOut: 0.16 });
    this.tackle = { t: 0, done: false, duration, heading };
    this.tackleCooldown = TACKLE.cooldown;
    this.events.emit('tackleStart', { player: p });
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
    // Lunge burst into the contact frame, then a slow recovery.
    if (tk.t < TACKLE.contact + 0.06) this.p.speed = Math.max(this.p.speed, TACKLE.lungeSpeed * (1 - tk.t / 0.5));
    else this.p.speed = Math.min(this.p.speed, 1.2);
    if (!tk.done && tk.t >= TACKLE.contact) {
      tk.done = true;
      this.resolveTackle(time);
    }
    if (tk.t >= tk.duration * 0.9) this.tackle = null;
  }

  resolveTackle(time) {
    const p = this.p;
    const ball = this.ball;
    const foot = p.footPoint(new THREE.Vector3(), 0.75);
    const dBall = Math.hypot(ball.position.x - foot.x, ball.position.z - foot.z);
    const owner = this.match.owner;
    if (ball.heldBy || ball.position.y > 0.7 || dBall > TACKLE.reach) {
      this.events.emit('tackle', { tackler: p, success: false, reason: 'reach', dBall, ballY: ball.position.y, held: !!ball.heldBy });
      return;
    }
    let chance = owner && owner.team !== this.team ? this.tackleSuccess : 0.95;
    if (owner && owner.team !== this.team) {
      // From behind is harder and riskier.
      const toTackler = new THREE.Vector3(p.position.x - owner.p.position.x, 0, p.position.z - owner.p.position.z).normalize();
      if (owner.p.facing(new THREE.Vector3()).dot(toTackler) < -0.3) chance -= TACKLE.fromBehindPenalty;
      // Sprinting dribblers with the ball far ahead are easier to rob.
      const sep = Math.hypot(ball.position.x - owner.p.position.x, ball.position.z - owner.p.position.z);
      chance += THREE.MathUtils.clamp((sep - 0.6) * 0.25, 0, 0.2);
    }
    if (this.rng() > THREE.MathUtils.clamp(chance, 0.05, 0.97)) {
      this.events.emit('tackle', { tackler: p, success: false, victim: owner?.p ?? null, reason: 'roll' });
      return;
    }
    const f = p.facing(new THREE.Vector3());
    const side = (this.rng() - 0.5) * 2.5;
    _vel.set(f.x * 4.2 - f.z * side, 0.3, f.z * 4.2 + f.x * side);
    if (owner && owner !== this) owner.losePossession(owner.team === this.team ? 'handoff' : 'tackled');
    ball.kick(_vel, null, p, time);
    this.regainCooldown = 0.12;
    this.events.emit('tackle', { tackler: p, success: true, victim: owner && owner.team !== this.team ? owner.p : null, reason: owner ? 'won' : 'loose' });
  }
}
