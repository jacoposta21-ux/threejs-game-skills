"""Authoring script for Chapter II levels: builds 24-row ASCII segments from coordinates
and writes src/levels/chapter2.ts. Run: python3 tools/gen-chapter2.py"""
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
    def rows(self):
        return [''.join(r) for r in self.g]

def level(**kw):
    return kw

# ---------------------------------------------------------------- Part 6: The Glass Caverns
def glass():
    segs = []
    a = Seg(36)
    a.fill(0, 0, 35, 4).fill(8, 5, 15, 5).fill(24, 0, 35, 12)
    a.fill(28, 13, 28, 18, 'K')
    a.put(4, 18, 'P').put(7, 18, 'i').put(11, 18, 'o').put(12, 8, 'L').put(21, 18, 'i').put(32, 18, 'C')
    segs.append(a)
    b = Seg(40)
    b.fill(0, 0, 39, 6).fill(8, 19, 31, 21, ' ').fill(8, 22, 31, 22, '^')
    b.fill(9, 19, 30, 19, '-').put(9, 19, 'T')
    b.put(14, 7, 'r').put(23, 7, 'r').put(26, 7, 'c').put(20, 10, 'L').put(3, 18, 'i').put(36, 18, '+')
    segs.append(b)
    c = Seg(36)
    c.fill(0, 0, 35, 2).fill(30, 6, 35, 18).fill(0, 3, 6, 6)
    c.fill(27, 5, 27, 18, '|').put(27, 18, 'Y')
    c.put(29, 12, 'c').put(32, 5, 'o').put(12, 9, 'L').put(4, 18, 'C').put(22, 18, 'i')
    segs.append(c)
    d = Seg(40)
    d.fill(0, 0, 39, 2).fill(0, 6, 5, 18).fill(6, 19, 35, 21, ' ').fill(6, 22, 35, 22, '^').fill(36, 14, 39, 18)
    d.fill(8, 10, 20, 10, '-').put(8, 10, 'T')
    d.fill(24, 13, 34, 13, '-').put(34, 13, 'T')
    d.put(18, 15, 's').put(12, 4, 'L').put(30, 6, 'L')
    segs.append(d)
    e = Seg(40)
    e.fill(0, 0, 39, 8).fill(0, 14, 14, 18).fill(15, 16, 17, 18).fill(22, 9, 39, 10)
    e.fill(22, 11, 22, 18, 'K')
    e.put(2, 13, 'C').put(12, 11, 'L').put(30, 15, 's').put(34, 13, 'L').put(8, 13, 'o')
    segs.append(e)
    f = Seg(34)
    f.fill(0, 0, 33, 1).fill(26, 2, 27, 15).fill(32, 2, 33, 18).fill(17, 11, 19, 11)
    for y in (16, 17, 18): f.put(26, y, 'D')
    f.put(18, 10, 'M').put(30, 18, 'E').put(3, 18, 'C').put(9, 18, 'i').put(12, 7, 'L').put(22, 2, 'r')
    segs.append(f)
    return segs

# ---------------------------------------------------------------- Part 7: The Clockwork Ruins
def clockwork():
    segs = []
    a = Seg(38)
    a.fill(0, 0, 37, 9)
    a.fill(8, 19, 16, 19, '}')
    a.put(20, 10, 'Z').put(27, 10, 'Z')
    a.put(3, 18, 'P').put(6, 18, 'o').put(9, 18, 'i').put(33, 18, 'i').put(14, 11, 'L').put(31, 13, 'L')
    segs.append(a)
    b = Seg(40)
    b.fill(0, 0, 39, 3).fill(8, 14, 13, 14, '=').fill(20, 11, 25, 11, '=').fill(30, 14, 35, 14, '=')
    b.put(14, 8, 'd').put(30, 7, 'd').put(1, 18, 'C').put(4, 18, 'i').put(22, 6, 'L').put(36, 18, '+').put(23, 10, 'o')
    segs.append(b)
    c = Seg(40)
    c.fill(0, 0, 39, 8).fill(4, 19, 32, 19, '{').fill(33, 17, 39, 18)
    c.put(10, 9, 'Z').put(17, 9, 'Z').put(24, 9, 'Z').put(2, 18, 'i').put(14, 12, 'L').put(30, 12, 'L')
    segs.append(c)
    d = Seg(42)
    d.fill(0, 0, 41, 8).fill(0, 17, 5, 18).fill(6, 19, 24, 19, '}').fill(32, 9, 33, 15)
    for y in (16, 17, 18): d.put(32, y, 'D')
    d.put(8, 18, 'B').put(25, 18, '_').put(2, 16, 'C').put(4, 16, 'i').put(15, 11, 'd').put(12, 10, 'L').put(38, 18, 'o').put(28, 10, 'L')
    segs.append(d)
    e = Seg(36)
    e.fill(0, 0, 35, 12)
    for x in (9, 19, 29): e.put(x, 13, '!')
    e.put(14, 13, 'Z').put(24, 13, 'Z').put(2, 18, 'C').put(5, 18, 'i').put(33, 18, '+')
    segs.append(e)
    f = Seg(34)
    f.fill(0, 0, 33, 1).fill(26, 2, 27, 15).fill(32, 2, 33, 18).fill(12, 13, 16, 13, '=').fill(19, 10, 21, 10)
    for y in (16, 17, 18): f.put(26, y, 'D')
    f.put(20, 9, 'M').put(30, 18, 'E').put(3, 18, 'C').put(8, 6, 'd').put(14, 6, 'L').put(23, 14, 'L')
    segs.append(f)
    return segs

# ---------------------------------------------------------------- Part 8: The Sunken Temple
def temple():
    segs = []
    a = Seg(38)
    a.fill(0, 0, 37, 7).fill(12, 19, 22, 21, '~').fill(12, 22, 22, 22)
    a.put(30, 8, 'p').put(3, 18, 'P').put(6, 18, 'i').put(9, 18, 'o').put(26, 18, 'i').put(17, 10, 'L').put(34, 12, 'L')
    segs.append(a)
    b = Seg(40)
    b.fill(0, 0, 39, 1).fill(30, 2, 31, 15).fill(7, 10, 9, 10)
    for y in (16, 17, 18): b.put(30, y, 'D')
    b.put(8, 9, 'N').put(1, 18, 'C').put(4, 18, 'i').put(20, 4, 'p').put(16, 18, 'b').put(36, 18, 'o').put(13, 6, 'L').put(25, 6, 'L')
    segs.append(b)
    c = Seg(40)
    c.fill(0, 0, 39, 9).fill(10, 19, 27, 21, ' ').fill(10, 22, 27, 22, '^')
    for x0 in (13, 18, 23): c.fill(x0, 19, x0 + 2, 19, 'h')
    c.put(1, 18, 'C').put(4, 18, 'i').put(20, 13, 's').put(6, 12, 'L').put(33, 12, 'L').put(36, 18, '+')
    segs.append(c)
    d = Seg(42)
    d.fill(0, 0, 41, 1).fill(3, 10, 5, 10).fill(34, 2, 35, 15)
    for y in (16, 17, 18): d.put(34, y, 'D')
    d.put(4, 9, 'N').put(1, 18, 'C').put(14, 6, 'p').put(25, 6, 'p').put(19, 18, 'b').put(10, 12, 'L').put(30, 12, 'L').put(38, 18, 'i')
    segs.append(d)
    e = Seg(34)
    e.fill(0, 0, 33, 1).fill(30, 2, 33, 18).fill(12, 19, 18, 21, '~').fill(12, 22, 18, 22)
    e.put(2, 18, 'C').put(8, 18, 'o').put(24, 18, 'c').put(27, 18, 'E').put(15, 8, 'L').put(22, 4, 'p')
    segs.append(e)
    return segs

# ---------------------------------------------------------------- Part 9: The Sentinel's Vault
def vault():
    segs = []
    a = Seg(34)
    a.fill(0, 0, 33, 7)
    a.put(3, 18, 'P').put(8, 18, 'o').put(13, 18, 'i').put(28, 18, 'C').put(10, 10, 'L').put(24, 10, 'L').put(20, 18, '+')
    segs.append(a)
    b = Seg(58)
    b.fill(0, 0, 57, 3).fill(52, 4, 53, 15).fill(54, 4, 57, 18)
    for y in (16, 17, 18): b.put(52, y, 'D')
    b.fill(8, 13, 12, 13, '=').fill(42, 13, 46, 13, '=').fill(24, 10, 30, 10, '=')
    b.put(27, 18, 'V').put(3, 8, 'L').put(48, 8, 'L').put(27, 6, 'L').put(55, 18, ' ')
    b.fill(54, 16, 57, 18, ' ').put(55, 18, 'E')
    segs.append(b)
    return segs

LEVELS = [
  dict(id='glass', name='The Glass Caverns', theme='ice', music='ice', darkness=0.6, backWall=True, ice=True,
       intro=['Weeks later, Pip began to blink in the dark of Elias’s room. Three short, three long. His mother’s old signal.',
              'It came from beneath the ridge, from caves no survey had ever mapped. This time, Elias went down on purpose.'],
       hints=['Crystal floors are slick — let go early to stop', 'Cracked crystal shatters under fire', 'Rails and lifts carry you across', 'Ride the lift up — it waits at the ends', 'Time your landing between two moving rails'],
       lore=['LOG 210 — Dr. Ilse Varga\nThe Glass Caverns sing when the lifts move. Someone built rails down here long before us.',
             'LOG 214\nThe signal I am following is not mine. Something deeper is calling back.',
             'LOG 219\nIf Pip ever repeats my code, Elias, it means I am still walking. Do not come after me. (You will. You are my son.)'],
       segs=glass()),
  dict(id='clockwork', name='The Clockwork Ruins', theme='foundry', music='foundry', darkness=0.38, backWall=True,
       intro=['Below the glass, the caves became halls. The halls became machines — stone gears turning by themselves, older than any city above.'],
       hints=['Belts carry you along', 'Crushers fall in rhythm — pass while they rise', 'Watchers fire where their beam points: break their line of sight', 'This belt runs against you — keep moving', 'Belts move crates too', 'Arcs and crushers share a rhythm — read it'],
       lore=['LOG 231\nThe ruins are a machine. The machine is a lock. Every lock in the Hollow has a keeper.',
             'LOG 236\nThe Watchers saw me. They did not shoot. I think they were told to let me pass.',
             'LOG 240\nThe Sentinel sleeps in the vault below the temple. I must reach the door it guards.'],
       segs=clockwork()),
  dict(id='temple', name='The Sunken Temple', theme='ruins', music='ruins', darkness=0.62, backWall=True,
       intro=['A temple stood half-drowned in still, glowing water. Its doors only opened while its totems burned.'],
       hints=['Swim across the still water', 'Blades swing in rhythm — wait, then go', 'Pip wakes timed totems — the gate will not wait', 'Light-glass and shadows — keep Pip close', 'Another timed gate. Run!'],
       lore=['LOG 252\nThe totems remember Pip. Seven heartbeats of light, then the doors close again.',
             'LOG 258\nI found the vault. The Sentinel woke when I passed. I left something for it to chase.',
             'LOG 259\nThe water here is warm, like the walls of B-deck were. Everything down here is one living thing.'],
       segs=temple()),
  dict(id='vault', name="The Sentinel's Vault", theme='foundry', music='foundry', darkness=0.35, backWall=True,
       boss=dict(name='THE ANCIENT SENTINEL', sub='Keeper of the Deep Door', music='boss2'),
       intro=['At the bottom of the temple, a vault. Inside, something enormous opened a single, glowing eye.'],
       hints=['When the Sentinel crashes down, its core is open — strike it'],
       lore=['LOG 260\nIf you are reading this, it let you in. It let me in too. The door it guards leads home — not up. Down.'],
       segs=vault()),
]

out = ["// Generated by tools/gen-chapter2.py — edit the script, not this file.",
       "import type { LevelDef } from './levels';", "", "export const CHAPTER2: LevelDef[] = ["]
for i, L in enumerate(LEVELS):
    d = dict(id=L['id'], name=L['name'], subtitle=f'Chapter II · Part {i + 1}', chapter=2, theme=L['theme'], music=L['music'],
             darkness=L['darkness'], backWall=L['backWall'], doubleJump=True, intro=L['intro'], hints=L['hints'], lore=L['lore'])
    if L.get('ice'): d['ice'] = True
    if L.get('boss'): d['boss'] = L['boss']
    segs = [s.rows() for s in L['segs']]
    body = json.dumps(d, indent=2, ensure_ascii=False)[:-2]
    out.append('  ' + body.replace('\n', '\n  ') + ',')
    out.append('    "segments": [')
    for sg in segs:
        out.append('      [')
        out += ['        ' + json.dumps(r) + ',' for r in sg]
        out.append('      ],')
    out.append('    ],')
    out.append('  },')
out.append('];')
open('src/levels/chapter2.ts', 'w').write('\n'.join(out) + '\n')
print('ok', [len(L['segs']) for L in LEVELS])
