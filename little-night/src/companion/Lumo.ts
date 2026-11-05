import * as THREE from 'three';
import { mat, physMat, sphere, lathe, torus, tube, cyl } from '../art/Materials';
import { softDot } from '../art/Textures';
import { batchSiblings } from '../levels/StaticBatcher';

/** LUMO's authored model: brass clockwork firefly with a glass lantern abdomen. */
export class LumoModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly core: THREE.Mesh;
  readonly coreMat: THREE.MeshStandardMaterial;
  readonly glow: THREE.Sprite;
  readonly halo: THREE.Sprite;
  readonly wings: THREE.Group[] = [];
  readonly key: THREE.Group;
  readonly antennaTips: THREE.Mesh[] = [];
  private tipMat: THREE.MeshStandardMaterial;
  private eyeMat: THREE.MeshPhysicalMaterial;

  constructor() {
    const brass = mat('lumo-brass', { color: '#d4a255', metalness: 0.9, roughness: 0.28 });
    const darkBrass = mat('lumo-darkbrass', { color: '#7a5524', metalness: 0.85, roughness: 0.4 });
    const enamel = mat('lumo-enamel', { color: '#2f5f6b', metalness: 0.3, roughness: 0.35 });
    this.eyeMat = physMat('lumo-eye', { color: '#0b1820', roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
    const glass = physMat('lumo-glass', {
      color: '#ffe7b0',
      roughness: 0.08,
      transmission: 0.0,
      transparent: true,
      opacity: 0.38,
      metalness: 0,
      clearcoat: 1,
      depthWrite: false,
    });
    this.coreMat = new THREE.MeshStandardMaterial({ color: '#ffb84a', emissive: '#ffae3a', emissiveIntensity: 2.5, roughness: 0.4 });
    this.tipMat = new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffbf5a', emissiveIntensity: 1.5 });

    this.root.add(this.body);
    // Thorax: brass sphere with enamel saddle and rivets.
    const thorax = sphere(0.016, brass, 16);
    thorax.scale.set(1, 0.9, 1.15);
    this.body.add(thorax);
    const saddle = sphere(0.0165, enamel, 16);
    saddle.scale.set(0.9, 0.55, 0.9);
    saddle.position.y = 0.006;
    this.body.add(saddle);
    // Head + big glossy eyes.
    const head = sphere(0.011, darkBrass, 14);
    head.position.set(0, 0.002, -0.021);
    this.body.add(head);
    for (const s of [-1, 1]) {
      const eye = sphere(0.0072, this.eyeMat, 12);
      eye.position.set(s * 0.0085, 0.004, -0.026);
      this.body.add(eye);
      const glint = sphere(0.0018, mat('lumo-glint', { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.5 }), 6);
      glint.position.set(s * 0.0095, 0.008, -0.032);
      this.body.add(glint);
      // Antenna: curled tube with lamp tip.
      const pts = [
        new THREE.Vector3(s * 0.004, 0.009, -0.026),
        new THREE.Vector3(s * 0.01, 0.022, -0.036),
        new THREE.Vector3(s * 0.016, 0.034, -0.032),
        new THREE.Vector3(s * 0.019, 0.038, -0.024),
      ];
      const ant = tube(`lumo-ant${s}`, pts, 0.0011, darkBrass, 12);
      this.body.add(ant);
      const tip = sphere(0.0032, this.tipMat, 8);
      tip.position.copy(pts[3]);
      this.body.add(tip);
      this.antennaTips.push(tip);
    }
    // Abdomen: glass lantern with glowing core and brass bands.
    const abdomen = new THREE.Group();
    abdomen.position.set(0, -0.004, 0.022);
    abdomen.rotation.x = Math.PI / 2 + 0.25;
    const shell = lathe(
      'lumo-shell',
      [
        [0.001, -0.002],
        [0.012, 0.004],
        [0.017, 0.016],
        [0.016, 0.03],
        [0.009, 0.042],
        [0.001, 0.046],
      ],
      glass,
      18,
    );
    shell.castShadow = false;
    abdomen.add(shell);
    this.core = sphere(0.0105, this.coreMat, 14);
    this.core.scale.set(1, 1.6, 1);
    this.core.position.y = 0.021;
    this.core.castShadow = false;
    abdomen.add(this.core);
    for (const [y, r] of [[0.006, 0.0135], [0.02, 0.0172], [0.034, 0.0135]] as const) {
      const band = torus(r, 0.0012, brass);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      abdomen.add(band);
    }
    const cap = cyl(0.004, 0.002, 0.006, darkBrass, 8);
    cap.position.y = 0.044;
    abdomen.add(cap);
    this.body.add(abdomen);

    // Wind-up key on the back.
    this.key = new THREE.Group();
    this.key.position.set(0, 0.017, 0.004);
    const stem = cyl(0.0012, 0.0012, 0.01, brass, 6);
    this.key.add(stem);
    for (const s of [-1, 1]) {
      const loop = torus(0.0045, 0.0011, brass);
      loop.position.set(s * 0.005, 0.012, 0);
      this.key.add(loop);
    }
    this.body.add(this.key);

    // Legs (tucked).
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const leg = tube(
          `lumo-leg${i}${s}`,
          [
            new THREE.Vector3(s * 0.006, -0.01, -0.008 + i * 0.008),
            new THREE.Vector3(s * 0.014, -0.017, -0.01 + i * 0.009),
            new THREE.Vector3(s * 0.012, -0.024, -0.012 + i * 0.011),
          ],
          0.0008,
          darkBrass,
          6,
        );
        this.body.add(leg);
      }
    }

    // Wings: veined membranes in brass frames, two pairs.
    const membrane = new THREE.MeshStandardMaterial({
      color: '#bfe6ff',
      emissive: '#3a6f8a',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.2,
    });
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.012, 0.012, 0.045, 0.018, 0.058, 0.004);
    shape.bezierCurveTo(0.05, -0.01, 0.02, -0.012, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(shape, 10);
    const veinPts = shape.getPoints(24).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const veinGeo = new THREE.BufferGeometry().setFromPoints(veinPts);
    const veinMat = new THREE.LineBasicMaterial({ color: '#d9a85a', transparent: true, opacity: 0.85 });
    for (const [pair, z, scale] of [[0, -0.004, 1], [1, 0.006, 0.8]] as const) {
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.008, 0.011, z);
        const w = new THREE.Mesh(wingGeo, membrane);
        w.rotation.x = -Math.PI / 2;
        w.scale.set(s * scale, scale, 1);
        w.castShadow = false;
        const v = new THREE.Line(veinGeo, veinMat);
        v.rotation.copy(w.rotation);
        v.scale.copy(w.scale);
        pivot.add(w, v);
        pivot.userData = { side: s, pair };
        pivot.rotation.y = s * (pair === 0 ? -0.35 : 0.25);
        this.body.add(pivot);
        this.wings.push(pivot);
      }
    }

    const dot = softDot();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ffb44f', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    this.glow.scale.setScalar(0.12);
    this.glow.position.set(0, -0.004, 0.03);
    this.body.add(this.glow);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ff9a3a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 }));
    this.halo.scale.setScalar(0.5);
    this.halo.position.copy(this.glow.position);
    this.body.add(this.halo);

    this.root.scale.setScalar(1.1);
    batchSiblings(this.body);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = false;
    });
  }

  /** brightness 0..1, flap speed (Hz), wingsOpen 0..1 */
  animate(time: number, brightness: number, flapHz: number, wingsOpen: number, dormant = false): void {
    this.coreMat.emissiveIntensity = 0.15 + brightness * 3.2;
    this.coreMat.color.setHSL(0.09, 0.9, 0.35 + brightness * 0.25);
    this.tipMat.emissiveIntensity = 0.2 + brightness * 1.6 + Math.sin(time * 6) * 0.2 * brightness;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.15 + brightness * 0.85;
    (this.halo.material as THREE.SpriteMaterial).opacity = brightness * 0.3;
    this.glow.scale.setScalar(0.05 + brightness * 0.09);
    this.halo.scale.setScalar(0.15 + brightness * 0.45);
    const flap = Math.sin(time * Math.PI * 2 * flapHz);
    for (const w of this.wings) {
      const s = w.userData.side as number;
      const pair = w.userData.pair as number;
      const open = dormant ? 0 : wingsOpen;
      w.rotation.z = s * (0.15 + open * (0.5 + flap * 0.55 * (pair === 0 ? 1 : 0.8)));
      w.rotation.y = s * (pair === 0 ? -0.35 : 0.25) * (0.3 + open * 0.7) + (dormant ? s * 1.1 : 0);
    }
    this.key.rotation.y = time * (dormant ? 0 : 1.5);
  }
}
