import * as THREE from 'three';

/** Material tags used by piece templates; resolved per instance colour. */
export type MatTag =
  | 'body'
  | 'floor'
  | 'glass'
  | 'metal'
  | 'dark'
  | 'accent'
  | 'white'
  | 'glow'
  | 'checker'
  | 'chevron'
  | 'hazard'
  | 'rubber'
  | 'wood'
  | 'bannerStart'
  | 'bannerFinish'
  | 'cloth'
  | 'bulb'
  | 'sign'
  | 'stripes';

export const TRACK_COLORS = ['#3a86ff', '#ff5d8f', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607', '#00b4d8', '#f1f1f1', '#2b2d42'];

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

function banner(text: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTex(512, 128, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 512, 128);
    // checker borders
    for (let i = 0; i < 32; i += 1) {
      c.fillStyle = i % 2 ? '#111' : '#fff';
      c.fillRect(i * 16, 0, 16, 12);
      c.fillStyle = i % 2 ? '#fff' : '#111';
      c.fillRect(i * 16, 116, 16, 12);
    }
    c.fillStyle = fg;
    c.font = '900 72px "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 68);
  });
}

export class MaterialLib {
  private cache = new Map<string, THREE.Material>();
  readonly checkerTex = canvasTex(
    64,
    64,
    (c) => {
      for (let y = 0; y < 4; y += 1)
        for (let x = 0; x < 4; x += 1) {
          c.fillStyle = (x + y) % 2 ? '#141414' : '#fafafa';
          c.fillRect(x * 16, y * 16, 16, 16);
        }
    },
    true,
  );
  readonly chevronTex = canvasTex(
    128,
    128,
    (c) => {
      c.fillStyle = '#00000000';
      c.clearRect(0, 0, 128, 128);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 18;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(30, 18);
      c.lineTo(84, 64);
      c.lineTo(30, 110);
      c.stroke();
    },
    true,
  );
  readonly hazardTex = canvasTex(
    128,
    128,
    (c) => {
      c.fillStyle = '#ffd60a';
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#1d1d1d';
      for (let i = -4; i < 8; i += 1) {
        c.beginPath();
        c.moveTo(i * 32, 0);
        c.lineTo(i * 32 + 16, 0);
        c.lineTo(i * 32 + 16 + 128, 128);
        c.lineTo(i * 32 + 128, 128);
        c.fill();
      }
    },
    true,
  );
  readonly woodTex = canvasTex(
    128,
    128,
    (c) => {
      c.fillStyle = '#c98b52';
      c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 40; i += 1) {
        c.strokeStyle = `rgba(90,50,20,${0.08 + (i % 5) * 0.03})`;
        c.lineWidth = 1 + (i % 3);
        c.beginPath();
        const y = (i * 37) % 128;
        c.moveTo(0, y);
        c.bezierCurveTo(40, y + 6, 80, y - 6, 128, y + 2);
        c.stroke();
      }
    },
    true,
  );
  readonly startTex = banner('START', '#06d6a0', '#ffffff');
  readonly finishTex = banner('FINISH', '#ff5d8f', '#ffffff');
  envMap: THREE.Texture | null = null;

  get(tag: MatTag, color = '#3a86ff'): THREE.Material {
    const key = `${tag}|${color}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mat = this.create(tag, color);
    this.cache.set(key, mat);
    return mat;
  }

  private create(tag: MatTag, color: string): THREE.Material {
    const c = new THREE.Color(color);
    const side = THREE.DoubleSide;
    switch (tag) {
      case 'body':
        return new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.05, side });
      case 'floor': {
        const f = c.clone().lerp(new THREE.Color('#ffffff'), 0.55);
        return new THREE.MeshStandardMaterial({ color: f, roughness: 0.3, metalness: 0.0, side });
      }
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: c.clone().lerp(new THREE.Color('#ffffff'), 0.6),
          roughness: 0.05,
          metalness: 0,
          transparent: true,
          opacity: 0.26,
          side,
          depthWrite: false,
          clearcoat: 1,
          envMapIntensity: 1.4,
        });
      case 'metal':
        return new THREE.MeshStandardMaterial({ color: '#c9d2dc', roughness: 0.25, metalness: 0.9 });
      case 'dark':
        return new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.5, metalness: 0.4 });
      case 'accent':
        return new THREE.MeshStandardMaterial({ color: c.clone().offsetHSL(0.08, 0.05, 0.05), roughness: 0.35 });
      case 'white':
        return new THREE.MeshStandardMaterial({ color: '#f8f9fb', roughness: 0.45 });
      case 'glow':
        return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.4 });
      case 'bulb':
        return new THREE.MeshStandardMaterial({ color: '#333', emissive: c, emissiveIntensity: 0.0, roughness: 0.3 });
      case 'checker':
        return new THREE.MeshStandardMaterial({ map: this.checkerTex, roughness: 0.5, side, polygonOffset: true, polygonOffsetFactor: -2 });
      case 'chevron':
        return new THREE.MeshBasicMaterial({
          map: this.chevronTex,
          color: c,
          transparent: true,
          depthWrite: false,
          side,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          blending: THREE.AdditiveBlending,
        });
      case 'hazard':
        return new THREE.MeshStandardMaterial({ map: this.hazardTex, roughness: 0.5 });
      case 'rubber':
        return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
      case 'wood':
        return new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.7 });
      case 'bannerStart':
        return new THREE.MeshStandardMaterial({ map: this.startTex, roughness: 0.6, side });
      case 'bannerFinish':
        return new THREE.MeshStandardMaterial({ map: this.finishTex, roughness: 0.6, side });
      case 'cloth':
        return new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side });
      case 'stripes':
        return new THREE.MeshStandardMaterial({ color: c, vertexColors: true, roughness: 0.35, side });
      case 'sign':
        return new THREE.MeshStandardMaterial({ color: '#fff4d6', roughness: 0.6, side });
      default:
        return new THREE.MeshStandardMaterial({ color: c });
    }
  }

  /** Assign real materials to a template clone. */
  applyTo(root: THREE.Object3D, color: string): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tags = mesh.userData.mats as MatTag[] | undefined;
      if (!tags) return;
      const colorOverride = mesh.userData.color as string | undefined;
      mesh.material = tags.length === 1 ? this.get(tags[0], colorOverride ?? color) : tags.map((t) => this.get(t, colorOverride ?? color));
    });
  }
}

export const materials = new MaterialLib();
