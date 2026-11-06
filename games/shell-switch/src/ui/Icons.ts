import type { ItemId } from '../gameplay/types';

/** Hand-drawn flat SVG icons in the game's ink-outline sticker style (no emoji). */
const INK = '#241d38';
const wrap = (body: string, size = 22) =>
  `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

export const ITEM_ICONS: Record<ItemId, string> = {
  cityPass: wrap('<rect x="3" y="6" width="18" height="12" rx="2" fill="#ffe27a"/><path d="M15 6v12" stroke-dasharray="2 2"/><path d="M6 10h6M6 14h4"/>'),
  mic: wrap('<rect x="9" y="3" width="6" height="11" rx="3" fill="#ffe27a"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none"/>'),
  burger: wrap('<path d="M4 11a8 6 0 0 1 16 0z" fill="#f39a3d"/><rect x="3.5" y="12" width="17" height="3" rx="1.5" fill="#7d5130"/><path d="M4 16h16l-1.5 3h-13z" fill="#f39a3d"/><path d="M4 12.5l3-1 3 1 3-1 3 1 4-1" stroke="#4fb06a" fill="none"/>'),
  souffle: wrap('<path d="M6 13h12l-1.5 7h-9z" fill="#ff8fc0"/><path d="M5 13c0-5 3-8 7-8s7 3 7 8z" fill="#fff6d8"/><path d="M8 13v7M12 13v7M16 13v7" stroke-width="1"/>'),
  candy: wrap('<circle cx="12" cy="9" r="6.5" fill="#ff8fc0"/><path d="M12 15.5V22"/><path d="M8 7c2-2 5-2 7 1" fill="none" stroke="#fff"/>'),
  keycard: wrap('<rect x="3" y="6" width="18" height="12" rx="2" fill="#4a8fe0"/><rect x="5.5" y="8.5" width="5" height="4" rx="1" fill="#ffe27a"/><path d="M5.5 15h11"/>'),
  fuse: wrap('<rect x="5" y="9" width="12" height="10" rx="2" fill="#e2473f" transform="rotate(-20 11 14)"/><path d="M15 8c1-3 3-4 5-3" fill="none"/><circle cx="20.5" cy="4.5" r="1.6" fill="#ffe27a"/>'),
  permit: wrap('<path d="M6 3h10l3 3v15H6z" fill="#f4efe6"/><path d="M9 8h7M9 11h7M9 14h4"/><circle cx="15" cy="17" r="2.2" fill="#e2473f"/>'),
  duck: wrap('<path d="M5 14c0 4 3 6 7 6s8-2 8-5c0-2-2-3-4-3 1-1 1-2 1-3a4 4 0 0 0-8 0c0 1 .5 2 1 3-3 0-5 0-5 2z" fill="#ffe27a"/><path d="M17 8.5l3.5 1-3 1.2" fill="#f39a3d"/><circle cx="14.5" cy="8" r=".9" fill="${INK}"/>'),
  wallet: wrap('<rect x="3" y="7" width="18" height="12" rx="2" fill="#7d4fc9"/><path d="M3 10h18"/><rect x="14" y="12" width="7" height="4" rx="1" fill="#ffe27a"/>'),
};

export const ICON = {
  check: wrap('<circle cx="12" cy="12" r="9" fill="#5fe0b8"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke-width="2.2"/>', 20),
  open: wrap('<path d="M12 3l8 9-8 9-8-9z" fill="#ffe27a"/>', 20),
  lock: wrap('<rect x="5" y="10" width="14" height="10" rx="2" fill="#b79cf0"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none"/>', 18),
  medal: wrap('<path d="M8 2h3l1 5-3 1zM16 2h-3l-1 5 3 1z" fill="#e2473f"/><circle cx="12" cy="15" r="6" fill="#f2c14e"/><path d="M12 11.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#fff6c0" stroke-width="1"/>', 20),
  bolt: wrap('<path d="M13 2L5 13h6l-1 9 8-11h-6z" fill="#ffe27a"/>', 18),
  envelope: wrap('<rect x="3" y="6" width="18" height="12" rx="2" fill="#fbf7ee"/><path d="M3 7l9 6 9-6" fill="none"/><rect x="15" y="8.5" width="3.5" height="3.5" fill="#ff6fb5" stroke-width="1"/>', 20),
};
