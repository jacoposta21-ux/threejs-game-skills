/** Pure gameplay rules (tips, heat, stars, upgrades). Unit-tested. */

export const TURN_SECONDS = 150;
export const DELIVERY_MAX_SPEED = 4; // m/s
export const BASE_TIP = 10;
export const PERFECT_BONUS = 5;
export const HEAT_LOSS_PER_S = 0.4; // % per second
export const BASE_MAX_SPEED = 14; // m/s

export const BOX = { w: 0.36, h: 0.05, d: 0.36, mass: 0.4, friction: 0.6 } as const;

export type UpgradeId = 'motor' | 'suspension' | 'rack' | 'bag';

export interface UpgradeDef {
  id: UpgradeId;
  base: number;
  growth: number;
  max: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  motor: { id: 'motor', base: 60, growth: 2.2, max: 5 },
  suspension: { id: 'suspension', base: 80, growth: 2.3, max: 5 },
  rack: { id: 'rack', base: 100, growth: 2.5, max: 4 },
  bag: { id: 'bag', base: 70, growth: 2.2, max: 5 },
};

export const UPGRADE_ORDER: UpgradeId[] = ['motor', 'suspension', 'rack', 'bag'];

/** Cost of buying level k+1 when the current level is k (k starts at 0). */
export function upgradeCost(id: UpgradeId, k: number): number {
  const u = UPGRADES[id];
  if (k >= u.max) return Infinity;
  return Math.round(u.base * Math.pow(u.growth, k));
}

export function maxSpeed(motorLevel: number): number {
  return BASE_MAX_SPEED * (1 + 0.08 * motorLevel);
}
export function bumpScale(suspensionLevel: number): number {
  return Math.max(0, 1 - 0.12 * suspensionLevel);
}
export function rackFriction(rackLevel: number): number {
  return BOX.friction * (1 + 0.15 * rackLevel);
}
/** Containment lip height (m) of the rack. */
export function rackLip(rackLevel: number): number {
  return 0.012 + 0.03 * rackLevel;
}
export function heatLossPerSecond(bagLevel: number): number {
  return HEAT_LOSS_PER_S * Math.max(0, 1 - 0.15 * bagLevel);
}

export function heatAt(elapsed: number, bagLevel: number): number {
  return Math.max(0, 100 - heatLossPerSecond(bagLevel) * elapsed);
}

export function timeBonus(elapsed: number): number {
  if (elapsed <= 40) return 1.5;
  if (elapsed <= 80) return 1.2;
  return 1;
}

/** Tip for one delivered pizza: base 10 × heat/100 × time bonus. */
export function pizzaTip(heat: number, elapsed: number): number {
  return BASE_TIP * (heat / 100) * timeBonus(elapsed);
}

/** Tip for one delivery stop (all its pizzas), plus +5 if perfect (no bumps since the last delivery). */
export function deliveryTip(heats: number[], elapsed: number, perfect: boolean): number {
  let t = 0;
  for (const h of heats) t += pizzaTip(h, elapsed);
  if (perfect) t += PERFECT_BONUS;
  return Math.round(t);
}

/** 0..3 stars: 1 = >=50% delivered, 2 = >=80%, 3 = 100% with no losses. */
export function starsFor(delivered: number, total: number, lost: number): number {
  if (total <= 0) return 0;
  const f = delivered / total;
  if (f >= 1 && lost === 0) return 3;
  if (f >= 0.8) return 2;
  if (f >= 0.5) return 1;
  return 0;
}
