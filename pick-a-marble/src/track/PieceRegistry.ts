import * as THREE from 'three';
import { getDef } from './catalog';
import { mirrorSurface } from './geometry';
import type { ColliderSpec, PieceBuild, PieceDef, PortDef, ZoneDef } from './types';

const cache = new Map<string, PieceBuild>();

function mirrorV(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, -v.z);
}

function mirrorCollider(c: ColliderSpec): ColliderSpec {
  switch (c.type) {
    case 'cuboid':
      return { ...c, center: mirrorV(c.center), rotY: c.rotY ? -c.rotY : undefined };
    case 'ball':
      return { ...c, center: mirrorV(c.center) };
    case 'cylinder':
      return { ...c, center: mirrorV(c.center) };
    case 'hull': {
      const pts = c.points.slice();
      for (let i = 2; i < pts.length; i += 3) pts[i] = -pts[i];
      return { type: 'hull', points: pts };
    }
  }
}

function mirrorZone(z: ZoneDef): ZoneDef {
  const effect = { ...z.effect } as ZoneDef['effect'];
  if (effect.type === 'boost' || effect.type === 'kick') (effect as { dir: THREE.Vector3 }).dir = mirrorV(effect.dir);
  if (effect.type === 'launch') (effect as { target: THREE.Vector3 }).target = mirrorV(effect.target);
  return {
    min: new THREE.Vector3(z.min.x, z.min.y, -z.max.z),
    max: new THREE.Vector3(z.max.x, z.max.y, -z.min.z),
    effect,
  };
}

export function getBuild(defId: string, mirror = false): PieceBuild {
  const key = `${defId}|${mirror ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = getDef(defId);
  let build: PieceBuild;
  if (!mirror) {
    build = def.build();
  } else {
    const base = getBuild(defId, false);
    const vis = new THREE.Group();
    const inner = base.visual.clone();
    inner.scale.z = -1;
    vis.add(inner);
    build = {
      ...base,
      visual: vis,
      surfaces: base.surfaces.map(mirrorSurface),
      colliders: base.colliders.map(mirrorCollider),
      lanes: base.lanes.map((l) => ({ ...l, points: l.points.map(mirrorV) })),
      zones: base.zones.map(mirrorZone),
      spawns: base.spawns.map(mirrorV),
      movers: base.movers,
    };
  }
  cache.set(key, build);
  return build;
}

export function getPorts(def: PieceDef, mirror = false): PortDef[] {
  if (!mirror) return def.ports;
  return def.ports.map((p) => ({ ...p, pos: mirrorV(p.pos), facing: mirrorV(p.facing) }));
}

/** Warm the cache so the first placement does not hitch. */
export function prebuildAll(defs: PieceDef[]): void {
  for (const d of defs) getBuild(d.id, false);
}
