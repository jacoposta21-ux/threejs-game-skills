/** Rapier collision groups: (membership << 16) | filter. */
export const G = {
  WORLD: 0x0001, // buildings, walls, fountains, water edges
  CHASSIS: 0x0002, // scooter body (only used by the character-controller query)
  RACK: 0x0004, // rack plate + lips
  BOX: 0x0008, // pizza boxes
  CAR: 0x0010, // traffic
  GROUND: 0x0020, // terrain surface (only boxes land on it)
} as const;

export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export const GROUPS = {
  world: groups(G.WORLD, G.CHASSIS | G.BOX),
  ground: groups(G.GROUND, G.BOX),
  chassis: groups(G.CHASSIS, G.WORLD | G.CAR),
  rack: groups(G.RACK, G.BOX),
  box: groups(G.BOX, G.RACK | G.BOX | G.WORLD | G.CAR | G.GROUND),
  car: groups(G.CAR, G.CHASSIS | G.BOX),
};
