// Central tuning constants. Units: metres, seconds, kilograms.
// The court runs along X (goals at ±COURT.halfLength); Z is the court width; Y is up.

export const COURT = {
  halfLength: 15,
  halfWidth: 9,
  goalHalfWidth: 1.6,
  goalHeight: 2.0,
  goalDepth: 1.15,
  boardHeight: 1.0,
  fenceHeight: 4.6,
  cageHeight: 10,
  centerCircleRadius: 2.6,
  penaltyDepth: 4.2,
  penaltyHalfWidth: 4.2,
};

export const BALL = {
  radius: 0.11,
  mass: 0.43,
  restitution: 0.72,
  friction: 0.6,
  // Ground: constant rolling resistance plus a speed-proportional term (m/s²).
  rollingDecel: 0.85,
  rollingDrag: 0.11,
  // Air: quadratic drag coefficient (1/m) and Magnus lift coefficient.
  airDrag: 0.0095,
  magnus: 0.0045,
  spinDecay: 0.6,
  maxSpeed: 34,
};

export const PLAYER = {
  radius: 0.3,
  height: 1.78,
  walkSpeed: 1.6,
  jogSpeed: 5.0,
  sprintSpeed: 7.3,
  dribbleJogSpeed: 4.5,
  dribbleSprintSpeed: 6.6,
  accel: 15,
  sprintAccel: 9,
  decel: 20,
  turnRate: 11,
  sprintTurnRate: 6.5,
  // Turning at speed bleeds momentum: fraction of speed kept per radian of heading change.
  turnSpeedLoss: 0.42,
  stamina: 1,
  staminaDrain: 0.22,
  staminaRegen: 0.18,
};

export const DRIBBLE = {
  controlRadius: 0.95,
  controlMaxHeight: 0.42,
  controlMaxRelSpeed: 7.5,
  baseLead: 0.5,
  leadPerSpeed: 0.11,
  minTouchInterval: 0.2,
  maxTouchInterval: 0.42,
  // A touch sends the ball this much faster than the player (m/s); the player then chases it down.
  touchMargin: 1.7,
  sprintTouchMargin: 2.7,
  // How hard the player accelerates to recover a ball that ran past the lead distance.
  chaseBoost: 0.9,
  // Standard deviation of touch direction error (radians) at jog / sprint / sharp turn.
  jogError: 0.025,
  sprintError: 0.09,
  turnError: 0.22,
  loseDistance: 2.2,
};

export const KICK = {
  reach: 1.25,
  chargeTime: 0.85,
  maxHold: 1.15,
  bufferTime: 0.4,
  shotMinSpeed: 13,
  shotMaxSpeed: 29,
  passSpeed: 11.5,
  regainCooldown: 0.32,
};

export const KEEPER = {
  lineOffset: 0.75,
  moveSpeed: 4.3,
  diveReach: 2.1,
  diveTime: 0.62,
  reactionTime: 0.17,
  saveChance: { easy: 0.45, normal: 0.62, hard: 0.78 },
  holdTime: 1.1,
};

export const MATCH = {
  duration: 180,
  countdown: 3,
  goalCelebration: 4.2,
  kickoffCountdown: 1.6,
};

export const TACKLE = {
  // Standing poke tackle: short lunge, contact frame, then a vulnerable recovery.
  lungeSpeed: 6.2,
  duration: 0.62,
  contact: 0.2,
  reach: 1.15,
  cooldown: 0.9,
  // Chance to win the ball when it is in reach (human / AI by difficulty).
  humanSuccess: 0.8,
  fromBehindPenalty: 0.35,
  staggerTime: 0.75,
  // A dribbler can be robbed between touches when the ball strays this far from them.
  looseTouchDistance: 0.85,
};

// Outfield AI by difficulty: reaction/decision interval (s), how often a pressing
// defender attempts a tackle when in range (per second), tackle success, speed
// factor, pass error (rad), and how far out it will shoot from.
export const AI = {
  easy: { think: 0.42, tackleRate: 0.55, tackleSuccess: 0.42, speed: 0.86, passError: 0.11, shootRange: 8, pressDistance: 4.5 },
  normal: { think: 0.3, tackleRate: 1.0, tackleSuccess: 0.55, speed: 0.95, passError: 0.06, shootRange: 10, pressDistance: 6.5 },
  hard: { think: 0.2, tackleRate: 1.7, tackleSuccess: 0.68, speed: 1.0, passError: 0.03, shootRange: 12, pressDistance: 9 },
};

// Base shape for a team attacking -X (home), as fractions of the half-court.
// x > 0 is the team's own half. Mirrored for the other team.
export const FORMATION = {
  attack: [[0.15, 0], [0.05, 0.6], [0.45, -0.45]],
  defend: [[0.35, 0], [0.55, 0.5], [0.6, -0.5]],
  kickoff: [[0.06, 0], [0.4, 0.55], [0.45, -0.55]],
};

export const CAMERA = {
  fov: 44,
  distance: 10.6,
  height: 6.9,
  attackBias: 2.2,
  ballWeight: 0.38,
  followSharpness: 4.2,
  zoomPerSpeed: 0.13,
  maxZoom: 3.4,
  minZ: -21,
};

export const QUALITY = {
  low: { dpr: 1, shadowMap: 1024, shadows: false, crowd: 3, antialias: false },
  medium: { dpr: 1.5, shadowMap: 2048, shadows: true, crowd: 6, antialias: true },
  high: { dpr: 2, shadowMap: 2048, shadows: true, crowd: 10, antialias: true },
};

export const TEAMS = {
  home: {
    name: 'CANARINHOS',
    short: 'CAN',
    jersey: '#f6c915',
    jersey2: '#1f8a4c',
    shorts: '#1d4fa3',
    socks: '#f4f1e8',
    sockStripe: '#1f8a4c',
    shoes: '#ff5a1f',
    pattern: 1, // collar + sleeve trims
  },
  away: {
    name: 'VILA RUBRA',
    short: 'VRB',
    jersey: '#c8102e',
    jersey2: '#111111',
    shorts: '#141414',
    socks: '#c8102e',
    sockStripe: '#111111',
    shoes: '#f4f1e8',
    pattern: 2, // vertical stripes
  },
};

// Rosters: three outfield players plus a keeper per side. Looks feed the kit shader.
export const ROSTERS = {
  home: [
    { name: 'ZÉ', number: 10, skin: '#7a4a2a', hair: 'twists', hairColor: '#17100b', headband: '#1f8a4c', height: 1.76 },
    { name: 'BIEL', number: 7, skin: '#c68642', hair: 'curly', hairColor: '#2a1a10', height: 1.74 },
    { name: 'NANDO', number: 5, skin: '#e0ac69', hair: 'buzz', hairColor: '#3b2414', height: 1.82 },
  ],
  homeKeeper: {
    name: 'TATU', number: 1, skin: '#8d5524', hair: 'afro', hairColor: '#120c08', shoes: '#141414', height: 1.86,
    kit: { jersey: '#7b3fe4', jersey2: '#141414', shorts: '#141414', socks: '#7b3fe4', sockStripe: '#141414', pattern: 1 },
  },
  away: [
    { name: 'RAFA', number: 9, skin: '#5c3317', hair: 'buzz', hairColor: '#120c08', height: 1.8 },
    { name: 'DUDU', number: 8, skin: '#f1c27d', hair: 'curly', hairColor: '#4a2c14', headband: '#141414', height: 1.72 },
    { name: 'GUGA', number: 4, skin: '#a0663a', hair: 'afro', hairColor: '#120c08', height: 1.84 },
  ],
  awayKeeper: {
    name: 'BETO', number: 1, skin: '#d9a066', hair: 'buzz', hairColor: '#2a1a10', shoes: '#141414', height: 1.86,
    kit: { jersey: '#00a88f', jersey2: '#141414', shorts: '#141414', socks: '#00a88f', sockStripe: '#141414', pattern: 1 },
  },
};
