// Serpent movement metrics (headless, real sim): top speed, 180° reversal time, U-turn radius, body length,
// coil/uncoil time and hurtbox while coiled/uncoiled. Usage: bun tests/serpent_metrics.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { registerContent, addSpriteMeta, SPECIES } from '../src/content/index.js';
import { Match } from '../src/modes/match.js';
import { blankInput } from '../src/game/fighter.js';

registerContent();
const dir = new URL('../site/assets/fighters/', import.meta.url).pathname;
for (const f of readdirSync(dir)) if (f.endsWith('.json') && !f.startsWith('_')) addSpriteMeta(f.slice(0, -5), JSON.parse(readFileSync(dir + f, 'utf8')));

const cases = [['gyarados', 'water', 'sootopolis'], ['milotic', 'water', 'sootopolis'], ['rayquaza', 'air', 'sky_pillar']];
const results = [];
for (const [id, env, map] of cases) {
  const m = new Match({ seed: 5, env, format: 'pokemon', map, sides: [{ team: [id], control: 'dummy' }, { team: [env === 'air' ? 'zapdos' : 'lapras'], control: 'dummy' }] });
  for (let t = 0; t < 40; t++) m.step();
  m.startFight();
  const S = m.sim, f = S.activeOf(0), o = S.activeOf(1);
  while (f.state === 'enter' || S.phase !== 'fight') m.step();
  o.x = S.bounds.x1 - 20; o.y = S.bounds.y0 + 20;
  const go = (mx, my, n, each) => { for (let i = 0; i < n; i++) { const inp = blankInput(); inp.mx = mx; inp.my = my; m.step([inp, null]); if (each) each(i); } };
  // start at the left, coiled
  f.x = S.bounds.x0 + 30; f.y = (S.bounds.y0 + S.bounds.y1) / 2; f.vx = f.vy = 0; f.serpent.reset();
  // uncoil + accelerate to the right
  let uncoilT = -1, top = 0;
  go(1, 0, 70, (i) => { if (uncoilT < 0 && f.serpent.coil <= 0) uncoilT = i + 1; top = Math.max(top, Math.hypot(f.vx, f.vy)); });
  const bodyLen = f.serpent.segs.reduce((a, s, i, arr) => a + Math.hypot(s.x - (i ? arr[i - 1].x : f.x), s.y - (i ? arr[i - 1].y : f.y)), 0);
  const hurtUncoiled = f.serpent.hurtCircles().length;
  // 180° reversal: time until the velocity points the other way at half speed
  let revT = -1;
  go(-1, 0, 40, (i) => { if (revT < 0 && f.vx < -top * 0.5) revT = i + 1; });
  // U-turn radius: steer the input around a half circle at the max rate the body can follow
  f.x = S.bounds.x0 + 40; f.y = S.bounds.y0 + 60; go(1, 0, 40);
  const ys = [];
  for (let i = 0; i < 40; i++) { const a = Math.min(Math.PI, i * Math.PI / 12); const inp = blankInput(); inp.mx = Math.cos(a); inp.my = Math.sin(a); m.step([inp, null]); ys.push(f.y); }
  const uWidth = Math.max(...ys) - Math.min(...ys);
  // coil time when stopping
  let coilT = -1;
  go(0, 0, 20, (i) => { if (coilT < 0 && f.serpent.coil >= 1) coilT = i + 1; });
  const hurtCoiled = f.serpent.hurtCircles().length;
  const r = { id, env, topSpeed: +(top * 60).toFixed(0) + ' u/s', uncoilTicks: uncoilT, coilTicks: coilT, reverseSec: +(revT / 60).toFixed(2), uTurnRadius: +(uWidth / 2).toFixed(1), bodyLength: +bodyLen.toFixed(0), segments: f.serpent.n, hurtUncoiled, hurtCoiled };
  results.push(r);
  console.log(JSON.stringify(r));
}
const bad = results.filter((r) => r.reverseSec > 0.25 || r.uTurnRadius > 22 || r.bodyLength < 95 || r.bodyLength > 145 || r.segments < 6 || r.segments > 9);
if (bad.length) { console.log('FAIL', bad.map((r) => r.id).join(', ')); process.exit(1); }
console.log('serpent metrics OK');
