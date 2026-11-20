import { MIRACLES } from '../game/miracles.js';
import { MIRACLE_ICONS } from '../ui/icons.js';

/**
 * Touch controls for phones and tablets. They emit the same intents as the
 * keyboard and mouse by writing into `Input` (virtual keys, an analog stick
 * and look deltas), so no game system knows where input came from.
 *
 * Layout:
 * - Left part of the screen: a floating joystick. Pushing past the ring sprints
 *   (and gallops when riding).
 * - Anywhere else: drag to look around. Two fingers pinch to zoom.
 * - Bottom-right: cast (selected miracle), jump, talk/interact, ride, followers.
 * - Top: pause and map.
 * - Tapping a hotbar slot selects that miracle; the E/F prompts are tappable too.
 */
const ICON = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 4l7 8h-4.5v8h-5v-8H5z"/></svg>',
  talk: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H10l-5 4v-4H4z"/></svg>',
  ride: '<svg viewBox="0 0 24 24"><path d="M5 20v-6l3-5 2-5 2 3h4l3 3-2 2-3-1-1 3 3 6h-3l-2-5h-3l-1 5z"/></svg>',
  follow: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6z"/><path d="M14 19c.2-2.2 1.2-4 3-4.6 2.4.2 4 2.2 4 4.6z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke-width="2"/><path d="M9 4v14M15 6v14" stroke-width="2"/></svg>',
};

/** Phones and tablets: a coarse primary pointer, or `?touch=1` to force it on. */
export function prefersTouch() {
  try {
    const q = new URLSearchParams(window.location.search).get('touch');
    if (q === '1') return true;
    if (q === '0') return false;
    return !!window.matchMedia?.('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}

const STICK_RADIUS = 56;
const STICK_ZONE = 0.42; // left share of the screen that starts the joystick
const LOOK_GAIN = 1.5; // touch drags are shorter than mouse sweeps

export class TouchControls {
  constructor(input, hud) {
    this.input = input;
    this.active = false;
    this.stick = null; // { id, ox, oy, x, y }
    this.looks = new Map(); // pointerId -> { x, y }
    this.pinch = 0;
    this.buttons = new Map(); // pointerId -> { code, el }
    this.lastSelected = -1;

    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'touch';
    root.innerHTML = `
      <div class="t-zone" data-zone></div>
      <div class="t-stick" aria-hidden="true"><div class="t-ring"></div><div class="t-knob"></div></div>
      <div class="t-top">
        <button type="button" class="t-btn t-small" data-code="Escape" aria-label="Pause">${ICON.pause}</button>
        <button type="button" class="t-btn t-small" data-code="Tab" aria-label="Map">${ICON.map}</button>
      </div>
      <div class="t-actions">
        <button type="button" class="t-btn t-cast" data-code="KeyQ" aria-label="Use miracle"><span class="t-ico"></span><span class="t-cd"></span></button>
        <button type="button" class="t-btn t-jump" data-code="Space" aria-label="Jump">${ICON.jump}</button>
        <button type="button" class="t-btn t-talk" data-code="KeyE" aria-label="Talk or interact">${ICON.talk}</button>
        <button type="button" class="t-btn t-ride" data-code="KeyF" aria-label="Ride or get off">${ICON.ride}</button>
        <button type="button" class="t-btn t-follow" data-code="KeyG" aria-label="Followers wait or follow">${ICON.follow}</button>
      </div>`;
    hud.prepend(root); // first child: every other interactive HUD element stays on top of the look zone
    this.root = root;
    this.zone = root.querySelector('[data-zone]');
    this.stickEl = root.querySelector('.t-stick');
    this.knob = root.querySelector('.t-knob');
    this.castIco = root.querySelector('.t-cast .t-ico');
    this.castCd = root.querySelector('.t-cast .t-cd');
    this.el = {
      talk: root.querySelector('.t-talk'),
      ride: root.querySelector('.t-ride'),
      follow: root.querySelector('.t-follow'),
      cast: root.querySelector('.t-cast'),
    };

    this.zone.addEventListener('pointerdown', (e) => this.zoneDown(e));
    this.zone.addEventListener('pointermove', (e) => this.zoneMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.zone.addEventListener(type, (e) => this.zoneUp(e));

    for (const btn of root.querySelectorAll('.t-btn')) this.bindButton(btn, btn.dataset.code);
    // the hotbar and the E / F prompts are tappable in touch mode
    document.getElementById('hotbar')?.addEventListener('pointerdown', (e) => {
      const slot = e.target.closest?.('[data-slot]');
      if (!slot || !this.active) return;
      e.preventDefault();
      this.input.virtualPress(`Digit${Number(slot.dataset.slot) + 1}`);
    });
    const tapKey = (id, code) => document.getElementById(id)?.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.input.virtualPress(code);
    });
    tapKey('prompt', 'KeyE');
    tapKey('ride-prompt', 'KeyF');

    // a released or cancelled control must never stay down
    input.onRelease = () => this.resetPointers();
    window.addEventListener('blur', () => this.resetPointers());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.resetPointers(); });

    // a touch anywhere switches a hybrid device to touch controls
    window.addEventListener('touchstart', () => { if (!this.active) this.setActive(true); }, { passive: true, capture: true });
    this.setActive(prefersTouch());
  }

  setActive(on) {
    if (on && !this.left) {
      // objective, reputation, followers and the riding panel stack in the top-left corner, clear of the thumbs
      this.left = document.createElement('div');
      this.left.className = 't-left';
      for (const id of ['hud-objective', 'hud-rep', 'hud-followers', 'ride-hud']) {
        const el = document.getElementById(id);
        if (el) this.left.appendChild(el);
      }
      this.root.after(this.left);
    }
    this.active = on;
    this.input.touchMode = on;
    document.body.classList.toggle('touch-ui', on);
    if (on) this.input.exitLock();
  }

  // ------------------------------------------------------------- look + stick
  zoneDown(e) {
    if (!this.input.enabled) return;
    e.preventDefault();
    try { this.zone.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
    const w = window.innerWidth;
    if (!this.stick && e.clientX < w * STICK_ZONE && e.clientY > window.innerHeight * 0.3) {
      const pad = STICK_RADIUS + 12;
      const ox = Math.max(pad, e.clientX);
      const oy = Math.min(window.innerHeight - pad, e.clientY);
      this.stick = { id: e.pointerId, ox, oy, x: e.clientX, y: e.clientY };
      this.stickEl.classList.add('on');
      this.stickEl.style.setProperty('--x', `${ox}px`);
      this.stickEl.style.setProperty('--y', `${oy}px`);
      this.updateStick();
      return;
    }
    this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pinch = this.pinchDistance();
  }

  zoneMove(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      this.updateStick();
      return;
    }
    const p = this.looks.get(e.pointerId);
    if (!p) return;
    if (this.looks.size >= 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const d = this.pinchDistance();
      if (Math.abs(d - this.pinch) > 24) {
        this.input.wheel += d > this.pinch ? -1 : 1; // spread = closer
        this.pinch = d;
      }
      return;
    }
    this.input.mouseDX += (e.clientX - p.x) * LOOK_GAIN;
    this.input.mouseDY += (e.clientY - p.y) * LOOK_GAIN;
    p.x = e.clientX;
    p.y = e.clientY;
  }

  zoneUp(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.releaseStick();
      return;
    }
    this.looks.delete(e.pointerId);
    this.pinch = this.pinchDistance();
  }

  pinchDistance() {
    if (this.looks.size < 2) return 0;
    const [a, b] = [...this.looks.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  updateStick() {
    const s = this.stick;
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
    const len = Math.hypot(dx, dy);
    const run = len > STICK_RADIUS * 1.18; // push past the ring to sprint
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    this.stickEl.classList.toggle('run', run);
    let m = Math.min(1, len / STICK_RADIUS);
    m = m < 0.14 ? 0 : (m - 0.14) / 0.86; // dead zone
    if (len > 0) { dx /= len; dy /= len; }
    this.input.analog = m > 0 ? { x: dx * m, y: -dy * m, run } : null;
  }

  // ---------------------------------------------------------------- buttons
  bindButton(btn, code) {
    if (code === 'Escape' || code === 'Tab') {
      // pause / map are UI actions handled by the session (as their keys are). On click, not on
      // pointerdown: the overlay they open must not receive the rest of the same tap.
      btn.addEventListener('click', () => btn.dispatchEvent(new CustomEvent('touch-action', { bubbles: true, detail: { code } })));
      return;
    }
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.input.enabled) return;
      try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
      this.buttons.set(e.pointerId, { code, el: btn });
      btn.classList.add('down');
      this.input.virtualDown(code, true);
    });
    const up = (e) => {
      const b = this.buttons.get(e.pointerId);
      if (!b) return;
      this.buttons.delete(e.pointerId);
      b.el.classList.remove('down');
      this.input.virtualDown(b.code, false);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  releaseStick() {
    this.stick = null;
    this.stickEl.classList.remove('on', 'run');
    this.stickEl.style.removeProperty('--x');
    this.stickEl.style.removeProperty('--y');
    this.knob.style.transform = '';
    this.input.analog = null;
  }

  resetPointers() {
    this.releaseStick();
    this.looks.clear();
    this.pinch = 0;
    for (const b of this.buttons.values()) b.el.classList.remove('down');
    this.buttons.clear();
    this.input.analog = null;
  }

  /** Per-frame: contextual buttons and the cast button's icon and cooldown. */
  update({ talk, ride, riding, followers, selected, unlocked, cooldown }) {
    if (!this.active) return;
    this.el.talk.classList.toggle('hot', !!talk);
    this.el.ride.hidden = !(ride || riding);
    this.el.follow.hidden = !(followers > 0);
    if (selected !== this.lastSelected) {
      this.lastSelected = selected;
      this.castIco.innerHTML = MIRACLE_ICONS[MIRACLES[selected].id];
    }
    this.el.cast.classList.toggle('locked', !unlocked);
    this.castCd.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, cooldown)) * 100)}%`);
  }
}
