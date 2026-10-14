// Frame-sequence captures from the real renderer for review: serpent movement, every traversal, every Mega /
// Primal sequence, and all 12 maps mid-battle (full screen with HUD). Usage: node tests/captures.mjs [serpents|trav|mega|maps]...
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const want = process.argv.slice(2);
const on = (k) => !want.length || want.includes(k);
const OUT = 'shots/captures';
mkdirSync(OUT + '/raw', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8077/?lab=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__lab);
const MAP = { ground: 'indigo', water: 'sootopolis', air: 'sky_pillar' };
const FOE = { ground: 'blastoise', water: 'lapras', air: 'zapdos' };

async function start(id, env, foe, map, o = {}) {
  await page.evaluate(async ([id, env, foe, map, o]) => {
    await window.__lab.start({ env, format: o.format || 'pokemon', map, seed: 7, sides: [{ team: [].concat(id), control: o.c0 || 'dummy' }, { team: [].concat(foe), control: o.c1 || 'dummy' }] }, { manual: true, settle: 110 });
  }, [id, env, foe, map, o]);
}
// run a script of [ticks, input] steps, capturing a crop around side 0 after each listed step
async function sequence(steps, crop = [220, 120]) {
  const shots = [];
  for (const [n, inp, cap] of steps) {
    const r = await page.evaluate(([n, inp, cap, crop]) => {
      const L = window.__lab;
      if (n > 0) L.step(n, inp ? { 0: inp } : { 0: {} });
      if (!cap) return null;
      const S = L.scene.S, a = S.activeOf(0);
      const cx = a.serpent ? (a.x + a.serpent.segs[a.serpent.n - 1].x) / 2 : a.x;
      return L.capture(Math.round(cx), Math.round(a.y - 24), crop[0], crop[1]);
    }, [n, inp, cap, crop]);
    if (r) shots.push(r.split(',')[1]);
  }
  return shots;
}
function compose(name, rows) {
  const file = `${OUT}/raw/${name}.json`;
  writeFileSync(file, JSON.stringify({ id: name, env: '', name, rows }));
  execFileSync('python3', ['-I', 'tests/compose_contact.py', file, `${OUT}/${name}.png`]);
  console.log('sheet', name);
}
const place = (x, y, ox, oy) => page.evaluate(([x, y, ox, oy]) => {
  const L = window.__lab, S = L.scene.S, b = S.bounds;
  L.place([{ x: b.x0 + x * (b.x1 - b.x0), y: b.y0 + y * (b.y1 - b.y0) }, { x: b.x0 + ox * (b.x1 - b.x0), y: b.y0 + oy * (b.y1 - b.y0) }]);
}, [x, y, ox, oy]);

// ------------------------------------------------------------------ serpents
if (on('serpents')) {
  const rows = [];
  for (const [id, env] of [['gyarados', 'water'], ['milotic', 'water'], ['rayquaza', 'air']]) {
    await start(id, env, FOE[env], MAP[env]);
    await place(0.25, 0.5, 0.95, 0.1);
    const steps = [[1, {}, 1], [3, { mx: 1 }, 1], [5, { mx: 1 }, 1], [12, { mx: 1 }, 1], [10, { mx: 0.7, my: -0.7 }, 1], [10, { my: -1 }, 1], [8, { mx: -1 }, 1], [6, { mx: -1 }, 1], [12, { mx: -1, my: 0.5 }, 1], [3, {}, 1], [3, {}, 1], [6, {}, 1]];
    rows.push({ name: id + ' move', shots: await sequence(steps, [240, 130]) });
    // attack from the uncoiled state: coils into the sprite to strike
    await place(0.3, 0.5, 0.62, 0.5);
    const s2 = [[14, { mx: 1 }, 1], [1, { slot: 0, held: [true, false, false, false] }, 1], [3, {}, 1], [6, {}, 1], [10, {}, 1], [14, {}, 1], [8, { mx: -1 }, 1], [8, { mx: -1 }, 1], [10, { my: 1 }, 1]];
    rows.push({ name: id + ' attack', shots: await sequence(s2, [240, 130]) });
    if (id === 'rayquaza') {
      // Mega Rayquaza keeps the serpent body
      await page.evaluate(() => { const a = window.__lab.scene.S.activeOf(0); a.applyForm('mega'); a.serpent.reset(); });
      await place(0.25, 0.5, 0.95, 0.1);
      const s3 = [[1, {}, 1], [5, { mx: 1 }, 1], [12, { mx: 1 }, 1], [10, { mx: 0.7, my: -0.7 }, 1], [10, { my: -1 }, 1], [8, { mx: -1 }, 1], [12, { mx: -1, my: 0.5 }, 1], [6, {}, 1]];
      rows.push({ name: 'mega rayquaza move', shots: await sequence(s3, [260, 140]) });
    }
  }
  compose('serpents', rows);
}
// ------------------------------------------------------------------ traversals
if (on('trav')) {
  const T = [['garchomp', 'ground'], ['metagross', 'ground'], ['mewtwo', 'ground'], ['blastoise', 'ground'], ['venusaur', 'ground'], ['raikou', 'ground'], ['suicune', 'ground'], ['sceptile', 'ground'], ['greninja', 'ground'], ['darkrai', 'ground'], ['pikachu', 'ground'], ['gliscor', 'air'], ['latios', 'air'], ['latias', 'air'], ['deoxys', 'air'], ['hawlucha', 'air'], ['lugia', 'water'], ['starmie', 'water'], ['empoleon', 'water']];
  for (let part = 0; part < 2; part++) {
    const rows = [];
    for (const [id, env] of T.slice(part * 10, part * 10 + 10)) {
      await start(id, env, id === FOE[env] ? 'venusaur' : FOE[env], MAP[env]);
      await place(0.3, 0.55, 0.75, 0.45);
      const hold = { dodge: false, dodgeHeld: true, mx: 1, my: -0.2 };
      const steps = [[1, {}, 1], [1, { dodge: true, dodgeHeld: true, mx: 1, my: -0.2 }, 1], [4, hold, 1], [6, hold, 1], [8, hold, 1], [10, hold, 1], [12, { mx: 1 }, 1], [16, { mx: 0.5 }, 1], [20, {}, 1]];
      rows.push({ name: id + ' trav', shots: await sequence(steps, [240, 120]) });
    }
    compose('traversals-' + (part + 1), rows);
  }
}
// ------------------------------------------------------------------ Mega / Primal
if (on('mega')) {
  const rows = [];
  for (const [id, env] of [['mewtwo', 'ground'], ['charizard', 'ground'], ['tyranitar', 'ground'], ['lucario', 'ground'], ['latios', 'air'], ['latias', 'air'], ['rayquaza', 'air'], ['kyogre', 'water']]) {
    await start(id, env, FOE[env], MAP[env]);
    await place(0.4, 0.5, 0.7, 0.5);
    await page.evaluate(() => window.__lab.setUlt(0, 100));
    const steps = [[1, { ult: true }, 1], [6, {}, 1], [10, {}, 1], [10, {}, 1], [8, {}, 1], [8, {}, 1], [10, {}, 1], [14, {}, 1], [20, {}, 1]];
    rows.push({ name: id + ' mega', shots: await sequence(steps, [200, 120]) });
  }
  compose('megas', rows);
}
// ------------------------------------------------------------------ faint sequences (PSP faint slots, Mega revert, fall, sink)
if (on('faint')) {
  const rows = [];
  for (const [id, env, mega] of [['garchomp', 'ground'], ['venusaur', 'ground'], ['mewtwo', 'ground', 1], ['charizard', 'air'], ['articuno', 'air'], ['gyarados', 'water'], ['kyogre', 'water', 1]]) {
    await start(id, env, FOE[env], MAP[env]);
    await place(0.4, 0.5, 0.8, 0.5);
    if (mega) await page.evaluate(() => { const a = window.__lab.scene.S.activeOf(0); a.applyForm('mega'); if (a.serpent) a.serpent.reset(); });
    await page.evaluate(() => { const S = window.__lab.scene.S; S.knockOut(S.activeOf(0)); });
    const steps = [[1, {}, 1], [14, {}, 1], [10, {}, 1], [6, {}, 1], [8, {}, 1], [12, {}, 1], [16, {}, 1], [24, {}, 1], [40, {}, 1]];
    rows.push({ name: id + (mega ? ' mega' : '') + ' faint (' + env + ')', shots: await sequence(steps, [200, 120]) });
  }
  compose('faints', rows);
}
// ------------------------------------------------------------------ maps (full screen, CPU vs CPU)
if (on('maps')) {
  const maps = { ground: ['indigo', 'bell_tower', 'mt_chimney', 'spear_pillar'], water: ['cerulean_gym', 'whirl_islands', 'sootopolis', 'azure_bay'], air: ['kanto_skies', 'sky_pillar', 'dragonspiral', 'lumiose'] };
  const pairs = { ground: [['charizard', 'tyranitar'], ['lucario', 'garchomp']], water: [['gyarados', 'kyogre'], ['lapras', 'starmie']], air: [['rayquaza', 'ho_oh'], ['latios', 'zapdos']] };
  mkdirSync(OUT + '/maps', { recursive: true });
  for (const [env, list] of Object.entries(maps)) {
    let i = 0;
    for (const map of list) {
      const [a, b] = pairs[env][i++ % 2];
      await start(a, env, b, map, { c0: 'cpu', c1: 'cpu' });
      for (const [k, t] of [[1, 90], [2, 420], [3, 600]]) {
        await page.evaluate(([t]) => window.__lab.step(t), [t]);
        await page.screenshot({ path: `${OUT}/maps/${map}-${k}.png` });
      }
      console.log('map', map);
    }
  }
}
console.log(errs.length ? 'errors:\n' + [...new Set(errs)].slice(0, 20).join('\n') : 'no page errors');
await browser.close();
