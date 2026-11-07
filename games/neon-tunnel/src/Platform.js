// Platform adapter. The game only talks to this interface, so a portal SDK
// (e.g. CrazyGames) can be plugged in without touching gameplay code.
//
// The CrazyGames adapter is intentionally NOT implemented here: wire it up
// against the current official SDK documentation (docs.crazygames.com) rather
// than guessed method names. Map the hooks below onto the SDK's documented
// loading, gameplay start/stop, ad-break and data calls; keep ads out of the
// core loop by resolving `requestBreak` only after the ad finishes and by
// pausing/muting through the callbacks the Game passes in.

export class LocalPlatform {
  constructor() {
    this.name = 'local';
  }

  /** Called once before anything else. May be async for SDK init. */
  async init() {
    return true;
  }

  loadingStart() {}

  loadingStop() {}

  /** Player is actively playing (run started or resumed). */
  gameplayStart() {}

  /** Player stopped actively playing (pause, death, menu). */
  gameplayStop() {}

  /** A celebratory moment (e.g. new best score). */
  celebrate() {}

  /**
   * Natural break between runs where a portal may show a midgame ad.
   * `hooks.pause()` / `hooks.resume()` must silence and freeze the game.
   * Local development: resolves immediately with no ad.
   */
  async requestBreak(_kind, _hooks) {
    return { shown: false };
  }
}

export function createPlatform() {
  // Selection point for future adapters, e.g. based on hostname or a build flag.
  return new LocalPlatform();
}
