import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/game.ts';
import type { LevelsFile } from './levels/progression.ts';
import levelsData from '../public/levels/levels.json';

const fill = document.getElementById('load-fill')!;
const text = document.getElementById('load-text')!;
const setProgress = (p: number, msg?: string) => {
  fill.style.width = `${Math.round(p * 100)}%`;
  if (msg) text.textContent = msg;
};
const tick = () => new Promise((r) => requestAnimationFrame(() => r(null)));

async function boot() {
  try {
    setProgress(0.05, 'Kneading the dough…');
    await Promise.race([document.fonts.load('700 20px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);
    setProgress(0.2, 'Heating the physics oven…');
    await RAPIER.init();
    setProgress(0.45, 'Mapping the streets…');
    const levels = levelsData as unknown as LevelsFile; // bundled: works from file:// too
    setProgress(0.6, 'Building the town…');
    await tick();
    const game = new Game(RAPIER, document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui')!, levels);
    game.loadTitleScene();
    setProgress(0.9, 'Stacking the pizzas…');
    await tick();
    game.go('title');
    game.exposeHooks();
    requestAnimationFrame(game.frame);
    setProgress(1, 'Ready!');
    setTimeout(() => document.getElementById('loading')!.classList.add('done'), 250);
  } catch (e) {
    console.error(e);
    text.textContent = 'Something went wrong while loading. Please reload.';
  }
}
void boot();
