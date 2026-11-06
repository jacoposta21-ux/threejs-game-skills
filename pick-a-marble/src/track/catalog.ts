import * as THREE from 'three';
import {
  STD_ALPHA,
  STD_SHAPE,
  TUBE_ALPHA,
  Turtle,
  channelProfile,
  laneProfile,
  latheSurface,
  profileCap,
  resample,
  sampleFn,
  smooth,
  smoother,
  window01,
  type ChannelShape,
  type V2,
} from './geometry';
import {
  V,
  applyDrop,
  arch,
  box,
  channel,
  cyl,
  floorDecal,
  floorY,
  framesFromUps,
  group,
  inPort,
  laneFrom,
  lanePts,
  outPort,
  profiled,
  shear,
  sphere,
  straightPoints,
  tagMesh,
  transport,
  tubeRings,
  tubeShape,
  wideShape,
} from './pieceKit';
import type { ColliderSpec, LaneDef, MoverDef, PieceBuild, PieceDef, ZoneDef } from './types';

const PI = Math.PI;
const X = V(1, 0, 0);

function emptyBuild(visual: THREE.Object3D): PieceBuild {
  return { visual, surfaces: [], colliders: [], lanes: [], zones: [], movers: [], spawns: [] };
}

function zone(min: THREE.Vector3, max: THREE.Vector3, effect: ZoneDef['effect']): ZoneDef {
  return { min, max, effect };
}

/* ------------------------------------------------------------------ basic */

function straight(id: string, name: string, cells: number, desc: string): PieceDef {
  const len = cells * 4;
  const dy = -0.25 * cells;
  return {
    id,
    name,
    category: 'basic',
    desc,
    unlock: null,
    ports: [inPort(0, 0, 0), outPort(len, dy, 0)],
    defaultColor: '#3a86ff',
    size: `${cells}×1`,
    build: () => {
      const frames = shear(straightPoints(len, dy));
      const ch = channel(frames);
      return { ...emptyBuild(group(ch.mesh)), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
    },
  };
}

function curve(id: string, name: string, radius: number, right: boolean, dy: number, bank: number, desc: string): PieceDef {
  const s = right ? 1 : -1;
  return {
    id,
    name,
    category: 'basic',
    desc,
    unlock: null,
    ports: [inPort(0, 0, 0), outPort(radius, dy, s * radius, 0, s)],
    defaultColor: '#3a86ff',
    size: `${Math.ceil(radius / 4) + 0}×${Math.ceil(radius / 4)}`,
    tags: ['curve'],
    build: () => {
      const t = new Turtle(0.2).yaw(radius, (s * PI) / 2);
      const frames = shear(applyDrop(t.pts, dy), (f) => s * bank * Math.sin(PI * f));
      const lip = THREE.MathUtils.degToRad(radius < 4 ? 120 : 112);
      const ch = channel(frames, (f) => ({ rho: 1, flat: 0, alpha: STD_ALPHA + (lip - STD_ALPHA) * Math.sin(PI * f) ** 2 }));
      return { ...emptyBuild(group(ch.mesh)), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
    },
  };
}

const sCurve: PieceDef = {
  id: 's_curve',
  name: 'S-Curve',
  category: 'basic',
  desc: 'Swerves one lane to the side. Mirror it to swerve the other way.',
  unlock: null,
  ports: [inPort(0, 0, 0), outPort(8, -0.5, 4)],
  mirrorable: true,
  defaultColor: '#3a86ff',
  size: '2×2',
  tags: ['curve'],
  build: () => {
    const th = 2 * Math.atan(0.5);
    const t = new Turtle(0.2).yaw(5, th).yaw(5, -th);
    const frames = shear(applyDrop(t.pts, -0.5), (f) => 0.18 * Math.sin(2 * PI * f));
    const ch = channel(frames);
    return { ...emptyBuild(group(ch.mesh)), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
  },
};

const wideCurve: PieceDef = {
  id: 'wide_curve',
  name: 'Wide U-Turn',
  category: 'basic',
  desc: 'A wide banked 180° hairpin. Marbles fan out and ride the wall.',
  unlock: null,
  ports: [inPort(0, 0, 0), outPort(0, -0.75, 8, -1, 0)],
  mirrorable: true,
  defaultColor: '#3a86ff',
  size: '2×3',
  tags: ['curve'],
  build: () => {
    const t = new Turtle(0.2).yaw(4, PI);
    const frames = shear(applyDrop(t.pts, -0.75), (f) => 0.32 * Math.sin(PI * f));
    const ch = channel(frames, wideShape(1.2, 0.18, 0.82, 1, THREE.MathUtils.degToRad(88)));
    return { ...emptyBuild(group(ch.mesh)), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
  },
};

/* --------------------------------------------------------------- vertical */

function ramp(id: string, name: string, dy: number, desc: string, unlock: PieceDef['unlock'] = null): PieceDef {
  return {
    id,
    name,
    category: 'vertical',
    desc,
    unlock,
    ports: [inPort(0, 0, 0), outPort(8, dy, 0)],
    defaultColor: '#ff5d8f',
    size: '2×1',
    tags: dy > 0 ? ['uphill'] : ['ramp'],
    build: () => {
      const frames = shear(straightPoints(8, dy, 0.2));
      const ch = channel(frames);
      return { ...emptyBuild(group(ch.mesh)), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
    },
  };
}

const verticalDrop: PieceDef = {
  id: 'drop',
  name: 'Vertical Drop',
  category: 'vertical',
  desc: 'A glass chute that plunges five levels straight down.',
  unlock: null,
  ports: [inPort(0, 0, 0), outPort(4, -5, 0)],
  defaultColor: '#ff5d8f',
  size: '1×1',
  tags: ['drop'],
  build: () => {
    const t = new Turtle(0.12).line(0.4).pitch(0.8, -PI / 2).line(1.9).pitch(2.3, PI / 2).line(0.5);
    const frames = framesFromUps(t.pts, t.ups);
    const shape = tubeShape(0.1, 0.9);
    const ch = channel(frames, shape, ['glass', 'glass']);
    ch.mesh.castShadow = false;
    return {
      ...emptyBuild(group(ch.mesh, tubeRings(frames, 0.9, 1, 0.12, 0.88))),
      surfaces: [ch.surface],
      lanes: [laneFrom(frames, 0, 1)],
    };
  },
};

const halfPipe: PieceDef = {
  id: 'half_pipe',
  name: 'Half-Pipe',
  category: 'vertical',
  desc: 'A huge rounded trough. Marbles carve up the walls side to side.',
  unlock: null,
  ports: [inPort(0, 0, 0), outPort(12, -1, 0)],
  defaultColor: '#ff5d8f',
  size: '3×2',
  extent: 3.2,
  build: () => {
    const pts = straightPoints(12, -1, 0.2, (f) => 1.5 * Math.sin(2 * PI * f) * Math.sin(PI * f) ** 2);
    const frames = shear(pts, (f) => -0.25 * Math.sin(2 * PI * f) * Math.sin(PI * f));
    const shape = (f: number): ChannelShape => {
      const k = smooth(Math.min(f / 0.28, (1 - f) / 0.28));
      return { rho: 1 + 1.7 * k, flat: 0, alpha: STD_ALPHA + THREE.MathUtils.degToRad(8) * k };
    };
    const ch = channel(frames, shape);
    return { ...emptyBuild(group(ch.mesh)), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
  },
};

const loop: PieceDef = {
  id: 'loop',
  name: '360° Loop',
  category: 'vertical',
  desc: 'A full vertical loop with a built-in kicker so marbles make it over the top.',
  unlock: { level: 2, coins: 150 },
  ports: [inPort(0, 0, 0), outPort(8, -0.5, 4)],
  mirrorable: true,
  defaultColor: '#ff5d8f',
  size: '2×2',
  tags: ['loop'],
  build: () => {
    const t = new Turtle(0.12).line(2.6).pitch(2.3, 2 * PI).line(5.4);
    const n = t.pts.length;
    // cumulative arc length for the lateral shift
    const cum = [0];
    for (let i = 1; i < n; i += 1) cum.push(cum[i - 1] + t.pts[i].distanceTo(t.pts[i - 1]));
    const total = cum[n - 1];
    const pts = t.pts.map((p, i) => {
      const f = cum[i] / total;
      return V(p.x, p.y - 0.5 * smooth(f), p.z + 4 * smooth(f));
    });
    const frames = framesFromUps(pts, t.ups);
    const ch = channel(frames, tubeShape(0.1, 0.8), ['glass', 'glass']);
    ch.mesh.castShadow = false;
    const visual = group(ch.mesh, tubeRings(frames, 1.1, 1, 0.12, 0.78));
    return {
      ...emptyBuild(visual),
      surfaces: [ch.surface],
      lanes: [laneFrom(frames, 0, 1)],
      zones: [
        zone(V(0.1, -0.5, -1.3), V(1.8, 1.6, 1.3), { type: 'kick', dir: X.clone(), speed: 15.5 }),
        zone(V(6.2, -1.2, 2.6), V(8, 1.2, 5.4), { type: 'tag', tag: 'loop' }),
        zone(V(0.2, 0.5, -1.5), V(5.2, 6.5, 5.5), { type: 'sustain', speed: 9.5 }),
      ],
    };
  },
};

const corkscrew: PieceDef = {
  id: 'corkscrew',
  name: 'Corkscrew',
  category: 'vertical',
  desc: 'A glass tube that corkscrews two and a quarter turns around a pole. Fast and dizzying.',
  unlock: { level: 3, coins: 220 },
  ports: [inPort(0, 0, 0), outPort(2, -6, 2, 0, 1)],
  mirrorable: true,
  defaultColor: '#ff5d8f',
  size: '1×1',
  tags: ['spiral'],
  build: () => {
    const R = 2;
    const turns = 4.5 * PI;
    const pts = sampleFn((f) => {
      const ph = turns * f;
      return V(R * Math.sin(ph), -6 * smooth(f), R * (1 - Math.cos(ph)));
    }, 200);
    const frames = shear(pts, (f) => 0.3 * smooth(Math.min(f / 0.08, (1 - f) / 0.08)));
    const ch = channel(frames, tubeShape(0.07, 0.93), ['glass', 'glass']);
    ch.mesh.castShadow = false;
    const pole = cyl(0.35, 7.6, ['body'], V(0, -2.6, 2));
    const cap = sphere(0.45, ['accent'], V(0, 1.2, 2));
    return {
      ...emptyBuild(group(ch.mesh, tubeRings(frames, 1.3, 1, 0.07, 0.93), pole, cap)),
      surfaces: [ch.surface],
      lanes: [laneFrom(frames, 0, 1)],
    };
  },
};

const spiralRamp: PieceDef = {
  id: 'spiral',
  name: 'Spiral Ramp',
  category: 'vertical',
  desc: 'A banked helix that winds one and a quarter turns downward.',
  unlock: { level: 3, coins: 200 },
  ports: [inPort(0, 0, 0), outPort(2, -3.5, 2, 0, 1)],
  mirrorable: true,
  defaultColor: '#ff5d8f',
  size: '1×1',
  tags: ['curve', 'spiral'],
  build: () => {
    const R = 2;
    const turns = 2.5 * PI;
    const pts = sampleFn((f) => {
      const ph = turns * f;
      return V(R * Math.sin(ph), -3.5 * smooth(f), R * (1 - Math.cos(ph)));
    }, 120);
    const frames = shear(pts, (f) => 0.22 * smooth(Math.min(f / 0.12, (1 - f) / 0.12)));
    const lip = THREE.MathUtils.degToRad(118);
    const ch = channel(frames, (f) => ({ rho: 1, flat: 0, alpha: STD_ALPHA + (lip - STD_ALPHA) * smooth(Math.min(f / 0.1, (1 - f) / 0.1)) }));
    const post = cyl(0.25, 4.4, ['white'], V(0, -1.4, 2));
    return { ...emptyBuild(group(ch.mesh, post)), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
  },
};

/* ---------------------------------------------------------------- special */

function funnel(id: string, name: string, kind: 'large' | 'small' | 'vortex'): PieceDef {
  const big = kind !== 'small';
  const R = big ? 5.6 : 3.6;
  const c = big ? V(4, 0, 4) : V(2, 0, 2);
  const lipTop = -1.35;
  const wallTop = lipTop + 0.93;
  const rimY = -1.85;
  const holeR = 0.85;
  const holeY = kind === 'small' ? -3.8 : kind === 'large' ? -4.3 : -4.8;
  const exit = big ? V(8, holeY - 2.7, 4) : V(2, holeY - 2.7, 6);
  return {
    id,
    name,
    category: 'special',
    desc:
      kind === 'vortex'
        ? 'A gravity-well vortex. Marbles orbit faster and faster before dropping through.'
        : big
          ? 'A wide funnel. Marbles enter tangentially and spiral down to the hole.'
          : 'A compact funnel that swirls marbles into a chute below.',
    unlock: kind === 'small' ? null : kind === 'large' ? { level: 2, coins: 160 } : { level: 4, coins: 300 },
    ports: [inPort(0, 0, 0), big ? outPort(exit.x, exit.y, exit.z) : outPort(exit.x, exit.y, exit.z, 0, 1)],
    defaultColor: kind === 'vortex' ? '#8338ec' : '#06d6a0',
    size: big ? '3×3' : '2×2',
    tags: ['funnel'],
    build: () => {
      // entry channel
      const entryLen = c.x + 0.4;
      const entryY = (x: number): number => -0.2 * smooth(x / 1.3) - 0.8 * smooth((x - 1.3) / (entryLen - 1.3));
      const entryFrames = shear(sampleFn((f) => V(entryLen * f, entryY(entryLen * f), 0), Math.ceil(entryLen / 0.2) + 1));
      const entry = channel(entryFrames);
      // funnel bowl profile (r, y)
      const prof: V2[] = [];
      const steps = 16;
      for (let i = 0; i <= steps; i += 1) {
        const r = holeR + ((R - holeR) * i) / steps;
        let y: number;
        if (kind === 'vortex') {
          const k = (1 / r - 1 / R) / (1 / holeR - 1 / R);
          y = rimY + (holeY - rimY) * Math.pow(k, 0.8);
        } else {
          const k = (r - holeR) / (R - holeR);
          y = holeY + (rimY - holeY) * Math.pow(k, 1.25);
        }
        prof.push([r, y]);
      }
      prof.push([R, lipTop]);
      const colliderProf: V2[] = [...prof, [R, wallTop], [R + 0.18, wallTop]];
      prof.push([R + 0.18, lipTop]);
      const bowl = latheSurface(c, prof, 48);
      const bowlCollider = latheSurface(c, colliderProf, 48);
      // vertex colour stripes for the visual
      const bowlGeo = new THREE.BufferGeometry();
      bowlGeo.setAttribute('position', new THREE.Float32BufferAttribute(bowl.positions, 3));
      bowlGeo.setIndex(bowl.indices);
      const colors: number[] = [];
      for (let i = 0; i < bowl.positions.length; i += 3) {
        const x = bowl.positions[i] - c.x;
        const z = bowl.positions[i + 2] - c.z;
        const a = Math.atan2(z, x);
        const r = Math.hypot(x, z);
        const stripe = kind === 'vortex' ? Math.sin(a * 6 + r * 2.2) : Math.sin(a * 8);
        const v = stripe > 0 ? 1 : 0.72;
        colors.push(v, v, v);
      }
      bowlGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      bowlGeo.computeVertexNormals();
      const bowlMesh = tagMesh(bowlGeo, ['stripes']);
      // underside shell
      const under = latheSurface(c.clone().add(V(0, -0.12, 0)), prof.slice(0, steps + 1).map(([r, y]) => [r + 0.05, y] as V2), 48);
      const underGeo = new THREE.BufferGeometry();
      underGeo.setAttribute('position', new THREE.Float32BufferAttribute(under.positions, 3));
      underGeo.setIndex(under.indices);
      underGeo.computeVertexNormals();
      const underMesh = tagMesh(underGeo, ['body']);
      const rim = tagMesh(new THREE.TorusGeometry(R + 0.1, 0.1, 8, 64), ['accent']);
      rim.rotation.x = PI / 2;
      rim.position.set(c.x, wallTop, c.z);
      const band = tagMesh(new THREE.CylinderGeometry(R + 0.04, R + 0.04, wallTop - lipTop, 56, 1, true), ['glass']);
      band.position.set(c.x, (wallTop + lipTop) / 2, c.z);
      band.castShadow = false;
      // exit chute: start below hole, vertical, bend to horizontal
      const t = new Turtle(0.12);
      if (big) {
        t.pos.set(c.x - 1, holeY + 0.05, c.z);
        t.fwd.set(0, -1, 0);
        t.up.set(1, 0, 0);
      } else {
        t.pos.set(c.x, holeY + 0.05, c.z - 1);
        t.fwd.set(0, -1, 0);
        t.up.set(0, 0, 1);
      }
      t.pts.length = 0;
      t.ups.length = 0;
      t.pts.push(t.pos.clone());
      t.ups.push(t.up.clone());
      t.line(0.45).pitch(2.3, PI / 2).line(2.7);
      // snap the end exactly onto the port
      const endDelta = exit.clone().sub(t.pts[t.pts.length - 1]);
      t.pts.forEach((p, i) => p.addScaledVector(endDelta, i / (t.pts.length - 1)));
      const chuteFrames = framesFromUps(t.pts, t.ups);
      const chuteShape = (f: number): ChannelShape => {
        const k = smooth((1 - f) / 0.18);
        return { rho: 1, flat: 0, alpha: STD_ALPHA + (TUBE_ALPHA - STD_ALPHA) * k };
      };
      const chute = channel(chuteFrames, chuteShape, ['glass', 'glass']);
      chute.mesh.castShadow = false;
      // supports for the bowl
      const legs = new THREE.Group();
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * PI * 2 + PI / 4;
        legs.add(cyl(0.1, 1.0, ['white'], V(c.x + Math.cos(a) * R * 0.75, rimY - 0.75, c.z + Math.sin(a) * R * 0.75)));
      }
      // progress lane: entry → spiral → chute
      const spiral: THREE.Vector3[] = [];
      const startA = Math.atan2(0 - c.z, entryLen - c.x);
      const r0 = Math.hypot(entryLen - c.x, c.z);
      const turns = kind === 'vortex' ? 3 : big ? 2.5 : 1.75;
      for (let i = 1; i <= 60; i += 1) {
        const f = i / 60;
        const r = r0 + (holeR - r0) * f;
        const a = startA + turns * 2 * PI * f;
        const pr = prof.reduce((best, p) => (Math.abs(p[0] - r) < Math.abs(best[0] - r) ? p : best), prof[0]);
        spiral.push(V(c.x + Math.cos(a) * r, pr[1], c.z + Math.sin(a) * r));
      }
      const lanePoints = [...entryFrames.map((f) => f.p), ...spiral, ...chuteFrames.map((f) => f.p)];
      const lanes: LaneDef[] = [lanePts(lanePoints, 0, 1)];
      return {
        ...emptyBuild(group(entry.mesh, bowlMesh, underMesh, rim, band, chute.mesh, legs)),
        surfaces: [entry.surface, bowlCollider, chute.surface],
        lanes,
        zones: [
          zone(V(c.x - 1.5, holeY - 0.6, c.z - 1.5), V(c.x + 1.5, holeY + 0.4, c.z + 1.5), { type: 'tag', tag: 'funnel' }),
          zone(V(c.x - R, holeY - 0.2, c.z - R), V(c.x + R, wallTop, c.z + R), { type: 'drag', k: kind === 'vortex' ? 0.22 : kind === 'large' ? 0.18 : 0.12 }),
        ],
      };
    },
  };
}

const tube: PieceDef = {
  id: 'tube',
  name: 'Glass Tube',
  category: 'special',
  desc: 'A transparent tube with a dip in the middle. Nothing escapes.',
  unlock: { level: 2, coins: 120 },
  ports: [inPort(0, 0, 0), outPort(12, -1, 0)],
  defaultColor: '#00b4d8',
  size: '3×1',
  build: () => {
    const frames = shear(straightPoints(12, -1, 0.2, () => 0, (f) => -0.9 * Math.sin(PI * f) ** 2));
    const ch = channel(frames, tubeShape(0.08, 0.92), ['glass', 'glass']);
    ch.mesh.castShadow = false;
    return { ...emptyBuild(group(ch.mesh, tubeRings(frames, 1.2, 1, 0.08, 0.92))), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)] };
  },
};

const splitter: PieceDef = {
  id: 'splitter',
  name: 'Splitter',
  category: 'special',
  desc: 'A knife-edge divider that sends marbles left or right. Two exits!',
  unlock: null,
  ports: [inPort(0, 0, 0), outPort(8, -0.5, -4), outPort(8, -0.5, 4)],
  defaultColor: '#ffbe0b',
  size: '2×3',
  tags: ['splitter'],
  build: () => {
    const frames = shear(straightPoints(8, -0.5, 0.16));
    const d = (f: number): number => 4 * smoother(f);
    const ch = profiled(frames, (f) => laneProfile(d(f), 0.95 * smooth(f / 0.3)));
    return {
      ...emptyBuild(group(ch.mesh)),
      surfaces: [ch.surface],
      lanes: [laneFrom(frames, 0, 1, (f) => -d(f)), laneFrom(frames, 0, 2, d)],
    };
  },
};

const merge: PieceDef = {
  id: 'merge',
  name: 'Merge',
  category: 'special',
  desc: 'Joins two tracks into one. Expect bumping at the junction.',
  unlock: null,
  ports: [inPort(0, 0, -4), inPort(0, 0, 4), outPort(8, -0.5, 0)],
  defaultColor: '#ffbe0b',
  size: '2×3',
  tags: ['merge'],
  build: () => {
    const frames = shear(straightPoints(8, -0.5, 0.16));
    const d = (f: number): number => 4 * smoother(1 - f);
    const ch = profiled(frames, (f) => laneProfile(d(f), 0.95 * smooth((1 - f) / 0.3)));
    return {
      ...emptyBuild(group(ch.mesh)),
      surfaces: [ch.surface],
      lanes: [laneFrom(frames, 0, 2, (f) => -d(f)), laneFrom(frames, 1, 2, d)],
    };
  },
};

const booster: PieceDef = {
  id: 'booster',
  name: 'Speed Booster',
  category: 'special',
  desc: 'Glowing chevrons fire marbles forward up to boost speed.',
  unlock: null,
  ports: [inPort(0, 0, 0), outPort(4, -0.25, 0)],
  defaultColor: '#06d6a0',
  size: '1×1',
  tags: ['booster'],
  build: () => {
    const frames = shear(straightPoints(4, -0.25, 0.15));
    const ch = channel(frames, () => STD_SHAPE, ['dark', 'body']);
    const chev = floorDecal(frames, 0.04, 0.96, 0.62, ['chevron'], [3, 1], 0.02, '#00f5d4');
    chev.name = 'chevrons';
    const strips = group(box(3.6, 0.08, 0.08, ['glow'], V(2, 0.82 - 0.12, -0.99), '#00f5d4'), box(3.6, 0.08, 0.08, ['glow'], V(2, 0.82 - 0.12, 0.99), '#00f5d4'));
    return {
      ...emptyBuild(group(ch.mesh, chev, strips)),
      surfaces: [ch.surface],
      lanes: [laneFrom(frames, 0, 1)],
      zones: [zone(V(0.15, -1, -1.2), V(3.85, 1.6, 1.2), { type: 'boost', dir: X.clone(), speed: 14, accel: 50 })],
    };
  },
};

const jumpPlatform: PieceDef = {
  id: 'jump',
  name: 'Jump Platform',
  category: 'special',
  desc: 'A kicker ramp that launches marbles across a gap onto a catch tray.',
  unlock: { level: 2, coins: 140 },
  ports: [inPort(0, 0, 0), outPort(12, -1.5, 0)],
  defaultColor: '#fb5607',
  size: '3×1',
  tags: ['jump'],
  build: () => {
    const lip = 3.2;
    const kick = (x: number): number => (x <= 1.2 ? 0 : 0.5 * ((x - 1.2) / 2) ** 2);
    const kPts = sampleFn((f) => V(lip * f, kick(lip * f), 0), 30);
    const kFrames = shear(kPts);
    const kicker = channel(kFrames);
    const landY = (x: number): number => -0.5 - 1.0 * smooth((x - 6) / 6);
    const lFrames = shear(sampleFn((f) => V(6 + 6 * f, landY(6 + 6 * f), 0), 34));
    const landing = channel(lFrames, (f) => {
      const k = 1 - smooth((f - 0.35) / 0.4);
      return { rho: 1 + 0.25 * k, flat: 1.4 * k, alpha: STD_ALPHA };
    });
    const capProf = channelProfile({ rho: 1.25, flat: 1.4, alpha: STD_ALPHA });
    const cap = tagMesh(profileCap(lFrames[0], capProf, true), ['body']);
    const target = V(8.2, landY(8.2) + 0.3, 0);
    const lipMark = box(0.25, 0.06, 2.0, ['hazard'], V(lip - 0.15, kick(lip) + 0.04, 0));
    lipMark.rotation.z = Math.atan(0.5);
    // flight arc for progress
    const arc: THREE.Vector3[] = [];
    for (let i = 1; i < 10; i += 1) {
      const f = i / 10;
      arc.push(V(lip + (target.x - lip) * f, kick(lip) + (target.y - kick(lip)) * f + 1.2 * Math.sin(PI * f), 0));
    }
    return {
      ...emptyBuild(group(kicker.mesh, landing.mesh, cap, lipMark)),
      surfaces: [kicker.surface, landing.surface],
      colliders: [{ type: 'cuboid', center: V(5.94, landY(6) + 0.4, 0), half: V(0.06, 0.45, 2.2) }],
      lanes: [lanePts([...kFrames.map((f) => f.p), ...arc, ...lFrames.map((f) => f.p)], 0, 1)],
      zones: [
        zone(V(0.15, -0.6, -1.3), V(1.1, 1.5, 1.3), { type: 'kick', dir: X.clone(), speed: 7.5 }),
        zone(V(lip - 0.55, -0.6, -1.3), V(lip + 0.15, 1.5, 1.3), { type: 'launch', target, time: 0.55, sfx: 'jump' }),
        zone(V(7, -2.5, -2.5), V(10, 0.5, 2.5), { type: 'tag', tag: 'jump' }),
      ],
    };
  },
};

const gapJump: PieceDef = {
  id: 'gap_jump',
  name: 'Gap Jump',
  category: 'special',
  desc: 'The track simply stops. Marbles fly the gap and land lower down.',
  unlock: { level: 3, coins: 160 },
  ports: [inPort(0, 0, 0), outPort(8, -1.5, 0)],
  defaultColor: '#fb5607',
  size: '2×1',
  tags: ['jump'],
  build: () => {
    const aFrames = shear(straightPoints(3, -0.25, 0.2));
    const a = channel(aFrames);
    const landY = (x: number): number => -1.25 - 0.25 * smooth((x - 5) / 3);
    const bFrames = shear(sampleFn((f) => V(5 + 3 * f, landY(5 + 3 * f), 0), 18));
    const b = channel(bFrames);
    const target = V(6.1, landY(6.1) + 0.3, 0);
    const warn = group(box(0.12, 0.05, 1.6, ['hazard'], V(2.85, -0.22, 0)), box(0.12, 0.05, 1.6, ['hazard'], V(5.15, landY(5) + 0.03, 0)));
    return {
      ...emptyBuild(group(a.mesh, b.mesh, warn)),
      surfaces: [a.surface, b.surface],
      lanes: [lanePts([...aFrames.map((f) => f.p), V(4, -0.2, 0), ...bFrames.map((f) => f.p)], 0, 1)],
      zones: [
        zone(V(2.4, -1, -1.3), V(3.1, 1.2, 1.3), { type: 'launch', target, time: 0.34, sfx: 'jump' }),
        zone(V(5.2, -2.5, -1.5), V(7.5, 0, 1.5), { type: 'tag', tag: 'jump' }),
      ],
    };
  },
};

const bouncePad: PieceDef = {
  id: 'bounce',
  name: 'Bounce Pad',
  category: 'special',
  desc: 'A hooded chute fires marbles down onto a springy pad that bounces them into a catch tray.',
  unlock: { level: 4, coins: 240 },
  ports: [inPort(0, 0, 0), outPort(12, -1, 0)],
  defaultColor: '#fb5607',
  size: '3×1',
  tags: ['jump', 'bounce'],
  build: () => {
    const t = new Turtle(0.12).line(1.5).pitch(1.2, -1.2);
    const aFrames = framesFromUps(t.pts, t.ups);
    const a = channel(
      aFrames,
      (f) => {
        const k = smooth((f - 0.35) / 0.3);
        return { rho: 1, flat: 0, alpha: STD_ALPHA + (TUBE_ALPHA - STD_ALPHA) * k };
      },
      ['floor', 'body'],
    );
    const landY = (x: number): number => -0.6 - 0.4 * smooth((x - 7.2) / 4.8);
    const bFrames = shear(sampleFn((f) => V(7.2 + 4.8 * f, landY(7.2 + 4.8 * f), 0), 30));
    const b = channel(bFrames, (f) => {
      const k = 1 - smooth((f - 0.3) / 0.45);
      return { rho: 1 + 0.2 * k, flat: 1.4 * k, alpha: STD_ALPHA };
    });
    const padY = -2.4;
    const padX = 4.2;
    const padMesh = box(2.6, 0.2, 2.1, ['rubber'], V(padX, padY - 0.1, 0), '#ff006e');
    padMesh.name = 'pad';
    const bin = group(
      box(3.4, 1.2, 0.12, ['glass'], V(padX, padY + 0.45, -1.12)),
      box(3.4, 1.2, 0.12, ['glass'], V(padX, padY + 0.45, 1.12)),
      box(0.12, 1.2, 2.3, ['glass'], V(padX + 1.55, padY + 0.45, 0)),
      box(0.12, 1.2, 2.3, ['glass'], V(padX - 1.6, padY + 0.45, 0)),
      box(3.4, 0.25, 2.5, ['dark'], V(padX, padY - 0.32, 0)),
    );
    const slope = box(1.64, 0.1, 2.4, ['glass'], V(6.5, -1.05, 0));
    slope.rotation.z = 0.39;
    bin.add(slope);
    for (const z of [-0.6, 0.6]) for (const x of [padX - 0.9, padX + 0.9]) bin.add(cyl(0.12, 0.3, ['metal'], V(x, padY - 0.35, z)));
    const target = V(9.2, landY(9.2) + 0.3, 0);
    return {
      ...emptyBuild(group(a.mesh, b.mesh, padMesh, bin)),
      surfaces: [a.surface, b.surface],
      colliders: [
        { type: 'cuboid', center: V(padX, padY - 0.1, 0), half: V(1.3, 0.1, 1.05), restitution: 0.6 },
        { type: 'cuboid', center: V(padX, padY + 0.45, -1.12), half: V(1.7, 0.6, 0.06) },
        { type: 'cuboid', center: V(padX, padY + 0.45, 1.12), half: V(1.7, 0.6, 0.06) },
        { type: 'cuboid', center: V(padX + 1.55, padY + 0.45, 0), half: V(0.06, 0.6, 1.15) },
        { type: 'cuboid', center: V(padX - 1.6, padY + 0.45, 0), half: V(0.06, 0.6, 1.15) },
        { type: 'cuboid', center: V(6.5, -1.05, 0), half: V(0.82, 0.05, 1.2), rotZ: 0.39 },
      ],
      lanes: [lanePts([...aFrames.map((f) => f.p), V(padX, padY + 0.1, 0), V(6.5, -0.2, 0), ...bFrames.map((f) => f.p)], 0, 1)],
      zones: [
        zone(V(padX - 1.6, padY - 0.1, -1.1), V(padX + 1.5, padY + 0.45, 1.1), { type: 'launch', target, time: 0.85, sfx: 'bounce' }),
        zone(V(7.5, -2, -1.6), V(10, 0.5, 1.6), { type: 'tag', tag: 'jump' }),
      ],
    };
  },
};

const cannon: PieceDef = {
  id: 'cannon',
  name: 'Launcher Cannon',
  category: 'special',
  desc: 'Marbles roll into the barrel and get blasted across the gap. BOOM.',
  unlock: { level: 5, coins: 320 },
  ports: [inPort(0, 0, 0), outPort(12, -2, 0)],
  defaultColor: '#2b2d42',
  size: '3×1',
  tags: ['jump', 'cannon'],
  build: () => {
    const ang = 0.55;
    const t = new Turtle(0.12).line(1.6).pitch(2.4, ang).line(1.6);
    const frames = framesFromUps(t.pts, t.ups);
    const shape = (f: number): ChannelShape => {
      const k = smooth((f - 0.3) / 0.2);
      return { rho: 1, flat: 0, alpha: STD_ALPHA + (TUBE_ALPHA - STD_ALPHA) * k };
    };
    const barrelPath = channel(frames, shape, ['dark', 'dark']);
    const mouth = t.pts[t.pts.length - 1].clone();
    const dir = V(Math.cos(ang), Math.sin(ang), 0);
    const barrel = tagMesh(new THREE.CylinderGeometry(1.32, 1.5, 2.6, 24, 1, true), ['metal']);
    barrel.position.copy(mouth.clone().addScaledVector(dir, -1.1).add(V(0, 0.98, 0)));
    barrel.rotation.z = -(PI / 2 - ang);
    const muzzle = tagMesh(new THREE.TorusGeometry(1.32, 0.16, 8, 28), ['accent'], '#ffbe0b');
    muzzle.position.copy(mouth.clone().add(V(-0.45, 0.98 + 0.28, 0)));
    muzzle.rotation.y = PI / 2;
    muzzle.rotation.x = -ang;
    muzzle.name = 'muzzle';
    const wheels = group();
    for (const z of [-1.55, 1.55]) {
      const w = tagMesh(new THREE.CylinderGeometry(0.85, 0.85, 0.25, 20), ['wood']);
      w.rotation.x = PI / 2;
      w.position.set(2.6, -0.2, z);
      wheels.add(w);
      wheels.add(cyl(0.18, 0.3, ['metal'], V(2.6, -0.2, z * 1.08)).rotateX(PI / 2));
    }
    const landY = (x: number): number => -1.5 - 0.5 * smooth((x - 7) / 5);
    const lFrames = shear(sampleFn((f) => V(7 + 5 * f, landY(7 + 5 * f), 0), 30));
    const landing = channel(lFrames, (f) => {
      const k = 1 - smooth((f - 0.3) / 0.45);
      return { rho: 1 + 0.3 * k, flat: 1.6 * k, alpha: STD_ALPHA };
    });
    const cap = tagMesh(profileCap(lFrames[0], channelProfile({ rho: 1.3, flat: 1.6, alpha: STD_ALPHA }), true), ['body']);
    const target = V(9.3, landY(9.3) + 0.3, 0);
    const arc: THREE.Vector3[] = [];
    for (let i = 1; i < 10; i += 1) {
      const f = i / 10;
      arc.push(V(mouth.x + (target.x - mouth.x) * f, mouth.y + (target.y - mouth.y) * f + 1.5 * Math.sin(PI * f), 0));
    }
    return {
      ...emptyBuild(group(barrelPath.mesh, barrel, muzzle, wheels, landing.mesh, cap)),
      surfaces: [barrelPath.surface, landing.surface],
      colliders: [{ type: 'cuboid', center: V(6.94, landY(7) + 0.4, 0), half: V(0.06, 0.45, 2.4) }],
      lanes: [lanePts([...frames.map((f) => f.p), ...arc, ...lFrames.map((f) => f.p)], 0, 1)],
      zones: [
        zone(V(0.4, -0.6, -1.3), V(1.6, 1.4, 1.3), { type: 'kick', dir: X.clone(), speed: 12 }),
        zone(mouth.clone().add(V(-0.7, -0.3, -1.1)), mouth.clone().add(V(0.3, 2.2, 1.1)), { type: 'launch', target, time: 0.7, sfx: 'cannon' }),
        zone(V(7.5, -3, -2), V(10.5, 0, 2), { type: 'tag', tag: 'jump' }),
      ],
    };
  },
};

/* ---------------------------------------------------- moving obstacles */

function obstaclePiece(
  id: string,
  name: string,
  desc: string,
  flat: number,
  unlock: PieceDef['unlock'],
  movers: (fy: (x: number) => number) => MoverDef[],
  extraVisual: (fy: (x: number) => number) => THREE.Object3D,
): PieceDef {
  return {
    id,
    name,
    category: 'special',
    desc,
    unlock,
    ports: [inPort(0, 0, 0), outPort(8, -0.5, 0)],
    defaultColor: '#8338ec',
    size: '2×1',
    tags: ['obstacle'],
    build: () => {
      const frames = shear(straightPoints(8, -0.5, 0.2));
      const ch = channel(frames, flat > 0 ? wideShape(flat, 0.2, 0.8) : () => STD_SHAPE);
      const fy = (x: number): number => floorY(x, 8, -0.5);
      return { ...emptyBuild(group(ch.mesh, extraVisual(fy))), surfaces: [ch.surface], lanes: [laneFrom(frames, 0, 1)], movers: movers(fy) };
    },
  };
}

const movingPlatform = obstaclePiece(
  'moving_platform',
  'Moving Platform',
  'A wedge platform slides across the trough. Roll over it or get shoved aside.',
  2.0,
  { level: 3, coins: 180 },
  (fy) => {
    const hull = [-1.2, 0, -0.7, 1.2, 0, -0.7, -1.2, 0, 0.7, 1.2, 0, 0.7, -0.45, 0.2, -0.7, 0.45, 0.2, -0.7, -0.45, 0.2, 0.7, 0.45, 0.2, 0.7];
    return [
      {
        colliders: [{ type: 'hull', points: hull }],
        visual: () => {
          const shape = new THREE.Shape();
          shape.moveTo(-1.2, 0);
          shape.lineTo(1.2, 0);
          shape.lineTo(0.45, 0.2);
          shape.lineTo(-0.45, 0.2);
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });
          geo.translate(0, 0, -0.7);
          const m = tagMesh(geo, ['hazard']);
          return group(m);
        },
        motion: (time, out) => {
          out.pos.set(4, fy(4) + 0.005, 1.0 * Math.sin(time * 1.7));
          out.quat.identity();
        },
      },
    ];
  },
  () => new THREE.Group(),
);

const rotatingObstacle = obstaclePiece(
  'rotator',
  'Rotating Obstacle',
  'A spinning cross sweeps the track. Timing is everything.',
  2.2,
  { level: 4, coins: 220 },
  (fy) => [
    {
      colliders: [
        { type: 'cuboid', center: V(0, 0.32, 0), half: V(1.7, 0.13, 0.11) },
        { type: 'cuboid', center: V(0, 0.32, 0), half: V(0.11, 0.13, 1.7) },
      ],
      visual: () =>
        group(
          box(3.4, 0.26, 0.22, ['accent'], V(0, 0.32, 0)),
          box(0.22, 0.26, 3.4, ['accent'], V(0, 0.32, 0)),
          cyl(0.28, 0.5, ['metal'], V(0, 0.3, 0)),
          cyl(0.07, 1.6, ['metal'], V(0, 1.2, 0)),
          sphere(0.12, ['glow'], V(1.7, 0.32, 0), '#ffbe0b'),
          sphere(0.12, ['glow'], V(-1.7, 0.32, 0), '#ffbe0b'),
        ),
      motion: (time, out) => {
        out.pos.set(4, fy(4), 0);
        out.quat.setFromAxisAngle(V(0, 1, 0), time * 1.5);
      },
    },
  ],
  (fy) => group(box(0.18, 0.18, 5.2, ['white'], V(4, fy(4) + 2.05, 0)), cyl(0.09, 2.2, ['white'], V(4, fy(4) + 1.0, -2.6)), cyl(0.09, 2.2, ['white'], V(4, fy(4) + 1.0, 2.6))),
);

const swingingObstacle = obstaclePiece(
  'swinger',
  'Swinging Obstacle',
  'A hinged paddle swats across the lane like a door in the wind.',
  1.6,
  { level: 4, coins: 200 },
  (fy) => [
    {
      colliders: [{ type: 'cuboid', center: V(0, 0.34, -0.95), half: V(0.1, 0.3, 0.85) }],
      visual: () => group(box(0.2, 0.6, 1.7, ['hazard'], V(0, 0.34, -0.95)), cyl(0.12, 1.4, ['metal'], V(0, 0.55, 0))),
      motion: (time, out) => {
        out.pos.set(4, fy(4), 1.85);
        out.quat.setFromAxisAngle(V(0, 1, 0), 1.0 * Math.sin(time * 2.1));
      },
    },
  ],
  () => new THREE.Group(),
);

const pendulum = obstaclePiece(
  'pendulum',
  'Pendulum',
  'A heavy wrecking ball swings through the lane.',
  1.2,
  { level: 5, coins: 260 },
  (fy) => [
    {
      colliders: [{ type: 'ball', center: V(0, -2.7, 0), radius: 0.5 }],
      visual: () => {
        const rod = cyl(0.05, 2.25, ['metal'], V(0, -1.12, 0));
        const ball = sphere(0.5, ['metal'], V(0, -2.7, 0));
        return group(rod, ball, sphere(0.14, ['dark'], V(0, 0, 0)));
      },
      motion: (time, out) => {
        out.pos.set(4, fy(4) + 3.35, 0);
        out.quat.setFromAxisAngle(X, 0.95 * Math.sin(time * 1.9));
      },
    },
  ],
  (fy) =>
    group(
      cyl(0.12, 3.6, ['white'], V(4, fy(4) + 1.6, -2.4)),
      cyl(0.12, 3.6, ['white'], V(4, fy(4) + 1.6, 2.4)),
      box(0.2, 0.2, 5.0, ['body'], V(4, fy(4) + 3.4, 0)),
    ),
);

const movingGates = obstaclePiece(
  'gates',
  'Moving Gates',
  'Two gates rise and fall out of sync. Wait for the gap!',
  0,
  { level: 3, coins: 170 },
  (fy) =>
    [2.6, 5.6].map((x, i) => ({
      colliders: [{ type: 'cuboid', center: V(0, 0.5, 0), half: V(0.08, 0.5, 1.05) }] as ColliderSpec[],
      visual: () => group(box(0.16, 1.0, 2.1, ['hazard'], V(0, 0.5, 0))),
      motion: (time: number, out: { pos: THREE.Vector3; quat: THREE.Quaternion }) => {
        const o = smooth(Math.sin(time * 1.6 + i * PI * 0.9) * 1.6 + 0.4);
        out.pos.set(x, fy(x) + o * 1.25, 0);
        out.quat.identity();
      },
    })),
  (fy) => {
    const g = new THREE.Group();
    for (const x of [2.6, 5.6]) {
      g.add(cyl(0.1, 2.7, ['white'], V(x, fy(x) + 1.25, -1.25)));
      g.add(cyl(0.1, 2.7, ['white'], V(x, fy(x) + 1.25, 1.25)));
      g.add(box(0.2, 0.18, 2.7, ['body'], V(x, fy(x) + 2.6, 0)));
    }
    return g;
  },
);

/* ---------------------------------------------------- start & finish */

const START_FLAT = 2.0;
const startGate: PieceDef = {
  id: 'start',
  name: 'Starting Gate',
  category: 'gates',
  desc: 'Holds up to 12 marbles behind a gate that lifts on GO.',
  unlock: null,
  ports: [outPort(12, -0.75, 0)],
  defaultColor: '#06d6a0',
  size: '3×2',
  build: () => {
    const len = 12;
    const frames = shear(straightPoints(len, -0.75, 0.2));
    const shape = (f: number): ChannelShape => {
      const k = 1 - smooth((f * len - 7) / 4);
      return { rho: 1, flat: START_FLAT * k, alpha: STD_ALPHA };
    };
    const ch = channel(frames, shape);
    const cap = tagMesh(profileCap(frames[0], channelProfile(shape(0)), false), ['body']);
    const fy = (x: number): number => floorY(x, len, -0.75);
    const spawns: THREE.Vector3[] = [];
    for (let row = 0; row < 4; row += 1)
      for (const z of [0, -0.85, 0.85]) {
        const x = 5.55 - row * 0.62;
        spawns.push(V(x, fy(x) + 0.27, z));
      }
    const gateX = 6.25;
    const posts = group(cyl(0.12, 2.6, ['white'], V(gateX, fy(gateX) + 1.0, -2.35)), cyl(0.12, 2.6, ['white'], V(gateX, fy(gateX) + 1.0, 2.35)));
    return {
      ...emptyBuild(group(ch.mesh, cap, posts, arch(8.6, fy(8.6), 2.0, 'bannerStart', true))),
      surfaces: [ch.surface],
      colliders: [{ type: 'cuboid', center: V(-0.08, 0.6, 0), half: V(0.08, 0.9, 2.2) }],
      lanes: [laneFrom(frames, -1, 0)],
      spawns,
      hasLights: true,
      movers: [
        {
          gate: true,
          colliders: [{ type: 'cuboid', center: V(0, 0.6, 0), half: V(0.09, 0.62, 2.1) }],
          visual: () => group(box(0.18, 1.24, 4.2, ['hazard'], V(0, 0.6, 0))),
          motion: (_time, out, open) => {
            out.pos.set(gateX, fy(gateX) + open * 1.9, 0);
            out.quat.identity();
          },
        },
      ],
    };
  },
};

const finishLine: PieceDef = {
  id: 'finish',
  name: 'Finish Line',
  category: 'gates',
  desc: 'Checkered finish line with a catch basin for every marble.',
  unlock: null,
  ports: [inPort(0, 0, 0)],
  defaultColor: '#ff5d8f',
  size: '3×2',
  build: () => {
    const len = 10;
    const frames = shear(straightPoints(len, -0.5, 0.2));
    const shape = (f: number): ChannelShape => {
      const k = smooth((f * len - 3) / 3);
      return { rho: 1, flat: 2.4 * k, alpha: STD_ALPHA + THREE.MathUtils.degToRad(6) * k };
    };
    const ch = channel(frames, shape);
    const cap = tagMesh(profileCap(frames[frames.length - 1], channelProfile(shape(1)), true), ['body']);
    const checker = floorDecal(frames, 1.55 / len, 2.45 / len, 0.97, ['checker'], [1, 4], 0.02);
    const fy = (x: number): number => floorY(x, len, -0.5);
    const lane = laneFrom(frames.filter((f) => f.p.x <= 2.2), 0, -1);
    return {
      ...emptyBuild(group(ch.mesh, cap, checker, arch(2, fy(2), 1.6, 'bannerFinish'))),
      surfaces: [ch.surface],
      colliders: [{ type: 'cuboid', center: V(len + 0.08, fy(len) + 0.6, 0), half: V(0.08, 0.9, 2.4) }],
      lanes: [lane],
      finishX: 2,
      zones: [zone(V(1.95, -3, -2.5), V(4.5, 4, 2.5), { type: 'finish' })],
    };
  },
};

/* ------------------------------------------------------------ decor */

function decor(id: string, name: string, desc: string, unlock: PieceDef['unlock'], make: () => PieceBuild): PieceDef {
  return { id, name, category: 'decor', desc, unlock, ports: [], defaultColor: '#ffbe0b', size: '1×1', build: make, decor: true };
}

const flag = decor('flag', 'Flag', 'Cosmetic. A flag that waves in the breeze.', null, () => {
  const cloth = tagMesh(new THREE.PlaneGeometry(1.4, 0.9, 10, 4), ['cloth']);
  cloth.position.set(0.72, 2.9, 0);
  cloth.name = 'flagCloth';
  cloth.userData.anim = 'flag';
  return emptyBuild(group(cyl(0.06, 3.5, ['white'], V(0, 1.75, 0)), sphere(0.12, ['metal'], V(0, 3.55, 0)), cloth, cyl(0.35, 0.12, ['dark'], V(0, 0.06, 0))));
});

const lamp = decor('lamp', 'Light Post', 'Cosmetic. A glowing lamp to light up your build.', null, () => {
  const bulb = sphere(0.32, ['glow'], V(0, 3.2, 0));
  bulb.userData.anim = 'pulse';
  return emptyBuild(group(cyl(0.08, 3.0, ['dark'], V(0, 1.5, 0)), bulb, cyl(0.4, 0.12, ['dark'], V(0, 0.06, 0)), cyl(0.36, 0.1, ['dark'], V(0, 3.48, 0))));
});

const supportTower = decor('support', 'Support Tower', 'Cosmetic. A lattice tower to make tall builds look sturdy.', null, () => {
  const g = new THREE.Group();
  const h = 6;
  for (const [x, z] of [
    [-0.6, -0.6],
    [0.6, -0.6],
    [-0.6, 0.6],
    [0.6, 0.6],
  ])
    g.add(cyl(0.08, h, ['white'], V(x, h / 2, z), undefined, 8));
  for (let y = 0.8; y < h; y += 1.2) {
    g.add(box(1.3, 0.08, 0.08, ['body'], V(0, y, -0.6)));
    g.add(box(1.3, 0.08, 0.08, ['body'], V(0, y, 0.6)));
    g.add(box(0.08, 0.08, 1.3, ['body'], V(-0.6, y, 0)));
    g.add(box(0.08, 0.08, 1.3, ['body'], V(0.6, y, 0)));
  }
  return emptyBuild(g);
});

const sign = decor('sign', 'Arrow Sign', 'Cosmetic. Point the way to the finish.', null, () => {
  const board = box(1.8, 0.8, 0.1, ['sign'], V(0, 2.2, 0));
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.6, -0.12);
  arrowShape.lineTo(0.2, -0.12);
  arrowShape.lineTo(0.2, -0.28);
  arrowShape.lineTo(0.62, 0);
  arrowShape.lineTo(0.2, 0.28);
  arrowShape.lineTo(0.2, 0.12);
  arrowShape.lineTo(-0.6, 0.12);
  arrowShape.closePath();
  const arrowF = tagMesh(new THREE.ShapeGeometry(arrowShape), ['accent']);
  arrowF.position.set(0, 2.2, 0.06);
  const arrowB = arrowF.clone();
  arrowB.position.z = -0.06;
  arrowB.rotation.y = PI;
  return emptyBuild(group(cyl(0.07, 2.4, ['wood'], V(0, 1.2, 0)), board, arrowF, arrowB));
});

const decoPlatform = decor('deco_platform', 'Deco Platform', 'A round display stand. Solid, so marbles can land on it.', null, () => {
  const top = cyl(2.4, 0.3, ['white'], V(0, -0.15, 0), undefined, 32);
  const rim = cyl(2.55, 0.18, ['body'], V(0, -0.36, 0), undefined, 32);
  return { ...emptyBuild(group(top, rim)), colliders: [{ type: 'cylinder', center: V(0, -0.15, 0), halfHeight: 0.15, radius: 2.4 }] };
});

/* ----------------------------------------------------------- registry */

export const PIECES: PieceDef[] = [
  startGate,
  finishLine,
  straight('straight', 'Straight', 2, 'A classic straight run with a gentle downhill slope.'),
  straight('straight_short', 'Short Straight', 1, 'One cell long. Great for fine-tuning a layout.'),
  straight('straight_long', 'Long Straight', 4, 'Four cells of open track to build speed.'),
  curve('curve_gentle_l', 'Gentle Left', 6, false, -0.5, 0.3, 'A wide, sweeping left turn.'),
  curve('curve_gentle_r', 'Gentle Right', 6, true, -0.5, 0.3, 'A wide, sweeping right turn.'),
  curve('curve_sharp_l', 'Sharp Left', 2, false, -0.25, 0.35, 'A tight banked left turn.'),
  curve('curve_sharp_r', 'Sharp Right', 2, true, -0.25, 0.35, 'A tight banked right turn.'),
  sCurve,
  wideCurve,
  ramp('ramp_up', 'Upward Ramp', 1, 'Climbs one level. Marbles need momentum to make it!', null),
  ramp('ramp_down', 'Downward Ramp', -2, 'Drops two levels over two cells.'),
  ramp('ramp_steep', 'Steep Ramp', -4, 'A steep plunge of four levels. Huge speed.'),
  verticalDrop,
  halfPipe,
  loop,
  corkscrew,
  spiralRamp,
  funnel('funnel_large', 'Large Funnel', 'large'),
  funnel('funnel_small', 'Small Funnel', 'small'),
  funnel('funnel_vortex', 'Vortex Funnel', 'vortex'),
  tube,
  splitter,
  merge,
  jumpPlatform,
  gapJump,
  booster,
  bouncePad,
  cannon,
  movingPlatform,
  rotatingObstacle,
  swingingObstacle,
  pendulum,
  movingGates,
  flag,
  lamp,
  supportTower,
  sign,
  decoPlatform,
];

const EXTENTS: Record<string, number> = {
  start: 2.2,
  finish: 1.2,
  wide_curve: 1.8,
  moving_platform: 2.1,
  rotator: 2.3,
  swinger: 2.0,
  pendulum: 2.5,
  gates: 1.3,
  jump: 1.4,
  bounce: 1.4,
  cannon: 1.7,
  funnel_small: 1.4,
  funnel_large: 1.6,
  funnel_vortex: 1.6,
};
for (const p of PIECES) if (EXTENTS[p.id] !== undefined) p.extent = EXTENTS[p.id];

export const PIECE_MAP = new Map(PIECES.map((p) => [p.id, p]));

export function getDef(id: string): PieceDef {
  const d = PIECE_MAP.get(id);
  if (!d) throw new Error(`Unknown piece ${id}`);
  return d;
}

export const CATEGORY_LABELS: Record<string, string> = {
  gates: 'Start & Finish',
  basic: 'Basic',
  vertical: 'Vertical',
  special: 'Special',
  decor: 'Decor',
};
