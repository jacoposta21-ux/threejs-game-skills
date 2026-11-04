import * as THREE from 'three';
import { CharacterModel } from '../characters/CharacterModel';
import { HOSTS, HOST_ORDER, type HostKind } from '../characters/Archetypes';
import type { Materials } from '../world/Materials';

/** Renders each host's head-and-shoulders once into data URLs for UI cards. */
export function renderPortraits(renderer: THREE.WebGLRenderer, mats: Materials): Record<HostKind, string> {
  const out = {} as Record<HostKind, string>;
  const size = 192;
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#6a5a8a', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(2, 3, 4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const prevTarget = renderer.getRenderTarget();
  const prevShadow = renderer.shadowMap.enabled;
  for (const id of HOST_ORDER) {
    const def = HOSTS[id];
    const m = new CharacterModel(def.spec, mats, 1);
    m.emotion = 'happy';
    m.update(0.016, 0, false, true, 0, 0);
    m.shadow.visible = false;
    scene.add(m.root);
    m.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    m.head.getWorldPosition(head);
    const r = m.headR;
    const extra = id === 'chef' || id === 'police' || id === 'mayor' ? r * 0.6 : id === 'singer' ? r * 0.5 : 0;
    const target = new THREE.Vector3(0, head.y - r * 0.35 + extra * 0.5, 0);
    const dist = (r * 3.3 + extra * 1.6) / Math.tan(THREE.MathUtils.degToRad(15));
    cam.position.set(dist * 0.32, target.y + r * 0.4, dist);
    cam.lookAt(target);
    scene.background = new THREE.Color(def.color).lerp(new THREE.Color('#ffffff'), 0.25);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    // Flip Y while copying.
    for (let y = 0; y < size; y += 1) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(pixels.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    out[id] = canvas.toDataURL('image/png');
    scene.remove(m.root);
    m.dispose();
  }
  renderer.setRenderTarget(prevTarget);
  renderer.shadowMap.enabled = prevShadow;
  rt.dispose();
  return out;
}
