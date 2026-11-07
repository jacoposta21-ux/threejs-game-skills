// Central tuning values. Everything gameplay-relevant lives here so it can be
// tuned in one place (and inspected from tests).

export const TUNNEL = {
  radius: 6,
  length: 240, // visible tunnel length in world units
  segmentLength: 12, // spacing of structural ribs / sections
};

export const PLAYER = {
  radius: 0.45,
  orbitRadius: 5.35, // distance of sphere centre from the tunnel axis
  maxOmegaBase: 3.35, // rad/s at start speed
  maxOmegaGain: 0.013, // extra rad/s per unit of speed above start
  responsiveness: 16, // exponential approach rate toward target angular velocity
  stopResponsiveness: 22, // faster braking when input is released
};

export const SPEED = {
  start: 27,
  ramp: 44, // asymptotic extra speed
  rampTime: 95, // seconds for ~63% of the ramp
  lateGain: 0.035, // extra linear speed per second (keeps expert climbing slowly)
  max: 80,
  boostMultiplier: 1.55,
};

// Difficulty tiers (seconds survived). The generator uses a smooth 0..1 value;
// tiers are used for announcements and unlocking obstacle families.
export const TIERS = [
  { name: 'BEGINNER', from: 0 },
  { name: 'INTERMEDIATE', from: 30 },
  { name: 'ADVANCED', from: 60 },
  { name: 'EXPERT', from: 120 },
];

export const GEN = {
  bins: 180, // angular resolution of the fairness solver (2° per bin)
  spawnAhead: 190, // world units ahead of the player where rows are generated
  despawnBehind: 14,
  firstRowDistance: 62,
  rowGapSecondsStart: 1.35,
  rowGapSecondsEnd: 0.62,
  reachSafety: 0.78, // fraction of the theoretical angular reach the solver assumes
  reachLag: 0.07, // seconds lost to acceleration when changing direction
  playerHalfMargin: 1.22, // inflate the player when testing for free space
  orbChainChance: 0.6,
  powerUpEvery: [17, 26], // seconds between power-up spawns
};

export const SCORE = {
  perUnit: 1,
  energy: 25,
  nearMiss: 60,
  nearMissDistance: 0.55, // world units of clearance that count as a near miss
  comboPerMultiplier: 8,
  maxMultiplier: 8,
  comboDecaySeconds: 4.5,
  smashBonus: 40,
};

export const POWERUPS = {
  boost: { duration: 4.5, color: 0xff9500, label: 'BOOST', icon: '⚡' },
  shield: { duration: 14, color: 0x39ff14, label: 'SHIELD', icon: '🛡' },
  magnet: { duration: 9, color: 0xff2bd6, label: 'MAGNET', icon: '🧲' },
};

export const COLORS = {
  cyan: 0x00f5ff,
  magenta: 0xff00e5,
  purple: 0x8a2be2,
  blue: 0x007bff,
  orange: 0xff9500,
  green: 0x39ff14,
  red: 0xff1f3d,
  background: 0x03030a,
};

// Tunnel themes. Colours are linear-ish RGB triplets; neon values may exceed 1
// so bloom picks them up.
export const THEMES = [
  {
    id: 'cyber', name: 'CYBER BLUE',
    wall: [0.05, 0.065, 0.09], panel: [0.11, 0.13, 0.17],
    neonA: [0.0, 1.9, 2.4], neonB: [0.0, 0.7, 2.6], accent: [1.6, 0.0, 1.5],
    fog: [0.008, 0.012, 0.03], dust: 0x6fe9ff,
  },
  {
    id: 'toxic', name: 'TOXIC GREEN',
    wall: [0.03, 0.045, 0.03], panel: [0.07, 0.1, 0.07],
    neonA: [0.45, 2.6, 0.2], neonB: [0.1, 1.4, 0.6], accent: [1.4, 2.0, 0.0],
    fog: [0.005, 0.02, 0.008], dust: 0x8dff6a,
  },
  {
    id: 'solar', name: 'SOLAR CORE',
    wall: [0.08, 0.045, 0.025], panel: [0.15, 0.08, 0.04],
    neonA: [2.6, 1.3, 0.1], neonB: [2.2, 0.55, 0.0], accent: [2.6, 2.2, 0.6],
    fog: [0.03, 0.01, 0.004], dust: 0xffc46a,
  },
  {
    id: 'violet', name: 'VIOLET VOID',
    wall: [0.05, 0.03, 0.08], panel: [0.1, 0.06, 0.15],
    neonA: [1.3, 0.25, 2.6], neonB: [2.2, 0.0, 1.6], accent: [0.0, 1.6, 2.2],
    fog: [0.02, 0.006, 0.035], dust: 0xd18bff,
  },
  {
    id: 'quantum', name: 'QUANTUM WHITE',
    wall: [0.11, 0.12, 0.14], panel: [0.2, 0.22, 0.26],
    neonA: [2.2, 2.4, 2.8], neonB: [0.5, 1.2, 2.8], accent: [0.0, 2.0, 2.6],
    fog: [0.03, 0.035, 0.05], dust: 0xe8f4ff,
  },
];
export const THEME_DISTANCE = 1800; // world units between theme changes

export const SKINS = [
  { id: 'cyber', name: 'CYBER CORE', price: 0, core: 0x00f5ff, shell: 0x7ffcff, trailA: 0x00f5ff, trailB: 0x007bff, spark: 0x9ffcff },
  { id: 'plasma', name: 'PLASMA', price: 150, core: 0xb05cff, shell: 0xd8a8ff, trailA: 0x8a2be2, trailB: 0xff00e5, spark: 0xe0b8ff },
  { id: 'inferno', name: 'INFERNO', price: 350, core: 0xff7a00, shell: 0xffd27a, trailA: 0xff9500, trailB: 0xff1f3d, spark: 0xffd08a },
  { id: 'toxic', name: 'TOXIC', price: 600, core: 0x39ff14, shell: 0xc4ff9a, trailA: 0x39ff14, trailB: 0x00ffa2, spark: 0xd0ffb0 },
  { id: 'quantum', name: 'QUANTUM', price: 900, core: 0xffffff, shell: 0xbfe6ff, trailA: 0xe8f6ff, trailB: 0x4aa8ff, spark: 0xffffff },
  { id: 'void', name: 'VOID', price: 1400, core: 0xff00e5, shell: 0x1a0018, trailA: 0xff00e5, trailB: 0x220022, spark: 0xff6af0, dark: true },
];

export const QUALITY = {
  high: { dpr: 2, bloom: true, particles: 1, dust: 420, streaks: 140 },
  medium: { dpr: 1.5, bloom: true, particles: 0.75, dust: 260, streaks: 90 },
  low: { dpr: 1, bloom: false, particles: 0.45, dust: 140, streaks: 50 },
};
