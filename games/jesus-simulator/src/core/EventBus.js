/**
 * Minimal typed-by-convention event bus. Gameplay actions are published as
 * namespaced events (`player:move`, `miracle:cast`, `vehicle:enter`, ...) so a
 * future network layer can subscribe to the same stream instead of reaching
 * into individual systems.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, handler) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  emit(type, payload = {}) {
    const set = this.listeners.get(type);
    if (set) for (const handler of set) handler(payload);
    const any = this.listeners.get('*');
    if (any) for (const handler of any) handler({ type, payload });
  }

  clear() {
    this.listeners.clear();
  }
}
