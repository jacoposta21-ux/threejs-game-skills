import type { LevelDef } from './levels';

export const SEG_H = 24;

/** Concatenate segments into one grid. Rows shorter than the segment width are padded with their last char. */
export function compileLevel(def: LevelDef): { grid: string[][]; width: number; height: number; warnings: string[] } {
  const warnings: string[] = [];
  const rows: string[] = Array.from({ length: SEG_H }, () => '##');
  def.segments.forEach((seg, si) => {
    if (seg.length !== SEG_H) warnings.push(`${def.id} seg ${si}: ${seg.length} rows (expected ${SEG_H})`);
    const w = Math.max(...seg.map((r) => r.length));
    seg.forEach((r, ri) => {
      if (r.length > w) warnings.push(`${def.id} seg ${si} row ${ri}: width ${r.length} != ${w}`);
    });
    for (let y = 0; y < SEG_H; y++) {
      const r = seg[y] ?? '#'.repeat(w);
      rows[y] += r.padEnd(w, r[r.length - 1] || ' ');
    }
  });
  for (let y = 0; y < SEG_H; y++) rows[y] += '##';
  rows[0] = '#'.repeat(rows[0].length);
  rows[SEG_H - 1] = '#'.repeat(rows[0].length);
  const grid = rows.map((r) => r.split(''));
  return { grid, width: rows[0].length, height: SEG_H, warnings };
}
