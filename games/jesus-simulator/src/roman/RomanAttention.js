/**
 * Roman Attention: the 0-5 star wanted level. Pure state, no scene or
 * physics, so it can live on a server later. Heat is a float; whole stars
 * are `floor(heat)`. Below one star the soldiers only grumble.
 *
 * Heat only comes from crimes a legionary noticed (seen, or done to him).
 * It never decays on its own: you lose it by staying out of sight until the
 * search gives up, by getting arrested, or by healing the soldier you hurt.
 */
export const CRIMES = {
  assault: { heat: 1.3, label: 'Assaulting a legionary' },
  levitate: { heat: 1.2, label: 'Levitating a legionary' },
  shove: { heat: 0.6, label: 'Shoving a legionary' },
  bump: { heat: 0.2, label: 'Jostling a legionary' },
  knock: { heat: 0.6, label: 'Knocking over a citizen' },
  push: { heat: 0.55, label: 'Blasting citizens with sorcery' },
  vandal: { heat: 0.35, label: 'Smashing property' },
  witchcraft: { heat: 0.3, label: 'Suspicious sorcery' },
  bread: { heat: 0.25, label: 'Unlicensed bread distribution' },
  trespass: { heat: 1.0, label: 'Trespassing on military ground' },
  trample: { heat: 0.7, label: 'Trampling a citizen' },
  horsetheft: { heat: 1.3, label: 'Stealing a legion horse' },
  chariot: { heat: 2.2, label: 'Stealing a Roman chariot' },
};

export const MAX_HEAT = 5.99;

export class RomanAttention {
  constructor() {
    this.reset();
  }

  reset() {
    this.heat = 0;
    this.unseen = 0;
    this.lastCrime = null;
    this.peak = 0;
  }

  get stars() {
    return this.heat >= 1 ? Math.min(5, Math.floor(this.heat)) : 0;
  }

  get wanted() {
    return this.stars > 0;
  }

  /** Seconds out of sight before the search is called off. */
  get loseTime() {
    return 6 + this.stars * 3;
  }

  /** @returns {{before:number, after:number}} star change */
  add(type, count = 1) {
    const crime = CRIMES[type];
    if (!crime) return { before: this.stars, after: this.stars };
    const before = this.stars;
    // crimes against soldiers always mean at least one star
    let heat = this.heat + crime.heat * count;
    if (type === 'assault' || type === 'levitate' || type === 'trespass' || type === 'horsetheft') heat = Math.max(heat, 1);
    if (type === 'chariot') heat = Math.max(heat, 2);
    this.heat = Math.min(MAX_HEAT, heat);
    this.lastCrime = crime.label;
    this.unseen = 0;
    this.peak = Math.max(this.peak, this.stars);
    return { before, after: this.stars };
  }

  /** Lower by whole stars (a healed soldier vouches for you). */
  forgive(stars = 1) {
    const before = this.stars;
    this.heat = Math.max(0, this.heat - stars);
    if (this.heat < 1) this.heat = Math.min(this.heat, 0.5);
    return { before, after: this.stars };
  }

  /**
   * Per fixed step. `seen` = a legionary currently has eyes on the player.
   * Returns 'lost' when the search is abandoned.
   */
  tick(dt, seen) {
    if (!this.wanted) {
      this.unseen = 0;
      return null;
    }
    if (seen) {
      this.unseen = 0;
      return null;
    }
    this.unseen += dt;
    if (this.unseen >= this.loseTime) {
      this.heat = 0;
      this.unseen = 0;
      return 'lost';
    }
    return null;
  }

  /** 0..1 progress of the search running out (for the HUD). */
  get searchProgress() {
    return this.wanted ? Math.min(1, this.unseen / this.loseTime) : 0;
  }
}
