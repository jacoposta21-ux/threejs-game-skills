/** Inline SVG icons for the six miracle slots (original artwork). */
const wrap = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
export const MIRACLE_ICONS = {
  'miracle.divine-push': wrap('<path d="M10 24h10" stroke-width="4"/><path d="M24 12c5 3 8 7.5 8 12s-3 9-8 12" fill="none" stroke-width="4"/><path d="M31 8c7 4 11 10 11 16s-4 12-11 16" fill="none" stroke-width="3" opacity=".6"/>'),
  'miracle.multiplication': wrap('<path d="M6 24c6-8 16-9 24-4l8-6v20l-8-6c-8 5-18 4-24-4z"/><circle cx="14" cy="22" r="2" class="cut"/>'),
  'miracle.water-to-wine': wrap('<path d="M13 8h22c0 10-4 17-11 17S13 18 13 8z"/><path d="M24 25v11M15 40h18" fill="none" stroke-width="4"/><path d="M15 12h18" class="cut" stroke-width="2"/>'),
  'miracle.walk-on-water': wrap('<path d="M4 34c5-4 9-4 14 0s9 4 14 0 9-4 12 0" fill="none" stroke-width="3.5"/><path d="M4 42c5-4 9-4 14 0s9 4 14 0 9-4 12 0" fill="none" stroke-width="3" opacity=".6"/><ellipse cx="22" cy="16" rx="5" ry="8"/><circle cx="31" cy="11" r="2.4"/>'),
  'miracle.healing-touch': wrap('<path d="M20 8h8v12h12v8H28v12h-8V28H8v-8h12z"/>'),
  'miracle.holy-levitation': wrap('<path d="M24 6l10 11h-6v9h-8v-9h-6z"/><rect x="14" y="32" width="20" height="10" rx="2" opacity=".75"/>'),
};
export const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke-width="2.4"/></svg>';
