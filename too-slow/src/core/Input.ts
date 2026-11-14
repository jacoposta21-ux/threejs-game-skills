export interface InputCallbacks {
  pause(): void;
  respawn(): void;
  mute(): void;
  /** Any key or pointer press: used to unlock audio. */
  gesture(): void;
}

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyF']);

/** Keyboard state + edge events. Translating keys into race intents is the Game's job. */
export class Input {
  private readonly down = new Set<string>();
  private rollEdge = false;
  private boostEdge = false;
  private itemEdge = false;
  enabled = true;

  constructor(private readonly callbacks: InputCallbacks) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointerdown', this.onPointer);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.callbacks.gesture();
    const typing = e.target instanceof HTMLInputElement;
    if (GAME_KEYS.has(e.code) && !typing) e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    if (e.code === 'Escape') this.callbacks.pause();
    if (e.code === 'KeyM') this.callbacks.mute();
    if (!this.enabled) return;
    if (e.code === 'Space') this.rollEdge = true;
    if (e.code === 'KeyE') this.boostEdge = true;
    if (e.code === 'KeyF') this.itemEdge = true;
    if (e.code === 'KeyR') this.callbacks.respawn();
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private readonly onBlur = () => {
    this.down.clear();
  };

  private readonly onPointer = () => {
    this.callbacks.gesture();
  };

  private held(...codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  get steer(): number {
    return (this.held('KeyD', 'ArrowRight') ? 1 : 0) - (this.held('KeyA', 'ArrowLeft') ? 1 : 0);
  }

  get throttle(): number {
    return (this.held('KeyW', 'ArrowUp') ? 1 : 0) - (this.held('KeyS', 'ArrowDown') ? 1 : 0);
  }

  get slide(): boolean {
    return this.held('ShiftLeft', 'ShiftRight');
  }

  get spin(): number {
    return (this.held('KeyE') ? 1 : 0) - (this.held('KeyQ') ? 1 : 0);
  }

  takeRoll(): boolean {
    const v = this.rollEdge;
    this.rollEdge = false;
    return v;
  }

  takeItem(): boolean {
    const v = this.itemEdge;
    this.itemEdge = false;
    return v;
  }

  takeBoost(): boolean {
    const v = this.boostEdge;
    this.boostEdge = false;
    return v;
  }

  clear(): void {
    this.down.clear();
    this.rollEdge = false;
    this.boostEdge = false;
    this.itemEdge = false;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerdown', this.onPointer);
  }
}
