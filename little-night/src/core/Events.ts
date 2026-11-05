type Handler<T> = (payload: T) => void;

/** Minimal typed event bus. Gameplay emits; audio, UI and VFX listen. */
export class Emitter<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(name: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of set) (handler as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
