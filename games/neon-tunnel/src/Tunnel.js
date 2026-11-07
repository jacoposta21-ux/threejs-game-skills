import * as THREE from 'three';
import { THEMES, TUNNEL, THEME_DISTANCE } from './Config.js';

// The tunnel is one long open cylinder whose surface is drawn entirely by a
// procedural shader indexed by *tunnel distance*, so it scrolls infinitely with
// zero geometry churn. Per-section hashes vary the panel layout, lights and
// ring patterns so the tunnel never visibly repeats. Structural ribs and
// rotating rings are pooled InstancedMeshes recycled as the player advances.

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  uniform float uDistance;
  uniform float uTime;
  uniform float uRadius;
  uniform float uSpeedFx;
  uniform float uBeat;
  uniform vec3 uWall;
  uniform vec3 uPanel;
  uniform vec3 uNeonA;
  uniform vec3 uNeonB;
  uniform vec3 uAccent;
  uniform vec3 uFog;
  uniform vec3 uPlayerPos;
  uniform vec3 uPlayerColor;
  uniform float uFlash;
  uniform float uStyleFrom;
  uniform float uStyleTo;
  uniform float uStyleMix;
  uniform vec3 uFlashColor;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Theme-specific surface detail. p = (around, along) in world units.
  // 0 circuit traces · 1 hex cells · 2 heat vents · 3 star windows · 4 clean tiles
  vec3 styleLayer(float id, vec2 p, vec2 pid, vec2 f, float ph, vec3 metal) {
    vec3 c = vec3(0.0);
    if (id < 0.5) {
      vec2 q = p / 1.5;
      vec2 cell = floor(q);
      vec2 g = fract(q) - 0.5;
      float h = hash21(cell + 11.0);
      float w = 0.04 / 1.5;
      float lineX = (1.0 - smoothstep(w, w * 2.0, abs(g.y))) * step(h, 0.4);
      float lineY = (1.0 - smoothstep(w, w * 2.0, abs(g.x))) * step(0.4, h) * step(h, 0.75);
      float node = (1.0 - smoothstep(0.07, 0.11, length(g))) * step(0.82, h);
      float pulse = pow(fract(p.y / 18.0 - uTime * 0.9 + h), 6.0);
      c = uNeonB * (lineX + lineY) * (0.06 + 0.45 * pulse) + uNeonA * node * 0.3;
    } else if (id < 1.5) {
      vec2 q = p * vec2(1.0, 0.8);
      vec2 r = vec2(1.0, 1.732);
      vec2 a = mod(q, r) - r * 0.5;
      vec2 b = mod(q - r * 0.5, r) - r * 0.5;
      vec2 gv = dot(a, a) < dot(b, b) ? a : b;
      vec2 id2 = q - gv;
      float hx = max(dot(abs(gv), vec2(0.5, 0.866)), abs(gv.x));
      float edge = smoothstep(0.42, 0.48, hx);
      float hh = hash21(floor(id2 * 10.0));
      float ooze = step(0.94, hh) * (0.5 + 0.5 * sin(uTime * 3.0 + hh * 30.0));
      c = uNeonA * (edge * 0.026 + ooze * (1.0 - edge) * 0.07);
    } else if (id < 2.5) {
      float vent = step(0.45, ph) * step(abs(f.x - 0.5), 0.36) * step(abs(f.y - 0.5), 0.3);
      float slat = smoothstep(0.35, 0.5, abs(fract(p.y * 3.2) - 0.5));
      float heat = 0.6 + 0.4 * sin(uTime * 4.0 + p.y * 0.7 + ph * 20.0);
      c = mix(uAccent, uNeonB, 0.5) * vent * slat * heat * 0.18;
    } else if (id < 3.5) {
      float win = step(0.72, ph) * step(abs(f.x - 0.5), 0.34) * step(abs(f.y - 0.5), 0.3);
      float frame = step(0.72, ph) * (1.0 - win) * step(abs(f.x - 0.5), 0.38) * step(abs(f.y - 0.5), 0.34);
      vec2 sp = vec2(p.x * 2.2, (p.y - uDistance * 0.7) * 2.2);
      float star = step(0.985, hash21(floor(sp))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash21(floor(sp) + 3.0) * 20.0));
      vec3 deep = mix(vec3(0.004, 0.0, 0.012), uNeonA * 0.02, f.y);
      c = win * (deep + vec3(1.2, 1.1, 1.6) * star - metal * 0.4) + frame * uNeonA * 0.12;
    } else {
      vec2 t = abs(fract(p * 2.0) - 0.5);
      float grid = 1.0 - smoothstep(0.46, 0.5, max(t.x, t.y));
      float scan = exp(-abs(fract((p.y + uTime * 22.0) / 60.0) - 0.5) * 60.0);
      c = uNeonA * (grid * 0.018 + scan * 0.25) + uNeonB * grid * scan * 0.4;
    }
    return c;
  }

  void main() {
    const float TAU = 6.28318530718;
    float ang = atan(vWorld.x, -vWorld.y); // 0 at the bottom, matches gameplay angle
    float u = fract(ang / TAU);
    float s = uDistance - vWorld.z; // tunnel distance coordinate
    float circ = TAU * uRadius;

    // ---- sections (12u) give large-scale variety
    float section = floor(s / 12.0);
    float sh = hash21(vec2(section, 7.13));
    float style = floor(sh * 4.0);

    // ---- panels
    float cols = style < 1.0 ? 24.0 : 32.0;
    float rowLen = style < 2.0 ? 3.0 : 4.0;
    vec2 cell = vec2(u * cols, s / rowLen);
    vec2 pid = floor(cell);
    vec2 f = fract(cell);
    vec2 edgeDist = min(f, 1.0 - f) * vec2(circ / cols, rowLen);
    float seam = 1.0 - smoothstep(0.0, 0.06, min(edgeDist.x, edgeDist.y));
    float bevel = smoothstep(0.06, 0.16, min(edgeDist.x, edgeDist.y));
    float ph = hash21(pid + section * 0.37);
    vec3 metal = mix(uWall, uPanel, 0.35 + ph * 0.65);
    // brushed metal streaks along the tunnel
    metal *= 0.86 + 0.14 * hash21(vec2(floor(u * 900.0), section));
    // inset plate on some panels
    vec2 inset = abs(f - 0.5);
    float plate = step(0.6, ph) * step(max(inset.x, inset.y), 0.32);
    metal = mix(metal, metal * 1.5, plate * 0.6);
    vec3 col = metal * bevel * 0.42;
    col += uNeonB * seam * 0.02;

    // ---- view-dependent sheen (fake reflections of the neon)
    vec3 n = normalize(vec3(-vWorld.xy, 0.0));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(n, v)), 3.0);
    col += mix(uNeonA, uNeonB, u) * fres * fres * 0.035 * bevel;

    // ---- longitudinal neon strips (count varies by section style)
    float strips = style < 2.0 ? 4.0 : 6.0;
    float stripCoord = fract(u * strips + 0.125) - 0.5;
    float stripWorld = abs(stripCoord) * circ / strips;
    float strip = 1.0 - smoothstep(0.035, 0.085, stripWorld);
    float stripHalo = exp(-stripWorld * 9.0) * 0.05;
    // travelling light pulses down the strips
    float pulse = pow(fract((s + uTime * 18.0) / 26.0 + floor(u * strips) * 0.31), 10.0);
    float stripOn = step(0.18, hash21(vec2(section, floor(u * strips))));
    col += uNeonA * (strip * (0.22 + 0.8 * pulse + 0.15 * uBeat) + stripHalo) * stripOn;

    // ---- illuminated rings every section, brighter accent ring every 4
    float ringD = abs(fract(s / 12.0 + 0.5) - 0.5) * 12.0;
    float ring = 1.0 - smoothstep(0.05, 0.12, ringD);
    float bigRing = step(0.75, fract(section / 4.0 + 0.01));
    col += mix(uNeonB, uAccent, bigRing) * ring * (0.45 + 0.4 * uBeat);
    col += mix(uNeonB, uAccent, bigRing) * exp(-ringD * 2.0) * 0.02;

    // ---- theme surface detail (cross-fades during theme transitions)
    vec2 sp = vec2(u * circ, s);
    vec3 styleCol = styleLayer(uStyleTo, sp, pid, f, ph, metal);
    if (uStyleMix < 0.999) styleCol = mix(styleLayer(uStyleFrom, sp, pid, f, ph, metal), styleCol, uStyleMix);
    col += styleCol * bevel;

    // ---- small inset lights on rare panels (accent colour, gentle flicker)
    float lamp = step(0.93, hash21(pid * 1.7 + 3.1)) * step(max(inset.x * 2.2, inset.y * 1.0), 0.2);
    float flicker = 0.75 + 0.25 * sin(uTime * 9.0 + ph * 40.0);
    col += mix(uNeonA, vec3(1.0), 0.35) * lamp * flicker * 0.16;

    // ---- glow pool cast by the energy sphere onto the wall
    float pd = length(vWorld - uPlayerPos);
    col += uPlayerColor * (0.22 / (1.0 + pd * pd * 1.4)) * (0.5 + 0.5 * bevel);

    // ---- speed streak shimmer during boost
    col += uNeonA * uSpeedFx * 0.12 * step(0.985, hash21(vec2(floor(u * 140.0), floor(s * 0.25))));

    // ---- collision / power-up flash
    col += uFlashColor * uFlash * 0.25;

    // ---- distance fog toward the vanishing point
    float viewDist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-pow(viewDist * 0.0105, 1.5));
    col = mix(col, uFog, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function vec3From(arr) {
  return new THREE.Vector3(arr[0], arr[1], arr[2]);
}

export class Tunnel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const R = TUNNEL.radius;

    const t0 = THEMES[0];
    this.uniforms = {
      uDistance: { value: 0 },
      uTime: { value: 0 },
      uRadius: { value: R },
      uSpeedFx: { value: 0 },
      uBeat: { value: 0 },
      uWall: { value: vec3From(t0.wall) },
      uPanel: { value: vec3From(t0.panel) },
      uNeonA: { value: vec3From(t0.neonA) },
      uNeonB: { value: vec3From(t0.neonB) },
      uAccent: { value: vec3From(t0.accent) },
      uFog: { value: vec3From(t0.fog) },
      uPlayerPos: { value: new THREE.Vector3() },
      uPlayerColor: { value: new THREE.Vector3(0, 0.6, 0.7) },
      uFlash: { value: 0 },
      uStyleFrom: { value: 0 },
      uStyleTo: { value: 0 },
      uStyleMix: { value: 1 },
      uFlashColor: { value: new THREE.Vector3(1, 1, 1) },
    };

    const geo = new THREE.CylinderGeometry(R, R, TUNNEL.length, 72, 1, true);
    geo.rotateX(Math.PI / 2); // axis along Z
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.z = -TUNNEL.length / 2 + 14;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    // ---- structural ribs (dark metal torus, flush with the wall)
    this.sectionCount = Math.ceil(TUNNEL.length / TUNNEL.segmentLength) + 2;
    const ribGeo = new THREE.TorusGeometry(R - 0.04, 0.1, 6, 72);
    this.ribMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.85, roughness: 0.35, emissive: 0x000000 });
    this.ribs = new THREE.InstancedMesh(ribGeo, this.ribMat, this.sectionCount);
    this.ribs.frustumCulled = false;
    this.group.add(this.ribs);

    // ---- rotating segmented light rings (decorative, flush with the wall)
    const segShape = new THREE.TorusGeometry(R - 0.03, 0.05, 4, 10, Math.PI / 9);
    this.rotorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 1.6, 2), toneMapped: true });
    this.rotorCount = 8 * 6; // 6 rotors x 8 bars
    this.rotors = new THREE.InstancedMesh(segShape, this.rotorMat, this.rotorCount);
    this.rotors.frustumCulled = false;
    this.group.add(this.rotors);

    // ---- vanishing-point glow
    const glowTex = Tunnel.makeGlowTexture();
    this.coreMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.4, 1.2, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.core = new THREE.Sprite(this.coreMat);
    this.core.scale.set(18, 18, 1);
    this.core.position.set(0, 0, -TUNNEL.length + 30);
    this.group.add(this.core);

    // ---- zone portals: triple ring of light at every theme boundary
    this.portalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2) });
    this.portalGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.6, 0.6), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.portals = new THREE.InstancedMesh(new THREE.TorusGeometry(R - 0.08, 0.1, 8, 96), this.portalMat, 6);
    this.portalGlow = new THREE.InstancedMesh(new THREE.RingGeometry(R - 0.32, R - 0.02, 96, 1), this.portalGlowMat, 6);
    for (const m of [this.portals, this.portalGlow]) {
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
    }

    this.dummy = new THREE.Object3D();
    this.themeIndex = 0;
    this.targetTheme = THEMES[0];
    this.themeBlend = 1;
    this.fromTheme = null;
    this.tmpColor = new THREE.Color();
  }

  static makeGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  themeForDistance(distance) {
    return Math.floor(distance / THEME_DISTANCE) % THEMES.length;
  }

  /** Begin a smooth transition to theme `index`. */
  setTheme(index, instant = false) {
    if (index === this.themeIndex && !instant) return false;
    this.fromTheme = this.currentThemeSnapshot();
    this.uniforms.uStyleFrom.value = this.themeBlend >= 0.5 ? this.themeIndex : this.uniforms.uStyleFrom.value;
    this.uniforms.uStyleTo.value = index;
    this.themeIndex = index;
    this.targetTheme = THEMES[index];
    this.themeBlend = instant ? 1 : 0;
    if (instant) this.applyThemeBlend(1);
    return true;
  }

  currentThemeSnapshot() {
    const u = this.uniforms;
    return {
      wall: u.uWall.value.toArray(), panel: u.uPanel.value.toArray(), neonA: u.uNeonA.value.toArray(),
      neonB: u.uNeonB.value.toArray(), accent: u.uAccent.value.toArray(), fog: u.uFog.value.toArray(),
    };
  }

  applyThemeBlend(t) {
    const from = this.fromTheme ?? this.targetTheme;
    const to = this.targetTheme;
    const u = this.uniforms;
    const e = t * t * (3 - 2 * t);
    u.uStyleMix.value = e;
    for (const key of ['wall', 'panel', 'neonA', 'neonB', 'accent', 'fog']) {
      const uniform = u[`u${key[0].toUpperCase()}${key.slice(1)}`].value;
      uniform.set(
        from[key][0] + (to[key][0] - from[key][0]) * e,
        from[key][1] + (to[key][1] - from[key][1]) * e,
        from[key][2] + (to[key][2] - from[key][2]) * e,
      );
    }
    const a = u.uNeonA.value;
    const b = u.uNeonB.value;
    this.rotorMat.color.setRGB(b.x * 0.45, b.y * 0.45, b.z * 0.45);
    this.coreMat.color.setRGB(a.x * 0.12, a.y * 0.12, a.z * 0.12);
    this.ribMat.emissive.setRGB(b.x * 0.03, b.y * 0.03, b.z * 0.03);
  }

  get fogColor() {
    return this.uniforms.uFog.value;
  }

  update(dt, distance, time, player, speedFx, beat) {
    const u = this.uniforms;
    u.uDistance.value = distance;
    u.uTime.value = time;
    u.uSpeedFx.value = speedFx;
    u.uBeat.value = beat;
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 3);
    if (player) {
      u.uPlayerPos.value.copy(player.position);
    }

    if (this.themeBlend < 1) {
      this.themeBlend = Math.min(1, this.themeBlend + dt / 2.6);
      this.applyThemeBlend(this.themeBlend);
    }

    // ribs: one per section, placed by tunnel distance so they scroll with the world
    const L = TUNNEL.segmentLength;
    const firstSection = Math.floor((distance - 16) / L);
    const d = this.dummy;
    for (let i = 0; i < this.sectionCount; i += 1) {
      const s = (firstSection + i) * L;
      d.position.set(0, 0, -(s - distance));
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.ribs.setMatrixAt(i, d.matrix);
    }
    this.ribs.instanceMatrix.needsUpdate = true;

    // rotors: every 5th section carries a rotating ring of light bars
    const rotorSpacing = L * 5;
    const firstRotor = Math.floor((distance - 16) / rotorSpacing);
    let idx = 0;
    for (let r = 0; r < 6; r += 1) {
      const sectionId = firstRotor + r;
      const s = sectionId * rotorSpacing + L * 0.5;
      const dir = sectionId % 2 === 0 ? 1 : -1;
      const spin = time * 0.6 * dir + sectionId * 1.3;
      for (let k = 0; k < 8; k += 1) {
        d.position.set(0, 0, -(s - distance));
        d.rotation.set(0, 0, spin + (k * Math.PI * 2) / 8);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.rotors.setMatrixAt(idx, d.matrix);
        idx += 1;
      }
    }
    this.rotors.instanceMatrix.needsUpdate = true;

    // zone portal ahead (or just passed)
    const nextBoundary = Math.ceil((distance - 10) / THEME_DISTANCE) * THEME_DISTANCE;
    const ahead = nextBoundary - distance;
    let pc = 0;
    if (nextBoundary > 0 && ahead < 260) {
      const next = THEMES[Math.round(nextBoundary / THEME_DISTANCE) % THEMES.length];
      this.portalMat.color.setRGB(next.neonA[0] * 1.1, next.neonA[1] * 1.1, next.neonA[2] * 1.1);
      this.portalGlowMat.color.setRGB(next.neonA[0] * 0.35, next.neonA[1] * 0.35, next.neonA[2] * 0.35);
      for (let k = 0; k < 3; k += 1) {
        d.position.set(0, 0, -(ahead + k * 5));
        d.rotation.set(0, 0, time * (k % 2 ? -0.5 : 0.5));
        d.scale.setScalar(1 + 0.01 * Math.sin(time * 6 + k));
        d.updateMatrix();
        this.portals.setMatrixAt(pc, d.matrix);
        this.portalGlow.setMatrixAt(pc, d.matrix);
        pc += 1;
      }
    }
    this.portals.count = pc;
    this.portalGlow.count = pc;
    this.portals.instanceMatrix.needsUpdate = true;
    this.portalGlow.instanceMatrix.needsUpdate = true;
  }

  flash(color, strength = 1) {
    this.uniforms.uFlash.value = strength;
    this.uniforms.uFlashColor.value.set(color.r, color.g, color.b);
  }
}
