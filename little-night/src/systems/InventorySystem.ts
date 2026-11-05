export interface ItemDef {
  name: string;
  icon: string;
  description: string;
}

export const ITEMS: Record<string, ItemDef> = {
  'pantry-key': { name: 'Pantry key', icon: 'key', description: 'A small iron key that smells of bread.' },
  'wind-key': { name: 'Grandpa’s wind key', icon: 'windkey', description: 'A silver key with a firefly on its bow.' },
  gear: { name: 'Brass gear', icon: 'gear', description: 'A toothed wheel, heavy for its size.' },
  spring: { name: 'Coiled spring', icon: 'spring', description: 'It wants to jump out of your hand.' },
  crank: { name: 'Crank handle', icon: 'crank', description: 'A wooden knob on a bent brass arm.' },
};

/** Essential puzzle items only. */
export class InventorySystem {
  private items: string[] = [];
  onChange: () => void = () => {};

  has(id: string): boolean {
    return this.items.includes(id);
  }

  add(id: string): void {
    if (!this.items.includes(id)) this.items.push(id);
    this.onChange();
  }

  remove(id: string): void {
    this.items = this.items.filter((i) => i !== id);
    this.onChange();
  }

  list(): string[] {
    return [...this.items];
  }

  load(items: string[]): void {
    this.items = [...items];
    this.onChange();
  }
}
