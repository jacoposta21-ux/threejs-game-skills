import Phaser from 'phaser';
import { Ctx, limb, linear, paintSheet, radial } from './paint';

/** Elias is painted procedurally from a forward-kinematic pose per frame (2x resolution, shown at 0.5 scale). */
export const ELIAS_FW = 128;
export const ELIAS_FH = 160;
const GROUND = 152;

interface Pose {
  hipL: number; kneeL: number; hipR: number; kneeR: number;
  shL: number; elL: number; shR: number; elR: number;
  lean: number; head: number; bob: number;
  scarf: number; scarfLift: number; scarfUp?: number;
  grounded?: boolean; aim?: number; glow?: number; squash?: number; rot?: number; yOff?: number; xOff?: number; hairWind?: number;
}

const ELIAS_PAL = {
  longHair: false,
  hood: true,
  outline: '#0a0d12',
  jacket: '#c2462a', jacketHi: '#ee7a4c', jacketLo: '#7c2616', shirt: '#eadfc4',
  pants: '#4a3a2c', pantsFar: '#2e241b',
  shoe: '#6b452c', shoeFar: '#472d1d',
  skin: '#efc9a3', skinShade: '#c99a76',
  hair: '#3b2416', hairHi: '#6a4128',
  scarf: '#b23e24', scarfHi: '#e8744a', scarfLo: '#6e2212',
  pack: '#5a5236', packHi: '#857a4e',
  coil: '#7ff5e0', brass: '#c99a4a',
};
type Pal = typeof ELIAS_PAL;
/** Ilse Varga: teal field coat, long auburn hair, her red scarf. */
const ILSE_PAL: Pal = {
  ...ELIAS_PAL,
  longHair: true,
  hood: false,
  jacket: '#2f6a6a', jacketHi: '#5aa8a0', jacketLo: '#173a3c', shirt: '#e8e0d0',
  pants: '#2c2a34', pantsFar: '#1c1a22',
  hair: '#7a3420', hairHi: '#b0583a',
  scarf: '#d8402a', scarfHi: '#ff7a5a', scarfLo: '#8a2010',
  pack: '#4a4038', packHi: '#6a5e50',
};
let C: Pal = ELIAS_PAL;

const LEG1 = 23, LEG2 = 22, ARM1 = 17, ARM2 = 16, TORSO = 34;

function legPts(hx: number, hy: number, a: number, k: number) {
  const kx = hx + Math.sin(a) * LEG1, ky = hy + Math.cos(a) * LEG1;
  const fx = kx + Math.sin(a - k) * LEG2, fy = ky + Math.cos(a - k) * LEG2;
  return { kx, ky, fx, fy };
}

function drawLeg(ctx: Ctx, hx: number, hy: number, a: number, k: number, far: boolean) {
  const { kx, ky, fx, fy } = legPts(hx, hy, a, k);
  const col = far ? C.pantsFar : C.pants;
  limb(ctx, hx, hy, kx, ky, 11, col);
  limb(ctx, kx, ky, fx, fy, 9.5, col);
  // shoe
  const sa = a - k; // shin angle
  const dir = Math.cos(sa) > 0.2 ? 0 : sa; // keep shoes mostly level
  ctx.save();
  ctx.translate(fx, fy + 2);
  ctx.rotate(-dir * 0.4);
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.ellipse(4, 0, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = far ? C.shoeFar : C.shoe;
  ctx.beginPath();
  ctx.ellipse(4, -0.5, 7.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,200,0.35)';
  ctx.fillRect(-2, 2, 13, 1.6);
  ctx.restore();
}

function drawArm(ctx: Ctx, sx: number, sy: number, s: number, e: number, far: boolean, tool: boolean, glow: number) {
  const ex = sx + Math.sin(s) * ARM1, ey = sy + Math.cos(s) * ARM1;
  const hx = ex + Math.sin(s + e) * ARM2, hy = ey + Math.cos(s + e) * ARM2;
  const col = far ? C.jacketLo : C.jacket;
  limb(ctx, sx, sy, ex, ey, 9.5, col);
  limb(ctx, ex, ey, hx, hy, 8.5, col);
  if (!far) limb(ctx, sx + 1, sy + 1, ex + 1, ey, 2.5, C.jacketHi, 'transparent', 0);
  // hand
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = far ? C.skinShade : C.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, 3.8, 0, Math.PI * 2);
  ctx.fill();
  if (tool) {
    // Lumen Coil emitter: brass grip with a glowing lens, aligned with the forearm
    const ang = s + e;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-ang + Math.PI / 2);
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.roundRect(-6, -8, 30, 15, 4);
    ctx.fill();
    ctx.fillRect(-2, 4, 7, 9);
    ctx.fillStyle = linear(ctx, 0, -7, 0, 6, [[0, '#7a8690'], [1, '#2a323a']]);
    ctx.beginPath();
    ctx.roundRect(-4, -6, 26, 11, 3);
    ctx.fill();
    ctx.fillStyle = '#4a3a2c';
    ctx.fillRect(-0.5, 5, 4, 6);
    ctx.fillStyle = C.brass;
    ctx.fillRect(2, -6, 3, 11);
    ctx.fillStyle = '#7ff5e0';
    ctx.fillRect(8, -2.5, 9, 3);
    ctx.fillStyle = radial(ctx, 24, -0.5, 12 + glow * 12, [[0, 'rgba(230,255,255,1)'], [0.3, 'rgba(110,220,255,0.85)'], [1, 'rgba(110,220,255,0)']]);
    ctx.beginPath();
    ctx.arc(24, -0.5, 12 + glow * 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0ffff';
    ctx.beginPath();
    ctx.arc(23, -0.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return { hx, hy };
}

function drawScarf(ctx: Ctx, nx: number, ny: number, phase: number, lift: number, up: number) {
  // two trailing tails; lift 0 = hanging, 1 = streaming back; up > 0 = blown upward (falling)
  for (let t = 1; t >= 0; t--) {
    const pts: [number, number][] = [];
    let x = nx - 3, y = ny + 3 + t * 2;
    pts.push([x, y]);
    for (let i = 1; i <= 6; i++) {
      const droop = (1 - lift) * 1.35 + 0.15 - up * 0.55 + t * 0.18;
      const ang = droop + Math.sin(phase + i * 0.9 + t * 1.7) * 0.22 * (0.5 + lift);
      x += -Math.cos(ang) * 6;
      y += Math.sin(ang) * 6;
      pts.push([x, y]);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const passes: [string, number][] = [[C.outline, 1], [t ? C.scarfLo : C.scarf, 0.62], [C.scarfHi, 0.2]];
    for (const [col, k] of passes) {
      if (t === 1 && col === C.scarfHi) continue;
      ctx.strokeStyle = col;
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.lineWidth = Math.max(1.2, (8.5 - i * 0.9) * k + (k === 1 ? 2 : 0));
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1] - (k < 0.3 ? 1.2 : 0));
        ctx.lineTo(pts[i + 1][0], pts[i + 1][1] - (k < 0.3 ? 1.2 : 0));
        ctx.stroke();
      }
    }
  }
}

function drawElias(ctx: Ctx, p: Pose) {
  // compute grounded offset so lowest foot touches the ground
  let hipX = 62, hipY = 100 + p.bob;
  const L = legPts(hipX, hipY, p.hipL, p.kneeL), R = legPts(hipX, hipY, p.hipR, p.kneeR);
  if (p.grounded !== false) {
    const low = Math.max(L.fy, R.fy) + 6;
    hipY += GROUND - low + p.bob * 0.3;
  }
  hipY += p.yOff || 0;
  ctx.save();
  if (p.xOff) ctx.translate(p.xOff, 0);
  if (p.rot) {
    ctx.translate(64, 92);
    ctx.rotate(p.rot);
    ctx.scale(0.9, 0.9);
    ctx.translate(-64, -92);
  }
  if (p.squash) {
    ctx.translate(64, GROUND);
    ctx.scale(1 + p.squash, 1 - p.squash);
    ctx.translate(-64, -GROUND);
  }
  const shX = hipX + Math.sin(p.lean) * TORSO, shY = hipY - Math.cos(p.lean) * TORSO;
  const neckX = shX + Math.sin(p.lean) * 4, neckY = shY - Math.cos(p.lean) * 4;
  const headA = p.lean + p.head;
  const hdX = neckX + Math.sin(headA) * 13, hdY = neckY - Math.cos(headA) * 13;
  // soft contact shadow
  if (p.grounded !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(64, GROUND + 4, 24, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // far arm + far leg
  drawArm(ctx, shX - 2, shY + 3, p.shL, p.elL, true, false, 0);
  drawLeg(ctx, hipX - 2, hipY, p.hipL, p.kneeL, true);
  // backpack
  ctx.save();
  ctx.translate((hipX + shX) / 2, (hipY + shY) / 2);
  ctx.rotate(p.lean);
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.roundRect(-21, -15, 15, 27, 5);
  ctx.fill();
  ctx.fillStyle = linear(ctx, -20, 0, -8, 0, [[0, C.pack], [1, C.packHi]]);
  ctx.beginPath();
  ctx.roundRect(-19, -13, 11, 23, 4);
  ctx.fill();
  // coil canister glow
  ctx.fillStyle = radial(ctx, -14, -2, 9, [[0, 'rgba(180,255,240,0.95)'], [0.5, 'rgba(127,245,224,0.5)'], [1, 'rgba(127,245,224,0)']]);
  ctx.beginPath();
  ctx.arc(-14, -2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9fff8';
  ctx.fillRect(-15.5, -8, 3, 12);
  ctx.restore();
  // torso
  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(p.lean);
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.moveTo(-12, 4);
  ctx.quadraticCurveTo(-14, -TORSO * 0.6, -11, -TORSO - 3);
  ctx.lineTo(11, -TORSO - 3);
  ctx.quadraticCurveTo(14, -TORSO * 0.5, 12, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = linear(ctx, -10, 0, 10, 0, [[0, C.jacketLo], [0.55, C.jacket], [1, C.jacketHi]]);
  ctx.beginPath();
  ctx.moveTo(-9.5, 2);
  ctx.quadraticCurveTo(-11.5, -TORSO * 0.6, -8.5, -TORSO - 0.5);
  ctx.lineTo(8.5, -TORSO - 0.5);
  ctx.quadraticCurveTo(11.5, -TORSO * 0.5, 9.5, 2);
  ctx.closePath();
  ctx.fill();
  // open jacket over a pale shirt, zip line, belt
  ctx.fillStyle = C.shirt;
  ctx.beginPath();
  ctx.moveTo(3, -TORSO);
  ctx.lineTo(8.5, -TORSO);
  ctx.quadraticCurveTo(10.5, -TORSO * 0.5, 9, -2);
  ctx.lineTo(4, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,13,18,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(3, -TORSO + 2);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.fillStyle = '#1a222c';
  ctx.fillRect(-10, -3, 20, 5);
  ctx.fillStyle = C.brass;
  ctx.fillRect(2, -2.5, 4, 4);
  ctx.restore();
  // near leg
  drawLeg(ctx, hipX + 2, hipY, p.hipR, p.kneeR, false);
  // head
  // hood resting on the shoulders behind the head (or Ilse's long hair)
  if (C.longHair) {
    ctx.save();
    ctx.translate(hdX, hdY);
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.quadraticCurveTo(-22, 8, -16 - (p.hairWind || 0) * 6, 34);
    ctx.quadraticCurveTo(-6, 26, 2, 4);
    ctx.fill();
    ctx.fillStyle = C.hair;
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.quadraticCurveTo(-19, 8, -14 - (p.hairWind || 0) * 6, 31);
    ctx.quadraticCurveTo(-6, 22, 0, 4);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (!C.hood) ctx.globalAlpha = 0;
  ctx.translate(hdX, hdY);
  ctx.rotate(headA * 0.6);
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.ellipse(-8, 8, 15, 12, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = linear(ctx, -20, 0, 4, 16, [[0, C.jacketLo], [1, C.jacket]]);
  ctx.beginPath();
  ctx.ellipse(-8, 8, 12.5, 9.5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(hdX, hdY);
  ctx.rotate(headA * 0.6);
  // hair back mass
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.arc(0, 0, 15.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = linear(ctx, -12, -10, 12, 12, [[0, C.skinShade], [0.5, C.skin], [1, C.skin]]);
  ctx.beginPath();
  ctx.arc(1, 1, 12.8, 0, Math.PI * 2);
  ctx.fill();
  // ear
  ctx.fillStyle = C.skinShade;
  ctx.beginPath();
  ctx.ellipse(-3, 2, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // eye & brow & mouth
  ctx.fillStyle = '#16100c';
  ctx.beginPath();
  ctx.ellipse(8, 0, 1.9, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(8.3, -1.6, 1, 1);
  ctx.strokeStyle = C.hair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(5, -5);
  ctx.lineTo(11, -5.5);
  ctx.stroke();
  ctx.strokeStyle = '#8a5a44';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(8, 7.5);
  ctx.lineTo(11, 7);
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,120,100,0.35)';
  ctx.beginPath();
  ctx.ellipse(6.5, 4.5, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair: messy tufts swept back
  const hw = p.hairWind || 0;
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.moveTo(-13, 6);
  ctx.quadraticCurveTo(-17 - hw * 4, -6, -10, -13);
  ctx.quadraticCurveTo(-2, -19, 8, -15);
  ctx.quadraticCurveTo(15, -12, 14, -5);
  ctx.quadraticCurveTo(10, -9, 6, -7);
  ctx.quadraticCurveTo(7, -3, 3, -4);
  ctx.quadraticCurveTo(-2, -6, -4, 0);
  ctx.quadraticCurveTo(-7, -2, -7, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.hairHi;
  ctx.beginPath();
  ctx.ellipse(1, -13, 7, 2.2, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // tufts
  ctx.fillStyle = C.hair;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-10 + i * 5, -12);
    ctx.lineTo(-16 - hw * 6 + i * 4, -16 - i * 2);
    ctx.lineTo(-6 + i * 5, -15);
    ctx.fill();
  }
  ctx.restore();
  // scarf
  drawScarf(ctx, neckX, neckY + 2, p.scarf, p.scarfLift, p.scarfUp || 0);
  ctx.fillStyle = C.outline;
  ctx.beginPath();
  ctx.ellipse(neckX + 1, neckY + 2, 10, 6, p.lean, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.scarf;
  ctx.beginPath();
  ctx.ellipse(neckX + 1, neckY + 1.5, 8, 4.2, p.lean, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.scarfHi;
  ctx.fillRect(neckX - 3, neckY - 1, 8, 1.6);
  // near arm with the tool
  drawArm(ctx, shX + 2, shY + 3, p.shR, p.elR, false, true, p.glow || 0);
  ctx.restore();
}

const base = (): Pose => ({
  hipL: 0.05, kneeL: 0.05, hipR: -0.05, kneeR: 0.05, shL: -0.15, elL: 0.35, shR: 0.12, elR: 0.45,
  lean: 0.04, head: 0, bob: 0, scarf: 0, scarfLift: 0.15,
});

type Gen = (t: number, i: number) => Pose;
const TAU = Math.PI * 2;

const ANIMS: [string, number, number, number, Gen][] = [
  // name, frames, fps, repeat(-1 loop / 0 once), generator
  ['idle', 8, 7, -1, (t) => ({ ...base(), bob: Math.sin(t * TAU) * 1.2, shL: -0.12 + Math.sin(t * TAU) * 0.04, shR: 0.1 + Math.sin(t * TAU + 0.4) * 0.05, scarf: t * TAU, head: Math.sin(t * TAU) * 0.03, kneeL: 0.08, kneeR: 0.08 })],
  ['run', 10, 15, -1, (t) => {
    const s = Math.sin(t * TAU), c = Math.cos(t * TAU);
    return {
      ...base(), lean: 0.2,
      hipR: s * 0.85, kneeR: 0.25 + Math.max(0, -c) * 1.4 + (s < 0 ? 0.3 : 0),
      hipL: -s * 0.85, kneeL: 0.25 + Math.max(0, c) * 1.4 + (s > 0 ? 0.3 : 0),
      shR: -s * 0.9 + 0.2, elR: 1.1 + s * 0.2, shL: s * 0.9, elL: 1.1 - s * 0.2,
      bob: -Math.abs(Math.cos(t * TAU)) * 3, scarf: t * TAU * 2, scarfLift: 0.85, head: -0.1, hairWind: 1,
    };
  }],
  ['jump', 3, 10, 0, (t) => ({ ...base(), grounded: false, lean: 0.1, hipR: 0.7, kneeR: 1.3, hipL: -0.25, kneeL: 0.6, shR: -0.4 - t * 0.6, elR: 1.0, shL: 0.8, elL: 0.6, scarf: t * 3, scarfLift: 0.3, scarfUp: -0.6, hairWind: 0.5 })],
  ['fall', 4, 10, -1, (t) => ({ ...base(), grounded: false, lean: 0.05, hipR: 0.35, kneeR: 0.7, hipL: -0.1, kneeL: 0.35, shR: -1.9 + Math.sin(t * TAU) * 0.15, elR: 0.6, shL: -2.2 - Math.sin(t * TAU) * 0.15, elL: 0.5, scarf: t * TAU, scarfLift: 0.2, scarfUp: 1.6, hairWind: -0.5 })],
  ['djump', 6, 18, 0, (t) => ({ ...base(), grounded: false, rot: t * TAU * 0.999, lean: 0.4, hipR: 1.3, kneeR: 2.2, hipL: 1.1, kneeL: 2.3, shR: 0.9, elR: 1.6, shL: 0.7, elL: 1.6, scarf: t * TAU, scarfLift: 0.6 })],
  ['land', 2, 14, 0, (t) => ({ ...base(), hipR: 0.8, kneeR: 1.6, hipL: 0.5, kneeL: 1.3, lean: 0.35, shR: 0.6, elR: 0.8, shL: 0.3, elL: 0.6, squash: 0.12 * (1 - t), scarf: 1, scarfLift: 0.1 })],
  ['crouch', 4, 5, -1, (t) => ({ ...base(), hipR: 1.25, kneeR: 2.35, hipL: 1.0, kneeL: 2.2, lean: 0.55, head: -0.35, shR: 0.9, elR: 0.9, shL: 0.6, elL: 0.9, bob: Math.sin(t * TAU) * 0.8, scarf: t * TAU, scarfLift: 0.1 })],
  ['crawl', 8, 11, -1, (t) => {
    const s = Math.sin(t * TAU);
    return { ...base(), hipR: 1.2 + s * 0.35, kneeR: 2.3 - s * 0.2, hipL: 1.1 - s * 0.35, kneeL: 2.3 + s * 0.2, lean: 0.6, head: -0.4, shR: 1.1 - s * 0.4, elR: 0.7, shL: 1.1 + s * 0.4, elL: 0.7, scarf: t * TAU, scarfLift: 0.4 };
  }],
  ['climb', 6, 9, -1, (t) => {
    const s = Math.sin(t * TAU);
    return { ...base(), grounded: false, yOff: -2, lean: -0.05, head: -0.25, hipR: 0.4 + s * 0.45, kneeR: 1.0 + s * 0.5, hipL: 0.4 - s * 0.45, kneeL: 1.0 - s * 0.5, shR: 2.6 + s * 0.35, elR: 0.3, shL: 2.6 - s * 0.35, elL: 0.3, scarf: t * TAU, scarfLift: 0.05 };
  }],
  ['hang', 4, 5, -1, (t) => ({ ...base(), grounded: false, yOff: 6, lean: -0.1, head: -0.3, shR: 2.95, elR: 0.05, shL: 2.9, elL: 0.05, hipR: 0.25 + Math.sin(t * TAU) * 0.1, kneeR: 0.4, hipL: 0.05 - Math.sin(t * TAU) * 0.1, kneeL: 0.5, scarf: t * TAU, scarfLift: 0 })],
  ['ledgeup', 5, 14, 0, (t) => ({ ...base(), grounded: false, yOff: 6 - t * 30, lean: 0.3 + t * 0.4, head: -0.2, shR: 2.9 - t * 2.4, elR: 0.1 + t * 1.4, shL: 2.8 - t * 2.4, elL: 0.1 + t * 1.2, hipR: 0.3 + t * 1.2, kneeR: 0.4 + t * 1.6, hipL: 0.1 + t * 0.6, kneeL: 0.5 + t, scarf: t * 3, scarfLift: 0.2 })],
  ['shoot', 3, 16, 0, (t) => ({ ...base(), lean: -0.05 + t * 0.03, shR: Math.PI / 2 + 0.05, elR: -0.05, shL: 0.6, elL: 0.9, hipR: 0.25, kneeR: 0.15, hipL: -0.25, kneeL: 0.1, glow: 1 - t, scarf: t, scarfLift: 0.2 })],
  ['aimup', 1, 1, 0, () => ({ ...base(), lean: -0.12, shR: Math.PI * 0.78, elR: -0.05, shL: 0.5, elL: 0.9, hipR: 0.25, kneeR: 0.15, hipL: -0.25, kneeL: 0.1, glow: 0.6, head: -0.3, scarfLift: 0.2 })],
  ['charge', 4, 12, -1, (t) => ({ ...base(), lean: -0.02, shR: Math.PI / 2 + 0.05, elR: -0.05, shL: 1.1, elL: 1.0, hipR: 0.3, kneeR: 0.2, hipL: -0.3, kneeL: 0.15, glow: 0.4 + Math.sin(t * TAU) * 0.3, bob: Math.sin(t * TAU * 2) * 0.6, scarf: t * TAU, scarfLift: 0.3 })],
  ['push', 8, 9, -1, (t) => {
    const s = Math.sin(t * TAU), c = Math.cos(t * TAU);
    return { ...base(), lean: 0.5, head: -0.25, hipR: s * 0.5 + 0.2, kneeR: 0.5 + Math.max(0, -c) * 0.8, hipL: -s * 0.5 + 0.2, kneeL: 0.5 + Math.max(0, c) * 0.8, shR: 1.3, elR: 0.3, shL: 1.25, elL: 0.35, scarf: t * TAU, scarfLift: 0.3 };
  }],
  ['swim', 8, 9, -1, (t) => {
    const s = Math.sin(t * TAU);
    return { ...base(), grounded: false, rot: 0.85, yOff: -14, xOff: -12, lean: 0.1, hipR: s * 0.5, kneeR: 0.3 + Math.max(0, s) * 0.6, hipL: -s * 0.5, kneeL: 0.3 + Math.max(0, -s) * 0.6, shR: 2.6 + s * 0.8, elR: 0.3, shL: 2.4 - s * 0.8, elL: 0.3, scarf: t * TAU, scarfLift: 0.7, hairWind: 1 };
  }],
  ['hurt', 2, 10, 0, (t) => ({ ...base(), lean: -0.45, head: -0.4, shR: -0.9, elR: 0.9, shL: -1.1, elL: 0.7, hipR: 0.4, kneeR: 0.6, hipL: -0.3, kneeL: 0.4, scarf: t * 4, scarfLift: 0.5, squash: -0.05 })],
  ['death', 8, 10, 0, (t) => {
    const k = Math.min(1, t * 1.3);
    return { ...base(), rot: -k * 1.45, yOff: k * 26, lean: -0.3, head: -0.5 * k, shR: -0.6 - k, elR: 0.4, shL: -0.9 - k, elL: 0.3, hipR: 0.3 * k, kneeR: 0.8 * k, hipL: -0.2, kneeL: 0.5 * k, scarf: t * 5, scarfLift: 0.1, grounded: k < 0.3 };
  }],
  ['wake', 6, 6, 0, (t) => ({ ...base(), hipR: 1.25 - t * 1.2, kneeR: 2.3 - t * 2.2, hipL: 1.0 - t * 0.95, kneeL: 2.2 - t * 2.1, lean: 0.6 - t * 0.55, head: -0.4 + t * 0.4, shR: 0.9 - t * 0.8, elR: 0.9 - t * 0.5, shL: 0.6 - t * 0.7, elL: 0.8, scarf: t * 4 })],
];

export function buildIlse(scene: Phaser.Scene) {
  if (scene.textures.exists('ilse')) return;
  const keep = ['idle', 'run', 'jump', 'fall', 'hurt', 'crouch', 'death', 'wake'];
  const frames: Pose[] = [];
  const meta: Record<string, { start: number; count: number; fps: number; repeat: number }> = {};
  for (const [name, n, fps, rep, gen] of ANIMS) {
    if (!keep.includes(name)) continue;
    meta[name] = { start: frames.length, count: n, fps, repeat: rep };
    for (let i = 0; i < n; i++) frames.push(gen(n === 1 ? 0 : i / (rep === -1 ? n : n - 1), i));
  }
  C = ILSE_PAL;
  paintSheet(scene, 'ilse', ELIAS_FW, ELIAS_FH, frames.length, 12, (ctx, i) => drawElias(ctx, { ...frames[i], scarfLift: Math.max(0.2, frames[i].scarfLift) }));
  C = ELIAS_PAL;
  for (const [name, m] of Object.entries(meta)) {
    scene.anims.create({ key: 'ilse-' + name, frames: Array.from({ length: m.count }, (_, k) => ({ key: 'ilse', frame: m.start + k })), frameRate: m.fps, repeat: m.repeat });
  }
}

export function buildElias(scene: Phaser.Scene) {
  const frames: Pose[] = [];
  const meta: Record<string, { start: number; count: number; fps: number; repeat: number }> = {};
  for (const [name, n, fps, rep, gen] of ANIMS) {
    meta[name] = { start: frames.length, count: n, fps, repeat: rep };
    for (let i = 0; i < n; i++) frames.push(gen(n === 1 ? 0 : i / (rep === -1 ? n : n - 1), i));
  }
  paintSheet(scene, 'elias', ELIAS_FW, ELIAS_FH, frames.length, 12, (ctx, i) => drawElias(ctx, frames[i]));
  for (const [name, m] of Object.entries(meta)) {
    scene.anims.create({
      key: 'elias-' + name,
      frames: Array.from({ length: m.count }, (_, k) => ({ key: 'elias', frame: m.start + k })),
      frameRate: m.fps,
      repeat: m.repeat,
    });
  }
}
