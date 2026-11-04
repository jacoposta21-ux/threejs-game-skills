/**
 * Test build switches. Normal builds have them all off.
 *  - VITE_INFINITE=1 at build time (the "vite infinite" HTML), or ?infinite in the URL:
 *    Elias and Ilse take hits and knockback but never lose health, so a run can always be finished.
 */
let urlFlag = false;
try {
  urlFlag = /[?&]infinite\b/.test(location.search);
} catch { /* */ }

export const CHEATS = {
  infiniteLives: import.meta.env.VITE_INFINITE === '1' || urlFlag,
};
