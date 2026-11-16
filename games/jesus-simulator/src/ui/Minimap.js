import { WORLD_HALF, PLAY_RADIUS, LANDMARKS, REGIONS } from '../world/layout.js';

const EXTENT = 140; // metres from origin covered by the map image
const BASE = 1024;
const PX_PER_M = BASE / (EXTENT * 2);
const toBase = (v) => (v + EXTENT) * PX_PER_M;

/** Builds a crisp top-down map of the valley from the terrain splat + building footprints. */
export function buildMapBase(splatCanvas, footprints) {
  const c = document.createElement('canvas');
  c.width = c.height = BASE;
  const g = c.getContext('2d');
  const splatPxPerM = splatCanvas.width / (WORLD_HALF * 2);
  const sx = (WORLD_HALF - EXTENT) * splatPxPerM;
  const ss = EXTENT * 2 * splatPxPerM;
  g.imageSmoothingEnabled = true;
  g.drawImage(splatCanvas, sx, sx, ss, ss, 0, 0, BASE, BASE);
  // parchment wash so the map reads as a map, not a photo
  g.fillStyle = 'rgba(247, 230, 190, 0.28)';
  g.fillRect(0, 0, BASE, BASE);

  for (const f of footprints) {
    g.save();
    g.translate(toBase(f.x), toBase(f.z));
    g.rotate(-f.ry);
    const w = f.w * PX_PER_M;
    const d = f.d * PX_PER_M;
    g.fillStyle = f.kind === 'synagogue' ? '#fff6e2' : f.kind === 'workshop' ? '#d9a86a' : '#f3e6c8';
    g.strokeStyle = 'rgba(90, 60, 30, 0.85)';
    g.lineWidth = 2;
    if (f.round) {
      g.beginPath();
      g.arc(0, 0, w / 2, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else {
      g.fillRect(-w / 2, -d / 2, w, d);
      g.strokeRect(-w / 2, -d / 2, w, d);
    }
    g.restore();
  }
  // valley boundary
  g.strokeStyle = 'rgba(140, 60, 30, 0.55)';
  g.setLineDash([10, 8]);
  g.lineWidth = 3;
  g.beginPath();
  g.arc(toBase(0), toBase(0), PLAY_RADIUS * PX_PER_M, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  return c;
}

function landmarkPin(g, x, y, discovered, highlight, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  if (highlight) {
    g.fillStyle = 'rgba(255, 210, 90, 0.35)';
    g.beginPath();
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = discovered ? '#f2c14e' : '#fff8ea';
  g.strokeStyle = '#4a2c16';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, 8, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#4a2c16';
  g.font = '800 11px Trebuchet MS, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(discovered ? '✓' : '?', 0, 0.5);
  g.restore();
}

function playerArrow(g, angle, size = 11) {
  g.save();
  g.rotate(angle);
  g.fillStyle = '#b8262b';
  g.strokeStyle = '#fff';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.75, size * 0.8);
  g.lineTo(0, size * 0.4);
  g.lineTo(-size * 0.75, size * 0.8);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

export class Minimap {
  constructor(canvas, base) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.base = base;
    this.radiusM = 48;
  }

  draw(pos, playerYaw, cameraYaw, discovered, nextId, time, dots) {
    const g = this.g;
    const size = this.canvas.width;
    const half = size / 2;
    const scale = half / this.radiusM / PX_PER_M;
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(half, half, half, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#c9b27e';
    g.fillRect(0, 0, size, size);
    g.translate(half, half);
    g.rotate(cameraYaw);
    g.scale(scale, scale);
    g.drawImage(this.base, -toBase(pos.x), -toBase(pos.z));
    g.setTransform(1, 0, 0, 1, 0, 0);

    // landmarks (clamped to the rim when off-map)
    const c = Math.cos(cameraYaw);
    const s = Math.sin(cameraYaw);
    // villagers
    for (const n of dots || []) {
      const dx = (n.x - pos.x) * PX_PER_M * scale;
      const dz = (n.z - pos.z) * PX_PER_M * scale;
      const x = dx * c - dz * s;
      const y = dx * s + dz * c;
      if (Math.hypot(x, y) > half - 6) continue;
      g.fillStyle = n.named ? '#2f6fb0' : '#5f7f9a';
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(half + x, half + y, n.named ? 3.6 : 2.8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const l of LANDMARKS) {
      const dx = (l.x - pos.x) * PX_PER_M * scale;
      const dz = (l.z - pos.z) * PX_PER_M * scale;
      let x = dx * c - dz * s;
      let y = dx * s + dz * c;
      const r = Math.hypot(x, y);
      const max = half - 12;
      if (r > max) {
        x = (x / r) * max;
        y = (y / r) * max;
      }
      const isNext = l.id === nextId;
      landmarkPin(g, half + x, half + y, discovered.has(l.id), isNext && Math.sin(time * 5) > -0.3, 0.9);
    }
    g.translate(half, half);
    playerArrow(g, Math.PI - playerYaw + cameraYaw, 10);
    g.restore();
  }
}

/** Full-screen valley map used by TAB and the pause menu. */
export function drawWorldMap(canvas, base, pos, playerYaw, discovered, nextId) {
  const g = canvas.getContext('2d');
  const size = canvas.width;
  const k = size / BASE;
  g.clearRect(0, 0, size, size);
  g.drawImage(base, 0, 0, size, size);
  const toMap = (v) => toBase(v) * k;

  // regions beyond the valley
  g.font = '700 15px Palatino Linotype, Georgia, serif';
  g.textAlign = 'center';
  for (const r of REGIONS) {
    if (r.open) continue;
    const ang = Math.atan2(r.z, r.x);
    const x = size / 2 + Math.cos(ang) * size * 0.43;
    const y = size / 2 + Math.sin(ang) * size * 0.43;
    g.fillStyle = 'rgba(43, 27, 16, 0.72)';
    const label = `${r.name} →`;
    const w = g.measureText(label).width + 22;
    g.beginPath();
    g.roundRect(x - w / 2, y - 14, w, 28, 14);
    g.fill();
    g.fillStyle = '#f7ecd4';
    g.fillText(label, x, y + 5);
  }

  for (const l of LANDMARKS) {
    const x = toMap(l.x);
    const y = toMap(l.z);
    const found = discovered.has(l.id);
    landmarkPin(g, x, y, found, l.id === nextId, 1.4);
    g.font = '700 14px Trebuchet MS, sans-serif';
    const label = found ? l.name : '???';
    const w = g.measureText(label).width + 14;
    g.fillStyle = 'rgba(255, 248, 234, 0.88)';
    g.beginPath();
    g.roundRect(x - w / 2, y + 14, w, 22, 8);
    g.fill();
    g.fillStyle = '#4a2c16';
    g.fillText(label, x, y + 30);
  }
  g.save();
  g.translate(toMap(pos.x), toMap(pos.z));
  playerArrow(g, Math.PI - playerYaw, 14);
  g.restore();
}
