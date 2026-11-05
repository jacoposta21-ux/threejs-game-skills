import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { Intents } from '../core/InputManager';
import type { Interactable, Prompt } from '../objects/Interactable';
import type { Throwable } from '../objects/Throwable';

const center = new THREE.Vector2(0, 0);

export class InteractionSystem {
  private items: Interactable[] = [];
  private raycaster = new THREE.Raycaster();
  target: Interactable | null = null;
  prompt: Prompt | null = null;
  held: Throwable | null = null;
  private hitList: THREE.Object3D[] = [];
  private dirty = true;

  register<T extends Interactable>(item: T): T {
    this.items.push(item);
    this.dirty = true;
    return item;
  }

  unregister(item: Interactable): void {
    this.items = this.items.filter((i) => i !== item);
    this.dirty = true;
  }

  clear(): void {
    this.items = [];
    this.target = null;
    this.prompt = null;
    this.held = null;
    this.dirty = true;
  }

  get all(): readonly Interactable[] {
    return this.items;
  }

  find<T extends Interactable>(id: string): T | undefined {
    return this.items.find((i) => i.id === id) as T | undefined;
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(dt: number, ctx: GameContext, intents: Intents | null): void {
    for (const item of this.items) item.update(dt, ctx);

    const player = ctx.player;
    // Hidden: the only action is to leave.
    if (player.mode === 'hidden') {
      this.target = null;
      this.prompt = { verb: 'Leave hiding spot', key: 'E' };
      if (intents?.pressed.has('interact')) player.exitHide();
      return;
    }
    if (player.mode === 'pushing') {
      this.target = null;
      this.prompt = { verb: 'Let go', key: 'E' };
      if (intents?.pressed.has('interact')) player.stopPush();
      return;
    }
    if (player.mode === 'climbing' || player.mode === 'locked') {
      this.target = null;
      this.prompt = null;
      return;
    }

    this.pick(ctx);

    if (!intents) return;
    const wantsInteract = intents.pressed.has('interact') || intents.pressed.has('throw');
    if (wantsInteract && this.target && this.prompt && !this.prompt.disabled) {
      ctx.hands.set('reach', 0.45);
      this.target.interact(ctx);
      this.dirty = true;
      return;
    }
    if (wantsInteract && this.held && !this.target) {
      this.throwHeld(ctx);
      return;
    }
    if (wantsInteract && this.target && this.prompt?.disabled) {
      ctx.audio.play('locked', { volume: 0.4 });
    }
  }

  private pick(ctx: GameContext): void {
    // Rebuilt every frame: items enable/disable themselves (drawer contents, sockets).
    this.hitList.length = 0;
    for (const item of this.items) {
      if (!item.enabled) continue;
      for (const h of item.hit) this.hitList.push(h);
    }
    this.dirty = false;
    ctx.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(center, ctx.camera);
    this.raycaster.far = 3.6;
    const hits = this.raycaster.intersectObjects(this.hitList, false);
    let found: Interactable | null = null;
    let prompt: Prompt | null = null;
    for (const hit of hits) {
      const item = hit.object.userData.interactable as Interactable | undefined;
      if (!item || !item.enabled) continue;
      if (hit.distance > item.range) continue;
      // Occlusion against walls/furniture, with tolerance for the object's own collider.
      const blocked = ctx.world.raycast(this.raycaster.ray.origin, hit.point, (c) => c.occluder && c.solid);
      if (blocked < hit.distance - 0.3) continue;
      const p = item.prompt(ctx);
      if (!p) continue;
      found = item;
      prompt = p;
      break;
    }
    this.target = found;
    if (prompt) this.prompt = prompt;
    else if (this.held) this.prompt = { verb: `Throw ${this.held.label}`, key: 'E' };
    else this.prompt = null;
  }

  private throwHeld(ctx: GameContext): void {
    const item = this.held!;
    this.held = null;
    const dir = new THREE.Vector3();
    ctx.camera.getWorldDirection(dir);
    const origin = new THREE.Vector3();
    ctx.camera.getWorldPosition(origin);
    origin.addScaledVector(dir, 0.25);
    item.launch(ctx, origin, dir);
    ctx.hands.set('reach', 0.35);
    this.dirty = true;
  }
}
