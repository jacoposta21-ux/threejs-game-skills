import './styles.css';
import { Game } from './game/Game';
import { Portal } from './platform/Portal';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

Portal.loadingStart();
const game = new Game(canvas);
game.start();
Portal.loadingStop();
void Portal.init();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
