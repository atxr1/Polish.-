// Matchup diagnostics: bun tools/diag.mjs <fighter> [env] [runs] — per-move uses and damage, dealt/taken, dodges.
import { readFileSync, readdirSync } from 'node:fs';
import { registerContent, addSpriteMeta, SPECIES, ROSTER } from '../src/content/index.js';
import { MAPS_BY_ENV } from '../src/content/maps.js';
import { Match } from '../src/modes/match.js';
import { MATCH } from '../src/game/sim.js';
registerContent();
const dir = new URL('../site/assets/fighters/', import.meta.url).pathname;
for (const f of readdirSync(dir)) if (f.endsWith('.json') && !f.startsWith('_')) addSpriteMeta(f.slice(0, -5), JSON.parse(readFileSync(dir + f, 'utf8')));
const id = process.argv[2], env = process.argv[3] || Object.keys(ROSTER).find((e) => ROSTER[e].includes(id)), RUNS = +(process.argv[4] || 60);
const foes = ROSTER[env].filter((x) => x !== id);
const agg = { wins: 0, dealt: 0, taken: 0, len: 0, uses: {}, dmg: {}, dodges: 0, perfect: 0, hits: 0, ults: 0, foeUses: {}, foeDmg: {} }, vs = {};
for (let r = 0; r < RUNS; r++) {
  const foe = foes[r % foes.length], side = r % 2;
  const sides = [{ team: [id], control: 'cpu', level: 'normal' }, { team: [foe], control: 'cpu', level: 'normal' }];
  if (side) sides.reverse();
  const m = new Match({ seed: 9000 + r, env, format: 'pokemon', map: MAPS_BY_ENV[env][r % 4], sides });
  for (let t = 0; t < 40; t++) m.step();
  m.startFight();
  const S = m.sim; let t = 0;
  while (S.phase !== 'over' && t < MATCH.pokemonTicks + 6000) { m.step(); t++; }
  const me = S.sides[side].team[0], o = S.sides[1 - side].team[0];
  const won = S.result.winner === side;
  agg.wins += won; agg.dealt += me.stats.dealt; agg.taken += me.stats.taken; agg.len += S.fightTicks / 60; agg.dodges += me.stats.dodges; agg.perfect += me.stats.perfect; agg.hits += me.stats.hits; agg.ults += me.stats.ults;
  for (const [k, v] of Object.entries(me.stats.movesUsed)) agg.uses[k] = (agg.uses[k] || 0) + v;
  for (const [k, v] of Object.entries(me.stats.moveDmg)) agg.dmg[k] = (agg.dmg[k] || 0) + v;
  vs[foe] = vs[foe] || [0, 0]; vs[foe][0] += won; vs[foe][1]++;
  for (const [k, v] of Object.entries(o.stats.moveDmg)) agg.foeDmg[k] = (agg.foeDmg[k] || 0) + v;
}
const n = RUNS, f1 = (x) => (x / n).toFixed(1);
console.log(`${id} (${env}) win ${(agg.wins / n * 100).toFixed(0)}%  len ${f1(agg.len)}s  dealt ${f1(agg.dealt)}  taken ${f1(agg.taken)}  hits ${f1(agg.hits)}  dodges ${f1(agg.dodges)}  perfect ${f1(agg.perfect)}  ults ${f1(agg.ults)}`);
console.log('moves (uses/match, dmg/match, dmg/use):');
for (const k of new Set([...Object.keys(agg.uses), ...Object.keys(agg.dmg)])) console.log(`  ${k.padEnd(18)} ${f1(agg.uses[k] || 0).padStart(5)} ${f1(agg.dmg[k] || 0).padStart(7)} ${((agg.dmg[k] || 0) / Math.max(1, agg.uses[k] || 0)).toFixed(1).padStart(7)}`);
console.log('vs:', Object.entries(vs).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join('  '));
console.log('damage taken from:', Object.entries(agg.foeDmg).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${f1(v)}`).join('  '));
