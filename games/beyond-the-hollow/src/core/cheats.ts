/**
 * Test build switches. Normal builds have them all off.
 *  - VITE_INFINITE=1 at build time (the "vite infinite" HTML), or ?infinite in the URL:
 *    Elias and Ilse take hits and knockback but never lose health, so a run can always be finished.
 *  - VITE_UNLOCK_ALL=1 at build time, or ?unlockall in the URL: every chapter is open in the Chapters menu.
 */
let urlFlag = false;
let unlockFlag = false;
try {
  urlFlag = /[?&]infinite\b/.test(location.search);
  unlockFlag = /[?&]unlockall\b/.test(location.search);
} catch { /* */ }

export const CHEATS = {
  infiniteLives: import.meta.env.VITE_INFINITE === '1' || urlFlag,
  unlockAll: import.meta.env.VITE_UNLOCK_ALL === '1' || unlockFlag,
};
