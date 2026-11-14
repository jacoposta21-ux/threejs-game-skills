import type { RacerProfile } from '../ai/SnailAI';
import type { HatKind, ShellPattern, SnailLook } from '../characters/SnailModel';
import { TRACKS } from '../world/tracks';
import { formatTime, ordinal } from './Hud';

export interface Settings {
  music: number;
  sfx: number;
  quality: number;
  shake: boolean;
  items: boolean;
}

export interface PlayerLook extends SnailLook {
  name: string;
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
  return read<Settings>(SETTINGS_KEY, { music: 0.6, sfx: 0.8, quality: 2, shake: true, items: true });
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
];
const HATS: [HatKind, string][] = [
  ['none', 'None'],
  ['crown', 'Crown'],
  ['cap', 'Cap'],
  ['flower', 'Flower'],
  ['propeller', 'Propeller'],
  ['party', 'Party'],
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
  const look = read<PlayerLook>(LOOK_KEY, { name: 'You', shell: 0xff7a2f, shellDark: 0xb8431a, skin: 0xf2c45a, pattern: 'stripes', hat: 'none' });
  look.name = (look.name || 'You').slice(0, 12);
  look.shellDark = shellDarkOf(look.shell);
  return look;
}

export function saveLook(look: PlayerLook): void {
  write(LOOK_KEY, look);
}

export function loadRaceCount(): number {
  return read<{ n: number }>(RACES_KEY, { n: 0 }).n;
}

export function saveRaceCount(n: number): void {
  write(RACES_KEY, { n });
}

export type Screen = 'none' | 'main' | 'tracks' | 'garage' | 'how' | 'settings' | 'pause' | 'results';

export interface MenuHandlers {
  chooseTrack(id: string): void;
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
    tracks: el('menu-tracks'),
    garage: el('menu-garage'),
    how: el('menu-how'),
    settings: el('menu-settings'),
    pause: el('menu-pause'),
    results: el('menu-results'),
  };

  readonly look: PlayerLook = loadLook();

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
      this.renderTracks();
      this.show('tracks');
    });
    on('btn-garage', () => this.show('garage'));
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
        this.show(this.current === 'tracks' || this.current === 'garage' ? 'main' : this.back);
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
      const len = Math.round(def.finishS - def.startS);
      card.innerHTML = `<span class="track-art"><i></i></span><b></b><span class="track-blurb"></span><span class="track-meta"><span>${len} m</span><span class="track-best"></span></span>`;
      (card.querySelector('b') as HTMLElement).textContent = def.name;
      (card.querySelector('.track-blurb') as HTMLElement).textContent = def.blurb;
      card.addEventListener('click', () => {
        handlers.sound('click');
        handlers.chooseTrack(def.id);
      });
      card.addEventListener('pointerenter', () => handlers.sound('hover'));
      list.appendChild(card);
    }
  }

  private renderTracks(): void {
    el('track-list')
      .querySelectorAll<HTMLElement>('.track-card')
      .forEach((card) => {
        const best = loadBest(card.dataset.track ?? '');
        (card.querySelector('.track-best') as HTMLElement).textContent = best ? `Best ${formatTime(best)}` : 'No time yet';
      });
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
    const choices = <T extends string>(id: string, opts: [T, string][], key: 'pattern' | 'hat') => {
      const box = el(id);
      for (const [value, label] of opts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.v = value;
        b.textContent = label;
        b.addEventListener('click', () => {
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
      look.pattern = pick(PATTERNS)[0];
      look.hat = pick(HATS)[0];
      handlers.sound('click');
      commit();
    });
    const paint = () => {
      el('garage-shell').querySelectorAll<HTMLElement>('.swatch').forEach((b) => b.classList.toggle('on', Number(b.dataset.c) === look.shell));
      el('garage-skin').querySelectorAll<HTMLElement>('.swatch').forEach((b) => b.classList.toggle('on', Number(b.dataset.c) === look.skin));
      el('garage-pattern').querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === look.pattern));
      el('garage-hat').querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === look.hat));
    };
    paint();
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
    if (this.current === 'tracks' || this.current === 'garage') {
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
    el('results-place').textContent = `${data.place}${ordinal(data.place)}`;
    const kicker = el('results-kicker');
    kicker.textContent = data.newBest ? 'New personal best!' : data.place === 1 ? `You won ${data.trackName}!` : data.place <= 3 ? 'On the podium!' : 'Race complete';
    kicker.classList.toggle('best', data.newBest);
    el('btn-next').classList.toggle('hidden', !data.hasNext);
    el('results-time').textContent = formatTime(data.time);
    el('results-best').textContent = data.best ? formatTime(data.best) : '–';
    el('results-speed').textContent = `${Math.round(data.topSpeedKmh)} km/h`;
    el('results-tricks').textContent = data.tricks ? `${data.tricks} · ${data.trickScore} pts` : '0';
    const list = el('results-list');
    list.replaceChildren();
    data.rows.forEach((row, i) => {
      const p = this.profiles[row.racer];
      const li = document.createElement('li');
      if (row.racer === 0) li.className = 'me';
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
}
