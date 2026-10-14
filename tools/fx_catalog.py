#!/usr/bin/env python3
"""Catalogue RawAsset particle sheets, beams and BG overlays -> build/data/fx_catalog.json.
Sheet naming: <Name>.<Layout>.png with Layout in None|Dir1|Dir2|Dir5|Dir8|Flip|<frameCount>,
or a folder <Name>/ with numbered frames and DirData.xml."""
import os, sys, json, re
from PIL import Image

RA = sys.argv[1]; OUT = sys.argv[2]
cat = {'particles': {}, 'beams': {}, 'bg': {}}
P = os.path.join(RA, 'Particle')
for fn in sorted(os.listdir(P)):
    p = os.path.join(P, fn)
    if os.path.isdir(p):
        frames = sorted([f for f in os.listdir(p) if f.endswith('.png')], key=lambda s: int(s[:-4]))
        if not frames:
            continue
        w, h = Image.open(os.path.join(p, frames[0])).size
        cat['particles'][fn] = {'src': 'Particle/' + fn, 'folder': True, 'n': len(frames), 'fw': w, 'fh': h, 'rows': 1, 'layout': 'None'}
        continue
    m = re.match(r'^(.*)\.([A-Za-z0-9]+)\.png$', fn)
    if not m:
        continue
    name, lay = m.group(1), m.group(2)
    im = Image.open(p); W, H = im.size
    if lay.isdigit():
        n = int(lay); fw = W // n; fh = H; rows = 1; layout = 'None'
    else:
        rows = {'None': 1, 'Dir1': 1, 'Flip': 1, 'Dir2': 2, 'Dir5': 5, 'Dir8': 8}.get(lay, 1)
        fh = H // rows; fw = fh; n = W // fw; layout = lay
    cat['particles'][name] = {'src': 'Particle/' + fn, 'n': n, 'fw': fw, 'fh': fh, 'rows': rows, 'layout': layout}
B = os.path.join(RA, 'Beam')
for bn in sorted(os.listdir(B)):
    parts = {}
    for part in ('Head', 'Body', 'Tail'):
        pp = os.path.join(B, bn, part + '.png')
        if os.path.exists(pp):
            parts[part] = list(Image.open(pp).size)
    cat['beams'][bn] = parts
G = os.path.join(RA, 'BG')
for fn in sorted(os.listdir(G)):
    m = re.match(r'^(.*)\.(\d+)\.png$', fn)
    if m:
        W, H = Image.open(os.path.join(G, fn)).size
        cat['bg'][m.group(1)] = {'src': 'BG/' + fn, 'n': int(m.group(2)), 'w': W, 'h': H}
json.dump(cat, open(OUT, 'w'), indent=0)
print(len(cat['particles']), 'particles', len(cat['beams']), 'beams', len(cat['bg']), 'bg')
for b, v in cat['beams'].items(): print(b, v)
for b, v in cat['bg'].items(): print(b, v)
