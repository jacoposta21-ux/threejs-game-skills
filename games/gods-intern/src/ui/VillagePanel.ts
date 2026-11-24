import { CATEGORY_LABEL } from '../civ/Relations';
import { CONFIG } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import type { VillageData } from '../core/types';
import { relationKey } from '../world/Settlements';
import { $, escapeHtml, formatClock, icon, mayRebuild } from './dom';

const CULTURE_LABEL = { agricultural: 'Agricultural village', mountain: 'Mountain mining village', riverside: 'Riverside fishing village' } as const;

/** The single most useful thing to know about a village, as a sentence. */
export function villageHeadline(sim: Simulation, v: VillageData): { text: string; level: 'bad' | 'warn' | 'ok' } {
  const fires = sim.state.fires.filter((f) => f.intensity > 0 && Math.hypot(f.x - v.centerX, f.z - v.centerZ) < v.radius + 8).length;
  if (fires) return { text: `${v.name} is on fire (${fires} ${fires > 1 ? 'fires' : 'fire'}). Rain would help.`, level: 'bad' };
  if (v.floodActive) return { text: `${v.name}'s streets are flooded. Stop the rain and it will drain.`, level: 'bad' };
  if (v.water < 20) return { text: `${v.name}'s well is running dry. Rain over the well fills it.`, level: 'bad' };
  if (v.food < 20) return { text: `${v.name} is running out of food. Rain on the fields helps them grow.`, level: 'bad' };
  if (v.fear > 0.4) return { text: `${v.name} is terrified. Something gentle would calm them down.`, level: 'warn' };
  if (v.water < 40) return { text: `${v.name} will need water soon.`, level: 'warn' };
  if (v.food < 40) return { text: `${v.name}'s food stores are getting low.`, level: 'warn' };
  if (v.happiness < 0.4) return { text: `${v.name} is unhappy. Answering their prayers helps.`, level: 'warn' };
  if (v.problems.length) return { text: `${v.name}: ${v.problems[0]}.`, level: 'warn' };
  return { text: `${v.name} is doing fine. Suspiciously fine.`, level: 'ok' };
}

const pctWord = (x: number) => (x >= 0.75 ? 'High' : x >= 0.5 ? 'Good' : x >= 0.3 ? 'Low' : 'Very low');
const favorWord = (f: number) => (f >= 30 ? 'Favored' : f >= 8 ? 'Liked' : f > -8 ? 'Neutral' : f > -30 ? 'Resentful' : 'Feels picked on');

/**
 * WORLD panel: one card per village (population, happiness, prosperity, the
 * current major problem in a sentence, divine favor, dominant religion), with
 * expandable resources; clicking a card flies the camera there. Diplomacy is
 * shown in words, plus religion distribution and caravans on the road.
 */
export class VillagePanel {
  private readonly root = $('#villages');
  private key = '';
  private expanded = new Set<string>();
  onFocus: (village: VillageData) => void = () => {};
  onToggle: (open: boolean) => void = () => {};
  private sim: Simulation | null = null;

  constructor() {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.vp-close')) {
        this.close();
        return;
      }
      const more = t.closest<HTMLElement>('[data-expand]');
      if (more) {
        const id = more.dataset.expand!;
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        this.key = '';
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
    const key = `${[...this.expanded].join()}|${Math.floor(sim.timeOfDay * 48)}|` + s.villages.map((v) => `${v.population}${r(v.food / 4)}${r(v.water / 4)}${r(v.wood / 4)}${r(v.stone / 4)}${r(v.prosperity * 20)}${r(v.happiness * 20)}${v.identity.dominantReligionId}${r(v.identity.divineFavor / 4)}${villageHeadline(sim, v).text}`).join('|') + `|${Object.values(s.civ.relations).map((x) => x.category).join()}|${s.civ.caravans.map((c) => c.id + c.phase).join()}|${s.religions.filter((x) => x.active).map((x) => x.followers.length).join()}`;
    if (key === this.key || !mayRebuild(this.root, this.key === '')) return;
    this.key = key;
    const meter = (label: string, value: number, text: string, warn: boolean) => `<div class="vp-meter ${warn ? 'warn' : ''}"><span>${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, value * 100))}%"></i></div><b>${text}</b></div>`;
    const religionOf = (v: VillageData) => (v.identity.dominantReligionId ? s.religions.find((x) => x.id === v.identity.dominantReligionId && x.active) : undefined);
    const cards = s.villages.map((v) => {
      const head = villageHeadline(sim, v);
      const rel = religionOf(v);
      const open = this.expanded.has(v.id);
      return `<article class="vp-card c-${v.identity.culture}">
        <button type="button" class="vp-card-main" data-village="${v.id}" aria-label="Fly to ${escapeHtml(v.name)}">
          <header><b>${escapeHtml(v.name)}</b><small>${CULTURE_LABEL[v.identity.culture]}</small><span class="vp-pop">${icon('people')} ${v.population}</span></header>
          <p class="vp-headline ${head.level}">${head.level === 'ok' ? '✓' : '!'} ${escapeHtml(head.text)}</p>
          ${meter('Happiness', v.happiness, pctWord(v.happiness), v.happiness < 0.35)}
          ${meter('Prosperity', v.prosperity, pctWord(v.prosperity), v.prosperity < 0.3)}
          <div class="vp-facts"><span>${icon('halo')} ${favorWord(v.identity.divineFavor)}</span><span>${icon('faith')} ${rel ? escapeHtml(rel.name) : 'No dominant religion'}</span></div>
        </button>
        <button type="button" class="vp-more" data-expand="${v.id}" aria-expanded="${open}">${open ? 'Hide resources' : 'Resources'} <span class="chev">${icon('chevron')}</span></button>
        ${open ? `<div class="vp-res">
          ${meter('Food', v.food / CONFIG.village.maxFood, String(r(v.food)), v.food < 20)}
          ${meter('Water', v.water / CONFIG.village.maxWater, String(r(v.water)), v.water < 20)}
          ${meter('Wood', v.wood / CONFIG.village.maxWood, String(r(v.wood)), v.wood < 10)}
          ${meter('Stone', Math.min(1, v.stone / 80), String(r(v.stone)), false)}
          ${meter('Faith', v.faith, pctWord(v.faith), v.faith < 0.25)}
          ${meter('Fear', v.fear, pctWord(v.fear), v.fear > 0.4)}
        </div>` : ''}
      </article>`;
    });
    const ids = s.villages.map((v) => v.id);
    const pairs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const rec = s.civ.relations[relationKey(ids[i], ids[j])];
        if (!rec) continue;
        const a = sim.village(ids[i])!;
        const b = sim.village(ids[j])!;
        const note = rec.category === 'hostile' ? 'No trade until they cool off.' : rec.category === 'rival' ? 'Trade is slow and grudging.' : rec.category === 'allied' ? 'Trading eagerly.' : rec.category === 'friendly' ? 'Trading happily.' : 'Polite. Mostly.';
        pairs.push(`<li class="rel-${rec.category}"><span>${escapeHtml(a.name)} & ${escapeHtml(b.name)}</span><b>${CATEGORY_LABEL[rec.category]}</b><small>${note}</small></li>`);
      }
    }
    const pop = s.villagers.filter((p) => p.alive).length;
    const faiths = s.religions.filter((x) => x.active && x.followers.length).sort((a, b) => b.followers.length - a.followers.length);
    const unaffiliated = Math.max(0, pop - faiths.reduce((a, x) => a + x.followers.length, 0));
    const dist = [...faiths.map((x) => ({ name: x.name, n: x.followers.length, color: `#${x.color.toString(16).padStart(6, '0')}` })), { name: 'No religion', n: unaffiliated, color: '#8a8fa3' }].filter((x) => x.n > 0);
    const caravans = s.civ.caravans.map((c) => {
      const o = sim.village(c.originId);
      const d = sim.village(c.destId);
      return `<li>${icon('cart')} ${escapeHtml(o?.name ?? '?')} → ${escapeHtml(d?.name ?? '?')} · ${c.phase === 'outbound' ? `carrying ${r(c.cargo.amount)} ${c.cargo.resource}` : `returning with ${r(c.payment?.amount ?? 0)} ${c.payment?.resource ?? 'thanks'}`}</li>`;
    });
    this.root.innerHTML = `
      <header class="side-head">
        <div><small>Day ${sim.day} · ${formatClock(sim.timeOfDay)} · ${pop} villagers</small><h2>${icon('map')} World</h2></div>
        <button class="vp-close insp-close" type="button" aria-label="Close world panel">${icon('close')}</button>
      </header>
      <div class="side-body">
        <div class="vp-cards">${cards.join('')}</div>
        <h3>Diplomacy</h3>
        <ul class="vp-rel">${pairs.join('')}</ul>
        <h3>Religion</h3>
        <div class="vp-dist" role="img" aria-label="${escapeHtml(dist.map((d) => `${d.name}: ${d.n}`).join(', '))}">${dist.map((d) => `<i style="flex:${d.n};background:${d.color}"></i>`).join('')}</div>
        <ul class="vp-dist-legend">${dist.map((d) => `<li><i style="background:${d.color}"></i>${escapeHtml(d.name)} <b>${d.n}</b></li>`).join('')}</ul>
        <h3>On the road</h3>
        <ul class="vp-road">${caravans.length ? caravans.join('') : '<li class="muted">No caravans right now.</li>'}</ul>
      </div>`;
  }
}
