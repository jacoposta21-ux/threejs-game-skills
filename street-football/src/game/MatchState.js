import * as THREE from 'three';
import { COURT, TACKLE } from '../config.js';

const _a = new THREE.Vector3();

/** Distance from point p to segment ab on the ground plane. */
export function distToSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1e-6;
  const t = THREE.MathUtils.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1);
  return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
}

/**
 * Shared match knowledge: teams, the single ball owner, pass targets and
 * spatial queries used by players, AI and the camera.
 */
export class MatchState {
  constructor(ball) {
    this.ball = ball;
    this.teams = {
      home: { id: 'home', attackSign: -1, players: [], keeper: null, ai: null },
      away: { id: 'away', attackSign: 1, players: [], keeper: null, ai: null },
    };
    this.owner = null;
    this.passTarget = null;
    this.lastPossessionTeam = 'home';
  }

  opponent(teamId) {
    return teamId === 'home' ? 'away' : 'home';
  }

  /** X of the goal a team attacks / defends. */
  attackGoalX(teamId) {
    return this.teams[teamId].attackSign * COURT.halfLength;
  }

  ownGoalX(teamId) {
    return -this.teams[teamId].attackSign * COURT.halfLength;
  }

  setOwner(ctrl) {
    this.owner = ctrl;
    this.lastPossessionTeam = ctrl.team;
    if (this.passTarget && (this.passTarget.ctrl === ctrl || this.passTarget.ctrl.team !== ctrl.team)) this.passTarget = null;
  }

  clearOwner(ctrl) {
    if (this.owner === ctrl) this.owner = null;
  }

  setPassTarget(ctrl, time) {
    this.passTarget = { ctrl, time };
  }

  /** Team in control: dribbling owner, or a keeper holding the ball. */
  get possessionTeam() {
    if (this.owner) return this.owner.team;
    const holder = this.ball.heldBy;
    if (holder) return holder.team;
    return null;
  }

  /**
   * Can `ctrl` take the ball now? Free balls: yes. A teammate's ball: no.
   * An opponent's ball: only when it has strayed from the dribbler between
   * touches and `ctrl` is closer to it than the dribbler is.
   */
  canTake(ctrl, distToBall) {
    const owner = this.owner;
    if (!owner || owner === ctrl) return true;
    if (owner.team === ctrl.team) return false;
    const b = this.ball.position;
    const ownerDist = Math.hypot(b.x - owner.p.position.x, b.z - owner.p.position.z);
    return ownerDist > TACKLE.looseTouchDistance && distToBall < ownerDist;
  }

  outfield(teamId) {
    return this.teams[teamId].players;
  }

  allOutfield() {
    return [...this.teams.home.players, ...this.teams.away.players];
  }

  /** How clear the lane from a to b is of opponents (0 blocked … 1 clear). */
  laneOpenness(a, b, teamId) {
    let min = Infinity;
    for (const o of this.outfield(this.opponent(teamId))) min = Math.min(min, distToSegment(o.p.position, a, b));
    const keeper = this.teams[this.opponent(teamId)].keeper;
    if (keeper) min = Math.min(min, distToSegment(keeper.k.position, a, b) + 0.4);
    return THREE.MathUtils.clamp((min - 0.5) / 1.8, 0, 1);
  }

  /** Nearest opponent distance to a point. */
  pressureAt(point, teamId) {
    let min = Infinity;
    for (const o of this.outfield(this.opponent(teamId))) {
      min = Math.min(min, Math.hypot(o.p.position.x - point.x, o.p.position.z - point.z));
    }
    return min;
  }

  /**
   * Best teammate to pass to. With a direction (human), candidates must lie
   * within ~65° of it; without one (AI), openness and progress decide.
   */
  choosePassTarget(ctrl, dir = null) {
    const from = ctrl.p.position;
    const attack = this.teams[ctrl.team].attackSign;
    let best = null;
    let bestScore = -Infinity;
    for (const mate of this.outfield(ctrl.team)) {
      if (mate === ctrl || mate.stagger > 0) continue;
      const tp = mate.p.position;
      _a.set(tp.x - from.x, 0, tp.z - from.z);
      const dist = _a.length();
      if (dist < 2 || dist > 22) continue;
      _a.normalize();
      const open = this.laneOpenness(from, tp, ctrl.team);
      const space = Math.min(1, this.pressureAt(tp, ctrl.team) / 4);
      const progress = ((tp.x - from.x) * attack) / 15;
      let score = open * 1.4 + space + progress * 0.6 - dist * 0.02;
      if (dir) {
        const align = _a.dot(dir);
        if (align < 0.42) continue;
        score += align * 3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }
    return best;
  }

  /** Outfield player of a team closest to a point (optionally skipping one). */
  closest(teamId, point, skip = null) {
    let best = null;
    let bd = Infinity;
    for (const c of this.outfield(teamId)) {
      if (c === skip) continue;
      const d = Math.hypot(c.p.position.x - point.x, c.p.position.z - point.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
}
