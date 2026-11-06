/**
 * Localisation.
 *  - UI strings are looked up by their English text: t('Resume').  Placeholders: {0}, {1}…
 *  - Story/level data is translated in place: applyLanguage() rewrites LEVELS / CHAPTERS from the
 *    per-language `data` tables (keyed by stable ids, see dataCatalog()), keeping the English originals.
 */
import { CHAPTERS, LEVELS, type ChapterDef, type LevelDef } from '../levels/levels.ts';
import { it } from '../i18n/it.ts';
import { es } from '../i18n/es.ts';
import { fr } from '../i18n/fr.ts';
import { de } from '../i18n/de.ts';
import { pt } from '../i18n/pt.ts';

export interface LangPack {
  ui: Record<string, string>;
  data: Record<string, string>;
}

export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
] as const;
export type LangCode = (typeof LANGS)[number]['code'];

const PACKS: Record<string, LangPack> = { it, es, fr, de, pt };
let current: LangCode = 'en';
let pack: LangPack | null = null;

const fill = (s: string, args: (string | number)[]) => s.replace(/\{(\d)\}/g, (_, i) => String(args[+i] ?? ''));

/** Translate a UI string (English source text). */
export function t(en: string, ...args: (string | number)[]): string {
  return fill(pack?.ui[en] ?? en, args);
}

export function lang(): LangCode {
  return current;
}

/**
 * The starting language.
 *  - Playgama: only the Bridge's platform.language counts (rule 3.4.2); anything unsupported falls back to English.
 *  - CrazyGames / web: the browser language (CrazyGames passes the player's locale through it).
 */
export function detectLanguage(platformLang: string | null = null, useBrowser = true): LangCode {
  const pl = platformLang?.toLowerCase().slice(0, 2);
  if (pl && LANGS.some((x) => x.code === pl)) return pl as LangCode;
  if (!useBrowser) return 'en';
  const list = (navigator.languages?.length ? navigator.languages : [navigator.language || 'en']).map((l) => l.toLowerCase().slice(0, 2));
  for (const l of list) if (LANGS.some((x) => x.code === l)) return l as LangCode;
  return 'en';
}

// ------------------------------------------------------------------ data
type Orig = { name: string; subtitle: string; intro: string[]; hints: string[]; lore: string[]; boss?: { name: string; sub: string } };
const origLevels: Orig[] = LEVELS.map((L) => ({ name: L.name, subtitle: L.subtitle, intro: [...L.intro], hints: [...L.hints], lore: [...L.lore], boss: L.boss && { name: L.boss.name, sub: L.boss.sub } }));
const origChapters = CHAPTERS.map((C) => ({ title: C.title, ending: [...C.ending] }));

/** Every translatable data string, by stable id (English source). */
export function dataCatalog(): Record<string, string> {
  const out: Record<string, string> = {};
  LEVELS.forEach((L, i) => {
    const o = origLevels[i];
    out[`${L.id}.name`] = o.name;
    o.intro.forEach((s, k) => (out[`${L.id}.intro.${k}`] = s));
    o.hints.forEach((s, k) => (out[`${L.id}.hint.${k}`] = s));
    o.lore.forEach((s, k) => (out[`${L.id}.lore.${k}`] = s));
    if (o.boss) {
      out[`${L.id}.boss.name`] = o.boss.name;
      out[`${L.id}.boss.sub`] = o.boss.sub;
    }
  });
  CHAPTERS.forEach((C, i) => {
    const o = origChapters[i];
    out[`ch${i + 1}.title`] = o.title;
    o.ending.forEach((s, k) => (out[`ch${i + 1}.end.${k}`] = s));
  });
  return out;
}

const subtitleRe = /^Chapter (\w+) · Part (\d+)$/;

export function applyLanguage(code: LangCode) {
  current = LANGS.some((x) => x.code === code) ? code : 'en';
  pack = PACKS[current] ?? null;
  const d = (id: string, en: string) => pack?.data[id] ?? en;
  LEVELS.forEach((L: LevelDef, i) => {
    const o = origLevels[i];
    L.name = d(`${L.id}.name`, o.name);
    const m = subtitleRe.exec(o.subtitle);
    L.subtitle = m ? t('Chapter {0} · Part {1}', m[1], m[2]) : o.subtitle;
    L.intro = o.intro.map((s, k) => d(`${L.id}.intro.${k}`, s));
    L.hints = o.hints.map((s, k) => d(`${L.id}.hint.${k}`, s));
    L.lore = o.lore.map((s, k) => d(`${L.id}.lore.${k}`, s));
    if (L.boss && o.boss) {
      L.boss.name = d(`${L.id}.boss.name`, o.boss.name);
      L.boss.sub = d(`${L.id}.boss.sub`, o.boss.sub);
    }
  });
  CHAPTERS.forEach((C: ChapterDef, i) => {
    const o = origChapters[i];
    C.title = d(`ch${i + 1}.title`, o.title);
    C.ending = o.ending.map((s, k) => d(`ch${i + 1}.end.${k}`, s));
  });
  CHAPTERS.forEach((C, i) => {
    const n = CHAPTERS[i + 1];
    C.next = n ? t('Chapter {0} · {1}', n.roman, n.title) : undefined;
  });
  try {
    document.documentElement.lang = current;
  } catch { /* */ }
}
