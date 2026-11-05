import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Quality } from './Settings';
import { setTextureAnisotropy } from '../art/Textures';

const AtmosShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uFear: { value: 0 },
    uVignette: { value: 0.42 },
    uFlash: { value: 0 },
    uFade: { value: 0 },
    uLift: { value: new THREE.Color(0.02, 0.025, 0.05) },
    uGain: { value: new THREE.Color(1.04, 0.98, 0.92) },
    uGrain: { value: 0.028 },
    uHurt: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFear, uVignette, uFlash, uFade, uGrain, uHurt;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);
      // Fear: subtle lens breathing and chroma split at the edges only.
      float pulse = sin(uTime * (2.0 + uFear * 4.0)) * 0.5 + 0.5;
      float ca = (0.0015 + uFear * 0.006) * r * r * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // grade: lift / gain, gentle S-curve
      col = col * uGain + uLift * (1.0 - col);
      // fear desaturation and cool shift
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(luma) * vec3(0.92, 0.95, 1.08), uFear * 0.45);
      // lightning flash (cold) on top
      col += vec3(0.55, 0.62, 0.8) * uFlash * (0.4 + 0.6 * (1.0 - r));
      // peripheral darkness grows with fear
      float vig = smoothstep(0.85 - uVignette * 0.5 - uFear * 0.28 - pulse * uFear * 0.05, 0.15, r);
      col *= mix(1.0, vig, 0.85);
      // hurt / shadow-hand red-black tint
      col = mix(col, col * vec3(0.55, 0.18, 0.22), uHurt * smoothstep(0.1, 0.7, r));
      // film grain
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0) - 0.5;
      col += g * uGrain * (1.0 + uFear);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export interface QualityProfile {
  dpr: number;
  shadows: boolean;
  shadowSize: number;
  bloom: boolean;
  samples: number;
  particles: number;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { dpr: 1, shadows: false, shadowSize: 512, bloom: false, samples: 0, particles: 0.4 },
  medium: { dpr: 1.5, shadows: true, shadowSize: 1024, bloom: false, samples: 2, particles: 0.75 },
  high: { dpr: 2, shadows: true, shadowSize: 2048, bloom: true, samples: 4, particles: 1 },
};

export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.03, 60);
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private atmos: ShaderPass;
  private bloom: UnrealBloomPass | null = null;
  private output: OutputPass;
  profile: QualityProfile = QUALITY.medium;
  quality: Quality = 'medium';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setTextureAnisotropy(Math.min(4, this.renderer.capabilities.getMaxAnisotropy()));

    this.composer = new EffectComposer(this.renderer, this.makeTarget(2));
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.atmos = new ShaderPass(AtmosShader);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.atmos);
    this.composer.addPass(this.output);
    this.resize(true);
  }

  get uniforms() {
    return this.atmos.uniforms as typeof AtmosShader.uniforms;
  }

  private makeTarget(samples: number): THREE.WebGLRenderTarget {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples,
    });
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.profile = QUALITY[quality];
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.scene.traverse((o) => {
      const light = o as THREE.DirectionalLight;
      if (light.isLight && light.shadow) {
        light.castShadow = this.profile.shadows && Boolean(light.userData.wantsShadow);
        if (light.shadow.mapSize.x !== this.profile.shadowSize) {
          light.shadow.mapSize.set(this.profile.shadowSize, this.profile.shadowSize);
          light.shadow.map?.dispose();
          light.shadow.map = null;
        }
      }
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.needsUpdate = true;
      }
    });
    // Rebuild composer chain with the right MSAA and bloom.
    this.composer.dispose();
    this.composer = new EffectComposer(this.renderer, this.makeTarget(this.profile.samples));
    this.composer.addPass(this.renderPass);
    if (this.profile.bloom) {
      this.bloom = this.bloom ?? new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.82);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(this.atmos);
    this.composer.addPass(this.output);
    this.resize(true);
  }

  /** Configure a light for shadows according to quality (call after adding it). */
  configureShadowLight(light: THREE.DirectionalLight | THREE.SpotLight): void {
    light.userData.wantsShadow = true;
    light.castShadow = this.profile.shadows;
    light.shadow.mapSize.set(this.profile.shadowSize, this.profile.shadowSize);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.004;
  }

  resize(force = false): boolean {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.profile.dpr);
    const bw = Math.floor(width * dpr);
    const bh = Math.floor(height * dpr);
    if (!force && this.canvas.width === bw && this.canvas.height === bh) return false;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.bloom?.setSize(Math.floor(bw / 2), Math.floor(bh / 2));
    this.camera.aspect = width / height;
    // Keep horizontal framing sane in portrait phones.
    this.camera.fov = this.camera.aspect < 1 ? 82 : 72;
    this.camera.updateProjectionMatrix();
    return true;
  }

  render(time: number): void {
    this.uniforms.uTime.value = time;
    this.renderer.info.reset();
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
