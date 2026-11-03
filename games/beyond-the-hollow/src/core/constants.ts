export const TILE = 32;
export const VIEW_H = 560; // world pixels of vertical view we aim to show
export const VIEW_W_MIN = 760;

export const PHYS = {
  gravity: 1650,
  runSpeed: 232,
  crouchSpeed: 92,
  accelGround: 2300,
  decelGround: 2700,
  accelAir: 1500,
  jumpVel: 600,
  doubleJumpVel: 545,
  maxFall: 820,
  coyote: 0.1,
  jumpBuffer: 0.13,
  climbSpeed: 150,
  swimSpeed: 150,
  bounceVel: 1150,
};

export const DEPTH = {
  bgProps: -20,
  backWall: -10,
  decorBack: -5,
  tiles: 0,
  interact: 5,
  enemies: 10,
  crate: 12,
  player: 15,
  pip: 18,
  water: 20,
  decorFront: 22,
  fx: 25,
  darkness: 40,
  glow: 45,
  fog: 50,
  fgSilhouette: 60,
  hint: 70,
  letterbox: 90,
};
