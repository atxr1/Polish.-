// Contact sheets: every move (and the Ultimate) of every fighter in each of its environments, captured from the
// real renderer at 1 texel per world unit. Usage: node tests/contact.mjs [fighter,fighter...] [env]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const only = process.argv[2] ? process.argv[2].split(',') : null;
const onlyEnv = process.argv[3] || null;
const OUT = 'shots/contact';
mkdirSync(OUT + '/raw', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:8077/?lab=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__lab);
const FOE = { ground: 'blastoise', water: 'lapras', air: 'zapdos' };
const MAP = { ground: 'indigo', water: 'sootopolis', air: 'sky_pillar' };
const list = await page.evaluate(() => window.__labRoster());
const jobs = [];
for (const [env, ids] of Object.entries(list)) for (const id of ids) if ((!only || only.includes(id)) && (!onlyEnv || onlyEnv === env)) jobs.push([id, env]);
for (const [id, env] of jobs) {
  const foe = id === FOE[env] ? (env === 'ground' ? 'venusaur' : env === 'water' ? 'kyogre' : 'articuno') : FOE[env];
  await page.evaluate(async ([id, foe, env, map]) => {
    await window.__lab.start({ env, format: 'pokemon', map, seed: 7, sides: [{ team: [id], control: 'dummy' }, { team: [foe], control: 'dummy' }] }, { manual: true, settle: 110 });
  }, [id, foe, env, MAP[env]]);
  const info = await page.evaluate(() => window.__labInfo());
  const rows = [];
  const slots = info.mega ? [0, 1, 2, 3, -1, -2, -3] : [0, 1, 2, 3, -1];   // -1 Mega Evolution, -2 Mega Ultimate, -3 base Ultimate (a teammate already went Mega)
  for (const slot of slots) {
    const range = slot >= 0 ? info.ranges[slot] : slot === -1 ? (info.mega ? 40 : info.ultRange) : slot === -2 ? info.megaRange : info.ultRange;
    const prep = () => page.evaluate(([env, range, slot]) => {
      const L = window.__lab, S = L.scene.S, b = S.bounds, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      L.step(1, { 0: {} });
      for (let k = 0; k < 2; k++) { const f = S.activeOf(k); if (f.move) S.endMove(f); f.setState('idle'); }
      const a = S.activeOf(0), o = S.activeOf(1), d = range + (a.r + o.r) * 0.5, sd = S.sides[0];
      if (a.sp.mega) {
        if (slot === -1) { sd.megaUsed = false; if (a.form === 'mega') a.applyForm(null); }
        else if (slot === -2) { sd.megaUsed = true; if (a.form !== 'mega') a.applyForm('mega'); }
        else if (slot === -3) { sd.megaUsed = true; if (a.form === 'mega') a.applyForm(null); }
      }
      L.place([{ x: cx - d / 2, y: cy + 2 }, { x: cx + d / 2, y: cy - 2 }]);
      for (let k = 0; k < 2; k++) { const f = S.activeOf(k); f.hp = f.maxHp; f.stamina = 100; f.cds = [0, 0, 0, 0]; f.status = {}; f.ult = 0; f.buffs = []; f.statusImmune = {}; f.flags = {}; f.hitstun = 0; f.kvx = f.kvy = 0; f.z = 0; f.seeded = null; }
      S.zones.length = 0; S.projs.length = 0; S.trails.length = 0; S.traps.length = 0; S.walls.length = 0; S.acts && (S.acts.length = 0);
      const FX = L.scene.fx; FX.decals.length = 0; FX.parts.length = 0; FX.streams.length = 0; FX.teles.length = 0; FX.nums.length = 0;
      L.step(2);
    }, [env, range, slot]);
    // dry run: how long does the whole move take?
    await prep();
    const len = await page.evaluate(([slot]) => {
      const L = window.__lab, S = L.scene.S, a = S.activeOf(0);
      const held = { held: [slot === 0, slot === 1, slot === 2, slot === 3] };
      if (slot < 0) { L.setUlt(0, 100); L.step(1, { 0: { ult: true } }); } else L.step(1, { 0: Object.assign({ slot }, held) });
      let t = 1; while (t < 400 && (a.move || S.freeze > 0)) { L.step(1, { 0: held }); t++; }
      return t;
    }, [slot]);
    await page.evaluate(() => window.__lab.step(240, { 0: {} }));
    await prep();

    // press, then spread 9 captures over the move's real length (startup .. end + follow-through)
    const started = await page.evaluate(([slot]) => {
      const L = window.__lab, a = L.scene.S.activeOf(0);
      if (slot < 0) { L.setUlt(0, 100); L.step(1, { 0: { ult: true } }); } else L.step(1, { 0: { slot, held: [slot === 0, slot === 1, slot === 2, slot === 3] } });
      return [a.move ? a.move.def.id : null, a.state, a.hitstun, L.scene.S.freeze, JSON.stringify(a.status)];
    }, [slot]);
    if (!started[0]) console.log('  ! row', slot, 'did not start', started.join(' '));
    const span = Math.max(36, Math.min(260, len + 16));
    const frames = Array.from({ length: 9 }, (_, i) => Math.max(2, Math.round(2 + (span - 2) * Math.pow(i / 8, 1.15))));
    const shots = [];
    let t = 1;
    for (const want of frames) {
      const n = Math.max(0, want - t); t = Math.max(t, want);
      const r = await page.evaluate(([n, slot]) => {
        const L = window.__lab;
        if (n > 0) L.step(n, { 0: { held: [slot === 0, slot === 1, slot === 2, slot === 3] } });
        const S = L.scene.S, a = S.activeOf(0), o = S.activeOf(1);
        return L.capture((a.x + o.x) / 2 + 2, (a.y + o.y) / 2 - 22, 224, 112);
      }, [n, slot]);
      shots.push(r.split(',')[1]);
    }
    rows.push({ name: slot === -1 ? (info.mega ? info.mega : info.ult) : slot === -2 ? info.megaUlt : slot === -3 ? info.ult : info.moves[slot], shots });
    // let everything finish
    await page.evaluate(() => window.__lab.step(200, { 0: {} }));
  }
  const file = `${OUT}/raw/${id}-${env}.json`;
  writeFileSync(file, JSON.stringify({ id, env, name: info.name, rows }));
  execFileSync('python3', ['-I', 'tests/compose_contact.py', file, `${OUT}/${id}-${env}.png`]);
  console.log('sheet', id, env);
}
console.log(errs.length ? 'errors:\n' + [...new Set(errs)].slice(0, 20).join('\n') : 'no page errors');
await browser.close();
