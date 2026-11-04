const SIM_STEPS = Math.max(1, Math.min(12, Number(new URLSearchParams(location.search).get('simsteps')) || 1));

export class Loop {
  private frameId = 0;
  private lastTime = 0;
  private running = false;
  errors = 0;

  constructor(
    private readonly update: (deltaSeconds: number, elapsedSeconds: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private readonly tick = (time: number) => {
    if (!this.running) return;
    const deltaSeconds = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    // Schedule first so one bad frame can never freeze the game.
    this.frameId = requestAnimationFrame(this.tick);
    try {
      // Test-only fast-forward (?simsteps=N): N fixed simulation steps per rendered frame.
      for (let i = 1; i < SIM_STEPS; i += 1) this.update(1 / 30, time / 1000);
      this.update(SIM_STEPS > 1 ? 1 / 30 : deltaSeconds, time / 1000);
      this.render();
    } catch (err) {
      this.errors += 1;
      if (this.errors < 5) console.error(err);
    }
  };
}
