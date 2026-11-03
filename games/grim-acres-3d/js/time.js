// Clock helpers. Time is "minutes since midnight of the current day"; the day runs 6:00 -> 26:00 (2am).
export const DAY_START = 6 * 60;
export const DAY_END = 26 * 60;              // 2:00 next morning -> pass out
export const REAL_SECONDS_PER_DAY = 540;     // ~9 real minutes per in-game day
export const MINUTES_PER_SECOND = (DAY_END - DAY_START) / REAL_SECONDS_PER_DAY;
export const SEASON_DAYS = 28;
export const STORE = { open: 8 * 60, close: 17 * 60, closedDow: 6 }; // closed on Sundays

export function parseTime(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function dayOfWeek(day) { return (day - 1) % 7; } // 0 = Monday

// 10-minute steps like a wall clock, 24h display ("6:00", "13:40", "1:20").
export function clockParts(minutes) {
  const m = Math.floor(minutes / 10) * 10;
  const h = Math.floor(m / 60) % 24;
  return { h, m: m % 60 };
}

export function formatClock(minutes) {
  const { h, m } = clockParts(minutes);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function storeOpen(day, minutes) {
  return dayOfWeek(day) !== STORE.closedDow && minutes >= STORE.open && minutes < STORE.close;
}

// Doors: houses lock overnight, the hall keeps office hours.
export function doorLocked(lock, day, minutes) {
  if (!lock) return false;
  if (lock === 'store') return !storeOpen(day, minutes);
  if (lock === 'hall') return minutes < 8 * 60 || minutes >= 20 * 60;
  if (lock === 'house') return minutes < 8 * 60 || minutes >= 21 * 60;
  return false;
}

// 0 = full daylight, 1 = deepest night. Used for the tint and window lights.
export function darkness(minutes) {
  if (minutes < 7 * 60) return 0.35 * (1 - (minutes - DAY_START) / 60);
  if (minutes < 17 * 60) return 0;
  if (minutes < 20 * 60) return ((minutes - 17 * 60) / 180) * 0.75;
  if (minutes < 22 * 60) return 0.75 + ((minutes - 20 * 60) / 120) * 0.2;
  return 0.95;
}
