import './styles.css';
import maleUrl from './assets/characters/body_male.glb?url';
import femaleUrl from './assets/characters/body_female.glb?url';
import hairUrl from './assets/characters/hair.glb?url';
import animsUrl from './assets/characters/anims.glb?url';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { CharacterLibrary } from './animation/CharacterLibrary.js';
import { Platform } from './platform/CrazyGames.js';
import { Storage } from './platform/Storage.js';
import { Game } from './game/Game.js';

// QA hooks (window.__THREE_GAME_TEST_HOOKS__, diagnostics, window.__RUA10__)
// exist only in dev or with ?qa — never in the shipped game by default.
const QA = import.meta.env.DEV || new URLSearchParams(window.location.search).has('qa');

const canvas = document.querySelector('#game-canvas');
const fill = document.getElementById('load-fill');
const text = document.getElementById('load-text');

function progress(p, label) {
  fill.style.width = `${Math.round(p * 100)}%`;
  if (label) text.textContent = label;
}

function fatal(message, { retry = false } = {}) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('fatal-text').textContent = message;
  const box = document.getElementById('fatal');
  box.querySelector('button').textContent = retry ? 'TRY AGAIN' : 'RELOAD';
  box.classList.remove('hidden');
}

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  if (!hasWebGL2()) {
    fatal('RUA 10 needs WebGL 2. Update your browser or enable hardware acceleration in its settings.');
    return;
  }
  const platform = new Platform();
  const storage = new Storage();
  progress(0.05, 'Connecting…');
  await platform.init();
  if (platform.dataBackend) storage.useBackend(platform.dataBackend);
  platform.loadingStart();

  progress(0.12, 'Warming up physics…');
  let physics;
  let lib;
  try {
    [physics, lib] = await Promise.all([
      PhysicsWorld.create(),
      CharacterLibrary.load({ male: maleUrl, female: femaleUrl, hair: hairUrl, anims: animsUrl }, (p) =>
        progress(0.15 + p * 0.55, 'Lacing up boots…'),
      ),
    ]);
  } catch (err) {
    console.error(err);
    fatal('Could not load the game data. Check your connection and try again.', { retry: true });
    return;
  }
  progress(0.78, 'Painting the court…');
  await new Promise((r) => requestAnimationFrame(() => r()));
  const game = new Game({ canvas, physics, lib, platform, storage, qa: QA });
  progress(0.95, 'Kick-off soon…');
  game.renderer.compile(game.scene, game.camera);
  progress(1);
  platform.loadingStop();
  game.start();
  if (QA) window.__RUA10__ = game;

  if (import.meta.hot) {
    import.meta.hot.dispose(() => game.dispose());
  }
}

document.getElementById('fatal-btn').addEventListener('click', () => window.location.reload());
window.addEventListener('unhandledrejection', (e) => console.warn('[game] unhandled rejection', e.reason));

boot().catch((err) => {
  console.error(err);
  fatal(/webgl/i.test(String(err?.message)) ? 'Your browser could not start WebGL. Try enabling hardware acceleration.' : 'Something went wrong while starting the game.', { retry: true });
});
