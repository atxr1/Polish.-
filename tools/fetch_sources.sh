#!/usr/bin/env bash
# Clone every pinned source from tools/sources.json into vendor/ at its exact commit (shallow, sparse where listed).
# Usage: tools/fetch_sources.sh   (idempotent: existing checkouts at the right commit are kept)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor
python3 - <<'PY'
import json, os, subprocess
S = json.load(open('tools/sources.json'))['sources']
for s in S:
    d = os.path.join('vendor', s['dir'])
    if os.path.isdir(os.path.join(d, '.git')):
        head = subprocess.run(['git', '-C', d, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
        if head == s['commit']:
            print('ok   ', s['dir'], head[:10]); continue
    os.makedirs(d, exist_ok=True)
    run = lambda *a: subprocess.run(['git', '-C', d, *a], check=True)
    run('init', '-q'); subprocess.run(['git', '-C', d, 'remote', 'add', 'origin', s['repo']])
    if s.get('sparse'):
        run('sparse-checkout', 'init', '--no-cone'); run('sparse-checkout', 'set', *s['sparse'])
    run('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', s['commit'])
    run('checkout', '-q', 'FETCH_HEAD')
    print('fetch', s['dir'], s['commit'][:10])
PY
