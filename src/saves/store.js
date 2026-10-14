// Saves: localStorage with versioned keys, safe writes (temp copy -> verify -> swap, previous kept as backup),
// migrations, recovery from corruption, and a copyable export/import code (iOS can clear storage).
const NS = 'arena.';
export const SCHEMA = { settings: 2, records: 1, tournament: 1, last: 1 };
export const DEFAULTS = {
  settings: { v: 2, music: 0.7, sfx: 0.85, lowHpBeep: true, touchSize: 1, touchOpacity: 0.85, leftHanded: false, pixelBars: false, hitboxes: false, devOverlay: false, reducedMotion: false },
  records: { v: 1, wins: 0, losses: 0, draws: 0, byFighter: {}, championships: 0, played: 0 },
  tournament: null,
  last: { v: 1, env: 'ground', format: 'pokemon', fighter: 'charizard', trainer: 'ash', opponent: 'random', map: 'random', level: 'normal', size: 8 },
};
const MIGRATE = {
  settings: { 1: (s) => Object.assign({}, DEFAULTS.settings, s, { v: 2 }) },
  records: {}, tournament: {}, last: {},
};

function ls() { try { return window.localStorage; } catch (e) { return null; } }
function checksum(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function wrap(data) { const body = JSON.stringify(data); return JSON.stringify({ c: checksum(body), b: body }); }
function unwrap(raw) {
  if (!raw) return undefined;
  const o = JSON.parse(raw);
  if (!o || typeof o.b !== 'string' || checksum(o.b) !== o.c) throw new Error('checksum mismatch');
  return JSON.parse(o.b);
}

function valid(raw) { try { return raw != null && unwrap(raw) !== undefined; } catch (e) { return false; } }

export class Store {
  constructor() { this.cache = {}; this.recovered = []; this.ok = !!ls(); }
  migrate(key, val) {
    if (val === null || val === undefined) return val;
    const want = SCHEMA[key];
    let v = val.v || 1, guard = 0;
    while (v < want && MIGRATE[key][v] && guard++ < 20) { val = MIGRATE[key][v](val); v = val.v || v + 1; }
    if (key !== 'tournament' && DEFAULTS[key]) val = Object.assign({}, DEFAULTS[key], val);
    return val;
  }
  read(key) {
    if (key in this.cache) return this.cache[key];
    const S = ls(); let val;
    let corrupt = false;
    try { val = S ? unwrap(S.getItem(NS + key)) : undefined; } catch (e) { val = undefined; corrupt = true; }
    if (val === undefined && S) {
      // missing or corrupt main copy: an interrupted write's verified temp copy is newest, else the previous copy kept as backup
      for (const alt of ['.tmp', '.bak']) { try { val = unwrap(S.getItem(NS + key + alt)); } catch (e2) { val = undefined; } if (val !== undefined) break; }
      if (corrupt || val !== undefined) this.recovered.push(val === undefined ? key + ' (reset)' : key);
    }
    if (val === undefined) val = DEFAULTS[key] === null ? null : JSON.parse(JSON.stringify(DEFAULTS[key]));
    try { val = this.migrate(key, val); } catch (e) { val = JSON.parse(JSON.stringify(DEFAULTS[key])); }
    this.cache[key] = val;
    return val;
  }
  write(key, val) {
    this.cache[key] = val;
    const S = ls(); if (!S) return false;
    try {
      const data = wrap(val);
      S.setItem(NS + key + '.tmp', data);
      if (S.getItem(NS + key + '.tmp') !== data) throw new Error('verify failed');
      // keep the previous good copy as the backup (the first write seeds it with itself)
      const prev = S.getItem(NS + key);
      if (prev !== data && valid(prev)) S.setItem(NS + key + '.bak', prev);
      else if (!valid(S.getItem(NS + key + '.bak'))) S.setItem(NS + key + '.bak', data);
      S.setItem(NS + key, data);
      if (S.getItem(NS + key) !== data) throw new Error('swap failed');
      S.removeItem(NS + key + '.tmp');
      return true;
    } catch (e) { return false; }
  }
  remove(key) { this.cache[key] = DEFAULTS[key] === null ? null : JSON.parse(JSON.stringify(DEFAULTS[key])); const S = ls(); if (!S) return; try { S.removeItem(NS + key); S.removeItem(NS + key + '.bak'); S.removeItem(NS + key + '.tmp'); } catch (e) { /* ignore */ } }
  resetAll() { for (const k of Object.keys(SCHEMA)) this.remove(k); }
  // export / import as a text code
  exportCode() {
    const all = {}; for (const k of Object.keys(SCHEMA)) all[k] = this.read(k);
    const body = JSON.stringify({ app: 'arena', at: Date.now(), data: all });
    const b64 = btoa(unescape(encodeURIComponent(body)));
    return 'ARENA1-' + checksum(body) + '-' + b64;
  }
  importCode(code) {
    const m = /^ARENA1-([a-z0-9]+)-(.+)$/s.exec(String(code).trim().replace(/\s+/g, ''));
    if (!m) throw new Error('That isn\'t an Arena save code.');
    const body = decodeURIComponent(escape(atob(m[2])));
    if (checksum(body) !== m[1]) throw new Error('The code is incomplete or damaged. Copy the whole code and try again.');
    const o = JSON.parse(body);
    if (!o || o.app !== 'arena' || !o.data) throw new Error('That isn\'t an Arena save code.');
    for (const k of Object.keys(SCHEMA)) if (k in o.data) this.write(k, this.migrate(k, o.data[k]));
    return true;
  }
}
export { checksum };
