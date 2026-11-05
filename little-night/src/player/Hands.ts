import * as THREE from 'three';
import { mat } from '../art/Materials';
import { fabricStripes } from '../art/Textures';

export type HandPose = 'hidden' | 'reach' | 'push' | 'climb' | 'crawl' | 'hold' | 'hide' | 'cover' | 'cradle';

interface Pose {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  curl: number;
}

function makeHand(side: 1 | -1): { root: THREE.Group; fingers: THREE.Group[] } {
  const skin = mat('skin', { color: '#f2c3a2', roughness: 0.62 });
  const cuffMat = mat('pajama', { map: fabricStripes('#5d6f9e', '#dfe4f2', [1, 2], true), roughness: 0.9 });
  const root = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), skin);
  palm.scale.set(1.15, 0.6, 1.25);
  root.add(palm);
  const fingers: THREE.Group[] = [];
  const fingerGeo = new THREE.CapsuleGeometry(0.0085, 0.022, 4, 8);
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set((i - 1.5) * 0.0165 * side, 0.002, -0.032);
    const f = new THREE.Mesh(fingerGeo, skin);
    f.rotation.x = Math.PI / 2;
    f.position.z = -0.016;
    f.scale.setScalar(i === 3 ? 0.85 : 1);
    pivot.add(f);
    root.add(pivot);
    fingers.push(pivot);
  }
  const thumbPivot = new THREE.Group();
  thumbPivot.position.set(0.03 * side, -0.004, -0.008);
  thumbPivot.rotation.y = -0.9 * side;
  const thumb = new THREE.Mesh(fingerGeo, skin);
  thumb.rotation.x = Math.PI / 2;
  thumb.position.z = -0.016;
  thumbPivot.add(thumb);
  root.add(thumbPivot);
  fingers.push(thumbPivot);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.05, 12), skin);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.z = 0.04;
  root.add(wrist);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.16, 14, 1, true), cuffMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = 0.135;
  root.add(cuff);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.006, 6, 16), cuffMat);
  rim.position.z = 0.058;
  root.add(rim);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 5;
    }
  });
  return { root, fingers };
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
    this.left.fingers.forEach((f, i) => (f.rotation.x = -this.curlL * (i === 4 ? 0.6 : 1.3)));
    this.right.fingers.forEach((f, i) => (f.rotation.x = -this.curlR * (i === 4 ? 0.6 : 1.3)));
    const visible = this.left.root.position.y > -0.36 || this.right.root.position.y > -0.36;
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
        return [p(-0.2, -0.42, -0.25), p(0.07, -0.08 + sway, -0.3, 0.2, 0.1, -0.1, 0.05)];
      case 'push':
        return [p(-0.12, -0.13, -0.27, 1.25, 0, 0.1, 0.1), p(0.12, -0.13, -0.27, 1.25, 0, -0.1, 0.1)];
      case 'climb':
        return [p(-0.13, -0.05, -0.3, -0.5, 0, 0.1, 0.9), p(0.13, -0.05, -0.3, -0.5, 0, -0.1, 0.9)];
      case 'crawl': {
        const a = Math.sin(this.crawlPhase);
        const b = Math.sin(this.crawlPhase + Math.PI);
        return [
          p(-0.16, -0.25 + Math.max(0, a) * 0.035, -0.26 - a * 0.05, -1.25, 0.15, 0.1, 0.15),
          p(0.16, -0.25 + Math.max(0, b) * 0.035, -0.26 - b * 0.05, -1.25, -0.15, -0.1, 0.15),
        ];
      }
      case 'hold':
        return [p(-0.2, -0.42, -0.3), p(0.14, -0.17 + sway, -0.27, 0.35, 0.3, -0.2, 0.75)];
      case 'hide':
        return [p(-0.14, -0.12, -0.24, 1.2, 0.3, 0.2, 0.3), p(0.14, -0.12, -0.24, 1.2, -0.3, -0.2, 0.3)];
      case 'cover':
        return [p(-0.06, -0.02, -0.15, 1.3, 0.4, 0.4, 0.2), p(0.06, -0.02, -0.15, 1.3, -0.4, -0.4, 0.2)];
      case 'cradle':
        return [p(-0.07, -0.17, -0.26, 0.5, 0.6, 0.3, 0.5), p(0.07, -0.17, -0.26, 0.5, -0.6, -0.3, 0.5)];
      default:
        return [p(-0.2, -0.44, -0.3), p(0.2, -0.44, -0.3)];
    }
  }
}
