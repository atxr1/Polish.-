// BattleScene: runs one match. Fixed 60 Hz simulation, pixel world upscaled at an integer scale, vector HUD,
// touch/keyboard/gamepad input, VS intro, Poké Ball send-outs, faint sequence, trainer replacement flow,
// Mega Evolution sequence, pause menu, Play of the Match replay (deterministic re-simulation) and results.
import { Match, Replay } from './match.js';
import { CONTENT } from '../game/content.js';
import { MOVES, moveFxNames, moveBeamNames } from '../content/moves.js';
import { spriteIdsFor } from '../content/index.js';
import { FX_DEFAULTS } from '../render/fxnames.js';
import { SFX_DEFAULTS } from '../audio/sfxnames.js';
import { World } from '../render/world.js';
import * as SA from '../render/serpentArt.js';
import { FX } from '../render/fx.js';
import { HUD } from '../ui/hud.js';
import { TouchControls } from '../ui/touch.js';
import { SLOT_BUTTON, prompt, face } from '../ui/glyphs.js';
import { blankInput } from '../game/fighter.js';

const STEP = 1000 / 60;

// every asset a match needs, so it can be loaded behind one short loading screen
export function matchAssets(setup) {
  const species = new Set(); for (const sd of setup.sides) for (const id of sd.team) species.add(id);
  const sprites = new Set(), moves = new Set();
  for (const id of species) {
    for (const s of spriteIdsFor(id)) sprites.add(s);
    const sp = CONTENT.species[id];
    for (const m of sp.kit) moves.add(m);
    moves.add(sp.ult); if (sp.mega && sp.mega.ult) moves.add(sp.mega.ult);
    if (sp.ult === 'psychoboostmax') ['pb_normal', 'pb_attack', 'pb_defense', 'pb_speed'].forEach((x) => moves.add(x));
    if (sp.ult === 'rebirth') moves.add('sacredinferno');
  }
  const particles = new Set(FX_DEFAULTS.particles), beams = new Set(), sfx = new Set(SFX_DEFAULTS);
  for (const id of moves) {
    const m = MOVES[id]; if (!m) continue;
    for (const n of moveFxNames(m)) particles.add(n);
    for (const n of moveBeamNames(m)) beams.add(n);
    for (const k of ['sfx', 'sfxStart']) if (m[k]) sfx.add(m[k]);
    for (const st of m.steps) { if (st.sfx) sfx.add(st.sfx); if (st.eachSfx) sfx.add(st.eachSfx); if (st.fall && /Lightning/.test(st.fall)) beams.add(st.fall); }
  }
  return { sprites: [...sprites], particles: [...particles], beams: [...beams], sfx: [...sfx], map: setup.map };
}

export class BattleScene {
  constructor(app, setup, hooks = {}) {
    this.app = app; this.setup = setup; this.hooks = hooks;
    this.me = setup.sides.findIndex((s) => s.control === 'human'); if (this.me < 0) this.me = 0;
    this.state = 'loading'; this.acc = 0; this.paused = false; this.done = false;
    this.fx = new FX(app.gfx); this.world = new World(app.gfx, this.fx); this.hud = new HUD(app.gfx);
    this.world.focusSide = this.me;
    this.touch = new TouchControls(app.layer, app.input);
    this.emoteMode = false; this.koFinalTick = -1; this.overAt = -1; this.choosing = false;
    this.lastLow = 0; this.frameMs = []; this.lastT = 0; this.latched = new Set();
    // tapping the arena skips the faint sequence, the Mega sequence and Play of the Match
    this.onTap = () => { this.tapSkip = true; };
    app.canvas.addEventListener('pointerdown', this.onTap);
  }
  async load(progress) {
    const g = this.app.gfx, A = matchAssets(this.setup);
    const map = CONTENT.maps[this.setup.map];
    const jobs = [];
    let done = 0; const total = A.sprites.length + A.particles.length + A.beams.length + 3;
    const tick = () => { done++; progress && progress(done / total); };
    for (const s of A.sprites) jobs.push(g.loadFighter(s).then(tick));
    for (const p of A.particles) jobs.push(g.loadSheet(p).then(tick));
    for (const b of A.beams) jobs.push(g.loadBeam(b).then(tick));
    jobs.push(g.loadMap(map.img).then((im) => { this.mapImg = im; tick(); }));
    if (map.id === 'indigo') jobs.push(g.loadMap('indigo-cheer').then((im) => { this.cheerImg = im; tick(); })); else tick();
    for (const sd of this.setup.sides) if (sd.trainer) jobs.push(g.loadTrainer(CONTENT.trainers[sd.trainer].portrait));
    jobs.push(this.app.audio.preload(A.sfx).then(tick));
    for (const sd of this.setup.sides) for (const id of sd.team) { const sp = CONTENT.species[id]; if (sp.serpent) jobs.push(g.loadSerpentSheet(sp.serpent.pal).then((pieces) => { if (pieces) SA.setSheet(sp.serpent.pal, pieces); })); }
    await Promise.all(jobs);
    this.world.setMap(map, this.mapImg, this.cheerImg);
  }
  begin() {
    const s = this.setup;
    this.match = new Match({ seed: s.seed >>> 0, env: s.env, format: s.format, map: s.map, sides: s.sides.map((x) => ({ team: x.team, trainer: x.trainer || null, control: x.control, level: x.level })) });
    this.S = this.match.sim;
    this.touch.mount({ leftHanded: this.app.settings.leftHanded, size: this.app.settings.touchSize, opacity: this.app.settings.touchOpacity });
    this.touch.onPause = () => this.pause();
    this.touch.onEmote = (i) => { this.pendingEmote = i; };
    this.touch.onSwitch = (i) => { this.pendingSwitch = i; };
    this.touch.onEmoteClose = () => { this.emoteMode = false; };
    this.touch.show(false);
    this.world.settings.pixelBars = this.app.settings.pixelBars;
    this.world.settings.hitboxes = this.app.settings.hitboxes;
    const map = CONTENT.maps[s.map];
    this.app.audio.playMusic(s.music || map.music);
    this.app.audio.ambience(map.ambience, s.env);
    this.state = 'intro';
    this.showIntro();
  }
  // ---------------------------------------------------------------------------------- VS intro (skippable)
  showIntro() {
    const s = this.setup, me = this.me, o = 1 - me;
    const side = (i) => {
      const sd = s.sides[i];
      if (sd.trainer) { const t = CONTENT.trainers[sd.trainer]; return { name: t.name, sub: t.title, img: `assets/trainers/${t.portrait}.png`, team: sd.team, line: t.intro, color: t.color }; }
      const sp = CONTENT.species[sd.team[0]];
      return { name: sp.name, sub: sp.role, sprite: sp.sprite, team: sd.team, color: '#ff8a3d' };
    };
    const A = side(me), B = side(o), map = CONTENT.maps[s.map];
    const ov = this.app.overlay(`<div class="vs" role="dialog" aria-label="Versus">
      <div class="vs-half vs-a" style="--c:${A.color}">${A.img ? `<img class="vs-port" src="${A.img}" alt="">` : `<canvas class="vs-sprite" data-sprite="${A.sprite}"></canvas>`}<div class="vs-name">${A.name}</div><div class="vs-sub">${A.sub}</div>${A.line ? `<div class="vs-line">${A.line}</div>` : ''}</div>
      <div class="vs-half vs-b" style="--c:${B.color}">${B.img ? `<img class="vs-port" src="${B.img}" alt="">` : `<canvas class="vs-sprite" data-sprite="${B.sprite}"></canvas>`}<div class="vs-name">${B.name}</div><div class="vs-sub">${B.sub}</div>${B.line ? `<div class="vs-line">${B.line}</div>` : ''}</div>
      <div class="vs-mark">VS</div>
      <div class="vs-map">${map.name} · ${map.region}${s.title ? `<br><b>${s.title}</b>` : ''}</div>
      <div class="vs-skip">${prompt([['cross', 'Skip']], 20)}</div></div>`, 'vs-layer');
    this.app.paintSprites(ov);
    this.app.audio.play('zz_slam');
    let t = 0;
    const finish = () => { if (this.state !== 'intro') return; this.state = 'sendout'; ov.classList.add('out'); setTimeout(() => ov.remove(), 400); this.startFight(); };
    ov.addEventListener('pointerdown', finish);
    this.skipIntro = finish;
    this.introTimer = setTimeout(finish, 2700);
  }
  startFight() {
    clearTimeout(this.introTimer);
    this.match.startFight();
    this.consume(this.match.pendingStart || []);
    this.touch.show(true);
    this.hud.say('Battle start!', null, 70, 'banner');
    this.app.audio.play('zz_go');
    this.state = 'fight';
  }
  // ---------------------------------------------------------------------------------- per frame
  frame(dt) {
    const t0 = performance.now();
    const input = this.app.input;
    input.poll();
    if (this.state === 'intro') { if (input.wasPressed('cross') || input.wasPressed('start')) this.skipIntro(); this.render(); return; }
    if (this.state === 'results' || this.state === 'done') return;
    if (this.paused) { this.render(); return; }
    // once the match is decided, Start skips (faint sequence, Play of the Match) instead of opening Pause
    if (!this.decided() && (input.wasPressed('start') || input.wasPressed('esc'))) { this.pause(); return; }
    if (this.state === 'potm') { this.potmFrame(dt); return; }
    const S = this.S;
    // presses are latched until a simulated tick consumes them (frames without a sim step never drop input)
    for (const n of input.pressed) this.latched.add(n);
    // skip the faint sequence / Mega sequence with a tap or ✕
    // skips need a fresh press after a 0.6 s grace period, so mashing ✕ through the final hit can't skip the faint sequence
    const skip = input.wasPressed('cross') || input.wasPressed('start') || this.tapSkip;
    if ((S.phase === 'ko' || S.phase === 'over') && S.koFinal && S.phaseT > 36 && skip) { this.tapSkip = false; this.skipKO(); }
    // Mega sequence: fast-forward its frozen ticks (the inputs are still recorded, so Play of the Match stays exact)
    if (this.fx.mega && this.fx.mega.t > 24 && skip) {
      this.tapSkip = false; this.fx.mega = null;
      for (let n = 0; S.freeze > 0 && n < 120; n++) { const hi = [null, null]; if (this.setup.sides[this.me].control === 'human') hi[this.me] = this.humanInput(); this.consume(this.match.step(hi)); this.fx.update(S); }
    }
    this.tapSkip = false;
    // slow motion (perfect dodges, knockouts) runs the sim at half speed
    const speed = S.slowmo > 0 ? 0.5 : 1;
    const ts = this.app.test ? this.app.test.speed : 1;
    this.acc += Math.min(dt, 100) * speed * ts;
    let steps = 0;
    while (this.acc >= STEP && steps < 4 * ts) {
      this.acc -= STEP; steps++;
      const hi = [null, null]; if (this.setup.sides[this.me].control === 'human') hi[this.me] = this.humanInput();
      const evs = this.match.step(hi);
      this.consume(evs);
      this.fx.update(S);
      if (S.phase === 'over' && this.overAt < 0) this.overAt = S.tick;
    }
    if (this.overAt >= 0 && S.tick - this.overAt > 20 && this.state === 'fight') { this.endMatch(); if (this.state === 'results') return; }
    this.render();
    this.frameMs.push(performance.now() - t0); if (this.frameMs.length > 120) this.frameMs.shift();
  }
  humanInput() {
    const I = this.app.input, S = this.S, f = S.activeOf(this.me);
    const inp = blankInput();
    const L = this.latched, P = (n) => L.has(n);
    inp.mx = I.mx; inp.my = I.my;
    // pad / keyboard emote: SELECT opens, the next face button chooses
    if (P('select')) { this.emoteMode = !this.emoteMode; this.touch.toggleEmotes(this.emoteMode); }
    if (this.pendingEmote !== undefined) { inp.emote = this.pendingEmote; this.pendingEmote = undefined; this.emoteMode = false; }
    for (let i = 0; i < 4; i++) {
      const b = SLOT_BUTTON[i];
      if (P(b)) { if (this.emoteMode) { inp.emote = i; this.emoteMode = false; this.touch.toggleEmotes(false); } else inp.slot = i; }
      inp.held[i] = I.isDown(b);
    }
    inp.dodge = P('R'); inp.dodgeHeld = I.isDown('R'); inp.ult = P('L');
    inp.forme = P('forme') || I.pad.buttons.has('up') && !this.padUpPrev || I.pad.buttons.has('down') && !this.padDownPrev;
    this.padUpPrev = I.pad.buttons.has('up'); this.padDownPrev = I.pad.buttons.has('down');
    if (S.format === 'trainer') {
      const sd = S.sides[this.me], cur = sd.team.indexOf(sd.active);
      const cycle = (d) => { for (let k = 1; k < sd.team.length; k++) { const j = (cur + d * k + sd.team.length * 3) % sd.team.length; if (sd.team[j].alive && sd.team[j] !== sd.active) return j; } return -1; };
      if (I.pad.buttons.has('left') && !this.padLPrev) inp.switchTo = cycle(-1);
      if (I.pad.buttons.has('right') && !this.padRPrev) inp.switchTo = cycle(1);
      this.padLPrev = I.pad.buttons.has('left'); this.padRPrev = I.pad.buttons.has('right');
      for (let i = 0; i < 3; i++) if (P('sw' + i)) inp.switchTo = i;
      if (this.pendingSwitch !== undefined) { inp.switchTo = this.pendingSwitch; this.pendingSwitch = undefined; }
      if (this.pendingChoose !== undefined) { inp.choose = this.pendingChoose; this.pendingChoose = undefined; }
      if (inp.switchTo >= 0 && !S.canSwitch(this.me, inp.switchTo)) { if (S.sides[this.me].switchCd > 0) this.hud.callout('Switching is on cooldown', '#b9b0d6'); inp.switchTo = -1; }
    }
    if (f && !f.onField) { inp.slot = -1; }
    L.clear();
    return inp;
  }
  consume(evs) {
    const A = this.app.audio, S = this.S;
    this.fx.consume(S, evs, { callout: (t, c) => this.hud.callout(t, c) });
    this.hud.consume(S, evs, this.me);
    for (const ev of evs) {
      switch (ev.e) {
        case 'sfx': A.play(ev.id, { pan: this.pan(ev.x) }); break;
        case 'hit': if (!ev.multi && !ev.statusOnly) { A.play(ev.heavy ? 'psp_physical' : 'psp_hit', { vol: ev.heavy ? 0.9 : 0.6, pan: this.pan(ev.x) }); if (ev.heavy) A.duck(0.5, 400); } if (ev.tgt.side === this.me && ev.heavy) this.vibrate(18); if (ev.eff > 1 && !ev.multi) this.app.audio.crowd(0.9); break;
        case 'immune': A.play('psp_immune'); break;
        case 'sendOut': A.play('psp_send', { pan: this.pan(ev.f.x) }); break;
        case 'recall': A.play('psp_recall', { pan: this.pan(ev.f.x) }); break;
        case 'faint': A.play('psp_faint'); A.duck(0.3, 1600); if (ev.final) { this.koFinalTick = S.tick; this.koSig = simSignature(S); this.emoteMode = false; this.touch.toggleEmotes(false); } this.app.audio.crowd(1); break;
        case 'victory': A.play(ev.f.side === this.me ? 'fanfare_MissionClear' : 'fanfare_MissionFail'); this.hud.say(ev.f.side === this.me ? 'You win!' : 'You lose…', null, 140, 'banner'); break;
        case 'timeup': case 'draw': if (this.koFinalTick < 0) { this.koFinalTick = S.tick; this.koSig = simSignature(S); } break;
        case 'overtime': A.setRate(1.07); A.crowd(0.8); break;
        case 'mega': A.play('DUN_Healing_Wish'); A.duck(0.3, 1500); break;
        case 'emote': A.play('menu_Select', { rate: 1.3 }); break;
        case 'perfect': A.play('zz_coin'); break;
        case 'coin': A.play('zz_coin'); break;
        case 'bell': A.play('DUN_Light_Screen', { rate: 0.6 }); break;
        case 'choose': if (ev.sides.includes(this.me)) this.showChooser(); break;
        case 'resume': this.hideChooser(); break;
        case 'noStamina': if (ev.f.side === this.me && (this.noStamT || 0) < S.tick) { this.noStamT = S.tick + 30; this.hud.callout('Not enough stamina', '#62d2ff'); } break;
      }
    }
    // low-HP warning beep
    const f = S.activeOf(this.me);
    if (this.app.settings.lowHpBeep && f && f.alive && f.onField && f.hp / f.maxHp < 0.2 && S.phase === 'fight' && S.tick - this.lastLow > 50) { this.lastLow = S.tick; A.play('zz_beep', { vol: 0.35 }); }
    if (this.fx.cheer <= 0) this.app.audio.crowd(S.overtime ? 0.7 : 0.45);
  }
  pan(x) { const W = this.world; return x === undefined || !W.cx ? 0 : ((x - W.cx) / Math.max(1, W.w) - 0.5) * 1.4; }
  vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ } }
  skipKO() {
    const S = this.S;
    let n = 0;
    while ((S.phase === 'ko') && n++ < 400) { const hi = [null, null]; hi[this.me] = blankInput(); this.consume(this.match.step(hi)); this.fx.update(S); }
    if (S.phase === 'over' && this.overAt < 0) this.overAt = S.tick - 21;
  }
  // ---------------------------------------------------------------------------------- trainer replacement picker
  showChooser() {
    if (this.choosing) return;
    this.choosing = true;
    const sd = this.S.sides[this.me];
    const ov = this.app.overlay(`<div class="chooser" role="dialog" aria-label="Choose your next Pokémon"><div class="ch-title">Choose your next Pokémon</div><div class="ch-row">${sd.team.map((f, i) => `<button class="ch-mon ${f.alive ? '' : 'fainted'}" data-i="${i}" ${f.alive ? '' : 'disabled'}><canvas class="ch-sprite" data-sprite="${f.sp.sprite}"></canvas><b>${f.sp.name}</b><span>${f.hp}/${f.maxHp} HP</span>${f.alive ? face(SLOT_BUTTON[i], 22) : ''}</button>`).join('')}</div><div class="ch-timer"><i></i></div><div class="ch-hint">Picked for you in 6 s</div></div>`, 'chooser-layer');
    this.app.paintSprites(ov);
    const pick = (i) => { if (!sd.team[i] || !sd.team[i].alive) return; this.pendingChoose = i; this.app.audio.play('menu_Confirm'); this.hideChooser(); };
    for (const b of ov.querySelectorAll('.ch-mon')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(+b.dataset.i); });
    this.chooserKeys = this.app.input.on((type, v) => { if (type === 'press') { const k = SLOT_BUTTON.indexOf(v); if (k >= 0 && k < 3) pick(k); } });
    this.chooserEl = ov;
  }
  hideChooser() { this.choosing = false; if (this.chooserEl) { this.chooserEl.remove(); this.chooserEl = null; } if (this.chooserKeys) { this.chooserKeys(); this.chooserKeys = null; } }
  // ---------------------------------------------------------------------------------- render
  render(Sover, worldOver, hudOver) {
    const app = this.app, S = Sover || this.S, W = worldOver || this.world, H = hudOver || this.hud;
    if (!S || !W || !H) return;      // match already handed over to the results screen
    const { ctx, cw, ch, dpr, k, bw, bh } = app.view;
    W.resize(bw, bh);
    // HUD bands in world units, so the camera keeps fighters visible between them
    const ins = app.insets(), u = dpr / k;
    W.safeTop = Math.ceil((ins.t + (S.format === 'trainer' ? 90 : 78)) * u); W.safeBottom = Math.ceil((ins.b + 50) * u);
    const buf = W.draw(S, { portraits: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c0a18'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, bw * k, bh * k);
    H.draw(ctx, S, { w: cw / dpr, h: ch / dpr, dpr, me: this.me, insets: app.insets(), world: W, controls: this.touch.visible && app.input.source === 'touch', scale: k });
    if (!Sover) this.touch.update(S, this.me, S.format === 'trainer');
    if (app.settings.devOverlay) this.devOverlay(ctx, S, dpr);
  }
  devOverlay(c, S, dpr) {
    const ms = this.frameMs.length ? this.frameMs.reduce((a, b) => a + b, 0) / this.frameMs.length : 0;
    const fps = this.app.fps;
    c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#000a'; c.fillRect(8, 130, 250, 98);
    c.fillStyle = '#9f9'; c.font = '11px monospace';
    const lines = [`fps ${fps.toFixed(0)}  frame ${ms.toFixed(2)} ms  tick ${S.tick}`, `parts ${this.fx.parts.length} streams ${this.fx.streams.length} projs ${S.projs.length} zones ${S.zones.length}`];
    for (const f of S.fighters()) lines.push(`${f.sp.name}: ${f.state} anim ${f.anim.name} ${f.move ? 'move ' + f.move.def.id + ' t' + f.move.t : ''}`);
    const ai = this.match.ais[1 - this.me]; if (ai) lines.push(`AI plan ${ai.plan} level ${ai.level}`);
    lines.push(`missing fx: ${[...this.app.gfx.missing].slice(0, 3).join(',') || 'none'}`);
    lines.forEach((l, i) => c.fillText(l, 14, 146 + i * 14));
    c.restore();
  }
  // ---------------------------------------------------------------------------------- pause
  pause() {
    if (this.paused || this.state === 'results') return;
    this.paused = true; this.emoteMode = false; this.touch.toggleEmotes(false); this.touch.show(false);
    this.app.audio.duck(0.35, 99999);
    const S = this.S;
    const rule = S.format === 'trainer' ? 'Trainer Battle: 4-minute clock. A side wins when the other has no Pokémon left. At time-out, the higher total HP percentage wins.' : 'Pokémon Battle: 99-second clock. At time-out, the higher HP percentage wins.';
    const tour = !!this.setup.tour;
    // paused after the result is in (app sent to the background, phone turned upright): leaving goes to the results,
    // so a won match can't be thrown away or forfeited
    if (this.decided()) { this.app.menu('pause', { rule, noRestart: true, quitLabel: 'Skip to results', quitConfirm: null, onResume: () => this.resume(), onQuit: () => { this.resume(true); this.toResults(); } }); return; }
    this.app.menu('pause', { rule, noRestart: tour, quitLabel: tour ? 'Forfeit match' : 'Quit', quitConfirm: tour ? 'Forfeit this tournament match? It counts as a loss.' : null, onResume: () => this.resume(), onRestart: () => { this.resume(true); this.hooks.restart && this.hooks.restart(); }, onQuit: () => { this.resume(true); this.quit(); } });
  }
  decided() { return this.state === 'potm' || this.state === 'ending' || !!(this.S && this.S.result); }
  toResults() {
    if (this.state === 'potm') { this.finishPotm(); return; }
    if (this.state === 'fight') this.skipKO();
    if (this.state !== 'results') { this.state = 'ending'; this.touch.show(false); this.showResults(); }
  }
  resume(silent) {
    this.paused = false; this.acc = 0;
    this.app.audio.duck(1, 0);
    if (!silent) { this.app.closeMenu(); this.touch.show(this.state === 'fight'); }
  }
  quit() { this.destroy(); this.hooks.quit && this.hooks.quit(); }
  destroy() {
    this.state = 'done'; this.done = true; clearTimeout(this.introTimer);
    this.app.canvas.removeEventListener('pointerdown', this.onTap);
    this.touch.unmount(); this.hideChooser();
    this.app.audio.setRate(1);
    this.app.clearOverlays();
    this.app.gfx.releaseMatchCaches();
  }
  // ---------------------------------------------------------------------------------- end of match: Play of the Match, then results
  endMatch() {
    this.state = 'ending';
    this.touch.show(false);
    const res = this.S.result;
    this.result = res;
    if (this.koFinalTick > 300 && !this.setup.noPotm) this.startPotm();
    else this.showResults();
  }
  startPotm() {
    // re-simulate from the start with the recorded inputs (the sim is deterministic) to 5 s before the end
    this.state = 'potm';
    this.potmReplay = new Replay(this.match.log);
    const from = Math.max(0, this.koFinalTick - 300);
    this.potmReplay.fastForward(from);
    this.potmFx = new FX(this.app.gfx); this.potmWorld = new World(this.app.gfx, this.potmFx); this.potmWorld.setMap(CONTENT.maps[this.setup.map], this.mapImg, this.cheerImg); this.potmWorld.focusSide = this.me;
    this.potmHud = new HUD(this.app.gfx); this.potmHud.potm = true;
    this.potmEnd = this.koFinalTick + 70; this.potmAcc = 0;
    // determinism check: replay to the final knockout and compare with the live match; never show a wrong replay
    const probe = new Replay(this.match.log); probe.fastForward(this.koFinalTick);
    if (simSignature(probe.sim) !== this.koSig) { console.warn('Play of the Match skipped: replay diverged'); this.potmReplay = null; this.showResults(); return; }
    this.potmStartTick = this.potmReplay.sim.tick;
    this.app.audio.duck(0.4, 6000);
  }
  potmFrame(dt) {
    if ((this.tapSkip || this.app.input.wasPressed('cross') || this.app.input.wasPressed('start')) && this.potmReplay && this.potmReplay.sim.tick - this.potmStartTick > 36) { this.tapSkip = false; this.finishPotm(); return; }
    this.tapSkip = false;
    const R = this.potmReplay, S = R.sim;
    this.potmAcc += Math.min(dt, 100) * 0.5 * (this.app.test ? this.app.test.speed : 1);      // slow motion
    while (this.potmAcc >= STEP) {
      this.potmAcc -= STEP;
      if (S.tick >= this.potmEnd || R.done) { this.finishPotm(); return; }
      const evs = R.stepOne();
      this.potmFx.consume(S, evs, { callout: (t, c) => this.potmHud.callout(t, c) });
      this.potmHud.consume(S, evs, this.me);
      this.potmFx.update(S);
    }
    this.render(S, this.potmWorld, this.potmHud);
  }
  finishPotm() {
    if (this.state !== 'potm') return;
    this.showResults();
  }
  showResults() {
    this.state = 'results';
    this.app.audio.duck(1, 0);
    this.app.audio.setRate(1);
    const S = this.S, res = S.result || { winner: -1, reason: 'draw' };
    const won = res.winner === this.me, draw = res.winner < 0;
    this.touch.unmount();
    this.app.canvas.removeEventListener('pointerdown', this.onTap);
    // drop the heavy references (worlds, replay, effects) so finished matches don't accumulate in memory
    this.potmReplay = null; this.potmWorld = null; this.potmFx = null; this.potmHud = null;
    this.hooks.finished && this.hooks.finished({ won, draw, result: res, sim: S, me: this.me });
    this.match = null; this.world = null; this.fx = null; this.hud = null; this.S = null; this.mapImg = this.cheerImg = null;
    this.app.gfx.releaseMatchCaches();
  }
}
// compact fingerprint of the sim state, used to verify that Play of the Match reproduces the real ending
function simSignature(S) {
  return S.tick + '|' + S.fighters().map((f) => `${f.id}:${f.hp}:${Math.round(f.x)}:${Math.round(f.y)}:${f.state}`).join(',');
}
