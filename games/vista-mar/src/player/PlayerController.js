import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';
import { terrainHeight, classify, WATER_LEVEL, PLAYER_START } from '../world/Layout.js';
import { clamp, damp, dampAngle } from '../utils/random.js';

// Third-person on-foot controller: camera-relative movement, walk/run/sprint,
// crouch, jump with coyote time + buffering, stamina, collision against the
// static world, and animation selection on the retargeted character.

const SPEED = { walk: 1.7, run: 4.4, sprint: 7.4, crouch: 1.5 };
const RADIUS = 0.36;
const STEP = 0.4;
const GRAVITY = 22;
const JUMP_V = 7.2;

export class PlayerController {
  constructor(game, assets) {
    this.game = game;
    this.input = game.input;
    this.collision = game.collision;
    this.group = new THREE.Group();
    this.group.name = 'Player';
    game.scene.add(this.group);

    this.rig = null;
    if (assets.anim && assets.player) {
      try {
        this.rig = new CharacterRig(assets.anim, assets.player, 1.78);
        if (!this.rig.ok) this.rig = null;
      } catch (e) {
        console.warn('[player] rig failed, using fallback body', e);
        this.rig = null;
      }
    }
    if (this.rig) { this.group.add(this.rig.root); this.rig.play('Idle_Loop', { fade: 0 }); }
    else this.group.add(fallbackBody());

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.crouched = false;
    this.walkMode = false;
    this.stamina = 100;
    this.health = 100;
    this.staminaLock = false;
    this.staminaDelay = 0;
    this.gait = 'idle';
    this.landTimer = 0;
    this.airTime = 0;
    this.stepPhase = 0;
    this.surface = 'sidewalk';
    this.speed = 0;
    this.interactCooldown = 0;
    this.vehicle = null;
    this.respawn();
  }

  respawn() {
    this.pos.set(PLAYER_START.x, terrainHeight(PLAYER_START.x, PLAYER_START.z), PLAYER_START.z);
    this.vel.set(0, 0, 0);
    this.heading = PLAYER_START.heading;
    this.stamina = 100;
    this.health = 100;
    this.crouched = false;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  teleport(x, z) {
    this.pos.set(x, terrainHeight(x, z) + 0.05, z);
    this.vel.set(0, 0, 0);
  }

  update(dt, cameraYaw) {
    const inp = this.input;
    // --- intent
    let ix = 0, iz = 0;
    if (inp.down('KeyW')) iz += 1;
    if (inp.down('KeyS')) iz -= 1;
    if (inp.down('KeyA')) ix -= 1;
    if (inp.down('KeyD')) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    if (inp.hit('KeyC')) this.crouched = !this.crouched;
    if (inp.hit('KeyQ')) this.walkMode = !this.walkMode;
    const wantSprint = inp.down('ShiftLeft') || inp.down('ShiftRight');
    if (inp.hit('Space')) this.jumpBuffer = 0.15;

    // camera-relative direction: forward is where the camera looks
    const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
    const rx = -fz, rz = fx; // right vector (camera looks along +forward)
    let dx = fx * iz + rx * ix, dz = fz * iz + rz * ix;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    // --- stamina & gait
    let target = SPEED.run;
    let sprinting = false;
    if (this.crouched) target = SPEED.crouch;
    else if (this.walkMode) target = SPEED.walk;
    else if (wantSprint && moving && !this.staminaLock && this.stamina > 0) { target = SPEED.sprint; sprinting = true; }
    if (sprinting) { this.stamina -= 16 * dt; this.staminaDelay = 1; if (this.stamina <= 0) { this.stamina = 0; this.staminaLock = true; } }
    else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + 14 * dt);
      if (this.staminaLock && this.stamina > 25) this.staminaLock = false;
    }
    if (this.surface === 'sand') target *= 0.86;

    // --- horizontal velocity with acceleration (less control in the air)
    const accel = this.grounded ? (moving ? 16 : 20) : 3.5;
    const tvx = moving ? dx * target : 0, tvz = moving ? dz * target : 0;
    this.vel.x = damp(this.vel.x, tvx, accel * 0.6, dt);
    this.vel.z = damp(this.vel.z, tvz, accel * 0.6, dt);

    // --- vertical
    this.coyote = this.grounded ? 0.12 : this.coyote - dt;
    this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.crouched && this.stamina > 6) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.stamina -= 6;
      this.staminaDelay = 0.6;
      this.game.audio.jump();
      this.jumped = true;
    } else if (this.jumpBuffer > 0 && this.crouched) {
      this.crouched = false; // space stands up
      this.jumpBuffer = 0;
    }
    this.vel.y -= GRAVITY * dt;

    // --- integrate and collide
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const base = terrainHeight(nx, nz);
    const res = this.collision.resolveCharacter(nx, nz, RADIUS, this.pos.y, STEP, base);
    nx = res.x; nz = res.z;
    // parked / abandoned vehicles are solid too
    if (this.game.vehicles) {
      const pv = this.game.vehicles.pushPedestrian(nx, nz, RADIUS);
      if (pv.x !== nx || pv.z !== nz) { nx = pv.x; nz = pv.z; res.hit = true; }
    }
    if (this.game.traffic) { const pt = this.game.traffic.pushPedestrian(nx, nz, RADIUS); if (pt.x !== nx || pt.z !== nz) { nx = pt.x; nz = pt.z; res.hit = true; } }
    if (this.game.npcs) { const pn = this.game.npcs.pushPlayer(nx, nz, RADIUS); nx = pn.x; nz = pn.z; }
    let groundY = Math.max(res.ground, terrainHeight(nx, nz));
    // keep out of deep water: treat below-sea sand as a soft wall
    if (groundY < WATER_LEVEL - 0.25) {
      nx = this.pos.x; nz = this.pos.z; groundY = Math.max(terrainHeight(nx, nz), WATER_LEVEL - 0.25);
      this.vel.x *= -0.2; this.vel.z *= -0.2;
    }
    if (res.hit) {
      // remove velocity going into the wall so we slide along it
      const mvx = (nx - this.pos.x) / Math.max(dt, 1e-4), mvz = (nz - this.pos.z) / Math.max(dt, 1e-4);
      this.vel.x = damp(this.vel.x, mvx, 20, dt);
      this.vel.z = damp(this.vel.z, mvz, 20, dt);
    }
    let ny = this.pos.y + this.vel.y * dt;
    const wasGrounded = this.grounded;
    if (ny <= groundY + 0.001) {
      if (!wasGrounded && this.airTime > 0.25) {
        this.landTimer = 0.18;
        this.game.audio.land(Math.min(1, -this.vel.y / 12));
        this.game.camera3p.kick(Math.min(0.25, -this.vel.y * 0.015));
      }
      ny = groundY; // curbs/steps: the camera smooths the vertical pop
      this.vel.y = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      if (wasGrounded && ny < groundY + STEP && this.vel.y <= 0) {
        // walking off a small ledge: stick to ground
        ny = groundY;
        this.vel.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
        this.airTime += dt;
      }
    }
    this.pos.set(nx, ny, nz);

    // --- facing: turn toward movement direction
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (hs > 0.3 && moving) this.heading = dampAngle(this.heading, Math.atan2(dx, dz), this.grounded ? 11 : 4, dt);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;

    // --- animation
    this.landTimer -= dt;
    this.surface = classify(this.pos.x, this.pos.z).type;
    this.animate(dt, hs, sprinting);
    this.interactCooldown -= dt;
  }

  animate(dt, hs, sprinting) {
    let clip, ts = 1;
    if (!this.grounded) {
      clip = this.vel.y > 1.5 && this.jumped ? 'Jump_Start' : 'Jump_Loop';
    } else if (this.crouched) {
      clip = hs > 0.2 ? 'Crouch_Fwd_Loop' : 'Crouch_Idle_Loop';
      ts = hs > 0.2 ? clamp(hs / 1.4, 0.6, 1.4) : 1;
    } else if (this.landTimer > 0) {
      clip = 'Jump_Land';
    } else if (hs < 0.25) {
      clip = 'Idle_Loop';
    } else if (hs < 2.6) {
      clip = 'Walk_Loop';
      ts = clamp(hs / 1.55, 0.6, 1.6);
    } else if (!sprinting && hs < 6) {
      clip = 'Jog_Fwd_Loop';
      ts = clamp(hs / 4.0, 0.7, 1.3);
    } else {
      clip = 'Sprint_Loop';
      ts = clamp(hs / 7.0, 0.8, 1.25);
    }
    if (this.grounded) this.jumped = false;
    if (this.rig) {
      const once = clip === 'Jump_Start' || clip === 'Jump_Land';
      this.rig.play(clip, { fade: clip === 'Jump_Land' ? 0.08 : 0.18, once });
      this.rig.setTimeScale(ts);
      this.rig.update(dt);
    }
    // footsteps from distance travelled (stride depends on gait)
    if (this.grounded && hs > 0.4) {
      const stride = this.crouched ? 0.55 : hs < 2.6 ? 0.72 : hs < 6 ? 1.15 : 1.45;
      this.stepPhase += (hs * dt) / stride;
      if (this.stepPhase >= 1) {
        this.stepPhase -= 1;
        this.game.audio.footstep(this.surface, hs / SPEED.sprint);
      }
    }
  }

  get eyeHeight() {
    return this.crouched ? 1.05 : 1.55;
  }
}

function fallbackBody() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2bb3c0, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89670, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), mat);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin);
  head.position.y = 1.62;
  body.castShadow = head.castShadow = true;
  g.add(body, head);
  return g;
}
