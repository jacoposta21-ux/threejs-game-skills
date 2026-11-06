import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { CameraManager } from '../race/CameraManager';
import { materials } from '../scene/Materials';
import type { TrackView } from '../scene/TrackView';
import { getDef } from '../track/catalog';
import { getBuild } from '../track/PieceRegistry';
import { cloneTrack, nextPieceId, pieceMatrix, rotQuarter, worldLanes, worldPorts, type WorldPort } from '../track/Track';
import { TrackChain } from '../track/TrackChain';
import { analyzeConnections, gridSnapOrigin, snapCandidates, type SnapCandidate } from '../track/TrackConnectionSystem';
import { validateTrack, type ValidationResult } from '../track/TrackValidator';
import type { PieceData, TrackData } from '../track/types';
import { History } from './History';

export interface BuilderOptions {
  /** Restrict available pieces (challenge kits). */
  allowed?: (defId: string) => boolean;
  /** Piece ids that cannot be moved or deleted. */
  locked?: Set<number>;
  maxPieces?: number;
}

type Listener = () => void;

const GHOST_OK = new THREE.Color('#2bd96b');
const GHOST_FREE = new THREE.Color('#4cc3ff');
const GHOST_BAD = new THREE.Color('#ff4d4d');

export class TrackBuilder {
  track: TrackData;
  readonly history = new History();
  readonly selection = new Set<number>();
  placing: { defId: string; rot: number; mirror: boolean } | null = null;
  gridSnap = true;
  freeMode = false;
  buildHeight = 12;
  validation: ValidationResult;
  options: BuilderOptions = {};
  active = false;
  clipboard: PieceData[] = [];
  readonly root = new THREE.Group();
  private ghost: THREE.Group | null = null;
  private ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.45, depthWrite: false });
  private ghostPlacement: { p: [number, number, number]; r: number; snapped: boolean; ok: boolean; reason?: string } | null = null;
  private snapList: SnapCandidate[] = [];
  private snapCycle = 0;
  private lastAnchorKey = '';
  private portMarkers = new THREE.Group();
  private selBoxes = new THREE.Group();
  private hoverBox: THREE.Box3Helper;
  private heightGrid: THREE.GridHelper;
  private plumb: THREE.Line;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerPx = new THREE.Vector2();
  private down: { x: number; y: number; onPiece: number | null; button: number; time: number } | null = null;
  private drag: { ids: number[]; start: Map<number, [number, number, number]>; planeY: number; startHit: THREE.Vector3; moved: boolean } | null = null;
  private listeners: Listener[] = [];
  private validateTimer = 0;
  private openPorts: WorldPort[] = [];
  private hoverId: number | null = null;
  touchMode = false;
  areaHalf = 32;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLCanvasElement,
    private readonly view: TrackView,
    private readonly cams: CameraManager,
    private readonly audio: AudioManager,
  ) {
    this.track = { v: 1, id: 'empty', name: 'Untitled', created: 0, updated: 0, pieces: [] };
    this.validation = validateTrack([]);
    this.hoverBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ffffff'));
    this.hoverBox.visible = false;
    this.heightGrid = new THREE.GridHelper(64, 16, '#3a86ff', '#3a86ff');
    (this.heightGrid.material as THREE.Material).transparent = true;
    (this.heightGrid.material as THREE.Material).opacity = 0.18;
    this.heightGrid.visible = false;
    this.plumb = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]), new THREE.LineDashedMaterial({ color: '#3a86ff', dashSize: 0.4, gapSize: 0.3 }));
    this.plumb.visible = false;
    this.root.add(this.portMarkers, this.selBoxes, this.hoverBox, this.heightGrid, this.plumb);
    // capture-phase listeners run before OrbitControls so piece drags can claim the pointer
    dom.addEventListener('pointerdown', this.onDown, { capture: true });
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /* ----------------------------------------------------------- lifecycle */

  load(track: TrackData, options: BuilderOptions = {}): void {
    this.track = cloneTrack(track);
    this.options = options;
    this.selection.clear();
    this.placing = null;
    this.removeGhost();
    this.history.reset(this.track);
    this.areaHalf = track.meta?.area ?? 32;
    const start = this.track.pieces.find((p) => p.t === 'start');
    this.buildHeight = start ? Math.max(2, Math.round(start.p[1])) : 12;
    this.refresh(true);
  }

  setActive(on: boolean): void {
    this.active = on;
    this.root.visible = on;
    if (!on) {
      this.cancelPlacing();
      this.hoverBox.visible = false;
    }
  }

  /** Full refresh after any change to track pieces. */
  refresh(immediateValidate = false): void {
    this.view.sync(this.track);
    const report = analyzeConnections(this.track.pieces.filter((p) => !getDef(p.t).decor));
    this.openPorts = report.open;
    this.rebuildMarkers();
    this.rebuildSelection();
    if (immediateValidate) this.runValidation();
    else {
      window.clearTimeout(this.validateTimer);
      this.validateTimer = window.setTimeout(() => this.runValidation(), 120);
    }
    this.emit();
  }

  private runValidation(): void {
    this.validation = validateTrack(this.track.pieces);
    this.emit();
  }

  private commit(): void {
    if (this.history.commit(this.track)) {
      this.track.updated = Date.now();
    }
    this.refresh();
  }

  /* -------------------------------------------------------------- tools */

  pieceCount(): number {
    return this.track.pieces.filter((p) => p.t !== 'start' && p.t !== 'finish' && !getDef(p.t).decor).length;
  }

  canUse(defId: string): boolean {
    return this.options.allowed ? this.options.allowed(defId) : true;
  }

  startPlacing(defId: string): void {
    if (!this.canUse(defId)) return;
    const def = getDef(defId);
    this.selection.clear();
    const keepRot = this.placing?.rot ?? 0;
    this.placing = { defId, rot: keepRot, mirror: false };
    this.removeGhost();
    const g = getBuild(defId).visual.clone(true);
    const group = new THREE.Group();
    group.add(g);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = this.ghostMat;
        m.castShadow = false;
        m.raycast = () => undefined;
      }
    });
    group.renderOrder = 3;
    this.ghost = group;
    this.root.add(group);
    this.heightGrid.visible = !def.ports.length || this.freeMode;
    this.snapCycle = 0;
    // place the ghost on the most useful open port right away (great on touch)
    const out = this.openPorts.filter((p) => p.kind === 'out');
    const cands = snapCandidates(defId, false, out.length ? out : this.openPorts);
    if (cands.length && !this.freeMode && def.ports.length) {
      const c = cands[0];
      this.ghostPlacement = { p: c.p, r: c.r, snapped: true, ok: this.checkPlacement(defId, c.p, c.r, false, c.anchor).ok };
      this.snapList = cands.filter((x) => x.anchor === c.anchor);
      this.placing.rot = c.r;
    } else {
      const t = this.cams.controls.target;
      const [x, z] = this.snapXZ(t.x, t.z, keepRot);
      this.ghostPlacement = { p: [x, this.buildHeight, z], r: keepRot, snapped: false, ok: true };
    }
    this.updateGhostVisual();
    this.rebuildSelection();
    this.emit();
  }

  cancelPlacing(): void {
    this.placing = null;
    this.removeGhost();
    this.heightGrid.visible = false;
    this.plumb.visible = false;
    this.emit();
  }

  private removeGhost(): void {
    if (this.ghost) this.root.remove(this.ghost);
    this.ghost = null;
    this.ghostPlacement = null;
  }

  rotate(dir = 1): void {
    if (this.placing) {
      if (this.ghostPlacement?.snapped && this.snapList.length > 1) {
        this.snapCycle = (this.snapCycle + 1) % this.snapList.length;
        const c = this.snapList[this.snapCycle];
        this.ghostPlacement = { p: c.p, r: c.r, snapped: true, ok: this.checkPlacement(this.placing.defId, c.p, c.r, this.placing.mirror, c.anchor).ok };
        this.placing.rot = c.r;
      } else {
        this.placing.rot = (this.placing.rot + dir + 4) % 4;
        if (this.ghostPlacement && !this.ghostPlacement.snapped) {
          const [x, z] = this.snapXZ(this.ghostPlacement.p[0], this.ghostPlacement.p[2], this.placing.rot);
          this.ghostPlacement.p = [x, this.ghostPlacement.p[1], z];
          this.ghostPlacement.r = this.placing.rot;
        }
      }
      this.audio.click();
      this.updateGhostVisual();
      return;
    }
    const sel = this.editableSelection();
    if (!sel.length) return;
    // rotate around the selection pivot (first piece origin for singles)
    const pivot = sel.length === 1 ? new THREE.Vector3(...sel[0].p) : this.selectionCenter(sel);
    for (const pd of sel) {
      const rel = new THREE.Vector3(...pd.p).sub(pivot);
      const r = rotQuarter(rel, dir);
      pd.p = [round(pivot.x + r.x), pd.p[1], round(pivot.z + r.z)];
      pd.r = (pd.r + dir + 4) % 4;
    }
    this.audio.click();
    this.commit();
  }

  toggleMirror(): void {
    if (this.placing) {
      if (!getDef(this.placing.defId).mirrorable) return;
      this.placing.mirror = !this.placing.mirror;
      const g = this.ghost;
      if (g) {
        this.root.remove(g);
        this.ghost = null;
      }
      const defId = this.placing.defId;
      const rot = this.placing.rot;
      const mirror = this.placing.mirror;
      this.startPlacing(defId);
      if (this.placing) {
        this.placing.mirror = mirror;
        this.placing.rot = rot;
      }
      this.rebuildGhostMesh();
      this.updateGhostVisual();
      return;
    }
    const sel = this.editableSelection().filter((p) => getDef(p.t).mirrorable);
    if (!sel.length) return;
    for (const pd of sel) {
      if (pd.m) delete pd.m;
      else pd.m = 1;
    }
    this.commit();
  }

  private rebuildGhostMesh(): void {
    if (!this.placing) return;
    if (this.ghost) this.root.remove(this.ghost);
    const g = getBuild(this.placing.defId, this.placing.mirror).visual.clone(true);
    const group = new THREE.Group();
    group.add(g);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = this.ghostMat;
        m.castShadow = false;
        m.raycast = () => undefined;
      }
    });
    this.ghost = group;
    this.root.add(group);
  }

  setHeight(delta: number): void {
    const sel = this.editableSelection();
    if (sel.length && !this.placing) {
      for (const pd of sel) pd.p = [pd.p[0], Math.max(0.5, round(pd.p[1] + delta)), pd.p[2]];
      this.commit();
      return;
    }
    this.buildHeight = Math.max(0.5, Math.min(60, this.buildHeight + delta));
    if (this.ghostPlacement && !this.ghostPlacement.snapped) {
      this.ghostPlacement.p = [this.ghostPlacement.p[0], this.buildHeight, this.ghostPlacement.p[2]];
      this.updateGhostVisual();
    }
    this.emit();
  }

  deleteSelection(): void {
    const ids = new Set(this.editableSelection().map((p) => p.id));
    if (!ids.size) return;
    this.track.pieces = this.track.pieces.filter((p) => !ids.has(p.id));
    this.selection.clear();
    this.audio.remove();
    this.commit();
  }

  copy(): void {
    const sel = this.editableSelection();
    if (!sel.length) return;
    this.clipboard = sel.map((p) => ({ ...p, p: [...p.p] as [number, number, number] }));
  }

  paste(): void {
    if (!this.clipboard.length) return;
    if (this.options.maxPieces !== undefined && this.pieceCount() + this.clipboard.length > this.options.maxPieces) {
      this.audio.error();
      return;
    }
    let id = nextPieceId(this.track);
    const groupMap = new Map<number, number>();
    const newIds: number[] = [];
    for (const src of this.clipboard) {
      if (!this.canUse(src.t)) continue;
      const pd: PieceData = { ...src, id: id++, p: [src.p[0] + 4, src.p[1], src.p[2] + 4] };
      if (src.g !== undefined) {
        if (!groupMap.has(src.g)) groupMap.set(src.g, Date.now() % 100000 + groupMap.size);
        pd.g = groupMap.get(src.g);
      }
      this.track.pieces.push(pd);
      newIds.push(pd.id);
    }
    this.selection.clear();
    for (const i of newIds) this.selection.add(i);
    this.clipboard = this.clipboard.map((p) => ({ ...p, p: [p.p[0] + 4, p.p[1], p.p[2] + 4] as [number, number, number] }));
    this.audio.place();
    this.commit();
  }

  /** Duplicate. A single piece with an open exit is chained onto that exit. */
  duplicate(): void {
    const sel = this.editableSelection();
    if (sel.length === 1) {
      const src = sel[0];
      const outs = worldPorts(src).filter((p) => p.kind === 'out' && this.openPorts.some((o) => o.pieceId === p.pieceId && o.index === p.index));
      if (outs.length && getDef(src.t).ports.some((p) => p.kind === 'in')) {
        if (this.options.maxPieces !== undefined && this.pieceCount() >= this.options.maxPieces) {
          this.audio.error();
          return;
        }
        const pd = TrackChain.placementFor(src.t, outs[0], !!src.m);
        pd.id = nextPieceId(this.track);
        if (src.c) pd.c = src.c;
        this.track.pieces.push(pd);
        this.selection.clear();
        this.selection.add(pd.id);
        this.audio.place();
        this.commit();
        return;
      }
    }
    this.copy();
    this.paste();
  }

  group(): void {
    const sel = this.editableSelection();
    if (sel.length < 2) return;
    const g = (Date.now() % 1000000) + 1;
    for (const p of sel) p.g = g;
    this.commit();
  }

  ungroup(): void {
    const sel = this.editableSelection();
    for (const p of sel) delete p.g;
    this.commit();
  }

  setColor(color: string): void {
    const sel = this.editableSelection();
    if (!sel.length) return;
    for (const p of sel) p.c = color;
    this.commit();
  }

  undo(): void {
    if (this.history.undo(this.track)) {
      this.selection.clear();
      this.audio.click();
      this.refresh();
    }
  }

  redo(): void {
    if (this.history.redo(this.track)) {
      this.selection.clear();
      this.audio.click();
      this.refresh();
    }
  }

  clearAll(): void {
    const locked = this.options.locked ?? new Set<number>();
    this.track.pieces = this.track.pieces.filter((p) => locked.has(p.id));
    this.selection.clear();
    this.commit();
  }

  selectAll(): void {
    for (const p of this.track.pieces) this.selection.add(p.id);
    this.refresh();
  }

  setArea(half: number): void {
    this.areaHalf = half;
    this.track.meta = { ...(this.track.meta ?? {}), area: half };
    this.heightGrid.scale.setScalar(half / 32);
    this.emit();
  }

  private editableSelection(): PieceData[] {
    const locked = this.options.locked ?? new Set<number>();
    return this.track.pieces.filter((p) => this.selection.has(p.id) && !locked.has(p.id));
  }

  selectedPieces(): PieceData[] {
    return this.track.pieces.filter((p) => this.selection.has(p.id));
  }

  isLocked(id: number): boolean {
    return !!this.options.locked?.has(id);
  }

  private selectionCenter(sel: PieceData[]): THREE.Vector3 {
    const c = new THREE.Vector3();
    for (const p of sel) c.add(new THREE.Vector3(...p.p));
    c.divideScalar(sel.length);
    return new THREE.Vector3(Math.round(c.x / 4) * 4, c.y, Math.round(c.z / 4) * 4);
  }

  selectPiece(id: number, additive: boolean): void {
    const pd = this.track.pieces.find((p) => p.id === id);
    if (!pd) return;
    const ids = pd.g !== undefined ? this.track.pieces.filter((p) => p.g === pd.g).map((p) => p.id) : [id];
    if (!additive) this.selection.clear();
    const allIn = ids.every((i) => this.selection.has(i));
    for (const i of ids) {
      if (additive && allIn) this.selection.delete(i);
      else this.selection.add(i);
    }
    this.rebuildSelection();
    this.emit();
  }

  clearSelection(): void {
    if (!this.selection.size) return;
    this.selection.clear();
    this.rebuildSelection();
    this.emit();
  }

  focusSelection(): void {
    const box = new THREE.Box3();
    const list = this.selection.size ? this.selectedPieces() : this.track.pieces;
    for (const p of list) {
      const b = this.view.pieceBox(p.id);
      if (b) box.union(b);
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 6, 0), new THREE.Vector3(30, 10, 30));
    this.cams.frame(box);
  }

  /* -------------------------------------------------------- placement */

  private snapXZ(x: number, z: number, r: number): [number, number] {
    if (!this.gridSnap) return [Math.round(x * 2) / 2, Math.round(z * 2) / 2];
    return gridSnapOrigin(x, z, r);
  }

  private planeHit(y: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  private toScreen(v: THREE.Vector3): THREE.Vector2 {
    const p = v.clone().project(this.camera);
    const rect = this.dom.getBoundingClientRect();
    return new THREE.Vector2(((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height);
  }

  private updateGhostFromPointer(): void {
    if (!this.placing) return;
    const def = getDef(this.placing.defId);
    const hasPorts = def.ports.length > 0;
    if (hasPorts && !this.freeMode) {
      let best: { c: SnapCandidate; d: number } | null = null;
      const cands = snapCandidates(this.placing.defId, this.placing.mirror, this.openPorts);
      const radius = this.touchMode ? 90 : 70;
      for (const c of cands) {
        const sp = this.toScreen(c.anchor.pos);
        const d = sp.distanceTo(this.pointerPx);
        if (d < radius && (!best || d < best.d - 0.5 || (Math.abs(d - best.d) < 0.5 && c.r === this.placing.rot))) best = { c, d };
      }
      if (best) {
        const key = `${best.c.anchor.pieceId}:${best.c.anchor.index}`;
        if (key !== this.lastAnchorKey) {
          this.lastAnchorKey = key;
          this.snapList = cands.filter((x) => x.anchor === best!.c.anchor);
          this.snapCycle = Math.max(0, this.snapList.indexOf(best.c));
          this.audio.snap();
        }
        const c = this.snapList[this.snapCycle] ?? best.c;
        const check = this.checkPlacement(this.placing.defId, c.p, c.r, this.placing.mirror, c.anchor);
        this.ghostPlacement = { p: c.p, r: c.r, snapped: true, ok: check.ok, reason: check.reason };
        this.updateGhostVisual();
        return;
      }
    }
    this.lastAnchorKey = '';
    const hit = this.planeHit(this.buildHeight);
    if (!hit) return;
    const r = this.placing.rot;
    let [x, z] = this.snapXZ(hit.x, hit.z, r);
    if (!hasPorts) [x, z] = [Math.round(hit.x), Math.round(hit.z)];
    const p: [number, number, number] = [x, this.buildHeight, z];
    const check = this.checkPlacement(this.placing.defId, p, r, this.placing.mirror);
    this.ghostPlacement = { p, r, snapped: false, ok: check.ok, reason: check.reason };
    this.updateGhostVisual();
  }

  checkPlacement(defId: string, p: [number, number, number], r: number, mirror: boolean, _anchor?: WorldPort): { ok: boolean; reason?: string } {
    const pd: PieceData = { id: -1, t: defId, p, r, m: mirror ? 1 : undefined };
    const def = getDef(defId);
    const lim = this.areaHalf + 1;
    if (def.decor) {
      if (Math.abs(p[0]) > lim || Math.abs(p[2]) > lim) return { ok: false, reason: 'Outside the build area' };
      return { ok: true };
    }
    for (const l of worldLanes(pd))
      for (const q of l.points) {
        if (Math.abs(q.x) > lim || Math.abs(q.z) > lim) return { ok: false, reason: 'Outside the build area — expand it from the top bar' };
        if (q.y < 0.3) return { ok: false, reason: 'Too low — raise the build height' };
      }
    if (this.options.maxPieces !== undefined && def.id !== 'start' && def.id !== 'finish' && this.pieceCount() >= this.options.maxPieces) return { ok: false, reason: `Piece limit reached (${this.options.maxPieces})` };
    return { ok: true };
  }

  private updateGhostVisual(): void {
    if (!this.ghost || !this.ghostPlacement || !this.placing) return;
    const gp = this.ghostPlacement;
    const pd: PieceData = { id: -1, t: this.placing.defId, p: gp.p, r: gp.r };
    this.ghost.matrixAutoUpdate = false;
    pieceMatrix(pd, this.ghost.matrix);
    this.ghost.matrixWorldNeedsUpdate = true;
    this.ghostMat.color.copy(!gp.ok ? GHOST_BAD : gp.snapped ? GHOST_OK : GHOST_FREE);
    this.heightGrid.position.set(0, this.buildHeight, 0);
    // plumb line from ghost to ground
    const pos = this.plumb.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, gp.p[0], gp.p[1], gp.p[2]);
    pos.setXYZ(1, gp.p[0], 0, gp.p[2]);
    pos.needsUpdate = true;
    this.plumb.computeLineDistances();
    this.plumb.visible = true;
  }

  /** Place the ghost (click / tap / Place button). */
  placeGhost(): boolean {
    if (!this.placing || !this.ghostPlacement) return false;
    const gp = this.ghostPlacement;
    if (!gp.ok) {
      this.audio.error();
      this.lastError = gp.reason ?? 'Cannot place here';
      this.emit();
      return false;
    }
    const def = getDef(this.placing.defId);
    if (def.id === 'start' && this.track.pieces.some((p) => p.t === 'start')) {
      // replace existing start when placing a new one
      this.track.pieces = this.track.pieces.filter((p) => p.t !== 'start' || this.options.locked?.has(p.id));
    }
    const pd: PieceData = { id: nextPieceId(this.track), t: this.placing.defId, p: [round(gp.p[0]), round(gp.p[1]), round(gp.p[2])], r: gp.r };
    if (this.placing.mirror) pd.m = 1;
    this.track.pieces.push(pd);
    this.audio.place();
    this.commit();
    // continue from the new piece's exit
    const outs = worldPorts(pd).filter((w) => w.kind === 'out');
    if (outs.length) this.followBuildHead(outs[0].pos);
    if (outs.length && gp.snapped !== undefined) {
      this.buildHeight = Math.max(1, Math.round(outs[0].pos.y * 2) / 2);
    }
    if (def.id === 'start' || def.id === 'finish') {
      this.cancelPlacing();
      this.selection.clear();
      this.selection.add(pd.id);
      this.rebuildSelection();
    } else if (this.touchMode && outs.length) {
      // touch: jump the ghost to the new exit for fast chaining
      const cands = snapCandidates(this.placing.defId, this.placing.mirror, outs);
      if (cands.length) {
        const c = cands[0];
        this.ghostPlacement = { p: c.p, r: c.r, snapped: true, ok: this.checkPlacement(this.placing.defId, c.p, c.r, this.placing.mirror).ok };
        this.snapList = cands;
        this.snapCycle = 0;
        this.updateGhostVisual();
      }
    } else this.updateGhostFromPointer();
    this.lastError = '';
    this.emit();
    return true;
  }

  lastError = '';

  /** Keep the newest exit in view: pan the orbit camera when it drifts toward the screen edge. */
  private followBuildHead(p: THREE.Vector3): void {
    const v = p.clone().project(this.camera);
    if (Math.abs(v.x) < 0.55 && v.y > -0.45 && v.y < 0.6 && v.z < 1) return;
    const target = this.cams.controls.target.clone();
    const delta = p.clone().sub(target).multiplyScalar(0.75);
    delta.y *= 0.6;
    this.cams.tweenTo(this.camera.position.clone().add(delta), target.add(delta));
  }

  get ghostState(): { ok: boolean; snapped: boolean; reason?: string } | null {
    return this.ghostPlacement;
  }

  /* -------------------------------------------------------- pointer */

  private setPointer(e: PointerEvent): void {
    const rect = this.dom.getBoundingClientRect();
    this.pointerPx.set(e.clientX - rect.left, e.clientY - rect.top);
    this.pointer.set((this.pointerPx.x / rect.width) * 2 - 1, -(this.pointerPx.y / rect.height) * 2 + 1);
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.active) return;
    if (e.pointerType === 'touch') this.touchMode = true;
    else if (e.pointerType === 'mouse') this.touchMode = false;
    this.setPointer(e);
    if (e.button === 2 && this.placing) {
      this.cancelPlacing();
      e.stopImmediatePropagation();
      return;
    }
    if (!e.isPrimary) {
      // second finger: hand over to camera gestures
      this.down = null;
      this.drag = null;
      return;
    }
    let onPiece: number | null = null;
    if (!this.placing && e.button === 0) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      onPiece = this.view.pick(this.raycaster);
      if (onPiece !== null && !this.isLocked(onPiece)) {
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (!this.selection.has(onPiece) || additive) this.selectPiece(onPiece, additive);
        const ids = this.editableSelection().map((p) => p.id);
        if (ids.length) {
          const first = this.track.pieces.find((p) => p.id === onPiece) as PieceData;
          const planeY = first.p[1];
          const startHit = this.planeHit(planeY);
          if (startHit) {
            this.drag = { ids, start: new Map(this.track.pieces.filter((p) => ids.includes(p.id)).map((p) => [p.id, [...p.p] as [number, number, number]])), planeY, startHit, moved: false };
            e.stopImmediatePropagation();
            this.dom.setPointerCapture?.(e.pointerId);
          }
        }
      } else if (onPiece !== null) {
        this.selectPiece(onPiece, false);
      }
    }
    this.down = { x: e.clientX, y: e.clientY, onPiece, button: e.button, time: performance.now() };
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.active) return;
    if (e.target !== this.dom && !this.drag && !this.dragFromLibrary) return;
    this.setPointer(e);
    if (this.drag) {
      this.updateDrag();
      return;
    }
    if (this.placing) {
      if (!this.touchMode || this.dragFromLibrary) this.updateGhostFromPointer();
      return;
    }
    // hover highlight
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const id = this.view.pick(this.raycaster);
    if (id !== this.hoverId) {
      this.hoverId = id;
      const box = id !== null ? this.view.pieceBox(id) : null;
      this.hoverBox.visible = !!box && !this.selection.has(id as number);
      if (box) this.hoverBox.box.copy(box);
      this.dom.style.cursor = id !== null ? (this.isLocked(id) ? 'not-allowed' : 'grab') : '';
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.active) return;
    if (this.drag) {
      const moved = this.drag.moved;
      this.drag = null;
      if (moved) {
        this.audio.place();
        this.commit();
      }
      this.down = null;
      return;
    }
    const d = this.down;
    this.down = null;
    if (!d || e.target !== this.dom) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (dist > 8) return; // camera drag
    this.setPointer(e);
    if (this.placing && d.button === 0) {
      if (this.touchMode) {
        // tap moves the ghost; a second tap on the same spot (or the Place button) confirms
        const before = this.ghostPlacement ? [...this.ghostPlacement.p].join(',') : '';
        this.updateGhostFromPointer();
        const after = this.ghostPlacement ? [...this.ghostPlacement.p].join(',') : '';
        if (before === after) this.placeGhost();
        else this.emit();
      } else this.placeGhost();
      return;
    }
    if (d.onPiece === null && d.button === 0) this.clearSelection();
  };

  /** Library drag-and-drop support. */
  dragFromLibrary = false;

  libraryDragMove(clientX: number, clientY: number): void {
    const rect = this.dom.getBoundingClientRect();
    this.pointerPx.set(clientX - rect.left, clientY - rect.top);
    this.pointer.set((this.pointerPx.x / rect.width) * 2 - 1, -(this.pointerPx.y / rect.height) * 2 + 1);
    this.updateGhostFromPointer();
  }

  private updateDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    const hit = this.planeHit(drag.planeY);
    if (!hit) return;
    const delta = hit.clone().sub(drag.startHit);
    if (!drag.moved && delta.length() < 0.6) return;
    drag.moved = true;
    const pieces = this.track.pieces.filter((p) => drag.ids.includes(p.id));
    if (pieces.length === 1 && !this.freeMode && getDef(pieces[0].t).ports.length) {
      // single piece: port snapping against everything else
      const pd = pieces[0];
      const others = this.track.pieces.filter((p) => p.id !== pd.id && !getDef(p.t).decor);
      const open = analyzeConnections(others).open;
      const cands = snapCandidates(pd.t, !!pd.m, open);
      let best: { c: SnapCandidate; d: number } | null = null;
      for (const c of cands) {
        const sp = this.toScreen(c.anchor.pos);
        const dd = sp.distanceTo(this.pointerPx);
        if (dd < 70 && (!best || dd < best.d)) best = { c, d: dd };
      }
      if (best) {
        if (pd.p.join(',') !== best.c.p.join(',') || pd.r !== best.c.r) this.audio.snap();
        pd.p = [round(best.c.p[0]), round(best.c.p[1]), round(best.c.p[2])];
        pd.r = best.c.r;
        this.refreshLight();
        return;
      }
      const s = drag.start.get(pd.id) as [number, number, number];
      const [x, z] = this.snapXZ(s[0] + delta.x, s[2] + delta.z, pd.r);
      pd.p = [x, s[1], z];
      this.refreshLight();
      return;
    }
    // multi: move by whole cells
    const step = this.gridSnap ? 4 : 0.5;
    const dx = Math.round(delta.x / step) * step;
    const dz = Math.round(delta.z / step) * step;
    for (const pd of pieces) {
      const s = drag.start.get(pd.id) as [number, number, number];
      pd.p = [round(s[0] + dx), s[1], round(s[2] + dz)];
    }
    this.refreshLight();
  }

  /** Cheap refresh during drags (no validation, no history). */
  private refreshLight(): void {
    this.view.sync(this.track);
    this.rebuildSelection();
    const report = analyzeConnections(this.track.pieces.filter((p) => !getDef(p.t).decor));
    this.openPorts = report.open;
    this.rebuildMarkers();
  }

  /* ------------------------------------------------------ indicators */

  private markerGeo = new THREE.ConeGeometry(0.35, 0.8, 12);
  private ringGeo = new THREE.TorusGeometry(0.55, 0.08, 6, 20);
  private outMat = new THREE.MeshBasicMaterial({ color: '#2bd96b', transparent: true, opacity: 0.9, depthTest: false });
  private inMat = new THREE.MeshBasicMaterial({ color: '#4cc3ff', transparent: true, opacity: 0.85, depthTest: false });
  private badMat = new THREE.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0.9, depthTest: false });

  private rebuildMarkers(): void {
    this.portMarkers.clear();
    const report = analyzeConnections(this.track.pieces.filter((p) => !getDef(p.t).decor));
    for (const p of report.open) {
      const m = p.kind === 'out' ? new THREE.Mesh(this.markerGeo, this.outMat) : new THREE.Mesh(this.ringGeo, this.inMat);
      m.renderOrder = 10;
      m.position.copy(p.pos).add(new THREE.Vector3(0, 0.5, 0)).addScaledVector(p.facing, p.kind === 'out' ? 0.6 : 0);
      if (p.kind === 'out') m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.facing);
      else m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.facing);
      m.userData.bob = Math.random() * 6;
      this.portMarkers.add(m);
    }
    for (const [a] of report.mismatched) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), this.badMat);
      m.position.copy(a.pos).add(new THREE.Vector3(0, 0.5, 0));
      m.renderOrder = 10;
      this.portMarkers.add(m);
    }
  }

  private rebuildSelection(): void {
    this.selBoxes.clear();
    for (const id of this.selection) {
      const box = this.view.pieceBox(id);
      if (!box) continue;
      box.expandByScalar(0.15);
      const h = new THREE.Box3Helper(box, new THREE.Color(this.isLocked(id) ? '#ff9f1c' : '#ffd60a'));
      (h.material as THREE.LineBasicMaterial).depthTest = false;
      h.renderOrder = 9;
      this.selBoxes.add(h);
    }
    // highlight validation problems
    if (this.showIssues) {
      for (const issue of this.validation.issues) {
        if (issue.level === 'info') continue;
        for (const id of issue.pieces) {
          const box = this.view.pieceBox(id);
          if (!box) continue;
          const h = new THREE.Box3Helper(box, new THREE.Color(issue.level === 'error' ? '#ff4d4d' : '#ff9f1c'));
          h.renderOrder = 8;
          this.selBoxes.add(h);
        }
      }
    }
  }

  showIssues = false;

  setShowIssues(on: boolean): void {
    this.showIssues = on;
    this.rebuildSelection();
  }

  update(time: number): void {
    for (const m of this.portMarkers.children) m.position.y += Math.sin(time * 4 + (m.userData.bob ?? 0)) * 0.004;
    this.portMarkers.visible = this.active;
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onDown, { capture: true });
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

void materials;
