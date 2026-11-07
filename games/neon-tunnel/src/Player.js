import * as THREE from 'three';
import { PLAYER } from './Config.js';
import { maxOmegaAt } from './Difficulty.js';
import { TWO_PI } from './ObstacleModel.js';

// The energy sphere: bright core, animated plasma layer, rotating geometric
// lattice, fresnel glass shell, shield bubble and a ribbon trail. Movement is a
// single angular coordinate around the tunnel with critically-damped-feeling
// angular velocity (exponential approach), integrated with delta time.

const plasmaVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vView;
  void main() {
    vN = normalize(normalMatrix * normal);
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const plasmaFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vView;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uIntensity;
  uniform float uDark;
  void main() {
    vec3 p = vP * 3.2;
    float n = sin(p.x * 2.1 + uTime * 3.1) * sin(p.y * 2.7 - uTime * 2.3) * sin(p.z * 2.3 + uTime * 1.7);
    n += 0.5 * sin(length(p) * 6.0 - uTime * 7.0);
    float bands = smoothstep(0.15, 0.9, abs(n));
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
    vec3 col = mix(uColor, uColor2, bands) * (0.5 + 1.4 * bands) * uIntensity;
    col += uColor2 * fres * 0.8;
    col = mix(col, col * 0.15 + uColor * fres * 2.0, uDark);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const shellFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vView;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.6);
    float scan = 0.5 + 0.5 * sin(vP.y * 40.0 - uTime * 6.0);
    float a = (fres * 0.9 + scan * 0.05) * uOpacity;
    gl_FragColor = vec4(uColor * (0.5 + fres * 1.6), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const trailVertex = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  varying float vSide;
  attribute float aSide;
  void main() {
    vAlpha = aAlpha;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const trailFragment = /* glsl */ `
  varying float vAlpha;
  varying float vSide;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  void main() {
    float edge = 1.0 - abs(vSide);
    float core = pow(edge, 2.5);
    vec3 col = mix(uColorB, uColorA, vAlpha) * (0.5 + core * 1.6);
    gl_FragColor = vec4(col, vAlpha * vAlpha * vAlpha * edge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function linearColor(hex, intensity = 1) {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r * intensity, c.g * intensity, c.b * intensity);
}

const TRAIL_POINTS = 48;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.group.add(this.visual);
    scene.add(this.group);

    const r = PLAYER.radius;
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.28, 2), this.coreMat);
    this.visual.add(this.core);

    this.plasmaUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Vector3() },
      uColor2: { value: new THREE.Vector3() },
      uIntensity: { value: 1 },
      uDark: { value: 0 },
    };
    this.plasma = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r * 0.72, 4),
      new THREE.ShaderMaterial({ uniforms: this.plasmaUniforms, vertexShader: plasmaVertex, fragmentShader: plasmaFragment }),
    );
    this.visual.add(this.plasma);

    this.latticeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 2, 2), wireframe: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.92, 1), this.latticeMat);
    this.visual.add(this.lattice);

    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 2, 2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ringA = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, 0.03, 4, 48), this.ringMat);
    this.ringB = new THREE.Mesh(new THREE.TorusGeometry(r * 1.17, 0.022, 4, 48), this.ringMat);
    this.visual.add(this.ringA, this.ringB);
    // Saturn-style belt parallel to the wall: gives the sphere a readable
    // silhouette from the chase camera and banks with lateral motion.
    this.beltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 2, 2) });
    this.belt = new THREE.Group();
    const beltRing = new THREE.Mesh(new THREE.TorusGeometry(r * 1.42, 0.035, 4, 64).rotateX(Math.PI / 2), this.beltMat);
    const notchGeo = new THREE.BoxGeometry(0.09, 0.05, 0.16);
    this.belt.add(beltRing);
    for (let i = 0; i < 4; i += 1) {
      const notch = new THREE.Mesh(notchGeo, this.beltMat);
      const a = (i * Math.PI) / 2;
      notch.position.set(Math.cos(a) * r * 1.42, 0, Math.sin(a) * r * 1.42);
      notch.rotation.y = -a;
      this.belt.add(notch);
    }
    this.visual.parent.add(this.belt);

    this.shellUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Vector3() }, uOpacity: { value: 0.9 } };
    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 4),
      new THREE.ShaderMaterial({ uniforms: this.shellUniforms, vertexShader: plasmaVertex, fragmentShader: shellFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.visual.add(this.shell);

    // shield bubble (hex lattice + fresnel)
    this.shieldUniforms = { uTime: { value: 0 }, uColor: { value: linearColor(0x39ff14, 1.8) }, uOpacity: { value: 0 } };
    this.shieldMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r * 1.55, 3),
      new THREE.ShaderMaterial({ uniforms: this.shieldUniforms, vertexShader: plasmaVertex, fragmentShader: shellFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.shieldWireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 0.4), wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shieldWire = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.5, 1), this.shieldWireMat);
    this.group.add(this.shieldMesh, this.shieldWire);

    this.light = new THREE.PointLight(0x00f5ff, 14, 14, 1.6);
    this.group.add(this.light);

    // ribbon trail
    this.trailSamples = [];
    for (let i = 0; i < TRAIL_POINTS; i += 1) this.trailSamples.push({ angle: 0, s: 0 });
    this.trailHead = 0;
    this.trailFilled = 0;
    const tg = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(TRAIL_POINTS * 2 * 3);
    const alpha = new Float32Array(TRAIL_POINTS * 2);
    const side = new Float32Array(TRAIL_POINTS * 2);
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const a = 1 - i / (TRAIL_POINTS - 1);
      alpha[i * 2] = a;
      alpha[i * 2 + 1] = a;
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    const index = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i += 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    tg.setIndex(index);
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    tg.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.trailUniforms = { uColorA: { value: new THREE.Vector3() }, uColorB: { value: new THREE.Vector3() } };
    this.trail = new THREE.Mesh(
      tg,
      new THREE.ShaderMaterial({ uniforms: this.trailUniforms, vertexShader: trailVertex, fragmentShader: trailFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.trail.frustumCulled = false;
    scene.add(this.trail);

    this.position = this.group.position;
    this.sparkColor = new THREE.Color();
    this.reset();
  }

  applySkin(skin) {
    this.skin = skin;
    const core = new THREE.Color(skin.core);
    const shell = new THREE.Color(skin.shell);
    const dark = skin.dark ? 1 : 0;
    this.coreMat.color.setRGB(core.r * 1.0 + 0.25, core.g * 1.0 + 0.25, core.b * 1.0 + 0.25);
    if (dark) this.coreMat.color.setRGB(0.05, 0, 0.05);
    this.plasmaUniforms.uColor.value.set(core.r * 0.55, core.g * 0.55, core.b * 0.55);
    this.plasmaUniforms.uColor2.value.set(shell.r * 0.7 + core.r * 0.3, shell.g * 0.7 + core.g * 0.3, shell.b * 0.7 + core.b * 0.3);
    this.plasmaUniforms.uDark.value = dark;
    this.latticeMat.color.setRGB(core.r * 1.9 + 0.3, core.g * 1.9 + 0.3, core.b * 1.9 + 0.3);
    this.beltMat.color.setRGB(core.r * 1.6 + 0.4, core.g * 1.6 + 0.4, core.b * 1.6 + 0.4);
    this.ringMat.color.setRGB(core.r * 1.8, core.g * 1.8, core.b * 1.8);
    this.shellUniforms.uColor.value.set(core.r * 0.5, core.g * 0.5, core.b * 0.5);
    this.light.color.set(skin.core);
    const ta = new THREE.Color(skin.trailA);
    const tb = new THREE.Color(skin.trailB);
    this.trailUniforms.uColorA.value.set(ta.r * 1.1, ta.g * 1.1, ta.b * 1.1);
    this.trailUniforms.uColorB.value.set(tb.r * 0.8, tb.g * 0.8, tb.b * 0.8);
    this.sparkColor.set(skin.spark);
  }

  reset() {
    this.angle = 0;
    this.prevAngle = 0;
    this.omega = 0;
    this.shieldVisual = 0;
    this.visible = true;
    this.group.visible = true;
    this.trail.visible = true;
    this.trailFilled = 0;
  }

  /** Integrates angular movement. input: -1 (counter-clockwise / left), 0, +1. */
  updateMovement(dt, input, speed) {
    this.prevAngle = this.angle;
    const maxOmega = maxOmegaAt(speed);
    const target = input * maxOmega;
    const rate = input === 0 || Math.sign(target) !== Math.sign(this.omega) ? PLAYER.stopResponsiveness : PLAYER.responsiveness;
    this.omega += (target - this.omega) * (1 - Math.exp(-rate * dt));
    this.angle += this.omega * dt;
    // keep the unwrapped angle bounded without discontinuities in rendering
    if (this.angle > TWO_PI * 64 || this.angle < -TWO_PI * 64) {
      const wrap = Math.round(this.angle / TWO_PI) * TWO_PI;
      this.angle -= wrap;
      this.prevAngle -= wrap;
    }
  }

  /** Places the sphere in world space and animates its layers. */
  updateVisual(dt, time, distance, shieldOn, boostOn, menuMode = false) {
    const r = PLAYER.orbitRadius;
    const a = this.angle;
    if (menuMode) {
      this.group.position.set(0, -1.1, 0);
    } else {
      this.group.position.set(Math.sin(a) * r, -Math.cos(a) * r, 0);
    }
    const pulse = 1 + Math.sin(time * 6) * 0.045 + (boostOn ? 0.08 : 0);
    this.visual.scale.setScalar(menuMode ? 1.7 * pulse : pulse);
    this.core.rotation.y += dt * 2;
    this.lattice.rotation.x += dt * 1.3;
    this.lattice.rotation.y -= dt * 0.9;
    this.ringA.rotation.x = time * 2.2;
    this.ringA.rotation.y = time * 1.1;
    this.ringB.rotation.y = -time * 1.7;
    this.ringB.rotation.z = time * 0.8;
    // rolling: sphere spins with the forward motion and lateral movement
    this.plasma.rotation.x -= dt * 5;
    this.plasma.rotation.z -= this.omega * dt * 2;
    this.plasmaUniforms.uTime.value = time;
    this.plasmaUniforms.uIntensity.value = boostOn ? 1.3 : menuMode ? 0.65 : 0.72;
    // align the belt with the wall and bank it into turns
    this.group.rotation.z = menuMode ? 0 : a;
    this.belt.rotation.set(menuMode ? 0.5 : 0, menuMode ? time * 0.6 : time * 1.5, menuMode ? 0.3 : -this.omega * 0.09);
    this.belt.scale.setScalar(menuMode ? 1.7 : 1);
    this.belt.visible = this.visible;
    this.shellUniforms.uTime.value = time;

    this.shieldVisual += ((shieldOn ? 1 : 0) - this.shieldVisual) * (1 - Math.exp(-10 * dt));
    this.shieldUniforms.uOpacity.value = this.shieldVisual * (0.85 + 0.15 * Math.sin(time * 9));
    this.shieldUniforms.uTime.value = time;
    this.shieldWireMat.opacity = this.shieldVisual * 0.35;
    this.shieldWire.rotation.y = time * 0.7;
    this.shieldWire.rotation.x = time * 0.4;
    this.shieldMesh.visible = this.shieldVisual > 0.01;
    this.shieldWire.visible = this.shieldMesh.visible;
    this.light.intensity = boostOn ? 24 : 14;

    this.updateTrail(distance, menuMode, boostOn);
  }

  updateTrail(distance, menuMode, boostOn) {
    if (menuMode || !this.visible) {
      this.trail.visible = false;
      return;
    }
    this.trail.visible = true;
    // push sample
    this.trailHead = (this.trailHead + 1) % TRAIL_POINTS;
    const sample = this.trailSamples[this.trailHead];
    sample.angle = this.angle;
    sample.s = distance;
    if (this.trailFilled === 0) {
      for (const smp of this.trailSamples) {
        smp.angle = this.angle;
        smp.s = distance;
      }
    }
    this.trailFilled = Math.min(TRAIL_POINTS, this.trailFilled + 1);

    const r = PLAYER.orbitRadius;
    const width = PLAYER.radius * (boostOn ? 0.7 : 0.45);
    const maxLen = boostOn ? 6 : 3.2;
    const pos = this.trailPos;
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const smp = this.trailSamples[(this.trailHead - i + TRAIL_POINTS) % TRAIL_POINTS];
      let back = distance - smp.s;
      if (back > maxLen) back = maxLen;
      const taper = width * (1 - i / TRAIL_POINTS);
      const ca = Math.cos(smp.angle);
      const sa = Math.sin(smp.angle);
      const x = sa * r;
      const y = -ca * r;
      const z = back + 0.05;
      // ribbon spans tangentially around the tunnel so it faces the camera
      pos[i * 6] = x - ca * taper;
      pos[i * 6 + 1] = y - sa * taper;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + ca * taper;
      pos[i * 6 + 4] = y + sa * taper;
      pos[i * 6 + 5] = z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v;
    this.trail.visible = v;
  }
}
