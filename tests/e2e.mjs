// End-to-end checks in an iPhone-shaped touch browser (Playwright Chromium, DPR 3, landscape):
// every screen, all 12 mode combinations (3 environments x Pokémon/Trainer x Quick/Tournament), touch controls,
// switching, pause, skips, tournament reload + resume + championship, save export/import and corrupt-save recovery.
// Usage: node tests/e2e.mjs [WxH]   (default runs 844x390 and 932x430). Writes shots/e2e/<size>/ and a JSON report.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:8077/';
const sizes = process.argv[2] ? [process.argv[2].split('x').map(Number)] : [[844, 390], [932, 430]];
const report = { sizes: {}, failures: [] };
const ENVS = ['ground', 'water', 'air'], FORMATS = ['pokemon', 'trainer'];

function check(cond, msg, R) { if (!cond) { R.failures.push(msg); console.log('  FAIL ' + msg); } else R.passed.push(msg); }

for (const [W, H] of sizes) {
  const key = `${W}x${H}`, OUT = `shots/e2e/${key}`;
  mkdirSync(OUT, { recursive: true });
  const R = { passed: [], failures: [], errors: [], timings: {} };
  report.sizes[key] = R;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => R.errors.push('pageerror: ' + e.message));
  let untouched = false;   // set while matches run without the test poking the sim state (Play of the Match must replay exactly)
  page.on('console', (m) => {
    if (m.type() === 'error' && !/decodeAudioData|Unable to decode audio|EncodingError/.test(m.text())) R.errors.push('console: ' + m.text());
    if (untouched && /replay diverged/.test(m.text())) R.errors.push('Play of the Match replay diverged in an untouched match');
  });
  page.on('dialog', (d) => d.accept());
  let shot = 0;
  const snap = (name) => page.screenshot({ path: `${OUT}/${String(++shot).padStart(2, '0')}-${name}.png` });
  const go = async (q = '?test') => { await page.goto(BASE + q, { waitUntil: 'networkidle' }); await page.waitForTimeout(400); };
  // grid cells: the first tap previews (focus) and the second confirms; a cell that already has focus confirms at once
  const click = async (sel, twice = false) => { await page.click(sel); if (twice) { await page.waitForTimeout(80); if (await page.$(sel)) await page.click(sel); } await page.waitForTimeout(120); };
  const toMain = async () => { if (await page.$('.title')) { await page.click('.title'); await page.waitForTimeout(300); } await page.waitForSelector('.mm-list'); };
  const state = () => page.evaluate(() => { const a = window.__app, sc = a && a.scene; const S = sc && sc.S; return { scene: sc ? sc.state : null, phase: S ? S.phase : null, tick: S ? S.tick : 0, screen: document.querySelector('.screen') ? document.querySelector('.screen').className : null }; });
  const waitFor = async (fn, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(150); } R.failures.push('timeout: ' + label); console.log('  FAIL timeout ' + label); return false; };
  const fightReady = () => waitFor(() => { const s = window.__app.scene; return s && s.S && s.S.phase === 'fight' && s.S.fighters().every((f) => !f.onField || f.state !== 'enter'); }, 20000, 'fight start');
  // navigate the quick/tournament flow; picks the first two roster cells / trainers
  async function setup(mode, env, format, opts = {}) {
    await toMain();
    await click(mode === 'tour' ? '[data-go="tour"]' : '[data-go="quick"]');
    await click(`[data-env="${env}"]`);
    await click(`[data-f="${format}"]`);
    const cells = await page.$$eval('.grid [data-id]', (els) => els.map((e) => e.dataset.id));
    const mine = opts.mine || (format === 'pokemon' ? cells[0] : 'ash');
    await click(`.grid [data-id="${mine}"]`, true);
    if (mode === 'tour') {
      await page.waitForSelector('[data-n]'); await click(`[data-n="${opts.size || 4}"]`);
      await page.waitForSelector('[data-l]'); await click(`[data-l="${opts.level || 'easy'}"]`);
      return;
    }
    await page.waitForSelector('.grid [data-id="random"]');
    const opp = opts.opp || 'random';
    await click(`.grid [data-id="${opp}"]`, true);
    await page.waitForSelector('.maps [data-id]'); await click(`.maps [data-id="${opts.map || 'random'}"]`);
    await page.waitForSelector('[data-l]'); await click(`[data-l="${opts.level || 'normal'}"]`);
  }
  const waitResults = (ms = 180000) => waitFor(() => !!document.querySelector('.screen.results'), ms, 'results screen');

  // ------------------------------------------------------------------ screens tour
  await go('?test');
  await page.evaluate(() => localStorage.clear());
  await go('?test');
  await snap('title');
  await toMain(); await snap('main-menu');
  await click('[data-go="quick"]'); await snap('environment');
  await click('[data-env="water"]'); await snap('format');
  await click('[data-f="pokemon"]'); await page.waitForSelector('.grid'); await snap('fighter-select');
  await click('.grid [data-id="gyarados"]', true); await snap('opponent-select');
  await click('.grid [data-id="lapras"]', true); await snap('arena-select');
  await click('.maps [data-id="sootopolis"]'); await snap('difficulty');
  await click('[data-l="easy"]'); await page.waitForTimeout(150); await snap('loading');
  await page.waitForSelector('.vs', { timeout: 20000 }); await page.waitForTimeout(500); await snap('vs-intro');
  // skip the VS intro with ✕ (K)
  await page.keyboard.press('KeyK');
  await fightReady(); await page.waitForTimeout(600); await snap('battle-water');
  check((await state()).phase === 'fight', 'VS intro skips to the fight', R);
  // ------------------------------------------------------------------ touch controls
  const before = await page.evaluate(() => { const f = window.__app.scene.S.activeOf(0); return { moves: f.stats.moves, x: f.x, y: f.y, dodges: f.stats.dodges }; });
  const box = async (sel) => { const e = await page.$(sel); return e ? e.boundingBox() : null; };
  const tapAt = async (b) => { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
  const free = () => waitFor(() => { const S = window.__app.scene.S, f = S.activeOf(0); const o = S.activeOf(1); o.hitstun = Math.max(o.hitstun, 30); return f.canAct(); }, 5000, 'fighter free to act');
  // retry a few times: a projectile already in flight can still stagger the fighter right as the tap lands
  for (let i = 0; i < 4; i++) {
    await free(); await tapAt(await box('.t-cross')); await page.waitForTimeout(400);
    if (await page.evaluate((m) => window.__app.scene.S.activeOf(0).stats.moves > m, before.moves)) break;
  }
  // stick drag (pointer events on the stick zone)
  const sz = await box('.t-stickzone');
  if (sz) {
    await free();
    const cx = sz.x + sz.width * 0.35, cy = sz.y + sz.height * 0.6;
    await page.dispatchEvent('.t-stickzone', 'pointerdown', { pointerId: 7, clientX: cx, clientY: cy, pointerType: 'touch', isPrimary: true, bubbles: true });
    for (let i = 1; i <= 8; i++) { await page.dispatchEvent('.t-stickzone', 'pointermove', { pointerId: 7, clientX: cx + i * 6, clientY: cy - i * 2, pointerType: 'touch', isPrimary: true, bubbles: true }); await page.waitForTimeout(40); }
    await page.waitForTimeout(500);
    await page.dispatchEvent('.t-stickzone', 'pointerup', { pointerId: 7, clientX: cx + 48, clientY: cy - 16, pointerType: 'touch', isPrimary: true, bubbles: true });
  }
  await page.waitForTimeout(300);
  for (let i = 0; i < 4; i++) {
    await free(); await page.evaluate(() => { window.__app.scene.S.activeOf(0).stamina = 100; }); await tapAt(await box('.t-R')); await page.waitForTimeout(500);
    if (await page.evaluate((d) => window.__app.scene.S.activeOf(0).stats.dodges > d, before.dodges)) break;
  }
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { window.__app.scene.S.activeOf(0).ult = 100; });
    await free(); await tapAt(await box('.t-L')); await page.waitForTimeout(400);
    if (await page.evaluate(() => window.__app.scene.S.activeOf(0).stats.ults > 0)) break;
  }
  const after = await page.evaluate(() => { const f = window.__app.scene.S.activeOf(0); return { moves: f.stats.moves, x: f.x, y: f.y, dodges: f.stats.dodges, ults: f.stats.ults }; });
  const diag = after.moves > before.moves ? '' : await page.evaluate(() => { const S = window.__app.scene.S, f = S.activeOf(0), b = document.querySelector('.t-cross'), r = b && b.getBoundingClientRect(); const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return ` (phase ${S.phase}, state ${f.state}, stamina ${Math.round(f.stamina)}, button ${r ? Math.round(r.x) + ',' + Math.round(r.y) : 'missing'}, top ${top ? top.className : 'none'})`; });
  check(after.moves > before.moves, 'touch ✕ button starts a move' + diag, R);
  check(Math.hypot(after.x - before.x, after.y - before.y) > 8, 'touch stick moves the fighter', R);
  check(after.dodges > before.dodges, 'touch R dodges', R);
  check(after.ults >= 1, 'touch L fires the Ultimate / Mega', R);
  await page.waitForTimeout(900); await snap('battle-after-touch');
  // emotes
  await tapAt(await box('.t-emote')); await page.waitForTimeout(250);
  check(await page.$eval('.t-emotes', (e) => !e.hidden), 'SELECT opens the emote wheel', R);
  await snap('emote-wheel');
  const emo = await page.$('.t-emo'); if (emo) await tapAt(await emo.boundingBox());
  await page.waitForTimeout(300);
  // ------------------------------------------------------------------ pause
  await tapAt(await box('.t-start')); await page.waitForTimeout(300);
  check(!!(await page.$('[aria-label="Paused"]')), 'START pauses with a menu', R);
  const t1 = (await state()).tick; await page.waitForTimeout(600); const t2 = (await state()).tick;
  check(t1 === t2, 'the simulation is frozen while paused', R);
  await snap('pause-menu');
  await click('[data-a="settings"]'); await page.waitForTimeout(200); await snap('pause-settings');
  await page.keyboard.press('Backspace'); await page.waitForTimeout(250);
  await click('[data-a="rules"]'); await page.waitForTimeout(150); await snap('pause-rules');
  await click('[data-a="back"]'); await page.waitForTimeout(150);
  await click('[data-a="resume"]'); await page.waitForTimeout(500);
  check((await state()).tick > t2, 'resume continues the battle', R);
  // ------------------------------------------------------------------ KO skip + Play of the Match + results
  await page.evaluate(() => { const S = window.__app.scene.S; const o = S.activeOf(1); o.hp = 1; });
  await waitFor(() => { const S = window.__app.scene.S; const o = S.activeOf(1); const a = S.activeOf(0); if (S.phase === 'fight' && o.hp > 0) { o.x = a.x + Math.cos(a.aim) * 30; o.y = a.y + Math.sin(a.aim) * 30; o.flags = {}; } if (S.phase === 'fight') { const ip = window.__app.input; ip.tap('cross'); } return S.phase !== 'fight'; }, 15000, 'finishing blow');
  await page.waitForTimeout(400); await snap('ko-sequence');
  // Start after the deciding knockout skips instead of pausing (a pause there could throw the result away)
  await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  check(!(await page.evaluate(() => !!(window.__app.scene && window.__app.scene.paused))), 'Start after the final knockout skips instead of pausing', R);
  await page.keyboard.press('KeyK'); await page.waitForTimeout(300);
  await waitFor(() => { const sc = window.__app.scene; return (sc && (sc.state === 'potm' || sc.state === 'results')) || !!document.querySelector('.screen.results'); }, 15000, 'play of the match or results');
  if ((await state()).scene === 'potm') { await page.waitForTimeout(700); await snap('play-of-the-match'); await page.keyboard.press('KeyK'); }
  await waitResults(20000); await page.waitForTimeout(500); await snap('results');
  check(!!(await page.$('.res-banner.win')), 'KO win shows the Victory results', R);
  await click('[data-a="menu"]');
  // other screens
  await toMain(); await click('[data-go="settings"]'); await snap('settings');
  await page.keyboard.press('Backspace'); await page.waitForTimeout(150);
  await click('[data-go="controls"]'); await snap('controls'); await page.keyboard.press('Backspace'); await page.waitForTimeout(150);
  await click('[data-go="credits"]'); await snap('credits'); await page.keyboard.press('Backspace'); await page.waitForTimeout(150);

  // ------------------------------------------------------------------ switching (human trainer battle)
  await setup('quick', 'ground', 'trainer', { opp: 'brock' });
  await page.waitForSelector('.vs', { timeout: 20000 }); await page.keyboard.press('KeyK');
  await fightReady(); await page.waitForTimeout(700);
  const act0 = await page.evaluate(() => { const sd = window.__app.scene.S.sides[0]; return sd.team.indexOf(sd.active); });
  const balls = await page.$$('.t-switch .t-ball:not([disabled])');
  check(balls.length >= 1, 'switch strip shows benched Pokémon', R);
  await snap('trainer-battle');
  if (balls.length) await tapAt(await balls[0].boundingBox());
  await waitFor(() => { const sd = window.__app.scene.S.sides[0]; return sd.active && sd.active.state !== 'recalled' && sd.team.indexOf(sd.active) !== +document.body.dataset.e2eAct; }, 1, 'noop');
  await page.evaluate((a) => { document.body.dataset.e2eAct = a; }, act0);
  const switched = await waitFor(() => { const sd = window.__app.scene.S.sides[0]; return sd.team.indexOf(sd.active) !== +document.body.dataset.e2eAct && sd.active.onField; }, 6000, 'switch completes');
  check(switched, 'tapping a Poké Ball switches Pokémon', R);
  await page.waitForTimeout(500); await snap('after-switch');
  // restart from pause, then quit to the menu
  await tapAt(await box('.t-start')); await page.waitForTimeout(250);
  await click('[data-a="restart"]');
  await page.waitForSelector('.vs', { timeout: 20000 }); check(true, 'pause → Restart reloads the battle', R);
  await page.keyboard.press('KeyK'); await fightReady();
  await tapAt(await box('.t-start')); await page.waitForTimeout(250);
  await click('[data-a="quit"]'); await page.waitForTimeout(300);
  check(!!(await page.$('.mm-list')), 'pause → Quit returns to the main menu', R);

  // ------------------------------------------------------------------ the 6 quick combos (CPU plays your side, 24x speed)
  await go('?test&autoplay&speed=24');
  untouched = true;
  let potmSeen = 0;
  for (const env of ENVS) for (const format of FORMATS) {
    const t0 = Date.now();
    await setup('quick', env, format, { level: 'normal' });
    await page.waitForSelector('.vs', { timeout: 20000 }); await page.keyboard.press('KeyK');
    await page.evaluate(() => { window.__potm = 0; clearInterval(window.__potmWatch); window.__potmWatch = setInterval(() => { const sc = window.__app.scene; if (sc && sc.state === 'potm') window.__potm = 1; }, 30); });
    const ok = await waitResults(240000);
    potmSeen += await page.evaluate(() => window.__potm || 0);
    R.timings[`quick ${env} ${format}`] = Math.round((Date.now() - t0) / 1000) + ' s';
    check(ok, `quick ${env} ${format} plays to the results screen`, R);
    if (ok) { await page.waitForTimeout(300); await snap(`results-${env}-${format}`); await click('[data-a="menu"]'); }
    else await go('?test&autoplay&speed=24');
  }
  untouched = false;
  check(potmSeen >= 3, `Play of the Match replays the real ending (${potmSeen} of 6 quick matches; time-outs have none)`, R);
  // ------------------------------------------------------------------ the 6 tournament combos (4 entrants) with reload + resume
  for (const env of ENVS) for (const format of FORMATS) {
    const t0 = Date.now();
    await setup('tour', env, format, { size: 4, level: 'easy' });
    await page.waitForSelector('.bracket', { timeout: 10000 });
    let reloaded = false, guard = 0, champ = false;
    while (guard++ < 6) {
      const done = await page.$('[data-a="finish"]');
      if (done) { await snap(`bracket-done-${env}-${format}`); await click('[data-a="finish"]'); champ = !!(await page.$('.cup')); if (champ) { await page.waitForTimeout(400); await snap(`championship-${env}-${format}`); await click('[data-a="done"]'); } break; }
      await click('[data-a="next"]');
      await page.waitForSelector('.vs', { timeout: 20000 }); await page.keyboard.press('KeyK');
      if (!(await waitResults(300000))) break;
      await click('[data-a="continue"]'); await page.waitForSelector('.bracket');
      const active = await page.evaluate(() => window.__app.screens.store.read('tournament').status === 'active');
      if (!reloaded && active) {
        reloaded = true;
        const before2 = await page.evaluate(() => JSON.stringify(window.__app.screens.store.read('tournament').rounds.map((r) => r.map((m) => m.winner || ''))));
        await go('?test&autoplay&speed=24'); await toMain();
        const resume = await page.$('[data-go="resume"]');
        check(!!resume, `tournament ${env} ${format}: Resume appears after a reload`, R);
        if (!resume) break;
        await click('[data-go="resume"]'); await page.waitForSelector('.bracket');
        const after2 = await page.evaluate(() => JSON.stringify(window.__app.screens.store.read('tournament').rounds.map((r) => r.map((m) => m.winner || ''))));
        check(before2 === after2, `tournament ${env} ${format}: bracket state survives the reload`, R);
        if (env === 'ground' && format === 'pokemon') await snap('bracket-resumed');
      }
    }
    R.timings[`tour ${env} ${format}`] = Math.round((Date.now() - t0) / 1000) + ' s';
    check(await page.$('.mm-list') !== null || champ, `tournament ${env} ${format} runs to the end${champ ? ' (championship won)' : ''}`, R);
    await toMain();
  }

  // ------------------------------------------------------------------ saves: export / import / corruption
  await go('?test'); await toMain();
  const recBefore = await page.evaluate(() => JSON.stringify(window.__app.screens.store.read('records')));
  await click('[data-go="settings"]');
  const code = await page.$eval('#exp', (e) => e.value);
  check(/^ARENA1-/.test(code), 'export produces an ARENA1 save code', R);
  await click('[data-a="reset"]'); await page.waitForTimeout(300);
  const recReset = await page.evaluate(() => window.__app.screens.store.read('records').played);
  check(recReset === 0, 'Reset all data clears the records', R);
  await page.fill('#imp', code); await click('[data-a="import"]'); await page.waitForTimeout(300);
  const recAfter = await page.evaluate(() => JSON.stringify(window.__app.screens.store.read('records')));
  check(recAfter === recBefore, 'import restores the exported save exactly', R);
  const errsBefore = R.errors.length;
  await page.fill('#imp', 'ARENA1-garbage'); await click('[data-a="import"]'); await page.waitForTimeout(300);
  check(R.errors.length === errsBefore && (await page.evaluate(() => JSON.stringify(window.__app.screens.store.read('records')))) === recBefore, 'a bad import code is rejected and changes nothing', R);
  // a newer write, then a damaged main copy: the game must start and recover the previous copy from the backup
  await page.evaluate(() => { const st = window.__app.screens.store; const r = JSON.parse(JSON.stringify(st.read('records'))); r.played++; st.write('records', r); });
  await page.evaluate(() => { for (const k of ['records', 'settings', 'last']) localStorage.setItem('arena.' + k, '{"c":"x","b":"{broken'); });
  await go('?test'); await toMain();
  const recRecovered = await page.evaluate(() => JSON.stringify(window.__app.screens.store.read('records')));
  check(recRecovered === recBefore, 'a corrupt save recovers the previous copy from the backup', R);
  // corrupt both copies: defaults, no crash
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('arena.')) localStorage.setItem(k, '\u0000not json'); });
  await go('?test'); await toMain();
  check(!!(await page.$('.mm-list')), 'fully corrupt saves fall back to defaults and the menu still loads', R);
  await snap('menu-after-corruption');

  R.errors = [...new Set(R.errors)];
  for (const e of R.errors) R.failures.push(e);
  console.log(`${key}: ${R.passed.length} passed, ${R.failures.length} failed`);
  for (const f of R.failures) console.log('  - ' + f);
  report.failures.push(...R.failures.map((f) => key + ': ' + f));
  await browser.close();
}
writeFileSync('shots/e2e/report.json', JSON.stringify(report, null, 1));
process.exit(report.failures.length ? 1 : 0);
