/**
 * Uniform bucket grid over the 160×160 world for radius queries. Items are
 * referenced by numeric index into a caller-owned array; buckets store indices.
 * Queries write into a reusable output array to avoid per-call garbage.
 */
export class SpatialGrid {
  private readonly buckets: number[][];
  private readonly dim: number;
  private readonly half: number;

  constructor(
    worldSize: number,
    private readonly cellSize: number,
  ) {
    this.dim = Math.ceil(worldSize / cellSize);
    this.half = worldSize / 2;
    this.buckets = Array.from({ length: this.dim * this.dim }, () => []);
  }

  private cellOf(x: number, z: number): number {
    const cx = Math.min(this.dim - 1, Math.max(0, Math.floor((x + this.half) / this.cellSize)));
    const cz = Math.min(this.dim - 1, Math.max(0, Math.floor((z + this.half) / this.cellSize)));
    return cz * this.dim + cx;
  }

  clear(): void {
    for (const bucket of this.buckets) bucket.length = 0;
  }

  insert(index: number, x: number, z: number): void {
    this.buckets[this.cellOf(x, z)].push(index);
  }

  remove(index: number, x: number, z: number): void {
    const bucket = this.buckets[this.cellOf(x, z)];
    const at = bucket.indexOf(index);
    if (at >= 0) bucket.splice(at, 1);
  }

  /** Collect candidate indices whose bucket intersects the query square. Caller filters exact distance. */
  query(x: number, z: number, radius: number, out: number[]): number[] {
    out.length = 0;
    const minX = Math.max(0, Math.floor((x - radius + this.half) / this.cellSize));
    const maxX = Math.min(this.dim - 1, Math.floor((x + radius + this.half) / this.cellSize));
    const minZ = Math.max(0, Math.floor((z - radius + this.half) / this.cellSize));
    const maxZ = Math.min(this.dim - 1, Math.floor((z + radius + this.half) / this.cellSize));
    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets[cz * this.dim + cx];
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }
}
