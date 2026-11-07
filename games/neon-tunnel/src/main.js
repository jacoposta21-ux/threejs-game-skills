import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import '../styles/main.css';
import { Game } from './Game.js';

const canvas = document.getElementById('game-canvas');

function fail(message) {
  const loading = document.getElementById('screen-loading');
  if (loading) {
    loading.innerHTML = `<div class="loader"><div class="loader-text" style="letter-spacing:.2em;max-width:320px;line-height:1.8">${message}</div></div>`;
  }
}

try {
  const game = new Game(canvas);
  game.start().catch((err) => {
    console.error(err);
    fail('UNABLE TO START. PLEASE RELOAD.');
  });
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
} catch (err) {
  console.error(err);
  fail('WEBGL IS NOT AVAILABLE ON THIS DEVICE OR BROWSER.');
}
