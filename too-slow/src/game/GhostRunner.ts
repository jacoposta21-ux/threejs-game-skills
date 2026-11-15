import * as THREE from 'three';
import type { RacerProfile } from '../ai/SnailAI';
import { SnailModel, type SnailPose } from '../characters/SnailModel';
import { TUNE, type RacerBody } from '../physics/RacerBody';
import { GHOST_DT, type Ghost } from '../ui/Progress';

const MODES = ['crawl', 'roll', 'slide'] as const;

/** Records the player's time-trial run and replays the personal best as a see-through snail. */
export class GhostRunner {
  private model: SnailModel | null = null;
  private playback: Ghost | null = null;
  private recording: number[] = [];
  private next = 0;
  private roll = 0;
  private readonly pose: SnailPose = {
    mode: 'roll',
    speed: 0,
    forwardSpeed: 0,
    steer: 0,
    grounded: true,
    verticalSpeed: 0,
    rollAngle: 0,
    spinAngle: 0,
    boosting: false,
    sinceHit: 9,
    spinOut: 0,
    shield: false,
  };

  constructor(private readonly scene: THREE.Scene) {}

  /** Start a run. `ghost` is the stored best to race against (or null). */
  start(ghost: Ghost | null, look: RacerProfile): void {
    this.recording = [];
    this.next = 0;
    this.roll = 0;
    this.playback = ghost;
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
      this.model = null;
    }
    if (ghost) {
      this.model = new SnailModel({ ...look, shell: ghost.shell, shellDark: ghost.shell, hat: 'none', name: 'ghost' }, 0.3);
      this.model.setGhost();
      this.model.root.visible = false;
      this.scene.add(this.model.root);
    }
  }

  stop(): void {
    this.playback = null;
    this.recording = [];
    if (this.model) this.model.root.visible = false;
  }

  get ghostTime(): number | null {
    return this.playback?.time ?? null;
  }

  record(raceTime: number, r: RacerBody): void {
    while (raceTime >= this.next * GHOST_DT) {
      this.recording.push(r.pos.x, r.pos.y, r.pos.z, r.heading, r.mode === 'crawl' ? 0 : r.mode === 'roll' ? 1 : 2);
      this.next += 1;
    }
  }

  /** The finished run as a storable ghost. */
  result(track: string, time: number, name: string, shell: number): Ghost {
    return { track, time, name, shell, samples: this.recording.slice() };
  }

  update(raceTime: number, dt: number): void {
    const g = this.playback;
    const m = this.model;
    if (!g || !m) return;
    const n = g.samples.length / 5;
    const f = raceTime / GHOST_DT;
    const i = Math.floor(f);
    m.root.visible = raceTime > 0 && i < n - 1;
    if (!m.root.visible) return;
    const k = f - i;
    const s = g.samples;
    const a = i * 5;
    const b = a + 5;
    const x = s[a] + (s[b] - s[a]) * k;
    const y = s[a + 1] + (s[b + 1] - s[a + 1]) * k;
    const z = s[a + 2] + (s[b + 2] - s[a + 2]) * k;
    let dh = s[b + 3] - s[a + 3];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const heading = s[a + 3] + dh * k;
    const speed = Math.hypot(s[b] - s[a], s[b + 1] - s[a + 1], s[b + 2] - s[a + 2]) / GHOST_DT;
    m.root.position.set(x, y - TUNE.radius, z);
    m.root.rotation.set(0, Math.PI - heading, 0);
    const pose = this.pose;
    pose.mode = MODES[s[a + 4] | 0] ?? 'roll';
    pose.speed = speed;
    pose.forwardSpeed = speed;
    this.roll += pose.mode === 'roll' ? (speed * dt) / TUNE.radius : 0;
    pose.rollAngle = this.roll;
    m.update(dt, pose);
  }
}
