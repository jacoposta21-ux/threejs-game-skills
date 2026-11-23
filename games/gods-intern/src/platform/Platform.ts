/**
 * Platform integration boundary. Core gameplay only talks to this interface,
 * so the game runs identically on any host.
 *
 * CrazyGames: the official SDK documentation could not be retrieved while this
 * slice was built (docs URL returned 404), so NO CrazyGames SDK calls are made.
 * To integrate, implement `GamePlatform` in a new file against the current
 * official docs (script URL, init, loading/gameplay lifecycle) and return it
 * from `createPlatform()`. Do not add advertising before that is verified.
 */
export interface GamePlatform {
  readonly name: string;
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Positive moment (prayer answered, etc.). Optional on most hosts. */
  celebrate(): void;
}

export class StandalonePlatform implements GamePlatform {
  readonly name = 'standalone';
  async init(): Promise<void> {}
  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  celebrate(): void {}
}

export function createPlatform(): GamePlatform {
  return new StandalonePlatform();
}
