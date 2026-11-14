/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  /** Race progress: metres covered by the player. */
  score: number;
  targetScore: number;
  complete: boolean;
  state: string;
  paused: boolean;
  rank: number;
  mode: string;
  speedKmh: number;
  airborne: boolean;
  slime: number;
  boost: number;
  fps: number;
  racers: { name: string; s: number; d: number; finished: boolean; time: number; mode: string }[];
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface ThreeGameTestHooks {
  seed(value: number): void | Promise<void>;
  setState(name: string): { state: string } | Promise<{ state: string }>;
  setPausedForScreenshot(paused: boolean): void | Promise<void>;
  setReducedMotion(enabled: boolean): void | Promise<void>;
  hideDebugUi(hidden: boolean): void | Promise<void>;
  /** Let the racing-line AI drive the player's snail (bot playtests / attract). */
  autopilot(enabled: boolean): void;
  /** Fast-forward the fixed-step simulation without rendering. Returns race time. */
  simulate(seconds: number): number;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
