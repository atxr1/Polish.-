#!/usr/bin/env python3
"""Render a labelled montage of particle sheets (first row/frames) for visual review."""
import sys, json, os
from PIL import Image, ImageDraw
RA, CAT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
names = sys.argv[4].split(',')
cat = json.load(open(CAT))['particles']
rows = []
for n in names:
    c = cat.get(n)
    if not c:
        print('missing', n); continue
    if c.get('folder'):
        fr = [Image.open(os.path.join(RA, c['src'], f'{i}.png')).convert('RGBA') for i in range(c['n'])]
    else:
        im = Image.open(os.path.join(RA, c['src'])).convert('RGBA')
        r = 2 if c['rows'] == 8 else 0
        fr = [im.crop((i * c['fw'], r * c['fh'], (i + 1) * c['fw'], (r + 1) * c['fh'])) for i in range(c['n'])]
    step = max(1, len(fr) // 10)
    fr = fr[::step][:10]
    rows.append((n, c, fr))
W = 1400
H = sum(max(f.size[1] for f in fr) + 14 for _, _, fr in rows) + 4
H = min(H, 6000)
canvas = Image.new('RGBA', (W, H), (40, 40, 52, 255))
d = ImageDraw.Draw(canvas)
y = 2
for n, c, fr in rows:
    d.text((2, y), f"{n} {c['fw']}x{c['fh']} n{c['n']} {c['layout']}", fill=(255, 255, 0, 255))
    x = 2; y += 12
    for f in fr:
        if x + f.size[0] > W: break
        canvas.alpha_composite(f, (x, y)); x += f.size[0] + 4
    y += max(f.size[1] for f in fr) + 2
    if y > H - 10: break
canvas.save(OUT)
