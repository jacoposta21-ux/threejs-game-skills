import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Level, type Palette } from './Level';
import { v3, stormWindowMaterial, lightShaft, dustMotes, worldBox } from './LevelKit';
import { mat, glowChalkMaterial, plane, rbox, cyl, sphere, torus } from '../art/Materials';
import { tiles, wallpaper, woodPlanks, type GlyphKind } from '../art/Textures';
import * as P from './props/Props';
import * as K from './props/KitchenProps';
import { Door } from '../objects/Door';
import { PushableObject } from '../objects/PushableObject';
import { Pickup } from '../objects/Pickup';
import { HideSpot, HideVolume } from '../objects/HideSpot';
import { Perch, Examinable, Trigger } from '../objects/Fixtures';
import { Throwable } from '../objects/Throwable';
import { NavGrid } from '../enemies/NavGrid';

/**
 * Chapter 2. Kitchen x[-4.5,4.5] z[-3.75,3.75]; utility room west; pantry east;
 * hallway north (reached through a crawl hole behind the pantry flour sack).
 */
export class Kitchen extends Level {
  readonly id = 'kitchen' as const;
  readonly palette: Palette = {
    fog: '#0a1214',
    fogDensity: 0.06,
    hemiSky: '#4a6a78',
    hemiGround: '#1c2620',
    hemi: 0.5,
    ambient: '#1a2a2c',
    ambientIntensity: 0.38,
    exposure: 1.12,
    lift: [0.02, 0.035, 0.04],
    gain: [0.94, 1.02, 1.02],
    moonColor: '#9cc4d8',
    moonIntensity: 2.6,
    moonPos: v3(0.4, 6.5, 9.5),
    moonTarget: v3(-0.2, 0, -0.6),
    shadowExtent: 7.5,
    rain: 0.7,
    wind: 0.35,
    pad: 'kitchen',
    background: '#050909',
  };

  private radioDial!: THREE.MeshStandardMaterial;
  private radioLight!: THREE.PointLight;
  private pantryDoor!: Door;
  private sack!: PushableObject;
  private chaseTimer = -1;
  private hallChaseTimer = -1;
  private climbing = false;
  private holeArm: THREE.Group | null = null;
  private atticMelodyStarted = false;

  protected construct(ctx: GameContext): void {
    const b = this.b;
    const H = 2.75;
    const tile = mat('k-floor', { map: tiles('#8f9a92', '#5f6b66', '#2c3431', [1 / 0.6, 1 / 0.6]), roughness: 0.45 });
    const wood = mat('k-wood-floor', { map: woodPlanks('#5a4433', [1 / 0.9, 1 / 0.9]), roughness: 0.6 });
    const wall = mat('k-wall', { map: wallpaper('stripes', '#4c625c', '#435750', [1 / 0.8, 1 / 0.8]), roughness: 0.85 });
    const utilWall = mat('u-wall', { map: wallpaper('boards', '#5b6660', '#2f3634', [1 / 1.0, 1 / 1.0]), roughness: 0.9 });
    const pantryWall = mat('p-wall', { map: wallpaper('boards', '#4a3a2a', '#20160e', [1 / 1.0, 1 / 1.0]), roughness: 0.95 });
    const hallWall = mat('kh-wall', { map: wallpaper('damask', '#3b4a4a', '#4c5e5c', [1 / 0.8, 1 / 0.8]), roughness: 0.9 });
    const trim = mat('k-trim', { color: '#c9c6b4', roughness: 0.6 });
    const ceiling = mat('k-ceiling', { color: '#4a5552', roughness: 1 });

    // --- Floors & ceilings -------------------------------------------------------
    b.floor(-4.64, 4.64, -3.82, 3.82, tile, 'tile');
    b.floor(-7.6, -4.5, -0.6, 3.82, tile, 'tile');
    b.floor(4.5, 9.4, -3.82, -0.6, wood, 'wood');
    b.floor(-2.5, 9.4, -6.6, -3.75, wood, 'wood');
    b.ceiling(-4.7, 4.7, -3.9, 3.9, H, ceiling);
    b.ceiling(-7.7, -4.5, -0.7, 3.9, 2.5, ceiling);
    b.ceiling(4.5, 9.5, -3.9, -0.5, 2.4, ceiling);
    b.ceiling(-2.6, 9.5, -6.7, -3.8, H, ceiling);

    // --- Walls -------------------------------------------------------------------------
    // North wall: gate doorway to the hall, and the crawl hole behind the pantry sack.
    b.wall({ axis: 'x', at: -3.82, from: -4.71, to: 4.6, height: H, inside: 1, openings: [{ from: -2.2, to: -1.3, bottom: 0, top: 2.1 }] }, wall, trim);
    b.wall({ axis: 'x', at: -3.82, from: 4.6, to: 9.54, height: 2.4, inside: 1, openings: [{ from: 8.65, to: 9.25, bottom: 0, top: 0.52 }] }, pantryWall, trim);
    b.wall({ axis: 'x', at: 3.82, from: -7.74, to: 4.64, height: H, inside: -1, openings: [{ from: -2.8, to: -1.6, bottom: 1.0, top: 2.2 }, { from: 1.0, to: 2.2, bottom: 1.0, top: 2.2 }] }, wall, trim);
    b.wall({ axis: 'z', at: -4.57, from: -0.6, to: 3.82, height: H, inside: 1, openings: [{ from: 1.4, to: 2.4, bottom: 0, top: 2.1 }] }, wall, trim);
    b.wall({ axis: 'z', at: -4.57, from: -3.82, to: -0.6, height: H, inside: 1 }, wall, trim);
    b.wall({ axis: 'z', at: 4.57, from: -3.82, to: 3.82, height: H, inside: -1, openings: [{ from: -2.55, to: -1.65, bottom: 0, top: 2.05 }] }, wall, trim);
    // Utility room
    b.wall({ axis: 'z', at: -7.67, from: -0.67, to: 3.82, height: 2.5, inside: 1 }, utilWall, trim);
    b.wall({ axis: 'x', at: -0.67, from: -7.74, to: -4.5, height: 2.5, inside: 1 }, utilWall, trim);
    // Pantry
    b.wall({ axis: 'z', at: 9.47, from: -3.82, to: -0.53, height: 2.4, inside: -1 }, pantryWall, trim);
    b.wall({ axis: 'x', at: -0.53, from: 4.5, to: 9.54, height: 2.4, inside: -1 }, pantryWall, trim);
    // Hallway
    b.wall({ axis: 'x', at: -6.67, from: -2.64, to: 9.54, height: H, inside: 1, openings: [{ from: 0.4, to: 1.4, bottom: 1.0, top: 2.1 }] }, hallWall, trim);
    b.wall({ axis: 'z', at: -2.57, from: -6.67, to: -3.82, height: H, inside: 1 }, hallWall, trim);
    b.wall({ axis: 'z', at: 9.47, from: -6.67, to: -3.82, height: H, inside: -1 }, hallWall, trim);
    b.frame('z', 4.57, -2.55, -1.65, 0, 2.05, -1, trim);
    b.frame('x', -3.82, -2.2, -1.3, 0, 2.1, 1, trim);
    b.frame('z', -4.57, 1.4, 2.4, 0, 2.1, 1, trim);

    // --- Windows -------------------------------------------------------------------------
    for (const x of [-2.2, 1.6]) {
      const sky = plane(1.8, 1.7, stormWindowMaterial('#132226', '#24383a'));
      sky.position.set(x, 1.6, 4.15);
      sky.rotation.y = Math.PI;
      b.add(sky);
      const sash = P.windowSash(1.2, 1.2, P.M.paint('#d9d6c8', 0.5));
      sash.position.set(x, 1.0, 3.82);
      b.add(sash);
      for (const s of [-1, 1]) {
        const c = P.curtain(0.42, 0.75, '#7e9a7a');
        c.position.set(x + s * 0.5, 1.82, 3.7);
        b.add(c);
      }
      b.add(rbox(1.4, 0.04, 0.2, trim, 0.01, x, 0.96, 3.7));
      const shaft = lightShaft(1.2, 3.4, '#a8d0e0', 0.05);
      shaft.position.set(x, 2.2, 3.7);
      shaft.rotation.x = 0.8;
      shaft.rotation.y = Math.PI;
      b.add(shaft);
      this.shafts.push(shaft);
    }
    const plants = [v3(-2.6, 1.0, 3.66), v3(1.2, 1.0, 3.66)];
    for (const p of plants) {
      b.add(cyl(0.06, 0.05, 0.1, P.M.ceramic('#b56a3a'), 12, p.x, p.y, p.z));
      for (let i = 0; i < 5; i++) {
        const leaf = sphere(0.05, mat('leaf', { color: '#3f5a36', roughness: 0.8 }), 8, p.x + Math.cos(i * 1.3) * 0.04, p.y + 0.14 + i * 0.02, p.z + Math.sin(i * 1.3) * 0.04);
        leaf.scale.set(1, 0.4, 0.6);
        b.add(leaf);
      }
    }
    const dust = dustMotes(Math.floor(140 * ctx.particleScale), v3(-3, 0.3, 0.5), v3(2.5, 2.3, 3.6), '#c9e6ee');
    b.add(dust);
    this.dust.push(dust);

    // --- North counter run with hidden passage --------------------------------------------
    const run = K.counterRun(3.7, 0.6, 0.92, [1]);
    run.position.set(-0.6, 0, -3.15);
    b.add(run);
    // Counter slab (walkable), front panels with the sink-cabinet gap, west end panel.
    b.solid(1.25, 0.85, -3.45, 3.7, 0.07, 0.6, 'tile', true);
    b.solid(-0.3, 0, -3.18, 0.6, 0.85, 0.06, 'wood', false, { walkable: false });
    b.solid(1.85, 0, -3.18, 2.5, 0.85, 0.06, 'wood', false, { walkable: false });
    b.solid(-0.62, 0, -3.45, 0.04, 0.85, 0.6, 'wood', false, { walkable: false });
    b.add(worldBox(3.7, 0.02, 0.5, mat('cab-floor', { color: '#141a19', roughness: 1 }), 1.25, 0.0, -3.47));
    const passage = new HideVolume('cabinet-run', v3(-0.55, 0, -3.72), v3(3.1, 0.84, -3.2), v3(1.3, 0, -2.6), v3(1.3, 0.4, -3.4));
    const sinkDoor = new Door('sink-cabinet', {
      width: 0.58,
      height: 0.62,
      thickness: 0.03,
      hinge: v3(0.01, 0.13, -3.13),
      closedYaw: 0,
      openAngle: -1.7,
      handleHeight: 0.52,
      style: 'cabinet',
      color: '#6f8a83',
      noisy: false,
      needsReach: false,
      label: 'Open the cabinet',
    });
    this.register(sinkDoor);
    const sinkM = K.sink();
    sinkM.position.set(0.3, 0.92, -3.42);
    b.add(sinkM);
    const backs = K.backsplash(3.7, 0.53);
    backs.position.set(1.25, 1.185, -3.74);
    b.add(backs);
    const uppers = K.upperCabinets(3.7, 0.35, 0.72);
    uppers.position.set(-0.6, 1.45, -3.4);
    b.add(uppers);
    b.solid(1.25, 1.45, -3.58, 3.7, 0.76, 0.35, 'wood', false, { walkable: false });
    // Hanging utensil rail
    b.add(cyl(0.008, 0.008, 1.2, P.M.chrome(), 6, 2.2, 1.35, -3.7).rotateZ(Math.PI / 2));
    for (let i = 0; i < 5; i++) {
      const u = rbox(0.03, 0.22, 0.01, P.M.chrome(), 0.004, 1.7 + i * 0.25, 1.13, -3.7);
      b.add(u);
    }
    // Fridge in the corner
    const fr = K.fridge();
    fr.group.position.set(4.1, 0, -3.07);
    b.add(fr.group);
    b.solid(4.1, 0, -3.41, 0.8, 1.85, 0.68, 'metal', false, { walkable: false });
    const fridgeNote = P.paperNote('fridge-note');
    fridgeNote.position.set(3.9, 1.25, -3.065);
    fridgeNote.rotation.z = 0.05;
    b.add(fridgeNote);
    const fridgeEx = new Examinable('fridge-note', 'A recipe card, in Grandpa’s handwriting', 'LULLABY BOX — wind three times, never more. Keep the key where the bread is. If the house goes quiet, play it anyway.', '', 0.2, 0.25, 0.1, 'Read');
    fridgeEx.root.position.set(3.9, 1.35, -3.06);
    this.register(fridgeEx);
    const fd = P.drawing('house', 0.22, 0.22);
    fd.position.set(4.35, 0.75, -3.065);
    b.add(fd);

    // --- West counter with stove & radio (melody source) -------------------------------------
    const westRun = K.counterRun(1.4, 0.6, 0.92);
    westRun.rotation.y = Math.PI / 2;
    westRun.position.set(-3.9, 0, 0.4);
    b.add(westRun);
    b.solid(-4.2, 0, -0.3, 0.6, 0.92, 1.4, 'tile', true);
    const st = K.stove();
    st.rotation.y = Math.PI / 2;
    st.position.set(-3.9, 0, -1.4);
    b.add(st);
    b.solid(-4.2, 0, -1.4, 0.6, 0.92, 0.7, 'metal', false, { walkable: false });
    const radio = K.radio();
    radio.group.position.set(-4.25, 0.92, -0.35);
    radio.group.rotation.y = Math.PI / 2;
    b.add(radio.group);
    this.radioDial = radio.dial;
    this.radioLight = new THREE.PointLight('#7adf8a', 0.55, 2.6, 2);
    this.radioLight.position.set(-4.0, 1.05, -0.3);
    b.add(this.radioLight);
    b.add(cyl(0.2, 0.18, 0.04, P.M.ceramic('#d8d4c4'), 16, -4.2, 0.92, 0.25));

    // --- Island (with crawl-under overhang) -------------------------------------------------
    const island = K.counterRun(2.2, 0.75, 0.92);
    island.position.set(-0.9, 0, 0.2);
    b.add(island);
    b.add(rbox(2.3, 0.04, 1.2, mat('counter-top', { color: '#d9d4c7', roughness: 0.35 }), 0.01, 0.2, 0.88, -0.2));
    b.solid(0.2, 0, -0.175, 2.2, 0.92, 0.75, 'tile', true);
    b.solid(0.2, 0.88, -0.2, 2.3, 0.04, 1.2, 'tile', false);
    const underIsland = new HideVolume('island-overhang', v3(-0.9, 0, 0.2), v3(1.3, 0.85, 0.42), v3(0.2, 0, 1.1), v3(0.2, 0.3, 0.3));
    // Fruit bowl & cutting board
    b.add(rbox(0.4, 0.02, 0.28, P.M.wood('#b98a5e'), 0.005, 0.6, 0.92, -0.4));
    const bowl = K.jar('#c9a34a', 0.08);
    bowl.position.set(-0.3, 0.92, -0.5);
    b.add(bowl);

    // --- Dining table, chairs ------------------------------------------------------------------
    const table = K.diningTable(1.5, 1.0);
    table.position.set(-2.6, 0, 1.8);
    table.rotation.y = Math.PI / 2;
    b.add(table);
    b.solid(-2.6, 0.71, 1.8, 1.0, 0.05, 1.5, 'wood', true);
    for (const [x, z] of [[-3.05, 1.12], [-2.15, 1.12], [-3.05, 2.48], [-2.15, 2.48]]) b.solid(x, 0, z, 0.08, 0.71, 0.08, 'wood', false, { navBlock: true });
    const underTable = new HideVolume('under-table', v3(-3.1, 0, 1.05), v3(-2.1, 0.7, 2.55), v3(-1.5, 0, 1.8), v3(-2.6, 0.3, 1.8));
    const chairSpots: [string, number, number, number][] = [
      ['chair-n', -2.6, 0.75, 0],
      ['chair-s', -2.6, 2.85, Math.PI],
      ['chair-e', -1.6, 1.8, -Math.PI / 2],
    ];
    for (const [id, x, z, ry] of chairSpots) {
      const vis = P.chair(0.46, '#7b5a3f');
      vis.rotation.y = ry;
      const ch = new PushableObject(id, vis, {
        size: v3(0.46, 0.5, 0.46),
        position: v3(x, 0, z),
        climbable: true,
        label: 'the chair',
        onMoved: (c, pos) => {
          if (pos.z < -2.55 && pos.x > -0.75 && pos.x < 0.4 && !c.flags.has('k-chair-placed')) {
            c.flags.set('k-chair-placed');
            c.ui.hint('Climb onto the chair, then onto the counter (Space).', 4);
          }
        },
      });
      this.register(ch);
    }

    // --- Bread tin & pantry key on the counter ---------------------------------------------------
    const tin = new PushableObject('bread-tin', K.breadTin(), {
      size: v3(0.38, 0.3, 0.26),
      position: v3(0.0, 0.92, -3.45),
      climbable: false,
      label: 'the bread tin',
      axis: 'x',
      bounds: { min: new THREE.Vector2(-0.35, -4), max: new THREE.Vector2(2.6, 0) },
      scrape: 1,
    });
    this.register(tin);
    const keyVis = new THREE.Group();
    const ring = torus(0.025, 0.006, P.M.iron());
    ring.rotation.x = Math.PI / 2;
    keyVis.add(ring);
    keyVis.add(rbox(0.09, 0.008, 0.012, P.M.iron(), 0.003, 0.06, -0.004, 0));
    keyVis.add(rbox(0.012, 0.008, 0.025, P.M.iron(), 0.003, 0.095, -0.004, 0.012));
    const key = new Pickup('pantry-key', keyVis, {
      item: 'pantry-key',
      name: 'the pantry key',
      icon: 'key',
      minPlayerY: 0.8,
      onPicked: (c) => this.onKey(c),
    });
    key.root.position.set(0.0, 0.935, -3.66);
    key.root.rotation.y = 0.4;
    this.register(key);

    // --- Pantry door --------------------------------------------------------------------------
    this.pantryDoor = new Door('pantry-door', {
      width: 0.88,
      height: 2.03,
      hinge: v3(4.57, 0, -2.55),
      closedYaw: -Math.PI / 2,
      openAngle: 1.5,
      handleHeight: 0.95,
      color: '#8a6a4a',
      locked: { item: 'pantry-key', message: 'Locked. There’s a little keyhole.' },
      oneWay: true,
      onOpen: (c) => this.onPantryOpen(c),
    });
    this.register(this.pantryDoor);

    // --- Pantry interior -----------------------------------------------------------------------
    const shelfN = K.pantryShelf(3.6, 1.9, 0.4, [0.3, 0.75, 1.2, 1.65], ctx.rng);
    shelfN.position.set(6.6, 0, -3.55);
    b.add(shelfN);
    b.solid(6.6, 0, -3.55, 3.6, 1.9, 0.4, 'wood', false, { walkable: false });
    const shelfS = K.pantryShelf(3.2, 1.6, 0.35, [0.35, 0.7, 1.1], ctx.rng);
    shelfS.position.set(7.4, 0, -0.78);
    b.add(shelfS);
    b.solid(7.4, 0, -0.78, 3.2, 1.6, 0.35, 'wood', false, { walkable: false });
    const cr = K.crate(0.5, 0.42, 0.42);
    cr.position.set(5.3, 0, -3.1);
    b.add(cr);
    b.solid(5.3, 0, -3.1, 0.5, 0.42, 0.42, 'wood', true);
    const cr2 = K.crate(0.5, 0.42, 0.42);
    cr2.position.set(6.4, 0, -1.25);
    cr2.rotation.y = 0.3;
    b.add(cr2);
    b.solid(6.4, 0, -1.25, 0.55, 0.42, 0.55, 'wood', true);
    // Flour sack in front of the crawl hole (pushable along x).
    this.sack = new PushableObject('flour-sack', K.flourSack(), {
      size: v3(0.6, 0.72, 0.5),
      position: v3(8.95, 0, -3.42),
      climbable: false,
      label: 'the flour sack',
      axis: 'x',
      bounds: { min: new THREE.Vector2(7.6, -4), max: new THREE.Vector2(8.96, 0) },
      surface: 'fabric',
      onMoved: (c, pos) => {
        if (pos.x < 8.45 && !c.flags.has('k-hole-found')) {
          c.flags.set('k-hole-found');
          c.ui.subtitle('[a small dark hole in the wall, just big enough to crawl through]', 3.5);
        }
      },
    });
    this.register(this.sack);
    // Crawl-hole surround (dark tunnel)
    b.add(worldBox(0.5, 0.52, 0.3, mat('hole-dark', { color: '#020202' }), 8.95, 0, -3.95));
    // Wind key on the south shelf, in a little open box
    const keyBox = rbox(0.18, 0.06, 0.12, P.M.wood('#3e2a1c'), 0.01, 0, 0, 0);
    const wkVis = new THREE.Group();
    wkVis.add(keyBox);
    const bow = torus(0.028, 0.006, mat('silver', { color: '#d8dde2', metalness: 1, roughness: 0.2 }));
    bow.position.set(-0.03, 0.075, 0);
    wkVis.add(bow);
    wkVis.add(rbox(0.08, 0.008, 0.01, mat('silver', { color: '#d8dde2', metalness: 1, roughness: 0.2 }), 0.003, 0.03, 0.07, 0));
    const wk = new Pickup('wind-key', wkVis, { item: 'wind-key', name: 'Grandpa’s wind key', icon: 'windkey', onPicked: (c) => this.onWindKey(c) });
    wk.root.position.set(8.55, 0.735, -0.8);
    this.register(wk);
    const wkNote = P.paperNote('wk-note', 0.12, 0.15);
    wkNote.position.set(8.3, 0.86, -0.61);
    b.add(wkNote);
    const wkEx = new Examinable('wk-note', 'A note tucked behind the jars', 'The box in the attic wants its key. Three turns. Then let the little light sit on top — it knows the song. — G.', '', 0.2, 0.2, 0.1, 'Read');
    wkEx.root.position.set(8.3, 0.95, -0.62);
    this.register(wkEx);
    const p1 = new Perch('pantry-a', v3(5.4, 1.15, -0.62), Math.PI);
    const p2 = new Perch('pantry-b', v3(9.36, 1.2, -2.1), -Math.PI / 2);
    this.register(p1);
    this.register(p2);
    ctx.hazards.addZone(
      { id: 'pantry-dark', min: new THREE.Vector2(4.66, -3.72), max: new THREE.Vector2(9.38, -0.65), deep: true, returnPos: v3(3.9, 0, -2.1), returnYaw: -Math.PI / 2 },
      this.root,
    );

    // --- Utility room ------------------------------------------------------------------------------
    const basket = new THREE.Group();
    basket.add(cyl(0.42, 0.36, 0.5, mat('wicker', { map: wallpaper('boards', '#a7814f', '#7a5a34', [4, 2]), roughness: 0.9 }), 18));
    for (let i = 0; i < 6; i++) {
      const cloth = sphere(0.2, P.M.fabric(['#d9d2c4', '#7a8fb5', '#c98a6a', '#e6e0d0'][i % 4]), 10, Math.cos(i) * 0.15, 0.46, Math.sin(i) * 0.15);
      cloth.scale.set(1, 0.4, 0.8);
      basket.add(cloth);
    }
    basket.position.set(-6.6, 0, 3.0);
    b.add(basket);
    b.solid(-6.6, 0, 3.0, 0.8, 0.48, 0.8, 'fabric', true);
    b.add(worldBox(0.7, 0.05, 0.7, mat('chute-dark', { color: '#030304' }), -6.6, 2.46, 3.0));
    const wm = K.washingMachine();
    wm.position.set(-7.25, 0, 1.2);
    wm.rotation.y = Math.PI / 2;
    b.add(wm);
    b.solid(-7.25, 0, 1.2, 0.6, 0.86, 0.62, 'metal', true);
    const ushelf = K.pantryShelf(1.6, 1.8, 0.35, [0.5, 1.0, 1.5], ctx.rng);
    ushelf.position.set(-6.0, 0, -0.42);
    b.add(ushelf);
    b.solid(-6.0, 0, -0.42, 1.6, 1.8, 0.35, 'wood', false, { walkable: false });
    const buck = K.bucket();
    buck.position.set(-5.1, 0, 0.3);
    b.add(buck);
    b.solid(-5.1, 0, 0.3, 0.32, 0.31, 0.32, 'metal', false);
    // Tall cupboard (hide spot)
    b.add(rbox(0.6, 2.0, 0.55, P.M.paint('#6a7a74', 0.6), 0.02, -7.32, 0, -0.05));
    b.add(rbox(0.02, 1.8, 0.5, P.M.paint('#5a6a64', 0.6), 0.005, -7.0, 0.1, -0.05));
    b.solid(-7.32, 0, -0.05, 0.6, 2.0, 0.55, 'wood', false, { walkable: false });
    const cupboard = new HideSpot('util-cupboard', v3(-7.32, 0.6, -0.05), -Math.PI / 2, v3(-6.75, 0, -0.05), -Math.PI / 2, v3(-6.4, 0, -0.05), v3(-7.3, 0.8, -0.05));
    cupboard.addHitBox(0.1, 1.5, 0.5, -7.0, 0.2, -0.05);
    this.register(cupboard);
    const blockT = new Throwable('k-block', P.toyBlock('B', '#4c78b8'), 'the toy block', 'thunk');
    blockT.root.position.set(-5.9, 0.055, 2.2);
    this.register(blockT);
    // Spoons scattered by the island (clutter trap) and two throwable spoons.
    for (let i = 0; i < 5; i++) {
      const s = K.spoon();
      s.position.set(1.7 + i * 0.13, 0.008, 0.85 + (i % 2) * 0.1);
      s.rotation.y = i * 1.1;
      b.add(s);
    }
    this.trap('clutter', v3(1.5, -0.1, 0.7), v3(2.4, 0.2, 1.1), 8);
    const tray = cyl(0.22, 0.22, 0.015, P.M.chrome(), 20, -3.9, 0, 2.95);
    b.add(tray);
    this.trap('tray', v3(-4.2, -0.1, 2.65), v3(-3.6, 0.2, 3.25), 8);
    const spoonA = new Throwable('spoon-a', K.spoon(), 'the spoon', 'clatter');
    spoonA.root.position.set(-1.0, 0.012, 2.2);
    this.register(spoonA);
    const spoonB = new Throwable('spoon-b', K.spoon(), 'the spoon', 'clatter');
    spoonB.root.position.set(2.9, 0.012, -2.2);
    this.register(spoonB);

    // --- Hallway ---------------------------------------------------------------------------------------
    const gateVis = K.babyGate(0.92, 0.72);
    gateVis.position.set(-1.75, 0, -3.82);
    b.add(gateVis);
    b.solid(-1.75, 0, -3.82, 0.92, 0.75, 0.1, 'wood', false, { navBlock: false, occluder: false, walkable: false });
    const gateEx = new Examinable('baby-gate', 'A baby gate', 'Click-clack. It won’t open, and it is far too tall to climb.', '', 0.9, 0.7, 0.12, 'Try the gate');
    gateEx.root.position.set(-1.75, 0.72, -3.7);
    this.register(gateEx);
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.9), mat('k-runner', { map: wallpaper('damask', '#3a2424', '#5a3a2a', [3, 1]), roughness: 1 }));
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(3.4, 0.007, -5.2);
    b.add(runner);
    const hooks = K.coatHooks();
    hooks.position.set(-1.0, 1.6, -6.6);
    b.add(hooks);
    const hallSky = plane(1.4, 1.4, stormWindowMaterial('#141c2a', '#26304a'));
    hallSky.position.set(0.9, 1.55, -7.0);
    b.add(hallSky);
    const hallSash = P.windowSash(1.0, 1.1, P.M.paint('#d9d6c8', 0.5));
    hallSash.position.set(0.9, 1.0, -6.67);
    b.add(hallSash);
    const ladder = K.atticLadder(H);
    ladder.position.set(5.5, 0, -5.0);
    b.add(ladder);
    b.solid(5.5, 0, -5.45, 0.6, 1.2, 0.9, 'wood', false, { walkable: false, navBlock: true });
    const ladderTrig = new Trigger('ladder', 'Climb up to the attic', (c) => this.climbLadder(c), 0.7, 1.0, 0.4);
    ladderTrig.root.position.set(5.5, 1.0, -4.9);
    this.register(ladderTrig);
    const sideboard = P.dresserCarcass(1.0, 0.85, 0.42, '#5b3b27');
    sideboard.position.set(7.6, 0, -6.4);
    b.add(sideboard);
    b.solid(7.6, 0, -6.4, 1.04, 0.85, 0.45, 'wood', true);
    const phH = P.photoFrame('grandpa', 0.16, 0.2);
    phH.position.set(7.6, 1.2, -6.6);
    b.add(phH);

    // --- Glow chalk -------------------------------------------------------------------------------------
    const chalk = (kind: GlyphKind, x: number, y: number, z: number, rx: number, ry: number, s = 0.24) => {
      const m = plane(s, s, glowChalkMaterial(kind));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      m.renderOrder = 2;
      b.add(m);
    };
    chalk('key', 0.0, 1.25, -3.73, 0, 0, 0.26);
    chalk('arrow', -0.9, 0.012, -2.2, -Math.PI / 2, -Math.PI / 2 + 0.3);
    chalk('firefly', 0.3, 0.45, -3.11, 0, 0, 0.2);
    chalk('perch', 5.4, 1.55, -0.6, 0, Math.PI, 0.26);
    chalk('perch', 9.38, 1.6, -2.1, 0, -Math.PI / 2, 0.26);
    chalk('arrow', 8.3, 0.012, -3.0, -Math.PI / 2, 0, 0.3);
    chalk('heart', 8.55, 1.1, -0.6, 0, Math.PI, 0.22);

    // --- Navigation ----------------------------------------------------------------------------------
    const nav = new NavGrid(-7.7, -6.7, 9.5, 3.9, 0.25, [
      { minX: -4.57, minZ: -3.75, maxX: 4.57, maxZ: 3.75 },
      { minX: -7.6, minZ: -0.6, maxX: -4.57, maxZ: 3.75 },
      { minX: -4.8, minZ: 1.4, maxX: -4.3, maxZ: 2.4 },
      { minX: 4.3, minZ: -2.55, maxX: 4.8, maxZ: -1.65 },
      { minX: 4.64, minZ: -3.75, maxX: 9.4, maxZ: -0.6 },
      { minX: -2.2, minZ: -4.1, maxX: -1.3, maxZ: -3.5 },
      { minX: -2.5, minZ: -6.6, maxX: 9.4, maxZ: -3.89 },
    ]);
    const hush = ctx.enemies.setup(nav, ctx);
    hush.spots = [underTable, passage, underIsland, cupboard];
    hush.perches = [p1, p2];
    hush.patrol = [v3(-1.2, 0, 1.3), v3(2.4, 0, 1.6), v3(3.3, 0, -1.4), v3(-0.9, 0, -2.3), v3(-2.8, 0, -0.6)];
    hush.tuning.patrolSpeed = 0.95;
    hush.tuning.investigateSpeed = 1.35;
    hush.tuning.chaseSpeed = 1.85;

    this.melody = ctx.audio.createMelody(v3(-4.25, 1.05, -0.35), 0.55);

    this.zone('kitchen-enter', v3(-5.0, -0.2, 0.9), v3(-4.2, 1, 2.8), () => {
      if (!ctx.flags.has('k-entered')) {
        ctx.flags.set('k-entered');
        ctx.ui.subtitle('[the melody is coming from an old radio]', 3);
        ctx.ui.hint('It hears you walk. Crawl (C) to move quietly. Avoid spoons and trays on the floor.', 5);
      }
    });
    this.zone('pantry-locked-hint', v3(3.6, -0.2, -2.6), v3(4.5, 1, -1.6), () => {
      if (!ctx.inventory.has('pantry-key') && !this.pantryDoor.isOpen) ctx.ui.objective('The pantry is locked. Where would Grandpa keep the key?');
    });
    this.zone('hall-arrive', v3(8.4, -0.2, -4.6), v3(9.4, 1, -3.85), () => this.onHall(ctx), true, () => ctx.flags.has('k-wind-key'));

    this.checkpoints = {
      start: { pos: v3(-6.6, 0.5, 3.0), yaw: -Math.PI / 2 - 0.4 },
      key: { pos: v3(-0.6, 0, -2.4), yaw: Math.PI / 2 + 0.6 },
      pantry: { pos: v3(4.3, 0, -2.1), yaw: -Math.PI / 2 },
      hall: { pos: v3(8.95, 0, -4.3), yaw: Math.PI / 2, crawl: true },
    };
  }

  begin(ctx: GameContext, checkpoint: string): void {
    const hush = ctx.enemies.hush!;
    const radioOn = !ctx.flags.has('k-wind-key');
    this.radioDial.emissiveIntensity = radioOn ? 1.4 : 0;
    this.radioLight.intensity = radioOn ? 0.55 : 0;
    if (radioOn) this.melody?.start();
    switch (checkpoint) {
      case 'start':
        ctx.ui.objective('Follow the melody');
        ctx.ui.hint('Soft landing. Something is moving in the kitchen…', 4);
        this.strike(ctx, false);
        hush.spawn(v3(1.0, 0, 1.4), 0.6, 'patrol', ctx);
        break;
      case 'key':
        ctx.ui.objective('Unlock the pantry');
        this.setGuard(ctx, true);
        break;
      case 'pantry':
        ctx.ui.objective('Find what the melody was hiding');
        hush.spawn(v3(-2.8, 0, -0.6), 0, 'patrol', ctx);
        break;
      case 'hall':
        ctx.ui.objective('Get to the attic ladder!');
        this.melody?.stop(0.1);
        this.hallChaseTimer = 0.5;
        break;
    }
  }

  private setGuard(ctx: GameContext, instant: boolean): void {
    const hush = ctx.enemies.hush!;
    hush.guard = { pos: v3(3.7, 0, -2.1), yaw: -Math.PI / 2 };
    hush.patrol = [];
    if (instant) hush.spawn(v3(3.7, 0, -1.4), -Math.PI / 2, 'guard', ctx);
    else if (hush.state !== 'chase') {
      hush.investigate(ctx, v3(3.3, 0, -2.1));
    }
    ctx.ui.hint('It’s guarding the pantry. Throw something far away to lure it off (pick up a spoon or block, then E / click).', 6);
  }

  private onKey(ctx: GameContext): void {
    ctx.ui.objective('Unlock the pantry');
    ctx.ui.subtitle('[the radio crackles. Something in the kitchen stops and listens.]', 3.5);
    ctx.audio.play('hushWhisper', { pos: ctx.enemies.hush!.eye.clone(), volume: 0.8 });
    this.setGuard(ctx, false);
    this.after(0.3, () => ctx.checkpoint('key'));
  }

  private onPantryOpen(ctx: GameContext): void {
    ctx.flags.set('k-pantry-open');
    ctx.ui.objective('Find what the melody was hiding');
    const hush = ctx.enemies.hush!;
    hush.guard = null;
    hush.patrol = [v3(-1.2, 0, 1.3), v3(2.4, 0, 1.6), v3(3.3, 0, -1.4), v3(-0.9, 0, -2.3), v3(-2.8, 0, -0.6)];
    this.after(0.9, () => ctx.checkpoint('pantry'));
  }

  private onWindKey(ctx: GameContext): void {
    ctx.flags.set('k-wind-key');
    ctx.inventory.add('wind-key');
    this.melody?.stop(0.2);
    this.radioDial.emissiveIntensity = 0;
    this.radioLight.intensity = 0;
    ctx.audio.play('stinger', { volume: 0.4 });
    ctx.ui.subtitle('[the radio clicks off. Then: SHHHHHHHHH]', 3);
    ctx.ui.objective('Run! The hole behind the flour sack!');
    this.chaseTimer = 0;
  }

  private onHall(ctx: GameContext): void {
    if (ctx.flags.has('k-hall')) return;
    ctx.flags.set('k-hall');
    const hush = ctx.enemies.hush!;
    // It can't fit through the hole: a long arm reaches after you.
    hush.despawn(ctx);
    this.spawnHoleArm();
    ctx.audio.play('hushWhisper', { pos: v3(8.95, 0.3, -3.7), volume: 1.4 });
    ctx.ui.objective('Get to the attic ladder!');
    this.after(0.2, () => ctx.checkpoint('hall'));
    this.hallChaseTimer = 2.8;
  }

  private spawnHoleArm(): void {
    const arm = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: '#030205' });
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.9, 6), m);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = -0.45;
    arm.add(fore);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.22, 4), m);
      f.rotation.x = -Math.PI / 2;
      f.position.set((i - 1.5) * 0.02, 0, -1.0);
      arm.add(f);
    }
    arm.position.set(8.95, 0.22, -3.6);
    arm.userData.t = 0;
    this.root.add(arm);
    this.holeArm = arm;
  }

  private climbLadder(ctx: GameContext): void {
    if (this.climbing) return;
    this.climbing = true;
    const hush = ctx.enemies.hush!;
    hush.despawn(ctx);
    const p = ctx.player;
    p.mode = 'locked';
    ctx.audio.play('climb');
    const from = p.position.clone();
    ctx.cinematics.play(
      [
        {
          dur: 0.5,
          update: (t) => {
            p.position.lerpVectors(from, v3(5.5, 0.1, -4.95), t);
            p.lookOverride = { target: v3(5.5, 2.8, -6.0), weight: t * 0.8 };
          },
        },
        {
          dur: 1.8,
          start: () => ctx.hands.set('climb', 2),
          update: (t) => {
            p.position.set(5.5, 0.1 + t * 2.4, -4.95 - t * 0.8);
            if (Math.floor(t * 6) !== Math.floor((t - 0.02) * 6)) ctx.audio.play('step', { surface: 'wood', volume: 0.6 });
          },
        },
      ],
      () => {
        p.lookOverride = null;
        ctx.completeChapter();
      },
    );
  }

  protected tick(dt: number, ctx: GameContext): void {
    const hush = ctx.enemies.hush!;
    // Wind key taken: THE HUSH comes for you.
    if (this.chaseTimer >= 0) {
      this.chaseTimer += dt;
      if (this.chaseTimer > 1.4 && !ctx.flags.has('k-hall')) {
        this.chaseTimer = -1;
        if (!hush.active) hush.spawn(v3(-2.8, 0, -0.6), 0, 'chase', ctx);
        hush.tuning.chaseSpeed = 1.7;
        hush.startChase(ctx);
      }
    }
    if (this.holeArm) {
      const a = this.holeArm;
      a.userData.t += dt;
      const t = a.userData.t as number;
      a.position.z = -3.6 - Math.min(0.55, t * 1.4) + Math.max(0, t - 1.6) * 1.2;
      a.rotation.y = Math.sin(t * 7) * 0.15;
      if (t > 2.4) {
        a.removeFromParent();
        this.holeArm = null;
      }
    }
    if (this.hallChaseTimer > 0) {
      this.hallChaseTimer -= dt;
      if (this.hallChaseTimer <= 0 && !this.climbing) {
        hush.tuning.chaseSpeed = 1.6;
        hush.spawn(v3(-1.75, 0, -4.4), -Math.PI / 2, 'chase', ctx);
        hush.startChase(ctx);
        ctx.audio.play('hushWhisper', { pos: v3(-1.75, 2, -4.4), volume: 1.3 });
        ctx.ui.subtitle('[it came around through the gate]', 2.5);
      }
    }
    if (ctx.flags.has('k-hall') && !this.atticMelodyStarted && ctx.player.position.x < 7.5) {
      this.atticMelodyStarted = true;
      const m = ctx.audio.createMelody(v3(5.5, 3.2, -6.0), 0.3);
      if (m) {
        m.start();
        m.detune = -30;
        ctx.audio.releaseMelody(this.melody);
        this.melody = m;
      }
    }
  }
}
