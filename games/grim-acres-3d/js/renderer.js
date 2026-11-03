// 3D renderer for Mildew Hollow (Three.js). Game logic still runs on the 16px tile grid from
// world.js; here 1 tile = 1 world unit, X = east, Z = south, Y = up. The camera keeps north at
// the top of the screen so the original 4-way controls map 1:1.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Art, PAL } from './art.js';
import { TILE, T } from './world.js';
import { darkness } from './time.js';
import { MAP } from './data/map.js';
import { VILLAGERS, PLAYER_LOOK } from './data/villagers.js';
import { hash2 } from './rng.js';
import { Kit } from './three/kit.js';
import {
  MAT, meshOf, buildingModel, treeModel, bushModel, rockModel, cropModel, debrisModel, propModel,
  gnomeModel, characterRig, catRig,
} from './three/models.js';

const FOV = 34;
const ELEV = THREE.MathUtils.degToRad(49);
const DIR_YAW = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
const LOOKS = Object.fromEntries(VILLAGERS.map((v) => [v.id, v.look]));
const RIVER = MAP.river;
const WATER_Y = -0.3;

function tex(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
const lerp = (a, b, k) => a + (b - a) * k;
function angLerp(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }

// Pixel emotes (same shapes as the 2D game) drawn 4x into small textures for sprites.
function emoteTexture(kind) {
  const [c, g] = canvas(40, 40);
  g.scale(4, 4);
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x + 0.5, y + 1, w, h); };
  if (kind === 'heart') { const c1 = '#e0505a'; R(1, 0, 2, 1, c1); R(5, 0, 2, 1, c1); R(0, 1, 8, 2, c1); R(1, 3, 6, 1, c1); R(2, 4, 4, 1, c1); R(3, 5, 2, 1, c1); }
  else if (kind === 'talk') { R(-0.5, -0.5, 10, 7, PAL.ink); R(0, 0, 9, 6, PAL.white); R(2, 6, 2, 1, PAL.white); R(2, 3, 1, 1, PAL.ink); R(4, 3, 1, 1, PAL.ink); R(6, 3, 1, 1, PAL.ink); }
  else if (kind === 'bang') { R(2.5, -0.5, 3, 9, PAL.ink); R(3, 0, 2, 5, PAL.yellow); R(3, 6, 2, 2, PAL.yellow); }
  else if (kind === 'sad') { R(3, 1, 2, 4, '#6f8fbf'); R(2, 3, 4, 2, '#6f8fbf'); }
  return tex(c);
}

export class Renderer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.gl = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#a9c3cf', 26, 60);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 220);
    this.cam = { x: 0, y: 0 };            // kept for compatibility (world px of the view centre)
    this.target = new THREE.Vector3();    // smoothed look-at point
    this.dist = 15;
    this.time = 0;
    this.areaId = null;
    this.arrowPos = null;
    this.stats = { calls: 0, tris: 0 };

    this._lights();
    this._overlays();
    this.composer = new EffectComposer(this.gl);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  // ------------------------------------------------------------------ setup
  _lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#c8dcea', '#5d5030', 1.2);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow;
    sc.mapSize.set(2048, 2048);
    sc.camera.left = -20; sc.camera.right = 20; sc.camera.top = 20; sc.camera.bottom = -20;
    sc.camera.near = 1; sc.camera.far = 80;
    sc.bias = -0.0004; sc.normalBias = 0.03;
    s.add(this.sun, this.sun.target);
    this.pool = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight('#ffc070', 0, 9, 1.6);
      l.visible = false;
      s.add(l); this.pool.push(l);
    }
    this.lantern = new THREE.PointLight('#ffd9a0', 0, 8, 1.2);
    s.add(this.lantern);
  }

  _overlays() {
    const s = this.scene;
    this.fx = new THREE.Group(); s.add(this.fx);
    // facing-tile cursor
    const ck = new Kit();
    for (const [w, d, x, z] of [[1, 0.05, 0, -0.475], [1, 0.05, 0, 0.475], [0.05, 1, -0.475, 0], [0.05, 1, 0.475, 0]]) ck.box(w, 0.02, d, x, 0, z, '#fff0c8', { jitter: 0 });
    this.cursor = new THREE.Mesh(ck.build().base, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
    this.cursor.renderOrder = 2;
    this.fx.add(this.cursor);
    // bouncing arrows (exit mat + objective)
    const arrowShape = (s) => {
      const sh = new THREE.Shape();
      const pts = [[-0.12, 0.38], [0.12, 0.38], [0.12, 0.02], [0.3, 0.02], [0, -0.36], [-0.3, 0.02], [-0.12, 0.02]];
      pts.forEach(([x, y], i) => (i ? sh.lineTo(x * s, y * s) : sh.moveTo(x * s, y * s)));
      sh.closePath();
      return new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
    };
    const arrow = (col) => {
      const g = new THREE.Group();
      const back = new THREE.Mesh(arrowShape(1.28), new THREE.MeshBasicMaterial({ color: '#2b2125', depthTest: false, transparent: true }));
      back.position.set(0, -0.005, -0.04);
      const front = new THREE.Mesh(arrowShape(1), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true }));
      back.renderOrder = 10; front.renderOrder = 11;
      g.add(back, front);
      g.rotation.x = -0.45; // tilt towards the camera
      return g;
    };
    this.exitArrow = arrow(PAL.litL); this.fx.add(this.exitArrow);
    this.goalArrow = arrow(PAL.yellow); this.fx.add(this.goalArrow);
    // HTML edge pointer for an off-screen objective
    this.edge = document.createElement('div');
    this.edge.id = 'edge-arrow';
    (document.getElementById('hud') || document.body).append(this.edge);

    this.emoteTex = Object.fromEntries(['heart', 'talk', 'bang', 'sad'].map((k) => [k, emoteTexture(k)]));
    this.emoteSprites = [];
    this.hintSprites = new Map();
    this.sparkTex = Art.sparkle.map((c) => tex(c));
    this.sparkSprites = [];
    this.dentTex = tex(Art.dent);
    this.dents = [];
    this.glintTex = (() => { const [c, g] = canvas(8, 8); g.fillStyle = PAL.litL; g.fillRect(3, 0, 2, 8); g.fillRect(0, 3, 8, 2); return tex(c); })();

    // fishing line + bobber
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(17).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: '#f0ebdc', transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    const bk = new Kit(); bk.sphere(0.08, 0, 0.06, 0, PAL.red, { jitter: 0 }); bk.sphere(0.081, 0, 0.0, 0, PAL.white, { scale: [1, 0.6, 1], jitter: 0 });
    this.bobber = new THREE.Mesh(bk.build().base, MAT.base);
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 20), new THREE.MeshBasicMaterial({ color: '#d8e8f0', transparent: true, opacity: 0.6, depthWrite: false }));
    this.ripple.rotation.x = -Math.PI / 2;
    this.fx.add(this.line, this.bobber, this.ripple);

    // rain
    const N = 900;
    this.rainPos = new Float32Array(N * 6);
    this.rainSeed = new Float32Array(N * 3).map(() => Math.random());
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#c4d4e8', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    s.add(this.rain);
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const mobile = Math.min(W, H) < 600;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(W, H, false);
    this.canvas.style.width = `${W}px`; this.canvas.style.height = `${H}px`;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(W, H);
    this.bloom.resolution.set(W / 2, H / 2);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.vw = W; this.vh = H;
    this.scale = 1;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  }

  // ------------------------------------------------------------------ world building
  _build(game) {
    if (this.root) { this.scene.remove(this.root); this.root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
    const world = game.world;
    this.world = world;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.areaGroups = new Map();
    for (const a of world.areas) { const g = new THREE.Group(); g.visible = false; this.areaGroups.set(a.id, g); this.root.add(g); }
    this._atlas();
    for (const a of world.areas) this._ground(world, a);
    this._outdoorExtras(world);
    for (const a of world.areas) if (!a.outdoor) this._room(a);
    this.objMeshes = new Map();
    this._instancedNature(world);
    for (const o of world.objects) this._addObject(o);
    this._farmMeshes();
    this.rigs = new Map();
    this.catRigs = [];
  }

  _atlas() {
    if (this.atlas) return;
    const T2 = Art.tiles;
    const list = [];
    T2.grass.forEach((c, i) => list.push([`grass${i}`, c]));
    T2.path.forEach((c, i) => list.push([`path${i}`, c]));
    T2.stone.forEach((c, i) => list.push([`stone${i}`, c]));
    T2.sand.forEach((c, i) => list.push([`sand${i}`, c]));
    T2.field.forEach((c, i) => list.push([`field${i}`, c]));
    T2.flowers.forEach((c, i) => list.push([`flowers${i}`, c]));
    T2.floor.wood.forEach((c, i) => list.push([`wood${i}`, c]));
    T2.floor.stone.forEach((c, i) => list.push([`fstone${i}`, c]));
    list.push(['mat', T2.mat], ['bridge', T2.bridge]);
    const CELL = 20, cols = 6, S = 128;
    const [c, g] = canvas(S, S);
    this.uv = {};
    list.forEach(([key, src], i) => {
      const x = (i % cols) * CELL + 2, y = Math.floor(i / cols) * CELL + 2;
      // 2px replicated border so neighbouring cells never bleed in
      g.drawImage(src, 0, 0, 16, 1, x, y - 2, 16, 2); g.drawImage(src, 0, 15, 16, 1, x, y + 16, 16, 2);
      g.drawImage(src, 0, 0, 1, 16, x - 2, y, 2, 16); g.drawImage(src, 15, 0, 1, 16, x + 16, y, 2, 16);
      g.drawImage(src, 0, 0, 16, 16, x, y, 16, 16);
      this.uv[key] = [x / S, 1 - (y + 16) / S, (x + 16) / S, 1 - y / S];
    });
    this.atlas = tex(c);
    this.groundMat = new THREE.MeshStandardMaterial({ map: this.atlas, color: '#e4e2dc', roughness: 0.95, metalness: 0 });
    this.soilTex = { dry: tex(Art.tiles.soil.dry), wet: tex(Art.tiles.soil.wet) };
    const wt = tex(Art.tiles.water[0], true);
    this.waterTex = wt;
    this.waterMat = new THREE.MeshStandardMaterial({ map: wt, color: '#d4e6ee', roughness: 0.32, metalness: 0, emissive: new THREE.Color('#0d2030'), emissiveIntensity: 0.6 });
    this.bankMat = new THREE.MeshStandardMaterial({ color: '#8a7350', roughness: 1, flatShading: true });
  }

  _tileKey(world, area, x, y) {
    const t = world.tile(x, y), v = world.variant(x, y, 6);
    switch (t) {
      case T.GRASS: case T.FENCE: return `grass${v}`;
      case T.PATH: return `path${v % 3}`;
      case T.STONE: return `stone${v % 2}`;
      case T.SAND: return `sand${v % 2}`;
      case T.FIELD: return `field${v % 3}`;
      case T.FLOWERS: return `flowers${v % 3}`;
      case T.FLOOR: return area.floor === 'stone' ? 'fstone0' : `wood${(x + y) % 2}`;
      case T.MAT: return 'mat';
      case T.BRIDGE: return world.tile(x, y) === T.BRIDGE && (x < RIVER.x || x >= RIVER.x + RIVER.w) ? 'sand0' : null;
      default: return null;
    }
  }

  _isRiver(world, x, y) {
    const t = world.tile(x, y);
    return t === T.WATER || (t === T.BRIDGE && x >= RIVER.x && x < RIVER.x + RIVER.w);
  }

  _ground(world, area) {
    const pos = [], uv = [], nor = [];
    const wpos = [], wuv = [], bank = [];
    const quad = (P, U, x0, z0, x1, z1, y, r) => {
      P.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      if (U && r) U.push(r[0], r[3], r[0], r[1], r[2], r[1], r[0], r[3], r[2], r[1], r[2], r[3]);
    };
    for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) {
      if (area.outdoor && this._isRiver(world, x, y)) {
        quad(wpos, wuv, x, y, x + 1, y + 1, WATER_Y, null);
        wuv.push(x, -y, x, -y - 1, x + 1, -y - 1, x, -y, x + 1, -y - 1, x + 1, -y);
        continue;
      }
      const key = this._tileKey(world, area, x, y);
      if (!key) continue;
      quad(pos, uv, x, y, x + 1, y + 1, 0, this.uv[key]);
      for (let i = 0; i < 6; i++) nor.push(0, 1, 0);
      if (area.outdoor) { // vertical bank faces down to the river
        if (this._isRiver(world, x - 1, y)) bank.push(x, 0, y, x, WATER_Y - 0.3, y, x, WATER_Y - 0.3, y + 1, x, 0, y, x, WATER_Y - 0.3, y + 1, x, 0, y + 1);
        if (this._isRiver(world, x + 1, y)) bank.push(x + 1, 0, y + 1, x + 1, WATER_Y - 0.3, y + 1, x + 1, WATER_Y - 0.3, y, x + 1, 0, y + 1, x + 1, WATER_Y - 0.3, y, x + 1, 0, y);
        if (this._isRiver(world, x, y - 1)) bank.push(x + 1, 0, y, x + 1, WATER_Y - 0.3, y, x, WATER_Y - 0.3, y, x + 1, 0, y, x, WATER_Y - 0.3, y, x, 0, y);
        if (this._isRiver(world, x, y + 1)) bank.push(x, 0, y + 1, x, WATER_Y - 0.3, y + 1, x + 1, WATER_Y - 0.3, y + 1, x, 0, y + 1, x + 1, WATER_Y - 0.3, y + 1, x + 1, 0, y + 1);
      }
    }
    const grp = this.areaGroups.get(area.id);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, this.groundMat); m.receiveShadow = true; grp.add(m);
    if (wpos.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
      wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, this.waterMat); wm.receiveShadow = true; grp.add(wm);
    }
    if (bank.length) {
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bank, 3)); bg.computeVertexNormals();
      const bm = new THREE.Mesh(bg, this.bankMat); bm.receiveShadow = true; grp.add(bm);
    }
  }

  // Fence, bridge, bunting, the land beyond the map edge.
  _outdoorExtras(world) {
    const grp = this.areaGroups.get('outdoor');
    const k = new Kit();
    const isF = (x, y) => world.tile(x, y) === T.FENCE;
    for (let y = 0; y < world.outH; y++) for (let x = 0; x < world.w; x++) {
      if (!isF(x, y)) continue;
      const cx = x + 0.5, cz = y + 0.5;
      k.box(0.14, 0.82, 0.14, cx, 0, cz, PAL.woodD);
      k.box(0.18, 0.05, 0.18, cx, 0.82, cz, PAL.woodL);
      const link = (dx, dz) => {
        const len = 1;
        for (const h of [0.32, 0.6]) {
          if (dx) k.box(len, 0.08, 0.06, cx + dx * 0.5, h, cz, PAL.wood);
          else k.box(0.06, 0.08, len, cx, h, cz + dz * 0.5, PAL.wood);
        }
      };
      if (isF(x + 1, y) || world.tile(x + 1, y) === T.PATH && isF(x + 2, y)) link(1, 0);
      if (isF(x, y + 1)) link(0, 1);
    }
    // gate posts
    for (const gx of MAP.field.gate) k.box(0.18, 1.05, 0.18, gx + (gx === MAP.field.gate[0] ? 0.05 : 0.95), 0, MAP.field.rect[1] + 0.5, PAL.woodD);
    // bridge deck with rails
    const [bx, by, bw, bh] = MAP.bridge;
    for (let i = 0; i < bw * 3; i++) k.box(0.31, 0.1, bh - 0.1, bx + (i + 0.5) / 3, 0.02, by + bh / 2, i % 2 ? PAL.wood : PAL.woodL, { jitter: 0.1 });
    k.box(bw, 0.16, bh - 0.1, bx + bw / 2, -0.14, by + bh / 2, PAL.woodXD);
    for (const z of [by + 0.08, by + bh - 0.08]) {
      k.box(bw, 0.08, 0.08, bx + bw / 2, 0.62, z, PAL.woodL);
      k.box(bw, 0.06, 0.06, bx + bw / 2, 0.32, z, PAL.wood);
      for (let x = 0; x <= bw; x += 1) k.box(0.12, 0.7, 0.12, bx + x, 0.0, z, PAL.woodD);
    }
    for (let x = 0; x <= bw; x += 2.5) k.box(0.2, 0.6, 0.2, bx + Math.min(x, bw - 0.1), -0.6, by + bh / 2, PAL.woodXD);
    // festival bunting strung between the plaza lamps
    const cols = [PAL.red, PAL.yellow, PAL.teal, PAL.orange, PAL.purple];
    for (const row of [14, 27]) {
      const x0 = 38.5, x1 = 57.5, z = row + 0.5, top = 2.25;
      let n = 0;
      for (let x = x0; x < x1; x += 0.25) {
        const t0 = (x - x0) / (x1 - x0), t1 = (x + 0.25 - x0) / (x1 - x0);
        const y0 = top - Math.sin(Math.PI * t0) * 0.7, y1 = top - Math.sin(Math.PI * t1) * 0.7;
        k.box(0.27, 0.025, 0.025, x + 0.125, (y0 + y1) / 2, z, '#3a3438', { rot: [0, 0, Math.atan2(y1 - y0, 0.25)], jitter: 0 });
        if (Math.round((x - x0) / 0.25) % 3 === 1) k.cone(0.12, 0.24, x, y0 - 0.26, z, cols[n++ % cols.length], { rot: [Math.PI, 0, 0], seg: 3, jitter: 0 });
      }
    }
    const res = k.build();
    const m = meshOf(res); grp.add(m);
    // land beyond the map edge, dimmed by fog
    // (a frame of four strips, so it never covers the sunken river)
    const farMat = new THREE.MeshStandardMaterial({ color: '#4f5a2c', roughness: 1 });
    const W = world.w, H = world.outH, E = 120;
    for (const [x, z, w, d] of [[W / 2, -E / 2, W + 2 * E, E], [W / 2, H + E / 2, W + 2 * E, E], [-E / 2, H / 2, E, H], [W + E / 2, H / 2, E, H]]) {
      const far = new THREE.Mesh(new THREE.PlaneGeometry(w, d), farMat);
      far.rotation.x = -Math.PI / 2; far.position.set(x, -0.01, z); far.receiveShadow = true;
      grp.add(far);
    }
  }

  // Interior shell: tall back wall with the room's wallpaper (and windows), side walls, low front lip.
  _room(a) {
    const grp = this.areaGroups.get(a.id);
    const set = Art.tiles.walls[a.wall] || Art.tiles.walls.farm;
    const paint = (night) => {
      const [c, g] = canvas(a.w * 16, 32);
      for (let rx = 0; rx < a.w; rx++) {
        const inner = rx > 0 && rx < a.w - 1;
        const win = (rx === 2 || rx === a.w - 3) && a.w > 6;
        g.drawImage(inner ? (win ? (night ? set.winNight : set.win) : set.top) : set.edge, rx * 16, 0);
        g.drawImage(inner ? set.low : set.edge, rx * 16, 16);
      }
      return tex(c);
    };
    const day = paint(false), night = paint(true);
    const H = 2.2;
    const wallMat = new THREE.MeshStandardMaterial({ map: day, roughness: 0.95 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(a.w, H), wallMat);
    face.position.set(a.x + a.w / 2, H / 2, a.y + 2);
    face.receiveShadow = true;
    grp.add(face);
    face.userData.room = { day, night, mat: wallMat };
    this.roomWalls = this.roomWalls || new Map();
    this.roomWalls.set(a.id, face.userData.room);
    // sample the wallpaper colour for the side walls
    const wp = set.low.getContext('2d').getImageData(1, 3, 1, 1).data;
    const side = `rgb(${wp[0]},${wp[1]},${wp[2]})`;
    const k = new Kit();
    k.box(a.w, H, 1.98, a.x + a.w / 2, 0, a.y + 1, '#2e2326', { jitter: 0 });
    k.box(a.w + 0.1, 0.1, 2.1, a.x + a.w / 2, H, a.y + 1, '#3d3034', { jitter: 0 });
    for (const sx of [a.x + 0.5, a.x + a.w - 0.5]) {
      k.box(1, H * 0.62, a.h - 2, sx, 0, a.y + 2 + (a.h - 2) / 2, side, { jitter: 0.02 });
      k.box(1.04, 0.08, a.h - 2, sx, H * 0.62, a.y + 2 + (a.h - 2) / 2, '#3d3034', { jitter: 0 });
      k.box(0.06, 0.3, a.h - 2, sx + (sx < a.x + 1 ? 0.5 : -0.5), 0, a.y + 2 + (a.h - 2) / 2, '#7a5134', { jitter: 0 });
    }
    for (let x = a.x; x < a.x + a.w; x++) if (!(x === a.mat.x)) k.box(1, 0.28, 1, x + 0.5, 0, a.y + a.h - 0.5, '#2e2326', { jitter: 0 });
    k.box(a.w, 0.3, 0.04, a.x + a.w / 2, 0, a.y + 2.02, '#7a5134', { jitter: 0 }); // skirting
    const res = k.build();
    grp.add(meshOf(res));
  }

  _instancedNature(world) {
    const grp = this.areaGroups.get('outdoor');
    const buckets = new Map();
    const push = (key, model, x, z, seed) => {
      if (!buckets.has(key)) buckets.set(key, { model, list: [] });
      buckets.get(key).list.push([x, z, seed]);
    };
    for (const o of world.objects) {
      if (o.kind === 'tree') push(`tree${o.variant}`, treeModel(o.variant), o.x + 0.5, o.y + 0.5, o.index);
      else if (o.kind === 'bush') push('bush', bushModel(), o.x + 0.5, o.y + 0.5, o.index);
      else if (o.kind === 'rock') push('rock', rockModel(), o.x + 0.5, o.y + 0.5, o.index);
    }
    // a forest ring beyond the border so the village doesn't float in a void
    let s = 1;
    for (let y = -7; y < world.outH + 7; y++) for (let x = -7; x < world.w + 7; x++) {
      if (x >= 0 && y >= 0 && x < world.w && y < world.outH) continue;
      s++;
      if (hash2(x, y, 31) < 0.42) { const v = Math.floor(hash2(x, y, 5) * 4); push(`tree${v}`, treeModel(v), x + 0.5, y + 0.5, s); }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const { model, list } of buckets.values()) {
      for (const [geo, mat] of [[model.base, MAT.base], [model.glow, MAT.glow]]) {
        if (!geo) continue;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, z, seed], i) => {
          const r1 = hash2(seed, 3, 11), r2 = hash2(seed, 7, 13), r3 = hash2(seed, 9, 17);
          p.set(x + (r1 - 0.5) * 0.3, 0, z + (r2 - 0.5) * 0.25);
          q.setFromAxisAngle(up, r3 * Math.PI * 2);
          const k = 0.88 + r1 * 0.3;
          sc.set(k, k * (0.92 + r2 * 0.2), k);
          m4.compose(p, q, sc);
          im.setMatrixAt(i, m4);
        });
        im.castShadow = true; im.receiveShadow = true;
        grp.add(im);
      }
    }
  }

  _addObject(o) {
    if (['tree', 'bush', 'rock'].includes(o.kind)) return;
    const area = this.world.areaAt(o.x, o.y);
    if (!area) return;
    let res;
    if (o.kind === 'building') res = buildingModel(o.def);
    else if (o.kind === 'gnome') res = gnomeModel(LOOKS[o.victim] || PLAYER_LOOK);
    else res = propModel(o.kind);
    if (!res.base && !res.glow) return;
    const flat = o.flat || o.kind === 'rug' || o.kind === 'leafpile';
    const g = meshOf(res, { cast: !flat });
    g.position.set(o.x + o.w / 2, 0, o.y + o.h / 2);
    if (o.kind === 'gnome') g.rotation.y = (hash2(o.x, o.y, 3) - 0.5) * 0.8;
    g.userData.obj = o;
    this.areaGroups.get(area.id).add(g);
    this.objMeshes.set(o.index, g);
    if (o.kind === 'fountain') this.fountain = g;
    if (o.kind === 'building') g.userData.glowMesh = g.children.find((c) => c.userData.glow);
  }

  _farmMeshes() {
    const grp = this.areaGroups.get('outdoor');
    const f = this.world.field;
    const cap = f.w * f.h;
    this.farm = { sig: -1, soil: {}, crops: new Map(), debris: new Map() };
    const soilGeo = new THREE.BoxGeometry(0.94, 0.05, 0.94); soilGeo.translate(0, 0.025, 0);
    for (const w of ['dry', 'wet']) {
      const im = new THREE.InstancedMesh(soilGeo, new THREE.MeshStandardMaterial({ map: this.soilTex[w], roughness: 1 }), cap);
      im.count = 0; im.receiveShadow = true; grp.add(im); this.farm.soil[w] = im;
    }
    const make = (map, key, res) => {
      const im = new THREE.InstancedMesh(res.base, MAT.base, cap);
      im.count = 0; im.castShadow = true; im.receiveShadow = true; grp.add(im); map.set(key, im);
    };
    const STAGES = { turnip: 4, garlic: 4, pumpkin: 5, cranberry: 4 };
    for (const [c, n] of Object.entries(STAGES)) for (let s = 0; s < n; s++) make(this.farm.crops, `${c}:${s}`, cropModel(c, s));
    for (const d of ['weeds', 'twigs', 'bramble']) make(this.farm.debris, d, debrisModel(d));
  }

  _syncFarm(game) {
    const F = this.farm, farm = game.farm, world = this.world;
    let sig = farm.plots.size * 7919 + farm.debris.size * 131;
    for (const [k, p] of farm.plots) sig = (sig * 31 + k * 3 + (p.w ? 1 : 0) + (p.c ? (p.c.charCodeAt(0) + farm.stage(p) * 17) : 0)) | 0;
    for (const [k, d] of farm.debris) sig = (sig * 31 + k * 5 + d.length) | 0;
    if (sig === F.sig) return;
    F.sig = sig;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const counts = new Map();
    const put = (im, x, z, y, rot) => {
      const n = counts.get(im) || 0;
      q.setFromAxisAngle(up, rot);
      m4.compose(p3.set(x, y, z), q, one);
      im.setMatrixAt(n, m4);
      counts.set(im, n + 1);
    };
    for (const [k, p] of farm.plots) {
      const x = k % world.w, y = Math.floor(k / world.w);
      put(F.soil[p.w ? 'wet' : 'dry'], x + 0.5, y + 0.5, 0, 0);
      if (p.c) put(F.crops.get(`${p.c}:${farm.stage(p)}`), x + 0.5, y + 0.5, 0.04, hash2(x, y, 4) * 6.28);
    }
    for (const [k, d] of farm.debris) { const x = k % world.w, y = Math.floor(k / world.w); put(F.debris.get(d), x + 0.5, y + 0.5, 0, hash2(x, y, 6) * 6.28); }
    for (const im of [F.soil.dry, F.soil.wet, ...F.crops.values(), ...F.debris.values()]) {
      im.count = counts.get(im) || 0;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }

  _rig(id, look) {
    let r = this.rigs.get(id);
    if (!r) { r = characterRig(look); this.rigs.set(id, r); this.root.add(r.root); }
    return r;
  }

  // ------------------------------------------------------------------ camera
  _viewDist(area) {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const asp = this.camera.aspect;
    if (!area.outdoor) {
      const byW = (area.w + 1.2) / 2 / (t * asp);
      const byH = ((area.h + 3.2) * Math.sin(ELEV)) / 2 / t;
      return Math.max(8, byW, byH);
    }
    // keep ~8.5 tiles across on narrow phones, ~15 tiles of depth otherwise
    return Math.max(15, 4.3 / (t * asp));
  }

  _camTarget(game) {
    const a = game.playerArea(), p = game.player;
    const d = this._viewDist(a);
    if (!a.outdoor) return { x: a.x + a.w / 2, z: a.y + a.h / 2 + 0.9, d, area: a.id };
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const halfW = d * t * this.camera.aspect, halfD = (d * t) / Math.sin(ELEV) * 0.8;
    let x = p.x / TILE, z = p.y / TILE - 0.3;
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    x = clamp(x, a.x + halfW - 1.5, a.x + a.w - halfW + 1.5);
    z = clamp(z, a.y + halfD - 2.5, a.y + a.h - halfD + 1.5);
    return { x, z, d, area: a.id };
  }

  snap(game) {
    if (game.world !== this.world) this._build(game);
    const t = this._camTarget(game);
    this.target.set(t.x, 0, t.z); this.dist = t.d;
    this._setArea(t.area);
    this._placeCamera();
  }

  updateCamera(dt, game) {
    if (game.world !== this.world) { this.snap(game); return; }
    const t = this._camTarget(game);
    if (t.area !== this.areaId) { this.snap(game); return; }
    const k = 1 - Math.exp(-dt * 6);
    this.target.x += (t.x - this.target.x) * k;
    this.target.z += (t.z - this.target.z) * k;
    this.dist += (t.d - this.dist) * k;
  }

  _setArea(id) {
    if (this.areaId === id) return;
    this.areaId = id;
    for (const [aid, g] of this.areaGroups) g.visible = aid === id;
  }

  _placeCamera(sway = 0) {
    const d = this.dist;
    this.camera.position.set(this.target.x + Math.sin(sway) * d * Math.cos(ELEV), Math.sin(ELEV) * d, this.target.z + Math.cos(sway) * Math.cos(ELEV) * d);
    this.camera.lookAt(this.target.x, 0.6, this.target.z);
    this.cam.x = this.target.x * TILE; this.cam.y = this.target.z * TILE;
  }

  // World px (+ height in tiles) -> CSS px on screen.
  toScreen(px, py, h = 0) {
    const v = new THREE.Vector3(px / TILE, h, py / TILE).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.vw, y: (-v.y * 0.5 + 0.5) * this.vh, behind: v.z > 1 };
  }

  // ------------------------------------------------------------------ per frame
  render(game, dt) {
    this.time += dt;
    if (game.world !== this.world) this.snap(game);
    const area = game.playerArea();
    if (area.id !== this.areaId) this.snap(game);
    this._placeCamera(game.mode === 'title' ? Math.sin(this.time * 0.15) * 0.35 : 0);

    this._syncObjects(game);
    this._syncFarm(game);
    this._syncCharacters(game, area, dt);
    this._syncCats(game, area, dt);
    this._syncFx(game, area, dt);
    this._lighting(game, area);
    this._rainUpdate(game, area, dt);

    this.waterTex.offset.x = (this.time * 0.05) % 1;
    this.waterTex.offset.y = Math.sin(this.time * 0.4) * 0.05;
    if (this.fountain) this.fountain.children[0].position.y = Math.sin(this.time * 3) * 0.004;

    this.gl.info.reset();
    this.composer.render();
    const info = this.gl.info.render;
    this.stats.calls = info.calls; this.stats.tris = info.triangles;
  }

  // Building lights: on at dusk while people are up, off once they go to sleep (each house at its
  // own time, between 21:30 and 22:45); shops close earlier; a gnomed villager's house stays dark.
  _lightsOn(game, def) {
    if (!def) return true;
    if (def.owner) { const n = game.npcs.get(def.owner); if (n && n.gnomed) return false; }
    const m = game.minutes;
    if (m < 12 * 60) return true; // daytime: glass only (the glow material is dark by day anyway)
    let off;
    if (def.id === 'store') off = 19 * 60;
    else if (def.id === 'hall') off = 20 * 60 + 30;
    else if (def.id === 'farmhouse') off = game.playerArea().id === 'farmhouse' ? 99 * 60 : 22 * 60;
    else off = 21 * 60 + 30 + Math.floor(hash2(def.x, def.y, 21) * 6) * 15;
    return m < off;
  }

  _syncObjects(game) {
    const objs = this.world.objects;
    const p = game.player, px = p.x / TILE, pz = p.y / TILE;
    const slope = Math.tan(ELEV);
    const outdoor = this.areaId === 'outdoor' && game.mode === 'play';
    for (const o of objs) {
      const m = this.objMeshes.get(o.index);
      if (!m) { if (!o.removed && o.kind === 'gnome') this._addObject(o); continue; }
      m.visible = !o.removed;
      if (o.kind !== 'building') continue;
      // does the line of sight from the player's head to the camera pass through this building?
      const back = o.y + 0.45, top = 4.2;
      const hides = outdoor && px > o.x - 0.4 && px < o.x + o.w + 0.4 && pz < back + 0.3 && (back - pz) * slope + 1.2 < top;
      const n = o.def.owner && game.npcs.get(o.def.owner);
      const glow = this._lightsOn(game, o.def) ? MAT.glow : MAT.glass;
      for (const c of m.children) {
        if (c.userData.glow) c.material = hides ? MAT.glowFade : glow;
        else c.material = hides ? MAT.fade : MAT.base;
        c.castShadow = !c.userData.glow;
      }
    }
  }

  _animateRig(r, ch, dt, visible) {
    r.root.visible = visible;
    if (!visible) return;
    r.root.position.set(ch.x / TILE, 0, ch.y / TILE);
    const want = DIR_YAW[ch.dir] ?? 0;
    r.heading = angLerp(r.heading, want, 1 - Math.exp(-dt * 14));
    r.root.rotation.y = r.heading;
    const hooded = !!ch.hooded;
    if (hooded !== r.hooded) {
      r.hooded = hooded;
      r.hood.visible = hooded;
      for (const p of [r.armL, r.armR, r.head]) p.visible = !hooded;
      r.body.children.forEach((c) => { if (c.isMesh) c.visible = !hooded; });
      for (const leg of [r.legL, r.legR]) leg.children[0].material = hooded ? MAT.hood : MAT.base;
    }
    const k = 1 - Math.exp(-dt * 12);
    if (ch.moving) {
      const ph = ch.anim * 7 * Math.PI * 0.5;
      const s = Math.sin(ph);
      r.legL.rotation.x = s * 0.7; r.legR.rotation.x = -s * 0.7;
      r.armL.rotation.x = -s * 0.6; r.armR.rotation.x = s * 0.6;
      r.body.position.y = Math.abs(Math.cos(ph)) * 0.05;
      r.body.rotation.x = 0.06;
      if (hooded) r.hood.position.y = r.body.position.y;
    } else {
      const br = Math.sin(this.time * 2.2 + ch.x) * 0.012;
      r.legL.rotation.x = lerp(r.legL.rotation.x, 0, k); r.legR.rotation.x = lerp(r.legR.rotation.x, 0, k);
      r.armL.rotation.x = lerp(r.armL.rotation.x, 0, k); r.armR.rotation.x = lerp(r.armR.rotation.x, 0, k);
      r.body.position.y = lerp(r.body.position.y, br, k);
      r.body.rotation.x = lerp(r.body.rotation.x, 0, k);
      r.hood.position.y = 0;
    }
  }

  _syncCharacters(game, area, dt) {
    const pr = this._rig('player', PLAYER_LOOK);
    this._animateRig(pr, game.player, dt, game.mode !== 'title');
    // fishing pose: rod arm forward
    if (game.fishing && pr.root.visible) { pr.armR.rotation.x = -1.2; pr.armL.rotation.x = -0.9; }
    for (const n of game.npcs.values()) {
      const r = this._rig(n.id, n.def.look);
      const vis = !n.away && n.area === area;
      this._animateRig(r, n, dt, vis);
      // gossip hint bubble + charm glint
      let hs = this.hintSprites.get(n.id);
      const hint = vis && !n.hooded && game.gossipHint(n);
      if (hint && !hs) { hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.emoteTex.talk, depthTest: false })); hs.renderOrder = 9; hs.scale.set(0.5, 0.5, 1); this.fx.add(hs); this.hintSprites.set(n.id, hs); }
      if (hs) {
        hs.visible = !!hint;
        if (hint) hs.position.set(n.x / TILE, 2.0 + Math.sin(this.time * 4) * 0.05, n.y / TILE);
      }
      const charm = vis && !n.hooded && game.mystery.protect[n.id] > 0;
      let gs = r.glint;
      if (charm && !gs) { gs = r.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glintTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); gs.scale.set(0.18, 0.18, 1); r.root.add(gs); gs.position.set(0.24, 0.75, 0.15); }
      if (gs) { gs.visible = !!charm; gs.material.opacity = 0.4 + 0.6 * Math.max(0, Math.sin(this.time * 5 + n.x)); }
    }
  }

  _syncCats(game, area, dt) {
    const world = this.world;
    game.cats.forEach((c, i) => {
      let r = this.catRigs[i];
      if (!r) {
        r = catRig(c.color === 'ginger' ? '#d9893a' : '#8f8a96', c.color === 'ginger' ? '#a8602a' : '#5f5a66');
        r.px = c.x; r.py = c.y; this.catRigs[i] = r; this.root.add(r.root);
      }
      const vis = (c.area || world.areaById.outdoor) === area;
      r.root.visible = vis;
      if (!vis) return;
      const dx = c.x - r.px, dy = c.y - r.py;
      if (Math.hypot(dx, dy) > 0.05) r.heading = angLerp(r.heading, Math.atan2(dx, dy), 1 - Math.exp(-dt * 10));
      r.px = c.x; r.py = c.y;
      r.root.position.set(c.x / TILE, 0, c.y / TILE);
      r.root.rotation.y = r.heading;
      const ph = c.anim * 12;
      r.legs.forEach((l, j) => { l.rotation.x = c.moving ? Math.sin(ph + (j % 2 ? Math.PI : 0) + (j > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
      r.body.rotation.x = c.moving ? 0 : -0.35; // sit
      r.body.position.y = c.moving ? Math.abs(Math.sin(ph)) * 0.02 : -0.02;
      r.tail.rotation.y = Math.sin(this.time * (c.moving ? 6 : 1.5) + i) * 0.5;
    });
  }

  _sprite(list, i, map, opts = {}) {
    let s = list[i];
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: opts.depthTest ?? false, transparent: true, blending: opts.blend || THREE.NormalBlending, depthWrite: false }));
      s.renderOrder = 9; this.fx.add(s); list[i] = s;
    }
    s.material.map = map; s.visible = true;
    return s;
  }

  _syncFx(game, area, dt) {
    const T0 = this.time;
    // cursor
    this.cursor.visible = game.mode === 'play' && game.showCursor;
    if (this.cursor.visible) { const f = game.player.facingTile(); this.cursor.position.set(f.x + 0.5, 0.06, f.y + 0.5); this.cursor.material.opacity = 0.55 + Math.sin(T0 * 6) * 0.2; }
    // exit arrow
    this.exitArrow.visible = !area.outdoor && !!area.mat && game.mode === 'play';
    if (this.exitArrow.visible) { this.exitArrow.position.set(area.mat.x + 0.5, 1.1 + Math.sin(T0 * 4) * 0.12, area.mat.y + 0.4); }
    // objective arrow (when it already points at the doormat, the exit arrow is redundant)
    this._objective(game);
    if (this.goalArrow.visible && this.exitArrow.visible && Math.abs(this.goalArrow.position.x - this.exitArrow.position.x) < 0.1) this.exitArrow.visible = false;
    // emotes
    let i = 0;
    for (const e of game.emotes) {
      const s = this._sprite(this.emoteSprites, i++, this.emoteTex[e.kind] || this.emoteTex.bang);
      s.scale.set(0.5, 0.5, 1);
      s.material.opacity = Math.min(1, e.t * 2);
      s.position.set(e.x / TILE, 1.9 + (1.2 - e.t) * 0.45, e.y / TILE);
    }
    for (; i < this.emoteSprites.length; i++) this.emoteSprites[i].visible = false;
    // sparkles (clues) and dents (foiled attacks)
    i = 0;
    if (area.outdoor) for (const sp of game.mystery.sparkles) {
      const s = this._sprite(this.sparkSprites, i++, this.sparkTex[(Math.floor(T0 * 6) + sp.x) % 4], { depthTest: true, blend: THREE.AdditiveBlending });
      s.scale.set(0.55, 0.55, 1);
      s.position.set(sp.x + 0.5, 0.45 + Math.sin(T0 * 3 + sp.y) * 0.08, sp.y + 0.5);
    }
    for (; i < this.sparkSprites.length; i++) this.sparkSprites[i].visible = false;
    i = 0;
    if (area.outdoor) for (const a of game.mystery.attacks) {
      if (!(a.blocked && game.day - a.night <= 2)) continue;
      let d = this.dents[i];
      if (!d) { d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.dentTex, transparent: true, depthWrite: false })); d.rotation.x = -Math.PI / 2; this.fx.add(d); this.dents[i] = d; }
      d.visible = true; d.position.set(a.x + 0.5, 0.02, a.y + 0.5); i++;
    }
    for (; i < this.dents.length; i++) this.dents[i].visible = false;
    // fishing
    const F = game.fishing;
    this.line.visible = this.bobber.visible = this.ripple.visible = !!F;
    if (F) {
      const p = game.player, [dx, dz] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
      const hx = p.x / TILE + dx * 0.35 + dz * 0.2, hz = p.y / TILE + dz * 0.35 - dx * 0.2, hy = 1.35;
      const dip = F.phase === 'bite' ? 0.06 + Math.abs(Math.sin(T0 * 18)) * 0.05 : 0;
      const bx = F.tile.x + 0.5, bz = F.tile.y + 0.5, by = WATER_Y + Math.sin(T0 * 3) * 0.02 - dip;
      const pts = this.line.geometry.attributes.position;
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        const x = lerp(hx, bx, t), z = lerp(hz, bz, t), y = lerp(hy, by, t) + Math.sin(Math.PI * t) * 0.5 - t * t * 0.3;
        pts.setXYZ(j, x, y, z);
      }
      pts.needsUpdate = true;
      this.bobber.position.set(bx, by, bz);
      this.ripple.position.set(bx, WATER_Y + 0.01, bz);
      const rs = 1 + ((T0 * (F.phase === 'bite' ? 2.5 : 0.8)) % 1) * 2.2;
      this.ripple.scale.set(rs, rs, rs);
      this.ripple.material.opacity = 0.6 * (1 - (rs - 1) / 2.2);
    }
  }

  _objective(game) {
    this.arrowPos = null;
    this.goalArrow.visible = false;
    this.edge.style.display = 'none';
    if (game.mode !== 'play') return;
    const tile = game.tutTarget();
    if (!tile) return;
    const bob = Math.sin(this.time * 5) * 0.12;
    const wx = tile.x + 0.5, wz = tile.y + 0.5, wy = 1.9;
    const v = new THREE.Vector3(wx, wy, wz).project(this.camera);
    const sx = (v.x * 0.5 + 0.5) * this.vw, sy = (-v.y * 0.5 + 0.5) * this.vh;
    const m = 40;
    const on = v.z < 1 && sx > m && sx < this.vw - m && sy > m + 20 && sy < this.vh - m;
    if (on) {
      this.goalArrow.visible = true;
      this.goalArrow.position.set(wx, wy + bob, wz);
      const top = this.toScreen(wx * TILE, wz * TILE, wy + 0.35 + bob);
      this.arrowPos = { x: top.x, y: top.y - 4, edge: false };
      return;
    }
    // edge pointer: direction from the screen centre towards the target
    const c = this.toScreen(this.target.x * TILE, this.target.z * TILE, 0.6);
    let dx = sx - c.x, dy = sy - c.y;
    if (v.z > 1) { dx = -dx; dy = -dy; }
    const ang = Math.atan2(dy, dx);
    // keep clear of the HUD card (top) and the hotbar (bottom)
    const top = 60, bottom = this.vh - 96, cy = (top + bottom) / 2;
    const rx = this.vw / 2 - 26, ry = (bottom - top) / 2;
    const kx = Math.abs(Math.cos(ang)) > 1e-4 ? rx / Math.abs(Math.cos(ang)) : 1e9, ky = Math.abs(Math.sin(ang)) > 1e-4 ? ry / Math.abs(Math.sin(ang)) : 1e9;
    const r = Math.min(kx, ky);
    const px = this.vw / 2 + Math.cos(ang) * r, py = cy + Math.sin(ang) * r;
    this.edge.style.display = 'block';
    this.edge.style.left = `${px}px`; this.edge.style.top = `${py}px`;
    this.edge.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
    this.arrowPos = { x: px - Math.cos(ang) * 60, y: py - Math.sin(ang) * 34, edge: true };
  }

  _lighting(game, area) {
    const m = game.minutes;
    let dark = darkness(m);
    const out = area.outdoor;
    const rain = game.weather === 'rain', cloudy = game.weather === 'cloudy';
    // sun arc: rises in the east (+x) at 6:00, sets in the west at 20:00, always from the south-ish
    const dayT = THREE.MathUtils.clamp((m - 6 * 60) / (14 * 60), 0, 1);
    const elev = Math.sin(dayT * Math.PI) * 0.9 + 0.25;
    const az = (0.5 - dayT) * 2.2;
    const tx = this.target.x, tz = this.target.z;
    this.sun.position.set(tx + Math.sin(az) * 22, Math.sin(elev) * 26 + 4, tz + 10 + Math.cos(az) * 6);
    this.sun.target.position.set(tx, 0, tz);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(m - 18 * 60) / 150, 0, 1);
    const dawn = THREE.MathUtils.clamp(1 - Math.abs(m - 6.5 * 60) / 60, 0, 1);
    const warm = Math.max(dusk, dawn);
    const sunCol = new THREE.Color('#fff1dc').lerp(new THREE.Color('#ff9a52'), warm * 0.8).lerp(new THREE.Color('#7f8fc8'), THREE.MathUtils.clamp((dark - 0.5) * 2.2, 0, 1));
    const wx = rain ? 0.4 : cloudy ? 0.62 : 1;
    let sunI = lerp(2.7, 0.35, Math.min(1, dark * 1.12)) * wx;
    let hemiI = lerp(1.25, 0.32, dark) * (rain ? 0.85 : 1);
    const sky = new THREE.Color(rain ? '#8d9aa3' : cloudy ? '#a9b6bc' : '#a7c4d3')
      .lerp(new THREE.Color('#e0905e'), warm * (rain ? 0.2 : 0.55))
      .lerp(new THREE.Color('#151b33'), Math.min(1, dark * 1.05));
    if (!out) { // indoors: dimmed daylight through the windows, warm room light does the rest
      dark *= 0.55;
      sunI *= 0.25; hemiI = lerp(0.85, 0.35, dark * 1.6);
      this.scene.background = new THREE.Color('#140f12');
      this.scene.fog.near = 200; this.scene.fog.far = 300;
    } else {
      this.scene.background = sky;
      this.scene.fog.color.copy(sky);
      this.scene.fog.near = this.dist + (rain ? 2 : 10); this.scene.fog.far = this.dist + (rain ? 28 : 45);
    }
    this.sun.color.copy(sunCol); this.sun.intensity = sunI;
    this.sun.castShadow = sunI > 0.2;
    this.hemi.intensity = hemiI;
    this.hemi.color.set(dark > 0.4 ? '#5a6aa0' : '#c8dcea');
    this.hemi.groundColor.set(out ? '#5d5030' : '#4a3628');
    // windows, lanterns
    const night = THREE.MathUtils.clamp((darkness(m) - 0.25) * 2.5, 0, 1);
    MAT.glow.emissiveIntensity = night * 1.6;
    if (this.roomWalls) { const rw = this.roomWalls.get(area.id); if (rw) { const map = darkness(m) > 0.5 ? rw.night : rw.day; if (rw.mat.map !== map) { rw.mat.map = map; rw.mat.needsUpdate = true; } } }
    this.bloom.strength = 0.18 + night * 0.55;
    // point-light pool: nearest lamps (outdoors when dark) or the room light (indoors)
    const cands = [];
    for (const L of this.world.lights) {
      if (L.indoor ? L.area !== area.id : !out) continue;
      if (L.indoor) { // room lamp follows the building's lights (only once it is dark outside)
        const b = this.world.buildings.find((o) => o.def.interior === L.area);
        if (b && darkness(m) > 0.3 && !this._lightsOn(game, b.def)) continue;
      }
      if (!L.indoor && night <= 0.02) continue;
      const x = L.x / TILE, z = L.y / TILE;
      cands.push({ x, z, y: L.indoor ? 1.9 : 2.1, d: (x - tx) ** 2 + (z - tz) ** 2, indoor: L.indoor });
    }
    cands.sort((a, b) => a.d - b.d);
    this.pool.forEach((l, i) => {
      const c = cands[i];
      l.visible = !!c;
      if (!c) return;
      l.position.set(c.x, c.y, c.z + (c.indoor ? 0.6 : 0.2));
      if (c.indoor) { l.intensity = 5 + dark * 10; l.distance = 12; l.color.set('#ffcf8a'); }
      else { l.intensity = night * 9; l.distance = 8; l.color.set('#ffbf6a'); }
    });
    const p = game.player;
    this.lantern.position.set(p.x / TILE + 0.5, 2.8, p.y / TILE + 1.2);
    this.lantern.intensity = game.mode === 'play' && out ? THREE.MathUtils.clamp((dark - 0.3) * 2, 0, 1) * 2.2 : 0;
    // keep the shadow frustum centred on the view
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  _rainUpdate(game, area, dt) {
    const on = area.outdoor && game.weather === 'rain';
    this.rain.visible = on;
    if (!on) return;
    const P = this.rainPos, S = this.rainSeed, n = S.length / 3;
    const cx = this.target.x, cz = this.target.z;
    for (let i = 0; i < n; i++) {
      const fall = (this.time * (9 + S[i * 3 + 2] * 4) + S[i * 3 + 2] * 10) % 10;
      const x = cx + (S[i * 3] - 0.5) * 34 - fall * 0.12, z = cz + (S[i * 3 + 1] - 0.5) * 28, y = 10 - fall;
      P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
      P[i * 6 + 3] = x + 0.04; P[i * 6 + 4] = y + 0.35; P[i * 6 + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
}
