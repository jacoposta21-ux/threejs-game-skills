import type { HeavenState } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

export function defaultHeaven(): HeavenState {
  return { archive: [], sent: {}, lastAt: -9999, lastReviewAt: 0 };
}

const ARCHIVE_MAX = 30;
const MIN_GAP = 45;
const REVIEW_EVERY = 480;

/**
 * Messages from Heaven's administrative departments. Every template reads real
 * game state; each id is sent once (or after its cooldown), messages are spaced
 * at least 45 s apart unless forced, and the archive is bounded.
 */
export class HeavenSystem {
  private timer = 10;
  private terraformNear: Record<string, number> = {};
  private nightFires = 0;

  constructor(private readonly sim: Simulation) {
    const bus = sim.bus;
    bus.on('SURREAL_EVENT', (e) => {
      if (e.id === 'rock-king') {
        const v = sim.nearestVillage(e.x, e.z).village;
        this.send('rock-mayor', 'DEPARTMENT OF CIVIC AFFAIRS', `WHY IS A ROCK NOW THE MAYOR OF ${(v?.name ?? 'THE ISLAND').toUpperCase()}?`);
      }
    });
    bus.on('POWER_USED', (e) => {
      if (e.power === 'fire' && sim.isNight && ++this.nightFires >= 3) this.send('extra-sun', 'DEPARTMENT OF LIGHTING', 'YOUR REQUEST FOR AN ADDITIONAL SUN HAS BEEN DENIED. PLEASE STOP SETTING THINGS ON FIRE TO SEE.');
    });
    bus.on('TERRAIN_CHANGED', (e) => {
      if (!e.villageId || e.delta <= 0) return;
      this.terraformNear[e.villageId] = (this.terraformNear[e.villageId] ?? 0) + 1;
      if (this.terraformNear[e.villageId] >= 3) {
        const v = sim.village(e.villageId);
        this.send(`mountain-${e.villageId}`, 'DEPARTMENT OF GEOGRAPHY', `${v?.name.toUpperCase()} HAS REQUESTED AN EXPLANATION FOR ITS NEW MOUNTAIN.`);
      }
    });
    bus.on('METEOR_IMPACT', (e) => this.send('meteor', 'INSURANCE DEPARTMENT', `${e.buildings ? `${e.buildings} BUILDINGS ` : 'A FIELD '}JUST FILED A CLAIM AGAINST "AN EXTREMELY LARGE ROCK". THE INSURANCE DEPARTMENT HAS STOPPED ANSWERING OUR CALLS.`));
    bus.on('TORNADO_DAMAGE', (e) => {
      if (e.buildings + e.trees >= 2) this.send('tornado', 'DEPARTMENT OF WEATHER', 'A TORNADO IS NOT AN APPROVED FORM OF URBAN PLANNING.');
    });
    bus.on('VILLAGER_RESURRECTED', (e) => this.send(`hr-${e.villagerId}`, 'HUMAN RESOURCES', `HR NOTES THAT ${e.name.toUpperCase()} IS NO LONGER DECEASED. PLEASE UPDATE THE PAPERWORK.`));
    bus.on('FAVORITISM', (e) => {
      const v = sim.village(e.jealousId);
      if (e.kind === 'jealousy') this.send('union', 'DEPARTMENT OF FAIRNESS', `${v?.name.toUpperCase()} HAS STARTED A UNION. THEY WANT FAIR WEATHER AND DENTAL.`);
    });
    bus.on('RELIGION_FOUNDED', () => {
      if (sim.religion.active.length >= 3) this.send('three-faiths', 'DEPARTMENT OF FORMS', 'THREE RELIGIONS? WE ONLY HAVE FORMS FOR TWO.');
    });
  }

  get state(): HeavenState {
    return this.sim.state.heaven;
  }

  /** Send a message. Returns false when deduplicated or too soon after the previous one. */
  send(id: string, from: string, text: string, opts: { force?: boolean; repeatAfter?: number } = {}): boolean {
    const sim = this.sim;
    const h = sim.state.heaven;
    const t = sim.state.time;
    const last = h.sent[id];
    if (last !== undefined && (opts.repeatAfter === undefined || t - last < opts.repeatAfter)) return false;
    if (!opts.force && t - h.lastAt < MIN_GAP) return false;
    h.sent[id] = t;
    h.lastAt = t;
    h.archive.push({ id, from, text, t });
    while (h.archive.length > ARCHIVE_MAX) h.archive.shift();
    sim.bus.emit('HEAVEN_MESSAGE', { id, from, text });
    sim.bus.emit('GOD_MESSAGE', { text, priority: 2, from });
    return true;
  }

  /** State-driven templates, checked every 10 s. */
  update(dt: number): void {
    const sim = this.sim;
    const s = sim.state;
    if (!s.tutorial.done) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 10;
    const st = s.stats;
    const floods = s.history.filter((h) => h.kind === 'disaster' || /flood/i.test(h.title)).length;
    if (st.rainsCast >= 6 && floods >= 1) this.send('weather', 'COMPLAINTS DEPARTMENT', `WE HAVE RECEIVED ${st.rainsCast * 7 + floods * 3} COMPLAINTS ABOUT THE WEATHER.`);
    if (st.treesPlanted >= 25) this.send('trees-back', 'DEPARTMENT OF CREATION', `THE DEPARTMENT OF CREATION WOULD LIKE ITS ${st.treesPlanted} TREES BACK.`);
    if (s.mutations.filter((m) => m.targetKind === 'villager').length >= 2) this.send('vegetation', 'DEPARTMENT OF BIOLOGY', 'PLEASE STOP CLASSIFYING VILLAGERS AS EXPERIMENTAL VEGETATION.');
    if (st.villagersLost >= 3) this.send('names', 'DEPARTMENT OF NAMES', `PLEASE STOP MISPLACING VILLAGERS. ${st.villagersLost} SO FAR. WE ARE RUNNING OUT OF NAMES.`);
    if (s.approval < 25) this.send('approval', 'PUBLIC RELATIONS', `YOUR APPROVAL RATING (${Math.round(s.approval)}%) IS NOW LOWER THAN SEA LEVEL.`, { repeatAfter: 900 });
    if (s.chaos >= 60) this.send('chaos', 'RISK MANAGEMENT', `CHAOS AT ${Math.round(s.chaos)}%. RISK MANAGEMENT HAS GONE HOME EARLY.`);
    if (s.time - h(s).lastReviewAt >= REVIEW_EVERY && s.time > 300) {
      const ok = this.send('review', 'PERFORMANCE REVIEWS', this.review(), { repeatAfter: REVIEW_EVERY });
      if (ok) s.heaven.lastReviewAt = s.time;
    }
  }

  private review(): string {
    const s = this.sim.state;
    const st = s.stats;
    const score = st.prayersAnswered * 2 - st.prayersFailed * 2 - st.villagersLost * 3 + Math.round(s.approval / 10);
    const rating = score > 20 ? 'SUSPICIOUSLY COMPETENT' : score > 8 ? 'ACCEPTABLE, BARELY' : score > 0 ? 'NEEDS SUPERVISION' : 'PLEASE STOP';
    return `PERFORMANCE REVIEW: ${st.prayersAnswered} PRAYERS ANSWERED, ${st.prayersFailed} IGNORED, ${st.villagersLost} VILLAGERS MISPLACED, CHAOS ${Math.round(s.chaos)}%. RATING: ${rating}.`;
  }
}

const h = (s: { heaven: HeavenState }) => s.heaven;
