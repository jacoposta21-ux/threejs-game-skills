import { CONFIG } from '../core/Config';
import type { BuildingData, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { $, escapeHtml, icon } from './dom';
import { STAGE_NAMES } from '../culture/SacredSystem';
import { villageHeadline } from './VillagePanel';

const BUILDING_INFO: Record<BuildingData['type'], { name: string; role: string }> = {
  house: { name: 'House', role: 'Villagers sleep here at night. Each house shelters 4.' },
  well: { name: 'Village Well', role: 'Drinking water. Refills slowly; rain fills it fast.' },
  farm: { name: 'Farm', role: 'Grows food. Needs moist soil, hates floods.' },
  storage: { name: 'Storehouse', role: 'Holds the village food and wood.' },
  shrine: { name: 'Shrine', role: 'Where villagers come to pray to you.' },
  quarry: { name: 'Quarry', role: 'Miners cut stone here for shrines, monuments and trade.' },
  fishery: { name: 'Fishery', role: 'Fishers dry the catch here. Food that ignores the weather.' },
};

const JOB: Record<VillagerData['job'], string> = { farmer: 'Farmer', woodcutter: 'Woodcutter', builder: 'Builder', idler: 'Professional idler', miner: 'Miner', fisher: 'Fisher' };

/** What a villager is doing, in plain words. */
export function activityText(sim: Simulation, v: VillagerData): string {
  if (!v.alive) return 'Resting permanently';
  if (sim.state.possession?.villagerId === v.id) return 'Being possessed by you';
  if ((v.lift ?? 0) > 0.2) return 'Floating, against their will';
  const t = v.currentTask;
  if (v.travel) {
    const dest = sim.village(v.travel.phase === 'out' ? v.travel.destId : v.travel.originId)?.name ?? 'somewhere';
    const verb = { trade: 'Trading', migrate: 'Moving', visit: 'Visiting', pilgrim: 'On pilgrimage' }[v.travel.kind];
    return `${verb}${v.travel.phase === 'out' ? ' to' : ', heading home to'} ${dest}`;
  }
  const a = t.activity;
  switch (t.state) {
    case 'WORKING':
      return a === 'farm' ? 'Tending the fields' : a === 'chop' ? 'Chopping wood' : a === 'repair' ? 'Repairing a building' : a === 'build' ? 'Building something holy' : a === 'mine' ? 'Cutting stone' : a === 'fish' ? 'Fishing' : 'Working';
    case 'SEEKING_FOOD': return 'Looking for food';
    case 'SEEKING_WATER': return a === 'drink-river' ? 'Walking to the river for water' : 'Fetching water from the well';
    case 'RESTING': return sim.isNight ? 'Sleeping' : 'Taking a break';
    case 'FLEEING': return 'Running away from you';
    case 'PRAYING': return 'Praying at the shrine';
    case 'CELEBRATING': return 'Celebrating';
    case 'WANDERING': return 'Wandering around';
    default: return 'Thinking about life';
  }
}

const moodOf = (v: VillagerData) => (v.fear > 0.5 ? 'Terrified' : v.happiness > 0.75 ? 'Delighted' : v.happiness > 0.55 ? 'Content' : v.happiness > 0.35 ? 'Grumpy' : 'Miserable');
const needWord = (x: number) => (x > 0.75 ? 'Urgent' : x > 0.5 ? 'Needs it soon' : x > 0.25 ? 'A little' : 'Fine');

type Target =
  | { kind: 'village'; villageId: string; buildingId: number | null }
  | { kind: 'sacred'; id: string }
  | { kind: 'villager'; id: string }
  | { kind: 'site'; x: number; z: number; label: string; text: string };

/**
 * Contextual inspector (click anything with no power selected): villagers,
 * buildings, sacred objects and monuments, villages, caravans (through their
 * merchants) and disaster sites. Re-renders at most twice per second.
 */
export class VillageInspector {
  private readonly root = $('#inspector');
  private target: Target | null = null;
  private timer = 0;
  private expanded = false;
  private key = '';
  onClose: () => void = () => {};
  onFollow: (villagerId: string | null) => void = () => {};
  following: string | null = null;

  constructor() {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.insp-close')) {
        this.hide();
        this.onClose();
      } else if (t.closest('[data-more]')) {
        this.expanded = !this.expanded;
        this.key = '';
        this.timer = 0;
      } else if (t.closest('[data-follow]')) {
        const id = (t.closest('[data-follow]') as HTMLElement).dataset.follow!;
        this.following = this.following === id ? null : id;
        this.onFollow(this.following);
        this.key = '';
        this.timer = 0;
      }
    });
  }

  get open(): boolean {
    return this.target !== null;
  }

  get kind(): Target['kind'] | null {
    return this.target?.kind ?? null;
  }

  private mount(t: Target, sim: Simulation): void {
    if (this.following && !(t.kind === 'villager' && t.id === this.following)) {
      this.following = null;
      this.onFollow(null);
    }
    this.target = t;
    this.expanded = false;
    this.key = '';
    this.root.classList.remove('hidden');
    this.render(sim);
  }

  showSacred(sim: Simulation, sacredId: string): void {
    this.mount({ kind: 'sacred', id: sacredId }, sim);
  }

  show(sim: Simulation, villageId: string, buildingId: number | null): void {
    this.mount({ kind: 'village', villageId, buildingId }, sim);
  }

  showVillager(sim: Simulation, id: string): void {
    this.mount({ kind: 'villager', id }, sim);
  }

  showSite(sim: Simulation, x: number, z: number, label: string, text: string): void {
    this.mount({ kind: 'site', x, z, label, text }, sim);
  }

  hide(): void {
    if (this.following) {
      this.following = null;
      this.onFollow(null);
    }
    this.target = null;
    this.root.classList.add('hidden');
  }

  update(sim: Simulation, dt: number): void {
    if (!this.target) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    this.render(sim);
  }

  private render(sim: Simulation): void {
    const t = this.target;
    if (!t) return;
    const html = t.kind === 'sacred' ? this.sacredHtml(sim, t.id) : t.kind === 'villager' ? this.villagerHtml(sim, t.id) : t.kind === 'site' ? this.siteHtml(t) : this.villageHtml(sim, t.villageId, t.buildingId);
    if (html === null) return this.hide();
    if (html === this.key) return;
    this.key = html;
    this.root.innerHTML = html;
  }

  private head(title: string, sub: string, kind: string): string {
    return `<div class="insp-head"><div><small class="insp-kind">${kind}</small><h3>${escapeHtml(title)}</h3><small>${sub}</small></div><button class="insp-close" type="button" aria-label="Close inspector">${icon('close')}</button></div>`;
  }

  private row(label: string, value: string): string {
    return `<div class="insp-row"><span>${label}</span><b>${value}</b></div>`;
  }

  private meter(name: string, value: number, text: string, warn: boolean): string {
    return `<div class="vp-meter ${warn ? 'warn' : ''}"><span>${name}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, value * 100))}%"></i></div><b>${text}</b></div>`;
  }

  private villagerHtml(sim: Simulation, id: string): string | null {
    const v = sim.villager(id);
    if (!v) return null;
    const village = sim.village(v.villageId);
    const rel = v.religionId ? sim.state.religions.find((r) => r.id === v.religionId) : undefined;
    const caravan = v.travel?.caravanId ? sim.state.civ.caravans.find((c) => c.id === v.travel!.caravanId) : undefined;
    const memories = v.memoryIds.map((m) => sim.state.memories.find((x) => x.id === m)).filter(Boolean).slice(-4);
    const following = this.following === id;
    const caravanHtml = caravan
      ? `<div class="insp-building">${icon('cart')} <b>Caravan</b>: ${escapeHtml(sim.village(caravan.originId)?.name ?? '?')} → ${escapeHtml(sim.village(caravan.destId)?.name ?? '?')}, ${caravan.phase === 'outbound' ? `carrying ${Math.round(caravan.cargo.amount)} ${caravan.cargo.resource}` : `returning with ${Math.round(caravan.payment?.amount ?? 0)} ${caravan.payment?.resource ?? 'thanks'}`}.</div>`
      : '';
    return `${this.head(`${v.title ? `${v.title} ` : ''}${v.name}`, `${JOB[v.job]} · ${escapeHtml(village?.name ?? 'Nowhere')}${v.resurrected ? ' · Came back from the dead' : ''}`, 'Villager')}
      <p class="insp-activity">${escapeHtml(activityText(sim, v))}</p>
      ${this.row('Mood', `${moodOf(v)}`)}
      ${this.row('Personality', escapeHtml(v.traits.join(', ') || 'Unremarkable'))}
      ${this.row('Religion', rel ? escapeHtml(rel.name) : 'None (yet)')}
      ${v.mutation ? this.row('Condition', v.mutation === 'giant-head' ? 'Enormous head' : escapeHtml(v.mutation)) : ''}
      ${caravanHtml}
      <button type="button" class="insp-more" data-more aria-expanded="${this.expanded}">${this.expanded ? 'Hide needs and memories' : 'Needs and memories'} <span class="chev">${icon('chevron')}</span></button>
      ${this.expanded ? `<div class="insp-expand">
        ${this.meter('Hunger', v.hunger, needWord(v.hunger), v.hunger > 0.6)}
        ${this.meter('Thirst', v.thirst, needWord(v.thirst), v.thirst > 0.6)}
        ${this.meter('Faith', v.faith, v.faith > 0.6 ? 'Devout' : v.faith > 0.3 ? 'Believer' : 'Skeptic', false)}
        ${this.meter('Fear', v.fear, v.fear > 0.5 ? 'Scared' : 'Calm', v.fear > 0.5)}
        <h5>Remembers</h5><ul class="insp-mem">${memories.length ? memories.map((m) => `<li>${escapeHtml(m!.interpretation ?? m!.eventType)}</li>`).join('') : '<li class="muted">Nothing divine yet.</li>'}</ul>
      </div>` : ''}
      <div class="insp-actions"><button type="button" class="btn small ${following ? 'primary' : ''}" data-follow="${v.id}" aria-pressed="${following}">${icon('camera')} ${following ? 'Following' : 'Follow with camera'}</button></div>`;
  }

  private sacredHtml(sim: Simulation, id: string): string | null {
    const s = sim.state.sacred.find((x) => x.id === id);
    if (!s) return null;
    const r = s.religionId ? sim.state.religions.find((x) => x.id === s.religionId) : undefined;
    const t = CONFIG.culture.stageThresholds;
    const next =
      s.stage < 2 ? `Becomes a gathering place at sacredness ${t[0]}`
        : s.stage < 3 ? `Decorations begin at sacredness ${t[1]}`
          : s.stage < 4 ? `A shrine is built at sacredness ${t[2]}`
            : s.shrineProgress < 1 ? `Shrine ${Math.round(s.shrineProgress * 100)}% built (needs wood)`
              : s.stage < 5 ? `A monument at sacredness ${t[3]}`
                : s.monumentProgress < 1 ? `Monument ${Math.round(s.monumentProgress * 100)}% built (needs wood)` : 'Complete. A landmark of your mistakes.';
    const origin = sim.state.history.find((h) => Math.abs(h.time - s.createdAt) < 3 && (h.kind === 'sacred' || h.kind === 'religion' || h.kind === 'event')) ?? sim.state.history.find((h) => h.time >= s.createdAt - 3);
    return `${this.head(s.label, `${STAGE_NAMES[s.stage]} · sacred ${s.kind}`, s.stage >= 5 ? 'Monument' : 'Sacred object')}
      <div class="stage-track" aria-label="Stage ${s.stage} of 5">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= s.stage ? 'on' : ''}" title="${STAGE_NAMES[n]}">${n}</span>`).join('')}</div>
      ${this.row('Religion', r ? escapeHtml(r.name) : 'No active faith')}
      ${this.row('Followers', String(r ? r.followers.length : 0))}
      ${this.row('Visits', String(s.visits))}
      ${this.row('Significance', s.stage >= 4 ? 'A holy site' : s.stage >= 2 ? 'A gathering place' : 'Locally interesting')}
      ${origin ? `<div class="insp-building"><b>Origin:</b> ${escapeHtml(origin.title)}<br><span>${escapeHtml(origin.text)}</span></div>` : ''}
      <ul class="problems"><li class="ok">${escapeHtml(next)}</li></ul>`;
  }

  private villageHtml(sim: Simulation, villageId: string, buildingId: number | null): string | null {
    const v = sim.village(villageId);
    if (!v) return null;
    const b = buildingId !== null ? sim.building(buildingId) : undefined;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const head = villageHeadline(sim, v);
    if (b) {
      const info = BUILDING_INFO[b.type];
      const workers = sim.state.villagers.filter((p) => p.alive && p.currentTask.targetId === b.id && p.currentTask.state === 'WORKING').length;
      const resources = b.type === 'farm' ? `Crop ${pct(b.cropGrowth)} grown, ${pct(b.cropHealth)} healthy` : b.type === 'well' ? `Water ${Math.round(v.water)} / ${CONFIG.village.maxWater}` : b.type === 'storage' ? `Food ${Math.round(v.food)} · Wood ${Math.round(v.wood)} · Stone ${Math.round(v.stone)}` : '—';
      return `${this.head(info.name, escapeHtml(v.name), 'Building')}
        <p class="insp-activity">${escapeHtml(info.role)}</p>
        ${this.row('Condition', b.destroyed ? 'Destroyed · builders need 20 wood' : b.health >= 90 ? 'Good' : b.health >= 50 ? `Damaged (${Math.round(b.health)}%)` : `Badly damaged (${Math.round(b.health)}%)`)}
        ${this.row('Resources', resources)}
        ${this.row('Activity', workers ? `${workers} working here` : 'Quiet right now')}
        <p class="vp-headline ${head.level}">${escapeHtml(head.text)}</p>`;
    }
    return `${this.head(v.name, `${v.population} villagers · prosperity ${pct(v.prosperity)}`, 'Village')}
      <p class="vp-headline ${head.level}">${head.level === 'ok' ? '✓' : '!'} ${escapeHtml(head.text)}</p>
      ${this.meter('Food', v.food / CONFIG.village.maxFood, String(Math.round(v.food)), v.food < 20)}
      ${this.meter('Water', v.water / CONFIG.village.maxWater, String(Math.round(v.water)), v.water < 20)}
      ${this.meter('Wood', v.wood / CONFIG.village.maxWood, String(Math.round(v.wood)), v.wood < 10)}
      ${this.meter('Happiness', v.happiness, pct(v.happiness), v.happiness < 0.4)}`;
  }

  private siteHtml(t: Extract<Target, { kind: 'site' }>): string {
    return `${this.head(t.label, 'Disaster site', 'Site')}<p class="insp-activity">${escapeHtml(t.text)}</p>`;
  }
}
