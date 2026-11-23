import * as THREE from 'three';
import type { VillagerData } from '../core/types';
import { $, el, escapeHtml } from './dom';

interface Anchored {
  node: HTMLElement;
  world: THREE.Vector3;
  follow?: () => THREE.Vector3 | null;
  until: number;
}

const STATE_LABEL: Record<string, string> = {
  IDLE: 'Loitering',
  WANDERING: 'Wandering',
  WORKING: 'Working',
  SEEKING_FOOD: 'Looking for food',
  SEEKING_WATER: 'Looking for water',
  RESTING: 'Sleeping',
  FLEEING: 'RUNNING FOR THEIR LIFE',
  PRAYING: 'Praying to you',
  CELEBRATING: 'Celebrating!',
  DEAD: 'Deceased',
};
const ACTIVITY_LABEL: Record<string, string> = {
  farm: 'Tending the farm',
  chop: 'Chopping wood',
  repair: 'Repairing a building',
  'drink-well': 'Heading to the well',
  'drink-river': 'Drinking from the river',
  eat: 'Raiding the storehouse',
  forage: 'Foraging for berries',
  chat: 'Gossiping at the well',
  'pray-shrine': 'Praying at the shrine',
  'pray-sign': 'Worshipping a divine sign',
};
const JOB_LABEL: Record<string, string> = { farmer: 'Farmer', woodcutter: 'Woodcutter', builder: 'Builder', idler: 'Professional Idler' };

/** HTML elements anchored to 3D positions: speech bubbles, floating numbers, hover tips. */
export class WorldLabels {
  private readonly root = $('#world-labels');
  private readonly tip = $('#villager-tip');
  private readonly items: Anchored[] = [];
  private readonly v = new THREE.Vector3();
  private tipVillager: VillagerData | null = null;

  speech(text: string, follow: () => THREE.Vector3 | null, seconds: number, urgent = true): void {
    const node = el('div', `speech${urgent ? ' urgent' : ''}`, escapeHtml(text));
    this.root.append(node);
    this.items.push({ node, world: new THREE.Vector3(), follow, until: performance.now() + seconds * 1000 });
  }

  float(text: string, at: THREE.Vector3, kind: 'good' | 'bad' | 'water' | 'gold' = 'good'): void {
    const node = el('div', `float-text ${kind}`, escapeHtml(text));
    this.root.append(node);
    this.items.push({ node, world: at.clone(), until: performance.now() + 1600 });
  }

  marker(label: string, at: () => THREE.Vector3 | null, seconds: number): HTMLElement {
    const node = el('div', 'prayer-marker', `<span>${escapeHtml(label)}</span>`);
    this.root.append(node);
    this.items.push({ node, world: new THREE.Vector3(), follow: at, until: performance.now() + seconds * 1000 });
    return node;
  }

  removeNode(node: HTMLElement): void {
    const i = this.items.findIndex((it) => it.node === node);
    if (i >= 0) {
      this.items[i].node.remove();
      this.items.splice(i, 1);
    }
  }

  showVillagerTip(v: VillagerData | null, x: number, y: number): void {
    this.tipVillager = v;
    if (!v) {
      this.tip.classList.add('hidden');
      return;
    }
    this.tip.classList.remove('hidden');
    const w = window.innerWidth;
    this.tip.style.left = `${Math.min(x, w - 240)}px`;
    this.tip.style.top = `${Math.min(y, window.innerHeight - 170)}px`;
    this.renderTip();
  }

  renderTip(): void {
    const v = this.tipVillager;
    if (!v) return;
    const bar = (label: string, value: number, bad: boolean) =>
      `<div class="v-row"><span>${label}</span><div class="bar${bad ? ' bad' : ''}"><i style="width:${Math.round(value * 100)}%"></i></div></div>`;
    const doing = v.alive ? ACTIVITY_LABEL[v.currentTask.activity] ?? STATE_LABEL[v.currentTask.state] : `Deceased (${v.causeOfDeath ?? 'mystery'})`;
    const age = Math.floor(v.age);
    this.tip.innerHTML = `<h4>${escapeHtml(v.name)}</h4><div class="v-sub">${JOB_LABEL[v.job] ?? v.job} · age ${age}</div>
      <div style="margin:4px 0 2px;font-weight:800">${escapeHtml(doing)}</div>
      ${bar('Hunger', v.hunger, v.hunger > 0.6)}${bar('Thirst', v.thirst, v.thirst > 0.6)}${bar('Happy', v.happiness, v.happiness < 0.35)}${bar('Faith', v.faith, false)}${bar('Fear', v.fear, v.fear > 0.4)}`;
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    const now = performance.now();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (now > it.until) {
        it.node.remove();
        this.items.splice(i, 1);
        continue;
      }
      if (it.follow) {
        const p = it.follow();
        if (!p) {
          it.node.remove();
          this.items.splice(i, 1);
          continue;
        }
        it.world.copy(p);
      }
      this.v.copy(it.world).project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
      it.node.style.display = visible ? '' : 'none';
      if (visible) {
        it.node.style.left = `${((this.v.x + 1) / 2) * width}px`;
        it.node.style.top = `${((1 - this.v.y) / 2) * height}px`;
      }
    }
  }

  clear(): void {
    for (const it of this.items) it.node.remove();
    this.items.length = 0;
  }
}
