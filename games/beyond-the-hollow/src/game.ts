/**
 * The game itself: Phaser and every scene. Loaded by main.ts only after the portal SDK is initialized
 * (Playgama Bridge required step 2: the engine and assets load after bridge.initialize()).
 */
import Phaser from 'phaser';
import { PHYS } from './core/constants';
import { Sound } from './core/Audio';
import { IS_PLAYGAMA } from './core/Portal';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { StoryScene } from './scenes/StoryScene';
import { BGScene } from './scenes/BGScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { EndingScene } from './scenes/EndingScene';

export function startGame() {
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
  (window as any).__sound = Sound;
  game.events.on('hidden', () => Sound.suspend(true));
  game.events.on('visible', () => Sound.suspend(false));
  // Playgama 1.4.1: on phones and tablets the game goes full screen on the first tap
  // (touchend is a user gesture the browser accepts for the Fullscreen API; pointerdown on touch is not)
  if (IS_PLAYGAMA) {
    const goFull = () => {
      if (!navigator.maxTouchPoints || game.scale.isFullscreen) return;
      try { game.scale.startFullscreen(); } catch { /* not allowed in this frame */ }
    };
    document.addEventListener('touchend', goFull, { once: true, passive: true });
  }
  return game;
}
