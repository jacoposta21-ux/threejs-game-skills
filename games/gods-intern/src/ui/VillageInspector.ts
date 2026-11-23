import { CONFIG } from '../core/Config';
import type { BuildingData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon } from './dom';
import type { IconName } from './Icons';

const BUILDING_INFO: Record<BuildingData['type'], { name: string; role: string }> = {
  house: { name: 'House', role: 'Villagers sleep here at night. Each house shelters 4.' },
  well: { name: 'Village Well', role: 'Drinking water. Refills slowly; rain fills it fast.' },
  farm: { name: 'Farm', role: 'Grows food. Needs moist soil, hates floods.' },
  storage: { name: 'Storehouse', role: 'Holds the village food and wood.' },
  shrine: { name: 'Shrine', role: 'Where villagers come to pray to you.' },
};

/** Village stats card opened by clicking a building in Look mode. */
export class VillageInspector {
  private readonly root = $('#inspector');
  private villageId: string | null = null;
  private buildingId: number | null = null;
  private timer = 0;
  onClose: () => void = () => {};

  get open(): boolean {
    return this.villageId !== null;
  }

  show(sim: Simulation, villageId: string, buildingId: number | null): void {
    this.villageId = villageId;
    this.buildingId = buildingId;
    this.root.classList.remove('hidden');
    this.render(sim);
  }

  hide(): void {
    this.villageId = null;
    this.buildingId = null;
    this.root.classList.add('hidden');
  }

  update(sim: Simulation, dt: number): void {
    if (!this.villageId) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    this.render(sim);
  }

  private stat(name: string, iconName: IconName, value: number, max: number, label: string, warn: boolean): string {
    return `<div class="stat${warn ? ' warn' : ''}">${icon(iconName)}<div><label>${name}<b>${label}</b></label><div class="bar"><i style="width:${Math.max(0, Math.min(100, (value / max) * 100))}%"></i></div></div></div>`;
  }

  private render(sim: Simulation): void {
    const v = this.villageId ? sim.village(this.villageId) : undefined;
    if (!v) return this.hide();
    const b = this.buildingId !== null ? sim.building(this.buildingId) : undefined;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const problems = v.problems.length ? v.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('') : '<li class="ok">Everything is suspiciously fine</li>';
    let buildingHtml = '';
    if (b) {
      const info = BUILDING_INFO[b.type];
      const extra =
        b.type === 'farm'
          ? ` · Crop ${pct(b.cropGrowth)} grown, ${pct(b.cropHealth)} healthy`
          : b.type === 'well'
            ? ` · Water ${Math.round(v.water)}/${CONFIG.village.maxWater}`
            : '';
      buildingHtml = `<div class="insp-building"><b>${info.name}</b> — ${b.destroyed ? 'Destroyed. Builders need 20 wood to rebuild.' : `${Math.round(b.health)}% intact`}${extra}<br><span style="opacity:.75">${info.role}</span></div>`;
    }
    this.root.innerHTML = `
      <div class="insp-head">
        <div><h3>${escapeHtml(v.name)}</h3><small>${icon('people')} ${v.population} villagers · Prosperity ${pct(v.prosperity)}</small></div>
        <button class="insp-close" type="button" aria-label="Close">${icon('close')}</button>
      </div>
      <div class="stat-grid">
        ${this.stat('Food', 'food', v.food, CONFIG.village.maxFood, String(Math.round(v.food)), v.food < 20)}
        ${this.stat('Water', 'water', v.water, CONFIG.village.maxWater, String(Math.round(v.water)), v.water < 20)}
        ${this.stat('Wood', 'wood', v.wood, CONFIG.village.maxWood, String(Math.round(v.wood)), v.wood < 10)}
        ${this.stat('Happy', 'heart', v.happiness, 1, pct(v.happiness), v.happiness < 0.4)}
        ${this.stat('Faith', 'faith', v.faith, 1, pct(v.faith), v.faith < 0.3)}
        ${this.stat('Fear', 'fear', v.fear, 1, pct(v.fear), v.fear > 0.4)}
      </div>
      <ul class="problems">${problems}</ul>
      ${buildingHtml}`;
    this.root.querySelector('.insp-close')?.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
  }
}
