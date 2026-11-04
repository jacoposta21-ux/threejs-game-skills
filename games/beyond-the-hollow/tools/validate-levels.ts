// Reachability validator: node --experimental-strip-types tools/validate-levels.ts
import { LEVELS } from '../src/levels/levels.ts';
import { compileLevel } from '../src/levels/compile.ts';

let failed = false;
for (const [li, def] of LEVELS.entries()) {
  const { grid, width: W, height: H, warnings } = compileLevel(def);
  for (const w of warnings) { console.log('WARN', w); failed = true; }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : grid[y][x]);
  const solid = (c: string) => c === '#' || c === 'h' || c === '!' || c === '{' || c === '}';
  const hazard = (c: string) => c === '^' || c === 'v' || c === 'a';
  const pass = (x: number, y: number) => !solid(at(x, y)) && !hazard(at(x, y)) && !((at(x, y) === 'Q' || at(x, y) === 'q') && false);
  const water = (x: number, y: number) => '~<>'.includes(at(x, y));
  const ladder = (x: number, y: number) => 'H|Y:g'.includes(at(x, y)) && at(x, y) !== ' ';
  const support = (x: number, y: number) => {
    const c = at(x, y);
    return solid(c) || c === '=' || c === '-' || c === 'T' || c === 'Q' || c === 'q' || (c === 'H' && at(x, y - 1) !== 'H') || ((c === '|' || c === 'Y') && at(x, y - 1) !== '|');
  };
  const isNode = (x: number, y: number) => {
    if (!pass(x, y)) return false;
    if (water(x, y) || ladder(x, y)) return true;
    return support(x, y + 1) && (pass(x, y - 1) || true);
  };
  const tall = (x: number, y: number) => pass(x, y - 1);
  const find = (ch: string) => {
    const out: [number, number][] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === ch) out.push([x, y]);
    return out;
  };
  const start = find('P')[0];
  if (!start) { console.log(def.id, 'NO START'); failed = true; continue; }
  const key = (x: number, y: number) => y * W + x;
  const seen = new Set<number>();
  const q: [number, number][] = [];
  const push = (x: number, y: number) => {
    const k = key(x, y);
    if (!seen.has(k) && pass(x, y)) { seen.add(k); q.push([x, y]); }
  };
  // fall from (x,y) straight down to first node
  const fall = (x: number, y: number) => {
    let yy = y;
    while (yy < H - 1 && pass(x, yy + 1) && !support(x, yy + 1) && !water(x, yy) && !ladder(x, yy)) yy++;
    if (pass(x, yy) && !hazard(at(x, yy + 1))) push(x, yy);
  };
  const up = def.doubleJump ? 5 : 3;
  push(start[0], start[1]);
  while (q.length) {
    const [x, y] = q.shift()!;
    const inWater = water(x, y) || water(x, y - 1);
    const onLadder = ladder(x, y) || ladder(x, y - 1);
    const grounded = support(x, y + 1);
    if (inWater || onLadder) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!pass(nx, ny)) continue;
        if (water(nx, ny) || ladder(nx, ny) || isNode(nx, ny)) push(nx, ny);
        else fall(nx, ny);
      }
    }
    // walking / crouching
    for (const d of [-1, 1]) {
      if (pass(x + d, y)) {
        if (isNode(x + d, y)) push(x + d, y);
        else if (tall(x + d, y) || !tall(x, y)) fall(x + d, y);
      }
    }
    // jumping (from ground, ladder or water surface)
    const canJump = grounded || onLadder || (inWater && !water(x, y - 1));
    if (!canJump || !tall(x, y)) continue;
    const bounce = 'mu'.includes(at(x, y)) || 'mu'.includes(at(x - 1, y)) || 'mu'.includes(at(x + 1, y));
    const updraft = at(x, y) === 'u' || at(x - 1, y) === 'u' || at(x + 1, y) === 'u';
    const maxUp = updraft ? 17 : bounce ? (def.doubleJump ? 12 : 10) : up;
    for (let dy = -14; dy <= maxUp; dy++) {
      const maxDx = bounce && dy > 3 ? 6 : dy <= 1 ? (def.doubleJump ? 7 : 5) : dy <= 3 ? (def.doubleJump ? 6 : 4) : 4;
      // rise column
      let ok = true;
      for (let k = 1; k <= Math.max(0, dy); k++) if (!pass(x, y - 1 - k)) { ok = false; break; }
      if (!ok) continue;
      const top = y - Math.max(0, dy);
      for (const s of [-1, 1]) {
        for (let dx = 0; dx <= maxDx; dx++) {
          const tx = x + s * dx;
          if (!pass(tx, top) || !pass(tx, top - 1)) break;
          const ty = y - dy;
          if (dy >= 0) {
            if (isNode(tx, ty) && (dx > 0 || dy > 0)) push(tx, ty);
          } else {
            // descend column at tx
            let clear = true;
            for (let yy = top; yy <= ty; yy++) if (!pass(tx, yy)) { clear = false; break; }
            if (clear && isNode(tx, ty)) push(tx, ty);
          }
        }
      }
    }
    // ledge grab: wall top up to 4 above, directly adjacent
    if (!def.doubleJump) {
      for (const s of [-1, 1]) {
        for (let dy = 4; dy <= 4; dy++) {
          let ok = true;
          for (let k = 1; k <= dy; k++) if (!pass(x, y - 1 - k)) ok = false;
          if (ok && isNode(x + s, y - dy) && tall(x + s, y - dy)) push(x + s, y - dy);
        }
      }
    }
  }
  const hooks = find('n');
  const hooked = new Set<number>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [hx, hy] of hooks) {
      if (hooked.has(key(hx, hy))) continue;
      let near = false;
      for (const k of seen) { const nx = k % W, ny = Math.floor(k / W); if (Math.hypot(nx - hx, ny - hy) <= 10) { near = true; break; } }
      if (!near) continue;
      hooked.add(key(hx, hy));
      seen.add(key(hx, hy)); // swinging node to node: other nodes in reach count as reachable
      for (let y = hy - 10; y <= hy + 10; y++) for (let x = hx - 10; x <= hx + 10; x++) if (Math.hypot(x - hx, y - hy) <= 9.5 && isNode(x, y) && tall(x, y)) push(x, y);
      // continue the BFS from the new spots
      while (q.length) {
        const [x, y] = q.shift()!;
        for (const d of [-1, 1]) if (pass(x + d, y) && isNode(x + d, y)) push(x + d, y);
        if (support(x, y + 1) || water(x, y)) for (let dy = -14; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) { const tx = x + dx, ty = y - dy; if (isNode(tx, ty) && tall(tx, ty) && Math.abs(dx) + Math.max(0, dy) <= 9) { let ok = true; for (let yy = Math.min(y, ty) - 1; yy <= Math.max(y, ty); yy++) if (!pass(tx, yy) && yy !== ty + 1) { ok = false; break; } if (ok) push(tx, ty); } }
      }
      grew = true;
    }
  }
  const reach = (x: number, y: number) => seen.has(key(x, y));
  const nearReach = (x: number, y: number, r: number) => {
    for (const k of seen) {
      const nx = k % W, ny = Math.floor(k / W);
      if (Math.hypot(nx - x, ny - y) <= r) return true;
    }
    return false;
  };
  const exit = find('E')[0];
  const report: string[] = [];
  const exitOk = exit && reach(exit[0], exit[1]);
  if (!exitOk) { report.push('EXIT UNREACHABLE'); failed = true; }
  for (const [x, y] of find('C')) if (!reach(x, y)) { report.push(`checkpoint (${x},${y}) unreachable`); failed = true; }
  for (const [x, y] of [...find('M'), ...find('N')]) if (!nearReach(x, y, 9)) { report.push(`mechanism (${x},${y}) out of Pip range`); failed = true; }
  for (const [x, y] of find('o')) if (!reach(x, y)) report.push(`lore (${x},${y}) unreachable (warn)`);
  const hints = find('i').length;
  if (hints > def.hints.length) report.push(`more hint markers (${hints}) than hint texts (${def.hints.length})`);
  const lore = find('o').length;
  if (lore !== def.lore.length) report.push(`lore markers ${lore} != texts ${def.lore.length}`);
  console.log(`L${li + 1} ${def.id.padEnd(8)} ${W}x${H} reachable=${seen.size} exit=${exitOk ? 'OK' : 'NO'} ${report.join('; ')}`);
  if (process.argv.includes('--map') && Number(process.argv[process.argv.indexOf('--map') + 1]) === li + 1) {
    for (let y = 0; y < H; y++) console.log(grid[y].map((c, x) => (seen.has(key(x, y)) && c === ' ' ? '·' : c)).join(''));
  }
}
process.exit(failed ? 1 : 0);
