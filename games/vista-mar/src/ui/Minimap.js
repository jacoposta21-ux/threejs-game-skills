import { LINES, xWidths, zWidths, BEACH, DISTRICTS, allBlocks, BOULEVARD_MEDIAN } from '../world/Layout.js';

// Pre-renders the city once into an offscreen canvas (1 px = 1 m), then the
// circular radar and the full-screen map sample from it each frame.
const MAP = { x0: -520, z0: -520, x1: 640, z1: 520 };

const KIND_COLORS = {
  building: '#58606d', tower: '#4e5666', club: '#7b4a80', hotel: '#a8846a', apartment: '#7d7a6c',
  house: '#c7a27e', warehouse: '#6b6a64', container: '#8a6a50', pool: '#3fc3d8', car: '#3a3e45',
  canopy: '#b8322d', shop: '#8a8a7c', beach: '#c8aa7a',
};

export class Minimap {
  constructor(city) {
    this.city = city;
    this.base = document.createElement('canvas');
    this.base.width = MAP.x1 - MAP.x0;
    this.base.height = MAP.z1 - MAP.z0;
    this.render();
    this.radar = document.getElementById('minimap');
    this.rctx = this.radar.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.radar.width = 220 * dpr;
    this.radar.height = 220 * dpr;
    this.dpr = dpr;
    this.big = document.getElementById('bigmap');
  }

  render() {
    const c = this.base.getContext('2d');
    const X = (x) => x - MAP.x0, Z = (z) => z - MAP.z0;
    c.fillStyle = '#2f3a2c';
    c.fillRect(0, 0, this.base.width, this.base.height);
    // ocean + sand
    c.fillStyle = '#16384a';
    c.fillRect(X(466), 0, this.base.width, this.base.height);
    c.fillStyle = '#c9b48a';
    c.fillRect(X(BEACH.promenadeEnd), 0, 466 - BEACH.promenadeEnd, this.base.height);
    // blocks tinted by district
    for (const b of allBlocks()) {
      c.fillStyle = '#9a958c';
      c.fillRect(X(b.minX), Z(b.minZ), b.maxX - b.minX, b.maxZ - b.minZ);
      const d = DISTRICTS[b.district];
      c.fillStyle = b.special === 'park' ? '#3f6e3a' : b.district === 'residential' ? '#4d6b42' : shade(d.color, -30);
      c.fillRect(X(b.minX + 4), Z(b.minZ + 4), b.maxX - b.minX - 8, b.maxZ - b.minZ - 8);
    }
    // roads
    c.fillStyle = '#23262c';
    LINES.forEach((x, k) => c.fillRect(X(x - xWidths[k] / 2), Z(LINES[0] - 7), xWidths[k], LINES[8] - LINES[0] + 14));
    LINES.forEach((z, k) => c.fillRect(X(LINES[0] - 7), Z(z - zWidths[k] / 2), LINES[8] - LINES[0] + 16, zWidths[k]));
    c.fillStyle = '#3f6e3a';
    c.fillRect(X(LINES[0]), Z(-BOULEVARD_MEDIAN / 2), LINES[8] - LINES[0], BOULEVARD_MEDIAN);
    // centre lines
    c.strokeStyle = 'rgba(255,214,90,0.35)';
    c.lineWidth = 0.8;
    LINES.forEach((x) => { c.beginPath(); c.moveTo(X(x), Z(-407)); c.lineTo(X(x), Z(407)); c.stroke(); });
    LINES.forEach((z) => { if (z === 0) return; c.beginPath(); c.moveTo(X(-407), Z(z)); c.lineTo(X(408), Z(z)); c.stroke(); });
    // footprints
    for (const f of this.city.footprints) {
      c.fillStyle = KIND_COLORS[f.kind] || '#5a606a';
      c.fillRect(X(f.x0), Z(f.z0), f.x1 - f.x0, f.z1 - f.z0);
      if (f.h > 30) {
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(X(f.x0), Z(f.z0), f.x1 - f.x0, 2);
      }
    }
    // palms as dots
    c.fillStyle = 'rgba(90,150,80,0.9)';
    for (const p of this.city.props.palms) c.fillRect(X(p.x) - 0.8, Z(p.z) - 0.8, 1.6, 1.6);
  }

  /** Radar: rotates so the camera's forward direction points up. */
  drawRadar(player, cameraYaw, markers, zoom = 1.1) {
    const c = this.rctx, S = this.radar.width, R = S / 2;
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#1b2026'; c.fillRect(0, 0, S, S);
    const theta = -Math.PI / 2 - Math.atan2(Math.cos(cameraYaw), Math.sin(cameraYaw));
    const scale = zoom * this.dpr;
    c.translate(R, R);
    c.rotate(theta);
    c.scale(scale, scale);
    c.translate(-(player.pos.x - MAP.x0), -(player.pos.z - MAP.z0));
    c.imageSmoothingEnabled = true;
    c.drawImage(this.base, 0, 0);
    c.restore();

    // markers (clamped to the rim when off-radar)
    const rot = (x, z) => {
      const dx = (x - player.pos.x) * scale, dz = (z - player.pos.z) * scale;
      const cs = Math.cos(theta), sn = Math.sin(theta);
      return [dx * cs - dz * sn, dx * sn + dz * cs];
    };
    for (const m of markers) {
      let [mx, my] = rot(m.x, m.z);
      const d = Math.hypot(mx, my);
      const lim = R - 12 * this.dpr;
      const edge = d > lim;
      if (edge) { if (!m.edge) continue; mx = (mx / d) * lim; my = (my / d) * lim; }
      c.save();
      c.translate(R + mx, R + my);
      c.fillStyle = m.color;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 2 * this.dpr;
      const s = (m.size || 6) * this.dpr;
      c.beginPath();
      if (m.shape === 'diamond') { c.moveTo(0, -s); c.lineTo(s, 0); c.lineTo(0, s); c.lineTo(-s, 0); c.closePath(); }
      else if (m.shape === 'car') { c.roundRect ? c.roundRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2, s * 0.3) : c.rect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2); }
      else c.arc(0, 0, s * 0.7, 0, Math.PI * 2);
      c.fill(); c.stroke();
      if (m.label) { c.fillStyle = '#fff'; c.font = `700 ${9 * this.dpr}px Inter, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(m.label, 0, 0.5); }
      c.restore();
    }
    // player arrow (heading relative to camera)
    const ha = player.heading;
    const [ax, ay] = rot(player.pos.x + Math.sin(ha), player.pos.z + Math.cos(ha));
    const ang = Math.atan2(ay, ax);
    c.save();
    c.translate(R, R);
    c.rotate(ang + Math.PI / 2);
    const s = 8 * this.dpr;
    c.fillStyle = '#ffd23f'; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 2 * this.dpr;
    c.beginPath(); c.moveTo(0, -s * 1.3); c.lineTo(s, s); c.lineTo(0, s * 0.45); c.lineTo(-s, s); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // north indicator on the rim
    const [nx, ny] = rot(player.pos.x, player.pos.z - 1000);
    const nd = Math.hypot(nx, ny) || 1;
    const nr = R - 11 * this.dpr;
    c.save();
    c.translate(R + (nx / nd) * nr, R + (ny / nd) * nr);
    c.fillStyle = 'rgba(10,12,20,0.85)'; c.beginPath(); c.arc(0, 0, 9 * this.dpr, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = `800 ${11 * this.dpr}px "Barlow Condensed", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', 0, 1);
    c.restore();
    // vignette ring
    const g = c.createRadialGradient(R, R, R * 0.75, R, R, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  }

  drawBig(player, markers) {
    const maxW = Math.min(window.innerWidth - 260, 900), maxH = window.innerHeight - 80;
    const sc = Math.max(0.3, Math.min(maxW / this.base.width, maxH / this.base.height));
    const dpr = this.dpr;
    const w = Math.round(this.base.width * sc), h = Math.round(this.base.height * sc);
    this.big.style.width = w + 'px';
    this.big.style.height = h + 'px';
    this.big.width = w * dpr; this.big.height = h * dpr;
    const c = this.big.getContext('2d');
    c.scale(dpr, dpr);
    c.drawImage(this.base, 0, 0, w, h);
    const P = (x, z) => [(x - MAP.x0) * sc, (z - MAP.z0) * sc];
    // district labels
    c.font = `italic 800 ${Math.max(12, 18 * sc * 1.4)}px "Barlow Condensed", sans-serif`;
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 4;
    const labels = [['DOWNTOWN', 50, -60], ['NEON MILE', 250, 90], ['OCEAN DRIVE', 350, -330], ['PALM HEIGHTS', -250, 250], ['PORT INDUSTRIAL', -250, -250], ['MIDTOWN', 50, -300], ['CORAL GABLES', 50, 310], ['VISTA MAR BEACH', 440, 120], ['ATLANTIC OCEAN', 560, -150]];
    for (const [t, x, z] of labels) { const [px, pz] = P(x, z); c.fillText(t, px, pz); }
    c.shadowBlur = 0;
    for (const m of markers) {
      const [px, pz] = P(m.x, m.z);
      c.fillStyle = m.color; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath();
      if (m.shape === 'diamond') { c.moveTo(px, pz - 7); c.lineTo(px + 7, pz); c.lineTo(px, pz + 7); c.lineTo(px - 7, pz); c.closePath(); }
      else c.arc(px, pz, 5, 0, 7);
      c.fill(); c.stroke();
    }
    const [px, pz] = P(player.pos.x, player.pos.z);
    c.save(); c.translate(px, pz); c.rotate(Math.atan2(Math.cos(player.heading), Math.sin(player.heading)) + Math.PI / 2 - Math.PI);
    c.rotate(Math.PI);
    c.fillStyle = '#ffd23f'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 3); c.lineTo(-8, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
