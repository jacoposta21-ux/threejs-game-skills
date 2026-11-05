export interface CineStep {
  dur: number;
  start?: () => void;
  update?: (t: number, dt: number) => void;
  end?: () => void;
}

/**
 * Plays short timed sequences. While running, gameplay input is locked by
 * the game (player mode 'locked') and the HUD hides.
 */
export class CinematicSystem {
  private steps: CineStep[] = [];
  private index = -1;
  private t = 0;
  private onDone: (() => void) | null = null;
  skippable = false;

  get active(): boolean {
    return this.index >= 0;
  }

  play(steps: CineStep[], onDone?: () => void, skippable = false): void {
    this.steps = steps;
    this.index = 0;
    this.t = 0;
    this.onDone = onDone ?? null;
    this.skippable = skippable;
    this.steps[0]?.start?.();
  }

  stop(): void {
    this.index = -1;
    this.steps = [];
    this.onDone = null;
  }

  /** Jump to the end, running remaining step ends. */
  skip(): void {
    if (!this.active) return;
    while (this.index >= 0 && this.index < this.steps.length) {
      const step = this.steps[this.index];
      step.update?.(1, 0);
      step.end?.();
      this.index++;
      this.steps[this.index]?.start?.();
    }
    this.finish();
  }

  update(dt: number): void {
    if (this.index < 0) return;
    let step = this.steps[this.index];
    this.t += dt;
    step.update?.(Math.min(1, this.t / step.dur), dt);
    while (step && this.t >= step.dur) {
      step.end?.();
      this.t -= step.dur;
      this.index++;
      if (this.index >= this.steps.length) {
        this.finish();
        return;
      }
      step = this.steps[this.index];
      step.start?.();
      step.update?.(Math.min(1, this.t / step.dur), 0);
    }
  }

  private finish(): void {
    const done = this.onDone;
    this.index = -1;
    this.steps = [];
    this.onDone = null;
    done?.();
  }
}
