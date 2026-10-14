#!/usr/bin/env python3
"""Process the user's ChatGPT serpent sheets (brief Appendix C) into game pieces.
Input: inputs/serpents/<pal>.png — 1024x1024, flat #FF00FF background, 3 columns x 2 rows of pieces, each art pixel
drawn as an ~8x8 block. Steps: chroma-key the magenta, recover the pixel grid (8x8 blocks), quantize to the species sprite palette, crop each cell to its piece, and write
site/assets/serpents/<pal>.png + <pal>.json ({pieces: {headR, headD, headU, segL, segS, tail: [x, y, w, h]}}) and
site/assets/serpents/index.json. inputs/serpents/use.json limits which pieces ship. Usage: python3 -I tools/serpent_sheets.py"""
import os, json, sys
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
IN = os.path.join(ROOT, 'inputs', 'serpents')
OUT = os.path.join(ROOT, 'site', 'assets', 'serpents')
PALETTES = {
    'gyarados': '#000000 #7FCFFF #FFFFFF #0067B7 #1F9FE7 #678777 #375F4F #9FAFA7 #A77F27 #DFB767 #CFD7D7 #FF875F #9F0000 #F7E79F #D73F00',
    'rayquaza': '#000000 #D7EFA7 #9FCF6F #5FB727 #278700 #A76F00 #DFB700 #FFF700 #9F0000 #D73F00 #FFFFFF #FF875F #B7CFFF',
    'milotic': '#000000 #FF87BF #D73F00 #FFE79F #0067B7 #FFFFFF #1F9FE7 #DFAF67 #FF875F #9F0000 #BF7727 #8FDFFF',
}
NAMES = ['headR', 'headD', 'headU', 'segL', 'segS', 'tail']
os.makedirs(OUT, exist_ok=True)

def grid_downscale(img, block=8):
    """Back to one texel per art pixel: exact 8x8 blocks take their top-left pixel, otherwise each block's median
    (which resists antialiased edges)."""
    a = np.array(img.convert('RGBA'))
    H, W = a.shape[0] // block, a.shape[1] // block
    b = a[:H * block, :W * block].reshape(H, block, W, block, 4)
    if (b == b[:, :1, :, :1, :]).all(axis=(1, 3, 4)).mean() > 0.995:
        return Image.fromarray(b[:, 0, :, 0, :].astype(np.uint8), 'RGBA')
    return Image.fromarray(np.median(b, axis=(1, 3)).astype(np.uint8), 'RGBA')

def quantize(img, pal):
    cols = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in pal.split()], dtype=np.int32)
    a = np.array(img.convert('RGBA')).astype(np.int32)
    rgb = a[..., :3]
    mag = (np.abs(rgb - [255, 0, 255]).sum(-1) < 120) | (a[..., 3] < 128)
    d = ((rgb[..., None, :] - cols[None, None]) ** 2).sum(-1)
    q = cols[d.argmin(-1)]
    out = np.zeros(a.shape, dtype=np.uint8)
    out[..., :3] = q; out[..., 3] = np.where(mag, 0, 255)
    return Image.fromarray(out, 'RGBA')

# inputs/serpents/use.json picks which pieces ship per species (all of them when the file or the species is absent)
USE = json.load(open(os.path.join(IN, 'use.json'))) if os.path.exists(os.path.join(IN, 'use.json')) else {}
for f in os.listdir(OUT) if os.path.isdir(OUT) else []:
    if f.endswith('.png') or (f.endswith('.json') and f != 'index.json'):
        os.remove(os.path.join(OUT, f))
done = []
for pal, colors in PALETTES.items():
    src = os.path.join(IN, pal + '.png')
    if not os.path.exists(src):
        continue
    small = quantize(grid_downscale(Image.open(src).convert('RGBA')), colors)
    W, H = small.size
    cw, ch = W // 3, H // 2
    pieces, crops, x = {}, {}, 0
    for i, n in enumerate(NAMES):
        cell = small.crop(((i % 3) * cw, (i // 3) * ch, (i % 3 + 1) * cw, (i // 3 + 1) * ch))
        bb = cell.getbbox()
        if not bb:
            continue
        if pal in USE and n not in USE[pal]:
            continue
        crops[n] = cell.crop(bb)
    if not crops:
        continue
    # one row wide enough for every piece (a fixed sheet-width canvas clipped the last piece, the tail)
    sheet = Image.new('RGBA', (sum(c.width + 1 for c in crops.values()), max(c.height for c in crops.values())))
    for n, piece in crops.items():
        sheet.paste(piece, (x, 0))
        pieces[n] = [x, 0, piece.width, piece.height]
        x += piece.width + 1
    sheet = sheet.crop((0, 0, max(1, x), max(p[3] for p in pieces.values())))
    sheet.save(os.path.join(OUT, pal + '.png'))
    json.dump({'pieces': pieces}, open(os.path.join(OUT, pal + '.json'), 'w'))
    done.append(pal)
    print(pal, {k: v[2:] for k, v in pieces.items()})
json.dump({'sheets': done}, open(os.path.join(OUT, 'index.json'), 'w'))
print('serpent sheets:', done or 'none (inputs/serpents/<pal>.png not supplied yet)')
