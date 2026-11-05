import * as THREE from 'three';
import { CharacterModel, hatHeight, type CharacterSpec } from '../characters/CharacterModel';
import { HOSTS, HOST_ORDER, type HostKind } from '../characters/Archetypes';
import type { Materials } from '../world/Materials';

const SIZE = 192;

/** Shared offscreen rig: renders a character's head-and-shoulders into a data URL. */
class PortraitRig {
  private readonly rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.SRGBColorSpace });
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly img: ImageData;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly mats: Materials,
  ) {
    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#6a5a8a', 2.2));
    const key = new THREE.DirectionalLight('#ffffff', 2.4);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(SIZE, SIZE);
  }

  render(spec: CharacterSpec, bg: string): string {
    const m = new CharacterModel(spec, this.mats, 1);
    m.emotion = 'happy';
    m.update(0.016, 0, false, true, 0, 0);
    m.shadow.visible = false;
    this.scene.add(m.root);
    m.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    m.head.getWorldPosition(head);
    const r = m.headR;
    const extra = hatHeight(spec.hat.type, r) * 0.6 + (spec.hair.type === 'beehive' ? r * 0.5 : 0);
    const target = new THREE.Vector3(0, head.y - r * 0.35 + extra * 0.5, 0);
    const dist = (r * 3.3 + extra * 1.6) / Math.tan(THREE.MathUtils.degToRad(15));
    this.cam.position.set(dist * 0.32, target.y + r * 0.4, dist);
    this.cam.lookAt(target);
    this.scene.background = new THREE.Color(bg).lerp(new THREE.Color('#ffffff'), 0.25);
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.cam);
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, SIZE, SIZE, this.pixels);
    this.renderer.setRenderTarget(prevTarget);
    for (let y = 0; y < SIZE; y += 1) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      this.img.data.set(this.pixels.subarray(src, src + SIZE * 4), y * SIZE * 4);
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.scene.remove(m.root);
    m.dispose();
    return this.canvas.toDataURL('image/png');
  }
}

let rig: PortraitRig | null = null;

function getRig(renderer: THREE.WebGLRenderer, mats: Materials): PortraitRig {
  if (!rig) rig = new PortraitRig(renderer, mats);
  return rig;
}

/** Story hosts, rendered once at startup. */
export function renderPortraits(renderer: THREE.WebGLRenderer, mats: Materials): Record<HostKind, string> {
  const out = {} as Record<HostKind, string>;
  const r = getRig(renderer, mats);
  for (const id of HOST_ORDER) out[id] = r.render(HOSTS[id].spec, HOSTS[id].color);
  return out;
}

/** Any townsperson, rendered on demand (extras collection, HUD). */
export function renderPortrait(renderer: THREE.WebGLRenderer, mats: Materials, spec: CharacterSpec, bg: string): string {
  return getRig(renderer, mats).render(spec, bg);
}
