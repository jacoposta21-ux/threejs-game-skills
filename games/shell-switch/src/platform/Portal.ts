/**
 * Optional web-portal hooks (CrazyGames SDK v3 shape). The game never loads a
 * remote script itself: when the hosting page has injected `window.CrazyGames`,
 * these calls report gameplay state; otherwise every call is a silent no-op.
 */
interface CrazySdk {
  game?: {
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
    happytime?: () => void;
  };
  init?: () => Promise<void>;
}

function sdk(): CrazySdk | null {
  const w = window as unknown as { CrazyGames?: { SDK?: CrazySdk } };
  return w.CrazyGames?.SDK ?? null;
}

let playing = false;

function call(fn: (s: CrazySdk) => void): void {
  try {
    const s = sdk();
    if (s) fn(s);
  } catch {
    /* portal SDK unavailable or not initialised */
  }
}

export const Portal = {
  async init(): Promise<void> {
    try {
      await sdk()?.init?.();
    } catch {
      /* ignore */
    }
  },
  loadingStart: () => call((s) => s.game?.loadingStart?.()),
  loadingStop: () => call((s) => s.game?.loadingStop?.()),
  gameplay(on: boolean): void {
    if (on === playing) return;
    playing = on;
    call((s) => (on ? s.game?.gameplayStart?.() : s.game?.gameplayStop?.()));
  },
  happy: () => call((s) => s.game?.happytime?.()),
};
