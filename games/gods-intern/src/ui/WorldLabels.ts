import * as THREE from 'three';
import type { VillagerData } from '../core/types';
import { $, el, escapeHtml } from './dom';

interface Anchored {
  node: HTMLElement;
  world: THREE.Vector3;
  follow?: () => THREE.Vector3 | null;
  until: number;
  speech?: boolean;
  priority?: number;
}

export interface PinData {
  id: string;
  label: string;
  stage: number;
  x: number;
  y: number;
  z: number;
  color: number;
}

const MAX_SPEECH = 3;
const SPEECH_MAX_DISTANCE = 120;

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
  'pray-sacred': 'Worshipping at a sacred place',
  ritual: 'Performing a ritual',
  decorate: 'Decorating something sacred',
  construct: 'Building a shrine',
  'construct-office': 'Building the Department of Miracles',
  picnic: 'On the Eternal Picnic',
  argue: 'Arguing about theology',
  investigate: 'Investigating something odd',
  queue: 'Queueing to file a prayer',
  trial: 'Sitting on the cloud jury',
  festival: 'Celebrating a festival',
};
const JOB_LABEL: Record<string, string> = { farmer: 'Farmer', woodcutter: 'Woodcutter', builder: 'Builder', idler: 'Professional Idler' };

/** HTML elements anchored to 3D positions: speech bubbles, floating numbers, hover tips. */
export class WorldLabels {
  private readonly root = $('#world-labels');
  private readonly tip = $('#villager-tip');
  private readonly items: Anchored[] = [];
  private readonly v = new THREE.Vector3();
  private tipVillager: VillagerData | null = null;
  /** Resolves a villager's religion name for the hover tip (injected by the game). */
  faithLine: ((v: VillagerData) => string) | null = null;

  private readonly pins = new Map<string, HTMLElement>();
  onPinClick: (id: string) => void = () => {};

  speech(text: string, follow: () => THREE.Vector3 | null, seconds: number, urgent = true, priority = 1): void {
    // Keep the number of pending bubbles small; drop the lowest-priority if crowded.
    const pending = this.items.filter((it) => it.speech);
    if (pending.length >= MAX_SPEECH * 2) {
      const weakest = pending.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))[0];
      if ((weakest.priority ?? 0) > priority) return;
      this.removeNode(weakest.node);
    }
    const node = el('div', `speech${urgent ? ' urgent' : ''}`, escapeHtml(text));
    this.root.append(node);
    this.items.push({ node, world: new THREE.Vector3(), follow, until: performance.now() + seconds * 1000, speech: true, priority });
  }

  /** Clickable pins above sacred places (stage ≥ 2). */
  syncPins(pins: PinData[]): void {
    const keep = new Set(pins.map((p) => p.id));
    for (const [id, node] of this.pins) {
      if (!keep.has(id)) {
        node.remove();
        this.pins.delete(id);
      }
    }
    for (const p of pins) {
      let node = this.pins.get(p.id);
      if (!node) {
        node = el('button', 'sacred-pin');
        (node as HTMLButtonElement).type = 'button';
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onPinClick(p.id);
        });
        this.root.append(node);
        this.pins.set(p.id, node);
      }
      const html = `<span class="pin-stars">${'★'.repeat(Math.max(0, p.stage - 1))}</span><span class="pin-label">${escapeHtml(p.label)}</span>`;
      if (node.dataset.html !== html) {
        node.innerHTML = html;
        node.dataset.html = html;
      }
      node.style.setProperty('--pin', `#${p.color.toString(16).padStart(6, '0')}`);
      node.dataset.x = String(p.x);
      node.dataset.y = String(p.y);
      node.dataset.z = String(p.z);
    }
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
    const traits = (v.traits ?? []).map((t) => t[0].toUpperCase() + t.slice(1)).join(' · ');
    this.tip.innerHTML = `<h4>${escapeHtml(v.name)}</h4>${v.title ? `<div class="v-title">${escapeHtml(v.title)}</div>` : ''}<div class="v-sub">${JOB_LABEL[v.job] ?? v.job} · age ${age}${traits ? ` · ${escapeHtml(traits)}` : ''}</div>
      ${this.faithLine ? `<div class="v-faith">${escapeHtml(this.faithLine(v))}</div>` : ''}
      <div style="margin:4px 0 2px;font-weight:800">${escapeHtml(doing)}</div>
      ${bar('Hunger', v.hunger, v.hunger > 0.6)}${bar('Thirst', v.thirst, v.thirst > 0.6)}${bar('Happy', v.happiness, v.happiness < 0.35)}${bar('Faith', v.faith, false)}${bar('Fear', v.fear, v.fear > 0.4)}`;
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    const now = performance.now();
    // Pins.
    for (const node of this.pins.values()) {
      this.v.set(Number(node.dataset.x), Number(node.dataset.y), Number(node.dataset.z));
      const dist = this.v.distanceTo(camera.position);
      this.v.project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05 && dist < 170;
      node.style.display = visible ? '' : 'none';
      if (visible) {
        node.style.left = `${((this.v.x + 1) / 2) * width}px`;
        node.style.top = `${((1 - this.v.y) / 2) * height}px`;
        node.classList.toggle('compact', dist > 85);
      }
    }
    // Rank speech bubbles: priority first, then closeness to the camera; show at most MAX_SPEECH.
    const speech = this.items.filter((it) => it.speech && now <= it.until);
    for (const it of speech) {
      const p = it.follow?.();
      if (p) it.world.copy(p);
    }
    speech.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.world.distanceTo(camera.position) - b.world.distanceTo(camera.position));
    const allowed = new Set(speech.filter((it) => it.world.distanceTo(camera.position) < SPEECH_MAX_DISTANCE).slice(0, MAX_SPEECH));
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
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2 && (!it.speech || allowed.has(it));
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
    for (const node of this.pins.values()) node.remove();
    this.pins.clear();
  }
}
