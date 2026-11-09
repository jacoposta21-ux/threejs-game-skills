import './styles.css';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { CharacterLibrary } from './animation/CharacterLibrary.js';
import { Platform } from './platform/CrazyGames.js';
import { Storage } from './platform/Storage.js';
import { Game } from './game/Game.js';

const canvas = document.querySelector('#game-canvas');
const fill = document.getElementById('load-fill');
const text = document.getElementById('load-text');

function progress(p, label) {
  fill.style.width = `${Math.round(p * 100)}%`;
  if (label) text.textContent = label;
}

function fatal(err) {
  console.error(err);
  document.getElementById('loading').classList.add('hidden');
  const box = document.getElementById('fatal');
  document.getElementById('fatal-text').textContent =
    /webgl/i.test(String(err?.message)) ? 'Your browser could not start WebGL. Try enabling hardware acceleration.' : String(err?.message ?? err);
  box.classList.remove('hidden');
}

async function boot() {
  const platform = new Platform();
  const storage = new Storage();
  progress(0.05, 'Connecting…');
  await platform.init();
  if (platform.dataBackend) storage.useBackend(platform.dataBackend);
  platform.loadingStart();

  progress(0.12, 'Warming up physics…');
  const physicsPromise = PhysicsWorld.create();
  const base = import.meta.env.BASE_URL;
  const libPromise = CharacterLibrary.load(`${base}assets/characters/`, (p) =>
    progress(0.15 + p * 0.55, 'Lacing up boots…'),
  );
  const [physics, lib] = await Promise.all([physicsPromise, libPromise]);
  progress(0.78, 'Painting the court…');
  // Give the browser a frame to paint the progress before the heavy build.
  await new Promise((r) => requestAnimationFrame(() => r()));
  const game = new Game({ canvas, physics, lib, platform, storage });
  progress(0.95, 'Kick-off soon…');
  // Compile shaders before the first visible frame to avoid a hitch.
  game.renderer.compile(game.scene, game.camera);
  progress(1);
  platform.loadingStop();
  game.start();
  window.__RUA10__ = game;

  if (import.meta.hot) {
    import.meta.hot.dispose(() => game.dispose());
  }
}

window.addEventListener('error', (e) => {
  if (e.message && /Rapier|WebGL|glTF/i.test(e.message)) fatal(e.error ?? e.message);
});

boot().catch(fatal);
