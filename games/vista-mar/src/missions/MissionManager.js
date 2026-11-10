import * as THREE from 'three';
import { terrainHeight } from '../world/Layout.js';

// Reusable mission architecture.
// A mission definition is { id, title, giver, start:{x,z}, requires, reward, steps:[...] }.
// Each step: { text, enter(ctx), update(ctx, dt) -> 'next' | {fail: reason} | undefined,
//              target(ctx) -> {x,z} | null, timer?: seconds, exit?(ctx) }.
// The manager draws start markers, runs the active mission, tracks timers,
// shows objective text/waypoints/GPS, and handles pass, fail and rewards.

export class MissionManager {
  constructor(game, defs) {
    this.game = game;
    this.defs = defs;
    this.done = new Set();
    this.active = null;
    this.ctx = null;
    this.markerGroup = new THREE.Group();
    game.scene.add(this.markerGroup);
    this.markers = new Map();
    this.givers = new Map();
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 0.4), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.beamGeo = new THREE.CylinderGeometry(1.2, 1.6, 60, 20, 1, true).translate(0, 30, 0);
    this.ringGeo = new THREE.RingGeometry(1.6, 2.0, 40).rotateX(-Math.PI / 2);
    this.target = this.makeMarker(4);
    this.target.visible = false;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.0, 0.4), toneMapped: false }));
    this.arrow.visible = false;
    game.scene.add(this.arrow);
    this.refreshStartMarkers();
  }

  makeMarker(scale = 1) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.position.y = 0.06;
    g.add(beam, ring);
    g.scale.set(scale, 1, scale);
    this.markerGroup.add(g);
    return g;
  }

  available() {
    return this.defs.filter((d) => !this.done.has(d.id) && (!d.requires || this.done.has(d.requires)));
  }

  refreshStartMarkers() {
    for (const m of this.markers.values()) this.markerGroup.remove(m);
    this.markers.clear();
    // mission contacts stand next to their marker while the mission is available
    const npcs = this.game.npcs;
    const avail = this.active || this.starting ? [] : this.available();
    for (const [id, a] of [...this.givers]) if (!avail.find((d) => d.id === id)) { if (npcs && a.active) npcs.despawn(a); this.givers.delete(id); }
    if (this.active || this.starting) return;
    for (const d of avail) {
      const m = this.makeMarker(1);
      m.position.set(d.start.x, terrainHeight(d.start.x, d.start.z), d.start.z);
      this.markers.set(d.id, m);
      if (d.npc && npcs && !this.givers.has(d.id)) {
        const h = d.npc.heading;
        const a = npcs.spawnActor(d.npc.key, d.start.x + Math.sin(h) * 1.8, d.start.z + Math.cos(h) * 1.8, h + Math.PI, d.npc.clip || 'Idle_Talking_Loop');
        if (a) this.givers.set(d.id, a);
      }
    }
  }

  start(def) {
    const g = this.game;
    if (def.intro && g.cutscene && !this.skipIntro) {
      // story scene first, then the mission proper
      this.starting = def;
      this.refreshStartMarkers();
      g.cutscene.play({ title: def.title, lines: def.intro, video: def.video }, () => { this.starting = null; this.begin(def); });
      return;
    }
    this.begin(def);
  }

  begin(def) {
    const g = this.game;
    this.active = def;
    this.stepIndex = -1;
    this.ctx = { game: g, data: {}, mission: def, elapsed: 0 };
    this.refreshStartMarkers();
    g.hud.banner(def.title, def.giver ? `${def.giver}` : '', 'mission');
    g.audio.missionStart();
    if (def.onStart) def.onStart(this.ctx);
    this.next();
  }

  next() {
    const def = this.active;
    const prev = def.steps[this.stepIndex];
    if (prev && prev.exit) prev.exit(this.ctx);
    this.stepIndex++;
    const step = def.steps[this.stepIndex];
    if (!step) return this.pass();
    this.stepTimer = step.timer ?? null;
    if (step.enter) step.enter(this.ctx);
    if (step.say) this.game.hud.toast(step.say[0], step.say[1]);
  }

  pass() {
    const g = this.game, def = this.active;
    const bonus = def.bonus ? def.bonus(this.ctx) : 0;
    const total = def.reward + bonus;
    g.addMoney(total);
    this.done.add(def.id);
    g.hud.banner('MISSION PASSED', `+$${total.toLocaleString('en-US')}${bonus ? `  (includes $${bonus.toLocaleString('en-US')} bonus)` : ''}`, 'passed');
    g.audio.missionPassed();
    if (def.onPass) def.onPass(this.ctx);
    this.cleanup();
    g.events.emit('missionPassed', def);
  }

  fail(reason) {
    const g = this.game;
    g.hud.banner('MISSION FAILED', reason, 'failed');
    if (g.stats) g.stats.failed++;
    g.audio.missionFailed();
    if (this.active.onFail) this.active.onFail(this.ctx);
    this.cleanup();
  }

  cleanup() {
    const def = this.active;
    if (def && def.cleanup) def.cleanup(this.ctx);
    this.active = null;
    this.ctx = null;
    this.waitLeave = true; // the player must step off a marker before it can start again
    this.target.visible = false;
    this.arrow.visible = false;
    this.refreshStartMarkers();
  }

  abort(reason) {
    if (this.active) this.fail(reason);
  }

  update(dt) {
    const g = this.game;
    const t = g.world.elapsed;
    this.beamMat.opacity = 0.16 + g.world.night * 0.16 + Math.sin(t * 3) * 0.04;
    for (const m of this.markers.values()) m.children[1].scale.setScalar(1 + Math.sin(t * 4) * 0.08);

    if (this.starting) return;
    if (!this.active) {
      // step into a start marker on foot
      const onMarker = this.available().find((d) => Math.hypot(g.player.pos.x - d.start.x, g.player.pos.z - d.start.z) < 2.2);
      if (!onMarker) this.waitLeave = false;
      else if (!this.waitLeave && !g.player.vehicle && g.police.level === 0 && !g.respawning) this.start(onMarker);
      return;
    }
    const step = this.active.steps[this.stepIndex];
    this.ctx.elapsed += dt;
    if (this.stepTimer !== null) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) return this.fail(step.timeoutText || 'You ran out of time.');
    }
    const res = step.update ? step.update(this.ctx, dt) : 'next';
    if (res === 'next') return this.next();
    if (res && res.fail) return this.fail(res.fail);
    // waypoint marker
    const tg = step.target ? step.target(this.ctx) : null;
    if (tg) {
      if (tg.vehicle) {
        this.target.visible = false;
        this.arrow.visible = true;
        this.arrow.position.set(tg.x, tg.vehicle.pos.y + tg.vehicle.height + 1.3 + Math.sin(t * 4) * 0.2, tg.z);
        this.arrow.rotation.y = t * 2;
      } else {
        this.arrow.visible = false;
        this.target.visible = true;
        this.target.position.set(tg.x, terrainHeight(tg.x, tg.z), tg.z);
        this.target.scale.set(tg.r ? tg.r / 2 : 3, 1, tg.r ? tg.r / 2 : 3);
      }
    } else { this.target.visible = false; this.arrow.visible = false; }
  }

  /** Objective line + waypoint for HUD/minimap (null when no mission). */
  objective() {
    if (!this.active) return null;
    const step = this.active.steps[this.stepIndex];
    if (!step) return null;
    const text = typeof step.text === 'function' ? step.text(this.ctx) : step.text;
    const tg = step.target ? step.target(this.ctx) : null;
    return { title: this.active.title, text, target: tg, timer: this.stepTimer };
  }

  startMarkers() {
    if (this.active) return [];
    return this.available().map((d) => ({ x: d.start.x, z: d.start.z, color: '#ffd23f', shape: 'dot', size: 7, label: d.letter || 'M', edge: true }));
  }

  reset() {
    if (this.active) this.cleanup();
    this.done.clear();
    this.refreshStartMarkers();
  }
}
