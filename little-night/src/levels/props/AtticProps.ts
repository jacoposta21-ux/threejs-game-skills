import * as THREE from 'three';
import { mat, rbox, box, cyl, sphere, torus, lathe, plane, shadowed, basicMat } from '../../art/Materials';
import { woodGrain, noiseRoughness, photo } from '../../art/Textures';
import { M } from './Props';

/** Sheet thrown over furniture: a lumpy draped shell. */
export function sheetCovered(w: number, h: number, d: number, seed = 1): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d, 8, 6, 8);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const top = (y + h / 2) / h;
    // Round off the top, flare the hem, add folds.
    const fold = Math.sin(x * 9 + seed) * 0.02 + Math.sin(z * 11 + seed * 2) * 0.02;
    const flare = (1 - top) * 0.08;
    p.setX(i, x * (1 + flare) + fold * (1 - top));
    p.setZ(i, z * (1 + flare) + fold * (1 - top));
    p.setY(i, y - Math.pow(Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2)), 6) * top * 0.12 + (top < 0.05 ? Math.sin(x * 20 + z * 13 + seed) * 0.015 : 0));
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat('sheet', { color: '#cfc6b8', roughness: 1, roughnessMap: noiseRoughness('sheet', 0.85, 1, [3, 3]) }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function trunk(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const leather = mat('trunk-leather', { color: '#4a2f22', roughness: 0.7 });
  const brass = M.brass();
  g.add(rbox(w, h * 0.72, d, leather, 0.02, 0, 0, 0));
  const lid = new THREE.Group();
  lid.position.set(0, h * 0.72, -d / 2);
  const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 14, 1, false, 0, Math.PI), leather);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.position.z = d / 2;
  lidMesh.scale.set(1, 1, 0.55);
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  g.add(lid);
  g.userData.lid = lid;
  for (const s of [-0.32, 0, 0.32]) g.add(rbox(0.04, h * 0.72 + 0.01, d + 0.01, brass, 0.005, s * w, 0, 0));
  g.add(rbox(0.07, 0.07, 0.02, brass, 0.01, 0, h * 0.58, d / 2 + 0.01));
  return shadowed(g);
}

export function toySoldier(color: string): THREE.Group {
  const g = new THREE.Group();
  const red = M.paint(color, 0.5);
  const black = M.paint('#141414', 0.5);
  g.add(cyl(0.03, 0.035, 0.12, black, 8, 0, 0, 0));
  g.add(cyl(0.035, 0.035, 0.1, red, 8, 0, 0.12, 0));
  g.add(sphere(0.028, M.paint('#e8c9a8', 0.6), 8, 0, 0.25, 0));
  g.add(cyl(0.022, 0.025, 0.06, black, 8, 0, 0.27, 0));
  return shadowed(g);
}

export function toyTrain(): THREE.Group {
  const g = new THREE.Group();
  const red = M.paint('#9a2e28', 0.4);
  const black = M.paint('#1a1a1a', 0.5);
  g.add(rbox(0.32, 0.1, 0.14, red, 0.02, 0, 0.04, 0));
  g.add(cyl(0.06, 0.06, 0.2, black, 12, -0.04, 0.1, 0).rotateZ(Math.PI / 2));
  g.add(rbox(0.1, 0.14, 0.14, red, 0.02, 0.1, 0.14, 0));
  g.add(cyl(0.02, 0.03, 0.08, black, 8, -0.12, 0.16, 0));
  for (const x of [-0.1, 0, 0.1]) for (const z of [-0.075, 0.075]) g.add(cyl(0.035, 0.035, 0.02, M.brass(), 12, x, 0.035, z).rotateX(Math.PI / 2));
  return shadowed(g);
}

export function trainTrack(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 4, 48), M.iron());
  m.rotation.x = Math.PI / 2;
  m.position.y = 0.012;
  return m;
}

/** A dollhouse model of the very house the game takes place in. */
export function dollhouse(): THREE.Group {
  const g = new THREE.Group();
  const wall = M.paint('#d9c7a3', 0.7);
  const roof = M.paint('#5a2e28', 0.6);
  g.add(rbox(0.9, 0.04, 0.5, M.wood('#6a4e32'), 0.01, 0, 0, 0));
  g.add(rbox(0.86, 0.36, 0.02, wall, 0.005, 0, 0.04, -0.23));
  for (const s of [-1, 1]) g.add(rbox(0.02, 0.62, 0.48, wall, 0.005, s * 0.43, 0.04, 0));
  for (const y of [0.04, 0.36]) g.add(rbox(0.86, 0.02, 0.48, M.wood('#8a6a4a'), 0.004, 0, y, 0));
  g.add(rbox(0.02, 0.32, 0.48, wall, 0.004, 0, 0.04, 0));
  for (const s of [-1, 1]) {
    const r = rbox(0.6, 0.02, 0.5, roof, 0.004, s * 0.22, 0.48, 0);
    r.rotation.z = -s * 0.6;
    g.add(r);
  }
  // Tiny furniture: a bed upstairs, a table downstairs, a glowing firefly in the attic.
  g.add(rbox(0.16, 0.05, 0.1, M.paint('#5e6f9a', 0.6), 0.005, -0.2, 0.38, 0));
  g.add(rbox(0.14, 0.08, 0.1, M.wood('#7a5a3f'), 0.005, 0.2, 0.06, 0));
  g.add(sphere(0.012, basicMat('tiny-fly', { color: '#ffb44f' }), 8, 0, 0.58, 0));
  // A tiny figure in a long coat, in the attic.
  g.add(cyl(0.012, 0.025, 0.09, M.paint('#1a1a1a', 0.8), 8, 0.06, 0.38, 0));
  return shadowed(g);
}

export function workbench(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('bench-wood', { map: woodGrain('#7a5a3a'), roughness: 0.7 });
  g.add(rbox(1.8, 0.07, 0.65, wood, 0.01, 0, 0.83, 0));
  for (const [x, z] of [[-0.85, -0.28], [0.85, -0.28], [-0.85, 0.28], [0.85, 0.28]]) g.add(rbox(0.07, 0.83, 0.07, wood, 0.01, x, 0, z));
  g.add(rbox(1.7, 0.04, 0.55, wood, 0.01, 0, 0.18, 0));
  // Tools: vise, files, cogs, a small hammer, a jar of springs.
  g.add(rbox(0.12, 0.1, 0.1, M.iron(), 0.01, 0.6, 0.9, 0.18));
  for (let i = 0; i < 4; i++) g.add(rbox(0.012, 0.004, 0.2, M.iron(), 0.002, -0.3 + i * 0.04, 0.905, 0.1));
  for (let i = 0; i < 3; i++) {
    const cog = torus(0.03 + i * 0.01, 0.008, M.brass());
    cog.rotation.x = Math.PI / 2;
    cog.position.set(0.1 + i * 0.09, 0.91, -0.12);
    g.add(cog);
  }
  const hammer = new THREE.Group();
  hammer.add(cyl(0.008, 0.008, 0.22, M.wood('#b98a5e'), 6).rotateZ(Math.PI / 2));
  hammer.add(rbox(0.03, 0.06, 0.03, M.iron(), 0.004, 0.11, -0.03, 0));
  hammer.position.set(-0.55, 0.92, -0.05);
  g.add(hammer);
  // Pegboard behind with outlines of tools
  g.add(rbox(1.6, 0.7, 0.02, M.paint('#5a4632', 0.8), 0.005, 0, 0.95, -0.33));
  return shadowed(g);
}

export function oilLamp(): { group: THREE.Group; light: THREE.PointLight; flame: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  g.add(lathe('lamp-base', [[0, 0], [0.06, 0], [0.065, 0.02], [0.04, 0.05], [0.05, 0.09], [0.02, 0.11]], M.brass(), 14));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), mat('lamp-glass', { color: '#ffe0a8', transparent: true, opacity: 0.35, roughness: 0.1 }));
  glass.scale.set(1, 1.5, 1);
  glass.position.y = 0.17;
  g.add(glass);
  const flame = basicMat('lamp-flame', { color: '#ffb35a' });
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 8), flame);
  f.position.y = 0.16;
  g.add(f);
  const light = new THREE.PointLight('#ffa64a', 1.0, 4.5, 1.6);
  light.position.y = 0.18;
  g.add(light);
  return { group: shadowed(g, true, false), light, flame };
}

/** Grandpa's magic lantern projector. Origin at its base. */
export function magicLantern(): { group: THREE.Group; lensGlow: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  const tin = mat('lantern-tin', { color: '#3a3f48', metalness: 0.7, roughness: 0.45 });
  g.add(rbox(0.26, 0.24, 0.2, tin, 0.02, 0, 0, 0));
  g.add(cyl(0.035, 0.03, 0.12, tin, 12, 0, 0.24, 0));
  g.add(cyl(0.05, 0.04, 0.03, tin, 12, 0, 0.34, 0));
  const lens = cyl(0.05, 0.05, 0.16, M.brass(), 16, 0.18, 0.12, 0);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(0.2, 0.12, 0);
  g.add(lens);
  const lensGlow = basicMat('lantern-lens', { color: '#2a2418' });
  const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), lensGlow);
  glassDisc.rotation.y = Math.PI / 2;
  glassDisc.position.set(0.285, 0.12, 0);
  g.add(glassDisc);
  // Little door (where LUMO goes)
  g.add(rbox(0.12, 0.12, 0.01, M.brass(), 0.004, 0, 0.05, 0.105));
  return { group: shadowed(g), lensGlow };
}

/** The music box on its pedestal, with a liftable birdcage. */
export function musicBox(): { group: THREE.Group; cage: THREE.Group; lid: THREE.Group; comb: THREE.Group; glow: THREE.PointLight } {
  const g = new THREE.Group();
  const wood = mat('mbox-wood', { map: woodGrain('#5a2a1e'), roughness: 0.35 });
  const brass = M.brass();
  // Pedestal (round table)
  g.add(lathe('pedestal', [[0, 0], [0.32, 0], [0.33, 0.04], [0.12, 0.08], [0.08, 0.3], [0.1, 0.5], [0.42, 0.52], [0.42, 0.56], [0, 0.56]], M.wood('#3e2418'), 24));
  // Music box
  const boxG = new THREE.Group();
  boxG.position.y = 0.56;
  boxG.add(rbox(0.36, 0.16, 0.26, wood, 0.02, 0, 0, 0));
  boxG.add(rbox(0.37, 0.02, 0.27, brass, 0.005, 0, 0.04, 0));
  const comb = new THREE.Group();
  for (let i = 0; i < 12; i++) comb.add(rbox(0.008, 0.004, 0.08, mat('steel', { color: '#c8ccd2', metalness: 1, roughness: 0.2 }), 0.001, -0.08 + i * 0.014, 0.165, 0.02));
  const cyl1 = cyl(0.03, 0.03, 0.2, brass, 14, 0, 0.19, -0.06);
  cyl1.rotation.z = Math.PI / 2;
  cyl1.position.set(0, 0.19, -0.06);
  comb.add(cyl1);
  boxG.add(comb);
  const lid = new THREE.Group();
  lid.position.set(0, 0.16, -0.13);
  lid.add(rbox(0.36, 0.03, 0.26, wood, 0.01, 0, 0, 0.13));
  // Crown on the lid: a brass filigree firefly perch.
  const crown = torus(0.06, 0.006, brass);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 0.05, 0.13);
  lid.add(crown);
  lid.add(cyl(0.006, 0.006, 0.05, brass, 6, 0, 0.0, 0.13));
  boxG.add(lid);
  // Side wind-up stem
  boxG.add(cyl(0.012, 0.012, 0.05, brass, 8, 0.2, 0.06, 0).rotateZ(Math.PI / 2));
  g.add(boxG);
  // Birdcage over the box
  const cage = new THREE.Group();
  cage.position.y = 0.56;
  const bars = 14;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    const bar = cyl(0.005, 0.005, 0.5, brass, 5, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
    cage.add(bar);
  }
  for (const y of [0.01, 0.25, 0.5]) {
    const ring = torus(0.3, 0.008, brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    cage.add(ring);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('cage-dome', { color: '#c79a4a', metalness: 0.85, roughness: 0.35, wireframe: true }));
  dome.position.y = 0.5;
  cage.add(dome);
  cage.add(torus(0.03, 0.008, brass).translateY(0.82));
  g.add(cage);
  const glow = new THREE.PointLight('#ffb35a', 0.35, 2.2, 2);
  glow.position.set(0, 0.8, 0);
  g.add(glow);
  return { group: shadowed(g), cage, lid, comb, glow };
}

/** Clockwork portcullis gate spanning the attic. Origin: center bottom. */
export function clockworkGate(width: number, height: number): { group: THREE.Group; bars: THREE.Group } {
  const g = new THREE.Group();
  const iron = mat('gate-iron', { color: '#2e2a2a', metalness: 0.7, roughness: 0.55 });
  const wood = M.wood('#4a3020');
  for (const s of [-1, 1]) g.add(rbox(0.16, height + 0.2, 0.2, wood, 0.02, s * (width / 2), 0, 0));
  g.add(rbox(width + 0.16, 0.18, 0.22, wood, 0.02, 0, height + 0.02, 0));
  const bars = new THREE.Group();
  const n = Math.floor(width / 0.16);
  for (let i = 0; i <= n; i++) bars.add(rbox(0.035, height, 0.035, iron, 0.006, -width / 2 + (i * width) / n, 0, 0));
  for (const y of [0.3, height * 0.55, height - 0.1]) bars.add(rbox(width, 0.04, 0.05, iron, 0.006, 0, y, 0));
  for (let i = 0; i <= n; i += 2) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), iron);
    tip.rotation.x = Math.PI;
    tip.position.set(-width / 2 + (i * width) / n, -0.02, 0);
    bars.add(tip);
  }
  g.add(bars);
  return { group: shadowed(g), bars };
}

/** Mechanism box with three empty sockets. Origin: base center, front faces -x. */
export function mechanismBox(): { group: THREE.Group; gearPart: THREE.Group; springPart: THREE.Group; crankPart: THREE.Group; wheels: THREE.Group[] } {
  const g = new THREE.Group();
  const wood = M.wood('#5a3b22');
  const brass = M.brass();
  g.add(rbox(0.5, 0.85, 0.7, wood, 0.02, 0, 0, 0));
  g.add(rbox(0.02, 0.65, 0.55, mat('mech-plate', { color: '#2a2018', roughness: 0.6 }), 0.005, -0.26, 0.12, 0));
  const wheels: THREE.Group[] = [];
  for (const [y, z, r] of [[0.65, -0.16, 0.07], [0.4, 0.15, 0.05]] as const) {
    const w = new THREE.Group();
    w.position.set(-0.28, y, z);
    const t = torus(r, 0.01, brass);
    t.rotation.y = Math.PI / 2;
    w.add(t);
    for (let i = 0; i < 6; i++) {
      const spoke = rbox(0.008, r * 2, 0.008, brass, 0.002, 0, -r, 0);
      spoke.rotation.x = (i / 6) * Math.PI;
      w.add(spoke);
    }
    g.add(w);
    wheels.push(w);
  }
  const gearPart = new THREE.Group();
  const gearRing = torus(0.07, 0.022, brass);
  gearRing.rotation.y = Math.PI / 2;
  gearPart.add(gearRing);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    gearPart.add(rbox(0.02, 0.03, 0.03, brass, 0.004, 0, Math.cos(a) * 0.095 - 0.015, Math.sin(a) * 0.095));
  }
  gearPart.position.set(-0.3, 0.62, 0.12);
  const springPart = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const t = torus(0.035, 0.006, M.chrome());
    t.rotation.x = Math.PI / 2;
    t.position.y = i * 0.022;
    springPart.add(t);
  }
  springPart.position.set(-0.3, 0.3, -0.16);
  springPart.rotation.z = Math.PI / 2;
  const crankPart = new THREE.Group();
  crankPart.add(cyl(0.012, 0.012, 0.12, brass, 8).rotateZ(Math.PI / 2));
  crankPart.add(rbox(0.015, 0.14, 0.015, brass, 0.004, -0.06, 0, 0));
  crankPart.add(sphere(0.025, M.paint('#7a2f22', 0.5), 10, -0.06, 0.14, 0.0));
  crankPart.position.set(-0.3, 0.45, 0.18);
  return { group: shadowed(g), gearPart: shadowed(gearPart), springPart: shadowed(springPart), crankPart: shadowed(crankPart), wheels };
}

export function coatStand(): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#3e2a1c');
  g.add(cyl(0.025, 0.03, 1.85, wood, 10, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    const leg = rbox(0.03, 0.03, 0.32, wood, 0.008, 0, 0.02, 0);
    leg.rotation.y = (i / 3) * Math.PI * 2;
    leg.translateZ(0.13);
    g.add(leg);
  }
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 1.3, 14, 1, true), mat('grandpa-coat', { color: '#2a2622', roughness: 0.95, side: THREE.DoubleSide }));
  coat.position.y = 1.12;
  g.add(coat);
  const shoulders = sphere(0.17, mat('grandpa-coat', { color: '#2a2622' }), 12);
  shoulders.scale.set(1.3, 0.45, 0.8);
  shoulders.position.y = 1.78;
  g.add(shoulders);
  const hat = new THREE.Group();
  hat.add(cyl(0.16, 0.16, 0.012, mat('hat', { color: '#3a3026', roughness: 0.9 }), 18));
  hat.add(cyl(0.09, 0.1, 0.1, mat('hat', { color: '#3a3026', roughness: 0.9 }), 14, 0, 0.01, 0));
  hat.position.y = 1.86;
  g.add(hat);
  const scarf = torus(0.1, 0.03, M.fabric('#8a3a2e'));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.72;
  g.add(scarf);
  return shadowed(g);
}

export function pinnedBlueprint(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const x = c.getContext('2d')!;
  x.fillStyle = '#1e3a5c';
  x.fillRect(0, 0, 256, 192);
  x.strokeStyle = 'rgba(220,235,255,0.85)';
  x.lineWidth = 1.5;
  for (let i = 0; i < 256; i += 16) {
    x.globalAlpha = 0.15;
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 192);
    x.stroke();
  }
  x.globalAlpha = 1;
  x.beginPath();
  x.ellipse(128, 104, 22, 34, 0, 0, Math.PI * 2);
  x.moveTo(150, 80);
  x.arc(128, 70, 14, 0, Math.PI * 2);
  x.moveTo(110, 82);
  x.quadraticCurveTo(50, 30, 60, 90);
  x.moveTo(146, 82);
  x.quadraticCurveTo(206, 30, 196, 90);
  x.stroke();
  x.font = '14px Georgia';
  x.fillStyle = 'rgba(220,235,255,0.9)';
  x.fillText('L.U.M.O.', 98, 170);
  x.fillText('little unafraid', 14, 24);
  x.fillText('mechanical ornament', 14, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return plane(0.5, 0.38, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
}

export function framedPhoto(kind: 'grandpa' | 'house' | 'child'): THREE.Mesh {
  return plane(0.2, 0.25, mat(`attic-photo-${kind}`, { map: photo(kind), roughness: 0.6 }));
}

export function roundWindowFrame(r: number): THREE.Group {
  const g = new THREE.Group();
  const wood = M.paint('#3a2a20', 0.6);
  const ring = torus(r, 0.05, wood);
  g.add(ring);
  for (let i = 0; i < 4; i++) {
    const bar = box(0.04, r * 2, 0.04, wood, 0, -r, 0);
    bar.rotation.z = (i * Math.PI) / 4;
    g.add(bar);
  }
  return g;
}
