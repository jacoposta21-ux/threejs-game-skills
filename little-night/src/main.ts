import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import './styles.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const ui = document.querySelector<HTMLElement>('#ui');
if (!canvas || !ui) throw new Error('Missing #game-canvas or #ui.');

const game = new Game(canvas, ui);
void game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
