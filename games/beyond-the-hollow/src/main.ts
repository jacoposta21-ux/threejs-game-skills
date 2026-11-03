import Phaser from 'phaser';
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/spectral/latin-400.css';
import '@fontsource/spectral/latin-400-italic.css';
import { PHYS } from './core/constants';
import { Crazy } from './core/CrazySDK';
import { Sound } from './core/Audio';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { StoryScene } from './scenes/StoryScene';
import { BGScene } from './scenes/BGScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { EndingScene } from './scenes/EndingScene';

async function start() {
  await Promise.race([
    Promise.all([document.fonts.load('48px Cinzel'), document.fonts.load('600 48px Cinzel'), document.fonts.load('20px Spectral'), document.fonts.load('italic 20px Spectral')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  await Crazy.init();
  const game = new Phaser.Game({
    type: /[?&]canvas/.test(location.search) ? Phaser.CANVAS : Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#05070a',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight, fullscreenTarget: document.documentElement },
    render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: PHYS.gravity }, debug: false, tileBias: 20 } },
    input: { gamepad: true, activePointers: 4 },
    fps: { target: 60, smoothStep: true },
    scene: [BootScene, MenuScene, StoryScene, BGScene, GameScene, UIScene, EndingScene],
  });
  (window as any).__game = game;
  game.events.on('hidden', () => Sound.suspend(true));
  game.events.on('visible', () => Sound.suspend(false));
  // block page scrolling/zoom gestures inside the game
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

start();
