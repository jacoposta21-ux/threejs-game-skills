import * as THREE from 'three';
import type { GameManager } from '../game/GameManager';
import type { RaceMarble } from '../marbles/MarbleManager';
import { KIND_LABEL, SKINS, getSkin, skinCss } from '../marbles/MarbleSkins';
import { levelFromXp, type Reward } from '../meta/ProgressionManager';
import type { Quality } from '../meta/Settings';
import { CHALLENGES, challengeUnlocked, evaluate, type ChallengeDef } from '../modes/ChallengeManager';
import { BUILTIN_TRACKS } from '../modes/builtinTracks';
import type { Difficulty } from '../modes/RandomTrackGenerator';
import { ART_SKINS } from '../marbles/ArtSkins';
import { CAM_LABEL, type CamMode } from '../race/CameraManager';
import type { RaceResult } from '../race/RaceManager';
import { ENVIRONMENTS } from '../scene/Environments';
import { TRACK_COLORS } from '../scene/Materials';
import { CATEGORY_LABELS, PIECES, getDef } from '../track/catalog';
import { cloneTrack } from '../track/Track';
import { validateTrack } from '../track/TrackValidator';
import type { Category, TrackData } from '../track/types';
import { icon } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const fmtTime = (t: number): string => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

type Act = (el: HTMLElement, ev: Event) => void;

export class UIManager {
  private root = $('#ui');
  private screenEl = $('#screen');
  private editorEl = $('#editor-hud');
  private raceEl = $('#race-hud');
  private modalEl = $('#modal');
  private countdownEl = $('#countdown');
  private toastsEl = $('#toasts');
  private labelsEl = $('#labels');
  private tutorialEl = $('#tutorial');
  private fpsEl = $('#fps');
  private loadingEl = $('#loading');
  private actions: Record<string, Act> = {};
  private libCategory: Category = 'gates';
  private propsKey = '';
  private feed: string[] = [];
  private labelEls: HTMLElement[] = [];
  private tutorialStep = -1;
  private randomDifficulty: Difficulty = 'medium';
  private randomResult: { track: TrackData; finishers: number; attempts: number } | null = null;
  private collectionTab: 'marbles' | 'pieces' | 'envs' = 'marbles';
  private playTab: 'featured' | 'mine' = 'featured';

  constructor(private readonly game: GameManager) {
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || el.hasAttribute('disabled')) return;
      const fn = this.actions[el.dataset.act as string];
      if (fn) {
        this.game.audio.unlock();
        if (!el.dataset.silent) this.game.audio.click();
        fn(el, e);
      }
    });
    this.root.addEventListener('pointerover', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('button, .card');
      if (el && (e as PointerEvent).pointerType === 'mouse') this.game.audio.hover();
    });
    this.registerActions();
    window.addEventListener('resize', () => this.positionTutorial());
  }

  /* ------------------------------------------------------------ helpers */

  private hud(): string {
    const p = this.game.progress;
    const lv = levelFromXp(p.data.xp);
    return `<div class="top-hud">
      <div class="lvl-badge" title="Level ${lv.level}"><span class="lvl-num">${lv.level}</span><div class="xp"><div class="xp-fill" style="width:${((lv.into / lv.need) * 100).toFixed(1)}%"></div></div><span class="xp-txt">${lv.into}/${lv.need} XP</span></div>
      <div class="coins">${icon('coin')}<b>${p.data.coins}</b></div>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${icon('settings')}</button>
    </div>`;
  }

  toast(msg: string, kind: 'info' | 'good' | 'error' | 'gold' = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `${icon(kind === 'error' ? 'warn' : kind === 'gold' ? 'trophy' : kind === 'good' ? 'check' : 'info')}<span>${esc(msg)}</span>`;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  fps(v: number): void {
    const show = this.game.settings.data.showFps;
    this.fpsEl.hidden = !show;
    if (show) {
      const info = this.game.scene.renderer.info.render;
      this.fpsEl.textContent = `${v.toFixed(0)} FPS · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris`;
    }
  }

  loading(frac: number, text: string): void {
    const bar = $('.load-fill', this.loadingEl);
    const t = $('.load-text', this.loadingEl);
    if (bar) bar.style.width = `${Math.round(frac * 100)}%`;
    if (t) t.textContent = text;
  }

  hideLoading(): void {
    this.loadingEl.classList.add('done');
    setTimeout(() => (this.loadingEl.hidden = true), 600);
  }

  private clearLayers(): void {
    this.screenEl.innerHTML = '';
    this.screenEl.className = '';
    this.editorEl.hidden = true;
    this.raceEl.hidden = true;
    this.labelsEl.innerHTML = '';
    this.labelEls = [];
    this.hideModal();
    this.tutorialEl.hidden = true;
    document.body.classList.remove('in-editor', 'in-race');
  }

  hideModal(): void {
    this.modalEl.hidden = true;
    this.modalEl.innerHTML = '';
  }

  private modal(html: string, cls = ''): void {
    this.modalEl.innerHTML = `<div class="modal-backdrop" data-act="modalBackdrop" data-silent="1"></div><div class="modal ${cls}" role="dialog">${html}</div>`;
    this.modalEl.hidden = false;
  }

  confirm(title: string, text: string, ok: string, fn: () => void, danger = false): void {
    this.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn ${danger ? 'red' : 'green'}" data-act="confirmOk">${esc(ok)}</button></div>`, 'small');
    this.actions.confirmOk = () => {
      this.hideModal();
      fn();
    };
  }

  prompt(title: string, value: string, fn: (v: string) => void): void {
    this.modal(`<h2>${esc(title)}</h2><input class="text-in" id="promptIn" maxlength="40" value="${esc(value)}"/><div class="row end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn green" data-act="promptOk">OK</button></div>`, 'small');
    const input = $<HTMLInputElement>('#promptIn');
    input.focus();
    input.select();
    const done = (): void => {
      const v = input.value.trim();
      this.hideModal();
      if (v) fn(v);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done();
    });
    this.actions.promptOk = done;
  }

  /* ---------------------------------------------------------- actions */

  private registerActions(): void {
    const g = this.game;
    const acts: Record<string, Act> = {
      closeModal: () => this.hideModal(),
      modalBackdrop: () => {
        if (!this.modalEl.querySelector('.modal.sticky')) this.hideModal();
      },
      play: () => g.openPlayHub(),
      builder: () => this.showBuilderStart(),
      challenges: () => {
        g.race.stop();
        g.setScreen('challenges');
        this.showChallenges();
      },
      random: () => g.openRandom(),
      collection: () => {
        g.setScreen('collection');
        this.showCollection();
      },
      settings: () => this.showSettings(),
      menu: () => {
        if (g.screen === 'online' && g.online.active) {
          this.confirm('Leave the room?', g.online.isHost ? 'The room closes for everyone.' : 'You can rejoin with the same code.', 'Leave', () => {
            g.online.leave();
            g.goMenu();
          }, true);
          return;
        }
        g.goMenu();
      },
      online: () => g.openOnline(),
      onlineCreate: () => {
        this.saveOnlineName();
        g.online.createRoom(g.settings.data.playerName, g.settings.data.onlineSkin);
      },
      onlineJoin: () => {
        this.saveOnlineName();
        const code = ($<HTMLInputElement>('#codeIn')?.value ?? '').trim();
        g.online.joinRoom(code, g.settings.data.playerName, g.settings.data.onlineSkin);
      },
      onlineLeave: () => g.online.leave(),
      onlineStart: () => {
        this.hideModal();
        g.online.startRace();
      },
      onlineLobby: () => {
        this.hideModal();
        g.race.stop();
        g.openOnline();
      },
      onlineSkin: (el) => {
        const id = el.dataset.skin as string;
        g.settings.set('onlineSkin', id);
        if (g.online.active) g.online.setSkin(id);
        else this.showOnline();
      },
      onlineCopy: () => this.copy(g.online.code, 'Room code copied'),
      onlineCopyLink: () => {
        const link = g.online.inviteLink();
        if (link) this.copy(link, 'Invite link copied');
        else this.copy(g.online.code, 'Room code copied (links need the online version)');
      },
      newTrack: () => {
        this.hideModal();
        g.newCreativeTrack();
      },
      continueTrack: () => {
        this.hideModal();
        g.continueCreative();
      },
      myTracks: () => {
        this.hideModal();
        this.playTab = 'mine';
        g.openPlayHub();
      },
      playTab: (el) => {
        this.playTab = el.dataset.tab as 'featured' | 'mine';
        this.showPlayHub();
      },
      quickRace: () => g.quickRace(),
      raceBuiltin: (el) => g.raceBuiltin(el.dataset.id as string),
      editBuiltin: (el) => {
        const info = BUILTIN_TRACKS.find((b) => b.id === el.dataset.id);
        if (!info) return;
        const t = info.make();
        t.id = `t${Date.now().toString(36)}`;
        t.name = `${t.name} (remix)`;
        t.meta = { ...(t.meta ?? {}), source: 'creative' };
        g.openEditor(t, { mode: 'creative', returnTo: 'play' });
      },
      raceSaved: (el) => {
        const t = g.saves.get(el.dataset.id as string);
        if (!t) return;
        if (!validateTrack(t.pieces).ok) {
          this.toast('This track is not finished yet — open it in the builder.', 'error');
          return;
        }
        g.raceTrack(t, 'play');
      },
      editSaved: (el) => {
        const t = g.saves.get(el.dataset.id as string);
        if (t) g.openEditor(t, { mode: t.meta?.source === 'random' ? 'random' : 'creative', returnTo: 'play', savedId: t.id });
      },
      renameSaved: (el) => {
        const t = g.saves.get(el.dataset.id as string);
        if (!t) return;
        this.prompt('Rename track', t.name, (v) => {
          g.saves.rename(t.id, v);
          this.showPlayHub();
        });
      },
      dupSaved: (el) => {
        g.saves.duplicate(el.dataset.id as string);
        this.toast('Track duplicated', 'good');
        this.showPlayHub();
      },
      delSaved: (el) => {
        const t = g.saves.get(el.dataset.id as string);
        if (!t) return;
        this.confirm('Delete track?', `"${t.name}" will be removed from this device.`, 'Delete', () => {
          g.saves.remove(t.id);
          this.showPlayHub();
        }, true);
      },
      exportSaved: (el) => {
        const t = g.saves.get(el.dataset.id as string);
        if (t) g.saves.exportFile(t);
      },
      importTrack: () => {
        g.saves
          .importFile()
          .then((t) => {
            g.saves.put(t);
            this.toast(`Imported "${t.name}"`, 'good');
            this.playTab = 'mine';
            this.showPlayHub();
          })
          .catch((e: Error) => this.toast(`Import failed: ${e.message}`, 'error'));
      },
      // editor
      edBack: () => this.leaveEditor(),
      libTab: (el) => {
        this.libCategory = el.dataset.cat as Category;
        this.renderLibrary();
      },
      undo: () => g.builder.undo(),
      redo: () => g.builder.redo(),
      rotate: () => g.builder.rotate(1),
      mirror: () => g.builder.toggleMirror(),
      raise: () => g.builder.setHeight(0.5),
      lower: () => g.builder.setHeight(-0.5),
      raiseBig: () => g.builder.setHeight(2),
      lowerBig: () => g.builder.setHeight(-2),
      del: () => g.builder.deleteSelection(),
      dup: () => g.builder.duplicate(),
      copy: () => {
        g.builder.copy();
        this.toast('Copied', 'info');
      },
      paste: () => g.builder.paste(),
      group: () => g.builder.group(),
      ungroup: () => g.builder.ungroup(),
      gridToggle: () => {
        g.builder.gridSnap = !g.builder.gridSnap;
        this.toast(g.builder.gridSnap ? 'Grid snapping ON' : 'Grid snapping OFF (half-unit steps)');
        this.updateEditor();
      },
      freeToggle: () => {
        g.builder.freeMode = !g.builder.freeMode;
        this.toast(g.builder.freeMode ? 'Free placement: connectors ignored' : 'Connector snapping ON');
        this.updateEditor();
      },
      focus: () => g.builder.focusSelection(),
      color: (el) => g.builder.setColor(el.dataset.color as string),
      placeGhost: () => g.builder.placeGhost(),
      cancelPlace: () => g.builder.cancelPlacing(),
      issues: () => this.toggleIssues(),
      expandArea: () => {
        const cur = g.builder.areaHalf;
        const next = cur >= 56 ? 32 : cur + 12;
        g.builder.setArea(next);
        g.scene.setArea(next);
        this.toast(`Build area ${next * 2}×${next * 2}`, 'good');
      },
      saveTrack: () => this.saveCurrent(),
      exportCurrent: () => g.saves.exportFile(g.builder.track),
      clearTrack: () =>
        this.confirm('Clear track?', 'Removes every piece you placed. You can undo this.', 'Clear', () => {
          g.builder.clearAll();
        }, true),
      testRace: () => g.testRace(),
      tutNext: () => this.nextTutorial(),
      tutSkip: () => this.dismissTutorial(),
      help: () => this.showHelp(),
      env: (el) => {
        g.setEnv(el.dataset.env as string);
        g.builder.track.env = el.dataset.env;
        this.updateEditor(true);
      },
      // race
      cam: (el) => g.setCamera(el.dataset.cam as CamMode),
      pause: () => g.togglePause(),
      resume: () => g.togglePause(),
      restartRace: () => {
        g.paused = false;
        g.race.paused = false;
        g.restartRace(false);
      },
      replayRace: () => g.restartRace(true),
      raceAgain: () => void g.breakThen(() => g.restartRace(false)),
      exitRace: () => {
        g.paused = false;
        g.race.paused = false;
        void g.breakThen(() => g.exitRaceToEditor());
      },
      resultsMenu: () => void g.breakThen(() => g.goMenu()),
      follow: (el) => g.selectMarble(Number(el.dataset.i)),
      speed: () => {
        g.race.speed = g.race.speed === 1 ? 2 : g.race.speed === 2 ? 0.5 : 1;
        this.updateRaceHud();
      },
      nextChallenge: () => {
        const i = CHALLENGES.findIndex((c) => c.id === g.session.challenge?.id);
        const next = CHALLENGES[i + 1];
        this.hideModal();
        if (next) g.openChallenge(next);
        else {
          g.setScreen('challenges');
          this.showChallenges();
        }
      },
      // challenges
      openChallenge: (el) => {
        const ch = CHALLENGES.find((c) => c.id === el.dataset.id);
        if (ch) g.openChallenge(ch);
      },
      // random
      rndDiff: (el) => {
        this.randomDifficulty = el.dataset.d as Difficulty;
        this.showRandom();
      },
      rndGen: () => this.generateRandom(),
      rndRace: () => {
        if (!this.randomResult) return;
        const t = cloneTrack(this.randomResult.track);
        g.raceTrack(t, 'random');
      },
      rndEdit: () => {
        if (!this.randomResult) return;
        g.openEditor(cloneTrack(this.randomResult.track), { mode: 'random', returnTo: 'random' });
      },
      rndSave: () => {
        if (!this.randomResult) return;
        const t = cloneTrack(this.randomResult.track);
        t.thumb = g.thumbs.track(g.scene.scene, new THREE.Box3().setFromObject(g.view.root));
        g.saves.put(t);
        this.toast('Saved to My Tracks', 'good');
      },
      // collection
      colTab: (el) => {
        this.collectionTab = el.dataset.tab as 'marbles' | 'pieces' | 'envs';
        this.showCollection();
      },
      buy: (el) => {
        const kind = el.dataset.kind as 'piece' | 'skin' | 'env';
        if (g.progress.buy(kind, el.dataset.id as string)) {
          g.audio.coin();
          this.toast('Unlocked!', 'gold');
        } else {
          g.audio.error();
          this.toast('Not enough coins', 'error');
        }
        this.showCollection();
      },
      useEnv: (el) => {
        g.setEnv(el.dataset.id as string);
        this.toast('Environment selected', 'good');
        this.showCollection();
      },
      // settings
      quality: (el) => {
        g.settings.set('quality', el.dataset.q as Quality);
        this.showSettings();
      },
      toggleMute: () => {
        g.settings.set('muted', !g.settings.data.muted);
        this.showSettings();
      },
      toggleFps: () => {
        g.settings.set('showFps', !g.settings.data.showFps);
        this.showSettings();
      },
      fullscreen: () => g.fullscreen(),
      resetTutorials: () => {
        g.settings.data.tutorials = {};
        g.settings.save();
        this.toast('Tutorials will show again', 'good');
      },
      resetProgress: () =>
        this.confirm('Reset all progress?', 'Levels, coins, unlocks and challenge results will be erased. Saved tracks stay.', 'Reset', () => {
          g.progress.reset();
          this.toast('Progress reset');
          if (g.screen === 'menu') this.showMenu();
        }, true),
    };
    Object.assign(this.actions, acts);
  }

  /* -------------------------------------------------------------- menu */

  showMenu(): void {
    this.clearLayers();
    this.screenEl.className = 'menu-screen';
    const hasAuto = !!this.game.saves.loadAutosave()?.pieces.length;
    this.screenEl.innerHTML = `${this.hud()}
      <div class="menu-col">
        <h1 class="logo"><span class="l1">PICK</span><span class="l2">A</span><span class="l3">MARBLE</span><i class="m m1"></i><i class="m m2"></i><i class="m m3"></i></h1>
        <p class="tagline">Build crazy tracks. Pick your champion. Watch them race.</p>
        <nav class="menu-buttons">
          <button class="btn big pink" data-act="play">${icon('play')}PLAY</button>
          <button class="btn blue" data-act="builder">${icon('layers')}TRACK BUILDER</button>
          <button class="btn orange" data-act="online">${icon('online')}ONLINE</button>
          <button class="btn yellow" data-act="challenges">${icon('trophy')}CHALLENGES</button>
          <button class="btn green" data-act="random">${icon('dice')}RANDOM TRACK</button>
          <button class="btn purple" data-act="collection">${icon('star')}COLLECTION</button>
          <button class="btn ghost" data-act="settings">${icon('settings')}SETTINGS</button>
        </nav>
        ${hasAuto ? '' : ''}
      </div>
      <div class="menu-foot">v1.0 · Drag, snap and race. Progress saves on this device.</div>`;
  }

  showBuilderStart(): void {
    const auto = this.game.saves.loadAutosave();
    const saved = this.game.saves.list().length;
    this.modal(`<h2>${icon('layers')} Track Builder</h2>
      <p>Creative mode: every unlocked piece, no rules. Build anything!</p>
      <div class="choice-grid">
        <button class="choice" data-act="newTrack"><b>${icon('plus')} New track</b><span>Start from an empty platform</span></button>
        <button class="choice" data-act="continueTrack" ${auto?.pieces.length ? '' : 'disabled'}><b>${icon('edit')} Continue</b><span>${auto?.pieces.length ? esc(auto.name) : 'No track in progress'}</span></button>
        <button class="choice" data-act="myTracks"><b>${icon('save')} My tracks</b><span>${saved} saved</span></button>
      </div>
      <div class="row end"><button class="btn ghost" data-act="closeModal">Close</button></div>`);
  }

  /* ---------------------------------------------------------- play hub */

  showPlayHub(): void {
    this.clearLayers();
    this.screenEl.className = 'panel-screen';
    const saved = this.game.saves.list();
    const featured = BUILTIN_TRACKS.map(
      (b) => `<div class="card track-card">
        <div class="tc-thumb diff${b.difficulty}"><span>${'★'.repeat(b.difficulty)}</span></div>
        <h3>${esc(b.name)}</h3><p>${esc(b.desc)}</p>
        <div class="row"><button class="btn small pink" data-act="raceBuiltin" data-id="${b.id}">${icon('play')}Race</button><button class="btn small ghost" data-act="editBuiltin" data-id="${b.id}">${icon('edit')}Remix</button></div>
      </div>`,
    ).join('');
    const mine = saved.length
      ? saved
          .map((t) => {
            const ok = validateTrack(t.pieces).ok;
            return `<div class="card track-card">
          <div class="tc-thumb" style="${t.thumb ? `background-image:url(${t.thumb})` : ''}">${ok ? '' : '<span class="badge warn">Unfinished</span>'}</div>
          <h3>${esc(t.name)}</h3><p>${t.pieces.length} pieces · ${new Date(t.updated).toLocaleDateString()}</p>
          <div class="row wrap">
            <button class="btn small pink" data-act="raceSaved" data-id="${t.id}" ${ok ? '' : 'disabled'}>${icon('play')}Race</button>
            <button class="btn small blue" data-act="editSaved" data-id="${t.id}">${icon('edit')}Edit</button>
            <button class="icon-btn" title="Rename" data-act="renameSaved" data-id="${t.id}">${icon('palette')}</button>
            <button class="icon-btn" title="Duplicate" data-act="dupSaved" data-id="${t.id}">${icon('copy')}</button>
            <button class="icon-btn" title="Export JSON" data-act="exportSaved" data-id="${t.id}">${icon('export')}</button>
            <button class="icon-btn danger" title="Delete" data-act="delSaved" data-id="${t.id}">${icon('trash')}</button>
          </div></div>`;
          })
          .join('')
      : `<div class="empty">No saved tracks yet. Build one in the Track Builder and press Save!</div>`;
    this.screenEl.innerHTML = `${this.hud()}
      <div class="panel wide">
        <header class="panel-head"><button class="icon-btn" data-act="menu" aria-label="Back">${icon('back')}</button><h2>Race Mode</h2>
          <button class="btn yellow" data-act="quickRace">${icon('dice')}Quick Race</button></header>
        <div class="tabs"><button class="tab ${this.playTab === 'featured' ? 'on' : ''}" data-act="playTab" data-tab="featured">Featured tracks</button><button class="tab ${this.playTab === 'mine' ? 'on' : ''}" data-act="playTab" data-tab="mine">My tracks (${saved.length})</button>
        ${this.playTab === 'mine' ? `<button class="btn small ghost push" data-act="importTrack">${icon('import')}Import JSON</button><button class="btn small green" data-act="newTrack">${icon('plus')}New</button>` : ''}</div>
        <div class="card-grid">${this.playTab === 'featured' ? featured : mine}</div>
      </div>`;
  }

  /* ------------------------------------------------------------ editor */

  showEditor(): void {
    this.clearLayers();
    document.body.classList.add('in-editor');
    this.editorEl.hidden = false;
    const g = this.game;
    const ch = g.session.challenge;
    this.editorEl.innerHTML = `
      <div class="ed-top">
        <button class="icon-btn" data-act="edBack" aria-label="Back">${icon('back')}</button>
        <input class="track-name" id="trackName" maxlength="40" value="${esc(g.builder.track.name)}" aria-label="Track name"/>
        <span class="mode-chip ${g.session.mode}">${ch ? `Challenge ${CHALLENGES.indexOf(ch) + 1}` : g.session.mode === 'random' ? 'Random' : 'Creative'}</span>
        <button class="valid-chip" id="validChip" data-act="issues"></button>
        <div class="spacer"></div>
        <span class="coins mini">${icon('coin')}<b>${g.progress.data.coins}</b></span>
        <button class="icon-btn opt" data-act="expandArea" title="Expand build area">${icon('expand')}</button>
        <button class="icon-btn opt" data-act="help" title="Controls">?</button>
        ${ch ? '' : `<button class="icon-btn opt" data-act="exportCurrent" title="Export JSON">${icon('export')}</button><button class="btn small blue" data-act="saveTrack" data-tut="save">${icon('save')}<span class="hide-sm">Save</span></button>`}
      </div>
      <aside class="ed-library" data-tut="library">
        <div class="lib-tabs" id="libTabs"></div>
        <div class="lib-grid" id="libGrid"></div>
      </aside>
      <aside class="ed-props" id="edProps"></aside>
      ${ch ? `<div class="ed-challenge" id="edChallenge"></div>` : ''}
      <div class="ed-issues" id="edIssues" hidden></div>
      <div class="ed-bottom">
        <div class="tool-group">
          <button class="tool" data-act="undo" id="btnUndo" title="Undo (Ctrl+Z)">${icon('undo')}</button>
          <button class="tool" data-act="redo" id="btnRedo" title="Redo (Ctrl+Y)">${icon('redo')}</button>
        </div>
        <div class="tool-group opt">
          <button class="tool" data-act="gridToggle" id="btnGrid" title="Grid snapping (G)">${icon('grid')}</button>
          <button class="tool" data-act="freeToggle" id="btnFree" title="Free placement (ignore connectors)">${icon('magnet')}</button>
        </div>
        <div class="tool-group height" title="Build height (Q / E)">
          <button class="tool" data-act="lower">${icon('down')}</button>
          <span id="hVal">12</span>
          <button class="tool" data-act="raise">${icon('up')}</button>
        </div>
        <div class="tool-group hide-sm">
          <button class="tool" data-act="focus" title="Frame view (F)">${icon('focus')}</button>
          <button class="tool" data-act="clearTrack" title="Clear track">${icon('trash')}</button>
        </div>
        <button class="btn big pink test-btn" data-act="testRace" data-tut="test">${icon('play')}<span>TEST </span>RACE</button>
      </div>
      <div class="touch-place" id="touchPlace" hidden>
        <button class="btn small ghost" data-act="cancelPlace">${icon('x')}</button>
        <button class="btn small ghost" data-act="rotate">${icon('rotate')}</button>
        <button class="btn green" data-act="placeGhost">${icon('check')}Place</button>
      </div>`;
    const nameIn = $<HTMLInputElement>('#trackName');
    nameIn.addEventListener('change', () => {
      g.builder.track.name = nameIn.value.trim().slice(0, 40) || 'Untitled Track';
    });
    nameIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameIn.blur();
      e.stopPropagation();
    });
    if (ch) this.libCategory = 'basic';
    else if (g.builder.track.pieces.some((p) => p.t === 'start') && this.libCategory === 'gates') this.libCategory = 'basic';
    this.renderLibrary();
    this.propsKey = '';
    this.updateEditor(true);
    this.maybeTutorial();
  }

  private renderLibrary(): void {
    const g = this.game;
    const tabs = $('#libTabs');
    const grid = $('#libGrid');
    if (!tabs || !grid) return;
    const cats: Category[] = ['gates', 'basic', 'vertical', 'special', 'decor'];
    tabs.innerHTML = cats.map((c) => `<button class="lib-tab ${c === this.libCategory ? 'on' : ''}" data-act="libTab" data-cat="${c}">${CATEGORY_LABELS[c]}</button>`).join('');
    grid.innerHTML = PIECES.filter((p) => p.category === this.libCategory)
      .map((p) => {
        const allowed = g.builder.canUse(p.id);
        const lockedByLevel = !g.progress.pieceUnlocked(p.id) && g.session.mode === 'creative';
        const title = `${p.name} — ${p.desc}`;
        return `<button class="piece-card ${allowed ? '' : 'locked'} ${g.builder.placing?.defId === p.id ? 'on' : ''}" data-piece="${p.id}" title="${esc(title)}" ${allowed ? '' : 'aria-disabled="true"'}>
          <img src="${g.pieceThumb(p.id)}" alt="" draggable="false"/>
          <span>${esc(p.name)}</span>
          ${!allowed ? `<i class="lock">${icon('lock')}${lockedByLevel && p.unlock ? `Lv${p.unlock.level}` : ''}</i>` : ''}
        </button>`;
      })
      .join('');
    grid.querySelectorAll<HTMLElement>('.piece-card').forEach((el) => {
      el.addEventListener('pointerdown', (e) => this.libraryPointerDown(e, el.dataset.piece as string));
      // double-click / double-tap appends the piece onto the current exit
      el.addEventListener('dblclick', () => {
        const b = this.game.builder;
        if (b.placing?.defId === el.dataset.piece && b.ghostState?.snapped) b.placeGhost();
      });
    });
  }

  private libraryPointerDown(e: PointerEvent, defId: string): void {
    const g = this.game;
    g.audio.unlock();
    if (!g.builder.canUse(defId)) {
      const def = getDef(defId);
      g.audio.error();
      if (g.session.challenge) this.toast('Not available in this challenge', 'error');
      else if (def.unlock) this.toast(`Unlocks at level ${def.unlock.level} — or buy it in the Collection for ${def.unlock.coins} coins`, 'error');
      return;
    }
    e.preventDefault();
    g.builder.startPlacing(defId);
    g.audio.click();
    this.renderLibrary();
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent): void => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) {
        dragging = true;
        g.builder.dragFromLibrary = true;
      }
      if (dragging) g.builder.libraryDragMove(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      g.builder.dragFromLibrary = false;
      if (dragging) {
        const over = document.elementFromPoint(ev.clientX, ev.clientY);
        if (over === g.canvas) {
          g.builder.libraryDragMove(ev.clientX, ev.clientY);
          g.builder.placeGhost();
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  updateEditor(force = false): void {
    const g = this.game;
    if (g.screen !== 'editor' || this.editorEl.hidden) return;
    const b = g.builder;
    const v = b.validation;
    const chip = $('#validChip');
    if (chip) {
      const errors = v.issues.filter((i) => i.level === 'error').length;
      const warns = v.issues.filter((i) => i.level === 'warn').length;
      chip.className = `valid-chip ${errors ? 'bad' : warns ? 'warn' : 'ok'}`;
      chip.innerHTML = errors ? `${icon('warn')}<span>${errors} problem${errors > 1 ? 's' : ''}</span>` : warns ? `${icon('warn')}<span>${warns} warning${warns > 1 ? 's' : ''}</span>` : `${icon('check')}<span>Ready to race</span>`;
    }
    $('#btnUndo')?.toggleAttribute('disabled', !b.history.canUndo);
    $('#btnRedo')?.toggleAttribute('disabled', !b.history.canRedo);
    $('#btnGrid')?.classList.toggle('on', b.gridSnap);
    $('#btnFree')?.classList.toggle('on', !b.freeMode);
    const hv = $('#hVal');
    if (hv) hv.textContent = b.selection.size && !b.placing ? 'SEL' : b.buildHeight.toFixed(1);
    const tp = $('#touchPlace');
    if (tp) tp.hidden = !(b.placing && b.touchMode);
    // properties panel
    const sel = b.selectedPieces();
    const key = `${b.placing?.defId}|${b.placing?.mirror}|${[...b.selection].join(',')}|${sel.map((p) => `${p.c}${p.g}${p.m}`).join()}|${g.progress.data.coins}|${b.ghostState?.ok}|${b.track.env}`;
    if (force || key !== this.propsKey) {
      this.propsKey = key;
      this.renderProps();
      this.renderLibrary();
    }
    if (!$('#edIssues')?.hidden) this.renderIssues();
    this.renderChallenge();
  }

  private renderProps(): void {
    const g = this.game;
    const b = g.builder;
    const el = $('#edProps');
    if (!el) return;
    el.classList.remove('idle');
    if (b.placing) {
      const def = getDef(b.placing.defId);
      el.innerHTML = `<div class="props-head"><img src="${g.pieceThumb(def.id)}" alt=""/><div><h3>${esc(def.name)}</h3><span class="muted">Placing · ${def.size} cells</span></div></div>
        <p class="desc">${esc(def.desc)}</p>
        ${b.ghostState && !b.ghostState.ok ? `<p class="warn-line">${icon('warn')}${esc(b.ghostState.reason ?? 'Cannot place here')}</p>` : ''}
        <div class="row wrap">
          <button class="btn small ghost" data-act="rotate">${icon('rotate')}Rotate <kbd>R</kbd></button>
          ${def.mirrorable ? `<button class="btn small ghost" data-act="mirror">${icon('mirror')}Mirror <kbd>M</kbd></button>` : ''}
          <button class="btn small ghost" data-act="cancelPlace">${icon('x')}Cancel <kbd>Esc</kbd></button>
        </div>
        <p class="hint">${def.ports.length ? 'Move near a <b class="g">green arrow</b> to snap onto an open exit. Click to place — keep clicking to place more.' : 'Decorations go anywhere on the build height plane.'}</p>`;
      return;
    }
    const sel = b.selectedPieces();
    if (sel.length === 1) {
      const pd = sel[0];
      const def = getDef(pd.t);
      const locked = b.isLocked(pd.id);
      el.innerHTML = `<div class="props-head"><img src="${g.pieceThumb(def.id)}" alt=""/><div><h3>${esc(def.name)}</h3><span class="muted">${CATEGORY_LABELS[def.category]} · height ${pd.p[1].toFixed(2)}</span></div></div>
        <p class="desc">${esc(def.desc)}</p>
        ${locked ? `<p class="warn-line">${icon('lock')}Part of the challenge — can't be changed.</p>` : `
        <div class="act-grid">
          <button class="tool labeled" data-act="rotate">${icon('rotate')}<span>Rotate</span></button>
          ${def.mirrorable ? `<button class="tool labeled" data-act="mirror">${icon('mirror')}<span>Mirror</span></button>` : ''}
          <button class="tool labeled" data-act="raise">${icon('up')}<span>Raise</span></button>
          <button class="tool labeled" data-act="lower">${icon('down')}<span>Lower</span></button>
          <button class="tool labeled" data-act="dup">${icon('copy')}<span>Duplicate</span></button>
          <button class="tool labeled danger" data-act="del">${icon('trash')}<span>Delete</span></button>
        </div>
        ${def.decor || def.category !== 'decor' ? `<div class="swatches">${TRACK_COLORS.map((c) => `<button class="sw ${(pd.c ?? def.defaultColor) === c ? 'on' : ''}" style="background:${c}" data-act="color" data-color="${c}" aria-label="Colour ${c}"></button>`).join('')}</div>` : ''}
        ${pd.g !== undefined ? `<button class="btn small ghost" data-act="ungroup">${icon('ungroup')}Ungroup</button>` : ''}`}`;
      return;
    }
    if (sel.length > 1) {
      el.innerHTML = `<h3>${sel.length} pieces selected</h3>
        <div class="act-grid">
          <button class="tool labeled" data-act="rotate">${icon('rotate')}<span>Rotate</span></button>
          <button class="tool labeled" data-act="raise">${icon('up')}<span>Raise</span></button>
          <button class="tool labeled" data-act="lower">${icon('down')}<span>Lower</span></button>
          <button class="tool labeled" data-act="copy">${icon('copy')}<span>Copy</span></button>
          <button class="tool labeled" data-act="paste">${icon('layers')}<span>Paste</span></button>
          <button class="tool labeled" data-act="group">${icon('group')}<span>Group</span></button>
          <button class="tool labeled" data-act="ungroup">${icon('ungroup')}<span>Ungroup</span></button>
          <button class="tool labeled danger" data-act="del">${icon('trash')}<span>Delete</span></button>
        </div>
        <div class="swatches">${TRACK_COLORS.map((c) => `<button class="sw" style="background:${c}" data-act="color" data-color="${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
        <p class="hint">Drag any selected piece to move the whole selection.</p>`;
      return;
    }
    el.classList.add('idle');
    const t = b.track;
    const count = t.pieces.filter((p) => !getDef(p.t).decor).length;
    const hasStart = t.pieces.some((p) => p.t === 'start');
    const hasFinish = t.pieces.some((p) => p.t === 'finish');
    el.innerHTML = `<h3>Your track</h3>
      <ul class="checklist">
        <li class="${hasStart ? 'done' : ''}">${icon(hasStart ? 'check' : 'target')}Starting Gate</li>
        <li class="${count > 2 ? 'done' : ''}">${icon(count > 2 ? 'check' : 'target')}Track pieces (${Math.max(0, count - (hasStart ? 1 : 0) - (hasFinish ? 1 : 0))})</li>
        <li class="${hasFinish ? 'done' : ''}">${icon(hasFinish ? 'check' : 'target')}Finish Line</li>
      </ul>
      <p class="hint">Click a piece in the world to select it. Shift-click to multi-select. Drag to move. Right-drag pans, wheel zooms.</p>
      ${g.session.mode !== 'challenge' ? `<h4>Environment</h4><div class="env-row">${ENVIRONMENTS.filter((e) => g.progress.envUnlocked(e.id))
        .map((e) => `<button class="env-sw ${g.scene.env.id === e.id ? 'on' : ''}" data-act="env" data-env="${e.id}" title="${esc(e.name)}" style="background:linear-gradient(180deg, ${e.skyTop}, ${e.skyBottom})"></button>`)
        .join('')}</div>` : ''}`;
  }

  private toggleIssues(): void {
    const el = $('#edIssues');
    if (!el) return;
    el.hidden = !el.hidden;
    this.game.builder.setShowIssues(!el.hidden);
    if (!el.hidden) this.renderIssues();
  }

  private renderIssues(): void {
    const el = $('#edIssues');
    const v = this.game.builder.validation;
    if (!el) return;
    el.innerHTML = `<header><h3>Track check</h3><button class="icon-btn" data-act="issues">${icon('x')}</button></header>
      <ul>${v.issues.map((i) => `<li class="${i.level}">${icon(i.level === 'info' ? 'check' : 'warn')}<span>${esc(i.msg)}</span></li>`).join('')}</ul>
      <p class="hint">Problem pieces are outlined in the world. Warnings won't stop a race — experiment!</p>`;
  }

  private renderChallenge(): void {
    const g = this.game;
    const ch = g.session.challenge;
    const el = $('#edChallenge');
    if (!ch || !el) return;
    const res = evaluate(ch, { track: g.builder.track, validation: g.builder.validation, result: null, marbles: ch.marbles });
    el.innerHTML = `<h3>${icon('trophy')}${esc(ch.title)}</h3><p>${esc(ch.desc)}</p>
      <ul class="objectives">${ch.objectives.map((o, i) => `<li class="${res.states[i] === true ? 'done' : res.states[i] === false ? 'todo' : 'pending'}">${icon(res.states[i] === true ? 'check' : res.states[i] === false ? 'target' : 'play')}${esc(o.label)}</li>`).join('')}</ul>
      <p class="muted">${ch.marbles} marbles${ch.maxPieces ? ` · max ${ch.maxPieces} pieces (${g.builder.pieceCount()} used)` : ''}</p>`;
  }

  saveCurrent(): void {
    const g = this.game;
    if (g.session.mode === 'challenge') return;
    if (g.saveTrack()) {
      this.toast(`Saved "${g.builder.track.name}"`, 'good');
      g.audio.coin();
    } else this.toast('Could not save (storage full or blocked)', 'error');
  }

  private leaveEditor(): void {
    const g = this.game;
    const back = g.session.returnTo;
    const go = (): void => {
      if (back === 'challenges') {
        g.setScreen('challenges');
        g.goMenu();
        g.setScreen('challenges');
        this.showChallenges();
      } else if (back === 'play') g.openPlayHub();
      else if (back === 'random') g.openRandom();
      else g.goMenu();
    };
    const dirty = g.builder.history.canUndo && g.session.mode !== 'challenge' && g.builder.track.pieces.length > 1;
    if (dirty && !g.session.savedId) {
      this.modal(`<h2>Leave the builder?</h2><p>Your track is autosaved for "Continue", but it isn't in My Tracks yet.</p>
        <div class="row end"><button class="btn ghost" data-act="closeModal">Stay</button><button class="btn ghost" data-act="leaveNoSave">Leave</button><button class="btn green" data-act="leaveSave">${icon('save')}Save &amp; leave</button></div>`, 'small');
      this.actions.leaveNoSave = () => {
        this.hideModal();
        go();
      };
      this.actions.leaveSave = () => {
        this.saveCurrent();
        this.hideModal();
        go();
      };
      return;
    }
    if (g.session.savedId && g.session.mode !== 'challenge') g.saveTrack();
    go();
  }

  private showHelp(): void {
    this.modal(`<h2>Builder controls</h2>
      <div class="help-grid">
        <div><h4>Mouse</h4><ul>
          <li><b>Left-drag</b> empty space — orbit</li><li><b>Right-drag</b> — pan</li><li><b>Wheel</b> — zoom</li>
          <li><b>Click</b> a piece — select · <b>Shift-click</b> — add to selection</li><li><b>Drag</b> a selected piece — move</li>
          <li><b>Drag</b> from the library onto the world — place</li></ul></div>
        <div><h4>Keys</h4><ul>
          <li><kbd>R</kbd> rotate · <kbd>M</kbd> mirror · <kbd>Del</kbd> delete</li><li><kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> undo/redo</li>
          <li><kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd>/<kbd>D</kbd> copy/paste/duplicate</li><li><kbd>Ctrl</kbd>+<kbd>G</kbd> group · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> ungroup</li>
          <li><kbd>Q</kbd>/<kbd>E</kbd> raise/lower · <kbd>G</kbd> grid snap · <kbd>F</kbd> focus</li><li><kbd>Space</kbd> test race · <kbd>Esc</kbd> cancel</li></ul></div>
        <div><h4>Touch</h4><ul><li><b>One finger</b> — orbit · <b>Two fingers</b> — pinch zoom &amp; pan</li><li><b>Tap</b> a library piece, then tap the world to move it, and <b>Place</b> to confirm.</li><li>Tap pieces to select, drag to move.</li></ul></div>
      </div>
      <div class="row end"><button class="btn green" data-act="closeModal">Got it</button></div>`);
  }

  /* ---------------------------------------------------------- tutorial */

  private tutorialSteps = [
    { target: '[data-tut="library"]', title: 'Pick a piece', text: 'Choose a track piece from the library. Start with the Starting Gate, then add straights and curves.' },
    { target: 'canvas', title: 'Snap it in place', text: 'Green arrows show open exits. Move a piece near one and it snaps on automatically. Click (or tap Place) to drop it.' },
    { target: '.ed-bottom', title: 'Shape your track', text: 'Rotate with R, raise or lower with the arrows, undo anything. Drag placed pieces to move them.' },
    { target: '[data-tut="test"]', title: 'Race!', text: 'Finish with a Finish Line, then press TEST RACE to pick your marbles and watch them go.' },
  ];

  private maybeTutorial(): void {
    if (this.game.settings.seenTutorial('editor')) return;
    this.tutorialStep = 0;
    this.renderTutorial();
  }

  private renderTutorial(): void {
    const step = this.tutorialSteps[this.tutorialStep];
    if (!step) {
      this.dismissTutorial();
      return;
    }
    this.tutorialEl.hidden = false;
    this.tutorialEl.innerHTML = `<div class="tut-bubble"><span class="tut-count">${this.tutorialStep + 1}/${this.tutorialSteps.length}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p>
      <div class="row end"><button class="btn small ghost" data-act="tutSkip">Skip</button><button class="btn small green" data-act="tutNext">${this.tutorialStep === this.tutorialSteps.length - 1 ? 'Start building' : 'Next'}</button></div></div>`;
    this.positionTutorial();
  }

  private positionTutorial(): void {
    if (this.tutorialEl.hidden) return;
    const step = this.tutorialSteps[this.tutorialStep];
    const bubble = $('.tut-bubble', this.tutorialEl);
    if (!step || !bubble) return;
    const target = document.querySelector(step.target);
    const r = target?.getBoundingClientRect();
    const bw = Math.min(320, window.innerWidth - 24);
    let x = window.innerWidth / 2 - bw / 2;
    let y = window.innerHeight / 2 - 80;
    if (r && step.target !== 'canvas') {
      if (r.right + bw + 24 < window.innerWidth && r.width < window.innerWidth * 0.5) {
        x = r.right + 14;
        y = Math.max(70, Math.min(window.innerHeight - 200, r.top + 20));
      } else {
        x = Math.max(12, Math.min(window.innerWidth - bw - 12, r.left + r.width / 2 - bw / 2));
        y = Math.max(70, r.top - 190);
      }
    }
    bubble.style.width = `${bw}px`;
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  private nextTutorial(): void {
    this.tutorialStep += 1;
    if (this.tutorialStep >= this.tutorialSteps.length) this.dismissTutorial();
    else this.renderTutorial();
  }

  dismissTutorial(): void {
    this.tutorialEl.hidden = true;
    this.tutorialStep = -1;
    this.game.settings.markTutorial('editor');
  }

  /* ------------------------------------------------------- race setup */

  showRaceSetup(initial: RaceMarble[], picked: number, fixedCount: boolean, onStart: (cfg: { marbles: RaceMarble[]; picked: number }) => void): void {
    const g = this.game;
    let marbles = initial.map((m) => ({ ...m }));
    let pick = Math.min(picked, marbles.length - 1);
    const owned = g.progress.ownedSkins();
    const render = (): void => {
      this.modal(`<div class="setup-head"><h2 class="pick-title">PICK YOUR MARBLE</h2><p>Choose your champion. If it wins, you win bonus coins!</p></div>
        <div class="setup-bar">
          <label class="count">Marbles <input type="range" id="mCount" min="2" max="12" value="${marbles.length}" ${fixedCount ? 'disabled' : ''}/><b>${marbles.length}</b></label>
          <button class="btn small ghost" data-act="mShuffle">${icon('shuffle')}Shuffle start order</button>
          <button class="btn small ghost" data-act="mRandom">${icon('dice')}Random skins</button>
        </div>
        <div class="marble-grid">${marbles
          .map(
            (m, i) => `<div class="mcard ${i === pick ? 'picked' : ''}" data-act="mPick" data-i="${i}">
            <span class="slot">#${i + 1}</span>
            <button class="ball" style="background:${skinCss(getSkin(m.skin))}" data-act="mSkin" data-i="${i}" aria-label="Change skin"></button>
            <input class="mname" data-i="${i}" maxlength="14" value="${esc(m.name)}" aria-label="Marble name"/>
            <span class="pick-star">${icon('star')}</span>
          </div>`,
          )
          .join('')}</div>
        <div class="row end"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn big pink" data-act="mStart">${icon('play')}START RACE</button></div>`, 'setup sticky');
      const range = $<HTMLInputElement>('#mCount');
      range?.addEventListener('input', () => {
        const n = Number(range.value);
        if (n > marbles.length) {
          const used = new Set(marbles.map((m) => m.skin));
          for (let i = marbles.length; i < n; i += 1) {
            const skin = owned.find((s) => !used.has(s)) ?? owned[i % owned.length];
            used.add(skin);
            marbles.push({ index: i, skin, name: g.settings.data.lastNames[skin] ?? getSkin(skin).name });
          }
        } else marbles = marbles.slice(0, n);
        pick = Math.min(pick, n - 1);
        render();
      });
      this.modalEl.querySelectorAll<HTMLInputElement>('.mname').forEach((inp) => {
        inp.addEventListener('click', (e) => e.stopPropagation());
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        inp.addEventListener('input', () => {
          marbles[Number(inp.dataset.i)].name = inp.value.slice(0, 14) || getSkin(marbles[Number(inp.dataset.i)].skin).name;
        });
      });
    };
    this.actions.mPick = (el) => {
      pick = Number(el.dataset.i);
      render();
    };
    this.actions.mShuffle = () => {
      const pickedM = marbles[pick];
      for (let i = marbles.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [marbles[i], marbles[j]] = [marbles[j], marbles[i]];
      }
      pick = marbles.indexOf(pickedM);
      render();
    };
    this.actions.mRandom = () => {
      const pool = owned.slice().sort(() => Math.random() - 0.5);
      marbles = marbles.map((m, i) => ({ ...m, skin: pool[i % pool.length], name: getSkin(pool[i % pool.length]).name }));
      render();
    };
    this.actions.mSkin = (el, ev) => {
      ev.stopPropagation();
      const i = Number(el.dataset.i);
      const pop = document.createElement('div');
      pop.className = 'skin-pop';
      pop.innerHTML = `<h4>Choose a skin</h4><div class="skin-grid">${owned
        .map((s) => `<button class="ball sm" data-skin="${s}" title="${esc(getSkin(s).name)}" style="background:${skinCss(getSkin(s))}"></button>`)
        .join('')}</div><p class="muted">Unlock more in the Collection.</p>`;
      this.modalEl.querySelector('.modal')?.appendChild(pop);
      pop.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-skin]');
        e.stopPropagation();
        if (!b) return;
        const skin = b.dataset.skin as string;
        marbles[i] = { ...marbles[i], skin, name: g.settings.data.lastNames[skin] ?? getSkin(skin).name };
        render();
      });
    };
    this.actions.mStart = () => {
      this.hideModal();
      onStart({ marbles: marbles.map((m, i) => ({ ...m, index: i })), picked: pick });
    };
    render();
  }

  /* ---------------------------------------------------------- race hud */

  showRaceHud(): void {
    this.clearLayers();
    document.body.classList.add('in-race');
    this.raceEl.hidden = false;
    this.feed = [];
    const cams: CamMode[] = ['cinematic', 'leader', 'selected', 'overview', 'finish', 'free'];
    this.raceEl.innerHTML = `
      <div class="race-top">
        <div class="timer-box"><span id="rTimer">0:00.00</span><div class="prog"><div id="rProg"></div></div></div>
      </div>
      <div class="race-actions">${
        this.game.race.config?.online
          ? `<span class="online-chip">${icon('online')}Room ${esc(this.game.online.code)} · Round ${this.game.online.round}</span>${this.game.race.config.online === 'guest' ? `<button class="icon-btn" data-act="onlineLobby" title="Back to the lobby">${icon('x')}</button>` : ''}`
          : `<button class="icon-btn" data-act="speed" id="rSpeed" title="Simulation speed">1×</button>
        <button class="icon-btn" data-act="restartRace" title="Restart (R)">${icon('restart')}</button>
        <button class="icon-btn" data-act="pause" title="Pause (Esc)">${icon('pause')}</button>
        <button class="icon-btn" data-act="exitRace" title="Back to editor">${icon('x')}</button>`
      }</div>
      <div class="standings" id="rStand"></div>
      <div class="feed" id="rFeed"></div>
      <div class="follow-card" id="rFollow"></div>
      <div class="cam-bar">${cams.map((c, i) => `<button class="cam ${this.game.cams.mode === c ? 'on' : ''}" data-act="cam" data-cam="${c}" title="${CAM_LABEL[c]} (${i + 1})">${icon(c === 'overview' ? 'expand' : c === 'finish' ? 'trophy' : c === 'free' ? 'focus' : c === 'selected' ? 'target' : 'camera')}<span>${CAM_LABEL[c]}</span></button>`).join('')}</div>`;
    const sim = this.game.race.config;
    if (sim) {
      this.labelsEl.innerHTML = sim.marbles.map((m, i) => `<div class="mlabel ${i === sim.picked ? 'pick' : ''}" id="ml${i}">${i === sim.picked ? icon('star') : ''}${esc(m.name)}</div>`).join('');
      this.labelEls = sim.marbles.map((_, i) => $(`#ml${i}`));
    }
    this.updateRaceHud();
  }

  countdown(text: string): void {
    this.countdownEl.innerHTML = `<span class="cd ${text === 'GO!' ? 'go' : ''}">${text}</span>`;
    const span = this.countdownEl.firstElementChild as HTMLElement;
    void span.offsetWidth;
    span.classList.add('pop');
    if (text === 'GO!') setTimeout(() => (this.countdownEl.innerHTML = ''), 900);
  }

  updateRaceHud(): void {
    const g = this.game;
    if (this.raceEl.hidden) return;
    const rows = g.race.rankings();
    const cfg = g.race.config;
    const timer = $('#rTimer');
    if (timer) timer.textContent = fmtTime(g.race.raceTime);
    const total = g.race.totalLength || 1;
    const lead = rows[0];
    const prog = $('#rProg');
    if (prog && lead) prog.style.width = `${Math.max(0, Math.min(100, (1 - lead.remaining / total) * 100)).toFixed(1)}%`;
    const stand = $('#rStand');
    if (stand && cfg) {
      const leader = rows.find((r) => r.time === null && !r.dnf);
      const leadRem = leader?.remaining ?? 0;
      stand.innerHTML = rows
        .map((r) => {
          const status = r.dnf ? '<em class="dnf">OUT</em>' : r.time !== null ? `<em class="fin">${r.time.toFixed(2)}s</em>` : r === leader ? '<em>LEAD</em>' : `<em>+${Math.max(0, r.remaining - leadRem).toFixed(1)}m</em>`;
          const spd = Math.min(1, r.speed / 18);
          return `<button class="srow ${r.index === g.selectedMarble ? 'sel' : ''} ${r.index === cfg.picked ? 'pick' : ''}" data-act="follow" data-i="${r.index}" data-silent="1">
            <span class="pos">${r.place}</span><span class="ball xs" style="background:${skinCss(getSkin(r.skin))}"></span>
            <span class="nm">${esc(r.name)}${r.index === cfg.picked ? icon('star') : ''}</span>${status}
            <span class="spd"><i style="width:${(spd * 100).toFixed(0)}%"></i></span></button>`;
        })
        .join('');
    }
    document.querySelectorAll<HTMLElement>('.cam').forEach((b) => b.classList.toggle('on', b.dataset.cam === g.cams.mode));
    const sp = $('#rSpeed');
    if (sp) sp.textContent = `${g.race.speed}×`;
    const follow = $('#rFollow');
    if (follow && cfg) {
      const i = g.selectedMarble >= 0 ? g.selectedMarble : cfg.picked;
      const r = rows.find((x) => x.index === i);
      if (r) {
        const kmh = r.speed * 3.6 * 2.5;
        follow.innerHTML = `<span class="ball sm" style="background:${skinCss(getSkin(r.skin))}"></span><div><b>${esc(r.name)}</b><span>${g.selectedMarble >= 0 ? 'Following' : cfg.online ? 'You' : 'Your pick'} · P${r.place}</span></div><div class="kmh"><b>${kmh.toFixed(0)}</b><span>km/h</span></div>`;
      }
    }
  }

  updateLabels(): void {
    const g = this.game;
    const cfg = g.race.config;
    const sim = g.race.sim;
    if (!cfg || !sim || !this.labelEls.length) return;
    const cam = g.scene.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = new THREE.Vector3();
    sim.states.forEach((s, i) => {
      const el = this.labelEls[i];
      if (!el) return;
      const show = !s.dnf && (s.rank < 3 || i === cfg.picked || i === g.selectedMarble);
      v.copy(s.pos).add(new THREE.Vector3(0, 0.6, 0)).project(cam);
      const dist = cam.position.distanceTo(s.pos);
      if (!show || v.z > 1 || dist > 70) {
        el.style.opacity = '0';
        return;
      }
      el.style.opacity = '1';
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    });
  }

  raceFinish(m: number, place: number, time: number): void {
    const cfg = this.game.race.config;
    if (!cfg || cfg.demo) return;
    const name = cfg.marbles[m].name;
    if (place === 1) this.banner(`${name} WINS!`, skinCss(getSkin(cfg.marbles[m].skin)));
    this.pushFeed(`<b>${place}.</b> ${esc(name)} finished · ${time.toFixed(2)}s`);
  }

  raceFall(m: number, eliminated: boolean): void {
    const cfg = this.game.race.config;
    if (!cfg || cfg.demo) return;
    this.pushFeed(`${esc(cfg.marbles[m].name)} ${eliminated ? 'is <b class="r">eliminated</b>' : 'fell off! Back on track…'}`);
  }

  private pushFeed(html: string): void {
    this.feed.unshift(html);
    this.feed = this.feed.slice(0, 4);
    const el = $('#rFeed');
    if (el) el.innerHTML = this.feed.map((f, i) => `<div style="opacity:${1 - i * 0.22}">${f}</div>`).join('');
  }

  private banner(text: string, ball: string): void {
    const el = document.createElement('div');
    el.className = 'win-banner';
    el.innerHTML = `<span class="ball lg" style="background:${ball}"></span><span>${esc(text)}</span>`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  showPause(paused: boolean): void {
    if (!paused) {
      this.hideModal();
      return;
    }
    this.modal(`<h2>Paused</h2><div class="col">
      <button class="btn big green" data-act="resume">${icon('play')}Resume</button>
      <button class="btn blue" data-act="restartRace">${icon('restart')}Restart race</button>
      <button class="btn ghost" data-act="settings">${icon('settings')}Settings</button>
      <button class="btn ghost" data-act="exitRace">${icon('edit')}Back to editor</button></div>`, 'small sticky');
  }

  /* ----------------------------------------------------------- results */

  showResults(result: RaceResult, reward: Reward, ch: ChallengeDef | null, chEval: { states: (boolean | null)[]; passed: boolean } | null): void {
    const g = this.game;
    this.raceEl.hidden = true;
    this.labelsEl.innerHTML = '';
    const cfg = g.race.config;
    if (!cfg) return;
    const win = result.rows[0];
    const pickRow = result.rows.find((r) => r.index === result.picked);
    const yours = cfg.online ? 'Your marble' : 'Your pick';
    const pickMsg =
      result.pickedPlace === 1 ? `<div class="pick-res good">${icon('star')}${yours} <b>${esc(pickRow?.name ?? '')}</b> won!</div>` : pickRow ? `<div class="pick-res">${icon('star')}${yours} <b>${esc(pickRow.name)}</b> finished ${pickRow.dnf ? 'DNF' : `#${pickRow.place}`}</div>` : '';
    const chHtml =
      ch && chEval
        ? `<div class="ch-res ${chEval.passed ? 'pass' : 'fail'}"><h3>${icon('trophy')}${esc(ch.title)} — ${chEval.passed ? 'COMPLETE!' : 'Not yet'}</h3><ul class="objectives">${ch.objectives
            .map((o, i) => `<li class="${chEval.states[i] ? 'done' : 'todo'}">${icon(chEval.states[i] ? 'check' : 'x')}${esc(o.label)}</li>`)
            .join('')}</ul></div>`
        : '';
    const nextCh = ch && chEval?.passed && CHALLENGES[CHALLENGES.indexOf(ch) + 1];
    const online = !!cfg.online;
    const localButtons = `<div class="row end wrap">
        <button class="btn ghost" data-act="resultsMenu">${icon('home')}Menu</button>
        <button class="btn ghost" data-act="replayRace" title="Same seed, same result">${icon('restart')}Replay</button>
        <button class="btn blue" data-act="exitRace">${icon('edit')}Edit track</button>
        <button class="btn pink" data-act="raceAgain">${icon('play')}Race again</button>
        ${nextCh ? `<button class="btn yellow" data-act="nextChallenge">${icon('trophy')}Next challenge</button>` : ''}</div>`;
    this.modal(`<div class="res-head"><span class="ball xl bounce" style="background:${skinCss(getSkin(win.skin))}"></span><div><h2>${esc(win.name)} wins!</h2><p>${win.time !== null ? `${win.time.toFixed(2)} s` : ''} · Race ${result.duration.toFixed(1)} s · seed ${result.seed}</p></div></div>
      ${pickMsg}${chHtml}
      <div class="res-body">
        <ol class="rank-list">${result.rows
          .map(
            (r) => `<li class="${r.index === result.picked ? 'pick' : ''}"><span class="pos p${r.place}">${r.place}</span><span class="ball xs" style="background:${skinCss(getSkin(r.skin))}"></span><span class="nm">${esc(r.name)}</span><span class="tm">${r.dnf ? 'DNF' : r.time !== null ? `${r.time.toFixed(2)}s` : '—'}</span>${r.falls ? `<span class="falls" title="falls">${r.falls}↓</span>` : ''}</li>`,
          )
          .join('')}</ol>
        <div class="rewards"><h3>Rewards</h3><div class="rw-big"><span>+${reward.xp} XP</span><span>${icon('coin')}+${reward.coins}</span></div>
          <ul>${reward.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          ${reward.levelUps.length ? `<div class="levelup">LEVEL UP! Level ${reward.levelUps[reward.levelUps.length - 1]}</div>` : ''}
          ${reward.unlocked.length ? `<ul class="unlocks">${reward.unlocked.map((u) => `<li>${icon('star')}${esc(u)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
      ${online ? this.onlineScoreHtml() : ''}
      ${
        online
          ? `<div class="row end wrap"><button class="btn ghost" data-act="onlineLobby">${icon('online')}Back to lobby</button>${g.online.isHost ? `<button class="btn pink" data-act="onlineStart">${icon('play')}Next race</button>` : '<span class="muted">Waiting for the host to start the next race…</span>'}</div>`
          : localButtons
      }`, 'results sticky');
  }

  /* -------------------------------------------------------- challenges */

  showChallenges(): void {
    this.clearLayers();
    const p = this.game.progress;
    this.screenEl.className = 'panel-screen';
    const done = (id: string): boolean => !!p.data.challenges[id]?.done;
    const count = CHALLENGES.filter((c) => done(c.id)).length;
    this.screenEl.innerHTML = `${this.hud()}<div class="panel wide">
      <header class="panel-head"><button class="icon-btn" data-act="menu" aria-label="Back">${icon('back')}</button><h2>Challenges</h2><span class="muted">${count}/${CHALLENGES.length} complete</span></header>
      <div class="card-grid">${CHALLENGES.map((c, i) => {
        const open = challengeUnlocked(i, done);
        const isDone = done(c.id);
        const reward = `${icon('coin')}${c.reward.coins}${c.reward.skin ? ` + <span class="ball xs" style="background:${skinCss(getSkin(c.reward.skin))}"></span>` : ''}`;
        return `<button class="card ch-card ${open ? '' : 'locked'} ${isDone ? 'done' : ''}" ${open ? `data-act="openChallenge" data-id="${c.id}"` : 'disabled'}>
          <span class="ch-num">${i + 1}</span>${isDone ? `<span class="ch-done">${icon('check')}</span>` : ''}
          <h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p>
          <div class="ch-foot"><span class="stars">${'★'.repeat(c.stars)}<i>${'★'.repeat(5 - c.stars)}</i></span><span class="rw">${reward}</span></div>
          ${open ? '' : `<span class="lock-ov">${icon('lock')}Finish challenge ${i} first</span>`}
        </button>`;
      }).join('')}</div></div>`;
  }

  /* ------------------------------------------------------------ random */

  showRandom(): void {
    this.clearLayers();
    this.screenEl.className = 'side-screen';
    const r = this.randomResult;
    this.screenEl.innerHTML = `${this.hud()}<div class="panel side">
      <header class="panel-head"><button class="icon-btn" data-act="menu" aria-label="Back">${icon('back')}</button><h2>Random Track</h2></header>
      <p>Every generated track is test-raced by the physics engine before you see it.</p>
      <div class="seg">${(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => `<button class="${this.randomDifficulty === d ? 'on' : ''}" data-act="rndDiff" data-d="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
      <button class="btn big green" data-act="rndGen" id="rndGen">${icon('dice')}${r ? 'Regenerate' : 'Generate'}</button>
      ${r ? `<div class="rnd-info"><h3>${esc(r.track.name)}</h3><p>${r.track.pieces.length} pieces · ${r.track.pieces.filter((p) => p.t === 'splitter').length ? 'alternative routes · ' : ''}${r.finishers >= 0 ? `verified: ${r.finishers}/4 test marbles finished` : 'classic layout'}</p></div>
        <div class="col"><button class="btn big pink" data-act="rndRace">${icon('play')}Race it!</button>
        <div class="row"><button class="btn small blue" data-act="rndEdit">${icon('edit')}Edit copy</button><button class="btn small ghost" data-act="rndSave">${icon('save')}Save</button></div></div>` : ''}
    </div>`;
  }

  private generateRandom(): void {
    const btn = $('#rndGen');
    if (btn) {
      btn.setAttribute('disabled', '');
      btn.innerHTML = `<span class="spinner"></span>Building & test-racing…`;
    }
    setTimeout(() => {
      this.randomResult = this.game.generateRandom(this.randomDifficulty);
      this.game.audio.place();
      this.showRandom();
    }, 30);
  }

  /* -------------------------------------------------------- collection */

  showCollection(): void {
    this.clearLayers();
    const g = this.game;
    const p = g.progress;
    this.screenEl.className = 'panel-screen';
    let body = '';
    if (this.collectionTab === 'marbles') {
      body = SKINS.map((s) => {
        const owned = p.skinOwned(s.id);
        const buyable = p.skinBuyable(s.id);
        const status = owned
          ? '<span class="own">Owned</span>'
          : s.challenge
            ? `<span class="req">${icon('trophy')}Challenge ${CHALLENGES.findIndex((c) => c.id === s.challenge) + 1}</span>`
            : buyable
              ? `<button class="btn small yellow" data-act="buy" data-kind="skin" data-id="${s.id}">${icon('coin')}${s.price}</button>`
              : `<span class="req">${icon('lock')}Level ${s.level}</span>`;
        return `<div class="card col-card ${owned ? '' : 'locked'}"><span class="ball xl" style="background:${skinCss(s)}"></span><h4>${esc(s.name)}</h4><span class="muted">${s.theme ?? KIND_LABEL[s.kind]}</span>${status}</div>`;
      }).join('');
    } else if (this.collectionTab === 'pieces') {
      body = PIECES.filter((d) => d.category !== 'gates')
        .map((d) => {
          const ok = p.pieceUnlocked(d.id);
          const status = ok ? '<span class="own">Unlocked</span>' : `<button class="btn small yellow" data-act="buy" data-kind="piece" data-id="${d.id}">${icon('coin')}${d.unlock?.coins}</button><span class="req">or Level ${d.unlock?.level}</span>`;
          return `<div class="card col-card ${ok ? '' : 'locked'}"><img src="${g.pieceThumb(d.id)}" alt=""/><h4>${esc(d.name)}</h4><span class="muted">${CATEGORY_LABELS[d.category]}${p.data.discovered.includes(d.id) ? ' · raced' : ''}</span>${status}</div>`;
        })
        .join('');
    } else {
      body = ENVIRONMENTS.map((e) => {
        const ok = p.envUnlocked(e.id);
        const active = g.currentEnv() === e.id;
        const status = ok
          ? active
            ? '<span class="own">In use</span>'
            : `<button class="btn small blue" data-act="useEnv" data-id="${e.id}">Use</button>`
          : `<button class="btn small yellow" data-act="buy" data-kind="env" data-id="${e.id}">${icon('coin')}${e.price}</button><span class="req">or Level ${e.level}</span>`;
        return `<div class="card col-card env ${ok ? '' : 'locked'}"><div class="env-prev" style="background:linear-gradient(180deg, ${e.skyTop}, ${e.skyBottom})"><i style="background:${e.platform};border-color:${e.platformEdge}"></i></div><h4>${esc(e.name)}</h4><span class="muted">${esc(e.desc)}</span>${status}</div>`;
      }).join('');
    }
    const ownedCount = SKINS.filter((s) => p.skinOwned(s.id)).length;
    this.screenEl.innerHTML = `${this.hud()}<div class="panel wide">
      <header class="panel-head"><button class="icon-btn" data-act="menu" aria-label="Back">${icon('back')}</button><h2>Collection</h2><span class="muted">Cosmetics never change race physics.</span></header>
      <div class="tabs">
        <button class="tab ${this.collectionTab === 'marbles' ? 'on' : ''}" data-act="colTab" data-tab="marbles">Marbles (${ownedCount}/${SKINS.length})</button>
        <button class="tab ${this.collectionTab === 'pieces' ? 'on' : ''}" data-act="colTab" data-tab="pieces">Components</button>
        <button class="tab ${this.collectionTab === 'envs' ? 'on' : ''}" data-act="colTab" data-tab="envs">Environments</button>
      </div>
      <div class="card-grid dense">${body}</div></div>`;
  }

  /* ------------------------------------------------------------ online */

  private copy(text: string, msg: string): void {
    const done = (): void => this.toast(msg, 'good');
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => this.toast(text, 'info'));
    else this.toast(text, 'info');
  }

  private saveOnlineName(): void {
    const v = ($<HTMLInputElement>('#nameIn')?.value ?? '').replace(/[<>&"']/g, '').trim().slice(0, 14);
    if (v) this.game.settings.set('playerName', v);
  }

  onlineChanged(): void {
    if (this.game.screen === 'online') this.showOnline();
    else if (this.game.screen === 'results' && this.modalEl.querySelector('.room-scores')) {
      const box = this.modalEl.querySelector('.room-scores');
      if (box) box.outerHTML = this.onlineScoreHtml();
    }
  }

  private onlineScoreHtml(): string {
    const o = this.game.online;
    const rows = o.players
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((p) => `<li class="${p.id === o.selfId ? 'me' : ''}"><span class="ball xs" style="background:${skinCss(getSkin(p.skin))}"></span><span class="nm">${esc(p.name)}</span>${p.host ? `<span class="crown">${icon('crown')}</span>` : ''}<span class="pts">${p.score} pts</span></li>`)
      .join('');
    return `<div class="room-scores"><h3>${icon('trophy')}Room ${esc(o.code)} — after round ${o.round}</h3><ul class="players">${rows}</ul></div>`;
  }

  private skinPicker(current: string): string {
    const owned = this.game.progress.ownedSkins();
    const art = new Set(ART_SKINS.map((a) => a.id));
    const list = [...owned.filter((s) => art.has(s)), ...owned.filter((s) => !art.has(s))];
    return `<div class="skin-row">${list.map((s) => `<button class="ball ${s === current ? 'on' : ''}" data-act="onlineSkin" data-skin="${s}" title="${esc(getSkin(s).name)}" style="background:${skinCss(getSkin(s))}"></button>`).join('')}</div>`;
  }

  showOnline(): void {
    const g = this.game;
    const o = g.online;
    const prevName = $<HTMLInputElement>('#nameIn')?.value;
    const prevCode = $<HTMLInputElement>('#codeIn')?.value;
    const focused = document.activeElement?.id;
    this.clearLayers();
    this.screenEl.className = 'panel-screen';
    const skin = g.settings.data.onlineSkin;
    let body = '';
    if (o.state === 'idle') {
      body = `<div class="online-grid">
        <div class="online-box">
          <h3>${icon('star')}You</h3>
          <label class="muted">Name</label><input class="text-in" id="nameIn" maxlength="14" value="${esc(prevName ?? g.settings.data.playerName)}"/>
          <label class="muted">Your marble</label>${this.skinPicker(skin)}
        </div>
        <div class="online-box">
          <h3>${icon('crown')}Host a room</h3>
          <p class="muted">Create a private room and invite up to 11 friends with a code or link. Empty slots are filled with bots.</p>
          <button class="btn big green" data-act="onlineCreate">${icon('plus')}Create room</button>
          <h3>${icon('link')}Join a room</h3>
          <input class="text-in code-in" id="codeIn" maxlength="5" placeholder="CODE" value="${esc(prevCode ?? '')}"/>
          <button class="btn blue" data-act="onlineJoin">${icon('play')}Join</button>
          ${o.error ? `<p class="err-line">${icon('warn')} ${esc(o.error)}</p>` : ''}
        </div>
      </div>
      <p class="muted">Online play connects browsers directly (WebRTC). Everyone sees the same race; each player owns one marble and scores points by finishing well.</p>`;
    } else if (o.state === 'connecting') {
      body = `<div class="online-box" style="align-items:center;padding:40px"><span class="spinner"></span><h3>${o.role === 'host' ? 'Creating room…' : `Joining room ${esc(o.code)}…`}</h3><button class="btn ghost" data-act="onlineLeave">Cancel</button></div>`;
    } else {
      const opts = o.trackOptions();
      const racing = o.state === 'racing';
      body = `<div class="online-grid">
        <div class="online-box">
          <h3>${icon('online')}Room code</h3>
          <div class="room-code">${esc(o.code)}</div>
          <div class="row wrap"><button class="btn small ghost" data-act="onlineCopy">${icon('copy')}Copy code</button><button class="btn small ghost" data-act="onlineCopyLink">${icon('link')}Copy invite link</button></div>
          <h3>Players (${o.players.length}/12)</h3>
          <ul class="players">${o.players
            .map((p) => `<li class="${p.id === o.selfId ? 'me' : ''}"><span class="ball sm" style="background:${skinCss(getSkin(p.skin))}"></span><span class="nm">${esc(p.name)}${p.id === o.selfId ? ' (you)' : ''}</span>${p.host ? `<span class="crown" title="Host">${icon('crown')}</span>` : ''}<span class="pts">${p.score} pts</span></li>`)
            .join('')}</ul>
        </div>
        <div class="online-box">
          <h3>${icon('star')}Your marble</h3>${this.skinPicker(o.players.find((p) => p.id === o.selfId)?.skin ?? skin)}
          <h3>${icon('layers')}Race</h3>
          ${
            o.isHost
              ? `<label class="muted">Track</label><select class="sel-in" id="trackSel">${opts.map((t) => `<option value="${esc(t.id)}" ${t.id === o.settings.track ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
                 <label class="count">Marbles <input type="range" id="cntIn" min="${Math.max(2, o.players.length)}" max="12" value="${o.settings.count}"/><b>${o.settings.count}</b></label>
                 <button class="btn big pink" data-act="onlineStart" ${racing ? 'disabled' : ''}>${icon('play')}${o.round ? 'NEXT RACE' : 'START RACE'}</button>`
              : `<p>Track: <b>${esc(opts.find((t) => t.id === o.settings.track)?.name ?? 'chosen by host')}</b> · ${o.settings.count} marbles</p>
                 <p class="muted">${racing ? 'A race is running — you will join the next one.' : 'Waiting for the host to start…'}</p>`
          }
          <button class="btn small ghost" data-act="onlineLeave">${icon('x')}Leave room</button>
        </div>
      </div>`;
    }
    this.screenEl.innerHTML = `${this.hud()}<div class="panel online">
      <header class="panel-head"><button class="icon-btn" data-act="menu" aria-label="Back">${icon('back')}</button><h2>${icon('online')}Online</h2><span class="muted">Private rooms with friends</span></header>
      ${body}</div>`;
    const sel = $<HTMLSelectElement>('#trackSel');
    sel?.addEventListener('change', () => o.setTrack(sel.value));
    const cnt = $<HTMLInputElement>('#cntIn');
    cnt?.addEventListener('change', () => o.setCount(Number(cnt.value)));
    cnt?.addEventListener('input', () => {
      const b = cnt.parentElement?.querySelector('b');
      if (b) b.textContent = cnt.value;
    });
    for (const id of ['nameIn', 'codeIn']) {
      const el = $<HTMLInputElement>(`#${id}`);
      el?.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (id === 'codeIn' ? this.actions.onlineJoin : this.actions.onlineCreate)(el, e);
      });
    }
    if (focused) $<HTMLInputElement>(`#${focused}`)?.focus();
  }

  /* ---------------------------------------------------------- settings */

  showSettings(): void {
    const s = this.game.settings.data;
    this.modal(`<h2>${icon('settings')}Settings</h2>
      <div class="set-row"><label>Master volume</label><input type="range" min="0" max="1" step="0.05" value="${s.master}" data-vol="master"/></div>
      <div class="set-row"><label>Music</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-vol="music"/></div>
      <div class="set-row"><label>Sound effects</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-vol="sfx"/></div>
      <div class="set-row"><label>Mute everything</label><button class="toggle ${s.muted ? 'on' : ''}" data-act="toggleMute" aria-pressed="${s.muted}"><i></i></button></div>
      <div class="set-row"><label>Graphics quality</label><div class="seg">${(['low', 'medium', 'high'] as Quality[]).map((q) => `<button class="${s.quality === q ? 'on' : ''}" data-act="quality" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      <div class="set-row"><label>Show FPS</label><button class="toggle ${s.showFps ? 'on' : ''}" data-act="toggleFps" aria-pressed="${s.showFps}"><i></i></button></div>
      <div class="set-row"><label>Fullscreen</label><button class="btn small ghost" data-act="fullscreen">${icon('full')}Toggle</button></div>
      <div class="set-row"><label>Tutorials</label><button class="btn small ghost" data-act="resetTutorials">Show again</button></div>
      <div class="set-row"><label>Progress</label><button class="btn small red" data-act="resetProgress">Reset</button></div>
      <div class="row end"><button class="btn green" data-act="closeModal">Done</button></div>`, 'small settings');
    this.modalEl.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.vol as 'master' | 'music' | 'sfx';
        this.game.settings.set(k, Number(inp.value));
      });
    });
  }
}
