import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Owns the Rapier world. All bodies/colliders are created here and the world
 * is stepped at the fixed 60 Hz rate by GameSession.
 */
export class PhysicsWorld {
  static async create() {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    this.world.timestep = 1 / 60;
    this.staticCount = 0;
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  addTrimesh(vertices, indices) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.9), body);
    this.staticCount += 1;
  }

  /** Static colliders from world-builder descriptors (one fixed body, many colliders). */
  addStaticColliders(descriptors) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const c of descriptors) {
      let desc;
      if (c.shape === 'box') {
        desc = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz);
        if (c.q) desc.setRotation(c.q);
      } else {
        desc = RAPIER.ColliderDesc.cylinder(c.hh, c.r);
      }
      desc.setTranslation(c.x, c.y, c.z).setFriction(0.7);
      this.world.createCollider(desc, body);
      this.staticCount += 1;
    }
  }

  createCharacter({ x, y, z, radius, halfHeight }) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius).setFriction(0), body);
    const controller = this.world.createCharacterController(0.04);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle((48 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    controller.enableAutostep(0.42, 0.18, false);
    controller.enableSnapToGround(0.45);
    controller.setSlideEnabled(true);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(70);
    return { body, collider, controller };
  }

  createDynamic({ shape, x, y, z, hx, hy, hz, r, hh, density = 1, restitution = 0.2, friction = 0.6, ry = 0 }) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) })
      .setLinearDamping(0.35)
      .setAngularDamping(0.6)
      .setCanSleep(true);
    const body = this.world.createRigidBody(desc);
    let cdesc;
    if (shape === 'box') cdesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    else if (shape === 'cyl') cdesc = RAPIER.ColliderDesc.cylinder(hh, r);
    else cdesc = RAPIER.ColliderDesc.ball(r);
    cdesc.setDensity(density).setRestitution(restitution).setFriction(friction);
    const collider = this.world.createCollider(cdesc, body);
    body.sleep();
    return { body, collider };
  }

  /** Ray cast returning distance or null. */
  castRay(ox, oy, oz, dx, dy, dz, maxDist, excludeCollider, predicate) {
    this.ray.origin = { x: ox, y: oy, z: oz };
    this.ray.dir = { x: dx, y: dy, z: dz };
    const hit = this.world.castRay(this.ray, maxDist, true, undefined, undefined, excludeCollider, undefined, predicate);
    return hit ? hit.timeOfImpact : null;
  }

  /**
   * Camera occluders: terrain and solid architecture only. Thin cylinders
   * (trunks, posts, well) and loose props would otherwise yank the camera
   * into the back of the player's head for a frame.
   */
  isCameraBlocker = (collider) => {
    if (collider.shape.type === RAPIER.ShapeType.Cylinder) return false;
    const body = collider.parent();
    return !(body && body.isDynamic());
  };

  step() {
    this.world.step();
  }

  stats() {
    let dynamicAwake = 0;
    this.world.forEachActiveRigidBody(() => {
      dynamicAwake += 1;
    });
    return { bodies: this.world.bodies.len(), colliders: this.world.colliders.len(), activeBodies: dynamicAwake };
  }
}
