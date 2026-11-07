import * as THREE from 'three';
import { mat } from '../art/Materials';
import { fabricStripes } from '../art/Textures';

export type HandPose = 'hidden' | 'reach' | 'push' | 'climb' | 'press' | 'recoil' | 'crawl' | 'hold' | 'hide' | 'cover' | 'cradle';

interface Pose {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  curl: number;
}

interface Finger {
  prox: THREE.Group;
  dist: THREE.Group;
}

const skinMat = () =>
  new THREE.MeshPhysicalMaterial({
    color: '#e3a385',
    roughness: 0.62,
    sheen: 0.7,
    sheenColor: new THREE.Color('#ff9c80'),
    sheenRoughness: 0.45,
    emissive: new THREE.Color('#3a1a10'),
    emissiveIntensity: 0.18,
  });

/** Chubby toddler hand: soft palm, two-segment sausage fingers, thumb, creased wrist, pajama sleeve. */
function makeHand(side: 1 | -1): { root: THREE.Group; fingers: Finger[]; thumb: Finger } {
  const skin = skinMat();
  const crease = new THREE.MeshPhysicalMaterial({ color: '#dba184', roughness: 0.7 });
  const cuffMat = mat('pajama', { map: fabricStripes('#5d6f9e', '#dfe4f2', [1, 2], true), roughness: 0.9 });
  const rib = mat('pajama-rib', { color: '#c9d1e8', roughness: 0.95 });
  const root = new THREE.Group();

  // Palm: a soft, slightly cupped pillow (wider than long, like a baby's).
  const palmGeo = new THREE.SphereGeometry(1, 24, 18);
  const pp = palmGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const y = pp.getY(i);
    const z = pp.getZ(i);
    // Cup the palm side a little and fatten the back of the hand.
    const cup = y < 0 ? 1 - 0.25 * (1 - x * x) : 1.08;
    pp.setXYZ(i, x * 0.034, y * 0.017 * cup, z * 0.033 + (z < 0 ? z * 0.006 : 0));
  }
  palmGeo.computeVertexNormals();
  const palm = new THREE.Mesh(palmGeo, skin);
  palm.position.z = -0.004;
  root.add(palm);
  // Pudgy heel of the palm.
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), skin);
  heel.scale.set(1.4, 0.75, 0.9);
  heel.position.set(0, -0.004, 0.022);
  root.add(heel);

  const segGeo = (r: number, len: number) => {
    const g = new THREE.CapsuleGeometry(r, len, 6, 12);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, -len / 2 - r * 0.6);
    return g;
  };
  const fingers: Finger[] = [];
  const spec = [
    { x: 0.022, r: 0.0082, l1: 0.012, l2: 0.009, splay: 0.12 },
    { x: 0.0075, r: 0.0088, l1: 0.015, l2: 0.011, splay: 0.03 },
    { x: -0.0075, r: 0.0085, l1: 0.014, l2: 0.010, splay: -0.04 },
    { x: -0.021, r: 0.0072, l1: 0.010, l2: 0.008, splay: -0.14 },
  ];
  for (const f of spec) {
    const prox = new THREE.Group();
    prox.position.set(f.x * side, 0.002, -0.034);
    prox.rotation.y = f.splay * side;
    const p1 = new THREE.Mesh(segGeo(f.r, f.l1), skin);
    prox.add(p1);
    const knuckle = new THREE.Mesh(new THREE.TorusGeometry(f.r * 0.95, 0.0012, 4, 12), crease);
    knuckle.position.z = -f.l1 - f.r * 0.4;
    prox.add(knuckle);
    const dist = new THREE.Group();
    dist.position.z = -f.l1 - f.r * 0.9;
    const p2 = new THREE.Mesh(segGeo(f.r * 0.94, f.l2), skin);
    dist.add(p2);
    const nail = new THREE.Mesh(new THREE.SphereGeometry(f.r * 0.62, 10, 6), new THREE.MeshStandardMaterial({ color: '#f6d4c4', roughness: 0.3 }));
    nail.scale.set(1, 0.35, 1.1);
    nail.position.set(0, f.r * 0.62, -f.l2 - f.r * 0.6);
    dist.add(nail);
    prox.add(dist);
    root.add(prox);
    fingers.push({ prox, dist });
  }
  // Thumb from the inner side, angled forward and out.
  const tProx = new THREE.Group();
  tProx.position.set(0.03 * side, -0.004, -0.004);
  tProx.rotation.set(0.15, -0.95 * side, 0.35 * side);
  tProx.add(new THREE.Mesh(segGeo(0.0098, 0.012), skin));
  const tDist = new THREE.Group();
  tDist.position.z = -0.021;
  tDist.add(new THREE.Mesh(segGeo(0.0092, 0.009), skin));
  tProx.add(tDist);
  root.add(tProx);

  // Wrist with a baby-fat crease, then the pajama sleeve with a ribbed cuff.
  const wrist = new THREE.Mesh(new THREE.LatheGeometry([0.022, 0.0255, 0.0265, 0.025, 0.027].map((r, i) => new THREE.Vector2(r, i * 0.014)), 16), skin);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.z = 0.026;
  root.add(wrist);
  const wc = new THREE.Mesh(new THREE.TorusGeometry(0.0255, 0.0018, 6, 18), crease);
  wc.position.z = 0.04;
  root.add(wc);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0295, 0.0042, 8, 20), rib);
    r.position.z = 0.056 + i * 0.007;
    root.add(r);
  }
  const sleeve = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.031, 0), new THREE.Vector2(0.034, 0.035), new THREE.Vector2(0.036, 0.075)], 18, 0, Math.PI * 2), cuffMat);
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.2, 14), skin);
  forearm.rotation.x = Math.PI / 2;
  forearm.position.z = 0.15;
  root.add(forearm);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 0.074;
  (sleeve.material as THREE.Material).side = THREE.DoubleSide;
  root.add(sleeve);

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 5;
    }
  });
  return { root, fingers, thumb: { prox: tProx, dist: tDist } };
}

export class Hands {
  readonly group = new THREE.Group();
  private left = makeHand(-1);
  private right = makeHand(1);
  private pose: HandPose = 'hidden';
  private poseTimer = 0;
  private crawlPhase = 0;
  private curlL = 0;
  private curlR = 0;
  readonly holdSocket = new THREE.Group();
  private time = 0;

  constructor(camera: THREE.Camera) {
    this.group.add(this.left.root, this.right.root);
    this.right.root.add(this.holdSocket);
    this.holdSocket.position.set(0, 0.035, -0.05);
    camera.add(this.group);
    // Very dim warm fill so the hands read in the dark without lighting the room.
    const fill = new THREE.PointLight('#ffcfa8', 0.16, 0.55, 2);
    fill.position.set(0, 0.05, -0.1);
    this.group.add(fill);
    this.left.root.position.set(-0.2, -0.4, -0.3);
    this.right.root.position.set(0.2, -0.4, -0.3);
  }

  /** Temporary pose (e.g. reach) that falls back to the base after duration. */
  set(pose: HandPose, duration = 0): void {
    this.pose = pose;
    this.poseTimer = duration;
  }

  get current(): HandPose {
    return this.pose;
  }

  update(dt: number, base: HandPose, crawlSpeed: number): void {
    this.time += dt;
    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0) this.pose = base;
    } else {
      this.pose = base;
    }
    this.crawlPhase += crawlSpeed * dt * 5.5;
    const [l, r] = this.targets(this.pose);
    const k = 1 - Math.exp(-dt * 12);
    this.left.root.position.lerp(l.pos, k);
    this.right.root.position.lerp(r.pos, k);
    this.left.root.quaternion.slerp(new THREE.Quaternion().setFromEuler(l.rot), k);
    this.right.root.quaternion.slerp(new THREE.Quaternion().setFromEuler(r.rot), k);
    this.curlL += (l.curl - this.curlL) * k;
    this.curlR += (r.curl - this.curlR) * k;
    const curl = (h: ReturnType<typeof makeHand>, c: number) => {
      h.fingers.forEach((f, i) => {
        const lag = 1 + i * 0.08;
        f.prox.rotation.x = c * 1.15 * lag + 0.12;
        f.dist.rotation.x = c * 1.35 * lag + 0.1;
      });
      h.thumb.dist.rotation.x = c * 0.9;
    };
    curl(this.left, this.curlL);
    curl(this.right, this.curlR);
    const visible = this.left.root.position.y > -0.4 || this.right.root.position.y > -0.4;
    this.group.visible = visible;
  }

  private targets(pose: HandPose): [Pose, Pose] {
    const p = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, curl = 0.2): Pose => ({
      pos: new THREE.Vector3(x, y, z),
      rot: new THREE.Euler(rx, ry, rz),
      curl,
    });
    const sway = Math.sin(this.time * 1.3) * 0.004;
    switch (pose) {
      case 'reach':
        return [p(-0.2, -0.46, -0.3), p(0.07, -0.1 + sway, -0.32, 0.25, 0.15, -0.1, 0.1)];
      case 'push':
        // Palms flat against the object, fingers up.
        return [p(-0.12, -0.15, -0.32, 1.4, 0.15, 0.1, 0.1), p(0.12, -0.15, -0.32, 1.4, -0.15, -0.1, 0.1)];
      case 'press':
        // Palms down on the top surface, shoving the body up.
        return [p(-0.12, -0.2, -0.3, 0.35, 0.25, 0.05, 0.05), p(0.12, -0.2, -0.3, 0.35, -0.25, -0.05, 0.05)];
      case 'climb':
        // Fingers hooked over the edge.
        return [p(-0.13, -0.13, -0.34, 0.25, 0.15, 0.08, 0.85), p(0.13, -0.13, -0.34, 0.25, -0.15, -0.08, 0.85)];
      case 'crawl': {
        const a = Math.sin(this.crawlPhase);
        const b = Math.sin(this.crawlPhase + Math.PI);
        return [
          p(-0.15, -0.205 + Math.max(0, a) * 0.03, -0.34 - a * 0.05, 0.45, 0.25, 0.05, 0.12),
          p(0.15, -0.205 + Math.max(0, b) * 0.03, -0.34 - b * 0.05, 0.45, -0.25, -0.05, 0.12),
        ];
      }
      case 'hold':
        return [p(-0.2, -0.46, -0.3), p(0.14, -0.18 + sway, -0.3, 0.35, 0.3, -0.2, 0.75)];
      case 'hide':
        return [p(-0.14, -0.13, -0.27, 1.25, 0.3, 0.2, 0.3), p(0.14, -0.13, -0.27, 1.25, -0.3, -0.2, 0.3)];
      case 'recoil': {
        // Fingers spread, trembling, raised low in the frame (the face stays visible).
        const tr = Math.sin(this.time * 60) * 0.006;
        return [p(-0.16, -0.17 + tr, -0.3, 1.15, 0.45, 0.35, -0.15), p(0.16, -0.17 - tr, -0.3, 1.15, -0.45, -0.35, -0.15)];
      }
      case 'cover':
        // Hands thrown up in front of the face, palms toward the eyes.
        return [p(-0.07, -0.04, -0.2, -1.45, Math.PI - 0.35, 0.2, 0.25), p(0.07, -0.04, -0.2, -1.45, Math.PI + 0.35, -0.2, 0.25)];
      case 'cradle':
        return [p(-0.07, -0.18, -0.28, 0.5, 0.6, 0.3, 0.5), p(0.07, -0.18, -0.28, 0.5, -0.6, -0.3, 0.5)];
      default:
        return [p(-0.2, -0.5, -0.3), p(0.2, -0.5, -0.3)];
    }
  }
}
