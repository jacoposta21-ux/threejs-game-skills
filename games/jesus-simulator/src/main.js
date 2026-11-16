import './styles.css';
import { GameSession } from './game/GameSession.js';
import { terrainHeight, waterDepth } from './world/layout.js';

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
const ready = session.init();
ready.catch((error) => {
  fail(error?.message || 'The game could not start. Please reload the page.');
});

// Test hooks are available from the first frame: calls made while the world is
// still loading wait for it, then run (GameSession installs the real hooks).
if (!window.__THREE_GAME_TEST_HOOKS__) {
  const names = ['seed', 'setState', 'setPausedForScreenshot', 'setReducedMotion', 'hideDebugUi'];
  window.__THREE_GAME_TEST_HOOKS__ = Object.fromEntries(names.map((name) => [name, async (...args) => {
    await ready;
    return window.__THREE_GAME_TEST_HOOKS__[name](...args);
  }]));
}

// Exposed for future platform SDK wiring (e.g. CrazyGames gameplayStart/Stop) — no SDK is loaded here.
window.__JESUS_SIM__ = { session, terrainHeight, waterDepth };
