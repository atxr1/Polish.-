#!/usr/bin/env python3
"""Asset pipeline: converts the user's map images, PMD particle/beam/BG sheets, PMD fonts, PMDO sounds and
music, and the PSP images/sounds into the static site's assets/ folder.
Usage: build_assets.py <step> [...]   steps: maps fx fonts audio psp all
Paths are relative to the project root (run from there)."""
import sys, os, json, re, subprocess, hashlib, shutil, math
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
V = os.path.join(ROOT, 'vendor')
SITE = os.path.join(ROOT, 'site', 'assets')
BUILD = os.path.join(ROOT, 'build')
INPUTS = os.path.join(ROOT, 'inputs')
PSPSRC = os.environ.get('PSP_ASSETS', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'inputs', 'psp'))

def mk(*p):
    d = os.path.join(*p); os.makedirs(d, exist_ok=True); return d

# ------------------------------------------------------------------------------------------------ maps
USER_MAPS = {   # id -> (file prefix in inputs/arena-backgrounds/images, env, haze strength for air maps)
    'bell_tower': ('01_bell_tower', 'ground', 0), 'mt_chimney': ('02_mt_chimney', 'ground', 0), 'spear_pillar': ('03_spear_pillar', 'ground', 0),
    'cerulean_gym': ('04_cerulean_gym', 'water', 0), 'whirl_islands': ('05_whirl_islands', 'water', 0), 'sootopolis': ('06_sootopolis', 'water', 0),
    'azure_bay': ('07_azure_bay', 'water', 0), 'sky_pillar': ('08_sky_pillar', 'air', 0.18), 'dragonspiral': ('09_dragonspiral_tower', 'air', 0.34),
    'lumiose': ('10_lumiose_city', 'air', 0.2),
}
HAZE = {'sky_pillar': (120, 160, 205), 'dragonspiral': (190, 205, 225), 'lumiose': (60, 64, 96), 'kanto_skies': (140, 180, 215)}

def true_pixels(path):
    """Recover the true pixel grid of a 3x3-grid pixel-art image (verified uniform blocks)."""
    im = np.array(Image.open(path).convert('RGB'))
    H, W = im.shape[:2]
    # detect grid size: smallest k in 2..8 for which k x k blocks are uniform
    for k in (3, 2, 4, 5, 6, 8):
        h, w = (H // k) * k, (W // k) * k
        blk = im[:h, :w].reshape(h // k, k, w // k, k, 3)
        if (blk == blk[:, :1, :, :1, :]).all(axis=(1, 3, 4)).mean() > 0.995:
            return im[0:h:k, 0:w:k], k
    # not clean pixel art (a re-encoded or raw render, e.g. the replacement Lumiose image): snap it to the set's
    # 3x3 art-pixel density so it matches the other maps — 40-colour palette, then each 3x3 block takes its most
    # common colour. (proper-pixel-art's grid detection guessed a far coarser grid on these renders.)
    k = 3
    q = Image.fromarray(im).quantize(colors=40, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    idx = np.array(q); pal = np.array(q.getpalette()[:40 * 3]).reshape(-1, 3)
    h, w = (H // k) * k, (W // k) * k
    blk = idx[:h, :w].reshape(h // k, k, w // k, k).transpose(0, 2, 1, 3).reshape(h // k, w // k, k * k)
    cnt = np.zeros((h // k, w // k, 40), np.int32)
    rows, cols = np.arange(h // k)[:, None], np.arange(w // k)[None, :]
    for i in range(k * k):
        np.add.at(cnt, (rows, cols, blk[:, :, i]), 1)
    return pal[cnt.argmax(-1)].astype(np.int32), 'snapped 3'

def quantize(img, n=48):
    im = Image.fromarray(img.astype(np.uint8), 'RGB')
    colors = len(np.unique(img.reshape(-1, 3), axis=0))
    if colors <= n:
        return im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return im.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

def pad_mirror(img, padx):
    left = img[:, :padx][:, ::-1]; right = img[:, -padx:][:, ::-1]
    return np.concatenate([left, img, right], axis=1)

def save_map(mid, img, out):
    q = quantize(img, 48)
    q.save(os.path.join(out, mid + '.png'), optimize=True)
    w, h = q.size
    th = q.convert('RGB').resize((w // 4, h // 4), Image.NEAREST)
    th.save(os.path.join(out, mid + '-thumb.png'), optimize=True)
    return q.size, len(q.getcolors(256) or [])

def build_maps():
    out = mk(SITE, 'maps')
    imgdir = os.path.join(INPUTS, 'arena-backgrounds', 'images')
    report = {}
    for mid, (prefix, env, haze) in USER_MAPS.items():
        cand = [f for f in os.listdir(imgdir) if f.startswith(prefix)] if os.path.isdir(imgdir) else []
        src = None
        for f in cand:
            try:
                Image.open(os.path.join(imgdir, f)).load(); src = os.path.join(imgdir, f)
            except Exception:
                pass
        if src is None:
            if mid == 'lumiose':
                painted = os.path.join(BUILD, 'maps', 'lumiose.png')
                img = np.array(Image.open(painted).convert('RGB'))
                report[mid] = dict(source='painted in code (user image missing or unreadable)', size=save_map(mid, img, out))
                continue
            raise SystemExit('missing map image for ' + mid)
        img, k = true_pixels(src)
        if haze:
            img = (img * (1 - haze) + np.array(HAZE[mid]) * haze).astype(np.int32)
        if img.shape[1] < 640:
            img = pad_mirror(img, (640 - img.shape[1]) // 2)
        report[mid] = dict(source=os.path.basename(src), grid=k, size=save_map(mid, img, out))
    # Kanto Skies from the PSP painted island map: clean painterly noise, quantize, haze, crop 3:2-ish, pad
    a = Image.open(os.path.join(BUILD, 'psp', 'air-terrain.png')).convert('RGB')
    import cv2
    arr = np.array(a)
    arr = cv2.medianBlur(arr, 3)
    arr = cv2.bilateralFilter(arr, 5, 30, 5)
    q = Image.fromarray(arr).quantize(colors=36, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    arr = np.array(q)[64:448]
    arr = (arr * 0.82 + np.array(HAZE['kanto_skies']) * 0.18).astype(np.int32)
    arr = pad_mirror(arr, 64)
    report['kanto_skies'] = dict(source='PSP air-terrain.raw (painted) -> median+bilateral clean, 36-color quantize', size=save_map('kanto_skies', arr, out))
    # Indigo Plateau painted in code
    ind = np.array(Image.open(os.path.join(BUILD, 'maps', 'indigo.png')).convert('RGB'))
    report['indigo'] = dict(source='painted in code (tools/paint_maps.py)', size=save_map('indigo', ind, out))
    shutil.copy(os.path.join(BUILD, 'maps', 'indigo-cheer.png'), os.path.join(out, 'indigo-cheer.png'))
    json.dump(report, open(os.path.join(BUILD, 'maps_report.json'), 'w'), indent=1)
    for k, v in report.items():
        print(k, v)


# ------------------------------------------------------------------------------------------------ pixel-art upscaling
def _scale2x(a):
    """Scale2x/EPX on an RGBA uint32 array: doubles size while keeping 1-texel detail (no blur, no fat pixels)."""
    H, W = a.shape
    p = np.pad(a, 1, mode='edge')
    B, D, E, F, Hh = p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:], p[2:, 1:-1]
    e0 = np.where((D == B) & (B != F) & (D != Hh), D, E)
    e1 = np.where((B == F) & (B != D) & (F != Hh), F, E)
    e2 = np.where((D == Hh) & (D != B) & (Hh != F), D, E)
    e3 = np.where((Hh == F) & (D != Hh) & (B != F), F, E)
    out = np.zeros((H * 2, W * 2), dtype=a.dtype)
    out[0::2, 0::2] = e0; out[0::2, 1::2] = e1; out[1::2, 0::2] = e2; out[1::2, 1::2] = e3
    return out

def _scale3x(a):
    H, W = a.shape
    p = np.pad(a, 1, mode='edge')
    A, B, C = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    D, E, F = p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:]
    G, Hh, I = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    c = (B != Hh) & (D != F)
    o = [None] * 9
    o[0] = np.where(c & (D == B), D, E)
    o[1] = np.where(c & (((D == B) & (E != C)) | ((B == F) & (E != A))), B, E)
    o[2] = np.where(c & (B == F), F, E)
    o[3] = np.where(c & (((D == B) & (E != G)) | ((D == Hh) & (E != A))), D, E)
    o[4] = E
    o[5] = np.where(c & (((B == F) & (E != I)) | ((Hh == F) & (E != C))), F, E)
    o[6] = np.where(c & (D == Hh), D, E)
    o[7] = np.where(c & (((D == Hh) & (E != I)) | ((Hh == F) & (E != G))), Hh, E)
    o[8] = np.where(c & (Hh == F), F, E)
    out = np.zeros((H * 3, W * 3), dtype=a.dtype)
    for k in range(9):
        out[k // 3::3, k % 3::3] = o[k]
    return out

def upscale_pixelart(img, factor):
    a = np.array(img.convert('RGBA'), dtype=np.uint8)
    u = a.view(np.uint32).reshape(a.shape[:2])
    if factor == 2: r = _scale2x(u)
    elif factor == 3: r = _scale3x(u)
    elif factor == 4: r = _scale2x(_scale2x(u))
    else: raise ValueError(factor)
    return Image.fromarray(r.view(np.uint8).reshape(r.shape[0], r.shape[1], 4), 'RGBA')

# ------------------------------------------------------------------------------------------------ fx
def collect_fx_names():
    """Ask bun for every particle/beam name the content references (moves + renderer defaults)."""
    js = r"""
import { MOVES, moveFxNames, moveBeamNames } from '../src/content/moves.js';
import { FX_DEFAULTS } from '../src/render/fxnames.js';
const p = new Set(FX_DEFAULTS.particles), b = new Set(FX_DEFAULTS.beams);
for (const m of Object.values(MOVES)) { for (const n of moveFxNames(m)) p.add(n.split('|')[0]); for (const n of moveBeamNames(m)) b.add(n.split('|')[0]); }
console.log(JSON.stringify({ particles: [...p].sort(), beams: [...b].sort(), bg: FX_DEFAULTS.bg }));
"""
    tmp = os.path.join(BUILD, '_fxnames.mjs'); open(tmp, 'w').write(js)
    out = subprocess.run(['bun', tmp], cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr)
    return json.loads(out.stdout.strip().splitlines()[-1])

def build_fx():
    cat = json.load(open(os.path.join(BUILD, 'data', 'fx_catalog.json')))
    names = collect_fx_names()
    out = mk(SITE, 'fx')
    man = {'particles': {}, 'beams': {}, 'bg': {}}
    missing = []
    RA = os.path.join(V, 'RawAsset')
    for n in names['particles']:
        up = 1
        m_up = re.match(r'^(.*)@([234])x$', n)
        if m_up:
            up = int(m_up.group(2)); c = cat['particles'].get(m_up.group(1))
        else:
            c = cat['particles'].get(n)
        if not c and n in cat['beams']:
            names['beams'].append(n); continue
        if not c and n in cat['bg']:
            g = cat['bg'][n]
            c = {'src': g['src'], 'n': g['n'], 'fw': g['w'] // g['n'], 'fh': g['h'], 'rows': 1, 'layout': 'None'}
        if not c:
            missing.append(n); continue
        if c.get('folder'):
            frames = [Image.open(os.path.join(RA, c['src'], f'{i}.png')).convert('RGBA') for i in range(c['n'])]
            strip = Image.new('RGBA', (c['fw'] * c['n'], c['fh']))
            for i, fr in enumerate(frames):
                strip.paste(fr, (i * c['fw'], 0))
            img = strip
        else:
            img = Image.open(os.path.join(RA, c['src'])).convert('RGBA')
        fw, fh = c['fw'], c['fh']
        if up > 1:
            # giant versions (Giant Shuriken, Giant Mist Ball) are re-drawn bigger with Scale2x/Scale3x, frame by frame
            big = Image.new('RGBA', (img.width * up, img.height * up))
            for ry in range(c['rows']):
                for fx_ in range(img.width // fw):
                    fr = img.crop((fx_ * fw, ry * fh, (fx_ + 1) * fw, (ry + 1) * fh))
                    big.paste(upscale_pixelart(fr, up), (fx_ * fw * up, ry * fh * up))
            img, fw, fh = big, fw * up, fh * up
        fn = n.replace('@', '_at') + '.png'
        img.save(os.path.join(out, fn), optimize=True)
        man['particles'][n] = {'file': fn, 'fw': fw, 'fh': fh, 'n': c['n'], 'rows': c['rows'], 'layout': c['layout']}
    for b in names['beams']:
        parts = cat['beams'].get(b)
        if not parts:
            missing.append('beam:' + b); continue
        d = mk(out, 'beam_' + b)
        for part in ('Head', 'Body', 'Tail'):
            shutil.copy(os.path.join(RA, 'Beam', b, part + '.png'), os.path.join(d, part + '.png'))
        man['beams'][b] = {k: v for k, v in parts.items()}
        hw = parts['Head'][0] if 'Head' in parts else 32
        man['beams'][b]['frames'] = 2 if b in ('Beam', 'Beam_2', 'Beam_Pink') else (14 if b.startswith('Column') else 6 if b == 'Lightning' else 5 if b == 'Lightning_RSE' else 1)
    for g in names['bg']:
        c = cat['bg'].get(g)
        if not c:
            missing.append('bg:' + g); continue
        shutil.copy(os.path.join(RA, c['src']), os.path.join(out, 'bg_' + g + '.png'))
        man['bg'][g] = {'file': 'bg_' + g + '.png', 'n': c['n'], 'w': c['w'], 'h': c['h']}
    json.dump(man, open(os.path.join(out, 'manifest.json'), 'w'), separators=(',', ':'))
    keep = {v['file'] for v in man['particles'].values()} | {v['file'] for v in man['bg'].values()} | {'beam_' + b for b in man['beams']} | {'manifest.json'}
    for f in os.listdir(out):
        if f not in keep:
            p = os.path.join(out, f)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(out) for f in fs)
    print(len(man['particles']), 'particles', len(man['beams']), 'beams', len(man['bg']), 'bg', f'{total/1e6:.2f} MB', 'missing:', missing)
    if missing:
        raise SystemExit('missing fx: ' + ', '.join(missing))

# ------------------------------------------------------------------------------------------------ fonts
def build_fonts():
    out = mk(SITE, 'ui')
    RA = os.path.join(V, 'RawAsset', 'font')
    res = {}
    for name in ('text', 'yellow', 'blue', 'green'):
        d = os.path.join(RA, name)
        glyphs = sorted(f for f in os.listdir(d) if f.endswith('.png'))
        ims = []
        for g in glyphs:
            code = int(g[:-4], 16)
            if name == 'text' and not (0x20 <= code <= 0x7e or code in (0xe9, 0xc9)):
                continue
            ims.append((code, Image.open(os.path.join(d, g)).convert('RGBA')))
        H = max(im.size[1] for _, im in ims)
        W = sum(im.size[0] + 1 for _, im in ims)
        strip = Image.new('RGBA', (W, H)); x = 0; meta = {}
        for code, im in ims:
            strip.paste(im, (x, 0)); meta[code] = [x, im.size[0], im.size[1]]; x += im.size[0] + 1
        strip.save(os.path.join(out, f'font_{name}.png'), optimize=True)
        res[name] = {'file': f'font_{name}.png', 'h': H, 'glyphs': meta}
    json.dump(res, open(os.path.join(out, 'fonts.json'), 'w'), separators=(',', ':'))
    print('fonts', {k: len(v['glyphs']) for k, v in res.items()})

# ------------------------------------------------------------------------------------------------ audio
MUSIC = ['Title', 'Boss Battle', 'Boss Battle 2', 'Final Battle', 'Champion Road', 'Sky Tower Summit', 'Sky Tower', 'Flyaway Cliffs',
         'Enraged Caldera', 'Sacred Tower', 'Castaway Cave', 'Tropical Path', 'Luminous Spring', 'Thunderstruck Pass', 'Moonlit Courtyard',
         'Relic Tower', 'Snowbound Path', 'Guildmaster', 'Aftermath', 'Demonstration', 'Summit', 'Treacherous Mountain']
FANFARE = ['MissionClear', 'Promotion', 'RankUp', 'LevelUp', 'NewArea', 'MissionFail']
MENU = ['Cancel', 'Click', 'Confirm', 'Error', 'Select', 'Skip', 'Sort', 'Toggle', 'Speak']

def ffmpeg(src, dst, args):
    r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src] + args + [dst], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr)

def collect_sounds():
    js = r"""
import { MOVES } from '../src/content/moves.js';
import { SFX_DEFAULTS } from '../src/audio/sfxnames.js';
const s = new Set(SFX_DEFAULTS);
for (const m of Object.values(MOVES)) { for (const k of ['sfx', 'sfxStart']) if (m[k]) s.add(m[k]); for (const st of m.steps) { if (st.sfx) s.add(st.sfx); if (st.eachSfx) s.add(st.eachSfx); if (st.landSfx) s.add(st.landSfx); } }
console.log(JSON.stringify([...s].sort()));
"""
    tmp = os.path.join(BUILD, '_sfxnames.mjs'); open(tmp, 'w').write(js)
    out = subprocess.run(['bun', tmp], cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr)
    return json.loads(out.stdout.strip().splitlines()[-1])

def build_audio():
    snd = mk(SITE, 'audio', 'sfx'); mus = mk(SITE, 'audio', 'music')
    C = os.path.join(V, 'DumpAsset', 'Content')
    man = {'sfx': {}, 'music': {}}
    names = collect_sounds()
    missing = []
    for n in names:
        src = None
        if n.startswith('psp_'):
            src = os.path.join(PSPSRC, 'audio', n[4:] + '.wav')
        elif n.startswith('menu_'):
            src = os.path.join(C, 'Sound', 'Menu', n[5:] + '.ogg')
        elif n.startswith('fanfare_'):
            src = os.path.join(C, 'Sound', 'Fanfare', n[8:] + '.ogg')
        else:
            for sub in ('Battle',):
                p = os.path.join(C, 'Sound', sub, n + '.ogg')
                if os.path.exists(p):
                    src = p
        if not src or not os.path.exists(src):
            missing.append(n); continue
        dst = os.path.join(snd, n + '.m4a')
        if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
            ffmpeg(src, dst, ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '56k', '-movflags', '+faststart'])
        man['sfx'][n] = n + '.m4a'
    for t in MUSIC:
        src = os.path.join(C, 'Music', t + '.ogg')
        if not os.path.exists(src):
            missing.append('music:' + t); continue
        info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate:stream_tags:format=duration', '-of', 'json', src], capture_output=True, text=True).stdout)
        st = info['streams'][0]; tags = {k.upper(): v for k, v in st.get('tags', {}).items()}
        sr = int(st['sample_rate']); dur = float(info['format']['duration'])
        ls = int(tags['LOOPSTART']) / sr if 'LOOPSTART' in tags else 0.0
        le = (int(tags['LOOPSTART']) + int(tags['LOOPLENGTH'])) / sr if 'LOOPLENGTH' in tags and 'LOOPSTART' in tags else dur
        slug = re.sub(r'[^a-z0-9]+', '_', t.lower()).strip('_')
        dst = os.path.join(mus, slug + '.m4a')
        if not os.path.exists(dst):
            ffmpeg(src, dst, ['-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart'])
        man['music'][t] = {'file': slug + '.m4a', 'loopStart': round(ls, 4), 'loopEnd': round(le, 4), 'dur': round(dur, 3),
                           'title': tags.get('TITLE', ''), 'album': tags.get('ALBUM', ''), 'artist': tags.get('ARTIST', '')}
    json.dump(man, open(os.path.join(SITE, 'audio', 'manifest.json'), 'w'), indent=0)
    tot = lambda d: sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
    print(len(man['sfx']), 'sfx', f'{tot(snd)/1e6:.2f} MB;', len(man['music']), 'tracks', f'{tot(mus)/1e6:.2f} MB; missing', missing)
    if missing:
        raise SystemExit('missing audio: ' + ', '.join(missing))

# ------------------------------------------------------------------------------------------------ psp images + icons
def build_psp():
    out = mk(SITE, 'ui')
    P = os.path.join(BUILD, 'psp')
    Image.open(os.path.join(P, 'title.png')).convert('RGB').save(os.path.join(out, 'title.png'), optimize=True)
    tdir = mk(SITE, 'trainers')
    for f in os.listdir(P):
        if f.startswith('trainer_'):
            Image.open(os.path.join(P, f)).convert('RGB').save(os.path.join(tdir, f[8:]), optimize=True)
    t = Image.open(os.path.join(P, 'title.png')).convert('RGB')
    # apple-touch-icon from the stadium title art: square crop around the stadium, 180x180
    sq = t.crop((150, 40, 150 + 230, 40 + 230)).resize((180, 180), Image.LANCZOS)
    sq.save(os.path.join(ROOT, 'site', 'apple-touch-icon.png'), optimize=True)
    t.crop((150, 40, 380, 270)).resize((192, 192), Image.LANCZOS).save(os.path.join(ROOT, 'site', 'icon-192.png'), optimize=True)
    t.crop((150, 40, 380, 270)).resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'site', 'icon-512.png'), optimize=True)
    t.crop((180, 70, 340, 230)).resize((32, 32), Image.LANCZOS).save(os.path.join(ROOT, 'site', 'favicon.png'))
    print('psp images + icons done')

# ------------------------------------------------------------------------------------------------ web fonts (self-hosted Barlow, OFL)
def build_webfonts():
    out = mk(SITE, 'fonts')
    src = [os.path.join(V, 'gfonts', 'ofl', d) for d in ('barlowcondensed', 'barlowsemicondensed')]
    for d in src:
        for f in sorted(os.listdir(d)):
            if f.endswith('.ttf'):
                subprocess.run([sys.executable, '-m', 'fontTools.subset', os.path.join(d, f), '--unicodes=U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2605,U+00D7', '--flavor=woff', '--output-file=' + os.path.join(out, f[:-4] + '.woff')], check=True)
    shutil.copy(os.path.join(src[0], 'OFL.txt'), os.path.join(out, 'OFL.txt'))
    print('webfonts', len(os.listdir(out)))

if __name__ == '__main__':
    steps = sys.argv[1:] or ['all']
    if 'all' in steps:
        steps = ['psp', 'maps', 'fx', 'fonts', 'webfonts', 'audio']
    for s in steps:
        {'maps': build_maps, 'fx': build_fx, 'fonts': build_fonts, 'webfonts': build_webfonts, 'audio': build_audio, 'psp': build_psp}[s]()
