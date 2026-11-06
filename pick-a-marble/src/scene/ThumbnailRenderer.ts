import * as THREE from 'three';
import { getDef } from '../track/catalog';
import { getBuild } from '../track/PieceRegistry';
import { materials } from './Materials';

/** Renders small preview images (library thumbnails, saved-track previews). */
export class ThumbnailRenderer {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 400);
  private cache = new Map<string, string>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8899aa', 1.6));
    const d = new THREE.DirectionalLight('#ffffff', 2.2);
    d.position.set(-4, 8, 6);
    this.scene.add(d);
  }

  private capture(w: number, h: number, scene: THREE.Scene, cam: THREE.Camera, jpeg = false): string {
    const target = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearColor(new THREE.Color());
    const prevAlpha = this.renderer.getClearAlpha();
    const prevShadow = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(jpeg ? '#cfe6ff' : '#000000', jpeg ? 1 : 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, w, h, buf);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClear, prevAlpha);
    this.renderer.shadowMap.enabled = prevShadow;
    target.dispose();
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(buf.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.75);
  }

  piece(defId: string): string {
    const hit = this.cache.get(defId);
    if (hit) return hit;
    const def = getDef(defId);
    const vis = getBuild(defId).visual.clone(true);
    materials.applyTo(vis, def.defaultColor);
    const movers = getBuild(defId).movers.map((m) => {
      const o = m.visual();
      materials.applyTo(o, def.defaultColor);
      const st = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
      m.motion(0.6, st, 0);
      o.position.copy(st.pos);
      o.quaternion.copy(st.quat);
      return o;
    });
    const g = new THREE.Group();
    g.add(vis, ...movers);
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.cam.aspect = 4 / 3;
    this.cam.position.copy(c).add(new THREE.Vector3(-0.55, 0.62, 0.8).normalize().multiplyScalar(size * 1.55));
    this.cam.lookAt(c);
    this.cam.updateProjectionMatrix();
    const url = this.capture(160, 120, this.scene, this.cam);
    this.scene.remove(g);
    this.cache.set(defId, url);
    return url;
  }

  /** Track preview from an existing scene. */
  track(scene: THREE.Scene, box: THREE.Box3): string {
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 1200);
    const c = box.getCenter(new THREE.Vector3());
    const size = Math.max(10, box.getSize(new THREE.Vector3()).length());
    cam.position.copy(c).add(new THREE.Vector3(0.8, 0.85, 1).normalize().multiplyScalar(size * 1.05));
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    return this.capture(256, 144, scene, cam, true);
  }
}
