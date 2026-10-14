// Tournament: a real single-elimination bracket (4, 8 or 16 entrants). Environment and format are fixed for
// the whole tournament, your fighter or team stays the same, and everyone fully heals between rounds.
// CPU-vs-CPU matches are resolved with the real simulation, headless. Progress is saved after every match.
import { ROSTER, SPECIES } from '../content/species.js';
import { TRAINERS } from '../content/trainers.js';
import { MAPS_BY_ENV } from '../content/maps.js';
import { Match } from './match.js';
import { mulberry32 } from '../core/util.js';
import { MATCH } from '../game/sim.js';

export const ROUND_NAMES = { 16: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'], 8: ['Quarterfinals', 'Semifinals', 'Final'], 4: ['Semifinals', 'Final'] };

export function createTournament(o) {
  const rng = mulberry32(o.seed >>> 0);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const env = o.env, size = o.size;
  const entrants = [];
  if (o.format === 'pokemon') {
    entrants.push({ id: 'you', name: SPECIES[o.fighter].name, team: [o.fighter], you: true, icon: o.fighter });
    const pool = shuffle(ROSTER[env].filter((x) => x !== o.fighter));
    const seen = {};
    while (entrants.length < size) {
      const sp = pool[(entrants.length - 1) % pool.length]; seen[sp] = (seen[sp] || 0) + 1;
      // small rosters (water: 8) repeat species in 16-entrant brackets: tell the copies apart
      entrants.push({ id: 'e' + entrants.length, name: SPECIES[sp].name + (seen[sp] > 1 ? ' ' + 'ⅡⅢⅣ'[seen[sp] - 2] : ''), team: [sp], icon: sp });
    }
  } else {
    const t = TRAINERS[o.trainer];
    entrants.push({ id: 'you', name: t.name, trainer: o.trainer, team: t.teams[env].slice(), you: true, icon: t.teams[env][0] });
    const others = shuffle(Object.keys(TRAINERS).filter((k) => k !== o.trainer));
    for (const k of others) { if (entrants.length >= size) break; entrants.push({ id: k, name: TRAINERS[k].name, trainer: k, team: TRAINERS[k].teams[env].slice(), icon: TRAINERS[k].teams[env][0] }); }
    // more slots than named trainers: Ace Trainers with themed, roster-valid teams
    const roster = ROSTER[env];
    let n = 1;
    while (entrants.length < size) {
      // themed: a lead plus teammates that share one of its types where possible (a "Dragon tamer", a "Swimmer"...)
      const lead = roster[Math.floor(rng() * roster.length)], lt = SPECIES[lead].types || [];
      const mates = shuffle(roster.filter((x) => x !== lead && (SPECIES[x].types || []).some((t) => lt.includes(t))));
      const rest = shuffle(roster.filter((x) => x !== lead && !mates.includes(x)));
      const team = [lead, ...mates, ...rest].slice(0, 3);
      const theme = { Dragon: 'Dragon Tamer', Water: 'Swimmer', Fire: 'Firebreather', Flying: 'Bird Keeper', Psychic: 'Psychic', Electric: 'Guitarist', Grass: 'Gardener', Fighting: 'Black Belt', Steel: 'Worker', Dark: 'Punk', Ground: 'Hiker', Rock: 'Hiker', Ice: 'Skier', Poison: 'Rocket Grunt', Normal: 'Youngster', Ghost: 'Hex Maniac', Bug: 'Bug Catcher', Fairy: 'Fairy Tale Girl' }[lt[0]] || 'Ace Trainer';
      entrants.push({ id: 'ace' + n, name: theme + ' ' + String.fromCharCode(64 + n), trainer: null, team, icon: team[0] }); n++;
    }
  }
  const seeded = [entrants[0], ...shuffle(entrants.slice(1))];
  // bracket slots: put "you" in slot 0
  const rounds = [];
  let cur = [];
  for (let i = 0; i < size; i += 2) cur.push({ a: seeded[i], b: seeded[i + 1], winner: null, map: MAPS_BY_ENV[env][Math.floor(rng() * 4)], seed: Math.floor(rng() * 1e9) });
  rounds.push(cur);
  let n2 = size / 2;
  while (n2 > 1) { n2 /= 2; const r = []; for (let i = 0; i < n2; i++) r.push({ a: null, b: null, winner: null, map: MAPS_BY_ENV[env][Math.floor(rng() * 4)], seed: Math.floor(rng() * 1e9) }); rounds.push(r); }
  return { v: 1, env, format: o.format, size, level: o.level, rounds, round: 0, status: 'active', youOut: false, champion: null, created: Date.now(), seed: o.seed >>> 0 };
}
export function currentMatch(T) {
  if (T.status !== 'active') return null;
  const r = T.rounds[T.round];
  return r.find((m) => !m.winner && (m.a && m.a.you || m.b && m.b.you)) || null;
}
// resolve a CPU vs CPU match with the real simulation (headless)
export function simulate(T, m, level) {
  const opts = { seed: m.seed, env: T.env, format: T.format, map: m.map, sides: [{ team: m.a.team, trainer: m.a.trainer, control: 'cpu', level }, { team: m.b.team, trainer: m.b.trainer, control: 'cpu', level }] };
  const M = new Match(opts), S = M.sim;
  for (let i = 0; i < 30; i++) M.step();
  M.startFight();
  const cap = (T.format === 'trainer' ? MATCH.trainerTicks : MATCH.pokemonTicks) + 3000;
  let t = 0;
  while (S.phase !== 'over' && t++ < cap) M.step();
  const w = S.result ? S.result.winner : -1;
  return w === 1 ? 'b' : w === 0 ? 'a' : (S.hpScores()[0] >= S.hpScores()[1] ? 'a' : 'b');
}
// record the player's result (saved right away by the caller); the rest of the round is resolved by tourStep()
export function recordResult(T, youWon) {
  const m = currentMatch(T);
  if (m) { m.winner = (m.a.you ? youWon : !youWon) ? 'a' : 'b'; m.played = true; }
  if (!youWon) T.youOut = true;
}
// one unit of tournament work: simulate one CPU match, or advance a finished round.
// Returns 'sim' (did a match), 'advanced', 'player' (waiting for your match) or 'done'.
export function tourStep(T) {
  if (T.status !== 'active') return 'done';
  const r = T.rounds[T.round];
  const cpu = r.find((m) => !m.winner && !(m.a && m.a.you) && !(m.b && m.b.you));
  if (cpu) { cpu.winner = simulate(T, cpu, T.level === 'hard' ? 'hard' : 'normal'); return 'sim'; }
  if (r.some((m) => !m.winner)) return 'player';
  const winners = r.map((m) => m[m.winner]);
  if (T.round === T.rounds.length - 1) { T.status = 'done'; T.champion = winners[0]; return 'done'; }
  const next = T.rounds[T.round + 1];
  for (let i = 0; i < next.length; i++) { next[i].a = winners[i * 2]; next[i].b = winners[i * 2 + 1]; }
  T.round++;
  return 'advanced';
}
// how many CPU matches remain before the player's next match (or the end)
export function pendingSims(T) {
  let n = 0;
  for (let i = T.round; i < T.rounds.length; i++) {
    for (const m of T.rounds[i]) if (!m.winner && !(m.a && m.a.you) && !(m.b && m.b.you)) n++;
    if (!T.youOut) break;
  }
  return n;
}
// resolve everything that doesn't need the player (synchronous; the UI uses tourStep in slices)
export function finishRound(T) { let s; do { s = tourStep(T); } while (s === 'sim' || s === 'advanced'); }
export function roundName(T, i = T.round) { return ROUND_NAMES[T.size][i]; }
