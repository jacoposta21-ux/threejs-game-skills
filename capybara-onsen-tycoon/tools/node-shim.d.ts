// Minimal ambient declarations for the Node APIs used by tools/ (avoids an extra @types/node dependency).
declare const process: {
  argv: string[];
  exitCode?: number;
  stdout: { write(s: string): boolean };
};
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
}
