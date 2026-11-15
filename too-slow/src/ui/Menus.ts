import type { RacerProfile } from '../ai/SnailAI';
import type { RaceMode } from '../racing/RaceManager';
import { cosmeticFor, earnedCosmetics, loadFame, loadGhost, loadMedals, loadStats, loadTrophies, MEDAL_NAMES, MEDAL_TIMES, TRAILS, tutorialDone, type Medal } from './Progress';
import type { HatKind, ShellPattern, SnailLook } from '../characters/SnailModel';
import { TRACKS } from '../world/tracks';
import { formatTime, ordinal } from './Hud';

export interface Settings {
  music: number;
  sfx: number;
  quality: number;
  shake: boolean;
  items: boolean;
  /** Rival skill: 0 easy, 1 normal, 2 hard. */
  difficulty: number;
  /** Lower resolution and shadows automatically when the frame rate drops. */
  autoQuality: boolean;
}

export interface PlayerLook extends SnailLook {
  name: string;
  /** Slime trail colour id (see TRAILS). */
  trail: string;
}

const SETTINGS_KEY = 'tooslow.settings.v1';
const LOOK_KEY = 'tooslow.look.v1';
const RACES_KEY = 'tooslow.races.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / embedded frame): play on without saving */
  }
}

export function loadSettings(): Settings {
  return read<Settings>(SETTINGS_KEY, { music: 0.6, sfx: 0.8, quality: 2, shake: true, items: true, difficulty: 1, autoQuality: true });
}

const bestKey = (track: string) => `tooslow.best.${track}.v1`;

export function loadBest(track: string): number | null {
  const v = read<{ time: number | null }>(bestKey(track), { time: null }).time;
  return typeof v === 'number' && v > 0 ? v : null;
}

export function saveBest(track: string, time: number): void {
  write(bestKey(track), { time });
}

export const SHELL_COLORS = [0xff7a2f, 0xe8413c, 0xff5fa8, 0xa968e0, 0x3f8fe8, 0x2fc6c0, 0x58c26a, 0xf2c230, 0x3a3a48, 0xf4f0e4];
export const SKIN_COLORS = [0xf2c45a, 0xf0b98a, 0xb9d77a, 0xf0a8c6, 0x9fd6e8, 0xd6b07e];
const PATTERNS: [ShellPattern, string][] = [
  ['stripes', 'Stripes'],
  ['spots', 'Spots'],
  ['swirl', 'Swirl'],
  ['solid', 'Solid'],
  ['gold', 'Gold'],
  ['galaxy', 'Galaxy'],
];
const TRAIL_CHOICES: [string, string][] = [
  ['lime', 'Lime'],
  ['sky', 'Sky'],
  ['pink', 'Bubblegum'],
  ['gold', 'Gold'],
  ['rainbow', 'Rainbow'],
];
const HATS: [HatKind, string][] = [
  ['none', 'None'],
  ['crown', 'Crown'],
  ['cap', 'Cap'],
  ['flower', 'Flower'],
  ['propeller', 'Propeller'],
  ['party', 'Party'],
  ['chef', 'Chef'],
  ['viking', 'Viking'],
  ['wizard', 'Wizard'],
  ['halo', 'Halo'],
];

/** A darker shade of a shell colour for the pattern. */
export function shellDarkOf(color: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const k = Math.max(r, g, b) > 225 && Math.min(r, g, b) > 200 ? 0.72 : 0.56;
  return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k);
}

export function loadLook(): PlayerLook {
  const look = read<PlayerLook>(LOOK_KEY, { name: 'You', shell: 0xff7a2f, shellDark: 0xb8431a, skin: 0xf2c45a, pattern: 'stripes', hat: 'none', trail: 'lime' });
  if (!(look.trail in TRAILS)) look.trail = 'lime';
  look.name = (look.name || 'You').slice(0, 12);
  look.shellDark = shellDarkOf(look.shell);
  return look;
}

export function saveLook(look: PlayerLook): void {
  write(LOOK_KEY, look);
}

const UNLOCK_KEY = 'tooslow.unlocked.v1';
const unlockAll = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('unlock') === 'all';

/** Tracks open to play. The first is always open; a top-three finish opens the next. */
export function loadUnlocked(): Set<string> {
  const saved = read<{ ids: string[] }>(UNLOCK_KEY, { ids: [] }).ids;
  const set = new Set<string>([TRACKS[0].id, ...saved]);
  if (unlockAll) for (const d of TRACKS) set.add(d.id);
  return set;
}

/** Unlock the track after `id`; returns its name if it was newly unlocked. */
export function unlockAfter(id: string): string | null {
  const i = TRACKS.findIndex((d) => d.id === id);
  const next = TRACKS[i + 1];
  if (!next) return null;
  const set = loadUnlocked();
  if (set.has(next.id)) return null;
  const saved = read<{ ids: string[] }>(UNLOCK_KEY, { ids: [] }).ids;
  write(UNLOCK_KEY, { ids: [...saved, next.id] });
  return next.name;
}

export function loadRaceCount(): number {
  return read<{ n: number }>(RACES_KEY, { n: 0 }).n;
}

export function saveRaceCount(n: number): void {
  write(RACES_KEY, { n });
}

export type Screen = 'none' | 'main' | 'fame' | 'modes' | 'tracks' | 'garage' | 'how' | 'settings' | 'pause' | 'results' | 'podium';

export interface MenuHandlers {
  chooseTrack(id: string, mode: RaceMode): void;
  startGp(): void;
  startTutorial(): void;
  nextTrack(): void;
  lookChanged(look: PlayerLook): void;
  resume(): void;
  restart(): void;
  toMenu(): void;
  settingsChanged(settings: Settings): void;
  sound(name: 'click' | 'hover'): void;
}

export interface ResultRow {
  racer: number;
  time: number | null;
}

export interface ResultsData {
  place: number;
  time: number;
  best: number | null;
  newBest: boolean;
  topSpeedKmh: number;
  tricks: number;
  trickScore: number;
  rows: ResultRow[];
  trackName: string;
  hasNext: boolean;
  lapTimes: number[];
  unlocked: string | null;
  /** Cosmetics earned by this race. */
  cosmetics: string[];
  mode: RaceMode;
  /** Time trial: medal earned this run. */
  medal?: { medal: Medal; improved: boolean; nextTarget: number | null; ghostSaved: boolean };
  /** Grand Prix standings after this race. */
  gp?: { rows: { racer: number; points: number; gained: number }[]; race: number; of: number; last: boolean };
  /** Split-screen: player two's place. */
  p2Place?: number;
  /** Rank in the local Hall of Fame (0 = not in the top five). */
  fameRank: number;
  /** A rewarded ad can be offered (platform ads available). */
  rewardAvailable: boolean;
}

export interface PodiumData {
  rows: { racer: number; points: number }[];
  place: number;
  difficulty: number;
  improved: boolean;
  cosmetics: string[];
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

export class Menus {
  readonly settings: Settings = loadSettings();
  current: Screen = 'main';
  private back: Screen = 'main';
  private readonly screens: Record<Exclude<Screen, 'none'>, HTMLElement> = {
    main: el('menu-main'),
    modes: el('menu-modes'),
    fame: el('menu-fame'),
    podium: el('menu-podium'),
    tracks: el('menu-tracks'),
    garage: el('menu-garage'),
    how: el('menu-how'),
    settings: el('menu-settings'),
    pause: el('menu-pause'),
    results: el('menu-results'),
  };

  readonly look: PlayerLook = loadLook();
  mode: RaceMode = 'race';
  private paintGarage: () => void = () => {};

  constructor(
    handlers: MenuHandlers,
    private readonly profiles: RacerProfile[],
  ) {
    const on = (id: string, fn: () => void) => {
      el(id).addEventListener('click', () => {
        handlers.sound('click');
        fn();
      });
    };
    on('btn-play', () => {
      this.renderModes();
      this.show('modes');
    });
    on('btn-podium-menu', () => handlers.toMenu());
    on('btn-fame', () => {
      this.renderFame(TRACKS[0].id);
      this.show('fame');
    });
    el('mode-list')
      .querySelectorAll<HTMLElement>('.mode-card')
      .forEach((card) => {
        card.addEventListener('click', () => {
          handlers.sound('click');
          const mode = card.dataset.mode as RaceMode;
          this.mode = mode;
          if (mode === 'gp') handlers.startGp();
          else if (mode === 'tutorial') handlers.startTutorial();
          else {
            this.renderTracks();
            this.show('tracks');
          }
        });
        card.addEventListener('pointerenter', () => handlers.sound('hover'));
      });
    const diff = el('set-difficulty');
    const paintDiff = () => diff.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === this.settings.difficulty));
    diff.querySelectorAll<HTMLElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        this.settings.difficulty = Number(b.dataset.d);
        paintDiff();
        handlers.sound('click');
        write(SETTINGS_KEY, this.settings);
        handlers.settingsChanged(this.settings);
      }),
    );
    paintDiff();
    on('btn-garage', () => {
      this.paintGarage();
      this.show('garage');
    });
    on('btn-next', () => handlers.nextTrack());
    on('btn-how', () => this.open('how'));
    on('btn-settings', () => this.open('settings'));
    on('btn-resume', () => handlers.resume());
    on('btn-restart', () => handlers.restart());
    on('btn-pause-settings', () => this.open('settings'));
    on('btn-pause-menu', () => handlers.toMenu());
    on('btn-again', () => handlers.restart());
    on('btn-results-menu', () => handlers.toMenu());
    document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) =>
      b.addEventListener('click', () => {
        handlers.sound('click');
        this.show(this.current === 'tracks' ? 'modes' : this.current === 'garage' || this.current === 'modes' || this.current === 'fame' ? 'main' : this.back);
      }),
    );
    this.buildTracks(handlers);
    this.buildGarage(handlers);
    document.querySelectorAll<HTMLElement>('.btn').forEach((b) => b.addEventListener('pointerenter', () => handlers.sound('hover')));

    const music = el<HTMLInputElement>('set-music');
    const sfx = el<HTMLInputElement>('set-sfx');
    const shake = el<HTMLInputElement>('set-shake');
    music.value = String(Math.round(this.settings.music * 100));
    sfx.value = String(Math.round(this.settings.sfx * 100));
    shake.checked = this.settings.shake;
    const commit = () => {
      write(SETTINGS_KEY, this.settings);
      handlers.settingsChanged(this.settings);
    };
    music.addEventListener('input', () => {
      this.settings.music = Number(music.value) / 100;
      commit();
    });
    sfx.addEventListener('input', () => {
      this.settings.sfx = Number(sfx.value) / 100;
      commit();
    });
    sfx.addEventListener('change', () => handlers.sound('click'));
    shake.addEventListener('change', () => {
      this.settings.shake = shake.checked;
      commit();
    });
    const seg = el('set-quality');
    const paintSeg = () => seg.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.q) === this.settings.quality));
    seg.querySelectorAll<HTMLElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        this.settings.quality = Number(b.dataset.q);
        paintSeg();
        handlers.sound('click');
        commit();
      }),
    );
    paintSeg();
    const items = el<HTMLInputElement>('set-items');
    items.checked = this.settings.items;
    items.addEventListener('change', () => {
      this.settings.items = items.checked;
      commit();
    });
    const auto = el<HTMLInputElement>('set-auto');
    auto.checked = this.settings.autoQuality;
    auto.addEventListener('change', () => {
      this.settings.autoQuality = auto.checked;
      commit();
    });
  }

  private buildTracks(handlers: MenuHandlers): void {
    const list = el('track-list');
    for (const def of TRACKS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'track-card';
      card.dataset.track = def.id;
      const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
      card.style.setProperty('--sky', hex(def.theme.skyTop));
      card.style.setProperty('--hor', hex(def.theme.skyHorizon));
      card.style.setProperty('--ground', hex(def.theme.farA));
      const num = TRACKS.indexOf(def) + 1;
      card.innerHTML = `<span class="track-art"><i></i><span class="track-num">${num}</span><span class="track-lock">LOCKED</span></span><b></b><span class="track-blurb"></span><span class="track-meta"><span>${def.laps} laps</span><span class="track-best"></span></span>`;
      (card.querySelector('b') as HTMLElement).textContent = def.name;
      (card.querySelector('.track-blurb') as HTMLElement).textContent = def.blurb;
      card.addEventListener('click', () => {
        if (card.classList.contains('locked')) return;
        handlers.sound('click');
        handlers.chooseTrack(def.id, this.mode);
      });
      card.addEventListener('pointerenter', () => handlers.sound('hover'));
      list.appendChild(card);
    }
  }

  private renderTracks(): void {
    el('track-list')
      .querySelectorAll<HTMLElement>('.track-card')
      .forEach((card) => {
        const id = card.dataset.track ?? '';
        const open = loadUnlocked().has(id);
        card.classList.toggle('locked', !open);
        card.setAttribute('aria-disabled', String(!open));
        const best = loadBest(id);
        const prev = TRACKS[TRACKS.findIndex((d) => d.id === id) - 1];
        const meta = card.querySelector('.track-best') as HTMLElement;
        if (this.mode === 'tt' && open) {
          const medal = loadMedals()[id] ?? 0;
          const ghost = loadGhost(id);
          const gold = MEDAL_TIMES[id]?.[0];
          meta.textContent = medal ? `${['', '🥉', '🥈', '🥇'][medal]} ${ghost ? formatTime(ghost.time) : MEDAL_NAMES[medal]}` : gold ? `Gold ${formatTime(gold)}` : 'No time yet';
        } else {
          meta.textContent = !open && prev ? `Top 3 on ${prev.name}` : best ? `Best ${formatTime(best)}` : 'No time yet';
        }
      });
    el('tracks-title').textContent = this.mode === 'tt' ? 'Time Trial' : this.mode === 'duo' ? '2 Players' : 'Choose a Track';
  }

  private renderFame(trackId: string): void {
    const tabs = el('fame-tabs');
    if (!tabs.childElementCount) {
      for (const d of TRACKS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.v = d.id;
        b.textContent = d.name;
        b.addEventListener('click', () => this.renderFame(d.id));
        tabs.appendChild(b);
      }
    }
    tabs.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === trackId));
    const list = el('fame-list');
    list.replaceChildren();
    const rows = loadFame(trackId);
    const modeNames: Record<string, string> = { race: 'Race', gp: 'Grand Prix', tt: 'Time Trial', duo: '2 Players' };
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      const place = document.createElement('b');
      place.textContent = `${i + 1}${ordinal(i + 1)}`;
      const name = document.createElement('span');
      name.textContent = r.name;
      const meta = document.createElement('em');
      meta.textContent = `${modeNames[r.mode] ?? r.mode} · ${r.date}`;
      const time = document.createElement('b');
      time.textContent = formatTime(r.time);
      li.append(place, name, meta, time);
      list.appendChild(li);
    });
    if (!rows.length) {
      const li = document.createElement('li');
      li.textContent = 'No finishes yet — go set a time!';
      list.appendChild(li);
    }
  }

  private renderModes(): void {
    const medals = Object.values(loadMedals()).filter((m) => m === 3).length;
    el('tt-badge').textContent = medals ? `🥇 ${medals}` : '';
    const trophies = loadTrophies();
    const best = Math.min(...Object.values(trophies), 99);
    el('gp-badge').textContent = best <= 3 ? `🏆 ${best}${ordinal(best)}` : '';
    el('tut-badge').textContent = tutorialDone() ? '' : 'START HERE';
    // First time ever: the tutorial is the obvious choice.
    el('mode-list')
      .querySelectorAll<HTMLElement>('.mode-card')
      .forEach((c) => c.classList.toggle('btn-primary', c.dataset.mode === (tutorialDone() ? 'race' : 'tutorial')));
  }

  private buildGarage(handlers: MenuHandlers): void {
    const look = this.look;
    const commit = () => {
      look.shellDark = shellDarkOf(look.shell);
      saveLook(look);
      handlers.lookChanged(look);
      paint();
    };
    const swatches = (id: string, colors: number[], key: 'shell' | 'skin') => {
      const box = el(id);
      for (const c of colors) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.dataset.c = String(c);
        b.style.background = `#${c.toString(16).padStart(6, '0')}`;
        b.setAttribute('aria-label', `Colour #${c.toString(16)}`);
        b.addEventListener('click', () => {
          look[key] = c;
          handlers.sound('click');
          commit();
        });
        box.appendChild(b);
      }
    };
    const note = el('garage-note');
    const choices = <T extends string>(id: string, opts: [T, string][], key: 'pattern' | 'hat' | 'trail') => {
      const box = el(id);
      for (const [value, label] of opts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.v = value;
        b.dataset.label = label;
        b.textContent = label;
        const unlock = cosmeticFor(key, value);
        const explain = () => {
          note.textContent = b.classList.contains('locked') && unlock ? `🔒 ${label}: ${unlock.how}` : '';
        };
        b.addEventListener('pointerenter', explain);
        b.addEventListener('focus', explain);
        b.addEventListener('click', () => {
          if (b.classList.contains('locked')) {
            explain();
            return;
          }
          (look[key] as string) = value;
          handlers.sound('click');
          commit();
        });
        box.appendChild(b);
      }
    };
    swatches('garage-shell', SHELL_COLORS, 'shell');
    swatches('garage-skin', SKIN_COLORS, 'skin');
    choices('garage-pattern', PATTERNS, 'pattern');
    choices('garage-hat', HATS, 'hat');
    choices('garage-trail', TRAIL_CHOICES, 'trail');
    const name = el<HTMLInputElement>('garage-name');
    name.value = look.name;
    name.addEventListener('input', () => {
      look.name = name.value.replace(/[^\p{L}\p{N} _.!-]/gu, '').slice(0, 12) || 'You';
      saveLook(look);
      handlers.lookChanged(look);
    });
    el('btn-random-look').addEventListener('click', () => {
      const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
      look.shell = pick(SHELL_COLORS);
      look.skin = pick(SKIN_COLORS);
      const earned = earnedCosmetics();
      const open = <T extends string>(kind: 'hat' | 'pattern' | 'trail', list: [T, string][]) => list.filter(([v]) => {
        const c = cosmeticFor(kind, v);
        return !c || earned.has(c.id);
      });
      look.pattern = pick(open('pattern', PATTERNS))[0];
      look.hat = pick(open('hat', HATS))[0];
      handlers.sound('click');
      commit();
    });
    const paint = () => {
      el('garage-shell').querySelectorAll<HTMLElement>('.swatch').forEach((b) => b.classList.toggle('on', Number(b.dataset.c) === look.shell));
      el('garage-skin').querySelectorAll<HTMLElement>('.swatch').forEach((b) => b.classList.toggle('on', Number(b.dataset.c) === look.skin));
      el('garage-pattern').querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === look.pattern));
      el('garage-hat').querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === look.hat));
      el('garage-trail').querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === look.trail));
    };
    this.paintGarage = () => {
      const earned = earnedCosmetics();
      for (const [id, kind] of [['garage-pattern', 'pattern'], ['garage-hat', 'hat'], ['garage-trail', 'trail']] as const) {
        el(id)
          .querySelectorAll<HTMLButtonElement>('button')
          .forEach((b) => {
            const c = cosmeticFor(kind, b.dataset.v ?? '');
            const locked = !!c && !earned.has(c.id);
            b.classList.toggle('locked', locked);
            b.textContent = locked ? `🔒 ${b.dataset.label}` : (b.dataset.label ?? '');
            b.title = locked && c ? c.how : '';
          });
      }
      // A cosmetic chosen earlier but no longer earned (e.g. cleared storage) falls back to the default.
      const check = (kind: 'hat' | 'pattern' | 'trail', fallback: string) => {
        const c = cosmeticFor(kind, look[kind] as string);
        if (c && !earned.has(c.id)) (look[kind] as string) = fallback;
      };
      check('hat', 'none');
      check('pattern', 'stripes');
      check('trail', 'lime');
      const s = loadStats();
      el('garage-stats').textContent = `Races ${s.races} · Wins ${s.wins} · Podiums ${s.podiums} · Tricks ${s.tricks} · ${(s.distance / 1000).toFixed(1)} km rolled`;
      note.textContent = '';
      paint();
    };
    this.paintGarage();
  }

  private open(screen: Screen): void {
    this.back = this.current === 'pause' ? 'pause' : 'main';
    this.show(screen);
  }

  /** Escape on a sub-screen goes back; returns true if it was handled. */
  escape(): boolean {
    if (this.current === 'how' || this.current === 'settings') {
      this.show(this.back);
      return true;
    }
    if (this.current === 'tracks') {
      this.show('modes');
      return true;
    }
    if (this.current === 'garage' || this.current === 'modes' || this.current === 'fame') {
      this.show('main');
      return true;
    }
    return false;
  }

  show(screen: Screen): void {
    this.current = screen;
    for (const [name, node] of Object.entries(this.screens)) node.classList.toggle('hidden', name !== screen);
    if (screen !== 'none') {
      const focus = this.screens[screen].querySelector<HTMLElement>('.btn-primary');
      focus?.focus({ preventScroll: true });
    }
  }

  setBest(trackName: string, time: number | null): void {
    el('menu-best').textContent = time ? `${trackName} best: ${formatTime(time)}` : '';
  }

  showResults(data: ResultsData): void {
    el('results-place').textContent = data.mode === 'duo' && data.p2Place ? `${data.place}${ordinal(data.place)} · ${data.p2Place}${ordinal(data.p2Place)}` : `${data.place}${ordinal(data.place)}`;
    const kicker = el('results-kicker');
    kicker.textContent = data.newBest ? 'New personal best!' : data.place === 1 ? `You won ${data.trackName}!` : data.place <= 3 ? 'On the podium!' : 'Race complete';
    kicker.classList.toggle('best', data.newBest);
    const gp = data.gp;
    el('btn-next').classList.toggle('hidden', gp ? false : !data.hasNext || data.mode === 'tutorial');
    el('btn-next').textContent = gp ? (gp.last ? 'SEE THE PODIUM' : 'NEXT RACE') : 'NEXT TRACK';
    el('btn-again').classList.toggle('hidden', !!gp);
    el('btn-again').textContent = data.mode === 'tt' ? 'TRY AGAIN' : data.mode === 'tutorial' ? 'PRACTICE AGAIN' : 'RACE AGAIN';
    el('btn-again').classList.toggle('btn-primary', !gp);
    el('btn-next').classList.toggle('btn-primary', !!gp);
    if (data.mode === 'tt') {
      kicker.textContent = data.newBest ? 'New personal best!' : 'Time trial complete';
    } else if (data.mode === 'tutorial') {
      kicker.textContent = 'Tutorial complete — you are ready to race!';
    } else if (data.mode === 'duo' && data.p2Place) {
      kicker.textContent = data.place < data.p2Place ? 'Player 1 wins the duel!' : 'Player 2 wins the duel!';
    } else if (gp) {
      kicker.textContent = `Grand Prix · race ${gp.race} of ${gp.of}`;
    }
    const medal = el('results-medal');
    medal.classList.toggle('hidden', !data.medal);
    if (data.medal) {
      const m = data.medal;
      medal.className = `results-medal m${m.medal}`;
      medal.textContent =
        (m.medal ? `${['', '🥉', '🥈', '🥇'][m.medal]} ${MEDAL_NAMES[m.medal]} medal${m.improved ? '!' : ''}` : 'No medal yet') +
        (m.nextTarget ? ` · next: ${formatTime(m.nextTarget)}` : '') +
        (m.ghostSaved ? ' · ghost saved' : '');
    }
    const table = el('gp-table');
    table.classList.toggle('hidden', !gp);
    if (gp) this.fillGpTable(table, gp.rows);
    const laps = el('results-laps');
    laps.replaceChildren();
    const bestLap = Math.min(...data.lapTimes);
    data.lapTimes.forEach((lt, i) => {
      const span = document.createElement('span');
      span.textContent = `Lap ${i + 1} ${formatTime(lt)}`;
      if (lt === bestLap && data.lapTimes.length > 1) span.className = 'best';
      laps.appendChild(span);
    });
    const unlock = el('results-unlock');
    const news = [data.unlocked ? `New track: ${data.unlocked}!` : '', ...data.cosmetics.map((c) => `Unlocked: ${c}!`), data.fameRank ? `Hall of Fame #${data.fameRank}` : ''].filter(Boolean);
    const reward = el<HTMLButtonElement>('btn-reward');
    reward.classList.toggle('hidden', !data.rewardAvailable || !!data.gp);
    reward.disabled = false;
    reward.textContent = '🍄 TURBO START — watch an ad';
    unlock.classList.toggle('hidden', news.length === 0);
    unlock.textContent = news.join('  ·  ');
    el('results-time').textContent = formatTime(data.time);
    el('results-best').textContent = data.best ? formatTime(data.best) : '–';
    el('results-speed').textContent = `${Math.round(data.topSpeedKmh)} km/h`;
    el('results-tricks').textContent = data.tricks ? `${data.tricks} · ${data.trickScore} pts` : '0';
    const list = el('results-list');
    list.replaceChildren();
    data.rows.forEach((row, i) => {
      const p = this.profiles[row.racer];
      const li = document.createElement('li');
      if (row.racer === 0 || (data.mode === 'duo' && row.racer === 1)) li.className = 'me';
      const place = document.createElement('b');
      place.textContent = `${i + 1}${ordinal(i + 1)}`;
      const dot = document.createElement('i');
      dot.style.background = `#${p.shell.toString(16).padStart(6, '0')}`;
      const name = document.createElement('span');
      name.textContent = p.name;
      const time = document.createElement('em');
      time.textContent = row.time !== null ? formatTime(row.time) : 'still racing';
      li.append(place, dot, name, time);
      list.appendChild(li);
    });
    this.show('results');
  }

  private fillGpTable(table: HTMLElement, rows: { racer: number; points: number; gained?: number }[]): void {
    table.replaceChildren();
    rows.forEach((row, i) => {
      const p = this.profiles[row.racer];
      const li = document.createElement('li');
      if (row.racer === 0) li.className = 'me';
      const place = document.createElement('b');
      place.textContent = `${i + 1}${ordinal(i + 1)}`;
      const name = document.createElement('span');
      const dot = document.createElement('i');
      dot.style.background = `#${p.shell.toString(16).padStart(6, '0')}`;
      name.append(dot, p.name);
      const gained = document.createElement('em');
      gained.textContent = row.gained ? `+${row.gained}` : '';
      const pts = document.createElement('b');
      pts.textContent = `${row.points} pts`;
      li.append(place, name, gained, pts);
      table.appendChild(li);
    });
  }

  showPodium(data: PodiumData): void {
    const diff = ['Easy', 'Normal', 'Hard'][data.difficulty] ?? 'Normal';
    el('podium-kicker').textContent = `Garden Cup · ${diff}` + (data.cosmetics.length ? ` · Unlocked: ${data.cosmetics.join(', ')}!` : '');
    el('podium-title').textContent = data.place === 1 ? 'You won the cup!' : data.place <= 3 ? `${data.place}${ordinal(data.place)} in the cup!` : 'Cup complete';
    const podium = el('podium');
    podium.replaceChildren();
    // Display order: 2nd, 1st, 3rd.
    for (const k of [1, 0, 2]) {
      const row = data.rows[k];
      if (!row) continue;
      const p = this.profiles[row.racer];
      const step = document.createElement('div');
      step.className = `step p${k + 1}${row.racer === 0 ? ' me' : ''}`;
      const snail = document.createElement('span');
      snail.className = 'snail';
      snail.style.background = `#${p.shell.toString(16).padStart(6, '0')}`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${p.name} · ${row.points}`;
      const block = document.createElement('span');
      block.className = 'block';
      block.textContent = String(k + 1);
      step.append(snail, name, block);
      podium.appendChild(step);
    }
    this.fillGpTable(el('podium-table'), data.rows);
    this.show('podium');
  }
}
