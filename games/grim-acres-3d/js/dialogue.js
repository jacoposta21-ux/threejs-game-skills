// Chooses what a villager says. Lines + their conditions come from js/data/villagers.js,
// the actual words from strings/en.js (npc.<id>.lines.<key>).
import { t, tList, fmt } from './i18n.js';
import { dayOfWeek } from './time.js';

function passes(cond, ctx) {
  if (cond.weather && cond.weather !== ctx.weather) return false;
  if (cond.dow !== undefined && cond.dow !== ctx.dow) return false;
  if (cond.state && cond.state !== ctx.state) return false;
  if (cond.minHearts !== undefined && ctx.hearts < cond.minHearts) return false;
  if (cond.time === 'morning' && ctx.minutes >= 12 * 60) return false;
  if (cond.time === 'evening' && ctx.minutes < 17 * 60) return false;
  return true;
}

// Weighted pick: specific lines (more conditions) are likelier; never repeat the previous line.
export function pickLine(npc, game) {
  const ctx = {
    weather: game.weather,
    dow: dayOfWeek(game.day),
    state: game.mystery.attacks.length ? 'fear' : 'calm',
    hearts: npc.hearts,
    minutes: game.minutes,
  };
  const options = [];
  for (const [key, cond] of Object.entries(npc.def.lines)) {
    if (!passes(cond, ctx) || key === npc.lastLine) continue;
    const w = 1 + Object.keys(cond).length * 2;
    options.push([key, w]);
  }
  if (!options.length) return t(`npc.${npc.id}.lines.hi1`);
  let r = game.rng.next() * options.reduce((s, o) => s + o[1], 0);
  let key = options[0][0];
  for (const [k, w] of options) { r -= w; if (r <= 0) { key = k; break; } }
  npc.lastLine = key;
  return t(`npc.${npc.id}.lines.${key}`);
}

// First words of the day after an attack: villagers react to the news.
export function reactionLine(npc, game) {
  const m = game.mystery;
  const last = m.attacks[m.attacks.length - 1];
  if (!last || last.night !== game.day - 1) return null;
  const victim = t(`npc.${last.victim}.name`);
  if (last.blocked) {
    if (last.victim === npc.id) return t('talk.savedSelf');
    return fmt(game.rng.pick(tList('talk.foiled')), { victim });
  }
  const key = npc.id === m.gnomerId ? `npc.${npc.id}.reactGuilty` : `npc.${npc.id}.react`;
  return fmt(game.rng.pick(tList(key)), { victim });
}

export function giftReaction(npc, itemId) {
  const d = npc.def;
  if (d.loves.includes(itemId)) return 'loved';
  if (d.likes.includes(itemId)) return 'liked';
  if (d.dislikes.includes(itemId)) return 'disliked';
  return 'neutral';
}
