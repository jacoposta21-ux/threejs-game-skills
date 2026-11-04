import type { Game } from '../game/Game';
import { HOSTS, HOST_ORDER, type HostKind } from '../characters/Archetypes';
import { MISSIONS, currentStep } from '../gameplay/Missions';
import { ACHIEVEMENTS } from '../gameplay/Achievements';
import { AREAS, areaInfo } from '../gameplay/types';
import { Progress, saveSettings } from '../gameplay/Progress';

const root = () => document.querySelector<HTMLElement>('#menus')!;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export type Screen = 'none' | 'title' | 'pause' | 'journal' | 'collection' | 'settings' | 'discover' | 'ending' | 'confirm';

export class Menus {
  screen: Screen = 'none';
  private back: Screen = 'title';
  private collectionTab: 'hosts' | 'achievements' | 'postcards' = 'hosts';
  private onClose: (() => void) | null = null;

  constructor(private readonly g: Game) {
    root().addEventListener('pointerover', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.btn,.tab,.toggle,.mission-row')) this.g.audio.play('uiHover', { volume: 0.4 });
    });
  }

  private set(html: string, dim = true): HTMLElement {
    const r = root();
    r.innerHTML = `<div class="screen${dim ? ' dim' : ''}">${html}</div>`;
    return r.firstElementChild as HTMLElement;
  }

  private bind(el: HTMLElement, sel: string, fn: () => void): void {
    el.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.g.audio.unlock();
        this.g.audio.play('uiClick');
        fn();
      }),
    );
  }

  close(): void {
    this.screen = 'none';
    root().innerHTML = '';
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  // ------------------------------------------------------------- title
  title(): void {
    this.screen = 'title';
    const has = Progress.hasSave();
    const el = this.set(
      `<div class="title-wrap">
        <div class="logo"><span class="l1">SHELL</span><span class="l2">SWITCH</span><span class="tag">A tiny alien. A whole town of bodies.</span></div>
        <div class="btn-col">
          ${has ? '<button class="btn primary" data-a="continue">Continue</button>' : ''}
          <button class="btn ${has ? '' : 'primary'}" data-a="new">${has ? 'New Game' : 'Play'}</button>
          <button class="btn" data-a="collection">Collection</button>
          <button class="btn" data-a="settings">Settings</button>
        </div>
      </div>
      <div class="menu-foot">WASD move · Mouse look · E possess/use · F ability · Q hop out · Space jump · Shift run</div>`,
      false,
    );
    this.bind(el, '[data-a=continue]', () => this.g.startGame(false));
    this.bind(el, '[data-a=new]', () => {
      if (has) this.confirm('Start over? Your saved progress will be erased.', () => this.g.startGame(true), () => this.title());
      else this.g.startGame(true);
    });
    this.bind(el, '[data-a=collection]', () => this.collection('title'));
    this.bind(el, '[data-a=settings]', () => this.settings('title'));
    el.querySelector<HTMLElement>('.btn')?.focus();
  }

  confirm(text: string, yes: () => void, no: () => void): void {
    this.screen = 'confirm';
    const el = this.set(`<div class="panel" style="width:min(420px,100%)"><header><h2>Are you sure?</h2></header><div class="body"><p style="font-weight:800">${esc(text)}</p><div class="btn-col" style="width:100%"><button class="btn danger" data-a="y">Yes, start over</button><button class="btn" data-a="n">Cancel</button></div></div></div>`);
    this.bind(el, '[data-a=y]', yes);
    this.bind(el, '[data-a=n]', no);
  }

  // ------------------------------------------------------------- pause
  pause(): void {
    this.screen = 'pause';
    const p = this.g.progress;
    const [bits, total] = this.g.bitsCount();
    const el = this.set(
      `<div class="panel" style="width:min(420px,100%)">
        <header><h2>Paused</h2><span style="font-weight:800">${Math.floor(p.playTime / 60)} min played</span></header>
        <div class="body">
          <div class="stats-row">
            <div class="stat">Star Cores <b>${p.cores}/5</b></div>
            <div class="stat">Star Bits <b>${bits}/${total}</b></div>
            <div class="stat">Hosts <b>${p.discovered.size}/${HOST_ORDER.length}</b></div>
          </div>
          <div class="btn-col" style="width:100%">
            <button class="btn primary" data-a="resume">Resume</button>
            <button class="btn" data-a="journal">Mission Journal</button>
            <button class="btn" data-a="collection">Collection</button>
            <button class="btn" data-a="settings">Settings</button>
            <button class="btn" data-a="unstuck">I'm stuck! (return to area entrance)</button>
            <button class="btn danger" data-a="quit">Save &amp; Quit to Title</button>
          </div>
        </div>
      </div>`,
    );
    this.bind(el, '[data-a=resume]', () => this.g.resume());
    this.bind(el, '[data-a=journal]', () => this.journal('pause'));
    this.bind(el, '[data-a=collection]', () => this.collection('pause'));
    this.bind(el, '[data-a=settings]', () => this.settings('pause'));
    this.bind(el, '[data-a=unstuck]', () => {
      this.g.resume();
      this.g.unstuck();
    });
    this.bind(el, '[data-a=quit]', () => this.g.quitToTitle());
  }

  // ------------------------------------------------------------- journal
  journal(back: Screen): void {
    this.screen = 'journal';
    this.back = back;
    const g = this.g;
    const areas = AREAS.map((a) => {
      const ms = MISSIONS.filter((m) => m.area === a.id);
      const rows = ms
        .map((m) => {
          const doneM = g.progress.missions.has(m.id);
          const avail = m.available(g);
          const step = currentStep(m, g);
          const status = doneM ? '✔' : avail ? '◆' : '🔒';
          const tracked = g.trackedMission?.id === m.id;
          const sub = doneM ? 'Complete' : avail ? esc(m.steps[Math.min(step, m.steps.length - 1)].text) : 'Locked';
          return `<div class="mission-row${tracked ? ' tracked' : ''}${avail && !doneM ? '' : ' locked'}" data-m="${m.id}">
            <span class="st">${status}</span>
            <div>${esc(m.title)}<small>${avail || doneM ? esc(m.blurb) : ''}</small><small>${sub}</small></div>
            <span class="rw">${esc(m.reward)}</span></div>`;
        })
        .join('');
      const [bg, bt] = g.bitsCount(a.id);
      return `<div class="mission-area"><h3><i style="background:${a.color}"></i>${esc(a.name)} <small style="opacity:.7;font-size:12px">★ ${bg}/${bt}</small></h3>${rows}</div>`;
    }).join('');
    const el = this.set(
      `<div class="panel"><header><h2>Mission Journal</h2><button class="btn" data-a="back">Back</button></header>
      <div class="body"><p style="margin:0 0 10px;font-weight:700;opacity:.85">Click an available mission to track it. Missions can be done in any order once unlocked.</p>${areas}</div></div>`,
    );
    this.bind(el, '[data-a=back]', () => this.goBack());
    el.querySelectorAll<HTMLElement>('.mission-row').forEach((r) =>
      r.addEventListener('click', () => {
        const m = MISSIONS.find((x) => x.id === r.dataset.m);
        if (!m || !m.available(g) || g.progress.missions.has(m.id)) return;
        g.audio.play('uiClick');
        g.track(m.id);
        this.journal(back);
      }),
    );
  }

  private goBack(): void {
    if (this.back === 'pause') this.pause();
    else if (this.back === 'title') this.title();
    else this.close();
  }

  // ------------------------------------------------------------- collection
  collection(back: Screen): void {
    this.screen = 'collection';
    this.back = back;
    const g = this.g;
    const p = back === 'title' ? (Progress.load() ?? g.progress) : g.progress;
    let body = '';
    if (this.collectionTab === 'hosts') {
      body = `<div class="grid-hosts">${HOST_ORDER.map((id) => this.hostCard(id, p.discovered.has(id))).join('')}</div>`;
    } else if (this.collectionTab === 'achievements') {
      body = ACHIEVEMENTS.map((a) => {
        const got = p.achievements.has(a.id);
        const name = got || !a.hidden ? a.name : '???';
        const desc = got || !a.hidden ? a.desc : 'Hidden achievement — keep experimenting!';
        return `<div class="ach-row${got ? ' got' : ''}"><div class="medal"></div><div><b>${esc(name)}</b><span>${esc(desc)}</span></div></div>`;
      }).join('');
    } else {
      body = g.postcards
        .map((pc) => {
          const got = p.collected.has(pc.id);
          return got
            ? `<div class="postcard"><b>${esc(pc.title)}</b>${esc(pc.text)} <small>— ${esc(areaInfo(pc.area).name)}</small></div>`
            : `<div class="postcard locked"><b style="color:#fff">??? — ${esc(areaInfo(pc.area).name)}</b>A secret is hiding somewhere here.</div>`;
        })
        .join('');
    }
    const [bits, total] = g.bitsCount();
    const el = this.set(
      `<div class="panel"><header><h2>Collection</h2><button class="btn" data-a="back">Back</button></header>
      <div class="body">
        <div class="stats-row">
          <div class="stat">Hosts <b>${p.discovered.size}/${HOST_ORDER.length}</b></div>
          <div class="stat">Star Bits <b>${bits}/${total}</b></div>
          <div class="stat">Postcards <b>${g.postcards.filter((x) => p.collected.has(x.id)).length}/${g.postcards.length}</b></div>
          <div class="stat">Achievements <b>${p.achievements.size}/${ACHIEVEMENTS.length}</b></div>
        </div>
        <div class="tabs" style="margin-bottom:12px">
          <button class="tab ${this.collectionTab === 'hosts' ? 'on' : ''}" data-t="hosts">Hosts</button>
          <button class="tab ${this.collectionTab === 'achievements' ? 'on' : ''}" data-t="achievements">Achievements</button>
          <button class="tab ${this.collectionTab === 'postcards' ? 'on' : ''}" data-t="postcards">Postcards</button>
        </div>
        ${body}
      </div></div>`,
    );
    this.bind(el, '[data-a=back]', () => this.goBack());
    el.querySelectorAll<HTMLElement>('[data-t]').forEach((t) =>
      t.addEventListener('click', () => {
        g.audio.play('uiClick');
        this.collectionTab = t.dataset.t as typeof this.collectionTab;
        this.collection(back);
      }),
    );
  }

  private hostCard(id: HostKind, known: boolean): string {
    const h = HOSTS[id];
    const img = this.g.portraits[id] ?? '';
    if (!known) {
      return `<div class="host-card locked"><img src="${img}" alt="" /><h3>???</h3><p>Not yet possessed.</p></div>`;
    }
    return `<div class="host-card"><img src="${img}" alt="${esc(h.name)}" /><h3>${esc(h.name)}</h3><div style="font-size:11px;opacity:.8">${esc(h.title)}</div><span class="ab" style="background:${h.color === '#2a2238' ? '#b79cf0' : h.color}">F · ${esc(h.ability)}</span><p>${esc(h.abilityHint)}</p><p style="opacity:.7">${esc(h.bio)}</p></div>`;
  }

  // ------------------------------------------------------------- settings
  settings(back: Screen): void {
    this.screen = 'settings';
    this.back = back;
    const s = this.g.settings;
    const el = this.set(
      `<div class="panel" style="width:min(560px,100%)"><header><h2>Settings</h2><button class="btn" data-a="back">Back</button></header>
      <div class="body">
        <label class="setting">Music volume<input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music" /></label>
        <label class="setting">Sound effects<input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx" /></label>
        <label class="setting">Camera sensitivity<input type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}" data-k="sensitivity" /></label>
        <div class="setting">Invert camera Y<button class="toggle ${s.invertY ? 'on' : ''}" data-b="invertY">${s.invertY ? 'On' : 'Off'}</button></div>
        <div class="setting">Graphics quality<button class="toggle ${s.quality === 'high' ? 'on' : ''}" data-b="quality">${s.quality === 'high' ? 'High' : 'Low'}</button></div>
        <div class="setting">Reduce motion &amp; shake<button class="toggle ${s.reducedMotion ? 'on' : ''}" data-b="reducedMotion">${s.reducedMotion ? 'On' : 'Off'}</button></div>
        <div class="setting">Objective marker<button class="toggle ${s.showHints ? 'on' : ''}" data-b="showHints">${s.showHints ? 'On' : 'Off'}</button></div>
        <div class="controls-help">
          <div><kbd>WASD</kbd>Move</div><div><kbd>Shift</kbd>Run</div><div><kbd>Space</kbd>Jump</div>
          <div><kbd>E</kbd>Possess / use / talk</div><div><kbd>F</kbd>Host ability</div><div><kbd>Q</kbd>Hop out of host</div>
          <div><kbd>Mouse</kbd>Camera (click to lock)</div><div><kbd>Tab</kbd>Journal</div><div><kbd>Esc</kbd>Pause</div>
        </div>
      </div></div>`,
    );
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as 'music' | 'sfx' | 'sensitivity';
        s[k] = Number(inp.value);
        this.g.applySettings();
        saveSettings(s);
      }),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.b!;
        if (k === 'quality') s.quality = s.quality === 'high' ? 'low' : 'high';
        else if (k === 'invertY' || k === 'reducedMotion' || k === 'showHints') s[k] = !s[k];
        this.g.audio.play('uiClick');
        this.g.applySettings();
        saveSettings(s);
        this.settings(back);
      }),
    );
    this.bind(el, '[data-a=back]', () => this.goBack());
  }

  // ------------------------------------------------------------- discovery card
  discover(id: HostKind, onClose: () => void): void {
    this.screen = 'discover';
    const h = HOSTS[id];
    this.onClose = onClose;
    const el = this.set(
      `<div class="panel discover"><img src="${this.g.portraits[id]}" alt="" style="background:${h.color}" />
        <div class="sub" style="color:${h.color === '#2a2238' ? '#b79cf0' : h.color};margin-top:8px">NEW HOST DISCOVERED</div>
        <h2>${esc(h.name)}</h2><div class="sub">${esc(h.title)}</div>
        <p><kbd>F</kbd> <b>${esc(h.ability)}</b> — ${esc(h.abilityHint)}</p>
        <p style="opacity:.8">${esc(h.bio)}</p>
        <button class="btn primary" data-a="ok" style="width:100%">Let's go!</button></div>`,
    );
    this.bind(el, '[data-a=ok]', () => this.close());
    el.querySelector<HTMLElement>('[data-a=ok]')?.focus();
  }

  // ------------------------------------------------------------- ending
  ending(): void {
    this.screen = 'ending';
    const p = this.g.progress;
    const [bits, total] = this.g.bitsCount();
    const el = this.set(
      `<div class="panel ending" style="width:min(560px,100%)"><div class="body" style="text-align:center">
        <h1>HOME, SWEET ORBIT</h1>
        <p style="font-weight:800;font-size:16px">Glim's saucer hiccups back into the sky. Somewhere in Fizzwick, a porter, a police officer, a clown, a chef, a thief, a singer, a ghost, a professor and a mayor all wake up with the very same craving for space jelly.</p>
        <div class="stats-row" style="justify-content:center">
          <div class="stat">Time <b>${Math.floor(p.playTime / 60)}m ${Math.round(p.playTime % 60)}s</b></div>
          <div class="stat">Star Bits <b>${bits}/${total}</b></div>
          <div class="stat">Postcards <b>${this.g.postcards.filter((x) => p.collected.has(x.id)).length}/${this.g.postcards.length}</b></div>
          <div class="stat">Achievements <b>${p.achievements.size}/${ACHIEVEMENTS.length}</b></div>
          <div class="stat">Times caught <b>${p.stat('caught')}</b></div>
        </div>
        <p style="opacity:.85;font-weight:700">Created by an independent Fizzwick studio. Every model, melody and pratfall made from scratch.</p>
        <div class="btn-col" style="margin:0 auto"><button class="btn primary" data-a="free">Keep exploring Fizzwick</button><button class="btn" data-a="title">Title screen</button></div>
      </div></div>`,
    );
    this.bind(el, '[data-a=free]', () => this.g.endEnding());
    this.bind(el, '[data-a=title]', () => {
      this.g.endEnding();
      this.g.quitToTitle();
    });
  }
}
