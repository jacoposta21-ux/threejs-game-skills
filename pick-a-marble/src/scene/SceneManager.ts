import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Quality } from '../meta/Settings';
import { getEnv, type EnvTheme } from './Environments';
import { materials } from './Materials';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = `
uniform vec3 top;
uniform vec3 bottom;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float night;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(bottom, top, smoothstep(0.35, 1.0, h));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 64.0) * 0.8 + pow(s, 6.0) * 0.12) * (1.0 - night);
  if (night > 0.5) {
    vec3 c = floor(vDir * 300.0);
    float st = step(0.997, hash(c)) * smoothstep(0.45, 0.8, h);
    col += vec3(st);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  readonly sun = new THREE.DirectionalLight('#ffffff', 2.5);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1.2);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly platform = new THREE.Group();
  readonly world = new THREE.Group();
  private decor = new THREE.Group();
  quality: Quality = 'high';
  env: EnvTheme = getEnv('sky');
  areaHalf = 32;
  private maxDpr = 2;
  private clouds: THREE.Object3D[] = [];
  private gridTex: THREE.CanvasTexture;
  private platformTop!: THREE.Mesh;
  private platformEdge!: THREE.Mesh;
  private underside!: THREE.Mesh;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.55;
    materials.envMap = envTex;
    pmrem.dispose();

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(800, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color() },
          bottom: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3(-0.5, 0.6, 0.4) },
          sunColor: { value: new THREE.Color() },
          night: { value: 0 },
        },
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.sun.position.set(-30, 60, 25);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.gridTex = this.makeGridTexture();
    this.scene.add(this.platform, this.world, this.decor);
    this.buildPlatform();
    this.buildDecor();
    this.applyEnv('sky');
  }

  private makeGridTexture(): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const c = cv.getContext('2d') as CanvasRenderingContext2D;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.lineWidth = 3;
    c.strokeRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(0,0,0,0.07)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(64, 0);
    c.lineTo(64, 128);
    c.moveTo(0, 64);
    c.lineTo(128, 64);
    c.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildPlatform(): void {
    this.platform.clear();
    const size = this.areaHalf * 2;
    this.gridTex.repeat.set(size / 4, size / 4);
    this.gridTex.offset.set(0.5, 0.5);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: this.gridTex, roughness: 0.85 }));
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    top.name = 'platformTop';
    this.platformTop = top;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(size + 1.2, 1.4, size + 1.2), new THREE.MeshStandardMaterial({ roughness: 0.5 }));
    edge.position.y = -0.72;
    edge.receiveShadow = true;
    this.platformEdge = edge;
    const under = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.12, size * 0.45, 7, 3), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }));
    under.position.y = -1.4 - size * 0.225;
    const pos = under.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < size * 0.2) {
        pos.setX(i, pos.getX(i) * (0.9 + Math.sin(i * 12.3) * 0.12));
        pos.setZ(i, pos.getZ(i) * (0.9 + Math.cos(i * 7.1) * 0.12));
      }
    }
    under.geometry.computeVertexNormals();
    this.underside = under;
    this.platform.add(top, edge, under);
    this.updateShadowBounds();
  }

  setArea(half: number): void {
    if (half === this.areaHalf) return;
    this.areaHalf = half;
    this.buildPlatform();
    this.applyEnv(this.env.id);
  }

  private buildDecor(): void {
    const rng = (() => {
      let s = 1234567;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const islandMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
    const topMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
    islandMat.name = 'island';
    topMat.name = 'islandTop';
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
      const r = 120 + rng() * 120;
      const s = 6 + rng() * 10;
      const g = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.4, 6), islandMat);
      rock.rotation.x = Math.PI;
      rock.position.y = -s * 0.7;
      const grass = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.02, s, s * 0.25, 6), topMat);
      g.add(rock, grass);
      for (let k = 0; k < 3; k += 1) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(s * 0.18, s * 0.6, 5), topMat);
        tree.position.set((rng() - 0.5) * s, s * 0.4, (rng() - 0.5) * s);
        g.add(tree);
      }
      g.position.set(Math.cos(a) * r, -20 + rng() * 40, Math.sin(a) * r);
      g.userData.bob = rng() * 6;
      this.decor.add(g);
    }
    const cloudMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    cloudMat.name = 'cloud';
    for (let i = 0; i < 16; i += 1) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k += 1) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + rng() * 5, 0), cloudMat);
        b.position.set(k * 5 - n * 2.5, rng() * 2, (rng() - 0.5) * 4);
        b.scale.y = 0.6;
        c.add(b);
      }
      const a = rng() * Math.PI * 2;
      const r = 90 + rng() * 200;
      c.position.set(Math.cos(a) * r, -45 + rng() * 25, Math.sin(a) * r);
      c.userData.speed = 0.4 + rng() * 0.6;
      this.clouds.push(c);
      this.decor.add(c);
    }
  }

  applyEnv(id: string): void {
    const env = getEnv(id);
    this.env = env;
    const u = this.sky.material.uniforms;
    (u.top.value as THREE.Color).set(env.skyTop);
    (u.bottom.value as THREE.Color).set(env.skyBottom);
    (u.sunColor.value as THREE.Color).set(env.sun);
    u.night.value = env.night ? 1 : 0;
    this.scene.fog = new THREE.Fog(env.fog, 140, 520);
    this.sun.color.set(env.sun);
    this.sun.intensity = env.sunIntensity;
    this.hemi.color.set(env.hemiSky);
    this.hemi.groundColor.set(env.hemiGround);
    this.hemi.intensity = env.hemiIntensity;
    (this.platformTop.material as THREE.MeshStandardMaterial).color.set(env.platform);
    (this.platformEdge.material as THREE.MeshStandardMaterial).color.set(env.platformEdge);
    (this.underside.material as THREE.MeshStandardMaterial).color.set(env.island);
    this.decor.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !m.name) return;
      if (m.name === 'island') m.color.set(env.island);
      if (m.name === 'islandTop') m.color.set(env.islandTop);
      if (m.name === 'cloud') m.color.set(env.cloud);
    });
    this.scene.environmentIntensity = env.night ? 0.3 : 0.55;
    if (this.bloom) this.bloom.strength = env.night ? 0.75 : 0.45;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.maxDpr = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
    this.renderer.shadowMap.enabled = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
    });
    if (q === 'high') {
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 0.86);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      }
    } else if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloom = null;
    }
    this.resize(true);
    this.applyEnv(this.env.id);
  }

  /** Fit the shadow camera to a region of interest. */
  focusShadows(center: THREE.Vector3, radius: number): void {
    const r = Math.max(20, Math.min(90, radius));
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).add(new THREE.Vector3(-40, 80, 32));
  }

  private updateShadowBounds(): void {
    this.focusShadows(new THREE.Vector3(0, 0, 0), this.areaHalf + 6);
  }

  resize(force = false): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    if (!force && this.canvas.width === Math.floor(w * dpr) && this.canvas.height === Math.floor(h * dpr)) return;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
  }

  update(dt: number, time: number): void {
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 320) c.position.x = -320;
    }
    this.decor.children.forEach((g) => {
      if (g.userData.bob !== undefined) g.position.y += Math.sin(time * 0.4 + g.userData.bob) * 0.01;
    });
    this.sky.position.copy(this.camera.position);
  }

  render(): void {
    this.resize();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
