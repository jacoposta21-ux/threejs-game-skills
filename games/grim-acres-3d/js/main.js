// Boot: SDK -> strings -> procedural art -> title screen -> game loop.
import { Platform } from './platform.js';
import { loadLocale, t } from './i18n.js';
import { buildArt } from './art.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Save } from './save.js';
import { Audio } from './audio.js';
import { Progress } from './progress.js';

const $ = (s) => document.querySelector(s);

async function boot() {
  await Platform.init();
  Platform.loadingStart();
  await loadLocale(Save.settings().lang || Platform.locale());
  $('.loading-text').textContent = t('ui.loading');
  await new Promise((r) => requestAnimationFrame(r)); // let the loading screen paint

  buildArt();
  const canvas = $('#game');
  const renderer = new Renderer(canvas);
  const input = new Input();
  input.attach(canvas, { zone: $('#touch-zone'), base: $('#joy-base'), knob: $('#joy-knob'), action: $('#touch-action') });
  input.onFirstGesture = () => Audio.unlock();
  const ui = new UI();
  const game = new Game({ renderer, ui, input });
  Audio.setMuted(!!Save.settings().muted);
  Audio.setMusic(Save.settings().music !== false);
  ui.init(game);
  window.addEventListener('resize', () => { renderer.resize(); if (game.mode === 'play') renderer.snap(game); });

  const start = (fresh) => {
    ui.hideTitle();
    ui.showHud(true);
    game.mode = 'play';
    renderer.snap(game);
    if (fresh) { game.save(); ui.showIntro(game); Progress.add('games'); }
  };

  const goTitle = () => {
    game.mode = 'title';
    ui.showHud(false);
    // A fresh village (not saved) makes a nice backdrop behind the title.
    game.newGame();
    game.player.placeAt(47, 23, 'down');
    renderer.snap(game);
    const s = Save.load();
    const diff = () => Save.settings().difficulty || 'normal';
    ui.showTitle(s ? { day: s.day, diff: s.mystery && s.mystery.diff } : null, {
      onPlay: () => {
        const save = Save.load();
        if (save) { game.loadSave(save); start(false); } else { game.newGame(diff()); start(true); }
      },
      onNew: () => { Save.clear(); game.newGame(diff()); start(true); },
      difficulty: diff(),
      onDifficulty: (d) => { const st = Save.settings(); st.difficulty = d; Save.saveSettings(st); },
      onLanguage: async (lang) => {
        const st = Save.settings(); st.lang = lang; Save.saveSettings(st);
        await loadLocale(lang);
        ui.refreshLabels();
        goTitle();
      },
    });
  };
  ui.onQuit = goTitle;
  // after catching the Gnomer: a fresh game with a (most likely) different culprit
  ui.onNewGame = () => { const caught = game.mystery.gnomerId; Save.clear(); game.newGame(Save.settings().difficulty || 'normal', caught); start(true); };
  if (/[?&]debug\b/.test(location.search)) window.__grim = { game, ui, renderer }; // test hook

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'play' && !ui.modal) ui.openPause(game);
  });

  goTitle();
  $('#loading').classList.add('hidden');
  Platform.loadingStop();

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    game.frame(dt);
    ui.update(dt);
    if (game.mode === 'play') ui.updateHud(game);
    renderer.render(game, dt);
    Audio.music(game.mode === 'title' ? 'title' : game.mode !== 'play' ? null
      : game.minutes >= 19 * 60 ? 'night' : game.weather === 'rain' && game.playerArea().outdoor ? 'rain' : 'day');
    Platform.setGameplay(game.mode === 'play' && !ui.blocking && !document.hidden);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  console.error(err);
  const el = document.querySelector('.loading-text');
  if (el) el.textContent = 'Something went wrong while loading. Please refresh.';
});
