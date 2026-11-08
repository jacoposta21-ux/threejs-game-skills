import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { bakeCharacter } from './AnimBaker.js';
import { allBlocks, LINES, terrainHeight, blockDistrict } from '../world/Layout.js';
import { clamp, damp, dampAngle } from '../utils/random.js';
import { makeWeaponMesh } from '../combat/Weapons.js';

// Pedestrians. They walk a sidewalk graph (block corners + signalised crossings),
// wait for the walk phase, cross, idle at shop windows, chat in pairs, and react
// to the player: startle when bumped, flee from speeding cars, get knocked down
// when hit. A small state machine per NPC, distance-based update rates, pooled.

const OUTFITS = ['npc_m_casual', 'npc_m_casual2', 'npc_m_suit', 'npc_m_worker', 'npc_m_punk', 'npc_w_casual', 'npc_w_formal', 'npc_w_suit', 'npc_w_punk'];
const CLIPS = ['Idle_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Idle_Talking_Loop', 'Death01', 'Hit_Chest'];
// extra clips per outfit: men can throw punches, the combat bases also hold pistols, women dance
const FIGHT = ['Punch_Jab', 'Punch_Cross'];
const GUN = ['Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot'];
const EXTRA = {
  npc_m_casual: [...FIGHT, 'Dance_Loop'], npc_m_casual2: FIGHT, npc_m_suit: [...FIGHT, ...GUN], npc_m_worker: [...FIGHT, ...GUN], npc_m_punk: [...FIGHT, ...GUN],
  npc_w_casual: ['Dance_Loop'], npc_w_formal: ['Dance_Loop'], npc_w_suit: [], npc_w_punk: ['Dance_Loop'],
};
// combatant variants: recoloured outfits (material name -> colour)
const VARIANTS = {
  cop: { base: 'npc_m_worker', recolor: { Worker_Yellow: 0x0b1530, Worker_Vest: 0x050913, LightBrown: 0x0a1226, Brown: 0x101010, Brown2: 0x101010 } },
  thug: { base: 'npc_m_punk', recolor: { Red: 0x2a2a2a, Red_Dark: 0x7a1020 } },
  guard: { base: 'npc_m_suit', recolor: {} },
  boss: { base: 'npc_m_suit', recolor: { Suit: 0xd8d4cc, Tie: 0x7a1020 } },
};
const INSET = 3; // sidewalk path distance from the curb
const RADIUS = 0.32;
const MAX_NPCS = 26;

export const NPC_STATE = { IDLE: 'IDLE', WALKING: 'WALKING', WAITING: 'WAITING', CROSSING: 'CROSSING', FLEEING: 'FLEEING', INTERACTING: 'INTERACTING', KNOCKED: 'KNOCKED', DOWN: 'DOWN', FIGHT: 'FIGHT', COMBAT: 'COMBAT', ACTOR: 'ACTOR' };

export class NPCSystem {
  constructor(game, assets) {
    this.game = game;
    this.scene = game.scene;
    this.rng = Math.random;
    this.baked = [];
    this.bakedByKey = {};
    for (const key of OUTFITS) {
      if (!assets[key] || !assets.anim) continue;
      try {
        const b = bakeCharacter(assets.anim, assets[key], [...CLIPS, ...(EXTRA[key] || [])]);
        if (b) { b.key = key; b.female = key.includes('_w_'); b.variant = { key, baked: b, recolor: null, tint: true }; this.baked.push(b); this.bakedByKey[key] = b; }
      } catch (e) {
        console.warn('[npc] bake failed', key, e);
      }
    }
    this.variants = {};
    for (const [kind, v] of Object.entries(VARIANTS)) {
      const b = this.bakedByKey[v.base];
      if (b) this.variants[kind] = { key: kind, baked: b, recolor: v.recolor, tint: false };
    }
    this.buildGraph();
    this.npcs = [];
    this.pool = [];
    this.pools = {};
    this.actors = [];
    game.events.on('shotsFired', (e) => this.panic(e.x, e.z, 48));
    this.spawnTimer = 0;
    this.frame = 0;
    this.threatTimer = 0;
  }

  // ------------------------------------------------------------ sidewalk graph
  buildGraph() {
    const nodes = new Map();
    const node = (id, x, z) => { if (!nodes.has(id)) nodes.set(id, { id, x, z, edges: [] }); return nodes.get(id); };
    const link = (a, b, cross = null) => { a.edges.push({ to: b, cross }); b.edges.push({ to: a, cross: cross && { ...cross, reverse: true } }); };
    const blocks = allBlocks();
    const byIJ = new Map(blocks.map((b) => [`${b.i},${b.j}`, b]));
    for (const b of blocks) {
      const nw = node(`${b.i},${b.j},0`, b.minX + INSET, b.minZ + INSET);
      const ne = node(`${b.i},${b.j},1`, b.maxX - INSET, b.minZ + INSET);
      const se = node(`${b.i},${b.j},2`, b.maxX - INSET, b.maxZ - INSET);
      const sw = node(`${b.i},${b.j},3`, b.minX + INSET, b.maxZ - INSET);
      link(nw, ne); link(ne, se); link(se, sw); link(sw, nw);
      b.nodes = [nw, ne, se, sw];
    }
    for (const b of blocks) {
      const [nw, ne, se, sw] = b.nodes;
      const east = byIJ.get(`${b.i + 1},${b.j}`);
      const south = byIJ.get(`${b.i},${b.j + 1}`);
      if (east) {
        // crossing a N-S road at x = LINES[i+1]
        link(ne, east.nodes[0], { axis: 'ns', i: b.i + 1, j: b.j, a: { x: b.maxX - 0.4, z: ne.z }, b: { x: east.minX + 0.4, z: ne.z } });
        link(se, east.nodes[3], { axis: 'ns', i: b.i + 1, j: b.j + 1, a: { x: b.maxX - 0.4, z: se.z }, b: { x: east.minX + 0.4, z: se.z } });
      }
      if (south) {
        link(sw, south.nodes[0], { axis: 'ew', i: b.i, j: b.j + 1, a: { x: sw.x, z: b.maxZ - 0.4 }, b: { x: sw.x, z: south.minZ + 0.4 } });
        link(se, south.nodes[1], { axis: 'ew', i: b.i + 1, j: b.j + 1, a: { x: se.x, z: b.maxZ - 0.4 }, b: { x: se.x, z: south.minZ + 0.4 } });
      }
    }
    this.nodes = [...nodes.values()];
  }

  // ------------------------------------------------------------ pooling
  create(variant) {
    const baked = variant.baked;
    if (!variant.proto) variant.proto = mergeCharacter(baked.gltf.scene, variant.recolor);
    const model = skeletonClone(variant.proto);
    const h = 0.93 + Math.random() * 0.12;
    model.scale.setScalar(baked.scale * h);
    model.position.y = baked.offsetY * h;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        // light per-NPC tint so repeated outfits read as different people
        if (variant.tint) o.material.color.setHSL(0.08 + Math.random() * 0.5, Math.random() * 0.12, 0.92 + Math.random() * 0.08);
      }
    });
    const root = new THREE.Group();
    root.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const npc = {
      root, model, mixer, baked, actions: {}, current: null, currentName: '',
      pos: new THREE.Vector3(), heading: 0, speed: 0, vel: new THREE.Vector2(),
      state: NPC_STATE.WALKING, timer: 0, path: [], node: null, prevNode: null, cross: null,
      walkSpeed: 1.2, threat: null, partner: null, animAcc: 0, shadowOn: true, active: false, formal: Math.random() < 0.3,
      variant, role: null, health: 100, maxHealth: 100, brave: false, weapon: null, weaponMesh: null, hand: findBone(model, 'Hand.R'), fore: findBone(model, 'LowerArm.R'),
      attackT: -1, attackCd: 0, losT: 0, los: false, fireCd: 1, opts: {}, downAt: 0,
    };
    for (const [name, clip] of Object.entries(baked.clips)) npc.actions[name] = mixer.clipAction(clip);
    return npc;
  }

  play(npc, name, { fade = 0.25, once = false, timeScale = 1 } = {}) {
    const a = npc.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (npc.currentName === name) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.play();
    if (npc.current) npc.current.crossFadeTo(a, fade, false);
    npc.current = a;
    npc.currentName = name;
  }

  spawn(node, variant = null, force = false) {
    if (!this.baked.length) return null;
    let npc = variant ? (this.pools[variant.key] || []).pop() : this.pool.pop();
    if (!npc) {
      if (!force && this.civCount() >= MAX_NPCS) return null;
      npc = this.create(variant || this.baked[Math.floor(Math.random() * this.baked.length)].variant);
    }
    npc.active = true;
    npc.role = null; npc.health = npc.maxHealth = 100; npc.weapon = null; npc.attackT = -1; npc.attackCd = 0; npc.opts = {}; npc.afterBump = false;
    npc.flinch = 0; npc.angry = false; npc.alerted = false; npc.leave = false; npc.goal = null; npc.vel.set(0, 0);
    npc.brave = !npc.baked.female && Math.random() < 0.4;
    if (npc.weaponMesh) npc.weaponMesh.visible = false;
    npc.pos.set(node.x + (Math.random() - 0.5) * 1.2, 0, node.z + (Math.random() - 0.5) * 1.2);
    npc.pos.y = terrainHeight(npc.pos.x, npc.pos.z);
    npc.node = node;
    npc.prevNode = null;
    npc.path = [];
    npc.cross = null;
    npc.partner = null;
    npc.walkSpeed = 1.05 + Math.random() * 0.45;
    npc.state = NPC_STATE.WALKING;
    npc.timer = 0;
    this.chooseNext(npc);
    this.scene.add(npc.root);
    npc.root.visible = true;
    this.npcs.push(npc);
    this.play(npc, npc.formal ? 'Walk_Formal_Loop' : 'Walk_Loop', { fade: 0 });
    npc.mixer.update(Math.random() * 2);
    return npc;
  }

  despawn(npc) {
    npc.active = false;
    if (npc.partner) { npc.partner.partner = null; npc.partner = null; }
    this.scene.remove(npc.root);
    if (npc.weaponMesh) npc.weaponMesh.visible = false;
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    const ai = this.actors.indexOf(npc);
    if (ai >= 0) this.actors.splice(ai, 1);
    if (npc.variant.tint) this.pool.push(npc);
    else (this.pools[npc.variant.key] = this.pools[npc.variant.key] || []).push(npc);
  }

  civCount() {
    let n = 0;
    for (const x of this.npcs) if (!x.role) n++;
    return n;
  }

  /** Spawns a fleeing NPC at a point (e.g. a driver thrown out of a car). */
  spawnAt(x, z, fleeFrom) {
    const node = this.nearestNode(x, z);
    const npc = this.spawn(node);
    if (!npc) return null;
    npc.pos.set(x, terrainHeight(x, z), z);
    this.flee(npc, fleeFrom, 8);
    return npc;
  }

  nearestNode(x, z) {
    let best = this.nodes[0], bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ------------------------------------------------------------ behaviour
  chooseNext(npc) {
    const n = npc.node;
    const options = n.edges.filter((e) => e.to !== npc.prevNode);
    const list = options.length ? options : n.edges;
    // crossings are a little less likely than continuing round the block
    const weighted = [];
    for (const e of list) for (let k = 0; k < (e.cross ? 2 : 3); k++) weighted.push(e);
    const e = weighted[Math.floor(Math.random() * weighted.length)];
    npc.prevNode = n;
    npc.node = e.to;
    if (e.cross) {
      const c = e.cross;
      const from = c.reverse ? c.b : c.a, to = c.reverse ? c.a : c.b;
      npc.path = [{ x: from.x, z: from.z, wait: c }, { x: to.x, z: to.z, crossEnd: true }, { x: e.to.x, z: e.to.z }];
    } else {
      // walk along the side with a little lateral jitter so people don't line up
      const j = (Math.random() - 0.5) * 1.2;
      const dx = e.to.x - n.x, dz = e.to.z - n.z, L = Math.hypot(dx, dz) || 1;
      npc.path = [{ x: e.to.x - (dz / L) * j, z: e.to.z + (dx / L) * j }];
    }
  }

  flee(npc, from, duration = 6) {
    if (npc.state === NPC_STATE.KNOCKED || npc.state === NPC_STATE.DOWN || npc.role) return;
    if (npc.partner) { npc.partner.partner = null; if (npc.partner.state === NPC_STATE.INTERACTING) npc.partner.state = NPC_STATE.WALKING; npc.partner = null; }
    npc.state = NPC_STATE.FLEEING;
    npc.timer = duration;
    npc.threat = { x: from.x, z: from.z };
    this.play(npc, 'Sprint_Loop', { fade: 0.15 });
  }

  knock(npc, vx, vz, speed, byPlayer = false) {
    if (npc.state === NPC_STATE.KNOCKED || npc.state === NPC_STATE.DOWN) return;
    // being run over hurts: fast hits keep people down for good
    npc.health -= speed * 6.5;
    if (npc.health <= 0) {
      this.down(npc, { x: npc.pos.x - vx, z: npc.pos.z - vz }, 'vehicle', speed);
      for (const o of this.npcs) if (o !== npc && !o.role && (o.pos.x - npc.pos.x) ** 2 + (o.pos.z - npc.pos.z) ** 2 < 900) this.flee(o, npc.pos, 7 + Math.random() * 4);
      if (byPlayer) this.game.events.emit('pedestrianHit', { npc, speed, downed: true });
      this.game.audio.thud(Math.min(1, speed / 15));
      return;
    }
    npc.state = NPC_STATE.KNOCKED;
    npc.timer = 3.6;
    npc.vel.set(vx, vz).normalize().multiplyScalar(Math.min(9, speed * 0.6));
    npc.heading = Math.atan2(-vx, -vz);
    this.play(npc, 'Death01', { fade: 0.08, once: true });
    this.game.audio.thud(Math.min(1, speed / 15));
    // everyone nearby panics
    for (const o of this.npcs) {
      if (o === npc || o.state === NPC_STATE.KNOCKED) continue;
      if ((o.pos.x - npc.pos.x) ** 2 + (o.pos.z - npc.pos.z) ** 2 < 900) this.flee(o, npc.pos, 7 + Math.random() * 4);
    }
    if (byPlayer) this.game.events.emit('pedestrianHit', { npc, speed });
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    this.frame++;
    // population target: district + time of day ("daily routine")
    const district = blockDistrictAt(p.x, p.z);
    const hour = g.world.timeOfDay;
    const night = hour < 6 || hour > 21;
    const late = hour >= 1 && hour < 5.5;
    const base = { downtown: 22, nightlife: night ? 26 : 16, midtown: 20, beach: night ? 10 : 20, sand: night ? 6 : 18, apartments: 12, residential: 8, park: night ? 4 : 14, industrial: night ? 3 : 8 }[district] ?? 12;
    const target = Math.min(MAX_NPCS, Math.round(base * (late ? 0.35 : 1) * (g.perfScale ?? 1)));

    // spawn / despawn
    this.spawnTimer -= dt;
    const civ = this.civCount();
    if (this.spawnTimer <= 0 && civ < target) {
      this.spawnTimer = 0.25;
      const cam = g.camera.position;
      const fwd = new THREE.Vector3(); g.camera.getWorldDirection(fwd);
      for (let tries = 0; tries < 12; tries++) {
        const n = this.nodes[Math.floor(Math.random() * this.nodes.length)];
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < 30 || d > 85) continue;
        const inView = (n.x - cam.x) * fwd.x + (n.z - cam.z) * fwd.z > 0;
        if (inView && d < 60) continue;
        this.spawn(n);
        break;
      }
    }
    let downs = 0;
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (n.role) {
        if (n.role === 'actor') continue;
        if (n.opts.mission && n.state !== NPC_STATE.DOWN) continue;
        if (d > 170 || (n.state === NPC_STATE.DOWN && d > 90) || n.leave && d > 60) this.despawn(n);
        continue;
      }
      if (n.state === NPC_STATE.DOWN) {
        // bodies stay where they fell; tidy the oldest ones away once out of sight
        downs++;
        if (d > 115 || (downs > 8 && d > 40 && g.playTime - n.downAt > 30)) this.despawn(n);
        continue;
      }
      if (d > 115 || (civ > target + 4 && d > 70)) this.despawn(n);
    }

    // threats (every 0.2 s): speeding player car heading at someone, sprinting player bump
    this.threatTimer -= dt;
    const scan = this.threatTimer <= 0;
    if (scan) this.threatTimer = 0.2;
    const pv = g.player.vehicle;

    for (const npc of this.npcs) {
      const dist = Math.hypot(npc.pos.x - p.x, npc.pos.z - p.z);
      if (npc.role === 'actor') {
        // ambient actors (dancers, mission contacts): animate only when close
        npc.root.visible = dist < 110;
        if (dist < 70) { npc.animAcc += dt; if (this.frame % (dist < 30 ? 1 : 2) === 0) { npc.mixer.update(npc.animAcc); npc.animAcc = 0; } }
        continue;
      }
      if (npc.state === NPC_STATE.DOWN) {
        npc.pos.x += npc.vel.x * dt; npc.pos.z += npc.vel.y * dt;
        npc.vel.multiplyScalar(Math.exp(-5 * dt));
        npc.animAcc += dt;
        if (npc.currentName === 'Death01' && npc.current && npc.current.time < npc.current.getClip().duration) { npc.mixer.update(npc.animAcc); npc.animAcc = 0; }
        npc.root.position.copy(npc.pos);
        npc.root.rotation.y = npc.heading;
        continue;
      }
      if (scan && pv && npc.state !== NPC_STATE.KNOCKED && !npc.role) {
        const vs = Math.hypot(pv.vel.x, pv.vel.y);
        if (vs > 7 && dist < 16) {
          const toN = { x: npc.pos.x - pv.pos.x, z: npc.pos.z - pv.pos.z };
          const along = (toN.x * pv.vel.x + toN.z * pv.vel.y) / vs;
          const lateral = Math.abs((toN.x * pv.vel.y - toN.z * pv.vel.x) / vs);
          if (along > 0 && lateral < 4 && npc.state !== NPC_STATE.FLEEING) this.flee(npc, pv.pos, 5);
        }
      }
      if (scan && g.player.vehicle && g.vehicles.hornAt && g.vehicles.hornAt > g.playTime - 0.3 && dist < 18 && npc.state !== NPC_STATE.FLEEING && npc.state !== NPC_STATE.KNOCKED) this.flee(npc, p, 3);
      if (npc.state === NPC_STATE.COMBAT || npc.state === NPC_STATE.FIGHT) this.thinkCombat(npc, dt, dist);
      else this.think(npc, dt, dist);
      this.move(npc, dt);
      // animation LOD: full rate near, a third of the frames far away
      npc.animAcc += dt;
      const step = dist < 35 ? 1 : dist < 70 ? 2 : 4;
      if (this.frame % step === 0) { npc.mixer.update(npc.animAcc); npc.animAcc = 0; }
      const wantShadow = dist < 32;
      if (wantShadow !== npc.shadowOn) { npc.shadowOn = wantShadow; npc.model.traverse((o) => { if (o.isMesh) o.castShadow = wantShadow; }); }
      npc.root.position.copy(npc.pos);
      npc.root.rotation.y = npc.heading;
      if (npc.weapon && npc.weaponMesh) this.placeWeapon(npc, dist);
    }
  }

  think(npc, dt, distToPlayer) {
    const g = this.game;
    npc.timer -= dt;
    switch (npc.state) {
      case NPC_STATE.WALKING:
      case NPC_STATE.CROSSING: {
        const wp = npc.path[0];
        if (!wp) { this.chooseNext(npc); break; }
        if (wp.wait && npc.state === NPC_STATE.WALKING && Math.hypot(wp.x - npc.pos.x, wp.z - npc.pos.z) < 0.8) {
          npc.state = NPC_STATE.WAITING;
          npc.cross = wp.wait;
          npc.path.shift();
          break;
        }
        if (Math.hypot(wp.x - npc.pos.x, wp.z - npc.pos.z) < 0.7) {
          npc.path.shift();
          if (wp.crossEnd) npc.state = NPC_STATE.WALKING;
          if (!npc.path.length) {
            // occasional pauses: window shopping / looking around
            if (Math.random() < 0.15) { npc.state = NPC_STATE.IDLE; npc.timer = 2 + Math.random() * 4; }
            else this.chooseNext(npc);
          }
        }
        // chance to start a chat with a passer-by
        if (npc.state === NPC_STATE.WALKING && !npc.partner && Math.random() < dt * 0.03) {
          for (const o of this.npcs) {
            if (o === npc || o.partner || o.state !== NPC_STATE.WALKING) continue;
            const d = Math.hypot(o.pos.x - npc.pos.x, o.pos.z - npc.pos.z);
            if (d < 3.2 && d > 0.9) {
              npc.partner = o; o.partner = npc;
              npc.state = o.state = NPC_STATE.INTERACTING;
              npc.timer = o.timer = 6 + Math.random() * 6;
              break;
            }
          }
        }
        break;
      }
      case NPC_STATE.WAITING: {
        const c = npc.cross;
        const off = g.world.signalOffset(c.i, c.j);
        if (g.world.pedestrianWalk(c.axis, off)) { npc.state = NPC_STATE.CROSSING; }
        break;
      }
      case NPC_STATE.IDLE:
        if (npc.timer <= 0) { npc.state = NPC_STATE.WALKING; this.chooseNext(npc); }
        break;
      case NPC_STATE.INTERACTING:
        if (npc.partner) npc.heading = dampAngle(npc.heading, Math.atan2(npc.partner.pos.x - npc.pos.x, npc.partner.pos.z - npc.pos.z), 5, dt);
        if (npc.timer <= 0 || !npc.partner) {
          if (npc.partner) { npc.partner.partner = null; npc.partner.state = NPC_STATE.WALKING; npc.partner = null; }
          npc.state = NPC_STATE.WALKING;
        }
        break;
      case NPC_STATE.FLEEING:
        if (npc.timer <= 0) {
          npc.state = NPC_STATE.WALKING;
          npc.node = this.nearestNode(npc.pos.x, npc.pos.z);
          npc.prevNode = null;
          npc.path = [{ x: npc.node.x, z: npc.node.z }];
        }
        break;
      case NPC_STATE.KNOCKED:
        if (npc.timer <= 0) {
          if (npc.role) { npc.state = NPC_STATE.COMBAT; npc.alerted = true; }
          else if (npc.brave && npc.angry && !g.player.vehicle) { npc.state = NPC_STATE.FIGHT; npc.timer = 12; }
          else { npc.state = NPC_STATE.WALKING; this.flee(npc, g.player.pos, 6); this.play(npc, 'Sprint_Loop', { fade: 0.4 }); }
        }
        break;
      default:
    }
    // the player bumping into someone on foot: a startled shove
    if (!g.player.vehicle && distToPlayer < 0.9 && g.player.speed > 3 && npc.state !== NPC_STATE.KNOCKED && npc.state !== NPC_STATE.FLEEING) {
      this.play(npc, 'Hit_Chest', { fade: 0.05, once: true });
      npc.state = NPC_STATE.IDLE;
      npc.timer = 0.9;
      npc.heading = Math.atan2(g.player.pos.x - npc.pos.x, g.player.pos.z - npc.pos.z);
      g.audio.grunt();
      npc.afterBump = true;
    } else if (npc.afterBump && npc.state === NPC_STATE.WALKING) {
      npc.afterBump = false;
    }
  }

  move(npc, dt) {
    const g = this.game;
    let tx = 0, tz = 0, speed = 0, anim = 'Idle_Loop', ts = 1;
    switch (npc.state) {
      case NPC_STATE.WALKING:
      case NPC_STATE.CROSSING: {
        const wp = npc.path[0];
        if (wp) { tx = wp.x - npc.pos.x; tz = wp.z - npc.pos.z; }
        speed = npc.state === NPC_STATE.CROSSING ? npc.walkSpeed * 1.35 : npc.walkSpeed;
        anim = npc.formal && npc.state === NPC_STATE.WALKING ? 'Walk_Formal_Loop' : 'Walk_Loop';
        ts = speed / 1.5;
        break;
      }
      case NPC_STATE.FLEEING: {
        const t = npc.threat || g.player.pos;
        tx = npc.pos.x - t.x; tz = npc.pos.z - t.z;
        speed = 5.2;
        anim = 'Sprint_Loop';
        ts = 0.95;
        break;
      }
      case NPC_STATE.INTERACTING:
        anim = 'Idle_Talking_Loop';
        break;
      case NPC_STATE.KNOCKED:
        npc.pos.x += npc.vel.x * dt; npc.pos.z += npc.vel.y * dt;
        npc.vel.multiplyScalar(Math.exp(-4 * dt));
        anim = 'Death01';
        break;
      case NPC_STATE.IDLE:
        anim = npc.currentName === 'Hit_Chest' && npc.timer > 0 ? 'Hit_Chest' : 'Idle_Loop';
        break;
      case NPC_STATE.FIGHT:
      case NPC_STATE.COMBAT: {
        const gl = npc.goal;
        if (gl && gl.speed > 0) { tx = gl.x - npc.pos.x; tz = gl.z - npc.pos.z; speed = gl.speed; }
        anim = gl ? gl.anim : 'Idle_Loop';
        ts = gl && gl.ts ? gl.ts : 1;
        if (npc.flinch > 0) { npc.flinch -= dt; anim = 'Hit_Chest'; speed = 0; }
        break;
      }
      default:
    }
    const L = Math.hypot(tx, tz);
    let dx = 0, dz = 0;
    if (L > 1e-3 && speed > 0) {
      dx = tx / L; dz = tz / L;
      // separation from other pedestrians and the player
      for (const o of this.npcs) {
        if (o === npc) continue;
        const ox = npc.pos.x - o.pos.x, oz = npc.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
        if (d2 < 1.4 && d2 > 1e-4) { const d = Math.sqrt(d2); dx += (ox / d) * (1.2 - d) * 1.5; dz += (oz / d) * (1.2 - d) * 1.5; }
      }
      const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
      npc.heading = dampAngle(npc.heading, Math.atan2(dx, dz), 8, dt);
      npc.speed = damp(npc.speed, speed, 6, dt);
    } else {
      npc.speed = damp(npc.speed, 0, 8, dt);
      if (npc.goal && npc.goal.face !== undefined && (npc.state === NPC_STATE.COMBAT || npc.state === NPC_STATE.FIGHT)) npc.heading = dampAngle(npc.heading, npc.goal.face, 10, dt);
    }
    if (npc.state !== NPC_STATE.KNOCKED) {
      const fx = Math.sin(npc.heading), fz = Math.cos(npc.heading);
      npc.pos.x += fx * npc.speed * dt;
      npc.pos.z += fz * npc.speed * dt;
    }
    // collisions: world, vehicles, traffic, player
    const res = g.collision.resolveCharacter(npc.pos.x, npc.pos.z, RADIUS, npc.pos.y, 0.4, terrainHeight(npc.pos.x, npc.pos.z));
    let x = res.x, z = res.z;
    const pv = g.vehicles.pushPedestrian(x, z, RADIUS);
    x = pv.x; z = pv.z;
    if (g.traffic) { const pt = g.traffic.pushPedestrian(x, z, RADIUS); x = pt.x; z = pt.z; }
    const pl = g.player;
    if (!pl.vehicle) {
      const ox = x - pl.pos.x, oz = z - pl.pos.z, d = Math.hypot(ox, oz);
      if (d < RADIUS + 0.36 && d > 1e-4) { x = pl.pos.x + (ox / d) * (RADIUS + 0.36); z = pl.pos.z + (oz / d) * (RADIUS + 0.36); }
    }
    npc.pos.x = x; npc.pos.z = z;
    npc.pos.y = damp(npc.pos.y, Math.max(res.ground, terrainHeight(x, z)), 14, dt);
    if (npc.state === NPC_STATE.WAITING) anim = 'Idle_Loop';
    const once = anim === 'Death01' || anim === 'Hit_Chest' || anim === 'Punch_Jab' || anim === 'Punch_Cross' || anim === 'Pistol_Shoot';
    this.play(npc, anim, { once, fade: once ? 0.08 : 0.3, timeScale: ts });
  }

  /** Called by vehicles: hit test a moving car against pedestrians. */
  vehicleSweep(v) {
    const vs = Math.hypot(v.vel.x, v.vel.y);
    for (const npc of this.npcs) {
      if (npc.state === NPC_STATE.KNOCKED || npc.state === NPC_STATE.DOWN || npc.role === 'actor') continue;
      if (Math.abs(npc.pos.x - v.pos.x) > 6 || Math.abs(npc.pos.z - v.pos.z) > 6) continue;
      const p = v.pushCircle(npc.pos.x, npc.pos.z, RADIUS + 0.05);
      if (!p) continue;
      if (vs > 4) this.knock(npc, v.vel.x, v.vel.y, vs, !!v.driver);
      else { npc.pos.x = p.x; npc.pos.z = p.z; if (npc.state !== NPC_STATE.FLEEING) this.flee(npc, v.pos, 3); }
    }
  }

  /** Pushes the on-foot player out of pedestrians (bodies are solid both ways). */
  pushPlayer(x, z, r) {
    for (const npc of this.npcs) {
      if (npc.state === NPC_STATE.KNOCKED || npc.state === NPC_STATE.DOWN) continue;
      const ox = x - npc.pos.x, oz = z - npc.pos.z, d = Math.hypot(ox, oz), rr = r + RADIUS;
      if (d < rr && d > 1e-4) { x = npc.pos.x + (ox / d) * rr; z = npc.pos.z + (oz / d) * rr; }
    }
    return { x, z };
  }

  /** Pedestrians currently on the carriageway near a point (traffic yields to them). */
  onRoadNear(x, z, r) {
    const out = [];
    for (const npc of this.npcs) {
      if (npc.state !== NPC_STATE.CROSSING && npc.state !== NPC_STATE.FLEEING && npc.state !== NPC_STATE.KNOCKED) continue;
      if (Math.abs(npc.pos.x - x) < r && Math.abs(npc.pos.z - z) < r) out.push(npc);
    }
    return out;
  }

  stats() {
    const s = {};
    for (const n of this.npcs) s[n.state] = (s[n.state] || 0) + 1;
    return { count: this.npcs.length, outfits: this.baked.length, states: s };
  }

  prefill(pos, count = 18) {
    const near = this.nodes.filter((n) => { const d = Math.hypot(n.x - pos.x, n.z - pos.z); return d > 6 && d < 75; });
    for (let i = 0; i < count && near.length; i++) {
      const n = near[Math.floor(Math.random() * near.length)];
      const npc = this.spawn(n);
      if (!npc) break;
      // start somewhere along the first edge so they are not bunched on corners
      const wp = npc.path[npc.path.length - 1];
      const t = Math.random();
      npc.pos.x = n.x + (wp.x - n.x) * t * (npc.path[0].wait ? 0.3 : 1); npc.pos.z = n.z + (wp.z - n.z) * t * (npc.path[0].wait ? 0.3 : 1);
    }
  }

  reset() {
    for (const n of [...this.npcs]) if (n.role !== 'actor') this.despawn(n);
  }

  // ------------------------------------------------------------ combat (Phase 6)
  /** Damage from the player or the world. Returns true when the target went down. */
  hurt(npc, dmg, from, o = {}) {
    const g = this.game;
    if (!npc.active || npc.state === NPC_STATE.DOWN || npc.role === 'actor') return false;
    npc.health -= dmg;
    npc.angry = true;
    if (npc.health <= 0) {
      this.down(npc, from, o.kind);
      if (o.byPlayer) g.events.emit('pedestrianAttacked', { npc, downed: true, kind: o.kind, role: npc.role });
      this.panic(npc.pos.x, npc.pos.z, o.kind === 'bullet' ? 30 : 16, npc);
      return true;
    }
    if (o.byPlayer) g.events.emit('pedestrianAttacked', { npc, downed: false, kind: o.kind, role: npc.role });
    const dx = npc.pos.x - from.x, dz = npc.pos.z - from.z, L = Math.hypot(dx, dz) || 1;
    if (o.knock) {
      npc.state = NPC_STATE.KNOCKED;
      npc.timer = 2.4;
      npc.vel.set(dx / L, dz / L).multiplyScalar(3.5);
      npc.heading = Math.atan2(-dx, -dz);
      npc.currentName = '';
      this.play(npc, 'Death01', { fade: 0.06, once: true });
    } else {
      npc.pos.x += (dx / L) * 0.22; npc.pos.z += (dz / L) * 0.22;
      if (npc.role || npc.state === NPC_STATE.FIGHT) npc.flinch = 0.28;
      else { npc.currentName = ''; this.play(npc, 'Hit_Chest', { fade: 0.05, once: true }); }
    }
    if (npc.role) { npc.alerted = true; if (npc.state !== NPC_STATE.KNOCKED) npc.state = NPC_STATE.COMBAT; }
    else if (npc.state !== NPC_STATE.KNOCKED) {
      if (npc.brave && o.kind !== 'bullet' && o.byPlayer && !g.player.vehicle) { npc.state = NPC_STATE.FIGHT; npc.timer = 12; }
      else { npc.state = NPC_STATE.WALKING; this.flee(npc, from, 8); }
    }
    this.panic(npc.pos.x, npc.pos.z, o.kind === 'bullet' ? 30 : 12, npc);
    return false;
  }

  /** Puts someone on the ground for good (clean style: they just lie still). */
  down(npc, from, kind = 'melee', speed = 4) {
    const g = this.game;
    if (npc.partner) { npc.partner.partner = null; if (npc.partner.state === NPC_STATE.INTERACTING) npc.partner.state = NPC_STATE.WALKING; npc.partner = null; }
    npc.state = NPC_STATE.DOWN;
    npc.health = 0;
    npc.downAt = g.playTime;
    npc.speed = 0;
    const dx = npc.pos.x - from.x, dz = npc.pos.z - from.z, L = Math.hypot(dx, dz) || 1;
    npc.vel.set(dx / L, dz / L).multiplyScalar(kind === 'vehicle' ? Math.min(8, speed * 0.6) : kind === 'bullet' ? 1.2 : 2.6);
    npc.heading = Math.atan2(-dx, -dz);
    npc.currentName = '';
    this.play(npc, 'Death01', { fade: 0.08, once: true });
    if (npc.weaponMesh) npc.weaponMesh.visible = false;
    const c = g.combat;
    if (c) {
      if (npc.role && npc.weapon && npc.weapon !== 'fists') c.drop(npc.pos.x + 0.7, npc.pos.z, 'ammo', npc.weapon === 'smg' ? 30 : 12, npc.weapon === 'smg' ? 'smg' : 'pistol');
      if (npc.role ? Math.random() < 0.7 : Math.random() < 0.55) c.drop(npc.pos.x - 0.5, npc.pos.z + 0.3, 'cash', npc.role ? 20 + Math.round(Math.random() * 60) : 5 + Math.round(Math.random() * 40));
    }
    if (npc.opts && npc.opts.onDown) npc.opts.onDown(npc);
    g.events.emit('npcDown', npc);
  }

  /** Nearest opponent in front of the player within range (soft lock for melee). */
  meleeTarget(pos, heading, range) {
    let best = null, bd = range;
    for (const n of this.npcs) {
      if (n.state === NPC_STATE.DOWN || n.role === 'actor') continue;
      const dx = n.pos.x - pos.x, dz = n.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      let a = Math.atan2(dx, dz) - heading;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > 1.3) continue;
      bd = d; best = n;
    }
    return best;
  }

  /** Resolves a melee strike from pos facing (fx,fz). Returns the victim or null. */
  meleeHit(pos, fx, fz, range, dmg, o) {
    let best = null, bd = range;
    for (const n of this.npcs) {
      if (n.state === NPC_STATE.DOWN || n.role === 'actor') continue;
      const dx = n.pos.x - pos.x, dz = n.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > bd || d < 1e-3) continue;
      if ((dx * fx + dz * fz) / d < 0.3) continue;
      bd = d; best = n;
    }
    if (best) this.hurt(best, dmg, pos, o);
    return best;
  }

  blast(x, z, r) {
    for (const n of [...this.npcs]) {
      if (n.state === NPC_STATE.DOWN || n.role === 'actor') continue;
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < r) this.hurt(n, (r - d) * 22 + 10, { x, z }, { kind: 'blast', knock: true, byPlayer: true });
    }
  }

  /** Civilians near a disturbance run away. */
  panic(x, z, r, skip = null) {
    for (const n of this.npcs) {
      if (n === skip || n.role || n.state === NPC_STATE.DOWN || n.state === NPC_STATE.KNOCKED || n.state === NPC_STATE.FIGHT || n.state === NPC_STATE.FLEEING) continue;
      if ((n.pos.x - x) ** 2 + (n.pos.z - z) ** 2 < r * r) this.flee(n, { x, z }, 8 + Math.random() * 4);
    }
  }

  /**
   * Spawns a combatant ('cop' | 'thug' | 'guard' | 'boss').
   * opts: { weapon:'fists'|'pistol'|'smg', health, alerted, aggro, accuracy, damage, rate, range, guard:{x,z}, mission, heading, onDown }
   */
  spawnCombatant(kind, x, z, opts = {}) {
    const v = this.variants[kind];
    if (!v) return null;
    const npc = this.spawn(this.nearestNode(x, z), v, true);
    if (!npc) return null;
    npc.pos.set(x, terrainHeight(x, z), z);
    npc.role = kind;
    npc.opts = opts;
    npc.health = npc.maxHealth = opts.health ?? 100;
    npc.weapon = opts.weapon || 'fists';
    npc.alerted = !!opts.alerted;
    npc.leave = false;
    npc.state = NPC_STATE.COMBAT;
    npc.heading = opts.heading ?? Math.random() * 6.28;
    npc.path = [];
    npc.fireCd = 0.8 + Math.random();
    npc.goal = null;
    if (npc.weapon !== 'fists') {
      const meshId = npc.weapon === 'smg' ? 'smg' : 'pistol';
      if (!npc.weaponMesh || npc.weaponMeshId !== meshId) {
        if (npc.weaponMesh) this.scene.remove(npc.weaponMesh);
        npc.weaponMesh = makeWeaponMesh(meshId);
        npc.weaponMeshId = meshId;
        this.scene.add(npc.weaponMesh);
      }
      npc.weaponMesh.visible = true;
    }
    npc.currentName = '';
    this.play(npc, npc.weapon !== 'fists' ? 'Pistol_Idle_Loop' : 'Idle_Loop', { fade: 0 });
    return npc;
  }

  /** A stationary animated character (dancers, mission contacts). */
  spawnActor(key, x, z, heading, clip = 'Idle_Loop') {
    const variant = this.variants[key] || (this.bakedByKey[key] && this.bakedByKey[key].variant);
    if (!variant) return null;
    const npc = this.spawn(this.nearestNode(x, z), variant, true);
    if (!npc) return null;
    npc.role = 'actor';
    npc.state = NPC_STATE.ACTOR;
    npc.pos.set(x, terrainHeight(x, z), z);
    npc.heading = heading;
    npc.path = [];
    npc.root.position.copy(npc.pos);
    npc.root.rotation.y = heading;
    npc.currentName = '';
    this.play(npc, clip, { fade: 0 });
    npc.mixer.update(Math.random() * 3);
    this.actors.push(npc);
    return npc;
  }

  combatants() {
    return this.npcs.filter((n) => n.role && n.role !== 'actor' && n.state !== NPC_STATE.DOWN);
  }

  thinkCombat(npc, dt, dist) {
    const g = this.game, pl = g.player, o = npc.opts || {};
    const tp = pl.pos;
    npc.timer -= dt; npc.attackCd -= dt; npc.fireCd -= dt;
    const face = Math.atan2(tp.x - npc.pos.x, tp.z - npc.pos.z);
    // regular pedestrians who fight back give up after a while or when you drive off
    if (npc.state === NPC_STATE.FIGHT && (pl.vehicle || dist > 18 || npc.timer <= 0 || pl.knocked > 0)) {
      npc.state = NPC_STATE.WALKING; npc.angry = false;
      npc.node = this.nearestNode(npc.pos.x, npc.pos.z); npc.prevNode = null; npc.path = [{ x: npc.node.x, z: npc.node.z }];
      return;
    }
    if (npc.role === 'cop' && g.police.level === 0) {
      // stand down and walk away (despawned once out of range)
      npc.leave = true;
      npc.goal = { x: npc.pos.x - Math.sin(face) * 30, z: npc.pos.z - Math.cos(face) * 30, speed: 1.4, anim: 'Walk_Loop' };
      return;
    }
    const hostile = npc.state === NPC_STATE.FIGHT || npc.role === 'cop' || (o.hostile !== false && (npc.alerted || dist < (o.aggro ?? 20)));
    if (!hostile || g.respawning) {
      const post = o.guard;
      if (post && Math.hypot(post.x - npc.pos.x, post.z - npc.pos.z) > 1.5) npc.goal = { x: post.x, z: post.z, speed: 1.4, anim: 'Walk_Loop' };
      else npc.goal = { speed: 0, anim: npc.weapon !== 'fists' ? 'Pistol_Idle_Loop' : 'Idle_Loop', face: post && post.face !== undefined ? post.face : npc.heading };
      return;
    }
    if (!npc.alerted) { npc.alerted = true; if (o.onAlert) o.onAlert(npc); }
    npc.losT -= dt;
    if (npc.losT <= 0) {
      npc.losT = 0.3 + Math.random() * 0.1;
      npc.los = g.collision.raycast(npc.pos.x, npc.pos.y + 1.5, npc.pos.z, tp.x, tp.y + 1.3, tp.z) >= 0.99;
    }
    // melee swing in progress
    if (npc.attackT >= 0) {
      npc.attackT += dt;
      if (!npc.attackHit && npc.attackT > 0.24) {
        npc.attackHit = true;
        let a = face - npc.heading;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        if (dist < 1.7 && !pl.vehicle && Math.abs(a) < 0.9 && pl.knocked <= 0) {
          g.damagePlayer(o.punch ?? (npc.role ? 9 : 7));
          if (g.combat) g.combat.flinch = 0.3;
          g.audio.punch(0.8);
          g.camera3p.kick(0.07);
        }
      }
      if (npc.attackT > 0.62) npc.attackT = -1;
      npc.goal = { speed: 0, anim: npc.attackAnim, face };
      return;
    }
    const armed = npc.weapon && npc.weapon !== 'fists' && !(npc.role === 'cop' && g.police.level < 2);
    if (npc.weaponMesh) npc.weaponMesh.visible = !!npc.weapon && npc.weapon !== 'fists' && (armed || npc.role !== 'cop');
    if (armed && dist > 2.2) {
      const want = o.range || 12;
      if (!npc.los || dist > want + 8) {
        npc.goal = { x: tp.x, z: tp.z, speed: dist > 25 ? 5 : 3.4, anim: dist > 25 ? 'Sprint_Loop' : 'Jog_Fwd_Loop' };
        return;
      }
      const rate = o.rate || (npc.weapon === 'smg' ? 0.55 : 1.15);
      npc.goal = { speed: 0, anim: npc.fireCd > rate - 0.22 ? 'Pistol_Shoot' : 'Pistol_Aim_Neutral', face };
      let a = face - npc.heading;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (npc.fireCd <= 0 && Math.abs(a) < 0.35 && !g.respawning) {
        npc.fireCd = rate * (0.8 + Math.random() * 0.5);
        npc.currentName = '';
        const acc = clamp((o.accuracy ?? 0.42) - dist * 0.01 - pl.speed * 0.025 - (pl.vehicle ? 0.08 : 0) - (pl.crouched ? 0.08 : 0), 0.04, 0.8);
        if (g.combat) g.combat.enemyFire(this.muzzle(npc), acc, o.damage ?? (npc.weapon === 'smg' ? 5 : 8), npc.weapon);
        this.panic(npc.pos.x, npc.pos.z, 30);
      }
      return;
    }
    if (pl.vehicle) {
      npc.goal = { x: tp.x, z: tp.z, speed: dist > 4 ? 4 : 0, anim: dist > 4 ? 'Jog_Fwd_Loop' : 'Idle_Loop', face };
      return;
    }
    if (dist > 1.25) {
      npc.goal = { x: tp.x, z: tp.z, speed: dist > 8 ? 5 : 3.4, anim: dist > 8 ? 'Sprint_Loop' : 'Jog_Fwd_Loop' };
      return;
    }
    if (npc.role === 'cop' && g.police.level <= 1) {
      npc.goal = { speed: 0, anim: 'Idle_Loop', face };
      g.police.arrestPressure(dt);
      return;
    }
    if (npc.attackCd <= 0 && pl.knocked <= 0) {
      npc.attackT = 0; npc.attackHit = false;
      npc.attackAnim = Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross';
      npc.attackCd = 0.8 + Math.random() * 0.7;
      npc.currentName = '';
      npc.goal = { speed: 0, anim: npc.attackAnim, face };
      return;
    }
    npc.goal = { speed: 0, anim: 'Idle_Loop', face };
  }

  muzzle(npc) {
    if (npc.weaponMesh && npc.weaponMesh.visible) {
      npc.weaponMesh.updateMatrixWorld();
      return npc.weaponMesh.userData.muzzle.clone().applyMatrix4(npc.weaponMesh.matrixWorld);
    }
    return new THREE.Vector3(npc.pos.x + Math.sin(npc.heading) * 0.5, npc.pos.y + 1.4, npc.pos.z + Math.cos(npc.heading) * 0.5);
  }

  placeWeapon(npc, dist) {
    const m = npc.weaponMesh;
    if (!m.visible) return;
    if (dist > 80 || !npc.hand || !npc.fore) { m.position.set(npc.pos.x, -50, npc.pos.z); return; }
    npc.root.updateMatrixWorld(true);
    const hp = new THREE.Vector3().setFromMatrixPosition(npc.hand.matrixWorld);
    const fp = new THREE.Vector3().setFromMatrixPosition(npc.fore.matrixWorld);
    const aiming = npc.currentName === 'Pistol_Aim_Neutral' || npc.currentName === 'Pistol_Shoot';
    const pl = this.game.player.pos;
    const dir = aiming ? new THREE.Vector3(pl.x - hp.x, pl.y + 1.2 - hp.y, pl.z - hp.z).normalize() : hp.clone().sub(fp).normalize();
    m.position.copy(hp).addScaledVector(dir, 0.05);
    _wm.lookAt(dir, _zero, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(Math.sin(npc.heading), 0, Math.cos(npc.heading)) : _yup);
    m.quaternion.setFromRotationMatrix(_wm);
  }
}

const _wm = new THREE.Matrix4();
const _zero = new THREE.Vector3();
const _yup = new THREE.Vector3(0, 1, 0);

function findBone(root, name) {
  const want = name.replace(/[.:]/g, '').toLowerCase();
  let hit = null;
  root.traverse((o) => { if (!hit && o.isBone && o.name.replace(/[.:]/g, '').toLowerCase() === want) hit = o; });
  return hit;
}

function blockDistrictAt(x, z) {
  if (x > 413) return 'sand';
  let i = 0, j = 0;
  for (let k = 0; k < LINES.length - 1; k++) { if (x >= LINES[k]) i = k; if (z >= LINES[k]) j = k; }
  return blockDistrict(clamp(i, 0, 7), clamp(j, 0, 7));
}

/**
 * Collapses a Quaternius character (several skinned meshes, one flat-colour
 * material per part) into ONE skinned mesh with vertex colours, so each
 * pedestrian costs a single draw call. Skin indices are remapped by bone name.
 */
function mergeCharacter(scene, recolor = null) {
  const proto = skeletonClone(scene);
  proto.updateMatrixWorld(true);
  const skinned = [];
  proto.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (skinned.length < 2) return proto;
  const main = skinned[0];
  const bones = main.skeleton.bones;
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
  const pos = [], nor = [], col = [], si = [], sw = [];
  const c = new THREE.Color();
  const v3 = new THREE.Vector3();
  const mainBindInv = main.bindMatrix.clone().invert();
  for (const m of skinned) {
    // bring this part into the main mesh's bind space (parts may carry their own
    // dequantisation transform in bindMatrix / inverse-bind matrices)
    const refName = m.skeleton.bones[0].name;
    const mi = boneIndex.get(refName) ?? 0;
    const T = new THREE.Matrix4()
      .copy(mainBindInv)
      .multiply(main.skeleton.boneInverses[mi].clone().invert())
      .multiply(m.skeleton.boneInverses[0])
      .multiply(m.bindMatrix);
    const Nm = new THREE.Matrix3().getNormalMatrix(T);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    const remap = m.skeleton.bones.map((b) => boneIndex.get(b.name) ?? 0);
    const P = g.attributes.position, Nn = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] || mats[0];
      if (recolor && recolor[mat.name] !== undefined) c.set(recolor[mat.name]);
      else c.copy(mat.color || new THREE.Color(1, 1, 1));
      for (let v = gr.start; v < gr.start + gr.count; v++) {
        v3.set(P.getX(v), P.getY(v), P.getZ(v)).applyMatrix4(T);
        pos.push(v3.x, v3.y, v3.z);
        v3.set(Nn.getX(v), Nn.getY(v), Nn.getZ(v)).applyMatrix3(Nm).normalize();
        nor.push(v3.x, v3.y, v3.z);
        col.push(c.r, c.g, c.b);
        si.push(remap[SI.getX(v)], remap[SI.getY(v)], remap[SI.getZ(v)], remap[SI.getW(v)]);
        sw.push(SW.getX(v), SW.getY(v), SW.getZ(v), SW.getW(v));
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  const merged = new THREE.SkinnedMesh(geo, mat);
  merged.name = 'NPCBody';
  main.parent.add(merged);
  merged.position.copy(main.position); merged.quaternion.copy(main.quaternion); merged.scale.copy(main.scale);
  merged.bind(main.skeleton, main.bindMatrix);
  for (const m of skinned) m.parent.remove(m);
  return proto;
}
