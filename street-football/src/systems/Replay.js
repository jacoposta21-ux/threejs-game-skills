import * as THREE from 'three';
import { COURT } from '../config.js';

const RATE = 30; // recorded frames per second
const SECONDS = 4.5;
const MAX = Math.ceil(RATE * SECONDS);

const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();

/**
 * Instant replay. While playing, a ring buffer records the ball, every
 * footballer's transform and full skeletal pose at 30 Hz. After a goal the
 * build-up and finish play back (interpolated between frames) with a speed
 * ramp that drops into deep slow motion around the strike — found from the
 * jump in recorded ball speed — and three cuts: a low dolly beside the
 * shooter's run, a locked-off shot over their shoulder at the strike, and the
 * reverse angle from behind the net as it goes in.
 */
export class Replay {
  constructor(footballers, ball, camera) {
    this.actors = footballers.map((f) => ({
      f,
      bones: [...f.character.bones.values()],
      posBones: [f.character.bones.get('root'), f.character.bones.get('pelvis')],
    }));
    this.ball = ball;
    this.camera = camera;
    this.bonesPer = this.actors.map((a) => a.bones.length);
    // Per frame: ball (pos 3 + quat 4) + per actor: holder pos 3 + quat 4 + bones × quat 4 + pelvis/root positions 2 × 3.
    this.frameSize = 7 + this.actors.reduce((s, a) => s + 7 + a.bones.length * 4 + 6, 0);
    this.buffer = new Float32Array(MAX * this.frameSize);
    this.count = 0;
    this.head = 0;
    this.accum = 0;
    this.playing = false;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
  }

  clear() {
    this.count = 0;
    this.head = 0;
    this.accum = 0;
  }

  record(dt) {
    this.accum += dt;
    if (this.accum < 1 / RATE) return;
    this.accum %= 1 / RATE;
    const b = this.buffer;
    let o = this.head * this.frameSize;
    const m = this.ball.mesh;
    b.set([m.position.x, m.position.y, m.position.z, m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w], o);
    o += 7;
    for (const a of this.actors) {
      const h = a.f.holder;
      b[o++] = h.position.x;
      b[o++] = h.position.y;
      b[o++] = h.position.z;
      b[o++] = h.quaternion.x;
      b[o++] = h.quaternion.y;
      b[o++] = h.quaternion.z;
      b[o++] = h.quaternion.w;
      for (const bone of a.bones) {
        b[o++] = bone.quaternion.x;
        b[o++] = bone.quaternion.y;
        b[o++] = bone.quaternion.z;
        b[o++] = bone.quaternion.w;
      }
      for (const bone of a.posBones) {
        b[o++] = bone.position.x;
        b[o++] = bone.position.y;
        b[o++] = bone.position.z;
      }
    }
    this.head = (this.head + 1) % MAX;
    this.count = Math.min(MAX, this.count + 1);
  }

  get available() {
    return this.count > RATE;
  }

  /** Ball position of recorded frame i (0 = oldest) into out. */
  ballAt(i, out) {
    const o = this.frameOffset(i);
    return out.set(this.buffer[o], this.buffer[o + 1], this.buffer[o + 2]);
  }

  /** Holder position of actor a at recorded frame i. */
  actorAt(a, i, out) {
    let o = this.frameOffset(i) + 7;
    for (let k = 0; k < a; k += 1) o += 7 + this.bonesPer[k] * 4 + 6;
    return out.set(this.buffer[o], this.buffer[o + 1], this.buffer[o + 2]);
  }

  /** The frame the decisive strike left the boot: the last sudden jump in ball speed. */
  findShotFrame() {
    let shot = -1; // last strong strike
    let weak = -1; // biggest speed jump, if nothing qualifies as a strike
    let weakJump = 0;
    let prev = 0;
    for (let i = 1; i < this.frames; i += 1) {
      const v = this.ballAt(i, _v1).distanceTo(this.ballAt(i - 1, _v0)) * RATE;
      const jump = v - prev;
      if (v > 9 && jump > 5) shot = i - 1;
      if (jump > weakJump) {
        weakJump = jump;
        weak = i - 1;
      }
      prev = v;
    }
    if (shot >= 0) return shot;
    return weak >= 0 ? weak : Math.floor(this.frames * 0.6);
  }

  /**
   * Begin playback of the recorded window.
   * goalX: the goal line scored into. scorer: the Footballer credited (optional).
   */
  start(goalX, { scorer = null, onCut = null } = {}) {
    this.playing = true;
    this.t = 0;
    this.frames = this.count;
    this.goalX = goalX;
    this.onCut = onCut;
    this.oldest = (this.head - this.count + MAX) % MAX;
    this.shot = this.findShotFrame();
    // Find the shooter: the credited scorer if recorded, else whoever was nearest the ball at the strike.
    this.ballAt(this.shot, _v0);
    let shooter = this.actors.findIndex((a) => a.f === scorer);
    if (shooter < 0) {
      let bd = Infinity;
      this.actors.forEach((a, i) => {
        const d = this.actorAt(i, this.shot, _v1).distanceTo(_v0);
        if (d < bd) {
          bd = d;
          shooter = i;
        }
      });
    }
    this.shooter = Math.max(0, shooter);
    this.shooterAtShot = this.actorAt(this.shooter, this.shot, new THREE.Vector3());
    this.ballAtShot = _v0.clone();
    // Shot direction (ground), from a few frames after the strike.
    this.ballAt(Math.min(this.frames - 1, this.shot + 4), _v1);
    this.shotDir = _v1.clone().sub(this.ballAtShot).setY(0);
    if (this.shotDir.lengthSq() < 1e-4) this.shotDir.set(Math.sign(goalX) || -1, 0, 0);
    this.shotDir.normalize();
    // Shoulder side: the one facing the middle of the court, so the fence never blocks the view.
    // The camera sits at side × (d.z, −d.x) from the shooter; pick the sign pointing at the court centre.
    const sa = this.shooterAtShot;
    this.shotSide = Math.sign(-(this.shotDir.z * sa.x) + this.shotDir.x * sa.z) || 1;
    // Lead-in: the build-up before the strike, up to 2.6 s of it.
    this.frameF = Math.max(0, this.shot - RATE * 2.6);
    this.endFrame = this.frames - 1;
    this.cut = 0;
    this.fov = 40;
    this.apply(this.frameF);
    this.updateCamera(0, true);
  }

  stop() {
    this.playing = false;
  }

  /** Playback rate (game seconds per real second): fast build-up, deep slow motion through the strike. */
  rateAt(frameF) {
    const d = (frameF - this.shot) / RATE; // seconds relative to the strike
    const lerp = THREE.MathUtils.lerp;
    const smooth = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
    if (d < -0.7) return 0.85;
    if (d < -0.2) return lerp(0.85, 0.25, smooth((d + 0.7) / 0.5));
    if (d < 0.22) return 0.25;
    if (d < 0.7) return lerp(0.25, 0.6, smooth((d - 0.22) / 0.48));
    return 0.6;
  }

  /** Current camera segment: 1 build-up dolly, 2 over the shooter's shoulder, 3 behind the net. */
  segment() {
    const d = (this.frameF - this.shot) / RATE;
    if (d < -0.45) return 1;
    if (d < 0.3) return 2;
    return 3;
  }

  frameOffset(i) {
    return ((this.oldest + i) % MAX) * this.frameSize;
  }


  apply(frameF) {
    const i0 = Math.min(this.frames - 1, Math.floor(frameF));
    const i1 = Math.min(this.frames - 1, i0 + 1);
    const k = frameF - i0;
    const b = this.buffer;
    let a0 = this.frameOffset(i0);
    let a1 = this.frameOffset(i1);
    const m = this.ball.mesh;
    m.position.set(b[a0] + (b[a1] - b[a0]) * k, b[a0 + 1] + (b[a1 + 1] - b[a0 + 1]) * k, b[a0 + 2] + (b[a1 + 2] - b[a0 + 2]) * k);
    _q0.set(b[a0 + 3], b[a0 + 4], b[a0 + 5], b[a0 + 6]);
    _q1.set(b[a1 + 3], b[a1 + 4], b[a1 + 5], b[a1 + 6]);
    m.quaternion.slerpQuaternions(_q0, _q1, k);
    this.ball.blob.position.set(m.position.x, 0.012, m.position.z);
    // Real (unslowed) ball speed so the shot trail draws during the replay.
    this.ball.velocity.set(b[a1] - b[a0], b[a1 + 1] - b[a0 + 1], b[a1 + 2] - b[a0 + 2]).multiplyScalar(RATE);
    a0 += 7;
    a1 += 7;
    for (const a of this.actors) {
      const h = a.f.holder;
      h.position.set(b[a0] + (b[a1] - b[a0]) * k, b[a0 + 1] + (b[a1 + 1] - b[a0 + 1]) * k, b[a0 + 2] + (b[a1 + 2] - b[a0 + 2]) * k);
      _q0.set(b[a0 + 3], b[a0 + 4], b[a0 + 5], b[a0 + 6]);
      _q1.set(b[a1 + 3], b[a1 + 4], b[a1 + 5], b[a1 + 6]);
      h.quaternion.slerpQuaternions(_q0, _q1, k);
      a0 += 7;
      a1 += 7;
      for (const bone of a.bones) {
        _q0.set(b[a0], b[a0 + 1], b[a0 + 2], b[a0 + 3]);
        _q1.set(b[a1], b[a1 + 1], b[a1 + 2], b[a1 + 3]);
        bone.quaternion.slerpQuaternions(_q0, _q1, k);
        a0 += 4;
        a1 += 4;
      }
      for (const bone of a.posBones) {
        _v0.set(b[a0], b[a0 + 1], b[a0 + 2]);
        _v1.set(b[a1], b[a1 + 1], b[a1 + 2]);
        bone.position.lerpVectors(_v0, _v1, k);
        a0 += 3;
        a1 += 3;
      }
    }
  }

  updateCamera(dt, snap = false) {
    const ball = this.ball.mesh.position;
    const sign = Math.sign(this.goalX) || -1;
    const seg = this.segment();
    if (seg !== this.cut) {
      if (this.cut !== 0) this.onCut?.(seg);
      this.cut = seg;
      snap = true;
    }
    const shooter = this.actors[this.shooter].f.holder.position;
    let fov;
    let pos;
    let look;
    if (seg === 1) {
      // Low dolly alongside the shooter's run, on the court side of the play.
      const side = Math.abs(shooter.z) < 1 ? 1 : -Math.sign(shooter.z);
      pos = _v0.set(shooter.x - sign * 1.6, 1.15, shooter.z + side * 4.4);
      look = _v1.set((shooter.x + ball.x) / 2 + sign * 0.6, 0.85, (shooter.z + ball.z) / 2);
      fov = 42;
    } else if (seg === 2) {
      // Over the shooter's shoulder as the strike goes in: locked off, the ball flies away.
      // Anchored where the shooter was at the strike; the run-up comes into frame from behind.
      const d = this.shotDir;
      const s0 = this.shooterAtShot;
      const side = this.shotSide;
      pos = _v0.set(s0.x - d.x * 3.6 + d.z * 1.3 * side, 1.3, s0.z - d.z * 3.6 - d.x * 1.3 * side);
      look = _v1.set(s0.x + d.x * 3, 0.75, s0.z + d.z * 3).lerp(ball, 0.25);
      fov = 36;
    } else {
      // From behind the net, looking back out at the finish, slowly pushing in.
      pos = _v0.set(sign * (COURT.halfLength + 3.4), 1.6, THREE.MathUtils.clamp(ball.z * 0.4, -1.2, 1.2));
      look = _v1.set(ball.x - sign * 2, 0.9, ball.z);
      const since = Math.max(0, (this.frameF - this.shot) / RATE - 0.3);
      fov = 40 - Math.min(8, since * 6);
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    if (snap) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Seconds of the replay left at the current ramp (for the end stinger). */
  get remaining() {
    return (this.endFrame - this.frameF) / RATE / 0.6;
  }

  /** Returns false when finished. */
  update(dt) {
    if (!this.playing) return false;
    this.t += dt;
    this.frameF = Math.min(this.endFrame, this.frameF + dt * RATE * this.rateAt(this.frameF));
    this.apply(this.frameF);
    this.updateCamera(dt);
    if (this.frameF >= this.endFrame || this.t > 9) {
      this.playing = false;
      return false;
    }
    return true;
  }
}
