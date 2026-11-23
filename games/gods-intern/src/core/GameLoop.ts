import { CONFIG } from './Config';

/**
 * requestAnimationFrame loop with a fixed-timestep simulation accumulator.
 * Simulation runs at CONFIG.sim.hz independent of display rate; rendering
 * receives the real frame delta for animation.
 */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  running = false;
  readonly step = 1 / CONFIG.sim.hz;

  constructor(
    private readonly simulate: (dt: number) => void,
    private readonly render: (dt: number, elapsed: number, wallDt: number) => void,
    private readonly speed: () => number,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const wallDt = Math.min(0.5, (now - this.last) / 1000);
      const dt = Math.min(0.1, wallDt);
      this.last = now;
      const speed = this.speed();
      if (speed > 0) {
        this.acc += dt * speed;
        let steps = 0;
        while (this.acc >= this.step && steps < CONFIG.sim.maxStepsPerFrame * Math.max(1, speed)) {
          this.simulate(this.step);
          this.acc -= this.step;
          steps++;
        }
        if (this.acc > this.step * 4) this.acc = 0; // drop backlog rather than spiral
      } else this.acc = 0;
      this.render(dt, now / 1000, wallDt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
