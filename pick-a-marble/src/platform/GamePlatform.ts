import { CrazyGamesPlatform } from './CrazyGames';
import { PlaygamaPlatform } from './PlaygamaPlatform';

/** What the game needs from a web-portal SDK. */
export interface GamePlatform {
  environment: string;
  onAudioMute: (muted: boolean) => void;
  onAdPause: (paused: boolean) => void;
  init(): Promise<void>;
  loadingStart(): void;
  loadingProgress(fraction: number): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  midgameBreak(): Promise<void>;
  inviteLink(room: string): string;
  showInviteButton(room: string): void;
  hideInviteButton(): void;
  inviteRoom(): string | null;
  readonly instantMultiplayer: boolean;
}

/** Build target decides the SDK: `VITE_TARGET=playgama` → Playgama Bridge, otherwise CrazyGames. */
export function createPlatform(): GamePlatform {
  return import.meta.env.VITE_TARGET === 'playgama' ? new PlaygamaPlatform() : new CrazyGamesPlatform();
}
