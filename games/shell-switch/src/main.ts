import './styles.css';
import { Platform } from './platform/Platform';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

// Playgama Bridge initializes (and loads saved progress) before the game builds anything.
// No browser context menu or text selection on long press.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
});

void Platform.init().then(() => {
  const game = new Game(canvas);
  game.start();
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
});
