import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import './ui/styles.css';
import { GameManager } from './game/GameManager';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

const game = new GameManager(canvas);
game.boot().catch((err: unknown) => {
  console.error(err);
  const t = document.querySelector('.load-text');
  if (t) t.textContent = 'Something went wrong while loading. Please refresh.';
});
