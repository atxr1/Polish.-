#!/usr/bin/env python3
"""Pixel-art map painters for maps built in code: Indigo Plateau Stadium (always) and Lumiose Skyline
(fallback when the user's image is missing). Everything is drawn per pixel with a fixed palette, no
anti-aliasing, then saved as indexed PNG at 1 texel per world unit.
Usage: paint_maps.py <psp png dir> <out dir> [indigo] [lumiose]"""
import sys, os, math, random
import numpy as np
from PIL import Image

PSP, OUT = sys.argv[1], sys.argv[2]
which = sys.argv[3:] or ['indigo', 'lumiose']
os.makedirs(OUT, exist_ok=True)

def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

def disc(img, cx, cy, r, col):
    H, W = img.shape[:2]
    for y in range(max(0, int(cy - r - 1)), min(H, int(cy + r + 2))):
        for x in range(max(0, int(cx - r - 1)), min(W, int(cx + r + 2))):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                img[y, x] = col

def ring(img, cx, cy, r, col, w=1):
    H, W = img.shape[:2]
    for y in range(max(0, int(cy - r - 2)), min(H, int(cy + r + 3))):
        for x in range(max(0, int(cx - r - 2)), min(W, int(cx + r + 3))):
            d = math.hypot(x - cx, y - cy)
            if r - w < d <= r:
                img[y, x] = col

def rect(img, x0, y0, x1, y1, col):
    img[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = col

def outline_rect(img, x0, y0, x1, y1, col, w=1):
    rect(img, x0, y0, x1, y0 + w, col); rect(img, x0, y1 - w, x1, y1, col)
    rect(img, x0, y0, x0 + w, y1, col); rect(img, x1 - w, y0, x1, y1, col)

def line(img, x0, y0, x1, y1, col, w=1):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / max(1, n)
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        for dy in range(-(w // 2), w - w // 2):
            for dx in range(-(w // 2), w - w // 2):
                if 0 <= y + dy < img.shape[0] and 0 <= x + dx < img.shape[1]:
                    img[y + dy, x + dx] = col

def quantize_save(img, path, colors=48):
    im = Image.fromarray(img.astype(np.uint8), 'RGB')
    q = im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q.save(path, optimize=True)
    return q

# ----------------------------------------------------------------------------------------- Indigo Plateau
def indigo():
    rnd = random.Random(1996)
    W, H = 640, 420
    img = np.zeros((H, W, 3), np.int32)
    # sunset palette (matches the title art: deep indigo shadows, orange light, warm stone)
    P = {k: hexc(v) for k, v in dict(
        night='1d1838', stone0='3a3346', stone1='5a4f5e', stone2='7d6d72', stone3='a38c84', stoneHi='d9a878',
        step0='4a3f50', step1='655666', step2='8a7470',
        grass0='5f8a2c', grass1='6f9c34', grassD='4a7024', grassL='8fb848',
        sand0='c9a066', sand1='d8b077', sand2='b38a52',
        chalk='f4ecd8', red='d8383a', redD='8a1e28', blue='3a6ad8', blueD='1e3a8a', white='f0f0f0', black='181820',
        steel0='3c4048', steel1='5c6470', steel2='8a94a0', light='fff3b0', lightO='ffc860',
        orange='ff9a3c', orangeD='c8602a', gold='f2c14e').items()}
    img[:, :] = P['night']
    # stands (stepped rows) everywhere outside the apron
    fx0, fy0, fx1, fy1 = 96, 78, 544, 344          # field (grass) rect
    ax0, ay0, ax1, ay1 = fx0 - 18, fy0 - 14, fx1 + 18, fy1 + 16   # stone apron
    for y in range(H):
        for x in range(W):
            # distance to apron rect -> step rows
            dx = max(ax0 - x, 0, x - ax1); dy = max(ay0 - y, 0, y - ay1)
            d = max(dx, dy)
            if d > 0:
                row = d // 9
                shade = [P['step2'], P['step1'], P['step0']][row % 3] if d % 9 else P['stone0']
                img[y, x] = shade
    # spectators on the steps (2 px wide, 3 px tall people) — base layer seated
    crowd_cols = [hexc(c) for c in ['e85050', '5078e8', 'f0c040', '60c060', 'f08ad0', 'f0f0f0', '9060d0', 'f09040', '40c8c8', 'c8c8c8']]
    people = []
    for y in range(6, H - 4, 9):
        for x in range(4, W - 4, 4):
            dx = max(ax0 - x, 0, x - ax1); dy = max(ay0 - y, 0, y - ay1)
            if max(dx, dy) < 12 or (y < 72 and ay0 - y < 70 and fx0 - 40 < x < fx1 + 40):
                continue
            if rnd.random() < 0.82:
                people.append((x + rnd.randint(0, 1), y + 2, rnd.choice(crowd_cols), rnd.choice(['f0c8a0', 'c89060', '8a5a3a'])))
    for (x, y, c, skin) in people:
        img[y + 1:y + 3, x:x + 2] = c
        img[y, x:x + 2] = hexc(skin)
    # north wall with banners (top band)
    wall_y1 = ay0 - 6
    rect(img, 0, 0, W, 10, P['night'])
    rect(img, 60, 10, W - 60, wall_y1, P['stone1'])
    for x in range(60, W - 60, 16):
        rect(img, x, 10, x + 1, wall_y1, P['stone0'])
    rect(img, 60, wall_y1 - 4, W - 60, wall_y1, P['stone0'])
    rect(img, 60, 10, W - 60, 13, P['stoneHi'])
    ban = Image.open(os.path.join(PSP, 'banner.png')).convert('RGBA')
    bw, bh = ban.size
    blue = ban.crop((0, 0, bw // 2, bh)).resize((bw // 4, bh // 4), Image.NEAREST)
    red = ban.crop((bw // 2, 0, bw, bh)).resize((bw // 4, bh // 4), Image.NEAREST)
    bimg = Image.fromarray(img.astype(np.uint8), 'RGB').convert('RGBA')
    n = 0
    for x in range(84, W - 100, 44):
        b = blue if n % 2 == 0 else red
        bimg.alpha_composite(b, (x, 14)); n += 1
    img = np.array(bimg.convert('RGB')).astype(np.int32)
    # stone apron from the court slabs
    court = np.array(Image.open(os.path.join(PSP, 'court.png')).convert('RGB').resize((64, 64), Image.NEAREST)).astype(np.int32)
    court = (court * 0.6 + np.array(P['stone3']) * 0.4).astype(np.int32)   # warm sunset tint
    for y in range(ay0, ay1):
        for x in range(ax0, ax1):
            if fx0 <= x < fx1 and fy0 <= y < fy1:
                continue
            img[y, x] = court[y % 64, x % 64]
    outline_rect(img, ax0, ay0, ax1, ay1, P['stone0'], 2)
    # field: mown stripes
    for y in range(fy0, fy1):
        for x in range(fx0, fx1):
            stripe = ((x - fx0) // 24) % 2
            img[y, x] = P['grass1'] if stripe else P['grass0']
            if rnd.random() < 0.035:
                img[y, x] = P['grassL'] if stripe else P['grassD']
    # sand center circle
    cx, cy = (fx0 + fx1) // 2, (fy0 + fy1) // 2
    for y in range(cy - 56, cy + 57):
        for x in range(cx - 56, cx + 57):
            d = math.hypot(x - cx, y - cy)
            if d <= 54:
                img[y, x] = P['sand1'] if rnd.random() > 0.08 else P['sand2']
    # chalk lines
    outline_rect(img, fx0 + 6, fy0 + 6, fx1 - 6, fy1 - 6, P['chalk'], 2)
    rect(img, cx - 1, fy0 + 6, cx + 1, fy1 - 6, P['chalk'])
    ring(img, cx, cy, 56, P['chalk'], 2)
    # Poké Ball emblem
    for y in range(cy - 20, cy + 21):
        for x in range(cx - 20, cx + 21):
            d = math.hypot(x - cx, y - cy)
            if d <= 20:
                img[y, x] = P['black'] if d > 18 else (P['red'] if y < cy - 1 else P['white'] if y > cy + 1 else P['black'])
    disc(img, cx, cy, 6, P['black']); disc(img, cx, cy, 4, P['white']); disc(img, cx, cy, 2, hexc('d8d8d8'))
    for y in range(cy - 18, cy - 2):
        for x in range(cx - 18, cx + 19):
            if math.hypot(x - cx, y - cy) <= 18 and x < cx - 8 and y < cy - 10 and math.hypot(x - cx + 9, y - cy + 11) < 4:
                img[y, x] = hexc('f07070')
    # trainer boxes
    outline_rect(img, fx0 + 22, cy - 30, fx0 + 62, cy + 30, P['blue'], 2)
    outline_rect(img, fx1 - 62, cy - 30, fx1 - 22, cy + 30, P['red'], 2)
    # floodlight towers at the apron corners
    for (tx, ty) in [(ax0 - 20, ay0 - 26), (ax1 + 4, ay0 - 26), (ax0 - 20, ay1 + 2), (ax1 + 4, ay1 + 2)]:
        rect(img, tx + 6, ty + 8, tx + 10, ty + 26, P['steel1'])
        for k in range(ty + 8, ty + 26, 3):
            img[k, tx + 6:tx + 10] = P['steel0']
        rect(img, tx, ty, tx + 16, ty + 9, P['steel0'])
        outline_rect(img, tx, ty, tx + 16, ty + 9, P['black'])
        for lx in range(tx + 2, tx + 14, 3):
            img[ty + 2:ty + 4, lx:lx + 2] = P['light']
            img[ty + 5:ty + 7, lx:lx + 2] = P['lightO']
    # warm sunset light: brighten tops of stand rows facing west, deepen east side
    shade = np.ones((H, W, 1))
    for x in range(W):
        shade[:, x, 0] = 1.08 - 0.16 * (x / W)
    img = np.clip(img * shade, 0, 255).astype(np.int32)
    q = quantize_save(img, os.path.join(OUT, 'indigo.png'), 48)
    # cheering crowd overlay: same people with arms up (frame 2), transparent elsewhere
    ov = np.zeros((H, W, 4), np.uint8)
    for (x, y, c, skin) in people:
        if rnd.random() < 0.7:
            col = tuple(min(255, int(v * (1.08 - 0.16 * (x / W)))) for v in c)
            ov[y - 1, x] = col + (255,); ov[y - 1, x + 1] = col + (255,)
            ov[y, x:x + 2] = hexc(skin) + (255,)
            ov[y + 1:y + 3, x:x + 2] = col + (255,)
            ov[y + 3, x:x + 2] = (0, 0, 0, 0)
    Image.fromarray(ov, 'RGBA').save(os.path.join(OUT, 'indigo-cheer.png'), optimize=True)
    print('indigo', q.size, len(people), 'spectators')

# ----------------------------------------------------------------------------------------- Lumiose (fallback)
def lumiose():
    rnd = random.Random(2013)
    W, H = 640, 400
    cx, cy = 320, 200
    P = {k: hexc(v) for k, v in dict(
        field0='36405a', field1='3e4a66', road='8c8aa0', roadD='6e6c84', cream0='c8b89a', cream1='b0a284', cream2='e0d0ae',
        roof0='4a5a7c', roof1='5a6c92', roof2='3a4866', park0='3c6a4a', park1='4c7c56', tree='2c5038', light='ffd884', lightW='fff0c0',
        plaza='a49cb0', tower0='3a3442', tower1='5a5262', glow='ffb850', river='2a3a5c', riverL='3a5078', cloud='c8cce0', cloudS='9aa0c0').items()}
    img = np.zeros((H, W, 3), np.int32)
    img[:, :] = P['field0']
    for y in range(H):
        for x in range(W):
            if (x // 7 + y // 5) % 3 == 0 and rnd.random() < 0.3:
                img[y, x] = P['field1']
    R = 230
    # river crossing the south
    for x in range(W):
        yy = int(330 + 18 * math.sin(x / 60))
        img[yy:yy + 10, x] = P['river']
        img[yy + 3, x] = P['riverL']
    # city disc of blocks
    for y in range(H):
        for x in range(W):
            d = math.hypot((x - cx) * 0.92, y - cy)
            if d < R:
                img[y, x] = P['cream1']
    # building blocks: grid of small rectangles clipped to disc, with roofs
    for by in range(cy - R, cy + R, 9):
        for bx in range(cx - R - 20, cx + R + 20, 11):
            w, h = rnd.randint(6, 10), rnd.randint(5, 7)
            mx, my = bx + w / 2, by + h / 2
            if math.hypot((mx - cx) * 0.92, my - cy) > R - 6:
                continue
            roof = rnd.choice([P['roof0'], P['roof1'], P['roof2']])
            rect(img, bx, by, bx + w, by + h, roof)
            rect(img, bx, by + h - 2, bx + w, by + h, rnd.choice([P['cream0'], P['cream2']]))
            if rnd.random() < 0.35 and 0 <= by + h - 1 < H and 0 <= bx + 1 < W - 10:
                img[by + h - 1, bx + rnd.randint(1, max(1, w - 2))] = P['light']
    # parks
    for _ in range(14):
        a = rnd.random() * math.tau; r = rnd.uniform(70, R - 30)
        px, py = cx + math.cos(a) * r / 0.92, cy + math.sin(a) * r
        for y in range(int(py - 9), int(py + 9)):
            for x in range(int(px - 13), int(px + 13)):
                if ((x - px) / 13) ** 2 + ((y - py) / 9) ** 2 <= 1 and 0 <= x < W and 0 <= y < H:
                    img[y, x] = P['park1'] if (x + y) % 5 else P['park0']
        for _ in range(8):
            tx, ty = int(px + rnd.uniform(-10, 10)), int(py + rnd.uniform(-6, 6))
            if 0 <= tx < W - 1 and 0 <= ty < H - 1:
                img[ty:ty + 2, tx:tx + 2] = P['tree']
    # ring roads and radiating boulevards
    for rr in (R - 4, 150, 78):
        for t in range(0, 3600):
            a = t / 3600 * math.tau
            for w in range(-2, 2):
                x, y = int(cx + math.cos(a) * (rr + w) / 0.92), int(cy + math.sin(a) * (rr + w))
                if 0 <= x < W and 0 <= y < H:
                    img[y, x] = P['road'] if w > -2 else P['roadD']
    for k in range(8):
        a = k / 8 * math.tau + 0.2
        for r in range(40, R):
            for w in range(-2, 3):
                x, y = int(cx + math.cos(a) * r / 0.92 - math.sin(a) * w), int(cy + math.sin(a) * r + math.cos(a) * w)
                if 0 <= x < W and 0 <= y < H:
                    img[y, x] = P['road'] if abs(w) < 2 else P['roadD']
            if r % 9 == 0:
                x, y = int(cx + math.cos(a) * r / 0.92), int(cy + math.sin(a) * r)
                if 0 <= x < W and 0 <= y < H:
                    img[y, x] = P['light']
    # central plaza + Prism Tower top (lattice square with warm lights)
    disc(img, cx, cy, 38, P['plaza'])
    ring(img, cx, cy, 38, P['roadD'], 2)
    for y in range(cy - 14, cy + 15):
        for x in range(cx - 14, cx + 15):
            m = max(abs(x - cx), abs(y - cy))
            if m <= 14:
                img[y, x] = P['tower1'] if (x + y) % 4 else P['tower0']
                if m in (14, 9, 4):
                    img[y, x] = P['tower0']
                if (x - cx) == (y - cy) or (x - cx) == -(y - cy):
                    img[y, x] = P['tower0']
    for (dx, dy) in [(-14, -14), (14, -14), (-14, 14), (14, 14), (0, -9), (0, 9), (-9, 0), (9, 0)]:
        img[cy + dy - 1:cy + dy + 1, cx + dx - 1:cx + dx + 1] = P['glow']
    disc(img, cx, cy, 3, P['lightW'])
    # dusk haze toward the edges (flat bands, no gradient)
    for y in range(H):
        for x in range(W):
            d = math.hypot((x - cx) / W, (y - cy) / H)
            if d > 0.42:
                img[y, x] = (img[y, x] * 0.82 + np.array(P['field0']) * 0.18).astype(np.int32)
    # cloud wisps in the corners
    for (ox, oy) in [(30, 26), (560, 24), (40, 360), (570, 362)]:
        for _ in range(9):
            disc(img, ox + rnd.randint(-26, 26), oy + rnd.randint(-8, 8), rnd.randint(5, 9), P['cloud'])
        for _ in range(4):
            disc(img, ox + rnd.randint(-20, 20), oy + rnd.randint(2, 10), rnd.randint(3, 6), P['cloudS'])
    quantize_save(img, os.path.join(OUT, 'lumiose.png'), 40)
    print('lumiose painted')

if 'indigo' in which:
    indigo()
if 'lumiose' in which:
    lumiose()
