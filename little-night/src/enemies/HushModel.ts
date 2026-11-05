import * as THREE from 'three';
import { softDot } from '../art/Textures';

/** Shared shadow-flesh shader: near-black body, cold violet rim, ragged smoky edges. */
function shadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: true,
    transparent: false,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uRim: { value: new THREE.Color('#3b3166') },
        uFade: { value: 1 },
        uReveal: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        // Subtle boil so the silhouette never looks rigid.
        p += normal * (sin(uTime * 3.0 + position.y * 9.0 + position.x * 7.0) * 0.004);
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uRim;
      uniform float uFade;
      uniform float uReveal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 41.3))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        float n = noise(vWorld * 6.0 + vec3(0.0, uTime * 0.8, 0.0));
        // Ragged dissolve at grazing angles and as it fades.
        float cut = fres * 0.35 + (1.0 - uFade) * 1.1;
        if (n < cut - 0.2) discard;
        vec3 base = vec3(0.012, 0.008, 0.02);
        vec3 col = base + uRim * pow(fres, 2.6) * (0.14 + 0.1 * n) + vec3(0.25, 0.2, 0.3) * uReveal * fres;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
  });
}

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  end: THREE.Group;
}

export type HushPose = 'walk' | 'search' | 'lunge' | 'kneel' | 'idle' | 'shush';

export class HushModel {
  readonly root = new THREE.Group();
  readonly material = shadowMaterial();
  private shroudMat!: THREE.ShaderMaterial;
  private shroud!: THREE.Mesh;
  readonly hips = new THREE.Group();
  readonly spine = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly headTop = new THREE.Object3D();
  private legs: Limb[] = [];
  private arms: Limb[] = [];
  private fingers: THREE.Group[][] = [];
  private gait = 0;
  private time = 0;
  private headJerk = 0;
  private headJerkTarget = 0;
  private jerkTimer = 2;
  private smoke: THREE.Points;
  private smokeData: { life: Float32Array; vel: Float32Array };
  private lipMat: THREE.MeshBasicMaterial;
  lean = 0;
  pose: HushPose = 'walk';
  private poseBlend = { search: 0, lunge: 0, kneel: 0, shush: 1 };

  constructor() {
    const m = this.material;
    const seg = (len: number, r0: number, r1: number) => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 7, 3);
      g.translate(0, -len / 2, 0);
      return new THREE.Mesh(g, m);
    };
    this.root.add(this.hips);
    this.hips.position.y = 1.16;
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m);
    pelvis.scale.set(1.3, 0.8, 0.8);
    this.hips.add(pelvis);

    for (const s of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(s * 0.09, -0.02, 0);
      upper.add(seg(0.62, 0.045, 0.085));
      const lower = new THREE.Group();
      lower.position.y = -0.62;
      lower.add(seg(0.56, 0.03, 0.05));
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), m);
      lower.add(knee);
      const end = new THREE.Group();
      end.position.y = -0.56;
      const foot = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24, 6), m);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(0, -0.01, 0.08);
      end.add(foot);
      lower.add(end);
      upper.add(lower);
      this.hips.add(upper);
      this.legs.push({ upper, lower, end });
    }

    this.hips.add(this.spine);
    const torsoGeo = new THREE.CylinderGeometry(0.2, 0.11, 0.78, 10, 4);
    torsoGeo.translate(0, 0.39, 0);
    // Pinch a ribcage hollow into the torso.
    const pos = torsoGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = 1 - Math.exp(-((y - 0.35) ** 2) / 0.02) * 0.25;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k * 0.7);
    }
    torsoGeo.computeVertexNormals();
    this.spine.add(new THREE.Mesh(torsoGeo, m));
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), m);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.y = 0.76;
    this.spine.add(shoulders);

    // Tattered shroud: flares from the shoulders, ragged hem (vertex-jagged).
    const shroudGeo = new THREE.CylinderGeometry(0.2, 0.42, 1.25, 14, 6, true);
    shroudGeo.translate(0, -0.42, 0);
    const sp = shroudGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i);
      const a = Math.atan2(sp.getZ(i), sp.getX(i));
      if (y < -0.9) sp.setY(i, y - Math.abs(Math.sin(a * 5) * 0.25) - Math.abs(Math.sin(a * 11)) * 0.1);
      sp.setZ(i, sp.getZ(i) * 0.7);
    }
    shroudGeo.computeVertexNormals();
    const shroudMat = this.material.clone();
    shroudMat.side = THREE.DoubleSide;
    this.shroudMat = shroudMat;
    const shroud = new THREE.Mesh(shroudGeo, shroudMat);
    shroud.position.y = 0.72;
    this.spine.add(shroud);
    this.shroud = shroud;

    for (const s of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(s * 0.23, 0.76, 0);
      upper.add(seg(0.58, 0.035, 0.058));
      const lower = new THREE.Group();
      lower.position.y = -0.58;
      lower.add(seg(0.58, 0.024, 0.038));
      const end = new THREE.Group();
      end.position.y = -0.58;
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m);
      palm.scale.set(0.8, 1.3, 0.5);
      end.add(palm);
      const fingers: THREE.Group[] = [];
      for (let f = 0; f < 4; f++) {
        const fg = new THREE.Group();
        fg.position.set((f - 1.5) * 0.017, -0.04, 0);
        const len = f === 1 ? 0.26 : 0.2 - Math.abs(f - 1.5) * 0.02;
        fg.add(seg(len, 0.006, 0.011));
        end.add(fg);
        fingers.push(fg);
      }
      lower.add(end);
      upper.add(lower);
      this.spine.add(upper);
      this.arms.push({ upper, lower, end });
      this.fingers.push(fingers);
    }

    this.neck.position.y = 0.82;
    this.spine.add(this.neck);
    this.neck.add(seg(0.16, 0.035, 0.03).translateY(0.16));
    this.head.position.y = 0.17;
    this.neck.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), m);
    skull.scale.set(0.82, 1.75, 0.95);
    skull.position.y = 0.14;
    this.head.add(skull);
    this.headTop.position.set(0, 0.15, 0.08);
    this.head.add(this.headTop);
    // The only feature: a pale seam where a mouth should be, under the finger.
    this.lipMat = new THREE.MeshBasicMaterial({ color: '#c9c3d8', transparent: true, opacity: 0.55, fog: true });
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0035, 4, 16, Math.PI), this.lipMat);
    lip.position.set(0, 0.03, 0.098);
    lip.rotation.set(0, 0, Math.PI);
    this.head.add(lip);

    // Smoke wisps shed from the body.
    const count = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1));
    this.smokeData = { life: new Float32Array(count), vel: new Float32Array(count * 3) };
    const smokeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: softDot() } },
      vertexShader: /* glsl */ `
        attribute float alpha; attribute float size; varying float vAlpha;
        void main(){ vAlpha = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying float vAlpha;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a * vAlpha; if (a < 0.01) discard; gl_FragColor = vec4(0.015, 0.01, 0.03, a); }
      `,
    });
    this.smoke = new THREE.Points(geo, smokeMat);
    this.smoke.frustumCulled = false;

    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
    });
  }

  /** Smoke lives in world space; add it to the scene beside the root. */
  get smokeObject(): THREE.Points {
    return this.smoke;
  }

  setFade(f: number): void {
    this.material.uniforms.uFade.value = f;
    this.shroudMat.uniforms.uFade.value = f;
    this.lipMat.opacity = 0.55 * f;
    this.root.visible = f > 0.02;
  }

  setReveal(r: number): void {
    this.material.uniforms.uReveal.value = r;
    this.shroudMat.uniforms.uReveal.value = r;
  }

  update(dt: number, speed: number, smokeScale: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.shroudMat.uniforms.uTime.value = this.time;
    this.shroud.rotation.y = Math.sin(this.time * 0.9) * 0.08;
    this.shroud.scale.x = 1 + Math.sin(this.time * 1.7) * 0.03;
    const blend = (key: keyof typeof this.poseBlend, on: boolean, rate = 4) => {
      this.poseBlend[key] += ((on ? 1 : 0) - this.poseBlend[key]) * Math.min(1, dt * rate);
    };
    blend('search', this.pose === 'search');
    blend('lunge', this.pose === 'lunge', 9);
    blend('kneel', this.pose === 'kneel', 1.2);
    blend('shush', this.pose === 'walk' || this.pose === 'idle' || this.pose === 'shush' || this.pose === 'search');
    const { search, lunge, kneel, shush } = this.poseBlend;

    // Gait: slow, over-long strides with a hitch, like it forgets how legs work.
    const stride = speed > 0.05 ? 1 : 0;
    this.gait += dt * speed * 2.1;
    const g = this.gait;
    const hitch = Math.max(0, Math.sin(g * 0.5)) * 0.15;
    for (let i = 0; i < 2; i++) {
      const ph = g + i * Math.PI;
      const leg = this.legs[i];
      const swing = Math.sin(ph) * 0.55 * stride;
      const lift = Math.max(0, Math.cos(ph)) * 0.9 * stride;
      leg.upper.rotation.x = -swing - lift * 0.35 - kneel * 1.4;
      leg.lower.rotation.x = lift + 0.05 + kneel * 2.1;
      leg.end.rotation.x = -lift * 0.4;
    }
    const bob = Math.abs(Math.sin(g)) * 0.05 * stride;
    this.hips.position.y = 1.16 - bob - kneel * 0.62 + hitch * 0.1 * stride;
    this.hips.rotation.y = Math.sin(g) * 0.12 * stride;
    this.hips.rotation.z = Math.sin(g) * 0.04 * stride;

    // Hunch, plus searching lean and lunge.
    this.spine.rotation.x = 0.32 + search * 0.45 + lunge * 0.7 + kneel * 0.3 + this.lean;
    this.spine.rotation.z = Math.sin(this.time * 0.6) * 0.04;

    // Head: tilted, with occasional sharp jerks.
    this.jerkTimer -= dt;
    if (this.jerkTimer <= 0) {
      this.jerkTimer = 1.2 + Math.random() * 3.5;
      this.headJerkTarget = (Math.random() - 0.5) * 1.1;
    }
    this.headJerk += (this.headJerkTarget - this.headJerk) * Math.min(1, dt * 18);
    this.neck.rotation.x = -0.5 - search * 0.3 - lunge * 0.4;
    this.head.rotation.z = 0.35 + this.headJerk * 0.4;
    this.head.rotation.y = this.headJerk * (1 - lunge) * 0.6;
    this.head.rotation.x = -0.15 + search * 0.2;

    // Left arm dangles to the knee; right arm holds a finger to the "mouth".
    const armSway = Math.sin(g + Math.PI) * 0.25 * stride;
    const left = this.arms[0];
    left.upper.rotation.set(armSway + lunge * -1.4, 0, -0.08 - lunge * 0.3);
    left.lower.rotation.set(-0.15 - lunge * 0.3 + Math.sin(this.time * 1.3) * 0.05, 0, 0);
    const right = this.arms[1];
    const shushK = shush * (1 - lunge);
    right.upper.rotation.set(THREE.MathUtils.lerp(-armSway, -1.1, shushK) - lunge * 1.4, 0, THREE.MathUtils.lerp(0.08, -0.55, shushK) + lunge * 0.3);
    right.lower.rotation.set(THREE.MathUtils.lerp(-0.15, -2.35, shushK) - lunge * 0.3, THREE.MathUtils.lerp(0, 0.35, shushK), 0);
    right.end.rotation.set(THREE.MathUtils.lerp(0, -0.25, shushK), 0, 0);
    this.fingers.forEach((set, side) => {
      set.forEach((f, i) => {
        const point = side === 1 && i === 1 ? shushK : 0;
        f.rotation.x = THREE.MathUtils.lerp(0.5 + Math.sin(this.time * 2 + i) * 0.15, 0, Math.max(point, lunge));
        f.rotation.z = (i - 1.5) * 0.08 * (1 + lunge * 2);
      });
    });
    this.updateSmoke(dt, smokeScale);
  }

  private updateSmoke(dt: number, scale: number): void {
    const geo = this.smoke.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const alpha = geo.attributes.alpha as THREE.BufferAttribute;
    const size = geo.attributes.size as THREE.BufferAttribute;
    const { life, vel } = this.smokeData;
    const active = Math.floor(life.length * scale);
    const base = new THREE.Vector3();
    for (let i = 0; i < life.length; i++) {
      if (i >= active || !this.root.visible) {
        alpha.setX(i, 0);
        continue;
      }
      life[i] -= dt;
      if (life[i] <= 0) {
        life[i] = 1.2 + Math.random() * 1.6;
        const parts = [this.head, this.spine, this.arms[0].lower, this.arms[1].lower, this.legs[0].lower, this.legs[1].lower];
        parts[i % parts.length].getWorldPosition(base);
        pos.setXYZ(i, base.x + (Math.random() - 0.5) * 0.25, base.y + (Math.random() - 0.5) * 0.3, base.z + (Math.random() - 0.5) * 0.25);
        vel[i * 3] = (Math.random() - 0.5) * 0.15;
        vel[i * 3 + 1] = 0.12 + Math.random() * 0.2;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      }
      pos.setXYZ(i, pos.getX(i) + vel[i * 3] * dt, pos.getY(i) + vel[i * 3 + 1] * dt, pos.getZ(i) + vel[i * 3 + 2] * dt);
      const t = life[i];
      alpha.setX(i, Math.min(1, t) * 0.55 * this.material.uniforms.uFade.value);
      size.setX(i, 0.18 + (2.5 - t) * 0.12);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
    size.needsUpdate = true;
  }
}
