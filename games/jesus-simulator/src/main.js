import './styles.css';
import { GameSession } from './game/GameSession.js';
import { terrainHeight } from './world/layout.js';

function fail(message) {
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
  const box = document.getElementById('error');
  const text = document.getElementById('error-text');
  if (box && text) {
    text.textContent = message;
    box.hidden = false;
  }
}

window.addEventListener('unhandledrejection', (e) => {
  fail(`The game hit an unexpected problem: ${e.reason?.message || e.reason}`);
});

const canvas = document.getElementById('game-canvas');
const session = new GameSession(canvas);
session.init().catch((error) => {
  fail(error?.message || 'The game could not start. Please reload the page.');
});

// Exposed for future platform SDK wiring (e.g. CrazyGames gameplayStart/Stop) — no SDK is loaded here.
window.__JESUS_SIM__ = { session, terrainHeight };
