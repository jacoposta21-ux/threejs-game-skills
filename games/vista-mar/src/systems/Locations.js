import * as THREE from 'three';
import { terrainHeight } from '../world/Layout.js';
import { GARAGE } from '../missions/missions.js';

// Interactive places: safehouse (save + sleep), gas station repair, Spray & Go
// (repair + respray clears the wanted level when unseen), food carts (health).

export const SAFEHOUSE = { x: 40, z: -16.4 };
export const POLICE_STATION = { x: 109, z: -60 };
export const HOSPITAL = { x: 93, z: 150 };

const FOOD = [
  { x: 432, z: -22, name: 'Taco Loco cart' },
  { x: 62, z: 122, name: 'Bayfront hot dogs' },
  { x: 291, z: -30, name: 'Neon Mile empanadas' },
  { x: -120, z: 70, name: 'Gas station snacks' },
];

export class Locations {
  constructor(game) {
    this.game = game;
    this.places = [
      { kind: 'safehouse', x: SAFEHOUSE.x, z: SAFEHOUSE.z, r: 1.8, foot: true, label: 'Save game and sleep until 08:00', icon: 'H', color: '#7dff9b' },
      { kind: 'repair', x: -150, z: 53, r: 9, car: true, label: 'Gas station: fuel and repairs', icon: '⛽', color: '#ffb347', cost: 0, name: 'Gas station (Palm Heights)' },
      { kind: 'repair', x: 13, z: -452, r: 6, car: true, label: 'Airport fuel stop: fuel and repairs', icon: '⛽', color: '#ffb347', cost: 0, pump: true, name: 'Fuel stop (airport road)' },
      { kind: 'repair', x: 404, z: 262, r: 6, car: true, label: 'Ocean Drive fuel stop: fuel and repairs', icon: '⛽', color: '#ffb347', cost: 0, pump: true, name: 'Fuel stop (Ocean Drive)' },
      { kind: 'spray', x: GARAGE.x, z: GARAGE.z, r: 6, car: true, label: 'Respray + repair, lose the cops ($400)', icon: 'S', color: '#3fe0e8', cost: 400 },
      ...FOOD.map((f) => ({ kind: 'food', ...f, r: 1.8, foot: true, label: `Eat at ${f.name} ($12, +50 health)`, icon: '♥', color: '#ff4fa3', cost: 12 })),
    ];
    this.buildProps();
  }

  buildProps() {
    const g = this.game;
    const group = new THREE.Group();
    g.scene.add(group);
    const cartMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xe94b5f, roughness: 0.7 });
    const wheel = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    for (const p of this.places) {
      const y = terrainHeight(p.x, p.z);
      if (p.pump) {
        // a pair of fuel pumps under a small canopy
        const pumpMat = new THREE.MeshStandardMaterial({ color: 0xd8322d, roughness: 0.5 });
        for (const dz of [-1.6, 1.6]) {
          const pm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5), pumpMat);
          pm.position.set(p.x + (p.x > 300 ? 7 : 5.2), terrainHeight(p.x + (p.x > 300 ? 7 : 5.2), p.z) + 0.9, p.z + dz);
          pm.castShadow = true;
          group.add(pm);
          (p.props = p.props || []).push(pm);
          g.collision.addBox(pm.position.x - 0.35, pm.position.z - 0.25, pm.position.x + 0.35, pm.position.z + 0.25, y + 1.8, 'pump');
        }
      }
      if (p.kind === 'food') {
        const cart = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.9), cartMat); body.position.y = 0.75;
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.18, 0.92), stripe); band.position.y = 1.05;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4), cartMat); pole.position.y = 1.9;
        const umb = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 10, 1, true), stripe); umb.position.y = 2.7;
        umb.material.side = THREE.DoubleSide;
        const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12).rotateX(Math.PI / 2), wheel); w1.position.set(-0.6, 0.28, 0.5);
        const w2 = w1.clone(); w2.position.x = 0.6;
        cart.add(body, band, pole, umb, w1, w2);
        for (const m of cart.children) m.castShadow = true;
        cart.position.set(p.x + 1.4, y, p.z);
        group.add(cart);
        (p.props = p.props || []).push(cart);
        g.collision.addBox(p.x + 0.5, p.z - 0.5, p.x + 2.3, p.z + 0.5, y + 1.2, 'cart');
      }
      // floor marker ring for every location
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.85, p.r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
      ring.position.set(p.x, y + 0.05, p.z);
      group.add(ring);
      p.ring = ring;
    }
  }

  /** Location the player can use right now (foot or car), or null. */
  current() {
    const pl = this.game.player;
    for (const p of this.places) {
      if (p.car && !pl.vehicle) continue;
      if (p.foot && pl.vehicle) continue;
      if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r) return p;
    }
    return null;
  }

  use(p) {
    const g = this.game, pl = g.player;
    const freeSpray = p.kind === 'spray' && g.economy && g.economy.owned.has('spray');
    if (p.cost && !freeSpray && g.money < p.cost) { g.hud.toast('NOT ENOUGH CASH', `You need $${p.cost}.`); return; }
    switch (p.kind) {
      case 'safehouse':
        if (g.police.level > 0) { g.hud.toast('NOT NOW', 'You cannot save while the police are after you.'); return; }
        g.save();
        g.sleepUntil(8);
        break;
      case 'repair': {
        const v = pl.vehicle;
        if (v.isAircraft) { g.hud.toast('NOT HERE', 'Aircraft refuel at the airport.'); return; }
        g.shop.show({
          kicker: 'Fuel & service', title: p.name || 'Gas station', sub: `${v.spec.label} · fuel ${Math.round(v.fuel ?? 100)}% · condition ${Math.round(v.health)}%`,
          items: () => {
            const need = Math.max(0, 100 - (v.fuel ?? 100));
            return [
              { name: 'Fill the tank', desc: need < 1 ? 'Already full' : `${Math.round(need)}% to go`, price: Math.max(5, Math.ceil(need * 1.2)), disabled: need < 1, repeat: true, buy: () => { v.fuel = 100; } },
              { name: 'Repair', desc: v.health >= 99.5 ? 'No damage' : 'Fix the engine and the body', price: 150, disabled: v.health >= 99.5, repeat: true, buy: () => { v.repair(); } },
            ];
          },
        });
        break;
      }
      case 'spray': {
        if (g.police.level > 0 && g.police.seen) { g.hud.toast('THEY CAN SEE YOU', 'Break line of sight with the police first.'); return; }
        if (!freeSpray) g.addMoney(-p.cost);
        pl.vehicle.repair();
        pl.vehicle.respray();
        if (g.police.level > 0) g.police.clear('FRESH PAINT');
        g.audio.pickup();
        g.hud.toast('SPRAY & GO', `-$${p.cost} · new paint, no questions`, 'reward');
        break;
      }
      case 'food':
        if (pl.health >= 100) { g.hud.toast('NOT HUNGRY', 'Health is already full.'); return; }
        g.addMoney(-p.cost);
        pl.health = Math.min(100, pl.health + 50);
        g.audio.pickup();
        g.hud.toast('DELICIOUS', `+50 health · -$${p.cost}`, 'reward');
        break;
      default:
    }
  }

  update() {
    const t = this.game.world.elapsed, c = this.game.camera.position;
    for (const p of this.places) {
      // floor rings and small props are not worth a draw call from blocks away
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      p.ring.visible = d < 150;
      if (p.props) for (const o of p.props) o.visible = d < 260;
      if (p.ring.visible) p.ring.material.opacity = 0.35 + Math.sin(t * 3 + p.x) * 0.2;
    }
  }

  markers() {
    return this.places.filter((p) => p.kind !== 'food' || true).map((p) => ({ x: p.x, z: p.z, color: p.color, shape: 'dot', size: 6, label: p.icon }));
  }
}
