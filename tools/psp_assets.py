#!/usr/bin/env python3
"""Decode the PSP build's image assets (GU_PSM_4444, ABGR 4 bits/channel, LE u16) to PNG.
Usage: psp_assets.py <assets dir> <out dir>"""
import sys, os
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def dec4444(name, stride, w=None, h=None):
    b = open(os.path.join(SRC, name), 'rb').read()
    v = np.frombuffer(b, '<u2')
    rows = len(v) // stride
    v = v[:rows * stride].reshape(rows, stride)
    r = (v & 15) * 17; g = ((v >> 4) & 15) * 17; bl = ((v >> 8) & 15) * 17; a = ((v >> 12) & 15) * 17
    img = np.stack([r, g, bl, a], -1).astype(np.uint8)
    if w: img = img[:, :w]
    if h: img = img[:h]
    return Image.fromarray(img, 'RGBA')

jobs = {
    'title': ('title.raw', 512, 480, 272),
    'air-terrain': ('air-terrain.raw', 512, None, None),
    'roster': ('roster.raw', 512, None, None),
    'trainers': ('trainers.raw', 512, None, None),
    'court': ('court.raw', 128, None, None),
    'water-surface': ('water-surface.raw', 128, None, None),
    'banner': ('banner.raw', 128, None, None),
}
for k, (fn, stride, w, h) in jobs.items():
    p = os.path.join(SRC, fn)
    if not os.path.exists(p):
        print('missing', fn); continue
    im = dec4444(fn, stride, w, h)
    im.save(os.path.join(OUT, k + '.png'))
    print(k, im.size)
# trainer portraits: 128x128 cells, 4 per row
order = ['paul', 'cynthia', 'misty', 'red', 'brock', 'ash', 'jessie_james', 'oak', 'nurse_joy', 'giovanni', 'jenny']
t = Image.open(os.path.join(OUT, 'trainers.png'))
for i, n in enumerate(order):
    x, y = (i % 4) * 128, (i // 4) * 128
    t.crop((x, y, x + 128, y + 128)).save(os.path.join(OUT, f'trainer_{n}.png'))
