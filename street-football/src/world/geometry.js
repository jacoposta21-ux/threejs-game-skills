import * as THREE from 'three';

/** Box whose UVs are in world units / tile, so tiling textures keep a constant scale. */
export function worldBox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z (4 verts each).
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f += 1) {
    for (let i = 0; i < 4; i += 1) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * spans[f][0]) / tile, (uv.getY(k) * spans[f][1]) / tile);
    }
  }
  return g;
}

export function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function place(geo, x, y, z, ry = 0, rx = 0, rz = 0) {
  if (rx) geo.rotateX(rx);
  if (rz) geo.rotateZ(rz);
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

/** Ensure every geometry has the same attribute set before merging. */
export function normalizeForMerge(geos, { color = true } = {}) {
  return geos.map((g) => {
    let geo = g.index ? g.toNonIndexed() : g;
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    if (color && !geo.attributes.color) paint(geo, '#ffffff');
    if (!color && geo.attributes.color) geo.deleteAttribute('color');
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) geo.deleteAttribute(name);
    }
    geo.clearGroups();
    return geo;
  });
}
