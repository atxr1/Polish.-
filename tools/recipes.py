#!/usr/bin/env python3
"""Summarise PMDO skill recipes (DumpAsset Data/Skill/*.json) into build/data/recipes.json.
For each move: hitbox action type, body ActionType, particle anims (with role + frame time),
beam/stream names, sounds, shot counts, range/speed and screen shake."""
import json, os, sys

def walk(o, path, out):
    if isinstance(o, dict):
        t = o.get('$type', '')
        if 'AnimIndex' in o and o['AnimIndex']:
            out['anims'].append({'name': o['AnimIndex'], 'ft': o.get('FrameTime', 1), 'path': '/'.join(path[-4:])})
        for k in ('Sound',):
            if isinstance(o.get(k), str) and o[k]:
                out['sounds'].append({'id': o[k], 'path': '/'.join(path[-3:])})
        if 'ScreenMovement' in o and isinstance(o['ScreenMovement'], dict) and o['ScreenMovement'].get('MaxShake'):
            out['shake'] = max(out.get('shake', 0), o['ScreenMovement']['MaxShake'])
        if 'BeamAnim' in str(o.keys()):
            pass
        for k, v in o.items():
            if k in ('Name', 'Desc', 'LocalTexts'):
                continue
            if k == 'Anims' and isinstance(v, list):
                for i, a in enumerate(v):
                    walk(a, path + [k + str(i)], out)
                continue
            if isinstance(v, str) and k.endswith('Anim') and v:
                out['anims'].append({'name': v, 'ft': 1, 'path': '/'.join(path[-3:] + [k])})
            walk(v, path + [k + ('<' + t.split(',')[0].split('.')[-1] + '>' if t else '')], out)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            walk(v, path + [str(i)], out)

def summarise(fn):
    d = json.load(open(fn, encoding='utf-8-sig'))
    obj = d['Object']
    ha = obj.get('HitboxAction', {})
    out = {'name': obj['Name']['DefaultText'], 'hitbox': ha.get('$type', '').split(',')[0].split('.')[-1],
           'action': (ha.get('CharAnimData') or {}).get('ActionType'), 'anims': [], 'sounds': []}
    for k in ('Range', 'Speed', 'Rays', 'Boomerang', 'StopAtHit', 'HitArea', 'Distance', 'LineAction', 'Lag'):
        if k in ha:
            out[k.lower()] = ha[k]
    se = ha.get('StreamEmitter') or {}
    if se.get('Shots'):
        out['shots'] = se.get('Shots'); out['burst'] = se.get('BurstTime')
    data = obj.get('Data', {})
    out['element'] = data.get('Element'); out['category'] = data.get('Category')
    for s in data.get('SkillStates', []):
        if 'Power' in s:
            out['power'] = s['Power']
    walk(obj, [], out)
    return out

def main(src, dst):
    res = {}
    for fn in sorted(os.listdir(src)):
        if not fn.endswith('.json'):
            continue
        try:
            res[fn[:-5]] = summarise(os.path.join(src, fn))
        except Exception as e:
            res[fn[:-5]] = {'error': str(e)}
    json.dump(res, open(dst, 'w'), indent=0)
    print(len(res), 'recipes')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
