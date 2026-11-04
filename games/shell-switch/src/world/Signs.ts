import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const COLS = 4;
const ROWS = 24;
const SLOT_W = 256;
const SLOT_H = 80;

export interface SignStyle {
  bg: string;
  fg: string;
  border?: string;
  font?: string;
  size?: number;
  shape?: 'rect' | 'round' | 'banner' | 'poster';
  sub?: string;
}

/**
 * Every painted sign, poster and label in town shares one canvas atlas and is
 * merged into a single mesh: readable storytelling text for one draw call.
 */
export class SignAtlas {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private next = 0;
  readonly texture: THREE.CanvasTexture;
  private readonly parts: THREE.BufferGeometry[] = [];
  readonly material: THREE.MeshBasicMaterial;

  constructor() {
    this.canvas.width = COLS * SLOT_W;
    this.canvas.height = ROWS * SLOT_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide });
  }

  private slot(text: string, style: SignStyle): { u0: number; v0: number; u1: number; v1: number } {
    const i = this.next++;
    if (i >= COLS * ROWS) throw new Error('Sign atlas full');
    const cx = (i % COLS) * SLOT_W;
    const cy = Math.floor(i / COLS) * SLOT_H;
    const g = this.ctx;
    g.save();
    g.translate(cx, cy);
    const pad = 4;
    g.fillStyle = style.bg;
    const shape = style.shape ?? 'round';
    g.beginPath();
    if (shape === 'round' || shape === 'poster') g.roundRect(pad, pad, SLOT_W - pad * 2, SLOT_H - pad * 2, shape === 'poster' ? 6 : 18);
    else if (shape === 'banner') {
      g.moveTo(pad, pad);
      g.lineTo(SLOT_W - pad, pad);
      g.lineTo(SLOT_W - pad - 16, SLOT_H / 2);
      g.lineTo(SLOT_W - pad, SLOT_H - pad);
      g.lineTo(pad, SLOT_H - pad);
      g.lineTo(pad + 16, SLOT_H / 2);
      g.closePath();
    } else g.rect(pad, pad, SLOT_W - pad * 2, SLOT_H - pad * 2);
    g.fill();
    if (style.border) {
      g.lineWidth = 5;
      g.strokeStyle = style.border;
      g.stroke();
    }
    g.fillStyle = style.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = style.size ?? 34;
    const font = style.font ?? '"Trebuchet MS", "Avenir Next", Verdana, sans-serif';
    g.font = `900 ${size}px ${font}`;
    while (g.measureText(text).width > SLOT_W - 34 && size > 12) {
      size -= 2;
      g.font = `900 ${size}px ${font}`;
    }
    const y = style.sub ? SLOT_H * 0.4 : SLOT_H / 2 + 2;
    g.fillText(text, SLOT_W / 2, y);
    if (style.sub) {
      g.font = `700 ${Math.round(size * 0.48)}px ${font}`;
      g.globalAlpha = 0.85;
      g.fillText(style.sub, SLOT_W / 2, SLOT_H * 0.76);
    }
    g.restore();
    const W = COLS * SLOT_W;
    const H = ROWS * SLOT_H;
    return { u0: cx / W, u1: (cx + SLOT_W) / W, v0: 1 - (cy + SLOT_H) / H, v1: 1 - cy / H };
  }

  /** Add a sign facing `ry` (0 = facing +Z). Width in metres; height follows slot aspect. */
  add(text: string, x: number, y: number, z: number, width: number, ry: number, style: SignStyle): void {
    const uv = this.slot(text, style);
    const h = width * (SLOT_H / SLOT_W);
    const geo = new THREE.PlaneGeometry(width, h);
    const a = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i += 1) {
      const u = a.getX(i);
      const v = a.getY(i);
      a.setXY(i, uv.u0 + u * (uv.u1 - uv.u0), uv.v0 + v * (uv.v1 - uv.v0));
    }
    geo.rotateY(ry);
    geo.translate(x, y, z);
    this.parts.push(geo);
  }

  build(): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts.length = 0;
    if (!merged) return null;
    this.texture.needsUpdate = true;
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.name = 'signs';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}
