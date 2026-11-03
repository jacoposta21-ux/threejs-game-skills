// Slot-based inventory. Slots 0..HOTBAR-1 are the hotbar.
import { ITEMS } from './data/items.js';

export const HOTBAR = 5;

export class Inventory {
  constructor(size) {
    this.size = size;
    this.slots = new Array(size).fill(null); // {id, qty}
    this.selected = 0;
  }

  maxStack(id) { return (ITEMS[id] && ITEMS[id].stack) || 99; }

  // Adds items, returns how many did NOT fit.
  add(id, qty = 1) {
    const max = this.maxStack(id);
    for (const s of this.slots) {
      if (qty <= 0) break;
      if (s && s.id === id && s.qty < max) {
        const n = Math.min(qty, max - s.qty);
        s.qty += n; qty -= n;
      }
    }
    for (let i = 0; i < this.size && qty > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(qty, max);
        this.slots[i] = { id, qty: n }; qty -= n;
      }
    }
    return qty;
  }

  canFit(id, qty = 1) {
    const max = this.maxStack(id);
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += max;
      else if (s.id === id) room += max - s.qty;
      if (room >= qty) return true;
    }
    return room >= qty;
  }

  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0); }

  remove(id, qty = 1) {
    if (this.count(id) < qty) return false;
    // take from the last stacks first so the hotbar keeps its items as long as possible
    for (let i = this.size - 1; i >= 0 && qty > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const n = Math.min(qty, s.qty);
        s.qty -= n; qty -= n;
        if (s.qty <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  removeAt(i, qty = 1) {
    const s = this.slots[i];
    if (!s) return null;
    const n = Math.min(qty, s.qty);
    s.qty -= n;
    if (s.qty <= 0) this.slots[i] = null;
    return { id: s.id, qty: n };
  }

  swap(a, b) { [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]]; }

  get current() { return this.slots[this.selected] || null; }

  resize(size) {
    if (size <= this.size) return;
    this.slots.length = size;
    for (let i = this.size; i < size; i++) this.slots[i] = null;
    this.size = size;
  }

  toJSON() { return { size: this.size, sel: this.selected, slots: this.slots.map((s) => (s ? [s.id, s.qty] : null)) }; }

  static fromJSON(o) {
    const inv = new Inventory(o.size);
    inv.selected = o.sel || 0;
    o.slots.forEach((s, i) => { if (s && ITEMS[s[0]]) inv.slots[i] = { id: s[0], qty: s[1] }; });
    return inv;
  }
}
