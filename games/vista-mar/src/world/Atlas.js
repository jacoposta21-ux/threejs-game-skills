import * as THREE from 'three';

// Texture atlases: many tiling surface textures packed into one image per map
// type (colour, emissive, roughness/metalness, normal), so whole groups of
// materials collapse into ONE material and one draw call per chunk.
// Each vertex carries its tile origin (attribute `atlasTile`); the fragment
// shader wraps the original UV inside that tile with fract() and samples with
// textureGrad() using the unwrapped UV derivatives, so tiling and mip selection
// look exactly like the individual repeating textures did.

const PAD = 2 / 512; // inset so bilinear/mip sampling does not bleed across tiles

function blank(S, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = fill;
  x.fillRect(0, 0, S, S);
  return c;
}

/**
 * slots: [{ key, map, emissive?, orm? | {rough, metal}, normal? }] (canvases or textures)
 * returns { textures: {map, emissive, orm, normal}, tile(key) -> [u, v], cols, rows }
 */
export function buildAtlas(slots, cols, rows, S = 512, anisotropy = 8) {
  const W = cols * S, H = rows * S;
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, W, H); return [c, x]; };
  const [cMap, xMap] = mk('#808080');
  const [cEm, xEm] = mk('#000000');
  const [cOrm, xOrm] = mk('rgb(0,230,0)');
  const [cNor, xNor] = mk('rgb(128,128,255)');
  const tiles = new Map();
  const img = (t) => (t && t.isTexture ? t.image : t);
  slots.forEach((s, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * S, y = row * S;
    xMap.drawImage(img(s.map), x, y, S, S);
    if (s.emissive) xEm.drawImage(img(s.emissive), x, y, S, S);
    if (s.orm && (s.orm.isTexture || s.orm.getContext)) xOrm.drawImage(img(s.orm), x, y, S, S);
    else if (s.orm) { xOrm.fillStyle = `rgb(0,${Math.round(s.orm.rough * 255)},${Math.round(s.orm.metal * 255)})`; xOrm.fillRect(x, y, S, S); }
    if (s.normal) xNor.drawImage(img(s.normal), x, y, S, S);
    // UV origin of the tile (canvas textures are flipped: v = 0 at the bottom)
    tiles.set(s.key, [col / cols, 1 - (row + 1) / rows]);
  });
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = anisotropy;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  void blank;
  return {
    cols, rows,
    textures: { map: tex(cMap, true), emissive: tex(cEm, true), orm: tex(cOrm, false), normal: tex(cNor, false) },
    tile: (key) => tiles.get(key) || [0, 0],
    has: (key) => tiles.has(key),
  };
}

/** Patches a MeshStandardMaterial to sample its maps through the atlas tile of each vertex. */
export function applyAtlas(material, cols, rows) {
  const tw = (1 / cols).toFixed(6), th = (1 / rows).toFixed(6), pad = PAD.toFixed(6);
  const swap = (chunk, from, to) => {
    const src = THREE.ShaderChunk[chunk];
    if (!src.includes(from)) throw new Error(`atlas: ${chunk} changed`);
    return src.split(from).join(to);
  };
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 atlasTile;\nvarying vec2 vAtlasTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAtlasTile = atlasTile;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vAtlasTile;
vec4 atlasTex(sampler2D t, vec2 uv) {
  vec2 tileSize = vec2(${tw}, ${th});
  vec2 inner = tileSize * (1.0 - 2.0 * ${pad});
  vec2 a = vAtlasTile + tileSize * ${pad} + fract(uv) * inner;
  return textureGrad(t, a, dFdx(uv) * inner, dFdy(uv) * inner);
}`)
      .replace('#include <map_fragment>', swap('map_fragment', 'texture2D( map, vMapUv )', 'atlasTex( map, vMapUv )'))
      .replace('#include <emissivemap_fragment>', swap('emissivemap_fragment', 'texture2D( emissiveMap, vEmissiveMapUv )', 'atlasTex( emissiveMap, vEmissiveMapUv )'))
      .replace('#include <roughnessmap_fragment>', swap('roughnessmap_fragment', 'texture2D( roughnessMap, vRoughnessMapUv )', 'atlasTex( roughnessMap, vRoughnessMapUv )'))
      .replace('#include <metalnessmap_fragment>', swap('metalnessmap_fragment', 'texture2D( metalnessMap, vMetalnessMapUv )', 'atlasTex( metalnessMap, vMetalnessMapUv )'))
      .replace('#include <normal_fragment_maps>', swap('normal_fragment_maps', 'texture2D( normalMap, vNormalMapUv )', 'atlasTex( normalMap, vNormalMapUv )'));
  };
  material.customProgramCacheKey = () => `atlas-${cols}x${rows}`;
  return material;
}
