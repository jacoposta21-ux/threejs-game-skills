import * as THREE from 'three';
import type { GameContext } from '../core/Context';

export interface Prompt {
  verb: string;
  key?: string;
  disabled?: boolean;
}

/**
 * Base class for everything the player can look at and act on.
 * `hit` holds the meshes raycast by the interaction system.
 */
export abstract class Interactable {
  readonly hit: THREE.Object3D[] = [];
  enabled = true;
  range = 1.6;
  /** Interact from crawl height too (most things). */
  readonly root = new THREE.Group();

  constructor(readonly id: string) {}

  abstract prompt(ctx: GameContext): Prompt | null;
  abstract interact(ctx: GameContext): void;
  update(_dt: number, _ctx: GameContext): void {}

  /** World-space point the hands reach toward. */
  focus(out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.getWorldPosition(out);
  }

  /** Invisible proxy box used for raycasts. */
  addHitBox(w: number, h: number, d: number, x = 0, y = 0, z = 0, parent: THREE.Object3D = this.root): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMaterial);
    mesh.position.set(x, y + h / 2, z);
    mesh.visible = false;
    mesh.userData.interactable = this;
    parent.add(mesh);
    this.hit.push(mesh);
    return mesh;
  }

  /** Register an existing mesh as a raycast target. */
  addHitMesh(mesh: THREE.Object3D): void {
    mesh.userData.interactable = this;
    this.hit.push(mesh);
  }
}

const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
