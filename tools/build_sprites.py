"""Compile SpriteCollab sprites + portraits into per-fighter atlases for the game.

Usage: python3 -I build_sprites.py <SpriteCollab dir> <out dir> <fighters.json> [<PSP faint dir>]
A base species without a SpriteCollab Faint gets the PSP build's faint slot (tools/psp_faint.py output).
fighters.json: [{"id": "charizard", "dex": "0006", "form": null}, ...]  (form like "0001" for Megas)

Per fighter writes <out>/<id>.png (indexed atlas) and <id>.json:
  frames: [[x, y, w, h, ax, ay, hx, hy, cx, cy], ...]   ax/ay = ground anchor inside the trimmed frame,
          hx/hy = head marker, cx/cy = body-center marker (both relative to anchor)
  anims: {Name: {dirs: 8|1, dur: [ticks...], f: [[frameIdx per dir] per frame], hit, rush, ret}}
"""
import sys, os, json, hashlib
import xml.etree.ElementTree as ET
from PIL import Image
import numpy as np

SC, OUT, LIST = sys.argv[1], sys.argv[2], sys.argv[3]
FAINT_DIR = sys.argv[4] if len(sys.argv) > 4 else None
FAINT = json.load(open(os.path.join(FAINT_DIR, 'faint.json'))) if FAINT_DIR and os.path.exists(os.path.join(FAINT_DIR, 'faint.json')) else {}
os.makedirs(OUT, exist_ok=True)
KEEP = {'Walk', 'Idle', 'Hurt', 'Sleep', 'Faint', 'Attack', 'Strike', 'Shoot', 'SpAttack', 'Swing', 'Double', 'Hop', 'Charge',
        'Rotate', 'Pose', 'QuickStrike', 'RearUp', 'Float', 'Hover', 'Withdraw', 'Kick', 'Punch', 'Jab', 'Slam', 'Emit',
        'Ricochet', 'MultiStrike', 'MultiScratch', 'Twirl', 'Dance', 'Shock', 'Appeal', 'Sink', 'Tumble', 'LeapForth',
        'HitGround', 'Rumble', 'Shake', 'Cringe', 'Pain', 'DeepBreath', 'Head', 'Trip', 'LostBalance', 'TumbleBack'}
PORTRAITS = ['Normal', 'Happy', 'Pain', 'Determined', 'Joyous', 'Angry', 'Sad', 'Surprised', 'Shouting', 'Inspired']


def marker(cell, rgb):
    m = np.all(cell[..., :3] == rgb, axis=-1) & (cell[..., 3] > 0)
    ys, xs = np.nonzero(m)
    if len(xs) == 0:
        return None
    return float(xs.mean()), float(ys.mean())


def build(entry):
    fid, dex, form = entry['id'], entry['dex'], entry.get('form')
    d = os.path.join(SC, 'sprite', dex, form) if form else os.path.join(SC, 'sprite', dex)
    root = ET.parse(os.path.join(d, 'AnimData.xml')).getroot()
    shadow_size = int(root.find('ShadowSize').text)
    defs = {}
    for a in root.find('Anims'):
        defs[a.find('Name').text] = a
    frames, frame_keys, crops = [], {}, []
    anims = {}
    for name, a in defs.items():
        if name not in KEEP:
            continue
        src = a
        if a.find('CopyOf') is not None:
            src = defs.get(a.find('CopyOf').text)
            if src is None:
                continue
        sname = src.find('Name').text
        p = os.path.join(d, f'{sname}-Anim.png')
        if not os.path.exists(p):
            continue
        img = np.array(Image.open(p).convert('RGBA'))
        off = np.array(Image.open(os.path.join(d, f'{sname}-Offsets.png')).convert('RGBA'))
        shp = os.path.join(d, f'{sname}-Shadow.png')
        sh = np.array(Image.open(shp).convert('RGBA')) if os.path.exists(shp) else None
        fw, fh = int(src.find('FrameWidth').text), int(src.find('FrameHeight').text)
        durs = [int(x.text) for x in src.find('Durations')]
        rows = img.shape[0] // fh
        cols = img.shape[1] // fw
        nf = min(len(durs), cols)
        anim = {'dirs': 8 if rows >= 8 else 1, 'dur': durs[:nf], 'f': []}
        for k in ('HitFrame', 'RushFrame', 'ReturnFrame'):
            if src.find(k) is not None:
                anim[{'HitFrame': 'hit', 'RushFrame': 'rush', 'ReturnFrame': 'ret'}[k]] = int(src.find(k).text)
        for c in range(nf):
            per = []
            for r in range(min(rows, 8) if rows >= 8 else 1):
                cell = img[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw]
                ocell = off[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw]
                ys, xs = np.nonzero(cell[..., 3])
                if len(xs) == 0:
                    per.append(-1)
                    continue
                x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
                # ground anchor from shadow sheet (centroid), else bottom-center of frame cell
                anc = None
                if sh is not None:
                    scell = sh[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw]
                    sy, sx = np.nonzero(scell[..., 3])
                    if len(sx):
                        anc = ((sx.min() + sx.max() + 1) / 2, (sy.min() + sy.max() + 1) / 2)
                if anc is None:
                    anc = (fw / 2, fh / 2 + fh / 4)
                head = marker(ocell, (0, 0, 0)) or (fw / 2, y0 + 4)
                cen = marker(ocell, (0, 255, 0)) or (fw / 2, (y0 + y1) / 2)
                crop = cell[y0:y1, x0:x1]
                key = hashlib.md5(crop.tobytes() + bytes(str((x0 - anc[0], y0 - anc[1])), 'ascii')).hexdigest()
                if key in frame_keys:
                    per.append(frame_keys[key])
                    continue
                idx = len(frames)
                frame_keys[key] = idx
                ax, ay = anc[0] - x0, anc[1] - y0
                frames.append([0, 0, int(x1 - x0), int(y1 - y0), round(ax, 1), round(ay, 1),
                               round(head[0] - anc[0], 1), round(head[1] - anc[1], 1),
                               round(cen[0] - anc[0], 1), round(cen[1] - anc[1], 1)])
                crops.append(crop)
                per.append(idx)
            anim['f'].append(per)
        anims[name] = anim
    if 'Faint' not in anims and not form and fid in FAINT:
        pf = FAINT[fid]
        strip = np.array(Image.open(os.path.join(FAINT_DIR, fid + '.png')).convert('RGBA'))
        base = len(frames)
        for fr in pf['frames']:
            x, y, w, h = fr[:4]
            crops.append(strip[y:y + h, x:x + w])
            frames.append([0, 0] + list(fr[2:]))
        anims['Faint'] = {'dirs': 8, 'dur': pf['dur'], 'f': [[base + i for i in per] for per in pf['f']], 'src': 'psp'}
    # shelf pack
    order = sorted(range(len(frames)), key=lambda i: -frames[i][3])
    W = 1024 if sum(f[2] * f[3] for f in frames) > 200000 else 512
    x = y = 0
    sh_ = 0
    for i in order:
        w, h = frames[i][2], frames[i][3]
        if x + w > W:
            x, y, sh_ = 0, y + sh_ + 1, 0
        frames[i][0], frames[i][1] = x, y
        x += w + 1
        sh_ = max(sh_, h)
    H = y + sh_ + 1
    atlas = np.zeros((H, W, 4), np.uint8)
    for i, f in enumerate(frames):
        atlas[f[1]:f[1] + f[3], f[0]:f[0] + f[2]] = crops[i]
    im = Image.fromarray(atlas, 'RGBA')
    colors = im.getcolors(1 << 16)
    if colors is not None and len(colors) <= 256:
        pal = Image.new('P', (1, 1))
        im = im.quantize(colors=len(colors), method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(os.path.join(OUT, f'{fid}.png'), optimize=True)
    # portraits
    pdir = os.path.join(SC, 'portrait', dex, form) if form else os.path.join(SC, 'portrait', dex)
    ports = []
    for pn in PORTRAITS:
        pp = os.path.join(pdir, pn + '.png')
        if os.path.exists(pp):
            ports.append((pn, Image.open(pp).convert('RGBA')))
    pnames = []
    if ports:
        strip = Image.new('RGBA', (40 * len(ports), 40))
        for i, (pn, pim) in enumerate(ports):
            strip.paste(pim.resize((40, 40), Image.NEAREST), (i * 40, 0))
            pnames.append(pn)
        strip.save(os.path.join(OUT, f'{fid}-portraits.png'), optimize=True)
    credits = []
    for cp in (os.path.join(d, 'credits.txt'), os.path.join(pdir, 'credits.txt')):
        if os.path.exists(cp):
            credits.append(open(cp, encoding='utf-8', errors='replace').read().strip())
    meta = {'id': fid, 'shadow': shadow_size, 'frames': frames, 'anims': anims, 'portraits': pnames, 'atlas': [W, H]}
    json.dump(meta, open(os.path.join(OUT, f'{fid}.json'), 'w'), separators=(',', ':'))
    return fid, len(frames), list(anims.keys()), os.path.getsize(os.path.join(OUT, f'{fid}.png')), credits


if __name__ == '__main__':
    entries = json.load(open(LIST))
    allcred = {}
    for e in entries:
        try:
            fid, n, an, size, cred = build(e)
            allcred[fid] = cred
            print(f'{fid:16s} frames={n:4d} png={size // 1024}KB anims={len(an)} {",".join(sorted(an))}')
        except Exception as ex:
            print('FAIL', e, ex)
    json.dump(allcred, open(os.path.join(OUT, '_credits.json'), 'w'), indent=1)
