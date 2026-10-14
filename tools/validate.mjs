// Content validator: checks every reference in the game data against the built asset manifests and runs every
// move, Ultimate and Mega Ultimate of every fighter in each of its environments through the real simulation.
// Usage: bun tools/validate.mjs   (exit code 1 on any failure)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { registerContent, addSpriteMeta, SPECIES, ROSTER, TRAINERS } from '../src/content/index.js';
import { MAPS, MAPS_BY_ENV } from '../src/content/maps.js';
import { MOVES, moveFxNames, moveBeamNames } from '../src/content/moves.js';
import { FX_DEFAULTS } from '../src/render/fxnames.js';
import { SFX_DEFAULTS } from '../src/audio/sfxnames.js';
import { Match } from '../src/modes/match.js';
import { blankInput } from '../src/game/fighter.js';

const ROOT = new URL('../', import.meta.url).pathname;
const fx = JSON.parse(readFileSync(ROOT + 'site/assets/fx/manifest.json', 'utf8'));
const audio = JSON.parse(readFileSync(ROOT + 'site/assets/audio/manifest.json', 'utf8'));
const fails = [];
const fail = (m) => fails.push(m);

registerContent();
const fdir = ROOT + 'site/assets/fighters/';
for (const f of readdirSync(fdir)) if (f.endsWith('.json') && !f.startsWith('_')) addSpriteMeta(f.slice(0, -5), JSON.parse(readFileSync(fdir + f, 'utf8')));

const isSheet = (n) => !!(fx.particles[n.split('|')[0]] || fx.bg[n.split('|')[0]]);
const isBeam = (n) => !!fx.beams[n.split('|')[0]];
const TYPES = new Set(['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy']);
const checkName = (n, where) => {
  const [base, tint] = n.split('|');
  if (tint && !TYPES.has(tint)) fail(`${where}: palette "${tint}" is not a type (${n})`);
  if (!isSheet(base) && !isBeam(base)) fail(`${where}: effect "${base}" is not in the fx manifest`);
};

// ---------------------------------------------------------------- moves
const used = new Set();
for (const sp of Object.values(SPECIES)) {
  for (const m of sp.kit) used.add(m);
  used.add(sp.ult);
  if (sp.mega) used.add(sp.mega.ult);
}
used.add('sacredinferno'); for (const x of ['pb_normal', 'pb_attack', 'pb_defense', 'pb_speed']) used.add(x); // Ho-Oh's Rebirth revives into Sacred Inferno (battle.js preloads it)
for (const id of used) if (!MOVES[id]) fail(`move ${id} is used by a kit but not defined`);
for (const [id, m] of Object.entries(MOVES)) {
  if (!used.has(id) && !id.startsWith('pb_')) fail(`move ${id} is defined but no fighter uses it`);
  for (const n of moveFxNames(m)) checkName(n, 'move ' + id);
  for (const n of moveBeamNames(m)) if (!isBeam(n)) fail(`move ${id}: beam "${n}" missing`);
  const sfxs = [m.sfx, m.sfxStart, ...m.steps.map((s) => s.sfx), ...m.steps.map((s) => s.eachSfx)].filter(Boolean);
  for (const s of sfxs) if (!audio.sfx[s]) fail(`move ${id}: sound "${s}" missing`);
  for (const s of m.steps) {
    if (s.at !== undefined && typeof s.at !== 'number') fail(`move ${id}: step ${s.k} has non-numeric timing at=${s.at}`);
    if (s.where && !['target', 'self', 'aim', 'lead'].includes(s.where)) fail(`move ${id}: step ${s.k} has unknown where=${s.where}`);
  }
  if (m.tier !== 'ult' && !(m.cost > 0) && m.cost !== 0) fail(`move ${id}: no stamina cost`);
  // tier rules (brief §7): cost and cooldown ranges; utility moves (buffs, shields, heals, counters, sleep) may
  // use longer cooldowns so they can't be kept up permanently — see DECISIONS.md
  const RANGE = { light: [10, 14, 0, 0], medium: [18, 26, 18, 36], heavy: [30, 40, 72, 120], sig: [45, 55, 180, 240] };
  const utility = ['buff', 'heal', 'defend', 'reflect', 'absorb', 'counter', 'smoke', 'trap', 'wall'].includes(m.ai && m.ai.kind) || !(m.power > 0) || (m.status && m.status.sleep);
  if (RANGE[m.tier] && !id.startsWith('pb_')) {
    const [c0, c1, d0, d1] = RANGE[m.tier];
    if (m.cost < c0 || m.cost > c1) fail(`move ${id}: ${m.tier} cost ${m.cost} outside ${c0}-${c1}`);
    if (!utility && (m.cd < d0 || m.cd > d1)) fail(`move ${id}: ${m.tier} cooldown ${m.cd} ticks outside ${d0}-${d1}`);
  }
  // a buff, shield or heal-over-time must lapse before it comes back: at most two-thirds of the cooldown
  // (held shields are limited by their stamina drain instead)
  if (m.tier !== 'ult') for (const st of m.steps || []) {
    if ((st.stats || st.heal || st.k === 'barrier' || st.follow) && !st.held && st.ticks > 0 && st.ticks > (m.cd || 0) * 0.67) fail(`move ${id}: effect lasts ${st.ticks} ticks with a ${m.cd || 0}-tick cooldown (permanent uptime)`);
  }
}
// ---------------------------------------------------------------- species
for (const [env, ids] of Object.entries(ROSTER)) {
  for (const id of ids) {
    const sp = SPECIES[id];
    if (!sp) { fail(`roster ${env}: ${id} has no species`); continue; }
    if (sp.kit.length !== 4) fail(`${id}: kit has ${sp.kit.length} moves`);
    if (sp.kit.filter((k) => MOVES[k] && MOVES[k].tier === 'sig').length > 1) fail(`${id}: more than one Signature move`);
    const sprites = [sp.sprite || id];
    if (sp.mega) sprites.push(sp.mega.sprite);
    if (sp.formes) for (const fo of Object.values(sp.formes)) if (fo.sprite) sprites.push(fo.sprite);
    for (const s of sprites) if (!existsSync(fdir + s + '.png') || !existsSync(fdir + s + '.json')) fail(`${id}: sprite ${s} missing`);
  }
}
// ---------------------------------------------------------------- maps, trainers, music
for (const env of ['ground', 'water', 'air']) if ((MAPS_BY_ENV[env] || []).length !== 4) fail(`${env} has ${(MAPS_BY_ENV[env] || []).length} maps`);
for (const [id, m] of Object.entries(MAPS)) {
  if (!audio.music[m.music]) fail(`map ${id}: music "${m.music}" missing`);
  if (!existsSync(ROOT + 'site/assets/maps/' + id + '.png')) fail(`map ${id}: painting missing`);
  if (id !== 'indigo' && !m.feature) fail(`map ${id}: no interactive feature`);
  if (m.fx) for (const n of [].concat(m.fx)) if (typeof n === 'string') checkName(n, 'map ' + id);
}
for (const [tid, t] of Object.entries(TRAINERS)) {
  for (const env of ['ground', 'water', 'air']) {
    const team = t.teams[env];
    if (!team || team.length !== 3) { fail(`trainer ${tid}: ${env} team has ${team ? team.length : 0}`); continue; }
    for (const p of team) if (!ROSTER[env].includes(p)) fail(`trainer ${tid}: ${p} is not in the ${env} roster`);
  }
}
// ---------------------------------------------------------------- hard-coded names in code
for (const n of FX_DEFAULTS.particles) checkName(n, 'FX_DEFAULTS');
for (const n of FX_DEFAULTS.bg) if (!fx.bg[n]) fail(`FX_DEFAULTS bg ${n} missing`);
for (const s of SFX_DEFAULTS) if (!audio.sfx[s]) fail(`SFX_DEFAULTS: "${s}" missing`);
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + '/' + e.name) : e.name.endsWith('.js') ? [d + '/' + e.name] : []);
const fxSet = new Set(FX_DEFAULTS.particles.map((n) => n.split('|')[0]));
for (const id of used) for (const n of moveFxNames(MOVES[id])) fxSet.add(n.split('|')[0]);
const defSet = new Set(FX_DEFAULTS.particles.map((n) => n.split('|')[0]));
const sfxSet = new Set(SFX_DEFAULTS);
for (const m of Object.values(MOVES)) for (const x of [m.sfx, m.sfxStart, ...m.steps.map((s) => s.sfx), ...m.steps.map((s) => s.eachSfx)]) if (x) sfxSet.add(x);
for (const file of walk(ROOT + 'src')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/'((?:DUN|psp|menu|fanfare)_[A-Za-z0-9_]+)'/g)) {
    if (!audio.sfx[m[1]]) fail(`${file.slice(ROOT.length)}: sound "${m[1]}" missing`);
    else if (!sfxSet.has(m[1])) fail(`${file.slice(ROOT.length)}: sound "${m[1]}" is not preloaded (add to SFX_DEFAULTS)`);
  }
  for (const m of src.matchAll(/'([A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)(?:\|[A-Z][a-z]+)?'/g)) {
    const n = m[1];
    if (TYPES.has(n)) continue;
    const pre = file.includes('/content/') ? fxSet : defSet;
    if (isSheet(n) || isBeam(n)) { if (!pre.has(n) && !fx.bg[n] && !isBeam(n) && !file.includes('fxnames')) fail(`${file.slice(ROOT.length)}: effect "${n}" is not preloaded (add to FX_DEFAULTS)`); }
    else if (/^(Weather|Hit|Smoke|Bubbles|Dust|Fire|Water|Rock|Leaf|Sparkle|Lightning|Ice|Psy|Shadow|Dark|Poison)_/.test(n)) fail(`${file.slice(ROOT.length)}: effect-like name "${n}" is not in the fx manifest`);
  }
}

// ---------------------------------------------------------------- run every move
const FOE = { ground: 'blastoise', water: 'lapras', air: 'zapdos' };
let runs = 0;
for (const [env, ids] of Object.entries(ROSTER)) {
  for (const id of ids) {
    const sp = SPECIES[id];
    const foe = id === FOE[env] ? 'venusaur' === id ? 'garchomp' : (env === 'ground' ? 'venusaur' : env === 'water' ? 'kyogre' : 'articuno') : FOE[env];
    const slots = [0, 1, 2, 3, 'ult'];
    if (sp.mega) slots.push('mega');
    for (const slot of slots) {
      runs++;
      try {
        const m = new Match({ seed: 3, env, format: 'pokemon', map: MAPS_BY_ENV[env][0], sides: [{ team: [id], control: 'dummy' }, { team: [foe], control: 'dummy' }] });
        for (let t = 0; t < 40; t++) m.step();
        m.startFight();
        const S = m.sim;
        while (S.phase !== 'fight' || S.activeOf(0).state === 'enter' || S.activeOf(1).state === 'enter' || S.activeOf(0).flags.invuln > S.tick || S.activeOf(1).flags.invuln > S.tick) m.step();
        const a = S.activeOf(0), o = S.activeOf(1);
        const want0 = slot === 'ult' ? sp.ult : slot === 'mega' ? sp.mega.ult : sp.kit[slot];
        const r = MOVES[want0].ai ? MOVES[want0].ai.r : [0, 60];
        const kind = MOVES[want0].ai && MOVES[want0].ai.kind;
        const dist = (kind === 'heal' || kind === 'buff' ? 24 : Math.max(12, Math.min(150, (r[0] + r[1]) / 2))) + (a.r + o.r) * 0.5;
        a.x = (S.bounds.x0 + S.bounds.x1) / 2 - dist / 2; o.x = a.x + dist; a.y = o.y = (S.bounds.y0 + S.bounds.y1) / 2;
        a.faceAngle(0); o.faceAngle(Math.PI);
        if (slot === 'ult' && sp.mega) S.sides[0].megaUsed = true;
        a.stamina = 100;
        let moveName;
        if (slot === 'mega') { a.ult = 100; const i = blankInput(); i.ult = true; m.step([i, null]); for (let t = 0; t < 400 && (a.move || S.freeze > 0); t++) m.step([blankInput(), null]); a.ult = 100; }
        if (slot === 'ult' || slot === 'mega') { a.ult = 100; const i = blankInput(); i.ult = true; m.step([i, null]); moveName = a.move && a.move.def.id; }
        else { const i = blankInput(); i.slot = slot; i.held = [slot === 0, slot === 1, slot === 2, slot === 3]; m.step([i, null]); moveName = a.move && a.move.def.id; }
        const want = slot === 'ult' ? sp.ult : slot === 'mega' ? sp.mega.ult : sp.kit[slot];
        if (moveName !== want) { fail(`${id}/${env}: slot ${slot} started ${moveName} instead of ${want}`); continue; }
        if (!Number.isFinite(a.move.end)) { fail(`${id}/${env}: ${want} has end=${a.move.end}`); continue; }
        let t = 0;
        const held = blankInput(); if (typeof slot === 'number') held.held = [slot === 0, slot === 1, slot === 2, slot === 3];
        while (a.move && t < 900) { m.step([held, null]); t++; }
        if (a.move) fail(`${id}/${env}: ${want} still running after 900 ticks`);
        // let projectiles / zones resolve
        for (let k = 0; k < 300 && S.phase === 'fight'; k++) m.step([blankInput(), null]);
        const dealt = o.maxHp - o.hp + (o.alive ? 0 : 1);
        const def = MOVES[want];
        if (def.power > 0 && dealt <= 0 && !['protect', 'counter', 'mirrorcoat', 'toxicspikes', 'roar'].includes(want)) fail(`${id}/${env}: ${want} (power ${def.power}) dealt no damage at ${Math.round(dist)} units`);
        for (const n of [...S.events]) if (n.e === 'error') fail(`${id}/${env}: ${want} raised ${n.msg}`);
      } catch (e) { fail(`${id}/${env}: slot ${slot} threw ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
    }
  }
}
console.log(`checked ${Object.keys(MOVES).length} moves, ${Object.keys(SPECIES).length} species, ${Object.keys(MAPS).length} maps, ${runs} move runs`);
if (fails.length) { console.log(fails.length + ' problems:\n' + fails.join('\n')); process.exit(1); }
console.log('content OK');
