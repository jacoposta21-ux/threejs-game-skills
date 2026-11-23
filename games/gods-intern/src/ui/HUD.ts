import { CONFIG } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import { $, formatClock, setText } from './dom';
import { ICON } from './Icons';

/** Top bar: day/time, population, divine energy, approval, chaos, controls. */
export class HUD {
  private readonly day = $('#hud-day');
  private readonly time = $('#hud-time');
  private readonly clockIcon = $('#hud-clock-icon');
  private readonly pop = $('#hud-pop-value');
  private readonly energy = $('#hud-energy-value');
  private readonly energyBar = $('#hud-energy-bar');
  private readonly energyGhost = $('#hud-energy-ghost');
  private readonly approval = $('#hud-approval-value');
  private readonly approvalBar = $('#hud-approval-bar');
  private readonly chaos = $('#hud-chaos-value');
  private readonly chaosBar = $('#hud-chaos-bar');
  private readonly pauseBtn = $('#btn-pause');
  private readonly speedLabel = $('#speed-label');
  private night: boolean | null = null;
  private lastApproval = -1;
  private lastChaos = -1;
  private paused: boolean | null = null;

  update(sim: Simulation, paused: boolean, speed: number, previewCost: number): void {
    const s = sim.state;
    setText(this.day, `Day ${sim.day}`);
    setText(this.time, formatClock(sim.timeOfDay));
    const night = sim.isNight;
    if (night !== this.night) {
      this.night = night;
      this.clockIcon.innerHTML = night ? ICON.moon : ICON.sun;
    }
    const pop = s.villages.reduce((a, v) => a + v.population, 0);
    setText(this.pop, String(pop));
    const e = sim.unlimitedEnergy ? CONFIG.energy.max : s.energy;
    setText(this.energy, sim.unlimitedEnergy ? '∞' : String(Math.floor(e)));
    this.energyBar.style.width = `${(e / CONFIG.energy.max) * 100}%`;
    // Preview the cost of the selected power as a red segment.
    const cost = sim.unlimitedEnergy ? 0 : Math.min(e, previewCost);
    this.energyGhost.style.left = `${((e - cost) / CONFIG.energy.max) * 100}%`;
    this.energyGhost.style.width = `${(cost / CONFIG.energy.max) * 100}%`;

    const approval = Math.round(s.approval);
    if (approval !== this.lastApproval) {
      if (this.lastApproval >= 0) this.bump('#hud-approval');
      this.lastApproval = approval;
      setText(this.approval, String(approval));
      this.approvalBar.style.width = `${approval}%`;
      this.approvalBar.style.background = `linear-gradient(90deg, hsl(${approval * 1.3} 70% 50%), hsl(${approval * 1.3 + 15} 75% 58%))`;
    }
    const chaos = Math.round(s.chaos);
    if (chaos !== this.lastChaos) {
      if (this.lastChaos >= 0 && chaos > this.lastChaos) this.bump('#hud-chaos');
      this.lastChaos = chaos;
      setText(this.chaos, String(chaos));
      this.chaosBar.style.width = `${chaos}%`;
    }
    if (paused !== this.paused) {
      this.paused = paused;
      this.pauseBtn.innerHTML = `<span data-icon="${paused ? 'play' : 'pause'}">${paused ? ICON.play : ICON.pause}</span>`;
      this.pauseBtn.classList.toggle('active', paused);
      this.pauseBtn.title = paused ? 'Resume (Space)' : 'Pause (Space)';
    }
    setText(this.speedLabel, `${speed}×`);
  }

  flashLowEnergy(): void {
    const node = $('#hud-energy');
    node.classList.remove('pulse-low');
    void node.offsetWidth;
    node.classList.add('pulse-low');
  }

  private bump(selector: string): void {
    const node = $(selector);
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }
}
