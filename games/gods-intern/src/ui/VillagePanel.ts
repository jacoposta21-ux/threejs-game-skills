import { CATEGORY_LABEL } from '../civ/Relations';
import type { Simulation } from '../simulation/SimulationManager';
import type { VillageData } from '../core/types';
import { relationKey } from '../world/Settlements';
import { $, escapeHtml, icon } from './dom';

const CULTURE_LABEL = { agricultural: 'Farmers', mountain: 'Miners', riverside: 'River traders' } as const;

/**
 * Village selector + compact comparison: population, food, water, prosperity,
 * dominant religion, divine favor and emergencies for every village side by side,
 * plus the relationship between each pair and caravans on the road.
 */
export class VillagePanel {
  private readonly root = $('#villages');
  private key = '';
  onFocus: (village: VillageData) => void = () => {};
  onToggle: (open: boolean) => void = () => {};
  private sim: Simulation | null = null;

  constructor() {
    $('#btn-villages').addEventListener('click', () => this.toggle());
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.vp-close')) {
        this.close();
        return;
      }
      const go = t.closest<HTMLElement>('[data-village]');
      if (go && this.sim) {
        const v = this.sim.village(go.dataset.village!);
        if (v) this.onFocus(v);
      }
    });
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.key = '';
    this.onToggle(true);
  }

  close(): void {
    if (!this.open) return;
    this.root.classList.add('hidden');
    this.onToggle(false);
  }

  update(sim: Simulation): void {
    this.sim = sim;
    if (!this.open) return;
    const s = sim.state;
    const r = (n: number) => Math.round(n);
    const key = s.villages.map((v) => `${v.population}${r(v.food)}${r(v.water)}${r(v.wood)}${r(v.stone)}${r(v.prosperity * 100)}${v.identity.dominantReligionId}${r(sim.civ.favorSum(v.id, 1))}${r(sim.civ.favorSum(v.id, -1))}${v.problems.length}`).join('|') + `|${Object.values(s.civ.relations).map((x) => r(x.score)).join()}|${s.civ.caravans.map((c) => c.id + c.phase).join()}`;
    if (key === this.key) return;
    this.key = key;
    const cell = (label: string, html: (v: VillageData) => string) => `<tr><th>${label}</th>${s.villages.map((v) => `<td>${html(v)}</td>`).join('')}</tr>`;
    const bar = (value: number, max: number, warn: boolean, text: string) => `<div class="vp-bar ${warn ? 'warn' : ''}"><i style="width:${Math.max(0, Math.min(100, (value / max) * 100))}%"></i><span>${text}</span></div>`;
    const religion = (v: VillageData) => {
      const rel = v.identity.dominantReligionId ? s.religions.find((x) => x.id === v.identity.dominantReligionId) : undefined;
      return rel ? `<span class="vp-faith" style="--faith:#${rel.color.toString(16).padStart(6, '0')}">${escapeHtml(rel.name.replace(/^The /, ''))}</span>` : '<span class="muted">None</span>';
    };
    const favor = (v: VillageData) => {
      const pos = sim.civ.favorSum(v.id, 1);
      const neg = sim.civ.favorSum(v.id, -1);
      return `<span class="vp-favor"><b class="up">+${r(pos)}</b> <b class="down">${r(neg)}</b></span>`;
    };
    const emergencies = (v: VillageData) => (v.problems.length ? `<span class="vp-alert">${escapeHtml(v.problems[0])}${v.problems.length > 1 ? ` +${v.problems.length - 1}` : ''}</span>` : '<span class="vp-ok">All calm</span>');
    const ids = s.villages.map((v) => v.id);
    const pairs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const rec = s.civ.relations[relationKey(ids[i], ids[j])];
        if (!rec) continue;
        const a = sim.village(ids[i])!;
        const b = sim.village(ids[j])!;
        pairs.push(`<li class="rel-${rec.category}"><span>${escapeHtml(a.name)} ↔ ${escapeHtml(b.name)}</span><b>${CATEGORY_LABEL[rec.category]}</b><em>${r(rec.score)}</em><div class="rel-meter"><i style="left:${(rec.score + 100) / 2}%"></i></div></li>`);
      }
    }
    const caravans = s.civ.caravans.map((c) => {
      const o = sim.village(c.originId);
      const d = sim.village(c.destId);
      return `<li>${icon('cart')} ${escapeHtml(o?.name ?? '?')} → ${escapeHtml(d?.name ?? '?')} · ${c.phase === 'outbound' ? `${r(c.cargo.amount)} ${c.cargo.resource}` : `returning with ${r(c.payment?.amount ?? 0)} ${c.payment?.resource ?? 'thanks'}`}</li>`;
    });
    this.root.innerHTML = `
      <header class="vp-head">
        <div><small>Census of the island</small><h2>${icon('map')} Villages</h2></div>
        <button class="vp-close insp-close" type="button" aria-label="Close">${icon('close')}</button>
      </header>
      <div class="vp-select">${s.villages
        .map((v) => `<button type="button" data-village="${v.id}" class="vp-chip c-${v.identity.culture}"><b>${escapeHtml(v.name)}</b><small>${CULTURE_LABEL[v.identity.culture]} · ${v.population} people</small></button>`)
        .join('')}</div>
      <table class="vp-table">
        <thead><tr><th></th>${s.villages.map((v) => `<th>${escapeHtml(v.name)}</th>`).join('')}</tr></thead>
        <tbody>
          ${cell('Population', (v) => `<b>${v.population}</b>`)}
          ${cell('Food', (v) => bar(v.food, 160, v.food < 20, String(r(v.food))))}
          ${cell('Water', (v) => bar(v.water, 100, v.water < 20, String(r(v.water))))}
          ${cell('Wood', (v) => bar(v.wood, 120, v.wood < 10, String(r(v.wood))))}
          ${cell('Stone', (v) => bar(v.stone, 80, false, String(r(v.stone))))}
          ${cell('Prosperity', (v) => bar(v.prosperity, 1, v.prosperity < 0.35, `${r(v.prosperity * 100)}%`))}
          ${cell('Religion', religion)}
          ${cell('Divine favor', favor)}
          ${cell('Emergencies', emergencies)}
        </tbody>
      </table>
      <h3>Relations</h3>
      <ul class="vp-rel">${pairs.join('')}</ul>
      <h3>On the road</h3>
      <ul class="vp-road">${caravans.length ? caravans.join('') : '<li class="muted">No caravans right now.</li>'}</ul>`;
  }
}
