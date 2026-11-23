/** Hand-authored inline SVG icons (24×24 viewBox). */
const svg = (body: string, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICON = {
  rain: svg(
    `<path d="M7 15.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.8 7.6 4 4 0 0 1 17 15.5Z" fill="#eaf4ff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
     <path d="M8 18.5l-1 2.5M12 18l-1 3M16 18.5l-1 2.5" stroke="#3aa0ff" stroke-width="2" stroke-linecap="round"/>`,
  ),
  lightning: svg(`<path d="M13.5 2 5 13.5h6l-1.5 8.5L19 10h-6.2z" fill="#ffe066" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`),
  nature: svg(
    `<path d="M12 21v-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
     <path d="M12 13c0-4.5 3-7.5 8-7.5 0 4.6-3 7.5-8 7.5Z" fill="#7bd66b" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
     <path d="M12 15.5c0-3.6-2.4-6-6.5-6 0 3.7 2.4 6 6.5 6Z" fill="#a6ec8a" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  ),
  fire: svg(
    `<path d="M12 22c-4.2 0-7-2.8-7-6.6 0-3.5 2.4-5.6 3.7-8.3.4 1.7 1.4 2.8 2.5 3.3-.3-3.4 1.3-6.4 4-8.4.2 3.2 1.6 4.8 3 6.6 1.2 1.6 1.8 3.2 1.8 5C20 19.2 16.6 22 12 22Z" fill="#ff8c42" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
     <path d="M12 21c-1.9 0-3.2-1.2-3.2-3 0-1.7 1.3-2.7 2.1-4 .5 1.4 1.4 1.9 2.1 2.1.6-.9.9-1.6.9-2.6 1 1 2 2.4 2 4.1 0 2-1.6 3.4-3.9 3.4Z" fill="#ffe066"/>`,
  ),
  mutation: svg(
    `<path d="M9 3c-2 3 2 4 0 7s2 4 0 7 2 4 0 4M15 3c2 3-2 4 0 7s-2 4 0 7-2 4 0 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
     <path d="M9 6.5h6M9 13.5h6M9 17.5h6" stroke="#b86bff" stroke-width="1.6" stroke-linecap="round"/><circle cx="18.5" cy="5" r="2.2" fill="#ffd23f" stroke="currentColor" stroke-width="1.2"/>`,
  ),
  book: svg(`<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" fill="#fff2d6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 7h7M9 10.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16.5" cy="14" r="1.6" fill="#f2c14e"/>`),
  temple: svg(`<path d="M3 9 12 3l9 6H3z" fill="#f2c14e" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9" stroke="currentColor" stroke-width="1.6"/><path d="M3 18h18v3H3z" fill="#fff2d6" stroke="currentColor" stroke-width="1.4"/>`),
  hand: svg(
    `<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15c0 4-3 7-7 7-3 0-4.6-1.2-6.4-3.5L3.3 15a1.6 1.6 0 0 1 2.4-2l2.3 2" fill="#fff2d6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  pause: svg(`<rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/>`),
  play: svg(`<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`),
  gear: svg(
    `<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
     <path d="M19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  ),
  people: svg(
    `<circle cx="9" cy="8" r="3.2" fill="currentColor"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6" fill="currentColor"/>
     <circle cx="17" cy="9" r="2.5" fill="currentColor" opacity=".6"/><path d="M15.5 14.3c3 .2 5.5 2.3 5.5 5.7h-4" fill="currentColor" opacity=".6"/>`,
  ),
  sun: svg(`<circle cx="12" cy="12" r="4.5" fill="#ffd23f"/><g stroke="#ffb703" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g>`),
  moon: svg(`<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.8 6.8 0 0 0 20 14.5Z" fill="#cdd7ff" stroke="#8090d8" stroke-width="1.4"/>`),
  halo: svg(`<ellipse cx="12" cy="6" rx="7" ry="2.6" fill="none" stroke="#f2c14e" stroke-width="2.2"/><path d="M12 10.5a4.5 4.5 0 0 1 4.5 4.5v5h-9v-5a4.5 4.5 0 0 1 4.5-4.5Z" fill="currentColor" opacity=".85"/>`),
  chaos: svg(`<path d="M12 12c0-1.7 1.6-2.6 3-1.8 2.2 1.2 1.8 4.6-.6 5.6-3.4 1.4-6.8-1.4-6.4-5 .5-4.6 6-6.6 9.6-4 4.5 3.3 3.2 10.4-2 12.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  energy: svg(`<path d="M13.5 2 5 13.5h6l-1.5 8.5L19 10h-6.2z" fill="currentColor"/>`),
  fullscreen: svg(`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  chevron: svg(`<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  close: svg(`<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  lock: svg(`<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/>`),
  water: svg(`<path d="M12 3c3.5 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.5 6-11Z" fill="#4cb4ff" stroke="currentColor" stroke-width="1.4"/>`),
  food: svg(`<path d="M12 21V8M12 8c-2.5 0-4-1.6-4-4 2.5 0 4 1.6 4 4Zm0 0c2.5 0 4-1.6 4-4-2.5 0-4 1.6-4 4Zm0 5c-2.5 0-4-1.6-4-4 2.5 0 4 1.6 4 4Zm0 0c2.5 0 4-1.6 4-4-2.5 0-4 1.6-4 4Zm0 5c-2.5 0-4-1.6-4-4 2.5 0 4 1.6 4 4Zm0 0c2.5 0 4-1.6 4-4-2.5 0-4 1.6-4 4Z" fill="#f2c14e" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`),
  wood: svg(`<rect x="3" y="9" width="15" height="7" rx="3.5" fill="#c58a4f" stroke="currentColor" stroke-width="1.4"/><ellipse cx="18" cy="12.5" rx="3" ry="3.5" fill="#f0c98e" stroke="currentColor" stroke-width="1.4"/><circle cx="18" cy="12.5" r="1.2" fill="none" stroke="currentColor" stroke-width="1"/>`),
  heart: svg(`<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" fill="#ff5d7a" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`),
  faith: svg(`<ellipse cx="12" cy="5" rx="6" ry="2.2" fill="none" stroke="#e0a526" stroke-width="2"/><path d="M12 9l1.8 4.2L18 15l-4.2 1.8L12 21l-1.8-4.2L6 15l4.2-1.8Z" fill="#f2c14e" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`),
  fear: svg(`<path d="M6 21V10a6 6 0 0 1 12 0v11l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6Z" fill="#eef1ff" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="9.5" cy="10.5" r="1.3" fill="currentColor"/><circle cx="14.5" cy="10.5" r="1.3" fill="currentColor"/><ellipse cx="12" cy="15" rx="1.4" ry="2" fill="currentColor"/>`),
  pin: svg(`<path d="M12 22s7-6.4 7-12a7 7 0 0 0-14 0c0 5.6 7 12 7 12Z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="#fff"/>`),
  memo: svg(`<rect x="4" y="3" width="16" height="18" rx="2.5" fill="#fffaf0" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`),
  speed: svg(`<path d="M4 6l8 6-8 6zM12 6l8 6-8 6z" fill="currentColor"/>`),
  house: svg(`<path d="M3 11 12 4l9 7v9H3z" fill="#fff2d6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.5"/>`),
  question: svg(`<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.8v.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/>`),
};

export type IconName = keyof typeof ICON;
