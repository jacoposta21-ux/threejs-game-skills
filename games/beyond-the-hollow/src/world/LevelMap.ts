import Phaser from 'phaser';
import { LevelDef } from '../levels/levels';
import { compileLevel } from '../levels/compile';
import { TILE, DEPTH } from '../core/constants';
import { PAD, TILE_ACID, TILE_ACID_TOP, TILE_BACK, TILE_LADDER, TILE_ONEWAY, TILE_SPIKE, TILE_SPIKE_DOWN, TILE_WATER, TILE_WATER_TOP } from '../art/tiles';
import { PROP_SCALE } from '../art/props';
import { rng } from '../art/paint';

export interface Spawn {
  ch: string;
  tx: number;
  ty: number;
  x: number; // world center x of the cell
  y: number; // world bottom y of the cell (feet)
  h?: number; // stack height in tiles (doors, cocoons)
}

/** Builds the tilemap layers for a level and exposes grid queries used by physics, AI and hazards. */
export class LevelMap {
  grid: string[][];
  W: number;
  H: number;
  map!: Phaser.Tilemaps.Tilemap;
  ground!: Phaser.Tilemaps.TilemapLayer;
  liquid!: Phaser.Tilemaps.TilemapLayer;
  back?: Phaser.Tilemaps.TilemapLayer;
  spawns: Spawn[] = [];
  blocked = new Set<number>(); // dynamic blocked cells (closed doors) for crawler pathing
  widthPx: number;
  heightPx: number;

  constructor(private scene: Phaser.Scene, public def: LevelDef) {
    const c = compileLevel(def);
    this.grid = c.grid;
    this.W = c.width;
    this.H = c.height;
    this.widthPx = this.W * TILE;
    this.heightPx = this.H * TILE;
  }

  ch(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return '#';
    return this.grid[ty][tx];
  }
  isSolidCh(c: string) {
    return c === '#' || c === '{' || c === '}';
  }
  /** conveyor direction of the floor tile under a world point: -1, 0 or 1 */
  beltAtWorld(x: number, y: number) {
    const c = this.ch(Math.floor(x / TILE), Math.floor(y / TILE));
    return c === '{' ? -1 : c === '}' ? 1 : 0;
  }
  solid(tx: number, ty: number) {
    return this.isSolidCh(this.ch(tx, ty)) || this.blocked.has(ty * this.W + tx);
  }
  solidAtWorld(x: number, y: number) {
    return this.solid(Math.floor(x / TILE), Math.floor(y / TILE));
  }
  isWater(tx: number, ty: number) {
    const c = this.ch(tx, ty);
    return c === '~' || c === '<' || c === '>';
  }
  waterAtWorld(x: number, y: number) {
    return this.isWater(Math.floor(x / TILE), Math.floor(y / TILE));
  }
  currentAtWorld(x: number, y: number) {
    const c = this.ch(Math.floor(x / TILE), Math.floor(y / TILE));
    return c === '>' ? 1 : c === '<' ? -1 : 0;
  }
  ladderAtWorld(x: number, y: number) {
    return this.ch(Math.floor(x / TILE), Math.floor(y / TILE)) === 'H';
  }
  hazardAtWorld(x: number, y: number): 'spike' | 'acid' | null {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const c = this.ch(tx, ty);
    if (c === '^') return y % TILE > 12 ? 'spike' : null;
    if (c === 'v') return y % TILE < 20 ? 'spike' : null;
    if (c === 'a') return y % TILE > 8 || this.ch(tx, ty - 1) === 'a' ? 'acid' : null;
    return null;
  }

  build() {
    const s = this.scene;
    const theme = this.def.theme;
    const map = s.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.W, height: this.H });
    this.map = map;
    const ts = map.addTilesetImage('tiles-' + theme, 'tiles-' + theme, TILE, TILE, PAD, PAD * 2)!;
    const r = rng(this.def.id.length * 7919);
    // back wall layer
    if (this.def.backWall) {
      const back = map.createBlankLayer('back', ts)!;
      back.setDepth(DEPTH.backWall);
      for (let y = 0; y < this.H; y++)
        for (let x = 0; x < this.W; x++) {
          if (this.solid(x, y)) continue;
          let above = false, below = false;
          for (let k = 1; k <= 9; k++) if (this.solid(x, y - k)) { above = true; break; }
          for (let k = 1; k <= 12; k++) if (this.solid(x, y + k)) { below = true; break; }
          const n = Math.sin(x * 0.37 + Math.sin(y * 0.5) * 2) + Math.sin(y * 0.61 + x * 0.11);
          if (above && below && n > -0.9) {
            const t = back.putTileAt(TILE_BACK + Math.floor(r() * 8), x, y);
            t.tint = this.def.theme === 'station' ? 0x6a7078 : 0x585e6c;
          }
        }
      this.back = back;
    }
    const ground = map.createBlankLayer('ground', ts)!;
    ground.setDepth(DEPTH.tiles);
    const liquid = map.createBlankLayer('liquid', ts)!;
    liquid.setDepth(DEPTH.water);
    liquid.setAlpha(0.85);
    this.ground = ground;
    this.liquid = liquid;
    const stacks = new Set<string>();
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        const c = this.grid[y][x];
        if (this.isSolidCh(c)) {
          const S = (cx: number, cy: number) => this.isSolidCh(this.ch(cx, cy));
          const mask = (S(x, y - 1) ? 1 : 0) | (S(x + 1, y) ? 2 : 0) | (S(x, y + 1) ? 4 : 0) | (S(x - 1, y) ? 8 : 0);
          const v = (x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0 ? 1 : 0;
          ground.putTileAt(v * 16 + mask, x, y);
        } else if (c === '=') {
          ground.putTileAt(TILE_ONEWAY, x, y);
        } else if (c === 'H') {
          ground.putTileAt(TILE_LADDER, x, y);
        } else if (c === '^') {
          ground.putTileAt(TILE_SPIKE, x, y);
        } else if (c === 'v') {
          ground.putTileAt(TILE_SPIKE_DOWN, x, y);
        } else if (c === '~' || c === '<' || c === '>') {
          const top = !this.isWater(x, y - 1) && this.ch(x, y - 1) !== '#';
          liquid.putTileAt(top ? TILE_WATER_TOP : TILE_WATER, x, y);
        } else if (c === 'a') {
          liquid.putTileAt(this.ch(x, y - 1) === 'a' ? TILE_ACID : TILE_ACID_TOP, x, y);
        }
        if ('PCEiBo_MhLG+!rm%csbXWDwKTYZdpNV'.includes(c)) {
          if (c === 'D' || c === 'w') {
            if (this.ch(x, y - 1) === c) continue; // part of a stack started above
            let h = 1;
            while (this.ch(x, y + h) === c) h++;
            this.spawns.push({ ch: c, tx: x, ty: y, x: x * TILE + TILE / 2, y: (y + h) * TILE, h });
            stacks.add(`${x},${y}`);
          } else {
            this.spawns.push({ ch: c, tx: x, ty: y, x: x * TILE + TILE / 2, y: (y + 1) * TILE });
          }
        }
      }
    // collisions: solid tiles on all faces, one-way and ladder tops only from above
    ground.setCollisionBetween(0, 31, true);
    ground.forEachTile((t) => {
      if (t.index === TILE_ONEWAY || (t.index === TILE_LADDER && this.ch(t.x, t.y - 1) !== 'H')) {
        t.setCollision(false, false, true, false);
      }
    });
    this.decorate(r);
  }

  /** Scatter painted decor on surfaces and ceilings so the tile grid disappears. */
  private decorate(r: () => number) {
    const s = this.scene;
    const th = this.def.theme;
    for (let y = 1; y < this.H - 1; y++)
      for (let x = 1; x < this.W - 1; x++) {
        if (this.grid[y][x] !== '#') continue;
        const above = this.ch(x, y - 1);
        if (above === '-') continue;
        if (above === ' ' && this.ch(x, y - 2) !== '#' && r() < 0.42) {
          const k = Math.floor(r() * 6);
          const front = r() < 0.22;
          const img = s.add.image(x * TILE + 4 + r() * 24, y * TILE + 3, `decor-${th}-${k}`).setOrigin(0.5, 1).setScale(PROP_SCALE * (0.8 + r() * 0.45));
          img.setDepth(front ? DEPTH.decorFront : DEPTH.decorBack);
          if (front) img.setTint(0x9098a0);
          if (r() < 0.5) img.setFlipX(true);
        }
        const below = this.ch(x, y + 1);
        if (below === ' ' && this.ch(x, y + 2) === ' ' && r() < 0.2) {
          const img = s.add.image(x * TILE + 16, (y + 1) * TILE - 2, `hang-${th}-${Math.floor(r() * 3)}`).setOrigin(0.5, 0).setScale(PROP_SCALE * (0.8 + r() * 0.6));
          img.setDepth(DEPTH.decorBack);
        }
      }
  }
}
