import { newTrack } from '../track/Track';
import { TrackChain } from '../track/TrackChain';
import type { TrackData } from '../track/types';

type Step = string | { id: string; mirror?: boolean; out?: number };

function build(id: string, name: string, start: [number, number, number, number], steps: Step[], area = 32, env?: string): TrackData {
  const t = newTrack(name);
  t.id = id;
  t.created = 0;
  t.updated = 0;
  t.meta = { source: 'builtin', area };
  if (env) t.env = env;
  const c = new TrackChain(t);
  c.start(start[0], start[1], start[2], start[3]);
  for (const s of steps) {
    if (typeof s === 'string') c.place(s);
    else c.place(s.id, { mirror: s.mirror, outIndex: s.out });
  }
  return t;
}

/** Compact showcase for the animated main menu. */
export function menuTrack(): TrackData {
  return build('menu', 'Showcase', [-18, 15, -10, 0], [
    'booster',
    'curve_gentle_r',
    'straight',
    'curve_sharp_r',
    'funnel_small',
    'curve_sharp_l',
    'straight_short',
    'curve_sharp_l',
    'booster',
    'loop',
    'curve_gentle_l',
    'finish',
  ]);
}

export interface BuiltinInfo {
  id: string;
  name: string;
  desc: string;
  difficulty: number;
  make: () => TrackData;
}

export const BUILTIN_TRACKS: BuiltinInfo[] = [
  {
    id: 'b_hills',
    name: 'Rolling Hills',
    desc: 'A friendly downhill cruise with sweeping turns.',
    difficulty: 1,
    make: () =>
      build('b_hills', 'Rolling Hills', [-22, 14, -20, 0], [
        'straight_long',
        'curve_gentle_r',
        'ramp_down',
        'curve_gentle_r',
        's_curve',
        'straight',
        'curve_gentle_l',
        'half_pipe',
        'finish',
      ]),
  },
  {
    id: 'b_funnel',
    name: 'Funnel Frenzy',
    desc: 'Three funnels stacked into a swirling cascade.',
    difficulty: 2,
    make: () =>
      build('b_funnel', 'Funnel Frenzy', [-22, 26, -22, 0], ['booster', 'funnel_large', 'straight', 'funnel_small', 'curve_sharp_l', 'straight', 'funnel_vortex', 'straight', 'finish']),
  },
  {
    id: 'b_loops',
    name: 'Loop Valley',
    desc: 'Big drops feed a pair of loops and a corkscrew.',
    difficulty: 2,
    make: () =>
      build('b_loops', 'Loop Valley', [-22, 26, -20, 0], ['ramp_steep', 'loop', 'curve_gentle_r', 'corkscrew', 'straight', 'ramp_down', 'loop', { id: 'curve_gentle_l' }, 'straight', 'finish']),
  },
  {
    id: 'b_obstacles',
    name: 'Obstacle Alley',
    desc: 'Spinners, swingers and gates. Luck matters here.',
    difficulty: 3,
    make: () =>
      build('b_obstacles', 'Obstacle Alley', [-22, 20, -20, 0], ['ramp_down', 'rotator', 'curve_sharp_r', 'gates', 'swinger', 'curve_sharp_r', 'pendulum', 'moving_platform', 'curve_gentle_l', 'finish']),
  },
  {
    id: 'b_air',
    name: 'Big Air',
    desc: 'Kickers, a bounce pad and the cannon. Fly!',
    difficulty: 3,
    make: () => build('b_air', 'Big Air', [-26, 24, -18, 0], ['ramp_down', 'jump', 'gap_jump', 'curve_gentle_r', 'bounce', 'cannon', 'curve_sharp_r', 'straight', 'finish'], 32),
  },
  {
    id: 'b_fork',
    name: 'The Fork',
    desc: 'Two routes, one finish. Which side is faster?',
    difficulty: 2,
    make: () => {
      const t = newTrack('The Fork');
      t.id = 'b_fork';
      t.created = 0;
      t.updated = 0;
      t.meta = { source: 'builtin', area: 32 };
      const c = new TrackChain(t);
      c.start(-22, 18, -2, 0);
      c.place('ramp_down');
      const sp = c.place('splitter');
      const [a, b] = c.outs(sp);
      c.cursor = a;
      c.place('gates');
      const endA = c.cursor;
      c.cursor = b;
      c.place('booster');
      c.place('booster');
      if (!endA) throw new Error('fork');
      c.place('merge', { at: endA, inIndex: 0 });
      c.place('curve_gentle_r');
      c.place('drop');
      c.place('curve_sharp_r');
      c.place('finish');
      return t;
    },
  },
];
