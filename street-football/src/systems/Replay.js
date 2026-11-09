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
 * last few seconds play back in slow motion (interpolated between frames)
 * with two cinematic cameras: a low tracking shot beside the ball, then the
 * view from behind the net.
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

  /** Begin playback of the recorded window. attackSign: direction of the goal scored into. */
  start(goalX, speed = 0.55) {
    this.playing = true;
    this.t = 0;
    this.speed = speed;
    this.frames = this.count;
    this.duration = (this.frames - 1) / RATE / speed;
    this.goalX = goalX;
    this.oldest = (this.head - this.count + MAX) % MAX;
    this.apply(0);
    this.cut = 0;
    this.updateCamera(0, true);
  }

  stop() {
    this.playing = false;
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
    const u = this.t / this.duration;
    let pos;
    let look;
    if (u < 0.55) {
      // Low tracking shot from the far touchline side, slightly behind the play.
      pos = _v0.set(ball.x - sign * 3.2, 1.25, ball.z + 4.6);
      look = _v1.set(ball.x + sign * 1.2, 0.7, ball.z);
      if (this.cut !== 1) {
        this.cut = 1;
        snap = true;
      }
    } else {
      // From behind the net, looking back out at the finish.
      pos = _v0.set(sign * (COURT.halfLength + 3.4), 1.7, THREE.MathUtils.clamp(ball.z * 0.4, -1.2, 1.2));
      look = _v1.set(ball.x - sign * 2, 0.9, ball.z);
      if (this.cut !== 2) {
        this.cut = 2;
        snap = true;
      }
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
    if (Math.abs(this.camera.fov - 38) > 0.01) {
      this.camera.fov = 38;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Returns false when finished. */
  update(dt) {
    if (!this.playing) return false;
    this.t += dt;
    const frameF = Math.min(this.frames - 1, this.t * RATE * this.speed);
    this.apply(frameF);
    this.updateCamera(dt);
    if (this.t >= this.duration) {
      this.playing = false;
      return false;
    }
    return true;
  }
}
