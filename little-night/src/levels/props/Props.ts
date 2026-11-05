import * as THREE from 'three';
import { mat, rbox, box, cyl, sphere, torus, lathe, tube, plane, basicMat, shadowed } from '../../art/Materials';
import { woodGrain, quilt, fabricStripes, blockFace, crayonDrawing, photo, notePaper, rug, noiseRoughness } from '../../art/Textures';

export const M = {
  wood: (c = '#8a5f3c') => mat(`wood-${c}`, { map: woodGrain(c), roughness: 0.62 }),
  paint: (c: string, r = 0.7) => mat(`paint-${c}-${r}`, { color: c, roughness: r, roughnessMap: noiseRoughness('paint', 0.6, 0.85, [3, 3]) }),
  brass: () => mat('brass', { color: '#c79a4a', metalness: 0.85, roughness: 0.32 }),
  iron: () => mat('iron', { color: '#3a3a3e', metalness: 0.7, roughness: 0.5 }),
  chrome: () => mat('chrome', { color: '#c8ccd2', metalness: 1, roughness: 0.18 }),
  fabric: (c: string) => mat(`fabric-${c}`, { color: c, roughness: 0.95 }),
  ceramic: (c: string) => mat(`ceramic-${c}`, { color: c, roughness: 0.25, metalness: 0 }),
  plastic: (c: string) => mat(`plastic-${c}`, { color: c, roughness: 0.4 }),
};

/** Big bed with headboard, quilt, pillows. Frame underside at 0.5 so a child can crawl under. */
export function bigBed(w: number, l: number): THREE.Group {
  const g = new THREE.Group();
  const frameWood = M.wood('#6f4a32');
  const top = 0.78;
  // Legs
  for (const [x, z] of [[-w / 2 + 0.05, -l / 2 + 0.05], [w / 2 - 0.05, -l / 2 + 0.05], [-w / 2 + 0.05, l / 2 - 0.05], [w / 2 - 0.05, l / 2 - 0.05]]) {
    g.add(lathe('bed-leg', [[0.0, 0], [0.04, 0], [0.045, 0.05], [0.032, 0.1], [0.038, 0.3], [0.03, 0.48], [0.045, 0.52], [0, 0.52]], frameWood, 12).translateX(x).translateZ(z));
  }
  // Side rails + slat box
  g.add(rbox(w, 0.16, l, frameWood, 0.02, 0, 0.48, 0));
  // Mattress
  g.add(rbox(w - 0.08, 0.16, l - 0.08, M.fabric('#e9e2d4'), 0.06, 0, 0.62, 0));
  // Quilt draped over, with a fold near the pillow
  const quiltMat = mat('quilt', { map: quilt(['#c9733f', '#e7a65b', '#5e6f9a', '#8a9cc4', '#d9c7a3'], [2, 3]), roughness: 0.95 });
  const q = rbox(w + 0.04, 0.06, l * 0.72, quiltMat, 0.03, 0, top - 0.02, l * 0.12);
  g.add(q);
  for (const s of [-1, 1]) {
    const drape = rbox(0.04, 0.3, l * 0.72, quiltMat, 0.02, s * (w / 2 + 0.02), top - 0.3, l * 0.12);
    g.add(drape);
  }
  const fold = rbox(w + 0.02, 0.08, 0.22, mat('quilt-back', { color: '#efe6d2', roughness: 0.95 }), 0.04, 0, top - 0.01, -l * 0.24);
  fold.rotation.x = -0.15;
  g.add(fold);
  // Pillows
  for (const s of [-1, 1]) {
    const pillow = sphere(0.2, M.fabric('#f1ece2'), 14);
    pillow.scale.set(1.1, 0.33, 0.7);
    pillow.position.set(s * w * 0.22, top + 0.05, -l / 2 + 0.22);
    g.add(pillow);
  }
  // Headboard with spindles and a carved moon
  const hb = new THREE.Group();
  hb.position.z = -l / 2 - 0.03;
  hb.add(rbox(w + 0.1, 0.1, 0.06, frameWood, 0.02, 0, 1.25, 0));
  hb.add(rbox(w + 0.1, 0.08, 0.06, frameWood, 0.02, 0, 0.62, 0));
  for (const s of [-1, 1]) hb.add(rbox(0.09, 1.38, 0.09, frameWood, 0.02, s * (w / 2 + 0.02), 0, 0));
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + 0.12 + (i * (w - 0.24)) / 6;
    hb.add(cyl(0.017, 0.017, 0.56, frameWood, 8, x, 0.69, 0));
  }
  const moon = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20, Math.PI * 1.25), M.paint('#e8c46a', 0.5));
  moon.position.set(0, 1.42, 0);
  moon.rotation.z = 0.9;
  hb.add(moon);
  // Footboard
  const fb = new THREE.Group();
  fb.position.z = l / 2 + 0.03;
  fb.add(rbox(w + 0.1, 0.08, 0.06, frameWood, 0.02, 0, 0.88, 0));
  for (const s of [-1, 1]) fb.add(rbox(0.08, 0.98, 0.08, frameWood, 0.02, s * (w / 2 + 0.02), 0, 0));
  g.add(hb, fb);
  // A knitted octopus plush on the pillow (the child's toy)
  const octo = octopusPlush('#7d5ba6');
  octo.position.set(w * 0.18, top + 0.08, -l / 2 + 0.42);
  octo.rotation.y = 0.6;
  g.add(octo);
  return shadowed(g);
}

/** Knitted octopus plush. */
export function octopusPlush(color: string): THREE.Group {
  const g = new THREE.Group();
  const knit = mat(`knit-${color}`, { map: fabricStripes(color, new THREE.Color(color).offsetHSL(0, 0, 0.08).getStyle(), [2, 2]), roughness: 1 });
  const head = sphere(0.09, knit, 14);
  head.scale.set(1, 1.15, 1);
  head.position.y = 0.1;
  g.add(head);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pts = [
      new THREE.Vector3(Math.cos(a) * 0.05, 0.04, Math.sin(a) * 0.05),
      new THREE.Vector3(Math.cos(a) * 0.12, 0.0, Math.sin(a) * 0.12),
      new THREE.Vector3(Math.cos(a + 0.4) * 0.17, 0.01, Math.sin(a + 0.4) * 0.17),
    ];
    g.add(tube(`octo-${i}`, pts, 0.02, knit, 8));
  }
  for (const s of [-1, 1]) {
    const eye = sphere(0.018, M.ceramic('#1b1b22'), 8);
    eye.position.set(s * 0.035, 0.12, 0.08);
    g.add(eye);
  }
  return g;
}

/** Dresser carcass (drawers added separately as interactables). */
export function dresserCarcass(w: number, h: number, d: number, color = '#b98a5e'): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood(color);
  const dark = mat(`dresserDark-${color}`, { color: new THREE.Color(color).multiplyScalar(0.35), roughness: 0.8 });
  g.add(rbox(w + 0.04, 0.035, d + 0.03, wood, 0.012, 0, h - 0.035, 0));
  for (const s of [-1, 1]) g.add(rbox(0.035, h - 0.04, d, wood, 0.008, s * (w / 2 - 0.0175), 0.04, 0));
  g.add(rbox(w, h - 0.04, 0.02, wood, 0.005, 0, 0.04, -d / 2 + 0.01));
  g.add(rbox(w, 0.04, d, dark, 0.005, 0, 0, 0));
  // dark interior so open drawers read
  g.add(box(w - 0.08, h - 0.12, d - 0.06, dark, 0, 0.06, -0.02));
  for (const s of [-1, 1]) for (const z of [-1, 1]) g.add(sphere(0.025, wood, 8, s * (w / 2 - 0.04), 0.0, z * (d / 2 - 0.04)));
  return shadowed(g);
}

export function wardrobe(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#5b3b27');
  g.add(rbox(w, h, d, wood, 0.02, 0, 0.08, 0));
  g.add(rbox(w + 0.08, 0.1, d + 0.06, wood, 0.03, 0, h + 0.08, 0));
  g.add(rbox(w + 0.04, 0.08, d + 0.02, wood, 0.02, 0, 0, 0));
  // Door panels with carved stars
  const inset = mat('wardrobe-inset', { map: woodGrain('#704a30'), roughness: 0.7 });
  for (const s of [-1, 1]) {
    g.add(rbox(w / 2 - 0.06, h - 0.2, 0.02, inset, 0.01, (s * w) / 4, 0.18, d / 2 + 0.005));
    g.add(sphere(0.022, M.brass(), 10, s * 0.05, 1.05, d / 2 + 0.03));
  }
  g.add(rbox(0.015, h - 0.06, 0.03, mat('wardrobe-gap', { color: '#120b06' }), 0.003, 0, 0.11, d / 2 + 0.005));
  return shadowed(g);
}

export function toyShelf(w: number, h: number, d: number, shelves: number[]): THREE.Group {
  const g = new THREE.Group();
  const wood = M.paint('#d9cdb7', 0.75);
  const back = M.paint('#7b9cb3', 0.8);
  for (const s of [-1, 1]) g.add(rbox(0.03, h, d, wood, 0.01, s * (w / 2 - 0.015), 0, 0));
  g.add(rbox(w, h, 0.015, back, 0.004, 0, 0, -d / 2 + 0.008));
  for (const y of [0.06, ...shelves, h - 0.03]) g.add(rbox(w, 0.03, d, wood, 0.008, 0, y, 0));
  return shadowed(g);
}

export function toyBlock(label: string, color: string, size = 0.11): THREE.Mesh {
  const faces = [0, 1, 2, 3, 4, 5].map((i) =>
    mat(`block-${label}-${color}-${i}`, { map: blockFace(i % 2 ? label : String.fromCharCode(65 + ((label.charCodeAt(0) + i) % 26)), color, '#fff8e8'), roughness: 0.55 }),
  );
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), faces);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function ringStack(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.012, 0.012, 0.22, M.wood('#c9a36b'), 8));
  g.add(cyl(0.07, 0.08, 0.02, M.wood('#c9a36b'), 16));
  const colors = ['#d0453a', '#e78a2f', '#e8c33b', '#5aa05a', '#4c78b8'];
  colors.forEach((c, i) => {
    const r = torus(0.06 - i * 0.008, 0.02, M.plastic(c));
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.04 + i * 0.035;
    g.add(r);
  });
  return shadowed(g);
}

export function ball(color: string, r = 0.09): THREE.Mesh {
  const m = sphere(r, mat(`ball-${color}`, { map: fabricStripes(color, '#f2ead8', [1, 3]), roughness: 0.45 }), 18);
  m.position.y = r;
  return m;
}

/** Rocking whale (wooden ride-on toy). */
export function rockingWhale(): THREE.Group {
  const g = new THREE.Group();
  const paint = M.paint('#4f7fa8', 0.5);
  const belly = M.paint('#e9dfc8', 0.6);
  const body = sphere(0.28, paint, 20);
  body.scale.set(1.5, 0.75, 0.75);
  body.position.y = 0.42;
  g.add(body);
  const under = sphere(0.27, belly, 18);
  under.scale.set(1.45, 0.55, 0.7);
  under.position.y = 0.36;
  g.add(under);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 12), paint);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.5, 0.5, 0);
  g.add(tail);
  for (const s of [-1, 1]) {
    const fluke = rbox(0.18, 0.03, 0.12, paint, 0.012, -0.64, 0.58, s * 0.08);
    fluke.rotation.y = s * 0.5;
    g.add(fluke);
    const eye = sphere(0.025, M.ceramic('#151515'), 8, 0.3, 0.48, s * 0.19);
    g.add(eye);
    const rocker = tube(`rocker${s}`, [new THREE.Vector3(-0.6, 0.12, s * 0.18), new THREE.Vector3(0, 0.02, s * 0.18), new THREE.Vector3(0.6, 0.12, s * 0.18)], 0.025, M.wood('#7a5332'), 16);
    g.add(rocker);
  }
  g.add(rbox(0.25, 0.04, 0.3, M.fabric('#b8463a'), 0.015, 0, 0.62, 0));
  const handle = cyl(0.015, 0.015, 0.4, M.wood('#7a5332'), 8, 0.2, 0.55, 0);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.22, 0.72, 0);
  g.add(handle);
  return shadowed(g);
}

/** Framed crayon drawing pinned to the wall. */
export function drawing(kind: Parameters<typeof crayonDrawing>[0], w = 0.32, h = 0.32): THREE.Group {
  const g = new THREE.Group();
  const m = plane(w, h, mat(`drawing-${kind}`, { map: crayonDrawing(kind), roughness: 0.9 }));
  g.add(m);
  const pin = sphere(0.008, M.plastic('#d0453a'), 6, 0, h / 2 - 0.02, 0.006);
  g.add(pin);
  g.rotation.z = (kind.length % 3) * 0.03 - 0.03;
  return g;
}

export function photoFrame(kind: Parameters<typeof photo>[0], w = 0.18, h = 0.22): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(w + 0.04, h + 0.04, 0.02, M.wood('#3e2a1c'), 0.006, 0, -h / 2 - 0.02, 0));
  const p = plane(w, h, mat(`photo-${kind}`, { map: photo(kind), roughness: 0.5 }));
  p.position.z = 0.011;
  g.add(p);
  return g;
}

export function paperNote(seed: string, w = 0.14, h = 0.18): THREE.Mesh {
  const m = plane(w, h, mat(`note-${seed}`, { map: notePaper(seed), roughness: 0.9, side: THREE.DoubleSide }));
  m.castShadow = false;
  return m;
}

export function roundRug(r: number, a: string, b: string, c: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat(`rug-${a}${b}${c}`, { map: rug(a, b, c), roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  m.receiveShadow = true;
  return m;
}

export function curtain(w: number, h: number, color: string): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, 24, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 28) * 0.025);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat(`curtain-${color}`, { color, roughness: 0.95, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

/** Hanging crib mobile with moons and stars. */
export function mobile(): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#b98a5e');
  g.add(cyl(0.006, 0.006, 0.6, wood, 6, 0, 0, 0));
  const ring = torus(0.22, 0.008, wood);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const shapes = ['#e8c46a', '#9cc2e8', '#e8c46a', '#d98c6a', '#9cc2e8'];
  shapes.forEach((c, i) => {
    const a = (i / shapes.length) * Math.PI * 2;
    const len = 0.15 + (i % 2) * 0.08;
    g.add(cyl(0.002, 0.002, len, M.fabric('#ddd'), 4, Math.cos(a) * 0.22, -len, Math.sin(a) * 0.22));
    const s = i % 2 ? sphere(0.04, M.paint(c, 0.6), 10) : new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.015, 6, 12, Math.PI * 1.3), M.paint(c, 0.6));
    s.position.set(Math.cos(a) * 0.22, -len - 0.04, Math.sin(a) * 0.22);
    g.add(s);
  });
  return g;
}

/** Wheeled wooden toy chest (pushable). Origin at base center. */
export function toyChest(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const paint = M.paint('#b5523b', 0.6);
  const trim = M.paint('#efe1c0', 0.6);
  g.add(rbox(w, h - 0.08, d, paint, 0.02, 0, 0.05, 0));
  g.add(rbox(w + 0.03, 0.06, d + 0.03, trim, 0.02, 0, h - 0.06, 0));
  for (const s of [-1, 1]) {
    g.add(rbox(w * 0.8, 0.03, 0.01, trim, 0.005, 0, h * 0.35, s * (d / 2 + 0.004)));
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.06, 5), M.paint('#e8c46a', 0.5));
    star.position.set(0, h * 0.55, s * (d / 2 + 0.006));
    if (s < 0) star.rotation.y = Math.PI;
    g.add(star);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = cyl(0.035, 0.035, 0.03, M.iron(), 12, sx * (w / 2 - 0.06), 0.0, sz * (d / 2 - 0.05));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.y = 0.035;
    g.add(wheel);
  }
  // Toys poking out
  const b = toyBlock('Z', '#4c78b8', 0.1);
  b.position.set(-0.12, h + 0.02, 0.02);
  b.rotation.set(0.2, 0.3, 0.1);
  g.add(b);
  return shadowed(g);
}

export function stool(h = 0.32): THREE.Group {
  const g = new THREE.Group();
  const wood = M.paint('#7aa66a', 0.6);
  g.add(rbox(0.36, 0.04, 0.28, wood, 0.015, 0, h - 0.04, 0));
  for (const s of [-1, 1]) g.add(rbox(0.03, h - 0.04, 0.26, wood, 0.01, s * 0.14, 0, 0));
  return shadowed(g);
}

/** Small dying battery lantern toy: the bedroom's warm accent light. */
export function toyLantern(): { group: THREE.Group; light: THREE.PointLight; glass: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const red = M.plastic('#b03a2e');
  g.add(cyl(0.06, 0.07, 0.03, red, 14));
  const glass = new THREE.MeshStandardMaterial({ color: '#ffc27a', emissive: '#ff9a3a', emissiveIntensity: 1.2, transparent: true, opacity: 0.85, roughness: 0.2 });
  g.add(cyl(0.045, 0.045, 0.11, glass, 14, 0, 0.03, 0));
  g.add(cyl(0.06, 0.05, 0.03, red, 14, 0, 0.14, 0));
  const handle = torus(0.04, 0.006, M.iron(), Math.PI);
  handle.position.y = 0.17;
  g.add(handle);
  const light = new THREE.PointLight('#ff9a4a', 0.8, 3.2, 1.8);
  light.position.y = 0.09;
  g.add(light);
  return { group: shadowed(g), light, glass };
}

/** Glow-in-the-dark ceiling stars: faint, fixed emissive. */
export function ceilingStars(count: number, minX: number, maxX: number, minZ: number, maxZ: number, y: number, rng: () => number): THREE.InstancedMesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 0.06 : 0.026;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, basicMat('glowstar', { color: '#a9dcb4', transparent: true, opacity: 0.32, side: THREE.DoubleSide }), count);
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    o.position.set(THREE.MathUtils.lerp(minX, maxX, rng()), y, THREE.MathUtils.lerp(minZ, maxZ, rng()));
    o.rotation.set(0, rng() * Math.PI, 0);
    o.scale.setScalar(0.45 + rng() * 0.55);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  }
  return m;
}

/** Window sash with mullions (the opening itself is cut in the wall). */
export function windowSash(w: number, h: number, frameMat: THREE.Material, cols = 2, rows = 3): THREE.Group {
  const g = new THREE.Group();
  const t = 0.04;
  g.add(rbox(w, t, 0.06, frameMat, 0.01, 0, 0, 0));
  g.add(rbox(w, t, 0.06, frameMat, 0.01, 0, h - t, 0));
  for (const s of [-1, 1]) g.add(rbox(t, h, 0.06, frameMat, 0.01, s * (w / 2 - t / 2), 0, 0));
  for (let i = 1; i < cols; i++) g.add(rbox(0.025, h, 0.04, frameMat, 0.006, -w / 2 + (i * w) / cols, 0, 0));
  for (let j = 1; j < rows; j++) g.add(rbox(w, 0.025, 0.04, frameMat, 0.006, 0, (j * h) / rows, 0));
  return shadowed(g, true, true);
}

/** Wooden dining/kitchen chair. Origin at base center; back on -z side. */
export function chair(seat = 0.46, color = '#7b5a3f'): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood(color);
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    g.add(cyl(0.02, 0.018, seat, wood, 8, x, 0, z));
  }
  g.add(rbox(0.46, 0.04, 0.46, wood, 0.015, 0, seat, 0));
  for (const s of [-1, 1]) g.add(cyl(0.02, 0.02, 0.5, wood, 8, s * 0.19, seat, -0.2));
  g.add(rbox(0.42, 0.12, 0.03, wood, 0.01, 0, seat + 0.36, -0.2));
  g.add(rbox(0.42, 0.04, 0.025, wood, 0.01, 0, seat + 0.2, -0.2));
  g.add(rbox(0.38, 0.03, 0.03, wood, 0.01, 0, 0.14, 0.19));
  // Seat cushion
  g.add(rbox(0.4, 0.035, 0.4, M.fabric('#6f8a7a'), 0.015, 0, seat + 0.04, 0.01));
  return shadowed(g);
}

export function cardboardBox(w: number, h: number, d: number, label = ''): THREE.Group {
  const g = new THREE.Group();
  const card = mat('cardboard', { color: '#9c7a52', roughness: 0.95, roughnessMap: noiseRoughness('card', 0.8, 1) });
  g.add(rbox(w, h, d, card, 0.01, 0, 0, 0));
  g.add(box(w + 0.005, 0.05, 0.002, mat('tape', { color: '#c9b48a', roughness: 0.5 }), 0, h - 0.025, d / 2 + 0.002).translateY(-0.025));
  const flap = rbox(w * 0.5, 0.01, d, card, 0.003, -w * 0.25, h, 0);
  flap.rotation.z = 0.25;
  flap.position.y += 0.02;
  g.add(flap);
  if (label) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgba(0,0,0,0)';
    x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#2a1a10';
    x.font = 'bold 28px Georgia';
    x.textAlign = 'center';
    x.fillText(label, 64, 42);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const p = plane(w * 0.6, w * 0.3, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1 }));
    p.position.set(0, h * 0.55, d / 2 + 0.004);
    g.add(p);
  }
  return shadowed(g);
}
