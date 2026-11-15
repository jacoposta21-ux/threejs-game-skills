import type { ItemKind, RacerBody } from '../physics/RacerBody';
import { ITEM_NAMES } from '../racing/Items';
import { ordinal } from './Hud';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** Compact HUD for player two in split-screen. */
export class Hud2 {
  private readonly root = $('hud2');
  private readonly pos = $('h2-pos');
  private readonly suffix = $('h2-suffix');
  private readonly lap = $('h2-lap');
  private readonly laps = $('h2-laps');
  private readonly speed = $('h2-speed');
  private readonly item = $('h2-item');
  private readonly boost = $('h2-boost');
  private readonly toastEl = $('h2-toast');
  private toastTimer = 0;
  private last = '';

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastTimer = 1.6;
  }

  update(dt: number, r: RacerBody, rank: number, lap: number, laps: number, kmh: number): void {
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toastEl.classList.remove('on');
    const item: ItemKind | null = r.item;
    const key = `${rank}|${lap}|${laps}|${Math.round(kmh)}|${item}|${r.itemRoulette > 0}|${Math.round(r.boost * 20)}|${r.finished}`;
    if (key === this.last) return;
    this.last = key;
    this.pos.textContent = String(rank);
    this.suffix.textContent = ordinal(rank);
    this.lap.textContent = String(lap);
    this.laps.textContent = String(laps);
    this.speed.textContent = String(Math.round(kmh));
    this.item.textContent = r.finished ? 'FINISHED' : r.itemRoulette > 0 ? '…' : item ? ITEM_NAMES[item] : '';
    this.boost.style.width = `${Math.round(Math.min(1, r.boost) * 100)}%`;
  }
}
