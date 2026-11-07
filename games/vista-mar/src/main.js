import { Game } from './core/Game.js';

function fatal(msg) {
  document.getElementById('start').classList.add('hidden');
  document.getElementById('fatal').classList.remove('hidden');
  document.getElementById('fatal-text').textContent = msg;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  fatal('This game needs WebGL, which is disabled or unavailable in this browser. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
} else {
  const game = new Game(document.getElementById('game'));
  window.__game = game;
  game.init().catch((e) => {
    console.error(e);
    fatal(`Vista Mar failed to start: ${e && e.message ? e.message : e}`);
  });
}
