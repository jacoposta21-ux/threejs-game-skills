/** Inline SVG icons drawn in the game's chalk-and-brass style. */
const stroke = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS: Record<string, string> = {
  key: `<svg viewBox="0 0 32 32"><circle cx="10" cy="16" r="5" ${stroke}/><path d="M15 16h13M23 16v4M27 16v3" ${stroke}/></svg>`,
  windkey: `<svg viewBox="0 0 32 32"><path d="M16 4c-4 0-6 2-6 4s2 4 6 4 6-2 6-4-2-4-6-4zM16 12v16M16 22h5M16 26h4" ${stroke}/><circle cx="16" cy="8" r="1.4" fill="currentColor"/></svg>`,
  gear: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6" ${stroke}/><circle cx="16" cy="16" r="2" ${stroke}/><path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8" ${stroke}/></svg>`,
  spring: `<svg viewBox="0 0 32 32"><path d="M8 6h16M8 26h16M10 6c12 2 12 4 0 6s12 4 0 6 12 4 0 6" ${stroke}/></svg>`,
  crank: `<svg viewBox="0 0 32 32"><path d="M6 24h8l6-12h4" ${stroke}/><circle cx="26" cy="12" r="3" ${stroke}/><circle cx="6" cy="24" r="2.5" ${stroke}/></svg>`,
  lumo: `<svg viewBox="0 0 32 32"><ellipse cx="16" cy="19" rx="5" ry="7" ${stroke}/><path d="M12 13c-6-6-10-2-8 2s6 2 8 0M20 13c6-6 10-2 8 2s-6 2-8 0M14 9l-2-5M18 9l2-5" ${stroke}/></svg>`,
  crawl: `<svg viewBox="0 0 32 32"><circle cx="9" cy="12" r="3" ${stroke}/><path d="M12 15l7 1 6 4M15 16l-3 8M21 18l2 6M6 24h22" ${stroke}/></svg>`,
  climb: `<svg viewBox="0 0 32 32"><path d="M6 26h8v-8h8v-8h6" ${stroke}/><path d="M12 12l4-5 4 5" ${stroke}/></svg>`,
  hand: `<svg viewBox="0 0 32 32"><path d="M11 17V8a2 2 0 014 0v7M15 15V6a2 2 0 014 0v9M19 15V8a2 2 0 014 0v10c0 6-4 9-8 9s-6-2-8-6l-3-5a2 2 0 013-2l3 3" ${stroke}/></svg>`,
  pause: `<svg viewBox="0 0 32 32"><path d="M12 9v14M20 9v14" ${stroke}/></svg>`,
  firefly: `<svg viewBox="0 0 32 32"><circle cx="16" cy="18" r="4" fill="currentColor"/><path d="M12 14c-5-5-9-1-7 2M20 14c5-5 9-1 7 2" ${stroke}/></svg>`,
};

export function icon(name: string): string {
  return ICONS[name] ?? ICONS.hand;
}
