// Screens: title, main menu, Quick Battle flow, fighter / trainer / opponent / map / difficulty select, loading,
// results, tournament (setup, bracket, championship), settings (incl. save export/import), controls, credits,
// and the pause menu. DOM UI with PlayStation glyph prompts; navigable by touch, keyboard and gamepad.
import { CONTENT, rawEffect, arenaEffect } from '../game/content.js';
import { ROSTER, ROLE_INFO } from '../content/species.js';
import { TRAINER_ORDER } from '../content/trainers.js';
import { MAPS_BY_ENV } from '../content/maps.js';
import { FEATURE_INFO } from '../game/features.js';
import { TYPE_COLORS } from '../core/util.js';
import { face, glyph, prompt, pill, shoulder, dpad, nub, SLOT_BUTTON } from './glyphs.js';
import { BattleScene } from '../modes/battle.js';
import { TRAV_LABEL } from './touch.js';
import { createTournament, currentMatch, recordResult, tourStep, pendingSims, roundName, ROUND_NAMES } from '../modes/tournament.js';
import { confetti } from '../render/pixelart.js';
import { VERSION } from '../version.js';

const ENV_INFO = {
  ground: { name: 'Ground', blurb: 'Snappy footwork, obstacles and wall slams.', thumb: 'bell_tower' },
  water: { name: 'Water', blurb: 'Glide and drift across the surface.', thumb: 'sootopolis' },
  air: { name: 'Air', blurb: 'Fly high over far-away lands.', thumb: 'sky_pillar' },
};
const LEVELS = { easy: 'Slower reactions, gentler attacks.', normal: 'A fair fight.', hard: 'Fast reactions, perfect dodges, no mercy.' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chips = (types) => `<span class="chips">${types.map((t) => `<span class="chip" style="background:${TYPE_COLORS[t]}">${t.toUpperCase()}</span>`).join('')}</span>`;
const portrait = (sprite, size = 40) => `<i class="pi" style="display:inline-block;width:${size}px;height:${size}px;background:url(assets/fighters/${sprite}-portraits.png) 0 0/auto ${size}px;image-rendering:pixelated;border-radius:3px"></i>`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Screens {
  constructor(app) { this.app = app; this.cfg = null; }
  get store() { return this.app.store; }
  // ------------------------------------------------------------------------------------------------ title
  title() {
    this.app.scene = null;
    const el = this.app.setScreen(`<div class="screen title">
      <div class="art" style="background-image:url(assets/ui/title.png)"></div><div class="shade"></div>
      <div class="logo"><div class="k">Pokémon</div><div class="n">Arena</div><div class="s">Real-time battles at the stadium, on the water and in the sky.</div></div>
      <button class="tap nav" aria-label="Start">${face('cross', 26)} Tap to start</button></div>`);
    const go = () => { this.app.audio.unlock(); this.app.audio.play('menu_Confirm'); this.main(); };
    el.addEventListener('click', go);
    this.app.audio.playMusic('Title');
  }
  // saves may name content that no longer exists (an older or edited save): repair instead of crashing
  sanitizeSaves() {
    const last = this.store.read('last'), D = { env: 'ground', format: 'pokemon', fighter: 'charizard', trainer: 'ash', opponent: 'random', map: 'random', level: 'normal', size: 8 };
    let dirty = false;
    const fix = (k, ok) => { if (!ok) { last[k] = D[k]; dirty = true; } };
    fix('env', ROSTER[last.env]); fix('format', last.format === 'pokemon' || last.format === 'trainer');
    fix('fighter', CONTENT.species[last.fighter] && ROSTER[last.env].includes(last.fighter));
    if (!ROSTER[last.env].includes(last.fighter)) { last.fighter = ROSTER[last.env][0]; dirty = true; }
    fix('trainer', CONTENT.trainers[last.trainer]);
    fix('opponent', last.opponent === 'random' || CONTENT.species[last.opponent] || CONTENT.trainers[last.opponent]);
    fix('map', last.map === 'random' || (CONTENT.maps[last.map] && MAPS_BY_ENV[last.env].includes(last.map)));
    fix('level', ['easy', 'normal', 'hard'].includes(last.level)); fix('size', [4, 8, 16].includes(last.size));
    if (dirty) this.store.write('last', last);
    const T = this.store.read('tournament');
    if (T) {
      const ok = T.rounds && ROSTER[T.env] && T.rounds.every((r) => r.every((m) => [m.a, m.b].every((e) => !e || (e.team && e.team.every((id) => CONTENT.species[id]) && CONTENT.species[e.icon]))));
      if (!ok) { this.store.remove('tournament'); this.app.toast('An old tournament save couldn\'t be loaded and was cleared.'); }
    }
    return last;
  }
  // ------------------------------------------------------------------------------------------------ main menu
  main() {
    this.app.scene = null;
    this.app.audio.playMusic('Title'); this.app.audio.stopAmbience();
    const last = this.sanitizeSaves(), T = this.store.read('tournament');
    const lastLabel = last.format === 'pokemon' ? `${CONTENT.species[last.fighter].name} vs ${last.opponent === 'random' ? 'a random rival' : CONTENT.species[last.opponent] ? CONTENT.species[last.opponent].name : 'a random rival'}` : `${CONTENT.trainers[last.trainer].name}'s team vs ${last.opponent === 'random' || !CONTENT.trainers[last.opponent] ? 'a random trainer' : CONTENT.trainers[last.opponent].name}`;
    const rec = this.store.read('records');
    const el = this.app.setScreen(`<div class="screen mainmenu">
      <div class="mm-art" style="background-image:url(assets/ui/title.png)"><div class="badge">Arena</div></div>
      <div class="mm-list">
        <button class="mm-item quick nav" data-go="again">Fight again<small>${esc(lastLabel)} · ${ENV_INFO[last.env].name}</small></button>
        <button class="mm-item nav" data-go="quick">Quick Battle<small>Pick a fighter or a trainer and battle now</small></button>
        ${T && T.status === 'active' ? `<button class="mm-item nav" data-go="resume">Resume tournament<small>${esc(roundName(T))} · ${ENV_INFO[T.env].name} · ${T.format === 'pokemon' ? 'Pokémon' : 'Trainer'} Battle</small></button>` : ''}
        <button class="mm-item nav" data-go="tour">Tournament<small>A full bracket, with a championship at the end</small></button>
        <button class="mm-item nav" data-go="settings">Settings</button>
        <button class="mm-item nav" data-go="controls">Controls</button>
        <button class="mm-item nav" data-go="credits">Credits</button>
        <div class="mm-foot">${rec.wins} wins · ${rec.losses} losses · ${rec.championships} championships · v${VERSION}</div>
      </div></div>`, { back: () => this.title() });
    for (const b of el.querySelectorAll('[data-go]')) b.addEventListener('click', () => {
      const g = b.dataset.go;
      if (g === 'again') this.launchQuick(Object.assign({ mode: 'quick' }, last));
      else if (g === 'quick') this.envStep({ mode: 'quick', ...last });
      else if (g === 'tour') this.envStep({ mode: 'tour', ...last, size: last.size || 8 });
      else if (g === 'resume') this.bracket();
      else if (g === 'settings') this.settings(() => this.main());
      else if (g === 'controls') this.controls(() => this.main());
      else if (g === 'credits') this.credits(() => this.main());
    });
  }
  bar(title, crumbs, extra = '') {
    return `<div class="topbar"><h1>${title}</h1><span class="crumbs">${crumbs || ''}</span><span class="spacer"></span>${extra}</div>`;
  }
  footer(fightNow = true) {
    return `<div class="bottombar">${prompt([['cross', 'Select'], ['circle', 'Back']])}<span class="spacer"></span>${fightNow ? `<button class="plate primary nav" data-key="start">${pill('START', 20)} Fight now</button>` : ''}</div>`;
  }
  crumbs(c) {
    const parts = [ENV_INFO[c.env].name, c.format === 'pokemon' ? 'Pokémon Battle' : 'Trainer Battle'];
    return (c.mode === 'tour' ? 'Tournament · ' : 'Quick Battle · ') + parts.join(' · ');
  }
  wireFightNow(el, c) { const b = el.querySelector('[data-key="start"]'); if (b) b.addEventListener('click', () => (c.mode === 'tour' ? this.launchTour(c) : this.launchQuick(c))); }
  // ------------------------------------------------------------------------------------------------ steps
  envStep(c) {
    this.cfg = c;
    const el = this.app.setScreen(`<div class="screen">${this.bar(c.mode === 'tour' ? 'Tournament' : 'Quick Battle', 'Choose where to battle')}
      <div class="cards">${Object.entries(ENV_INFO).map(([k, v]) => `<button class="card nav" data-env="${k}" style="background-image:url(assets/maps/${v.thumb}-thumb.png)"><b>${v.name}</b><span>${v.blurb}</span><span>${ROSTER[k].length} fighters · 4 arenas</span></button>`).join('')}</div>
      ${this.footer(false)}</div>`, { back: () => this.main(), focus: `[data-env="${c.env}"]` });
    for (const b of el.querySelectorAll('[data-env]')) b.addEventListener('click', () => { if (c.env !== b.dataset.env) { c.env = b.dataset.env; c.fighter = ROSTER[c.env].includes(c.fighter) ? c.fighter : ROSTER[c.env][0]; c.opponent = 'random'; c.map = 'random'; } this.formatStep(c); });
  }
  formatStep(c) {
    this.cfg = c;
    const el = this.app.setScreen(`<div class="screen">${this.bar('Format', this.crumbs(c))}
      <div class="cards">
        <button class="card nav" data-f="pokemon" style="background-image:url(assets/maps/${MAPS_BY_ENV[c.env][1]}-thumb.png)"><b>Pokémon Battle</b><span>One on one. 99-second clock.</span></button>
        <button class="card nav" data-f="trainer" style="background-image:url(assets/maps/${MAPS_BY_ENV[c.env][2]}-thumb.png)"><b>Trainer Battle</b><span>Three on three, one at a time. Switch Pokémon mid-battle. 4-minute clock.</span></button>
      </div>${this.footer(false)}</div>`, { back: () => this.envStep(c), focus: `[data-f="${c.format}"]` });
    for (const b of el.querySelectorAll('[data-f]')) b.addEventListener('click', () => { c.format = b.dataset.f; if (c.format === 'pokemon') this.fighterStep(c); else this.trainerStep(c); });
  }
  // fighter grid + detail pane (shared by "you" and "opponent")
  fighterStep(c, opponent = false) {
    this.cfg = c;
    const roster = ROSTER[c.env];
    const cur = opponent ? c.opponent : c.fighter;
    const vs = opponent ? c.fighter : (c.opponent !== 'random' && roster.includes(c.opponent) ? c.opponent : null);
    const cells = (opponent ? `<button class="cell random nav" data-id="random" data-hover="1">?<span class="nm">Random</span></button>` : '') + roster.map((id) => { const s = CONTENT.species[id]; return `<button class="cell nav" data-id="${id}" data-hover="1" style="--tc:${TYPE_COLORS[s.types[0]]}">${portrait(s.sprite)}<span class="nm">${s.name}</span></button>`; }).join('');
    const title = opponent ? 'Opponent' : c.mode === 'tour' ? 'Your fighter' : 'Your fighter';
    const el = this.app.setScreen(`<div class="screen">${this.bar(title, this.crumbs(c))}
      <div class="select"><div class="grid">${cells}</div><div class="detail" id="detail"></div></div>${this.footer(true)}</div>`,
    { back: () => (opponent ? this.fighterStep(c) : this.formatStep(c)), focus: `[data-id="${cur || roster[0]}"]` });
    const det = el.querySelector('#detail');
    const show = (id) => { det.innerHTML = id === 'random' ? `<div class="hero"><div class="who"><b>Random</b><span class="role">A surprise opponent from the ${ENV_INFO[c.env].name} roster</span></div></div>` : this.detailHtml(id, opponent ? c.fighter : vs, opponent); this.app.paintSprites(det); };
    for (const b of el.querySelectorAll('[data-id]')) {
      b.addEventListener('focusnav', () => show(b.dataset.id));
      b.addEventListener('pointerenter', () => show(b.dataset.id));
      b.addEventListener('click', () => {
        if (this.app.focused !== b) { this.app.focus(b); show(b.dataset.id); return; }   // first tap previews, second confirms
        if (opponent) { c.opponent = b.dataset.id; c.mode === 'tour' ? this.levelStep(c) : this.mapStep(c); }
        else { c.fighter = b.dataset.id; c.mode === 'tour' ? this.sizeStep(c) : this.fighterStep(c, true); }
      });
    }
    show(cur && (cur === 'random' || roster.includes(cur)) ? cur : roster[0]);
    this.wireFightNow(el, c);
  }
  detailHtml(id, vsId, opponent) {
    const s = CONTENT.species[id], vs = vsId && CONTENT.species[vsId];
    const moves = s.kit.map((mid, i) => {
      const m = CONTENT.moves[mid];
      let tag = '';
      if (vs && m.power > 0) { let raw = rawEffect(m.type, vs.types); if (m.dual) raw *= rawEffect(m.dual, vs.types); if (m.type === 'Ground' && (vs.levitate || this.cfg && this.cfg.env === 'air')) raw = 0; const e = arenaEffect(raw); tag = e === 0 ? '<span class="tag no">NO EFFECT</span>' : e > 1 ? '<span class="tag se">SUPER</span>' : e < 1 ? '<span class="tag nve">RESISTED</span>' : ''; }
      return `<div class="mv">${face(SLOT_BUTTON[i], 20)}<div><b style="color:${TYPE_COLORS[m.type]}">${m.name}</b>${tag}<br><em>${m.tier === 'sig' ? 'Signature · ' : ''}${m.cost} stamina · ${esc(m.desc || '')}</em></div></div>`;
    }).join('');
    const ult = CONTENT.moves[s.ult];
    const mega = s.mega ? `${s.mega.primal ? 'Primal Reversion' : 'Mega Evolves'} into ${s.mega.name}, then ` : '';
    const trav = s.trav ? `<div class="trav">${shoulder('R', 16)} ${TRAV_LABEL[s.trav] || ''}: ${esc(TRAV_TEXT[s.trav] || '')}</div>` : '';
    return `<div class="hero"><canvas class="big" data-sprite="${s.sprite}" data-anim="${this.cfg && this.cfg.env === 'air' ? 'Walk' : 'Idle'}"></canvas><div class="who"><b>${s.name}</b><span class="role">${s.role} — ${ROLE_INFO[s.role.split('/')[0]] || ''}</span>${chips(s.types)}</div></div>
      <div class="moves">${moves}</div>
      <div class="ult">${shoulder('L', 16)} Ultimate: ${mega}${esc(ult ? ult.name : '')}</div>${trav}${vs ? `<div class="trav" style="color:#b9b0d6">Matchup tags: ${opponent ? 'its' : 'your'} moves against ${vs.name}.</div>` : ''}`;
  }
  trainerStep(c, opponent = false) {
    this.cfg = c;
    const cur = opponent ? c.opponent : c.trainer;
    const cells = (opponent ? `<button class="cell random nav" data-id="random" data-hover="1">?<span class="nm">Random</span></button>` : '') + TRAINER_ORDER.map((k) => { const t = CONTENT.trainers[k]; return `<button class="cell nav" data-id="${k}" data-hover="1" style="--tc:${t.color}"><img src="assets/trainers/${t.portrait}.png" alt=""><span class="nm">${t.name}</span></button>`; }).join('');
    const el = this.app.setScreen(`<div class="screen">${this.bar(opponent ? 'Opponent trainer' : 'Your trainer', this.crumbs(c))}
      <div class="select"><div class="grid">${cells}</div><div class="detail" id="detail"></div></div>${this.footer(true)}</div>`,
    { back: () => (opponent ? this.trainerStep(c) : this.formatStep(c)), focus: `[data-id="${cur || 'ash'}"]` });
    const det = el.querySelector('#detail');
    const show = (k) => {
      if (k === 'random') { det.innerHTML = `<div class="hero"><div class="who"><b>Random</b><span class="role">A surprise trainer</span></div></div>`; return; }
      const t = CONTENT.trainers[k], team = t.teams[c.env];
      det.innerHTML = `<div class="hero"><img class="tportrait" src="assets/trainers/${t.portrait}.png" alt=""><div class="who"><b>${t.name}</b><span class="role">${t.title}</span><div class="trav">${esc(t.intro)}</div></div></div>
        <div class="team">${team.map((id) => `<canvas data-sprite="${CONTENT.species[id].sprite}"></canvas>`).join('')}</div>
        <div class="moves">${team.map((id) => { const s = CONTENT.species[id]; return `<div class="mv"><div><b>${s.name}</b> ${chips(s.types)}<em>${s.role}</em></div></div>`; }).join('')}</div>`;
      this.app.paintSprites(det);
    };
    for (const b of el.querySelectorAll('[data-id]')) {
      b.addEventListener('focusnav', () => show(b.dataset.id)); b.addEventListener('pointerenter', () => show(b.dataset.id));
      b.addEventListener('click', () => {
        if (this.app.focused !== b) { this.app.focus(b); show(b.dataset.id); return; }
        if (opponent) { c.opponent = b.dataset.id; c.mode === 'tour' ? this.levelStep(c) : this.mapStep(c); }
        else { c.trainer = b.dataset.id; c.mode === 'tour' ? this.sizeStep(c) : this.trainerStep(c, true); }
      });
    }
    show(cur && CONTENT.trainers[cur] ? cur : opponent ? 'random' : 'ash');
    this.wireFightNow(el, c);
  }
  mapStep(c) {
    this.cfg = c;
    const ids = MAPS_BY_ENV[c.env];
    const el = this.app.setScreen(`<div class="screen">${this.bar('Arena', this.crumbs(c))}
      <div class="maps"><button class="mapc random nav" data-id="random"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div><b>Random</b><span>Any of the four ${ENV_INFO[c.env].name.toLowerCase()} arenas</span></div></button>
      ${ids.map((id) => { const m = CONTENT.maps[id]; return `<button class="mapc nav" data-id="${id}"><img src="assets/maps/${id}-thumb.png" alt=""><div><b>${m.name}</b><span>${m.region} · ${esc(m.feature ? FEATURE_INFO[m.feature] : 'A roaring crowd cheers every big hit.')}</span></div></button>`; }).join('')}</div>
      ${this.footer(true)}</div>`, { back: () => (c.format === 'pokemon' ? this.fighterStep(c, true) : this.trainerStep(c, true)), focus: `[data-id="${c.map || 'random'}"]` });
    for (const b of el.querySelectorAll('[data-id]')) b.addEventListener('click', () => { c.map = b.dataset.id; this.levelStep(c); });
    this.wireFightNow(el, c);
  }
  sizeStep(c) {
    this.cfg = c;
    const el = this.app.setScreen(`<div class="screen">${this.bar('Bracket size', this.crumbs(c))}
      <div class="cards">${[4, 8, 16].map((n) => `<button class="card nav" data-n="${n}" style="background-image:url(assets/maps/${MAPS_BY_ENV[c.env][n === 4 ? 0 : n === 8 ? 1 : 3]}-thumb.png)"><b>${n} entrants</b><span>${ROUND_NAMES[n].length} rounds: ${ROUND_NAMES[n].join(', ')}</span></button>`).join('')}</div>${this.footer(true)}</div>`,
    { back: () => (c.format === 'pokemon' ? this.fighterStep(c) : this.trainerStep(c)), focus: `[data-n="${c.size || 8}"]` });
    for (const b of el.querySelectorAll('[data-n]')) b.addEventListener('click', () => { c.size = +b.dataset.n; this.levelStep(c); });
    this.wireFightNow(el, c);
  }
  levelStep(c) {
    this.cfg = c;
    const el = this.app.setScreen(`<div class="screen">${this.bar('CPU difficulty', this.crumbs(c))}
      <div class="cards">${Object.entries(LEVELS).map(([k, v]) => `<button class="card nav" data-l="${k}" style="background-image:url(assets/maps/${MAPS_BY_ENV[c.env][k === 'easy' ? 0 : k === 'normal' ? 2 : 3]}-thumb.png)"><b>${k[0].toUpperCase() + k.slice(1)}</b><span>${v}</span></button>`).join('')}</div>${this.footer(false)}</div>`,
    { back: () => (c.mode === 'tour' ? this.sizeStep(c) : this.mapStep(c)), focus: `[data-l="${c.level || 'normal'}"]` });
    for (const b of el.querySelectorAll('[data-l]')) b.addEventListener('click', () => { c.level = b.dataset.l; c.mode === 'tour' ? this.launchTour(c) : this.launchQuick(c); });
  }
  // ------------------------------------------------------------------------------------------------ launching battles
  rememberLast(c) { const last = this.store.read('last'); Object.assign(last, { env: c.env, format: c.format, fighter: c.fighter, trainer: c.trainer, opponent: c.opponent, map: c.map, level: c.level, size: c.size || last.size }); this.store.write('last', last); }
  buildSetup(c) {
    const roster = ROSTER[c.env];
    if (!roster.includes(c.fighter)) c.fighter = roster[0];
    const map = !c.map || c.map === 'random' || !MAPS_BY_ENV[c.env].includes(c.map) ? pick(MAPS_BY_ENV[c.env]) : c.map;
    const seed = (Math.random() * 2 ** 31) >>> 0;
    if (c.format === 'pokemon') {
      const opp = c.opponent && c.opponent !== 'random' && roster.includes(c.opponent) ? c.opponent : pick(roster.filter((x) => x !== c.fighter));
      return { env: c.env, format: 'pokemon', map, seed, sides: [{ team: [c.fighter], control: 'human' }, { team: [opp], control: 'cpu', level: c.level || 'normal' }] };
    }
    const me = CONTENT.trainers[c.trainer] ? c.trainer : 'ash';
    const opp = c.opponent && CONTENT.trainers[c.opponent] ? c.opponent : pick(TRAINER_ORDER.filter((k) => k !== me));
    return { env: c.env, format: 'trainer', map, seed, sides: [{ team: CONTENT.trainers[me].teams[c.env].slice(), trainer: me, control: 'human' }, { team: CONTENT.trainers[opp].teams[c.env].slice(), trainer: opp, control: 'cpu', level: c.level || 'normal' }] };
  }
  launchQuick(c) { this.cfg = c; this.rememberLast(c); this.runBattle(this.buildSetup(c), { kind: 'quick', cfg: c }); }
  async runBattle(setup, ctx) {
    this.app.audio.unlock();
    if (this.app.test && this.app.test.autoplay) { setup = JSON.parse(JSON.stringify(setup)); setup.sides[0].control = 'cpu'; setup.sides[0].level = 'hard'; setup.sides[0].auto = true; }
    const tips = ['Every move costs stamina. Light moves are free to repeat; signature moves need a breather.', 'Dodge just before a hit lands for a perfect dodge and a stronger counter.', 'Knock a foe into a wall for bonus wall-slam damage.', 'In the last 30 seconds stamina regenerates twice as fast.', 'Fill the Ultimate ring with damage, then press L.', 'Type matchups matter: super effective hits deal 1.5×.'];
    const el = this.app.setScreen(`<div class="screen loading"><h2>${CONTENT.maps[setup.map].name}</h2><div class="bar"><i></i></div><div class="tip">${pick(tips)}</div></div>`);
    const bar = el.querySelector('.bar i');
    this.app.audio.musicOff();
    const scene = new BattleScene(this.app, setup, {
      restart: () => { scene.destroy(); setup.seed = (Math.random() * 2 ** 31) >>> 0; this.runBattle(setup, ctx); },
      quit: () => {
        this.app.scene = null;
        if (ctx.kind === 'tour') { this.recordTour(false); this.afterTourMatch(); }   // quitting a tournament match is a forfeit
        else this.main();
      },
      finished: (info) => this.results(info, setup, ctx),
    });
    try { await scene.load((p) => { bar.style.width = Math.round(p * 100) + '%'; }); }
    catch (e) { this.app.toast('Couldn\'t load the battle: ' + e.message); this.main(); return; }
    this.app.clearScreen();
    this.app.scene = scene;
    scene.begin();
  }
  // ------------------------------------------------------------------------------------------------ results
  results(info, setup, ctx) {
    const S = info.sim, me = info.me;
    const rec = this.store.read('records');
    rec.played++;
    if (info.draw) rec.draws++; else if (info.won) rec.wins++; else rec.losses++;
    for (const f of S.sides[me].team) { const r = rec.byFighter[f.id] || (rec.byFighter[f.id] = { w: 0, l: 0 }); if (info.won) r.w++; else if (!info.draw) r.l++; }
    this.store.write('records', rec);
    // tournament: save the result now (the app can be closed on this screen), then resolve the CPU matches
    if (ctx.kind === 'tour' && !ctx.recorded) { ctx.recorded = true; this.recordTour(info.won || (info.draw && Math.random() < 0.5)); }
    const winSide = S.result && S.result.winner >= 0 ? S.sides[S.result.winner] : null;
    const star = winSide ? (winSide.team.find((f) => f.alive) || winSide.team[0]) : S.sides[me].team[0];
    const reason = { ko: 'by knockout', time: 'on time — higher HP percentage', sudden: 'in sudden death', draw: 'Draw — no one landed a hit in sudden death' }[S.result ? S.result.reason : 'draw'] || '';
    const rows = [];
    for (const [i, sd] of S.sides.entries()) for (const f of sd.team) rows.push(`<tr class="${i === me ? 'me' : ''}"><td>${f.sp.name}${f.form === 'mega' ? ' (Mega)' : ''}</td><td>${f.stats.dealt}</td><td>${f.stats.hits}</td><td>${f.stats.se}</td><td>${f.stats.perfect}</td><td>${f.stats.ults}</td><td>${Math.max(0, f.hp)}/${f.maxHp}</td></tr>`);
    const isTour = ctx.kind === 'tour';
    const el = this.app.setScreen(`<div class="screen results">
      <div class="res-left"><div class="res-banner ${info.draw ? 'draw' : info.won ? 'win' : 'lose'}">${info.draw ? 'Draw' : info.won ? 'Victory' : 'Defeat'}</div>
        <canvas data-sprite="${star.spriteId}" data-anim="${star.meta && star.meta.anims.Pose ? 'Pose' : 'Idle'}"></canvas>
        <div class="res-reason">${winSide ? `${winSide.trainer ? CONTENT.trainers[winSide.trainer].name + ' wins ' : star.sp.name + ' wins '}` : ''}${reason}</div></div>
      <div class="res-right"><h2>Battle stats</h2><table class="stats"><tr><th>Pokémon</th><th>Damage</th><th>Hits</th><th>Super eff.</th><th>Perfect dodges</th><th>Ultimates</th><th>HP</th></tr>${rows.join('')}</table>
        <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">${isTour ? `<button class="plate primary nav" data-a="continue">${face('cross', 20)} Continue</button>` : `<button class="plate primary nav" data-a="rematch">${face('cross', 20)} Rematch</button><button class="plate nav" data-a="change" data-key="square">${face('square', 20)} Change setup</button>`}<button class="plate nav" data-a="menu">${face('circle', 20)} ${isTour ? 'Bracket' : 'Main menu'}</button></div>
      </div></div>`, { back: () => (isTour ? this.afterTourMatch(info) : this.main()) });
    this.app.scene = null;
    this.app.audio.playMusic('Aftermath');
    for (const b of el.querySelectorAll('[data-a]')) b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'rematch') { setup.seed = (Math.random() * 2 ** 31) >>> 0; this.runBattle(setup, ctx); }
      else if (a === 'change') this.fighterOrTrainer(ctx.cfg);
      else if (a === 'continue') this.afterTourMatch(info);
      else if (isTour) this.afterTourMatch(info);
      else this.main();
    });
  }
  fighterOrTrainer(c) { this.cfg = c; c.format === 'pokemon' ? this.fighterStep(c) : this.trainerStep(c); }
  // ------------------------------------------------------------------------------------------------ tournament
  launchTour(c) {
    this.cfg = c; this.rememberLast(c);
    const T = createTournament({ env: c.env, format: c.format, size: c.size || 8, fighter: c.fighter, trainer: c.trainer || 'ash', level: c.level || 'normal', seed: (Math.random() * 2 ** 31) >>> 0 });
    this.store.write('tournament', T);
    this.bracket();
  }
  bracket() {
    const T = this.store.read('tournament');
    if (!T) { this.main(); return; }
    this.app.audio.playMusic('Champion Road'); this.app.audio.stopAmbience();
    const m = currentMatch(T);
    const ent = (e, mm) => { if (!e) return `<div class="be">—</div>`; const side = mm.a === e ? 'a' : 'b'; const st = mm.winner ? (mm.winner === side ? 'win' : 'lose') : ''; return `<div class="be ${e.you ? 'you' : ''} ${st}">${portrait(CONTENT.species[e.icon].sprite, 22)}${esc(e.name)}</div>`; };
    const cols = T.rounds.map((r, i) => `<div class="round"><h3>${ROUND_NAMES[T.size][i]}</h3><div class="rm">${r.map((mm) => `<div class="bm ${mm === m ? 'cur' : ''}">${ent(mm.a, mm)}${ent(mm.b, mm)}</div>`).join('')}</div></div>`).join('');
    const done = T.status === 'done';
    const youChamp = done && T.champion && T.champion.you;
    const head = done ? (youChamp ? 'You are the champion!' : `${T.champion.name} won the tournament`) : T.youOut ? 'Eliminated' : `${roundName(T)}${roundName(T) === 'Final' ? '' : ''}`;
    const el = this.app.setScreen(`<div class="screen">${this.bar('Tournament', `${ENV_INFO[T.env].name} · ${T.format === 'pokemon' ? 'Pokémon Battle' : 'Trainer Battle'} · ${T.size} entrants · ${T.level}`, `<h2>${esc(head)}</h2>`)}
      <div class="bracket">${cols}</div>
      <div class="bottombar">${prompt([['cross', done ? 'Finish' : 'Next match'], ['circle', 'Main menu']])}<span class="spacer"></span>
      ${done ? `<button class="plate primary nav" data-a="finish">${face('cross', 20)} ${youChamp ? 'Championship' : 'Finish'}</button>` : `<button class="plate primary nav" data-a="next">${face('cross', 20)} ${m ? 'Battle: ' + esc(m.a.you ? m.b.name : m.a.name) : 'Continue'}</button>`}
      <button class="plate nav" data-a="quit" data-key="triangle">${face('triangle', 20)} Abandon</button></div></div>`, { back: () => this.main() });
    el.querySelector('[data-a="quit"]').addEventListener('click', () => { if (confirm('Abandon this tournament? Progress will be lost.')) { this.store.remove('tournament'); this.main(); } });
    const nx = el.querySelector('[data-a="next"]'), fin = el.querySelector('[data-a="finish"]');
    if (nx) nx.addEventListener('click', () => this.playTourMatch());
    if (fin) fin.addEventListener('click', () => { if (youChamp) this.championship(T); else { this.store.remove('tournament'); this.main(); } });
  }
  playTourMatch() {
    const T = this.store.read('tournament'), m = currentMatch(T);
    if (!m) { if (T.youOut || T.status === 'done') { this.bracket(); return; } }
    const youA = m.a.you, me = youA ? m.a : m.b, them = youA ? m.b : m.a;
    const final = roundName(T) === 'Final';
    const setup = { env: T.env, format: T.format, map: m.map, seed: m.seed, title: roundName(T), music: final ? 'Final Battle' : null, tour: true,
      sides: [{ team: me.team.slice(), trainer: me.trainer || null, control: 'human' }, { team: them.team.slice(), trainer: them.trainer || null, control: 'cpu', level: T.level }] };
    this.runBattle(setup, { kind: 'tour' });
  }
  recordTour(won) {
    const T = this.store.read('tournament'); if (!T || T.status !== 'active') return;
    recordResult(T, won);
    this.store.write('tournament', T);
  }
  // resolve the other matches in small slices (saving after each) so the UI never freezes, then show the bracket
  afterTourMatch() {
    const T = this.store.read('tournament'); if (!T) { this.main(); return; }
    const total = pendingSims(T);
    const el = total > 0 ? this.app.setScreen(`<div class="screen loading"><h2>Other matches</h2><div class="bar"><i></i></div><div class="tip">Simulating the rest of the round…</div></div>`) : null;
    let done = 0;
    const slice = () => {
      const t0 = performance.now();
      let st;
      do { st = tourStep(T); if (st === 'sim') done++; } while ((st === 'sim' || st === 'advanced') && performance.now() - t0 < 30);
      this.store.write('tournament', T);
      if (el) el.querySelector('.bar i').style.width = Math.round(100 * done / Math.max(1, total)) + '%';
      if (st === 'sim' || st === 'advanced') { setTimeout(slice, 0); return; }
      if (T.status === 'done' && T.champion && T.champion.you && !T.counted) { T.counted = true; this.store.write('tournament', T); const rec = this.store.read('records'); rec.championships++; this.store.write('records', rec); }
      this.bracket();
    };
    slice();
  }
  championship(T) {
    const champ = T.champion;
    const team = champ.team.map((id) => `<canvas data-sprite="${CONTENT.species[id].sprite}" data-anim="${'Pose'}" style="width:120px;height:110px"></canvas>`).join('');
    const el = this.app.setScreen(`<div class="screen champion"><canvas id="confetti"></canvas>
      <div class="cup">Champion!</div><h2>${esc(champ.name)} won the ${ENV_INFO[T.env].name} ${T.format === 'pokemon' ? 'Pokémon' : 'Trainer'} Cup</h2>
      <div class="team" style="justify-content:center">${team}</div>
      <div class="bottombar" style="justify-content:center"><button class="plate gold nav" data-a="done">${face('cross', 20)} Back to the menu</button></div></div>`, { back: () => this.main() });
    this.app.audio.playMusic('Summit');
    this.app.audio.play('fanfare_Promotion');
    // pixel confetti: authored 2x3 pixel sprites falling in steps
    const cv = el.querySelector('#confetti'), x = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(cv.clientWidth * dpr / 3); cv.height = Math.round(cv.clientHeight * dpr / 3);
    const bits = Array.from({ length: 140 }, (_, i) => ({ x: Math.random() * cv.width, y: -Math.random() * cv.height, v: 0.4 + Math.random() * 0.8, k: i % 6, w: Math.random() * 6 }));
    const tick = () => { if (!cv.isConnected) return; x.clearRect(0, 0, cv.width, cv.height); for (const b of bits) { b.y += b.v; b.x += Math.sin((b.y + b.w * 20) / 14) * 0.4; if (b.y > cv.height) b.y = -4; x.drawImage(confetti(b.k + ((b.y >> 3) & 1) * 6), Math.round(b.x), Math.round(b.y)); } requestAnimationFrame(tick); };
    el.querySelector('[data-a="done"]').addEventListener('click', () => { this.store.remove('tournament'); this.main(); });
    tick();
  }
  // ------------------------------------------------------------------------------------------------ settings
  settings(back) {
    const s = this.app.settings;
    const tog = (k, label) => `<div class="field nav" data-tog="${k}" tabindex="0"><span>${label}</span><span class="toggle ${s[k] ? 'on' : ''}"></span></div>`;
    const rng = (k, label, min, max, step) => `<label class="field"><span>${label}</span><input class="nav" type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-rng="${k}"></label>`;
    const el = this.app.setScreen(`<div class="screen">${this.bar('Settings', 'Saved automatically')}
      <div class="form">
        ${rng('music', 'Music volume', 0, 1, 0.05)}${rng('sfx', 'Sound effects volume', 0, 1, 0.05)}
        ${tog('lowHpBeep', 'Low-HP warning beep')}${tog('leftHanded', 'Left-handed touch controls')}
        <div class="field"><span>Touch button size</span><span class="seg">${[0.85, 1, 1.15].map((v) => `<button class="nav ${s.touchSize === v ? 'on' : ''}" data-size="${v}">${v === 0.85 ? 'Small' : v === 1 ? 'Medium' : 'Large'}</button>`).join('')}</span></div>
        ${rng('touchOpacity', 'Touch button opacity', 0.3, 1, 0.05)}
        ${tog('pixelBars', 'Pixel HP bars over fighters')}${tog('hitboxes', 'Hitbox overlay')}
        ${tog('devOverlay', 'Developer overlay')}${tog('reducedMotion', 'Reduce menu motion')}
        <div class="field" style="grid-column:1/-1;flex-direction:column;align-items:stretch"><span>Export save — copy this code somewhere safe (iOS can clear app storage)</span><textarea class="code" readonly id="exp"></textarea><span class="row" style="display:flex;gap:8px"><button class="plate nav" data-a="copy">Copy code</button></span></div>
        <div class="field" style="grid-column:1/-1;flex-direction:column;align-items:stretch"><span>Import save — paste a code, then import</span><textarea class="code" id="imp" placeholder="ARENA1-…"></textarea><span class="row" style="display:flex;gap:8px"><button class="plate nav" data-a="import">Import save</button><button class="plate nav" data-a="reset">Reset all data</button></span></div>
      </div>${prompt([['cross', 'Change'], ['circle', 'Back']])}</div>`, { back });
    el.querySelector('#exp').value = this.store.exportCode();
    for (const t of el.querySelectorAll('[data-tog]')) t.addEventListener('click', () => { const k = t.dataset.tog; s[k] = !s[k]; t.querySelector('.toggle').classList.toggle('on', s[k]); this.app.saveSettings(); this.app.audio.play('menu_Toggle'); });
    for (const r of el.querySelectorAll('[data-rng]')) r.addEventListener('input', () => { s[r.dataset.rng] = +r.value; this.app.saveSettings(); });
    for (const b of el.querySelectorAll('[data-size]')) b.addEventListener('click', () => { s.touchSize = +b.dataset.size; for (const o of el.querySelectorAll('[data-size]')) o.classList.toggle('on', o === b); this.app.saveSettings(); });
    el.querySelector('[data-a="copy"]').addEventListener('click', async () => { const ta = el.querySelector('#exp'); ta.select(); try { await navigator.clipboard.writeText(ta.value); this.app.toast('Save code copied'); } catch (e) { document.execCommand && document.execCommand('copy'); this.app.toast('Select the code and copy it'); } });
    el.querySelector('[data-a="import"]').addEventListener('click', () => { try { this.store.importCode(el.querySelector('#imp').value); this.app.settings = this.store.read('settings'); this.app.applySettings(); this.app.toast('Save imported'); this.settings(back); } catch (e) { this.app.toast(e.message); } });
    el.querySelector('[data-a="reset"]').addEventListener('click', () => { if (confirm('Erase settings, records and tournament progress?')) { this.store.resetAll(); this.app.settings = this.store.read('settings'); this.app.applySettings(); this.app.toast('All data reset'); this.settings(back); } });
  }
  // ------------------------------------------------------------------------------------------------ controls guide
  controls(back) {
    const row = (g, txt) => `<dt>${g}</dt><dd>${txt}</dd>`;
    const el = this.app.setScreen(`<div class="screen">${this.bar('Controls', 'Touch, controller and keyboard all do the same things')}
      <div class="ctrl">
        <section><h3>Touch</h3><dl>${row(nub(22), 'Drag anywhere on the left to move')}${row(face('cross', 22) + face('square', 22) + face('triangle', 22) + face('circle', 22), 'Your four moves (cost shown on each)')}${row(shoulder('R', 20), 'Dodge, or your special movement')}${row(shoulder('L', 20), 'Ultimate / Mega Evolution when the ring glows')}${row(pill('START', 18), 'Pause')}${row(pill('SELECT', 18), 'Emotes')}${row('<b>Balls</b>', 'Switch Pokémon (Trainer Battle)')}</dl></section>
        <section><h3>Controller</h3><dl>${row(nub(22), 'Move')}${row(face('cross', 22) + face('square', 22) + face('triangle', 22) + face('circle', 22), 'Moves')}${row(shoulder('R', 20), 'Dodge / movement (hold for Latios\'s jets)')}${row(shoulder('L', 20), 'Ultimate')}${row(dpad('left', 22) + dpad('right', 22), 'Switch Pokémon')}${row(dpad('up', 22) + dpad('down', 22), 'Deoxys forme change')}${row(pill('SELECT', 18), 'Emote, then a face button')}${row(pill('START', 18), 'Pause')}</dl></section>
        <section><h3>Keyboard</h3><dl>${row('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move')}${row('<kbd>K</kbd><kbd>J</kbd><kbd>I</kbd><kbd>L</kbd>', face('cross', 18) + face('square', 18) + face('triangle', 18) + face('circle', 18) + ' moves')}${row('<kbd>Space</kbd> / <kbd>Shift</kbd>', shoulder('R', 16) + ' dodge')}${row('<kbd>Q</kbd>', shoulder('L', 16) + ' Ultimate')}${row('<kbd>E</kbd>', pill('SELECT', 14) + ' emote')}${row('<kbd>F</kbd>', 'Deoxys forme')}${row('<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>', 'Switch Pokémon')}${row('<kbd>Esc</kbd>', pill('START', 14) + ' pause')}</dl></section>
        <section style="grid-column:1/-1"><h3>Battle basics</h3><p style="margin:0;font:500 13px/1.45 var(--semi);color:#e4dcff">One stamina bar powers everything: light moves cost little and have no cooldown; heavy and signature moves cost more and need a short cooldown. Stamina refills about 28 per second, starting 0.4 s after you spend it, half as fast while attacking or hurt. Dodge (${shoulder('R', 14)}) costs 12. Dodge right before a hit for a perfect dodge — time slows and your next hit is stronger. Two attacks that meet cancel out with a clash. Knock a foe into a wall for a wall slam. In the last 30 seconds stamina regenerates twice as fast.</p></section>
      </div>${prompt([['circle', 'Back']])}</div>`, { back });
    el.tabIndex = -1;
  }
  // ------------------------------------------------------------------------------------------------ credits
  credits(back) {
    const C = this.app.credits || {};
    const music = this.app.audio.manifest ? Object.entries(this.app.audio.manifest.music).map(([k, v]) => `${esc(v.title || k)} — ${esc(v.album || '')}${v.artist ? ' (' + esc(v.artist) + ')' : ''}`).join('<br>') : '';
    const species = Object.keys(C).sort().map((id) => {
      const c = C[id] || {}, sid = id.replace(/_(mega|primal|attack|defense|speed)$/, ''), sfx = id.slice(sid.length + 1);
      const nm = CONTENT.species[sid] ? CONTENT.species[sid].name + (sfx ? ` (${sfx === 'mega' ? 'Mega' : sfx === 'primal' ? 'Primal' : sfx[0].toUpperCase() + sfx.slice(1) + ' Forme'})` : '') : id;
      const who = (a) => esc((a || []).join(', ') || '—');
      return `<p><b>${esc(nm)}</b> — sprite: ${who(c.sprite)} · portraits: ${who(c.portrait)}</p>`;
    }).join('');
    this.app.setScreen(`<div class="screen">${this.bar('Credits', 'A personal fan game')}
      <div class="credits">
        <h3>Pokémon</h3><p>Pokémon and all related names are © Nintendo, Creatures Inc. and GAME FREAK inc. This is a personal, non-commercial fan project.</p>
        <h3>Fighter sprites and portraits</h3><p>PMD Sprite Repository (PMDCollab/SpriteCollab), CC BY-NC 4.0. Artists per species:</p>${species}
        <h3>Move effects, beams, weather, fonts</h3><p>PMDCollab/RawAsset — Pokémon Mystery Dungeon style particle, beam and background sheets and the PMD pixel font.</p>
        <h3>Move recipes and battle sounds</h3><p>Pokémon Mystery Dungeon: Origins data (audinowho/DumpAsset): skill effect recipes and DUN_* battle sounds.</p>
        <h3>Music</h3><p>Tracks distributed with PMDO (audinowho/DumpAsset), transcoded to AAC with their loop points:<br>${music}</p>
        <h3>Battle data</h3><p>Smogon pokemon-showdown (MIT): learnsets, moves, Pokédex stats and the type chart.</p>
        <h3>Tools and libraries</h3><p>ZzFX by Frank Force (MIT) for procedural sounds. proper-pixel-art by Kenneth Allen (MIT) for pixel-grid recovery. Barlow typefaces by Jeremy Tribby (SIL OFL).</p>
        <h3>Original PSP build assets</h3><p>Sunset stadium title art, trainer portraits, court slabs, Poké Ball banners, Kanto island map and the 25 PSP sound effects from the earlier PSP version of this game.</p>
        <h3>Arena backgrounds</h3><p>Bell Tower, Mt. Chimney, Spear Pillar, Cerulean Gym, Whirl Islands, Sootopolis, Azure Bay, Sky Pillar and Dragonspiral Tower images made for this game. Indigo Plateau Stadium${CONTENT.maps.lumiose ? ' and Lumiose Skyline' : ''} painted in code.</p>
      </div>${prompt([['circle', 'Back']])}</div>`, { back });
  }
  // ------------------------------------------------------------------------------------------------ pause menu
  menu(kind, o) {
    const app = this.app;
    const d = document.createElement('div'); d.className = 'menu-layer';
    d.innerHTML = `<div class="panel" role="dialog" aria-label="Paused"><h2>Paused</h2>
      <button class="menu-btn nav" data-a="resume">${face('cross', 20)} Resume</button>
      ${o.noRestart ? '' : `<button class="menu-btn nav" data-a="restart">Restart</button>`}
      <button class="menu-btn nav" data-a="settings">Settings</button>
      <button class="menu-btn nav" data-a="controls">Controls</button>
      <button class="menu-btn nav" data-a="rules">Rules</button>
      <button class="menu-btn nav" data-a="quit" data-key="triangle">${face('triangle', 20)} ${o.quitLabel || 'Quit'}</button></div>`;
    app.overlaysEl.appendChild(d);
    const panel = d.querySelector('.panel');
    d.querySelector('[data-a="resume"]').addEventListener('click', () => o.onResume());
    const rs = d.querySelector('[data-a="restart"]'); if (rs) rs.addEventListener('click', () => { app.closeMenu(); o.onRestart(); });
    d.querySelector('[data-a="quit"]').addEventListener('click', () => { if (o.quitConfirm && !confirm(o.quitConfirm)) return; app.closeMenu(); o.onQuit(); });
    d.querySelector('[data-a="rules"]').addEventListener('click', () => { panel.innerHTML = `<h2>Rules</h2><p>${o.rule}</p><p>If HP percentages are tied at the end, 20 seconds of sudden death follow: the next hit wins. If no one lands a hit, it's a draw.</p><p>In the last 30 seconds, Double Stamina: stamina regenerates twice as fast.</p><button class="menu-btn nav" data-a="back">${face('circle', 20)} Back</button>`; panel.querySelector('[data-a="back"]').addEventListener('click', () => { app.closeMenu(); app.menu('pause', o); }); app.focus(panel.querySelector('.nav')); app.backFn = () => { app.closeMenu(); app.menu('pause', o); }; });
    const sub = (fn) => () => {
      const holder = document.createElement('div'); holder.className = 'menu-layer sub-layer'; holder.style.background = '#0b0918';
      app.overlaysEl.appendChild(holder);
      app.subHolder = holder;
      fn.call(this, () => {
        app.subHolder = null; holder.remove(); app.focusRoot = d; app.menuEl = d; app.backFn = o.onResume; app.focus(d.querySelector('.nav'));
        if (app.scene && app.scene.world) { app.scene.world.settings.pixelBars = app.settings.pixelBars; app.scene.world.settings.hitboxes = app.settings.hitboxes; }
        if (app.scene && app.scene.touch && app.scene.touch.applySettings) app.scene.touch.applySettings(app.settings);
      });
    };
    d.querySelector('[data-a="settings"]').addEventListener('click', sub(this.settings));
    d.querySelector('[data-a="controls"]').addEventListener('click', sub(this.controls));
    return d;
  }
}
const TRAV_TEXT = {
  dig: 'dives underground as a fast, untargetable mound and erupts under the foe.', ninja: 'runs on water; R blinks away leaving a Substitute log decoy.',
  quickzig: 'three rapid zigzag dashes that follow the stick.', pinball: 'moves by spinning with momentum and ricochets off walls.',
  shellslide: 'withdraws and slides fast, bumping anything in the way. Hydro Pump pushes it backward.', jet: 'hold R to afterburn: very fast, wide turns, drains stamina.',
  refraction: 'turns nearly invisible for 3 s; attacking breaks it.', shadowdrift: 'sinks into its shadow, passing through everything for 0.5 s.',
  levitate: 'floats; R teleports, with 2 charges.', magnet: 'hovers with heavy momentum; ramming at full speed deals damage.',
  ropes: 'arena edges act like ropes; R leaps to where you aim.', dive: 'submerges on water (untargetable); a wingbeat dash in the air.',
  skim: 'leaves a wind trail that speeds Suicune up.', bellyslide: 'belly slides until you steer out (short on land).', voltdash: 'a lightning zigzag that leaves a damaging trail.',
  ingrain: 'R roots in place for armor, healing and faster attacks; R again to uproot.', leap: 'a long quick leap instead of a roll.', deoxys: 'Speed Forme: R teleports, with 2 charges.', glide: 'glides with momentum.',
};
