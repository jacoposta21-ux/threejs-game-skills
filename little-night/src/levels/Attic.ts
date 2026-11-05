import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Level, type Palette } from './Level';
import { v3, stormWindowMaterial, lightShaft, dustMotes, worldBox } from './LevelKit';
import { mat, glowChalkMaterial, projectedGlyphMaterial, plane, rbox, cyl, lumoUniforms } from '../art/Materials';
import { woodPlanks, wallpaper, type GlyphKind } from '../art/Textures';
import * as P from './props/Props';
import * as K from './props/KitchenProps';
import * as A from './props/AtticProps';
import { Interactable, type Prompt } from '../objects/Interactable';
import { Drawer } from '../objects/Drawer';
import { PushableObject } from '../objects/PushableObject';
import { Pickup } from '../objects/Pickup';
import { HideSpot, HideVolume } from '../objects/HideSpot';
import { Perch, Nest, Examinable, Socket, Dial, Trigger } from '../objects/Fixtures';
import { Throwable } from '../objects/Throwable';
import { NavGrid } from '../enemies/NavGrid';
import type { LumoAnchor } from '../companion/LumoController';

const SOLUTION: GlyphKind[] = ['bird', 'moon', 'heart'];

/** A place LUMO can be put into by hand (magic lantern, music box crown). */
class LumoSocket extends Interactable implements LumoAnchor {
  readonly kind = 'socket' as const;
  readonly anchor = new THREE.Vector3();
  occupied = false;
  onArriveCb: ((ctx: GameContext) => void) | null = null;
  onLeaveCb: ((ctx: GameContext) => void) | null = null;
  available: (ctx: GameContext) => Prompt | null = () => null;

  constructor(id: string, pos: THREE.Vector3, readonly verb: string, w = 0.35, h = 0.35) {
    super(id);
    this.root.position.copy(pos);
    this.anchor.copy(pos);
    this.addHitBox(w, h, w, 0, -h / 2, 0);
    this.range = 1.6;
  }

  prompt(ctx: GameContext): Prompt | null {
    const gate = this.available(ctx);
    if (gate) return gate;
    if (!ctx.lumo.found) return null;
    if (ctx.lumo.anchor === this) return { verb: 'Call LUMO back', key: 'E' };
    if (this.anchor.y > ctx.player.reachY + 0.15) return { verb: 'Too high to reach', disabled: true };
    if (ctx.lumo.energy <= 0) return { verb: 'LUMO is too tired', disabled: true };
    return { verb: this.verb, key: 'E' };
  }

  interact(ctx: GameContext): void {
    if (ctx.lumo.anchor === this) ctx.lumo.recall(ctx);
    else ctx.lumo.sendTo(ctx, this);
  }

  onArrive(ctx: GameContext): void {
    this.occupied = true;
    this.onArriveCb?.(ctx);
  }

  onLeave(ctx: GameContext): void {
    this.occupied = false;
    this.onLeaveCb?.(ctx);
  }
}

/**
 * Chapter 3. Attic x[-7,7] z[-2.6,2.6] under a pitched roof (ridge 3.0 m).
 * West: arrival. Middle-west: dark toy graveyard. Middle-east: workshop.
 * East of the clockwork gate (x=3.4): the music box.
 */
export class Attic extends Level {
  readonly id = 'attic' as const;
  readonly palette: Palette = {
    fog: '#120b16',
    fogDensity: 0.04,
    hemiSky: '#6a58a0',
    hemiGround: '#3a2416',
    hemi: 0.85,
    ambient: '#2c2030',
    ambientIntensity: 0.55,
    exposure: 1.25,
    lift: [0.035, 0.02, 0.045],
    gain: [1.06, 0.97, 0.98],
    moonColor: '#a596e0',
    moonIntensity: 2.8,
    moonPos: v3(13, 4.2, 0.6),
    moonTarget: v3(2, 0, 0),
    shadowExtent: 6,
    rain: 0.95,
    wind: 0.45,
    pad: 'attic',
    background: '#07050a',
  };

  private gateBars!: THREE.Group;
  private gateCollider!: ReturnType<Level['b']['solid']>;
  private gateT = 0;
  private gateOpening = false;
  private mech!: ReturnType<typeof A.musicBox>;
  private mechBox!: ReturnType<typeof A.mechanismBox>;
  private cageT = 0;
  private dials: Dial[] = [];
  private projectorGlow!: THREE.MeshBasicMaterial;
  private projector = 0;
  private beam!: THREE.Mesh;
  private crownSocket!: LumoSocket;
  private lanternSocket!: LumoSocket;
  private trunkLid: THREE.Group | null = null;
  private trunkOpen = 0;
  private lamp!: ReturnType<typeof A.oilLamp>;
  private finaleT = -1;
  private ending = false;
  private coat!: THREE.Group;
  private houseLights: THREE.PointLight[] = [];
  private bulbs: THREE.MeshBasicMaterial[] = [];
  private finaleChalk: THREE.Mesh[] = [];
  private hushSpawnTimer = -1;

  protected construct(ctx: GameContext): void {
    const b = this.b;
    const floor = mat('a-floor', { map: woodPlanks('#5e432e', [1 / 1.1, 1 / 1.1], 5), roughness: 0.7 });
    const roofMat = mat('a-roof', { map: wallpaper('boards', '#4a3628', '#1e140c', [1 / 1.2, 1 / 1.2]), roughness: 0.9 });
    const beamMat = P.M.wood('#4a3020');
    const gableMat = mat('a-gable', { map: wallpaper('boards', '#3f2e22', '#1a120c', [1 / 1.0, 1 / 1.0]), roughness: 0.9 });
    const trim = mat('a-trim', { color: '#3a2a20', roughness: 0.7 });

    // --- Shell: floor, pitched roof, knee walls, gables -------------------------------------
    b.floor(-7, 7, -2.65, 2.65, floor, 'wood');
    b.add(worldBox(14.6, 0.1, 6.6, floor, 0, -0.1, 0));
    const ridge = 3.0;
    const eave = 0.9;
    const half = 3.0;
    const slope = Math.atan2(ridge - eave, half);
    const roofLen = Math.hypot(ridge - eave, half);
    for (const s of [-1, 1]) {
      const roof = worldBox(14.6, 0.08, roofLen + 0.2, roofMat, 0, 0, 0);
      roof.geometry.translate(0, -0.04, 0);
      roof.position.set(0, (ridge + eave) / 2, (s * half) / 2);
      roof.rotation.x = s * slope;
      b.add(roof);
      // Rafters every 1.1 m.
      for (let x = -6.6; x <= 6.6; x += 1.1) {
        const raf = rbox(0.08, 0.14, roofLen, beamMat, 0.01, 0, 0, 0);
        raf.position.set(x, (ridge + eave) / 2 - 0.12, (s * half) / 2);
        raf.rotation.x = s * slope;
        b.add(raf);
      }
      // Knee walls (low) with collision.
      b.add(worldBox(14, 1.05, 0.08, gableMat, 0, 0, s * 2.66));
      b.collide(0, 0, s * 2.7, 14.2, 1.6, 0.16, { walkable: false, occluder: true });
    }
    b.add(rbox(14.6, 0.16, 0.16, beamMat, 0.02, 0, ridge - 0.16, 0));
    // Collar ties (cross beams) at 2.2 m.
    for (let x = -5.5; x <= 5.5; x += 2.2) b.add(rbox(0.1, 0.1, 3.1, beamMat, 0.01, x, 2.15, 0));
    // Gable walls with the round moon window in the east.
    b.wall({ axis: 'z', at: -7.07, from: -3, to: 3, height: ridge, inside: 1 }, gableMat);
    b.wall({ axis: 'z', at: 7.07, from: -3, to: 3, height: ridge, inside: -1, openings: [{ from: -0.45, to: 0.45, bottom: 1.55, top: 2.45 }] }, gableMat);
    const sky = plane(1.6, 1.6, stormWindowMaterial('#1c1430', '#2e2448'));
    sky.position.set(7.4, 2.0, 0);
    sky.rotation.y = -Math.PI / 2;
    b.add(sky);
    const rw = A.roundWindowFrame(0.45);
    rw.position.set(7.0, 2.0, 0);
    rw.rotation.y = Math.PI / 2;
    b.add(rw);
    const shaft = lightShaft(0.8, 3.6, '#b8a6ff', 0.045);
    shaft.position.set(6.9, 2.3, 0);
    shaft.rotation.set(0, Math.PI / 2, 1.05);
    b.add(shaft);
    this.shafts.push(shaft);
    const dust = dustMotes(Math.floor(220 * ctx.particleScale), v3(-6.5, 0.2, -2.3), v3(6.8, 2.6, 2.3), '#e6d6ff');
    b.add(dust);
    this.dust.push(dust);
    // Hatch we came up through.
    b.add(rbox(0.8, 0.03, 1.1, trim, 0.01, -5.6, 0, 0));
    b.add(rbox(0.7, 0.04, 1.0, P.M.wood('#6a4e32'), 0.01, -5.6, 0.01, 0));

    // --- Zone A: arrival ---------------------------------------------------------------------------
    const crateA = K.crate(0.5, 0.42, 0.42);
    crateA.position.set(-6.3, 0, -1.6);
    b.add(crateA);
    b.solid(-6.3, 0, -1.6, 0.5, 0.42, 0.42, 'wood', true);
    const nest = new Nest('nest-attic', v3(-6.3, 0.42, -1.6), Math.PI / 2);
    this.register(nest);
    const rocker = A.sheetCovered(0.7, 1.0, 0.7, 2);
    rocker.position.set(-6.2, 0, 1.4);
    b.add(rocker);
    b.solid(-6.2, 0, 1.4, 0.7, 1.0, 0.7, 'fabric', false, { walkable: false });
    for (const [x, z] of [[-6.45, -1.45], [5.0, 1.9]] as const) {
      const candle = cyl(0.025, 0.025, 0.12, mat('candle', { color: '#efe2c4', roughness: 0.6 }), 10, x, x < 0 ? 0.42 : 0, z);
      b.add(candle);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 8), new THREE.MeshBasicMaterial({ color: '#ffb35a' }));
      flame.position.set(x, (x < 0 ? 0.42 : 0) + 0.14, z);
      flame.userData.noBatch = true;
      b.add(flame);
      const cl = new THREE.PointLight('#ff9c48', 0.9, 3.6, 1.7);
      cl.position.set(x, (x < 0 ? 0.42 : 0) + 0.2, z);
      b.add(cl);
    }
    const note = P.paperNote('attic-note', 0.16, 0.2);
    note.position.set(-5.0, 1.25, -2.61);
    b.add(note);
    const noteEx = new Examinable(
      'attic-note',
      'A note pinned to the beam',
      'If you are reading this, you found the way up, little one. Don’t be afraid of the quiet. It only means the house is listening. Fix the gate, find the song, and give it your light. — Grandpa',
      '',
      0.25,
      0.3,
      0.15,
      'Read',
    );
    noteEx.root.position.set(-5.0, 1.38, -2.58);
    this.register(noteEx);
    const wardrobeA = P.wardrobe(0.9, 1.6, 0.55);
    wardrobeA.position.set(-6.6, 0, 0.0);
    wardrobeA.rotation.y = Math.PI / 2;
    b.add(wardrobeA);
    b.solid(-6.6, 0, 0.0, 0.57, 1.8, 0.92, 'wood', false, { walkable: false });
    const wardHide = new HideSpot('attic-wardrobe', v3(-6.6, 0.55, 0), -Math.PI / 2, v3(-6.0, 0, 0), -Math.PI / 2, v3(-5.7, 0, 0.0), v3(-6.6, 0.8, 0));
    wardHide.addHitBox(0.1, 1.3, 0.8, -6.3, 0.2, 0);
    this.register(wardHide);

    // --- Zone B: the toy graveyard (deep dark) ---------------------------------------------------------
    const pole = (x: number, z: number) => {
      b.add(cyl(0.025, 0.035, 1.07, P.M.wood('#3e2a1c'), 8, x, 0, z));
      b.add(cyl(0.12, 0.14, 0.03, P.M.wood('#3e2a1c'), 14, x, 0, z));
      b.solid(x, 0, z, 0.12, 1.1, 0.12, 'wood', false, { walkable: false, occluder: false });
    };
    pole(-4.4, 1.8);
    pole(-2.0, -1.8);
    const p1 = new Perch('attic-a', v3(-4.4, 1.25, 1.8), 0, false);
    const p2 = new Perch('attic-b', v3(-2.0, 1.25, -1.8), 0, false);
    this.register(p1);
    this.register(p2);
    ctx.hazards.addZone({ id: 'graveyard', min: new THREE.Vector2(-4.55, -2.6), max: new THREE.Vector2(-1.05, 2.6), deep: true, returnPos: v3(-5.0, 0, 0.6), returnYaw: -Math.PI / 2 }, this.root);
    // Abandoned toys
    const whale = P.rockingWhale();
    whale.position.set(-3.6, 0, -1.9);
    whale.rotation.y = 0.5;
    b.add(whale);
    b.solid(-3.6, 0, -1.9, 1.0, 0.62, 0.6, 'wood', true);
    for (let i = 0; i < 6; i++) {
      const s = A.toySoldier(i % 2 ? '#7a2a2a' : '#2a4a7a');
      s.position.set(-3.2 + i * 0.12, 0, 0.9 + (i % 3) * 0.05);
      s.rotation.z = i === 4 ? 1.4 : 0;
      b.add(s);
    }
    b.add(A.trainTrack(0.6).translateX(-2.9).translateZ(-0.4));
    const train = A.toyTrain();
    train.position.set(-2.3, 0, -0.4);
    train.rotation.y = Math.PI / 2;
    b.add(train);
    const dh = A.dollhouse();
    dh.position.set(-3.0, 0, -2.25);
    b.add(dh);
    b.solid(-3.0, 0, -2.25, 0.92, 0.75, 0.5, 'wood', false, { walkable: false });
    const dhEx = new Examinable(
      'dollhouse',
      'A dollhouse',
      'A tiny copy of this very house. Tiny bed upstairs, tiny table in the kitchen. In the tiny attic, a tiny figure in a long dark coat stands beside a speck of orange light.',
      '',
      0.9,
      0.7,
      0.5,
    );
    dhEx.root.position.set(-3.0, 0.7, -2.0);
    this.register(dhEx);
    const octo = P.octopusPlush('#8a6a3a');
    octo.position.set(-1.7, 0, 0.6);
    b.add(octo);
    // Toy trunk with the spring.
    const toyTrunk = A.trunk(0.7, 0.5, 0.42);
    toyTrunk.position.set(-2.6, 0, 2.15);
    b.add(toyTrunk);
    toyTrunk.userData.noBatch = true;
    this.trunkLid = toyTrunk.userData.lid as THREE.Group;
    b.solid(-2.6, 0, 2.15, 0.72, 0.4, 0.44, 'wood', false, { walkable: false });
    const springVis = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 14), P.M.chrome());
      t.rotation.x = Math.PI / 2;
      t.position.y = i * 0.016;
      springVis.add(t);
    }
    const spring = new Pickup('spring', springVis, { item: 'spring', name: 'a coiled spring', icon: 'spring' });
    spring.root.position.set(-2.6, 0.32, 2.15);
    spring.enabled = false;
    this.register(spring);
    const trunkOpen = new Trigger('toy-trunk', 'Open the toy trunk', (c) => {
      c.flags.set('a-trunk-open');
      c.audio.play('creak', { pos: v3(-2.6, 0.4, 2.15) });
      c.noise.emit(v3(-2.6, 0.4, 2.15), 3, 'trunk');
      spring.enabled = !c.flags.has('got:spring');
      c.interactions.markDirty();
    }, 0.72, 0.5, 0.44, (c) => (c.flags.has('a-trunk-open') ? null : { verb: 'Open the toy trunk', key: 'E' }));
    trunkOpen.root.position.set(-2.6, 0.5, 2.15);
    this.register(trunkOpen);
    const toyTable = rbox(1.0, 0.04, 0.7, P.M.paint('#6a8aa0', 0.6), 0.01, -1.6, 0.5, -0.9);
    b.add(toyTable);
    for (const [x, z] of [[-2.05, -1.2], [-1.15, -1.2], [-2.05, -0.6], [-1.15, -0.6]]) b.add(cyl(0.02, 0.02, 0.5, P.M.paint('#6a8aa0', 0.6), 8, x, 0, z));
    b.solid(-1.6, 0.5, -0.9, 1.0, 0.04, 0.7, 'wood', true);
    const underToyTable = new HideVolume('under-toy-table', v3(-2.1, 0, -1.25), v3(-1.1, 0.5, -0.55), v3(-1.6, 0, 0.1), v3(-1.6, 0.25, -0.9));

    // --- Zone C: workshop -------------------------------------------------------------------------------
    const bench = A.workbench();
    bench.position.set(0.5, 0, -2.2);
    b.add(bench);
    b.solid(0.5, 0.83, -2.2, 1.8, 0.07, 0.65, 'wood', false);
    for (const [x, z] of [[-0.35, -2.48], [1.35, -2.48], [-0.35, -1.92], [1.35, -1.92]]) b.solid(x, 0, z, 0.07, 0.83, 0.07, 'wood', false);
    const underBench = new HideVolume('under-bench', v3(-0.38, 0, -2.5), v3(1.38, 0.8, -1.88), v3(0.5, 0, -1.2), v3(0.5, 0.3, -2.2));
    const gearVis = new THREE.Group();
    const gearRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 20), P.M.brass());
    gearRing.rotation.x = Math.PI / 2;
    gearVis.add(gearRing);
    const gear = new Pickup('gear', gearVis, { item: 'gear', name: 'a brass gear', icon: 'gear' });
    gear.enabled = false;
    const benchDrawer = new Drawer('bench-drawer', { width: 0.5, height: 0.14, depth: 0.5, slide: v3(0, 0, 1), handleHeight: 0.07, contents: [gear], color: '#7a5a3a' });
    benchDrawer.root.position.set(0.0, 0.66, -1.88);
    this.register(benchDrawer);
    this.register(gear, benchDrawer.box);
    gear.root.position.set(0, 0.04, -0.25);
    this.lamp = A.oilLamp();
    this.lamp.group.position.set(1.15, 0.9, -2.3);
    b.add(this.lamp.group);
    this.lamp.group.userData.noBatch = true;
    const bp = A.pinnedBlueprint();
    bp.position.set(0.3, 1.45, -2.52);
    b.add(bp);
    const bpEx = new Examinable('blueprint', 'A blueprint', 'L.U.M.O. — Little Unafraid Mechanical Ornament. “Runs on winding and on being needed. Will glow brightest for the music box.”', '', 0.55, 0.42, 0.12);
    bpEx.root.position.set(0.3, 1.66, -2.5);
    this.register(bpEx);
    const photoFrame = P.photoFrame('grandpa');
    photoFrame.position.set(1.4, 1.5, -2.6);
    b.add(photoFrame);
    // Sheet-covered armchair: hide under it.
    const armchair = A.sheetCovered(0.85, 0.95, 0.8, 5);
    armchair.position.set(1.0, 0, 1.95);
    b.add(armchair);
    b.solid(1.0, 0, 1.95, 0.85, 0.95, 0.8, 'fabric', false, { walkable: false });
    const sheetHide = new HideSpot('sheet-chair', v3(1.0, 0.4, 1.95), Math.PI, v3(1.0, 0, 1.25), Math.PI, v3(1.0, 0, 0.9), v3(1.0, 0.5, 1.9), 'Hide under the sheet');
    sheetHide.addHitBox(0.85, 0.9, 0.1, 1.0, 0.0, 1.52);
    this.register(sheetHide);
    // Box tower with the crank on top: 0.42 -> 0.82 -> 1.2
    const t1 = K.crate(0.5, 0.42, 0.5);
    t1.position.set(1.85, 0, 1.05);
    b.add(t1);
    b.solid(1.85, 0, 1.05, 0.5, 0.42, 0.5, 'wood', true);
    const t2 = K.crate(0.5, 0.82, 0.5);
    t2.position.set(2.35, 0, 1.05);
    b.add(t2);
    b.solid(2.35, 0, 1.05, 0.5, 0.82, 0.5, 'wood', true);
    const t3 = P.wardrobe(0.55, 1.05, 0.55);
    t3.position.set(2.9, 0, 1.05);
    t3.rotation.y = Math.PI;
    b.add(t3);
    b.solid(2.9, 0, 1.05, 0.6, 1.2, 0.6, 'wood', true);
    const crankVis = new THREE.Group();
    crankVis.add(cyl(0.012, 0.012, 0.14, P.M.brass(), 8).rotateZ(Math.PI / 2));
    crankVis.add(rbox(0.016, 0.16, 0.016, P.M.brass(), 0.004, -0.07, 0, 0));
    const crank = new Pickup('crank', crankVis, { item: 'crank', name: 'a crank handle', icon: 'crank' });
    crank.root.position.set(3.12, 1.22, 0.86);
    this.register(crank);
    const blk = new Throwable('a-block', P.toyBlock('G', '#5aa05a'), 'the toy block', 'thunk');
    blk.root.position.set(-0.4, 0.055, 0.6);
    this.register(blk);
    const blk2 = new Throwable('a-block2', P.toyBlock('M', '#d0453a'), 'the toy block', 'thunk');
    blk2.root.position.set(2.2, 0.055, -0.9);
    this.register(blk2);

    // --- Clockwork gate & mechanism -------------------------------------------------------------------------
    const gate = A.clockworkGate(5.2, 2.0);
    gate.group.position.set(3.4, 0, 0);
    gate.group.rotation.y = Math.PI / 2;
    b.add(gate.group);
    gate.group.userData.noBatch = true;
    this.gateBars = gate.bars;
    this.gateCollider = b.solid(3.4, 0, 0, 0.12, 2.1, 5.3, 'metal', false, { walkable: false, occluder: false });
    this.mechBox = A.mechanismBox();
    this.mechBox.group.position.set(3.0, 0, -1.7);
    b.add(this.mechBox.group);
    this.mechBox.group.userData.noBatch = true;
    b.solid(3.0, 0, -1.7, 0.5, 0.85, 0.7, 'wood', false, { walkable: false });
    const sockets: [string, string, string, THREE.Group, THREE.Vector3][] = [
      ['gate-gear', 'gear', 'brass gear', this.mechBox.gearPart, v3(2.7, 0.66, -1.5)],
      ['gate-spring', 'spring', 'spring', this.mechBox.springPart, v3(2.7, 0.22, -1.7)],
      ['gate-crank', 'crank', 'crank handle', this.mechBox.crankPart, v3(2.7, 0.5, -1.92)],
    ];
    for (const [id, item, name, part, pos] of sockets) {
      const sock = new Socket(id, item, name, `An empty socket shaped like a ${name}`, part);
      sock.root.position.copy(pos);
      part.position.set(pos.x - 3.0, pos.y, pos.z + 1.7);
      this.mechBox.group.add(part);
      part.visible = false;
      sock.onInstall = (c) => this.onPartInstalled(c);
      this.register(sock);
      (sock as unknown as { part: THREE.Object3D }).part = part;
    }
    const turn = new Trigger('gate-crank-turn', 'Turn the crank', (c) => this.openGate(c), 0.3, 0.6, 0.6, (c) => {
      if (c.flags.has('attic-gate-open')) return null;
      const n = ['gate-gear', 'gate-spring', 'gate-crank'].filter((s) => c.flags.has(`socket:${s}`)).length;
      if (n < 3) return null;
      return { verb: 'Turn the crank', key: 'E' };
    });
    turn.root.position.set(2.7, 0.9, -1.7);
    this.register(turn);
    const mechChalk = new Examinable('gate-plate', 'A brass plate on the box', 'Three shapes are engraved here: a gear, a coiled spring, and a crank handle. The gate will not move until all three are in place.', '', 0.5, 0.1, 0.7, 'Look at the mechanism');
    mechChalk.root.position.set(3.0, 0.95, -1.7);
    this.register(mechChalk);

    // --- Zone D: the music box sanctum -----------------------------------------------------------------------
    this.mech = A.musicBox();
    this.mech.comb.userData.noBatchChildren = true;
    this.mech.group.position.set(5.6, 0, 0);
    b.add(this.mech.group);
    this.mech.group.userData.noBatch = true;
    b.solid(5.6, 0, 0, 0.84, 0.56, 0.84, 'wood', false, { walkable: false });
    this.mech.lid.rotation.x = 0;
    for (let i = 0; i < 3; i++) {
      const d = new Dial(`dial-${i}`, 1);
      d.root.position.set(5.17, 0.3, -0.3 + i * 0.3);
      d.root.rotation.y = -Math.PI / 2;
      d.onChange = (c) => this.checkDials(c);
      this.register(d);
      this.dials.push(d);
    }
    this.crownSocket = new LumoSocket('crown', v3(5.6, 0.82, 0), 'Give LUMO’s light to the music box', 0.4, 0.4);
    this.crownSocket.available = (c) => (c.flags.has('a-wound') && !this.ending ? null : { verb: '', disabled: true });
    this.crownSocket.onArriveCb = (c) => this.finale(c);
    this.register(this.crownSocket);
    this.crownSocket.enabled = false;
    const wind = new Trigger('wind-box', 'Wind the music box', (c) => this.windBox(c), 0.5, 0.35, 0.5, (c) => {
      if (!c.flags.has('attic-cage-open') || c.flags.has('a-wound')) return null;
      if (!c.inventory.has('wind-key')) return { verb: 'It needs a key to wind it', disabled: true };
      return { verb: 'Wind the music box (three turns)', key: 'E' };
    });
    wind.root.position.set(5.6, 0.95, 0);
    this.register(wind);
    // Magic lantern on a cabinet, trunk to push beneath it.
    const cab = P.dresserCarcass(0.6, 1.0, 0.45, '#4a3020');
    cab.position.set(4.3, 0, -2.25);
    b.add(cab);
    b.solid(4.3, 0, -2.25, 0.62, 1.0, 0.47, 'wood', false);
    const lantern = A.magicLantern();
    lantern.group.position.set(4.3, 1.0, -2.25);
    b.add(lantern.group);
    lantern.group.userData.noBatch = true;
    this.projectorGlow = lantern.lensGlow;
    this.lanternSocket = new LumoSocket('lantern', v3(4.3, 1.12, -2.25), 'Put LUMO inside the magic lantern', 0.4, 0.4);
    this.lanternSocket.onArriveCb = (c) => {
      c.flags.set('a-projected');
      c.ui.subtitle('[the lantern throws three shapes onto the far wall]', 3.5);
      c.ui.objective('Match the dials to the shapes on the wall');
    };
    this.register(this.lanternSocket);
    const bigTrunk = new PushableObject('big-trunk', A.trunk(0.7, 0.5, 0.45), {
      size: v3(0.7, 0.5, 0.45),
      position: v3(4.3, 0, -0.6),
      climbable: true,
      label: 'the old trunk',
      axis: 'z',
      bounds: { min: new THREE.Vector2(3.6, -1.82), max: new THREE.Vector2(5.0, 1.8) },
    });
    this.register(bigTrunk);
    // Projection beam and glyphs on the east gable.
    const beamGeo = new THREE.CylinderGeometry(0.62, 0.04, 2.8, 20, 1, true);
    beamGeo.rotateZ(Math.PI / 2);
    beamGeo.translate(1.4, 0, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.beam.position.set(4.6, 1.12, -2.25);
    this.beam.lookAt(new THREE.Vector3(7.0, 1.55, 0).add(new THREE.Vector3(0, 0, 0)));
    this.beam.rotateY(-Math.PI / 2);
    this.beam.userData.noBatch = true;
    b.add(this.beam);
    SOLUTION.forEach((g, i) => {
      const m = plane(0.42, 0.42, projectedGlyphMaterial(g));
      m.position.set(6.98, 1.55, -0.55 + i * 0.55);
      m.rotation.y = -Math.PI / 2;
      m.userData.noBatch = true;
      b.add(m);
    });
    const cageNote = new Examinable('cage-plate', 'A plate on the cage', 'Engraved: “What the lantern shows, the box will know.” Below it, three little dials.', '', 0.3, 0.2, 0.3, 'Read the plate');
    cageNote.root.position.set(5.15, 0.52, 0);
    this.register(cageNote);
    // The coat stand (revealed in the finale).
    this.coat = A.coatStand();
    this.coat.visible = false;
    this.coat.userData.noBatch = true;
    b.add(this.coat);
    // Bare bulbs along the ridge (the power comes back at the end).
    for (let x = -5; x <= 5; x += 5) {
      const bulbMat = new THREE.MeshBasicMaterial({ color: '#3a3020' });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), bulbMat);
      bulb.position.set(x, 2.55, 0);
      bulb.userData.noBatch = true;
      b.add(bulb);
      b.add(cyl(0.004, 0.004, 0.3, P.M.iron(), 4, x, 2.6, 0));
      this.bulbs.push(bulbMat);
      const l = new THREE.PointLight('#ffc27a', 0, 7, 1.6);
      l.position.set(x, 2.45, 0);
      b.add(l);
      this.houseLights.push(l);
    }

    // --- Glow chalk: Grandpa's secret drawings (revealed fully in the finale) -----------------------------
    const chalk = (kind: GlyphKind, x: number, y: number, z: number, rx: number, ry: number, s = 0.26, finale = false) => {
      const m = plane(s, s, glowChalkMaterial(kind, finale ? new THREE.Color('#ffd27a') : undefined));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      m.renderOrder = 2;
      m.userData.noBatch = true;
      b.add(m);
      if (finale) this.finaleChalk.push(m);
    };
    chalk('perch', -4.4, 1.6, 1.78, 0, 0, 0.24);
    chalk('perch', -2.0, 1.6, -1.78, 0, 0, 0.24);
    chalk('arrow', -3.2, 0.012, 0.2, -Math.PI / 2, -Math.PI / 2, 0.3);
    chalk('key', 0.5, 0.012, -1.4, -Math.PI / 2, 0, 0.26);
    chalk('arrow', 1.8, 0.012, 0.4, -Math.PI / 2, 0, 0.26);
    chalk('firefly', 4.3, 1.5, -2.45, 0, 0, 0.24);
    const finaleSpots: [GlyphKind, number, number, number, number][] = [
      ['heart', -6.0, 1.5, -2.6, 0],
      ['firefly', -3.8, 1.9, -2.6, 0],
      ['star', -1.2, 1.7, 2.6, Math.PI],
      ['moon', 1.6, 1.8, 2.6, Math.PI],
      ['bird', 3.9, 1.6, 2.6, Math.PI],
      ['firefly', -2.0, 2.2, 2.6, Math.PI],
      ['heart', 5.8, 1.3, 2.6, Math.PI],
      ['star', 0.0, 2.4, -2.6, 0],
    ];
    for (const [k, x, y, z, ry] of finaleSpots) chalk(k, x, y, z * 0.97, 0, ry, 0.4, true);

    // --- Navigation & THE HUSH ------------------------------------------------------------------------------
    const nav = new NavGrid(-7, -2.6, 7, 2.6, 0.25, [{ minX: -6.95, minZ: -2.55, maxX: 6.95, maxZ: 2.55 }]);
    const hush = ctx.enemies.setup(nav, ctx);
    hush.spots = [wardHide, underToyTable, underBench, sheetHide];
    hush.perches = [p1, p2];
    hush.patrol = [v3(-5.2, 0, -0.4), v3(-2.6, 0, 0.5), v3(0.2, 0, -0.2), v3(2.6, 0, -0.6), v3(0.4, 0, 0.9), v3(-3.4, 0, -0.9)];
    hush.tuning = { patrolSpeed: 1.0, investigateSpeed: 1.45, chaseSpeed: 1.9, sight: 8, hearing: 1.1 };

    this.melody = ctx.audio.createMelody(v3(5.6, 0.8, 0), 0.4);

    this.zone('enter-graveyard', v3(-4.7, -0.2, -2.6), v3(-4.4, 1, 2.6), () => {
      ctx.ui.objective('Light a path through the toys');
    });
    this.zone('hush-wakes', v3(-1.0, -0.2, -2.6), v3(0.0, 1, 2.6), () => {
      if (!hush.active) {
        hush.spawn(v3(2.6, 0, 0.3), Math.PI / 2, 'patrol', ctx);
        ctx.audio.play('hushWhisper', { pos: v3(2.6, 2, 0.3), volume: 1 });
        ctx.ui.subtitle('[the quiet has followed you up here]', 3);
      }
    });

    this.checkpoints = {
      start: { pos: v3(-5.6, 0, 0.75), yaw: -Math.PI / 2 },
      parts: { pos: v3(-0.6, 0, 0.2), yaw: -Math.PI / 2 },
      gate: { pos: v3(2.4, 0, -0.4), yaw: -Math.PI / 2 },
      finale: { pos: v3(4.7, 0, 0.6), yaw: -Math.PI / 2 + 0.3 },
    };
  }

  begin(ctx: GameContext, checkpoint: string): void {
    const hush = ctx.enemies.hush!;
    this.melody?.start();
    this.melody?.setVolume(0.45);
    if (this.melody) this.melody.detune = ctx.flags.has('attic-cage-open') ? 0 : -25;
    if (ctx.flags.has('a-trunk-open')) this.trunkOpen = 1;
    if (ctx.flags.has('attic-gate-open')) {
      this.gateT = 1;
      this.gateCollider.enabled = false;
      ctx.world.markChanged();
      hush.patrol.push(v3(4.6, 0, 1.2), v3(4.0, 0, -1.0));
    }
    if (ctx.flags.has('attic-cage-open')) this.cageT = 1;
    for (const id of ['gate-gear', 'gate-spring', 'gate-crank']) {
      if (ctx.flags.has(`socket:${id}`)) ctx.inventory.remove(id.replace('gate-', ''));
    }
    switch (checkpoint) {
      case 'start':
        ctx.ui.objective('Find the music box');
        ctx.ui.hint('The hatch thumps shut below you. The melody is very close now.', 4);
        this.strike(ctx, true);
        break;
      case 'parts':
        ctx.ui.objective('Repair the gate: gear, spring and crank');
        hush.spawn(v3(2.6, 0, 0.3), Math.PI / 2, 'patrol', ctx);
        break;
      case 'gate':
        ctx.ui.objective('Open the music box cage');
        hush.spawn(v3(-3.0, 0, 0.0), -Math.PI / 2, 'patrol', ctx);
        break;
      case 'finale':
        ctx.ui.objective('Wind the music box');
        break;
    }
  }

  private onPartInstalled(ctx: GameContext): void {
    const n = ['gate-gear', 'gate-spring', 'gate-crank'].filter((s) => ctx.flags.has(`socket:${s}`)).length;
    if (n === 1) ctx.checkpoint('parts');
    if (n < 3) ctx.ui.objective(`Repair the gate (${n}/3 parts)`);
    else {
      ctx.ui.objective('Turn the crank');
      ctx.ui.hint('All three parts fit. Turn the crank (E).', 3);
    }
  }

  private openGate(ctx: GameContext): void {
    ctx.flags.set('attic-gate-open');
    this.gateOpening = true;
    ctx.audio.play('mechanism', { pos: v3(3.4, 1, 0), volume: 1.4 });
    ctx.noise.emit(v3(3.4, 1, 0), 10, 'gate');
    ctx.ui.subtitle('[clunk… click-click-click… the gate rises]', 3);
    ctx.ui.objective('Open the music box cage');
    const hush = ctx.enemies.hush!;
    hush.patrol.push(v3(4.6, 0, 1.2), v3(4.0, 0, -1.0));
    this.after(2.5, () => ctx.checkpoint('gate'));
  }

  private checkDials(ctx: GameContext): void {
    const ok = this.dials.every((d, i) => d.glyph === SOLUTION[i]);
    if (!ok || ctx.flags.has('attic-cage-open')) return;
    ctx.flags.set('attic-cage-open');
    for (const d of this.dials) d.locked = true;
    ctx.audio.play('unlock', { pos: v3(5.6, 0.6, 0), volume: 1.2 });
    ctx.audio.play('glimmer', { pos: v3(5.6, 0.9, 0) });
    ctx.ui.subtitle('[the cage lifts away]', 3);
    ctx.ui.objective('Wind the music box');
    if (this.melody) this.melody.detune = 0;
    ctx.interactions.markDirty();
    this.after(1.6, () => ctx.checkpoint('finale'));
  }

  private windBox(ctx: GameContext): void {
    ctx.flags.set('a-wound');
    ctx.audio.play('charge', { pos: v3(5.6, 0.7, 0) });
    this.melody?.setVolume(0.9, 1);
    this.crownSocket.enabled = true;
    ctx.interactions.markDirty();
    ctx.ui.subtitle('[the lullaby swells, loud and clear, for the whole house]', 3.5);
    ctx.ui.objective('Give LUMO’s light to the music box!');
    ctx.ui.hint('Place LUMO on the music box (E on the box).', 5);
    // THE HUSH comes to silence it: slowly, so you have time.
    const hush = ctx.enemies.hush!;
    this.hushSpawnTimer = 1.2;
    if (hush.active) hush.despawn(ctx);
  }

  private finale(ctx: GameContext): void {
    if (this.ending) return;
    this.ending = true;
    this.finaleT = 0;
    const p = ctx.player;
    p.mode = 'locked';
    ctx.ui.objective('');
  }

  /** Test hook: jump straight to the resolved ending tableau. */
  debugEnding(): void {
    const ctx = this.ctx;
    this.ending = true;
    this.finaleT = 15;
    ctx.flags.set('a-wound');
    ctx.lumo.sendTo(ctx, this.crownSocket);
    ctx.lumo.boost = 1.2;
    this.cageT = 1;
    this.coat.visible = true;
    this.coat.position.set(4.6, 0, 0.4);
    for (const l of this.houseLights) l.intensity = 2.2;
    for (const m of this.bulbs) m.color.set('#ffe2a8');
    ctx.player.teleport(v3(3.9, 0, 1.1), -Math.PI / 2 - 0.55);
    ctx.player.pitch = -0.05;
    ctx.player.mode = 'locked';
  }

  protected tick(dt: number, ctx: GameContext): void {
    // Oil lamp flicker
    const f = 0.85 + Math.sin(this.time * 9) * 0.06 + Math.sin(this.time * 23) * 0.04;
    this.lamp.light.intensity = f * 1.1;
    // Trunk lid
    if (ctx.flags.has('a-trunk-open') && this.trunkOpen < 1) this.trunkOpen = Math.min(1, this.trunkOpen + dt * 1.5);
    if (this.trunkLid) this.trunkLid.rotation.x = -this.trunkOpen * 1.6;
    // Gate
    if ((this.gateOpening || ctx.flags.has('attic-gate-open')) && this.gateT < 1) {
      this.gateT = Math.min(1, this.gateT + dt * 0.35);
      for (const w of this.mechBox.wheels) w.rotation.x += dt * 4;
      if (this.gateT > 0.55 && this.gateCollider.enabled) {
        this.gateCollider.enabled = false;
        ctx.world.markChanged();
      }
    }
    this.gateBars.position.y = this.gateT * 1.85;
    // Projector
    const projecting = this.lanternSocket.occupied && ctx.lumo.isLit;
    this.projector = THREE.MathUtils.damp(this.projector, projecting ? 1 : 0, 3, dt);
    lumoUniforms.uProjector.value = this.projector;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = this.projector * 0.07;
    this.projectorGlow.color.setRGB(0.16 + this.projector, 0.14 + this.projector * 0.8, 0.09 + this.projector * 0.5);
    // Cage lifts
    if (ctx.flags.has('attic-cage-open') && this.cageT < 1) this.cageT = Math.min(1, this.cageT + dt * 0.5);
    this.mech.cage.position.y = 0.56 + this.cageT * 1.4;
    this.mech.cage.visible = this.cageT < 0.99;
    this.mech.lid.rotation.x = -this.cageT * 1.2;
    if (ctx.flags.has('a-wound')) this.mech.comb.children.forEach((c, i) => (c.position.y = Math.sin(this.time * 12 + i) * 0.002));
    this.mech.glow.intensity = 0.35 + (ctx.flags.has('a-wound') ? 0.6 + Math.sin(this.time * 3) * 0.2 : 0);

    // Finale: THE HUSH approaches to silence the box.
    const hush = ctx.enemies.hush!;
    if (this.hushSpawnTimer > 0) {
      this.hushSpawnTimer -= dt;
      if (this.hushSpawnTimer <= 0 && !this.ending) {
        hush.spawn(v3(-1.5, 0, 0.0), -Math.PI / 2, 'scripted', ctx);
        hush.scriptTo([v3(2.4, 0, 0.2), v3(4.2, 0, 0.6), ctx.player.position.clone()], 0.75, () => hush.startChase(ctx));
        ctx.audio.play('hushWhisper', { pos: v3(-1.5, 2, 0), volume: 1.4 });
        ctx.ui.subtitle('[SHHHHHHHH]', 2.5);
      }
    }
    if (this.finaleT >= 0) this.updateFinale(dt, ctx);
  }

  private updateFinale(dt: number, ctx: GameContext): void {
    const prev = this.finaleT;
    this.finaleT += dt;
    const t = this.finaleT;
    const at = (x: number) => prev < x && t >= x;
    const hush = ctx.enemies.hush!;
    const p = ctx.player;
    const lumo = ctx.lumo;
    p.lookOverride = { target: lumo.position.clone(), weight: Math.min(0.9, t * 0.5) };
    lumo.boost = Math.min(2.2, t * 0.5);
    lumo.energy = 100;
    if (at(0.1)) {
      ctx.audio.play('lumoWake', { pos: lumo.position, volume: 1.2 });
      ctx.ui.subtitle('[LUMO glows brighter than it ever has]', 3.5);
      if (hush.active) {
        hush.scriptTo([hush.position.clone()], 0.1);
        hush.model.pose = 'kneel';
      }
    }
    if (hush.active || hush.model.root.visible) {
      hush.model.pose = 'kneel';
      if (t > 2.5) hush.model.setFade(Math.max(0, 1 - (t - 2.5) / 2.5));
    }
    if (at(2.6)) {
      const pos = hush.active ? hush.position.clone() : v3(4.6, 0, 0.4);
      this.coat.position.set(pos.x, 0, pos.z);
      this.coat.rotation.y = hush.yaw;
      this.coat.visible = true;
      this.coat.scale.setScalar(0.01);
      ctx.ui.subtitle('[it kneels, and folds, and is only a coat]', 3.5);
    }
    if (this.coat.visible && this.coat.scale.x < 1) this.coat.scale.setScalar(Math.min(1, this.coat.scale.x + dt * 0.5));
    if (at(5.2)) {
      hush.despawn(ctx);
      ctx.audio.play('charge', { volume: 0.8 });
      ctx.ui.subtitle('[click — the lights come back on, all over the house]', 3.5);
    }
    if (t > 5.2) {
      const k = Math.min(1, (t - 5.2) / 1.5);
      for (const l of this.houseLights) l.intensity = k * 2.2 * (0.9 + Math.random() * 0.1);
      for (const m of this.bulbs) m.color.setRGB(0.25 + k * 0.75, 0.2 + k * 0.68, 0.15 + k * 0.5);
      ctx.audio.setRainLevel(0.35);
    }
    if (at(8.5)) ctx.ui.subtitle('Mama (from downstairs): “Sweetheart? The power’s back… Are you up there?”', 4.5);
    if (at(13.5)) {
      ctx.events.emit('fade', { amount: 0 });
    }
    if (t > 13.5 && t < 16) ctx.events.emit('fade', { amount: Math.min(1, (t - 13.5) / 2.3) });
    if (at(16.2)) {
      p.lookOverride = null;
      ctx.completeChapter();
    }
  }
}
