/** Renderer, golden-hour lighting, sky, fog, post-processing and quality levels. */
import {
  ACESFilmicToneMapping,
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  NoToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';

export type Quality = 'high' | 'low';

const SKY_TOP = new Color(0x4d9fe0);
const SKY_HORIZON = new Color(0xf7c08a);
export const FOG_COLOR = new Color(0xeec7a0);
const SUN_DIR = new Vector3(-0.62, 0.42, 0.66).normalize();

export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(58, 16 / 9, 0.1, 900);
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private composer: EffectComposer | null = null;
  private sky: Mesh;
  quality: Quality = 'high';
  private envMap: Texture | null = null;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.scene.fog = new Fog(FOG_COLOR, 70, 330);
    this.scene.background = FOG_COLOR.clone();

    // sky dome
    const skyMat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON }, sun: { value: SUN_DIR } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, top, pow(smoothstep(-0.05, 0.55, h), 0.8));
          float s = max(dot(normalize(vDir), sun), 0.0);
          c += vec3(1.0, 0.75, 0.45) * pow(s, 12.0) * 0.35 + vec3(1.0, 0.9, 0.7) * pow(s, 600.0) * 2.5;
          // soft cloud band
          float cl = smoothstep(0.55, 0.9, sin(vDir.x * 9.0 + vDir.z * 4.0) * 0.5 + 0.5) * smoothstep(0.08, 0.2, h) * smoothstep(0.45, 0.22, h);
          c = mix(c, vec3(1.0, 0.93, 0.86), cl * 0.35);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new Mesh(new SphereGeometry(800, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.hemi = new HemisphereLight(0xcfe6ff, 0xd9b089, 1.05);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(0xffd3a1, 2.9);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // soft image-based fill from the sky gradient
    try {
      const pm = new PMREMGenerator(this.renderer);
      const envScene = new Scene();
      envScene.add(new Mesh(new SphereGeometry(10, 16, 8), skyMat.clone()));
      this.envMap = pm.fromScene(envScene, 0.04).texture;
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 0.35;
      pm.dispose();
    } catch {
      /* optional */
    }
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1);
    this.renderer.setPixelRatio(dpr);
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null as never;
    }
    this.renderer.shadowMap.type = PCFShadowMap;
    if (q === 'high') {
      this.renderer.toneMapping = NoToneMapping;
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType });
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const bloom = new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.15, intensity: 0.9, mipmapBlur: true, radius: 0.6 });
        const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
        const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
        this.composer.addPass(new EffectPass(this.camera, bloom, tone, vignette));
        this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
      }
    } else {
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
    }
    this.resize(this.width, this.height);
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.composer?.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** Keep the tight shadow frustum and sky centred on the player. */
  follow(x: number, y: number, z: number) {
    // snap to texel grid to avoid shimmering
    const size = 60 / this.sun.shadow.mapSize.x;
    const sx = Math.round(x / size) * size;
    const sz = Math.round(z / size) * size;
    this.sun.position.set(sx + SUN_DIR.x * 80, y + SUN_DIR.y * 80, sz + SUN_DIR.z * 80);
    this.sun.target.position.set(sx, y, sz);
    this.sky.position.copy(this.camera.position);
  }

  render(dt: number) {
    this.renderer.info.reset();
    if (this.quality === 'high' && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  get drawCalls() {
    return this.renderer.info.render.calls;
  }
  get triangles() {
    return this.renderer.info.render.triangles;
  }
}
