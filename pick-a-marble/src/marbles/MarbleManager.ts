import * as THREE from 'three';
import { MARBLE_R } from '../physics/PhysicsWorld';
import { getSkin, skinCoreMaterial, skinMaterial } from './MarbleSkins';

export interface RaceMarble {
  index: number;
  skin: string;
  name: string;
}

interface MarbleVisual {
  group: THREE.Group;
  ball: THREE.Mesh;
  trail: THREE.Line;
  trailPts: Float32Array;
  trailCount: number;
  ring: THREE.Mesh;
  glow?: THREE.Mesh;
  hidden: boolean;
}

const TRAIL = 24;

export class MarbleManager {
  readonly root = new THREE.Group();
  readonly visuals: MarbleVisual[] = [];
  private sphereGeo = new THREE.SphereGeometry(MARBLE_R, 32, 20);
  private coreGeo = new THREE.SphereGeometry(MARBLE_R * 0.55, 16, 12);
  private ringGeo = new THREE.RingGeometry(0.38, 0.5, 32);
  private glowTex: THREE.Texture;
  selected = -1;
  picked = -1;

  constructor() {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const c = cv.getContext('2d') as CanvasRenderingContext2D;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(cv);
  }

  build(marbles: RaceMarble[]): void {
    this.clear();
    for (const m of marbles) {
      const skin = getSkin(m.skin);
      const group = new THREE.Group();
      const ball = new THREE.Mesh(this.sphereGeo, skinMaterial(skin));
      ball.castShadow = true;
      group.add(ball);
      const core = skinCoreMaterial(skin);
      if (core) ball.add(new THREE.Mesh(this.coreGeo, core));
      if (skin.kind === 'pattern' && skin.pattern === 'cateye') {
        // nothing extra; texture carries the eye
      }
      const color = new THREE.Color(skin.colors[skin.kind === 'glass' ? 1 : 0] ?? skin.colors[0]);
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
      ring.renderOrder = 5;
      ring.visible = false;
      group.add(ring);
      let glow: THREE.Mesh | undefined;
      if (skin.kind === 'neon' || skin.pattern === 'lava') {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
        sprite.scale.setScalar(1.6);
        group.add(sprite);
      }
      const trailPts = new Float32Array(TRAIL * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPts, 3));
      const colors = new Float32Array(TRAIL * 3);
      for (let i = 0; i < TRAIL; i += 1) {
        const k = 1 - i / TRAIL;
        colors[i * 3] = color.r * k + (1 - k);
        colors[i * 3 + 1] = color.g * k + (1 - k);
        colors[i * 3 + 2] = color.b * k + (1 - k);
      }
      trailGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
      trail.frustumCulled = false;
      this.root.add(group, trail);
      this.visuals.push({ group, ball, trail, trailPts, trailCount: 0, ring, glow, hidden: false });
    }
  }

  clear(): void {
    for (const v of this.visuals) {
      this.root.remove(v.group, v.trail);
      v.trail.geometry.dispose();
      (v.ring.material as THREE.Material).dispose();
    }
    this.visuals.length = 0;
  }

  /** Sync from physics translations/rotations. */
  sync(index: number, pos: { x: number; y: number; z: number }, rot: { x: number; y: number; z: number; w: number }, enabled: boolean): void {
    const v = this.visuals[index];
    if (!v) return;
    v.group.visible = enabled;
    v.trail.visible = enabled;
    v.group.position.set(pos.x, pos.y, pos.z);
    v.ball.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  }

  resetTrails(): void {
    for (const v of this.visuals) v.trailCount = 0;
  }

  update(camera: THREE.Camera, time: number): void {
    this.visuals.forEach((v, i) => {
      // trail shift
      const p = v.group.position;
      const pts = v.trailPts;
      const last = v.trailCount > 0 ? new THREE.Vector3(pts[0], pts[1], pts[2]) : null;
      if (!last || last.distanceToSquared(p) > 0.02) {
        pts.copyWithin(3, 0, (TRAIL - 1) * 3);
        pts[0] = p.x;
        pts[1] = p.y;
        pts[2] = p.z;
        v.trailCount = Math.min(TRAIL, v.trailCount + 1);
        if (v.trailCount < TRAIL) for (let k = v.trailCount; k < TRAIL; k += 1) pts.set([p.x, p.y, p.z], k * 3);
        (v.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
      const show = i === this.selected || i === this.picked;
      v.ring.visible = show;
      if (show) {
        v.ring.quaternion.copy(camera.quaternion);
        const s = 1 + Math.sin(time * 6) * 0.08;
        v.ring.scale.setScalar(s);
        (v.ring.material as THREE.MeshBasicMaterial).color.set(i === this.picked ? '#ffd60a' : '#ffffff');
      }
    });
  }

  position(i: number): THREE.Vector3 | null {
    return this.visuals[i]?.group.position ?? null;
  }
}
