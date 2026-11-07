/** Fixed-step physics tick shared by the game and the headless tests. */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { PizzaPile } from './pile.ts';
import { Scooter, type ScooterInput } from './scooter.ts';
import { GROUPS } from './groups.ts';

type R = typeof RAPIER_NS;

export const FIXED_DT = 1 / 60;
export const SUBSTEPS = 2;

export class PhysicsSim {
  readonly rapier: R;
  readonly world: RAPIER_NS.World;
  readonly scooter: Scooter;
  readonly pile: PizzaPile;

  constructor(rapier: R, rackLevel = 0) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT / SUBSTEPS;
    this.world.integrationParameters.numSolverIterations = 8;
    this.scooter = new Scooter(rapier, this.world);
    this.pile = new PizzaPile(rapier, this.world, this.scooter.rack, rackLevel);
  }

  /** Flat infinite-ish ground for tests. */
  addFlatGround(y = 0) {
    const { RigidBodyDesc, ColliderDesc } = this.rapier;
    const b = this.world.createRigidBody(RigidBodyDesc.fixed().setTranslation(0, y - 0.5, 0));
    this.world.createCollider(ColliderDesc.cuboid(2000, 0.5, 2000).setCollisionGroups(GROUPS.ground).setFriction(0.8), b);
  }

  tick(
    input: ScooterInput,
    ground: (x: number, z: number) => number,
    cobble: (x: number, z: number) => number,
    beforeSubstep?: (t: number) => void,
  ) {
    this.scooter.step(FIXED_DT, input, ground, cobble);
    for (let s = 1; s <= SUBSTEPS; s++) {
      const t = s / SUBSTEPS;
      this.scooter.applyKinematic(t);
      beforeSubstep?.(t);
      this.world.step();
    }
  }
}
