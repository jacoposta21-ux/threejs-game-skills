export interface SaveData {
  version: 1;
  unlocked: number; // highest level index unlocked (0-based)
  level: number; // level in progress
  checkpoint: number; // checkpoint index inside level (-1 = start)
  lore: string[]; // collected lore ids
  deaths: number;
  completed: boolean;
  settings: { music: number; sfx: number; quality: 'high' | 'low'; shake: boolean };
}

const KEY = 'beyond-the-hollow-save-v1';

const fresh = (): SaveData => ({
  version: 1,
  unlocked: 0,
  level: 0,
  checkpoint: -1,
  lore: [],
  deaths: 0,
  completed: false,
  settings: { music: 0.7, sfx: 0.85, quality: 'high', shake: true },
});

let data: SaveData = fresh();

export const Save = {
  load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = { ...fresh(), ...parsed, settings: { ...fresh().settings, ...(parsed.settings || {}) } };
      }
    } catch {
      data = fresh();
    }
    return data;
  },
  get data() {
    return data;
  },
  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable (private mode / sandboxed iframe) — play continues */
    }
  },
  hasProgress() {
    return data.level > 0 || data.checkpoint >= 0 || data.unlocked > 0;
  },
  newGame() {
    const s = data.settings;
    data = fresh();
    data.settings = s;
    this.write();
  },
  setCheckpoint(level: number, cp: number) {
    data.level = level;
    data.checkpoint = cp;
    this.write();
  },
  completeLevel(level: number) {
    data.unlocked = Math.max(data.unlocked, level + 1);
    data.level = level + 1;
    data.checkpoint = -1;
    this.write();
  },
  addLore(id: string) {
    if (!data.lore.includes(id)) {
      data.lore.push(id);
      this.write();
      return true;
    }
    return false;
  },
};
