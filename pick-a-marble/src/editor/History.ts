import type { TrackData } from '../track/types';

/** Snapshot undo/redo. Tracks are small JSON blobs, so snapshots are cheap and robust. */
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private current = '';
  readonly limit = 120;

  reset(track: TrackData): void {
    this.undoStack = [];
    this.redoStack = [];
    this.current = JSON.stringify(track.pieces);
  }

  /** Record the state after a change. Returns false when nothing changed. */
  commit(track: TrackData): boolean {
    const snap = JSON.stringify(track.pieces);
    if (snap === this.current) return false;
    this.undoStack.push(this.current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.current = snap;
    return true;
  }

  undo(track: TrackData): boolean {
    const prev = this.undoStack.pop();
    if (prev === undefined) return false;
    this.redoStack.push(this.current);
    this.current = prev;
    track.pieces = JSON.parse(prev);
    return true;
  }

  redo(track: TrackData): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.undoStack.push(this.current);
    this.current = next;
    track.pieces = JSON.parse(next);
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
