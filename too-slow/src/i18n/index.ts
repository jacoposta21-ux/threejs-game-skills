import { TABLE } from './strings';

/**
 * Tiny i18n: English text is the key, the table holds the other languages. Missing entries fall
 * back to English, so a new string never shows up blank. `{name}` placeholders are filled from vars.
 */
export type Lang = 'en' | 'it' | 'es' | 'fr' | 'de' | 'pt';

export const LANGS: [Lang, string][] = [
  ['en', 'English'],
  ['it', 'Italiano'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['pt', 'Português'],
];

const ORDER: Lang[] = ['en', 'it', 'es', 'fr', 'de', 'pt'];
const DICT: Record<string, Record<string, string>> = {};
for (const l of ORDER) DICT[l] = {};
for (const row of TABLE) {
  for (let k = 1; k < ORDER.length; k += 1) if (row[k]) DICT[ORDER[k]][row[0]] = row[k];
}

export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? 'en') : 'en';
  const code = nav.slice(0, 2).toLowerCase() as Lang;
  return ORDER.includes(code) ? code : 'en';
}

let lang: Lang = 'en';
const listeners: (() => void)[] = [];

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang | 'auto'): void {
  lang = l === 'auto' ? detectLang() : l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    applyStatic();
  }
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): void {
  listeners.push(fn);
}

export function t(en: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? en : (DICT[lang][en] ?? en);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Ordinal suffix for a place: 1st, 1º, 1er, 1. … */
export function ord(n: number): string {
  switch (lang) {
    case 'it':
    case 'es':
    case 'pt':
      return 'º';
    case 'fr':
      return n === 1 ? 'er' : 'e';
    case 'de':
      return '.';
    default: {
      const v = n % 100;
      if (v >= 11 && v <= 13) return 'th';
      return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
    }
  }
}

/** Translate everything marked in the page: data-i18n (text), data-i18n-html (markup), data-i18n-aria. */
export function applyStatic(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n || el.textContent?.trim() || '';
    if (!el.dataset.i18n) el.dataset.i18n = key;
    el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    if (!el.dataset.i18nHtml) el.dataset.i18nHtml = el.innerHTML.trim().replace(/\s+/g, ' ');
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria ?? ''));
  });
}
