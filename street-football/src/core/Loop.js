// requestAnimationFrame loop with a clamped delta. Physics runs its own fixed
// step inside update(); this loop only supplies real frame time.
export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.frameId = 0;
    this.last = 0;
    this.tick = this.tick.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }
  tick(time) {
    if (!this.running) return;
    const dt = Math.min((time - this.last) / 1000, 0.1);
    this.last = time;
    this.update(dt, time / 1000);
    this.render();
    this.frameId = requestAnimationFrame(this.tick);
  }
}
