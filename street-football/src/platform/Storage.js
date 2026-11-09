// localStorage wrapper that never throws (private mode, blocked storage, sandboxed iframes).
export class Storage {
  constructor(prefix = 'rua10:') {
    this.prefix = prefix;
    this.memory = new Map();
    this.backend = null;
  }

  /** Optional platform backend with getItem/setItem (e.g. CrazyGames SDK data module). */
  useBackend(backend) {
    this.backend = backend;
  }

  get(key) {
    const k = this.prefix + key;
    try {
      if (this.backend) {
        const v = this.backend.getItem(k);
        if (v != null) return v;
      }
    } catch {
      /* fall through */
    }
    try {
      const v = window.localStorage.getItem(k);
      if (v != null) return v;
    } catch {
      /* fall through */
    }
    return this.memory.get(k) ?? null;
  }

  set(key, value) {
    const k = this.prefix + key;
    this.memory.set(k, value);
    try {
      this.backend?.setItem(k, value);
    } catch {
      /* ignore */
    }
    try {
      window.localStorage.setItem(k, value);
    } catch {
      /* ignore */
    }
  }
}
