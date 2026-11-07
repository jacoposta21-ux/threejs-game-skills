import Phaser from 'phaser';
import { generateArt } from './game/art.ts';
import { GameScene } from './game/GameScene.ts';

class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }
  create(): void {
    generateArt(this);
    this.scene.start('game');
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#fff3df',
  width: 1280,
  height: 720,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 2 },
  audio: { noAudio: true },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, GameScene],
});

window.addEventListener('cot-ready', () => {
  const el = document.getElementById('loader');
  if (!el) return;
  el.classList.add('done');
  window.setTimeout(() => el.remove(), 450);
});

export default game;
