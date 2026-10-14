// Determinism check: CPU-vs-CPU matches in every environment and format, then a Replay of each log must reach the
// final knockout in exactly the same state (what Play of the Match relies on). Usage: bun tools/replaycheck.mjs [N]
import { readFileSync, readdirSync } from 'node:fs';
import { registerContent, addSpriteMeta, ROSTER, TRAINERS } from '../src/content/index.js';
import { MAPS_BY_ENV } from '../src/content/maps.js';
import { Match, Replay } from '../src/modes/match.js';
import { MATCH } from '../src/game/sim.js';
registerContent();
const dir = new URL('../site/assets/fighters/', import.meta.url).pathname;
for (const f of readdirSync(dir)) if (f.endsWith('.json') && !f.startsWith('_')) addSpriteMeta(f.slice(0, -5), JSON.parse(readFileSync(dir + f, 'utf8')));
const sig = (S) => S.tick + '|' + S.fighters().map((f) => `${f.id}:${f.hp}:${f.x.toFixed(6)}:${f.y.toFixed(6)}:${f.state}`).join(',');
const N = +(process.argv[2] || 6);
let ok = 0, bad = 0;
const tn = Object.keys(TRAINERS);
for (const env of ['ground', 'water', 'air']) for (const format of ['pokemon', 'trainer']) for (let r = 0; r < N; r++) {
  const R = ROSTER[env];
  const sides = format === 'pokemon' ? [[R[(r * 5) % R.length]], [R[(r * 5 + 3) % R.length]]] : [TRAINERS[tn[r % tn.length]].teams[env], TRAINERS[tn[(r + 4) % tn.length]].teams[env]];
  const m = new Match({ seed: 900 + r, env, format, map: MAPS_BY_ENV[env][r % 4], sides: sides.map((team) => ({ team, control: 'cpu', level: 'normal' })) });
  for (let t = 0; t < 40; t++) m.step(); m.startFight();
  const S = m.sim; let t = 0, endSig = null, endTick = -1;
  while (S.phase !== 'over' && t < (format === 'trainer' ? MATCH.trainerTicks : MATCH.pokemonTicks) + 6000) {
    const evs = m.step(); t++;
    if (endTick < 0 && evs.some((e) => (e.e === 'faint' && e.final) || e.e === 'timeup' || e.e === 'draw')) { endTick = S.tick; endSig = sig(S); }
  }
  const rp = new Replay(m.log); rp.fastForward(endTick);
  if (sig(rp.sim) === endSig) ok++; else { bad++; console.log(`DIVERGED ${env} ${format} r${r} at end tick ${endTick}`); }
}
console.log(`replays identical: ${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
