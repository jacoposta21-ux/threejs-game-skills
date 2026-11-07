import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { softDot } from '../art/Textures';

export interface GuideStep {
  id: string;
  /** Short instruction, e.g. "Open the glowing drawer". */
  text: string;
  /** Keys to show as badges, e.g. ['E'] or ['W', 'A', 'S', 'D']. */
  keys?: string[];
  /** World point to mark; null hides the marker for this step. */
  target?: (ctx: GameContext) => THREE.Vector3 | null;
  /** Step is complete (skipped when already true, so order is flexible). */
  done: (ctx: GameContext) => boolean;
  /** Only consider this step when true (e.g. during an encounter). */
  when?: (ctx: GameContext) => boolean;
}

export type GuideMode = 'always' | 'stuck' | 'off';

export interface GuideView {
  text: string;
  keys: string[];
  arrow: { x: number; y: number; angle: number } | null;
}

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(255,214,150,1)';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(64, 64, 52, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 3;
  x.globalAlpha = 0.5;
  x.beginPath();
  x.arc(64, 64, 40, 0, Math.PI * 2);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Step-by-step guidance: "go here, take this, look there".
 * A warm marker floats over the next target (visible through walls) and the HUD
 * shows the instruction with key badges plus an edge arrow when it is off-screen.
 */
export class GuideSystem {
  steps: GuideStep[] = [];
  mode: GuideMode = 'always';
  private current: GuideStep | null = null;
  private idle = 0;
  private time = 0;
  readonly marker = new THREE.Group();
  private glow: THREE.Sprite;
  private ring: THREE.Sprite;
  private view: GuideView | null = null;
  private visibleK = 0;

  constructor(scene: THREE.Scene) {
    const common = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false };
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#ffc874', ...common }));
    this.ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), color: '#ffd9a0', ...common }));
    this.glow.renderOrder = 999;
    this.ring.renderOrder = 999;
    this.marker.add(this.glow, this.ring);
    this.marker.visible = false;
    scene.add(this.marker);
  }

  setSteps(steps: GuideStep[], mode: GuideMode): void {
    this.steps = steps;
    this.mode = mode;
    this.current = null;
    this.idle = 0;
    this.visibleK = 0;
  }

  get currentId(): string | null {
    return this.current?.id ?? null;
  }

  update(dt: number, ctx: GameContext, camera: THREE.PerspectiveCamera, active: boolean): GuideView | null {
    this.time += dt;
    let next: GuideStep | null = null;
    for (const s of this.steps) {
      if (s.when && !s.when(ctx)) continue;
      if (s.done(ctx)) continue;
      next = s;
      break;
    }
    if (next !== this.current) {
      this.current = next;
      this.idle = 0;
    }
    this.idle += dt;
    const show = active && !!next && (this.mode === 'always' || (this.mode === 'stuck' && this.idle > 30));
    this.visibleK = THREE.MathUtils.damp(this.visibleK, show ? 1 : 0, 6, dt);
    if (!next || this.visibleK < 0.02) {
      this.marker.visible = false;
      this.view = null;
      return null;
    }
    const target = next.target?.(ctx) ?? null;
    let arrow: GuideView['arrow'] = null;
    if (target) {
      const camPos = camera.getWorldPosition(new THREE.Vector3());
      const d = camPos.distanceTo(target);
      this.marker.visible = d > 0.55;
      this.marker.position.copy(target);
      this.marker.position.y += 0.12 + Math.sin(this.time * 2.4) * 0.03;
      const s = THREE.MathUtils.clamp(d * 0.06, 0.09, 0.4);
      const pulse = 1 + Math.sin(this.time * 3) * 0.12;
      this.glow.scale.setScalar(s * 1.1 * pulse);
      this.ring.scale.setScalar(s * 1.6 * (1.15 - ((this.time * 0.8) % 1) * 0.3));
      const fadeNear = THREE.MathUtils.smoothstep(d, 0.55, 1.2);
      (this.glow.material as THREE.SpriteMaterial).opacity = 0.9 * this.visibleK * fadeNear;
      (this.ring.material as THREE.SpriteMaterial).opacity = 0.75 * this.visibleK * fadeNear;
      // Edge arrow when the target is behind or outside the view.
      const p = target.clone().project(camera);
      const behind = p.z > 1;
      if (behind || Math.abs(p.x) > 0.92 || Math.abs(p.y) > 0.88) {
        let x = p.x;
        let y = p.y;
        if (behind) {
          x = -x;
          y = -y;
        }
        const angle = Math.atan2(y, x);
        const m = Math.max(Math.abs(x), Math.abs(y), 1e-3);
        arrow = { x: THREE.MathUtils.clamp(x / m, -0.9, 0.9), y: THREE.MathUtils.clamp(y / m, -0.85, 0.85), angle };
      }
    } else {
      this.marker.visible = false;
    }
    this.view = { text: next.text, keys: next.keys ?? [], arrow };
    return this.view;
  }

  get opacity(): number {
    return this.visibleK;
  }

  clear(): void {
    this.steps = [];
    this.current = null;
    this.marker.visible = false;
  }
}
