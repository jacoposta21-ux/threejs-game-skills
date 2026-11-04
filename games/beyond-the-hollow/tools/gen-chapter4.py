"""Authoring script for Chapter IV levels. Run: python3 tools/gen-chapter4.py
Legend additions: n Light-Thread node, I Ilse, R ritual door (only Ilse opens it), J Lucimante jelly, U the Shadow Heart."""
import json, importlib.util, sys
spec = importlib.util.spec_from_file_location('c3', 'tools/gen-chapter3.py')
src = open('tools/gen-chapter3.py').read().split('# ---------------------------------------------------------------- Part 1')[0]
ns = {}
exec(src, ns)
Seg = ns['Seg']

def roots():
    a = Seg(38).fill(0, 0, 37, 3).pit(12, 30)
    for x in (15, 21, 27): a.put(x, 11, 'n')
    a.put(3, 18, 'P').put(6, 18, 'i').put(9, 18, 'o').put(20, 6, 'L').put(34, 18, 'C')
    b = Seg(40).fill(0, 0, 39, 3).pit(6, 33)
    b.fill(8, 16, 18, 16, '-').put(8, 16, 'T')
    for x in (24, 30): b.put(x, 10, 'n')
    b.put(2, 18, 'i').put(36, 18, 'c').put(14, 7, 'L').put(30, 6, 'c')
    c = Seg(40).fill(0, 0, 39, 2).fill(30, 6, 39, 18)
    c.put(22, 12, 'n').put(27, 7, 'n')
    c.put(2, 18, 'C').put(5, 18, 'i').put(34, 5, 'o').put(12, 8, 'L').put(16, 18, 'c')
    d = Seg(34).fill(0, 0, 33, 1).gate(26).fill(32, 2, 33, 18).fill(17, 11, 19, 11)
    d.put(18, 10, 'M').put(30, 18, 'E').put(3, 18, 'C').put(9, 18, 'c').put(12, 7, 'L').put(22, 18, 'o')
    return [a, b, c, d]

def sap():
    a = Seg(38).fill(0, 0, 37, 3).fill(10, 14, 37, 21, '~').fill(10, 22, 37, 22)
    a.fill(10, 19, 37, 21, '~')
    a.put(3, 18, 'P').put(5, 18, 'i').put(8, 18, 'o').put(18, 17, 'J').put(28, 15, 'J').put(14, 8, 'L').put(30, 7, 'L')
    a.fill(0, 19, 9, 23).fill(10, 23, 37, 23)
    b = Seg(40).fill(0, 0, 39, 3).fill(0, 14, 39, 21, '~').fill(0, 22, 39, 23)
    b.fill(14, 11, 19, 13).fill(30, 11, 34, 13)
    b.put(16, 10, 'C').put(8, 16, 'J').put(24, 13, 'J').put(37, 16, 'J').put(24, 5, 'n').put(10, 6, 'L').put(32, 6, 'L').put(18, 10, 'i')
    c = Seg(40).fill(0, 0, 39, 2).fill(0, 14, 39, 21, '~').fill(0, 22, 39, 23).fill(0, 11, 5, 13).fill(34, 11, 39, 13)
    for x in (11, 18, 25, 31): c.put(x, 6, 'n')
    c.put(2, 10, 'C').put(15, 9, 'J').put(27, 9, 'J').put(36, 10, 'o').put(20, 3, 'L').put(4, 10, 'i')
    d = Seg(34).fill(0, 0, 33, 1).fill(0, 11, 33, 23).fill(32, 2, 33, 10)
    d.put(3, 10, 'C').put(10, 10, 'o').put(28, 10, 'E').put(18, 5, 'L')
    return [a, b, c, d]

def memory():
    a = Seg(38).fill(0, 0, 37, 2).fill(14, 9, 22, 17)
    for y in range(9, 19): a.put(12, y, 'H')
    a.fill(10, 9, 11, 9, '=').fill(13, 9, 13, 9, '=')
    a.put(3, 18, 'P').put(6, 18, 'i').put(8, 18, 'o').put(18, 8, 'c').put(28, 18, 'c').put(25, 3, '!').put(32, 3, '!').put(6, 8, 'L').put(30, 9, 'L')
    a.fill(23, 0, 37, 2)
    b = Seg(42).fill(0, 0, 41, 2).gate(36)
    b.fill(15, 15, 15, 18, 'q').fill(24, 15, 24, 18, 'Q')
    b.put(6, 18, 'B').put(30, 18, '_').put(1, 18, 'C').put(3, 18, 'i').put(12, 8, 'L').put(28, 8, 'L').put(20, 12, 's').put(39, 18, '+')
    c = Seg(40).fill(0, 0, 39, 3).pit(8, 31)
    for x in (13, 20, 27): c.put(x, 10, 'n')
    c.put(2, 18, 'C').put(4, 18, 'i').put(20, 14, 's').put(35, 18, 'b').put(6, 8, 'L').put(34, 8, 'L').put(37, 18, 'o')
    d = Seg(34).fill(0, 0, 33, 1).gate(26).fill(32, 2, 33, 18).fill(17, 11, 19, 11)
    d.put(18, 10, 'M').put(30, 18, 'E').put(3, 18, 'C').put(8, 18, 'c').put(12, 7, 'L').put(22, 18, 'o')
    return [a, b, c, d]

def sanctuary():
    a = Seg(36).fill(0, 0, 35, 4)
    a.put(3, 18, 'P').put(6, 18, 'I').put(9, 18, 'i').put(14, 18, 'o').put(18, 9, 'L').put(30, 18, 'C')
    b = Seg(40).fill(0, 0, 39, 2).fill(30, 2, 31, 15)
    for y in (16, 17, 18): b.put(30, y, 'R')
    b.put(2, 18, 'C').put(5, 18, 'i').put(12, 8, 'L').put(24, 8, 'L').put(36, 18, 'o')
    c = Seg(40).fill(0, 0, 39, 2).fill(10, 18, 13, 18).fill(20, 18, 24, 18).fill(32, 2, 33, 15)
    for y in (16, 17, 18): c.put(32, y, 'R')
    c.put(2, 18, 'C').put(16, 14, 'J').put(26, 12, 'J').put(8, 8, 'L').put(27, 8, 'L').put(37, 18, '+')
    d = Seg(34).fill(0, 0, 33, 1).fill(32, 2, 33, 18)
    d.put(3, 18, 'C').put(12, 18, 'o').put(28, 18, 'E').put(18, 8, 'L')
    return [a, b, c, d]

def heart():
    a = Seg(34).fill(0, 0, 33, 5)
    a.put(3, 18, 'P').put(8, 18, 'o').put(12, 18, 'i').put(28, 18, 'C').put(20, 18, '+').put(16, 9, 'L')
    b = Seg(60).fill(0, 0, 59, 2).gate(54, top=3).fill(56, 3, 59, 15)
    b.fill(6, 13, 10, 13, '=').fill(48, 13, 52, 13, '=')
    for x, y in ((12, 9), (19, 7), (39, 7), (46, 9), (29, 5)): b.put(x, y, 'n')
    b.put(29, 18, 'U').put(57, 18, 'E').put(3, 8, 'L').put(55, 18, ' ')
    return [a, b]

LEVELS = [
  dict(id='roots', name='The Roots of the World', theme='seed', music='seed', darkness=0.55, segs=roots,
       intro=['Below the Well there was no more stone. Only roots — vast, warm, slowly breathing — and light moving inside them like blood.',
              'Pip spun a thread of light between herself and Elias. The Hollow, it seemed, had been waiting to teach her that.'],
       hints=['Press F / O — Pip’s Light Thread: catch a glowing node and swing (← → to swing, ↑ ↓ to climb, JUMP to let go)', 'Ride the roots, then catch the nodes', 'Swing up — climb the thread, then let go at the top'],
       lore=['LOG 401 — Ilse, through Pip\nElias. I can hear you through her. Don’t be afraid — this is the inside of the Hollow. It knows us.',
             'LOG 404\nThe roots move to let you through. It has never done that for anyone. Not even for me.',
             'LOG 407\nKeep going down. I am waiting at the Seed. I will not go anywhere without you, not this time.']),
  dict(id='sap', name='The Sea of Sap', theme='sap', music='ocean', darkness=0.45, segs=sap,
       intro=['A sea of golden sap, warm as a bath, alive with drifting lights.'],
       hints=['Lucimanti follow Pip’s light — keep them away from her', 'Cross the islands and the nodes above the sap', 'One node after another — never stop swinging'],
       lore=['LOG 412\nThe sap is the Hollow’s memory. When you swim in it, you remember things that are not yours.',
             'LOG 415\nI remembered a lullaby today. My mother’s. She was a Keeper. She sang it to the Seed.',
             'LOG 418\nThe Lucimanti are not cruel. They are only hungry for light, like everything down here.']),
  dict(id='memory', name='The Memory of the Hollow', theme='memory', music='station', darkness=0.7, segs=memory,
       intro=['The Hollow showed Elias where he had been: the station, the forest, the caves — but stained, the way a nightmare stains a happy room.'],
       hints=['The Hollow remembers your path — but the Shadow remembers it too', 'Push the crate through both times, as before', 'The past and the threads — use everything Pip taught you'],
       lore=['LOG 420\nI remember the day I left. You were asleep. I put Pip on your desk, and I told her: if he ever comes looking, keep him safe.',
             'LOG 423\nShe never told me she was keeping you safe. She told me you were keeping her.',
             'LOG 426\nThe Shadow is in the memories too. It wants us to forget why we came.']),
  dict(id='sanctuary', name='The Sanctuary of the Seed', theme='seed', music='seed', darkness=0.5, segs=sanctuary,
       intro=['The crystal wall cracked, and his mother stepped through it. For a long moment neither of them said anything at all.',
              '“The Keeper doors only open for Keeper blood,” Ilse said, taking his hand. “Stay close. Keep the dark off me.”'],
       hints=['Ilse follows you — keep her safe', 'At Keeper doors Ilse kneels and channels — protect her from the shades'],
       lore=['LOG 430 — Ilse, in person\n“You grew up.” That is all I could say. I had a thousand things ready, and that is all I could say.',
             'LOG 433\nThe Seed needs the Canto. Pip carries a spark of it — I put it there when I built her. That is why the Hollow loves her.',
             'LOG 436\nIf there is no other way, Pip will have to stay. I am sorry, little light.']),
  dict(id='core', name='The Heart of Shadow', theme='seed', music='seed', darkness=0.55, segs=heart, hook=True,
       boss=dict(name='THE HEART OF SHADOW', sub='The First Shadow, wound around the Seed', music='boss4'),
       intro=['At the center of everything, the Seed burned — and around it, the First Shadow had wound itself like a hand around a candle.'],
       hints=['Free the infected nodes, dodge in time, strike the core'],
       lore=['LOG 440\nEvery recording you found is a verse of the Canto. Find enough of them, and Pip will not have to be the price.']),
]

out = ["// Generated by tools/gen-chapter4.py — edit the script, not this file.",
       "import type { LevelDef } from './levels';", "", "export const CHAPTER4: LevelDef[] = ["]
for i, L in enumerate(LEVELS):
    d = dict(id=L['id'], name=L['name'], subtitle=f'Chapter IV · Part {i + 1}', chapter=4, theme=L['theme'], music=L['music'],
             darkness=L['darkness'], backWall=True, doubleJump=True, eco=True, hook=True, intro=L['intro'], hints=L['hints'], lore=L['lore'])
    if L.get('boss'): d['boss'] = L['boss']
    body = json.dumps(d, indent=2, ensure_ascii=False)[:-2]
    out.append('  ' + body.replace('\n', '\n  ') + ',')
    out.append('    "segments": [')
    for sg in L['segs']():
        out.append('      [')
        out += ['        ' + json.dumps(r) + ',' for r in sg.rows()]
        out.append('      ],')
    out.append('    ],')
    out.append('  },')
out.append('];')
open('src/levels/chapter4.ts', 'w').write('\n'.join(out) + '\n')
print('ok')
