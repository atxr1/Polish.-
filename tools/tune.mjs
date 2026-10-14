// Balance tuner: plays AI-vs-AI Pokémon Battles in every environment and nudges each fighter's per-environment
// HP and damage multipliers toward a 50% win rate (HP capped to 0.8-1.25, the rest in damage), then writes src/content/balance.js.
// Usage: bun tools/tune.mjs [--rounds 6] [--games 60] [--from current]
// Each round every fighter plays `games` matches against the rest of its environment's roster (all maps).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { registerContent, addSpriteMeta, ROSTER } from '../src/content/index.js';
import { MAPS_BY_ENV } from '../src/content/maps.js';
import { BALANCE } from '../src/content/balance.js';
import { Match } from '../src/modes/match.js';
import { MATCH } from '../src/game/sim.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const ROUNDS = +(args.rounds ?? 6), GAMES = +(args.games || 60);
registerContent();
const dir = new URL('../site/assets/fighters/', import.meta.url).pathname;
for (const f of readdirSync(dir)) if (f.endsWith('.json') && !f.startsWith('_')) addSpriteMeta(f.slice(0, -5), JSON.parse(readFileSync(dir + f, 'utf8')));

// start from the current table (or from 1.0 with --fresh)
if (args.fresh) for (const k of Object.keys(BALANCE)) delete BALANCE[k];
for (const env of Object.keys(ROSTER)) for (const id of ROSTER[env]) BALANCE[env + ':' + id] = BALANCE[env + ':' + id] || { hp: 1, dmg: 1 };

function play(env, a, b, seed, map) {
  const m = new Match({ seed, env, format: 'pokemon', map, sides: [{ team: [a], control: 'cpu', level: 'normal' }, { team: [b], control: 'cpu', level: 'normal' }] });
  for (let t = 0; t < 40; t++) m.step();
  m.startFight();
  const S = m.sim; let t = 0;
  while (S.phase !== 'over' && t < MATCH.pokemonTicks + 6000) { m.step(); t++; }
  return { w: S.result ? S.result.winner : -1, len: S.fightTicks / 60 };
}

const HP_MIN = 0.8, HP_MAX = 1.25, DMG_MIN = 0.4, DMG_MAX = 4.5;
function split(b, strength) {
  const hp = Math.min(HP_MAX, Math.max(HP_MIN, Math.pow(strength, 0.3)));
  b.hp = +hp.toFixed(3);
  b.dmg = +Math.min(DMG_MAX, Math.max(DMG_MIN, strength / hp)).toFixed(3);
}
// every entry follows the same HP/damage split of its strength (re-splits tables from before the HP cap)
for (const b of Object.values(BALANCE)) split(b, b.hp * b.dmg);
function save() {
  const out = Object.fromEntries(Object.entries(BALANCE).sort().filter(([, v]) => v.hp !== 1 || v.dmg !== 1));
  writeFileSync(new URL('../src/content/balance.js', import.meta.url).pathname,
    `// Per-environment balance multipliers, written by tools/tune.mjs from AI-vs-AI results (see docs/DECISIONS.md).\n// key "env:fighter" -> { hp, dmg }; hp stays within 0.8-1.25 so roles keep their shape. Missing entries mean 1.\nexport const BALANCE = {\n${Object.entries(out).map(([k, v]) => `  '${k}': { hp: ${v.hp}, dmg: ${v.dmg} },`).join('\n')}\n};\n`);
}
if (!ROUNDS) save();

let seedBase = +(args.seed || 77);
for (let round = 1; round <= ROUNDS; round++) {
  const rates = {}, lens = {};
  for (const env of Object.keys(ROSTER)) {
    const ids = ROSTER[env], wins = {}, games = {};
    lens[env] = [];
    let r = 0;
    // round-robin-ish schedule: every fighter gets GAMES games, sides alternate
    for (let g = 0; g < GAMES; g++) {
      for (let i = 0; i < ids.length; i++) {
        const j = (i + 1 + (g % (ids.length - 1))) % ids.length;
        if (j === i) continue;
        const swap = g % 2, a = swap ? ids[j] : ids[i], b = swap ? ids[i] : ids[j];
        const res = play(env, a, b, (seedBase * 7919 + round * 104729 + r++) >>> 0, MAPS_BY_ENV[env][(g + i) % 4]);
        for (const [id, s] of [[a, 0], [b, 1]]) { games[id] = (games[id] || 0) + 1; wins[id] = (wins[id] || 0) + (res.w === s ? 1 : res.w < 0 ? 0.5 : 0); }
        lens[env].push(res.len);
      }
    }
    for (const id of ids) rates[env + ':' + id] = wins[id] / games[id];
  }
  const report = [];
  for (const [k, rate] of Object.entries(rates)) {
    const b = BALANCE[k];
    const rr = Math.min(0.97, Math.max(0.03, rate));
    // gentle multiplicative step on strength (HP x damage). HP takes 30 % of it and stays within 0.8-1.25 so a
    // fighter keeps its role (Tanks stay tanky, Skirmishers fragile); the rest goes into damage.
    const g = Math.min(1.32, Math.max(0.76, Math.pow(0.5 / rr, 0.44)));
    if (Math.abs(rate - 0.5) > 0.06) split(b, b.hp * b.dmg * g);
    report.push([k, rate]);
  }
  report.sort((x, y) => y[1] - x[1]);
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(1);
  console.log(`round ${round}: medians ${Object.entries(lens).map(([e, l]) => e + ' ' + med(l) + 's').join(', ')}`);
  console.log('  ' + report.map(([k, v]) => `${k.split(':')[1]}@${k[0]} ${(v * 100).toFixed(0)}`).join('  '));
  save();
}
