import * as THREE from 'three';
import { BALL, COURT, KEEPER } from '../config.js';
import { CLIP_EVENTS } from '../animation/FootballClips.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const easeOut = (t) => 1 - (1 - t) * (1 - t);

/**
 * Finite-state goalkeeper. `side` is the sign of the defended goal's X.
 * Coordinates are mirrored through `side`, so the same logic serves either end.
 *   set   — angle the ball, run (never side-slide) to the spot, then face play
 *   dive  — committed save attempt toward the predicted crossing point
 *   down  — on the floor after a dive, then gets up
 *   hold  — ball in hands
 *   throw — underarm roll-out back into play
 *   beaten — dejected after conceding
 */
export class KeeperAI {
  constructor(footballer, ball, events, rng, side = -1, match = null) {
    this.k = footballer;
    this.match = match;
    this.team = footballer.team;
    this.ball = ball;
    this.events = events;
    this.rng = rng;
    this.side = side;
    this.goalX = side * COURT.halfLength;
    this.fieldHeading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.difficulty = 'normal';
    this.reset();
  }

  get homeX() {
    return this.goalX - this.side * KEEPER.lineOffset;
  }

  reset() {
    this.pendingConcede = false;
    this.state = 'set';
    this.stateTime = 0;
    this.shotId = null;
    this.plan = null;
    this.k.teleport(this.homeX, 0, this.fieldHeading);
    this.k.anim.stopAll();
    this.k.anim.setOverlay('Keeper_Ready', { fade: 0.01 });
    this.k.setGhost(false);
  }

  setState(state) {
    this.state = state;
    this.stateTime = 0;
  }

  holdPoint() {
    const f = this.k.facing(new THREE.Vector3());
    return new THREE.Vector3(this.k.position.x + f.x * 0.38, 1.0, this.k.position.z + f.z * 0.38);
  }

  concede() {
    // A beaten keeper on the floor finishes the dive and gets up first.
    if (this.state === 'down' || (this.state === 'dive' && this.plan?.started && this.plan.needsDive)) {
      this.pendingConcede = true;
      if (this.plan) this.plan.success = false;
      return;
    }
    this.enterBeaten();
  }

  /** React to a fake shot near goal. */
  bite(z, time) {
    if (this.state !== 'set') return;
    this.biteZ = z;
    this.biteUntil = time + 0.85;
  }

  enterBeaten() {
    this.pendingConcede = false;
    this.setState('beaten');
    this.k.roll = 0;
    this.k.lift = 0;
    this.k.anim.stopAll();
    this.k.anim.setOverlay('Dejected', { fade: 0.3 });
  }

  update(dt, time) {
    const k = this.k;
    k.beginStep();
    this.stateTime += dt;
    switch (this.state) {
      case 'set':
        this.updateSet(dt, time);
        break;
      case 'dive':
        this.updateDive(dt, time);
        break;
      case 'down':
        this.updateDown(dt);
        break;
      case 'hold':
        this.updateHold(dt);
        break;
      case 'throw':
        this.updateThrow(dt, time);
        break;
      case 'beaten':
        k.speed = Math.max(0, k.speed - 6 * dt);
        break;
      default:
        break;
    }
    k.commitStep();
  }

  updateSet(dt, time) {
    const k = this.k;
    const b = this.ball.position;
    const v = this.ball.velocity;
    // Spot on the line between ball and goal centre.
    const depth = Math.max(0.5, this.side * (this.goalX - b.x));
    let tz = b.z * (KEEPER.lineOffset / (depth + KEEPER.lineOffset));
    const dist = Math.hypot(this.goalX - b.x, b.z);
    tz = THREE.MathUtils.clamp(tz, -COURT.goalHalfWidth + 0.35, COURT.goalHalfWidth - 0.35);
    const stepOut = THREE.MathUtils.clamp((9 - dist) * 0.12, 0, 1.0);
    let tx = this.homeX - this.side * stepOut;
    // 1-v-1: an opponent dribbling into the area — rush out and smother.
    const owner = this.match?.owner;
    const rushing = owner && owner.team !== this.team && dist < 6.5 && Math.abs(b.z) < COURT.goalHalfWidth + 2.5;
    if (rushing) {
      tx = b.x;
      tz = b.z;
    }
    // Bought a fake shot: shuffles the wrong way for a moment.
    if (time < (this.biteUntil ?? 0)) tz = THREE.MathUtils.clamp(tz + this.biteZ, -COURT.goalHalfWidth, COURT.goalHalfWidth);

    const dx = tx - k.position.x;
    const dz = tz - k.position.z;
    const gap = Math.hypot(dx, dz);
    const faceBall = Math.atan2(b.x - k.position.x, b.z - k.position.z);
    let targetSpeed = 0;
    let desired = faceBall;
    if (gap > 0.35) {
      targetSpeed = Math.min(rushing ? KEEPER.moveSpeed * 1.35 : KEEPER.moveSpeed, gap * 3.2);
      desired = Math.atan2(dx, dz);
    }
    const diff = wrap(desired - k.heading);
    k.heading = wrap(k.heading + THREE.MathUtils.clamp(diff, -9 * dt, 9 * dt));
    // Only move once roughly facing the move direction: feet always carry the body.
    const aligned = Math.cos(diff) > 0.7;
    const want = aligned ? targetSpeed : 0;
    k.speed += THREE.MathUtils.clamp(want - k.speed, -14 * dt, 10 * dt);
    const f = k.facing(new THREE.Vector3());
    k.position.addScaledVector(f, k.speed * dt);
    k.velocity.copy(f).multiplyScalar(k.speed);
    // Stance overlay only when settled.
    if (k.speed < 0.3 && gap <= 0.35) k.anim.setOverlay('Keeper_Ready', { fade: 0.2 });
    else if (k.speed > 0.5) k.anim.setOverlay(null, { fade: 0.15 });

    // Loose ball in the area: claim it.
    const near = Math.hypot(b.x - k.position.x, b.z - k.position.z);
    const speed = Math.hypot(v.x, v.z);
    const teammateHasIt = owner && owner.team === this.team;
    const claimRadius = rushing ? 1.15 : 0.9;
    const claimSpeed = rushing ? 9.5 : 6;
    if (!teammateHasIt && near < claimRadius && b.y < 1.6 && speed < claimSpeed && this.ball.lastKickTime < time - 0.12) {
      this.catchBall(false);
      return;
    }
    this.readShot(time);
  }

  /** Predict whether the ball will cross the goal line on target and plan a save. */
  readShot(time) {
    const ball = this.ball;
    const p = ball.position;
    const v = ball.velocity;
    const vIn = this.side * v.x;
    if (vIn < 5 || ball.lastKickTime === this.shotId) return;
    const tCross = (this.side * (this.goalX - p.x)) / vIn;
    if (tCross < 0 || tCross > 1.2) return;
    const zc = p.z + v.z * tCross;
    const yc = Math.max(BALL.radius, p.y + v.y * tCross - 4.9 * tCross * tCross);
    this.shotId = ball.lastKickTime;
    const onTarget = Math.abs(zc) < COURT.goalHalfWidth + 0.15 && yc < COURT.goalHeight + 0.2;
    if (!onTarget) return;
    const k = this.k;
    const lateral = zc - k.position.z;
    const reach = Math.abs(lateral);
    const speed = v.length();
    let chance = KEEPER.saveChance[this.difficulty] ?? KEEPER.saveChance.normal;
    chance -= THREE.MathUtils.clamp((speed - 16) * 0.018, 0, 0.3);
    chance -= THREE.MathUtils.clamp((reach - 0.6) / KEEPER.diveReach, 0, 1) * 0.3;
    if (yc > 1.45) chance -= 0.12;
    if (tCross < 0.32) chance -= 0.2;
    const success = this.rng() < THREE.MathUtils.clamp(chance, 0.05, 0.95);
    const reaction = KEEPER.reactionTime * (this.difficulty === 'hard' ? 0.75 : this.difficulty === 'easy' ? 1.35 : 1);
    // A beaten keeper guesses wrong or goes late.
    const errZ = success ? 0 : (this.rng() < 0.5 ? -1 : 1) * this.rng.range(0.55, 1.0);
    this.plan = {
      at: time + reaction,
      zc: zc + errZ,
      yc,
      success,
      catchable: success && speed < 20 && this.rng() < 0.6,
      side: Math.sign(lateral + errZ) || 1,
      needsDive: reach > 0.45 || yc > 1.6,
    };
    this.setState('dive');
    this.k.speed = 0;
  }

  updateDive(dt, time) {
    const k = this.k;
    const plan = this.plan;
    if (!plan) {
      this.setState('set');
      return;
    }
    if (!plan.started) {
      // Reaction delay: hold the set position, face play.
      if (time < plan.at) return;
      plan.started = true;
      plan.startZ = k.position.z;
      plan.startX = k.position.x;
      plan.t = 0;
      k.heading = this.fieldHeading;
      if (plan.needsDive) {
        k.anim.setOverlay(null, { fade: 0.05 });
        k.anim.play('Keeper_Dive', { fadeIn: 0.08 });
        k.anim.holdOneShot(true);
      }
      this.events.emit('keeperDive', { keeper: k });
    }
    plan.t += dt;
    const t = Math.min(1, plan.t / KEEPER.diveTime);
    const reachZ = THREE.MathUtils.clamp(plan.zc - plan.startZ, -KEEPER.diveReach, KEEPER.diveReach);
    k.position.z = plan.startZ + reachZ * easeOut(t);
    k.position.x = plan.startX - this.side * 0.25 * easeOut(t);
    if (plan.needsDive) {
      // Roll toward the dive side; rise for high balls, land by the end.
      // Positive roll falls to the keeper's own left, which is world +Z * side.
      const dir = Math.sign(reachZ) || plan.side;
      k.roll = dir * this.side * 1.35 * easeOut(Math.min(1, t * 1.6));
      const peak = THREE.MathUtils.clamp((plan.yc - 0.9) * 0.6, 0, 0.75);
      k.lift = Math.sin(Math.min(1, t) * Math.PI) * peak;
    }
    this.checkSave(time);
    if (t >= 1) {
      this.setState(plan.needsDive ? 'down' : 'set');
      if (!plan.needsDive) this.plan = null;
    }
  }

  /** When the ball arrives at the gloves on a planned save, catch or parry it. */
  checkSave(time) {
    const plan = this.plan;
    if (!plan || !plan.success || plan.resolved) return;
    const b = this.ball.position;
    const k = this.k;
    const hands = new THREE.Vector3(k.position.x, 0.9 + k.lift, k.position.z);
    if (plan.needsDive) hands.z += Math.sign(k.position.z - plan.startZ) * 0.6;
    const d = Math.hypot(b.x - hands.x, (b.y - Math.min(plan.yc, 2)) * 0.6, b.z - hands.z);
    if (d > 1.15 || this.side * (k.position.x - b.x) > 1.2) return;
    plan.resolved = true;
    if (plan.catchable) {
      this.catchBall(true);
      return;
    }
    // Parry: push the ball wide and back into play.
    const v = this.ball.velocity;
    const out = new THREE.Vector3(-this.side * (Math.abs(v.x) * 0.32 + 2), 2.5 + this.rng() * 2.5, (Math.sign(b.z) || 1) * (3 + this.rng() * 4));
    this.ball.kick(out, new THREE.Vector3(0, 0, 0), k, time);
    this.events.emit('save', { keeper: k, type: 'parry' });
  }

  catchBall(fromShot) {
    const owner = this.match?.owner;
    if (owner) owner.losePossession('stolen');
    this.ball.hold(this);
    this.events.emit('save', { keeper: this.k, type: fromShot ? 'catch' : 'claim' });
    if (this.state === 'dive' && this.plan?.needsDive) {
      this.plan.caught = true;
      return; // finish the dive, then get up holding the ball
    }
    this.setState('hold');
    this.k.speed = 0;
    this.k.anim.setOverlay('Keeper_Ready', { fade: 0.2 });
  }

  updateDown(dt) {
    const k = this.k;
    if (this.stateTime > 0.75) {
      // Get up: unroll over 0.4 s.
      const t = Math.min(1, (this.stateTime - 0.75) / 0.4);
      k.roll *= 1 - t;
      k.lift *= 1 - t;
      if (t >= 1) {
        k.roll = 0;
        k.lift = 0;
        k.anim.holdOneShot(false);
        k.anim.stopAll();
        k.anim.setOverlay('Keeper_Ready', { fade: 0.15 });
        const caught = this.plan?.caught;
        this.plan = null;
        if (this.pendingConcede) this.enterBeaten();
        else this.setState(caught ? 'hold' : 'set');
      }
    }
  }

  updateHold() {
    const k = this.k;
    const faceField = this.fieldHeading;
    k.heading = wrap(k.heading + THREE.MathUtils.clamp(wrap(faceField - k.heading), -0.15, 0.15));
    if (this.stateTime > KEEPER.holdTime) {
      this.setState('throw');
      const speed = 1.1;
      k.anim.setOverlay(null, { fade: 0.1 });
      this.throwDuration = k.anim.play('Keeper_Throw', { speed });
      this.releaseAt = CLIP_EVENTS.Keeper_Throw.release / speed;
      this.released = false;
    }
  }

  pickThrowTarget(from) {
    if (!this.match) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const mate of this.match.outfield(this.team)) {
      const tp = mate.p.position;
      const dist = Math.hypot(tp.x - from.x, tp.z - from.z);
      if (dist < 3 || dist > 20) continue;
      const score = this.match.laneOpenness(from, tp, this.team) * 1.5 + Math.min(1, this.match.pressureAt(tp, this.team) / 4) - dist * 0.03;
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }
    return best;
  }

  updateThrow(dt, time) {
    if (!this.released && this.stateTime >= this.releaseAt) {
      this.released = true;
      // Distribute to the most open teammate; otherwise roll it wide.
      const p = this.holdPoint();
      const target = this.pickThrowTarget(p);
      let dir;
      let speed = 9.5;
      if (target) {
        const tp = target.p.position;
        const lead = { x: tp.x + target.p.velocity.x * 0.5, z: tp.z + target.p.velocity.z * 0.5 };
        dir = new THREE.Vector3(lead.x - p.x, 0, lead.z - p.z);
        speed = THREE.MathUtils.clamp(5 + dir.length() * 0.75, 7, 14);
        dir.normalize();
        this.match.setPassTarget(target, time);
      } else {
        dir = new THREE.Vector3(-this.side * 9, 0, this.rng.range(-5, 5) - this.k.position.z).normalize();
      }
      this.ball.release();
      this.ball.body.setTranslation({ x: p.x - this.side * 0.3, y: 0.25, z: p.z }, true);
      this.ball.kick(new THREE.Vector3(dir.x * speed, 0.6, dir.z * speed), null, this.k, time);
      this.events.emit('keeperThrow', { keeper: this.k });
    }
    if (this.stateTime >= this.throwDuration) {
      this.setState('set');
      this.k.anim.setOverlay('Keeper_Ready', { fade: 0.2 });
    }
  }
}
