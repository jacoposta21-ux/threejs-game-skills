const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

/** Suffix for tier t (t=0 → '', 1 → K … 4 → T, 5 → aa, 6 → ab …). */
export function suffixFor(tier: number): string {
  if (tier < SUFFIXES.length) return SUFFIXES[tier];
  const i = tier - SUFFIXES.length;
  const a = 'a'.charCodeAt(0);
  return String.fromCharCode(a + Math.floor(i / 26) % 26) + String.fromCharCode(a + (i % 26));
}

function trimZero(s: string): string {
  return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
}

/** 999 → "999", 1234 → "1.2K", 12345 → "12.3K", 123456 → "123K", 3.4e6 → "3.4M". */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '0';
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 10) return trimZero((Math.floor(n * 10) / 10).toFixed(1));
  if (n < 1000) return String(Math.floor(n));
  let tier = Math.floor(Math.log10(n) / 3);
  let v = n / Math.pow(1000, tier);
  // floor to avoid "1000K"; correct floating error near tier boundaries
  if (v >= 1000) { tier++; v /= 1000; }
  if (v < 1) { tier--; v *= 1000; }
  const s = v < 100 ? trimZero((Math.floor(v * 10) / 10).toFixed(1)) : String(Math.floor(v));
  return s + suffixFor(tier);
}

/** 75 → "1m 15s", 7200 → "2h 0m". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}
