import { CONFIG } from '../core/Config';
import type { BuildingData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon } from './dom';
import type { IconName } from './Icons';
import { STAGE_NAMES } from '../culture/SacredSystem';
import { CONFIG as C } from '../core/Config';

const BUILDING_INFO: Record<BuildingData['type'], { name: string; role: string }> = {
  house: { name: 'House', role: 'Villagers sleep here at night. Each house shelters 4.' },
  well: { name: 'Village Well', role: 'Drinking water. Refills slowly; rain fills it fast.' },
  farm: { name: 'Farm', role: 'Grows food. Needs moist soil, hates floods.' },
  storage: { name: 'Storehouse', role: 'Holds the village food and wood.' },
  shrine: { name: 'Shrine', role: 'Where villagers come to pray to you.' },
  quarry: { name: 'Quarry', role: 'Miners cut stone here. Stone builds shrines, monuments and trade deals.' },
  fishery: { name: 'Fishery', role: 'Fishers dry the catch here. Food that does not care about the weather.' },
};

/** Village stats card opened by clicking a building in Look mode. */
export class VillageInspector {
  private readonly root = $('#inspector');
  private villageId: string | null = null;
  private sacredId: string | null = null;
  private buildingId: number | null = null;
  private timer = 0;
  onClose: () => void = () => {};

  get open(): boolean {
    return this.villageId !== null || this.sacredId !== null;
  }

  /** Sacred object card: stage, sacredness, religion, decorations and what comes next. */
  showSacred(sim: Simulation, sacredId: string): void {
    this.villageId = null;
    this.sacredId = sacredId;
    this.root.classList.remove('hidden');
    this.renderSacred(sim);
  }

  private renderSacred(sim: Simulation): void {
    const s = sim.state.sacred.find((x) => x.id === this.sacredId);
    if (!s) return this.hide();
    const r = s.religionId ? sim.state.religions.find((x) => x.id === s.religionId) : undefined;
    const t = C.culture.stageThresholds;
    const next =
      s.stage < 2 ? `Gathering place at sacredness ${t[0]}`
        : s.stage < 3 ? `Decorations begin at sacredness ${t[1]}`
          : s.stage < 4 ? `Shrine construction at sacredness ${t[2]}`
            : s.shrineProgress < 1 ? `Shrine ${Math.round(s.shrineProgress * 100)}% built (needs wood)`
              : s.stage < 5 ? `Monument at sacredness ${t[3]}`
                : s.monumentProgress < 1 ? `Monument ${Math.round(s.monumentProgress * 100)}% built (needs wood)` : 'Complete. A landmark of your mistakes.';
    const followers = r ? r.followers.length : 0;
    const color = r ? `#${r.color.toString(16).padStart(6, '0')}` : '#f2c14e';
    this.root.innerHTML = `
      <div class="insp-head">
        <div><h3>${escapeHtml(s.label)}</h3><small>${icon('temple')} ${STAGE_NAMES[s.stage]} · Sacred ${s.kind}</small></div>
        <button class="insp-close" type="button" aria-label="Close">${icon('close')}</button>
      </div>
      <div class="stage-track">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= s.stage ? 'on' : ''}" title="${STAGE_NAMES[n]}">${n}</span>`).join('')}</div>
      <div class="stat-grid">
        ${this.stat('Sacred', 'faith', Math.min(s.sacredness, 10), 10, s.sacredness.toFixed(1), false)}
        ${this.stat('Décor', 'temple', s.decorations, C.culture.maxDecorations, String(s.decorations), false)}
        ${this.stat('Visits', 'people', Math.min(s.visits, 40), 40, String(s.visits), false)}
        ${this.stat('Faithful', 'heart', followers, Math.max(1, sim.state.villagers.length), String(followers), false)}
      </div>
      <div class="insp-building" style="border-left:5px solid ${color}"><b>${r ? escapeHtml(r.name) : 'No active faith'}</b><br><span style="opacity:.8">${r ? escapeHtml(r.doctrine[0]) : 'Remembered, but nobody worships here right now.'}</span></div>
      <ul class="problems"><li class="ok">${escapeHtml(next)}</li></ul>`;
    this.root.querySelector('.insp-close')?.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
  }

  show(sim: Simulation, villageId: string, buildingId: number | null): void {
    this.sacredId = null;
    this.villageId = villageId;
    this.buildingId = buildingId;
    this.root.classList.remove('hidden');
    this.render(sim);
  }

  hide(): void {
    this.villageId = null;
    this.sacredId = null;
    this.buildingId = null;
    this.root.classList.add('hidden');
  }

  update(sim: Simulation, dt: number): void {
    if (!this.open) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    if (this.sacredId) this.renderSacred(sim);
    else this.render(sim);
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
