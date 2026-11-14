import type { RacerProfile } from '../ai/SnailAI';
import { formatTime, ordinal } from './Hud';

export interface Settings {
  music: number;
  sfx: number;
  quality: number;
  shake: boolean;
}

const SETTINGS_KEY = 'tooslow.settings.v1';
const BEST_KEY = 'tooslow.best.backyard.v1';
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
  return read<Settings>(SETTINGS_KEY, { music: 0.6, sfx: 0.8, quality: 2, shake: true });
}

export function loadBest(): number | null {
  const v = read<{ time: number | null }>(BEST_KEY, { time: null }).time;
  return typeof v === 'number' && v > 0 ? v : null;
}

export function saveBest(time: number): void {
  write(BEST_KEY, { time });
}

export function loadRaceCount(): number {
  return read<{ n: number }>(RACES_KEY, { n: 0 }).n;
}

export function saveRaceCount(n: number): void {
  write(RACES_KEY, { n });
}

export type Screen = 'none' | 'main' | 'how' | 'settings' | 'pause' | 'results';

export interface MenuHandlers {
  play(): void;
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
    how: el('menu-how'),
    settings: el('menu-settings'),
    pause: el('menu-pause'),
    results: el('menu-results'),
  };

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
    on('btn-play', () => handlers.play());
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
        this.show(this.back);
      }),
    );
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
    this.setBest(loadBest());
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

  setBest(time: number | null): void {
    el('menu-best').textContent = time ? `Backyard best: ${formatTime(time)}` : '';
  }

  showResults(data: ResultsData): void {
    el('results-place').textContent = `${data.place}${ordinal(data.place)}`;
    const kicker = el('results-kicker');
    kicker.textContent = data.newBest ? 'New personal best!' : data.place === 1 ? 'You won the Backyard!' : data.place <= 3 ? 'On the podium!' : 'Race complete';
    kicker.classList.toggle('best', data.newBest);
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
