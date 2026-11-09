import * as THREE from 'three';

const LOCO = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop'];

/**
 * Drives one character's AnimationMixer.
 *
 * Locomotion: idle/walk/jog/sprint all run on a shared normalised phase, so
 * blended clips keep their feet in sync. The phase advances at
 * groundSpeed / strideLength, where stride lengths were measured from each
 * clip's stance-foot velocity — feet stay planted at any speed.
 *
 * Layers above locomotion: a looping overlay (keeper stance, celebration) and
 * a one-shot (kick, pass, dive) with fade in/out. Weights always sum to 1.
 */
export class AnimationController {
  constructor(lib, root) {
    this.lib = lib;
    this.mixer = new THREE.AnimationMixer(root);
    this.loco = LOCO.map((name) => {
      const action = this.mixer.clipAction(lib.clips.get(name));
      action.play();
      action.setEffectiveTimeScale(0);
      action.setEffectiveWeight(0);
      const info = lib.locomotion[name];
      return { name, action, info, stride: info.natural * info.duration };
    });
    this.phase = 0;
    this.speed = 0;
    this.locoWeights = [1, 0, 0, 0];
    this.oneShot = null;
    this.overlay = null;
    this.lastFootPhase = 0;
    this.onFootstep = null;
    this.footfalls = 0; // counts every footfall; dribble touches sync to it
    this.phaseRate = 0; // locomotion cycles per second
  }

  /** Seconds between footfalls at the current pace (one swing of a leg). */
  get stepTime() {
    return this.phaseRate > 0.2 ? 0.5 / this.phaseRate : 0.3;
  }

  /** Blend weights for a ground speed (m/s). */
  computeLocoWeights(speed) {
    const [, walk, jog, sprint] = this.loco;
    const w = [0, 0, 0, 0];
    const vWalk = walk.info.natural;
    const vJog = jog.info.natural;
    const vSprint = sprint.info.natural;
    if (speed <= 0.05) {
      w[0] = 1;
    } else if (speed < vWalk) {
      const t = speed / vWalk;
      w[0] = 1 - t;
      w[1] = t;
    } else if (speed < vJog) {
      const t = (speed - vWalk) / (vJog - vWalk);
      w[1] = 1 - t;
      w[2] = t;
    } else if (speed < vSprint) {
      const t = (speed - vJog) / (vSprint - vJog);
      w[2] = 1 - t;
      w[3] = t;
    } else {
      w[3] = 1;
    }
    return w;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  /** Play a one-shot clip. Returns its duration (after speed scaling). */
  play(name, { fadeIn = 0.06, fadeOut = 0.12, speed = 1 } = {}) {
    const clip = this.lib.clips.get(name);
    if (!clip) throw new Error(`Unknown clip ${name}`);
    if (this.oneShot) this.oneShot.action.stop();
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(speed);
    action.setEffectiveWeight(0);
    action.play();
    this.oneShot = { name, action, fadeIn, fadeOut, speed, duration: clip.duration / speed, elapsed: 0, weight: 0 };
    return this.oneShot.duration;
  }

  /** Hold the last frame of the current one-shot until cleared (keeper lying after a dive). */
  holdOneShot(hold) {
    if (this.oneShot) this.oneShot.hold = hold;
  }

  isPlaying(name) {
    return this.oneShot?.name === name;
  }

  setOverlay(name, { fade = 0.25, speed = 1 } = {}) {
    if (this.overlay?.name === name) return;
    if (this.overlay) {
      this.overlay.fadingOut = true;
      this.overlay.fade = fade;
    }
    if (!name) {
      return;
    }
    const action = this.mixer.clipAction(this.lib.clips.get(name));
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveTimeScale(speed);
    action.setEffectiveWeight(0);
    action.play();
    this.previousOverlay = this.overlay;
    this.overlay = { name, action, weight: 0, fade, fadingOut: false };
  }

  update(dt) {
    // Locomotion phase.
    const target = this.computeLocoWeights(this.speed);
    const k = 1 - Math.exp(-dt * 10);
    for (let i = 0; i < 4; i += 1) this.locoWeights[i] += (target[i] - this.locoWeights[i]) * k;
    let stride = 0;
    let wsum = 0;
    for (let i = 1; i < 4; i += 1) {
      stride += this.loco[i].stride * this.locoWeights[i];
      wsum += this.locoWeights[i];
    }
    if (wsum > 1e-3 && this.speed > 0.05) {
      stride /= wsum;
      this.phaseRate = this.speed / Math.max(stride, 0.3);
      this.phase = (this.phase + this.phaseRate * dt) % 1;
    } else {
      this.phaseRate = 0;
    }
    // Two footfalls per cycle.
    const fp = (this.phase * 2) % 1;
    if (fp < this.lastFootPhase && this.speed > 0.3) {
      this.footfalls += 1;
      if (this.speed > 0.6) this.onFootstep?.(this.speed);
    }
    this.lastFootPhase = fp;

    // One-shot weight.
    let shotW = 0;
    const os = this.oneShot;
    if (os) {
      os.elapsed += dt;
      const fadeOutStart = os.duration - os.fadeOut;
      if (os.hold) shotW = Math.min(1, os.elapsed / os.fadeIn);
      else if (os.elapsed < os.fadeIn) shotW = os.elapsed / os.fadeIn;
      else if (os.elapsed < fadeOutStart) shotW = 1;
      else shotW = Math.max(0, 1 - (os.elapsed - fadeOutStart) / os.fadeOut);
      if (!os.hold && os.elapsed >= os.duration) {
        os.action.stop();
        this.oneShot = null;
        shotW = 0;
      } else {
        os.action.setEffectiveWeight(shotW);
      }
    }

    // Overlay weight.
    let overW = 0;
    if (this.overlay) {
      const ov = this.overlay;
      ov.weight = Math.min(1, ov.weight + dt / ov.fade);
      overW = ov.weight;
    }
    if (this.previousOverlay) {
      const pv = this.previousOverlay;
      pv.weight = Math.max(0, pv.weight - dt / pv.fade);
      if (pv.weight <= 0) {
        pv.action.stop();
        this.previousOverlay = null;
      } else {
        pv.action.setEffectiveWeight(pv.weight * (1 - shotW));
      }
    }
    if (this.overlay?.fadingOut) {
      this.overlay.weight = Math.max(0, this.overlay.weight - (2 * dt) / this.overlay.fade);
      overW = this.overlay.weight;
      if (overW <= 0) {
        this.overlay.action.stop();
        this.overlay = null;
      }
    }
    const prevW = this.previousOverlay ? this.previousOverlay.weight : 0;
    if (this.overlay) this.overlay.action.setEffectiveWeight(overW * (1 - shotW));
    const locoTotal = Math.max(0, (1 - shotW) * (1 - Math.min(1, overW + prevW)));

    for (let i = 0; i < 4; i += 1) {
      const l = this.loco[i];
      l.action.setEffectiveWeight(this.locoWeights[i] * locoTotal);
      const offset = l.info.phase;
      l.action.time = (((this.phase + offset) % 1) + 1) % 1 * l.info.duration;
    }
    this.mixer.update(dt);
  }

  stopAll() {
    if (this.oneShot) this.oneShot.action.stop();
    this.oneShot = null;
    if (this.overlay) this.overlay.action.stop();
    if (this.previousOverlay) this.previousOverlay.action.stop();
    this.overlay = null;
    this.previousOverlay = null;
  }
}
