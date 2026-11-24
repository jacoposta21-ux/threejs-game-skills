/// <reference types="vite/client" />

interface ThreeGameTestHooks {
  seed(value: number): void | Promise<void>;
  setState(name: string): { state: string } | Promise<{ state: string }>;
  setPausedForScreenshot(paused: boolean): void | Promise<void>;
  setReducedMotion(enabled: boolean): void | Promise<void>;
  hideDebugUi(hidden: boolean): void | Promise<void>;
  selectPower(id: 'rain' | 'lightning' | 'nature' | 'fire' | null): void;
  worldToScreen(x: number, z: number): { x: number; y: number };
  skipTutorial(): void;
  simulate(seconds: number): void;
  grantChaos(amount: number): void;
  openBook(): void;
  planTrade(): string | null;
  planMigration(): string | null;
  focusVillage(id: string): void;
  worldPoint(x: number, z: number): { x: number; y: number; visible: boolean };
  grantXp(amount: number): number;
  canCast(id: string, x: number, z: number): boolean;
  setMode(mode: 'career' | 'creative'): void;
  possess(id: string): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: Record<string, unknown>;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
