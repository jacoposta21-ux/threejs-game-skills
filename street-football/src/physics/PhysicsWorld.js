import RAPIER from '@dimforge/rapier3d-compat';

// Collision groups: 16-bit membership << 16 | 16-bit filter.
export const GROUP = { WORLD: 0x0001, BALL: 0x0002, PLAYER: 0x0004, PLAYER_GHOST: 0x0008 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const FIXED_DT = 1 / 120;
const MAX_STEPS = 12;

/**
 * Owns the Rapier world and the fixed-timestep accumulator. Gameplay that must
 * run in lockstep with the simulation registers a `preStep` callback.
 */
export class PhysicsWorld {
  static async create() {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    this.events = new RAPIER.EventQueue(true);
    this.accumulator = 0;
    this.preStep = [];
    this.postStep = [];
    this.colliderTags = new Map();
    this.contactListeners = [];
    this.stepCount = 0;
  }

  /** Fixed-step advance. Returns interpolation alpha for rendering. */
  update(dt) {
    this.accumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      for (const fn of this.preStep) fn(FIXED_DT);
      this.world.step(this.events);
      this.drainEvents();
      for (const fn of this.postStep) fn(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
      this.stepCount += 1;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;
    return this.accumulator / FIXED_DT;
  }

  drainEvents() {
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.colliderTags.get(h1);
      const b = this.colliderTags.get(h2);
      for (const fn of this.contactListeners) fn(a, b);
    });
  }

  tag(collider, tag) {
    this.colliderTags.set(collider.handle, tag);
    return collider;
  }

  onContact(fn) {
    this.contactListeners.push(fn);
  }

  addStaticBox(x, y, z, hx, hy, hz, opts = {}) {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setRestitution(opts.restitution ?? 0.5)
      .setFriction(opts.friction ?? 0.6)
      .setCollisionGroups(groups(GROUP.WORLD, 0xffff));
    if (opts.rotationY) {
      const s = Math.sin(opts.rotationY / 2);
      desc.setRotation({ x: 0, y: s, z: 0, w: Math.cos(opts.rotationY / 2) });
    }
    if (opts.soft) {
      // Nets swallow the ball: the lowest restitution of the pair wins.
      desc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
      desc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max);
    }
    if (opts.events) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(desc);
    if (opts.tag) this.tag(collider, opts.tag);
    return collider;
  }

  addStaticCylinder(x, y, z, halfHeight, radius, opts = {}) {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(x, y, z)
      .setRestitution(opts.restitution ?? 0.5)
      .setFriction(opts.friction ?? 0.4)
      .setCollisionGroups(groups(GROUP.WORLD, 0xffff));
    if (opts.axis === 'z') {
      const s = Math.SQRT1_2;
      desc.setRotation({ x: s, y: 0, z: 0, w: s });
    } else if (opts.axis === 'x') {
      const s = Math.SQRT1_2;
      desc.setRotation({ x: 0, y: 0, z: s, w: s });
    }
    const collider = this.world.createCollider(desc);
    if (opts.tag) this.tag(collider, opts.tag);
    return collider;
  }

  createKinematicCapsule(x, z, halfHeight, radius, tag) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, halfHeight + radius, z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius)
        .setRestitution(0.35)
        .setFriction(0.5)
        .setCollisionGroups(groups(GROUP.PLAYER, GROUP.BALL)),
      body,
    );
    this.tag(collider, tag);
    return { body, collider };
  }

  diagnostics() {
    let bodies = 0;
    let colliders = 0;
    this.world.bodies.forEach(() => (bodies += 1));
    this.world.colliders.forEach(() => (colliders += 1));
    return { engine: 'rapier3d-compat', timestep: FIXED_DT, bodies, colliders, steps: this.stepCount };
  }

  dispose() {
    this.events.free();
    this.world.free();
  }
}
