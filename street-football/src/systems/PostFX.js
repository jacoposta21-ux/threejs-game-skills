import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Optional finishing pass (Medium/High): HDR render → half-resolution bloom on
 * the brightest highlights (sun disc, lamp heads, specular on posts) → tone
 * mapping and sRGB output. Two passes beyond the scene render, inside the
 * desktop budget; Low quality renders straight to the canvas.
 */
export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.enabled = true;
    this.size = new THREE.Vector2();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  resize() {
    this.renderer.getSize(this.size);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.size.x, this.size.y);
    // Bloom at half resolution: cheap and soft.
    this.bloom.resolution.set(Math.max(1, (this.size.x * pr) / 2), Math.max(1, (this.size.y * pr) / 2));
  }

  /** Brief bloom boost for big moments (goals). */
  pulse(amount) {
    this.boost = Math.max(this.boost ?? 0, amount);
  }

  render(dt) {
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt * 0.8);
    this.bloom.strength = 0.32 + (this.boost ?? 0);
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
