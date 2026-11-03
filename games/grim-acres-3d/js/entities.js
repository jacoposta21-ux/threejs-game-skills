// Player and villager entities. Positions are in pixels; (x, y) is the point between the feet.
import { TILE } from './world.js';
import { findPath } from './pathfinding.js';
import { parseTime } from './time.js';

export const DIRS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};
const FOOT = 12;          // feet sit this many px below the top of their tile
const HALF_W = 5, BOX_T = 4, BOX_B = 2; // collision box around the feet

export function tileCenter(tx, ty) { return { x: tx * TILE + 8, y: ty * TILE + FOOT }; }

class Actor {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.dir = 'down';
    this.moving = false;
    this.anim = 0; // walk-cycle clock
  }
  get tx() { return Math.floor(this.x / TILE); }
  get ty() { return Math.floor(this.y / TILE); }
  placeAt(tx, ty, dir) { const c = tileCenter(tx, ty); this.x = c.x; this.y = c.y; if (dir) this.dir = dir; }
  facingTile() { const [dx, dy] = DIRS[this.dir]; return { x: this.tx + dx, y: this.ty + dy }; }
  frame() { return this.moving ? 1 + (Math.floor(this.anim * 7) % 4) : 0; } // 0 idle, 1..4 walk cycle
}

export class Player extends Actor {
  constructor() { super(0, 0); this.speed = 72; this.bumpCooldown = 0; }

  // blocked(tx,ty) decides solidity for the player (includes locked doors and idle NPCs).
  update(dt, input, blocked) {
    let { x: mx, y: my } = input;
    const len = Math.hypot(mx, my);
    this.moving = len > 0.15;
    this.bumped = null;
    if (!this.moving) return;
    if (len > 1) { mx /= len; my /= len; }
    if (Math.abs(mx) > Math.abs(my)) this.dir = mx > 0 ? 'right' : 'left';
    else this.dir = my > 0 ? 'down' : 'up';
    this.anim += dt * Math.min(1, len);
    const step = this.speed * dt;
    this._move(mx * step, 0, blocked);
    this._move(0, my * step, blocked);
  }

  _hits(x, y, blocked) {
    const x0 = Math.floor((x - HALF_W) / TILE), x1 = Math.floor((x + HALF_W - 0.01) / TILE);
    const y0 = Math.floor((y - BOX_T) / TILE), y1 = Math.floor((y + BOX_B - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blocked(tx, ty)) return { x: tx, y: ty };
    return null;
  }

  _move(dx, dy, rawBlocked) {
    if (!dx && !dy) return;
    // Anything we already overlap never blocks us (e.g. a villager who stopped on top of us),
    // so the player can always walk out instead of getting stuck.
    const x0 = Math.floor((this.x - HALF_W) / TILE), x1 = Math.floor((this.x + HALF_W - 0.01) / TILE);
    const y0 = Math.floor((this.y - BOX_T) / TILE), y1 = Math.floor((this.y + BOX_B - 0.01) / TILE);
    const blocked = (tx, ty) => !(tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) && rawBlocked(tx, ty);
    const hit = this._hits(this.x + dx, this.y + dy, blocked);
    if (!hit) { this.x += dx; this.y += dy; return; }
    this.bumped = hit;
    // Corner assist: if the tile straight ahead of our centre is free, slide toward its centre.
    const cx = this.tx, cy = this.ty;
    if (dy) {
      const ahead = cy + Math.sign(dy);
      if (!blocked(cx, ahead)) {
        const target = cx * TILE + 8, d = target - this.x;
        const s = Math.sign(d) * Math.min(Math.abs(d), Math.abs(dy));
        if (s && !this._hits(this.x + s, this.y, blocked)) this.x += s;
      }
    } else {
      const ahead = cx + Math.sign(dx);
      if (!blocked(ahead, cy)) {
        const target = cy * TILE + FOOT, d = target - this.y;
        const s = Math.sign(d) * Math.min(Math.abs(d), Math.abs(dx));
        if (s && !this._hits(this.x, this.y + s, blocked)) this.y += s;
      }
    }
  }
}

export class NPC extends Actor {
  constructor(def) {
    super(0, 0);
    this.def = def;
    this.id = def.id;
    this.speed = 44;
    this.goal = null;   // location id currently heading to
    this.path = null;
    this.face = 'down'; // facing to use once arrived
    this.gnomed = false;
    this.gone = false;   // the caught Gnomer leaves the village
    this.friendship = 0;
    this.talkDay = 0;   // last day we chatted (friendship gain once per day)
    this.giftDay = 0;
    this.talks = 0;     // lifetime chats, for "seen with the farmer" stats
    this.lastLine = null;
    this.paused = false; // held still while in dialogue
  }

  get away() { return this.gnomed || this.gone; }
  get hearts() { return Math.floor(this.friendship / 100); }
  get area() { return this._area; }

  schedule(weather) { return (weather === 'rain' && this.def.rain) || this.def.schedule; }

  // Location id the schedule wants right now.
  slot(minutes, weather) {
    if (this.override) return this.override; // e.g. the Gnomer's night prowl
    const sched = this.schedule(weather);
    let cur = sched[0][1];
    for (const [t, loc] of sched) if (minutes >= parseTime(t)) cur = loc;
    return cur;
  }

  // Last outdoor spot on today's schedule: where the villager was "last seen" before bed.
  lastSeenLocation(weather) {
    const sched = this.schedule(weather);
    for (let i = sched.length - 1; i >= 0; i--) {
      const l = sched[i][1];
      if (l !== 'home' && !l.includes('.')) return l;
    }
    return null;
  }

  snapToSchedule(world, minutes, weather) {
    this.override = null; this.prowling = false; this.hooded = false; this.speed = 44;
    const locId = this.slot(minutes, weather);
    const loc = world.resolveLocation(locId, this.def.home);
    if (loc) this.placeAt(loc.x, loc.y, loc.face);
    this.goal = locId; this.path = null; this.face = loc ? loc.face : 'down';
    this.moving = false;
    this._area = world.areaAt(this.tx, this.ty);
  }

  update(dt, world, minutes, weather) {
    if (this.away || this.paused) { this.moving = false; return; }
    // the hood comes off only once safely back indoors (so a fleeing Gnomer stays anonymous)
    if (this.hooded && !this.prowling && this._area && !this._area.outdoor) { this.hooded = false; this.speed = 44; }
    const want = this.slot(minutes, weather);
    if (want !== this.goal) {
      this.goal = want;
      const loc = world.resolveLocation(want, this.def.home);
      if (loc) {
        this.face = loc.face;
        this.path = findPath(world, this.tx, this.ty, loc.x, loc.y);
        if (!this.path) { this.placeAt(loc.x, loc.y, loc.face); this.path = []; } // unreachable: just appear there
      }
    }
    if (!this.path || this.path.length === 0) {
      this.moving = false;
      if (this.path) { this.dir = this.face; this.path = null; }
      this._area = world.areaAt(this.tx, this.ty);
      return;
    }
    const next = this.path[0];
    const adjacent = Math.abs(next.x - this.tx) + Math.abs(next.y - this.ty) <= 1;
    if (!adjacent) { // portal (door) hop
      this.placeAt(next.x, next.y);
      this.path.shift();
      this._area = world.areaAt(this.tx, this.ty);
      return;
    }
    const target = tileCenter(next.x, next.y);
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    this.moving = true;
    this.anim += dt;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) this.dir = dy > 0 ? 'down' : 'up';
    if (dist <= step) { this.x = target.x; this.y = target.y; this.path.shift(); }
    else { this.x += (dx / dist) * step; this.y += (dy / dist) * step; }
    this._area = world.areaAt(this.tx, this.ty);
  }
}

// Village cats: wander inside a rectangle, nap, and can be petted.
export class Cat {
  constructor(color, rect) {
    this.color = color;
    this.rect = rect; // [x, y, w, h] in tiles
    this.x = 0; this.y = 0;
    this.dir = 'right';
    this.moving = false;
    this.anim = 0;
    this.wait = 0;
    this.target = null;
    this.pettedDay = 0;
    this.pets = 0;        // pets today (companions can be petted several times)
    this.friendUntil = 0; // day number until which it follows the player
    this.area = null;
  }
  get tx() { return Math.floor(this.x / TILE); }
  get ty() { return Math.floor(this.y / TILE); }

  _randomTile(world) {
    const [rx, ry, rw, rh] = this.rect;
    for (let i = 0; i < 20; i++) {
      const x = rx + Math.floor(Math.random() * rw), y = ry + Math.floor(Math.random() * rh);
      if (!world.isSolid(x, y) && !world.portalAt(x, y)) return { x, y };
    }
    return null;
  }

  spawn(world) {
    const t = this._randomTile(world);
    if (t) { const c = tileCenter(t.x, t.y); this.x = c.x; this.y = c.y; }
    this.wait = 1 + Math.random() * 3;
  }

  // A befriended cat trots after the player (and hops through doors with them).
  follow(dt, world, player, playerArea, side = -1) {
    this.anim += dt;
    const back = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[player.dir];
    // two companions walk side by side instead of on top of each other
    const tx = player.x + back[0] * 14 + back[1] * side * 10, ty = player.y + back[1] * 12 + back[0] * side * 6;
    const d = Math.hypot(tx - this.x, ty - this.y);
    if (this.area !== playerArea || d > 140) { this.x = tx; this.y = ty; this.area = playerArea; this.moving = false; return; }
    if (d < 6) { this.moving = false; return; }
    const step = Math.min(d, (d > 40 ? 95 : 70) * dt);
    this.x += ((tx - this.x) / d) * step; this.y += ((ty - this.y) / d) * step;
    this.moving = true;
    if (Math.abs(tx - this.x) > 0.5) this.dir = tx > this.x ? 'right' : 'left';
  }

  update(dt, world) {
    this.anim += dt;
    this.area = world.areaAt(this.tx, this.ty);
    if (this.wait > 0) { this.wait -= dt; this.moving = false; return; }
    if (!this.target) {
      const t = this._randomTile(world);
      if (!t) { this.wait = 2; return; }
      this.target = tileCenter(t.x, t.y);
    }
    const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy), step = 26 * dt;
    if (d <= step) { this.target = null; this.wait = 2 + Math.random() * 6; this.moving = false; return; }
    const nx = this.x + (dx / d) * step, ny = this.y + (dy / d) * step;
    if (world.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE))) { this.target = null; this.wait = 1; return; }
    this.x = nx; this.y = ny; this.moving = true;
    if (Math.abs(dx) > 0.5) this.dir = dx > 0 ? 'right' : 'left';
  }
}
