import * as THREE from 'three';

// Weapon definitions and their small procedural models (barrel along +Z, grip
// at the origin). Damage is per hit (per pellet for the shotgun).

export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', slot: 0, melee: true, icon: '✊' },
  bat: { id: 'bat', name: 'Baseball Bat', slot: 1, melee: true, damage: 46, range: 2.1, icon: '🏏', price: 150 },
  pistol: {
    id: 'pistol', name: 'Pistol', slot: 2, damage: 34, rate: 0.28, mag: 12, spread: 0.010, range: 110, reload: 1.4,
    price: 450, ammoPrice: 60, ammoPack: 48, auto: false, pellets: 1, icon: '🔫',
  },
  smg: {
    id: 'smg', name: 'Micro SMG', slot: 3, damage: 19, rate: 0.085, mag: 30, spread: 0.032, range: 80, reload: 1.8,
    price: 1800, ammoPrice: 120, ammoPack: 120, auto: true, pellets: 1, icon: '🔫',
  },
  shotgun: {
    id: 'shotgun', name: 'Pump Shotgun', slot: 4, damage: 15, rate: 0.95, mag: 6, spread: 0.07, range: 36, reload: 2.2,
    price: 1400, ammoPrice: 90, ammoPack: 24, auto: false, pellets: 8, icon: '🔫',
  },
};

export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'smg', 'shotgun'];

const mats = {};
function mat(key) {
  if (mats[key]) return mats[key];
  const c = { gun: [0x1d1f22, 0.45, 0.6], grip: [0x2a2622, 0.8, 0.1], steel: [0x8c9096, 0.3, 0.9], wood: [0x8a5a32, 0.7, 0], tape: [0x111111, 0.9, 0] }[key];
  mats[key] = new THREE.MeshStandardMaterial({ color: c[0], roughness: c[1], metalness: c[2] });
  return mats[key];
}

function box(g, m, sx, sy, sz, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(m));
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

function cyl(g, m, r0, r1, len, x, y, z, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(Math.PI / 2), mat(m));
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Builds the held model for a weapon; `muzzle` (local offset) marks the barrel tip. */
export function makeWeaponMesh(id) {
  const g = new THREE.Group();
  g.name = `Weapon:${id}`;
  let muzzle = new THREE.Vector3(0, 0.05, 0.2);
  switch (id) {
    case 'pistol':
      box(g, 'grip', 0.03, 0.11, 0.045, 0, -0.03, 0);
      box(g, 'gun', 0.032, 0.045, 0.19, 0, 0.04, 0.06);
      box(g, 'steel', 0.034, 0.012, 0.17, 0, 0.068, 0.06);
      muzzle = new THREE.Vector3(0, 0.045, 0.16);
      break;
    case 'smg':
      box(g, 'grip', 0.03, 0.1, 0.04, 0, -0.03, 0);
      box(g, 'gun', 0.045, 0.07, 0.26, 0, 0.04, 0.07);
      box(g, 'grip', 0.025, 0.14, 0.035, 0, -0.04, 0.12); // magazine
      cyl(g, 'steel', 0.012, 0.012, 0.09, 0, 0.05, 0.24);
      muzzle = new THREE.Vector3(0, 0.05, 0.29);
      break;
    case 'shotgun':
      box(g, 'grip', 0.035, 0.1, 0.045, 0, -0.03, 0);
      cyl(g, 'gun', 0.018, 0.018, 0.62, 0, 0.05, 0.27);
      cyl(g, 'wood', 0.024, 0.024, 0.16, 0, 0.02, 0.22); // pump
      box(g, 'wood', 0.04, 0.07, 0.26, 0, 0.02, -0.14); // stock
      muzzle = new THREE.Vector3(0, 0.05, 0.58);
      break;
    case 'bat':
      cyl(g, 'tape', 0.018, 0.018, 0.22, 0, 0, 0.0);
      cyl(g, 'wood', 0.02, 0.038, 0.62, 0, 0, 0.42);
      muzzle = new THREE.Vector3(0, 0, 0.7);
      break;
    default:
      return null;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.muzzle = muzzle;
  return g;
}
