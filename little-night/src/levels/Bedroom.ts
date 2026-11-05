import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Level, type Palette } from './Level';
import { v3, stormWindowMaterial, lightShaft, dustMotes, worldBox } from './LevelKit';
import { mat, glowChalkMaterial, plane, rbox, cyl, sphere, basicMat } from '../art/Materials';
import { woodPlanks, wallpaper, type GlyphKind } from '../art/Textures';
import * as P from './props/Props';
import { Door } from '../objects/Door';
import { Drawer } from '../objects/Drawer';
import { PushableObject } from '../objects/PushableObject';
import { Pickup } from '../objects/Pickup';
import { HideSpot, HideVolume } from '../objects/HideSpot';
import { Perch, Nest, Examinable, Trigger } from '../objects/Fixtures';
import { NavGrid } from '../enemies/NavGrid';
import { Throwable } from '../objects/Throwable';

/**
 * Chapter 1: tutorial. Bedroom x[-2.8,2.8] z[-3.2,3.2], hallway x[-6,5.6] z[3.34,5.6].
 */
export class Bedroom extends Level {
  readonly id = 'bedroom' as const;
  readonly palette: Palette = {
    fog: '#0d0f1a',
    fogDensity: 0.07,
    hemiSky: '#4a5a8a',
    hemiGround: '#3a2416',
    hemi: 0.55,
    ambient: '#1e2236',
    ambientIntensity: 0.4,
    exposure: 1.15,
    lift: [0.025, 0.028, 0.05],
    gain: [1.06, 0.98, 0.9],
    moonColor: '#8fa6e0',
    moonIntensity: 2.4,
    moonPos: v3(-1.6, 6.5, -9),
    moonTarget: v3(0.4, 0, 0.6),
    shadowExtent: 6,
    rain: 0.55,
    wind: 0.3,
    pad: 'bedroom',
    background: '#06070c',
  };

  private lantern!: ReturnType<typeof P.toyLantern>;
  private dresserDrawer!: Drawer;
  private lumoPickup!: Pickup;
  private chest!: PushableObject;
  private door!: Door;
  private perchA!: Perch;
  private perchB!: Perch;
  private chuteHatch!: THREE.Group;
  private encounterTimer = -1;
  private stairGlow!: THREE.PointLight;
  private hushEmergeT = -1;
  private chalk: THREE.Mesh[] = [];

  protected construct(ctx: GameContext): void {
    const b = this.b;
    const H = 2.7;
    const floor = mat('bed-floor', { map: woodPlanks('#7a5236', [1 / 0.9, 1 / 0.9]), roughness: 0.55 });
    const wallMat = mat('bed-wall', { map: wallpaper('moons', '#3f4f74', '#c9a75a', [1 / 0.9, 1 / 0.9]), roughness: 0.9 });
    const hallWall = mat('hall-wall', { map: wallpaper('stripes', '#5b4a3c', '#4b3c31', [1 / 0.8, 1 / 0.8]), roughness: 0.9 });
    const trim = mat('trim-cream', { color: '#d9ccb2', roughness: 0.6 });
    const ceilingMat = mat('ceiling', { color: '#5a5868', roughness: 1 });

    // --- Shell -------------------------------------------------------------
    b.floor(-2.8, 2.8, -3.2, 3.2, floor, 'wood');
    b.floor(-6.1, 5.6, 3.2, 5.7, floor, 'wood');
    b.ceiling(-2.95, 2.95, -3.35, 3.35, H, ceilingMat);
    b.ceiling(-6.2, 5.7, 3.2, 5.8, H, ceilingMat);
    // North wall with window opening.
    b.wall({ axis: 'x', at: -3.27, from: -2.95, to: 2.95, height: H, inside: 1, openings: [{ from: -1.3, to: 0.1, bottom: 0.9, top: 2.15 }] }, wallMat, trim);
    b.wall({ axis: 'z', at: -2.87, from: -3.2, to: 3.27, height: H, inside: 1 }, wallMat, trim);
    b.wall({ axis: 'z', at: 2.87, from: -3.2, to: 3.27, height: H, inside: -1 }, wallMat, trim);
    // South wall: bedroom door from x 1.2 to 2.1.
    b.wall({ axis: 'x', at: 3.27, from: -2.95, to: 2.95, height: H, inside: -1, openings: [{ from: 1.2, to: 2.1, bottom: 0, top: 2.05 }] }, wallMat, trim);
    // Hallway walls (outer side of the bedroom south wall carries hall paper).
    b.add(worldBox(4.15, H, 0.01, hallWall, -0.875, 0, 3.345));
    b.add(worldBox(0.85, H, 0.01, hallWall, 2.525, 0, 3.345));
    b.wall({ axis: 'x', at: 3.27, from: -6.2, to: -2.95, height: H, inside: -1 }, hallWall, trim);
    b.wall({ axis: 'x', at: 3.27, from: 2.95, to: 5.7, height: H, inside: -1 }, hallWall, trim);
    b.wall({ axis: 'x', at: 5.66, from: -6.2, to: 5.7, height: H, inside: -1, openings: [{ from: -5.6, to: -4.9, bottom: 0.12, top: 0.62 }] }, hallWall, trim);
    b.wall({ axis: 'z', at: -6.16, from: 3.2, to: 5.7, height: H, inside: 1 }, hallWall, trim);
    b.wall({ axis: 'z', at: 5.63, from: 3.2, to: 5.7, height: H, inside: -1 }, hallWall, trim);
    b.frame('x', 3.27, 1.2, 2.1, 0, 2.05, -1, trim, 0.2);
    b.frame('x', -3.27, -1.3, 0.1, 0.9, 2.15, 1, trim, 0.2);

    // --- Window & storm ------------------------------------------------------
    const sky = plane(2.4, 2.0, stormWindowMaterial('#1a2440', '#2c3654'));
    sky.position.set(-0.6, 1.55, -3.55);
    b.add(sky);
    const sash = P.windowSash(1.4, 1.25, P.M.paint('#e6dcc8', 0.5));
    sash.position.set(-0.6, 0.9, -3.27);
    b.add(sash);
    for (const s of [-1, 1]) {
      const c = P.curtain(0.55, 1.75, '#2f4870');
      c.position.set(-0.6 + s * 0.88, 1.32, -3.15);
      b.add(c);
    }
    b.add(rbox(1.7, 0.035, 0.035, P.M.brass(), 0.01, -0.6, 2.24, -3.15));
    const sill = rbox(1.6, 0.04, 0.22, trim, 0.01, -0.6, 0.86, -3.12);
    b.add(sill);
    const shaft = lightShaft(1.3, 3.2, '#9fb4ff', 0.06);
    shaft.position.set(-0.6, 2.1, -3.1);
    shaft.rotation.x = -0.75;
    b.add(shaft);
    this.shafts.push(shaft);
    const dust = dustMotes(Math.floor(160 * ctx.particleScale), v3(-1.4, 0.2, -3.1), v3(0.3, 2.1, -0.6));
    b.add(dust);
    this.dust.push(dust);

    // --- Bed ----------------------------------------------------------------
    const bed = P.bigBed(1.4, 2.0);
    bed.position.set(-2.0, 0, -1.9);
    b.add(bed);
    // Mattress top: walkable + climbable. Legs as thin solids so you can crawl under.
    b.solid(-2.0, 0.5, -1.9, 1.4, 0.3, 2.0, 'fabric', true);
    for (const [x, z] of [[-2.65, -2.85], [-1.35, -2.85], [-2.65, -0.95], [-1.35, -0.95]]) b.solid(x, 0, z, 0.1, 0.5, 0.1, 'wood');
    b.solid(-2.0, 0, -2.95, 1.55, 1.4, 0.1, 'wood', false, { walkable: false });
    b.solid(-2.0, 0, -0.85, 1.55, 0.98, 0.08, 'wood', false, { walkable: false });
    const underBed = new HideVolume('under-bed', v3(-2.65, 0, -2.85), v3(-1.35, 0.5, -0.95), v3(-1.0, 0, -1.9), v3(-2.0, 0.25, -1.9));
    const mob = P.mobile();
    mob.position.set(-2.0, 2.3, -1.6);
    b.add(mob);
    mob.userData.spin = true;
    mob.userData.noBatch = true;

    // Dying toy lantern by the bed: the warm accent of the room.
    this.lantern = P.toyLantern();
    this.lantern.group.position.set(-1.05, 0, -0.7);
    b.add(this.lantern.group);
    b.solid(-1.05, 0, -0.7, 0.14, 0.2, 0.14, 'wood');

    // --- Dresser with LUMO's drawer ------------------------------------------
    const dresser = P.dresserCarcass(1.0, 0.95, 0.48);
    dresser.position.set(2.5, 0, -1.1);
    dresser.rotation.y = -Math.PI / 2;
    b.add(dresser);
    b.solid(2.5, 0, -1.1, 0.5, 0.95, 1.04, 'wood', false);
    const drawerRows = [0.08, 0.36, 0.64];
    let lumoDrawer: Drawer | null = null;
    for (let i = 0; i < 3; i++) {
      const isLumo = i === 0;
      const contents: Pickup[] = [];
      if (isLumo) {
        const sleeping = new THREE.Group();
        this.lumoPickup = new Pickup('lumo', sleeping, { item: 'lumo', name: 'the little firefly', icon: 'lumo', verb: 'Pick up' });
        this.lumoPickup.enabled = false;
        contents.push(this.lumoPickup);
      }
      const d = new Drawer(`dresser-${i}`, { width: 0.9, height: 0.25, depth: 0.42, slide: v3(0, 0, 1), handleHeight: 0.13, glow: isLumo, contents, color: '#c49a6c' });
      d.root.position.set(2.24, drawerRows[i], -1.1);
      d.root.rotation.y = -Math.PI / 2;
      this.register(d);
      if (isLumo) {
        lumoDrawer = d;
        // LUMO lies inside the drawer tray.
        this.register(this.lumoPickup, d.box);
        this.lumoPickup.root.position.set(0.05, 0.06, -0.2);
        d.opts.onOpen = (c) => {
          c.ui.subtitle('[something inside is glowing, very faintly]', 3);
        };
      } else {
        d.opts.onOpen = (c) => c.ui.toast(i === 1 ? 'Socks. Lots of socks.' : 'Folded pajamas with little moons on them.', 2.5);
      }
    }
    this.dresserDrawer = lumoDrawer!;
    this.lumoPickup.opts.onPicked = (c) => this.wakeLumo(c);
    const photoG = P.photoFrame('grandpa');
    photoG.position.set(2.5, 1.15, -0.85);
    photoG.rotation.y = -Math.PI / 2 - 0.15;
    b.add(photoG);
    const photoEx = new Examinable('photo-grandpa', 'A photo', 'Grandpa, smiling, holding something small that glows. Written on the back in pencil: “For the little one — so the night is never too dark.”', 'photo', 0.25, 0.3, 0.15);
    photoEx.root.position.set(2.45, 1.2, -0.85);
    this.register(photoEx);

    // --- Toy shelf + toy box + Nest ------------------------------------------
    const shelf = P.toyShelf(1.2, 1.15, 0.46, [0.45, 0.82]);
    shelf.position.set(-2.55, 0, 1.2);
    shelf.rotation.y = Math.PI / 2;
    b.add(shelf);
    b.solid(-2.55, 0, 1.2, 0.46, 1.15, 1.2, 'wood', true);
    const ring = P.ringStack();
    ring.position.set(-2.55, 0.48, 0.85);
    b.add(ring);
    const oct = P.octopusPlush('#3f8f86');
    oct.position.set(-2.5, 0.84, 1.45);
    oct.rotation.y = 1.2;
    b.add(oct);
    ['L', 'U', 'M', 'O'].forEach((ch, i) => {
      const blk = P.toyBlock(ch, ['#d0453a', '#e8c33b', '#4c78b8', '#5aa05a'][i]);
      blk.position.set(-2.55, 0.11 + 0.055, 0.8 + i * 0.13);
      blk.rotation.y = i * 0.2;
      b.add(blk);
    });
    // Low toy box in front of the shelf (step one).
    const toyBox = P.cardboardBox(0.5, 0.42, 0.42, 'TOYS');
    toyBox.position.set(-2.05, 0, 1.2);
    b.add(toyBox);
    b.solid(-2.05, 0, 1.2, 0.5, 0.42, 0.42, 'wood', true);
    const nest = new Nest('nest-bedroom', v3(-2.55, 1.15, 1.35), Math.PI / 2);
    this.register(nest);

    // --- Wardrobe (hide spot) -----------------------------------------------
    const wd = P.wardrobe(1.1, 2.0, 0.6);
    wd.position.set(2.5, 0, 1.6);
    wd.rotation.y = -Math.PI / 2;
    b.add(wd);
    b.solid(2.5, 0, 1.6, 0.62, 2.2, 1.14, 'wood', false, { walkable: false });
    const wardrobeHide = new HideSpot('wardrobe', v3(2.5, 0.62, 1.6), Math.PI / 2, v3(1.95, 0, 1.6), Math.PI / 2, v3(1.6, 0, 1.6), v3(2.5, 0.9, 1.6));
    wardrobeHide.addHitBox(0.1, 1.6, 1.0, 2.17, 0.2, 1.6);
    this.register(wardrobeHide);

    // --- Toy chest (pushable) -----------------------------------------------
    const chestVis = P.toyChest(0.72, 0.5, 0.46);
    this.chest = new PushableObject('chest', chestVis, {
      size: v3(0.72, 0.5, 0.46),
      position: v3(-0.2, 0, 1.9),
      climbable: true,
      label: 'the toy chest',
      onMoved: (c, pos) => {
        if (Math.abs(pos.x - 1.65) < 0.45 && pos.z > 2.4 && !c.flags.has('ch1-chest-hint')) {
          c.flags.set('ch1-chest-hint');
          c.ui.hint('Climb onto the chest (Space) to reach the handle.', 4);
        }
      },
    });
    this.register(this.chest);

    // --- Rug, toys, drawings -------------------------------------------------
    b.add(P.roundRug(1.3, '#2a2f44', '#4f3b2c', '#6e624c').translateX(0.2).translateZ(0.2));
    const whale = P.rockingWhale();
    whale.position.set(1.2, 0, -2.5);
    whale.rotation.y = -0.4;
    b.add(whale);
    b.solid(1.2, 0, -2.5, 1.1, 0.62, 0.5, 'wood', true);
    const ballM = P.ball('#d0453a');
    ballM.position.set(0.9, 0.09, -0.6);
    b.add(ballM);
    const blockT = new Throwable('block-a', P.toyBlock('A', '#e8c33b'), 'the toy block', 'thunk');
    blockT.root.position.set(0.3, 0.055, 0.9);
    this.register(blockT);
    const stoolM = P.stool();
    stoolM.position.set(0.5, 0, -2.6);
    b.add(stoolM);
    b.solid(0.5, 0, -2.6, 0.36, 0.32, 0.28, 'wood', true);
    const draws: [Parameters<typeof P.drawing>[0], number, number, number, number][] = [
      ['family', -2.79, 1.4, 0.2, Math.PI / 2],
      ['firefly', -2.79, 1.35, 1.9, Math.PI / 2],
      ['storm', 2.79, 1.3, 0.3, -Math.PI / 2],
      ['grandpa', 1.0, 1.25, -3.19, 0],
    ];
    for (const [kind, x, y, z, ry] of draws) {
      const dr = P.drawing(kind);
      dr.position.set(x, y, z);
      dr.rotation.y = ry;
      b.add(dr);
      const notes: Record<string, string> = {
        family: 'Me, Mama and the sun. The sun is the biggest.',
        firefly: 'A big orange bug with wings. Grandpa said its name is LUMO.',
        storm: 'A storm cloud. Next to it, someone has scribbled a tall black shape over and over until the paper tore.',
        grandpa: 'Grandpa with his round glasses. A tiny orange light is flying next to him.',
      };
      const ex = new Examinable(`drawing-${kind}`, 'A crayon drawing', notes[kind] ?? '', 'drawing', 0.36, 0.36, 0.12);
      ex.root.position.set(x, y + 0.18, z);
      this.register(ex);
    }
    const stars = P.ceilingStars(40, -2.6, 2.6, -3.0, 3.0, H - 0.005, ctx.rng);
    b.add(stars);

    // --- Door ----------------------------------------------------------------
    this.door = new Door('bedroom-door', {
      width: 0.88,
      height: 2.03,
      hinge: v3(1.21, 0, 3.27),
      closedYaw: 0,
      openAngle: -1.45,
      handleHeight: 1.12,
      color: '#d9cdb7',
      oneWay: true,
      onOpen: (c) => this.onDoorOpened(c),
    });
    this.register(this.door);

    // --- Hallway --------------------------------------------------------------
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.0), mat('runner', { map: wallpaper('damask', '#4a2a2a', '#7a4a3a', [3, 1]), roughness: 1 }));
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(-0.4, 0.007, 4.45);
    runner.receiveShadow = true;
    b.add(runner);
    // Stairwell at the east end: railing and a pale glow from below.
    const rail = P.M.wood('#5b3b27');
    // Railing on the hall side, with the stair mouth open at the north end.
    b.add(rbox(0.06, 0.95, 0.06, rail, 0.01, 4.1, 0, 4.6));
    b.add(rbox(0.06, 0.95, 0.06, rail, 0.01, 4.1, 0, 5.55));
    for (let i = 0; i < 4; i++) b.add(cyl(0.016, 0.016, 0.9, rail, 6, 4.1, 0, 4.8 + i * 0.2));
    b.add(rbox(0.09, 0.06, 1.0, rail, 0.02, 4.1, 0.9, 5.08));
    b.solid(4.1, 0, 5.08, 0.08, 0.95, 1.0, 'wood', false, { walkable: false, occluder: false });
    for (let i = 0; i < 6; i++) {
      const step = worldBox(1.3, 0.05, 0.3, P.M.wood('#6a4630'), 4.9, -0.2 - i * 0.2, 3.6 + i * 0.28);
      b.add(step);
    }
    b.add(worldBox(1.4, 0.02, 2.3, mat('stairwell-dark', { color: '#020203' }), 4.9, -1.35, 4.45));
    b.solid(4.9, -0.5, 4.45, 1.3, 1.45, 2.3, 'wood', false, { walkable: false, occluder: false, navBlock: false });
    this.stairGlow = new THREE.PointLight('#6f7fb0', 0.0, 4, 2);
    this.stairGlow.position.set(4.9, -0.6, 4.4);
    b.add(this.stairGlow);
    // Linen closet (hide spot) near the stairs.
    const closet = new THREE.Group();
    closet.add(rbox(0.9, 2.1, 0.5, P.M.paint('#c9bfa8', 0.7), 0.02, 0, 0, 0));
    closet.add(rbox(0.8, 1.9, 0.02, P.M.paint('#b6ab92', 0.7), 0.01, 0, 0.1, 0.26));
    for (let i = 0; i < 9; i++) closet.add(rbox(0.74, 0.03, 0.02, P.M.paint('#9f957f', 0.7), 0.005, 0, 0.25 + i * 0.18, 0.28));
    closet.position.set(3.2, 0, 3.6);
    b.add(closet);
    b.solid(3.2, 0, 3.6, 0.9, 2.1, 0.5, 'wood', false, { walkable: false });
    const closetHide = new HideSpot('linen-closet', v3(3.2, 0.6, 3.6), Math.PI, v3(3.2, 0, 4.15), Math.PI, v3(3.2, 0, 4.5), v3(3.2, 0.8, 3.6));
    closetHide.addHitBox(0.8, 1.6, 0.1, 3.2, 0.2, 3.88);
    this.register(closetHide);
    // Laundry basket beside the closet: crawl behind it to hide.
    const basket = new THREE.Group();
    basket.add(cyl(0.3, 0.26, 0.55, mat('wicker', { map: wallpaper('boards', '#a7814f', '#7a5a34', [4, 2]), roughness: 0.9 }), 18));
    basket.add(P.curtain(0.4, 0.3, '#d9d2c4').translateY(0.6).rotateX(-1.2));
    basket.position.set(2.2, 0, 3.75);
    b.add(basket);
    b.solid(2.2, 0, 3.75, 0.58, 0.55, 0.58, 'fabric', true);
    // Photos and the second drawing along the hall.
    const ph = P.photoFrame('house');
    ph.position.set(-1.0, 1.55, 5.6);
    ph.rotation.y = Math.PI;
    b.add(ph);
    const phc = P.photoFrame('child');
    phc.position.set(0.6, 1.5, 5.6);
    phc.rotation.y = Math.PI;
    b.add(phc);
    // Laundry chute hatch (exit).
    this.chuteHatch = new THREE.Group();
    this.chuteHatch.position.set(-5.25, 0.12, 5.58);
    const hatchDoor = rbox(0.66, 0.48, 0.03, P.M.paint('#d9ccb2', 0.6), 0.01, 0, 0, 0);
    hatchDoor.position.y = 0.24;
    this.chuteHatch.add(hatchDoor);
    this.chuteHatch.add(sphere(0.02, P.M.brass(), 8, 0, 0.4, -0.03));
    b.add(this.chuteHatch);
    b.add(worldBox(0.7, 0.5, 0.3, mat('chute-dark', { color: '#030304' }), -5.25, 0.12, 5.75));
    b.add(plane(0.4, 0.08, basicMat('chute-label', { color: '#b8ab8f' })).translateX(-5.25).translateY(0.75).translateZ(5.585).rotateY(Math.PI));
    const chute = new Trigger('chute', 'Crawl into the laundry chute', (c) => this.enterChute(c), 0.7, 0.5, 0.3, (c) => {
      if (!c.flags.has('ch1-encounter-done')) return { verb: 'A little hatch… not yet. Something is coming.', disabled: true };
      return { verb: 'Crawl into the laundry chute', key: 'E' };
    });
    chute.root.position.set(-5.25, 0.62, 5.45);
    this.register(chute);

    // --- Perches for the dark hallway ----------------------------------------
    this.perchA = new Perch('hall-a', v3(-0.3, 1.0, 5.56), Math.PI);
    this.perchB = new Perch('hall-b', v3(-3.5, 1.0, 3.42), 0);
    this.register(this.perchA);
    this.register(this.perchB);
    this.perchA.onArriveCb = (c) => {
      if (!c.flags.has('ch1-hall-lit')) {
        c.flags.set('ch1-hall-lit');
        c.ui.hint('Brass perches amplify LUMO. Walk into the light, then send LUMO to the next perch.', 5);
      }
    };
    ctx.hazards.addZone(
      {
        id: 'hall-dark',
        min: new THREE.Vector2(-6.1, 3.35),
        max: new THREE.Vector2(0.75, 5.62),
        deep: true,
        returnPos: v3(1.45, 0, 4.3),
        returnYaw: Math.PI / 2,
      },
      this.root,
    );

    // --- Glow chalk trail (only visible in LUMO's light) ---------------------
    const chalk = (kind: GlyphKind, x: number, y: number, z: number, rx: number, ry: number, s = 0.22) => {
      const m = plane(s, s, glowChalkMaterial(kind));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      m.renderOrder = 2;
      b.add(m);
      this.chalk.push(m);
    };
    chalk('firefly', 1.7, 0.012, -0.6, -Math.PI / 2, 0.4);
    chalk('arrow', 0.7, 0.012, -0.1, -Math.PI / 2, 2.6);
    chalk('firefly', -0.4, 0.012, 0.5, -Math.PI / 2, 2.3);
    chalk('arrow', -1.3, 0.012, 0.95, -Math.PI / 2, 3.0);
    chalk('firefly', -2.78, 1.35, 1.35, 0, Math.PI / 2, 0.3);
    chalk('heart', -2.79, 1.9, -0.4, 0, Math.PI / 2, 0.3);
    chalk('perch', -0.3, 1.45, 5.6, 0, Math.PI, 0.26);
    chalk('perch', -3.5, 1.45, 3.36, 0, 0, 0.26);
    chalk('arrow', -4.5, 0.012, 4.6, -Math.PI / 2, Math.PI, 0.3);

    // --- Noise traps ----------------------------------------------------------
    this.trap('creak', v3(0.9, -0.1, 3.4), v3(1.5, 0.2, 4.0), 7);
    this.trap('creak', v3(-2.5, -0.1, 4.0), v3(-1.9, 0.2, 5.0), 7);

    // --- Navigation for THE HUSH ----------------------------------------------
    const nav = new NavGrid(-6.2, -3.3, 5.7, 5.7, 0.25, [
      { minX: -2.8, minZ: -3.2, maxX: 2.8, maxZ: 3.2 },
      { minX: -6.1, minZ: 3.27, maxX: 5.6, maxZ: 5.62 },
      { minX: 1.2, minZ: 3.0, maxX: 2.1, maxZ: 3.5 },
    ]);
    const hush = ctx.enemies.setup(nav, ctx);
    hush.spots = [underBed, wardrobeHide, closetHide];
    hush.perches = [this.perchA, this.perchB];

    // --- Melody from downstairs (positional: the chute) -----------------------
    this.melody = ctx.audio.createMelody(v3(-5.25, 0.3, 5.9), 0.35);

    // --- Zones ------------------------------------------------------------------
    this.zone('hall-enter', v3(-0.5, -0.2, 3.4), v3(2.4, 1, 5.6), () => {
      if (!ctx.flags.has('ch1-hall-seen')) {
        ctx.flags.set('ch1-hall-seen');
        ctx.ui.objective('Cross the dark hallway');
        ctx.ui.subtitle('[the melody is coming from the end of the hall]', 3);
      }
    });
    this.zone('encounter', v3(-3.3, -0.2, 3.3), v3(0.6, 1, 5.7), () => this.startEncounter(ctx), true, () => ctx.flags.has('ch1-hall-lit') && !ctx.flags.has('ch1-encounter-done'));

    this.checkpoints = {
      start: { pos: v3(-2.05, 0.8, -1.45), yaw: -Math.PI / 2 - 0.3 },
      lumo: { pos: v3(1.6, 0, -1.1), yaw: Math.PI / 2 },
      door: { pos: v3(1.65, 0, 2.6), yaw: 0 },
      hall: { pos: v3(1.5, 0, 4.4), yaw: Math.PI / 2 },
    };
  }

  begin(ctx: GameContext, checkpoint: string): void {
    const hush = ctx.enemies.hush!;
    this.melody?.start();
    if (!ctx.lumo.found) {
      ctx.lumo.setDormantAt(new THREE.Vector3(0.05, 0.08, -0.2), this.dresserDrawer.box);
    }
    if (checkpoint === 'start') {
      ctx.ui.objective('Find out where the melody is coming from');
      this.strike(ctx, true);
      ctx.ui.hint('WASD / stick to move, mouse / drag to look. Climb down from the bed.', 6);
    } else if (!ctx.lumo.found) {
      ctx.ui.objective('Something is glowing in the dresser');
    } else if (!this.door.isOpen) {
      ctx.ui.objective('Open the bedroom door');
    } else if (!ctx.flags.has('ch1-encounter-done')) {
      ctx.ui.objective('Cross the dark hallway');
    } else {
      ctx.ui.objective('Follow the melody: the laundry chute');
    }
    if (ctx.flags.has('ch1-encounter-done')) this.melody?.setVolume(0.5);
    hush.exitPoint = v3(4.75, 0, 4.4);
    hush.leaveAfterSearch = true;
  }

  private wakeLumo(ctx: GameContext): void {
    ctx.inventory.remove('lumo');
    ctx.flags.set('lumo-found');
    const lumo = ctx.lumo;
    lumo.wake(ctx);
    lumo.energy = 25;
    const p = ctx.player;
    p.mode = 'locked';
    const start = lumo.position.clone();
    const top = start.clone().add(v3(-0.2, 0.45, 0));
    ctx.ui.subtitle('[click… click… whirr]', 2.5);
    ctx.audio.play('lumoWake', { pos: start });
    ctx.cinematics.play(
      [
        {
          dur: 1.4,
          start: () => {
            lumo.hold(top);
            lumo.boost = 0;
            p.lookOverride = { target: start, weight: 0 };
          },
          update: (t) => {
            p.lookOverride!.weight = Math.min(1, t * 2) * 0.85;
            p.lookOverride!.target.lerpVectors(start, top, t);
          },
        },
        {
          dur: 1.6,
          start: () => {
            ctx.audio.play('lumoChirp', { pos: top });
            ctx.hands.set('cradle', 1.6);
          },
          update: (t) => {
            lumo.boost = Math.sin(t * Math.PI) * 0.6;
            const a = t * Math.PI * 2;
            const pt = top.clone().add(v3(Math.cos(a) * 0.35 - 0.35, Math.sin(t * Math.PI) * 0.15, Math.sin(a) * 0.35));
            lumo.hold(pt);
            p.lookOverride!.target.copy(pt);
          },
        },
        {
          dur: 0.6,
          update: (t) => {
            p.lookOverride!.weight = 0.85 * (1 - t);
          },
        },
      ],
      () => {
        p.lookOverride = null;
        p.mode = 'normal';
        lumo.boost = 0;
        lumo.release();
        ctx.ui.chapterCard('', 'LUMO');
        ctx.ui.hint('F (or the firefly button) turns LUMO’s light on and off. Light costs energy.', 6);
        ctx.ui.objective('LUMO is weak. Follow the glowing marks to its Nest.');
        ctx.checkpoint('lumo');
      },
      true,
    );
  }

  private onDoorOpened(ctx: GameContext): void {
    ctx.flags.set('ch1-door');
    ctx.ui.objective('Cross the dark hallway');
    this.after(1.2, () => ctx.checkpoint('door'));
  }

  private startEncounter(ctx: GameContext): void {
    if (this.encounterTimer >= 0) return;
    this.encounterTimer = 0;
    this.melody?.stop(1.2);
    ctx.ui.subtitle('[the melody stops]', 2.5);
    ctx.lumo.frighten(3);
    ctx.audio.play('creak', { pos: v3(4.9, -0.4, 4.6), volume: 1.2 });
  }

  private enterChute(ctx: GameContext): void {
    ctx.player.mode = 'locked';
    ctx.audio.play('chute');
    ctx.ui.subtitle('[down, down, down…]', 2);
    ctx.flags.set('ch1-complete');
    ctx.completeChapter();
  }

  protected tick(dt: number, ctx: GameContext): void {
    // Dying lantern flicker.
    const f = 0.5 + 0.35 * Math.sin(this.time * 2.1) * Math.sin(this.time * 7.3) + (ctx.rng() > 0.985 ? -0.4 : 0);
    this.lantern.light.intensity = Math.max(0.15, f) * 1.4;
    this.lantern.glass.emissiveIntensity = Math.max(0.2, f) * 1.4;
    this.root.traverse((o) => {
      if (o.userData.spin) o.rotation.y += dt * 0.15;
    });

    // Encounter script: warning, emerge, investigate, search, leave.
    const hush = ctx.enemies.hush!;
    if (this.encounterTimer >= 0 && !ctx.flags.has('ch1-encounter-done')) {
      const prev = this.encounterTimer;
      this.encounterTimer += dt;
      const at = (t: number) => prev < t && this.encounterTimer >= t;
      if (at(1.2)) ctx.audio.play('creak', { pos: v3(4.9, -0.3, 4.3), volume: 1.3 });
      if (at(2.0)) {
        ctx.ui.subtitle('[something is coming up the stairs]', 3);
        ctx.ui.hint('Hide! Crawl under the bed, or hide in a closet (E).', 5);
      }
      if (at(2.6)) ctx.audio.play('creak', { pos: v3(4.9, -0.1, 4.0), volume: 1.4 });
      if (at(4.2)) {
        hush.tuning.investigateSpeed = 1.1;
        hush.tuning.chaseSpeed = 1.75;
        hush.spawn(v3(4.85, 0, 4.0), -Math.PI / 2, 'scripted', ctx);
        this.hushEmergeT = 0;
        ctx.audio.play('hushWhisper', { pos: v3(4.85, 2, 4.0), volume: 1.2 });
        const target = ctx.player.position.clone();
        target.x = THREE.MathUtils.clamp(target.x, -3, 2.2);
        target.z = 4.4;
        hush.scriptTo([v3(4.85, 0, 4.4), v3(3.3, 0, 4.5)], 0.8, () => {
          hush.investigate(ctx, ctx.player.mode === 'hidden' || ctx.player.crawling ? v3(1.65, 0, 2.2) : ctx.player.position.clone());
        });
      }
      if (this.hushEmergeT >= 0) {
        this.hushEmergeT += dt;
        const k = Math.min(1, this.hushEmergeT / 2.2);
        hush.model.root.position.y = -1.6 * (1 - k * k * (3 - 2 * k));
        this.stairGlow.intensity = 0.6 * (1 - k * 0.5);
      }
      if (this.encounterTimer > 6 && !hush.active) {
        // It has gone back down: the way is clear.
        ctx.flags.set('ch1-encounter-done');
        this.stairGlow.intensity = 0;
        this.melody?.setVolume(0.5, 2);
        this.melody?.start();
        ctx.ui.subtitle('[the melody starts again, from inside the wall]', 3);
        ctx.ui.objective('Follow the melody: the laundry chute');
        ctx.checkpoint('hall');
      }
    }
  }
}
