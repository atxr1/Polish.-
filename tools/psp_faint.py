#!/usr/bin/env python3
"""Extract the faint animation from the PSP build's sprites (SP25 .spr + <id>-sprite-N.raw pages).

The brief: "If SpriteCollab has no Faint for a species, use the PSP sprite's faint slot."
This step runs once against the PSP build and writes a small, committed input set that
tools/build_sprites.py merges into the fighter atlases:

  inputs/psp/faint/<id>.png   unique faint frames packed in a row (RGBA)
  inputs/psp/faint/faint.json {id: {frames: [[x,y,w,h,ax,ay,hx,hy,cx,cy]...], dur: [..], f: [[idx per dir]...]}}

Usage: python3 -I tools/psp_faint.py <PSP assets dir> <out dir>

SP25 layout (little endian):
  0x00 'SP25', u32 version, pages, frameCount, seqCount, animCount
  0x1C 256 x RGBA palette (index 0 transparent)
  anim records, 12 bytes: u32 seqStart, u16 frames, u16 hitFrame, u16 totalTicks, u16 flags
  frame records, 28 bytes: u16 page, x, y, w, h, anchorX, anchorY, headX, headY, lHandX, lHandY, rHandX, rHandY; u8 centerX, centerY
  sequence entries, 4 bytes: u16 frameIndex, u16 duration; frame-major, 8 directions per frame
Slot 6 is Hurt and slot 7 is Faint (group 0). The Faint slot starts with Hurt frames; only the frames
after them (the fall and the lying pose) are kept, because the game already plays Hurt first."""
import sys, os, json, struct
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
HURT, FAINT = 6, 7


def load(sid):
    b = open(os.path.join(SRC, sid + '.spr'), 'rb').read()
    if b[:4] != b'SP25':
        raise ValueError('not SP25')
    ver, pages, nfr, nseq, nanim = struct.unpack_from('<5I', b, 4)
    pal = np.frombuffer(b[0x1C:0x1C + 1024], np.uint8).reshape(256, 4).copy()
    pal[0, 3] = 0
    o = 0x1C + 1024
    anims = []
    for _ in range(nanim):
        so, fc, hit, tot, fl = struct.unpack_from('<IHHHH', b, o)
        anims.append((so, fc))
        o += 12
    frames = []
    for _ in range(nfr):
        frames.append(struct.unpack_from('<13H2B', b, o))
        o += 28
    seq = [struct.unpack_from('<2H', b, o + 4 * i) for i in range(nseq)]
    pg = [np.frombuffer(open(os.path.join(SRC, f'{sid}-sprite-{p}.raw'), 'rb').read(), np.uint8).reshape(512, 512)
          for p in range(pages)]
    return pal, anims, frames, seq, pg


def extract(sid):
    pal, anims, frames, seq, pg = load(sid)
    hso, hfc = anims[HURT]
    hurt = {seq[hso + k * 8 + d][0] for k in range(hfc) for d in range(8)}
    so, fc = anims[FAINT]
    start = 0
    while start < fc - 1 and all(seq[so + start * 8 + d][0] in hurt for d in range(8)):
        start += 1
    out_frames, crops, index, f, dur = [], [], {}, [], []
    for k in range(start, fc):
        per = []
        for d in range(8):
            fi = seq[so + k * 8 + d][0]
            if fi not in index:
                p, x, y, w, h, ax, ay, hx, hy = frames[fi][:9]
                cx, cy = frames[fi][13], frames[fi][14]
                crop = pal[pg[p][y:y + h, x:x + w]]
                index[fi] = len(out_frames)
                out_frames.append([0, 0, w, h, ax, ay, hx - ax, hy - ay, cx - ax, cy - ay])
                crops.append(crop)
            per.append(index[fi])
        if f and per == f[-1]:
            dur[-1] += 4
            continue
        f.append(per)
        dur.append(4)
    dur[-1] = 999
    x = 0
    H = max(c.shape[0] for c in crops)
    strip = np.zeros((H, sum(c.shape[1] + 1 for c in crops), 4), np.uint8)
    for i, c in enumerate(crops):
        strip[:c.shape[0], x:x + c.shape[1]] = c
        out_frames[i][0] = x
        x += c.shape[1] + 1
    Image.fromarray(strip, 'RGBA').save(os.path.join(OUT, sid + '.png'), optimize=True)
    return {'frames': out_frames, 'dur': dur, 'f': f}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for fn in sorted(os.listdir(SRC)):
        if fn.endswith('.spr'):
            sid = fn[:-4]
            try:
                meta[sid] = extract(sid)
                print(f'{sid:12s} faint frames={len(meta[sid]["frames"])} steps={len(meta[sid]["f"])}')
            except Exception as ex:
                print('FAIL', sid, ex)
    json.dump(meta, open(os.path.join(OUT, 'faint.json'), 'w'), separators=(',', ':'))
