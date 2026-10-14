#!/usr/bin/env python3
"""Resolve SpriteCollab credit lines (Discord ids) to artist names with credit_names.txt and write
site/assets/fighters/_credits.json as {species: {sprite: [names], portrait: [names], license: [..]}} plus
docs/CREDITS-SPRITES.md. Usage: python3 -I tools/credits.py"""
import json, os, subprocess
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SC = os.path.join(ROOT, 'vendor', 'SpriteCollab')
p = os.path.join(SC, 'credit_names.txt')
txt = open(p, encoding='utf-8').read() if os.path.exists(p) else subprocess.run(['git', '-C', SC, 'show', 'HEAD:credit_names.txt'], capture_output=True, text=True).stdout
names = {}
for line in txt.splitlines()[1:]:
    f = line.split('\t')
    if len(f) >= 2 and f[0].strip():
        names[f[1].strip()] = f[0].strip(); names[f[0].strip()] = f[0].strip()
out_p = os.path.join(ROOT, 'site', 'assets', 'fighters', '_credits.json')
raw = json.load(open(out_p))
# keep the raw lines for re-runs
if isinstance(next(iter(raw.values())), dict):
    raw = {k: v['raw'] for k, v in raw.items()}
res = {}
def parse(block):
    who, lic = [], []
    for line in block.splitlines():
        f = line.split('\t')
        if len(f) < 4 or not f[0][:4].isdigit():
            continue
        n = names.get(f[1].strip(), f[1].strip())
        if n.startswith('<@'):
            n = 'Discord user ' + n.strip('<@!>')[-4:]
        if n not in who:
            who.append(n)
        if f[3].strip() not in lic:
            lic.append(f[3].strip())
    return who, lic
for sid, blocks in raw.items():
    sp, l1 = parse(blocks[0]) if blocks else ([], [])
    po, l2 = parse(blocks[1]) if len(blocks) > 1 else ([], [])
    res[sid] = {'sprite': sp, 'portrait': po, 'license': sorted(set(l1 + l2)), 'raw': blocks}
json.dump(res, open(out_p, 'w'), indent=1)
lines = ['# Sprite and portrait credits', '', 'From PMDCollab/SpriteCollab (commit in tools/sources.json), resolved with its credit_names.txt.', '', '| Sprite id | Sprite artists | Portrait artists | Licenses |', '|---|---|---|---|']
for sid in sorted(res):
    r = res[sid]
    lines.append(f"| {sid} | {', '.join(r['sprite']) or '—'} | {', '.join(r['portrait']) or '—'} | {', '.join(r['license'])} |")
os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
open(os.path.join(ROOT, 'docs', 'CREDITS-SPRITES.md'), 'w').write('\n'.join(lines) + '\n')
print('credits for', len(res), 'sprite sets,', len(names) // 2, 'known artist names')
