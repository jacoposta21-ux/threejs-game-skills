import { $ } from './dom';

export interface PerfSample {
  fps: number;
  calls: number;
  triangles: number;
  villagers: number;
  fires: number;
  particles: number;
  religions: number;
  events: number;
  memories: number;
  sacred: number;
  quality: string;
  simMs: number;
}

/**
 * Lightweight diagnostics overlay. Hidden by default; available in development
 * builds (toggle with the backquote key) or with ?debug in any build.
 */
export class PerfOverlay {
  private readonly root = $('#perf');
  private visible = false;
  private timer = 0;
  readonly allowed: boolean;

  constructor(allowed: boolean, startVisible: boolean) {
    this.allowed = allowed;
    if (allowed && startVisible) this.toggle();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && this.allowed) this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  update(dt: number, s: PerfSample): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const row = (k: string, v: string | number) => `<span>${k}</span><b>${v}</b>`;
    this.root.innerHTML =
      row('FPS', Math.round(s.fps)) + row('Quality', s.quality) + row('Draw calls', s.calls) + row('Triangles', `${Math.round(s.triangles / 1000)}k`) +
      row('Sim ms/frame', s.simMs.toFixed(2)) + row('Villagers', s.villagers) + row('Fires', s.fires) + row('Particles', s.particles) +
      row('Religions', s.religions) + row('Sacred', s.sacred) + row('Memories', s.memories) + row('Active events', s.events);
  }
}
