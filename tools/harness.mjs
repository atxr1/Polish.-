// Headless balance harness: AI vs AI with the real simulation code.
// Usage: bun tools/harness.mjs [--runs N] [--env ground|water|air|all] [--format pokemon|trainer|both] [--level normal] [--seed S] [--out file.json] [--quiet]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { registerContent, addSpriteMeta, SPECIES, ROSTER, TRAINERS } from '../src/content/index.js';
import { MAPS_BY_ENV } from '../src/content/maps.js';
import { Match } from '../src/modes/match.js';
import { CONTENT } from '../src/game/content.js';
import { MATCH } from '../src/game/sim.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const RUNS = +(args.runs || 200), LEVEL = args.level || 'normal', SEED = +(args.seed || 1);
const envs = !args.env || args.env === 'all' ? ['ground', 'water', 'air'] : [args.env];
const formats = !args.format || args.format === 'both' ? ['pokemon', 'trainer'] : [args.format];

registerContent();
const dir = new URL('../site/assets/fighters/', import.meta.url).pathname;
for (const f of readdirSync(dir)) if (f.endsWith('.json') && !f.startsWith('_')) addSpriteMeta(f.slice(0, -5), JSON.parse(readFileSync(dir + f, 'utf8')));

let rs = SEED >>> 0;
const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function runOne(env, format, seed, a, b, map) {
  const opts = { seed, env, format, map, sides: [{ team: a, control: 'cpu', level: LEVEL }, { team: b, control: 'cpu', level: LEVEL }] };
  const m = new Match(opts);
  const S = m.sim;
  let t = 0;
  const cap = (format === 'trainer' ? MATCH.trainerTicks : MATCH.pokemonTicks) + 6000;
  for (; t < 40; t++) m.step();
  m.startFight();
  const t0 = performance.now();
  while (S.phase !== 'over' && t < cap) { m.step(); t++; }
  const ms = performance.now() - t0;
  return { m, S, stalled: S.phase !== 'over', ticks: S.fightTicks, ms, steps: t };
}

const report = { level: LEVEL, runs: RUNS, envs: {}, errors: [], stalls: 0, perfMsPerTick: 0 };
let totalMs = 0, totalTicks = 0;
for (const env of envs) {
  for (const format of formats) {
    const key = env + ':' + format;
    const roster = ROSTER[env];
    const st = { wins: {}, games: {}, lengths: [], reasons: {}, moves: {}, stamina: {}, trav: {}, ults: 0, megas: 0, koByTime: 0, firstUlt: [] };
    for (let r = 0; r < RUNS; r++) {
      let a, b, names = null;
      // Pokémon Battles: a balanced round-robin (every matchup equally often, sides alternating), so each fighter's
      // rate is measured across all matchups in its environment rather than whichever foes a random draw favoured
      if (format === 'pokemon') { const n = roster.length, i = r % n, k = Math.floor(r / n), j = (i + 1 + (k % (n - 1))) % n; [a, b] = (i + k) % 2 ? [[roster[j]], [roster[i]]] : [[roster[i]], [roster[j]]]; }
      else {
        const tn = Object.keys(TRAINERS);
        const ta = tn[r % tn.length], tb = pick(tn.filter((x) => x !== ta));
        a = TRAINERS[ta].teams[env]; b = TRAINERS[tb].teams[env]; names = ['T:' + ta, 'T:' + tb];
      }
      const map = pick(MAPS_BY_ENV[env]);
      try {
        const res = runOne(env, format, (SEED * 1000 + r) >>> 0, a, b, map);
        totalMs += res.ms; totalTicks += res.steps;
        if (res.stalled) { report.stalls++; report.errors.push({ key, r, a, b, map, err: 'stalled', phase: res.S.phase }); continue; }
        const w = res.S.result.winner;
        st.reasons[res.S.result.reason] = (st.reasons[res.S.result.reason] || 0) + 1;
        st.lengths.push(res.ticks / 60);
        const sides = [a, b];
        for (let s = 0; s < 2; s++) for (const id of (format === 'pokemon' ? sides[s] : [names[s]])) {
          st.games[id] = (st.games[id] || 0) + 1;
          if (w === s) st.wins[id] = (st.wins[id] || 0) + 1;
          else if (w < 0) st.wins[id] = (st.wins[id] || 0) + 0.5;
        }
        if (format === 'trainer') for (let s = 0; s < 2; s++) for (const id of sides[s]) { st.games['~' + id] = (st.games['~' + id] || 0) + 1; if (w === s) st.wins['~' + id] = (st.wins['~' + id] || 0) + 1; }
        for (const sd of res.S.sides) for (const f of sd.team) {
          for (const [mid, n] of Object.entries(f.stats.movesUsed)) st.moves[mid] = (st.moves[mid] || 0) + n;
          for (const [mid, n] of Object.entries(f.stats.stamina)) st.stamina[mid] = (st.stamina[mid] || 0) + n;
          st.ults += f.stats.ults; if (f.form === 'mega') st.megas++; if (f.stats.firstUltT) st.firstUlt.push(f.stats.firstUltT / 60);
        }
      } catch (e) {
        report.errors.push({ key, r, a, b, map, err: String(e && e.stack || e).slice(0, 600) });
      }
    }
    st.lengths.sort((x, y) => x - y);
    const med = st.lengths[Math.floor(st.lengths.length / 2)] || 0;
    const rates = Object.keys(st.games).filter((k) => !k.includes('+')).map((k) => [k, (st.wins[k] || 0) / st.games[k], st.games[k]]).sort((x, y) => y[1] - x[1]);
    report.envs[key] = { medianSec: +med.toFixed(1), p10: +(st.lengths[Math.floor(st.lengths.length * 0.1)] || 0).toFixed(1), p90: +(st.lengths[Math.floor(st.lengths.length * 0.9)] || 0).toFixed(1), reasons: st.reasons, rates: rates.map(([k, v, n]) => [k, +v.toFixed(3), n]), ultsPerMatch: +(st.ults / RUNS).toFixed(2), firstUltMedian: +((st.firstUlt.sort((x, y) => x - y)[Math.floor(st.firstUlt.length / 2)]) || 0).toFixed(1), megas: st.megas, moves: st.moves, stamina: st.stamina };
    if (!args.quiet) {
      console.log(`\n== ${key}  median ${med.toFixed(1)}s (p10 ${report.envs[key].p10} p90 ${report.envs[key].p90})  reasons ${JSON.stringify(st.reasons)}  ults/match ${report.envs[key].ultsPerMatch}  first ult ${report.envs[key].firstUltMedian}s`);
      console.log(rates.map(([k, v, n]) => `${k}:${(v * 100).toFixed(0)}%(${n})`).join('  '));
    }
  }
}
report.perfMsPerTick = +(totalMs / Math.max(1, totalTicks)).toFixed(4);
console.log(`\nerrors ${report.errors.length}  stalls ${report.stalls}  sim ms/tick ${report.perfMsPerTick}`);
for (const e of report.errors.slice(0, 5)) console.log(JSON.stringify(e));
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 1));
