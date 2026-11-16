/**
 * Fixed-step simulation (60 Hz) with interpolated rendering. The accumulator is
 * clamped so a background tab or long frame cannot spiral.
 */
export const FIXED_DT = 1 / 60;

export class Loop {
  constructor({ fixedUpdate, update, render }) {
    this.fixedUpdate = fixedUpdate;
    this.update = update;
    this.render = render;
    this.running = false;
    this.accumulator = 0;
    this.last = 0;
    this.elapsed = 0;
    this.raf = 0;
    this.frameTimes = new Float32Array(120);
    this.frameIndex = 0;
    this._tick = (now) => this.tick(now);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  tick(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.elapsed += dt;
    this.frameTimes[this.frameIndex] = dt;
    this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === 5) this.accumulator = 0;
    const alpha = this.accumulator / FIXED_DT;
    this.update(dt, alpha, this.elapsed);
    this.render();
    this.raf = requestAnimationFrame(this._tick);
  }

  averageFps() {
    let sum = 0;
    let n = 0;
    for (const t of this.frameTimes) if (t > 0) { sum += t; n += 1; }
    return n ? n / sum : 60;
  }
}
