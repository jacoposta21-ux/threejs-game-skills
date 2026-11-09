import * as THREE from 'three';
import { BALL, COURT, DRIBBLE, KICK, PLAYER } from '../config.js';
import { CLIP_EVENTS } from '../animation/FootballClips.js';

const _rel = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _spin = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Human control of one Footballer: camera-relative movement with momentum,
 * physical dribbling (discrete touches on an independent ball), charged
 * shots and passes timed to the kick clip's contact frame.
 */
export class PlayerController {
  constructor(footballer, ball, events, rng) {
    this.p = footballer;
    this.ball = ball;
    this.events = events;
    this.rng = rng;
    this.attackSign = -1; // home attacks the -X goal (screen right)
    this.reset();
  }

  reset() {
    this.possession = false;
    this.touchCooldown = 0;
    this.regainCooldown = 0;
    this.kick = null;
    this.pending = null;
    this.charge = { active: false, t: 0 };
    this.stamina = PLAYER.stamina;
    this.sprinting = false;
    this.turnRateNorm = 0;
    this.moveDir = new THREE.Vector3();
    this.hasInput = false;
    this.frozen = false;
    this.lastShotPower = 0;
  }

  get chargeLevel() {
    return this.charge.active ? Math.min(1, this.charge.t / KICK.chargeTime) : 0;
  }

  /**
   * @param dt fixed step
   * @param it intents from Input.poll()
   * @param camYaw camera yaw (radians) for camera-relative movement
   */
  update(dt, it, camYaw, time) {
    const p = this.p;
    p.beginStep();
    if (this.frozen) {
      p.speed = Math.max(0, p.speed - PLAYER.decel * dt);
      p.commitStep();
      return;
    }

    // Camera-relative input. Screen up = away from the camera.
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    // Camera forward on the ground (yaw 0 looks along +Z).
    const fx = sin;
    const fz = cos;
    const rx = -cos;
    const rz = sin;
    this.moveDir.set(rx * it.moveX + fx * it.moveY, 0, rz * it.moveX + fz * it.moveY);
    const inputMag = Math.min(1, this.moveDir.length());
    this.hasInput = inputMag > 0.08;
    if (this.hasInput) this.moveDir.normalize();

    // Stamina-limited sprint.
    const wantsSprint = it.sprint && this.hasInput;
    if (wantsSprint && this.stamina > 0.02) {
      this.stamina = Math.max(0, this.stamina - PLAYER.staminaDrain * dt);
      this.sprinting = true;
    } else {
      this.stamina = Math.min(PLAYER.stamina, this.stamina + PLAYER.staminaRegen * dt * (this.hasInput ? 0.6 : 1));
      this.sprinting = false;
    }

    this.updateCharge(dt, it);
    if (it.passPressed) this.requestKick('pass', 0.5);

    // Movement with momentum: heading turns at a limited rate; turning bleeds speed.
    let targetSpeed = 0;
    if (this.hasInput) {
      const dribbling = this.possession;
      const top = this.sprinting
        ? (dribbling ? PLAYER.dribbleSprintSpeed : PLAYER.sprintSpeed)
        : (dribbling ? PLAYER.dribbleJogSpeed : PLAYER.jogSpeed);
      targetSpeed = top * Math.max(0.35, inputMag);
    }
    const kicking = this.kick && !this.kick.done;
    // Dribbling: chase down a ball that has run past the lead distance.
    if (this.possession && this.hasInput && !this.kick) {
      const { ahead } = this.ballRelation();
      const lead = DRIBBLE.baseLead + DRIBBLE.leadPerSpeed * p.speed;
      const ballSpeed = Math.hypot(this.ball.velocity.x, this.ball.velocity.z);
      if (ahead > lead * 1.05) {
        const cap = this.sprinting ? PLAYER.sprintSpeed : PLAYER.jogSpeed * 1.08;
        targetSpeed = Math.max(targetSpeed, Math.min(cap, ballSpeed + DRIBBLE.chaseBoost));
      }
    }
    if (this.kick) targetSpeed *= 0.25;
    if (this.charge.active) targetSpeed *= 0.8;

    let desiredHeading = p.heading;
    if (this.kick) desiredHeading = this.kick.heading;
    else if (this.hasInput) desiredHeading = Math.atan2(this.moveDir.x, this.moveDir.z);
    const turnRate = this.sprinting ? PLAYER.sprintTurnRate : PLAYER.turnRate;
    const diff = wrap(desiredHeading - p.heading);
    const maxTurn = (kicking ? 18 : turnRate) * dt;
    const turn = THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
    p.heading = wrap(p.heading + turn);
    this.turnRateNorm = Math.abs(turn) / Math.max(1e-6, PLAYER.turnRate * dt);
    p.speed *= 1 - PLAYER.turnSpeedLoss * Math.abs(turn) * (p.speed / PLAYER.sprintSpeed);
    // A sharp reversal plants the feet first.
    if (Math.abs(diff) > 2.2 && p.speed > 3) targetSpeed = Math.min(targetSpeed, 1.5);
    const accel = targetSpeed > p.speed ? (this.sprinting ? PLAYER.sprintAccel : PLAYER.accel) : PLAYER.decel;
    p.speed += THREE.MathUtils.clamp(targetSpeed - p.speed, -accel * dt, accel * dt);

    p.facing(_fwd);
    p.velocity.copy(_fwd).multiplyScalar(p.speed);
    p.position.addScaledVector(p.velocity, dt);
    p.position.x = THREE.MathUtils.clamp(p.position.x, -COURT.halfLength + 0.35, COURT.halfLength - 0.35);
    p.position.z = THREE.MathUtils.clamp(p.position.z, -COURT.halfWidth + 0.35, COURT.halfWidth - 0.35);

    this.updateBall(dt, time);
    this.updateKick(dt, time, it);
    p.setGhost(this.possession || !!this.kick || this.regainCooldown > 0);
    p.commitStep();
  }

  updateCharge(dt, it) {
    const c = this.charge;
    if (it.shootPressed && !c.active && !this.kick) {
      c.active = true;
      c.t = 0;
      this.events.emit('chargeStart');
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

  updateBall(dt, time) {
    const p = this.p;
    const ball = this.ball;
    this.touchCooldown -= dt;
    this.regainCooldown -= dt;
    if (ball.heldBy || ball.inGoal) {
      this.possession = false;
      return;
    }
    const { dist, ahead, lateral } = this.ballRelation();
    const height = ball.position.y - BALL.radius;
    _vel.copy(ball.velocity).sub(p.velocity);
    _vel.y = 0;
    const relSpeed = _vel.length();
    const controllable =
      dist < DRIBBLE.controlRadius && height < DRIBBLE.controlMaxHeight && relSpeed < DRIBBLE.controlMaxRelSpeed;

    if (!this.possession) {
      if (controllable && this.regainCooldown <= 0 && !this.kick) {
        this.possession = true;
        this.touchCooldown = 0;
        ball.lastTouch = p;
        // First touch: cushion the ball in front of the feet.
        const cushion = Math.min(1, relSpeed / DRIBBLE.controlMaxRelSpeed);
        this.firstTouch(cushion, time);
        this.events.emit('control', { player: p, relSpeed });
      }
      return;
    }

    if (dist > DRIBBLE.loseDistance || height > 1.0) {
      this.possession = false;
      this.events.emit('possessionLost', { player: p });
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
      // A touch: an impulse in the direction of travel, imperfect at speed.
      const sigma =
        (this.sprinting ? DRIBBLE.sprintError : DRIBBLE.jogError) + DRIBBLE.turnError * Math.min(1, this.turnRateNorm);
      const err = this.rng.gauss() * sigma;
      _dir.copy(_fwd).applyAxisAngle(UP, err);
      const margin = this.sprinting ? DRIBBLE.sprintTouchMargin : DRIBBLE.touchMargin;
      let ballSpeed = speed + margin * Math.min(1, 0.45 + speed / PLAYER.jogSpeed);
      if (behind) ballSpeed = Math.max(ballSpeed * 0.8, 1.6);
      // Pull the ball back across the body towards the line of the foot.
      const correction = THREE.MathUtils.clamp(-lateral * 3.2, -2.2, 2.2);
      _vel.copy(_dir).multiplyScalar(ballSpeed);
      _vel.x += -_fwd.z * -correction;
      _vel.z += _fwd.x * -correction;
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
    p.facing(_fwd);
    const ball = this.ball;
    const keep = 0.25 + 0.25 * (1 - cushion);
    _vel.copy(ball.velocity).multiplyScalar(keep);
    _vel.addScaledVector(p.velocity, 0.85);
    _vel.y = Math.min(_vel.y, 0.4);
    ball.kick(_vel, null, p, time);
    this.touchCooldown = 0.12;
  }

  requestKick(type, power) {
    if (this.kick) return;
    this.pending = { type, power, t: KICK.bufferTime };
    this.tryStartKick();
  }

  tryStartKick() {
    if (!this.pending || this.kick) return;
    const { dist } = this.ballRelation();
    const reachable = dist < KICK.reach && this.ball.position.y < 1.0 && !this.ball.heldBy;
    if (!reachable && this.pending.t > 0) return;
    const { type, power } = this.pending;
    this.pending = null;
    const p = this.p;
    const dir = this.kickDirection(type);
    const clip = type === 'shot' ? 'Kick_Shot' : 'Kick_Pass';
    const speedScale = type === 'shot' ? 1.05 : 1.1;
    const duration = p.anim.play(clip, { speed: speedScale, fadeIn: 0.05, fadeOut: 0.14 });
    this.kick = {
      type,
      power,
      dir,
      heading: Math.atan2(dir.x, dir.z),
      t: 0,
      contactAt: CLIP_EVENTS[clip].contact / speedScale,
      duration,
      done: false,
      whiff: !reachable,
    };
    this.lastShotPower = power;
    this.events.emit('kickStart', { type, power });
  }

  /** Shots auto-target the attacked goal when it is within ~110° of where the player can turn; passes go along input/facing. */
  kickDirection(type) {
    const p = this.p;
    const out = new THREE.Vector3();
    const facing = p.facing(new THREE.Vector3());
    const aimSource = this.hasInput ? this.moveDir : facing;
    if (type === 'pass') return out.copy(aimSource).setY(0).normalize();
    const goalX = this.attackSign * (COURT.halfLength + 0.2);
    // Vertical stick/keys steer the shot across the goal mouth.
    const aimZ = this.hasInput
      ? THREE.MathUtils.clamp(this.moveDir.z * 1.6, -1, 1) * COURT.goalHalfWidth * 0.82
      : THREE.MathUtils.clamp(-p.position.z * 0.12, -0.6, 0.6);
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
    if (k.t >= k.duration * 0.8) {
      this.kick = null;
    }
  }

  strike(k, time) {
    const p = this.p;
    const ball = this.ball;
    const { dist } = this.ballRelation();
    if (dist > KICK.reach + 0.25 || ball.position.y > 1.1 || ball.heldBy) {
      this.events.emit('whiff', { player: p });
      return;
    }
    const dir = k.dir.clone();
    _vel.set(0, 0, 0);
    _spin.set(0, 0, 0);
    if (k.type === 'shot') {
      const power = k.power;
      const sprintBonus = this.sprinting ? 1.05 : 1;
      const vh = THREE.MathUtils.lerp(KICK.shotMinSpeed, KICK.shotMaxSpeed, power) * sprintBonus;
      // Accuracy: power, run-up speed and how hard the player is turning all add error.
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
      // Topspin dips the hard shots; sidespin bends shots aimed at a post.
      _spin.copy(UP).cross(dir).multiplyScalar(18 * power);
      if (this.aimZ != null) _spin.y = -Math.sign(this.aimZ) * this.attackSign * 14 * power;
    } else {
      const vh = KICK.passSpeed + p.speed * 0.4;
      _vel.copy(dir).multiplyScalar(vh);
      _vel.y = 0.9;
      _spin.copy(UP).cross(dir).multiplyScalar(vh / BALL.radius * 0.5);
    }
    ball.kick(_vel, _spin, p, time);
    this.possession = false;
    this.regainCooldown = KICK.regainCooldown;
    this.events.emit('kick', { type: k.type, power: k.power, speed: _vel.length(), player: p });
  }
}
