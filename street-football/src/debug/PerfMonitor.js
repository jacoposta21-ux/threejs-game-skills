/**
 * Lightweight performance monitor for real-hardware checks.
 *   ?fps (or F8)  — live overlay: fps, frame ms avg / p95, CPU update ms, draw calls, triangles
 *   ?bench        — runs an AI-vs-AI match for 20 s and shows a copyable summary
 * Frame time is wall time between frames; "CPU" is the game's update() cost
 * (simulation, AI, animation, audio), excluding the GPU.
 */
export class PerfMonitor {
  constructor(renderer) {
    this.renderer = renderer;
    this.frames = new Float32Array(240);
    this.cpu = new Float32Array(240);
    this.i = 0;
    this.n = 0;
    this.last = performance.now();
    this.visible = false;
    this.el = null;
    this.gpuName = this.detectGpu();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F8') this.toggle();
    });
  }

  detectGpu() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch {
      return 'unknown';
    }
  }

  toggle(force) {
    this.visible = force ?? !this.visible;
    if (this.visible && !this.el) {
      this.el = document.createElement('div');
      this.el.id = 'perf';
      document.getElementById('app').appendChild(this.el);
    }
    if (this.el) this.el.classList.toggle('hidden', !this.visible);
  }

  /** Call once per frame with the measured update() duration in ms. */
  frame(cpuMs) {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    this.lastWallMs = dt;
    this.frames[this.i] = dt;
    this.cpu[this.i] = cpuMs;
    this.i = (this.i + 1) % this.frames.length;
    this.n = Math.min(this.frames.length, this.n + 1);
    if (this.visible && this.n % 15 === 0) this.render();
  }

  stats() {
    const n = this.n;
    const f = Array.from(this.frames.slice(0, n)).sort((a, b) => a - b);
    const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, n);
    const p95 = f[Math.floor(n * 0.95)] ?? 0;
    const cpu = Array.from(this.cpu.slice(0, n)).reduce((a, b) => a + b, 0) / Math.max(1, n);
    const info = this.renderer.info.render;
    return { fps: 1000 / Math.max(1e-3, avg), avgMs: avg, p95Ms: p95, cpuMs: cpu, calls: info.calls, triangles: info.triangles };
  }

  render() {
    const s = this.stats();
    this.el.textContent = `${s.fps.toFixed(0)} fps  ${s.avgMs.toFixed(1)}/${s.p95Ms.toFixed(1)} ms p95\nCPU ${s.cpuMs.toFixed(2)} ms  ${s.calls} calls  ${(s.triangles / 1000).toFixed(0)}k tris`;
  }

  /** Accumulate over a whole benchmark run (not just the rolling window). */
  startRun() {
    this.run = { frames: [], cpu: [], start: performance.now() };
  }

  sample(frameMs, cpuMs) {
    if (!this.run) return;
    this.run.frames.push(frameMs);
    this.run.cpu.push(cpuMs);
  }

  endRun(extra = {}) {
    const r = this.run;
    this.run = null;
    const f = [...r.frames].sort((a, b) => a - b);
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    return {
      seconds: +((performance.now() - r.start) / 1000).toFixed(1),
      frames: f.length,
      avgFps: +(1000 / avg).toFixed(1),
      avgFrameMs: +avg.toFixed(2),
      p95FrameMs: +f[Math.floor(f.length * 0.95)].toFixed(2),
      p99FrameMs: +f[Math.floor(f.length * 0.99)].toFixed(2),
      avgCpuMs: +(r.cpu.reduce((a, b) => a + b, 0) / r.cpu.length).toFixed(2),
      gpu: this.gpuName,
      userAgent: navigator.userAgent,
      ...extra,
    };
  }
}
