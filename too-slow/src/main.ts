import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

async function boot(): Promise<void> {
  // Fonts are bundled locally; wait so canvas-drawn banners and name tags use them.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('400 40px "Lilita One"'), document.fonts.load('600 20px "Fredoka"')]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const game = new Game(canvas!);
  game.start();
  document.getElementById('loading')?.classList.add('done');
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
}

void boot();
