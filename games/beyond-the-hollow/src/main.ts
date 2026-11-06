/**
 * Entry point. Order matters for the portals:
 *  1. the portal SDK (Playgama Bridge / CrazyGames) is initialized first,
 *  2. only then are the fonts and the game (Phaser + scenes, a separate chunk) loaded and started.
 */
import { Portal } from './core/Portal';

async function start() {
  await Portal.init();
  await import('./fonts');
  await Promise.race([
    Promise.all([document.fonts.load('48px Cinzel'), document.fonts.load('600 48px Cinzel'), document.fonts.load('20px Spectral'), document.fonts.load('italic 20px Spectral')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  const { startGame } = await import('./game');
  startGame();
  // block page scrolling/zoom gestures inside the game
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

start();
