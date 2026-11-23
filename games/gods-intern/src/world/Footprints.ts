import type { BuildingType } from '../core/types';

/** Building footprint radii (kept in a leaf module so WorldGen and Settlements avoid an import cycle at load time). */
export const FOOTPRINT: Record<BuildingType, number> = {
  house: 2.6,
  well: 1.5,
  farm: 5.6,
  storage: 3.2,
  shrine: 2.4,
  quarry: 3.0,
  fishery: 2.8,
};
