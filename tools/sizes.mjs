// Download-size report: first load (menus) and the worst-case single match (map, fighters, effects, sounds,
// music) over every Pokémon pairing and every trainer pairing on every map. Usage: bun tools/sizes.mjs
import { statSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerContent, addSpriteMeta, SPECIES, ROSTER, TRAINERS, spriteIdsFor } from '../src/content/index.js';
import { MAPS, MAPS_BY_ENV } from '../src/content/maps.js';
import { MOVES, moveFxNames, moveBeamNames } from '../src/content/moves.js';
import { FX_DEFAULTS } from '../src/render/fxnames.js';
import { SFX_DEFAULTS } from '../src/audio/sfxnames.js';

registerContent();
const ROOT = new URL('../site/', import.meta.url).pathname;
const fx = JSON.parse(readFileSync(ROOT + 'assets/fx/manifest.json', 'utf8'));
const audio = JSON.parse(readFileSync(ROOT + 'assets/audio/manifest.json', 'utf8'));
const sz = (p) => { if (!existsSync(p)) return 0; const s = statSync(p); return s.isDirectory() ? readdirSync(p).reduce((a, f) => a + sz(p + '/' + f), 0) : s.size; };
const fileSet = (setup) => {
  const files = new Set();
  const moves = new Set();
  for (const team of setup.teams) for (const id of team) {
    for (const s of spriteIdsFor(id)) { files.add('assets/fighters/' + s + '.png'); files.add('assets/fighters/' + s + '.json'); files.add('assets/fighters/' + s + '-portraits.png'); }
    const sp = SPECIES[id]; sp.kit.forEach((m) => moves.add(m)); moves.add(sp.ult); if (sp.mega) moves.add(sp.mega.ult);
    if (sp.ult === 'psychoboostmax') ['pb_normal', 'pb_attack', 'pb_defense', 'pb_speed'].forEach((x) => moves.add(x));
    if (sp.ult === 'rebirth') moves.add('sacredinferno');
  }
  const parts = new Set(FX_DEFAULTS.particles.map((n) => n.split('|')[0])), beams = new Set(), sfx = new Set(SFX_DEFAULTS);
  for (const id of moves) { const m = MOVES[id]; for (const n of moveFxNames(m)) parts.add(n.split('|')[0]); for (const n of moveBeamNames(m)) beams.add(n.split('|')[0]); for (const x of [m.sfx, m.sfxStart, ...m.steps.map((s) => s.sfx), ...m.steps.map((s) => s.eachSfx)]) if (x) sfx.add(x); }
  for (const p of parts) { const d = fx.particles[p] || fx.bg[p]; if (d) files.add('assets/fx/' + d.file); }
  for (const b of beams) files.add('assets/fx/beam_' + b);
  for (const b of FX_DEFAULTS.bg) if (fx.bg[b]) files.add('assets/fx/' + fx.bg[b].file);
  for (const s of sfx) if (audio.sfx[s]) files.add('assets/audio/sfx/' + audio.sfx[s]);
  const map = MAPS[setup.map];
  for (const f of readdirSync(ROOT + 'assets/maps')) if (f.startsWith(setup.map + '.') || f.startsWith(setup.map + '-') && !f.includes('thumb')) files.add('assets/maps/' + f);
  if (audio.music[map.music]) files.add('assets/audio/music/' + audio.music[map.music].file);
  for (const t of ['Final Battle', 'Aftermath']) if (audio.music[t]) files.add('assets/audio/music/' + audio.music[t].file);
  return files;
};
let worst = { bytes: 0 };
const total = (files) => [...files].reduce((a, f) => a + sz(ROOT + f), 0);
for (const env of Object.keys(ROSTER)) for (const map of MAPS_BY_ENV[env]) {
  const trainers = Object.keys(TRAINERS);
  for (const a of trainers) for (const b of trainers) {
    if (a >= b) continue;
    const bytes = total(fileSet({ map, teams: [TRAINERS[a].teams[env], TRAINERS[b].teams[env]] }));
    if (bytes > worst.bytes) worst = { bytes, map, a, b, format: 'trainer' };
  }
}
const first = ['index.html', 'app.js', 'app.css', 'sw.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'favicon.png', 'assets/ui', 'assets/fx/manifest.json', 'assets/audio/manifest.json', 'assets/fighters/_credits.json', 'assets/audio/music/title.m4a', 'assets/trainers'].reduce((a, f) => a + sz(ROOT + f), 0)
  + readdirSync(ROOT + 'assets/maps').filter((f) => f.includes('thumb')).reduce((a, f) => a + sz(ROOT + 'assets/maps/' + f), 0)
  + readdirSync(ROOT + 'assets/fighters').filter((f) => f.endsWith('-portraits.png')).reduce((a, f) => a + sz(ROOT + 'assets/fighters/' + f), 0);
console.log(JSON.stringify({ firstLoadMB: +(first / 1e6).toFixed(2), worstMatchMB: +(worst.bytes / 1e6).toFixed(2), worstMatch: `${worst.a} vs ${worst.b} on ${worst.map}`, siteMB: +(sz(ROOT) / 1e6).toFixed(1) }));
