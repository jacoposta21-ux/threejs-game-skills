import * as THREE from 'three';

/**
 * Pure data for one player. Controllers write it; UI, save and (later) the
 * network layer read it. Nothing here touches the scene or physics.
 */
export class PlayerState {
  constructor(id = 'player.local') {
    this.id = id;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.grounded = false;
    this.sprinting = false;
    this.aiming = false;
    this.mode = 'on-foot';
    this.selectedMiracle = 0;
    this.unlockedMiracles = [];
    this.faith = 0;
    this.chaos = 0;
    this.followers = [];
    this.romanAttention = 0;
    this.stats = { distance: 0, jumps: 0, playTime: 0, propsDisturbed: 0, conversations: 0 };
  }

  reset() {
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.selectedMiracle = 0;
    this.unlockedMiracles = [];
    this.faith = 0;
    this.chaos = 0;
    this.followers = [];
    this.romanAttention = 0;
    this.stats = { distance: 0, jumps: 0, playTime: 0, propsDisturbed: 0, conversations: 0 };
  }
}
