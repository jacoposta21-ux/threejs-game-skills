import './styles/main.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

function showFatal(message: string): void {
  const loading = document.querySelector('#loading .loading-card p');
  if (loading) loading.textContent = message;
}

let game: Game | null = null;
try {
  game = new Game(canvas);
  void game.start();
} catch (error) {
  console.error(error);
  showFatal('This browser could not start WebGL. Try Chrome, Edge or Firefox with hardware acceleration enabled.');
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => game?.dispose());
}
