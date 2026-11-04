"""Authoring script for Chapter III levels. Run: python3 tools/gen-chapter3.py
Legend additions: Q block only in the past, q block only in the present, u spore updraft (column up),
g vine seed with ':' cells above it, l Keeper lantern, f mimic mushroom, S veiled shade, k Broken Keeper, O the Shadow (boss)."""
import json

H = 24

class Seg:
    def __init__(self, w, ceil=2, floor=19):
        self.w = w
        self.g = [[' '] * w for _ in range(H)]
        self.fill(0, 0, w - 1, ceil - 1)
        self.fill(0, floor, w - 1, H - 1)
    def fill(self, x0, y0, x1, y1, ch='#'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.g[y][x] = ch
        return self
    def put(self, x, y, ch):
        self.g[y][x] = ch
        return self
    def pit(self, x0, x1, spikes=True):
        self.fill(x0, 19, x1, 21, ' ')
        if spikes: self.fill(x0, 22, x1, 22, '^')
        return self
    def vine(self, x, y0, y1):
        self.put(x, y1, 'g')
        for y in range(y0, y1): self.put(x, y, ':')
        return self
    def gate(self, x, top=2):
        self.fill(x, top, x + 1, 15)
        for y in (16, 17, 18): self.put(x, y, 'D')
        return self
    def rows(self):
        return [''.join(r) for r in self.g]

# ---------------------------------------------------------------- Part 1: The Deep Threshold
def threshold():
    a = Seg(36).fill(0, 0, 35, 3)
    a.pit(12, 22).fill(12, 19, 22, 19, 'Q')
    a.put(3, 18, 'P').put(6, 18, 'i').put(9, 18, 'o').put(16, 8, 'L').put(30, 18, 'C').put(26, 18, 'i')
    b = Seg(36).fill(0, 0, 35, 3).fill(14, 8, 35, 18)
    b.put(11, 18, 'u').put(5, 18, 'i').put(17, 7, 'i')
    b.fill(20, 4, 20, 7, 'q')
    b.put(30, 7, 'o').put(8, 8, 'L').put(26, 5, 'L')
    c = Seg(40).fill(0, 0, 39, 3).pit(5, 31)
    c.fill(7, 16, 9, 16, 'Q').fill(13, 14, 15, 14, 'q').fill(19, 16, 21, 16, 'Q').fill(25, 14, 27, 14, 'q')
    c.put(2, 18, 'C').put(5, 18, 'i').put(20, 10, 's').put(18, 6, 'L').put(35, 12, 'L').put(36, 18, '+')
    d = Seg(34).fill(0, 0, 33, 1).gate(26).fill(32, 2, 33, 18).fill(17, 11, 19, 11)
    d.put(18, 10, 'M').put(30, 18, 'E').put(3, 18, 'C').put(6, 18, 'i').put(14, 14, 'S').put(8, 18, 'o').put(11, 7, 'L').put(22, 7, 'L')
    return [a, b, c, d]

# ---------------------------------------------------------------- Part 2: The Hanging Gardens
def gardens():
    a = Seg(38).fill(0, 0, 37, 2).fill(27, 10, 37, 18)
    a.put(3, 18, 'P').put(5, 18, 'o').put(7, 18, 'i').put(11, 18, 'm').put(17, 18, 'f').put(23, 18, 'm').put(14, 8, 'L').put(32, 9, 'L')
    b = Seg(40).fill(0, 0, 39, 1).fill(0, 2, 26, 4).fill(9, 7, 23, 7, '=').fill(24, 7, 25, 18)
    b.vine(8, 7, 18)
    b.put(4, 18, 'i').put(16, 18, 'f').put(14, 5, 'L').put(32, 12, 'L').put(18, 6, 'o').put(34, 18, 'f')
    c = Seg(40).fill(0, 0, 39, 3).pit(12, 27)
    c.put(15, 21, 'u').put(16, 21, 'u').put(15, 22, '#').put(16, 22, '#')
    c.fill(19, 9, 23, 9, 'Q').fill(20, 12, 24, 12, 'q')
    c.put(2, 18, 'C').put(5, 18, 'i').put(34, 18, 'b').put(8, 8, 'L').put(30, 8, 'L')
    d = Seg(36).fill(0, 0, 35, 1).gate(28).fill(34, 2, 35, 18).fill(19, 11, 21, 11)
    d.put(20, 10, 'M').put(31, 18, 'E').put(2, 18, 'C').put(10, 18, 'f').put(14, 18, 'o').put(24, 18, 'm').put(12, 7, 'L')
    return [a, b, c, d]

# ---------------------------------------------------------------- Part 3: The Keepers' Quarter
def quarter():
    a = Seg(38).fill(0, 0, 37, 2)
    for i, (x, y) in enumerate([(10, 16), (12, 14), (14, 12)]): a.put(x, y, 'Q')
    a.fill(15, 11, 22, 11, '=')
    a.put(3, 18, 'P').put(6, 18, 'i').put(18, 10, 'o').put(19, 6, 'L').put(30, 12, 'L').put(28, 18, 'S')
    b = Seg(42).fill(0, 0, 41, 2).gate(36)
    b.fill(15, 15, 15, 18, 'q').fill(24, 15, 24, 18, 'Q')
    b.put(6, 18, 'B').put(30, 18, '_').put(1, 18, 'C').put(3, 18, 'i').put(12, 8, 'L').put(28, 8, 'L').put(39, 18, '+')
    c = Seg(44).fill(0, 0, 43, 3).fill(8, 14, 13, 14, '=').fill(30, 14, 35, 14, '=')
    c.put(2, 18, 'C').put(5, 18, 'i').put(24, 18, 'k').put(10, 8, 'L').put(33, 8, 'L').put(41, 18, '+')
    d = Seg(34).fill(0, 0, 33, 1).gate(26).fill(32, 2, 33, 18).fill(17, 11, 19, 11)
    d.put(18, 10, 'M').put(30, 18, 'E').put(3, 18, 'C').put(9, 18, 'o').put(12, 7, 'L')
    return [a, b, c, d]

# ---------------------------------------------------------------- Part 4: The Archive of Voices
def archive():
    a = Seg(38).fill(0, 0, 37, 4)
    a.put(3, 18, 'P').put(5, 18, 'i').put(8, 18, 'l').put(20, 18, 'l').put(32, 18, 'l').put(26, 14, 'S').put(14, 18, 'o').put(23, 18, 'G')
    b = Seg(40).fill(0, 0, 39, 2).fill(6, 14, 34, 14, '=').fill(4, 10, 30, 10, '=')
    for y in range(10, 19): b.put(36, y, 'H')
    b.fill(36, 14, 36, 14, 'H').fill(36, 10, 36, 10, 'H')
    b.put(12, 13, 'l').put(26, 9, 'l').put(20, 18, 'G').put(2, 18, 'C').put(4, 18, 'i').put(18, 12, 'S').put(10, 7, 'S').put(16, 9, 'o')
    b.fill(0, 3, 3, 9).fill(31, 3, 39, 9)
    c = Seg(40).fill(0, 0, 39, 2).fill(0, 3, 39, 6).fill(16, 7, 39, 9).fill(22, 10, 39, 18)
    c.vine(18, 10, 18).fill(19, 9, 21, 9, ' ')
    c.fill(16, 7, 21, 9, ' ')
    c.put(2, 18, 'C').put(5, 18, 'i').put(10, 18, 'l').put(12, 13, 'S').put(14, 18, 'G').put(19, 9, 'l')
    c.fill(22, 7, 39, 9, ' ').fill(22, 10, 39, 10)
    d = Seg(36).fill(0, 0, 35, 6).fill(0, 11, 35, 23).fill(32, 7, 35, 10)
    d.put(2, 10, 'C').put(8, 10, 'l').put(14, 10, 'o').put(20, 9, 'S').put(26, 10, 'l').put(29, 10, 'E')
    return [a, b, c, d]

# ---------------------------------------------------------------- Part 5: The Shadow Well
def well():
    a = Seg(34).fill(0, 0, 33, 6)
    a.put(3, 18, 'P').put(7, 18, 'o').put(11, 18, 'i').put(16, 18, 'l').put(28, 18, 'C').put(22, 18, '+')
    b = Seg(58).fill(0, 0, 57, 3).gate(52, top=4).fill(54, 4, 57, 15)
    b.fill(17, 11, 22, 11, '=').fill(34, 11, 39, 11, '=')
    b.put(8, 18, 'l').put(20, 10, 'l').put(37, 10, 'l').put(48, 18, 'l').put(29, 18, 'O').put(55, 18, 'E')
    return [a, b]

LEVELS = [
  dict(id='threshold', name='The Deep Threshold', theme='abyss', music='abyss', darkness=0.84,
       intro=['Beyond the Sentinel’s door, the stairs went down for a long time. Then they stopped being stairs.',
              'Pip’s light flickered — and for a moment Elias saw the walls as they had once been: golden, whole, and full of people.'],
       hints=['Press R / U — Pip’s Echo shows the city as it was', 'Bridges of the past are solid only in the past', 'Ride the rising spores', 'Rubble of the present is gone in the past', 'Switch time in mid-air between the stones', 'Veiled shades split in two — finish them both'],
       lore=['LOG 301 — Dr. Ilse Varga\nThe stairs remember feet. Thousands of them. This was a city once — the Keepers’ city.',
             'LOG 304\nPip can show me the past. I built her a lens; the Hollow gave her eyes.',
             'LOG 309\nThe shadows here wear veils. Cut one and two crawl out. Keep moving, Elias.']),
  dict(id='gardens', name='The Hanging Gardens', theme='forest', music='forest', darkness=0.4,
       intro=['The Keepers grew their gardens upside down, hanging from the roots of the world. Some of the caps had learned to bite.'],
       hints=['Some caps are not what they seem', 'A charged blast wakes the vine seeds', 'Jump into the spore column — then choose your time'],
       lore=['LOG 312\nThe statues in the gardens wear a pendant. The same pendant I was found with on the ridge.',
             'LOG 315\nI used to dream of hanging gardens. I thought every child did.',
             'LOG 318\nSome of the caps have teeth. The Keepers bred them as guards. Watch for the ones that breathe.']),
  dict(id='quarter', name='The Keepers’ Quarter', theme='keepers', music='keepers', darkness=0.55,
       intro=['Streets. Doorways. A bridge with flowers carved on its rail. And on one small door, a name Elias knew.'],
       hints=['The past remembers stairs that the present forgot', 'Rubble in the present, walls in the past — move the crate through both', 'A broken Keeper — strike its core after it slams'],
       lore=['LOG 321\nThere is a cradle in this house, and my name is carved above it. Ilse. I was born here, Elias. I was born in the Hollow.',
             'LOG 324\nThey sent me up. The last Keepers sent their last child to the surface, so that someone would remember them.']),
  dict(id='archive', name='The Archive of Voices', theme='keepers', music='keepers', darkness=0.84,
       intro=['The Keepers recorded everything — in light, in stone, in song. The shades had come to eat the recordings.'],
       hints=['Light the lanterns — shades keep their distance', 'Hide in the stacks when the veils drift close', 'Grow the vine to reach the upper archive'],
       lore=['LOG 330\nThe Keepers did not lock the Hollow to imprison it. They locked it so it could sleep, and heal.',
             'LOG 333\nThere is a song. The Keepers called it the Canto. It wakes the Seed without breaking it. I have only fragments.',
             'LOG 337\nThe darkness has a source. They called it the First Shadow. It is waiting in the Well, and it is between me and the Seed.']),
  dict(id='well', name='The Shadow Well', theme='abyss', music='abyss',
       darkness=0.76, boss=dict(name='THE FIRST SHADOW', sub='Hunger at the Bottom of the World', music='boss3'),
       intro=['At the bottom of the city, a well of darkness so deep that even Pip’s light seemed to sink into it.'],
       hints=['Light the lanterns. In the dark, nothing can touch it'],
       lore=['LOG 340\nIf it takes the light, look into the past. The Keepers’ city was never dark.']),
]

out = ["// Generated by tools/gen-chapter3.py — edit the script, not this file.",
       "import type { LevelDef } from './levels';", "", "export const CHAPTER3: LevelDef[] = ["]
for i, L in enumerate(LEVELS):
    segs = {'threshold': threshold, 'gardens': gardens, 'quarter': quarter, 'archive': archive, 'well': well}[L['id']]()
    d = dict(id=L['id'], name=L['name'], subtitle=f'Chapter III · Part {i + 1}', chapter=3, theme=L['theme'], music=L['music'],
             darkness=L['darkness'], backWall=True, doubleJump=True, eco=True, intro=L['intro'], hints=L['hints'], lore=L['lore'])
    if L.get('boss'): d['boss'] = L['boss']
    body = json.dumps(d, indent=2, ensure_ascii=False)[:-2]
    out.append('  ' + body.replace('\n', '\n  ') + ',')
    out.append('    "segments": [')
    for sg in segs:
        out.append('      [')
        out += ['        ' + json.dumps(r) + ',' for r in sg.rows()]
        out.append('      ],')
    out.append('    ],')
    out.append('  },')
out.append('];')
open('src/levels/chapter3.ts', 'w').write('\n'.join(out) + '\n')
print('ok')
