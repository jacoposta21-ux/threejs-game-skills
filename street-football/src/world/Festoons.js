import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURT } from '../config.js';
import { normalizeForMerge, paint, place } from './geometry.js';

const FLAG_COLORS = ['#e63946', '#f6c915', '#1f8a4c', '#1d9bf0', '#ff7a1a', '#e8338b', '#f4f1e8', '#7b3fe4'];

/**
 * Bandeirinhas: strings of little triangular flags across the court (festa
 * junina street decoration), plus plastic chairs and crates on the sidewalk.
 * Every flag is one instance of a single InstancedMesh, swaying in a vertex
 * shader, so the whole festoon is one draw call.
 */
export function buildFestoons(scene, rng) {
  const group = new THREE.Group();
  group.name = 'festoons';
  scene.add(group);
  const BX = COURT.halfLength + 0.25 + 0.8;
  const BZ = COURT.halfWidth + 0.3 + 0.8;
  const H = 6.2;
  const anchors = [
    [[-BX, H, -BZ], [BX, H, BZ]],
    [[-BX, H, BZ], [BX, H, -BZ]],
    [[-BX, H - 0.6, BZ], [BX, H - 0.6, BZ]],
    [[-BX, H - 0.4, -BZ], [-BX, H - 0.4, BZ]],
    [[BX, H - 0.4, -BZ], [BX, H - 0.4, BZ]],
    [[0, 6.0, BZ + 9], [0, H - 0.6, BZ]],
  ];
  const flags = [];
  const strings = [];
  for (const [a, b] of anchors) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const mid = A.clone().lerp(B, 0.5);
    mid.y -= 0.6 + len * 0.045;
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    strings.push(new THREE.TubeGeometry(curve, Math.ceil(len), 0.012, 3, false));
    const n = Math.floor(len / 0.42);
    for (let i = 1; i < n; i += 1) {
      const t = i / n;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      flags.push({ p, yaw: Math.atan2(tan.x, tan.z) + Math.PI / 2, c: FLAG_COLORS[Math.floor(rng() * FLAG_COLORS.length)] });
    }
  }
  // Flag: a triangle hanging from its top edge (origin on the string).
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.15, 0, 0, 0.15, 0, 0, 0, -0.34, 0], 3));
  tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, transparent: true });
  const uniforms = { uTime: { value: 0 } };
  // Anything close to the lens fades out, so a string never cuts across the view.
  const nearFade = (shader) =>
    shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      '#include <alphatest_fragment>\ndiffuseColor.a *= smoothstep(4.0, 8.0, length(vViewPosition));',
    );
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = nearFade(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = float(gl_InstanceID) * 1.37;
        float sway = sin(uTime * 2.6 + ph) * 0.35 + sin(uTime * 4.1 + ph * 2.3) * 0.15;
        transformed.z += sway * -position.y * 0.9;`,
      );
  };
  const inst = new THREE.InstancedMesh(tri, mat, flags.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  flags.forEach((f, i) => {
    m.compose(f.p, q.setFromAxisAngle(up, f.yaw), one);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, new THREE.Color(f.c));
  });
  inst.frustumCulled = false;
  group.add(inst);
  const stringMat = new THREE.MeshStandardMaterial({ color: '#d9d2c5', roughness: 0.9, transparent: true });
  stringMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = nearFade(shader);
  };
  const stringMesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(strings, { color: false })), stringMat);
  group.add(stringMesh);

  // Plastic chairs and beer crates where the fans stand.
  const chairParts = [
    place(new THREE.BoxGeometry(0.44, 0.04, 0.42), 0, 0.44, 0),
    place(new THREE.BoxGeometry(0.44, 0.42, 0.04), 0, 0.68, -0.2, 0, -0.12),
  ];
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    chairParts.push(place(new THREE.CylinderGeometry(0.018, 0.022, 0.44, 5), x, 0.22, z));
  }
  const chairGeo = mergeGeometries(normalizeForMerge(chairParts, { color: false }));
  const crateGeo = new THREE.BoxGeometry(0.42, 0.3, 0.32);
  crateGeo.translate(0, 0.15, 0);
  const props = [];
  for (let i = 0; i < 12; i += 1) {
    props.push({
      chair: rng() < 0.6,
      x: -COURT.halfLength + 1 + rng() * (COURT.halfLength * 2 - 2),
      z: COURT.halfWidth + 1.0 + rng() * 2,
      yaw: Math.PI + (rng() - 0.5) * 1.2,
      c: rng.pick(['#d62828', '#f4f1e8', '#1f8a4c', '#1d4fa3', '#f6c915']),
    });
  }
  for (const kind of ['chair', 'crate']) {
    const list = props.filter((p) => (kind === 'chair') === p.chair);
    const im = new THREE.InstancedMesh(kind === 'chair' ? chairGeo : crateGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), list.length);
    list.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, 0.16, p.z), q.setFromAxisAngle(up, p.yaw), one);
      im.setMatrixAt(i, m);
      im.setColorAt(i, new THREE.Color(kind === 'crate' ? rng.pick(['#f6c915', '#d62828', '#1f8a4c']) : p.c));
    });
    im.castShadow = true;
    group.add(im);
  }
  void paint;
  return { group, update: (t) => (uniforms.uTime.value = t) };
}
