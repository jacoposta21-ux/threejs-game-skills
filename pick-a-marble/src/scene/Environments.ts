export interface EnvTheme {
  id: string;
  name: string;
  desc: string;
  level: number;
  price: number;
  skyTop: string;
  skyBottom: string;
  fog: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  platform: string;
  platformEdge: string;
  grid: string;
  island: string;
  islandTop: string;
  cloud: string;
  night?: boolean;
}

export const ENVIRONMENTS: EnvTheme[] = [
  {
    id: 'sky',
    name: 'Sky Workshop',
    desc: 'A sunny floating workshop above the clouds.',
    level: 1,
    price: 0,
    skyTop: '#4fa8ff',
    skyBottom: '#cfe9ff',
    fog: '#d6ecff',
    sun: '#fff4dc',
    sunIntensity: 2.6,
    hemiSky: '#e8f4ff',
    hemiGround: '#7d8fa8',
    hemiIntensity: 1.25,
    platform: '#d3e0f0',
    platformEdge: '#3a86ff',
    grid: '#9db7d9',
    island: '#9b6b43',
    islandTop: '#7ccf6b',
    cloud: '#ffffff',
  },
  {
    id: 'sunset',
    name: 'Sunset Mesa',
    desc: 'Warm desert light and long shadows.',
    level: 2,
    price: 150,
    skyTop: '#ff7b54',
    skyBottom: '#ffd59e',
    fog: '#ffcf9c',
    sun: '#ffd1a1',
    sunIntensity: 2.4,
    hemiSky: '#ffe2c4',
    hemiGround: '#8a5a44',
    hemiIntensity: 1.1,
    platform: '#f4e1c6',
    platformEdge: '#e76f51',
    grid: '#d8a37b',
    island: '#b5653f',
    islandTop: '#e9a66b',
    cloud: '#ffe6cf',
  },
  {
    id: 'candy',
    name: 'Candy Clouds',
    desc: 'Pastel skies and cotton-candy clouds.',
    level: 3,
    price: 220,
    skyTop: '#ff9ad5',
    skyBottom: '#fff0fb',
    fog: '#ffe4f6',
    sun: '#fff0f8',
    sunIntensity: 2.3,
    hemiSky: '#fff2fb',
    hemiGround: '#b48bb4',
    hemiIntensity: 1.3,
    platform: '#fff7fd',
    platformEdge: '#ff5d8f',
    grid: '#f1a8cf',
    island: '#c77dff',
    islandTop: '#ffd6f0',
    cloud: '#ffe9f7',
  },
  {
    id: 'arctic',
    name: 'Arctic Lab',
    desc: 'Crisp ice and cool blue light.',
    level: 4,
    price: 260,
    skyTop: '#7fb8e0',
    skyBottom: '#f1fbff',
    fog: '#e6f6ff',
    sun: '#f4fbff',
    sunIntensity: 2.5,
    hemiSky: '#f0faff',
    hemiGround: '#87a7c0',
    hemiIntensity: 1.3,
    platform: '#ffffff',
    platformEdge: '#00b4d8',
    grid: '#b2d4ea',
    island: '#a9c7dc',
    islandTop: '#ffffff',
    cloud: '#ffffff',
  },
  {
    id: 'neon',
    name: 'Neon Night',
    desc: 'A glowing night arena. Neon marbles shine here.',
    level: 5,
    price: 320,
    skyTop: '#090a2a',
    skyBottom: '#3a1c71',
    fog: '#1c1240',
    sun: '#b9a7ff',
    sunIntensity: 1.5,
    hemiSky: '#6e5cff',
    hemiGround: '#120a2e',
    hemiIntensity: 1.0,
    platform: '#1d1b3a',
    platformEdge: '#ff2bd6',
    grid: '#18f0ff',
    island: '#2a1f5c',
    islandTop: '#5b3cc4',
    cloud: '#3c2a7a',
    night: true,
  },
];

export const ENV_MAP = new Map(ENVIRONMENTS.map((e) => [e.id, e]));
export const getEnv = (id?: string): EnvTheme => ENV_MAP.get(id ?? 'sky') ?? ENVIRONMENTS[0];
