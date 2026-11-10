import * as THREE from 'three';
import { AI, COURT, FORMATION } from '../config.js';

const _t = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Team-level finite-state AI for outfield players.
 *
 * Every "think" (0.2–0.42 s by difficulty) roles are reassigned from the match
 * situation:
 *   in possession  → carry (dribble / pass / shoot decisions), support runs
 *   out of possession → press the carrier, mark goal-side, cover the box
 *   loose ball     → closest chases, the rest hold shape
 *   incoming pass  → the receiver attacks the ball
 * Every physics step each role is turned into world-space intents.
 * Human-controlled players are never driven, but they count for spacing.
 */
export class TeamAI {
  constructor(match, teamId, rng) {
    this.match = match;
    this.teamId = teamId;
    this.rng = rng;
    this.difficulty = 'normal';
    this.think = 0;
    this.roles = new Map();
    this.nextDecision = new Map();
  }

  get team() {
    return this.match.teams[this.teamId];
  }

  get cfg() {
    return AI[this.difficulty] ?? AI.normal;
  }

  get attack() {
    return this.team.attackSign;
  }

  reset() {
    this.think = 0;
    this.roles.clear();
    this.nextDecision.clear();
  }

  /** World position of a formation slot, shifted toward the ball. */
  slot(f, shift = 0.35) {
    const ball = this.match.ball.position;
    const x = -this.attack * f[0] * COURT.halfLength;
    const z = f[1] * COURT.halfWidth;
    return new THREE.Vector3(x + (ball.x - x) * shift, 0, THREE.MathUtils.clamp(z + ball.z * 0.3, -COURT.halfWidth + 1, COURT.halfWidth - 1));
  }

  update(dt, time) {
    const cfg = this.cfg;
    for (const c of this.team.players) {
      c.speedFactor = (c.isHuman ? 1 : cfg.speed) * (1 + ((c.rating?.spd ?? 3) - 3) * 0.035);
      c.tackleSuccess = c.isHuman ? 0.8 : cfg.tackleSuccess;
      c.passError = c.isHuman ? 0.015 : cfg.passError;
    }
    this.think -= dt;
    if (this.think <= 0) {
      this.think = cfg.think;
      this.assignRoles(time);
    }
    for (const c of this.team.players) {
      if (c.isHuman) continue;
      c.aiIntents = this.steer(c, dt, time);
    }
  }

  assignRoles(time) {
    const m = this.match;
    const ball = m.ball.position;
    const players = this.team.players;
    const ai = players.filter((c) => !c.isHuman);
    const human = players.find((c) => c.isHuman) ?? null;
    const roles = new Map();
    const poss = m.possessionTeam;
    const dist = (c, p) => Math.hypot(c.p.position.x - p.x, c.p.position.z - p.z);

    // An incoming pass overrides everything for its receiver.
    const pt = m.passTarget;
    if (pt && !m.owner && !m.ball.heldBy && pt.ctrl.team === this.teamId && time - pt.time < 2.5 && !pt.ctrl.isHuman) {
      roles.set(pt.ctrl, { type: 'receive' });
    }

    // One-two: the passer bursts into the space behind the defence for the return ball.
    const run = m.giveGo;
    if (run && run.runner.team === this.teamId && time < run.until && !run.runner.isHuman && !roles.has(run.runner)) {
      const rp = run.runner.p.position;
      const target = new THREE.Vector3(
        THREE.MathUtils.clamp(rp.x + this.attack * 7, -COURT.halfLength + 2, COURT.halfLength - 2), 0, rp.z * 0.8,
      );
      roles.set(run.runner, { type: 'support', target });
    }

    if (poss === this.teamId) {
      const carrier = m.owner;
      if (carrier && !carrier.isHuman) roles.set(carrier, { type: 'carry' });
      // Two support spots: an advanced run on the far side and a recycling option.
      const far = ball.z > 0 ? -1 : 1;
      const spots = [
        new THREE.Vector3(ball.x + this.attack * 5.5, 0, far * 4.5),
        new THREE.Vector3(ball.x - this.attack * 3.5, 0, ball.z + far * 3.5),
      ].map((s) => {
        s.x = THREE.MathUtils.clamp(s.x, -COURT.halfLength + 2, COURT.halfLength - 2);
        s.z = THREE.MathUtils.clamp(s.z, -COURT.halfWidth + 1.2, COURT.halfWidth - 1.2);
        return s;
      });
      const free = players.filter((c) => c !== carrier && !roles.has(c));
      // The human takes whichever spot is nearest them; AI fill the rest.
      if (human && free.includes(human)) {
        spots.sort((a, b) => dist(human, a) - dist(human, b));
        spots.shift();
      }
      for (const c of free) {
        if (c.isHuman) continue;
        spots.sort((a, b) => dist(c, a) - dist(c, b));
        const target = spots.shift() ?? this.slot(FORMATION.attack[1]);
        roles.set(c, { type: 'support', target });
      }
    } else if (poss === m.opponent(this.teamId)) {
      const carrier = m.owner;
      const anchor = carrier ? carrier.p.position : ball;
      const ranked = [...ai].filter((c) => !roles.has(c)).sort((a, b) => dist(a, anchor) - dist(b, anchor));
      const humanPresses = human && ranked.length && dist(human, anchor) < dist(ranked[0], anchor) * 0.85;
      const opponents = m.outfield(m.opponent(this.teamId)).filter((o) => o !== carrier);
      // Most dangerous opponents first: closest to our goal.
      const ownGoal = m.ownGoalX(this.teamId);
      opponents.sort((a, b) => Math.abs(a.p.position.x - ownGoal) - Math.abs(b.p.position.x - ownGoal));
      let idx = 0;
      for (const c of ranked) {
        if (idx === 0 && !humanPresses && carrier && dist(c, anchor) < this.cfg.pressDistance + 6) {
          roles.set(c, { type: 'press', carrier });
        } else {
          const mark = opponents.shift();
          roles.set(c, mark ? { type: 'mark', opp: mark } : { type: 'cover' });
        }
        idx += 1;
      }
      // Keeper holding the ball: drop into shape.
      if (!carrier) for (const c of ai) if (!roles.has(c) || roles.get(c).type === 'press') roles.set(c, { type: 'shape', target: this.slot(FORMATION.defend[ai.indexOf(c) % 3], 0.2) });
    } else {
      // Loose ball: the AI player who can get there first goes; others shape up.
      const ranked = [...ai].filter((c) => !roles.has(c) && c.stagger <= 0).sort((a, b) => dist(a, ball) - dist(b, ball));
      const chaser = ranked[0];
      const humanCloser = human && chaser && dist(human, ball) < dist(chaser, ball) * 0.8;
      const shape = m.lastPossessionTeam === this.teamId ? FORMATION.attack : FORMATION.defend;
      ai.forEach((c, i) => {
        if (roles.has(c)) return;
        if (c === chaser && !humanCloser) roles.set(c, { type: 'chase' });
        else roles.set(c, { type: 'shape', target: this.slot(shape[(i + 1) % 3]) });
      });
    }
    this.roles = roles;
  }

  steer(c, dt, time) {
    const m = this.match;
    const role = this.roles.get(c) ?? { type: 'shape', target: this.slot(FORMATION.defend[this.team.players.indexOf(c) % 3]) };
    const ball = m.ball.position;
    const pos = c.p.position;
    const out = { world: true, worldX: 0, worldZ: 0, sprint: false, faceX: ball.x - pos.x, faceZ: ball.z - pos.z };
    // Wrong-footed by a trick: stumble the way they bit, no tackling.
    if (c.fooled > 0) {
      out.worldX = c.fooledDir.x * 0.55;
      out.worldZ = c.fooledDir.z * 0.55;
      out.faceX = c.fooledDir.x;
      out.faceZ = c.fooledDir.z;
      return out;
    }
    let target = null;
    let sprintBeyond = 7;

    // Hard: a ball dropping within reach inside shooting range is hit first time (volley / bicycle).
    if (this.cfg.advanced && !m.owner && !m.ball.heldBy && !m.ball.grounded && !c.busy && !c.pending && ball.y > 0.7) {
      const goalX = m.attackGoalX(this.teamId);
      const db = Math.hypot(ball.x - pos.x, ball.z - pos.z);
      if (db < 2.4 && Math.abs(goalX - pos.x) < 9 && m.ball.velocity.y < 1 && m.ball.lastKickTime !== this.aerialSeen) {
        // One decision per ball flight: sometimes he brings it down instead.
        this.aerialSeen = m.ball.lastKickTime;
        if (this.rng() > 0.55) return this.arrive(c, out, _t.set(ball.x, 0, ball.z), 3);
        const side = this.rng() < 0.5 ? -1 : 1;
        c.requestKick('shot', 0.8, { aimZ: side * COURT.goalHalfWidth * this.rng.range(0.3, 0.8) });
      }
    }

    switch (role.type) {
      case 'carry':
        return this.carry(c, out, time);
      case 'receive': {
        const v = m.ball.velocity;
        target = _t.set(ball.x + v.x * 0.3, 0, ball.z + v.z * 0.3);
        sprintBeyond = 2.5;
        break;
      }
      case 'chase': {
        const v = m.ball.velocity;
        const d = Math.hypot(ball.x - pos.x, ball.z - pos.z);
        const lead = Math.min(0.7, d / 8);
        target = _t.set(ball.x + v.x * lead, 0, ball.z + v.z * lead);
        sprintBeyond = 3.5;
        break;
      }
      case 'press': {
        const cp = role.carrier.p.position;
        const goalX = m.ownGoalX(this.teamId);
        _d.set(goalX - cp.x, 0, -cp.z).normalize();
        // Goal-side of the carrier, closing down onto the ball.
        const d = Math.hypot(cp.x - pos.x, cp.z - pos.z);
        const standOff = d > 2.5 ? 1.0 : 0.35;
        target = _t.set(cp.x + _d.x * standOff + (ball.x - cp.x) * 0.5, 0, cp.z + _d.z * standOff + (ball.z - cp.z) * 0.5);
        sprintBeyond = 3;
        // Tackle only when the ball will be inside the lunge at the contact frame.
        if (!c.busy && this.tackleInReach(c) && this.rng() < this.cfg.tackleRate * dt * 4) c.requestTackle();
        // Hard: a carrier getting away at pace is brought down with a slide.
        else if (this.cfg.advanced && !c.busy && c.fooled <= 0 && role.carrier.p.speed > 4.5 && this.slideInReach(c) && this.rng() < 1.2 * dt) c.requestTackle({ slide: true });
        break;
      }
      case 'mark': {
        const op = role.opp.p.position;
        const goalX = m.ownGoalX(this.teamId);
        _d.set(goalX - op.x, 0, -op.z).normalize();
        target = _t.set(op.x + _d.x * 1.4, 0, op.z + _d.z * 1.4);
        // Lean into the passing lane between the ball and the man.
        target.x += (ball.x - target.x) * 0.22;
        target.z += (ball.z - target.z) * 0.22;
        sprintBeyond = 5;
        // Loose ball nearby: go and win it.
        if (!m.owner && Math.hypot(ball.x - pos.x, ball.z - pos.z) < 2.2) target = _t.set(ball.x, 0, ball.z);
        break;
      }
      case 'cover': {
        const goalX = m.ownGoalX(this.teamId);
        target = _t.set(ball.x + (goalX - ball.x) * 0.55, 0, ball.z * 0.45);
        break;
      }
      default:
        target = _t.copy(role.target ?? this.slot(FORMATION.defend[0]));
        sprintBeyond = 8;
        break;
    }
    return this.arrive(c, out, target, sprintBeyond);
  }

  /** Predicted ball position at the tackle's contact frame vs. the lunge's reach. */
  tackleInReach(c) {
    const ball = this.match.ball;
    if (ball.position.y > 0.5) return false;
    const t = 0.2;
    const bx = ball.position.x + ball.velocity.x * t;
    const bz = ball.position.z + ball.velocity.z * t;
    const pos = c.p.position;
    const d = Math.hypot(bx - pos.x, bz - pos.z);
    // Foot reaches ~0.75 m ahead plus ~0.7 m of lunge travel.
    return d > 0.5 && d < 1.45;
  }

  /** A slide reaches further: the ball must be ahead of the tackler along his run when he gets there. */
  slideInReach(c) {
    const ball = this.match.ball;
    if (ball.position.y > 0.5) return false;
    const t = 0.3;
    const pos = c.p.position;
    const bx = ball.position.x + ball.velocity.x * t - pos.x;
    const bz = ball.position.z + ball.velocity.z * t - pos.z;
    const d = Math.hypot(bx, bz);
    if (d < 1.5 || d > 3.2) return false;
    const f = c.p.facing(_d);
    return (bx * f.x + bz * f.z) / d > 0.9;
  }

  arrive(c, out, target, sprintBeyond) {
    const pos = c.p.position;
    _d.set(target.x - pos.x, 0, target.z - pos.z);
    // Keep teammates apart so they do not stack on one spot.
    for (const mate of this.team.players) {
      if (mate === c) continue;
      const dx = pos.x - mate.p.position.x;
      const dz = pos.z - mate.p.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && d > 1e-3) {
        const push = (2.4 - d) * 1.3;
        _d.x += (dx / d) * push;
        _d.z += (dz / d) * push;
      }
    }
    const d = _d.length();
    if (d < 0.45) return out;
    const mag = THREE.MathUtils.clamp(d / 2.2, 0.3, 1);
    out.worldX = (_d.x / d) * mag;
    out.worldZ = (_d.z / d) * mag;
    out.sprint = d > sprintBeyond && c.stamina > 0.25;
    return out;
  }

  /** The AI ball carrier: shoot, pass, or dribble at goal away from pressure. */
  carry(c, out, time) {
    const m = this.match;
    const cfg = this.cfg;
    const pos = c.p.position;
    const goalX = m.attackGoalX(this.teamId);
    const distGoal = Math.hypot(goalX - pos.x, pos.z);
    const facing = c.p.facing(new THREE.Vector3());

    // Pressure ahead.
    let nearest = null;
    let nd = Infinity;
    for (const o of m.outfield(m.opponent(this.teamId))) {
      const d = Math.hypot(o.p.position.x - pos.x, o.p.position.z - pos.z);
      if (d < nd) {
        nd = d;
        nearest = o;
      }
    }

    if (c.possession && !c.busy && time >= (this.nextDecision.get(c) ?? 0)) {
      this.nextDecision.set(c, time + cfg.think);
      const goalPoint = new THREE.Vector3(goalX, 0, 0);
      const laneToGoal = m.laneOpenness(pos, goalPoint, this.teamId);
      const angleOk = Math.abs(pos.z) < COURT.halfWidth * 0.75;
      if (angleOk && (distGoal < 5.5 || (distGoal < cfg.shootRange && laneToGoal > 0.25 && this.rng() < 0.7))) {
        const keeper = m.teams[m.opponent(this.teamId)].keeper;
        const kz = keeper ? keeper.k.position.z : 0;
        const side = Math.abs(kz) > 0.15 ? -Math.sign(kz) : this.rng() < 0.5 ? -1 : 1;
        const aimZ = side * COURT.goalHalfWidth * this.rng.range(0.45, 0.85);
        const power = THREE.MathUtils.clamp(0.42 + distGoal * 0.035 + this.rng() * 0.15, 0.4, 0.95);
        c.requestKick('shot', power, { aimZ });
        return out;
      }
      // Pressed from the front: sometimes try to beat the defender with a move.
      if (nearest && nd < 2.3) {
        const rel = new THREE.Vector3(nearest.p.position.x - pos.x, 0, nearest.p.position.z - pos.z);
        if (rel.dot(facing) > 0.3 && this.rng() < cfg.trickRate) {
          const kinds = ['stepover', 'feint', 'cut', 'roulette', 'stepover', 'feint'];
          if (cfg.advanced) {
            kinds.push('elastico', 'elastico', 'dragback');
            // Defender square in front and close: go through or over him.
            const lateral = Math.abs(rel.x * facing.z - rel.z * facing.x);
            if (nd < 1.9 && lateral < 0.6 && rel.dot(facing) / nd > 0.8) kinds.push('nutmeg', 'sombrero', 'sombrero', c.p.speed > 5 ? 'rainbow' : 'nutmeg');
          }
          const kind = kinds[Math.floor(this.rng() * kinds.length)];
          if (c.requestTrick(kind, 0)) return out;
        }
      }
      const pressured = nearest && nd < 1.9;
      if (pressured || this.rng() < 0.12) {
        const target = m.choosePassTarget(c);
        const lane = target ? m.laneOpenness(pos, target.p.position, this.teamId) : 0;
        if (target && lane > 0.25) {
          // Hard: a mate running in behind gets the ball played into his path.
          const tp = target.p;
          const ahead = (tp.position.x - pos.x) * this.attack;
          const through = !!cfg.advanced && ahead > 2 && tp.velocity.x * this.attack > 2.5 && Math.abs(goalX - tp.position.x) > 5;
          c.requestKick('pass', 0.5, { target, through });
          return out;
        }
        // Hard: the lane on the ground is shut but the mate is free — float it over.
        if (cfg.advanced && target && pressured && time > (this.nextLob ?? 0) && this.rng() < 0.3) {
          this.nextLob = time + 7;
          const d = Math.hypot(target.p.position.x - pos.x, target.p.position.z - pos.z);
          if (d > 5 && d < 15 && m.pressureAt(target.p.position, this.teamId) > 2.5) {
            c.requestKick('pass', 0.5, { target, lob: true });
            return out;
          }
        }
      }
    }

    // Dribble at goal, bending away from the nearest defender in front.
    _d.set(goalX - pos.x, 0, -pos.z * 0.6);
    _d.normalize();
    if (nearest && nd < 3.2) {
      const op = nearest.p.position;
      const rel = new THREE.Vector3(op.x - pos.x, 0, op.z - pos.z);
      if (rel.dot(_d) > 0) {
        // Side-step to whichever side has more room.
        const left = new THREE.Vector3(_d.z, 0, -_d.x);
        let side = rel.dot(left) > 0 ? -1 : 1;
        if (Math.abs(pos.z) > COURT.halfWidth - 2) side = Math.sign(-pos.z * left.z) || side;
        _d.addScaledVector(left, side * (1.4 - nd * 0.3));
        _d.normalize();
      }
    }
    out.worldX = _d.x;
    out.worldZ = _d.z;
    out.sprint = (!nearest || nd > 4) && c.stamina > 0.35 && distGoal > 7;
    out.faceX = facing.x;
    out.faceZ = facing.z;
    return out;
  }
}
