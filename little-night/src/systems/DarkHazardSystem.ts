import * as THREE from 'three';
import type { GameContext } from '../core/Context';

export interface DarkZone {
  id: string;
  min: THREE.Vector2;
  max: THREE.Vector2;
  /** Deep darkness swallows LUMO's follow light; only perches work. */
  deep: boolean;
  returnPos: THREE.Vector3;
  returnYaw: number;
  /** Optional: disabled once solved/lit permanently. */
  active?: () => boolean;
  floorY?: number;
}

export interface StaticLight {
  pos: THREE.Vector3;
  radius: number;
  active: () => boolean;
}

const GRAB_TIME = 1.5;

/** Unlit floor is dangerous: shadow hands reach for the child and drag them back. */
export class DarkHazardSystem {
  zones: DarkZone[] = [];
  lights: StaticLight[] = [];
  grab = 0;
  inZone: DarkZone | null = null;
  lit = true;
  private hands: THREE.Group[] = [];
  private handRoot = new THREE.Group();
  private dragging = 0;
  private time = 0;
  private decals: THREE.Mesh[] = [];
  private decalMat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    scene.add(this.handRoot);
    const dark = new THREE.MeshStandardMaterial({ color: '#030205', roughness: 1, emissive: '#16081f', emissiveIntensity: 0.4 });
    const fingerGeo = new THREE.ConeGeometry(0.018, 0.32, 5);
    fingerGeo.translate(0, 0.16, 0);
    const palmGeo = new THREE.SphereGeometry(0.05, 8, 6);
    for (let i = 0; i < 7; i++) {
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(palmGeo, dark);
      palm.scale.set(1, 0.5, 1.3);
      hand.add(palm);
      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(fingerGeo, dark);
        finger.position.set((f - 1.5) * 0.025, 0.01, -0.03);
        finger.rotation.set(-0.5 - f * 0.08, 0, (f - 1.5) * 0.18);
        finger.scale.y = 0.8 + (f % 2) * 0.35;
        hand.add(finger);
      }
      hand.visible = false;
      this.handRoot.add(hand);
      this.hands.push(hand);
    }
    this.decalMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        float n(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float sn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(n(i),n(i+vec2(1,0)),f.x), mix(n(i+vec2(0,1)),n(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 e = min(vUv, 1.0 - vUv);
          float edge = smoothstep(0.0, 0.12, min(e.x, e.y));
          float w = sn(vUv * 9.0 + vec2(uTime * 0.15, -uTime * 0.1)) * 0.5 + sn(vUv * 23.0 - uTime * 0.2) * 0.5;
          float a = edge * (0.62 + 0.25 * w);
          gl_FragColor = vec4(0.012, 0.004, 0.02, a);
        }
      `,
    });
  }

  addZone(zone: DarkZone, scene: THREE.Object3D): void {
    this.zones.push(zone);
    // Telegraph: an inky, slowly swirling stain on the floor.
    const w = zone.max.x - zone.min.x;
    const d = zone.max.y - zone.min.y;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, d + 0.3), this.decalMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set((zone.min.x + zone.max.x) / 2, (zone.floorY ?? 0) + 0.006, (zone.min.y + zone.max.y) / 2);
    decal.renderOrder = 1;
    decal.userData.zone = zone;
    scene.add(decal);
    this.decals.push(decal);
  }

  addLight(light: StaticLight): void {
    this.lights.push(light);
  }

  clear(): void {
    this.zones = [];
    this.lights = [];
    for (const d of this.decals) d.geometry.dispose();
    this.decals = [];
    this.grab = 0;
    this.inZone = null;
    for (const h of this.hands) h.visible = false;
  }

  isLitPoint(ctx: GameContext, p: THREE.Vector3, deep: boolean): boolean {
    const lumo = ctx.lumo;
    if (lumo.isLit) {
      const anchored = lumo.state === 'perched' || lumo.state === 'docked' || lumo.state === 'cinematic';
      if ((!deep || anchored) && lumo.position.distanceTo(p) < lumo.lightRadius * 0.92) return true;
    }
    for (const l of this.lights) {
      if (l.active() && l.pos.distanceTo(p) < l.radius) return true;
    }
    return false;
  }

  update(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.decalMat.uniforms.uTime.value = this.time;
    for (const d of this.decals) {
      const z = d.userData.zone as DarkZone;
      d.visible = z.active ? z.active() : true;
    }
    const p = ctx.player.position;
    this.inZone = null;
    for (const z of this.zones) {
      if (z.active && !z.active()) continue;
      if (Math.abs(p.y - (z.floorY ?? 0)) > 0.3) continue;
      if (p.x > z.min.x && p.x < z.max.x && p.z > z.min.y && p.z < z.max.y) {
        this.inZone = z;
        break;
      }
    }
    // Deep dark swallows the follow light when LUMO is near the child in it.
    let suppress = false;
    for (const z of this.zones) {
      if (!z.deep || (z.active && !z.active())) continue;
      const lp = ctx.lumo.position;
      if (lp.x > z.min.x - 0.3 && lp.x < z.max.x + 0.3 && lp.z > z.min.y - 0.3 && lp.z < z.max.y + 0.3) suppress = true;
    }
    ctx.lumo.suppressed = suppress && ctx.lumo.state === 'follow';

    const exposed = this.inZone !== null && ctx.player.mode !== 'hidden' && ctx.player.mode !== 'locked';
    this.lit = !exposed || this.isLitPoint(ctx, p, this.inZone!.deep);
    if (this.dragging > 0) {
      this.dragging -= dt;
      return;
    }
    if (exposed && !this.lit) {
      if (this.grab === 0) ctx.audio.play('grab', { pos: p, volume: 0.6 });
      this.grab = Math.min(1, this.grab + dt / GRAB_TIME);
      if (!ctx.audio.hasLoop('hands')) ctx.audio.startTrackedLoop('hands', 'hands', this.handRoot, 0.25);
    } else {
      this.grab = Math.max(0, this.grab - dt * 1.2);
      if (this.grab === 0 && ctx.audio.hasLoop('hands')) ctx.audio.stopLoop('hands', 0.6);
    }
    this.updateHands(ctx);
    if (this.grab >= 1 && this.inZone) this.drag(ctx, this.inZone);
  }

  private updateHands(ctx: GameContext): void {
    const p = ctx.player.position;
    this.handRoot.position.set(p.x, p.y, p.z);
    const fwd = ctx.player.forward();
    const baseYaw = Math.atan2(-fwd.x, -fwd.z);
    this.hands.forEach((h, i) => {
      const show = this.grab > 0.02;
      h.visible = show;
      if (!show) return;
      const a = baseYaw + (i / this.hands.length) * Math.PI * 2 + Math.sin(this.time * 0.7 + i) * 0.2;
      const dist = 0.65 - this.grab * 0.35 + Math.sin(this.time * 2 + i) * 0.03;
      h.position.set(-Math.sin(a) * dist, -0.25 + this.grab * 0.3 + Math.sin(this.time * 3 + i * 2) * 0.03, -Math.cos(a) * dist);
      h.rotation.set(0.4 + this.grab * 0.6, a + Math.PI, 0);
      h.scale.setScalar(0.6 + this.grab * 0.7);
    });
  }

  private drag(ctx: GameContext, zone: DarkZone): void {
    this.dragging = 1.4;
    this.grab = 0;
    ctx.audio.play('grab', { volume: 1 });
    ctx.audio.play('stinger', { volume: 0.25 });
    ctx.ui.subtitle('[cold hands drag you back into the light]', 2.5);
    ctx.player.mode = 'locked';
    ctx.cinematics.play(
      [
        { dur: 0.5, update: (t) => ctx.events.emit('fade', { amount: t }) },
        {
          dur: 0.4,
          start: () => {
            ctx.player.teleport(zone.returnPos, zone.returnYaw, ctx.player.crawling);
            ctx.player.mode = 'locked';
            if (ctx.lumo.state === 'follow') ctx.lumo.frighten(1.5);
          },
        },
        { dur: 0.5, update: (t) => ctx.events.emit('fade', { amount: 1 - t }), end: () => (ctx.player.mode = 'normal') },
      ],
      () => {
        ctx.player.mode = 'normal';
        for (const h of this.hands) h.visible = false;
      },
    );
    ctx.ui.hint(zone.deep ? 'The darkness here is too deep. Light the way with LUMO on a brass perch.' : 'Stay in LUMO’s light.', 4.5);
  }
}
