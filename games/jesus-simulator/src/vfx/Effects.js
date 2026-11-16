import * as THREE from 'three';

const MAX_PARTICLES = 900;
const MAX_RINGS = 14;

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/**
 * Pooled visual effects: one additive particle cloud (single draw call) and a
 * small pool of expanding rings (shockwaves, ripples, healing circles).
 * Everything is fixed-size; old effects are recycled, never allocated per cast.
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.size = new Float32Array(MAX_PARTICLES);
    this.alpha = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 300 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vColor; varying float vAlpha;
        void main(){ vColor = color; vAlpha = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * 300.0 / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha); if (gl_FragColor.a < 0.01) discard; }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.parts = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, g: 0, s: 0.2, r: 1, gr: 1, b: 1, drag: 0 }));
    this.cursor = 0;

    // rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i += 1) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, from: 0.2, to: 3, opacity: 0.8 });
    }
    this.ringCursor = 0;
    this.tmpColor = new THREE.Color();
  }

  /** Spawn a burst of particles. */
  burst({ x, y, z, count = 20, color = '#ffd36b', color2 = null, speed = 2, up = 1, spread = 1, life = 1, gravity = -2, size = 0.25, radius = 0.2, drag = 0.6 }) {
    const c1 = this.tmpColor.set(color);
    const r1 = c1.r; const g1 = c1.g; const b1 = c1.b;
    let r2 = r1; let g2 = g1; let b2 = b1;
    if (color2) { const c2 = this.tmpColor.set(color2); r2 = c2.r; g2 = c2.g; b2 = c2.b; }
    for (let i = 0; i < count; i += 1) {
      const p = this.parts[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * radius;
      const sp = speed * (0.4 + Math.random() * 0.8);
      p.x = x + Math.cos(a) * rr;
      p.y = y + (Math.random() - 0.5) * radius;
      p.z = z + Math.sin(a) * rr;
      p.vx = Math.cos(a) * sp * spread;
      p.vz = Math.sin(a) * sp * spread;
      p.vy = up * (0.5 + Math.random()) * speed;
      p.g = gravity;
      p.max = p.life = life * (0.6 + Math.random() * 0.6);
      p.s = size * (0.6 + Math.random() * 0.8);
      const t = Math.random();
      p.r = r1 + (r2 - r1) * t; p.gr = g1 + (g2 - g1) * t; p.b = b1 + (b2 - b1) * t;
      p.drag = drag;
    }
  }

  /** Directional spray (cone) — e.g. the Divine Push wave. */
  spray({ x, y, z, dirX, dirZ, count = 40, color = '#fff3c4', speed = 9, spreadAngle = 0.6, life = 0.6, size = 0.35 }) {
    const base = Math.atan2(dirX, dirZ);
    for (let i = 0; i < count; i += 1) {
      const p = this.parts[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const a = base + (Math.random() - 0.5) * 2 * spreadAngle;
      const sp = speed * (0.5 + Math.random() * 0.7);
      p.x = x; p.y = y + (Math.random() - 0.3) * 0.9; p.z = z;
      p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; p.vy = (Math.random() - 0.3) * 1.5;
      p.g = 0; p.drag = 2.2;
      p.max = p.life = life * (0.6 + Math.random() * 0.6);
      p.s = size * (0.6 + Math.random());
      const c = this.tmpColor.set(color);
      p.r = c.r; p.gr = c.g; p.b = c.b;
    }
  }

  ring({ x, y, z, color = '#ffe8a0', from = 0.3, to = 4, life = 0.6, opacity = 0.8 }) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    r.mesh.position.set(x, y, z);
    r.mesh.material.color.set(color);
    r.mesh.visible = true;
    Object.assign(r, { life, max: life, from, to, opacity });
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = this.parts[i];
      if (p.life <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -999; }
        continue;
      }
      alive += 1;
      p.life -= dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.gr; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.s * (0.4 + 0.6 * t);
      this.alpha[i] = Math.min(1, t * 2.2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    this.alive = alive;
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.max;
      const s = r.from + (r.to - r.from) * (1 - (1 - t) * (1 - t));
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = r.opacity * (1 - t);
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  stats() {
    return { particles: this.alive || 0, rings: this.rings.filter((r) => r.life > 0).length };
  }
}
