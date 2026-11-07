import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsSim } from '../src/physics/sim.ts';
import type { PizzaBox } from '../src/physics/pile.ts';
import type { ScooterInput } from '../src/physics/scooter.ts';

const flat = () => 0;
const smooth = () => 0;
const lost: PizzaBox[] = [];

beforeAll(async () => {
  await RAPIER.init();
});

function settle(sim: PhysicsSim, ticks = 60) {
  const idle: ScooterInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  for (let i = 0; i < ticks; i++) sim.tick(idle, flat, smooth);
}

/** accelerate gently to 14 m/s and hold; returns boxes lost during the run */
function cruise(sim: PhysicsSim, seconds: number): number {
  let count = 0;
  sim.scooter.tuning.maxSpeed = 14;
  const gas: ScooterInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };
  for (let i = 0; i < seconds * 60; i++) {
    sim.tick(gas, flat, smooth);
    count += sim.pile.update(flat, lost).length;
  }
  return count;
}

function brakeTest(rackLevel: number): { lost: number; speedAfter: number } {
  const sim = new PhysicsSim(RAPIER, rackLevel);
  sim.addFlatGround();
  sim.scooter.place(0, 0, 0, 0);
  sim.pile.build(8);
  settle(sim);
  const before = cruise(sim, 14);
  expect(before).toBe(0);
  expect(sim.scooter.speed).toBeGreaterThan(13.5);
  // 14 m/s -> 0 in 0.5 s
  sim.scooter.speed = 14;
  sim.scooter.tuning.hardBrake = 28;
  const brake: ScooterInput = { throttle: 0, brake: 0, steer: 0, handbrake: true };
  let n = 0;
  for (let i = 0; i < 30; i++) {
    sim.tick(brake, flat, smooth);
    n += sim.pile.update(flat, lost).length;
  }
  const speedAfter = sim.scooter.speed;
  const idle: ScooterInput = { throttle: 0, brake: 0, steer: 0, handbrake: true };
  for (let i = 0; i < 180; i++) {
    sim.tick(idle, flat, smooth);
    n += sim.pile.update(flat, lost).length;
  }
  return { lost: n, speedAfter };
}

describe('physical pizza pile (headless Rapier)', () => {
  it('constant speed in a straight line for 20 s: no box falls', () => {
    const sim = new PhysicsSim(RAPIER, 0);
    sim.addFlatGround();
    sim.scooter.place(0, 0, 0, 0);
    sim.pile.build(8);
    settle(sim);
    const lostCount = cruise(sim, 8); // gentle acceleration phase
    expect(lostCount).toBe(0);
    expect(sim.scooter.speed).toBeGreaterThan(12);
    // then 20 s at constant speed
    sim.scooter.speed = 14;
    let n = 0;
    const gas: ScooterInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    for (let i = 0; i < 20 * 60; i++) {
      sim.tick(gas, flat, smooth);
      n += sim.pile.update(flat, lost).length;
    }
    expect(n).toBe(0);
    expect(sim.pile.aliveCount).toBe(8);
    expect(sim.scooter.z).toBeGreaterThan(250);
  });

  it('braking 14 -> 0 m/s in 0.5 s with 8 boxes drops at least one', () => {
    const r = brakeTest(0);
    expect(r.speedAfter).toBeLessThan(0.1);
    expect(r.lost).toBeGreaterThanOrEqual(1);
    console.log('base rack lost', r.lost);
  });

  it('max rack upgrade loses fewer boxes in the same brake', () => {
    const base = brakeTest(0);
    const maxed = brakeTest(4);
    console.log('rack0 lost', base.lost, 'rack4 lost', maxed.lost);
    expect(maxed.lost).toBeLessThan(base.lost);
  });
});
