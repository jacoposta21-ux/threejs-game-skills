export type ThemeKey = 'station' | 'forest' | 'caverns' | 'ocean' | 'heart' | 'ice' | 'foundry' | 'ruins';

/** New themes reuse the prop shapes of an existing family, recoloured by their own palette. */
export const FAMILY: Record<ThemeKey, 'station' | 'forest' | 'caverns' | 'ocean' | 'heart'> = { station: 'station', forest: 'forest', caverns: 'caverns', ocean: 'ocean', heart: 'heart', ice: 'caverns', foundry: 'station', ruins: 'forest' };

export interface ThemeDef {
  key: ThemeKey;
  rock: [string, string, string]; // dark, mid, light
  top: [string, string, string]; // surface colors
  topStyle: 'grate' | 'moss' | 'crystal' | 'barnacle' | 'flesh';
  sky: [string, string, string]; // top, middle, bottom
  far: string;
  mid: string;
  near: string;
  fog: string;
  accent: string;
  accent2: string;
  lamp: number; // lamp light tint
  darkColor: number;
  spike: [string, string];
  platform: [string, string];
  ladder: 'metal' | 'vine';
  water: [string, string];
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  station: {
    key: 'station', rock: ['#1a1f26', '#3a424c', '#6c7681'], top: ['#59636b', '#8a6a4a', '#b78a5a'], topStyle: 'grate',
    sky: ['#06090d', '#15202a', '#2a3a40'], far: '#22313a', mid: '#18232b', near: '#0d1318', fog: '#6f8f94', accent: '#ffb95e', accent2: '#7ff5e0',
    lamp: 0xffc070, darkColor: 0x040608, spike: ['#a7aeb5', '#4b535b'], platform: ['#6f7a82', '#2c343b'], ladder: 'metal', water: ['#2a6e7a', '#9de3e8'],
  },
  forest: {
    key: 'forest', rock: ['#1d1420', '#4b3240', '#7a5a62'], top: ['#2f8f6f', '#5ee0a8', '#c6ffd9'], topStyle: 'moss',
    sky: ['#0b0718', '#2a1544', '#14455a'], far: '#3b2a63', mid: '#29204a', near: '#140e24', fog: '#b58cff', accent: '#5ef0c0', accent2: '#ff7ad9',
    lamp: 0x8affd0, darkColor: 0x070410, spike: ['#e9d7b0', '#6b4a3a'], platform: ['#c8a46a', '#5a3a28'], ladder: 'vine', water: ['#2a7a6a', '#a8ffe8'],
  },
  caverns: {
    key: 'caverns', rock: ['#0d1118', '#283244', '#4f5f78'], top: ['#6d86b0', '#a9c6ff', '#e4f0ff'], topStyle: 'crystal',
    sky: ['#020306', '#0a1020', '#131d33'], far: '#1a2540', mid: '#111a2e', near: '#070b14', fog: '#4f6ea8', accent: '#8fb8ff', accent2: '#c48bff',
    lamp: 0x9cc4ff, darkColor: 0x010204, spike: ['#bcd6ff', '#3e5a8c'], platform: ['#56637a', '#232b3a'], ladder: 'vine', water: ['#1d3f6a', '#9cc8ff'],
  },
  ocean: {
    key: 'ocean', rock: ['#0c1a1e', '#21434a', '#3f7478'], top: ['#c46a7a', '#ff9eac', '#ffd9c8'], topStyle: 'barnacle',
    sky: ['#03080c', '#0a2733', '#105161'], far: '#0f3a48', mid: '#0b2b36', near: '#051418', fog: '#5fc2c9', accent: '#7fffe6', accent2: '#ff9ec2',
    lamp: 0x8ffff0, darkColor: 0x02070a, spike: ['#3a2a4a', '#140d1c'], platform: ['#d08a8a', '#5a2f3a'], ladder: 'vine', water: ['#1a6c80', '#b8fff4'],
  },
  heart: {
    key: 'heart', rock: ['#1a0a10', '#4a1a26', '#86404c'], top: ['#b8445a', '#ff7a8a', '#ffd0c0'], topStyle: 'flesh',
    sky: ['#0a0206', '#2a0814', '#4a1420'], far: '#4a1622', mid: '#300d18', near: '#16060b', fog: '#ff6a7a', accent: '#ff5e6e', accent2: '#ffd36e',
    lamp: 0xff8a7a, darkColor: 0x060104, spike: ['#f0e2cc', '#7a5048'], platform: ['#a8505e', '#3a121c'], ladder: 'vine', water: ['#8bdc2a', '#e8ff9a'],
  },
  ice: {
    // "The Glass Caverns": bioluminescent crystal caves, violet and teal, slick crystal floors
    key: 'ice', rock: ['#140f22', '#33285a', '#6e5aa8'], top: ['#7ff5e0', '#c8fff4', '#ffffff'], topStyle: 'crystal',
    sky: ['#05030c', '#1a0f38', '#183c5a'], far: '#2c2258', mid: '#1c163c', near: '#0b0818', fog: '#9f8aff', accent: '#7ff5e0', accent2: '#d07aff',
    lamp: 0x9ffff0, darkColor: 0x030208, spike: ['#e6dcff', '#5a4a9a'], platform: ['#8a7ac8', '#2e2458'], ladder: 'vine', water: ['#2a3a8a', '#c8f0ff'],
  },
  foundry: {
    // "The Clockwork Ruins": ancient stone machines lit by teal runes
    key: 'foundry', rock: ['#161a26', '#3e4866', '#8090b8'], top: ['#3a8a7a', '#7ff5e0', '#dafff6'], topStyle: 'grate',
    sky: ['#060a14', '#16224a', '#1e5060'], far: '#2e3c64', mid: '#1e2848', near: '#0c1020', fog: '#7ff5e0', accent: '#7ff5e0', accent2: '#ffd27a',
    lamp: 0x9ffff0, darkColor: 0x020306, spike: ['#c8d0e0', '#3a4258'], platform: ['#7a8098', '#2a2e3e'], ladder: 'metal', water: ['#1a5a6a', '#c0f0ff'],
  },
  ruins: {
    // "The Sunken Temple": overgrown ancient city, teal waterlight and violet glow-caps
    key: 'ruins', rock: ['#14121c', '#3a3448', '#76708a'], top: ['#2f8f6f', '#6ef0b8', '#d8ffe8'], topStyle: 'moss',
    sky: ['#04060c', '#12163a', '#145a5a'], far: '#22305a', mid: '#18203e', near: '#080a18', fog: '#7affd8', accent: '#7affd8', accent2: '#d07aff',
    lamp: 0x9ffff0, darkColor: 0x020308, spike: ['#e0d8f0', '#5a4a6a'], platform: ['#8a8098', '#3a3448'], ladder: 'vine', water: ['#1a5a7a', '#a8fff0'],
  },
};
