import * as THREE from 'three';

const MAX = 600;

/** Pooled CPU particles (dust, confetti, sparks) + a ribbon trail for hard shots. */
export class Vfx {
  constructor(scene, rng) {
    this.rng = rng;
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(aSize * uScale / -mv.z, 16.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.2, d));
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.particles = [];
    for (let i = 0; i < MAX; i += 1) {
      this.particles.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 0.1, drag: 1, grav: 0, color: new THREE.Color(), fade: 1 });
    }
    this.cursor = 0;
    this.trail = new BallTrail(scene);
    this.motes = new Motes(scene, rng);
  }

  setPixelScale(heightPx, fovDeg) {
    this.points.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  spawn(p, v, { life = 0.8, size = 0.12, color = '#ffffff', drag = 2, grav = 0, fade = 1 } = {}) {
    const part = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    part.alive = true;
    part.p.copy(p);
    part.v.copy(v);
    part.life = 0;
    part.max = life;
    part.size = size;
    part.drag = drag;
    part.grav = grav;
    part.fade = fade;
    part.color.set(color);
  }

  dust(at, strength = 1) {
    const r = this.rng;
    for (let i = 0; i < 6 + strength * 8; i += 1) {
      const a = r() * Math.PI * 2;
      const s = 0.4 + r() * 1.4 * strength;
      this.spawn(
        new THREE.Vector3(at.x + (r() - 0.5) * 0.2, 0.05 + r() * 0.1, at.z + (r() - 0.5) * 0.2),
        new THREE.Vector3(Math.cos(a) * s, 0.3 + r() * 0.8 * strength, Math.sin(a) * s),
        { life: 0.5 + r() * 0.5, size: 0.18 + r() * 0.2, color: '#bdb2a0', drag: 3.5, grav: -0.4, fade: 0.5 },
      );
    }
  }

  sparks(at, count = 10) {
    const r = this.rng;
    for (let i = 0; i < count; i += 1) {
      this.spawn(at, new THREE.Vector3((r() - 0.5) * 4, r() * 3, (r() - 0.5) * 4), {
        life: 0.35 + r() * 0.25, size: 0.06, color: r() < 0.5 ? '#fff3c4' : '#ffd36b', drag: 1.5, grav: 9,
      });
    }
  }

  confetti(at, colors) {
    const r = this.rng;
    for (let i = 0; i < 260; i += 1) {
      const a = r() * Math.PI * 2;
      const s = 2 + r() * 6;
      this.spawn(
        new THREE.Vector3(at.x, at.y + r() * 0.5, at.z),
        new THREE.Vector3(Math.cos(a) * s * 0.6, 5 + r() * 7, Math.sin(a) * s),
        { life: 2.6 + r() * 1.5, size: 0.09 + r() * 0.07, color: colors[i % colors.length], drag: 1.6, grav: 4.5 },
      );
    }
  }

  update(dt, ball, camera) {
    let n = 0;
    for (const part of this.particles) {
      if (!part.alive) continue;
      part.life += dt;
      if (part.life >= part.max) {
        part.alive = false;
        continue;
      }
      part.v.multiplyScalar(Math.exp(-part.drag * dt));
      part.v.y -= part.grav * dt;
      part.p.addScaledVector(part.v, dt);
      if (part.p.y < 0.02) {
        part.p.y = 0.02;
        part.v.y *= -0.2;
        part.v.x *= 0.6;
        part.v.z *= 0.6;
      }
      const t = part.life / part.max;
      this.pos[n * 3] = part.p.x;
      this.pos[n * 3 + 1] = part.p.y;
      this.pos[n * 3 + 2] = part.p.z;
      this.col[n * 3] = part.color.r;
      this.col[n * 3 + 1] = part.color.g;
      this.col[n * 3 + 2] = part.color.b;
      this.size[n] = part.size * (1 + t * 0.6 * part.fade);
      this.alpha[n] = (1 - t) * (part.fade < 1 ? 0.55 : 1);
      n += 1;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    this.trail.update(dt, ball, camera);
    this.motes.update(dt);
  }
}

/** Warm dust motes drifting in the afternoon sun over the court. */
class Motes {
  constructor(scene, rng) {
    const n = 160;
    this.base = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      this.base[i * 3] = (rng() - 0.5) * 30;
      this.base[i * 3 + 1] = 0.4 + rng() * 5;
      this.base[i * 3 + 2] = (rng() - 0.5) * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.base.slice(), 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: '#ffe2a8', size: 0.05, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const pos = this.points.geometry.attributes.position;
    const b = this.base;
    for (let i = 0; i < pos.count; i += 1) {
      const ph = i * 0.731;
      pos.setXYZ(
        i,
        b[i * 3] + Math.sin(this.t * 0.11 + ph) * 1.2,
        b[i * 3 + 1] + Math.sin(this.t * 0.17 + ph * 1.7) * 0.5,
        b[i * 3 + 2] + Math.cos(this.t * 0.09 + ph) * 1.2,
      );
    }
    pos.needsUpdate = true;
  }
}

const TRAIL_N = 22;

class BallTrail {
  constructor(scene) {
    this.points = Array.from({ length: TRAIL_N }, () => new THREE.Vector3());
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(TRAIL_N * 2 * 3);
    this.alphaArr = new Float32Array(TRAIL_N * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaArr, 1));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i += 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color('#ffe9a8') }, uOpacity: { value: 0 } },
        vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }',
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.opacity = 0;
  }

  update(dt, ball, camera) {
    const p = ball.mesh.position;
    const speed = ball.velocity.length();
    for (let i = TRAIL_N - 1; i > 0; i -= 1) this.points[i].copy(this.points[i - 1]);
    this.points[0].copy(p);
    this.count = Math.min(TRAIL_N, this.count + 1);
    const target = speed > 15 && !ball.heldBy ? Math.min(1, (speed - 15) / 10) : 0;
    this.opacity += (target - this.opacity) * (1 - Math.exp(-dt * 10));
    this.mesh.material.uniforms.uOpacity.value = this.opacity * 0.75;
    this.mesh.visible = this.opacity > 0.01;
    if (!this.mesh.visible) return;
    const toCam = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < TRAIL_N; i += 1) {
      const a = this.points[Math.min(i, this.count - 1)];
      const b = this.points[Math.min(i + 1, this.count - 1)];
      dir.subVectors(a, b);
      if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
      toCam.subVectors(camera.position, a);
      side.crossVectors(dir, toCam).normalize();
      const w = 0.11 * (1 - i / TRAIL_N);
      this.posArr.set([a.x + side.x * w, a.y + side.y * w, a.z + side.z * w], i * 6);
      this.posArr.set([a.x - side.x * w, a.y - side.y * w, a.z - side.z * w], i * 6 + 3);
      const al = (1 - i / TRAIL_N) ** 1.5;
      this.alphaArr[i * 2] = al;
      this.alphaArr[i * 2 + 1] = al;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
