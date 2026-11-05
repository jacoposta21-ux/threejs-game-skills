import * as THREE from 'three';
import { mat, rbox, box, cyl, sphere, torus, lathe, plane, shadowed } from '../../art/Materials';
import { tiles, noiseRoughness, woodGrain } from '../../art/Textures';
import { M } from './Props';

const cabinetPaint = () => mat('cab-paint', { color: '#6f8a83', roughness: 0.55, roughnessMap: noiseRoughness('cab', 0.45, 0.7, [2, 2]) });
const counterTop = () => mat('counter-top', { color: '#d9d4c7', roughness: 0.35, roughnessMap: noiseRoughness('stone', 0.25, 0.5, [3, 3]) });

/** A run of lower cabinets along X with a counter top. Origin: left-front-bottom corner. */
export function counterRun(length: number, depth = 0.6, height = 0.92, skipDoorsAt: number[] = []): THREE.Group {
  const g = new THREE.Group();
  const paint = cabinetPaint();
  const dark = mat('cab-kick', { color: '#1b2321', roughness: 0.9 });
  g.add(box(length, 0.1, depth - 0.06, dark, length / 2, 0, -depth / 2 - 0.03));
  g.add(rbox(length + 0.02, 0.04, depth + 0.03, counterTop(), 0.006, length / 2, height - 0.04, -depth / 2 + 0.015));
  const n = Math.round(length / 0.6);
  const w = length / n;
  for (let i = 0; i < n; i++) {
    const x = i * w + w / 2;
    if (skipDoorsAt.includes(i)) continue;
    g.add(rbox(w - 0.02, height - 0.32, 0.03, paint, 0.008, x, 0.12, -0.02));
    g.add(rbox(w - 0.12, height - 0.44, 0.012, mat('cab-inset', { color: '#5e7770', roughness: 0.6 }), 0.004, x, 0.18, 0.0));
    g.add(rbox(w - 0.02, 0.14, 0.03, paint, 0.008, x, height - 0.19, -0.02));
    const pull = cyl(0.006, 0.006, 0.12, M.chrome(), 8, x, height - 0.13, 0.008);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(x, height - 0.12, 0.012);
    g.add(pull);
  }
  g.add(box(length, height - 0.14, 0.02, paint, length / 2, 0.1, -depth + 0.01));
  return shadowed(g);
}

/** Upper wall cabinets. Origin: left-front-bottom. */
export function upperCabinets(length: number, depth = 0.35, height = 0.72): THREE.Group {
  const g = new THREE.Group();
  const paint = cabinetPaint();
  g.add(rbox(length, height, depth, paint, 0.01, length / 2, 0, -depth / 2));
  const n = Math.round(length / 0.5);
  const w = length / n;
  for (let i = 0; i < n; i++) {
    const x = i * w + w / 2;
    g.add(rbox(w - 0.03, height - 0.04, 0.02, mat('cab-inset', { color: '#5e7770', roughness: 0.6 }), 0.005, x, 0.02, 0.005));
    g.add(sphere(0.012, M.chrome(), 8, x + (i % 2 ? -1 : 1) * (w / 2 - 0.06), 0.08, 0.025));
  }
  g.add(rbox(length + 0.04, 0.04, depth + 0.04, paint, 0.01, length / 2, height, -depth / 2));
  return shadowed(g);
}

export function backsplash(length: number, height: number): THREE.Mesh {
  const t = tiles('#cfd6cf', '#bcc8c3', '#8a948f', [length / 0.6, height / 0.6], false);
  const m = plane(length, height, mat('backsplash', { map: t, roughness: 0.3 }));
  return m;
}

export function sink(): THREE.Group {
  const g = new THREE.Group();
  const steel = mat('steel', { color: '#9aa3a8', metalness: 0.9, roughness: 0.3 });
  g.add(rbox(0.6, 0.02, 0.42, steel, 0.01, 0, 0, 0));
  g.add(box(0.5, 0.012, 0.34, mat('sink-dark', { color: '#222829', roughness: 0.4 }), 0, 0.012, 0));
  const tap = lathe('tap', [[0.0, 0], [0.025, 0], [0.02, 0.03], [0.012, 0.05], [0.012, 0.25], [0, 0.25]], M.chrome(), 12);
  tap.position.set(0, 0, -0.17);
  g.add(tap);
  const spout = torus(0.08, 0.011, M.chrome(), Math.PI);
  spout.position.set(0, 0.25, -0.09);
  spout.rotation.y = Math.PI / 2;
  g.add(spout);
  for (const s of [-1, 1]) g.add(cyl(0.02, 0.02, 0.03, M.chrome(), 10, s * 0.08, 0.02, -0.17));
  return shadowed(g);
}

export function stove(): THREE.Group {
  const g = new THREE.Group();
  const white = mat('enamel-cream', { color: '#e6e0d0', roughness: 0.25 });
  const black = mat('stove-black', { color: '#141414', roughness: 0.5 });
  g.add(rbox(0.7, 0.9, 0.6, white, 0.02, 0, 0, -0.3));
  g.add(rbox(0.56, 0.4, 0.02, black, 0.01, 0, 0.18, 0.005));
  g.add(cyl(0.008, 0.008, 0.5, M.chrome(), 8, 0, 0.66, 0.03).rotateZ(Math.PI / 2));
  for (const [x, z] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, -0.42], [0.17, -0.42]]) {
    const ring = torus(0.08, 0.008, black);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.905, z);
    g.add(ring);
  }
  g.add(rbox(0.7, 0.18, 0.06, white, 0.01, 0, 0.9, -0.6));
  for (let i = 0; i < 4; i++) g.add(cyl(0.022, 0.022, 0.025, black, 12, -0.24 + i * 0.16, 0.8, 0.0).rotateX(Math.PI / 2));
  // A pot on the stove
  const pot = lathe('pot', [[0, 0], [0.12, 0], [0.13, 0.02], [0.13, 0.15], [0.135, 0.16]], mat('pot', { color: '#7a2f2a', roughness: 0.35, metalness: 0.2 }), 18);
  pot.position.set(0.17, 0.91, -0.15);
  g.add(pot);
  return shadowed(g);
}

export function fridge(): { group: THREE.Group } {
  const g = new THREE.Group();
  const cream = mat('fridge', { color: '#d8d2bd', roughness: 0.3 });
  g.add(rbox(0.78, 1.85, 0.68, cream, 0.06, 0, 0, -0.34));
  g.add(box(0.78, 0.01, 0.01, mat('fridge-line', { color: '#6a665a' }), 0, 1.25, 0.002));
  for (const y of [0.85, 1.45]) {
    const h = rbox(0.03, 0.32, 0.04, M.chrome(), 0.012, 0.32, y, 0.02);
    g.add(h);
  }
  // Magnets & a child's drawing on the fridge door
  const colors = ['#d0453a', '#e8c33b', '#4c78b8', '#5aa05a'];
  colors.forEach((c, i) => g.add(sphere(0.018, M.plastic(c), 8, -0.25 + i * 0.12, 1.65 - (i % 2) * 0.12, 0.012)));
  return { group: shadowed(g) };
}

export function diningTable(w: number, d: number, h = 0.76): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#6a4630');
  g.add(rbox(w, 0.05, d, wood, 0.015, 0, h - 0.05, 0));
  g.add(rbox(w - 0.12, 0.09, d - 0.12, wood, 0.01, 0, h - 0.14, 0));
  for (const [x, z] of [[-w / 2 + 0.07, -d / 2 + 0.07], [w / 2 - 0.07, -d / 2 + 0.07], [-w / 2 + 0.07, d / 2 - 0.07], [w / 2 - 0.07, d / 2 - 0.07]]) {
    g.add(lathe('table-leg', [[0, 0], [0.035, 0], [0.03, 0.08], [0.04, 0.2], [0.028, 0.45], [0.035, h - 0.14], [0, h - 0.14]], wood, 10).translateX(x).translateZ(z));
  }
  // Table cloth runner + a bowl and cups
  g.add(rbox(w * 0.3, 0.004, d + 0.12, M.fabric('#a8b8b0'), 0.002, 0, h, 0));
  const bowl = lathe('bowl', [[0, 0], [0.06, 0], [0.12, 0.05], [0.13, 0.07]], M.ceramic('#e9e2d4'), 16);
  bowl.position.set(0.1, h + 0.005, 0.05);
  g.add(bowl);
  for (let i = 0; i < 3; i++) g.add(sphere(0.035, M.plastic(['#d0453a', '#e8a23b', '#9fbf5a'][i]), 10, 0.1 + (i - 1) * 0.05, h + 0.05, 0.05 + (i % 2) * 0.03));
  const cup = lathe('cup', [[0, 0], [0.035, 0], [0.04, 0.09], [0.042, 0.095]], M.ceramic('#c9d6e6'), 12);
  cup.position.set(-w * 0.3, h, -d * 0.2);
  g.add(cup);
  return shadowed(g);
}

export function radio(): { group: THREE.Group; dial: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const wood = mat('radio-wood', { map: woodGrain('#5a3220'), roughness: 0.4 });
  g.add(rbox(0.36, 0.22, 0.14, wood, 0.05, 0, 0, 0));
  const grille = mat('radio-grille', { color: '#c9b78a', roughness: 0.8 });
  g.add(rbox(0.16, 0.14, 0.01, grille, 0.01, -0.07, 0.04, 0.07));
  for (let i = 0; i < 5; i++) g.add(box(0.15, 0.006, 0.006, wood, -0.07, 0.055 + i * 0.024, 0.077));
  const dial = new THREE.MeshStandardMaterial({ color: '#9fd18c', emissive: '#6ad16a', emissiveIntensity: 1.4 });
  g.add(rbox(0.11, 0.05, 0.01, dial, 0.01, 0.09, 0.12, 0.07));
  for (const x of [0.06, 0.12]) g.add(cyl(0.018, 0.018, 0.02, M.iron(), 12, x, 0.05, 0.075).rotateX(Math.PI / 2));
  const ant = cyl(0.003, 0.003, 0.35, M.chrome(), 6, 0.12, 0.22, -0.03);
  ant.rotation.z = -0.4;
  g.add(ant);
  return { group: shadowed(g), dial };
}

export function breadTin(): THREE.Group {
  const g = new THREE.Group();
  const red = mat('tin-red', { color: '#8f2d2a', roughness: 0.35, metalness: 0.5 });
  g.add(rbox(0.38, 0.24, 0.26, red, 0.03, 0, 0, 0));
  g.add(rbox(0.39, 0.06, 0.27, mat('tin-cream', { color: '#e8dcc0', roughness: 0.4, metalness: 0.3 }), 0.02, 0, 0.24, 0));
  g.add(plane(0.2, 0.05, mat('tin-label', { color: '#e8dcc0', roughness: 0.5 })).translateY(0.12).translateZ(0.131));
  return shadowed(g);
}

export function jar(color: string, h = 0.18): THREE.Mesh {
  const m = lathe(`jar-${h}`, [[0, 0], [0.05, 0], [0.055, 0.02], [0.055, h - 0.03], [0.04, h - 0.01], [0.042, h]], mat(`jar-${color}`, { color, roughness: 0.25, metalness: 0.05 }), 14);
  return m;
}

export function can(color: string): THREE.Mesh {
  return cyl(0.04, 0.04, 0.11, mat(`can-${color}`, { color, roughness: 0.4, metalness: 0.6 }), 12);
}

export function flourSack(): THREE.Group {
  const g = new THREE.Group();
  const burlap = mat('burlap', { color: '#bfa37a', roughness: 1, roughnessMap: noiseRoughness('burlap', 0.85, 1, [4, 4]) });
  const body = sphere(0.3, burlap, 16);
  body.scale.set(1.05, 1.15, 0.85);
  body.position.y = 0.33;
  g.add(body);
  const neck = cyl(0.08, 0.16, 0.14, burlap, 12, 0, 0.62, 0);
  g.add(neck);
  g.add(torus(0.085, 0.012, M.fabric('#6a4a2a')).translateY(0.7).rotateX(Math.PI / 2));
  return shadowed(g);
}

export function crate(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#9a7650');
  const slats = 3;
  for (let i = 0; i < slats; i++) {
    const y = (i * h) / slats;
    g.add(rbox(w, h / slats - 0.02, 0.02, wood, 0.005, 0, y, d / 2 - 0.01));
    g.add(rbox(w, h / slats - 0.02, 0.02, wood, 0.005, 0, y, -d / 2 + 0.01));
    g.add(rbox(0.02, h / slats - 0.02, d, wood, 0.005, w / 2 - 0.01, y, 0));
    g.add(rbox(0.02, h / slats - 0.02, d, wood, 0.005, -w / 2 + 0.01, y, 0));
  }
  g.add(rbox(w, 0.02, d, wood, 0.005, 0, h - 0.02, 0));
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.add(rbox(0.05, h, 0.05, M.wood('#6a4e32'), 0.008, s * (w / 2 - 0.025), 0, t * (d / 2 - 0.025)));
  return shadowed(g);
}

export function pantryShelf(w: number, h: number, d: number, levels: number[], rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#7a5a3a');
  for (const s of [-1, 1]) g.add(rbox(0.04, h, d, wood, 0.01, s * (w / 2 - 0.02), 0, 0));
  for (const y of levels) {
    g.add(rbox(w, 0.03, d, wood, 0.008, 0, y, 0));
    let x = -w / 2 + 0.1;
    while (x < w / 2 - 0.1) {
      const r = rng();
      const item = r < 0.45 ? jar(['#b56a3a', '#c9a34a', '#7a2a2a', '#d9cfa8', '#5a7a3a'][Math.floor(rng() * 5)], 0.14 + rng() * 0.1) : can(['#a83a2a', '#3a5a8a', '#c9a34a', '#d6d0c4'][Math.floor(rng() * 4)]);
      item.position.set(x, y + 0.03, (rng() - 0.5) * d * 0.4);
      g.add(item);
      x += 0.1 + rng() * 0.06;
    }
  }
  return shadowed(g);
}

export function washingMachine(): THREE.Group {
  const g = new THREE.Group();
  const white = mat('wm-white', { color: '#dcd8cc', roughness: 0.35 });
  g.add(rbox(0.62, 0.86, 0.6, white, 0.03, 0, 0, 0));
  const door = torus(0.17, 0.03, M.chrome());
  door.position.set(0, 0.45, 0.31);
  g.add(door);
  g.add(cyl(0.15, 0.15, 0.01, mat('wm-glass', { color: '#20262a', roughness: 0.05, metalness: 0.3 }), 24, 0, 0.45, 0.3).rotateX(Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.02, M.chrome(), 12, 0.2, 0.78, 0.3).rotateX(Math.PI / 2));
  return shadowed(g);
}

export function bucket(): THREE.Mesh {
  const m = lathe('bucket', [[0, 0], [0.13, 0], [0.16, 0.3], [0.165, 0.31]], mat('bucket', { color: '#8a9196', metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }), 18);
  m.castShadow = true;
  return m;
}

export function spoon(): THREE.Group {
  const g = new THREE.Group();
  const s = M.chrome();
  const bowl = sphere(0.025, s, 10);
  bowl.scale.set(1, 0.3, 1.4);
  g.add(bowl);
  const handle = rbox(0.012, 0.006, 0.16, s, 0.003, 0, -0.003, 0.1);
  g.add(handle);
  return shadowed(g);
}

export function babyGate(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const white = mat('gate-white', { color: '#e8e4da', roughness: 0.5 });
  g.add(rbox(w, 0.04, 0.04, white, 0.01, 0, h - 0.04, 0));
  g.add(rbox(w, 0.04, 0.04, white, 0.01, 0, 0.02, 0));
  const n = Math.floor(w / 0.07);
  for (let i = 0; i <= n; i++) g.add(cyl(0.01, 0.01, h - 0.06, white, 6, -w / 2 + (i * w) / n, 0.04, 0));
  g.add(rbox(0.08, 0.06, 0.06, mat('gate-latch', { color: '#4a7aa8', roughness: 0.4 }), 0.01, w / 2 - 0.1, h - 0.08, 0.03));
  return shadowed(g);
}

/** Pull-down attic ladder with its hatch frame. Origin: base of ladder on floor. */
export function atticLadder(height: number): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#9a7a52');
  const angle = 0.32;
  const len = height / Math.cos(angle);
  const rails = new THREE.Group();
  rails.rotation.x = -angle;
  for (const s of [-1, 1]) rails.add(rbox(0.05, len, 0.08, wood, 0.01, s * 0.24, 0, 0));
  for (let i = 1; i < 10; i++) rails.add(rbox(0.44, 0.03, 0.12, wood, 0.008, 0, (i * len) / 10, 0));
  g.add(rails);
  // Hatch opening frame in the ceiling and the folded-down door panel.
  const top = height;
  g.add(rbox(0.7, 0.05, 1.2, M.wood('#6a4e32'), 0.01, 0, top - 0.02, -Math.tan(angle) * height - 0.1));
  const panel = rbox(0.6, 0.03, 1.0, M.paint('#d9d2c2', 0.6), 0.01, 0, 0, 0);
  panel.position.set(0, top - 0.4, -Math.tan(angle) * height + 0.4);
  panel.rotation.x = 1.25;
  g.add(panel);
  const cord = cyl(0.004, 0.004, 0.6, M.fabric('#d9cfa8'), 4, 0, top - 1.0, 0.3);
  g.add(cord);
  return shadowed(g);
}

export function coatHooks(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(0.9, 0.08, 0.03, M.wood('#5b3b27'), 0.01, 0, 0, 0));
  for (let i = 0; i < 4; i++) g.add(cyl(0.01, 0.006, 0.08, M.brass(), 6, -0.33 + i * 0.22, 0.03, 0.04).rotateX(Math.PI / 2.4));
  // A long dark coat on one hook
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 1.1, 10, 1, true), mat('coat', { color: '#24221f', roughness: 0.95, side: THREE.DoubleSide }));
  coat.position.set(-0.11, -0.52, 0.12);
  g.add(coat);
  return shadowed(g);
}
