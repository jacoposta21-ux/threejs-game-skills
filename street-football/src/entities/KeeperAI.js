import * as THREE from 'three';
import { BALL, COURT, KEEPER } from '../config.js';
import { CLIP_EVENTS } from '../animation/FootballClips.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (t) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
// Feet-to-gloves length of a fully stretched keeper, and how close the ball must come to a glove to be saved.
const STRETCH = 1.95;
const GLOVE = 0.34;
const _h = new THREE.Vector3();
const _h2 = new THREE.Vector3();

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
    this.k.reach = null;
    this.k.roll = 0;
    this.k.lift = 0;
    this.vel = new THREE.Vector3();
    this.heldAt = null;
  }

  setState(state) {
    this.state = state;
    this.stateTime = 0;
  }

  /** Where a held ball sits: in the gloves during a diving catch, then gathered in to the chest. */
  holdPoint() {
    const k = this.k;
    const f = k.facing(new THREE.Vector3());
    const chest = new THREE.Vector3(k.position.x + f.x * 0.38, 1.0 + k.lift, k.position.z + f.z * 0.38);
    const inGloves = this.state === 'dive' || this.state === 'down';
    const target = inGloves ? k.handWorld('l', _h).add(k.handWorld('r', _h2)).multiplyScalar(0.5) : chest;
    if (!this.heldAt) this.heldAt = target.clone();
    else this.heldAt.lerp(target, inGloves ? 0.5 : 0.12);
    return this.heldAt.clone();
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
    this.k.reach = null;
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
    // Short adjustments are shuffled sideways with the eyes on the ball; only a
    // long way to go (rushing out, getting back) is run facing the way he moves.
    const running = gap > (this.running ? 1.0 : 1.8);
    this.running = running;
    const top = rushing ? KEEPER.moveSpeed * 1.35 : running ? KEEPER.moveSpeed : KEEPER.moveSpeed * 0.72;
    const want = gap > 0.06 ? Math.min(top, gap * 4) : 0;
    _h.set(dx, 0, dz);
    if (gap > 1e-4) _h.multiplyScalar(want / gap);
    // Velocity eases toward the target: no instant starts or stops.
    const accel = 1 - Math.exp(-dt * (running ? 7 : 9));
    this.vel.lerp(_h, accel);
    k.position.addScaledVector(this.vel, dt);
    k.velocity.copy(this.vel);
    const moving = this.vel.length();
    const desired = running && moving > 0.6 ? Math.atan2(this.vel.x, this.vel.z) : faceBall;
    const diff = wrap(desired - k.heading);
    k.heading = wrap(k.heading + THREE.MathUtils.clamp(diff, -7 * dt, 7 * dt) * Math.min(1, Math.abs(diff) * 2 + 0.25));
    // Running uses the run cycle; shuffling keeps the ready stance with quick small steps.
    k.speed = running ? moving : 0;
    if (running && moving > 0.8) k.anim.setOverlay(null, { fade: 0.18 });
    else k.anim.setOverlay('Keeper_Ready', { fade: 0.22 });
    this.shuffle = (this.shuffle ?? 0) + moving * dt * 5.5;
    k.lift = running ? 0 : 0.035 * Math.abs(Math.sin(this.shuffle)) * Math.min(1, moving / 1.2);

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
    // The save is made where the keeper stands, in front of the line: the ball gets there earlier and less far across.
    const tKeep = Math.max(0.02, (this.side * (k.position.x - this.side * 0.2 - p.x)) / vIn);
    const zk = p.z + v.z * tKeep;
    const yk = Math.max(BALL.radius, p.y + v.y * tKeep - 4.9 * tKeep * tKeep);
    const lateral = zk - k.position.z;
    const reach = Math.abs(lateral);
    const speed = v.length();
    let chance = KEEPER.saveChance[this.difficulty] ?? KEEPER.saveChance.normal;
    chance -= THREE.MathUtils.clamp((speed - 16) * 0.018, 0, 0.3);
    chance -= THREE.MathUtils.clamp((reach - 0.6) / KEEPER.diveReach, 0, 1) * 0.3;
    if (yc > 1.45) chance -= 0.12;
    if (tCross < 0.32) chance -= 0.2;
    // Facing a Gamebreaker: the keeper is a spectator.
    if (this.debuff) chance -= this.debuff;
    const success = this.rng() < THREE.MathUtils.clamp(chance, 0.05, 0.95);
    let reaction = KEEPER.reactionTime * (this.difficulty === 'hard' ? 0.75 : this.difficulty === 'easy' ? 1.35 : 1);
    // A beaten keeper guesses wrong or goes late.
    const errZ = success ? 0 : (this.rng() < 0.5 ? -1 : 1) * this.rng.range(0.55, 1.0);
    if (!success && this.rng() < 0.5) reaction += 0.12;
    // The save is timed to the ball: the gloves get to the crossing point as it arrives.
    reaction = Math.min(reaction, Math.max(0.03, tKeep - 0.24));
    this.plan = {
      at: time + reaction,
      arrive: time + tKeep,
      // Arrive a touch early so the gloves are set when the ball gets there.
      move: Math.max(0.16, tKeep - reaction - 0.03),
      zc: zk + errZ,
      yc: yk,
      success,
      catchable: success && speed < 20 && this.rng() < 0.6,
      side: Math.sign(lateral + errZ) || 1,
      needsDive: reach + Math.abs(errZ) * 0 > 0.55 || yc > 1.7,
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
    // Square up to the pitch smoothly (no snap), arms already going to the ball.
    const turn = wrap(this.fieldHeading - k.heading);
    k.heading = wrap(k.heading + THREE.MathUtils.clamp(turn, -11 * dt, 11 * dt));
    k.reach = plan.resolved && !plan.caught ? null : { target: this.ball.mesh.position, w: plan.started ? 1 : 0.35 };
    if (!plan.started) {
      // Reaction: the last of the shuffle bleeds off, weight drops ready to spring.
      this.vel.multiplyScalar(Math.exp(-dt * 10));
      k.position.addScaledVector(this.vel, dt);
      k.lift *= Math.exp(-dt * 14);
      if (time < plan.at) return;
      plan.started = true;
      plan.startZ = k.position.z;
      plan.startX = k.position.x;
      plan.t = 0;
      // Geometry of the save. A stretched keeper is STRETCH long from feet to gloves:
      // tip the body over by `roll` and slide / spring the feet so the gloves land on the ball's path.
      const need = plan.zc - plan.startZ;
      const dir = Math.sign(need) || plan.side;
      const dist = Math.abs(need);
      if (plan.needsDive) {
        const yHands = THREE.MathUtils.clamp(plan.yc, 0.25, 2.6);
        // Roll that puts the gloves at the ball's height (lower ball → flatter dive).
        let roll = Math.acos(THREE.MathUtils.clamp(yHands / STRETCH, 0.12, 1));
        // Not far to go: stay more upright and spring up instead.
        const maxRoll = Math.asin(THREE.MathUtils.clamp(dist / STRETCH + 0.25, 0, 1));
        roll = Math.min(roll, Math.max(0.35, maxRoll));
        plan.roll = roll;
        plan.dir = dir;
        plan.travel = THREE.MathUtils.clamp(dist - STRETCH * Math.sin(roll), -0.3, KEEPER.diveReach) * dir;
        plan.lift = THREE.MathUtils.clamp(yHands - STRETCH * Math.cos(roll), 0, 0.85);
        k.anim.setOverlay(null, { fade: 0.08 });
        k.anim.play('Keeper_Dive', { fadeIn: 0.1 });
        k.anim.holdOneShot(true);
      } else {
        // Within a step: move across and take it standing (jump for a high one).
        plan.roll = 0;
        plan.dir = dir;
        plan.travel = need;
        plan.lift = THREE.MathUtils.clamp(plan.yc - 1.9, 0, 0.5);
      }
      this.events.emit('keeperDive', { keeper: k });
    }
    plan.t += dt;
    const t = Math.min(1, plan.t / plan.move);
    // Push off, fly, arrive: eased at both ends.
    const e = smooth(t);
    k.position.z = plan.startZ + plan.travel * e;
    k.position.x = plan.startX - this.side * 0.25 * e;
    if (plan.needsDive) {
      // Positive roll falls to the keeper's own left, which is world +Z * side.
      k.roll = plan.dir * this.side * plan.roll * smooth(Math.min(1, t * 1.25));
      // Up through the save, then down onto the ground after it.
      const after = Math.max(0, plan.t - plan.move) / 0.28;
      k.lift = plan.lift * Math.sin(Math.min(1, t) * Math.PI * 0.5) * (1 - smooth(after));
      // Landing: the body settles flat.
      if (after > 0) k.roll = plan.dir * this.side * THREE.MathUtils.lerp(plan.roll, 1.4, smooth(after));
    } else {
      k.lift = plan.lift * Math.sin(Math.min(1, t) * Math.PI);
    }
    this.checkSave(time);
    const done = plan.needsDive ? plan.t >= plan.move + 0.28 : t >= 1 && time > plan.arrive + 0.12;
    if (done) {
      if (!plan.needsDive) {
        k.reach = null;
        const caught = plan.caught;
        this.plan = null;
        this.vel.set(0, 0, 0);
        if (this.pendingConcede) this.enterBeaten();
        else this.setState(caught ? 'hold' : 'set');
        return;
      }
      plan.roll0 = k.roll;
      this.setState('down');
    }
  }

  /** A planned save only happens when the ball actually reaches a glove (or the body). */
  checkSave(time) {
    const plan = this.plan;
    if (!plan || !plan.success || plan.resolved || !plan.started) return;
    const b = this.ball.position;
    const k = this.k;
    const dl = k.handWorld('l', _h).distanceTo(b);
    const dr = k.handWorld('r', _h2).distanceTo(b);
    // Chest / stomach: a ball straight at him is smothered.
    const body = Math.hypot(b.x - k.position.x, b.z - k.position.z) < 0.45 && b.y < 1.6 + k.lift && Math.abs(k.roll) < 0.5;
    plan.closest = Math.min(plan.closest ?? 9, dl, dr);
    if (Math.min(dl, dr) > GLOVE && !body) return;
    plan.resolved = true;
    plan.contact = body ? 0 : Math.min(dl, dr);
    plan.byBody = body;
    if (plan.catchable) {
      this.catchBall(true);
      return;
    }
    // Parry: off the glove, wide and back into play.
    const v = this.ball.velocity;
    const out = new THREE.Vector3(-this.side * (Math.abs(v.x) * 0.32 + 2), 2.5 + this.rng() * 2.5, (plan.dir || Math.sign(b.z) || 1) * (3 + this.rng() * 4));
    this.ball.kick(out, new THREE.Vector3(0, 0, 0), k, time);
    this.events.emit('save', { keeper: k, type: 'parry', contact: plan.contact });
  }

  catchBall(fromShot) {
    const owner = this.match?.owner;
    if (owner) owner.losePossession('stolen');
    this.heldAt = this.ball.position.clone();
    this.ball.hold(this);
    this.events.emit('save', { keeper: this.k, type: fromShot ? 'catch' : 'claim', contact: this.plan?.contact });
    if (this.state === 'dive' && this.plan) {
      this.plan.caught = true;
      return; // finish the save, then gather the ball
    }
    this.setState('hold');
    this.k.speed = 0;
    this.k.anim.setOverlay('Keeper_Ready', { fade: 0.2 });
  }

  updateDown() {
    const k = this.k;
    const plan = this.plan;
    // A moment on the floor, then up in one smooth movement.
    const lie = plan?.caught ? 0.35 : 0.55;
    if (this.stateTime > lie) {
      k.reach = plan?.caught ? k.reach : null;
      const t = smooth((this.stateTime - lie) / 0.5);
      k.roll = (plan?.roll0 ?? k.roll) * (1 - t);
      k.lift = 0;
      if (t >= 1) {
        k.roll = 0;
        k.reach = null;
        k.anim.holdOneShot(false);
        k.anim.stopAll();
        k.anim.setOverlay('Keeper_Ready', { fade: 0.25 });
        const caught = plan?.caught;
        this.plan = null;
        this.vel.set(0, 0, 0);
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
