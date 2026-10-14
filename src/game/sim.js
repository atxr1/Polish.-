// The battle simulation: fixed 60 Hz, deterministic (seeded), emits events for presentation.
import { clamp, angDiff, mulberry32, segDist, TAU } from '../core/util.js';
import { CONTENT, rawEffect, arenaEffect } from './content.js';
import { Fighter, STAMINA_MAX, STAMINA_REGEN } from './fighter.js';
import { startMove, SPECIALS } from './mechanics.js';
import { FEATURES } from './features.js';

export const MATCH = { pokemonTicks: 99 * 60, trainerTicks: 240 * 60, overtimeAt: 30 * 60, suddenTicks: 20 * 60 };
export const TUNING = { dmgK: 0.17, trainerDmg: { ground: 1.18, water: 1.25, air: 0.86 }, pokemonDmg: { ground: 1, water: 1, air: 0.88 }, ultPassive: 0.7 / 60, ultDealt: 64, ultTaken: 36 };

// environment pseudo-attacker for map hazards
function makeEnv() {
  return { side: -1, isEnv: true, types: [], alive: true, x: 0, y: 0, perfect: 0, status: {}, flags: {}, sp: { passive: null, id: 'env', name: 'Arena' },
    stat: () => 100, dmgMul: () => 1, gainUlt() {}, stats: { dealt: 0, hits: 0, se: 0 }, onField: true };
}

export class Sim {
  constructor(opts) {
    this.opts = opts;
    this.seed = opts.seed >>> 0; this.rng = mulberry32(this.seed);
    this.env = opts.env; this.format = opts.format;   // 'pokemon' | 'trainer'
    this.map = CONTENT.maps[opts.map];
    if (!this.map) throw new Error('unknown map ' + opts.map);
    this.rules = Object.assign({ noUlt: false }, opts.rules || {});
    this.bounds = Object.assign({}, this.map.play);
    this.obstacles = (this.env === 'ground' ? this.map.obstacles || [] : []).map((o) => Object.assign({}, o));
    this.tick = 0; this.fightTicks = 0; this.freeze = 0; this.slowmo = 0;
    this.phase = 'intro'; this.phaseT = 0;
    this.timeLeft = this.format === 'trainer' ? MATCH.trainerTicks : MATCH.pokemonTicks;
    this.overtime = false; this.sudden = false; this.result = null;
    this.events = []; this.setId = 0;
    this.projs = []; this.zones = []; this.acts = []; this.walls = []; this.laters = [];
    this.decoys = []; this.clones = []; this.traps = []; this.coins = []; this.trails = []; this.waves = []; this.rings = [];
    this.ENV = makeEnv();
    this.ultPassive = TUNING.ultPassive;
    this.sides = opts.sides.map((sd, s) => ({
      team: sd.team.map((id, i) => new Fighter(this, id, s, i)),
      active: null, megaUsed: false, switchCd: 0, trainer: sd.trainer || null, ko: 0, pendingSwitch: -1, replaceT: 0,
    }));
    this.weather = null; this.weatherT = 0; this.weatherBy = null;
    this.feature = this.map.feature && FEATURES[this.map.feature] ? FEATURES[this.map.feature](this) : null;
  }

  // ------------------------------------------------------------ helpers
  ev(e) { e.tick = this.tick; this.events.push(e); }
  fx(name, f, o = {}) { if (!name) return; this.ev(Object.assign({ e: 'fx', name, f, x: f ? f.x : o.x, y: f ? f.y : o.y }, o)); }
  fxAt(name, x, y, o = {}) { if (!name) return; this.ev(Object.assign({ e: 'fx', name, x, y }, o)); }
  sfx(id, f) { if (id) this.ev({ e: 'sfx', id, x: f ? f.x : 0 }); }
  newSet() { return ++this.setId; }
  later(n, fn) { this.laters.push({ t: this.tick + n, fn }); }
  act(owner, def) { def.owner = owner; def.t = 0; def.ticks = def.ticks ?? 1; this.acts.push(def); return def; }
  activeOf(side) { const s = this.sides[side]; return s && s.active; }
  fighters() { const out = []; for (const s of this.sides) if (s.active) out.push(s.active); return out; }
  inBounds(x, y, m = 0) { const b = this.bounds; return x > b.x0 + m && x < b.x1 - m && y > b.y0 + m && y < b.y1 - m; }
  clampPoint(x, y, r = 0) {
    const b = this.bounds;
    let p = { x: clamp(x, b.x0 + r, b.x1 - r), y: clamp(y, b.y0 + r, b.y1 - r) };
    for (const o of this.obstacles) p = pushOut(p, o, r);
    return p;
  }
  pointBlocked(x, y) { for (const o of this.obstacles) if (inObstacle(x, y, o, 0)) return true; return false; }
  touchingObstacle(f) { for (const o of this.obstacles) if (inObstacle(f.x, f.y, o, f.r + 1)) return true; for (const w of this.walls) if (segDist(f.x, f.y, w.x0, w.y0, w.x1, w.y1) < w.th / 2 + f.r + 1) return true; return false; }
  // distance from a point to a fighter's hurtbox surface (serpents: head + front third)
  reach(o, x, y) {
    let d = Math.hypot(o.x - x, o.y - y) - o.r;
    if (o.serpent) for (const c of o.serpent.hurtCircles()) d = Math.min(d, Math.hypot(c.x - x, c.y - y) - c.r);
    return d;
  }
  reachSeg(o, x0, y0, x1, y1) {
    let d = segDist(o.x, o.y, x0, y0, x1, y1) - o.r;
    if (o.serpent) for (const c of o.serpent.hurtCircles()) d = Math.min(d, segDist(c.x, c.y, x0, y0, x1, y1) - c.r);
    return d;
  }
  // fraction (0..1) of a ray before it meets an obstacle or ice wall
  rayCut(x0, y0, x1, y1) {
    let best = 1;
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
    if (!this.obstacles.length && !this.walls.length) return 1;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      if (this.pointBlocked(x, y)) { best = u; break; }
      let hitW = false;
      for (const w of this.walls) if (segDist(x, y, w.x0, w.y0, w.x1, w.y1) < w.th / 2) { hitW = true; break; }
      if (hitW) { best = u; break; }
    }
    return best;
  }
  targetPointFor(att, o) {
    if (!o) return { x: att.x, y: att.y };
    // pure: the last-seen point is updated once per tick in step(), so CPU queries can't change the sim
    if (o.hidden() && att.sp.passive !== 'aura' && !o.flags.revealed) return o.lastSeen || { x: o.x, y: o.y };
    return { x: o.x, y: o.y };
  }
  inSmoke(f) {
    for (const z of this.zones) if (z.st && z.st.smoke && z.owner && z.owner.side === f.side && z.t >= z.delay && Math.hypot(f.x - z.x, f.y - z.y) < z.r) return true;
    return false;
  }
  weatherOn(kind) { return this.weather === kind && !this.fighters().some((f) => f.sp.passive === 'airlock' && f.onField); }
  setWeather(kind, ticks, by) {
    if (this.fighters().some((f) => f.sp.passive === 'airlock' && f.onField)) { this.ev({ e: 'airlock' }); return; }
    this.weather = kind; this.weatherT = ticks; this.weatherBy = by || null; this.ev({ e: 'weather', kind, ticks });
  }
  endMove(f) {
    for (const a of this.acts) if (a.owner === f && a.bound && !a.done) { a.done = true; a.end && a.end(a); }
    f.move = null; f.beams.length = 0;
    if (f.flags.airborne) { f.z = 0; f.flags.airborne = false; }
    f.flags.hidden = false; delete f.flags.front;
    if (f.state === 'act') { f.setState('idle'); f.setAnim(f.idleAnim(), { loop: true }); }
  }
  selfDamage(f, amt, nonlethal) {
    if (!f.alive) return;
    const d = Math.max(1, Math.round(amt));
    f.hp = Math.max(nonlethal || this.phase !== 'fight' ? 1 : 0, f.hp - d);
    this.ev({ e: 'recoil', f, dmg: d });
    if (f.hp <= 0 && this.phase === 'fight') this.knockOut(f);
  }
  healBench(side, frac) {
    for (const f of this.sides[side].team) if (f !== this.sides[side].active && f.alive) f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * frac));
    this.ev({ e: 'benchHeal', side });
  }

  // ------------------------------------------------------------ setup / flow
  begin() {
    const b = this.bounds, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, w = b.x1 - b.x0;
    this.spawns = this.map.spawns || [{ x: cx - w * 0.28, y: cy + 8 }, { x: cx + w * 0.28, y: cy - 8 }];
    for (let s = 0; s < 2; s++) {
      const f = this.sides[s].team[0];
      this.sides[s].active = f;
      f.x = this.spawns[s].x; f.y = this.spawns[s].y; f.faceAngle(s ? Math.PI : 0);
      f.state = 'hidden';
    }
    this.phase = 'intro'; this.phaseT = 0;
  }
  // presentation calls this once the intro / VS screen is done
  startFight() {
    for (let s = 0; s < 2; s++) this.sendOut(s, this.sides[s].active, s * 6);
    this.phase = 'fight'; this.phaseT = 0;
    this.ev({ e: 'fightStart' });
  }
  sendOut(side, f, delay = 0) {
    const sd = this.sides[side], prev = sd.active;
    if (prev && prev !== f) { f.x = prev.x; f.y = prev.y; prev.state = 'hidden'; }
    sd.active = f;
    f.setState('enter'); f.enterT = 26 + delay;
    f.setAnim(f.idleAnim(), { loop: true });
    const o = f.foe; if (o) f.faceAngle(Math.atan2(o.y - f.y, o.x - f.x));
    f.vx = f.vy = f.kvx = f.kvy = 0; f.z = 0; f.hitstun = 0;
    f.enteredT = this.tick + 26 + delay;
    if (f.serpent) f.serpent.reset();
    this.ev({ e: 'sendOut', f, side, delay });
  }
  becomeActive(f) {
    f.setState('idle'); f.setAnim(f.idleAnim(), { loop: true });
    f.flags.invuln = this.tick + 6;     // + the 12 ticks inside the ball = 0.3 s send-out protection
    if (f.sp.passive === 'intimidate') { const o = f.foe; if (o && o.alive) { o.flags.intimidated = this.tick + 600; this.ev({ e: 'intimidate', f, o }); } }
    if (f.sp.passive === 'airlock' && this.weather) { this.ev({ e: 'airlock' }); }
  }
  recall(side) {
    const sd = this.sides[side], f = sd.active; if (!f) return;
    if (f.move) this.endMove(f);
    if (f.state === 'trav' && f.T && f.T.interrupt) f.T.interrupt(f);
    f.flags = {}; f.trav = null; f.beams.length = 0; f.seeded = null;
    this.ev({ e: 'recall', f, side });
    f.setState('recalled');
  }

  // callers clear `events` before applying inputs (see modes/match.js), so command events survive the step
  step() {
    this.tick++;
    if (this.freeze > 0) { this.freeze--; return; }
    if (this.slowmo > 0) this.slowmo--;
    this.phaseT++;
    switch (this.phase) {
      case 'intro': break;
      case 'fight': this.fightTicks++; this.updateClock(); break;
      case 'ko': this.updateKO(); break;
      case 'replace': this.updateReplace(); break;
      case 'over': break;
    }
    if (this.weather && this.phase === 'fight' && --this.weatherT <= 0) { this.weather = null; this.ev({ e: 'weather', kind: null }); }
    for (const sd of this.sides) { const a = sd.active; if (a) { if (a.onField && a.hidden() && !a.flags.revealed) { if (!a.lastSeen) a.lastSeen = { x: a.x, y: a.y }; } else a.lastSeen = null; } }
    for (const sd of this.sides) {
      for (const f of sd.team) {
        if (f === sd.active) {
          if (f.state === 'enter') { if (--f.enterT <= 0) this.becomeActive(f); f.anim.t++; if (f.serpent) f.serpent.update(); continue; }
          if (f.state === 'hidden') continue;
          f.update();
        } else if (f.alive && this.format === 'trainer') {
          f.stamina = Math.min(STAMINA_MAX, f.stamina + STAMINA_REGEN / 2);   // benched: half regen, keeps HP/status
          for (let i = 0; i < 4; i++) if (f.cds[i] > 0) f.cds[i] = Math.max(0, f.cds[i] - 1);
          if (f.dodgeCd > 0) f.dodgeCd--;
        }
      }
      if (sd.switchCd > 0) sd.switchCd--;
    }
    this.separate();
    if (this.laters.length) {
      const due = this.laters.filter((l) => l.t <= this.tick);
      if (due.length) { this.laters = this.laters.filter((l) => l.t > this.tick); for (const l of due) l.fn(); }
    }
    for (const a of this.acts) {
      if (a.done) continue;
      if (a.bound && (!a.owner.move || a.owner.state !== 'act')) { a.done = true; a.end && a.end(a); continue; }
      a.t++;
      a.update && a.update(a);
      if (a.t >= a.ticks && !a.done) { a.done = true; a.end && a.end(a); }
    }
    if (this.acts.some((a) => a.done)) this.acts = this.acts.filter((a) => !a.done);
    this.updateProjectiles();
    this.updateZones();
    this.updateTraps();
    this.updateTrails();
    this.updateWaves();
    this.updateRings();
    if (this.walls.length) this.walls = this.walls.filter((w) => w.until > this.tick && w.hp > 0);
    if (this.decoys.length) this.decoys = this.decoys.filter((d) => d.until > this.tick && !d.dead);
    this.updateClones();
    if (this.feature) this.feature.update();
  }

  updateClock() {
    if (this.timeLeft > 0) this.timeLeft--;
    if (!this.overtime && this.timeLeft <= MATCH.overtimeAt && !this.sudden) { this.overtime = true; this.ev({ e: 'overtime' }); }
    if (this.timeLeft <= 0) {
      if (this.sudden) { this.finish(-1, 'draw'); return; }
      const sc = this.hpScores();
      if (Math.abs(sc[0] - sc[1]) < 0.005) { this.sudden = true; this.timeLeft = MATCH.suddenTicks; this.ev({ e: 'sudden' }); return; }
      this.finish(sc[0] > sc[1] ? 0 : 1, 'time');
    }
  }
  hpScores() { return this.sides.map((sd) => sd.team.reduce((a, f) => a + Math.max(0, f.hp) / f.maxHp, 0) / sd.team.length); }
  finish(winner, reason) {
    this.result = { winner, reason };
    this.phase = 'ko'; this.phaseT = 0; this.koFinal = true;
    for (const f of this.fighters()) if (f.move) this.endMove(f);
    this.ev({ e: reason === 'time' ? 'timeup' : reason === 'draw' ? 'draw' : 'final', result: this.result });
  }

  knockOut(f) {
    if (f.state === 'faint') return;
    const sd = this.sides[f.side];
    if (f.move) this.endMove(f);
    if (f.state === 'trav' && f.T && f.T.interrupt) f.T.interrupt(f);
    f.hp = 0; f.fall = 0; f.sink = 0;   // (a revived Pokémon can faint twice)
    f.setState('faint'); f.faintT = 0; f.status = {}; f.buffs = []; f.flags = {}; f.seeded = null; f.trav = null;
    if (f.serpent) f.serpent.coilNow = true;
    sd.ko++;
    const remaining = sd.team.filter((x) => x.alive).length;
    this.freeze = 18; this.slowmo = 80;
    this.phase = 'ko'; this.phaseT = 0;
    const final = remaining === 0 || this.sudden;
    this.koFinal = final;
    if (final) this.result = { winner: 1 - f.side, reason: this.sudden ? 'sudden' : 'ko' };
    for (const o of this.fighters()) if (o !== f && o.move) this.endMove(o);
    this.projs.length = 0;
    this.ev({ e: 'faint', f, final, env: this.env });
  }
  updateKO() {
    for (const f of this.fighters()) {
      if (f.state === 'faint') {
        f.faintT++;
        if (f.faintT === 1) f.setAnim('Hurt', {});
        // A fainted Mega/Primal reverts to its base form (as in the games); the base sprite carries the faint pose.
        if (f.faintT === 22 && f.form === 'mega') { f.spriteId = f.sp.sprite; f.flashT = this.tick + 10; this.ev({ e: 'megaRevert', f }); }
        if (f.faintT === 22) { f.setAnim(f.meta && f.meta.anims.Faint ? 'Faint' : 'Sleep', { loop: false }); this.ev({ e: 'faintPose', f }); }
        if (this.env === 'air' && f.faintT >= 22 && f.faintT < 58) { f.fall = (f.faintT - 22) / 36; if (f.faintT === 57) this.ev({ e: 'faintLand', f }); }
        if (this.env === 'water' && f.faintT >= 30) f.sink = Math.min(1, (f.faintT - 30) / 60);
        if (f.faintT === 40) this.ev({ e: 'faintText', f });
        f.anim.t++;
      } else if (f.state !== 'victory') { f.vx *= 0.8; f.vy *= 0.8; }
    }
    if (this.phaseT === 80 && this.result && this.result.winner >= 0) {
      const w = this.activeOf(this.result.winner);
      if (w && w.alive) { if (w.move) this.endMove(w); w.setState('victory'); w.setAnim(w.meta && w.meta.anims.Pose ? 'Pose' : w.meta && w.meta.anims.Rotate ? 'Rotate' : 'Hop', { loop: false }); this.ev({ e: 'victory', f: w }); }
    }
    if (this.phaseT > 80) for (const f of this.fighters()) if (f.state === 'victory') { const a = f.animDef(); if (a && f.anim.t >= a.total && f.anim.name !== 'Idle') f.setAnim(f.idleAnim(), { loop: true }); f.anim.t++; }
    if (this.koFinal) {
      if (this.phaseT === 220) { this.phase = 'over'; this.ev({ e: 'over', result: this.result }); }
    } else if (this.phaseT === 100) {
      for (const sd of this.sides) if (sd.active && !sd.active.alive) { this.recall(sd.active.side); sd.replaceT = 0; sd.pendingSwitch = -1; }
      this.phase = 'replace'; this.phaseT = 0;
      this.ev({ e: 'choose', sides: this.sides.map((sd, i) => (sd.active && sd.active.state === 'recalled' ? i : -1)).filter((i) => i >= 0) });
    }
  }
  chooseReplacement(side, slot) { const sd = this.sides[side]; if (sd.team[slot] && sd.team[slot].alive && sd.active && sd.active.state === 'recalled') sd.pendingSwitch = slot; }
  updateReplace() {
    let waiting = false;
    for (const [i, sd] of this.sides.entries()) {
      if (!sd.active || sd.active.state !== 'recalled') continue;
      sd.replaceT++;
      if (sd.pendingSwitch < 0 && sd.replaceT >= 360) sd.pendingSwitch = sd.team.findIndex((f) => f.alive);
      if (!sd.team.some((f) => f.alive)) { this.finish(1 - i, 'ko'); return; }
      if (sd.pendingSwitch >= 0) { this.sendOut(i, sd.team[sd.pendingSwitch], 10); sd.pendingSwitch = -1; }
      else waiting = true;
    }
    if (!waiting && this.phaseT > 4) { this.phase = 'fight'; this.phaseT = 0; this.ev({ e: 'resume' }); }
  }
  canSwitch(side, slot) {
    const sd = this.sides[side], cur = sd.active, nf = sd.team[slot];
    if (cur && cur.state === 'recalling') return false;
    return this.format === 'trainer' && this.phase === 'fight' && nf && nf.alive && nf !== cur && sd.switchCd <= 0 && cur && (cur.canAct() || cur.state === 'hurt' && cur.hitstun < 30);
  }
  requestSwitch(side, slot) {
    if (!this.canSwitch(side, slot)) return false;
    const sd = this.sides[side], cur = sd.active, nf = sd.team[slot];
    sd.switchCd = 240;
    // the outgoing Pokémon stays on the field and can still be hit while the recall beam plays (no free invulnerability)
    if (cur.move) this.endMove(cur);
    cur.setState('recalling'); cur.setAnim(cur.idleAnim(), { loop: true });
    this.ev({ e: 'recallStart', f: cur, side });
    this.later(18, () => {
      if (!cur.alive || sd.active !== cur) return;
      if (this.phase === 'fight' || (this.phase === 'ko' && !this.koFinal)) { this.recall(side); this.sendOut(side, nf, 0); }
      else if (cur.state === 'recalling') { cur.setState('idle'); }
    });
    return true;
  }

  // ------------------------------------------------------------ ultimates / formes
  fireUltimate(f) {
    const sd = this.sides[f.side], sp = f.sp;
    f.ult = 0; f.stats.ults++;
    if (!f.stats.firstUltT) f.stats.firstUltT = this.fightTicks;
    if (f.move) this.endMove(f);
    if (sp.mega && f.form !== 'mega' && !sd.megaUsed) {
      sd.megaUsed = true;
      f.applyForm('mega');
      f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.06));
      f.flags.invuln = this.tick + 70;
      f.setState('act'); f.setAnim('Charge', { loop: true });
      f.move = { def: { id: 'mega', name: sp.mega.name, tier: 'ult', steps: [], recover: 0 }, slot: -1, t: 0, hitT: 999, end: 40, cancelT: 999, fired: new Set(), set: this.newSet(), drive: null, ult: true, s1: 1, wind: 0 };
      this.ev({ e: 'mega', f, name: sp.mega.name, primal: !!sp.mega.primal });
      this.freeze = 60;
      // shockwave push to make space, no damage
      const o = f.foe;
      if (o && o.alive && Math.hypot(o.x - f.x, o.y - f.y) < 70) { const a = Math.atan2(o.y - f.y, o.x - f.x); o.kvx += Math.cos(a) * 5; o.kvy += Math.sin(a) * 5; }
      if (sp.mega.onMega && sp.mega.onMega.unstoppable) f.flags.unstoppable = this.tick + sp.mega.onMega.unstoppable;
      if (sp.mega.primal) this.setWeather('rain', 600, f);
      return;
    }
    const ultId = (f.form === 'mega' && sp.mega && sp.mega.ult) || sp.ult;
    const m = CONTENT.moves[ultId];
    if (m) { startMove(f, m, -1); this.ev({ e: 'ultimate', f, name: m.name }); }
  }
  formeChange(f) {
    if ((f.formeCd || 0) > this.tick) return;
    const order = ['normal', 'attack', 'defense', 'speed'];
    const cur = f.form || 'normal';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    f.formeCd = this.tick + 150;
    f.applyForm(next === 'normal' ? null : next);
    f.setAnim(f.idleAnim(), { loop: true });
    this.ev({ e: 'forme', f, forme: next });
  }

  // ------------------------------------------------------------ physics
  separate() {
    const fs = this.fighters().filter((f) => f.state !== 'hidden' && f.state !== 'recalled' && f.state !== 'enter' && !f.flags.intangible && !f.flags.hidden && f.state !== 'faint' && !f.flags.airborne);
    if (fs.length < 2) return;
    const [a, b] = fs;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = (a.r + b.r) * 0.8;
    if (d < min) {
      const p = (min - d) / 2, nx = dx / d, ny = dy / d;
      const pa = this.collideBody(a, a.x - nx * p, a.y - ny * p), pb = this.collideBody(b, b.x + nx * p, b.y + ny * p);
      a.x = pa.x; a.y = pa.y; b.x = pb.x; b.y = pb.y;
      // dash clash: two charging fighters meet head-on
      if (a.move && b.move && a.move.drive && b.move.drive && !a.move.clashed) {
        a.move.clashed = b.move.clashed = true;
        a.move.drive = b.move.drive = null;
        a.kvx -= nx * 4; a.kvy -= ny * 4; b.kvx += nx * 4; b.kvy += ny * 4;
        this.ev({ e: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        this.freeze = 8;
      }
    }
  }
  collideBody(f, nx, ny) {
    const b = this.bounds, r = f.r;
    let hit = false, p = { x: nx, y: ny };
    if (f.tv && f.tv.bounceWalls && f.state !== 'hurt') {
      if (p.x < b.x0 + r || p.x > b.x1 - r) { f.vx = -f.vx; hit = 'bounce'; }
      if (p.y < b.y0 + r || p.y > b.y1 - r) { f.vy = -f.vy; hit = 'bounce'; }
    }
    if (p.x < b.x0 + r || p.x > b.x1 - r || p.y < b.y0 + r || p.y > b.y1 - r) { hit = hit || 'wall'; p.x = clamp(p.x, b.x0 + r, b.x1 - r); p.y = clamp(p.y, b.y0 + r, b.y1 - r); }
    if (!f.flags.intangible && !f.flags.airborne) {
      for (const o of this.obstacles) { const q = pushOut(p, o, r); if (q !== p) { hit = hit || 'obstacle'; if (f.tv && f.tv.bounceWalls) { const nxv = q.x - p.x, nyv = q.y - p.y, l = Math.hypot(nxv, nyv) || 1; const dot = (f.vx * nxv + f.vy * nyv) / l; f.vx -= 2 * dot * nxv / l; f.vy -= 2 * dot * nyv / l; } p = q; } }
      for (const w of this.walls) { const q = pushOutSeg(p, w, r); if (q !== p) { hit = hit || 'wall'; p = q; } }
    }
    if (this.feature && this.feature.collide) p = this.feature.collide(f, p) || p;
    p.hit = hit;
    return p;
  }

  // ------------------------------------------------------------ combat resolution
  hit(att, tgt, sp) {
    if (!tgt || !tgt.alive || this.phase !== 'fight') return false;
    if (tgt.state === 'recalled' || tgt.state === 'hidden' || (tgt.state === 'enter' && tgt.enterT > 14) || tgt.state === 'faint') return false;
    if (tgt.flags.intangible || tgt.flags.hidden) return false;
    tgt.sets = tgt.sets || new Set();
    if (sp.set && tgt.sets.has(sp.set)) return false;
    if (tgt.sets.size > 4000) tgt.sets.clear();
    const ang = sp.kbAng !== undefined ? sp.kbAng : Math.atan2(tgt.y - att.y, tgt.x - att.x);
    // invulnerable (dodge frames, Protect, send-out)
    if (tgt.flags.invuln) {
      if (sp.set) tgt.sets.add(sp.set);
      if (tgt.flags.dodgeIframe && !sp.multi) {
        if ((tgt.state === 'dodge' || tgt.state === 'trav') && tgt.st <= 9) {
          tgt.perfect = 70; tgt.stats.perfect++;
          this.slowmo = Math.max(this.slowmo, 24);
          this.ev({ e: 'perfect', f: tgt });
        } else this.ev({ e: 'evade', f: tgt });
      } else if (tgt.flags.protect) this.ev({ e: 'protected', f: tgt });
      return false;
    }
    // Counter: negate a contact hit and strike back
    if (tgt.flags.counter && sp.contact && !sp.ranged && !att.isEnv) {
      if (sp.set) tgt.sets.add(sp.set);
      delete tgt.flags.counter;
      this.ev({ e: 'counter', f: tgt });
      tgt.setAnim('Attack', {});
      this.hit(tgt, att, { att: tgt, power: (tgt.flags.counterPow || 60) * 1.6, type: 'Fighting', cat: 'physical', kb: 4.5, stun: 30, set: this.newSet(), heavy: true, x: att.x, y: att.y - 10, fx: 'Focus_Blast_Hit' });
      return true;
    }
    // type effectiveness (Ground moves miss levitating fighters)
    let raw = rawEffect(sp.type, tgt.types);
    if (sp.dual) raw *= rawEffect(sp.dual, tgt.types);
    if (sp.superVs && tgt.types.includes(sp.superVs)) raw = Math.max(raw, 2) * (tgt.types.length > 1 ? rawEffect(sp.type, tgt.types.filter((t) => t !== sp.superVs)) : 1);
    if (sp.type === 'Ground' && (tgt.sp.levitate || this.env === 'air' || tgt.flags.airborne)) raw = 0;
    const eff = arenaEffect(raw);
    if (sp.set) tgt.sets.add(sp.set);
    if (eff === 0) { this.ev({ e: 'immune', f: tgt, att, type: sp.type }); return true; }
    tgt.flags.revealed = this.tick + 40;
    const statusOnly = !(sp.power > 0);
    // front barrier (Iron Defense) blocks from the front
    let blocked = false;
    if (!sp.ignoreBarrier && tgt.flags.front && Math.abs(angDiff(tgt.aim, Math.atan2(att.y - tgt.y, att.x - tgt.x))) < (tgt.flags.frontArc || 2.2) / 2) blocked = true;
    let dmg = 0;
    if (!statusOnly) {
      const A = att.stat(sp.cat === 'special' ? 'spa' : 'atk'), D = tgt.stat(sp.cat === 'special' ? 'spd' : 'def');
      const stab = att.types.includes(sp.type) ? 1.2 : 1;
      dmg = sp.power * TUNING.dmgK * (this.format === 'trainer' ? TUNING.trainerDmg : TUNING.pokemonDmg)[this.env] * (A + 100) / (D + 100) * stab * eff * (0.92 + this.rng() * 0.16) * att.dmgMul() * tgt.armor();
      if (att.perfect > 0 && !sp.multi) { dmg *= 1.3; att.perfect = 0; this.ev({ e: 'perfectHit', f: att }); }
      if (sp.crit && this.rng() < sp.crit) { dmg *= 1.5; this.ev({ e: 'crit', f: tgt }); }
      if (att.tv && att.tv.updraft > this.tick) dmg *= 1.2;
      if (blocked) { dmg *= 0.15; this.ev({ e: 'block', f: tgt }); }
      if (this.weatherOn('rain') && sp.type === 'Water') dmg *= 1.25;
      if (this.weatherOn('rain') && sp.type === 'Fire') dmg *= 0.8;
      if (this.sudden) dmg = Math.max(dmg, tgt.hp + 1);
      dmg = Math.max(1, Math.round(dmg));
      if (tgt.flags.shieldHp > 0 && tgt.flags.shieldUntil > this.tick) { const ab = Math.min(tgt.flags.shieldHp, dmg); tgt.flags.shieldHp -= ab; dmg -= ab; this.ev({ e: 'shieldHit', f: tgt, amt: ab }); }
      tgt.hp = Math.max(0, tgt.hp - dmg);
      att.stats.dealt += dmg; att.stats.hits++; tgt.stats.taken += dmg; if (eff > 1) att.stats.se++;
      if (att.stats.moveDmg) { const k = sp.moveId || 'other'; att.stats.moveDmg[k] = (att.stats.moveDmg[k] || 0) + dmg; }
      att.gainUlt(dmg / tgt.maxHp * (sp.ult ? 8 : TUNING.ultDealt)); tgt.gainUlt(dmg / tgt.maxHp * TUNING.ultTaken);
      tgt.lastHitBy = att;
    }
    // knockback + hitstun
    const kb = blocked || statusOnly ? 0 : (sp.kb || 0) * tgt.weightMul * (sp.heavy ? 1.15 : 1) * tgt.kbTaken() * (this.env === 'air' ? 1.12 : 1);
    tgt.kvx += Math.cos(ang) * kb; tgt.kvy += Math.sin(ang) * kb;
    if (!statusOnly) {
      if (!blocked && sp.stun > 0 && !sp.noFlinch && !tgt.flags.unstoppable) tgt.hurt(sp.stun, ang);
      else if (!blocked && !tgt.flags.unstoppable && sp.multi && tgt.state !== 'act') tgt.hitstun = Math.max(tgt.hitstun, 3);
      if (sp.launch && !blocked && !tgt.flags.unstoppable && !(tgt.flags.stunImmune > this.tick) && (tgt.stunLoad || 0) < 60 && this.env !== 'water') {
        // juggles: at most two re-launches while airborne, and never above ~30 units
        const air = tgt.z > 2; tgt.juggle = air ? (tgt.juggle || 0) + 1 : 0;
        if (tgt.juggle <= 2) { tgt.vz = Math.min(sp.launch * 0.11, Math.sqrt(0.5 * Math.max(0, 30 - tgt.z))); tgt.z = Math.max(tgt.z, 1); tgt.launched = true; }
      }
      if (sp.defDown) tgt.addBuff('def', 0.85, 300, 'defdown');
      tgt.flashT = this.tick + (sp.multi ? 2 : 5);
    }
    // status
    if (tgt.status.sleep && !sp.keepSleep && !statusOnly) { delete tgt.status.sleep; tgt.wakeUp(); }
    if (tgt.status.freeze && sp.type === 'Fire') { delete tgt.status.freeze; tgt.wakeUp(); }
    if (sp.status && !blocked) this.tryStatus(tgt, sp.status, att);
    if (sp.drain && !att.status.healBlock) this.heal(att, dmg * sp.drain);
    if (sp.healBlock) tgt.status.healBlock = sp.healBlock;
    if (!statusOnly) this.freeze = Math.max(this.freeze, sp.multi ? 1 : sp.heavy ? 6 : 3);
    if (sp.zone) sp.zone.hitAny = true;
    if (!statusOnly || sp.status) this.ev({ e: 'hit', att, tgt, dmg, eff, type: sp.type, x: sp.x ?? tgt.x, y: sp.y ?? tgt.y - 10, heavy: sp.heavy, multi: sp.multi, fx: sp.fx, set: sp.set, blocked, ult: sp.ult, statusOnly, kb });
    if (this.sudden && tgt.hp > 0 && !statusOnly) tgt.hp = 0;
    if (tgt.hp <= 0) this.knockOut(tgt);
    return true;
  }
  tryStatus(tgt, st, att) {
    for (const [k, v] of Object.entries(st)) {
      const chance = typeof v === 'number' ? v : v.chance ?? 1;
      if (this.rng() >= chance) continue;
      if (tgt.statusImmune[k] || tgt.status[k]) continue;
      if (k === 'burn' && tgt.types.includes('Fire')) continue;
      if (k === 'poison' && (tgt.types.includes('Poison') || tgt.types.includes('Steel'))) continue;
      if (k === 'para' && tgt.types.includes('Electric')) continue;
      if (k === 'freeze' && tgt.types.includes('Ice')) continue;
      if ((k === 'sleep' || k === 'freeze' || k === 'flinch') && tgt.flags.unstoppable) continue;
      const dur = { burn: 240, poison: 300, para: 240, sleep: 66, freeze: 72, confuse: 150, slow: 120, flinch: 10 }[k] || 120;
      let ticks = typeof v === 'object' && v.ticks ? v.ticks : dur;
      if (k === 'sleep') ticks = Math.min(ticks, 72);   // at most 1.2 s, never chained (immunity below)
      if (k === 'flinch') { tgt.hurt(ticks); continue; }
      tgt.status[k] = ticks;
      if (k === 'poison' && typeof v === 'object' && v.ticks >= 300) tgt.status.badPoison = true;
      if (k === 'slow') tgt.status.slowMul = (typeof v === 'object' && v.mul) || 0.6;
      if (k === 'sleep' || k === 'freeze') {
        tgt.statusImmune[k] = this.tick + ticks + 300;
        if (tgt.move) this.endMove(tgt);
        if (tgt.state === 'dodge' || tgt.state === 'trav') { if (tgt.T && tgt.T.interrupt) tgt.T.interrupt(tgt); tgt.trav = null; tgt.setState('idle'); }
        if (tgt.state === 'hurt') tgt.setState('idle');
        tgt.setAnim(k === 'sleep' ? 'Sleep' : 'Idle', { loop: true, speed: k === 'freeze' ? 0 : 1 });
        tgt.vx = tgt.vy = 0;
      }
      this.ev({ e: 'status', f: tgt, kind: k });
    }
  }
  dot(f, amt, kind) {
    if (!f.alive || this.phase !== 'fight') return;
    const d = Math.max(1, Math.round(amt));
    f.hp = Math.max(0, f.hp - d);
    if (f.lastHitBy && f.lastHitBy.stats) f.lastHitBy.stats.dealt += d;
    this.ev({ e: 'dot', f, dmg: d, kind });
    if (f.hp <= 0) this.knockOut(f);
  }
  heal(f, amt) {
    if (!f.alive || f.status.healBlock) return;
    const h = Math.max(0, Math.min(f.maxHp - f.hp, Math.round(amt)));
    if (h <= 0) return;
    f.hp += h;
    this.ev({ e: 'heal', f, amt: h });
  }
  wallSlam(f, speed, res) {
    const att = f.lastHitBy || this.activeOf(1 - f.side);
    const dmg = Math.round(f.maxHp * 0.035 + speed * 2.2);
    f.hp = Math.max(0, f.hp - dmg);
    if (att && att.stats) att.stats.dealt += dmg;
    f.kvx *= -0.3; f.kvy *= -0.3;
    if (!f.flags.unstoppable && f.state !== 'faint') f.hurt(18);
    this.freeze = Math.max(this.freeze, 6);
    this.ev({ e: 'wallSlam', f, x: f.x, y: f.y, dmg });
    this.ev({ e: 'shake', amt: 5 });
    if (this.feature && this.feature.onSlam) this.feature.onSlam(f);
    if (f.hp <= 0) this.knockOut(f);
  }
  selfHit(f) {
    const dmg = Math.round(f.maxHp * 0.05);
    f.hp = Math.max(1, f.hp - dmg); f.hurt(18);
    this.ev({ e: 'selfHit', f, dmg });
  }

  // ------------------------------------------------------------ projectiles
  updateProjectiles() {
    for (const p of this.projs) {
      if (p.dead) continue;
      p.t++;
      const o = p.owner.isEnv ? null : p.owner.foe;
      if (p.lob) {
        const k = Math.min(1, p.t / p.lobT);
        p.x = p.lobFrom.x + (p.lobTo.x - p.lobFrom.x) * k; p.y = p.lobFrom.y + (p.lobTo.y - p.lobFrom.y) * k;
        p.z = Math.sin(k * Math.PI) * (p.lob.apex || 40) + 4;
        if (k >= 1) this.explodeProj(p);
        continue;
      }
      if (p.homing && o && o.alive && !o.hidden()) {
        const want = Math.atan2(o.y - p.y, o.x - p.x), cur = Math.atan2(p.vy, p.vx);
        const na = cur + clamp(angDiff(cur, want), -p.homing, p.homing);
        p.vx = Math.cos(na) * p.speed; p.vy = Math.sin(na) * p.speed;
      }
      if (p.boomerang && p.returning) {
        const ow = p.owner, a = Math.atan2(ow.y - p.y, ow.x - p.x);
        p.vx = Math.cos(a) * p.speed; p.vy = Math.sin(a) * p.speed;
        if (Math.hypot(ow.x - p.x, ow.y - p.y) < ow.r + 4 || !ow.onField) { p.dead = true; this.ev({ e: 'catch', f: ow }); continue; }
      }
      p.x += p.vx; p.y += p.vy; p.travelled += p.speed;
      if (p.trail && p.t % p.trailGap === 0) this.fxAt(p.trail, p.x, p.y, { z: p.z + (p.trailDz || 0), dirAng: Math.atan2(p.vy, p.vx), layer: 'back' });
      if (this.feature && this.feature.onProj) this.feature.onProj(p);
      // walls / bounds
      let wallHit = !this.inBounds(p.x, p.y, 2);
      for (const ob of this.obstacles) if (inObstacle(p.x, p.y, ob, p.r * 0.5)) wallHit = true;
      for (const w of this.walls) if (segDist(p.x, p.y, w.x0, w.y0, w.x1, w.y1) < w.th / 2 + p.r * 0.5 && w.owner !== p.owner) { wallHit = true; w.hp = (w.hp ?? 6) - 1; this.ev({ e: 'wallHit', w, x: p.x, y: p.y }); }
      if (wallHit) {
        if (p.bounce > 0) {
          p.bounce--; const b = this.bounds;
          if (p.x < b.x0 + 2 || p.x > b.x1 - 2) p.vx = -p.vx; else if (p.y < b.y0 + 2 || p.y > b.y1 - 2) p.vy = -p.vy; else { p.vx = -p.vx; p.vy = -p.vy; }
          p.x += p.vx * 2; p.y += p.vy * 2; p.set = this.newSet();
          this.ev({ e: 'bounce', x: p.x, y: p.y });
        } else if (p.boomerang && !p.returning) { p.returning = true; p.set = this.newSet(); }
        else { if (this.feature && this.feature.onProjEnd) this.feature.onProjEnd(p); this.explodeProj(p); continue; }
      }
      if (p.travelled >= p.range) {
        if (p.boomerang && !p.returning) { p.returning = true; p.set = this.newSet(); }
        else { this.explodeProj(p); continue; }
      }
      // decoys absorb hits (Substitute log)
      for (const d of this.decoys) if (d.owner.side !== p.owner.side && Math.hypot(d.x - p.x, d.y - p.y) < d.r + p.r) { d.dead = true; this.ev({ e: 'decoyPop', d }); if (!p.pierce) this.explodeProj(p, true); }
      if (p.dead) continue;
      // projectile clash
      for (const q of this.projs) {
        if (q === p || q.dead || q.owner.side === p.owner.side || q.lob) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < p.r + q.r) {
          // weighted clash: a projectile pushes through a much weaker one (losing that much weight), comparable ones
          // cancel; giant projectiles always win against normal ones. Stops pellet sprays from shielding against big shots.
          const wp = p.clashW ?? (p.clashW = Math.max(10, p.spec.power || 0) * (p.big > 1 ? 3 : 1));
          const wq = q.clashW ?? (q.clashW = Math.max(10, q.spec.power || 0) * (q.big > 1 ? 3 : 1));
          if ((p.big > 1 && q.big <= 1) || wp > wq * 1.5) { q.dead = true; p.clashW = wp - wq; }
          else if ((q.big > 1 && p.big <= 1) || wq > wp * 1.5) { p.dead = true; q.clashW = wq - wp; }
          else { p.dead = q.dead = true; }
          this.ev({ e: 'clash', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: p.z });
          if (p.dead) break;
        }
      }
      // beams eat enemy projectiles
      for (const f of this.fighters()) if (f.side !== p.owner.side) for (const r of f.beams) if (segDist(p.x, p.y, r.x0, r.y0, r.x1, r.y1) < r.w / 2 + p.r && !p.big) { p.dead = true; this.ev({ e: 'clash', x: p.x, y: p.y, z: p.z }); }
      if (p.dead) { this.dropCoin(p); continue; }
      if (!o || !o.alive || !o.onField) continue;
      if (p.pullIn && Math.hypot(o.x - p.x, o.y - p.y) < 64) { const a = Math.atan2(p.y - o.y, p.x - o.x); o.kvx += Math.cos(a) * p.pullIn; o.kvy += Math.sin(a) * p.pullIn; }
      // absorb bubble (Mist)
      if (o.flags.absorb && Math.hypot(o.x - p.x, o.y - p.y) < (o.flags.absorbR || 30)) { p.dead = true; this.ev({ e: 'absorb', f: o, x: p.x, y: p.y }); continue; }
      if (this.reach(o, p.x, p.y) <= p.r) {
        // reflect (Barrier, Light Screen, Mirror Coat)
        if (o.flags.reflect && (p.reflectable || o.flags.reflectAll)) {
          p.owner = o; p.vx = -p.vx; p.vy = -p.vy; p.set = this.newSet(); p.spec = Object.assign({}, p.spec, { att: o, set: p.set }); p.travelled = 0; p.homing = 0; p.returning = false; p.boomerang = false;
          this.ev({ e: 'reflect', f: o, x: p.x, y: p.y });
          continue;
        }
        if (p.multiHit) {
          if (p.t - (p.lastHitT ?? -999) < p.multiHit || p.hitCount >= 5) continue;
          p.lastHitT = p.t; p.set = this.newSet();
        }
        const sp = Object.assign({}, p.spec, { set: p.set, x: p.x, y: p.y - p.z, kbAng: Math.atan2(p.vy, p.vx), ranged: true, multi: p.multiHit ? p.hitCount < 4 : p.spec.multi, noFlinch: p.multiHit ? p.hitCount > 0 : !!p.spec.noFlinch });
        const ok = this.hit(p.owner, o, sp);
        if (ok) {
          p.hitCount++;
          if (p.pull) { const a = Math.atan2(p.owner.y - o.y, p.owner.x - o.x); const d = Math.hypot(p.owner.x - o.x, p.owner.y - o.y); o.kvx += Math.cos(a) * Math.min(p.pull, d * 0.11); o.kvy += Math.sin(a) * Math.min(p.pull, d * 0.11); this.ev({ e: 'pull', f: o, from: p.owner }); }
          if (p.onHit) (typeof p.onHit === 'string' ? SPECIALS[p.onHit] : p.onHit)(p, o, this);
          if (p.hitFx) this.fxAt(p.hitFx, o.x, o.y - 12, { z: 0, layer: 'front' });
          if (!p.pierce && !p.multiHit) { p.dead = true; this.dropCoin(p); if (p.onEnd) (typeof p.onEnd === 'string' ? SPECIALS[p.onEnd] : p.onEnd)(p, this); }
        }
      }
    }
    if (this.projs.some((p) => p.dead)) this.projs = this.projs.filter((p) => !p.dead);
  }
  dropCoin(p) {
    if (p.dropCoin && !p.coinDropped && this.inBounds(p.x, p.y, 4)) { p.coinDropped = true; this.coins.push({ owner: p.owner, x: p.x, y: p.y, until: this.tick + 600 }); }
  }
  explodeProj(p, silent) {
    p.dead = true;
    this.dropCoin(p);
    if (p.lob && p.lob.r) {
      // lobbed shells burst on landing (Egg Bomb, Sludge Bomb)
      const zsp = Object.assign({}, p.spec, { set: this.newSet(), ranged: true });
      const zst = Object.assign({ kbOut: true }, p.lob.zone || {});
      if (zst.healOwner) zst.heal = zst.healOwner;
      if (zst.healBlock) zsp.healBlock = zst.healBlock;
      this.zones.push({ id: this.newSet(), owner: p.owner, x: p.x, y: p.y, r: p.lob.r, t: 0, delay: 0, ticks: 1, interval: 1, spec: zsp, st: zst, set: zsp.set, burst: p.lob.burst || p.hitFx, moveId: p.moveId, type: p.type });
    } else if (!silent) this.ev({ e: 'fizzle', x: p.x, y: p.y, z: p.z, fx: p.hitFx, name: p.fxName });
    if (p.onEnd) (typeof p.onEnd === 'string' ? SPECIALS[p.onEnd] : p.onEnd)(p, this);
  }

  // ------------------------------------------------------------ zones (areas, strikes, lingering fields)
  updateZones() {
    for (const z of this.zones) {
      if (z.dead) continue;
      const zt = z.t++;           // a zone is evaluated on the tick it is created (lt 0 = burst tick)
      if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; if (!z.follow.alive || !z.follow.onField) { z.dead = true; this.ev({ e: 'zoneEnd', z }); continue; } }
      if (z.trackTarget && zt < z.trackTarget.until) { const o = z.trackTarget.o; z.x += clamp(o.x - z.x, -0.6, 0.6); z.y += clamp(o.y - z.y, -0.6, 0.6); }
      if (zt < z.delay) continue;
      const lt = zt - z.delay;
      const st = z.st || {};
      if (lt === 0) {
        if (z.burst) this.fxAt(z.burst, z.x, z.y, { z: 0, r: z.r, layer: 'front' });
        if (st.burstSfx) this.ev({ e: 'sfx', id: st.burstSfx, x: z.x });
        if (st.shake) this.ev({ e: 'shake', amt: st.shake });
        if (st.crack && this.env === 'ground') this.ev({ e: 'decal', kind: 'crack', x: z.x, y: z.y, r: z.r });
        if (st.scorch && this.env === 'ground') this.ev({ e: 'decal', kind: 'scorch', x: z.x, y: z.y, r: z.r });
        if (z.ticks > 1) this.ev({ e: 'zone', z });
        if (st.onStart) st.onStart(z, this);
        if (z.fall) this.ev({ e: 'impact', x: z.x, y: z.y, r: z.r });
      }
      for (const f of this.fighters()) {
        if (!f.alive || !f.onField || f.state === 'enter' || f.flags.intangible) continue;
        const d = this.reach(f, z.x, z.y);
        const isOwner = f === z.owner;
        if (isOwner) {
          if (d <= z.r && st.heal && lt % z.interval === 0) this.heal(f, f.maxHp * st.heal);
          continue;
        }
        if (z.owner.side === f.side) continue;
        if (st.trap && lt > 0) {
          const dd = Math.hypot(f.x - z.x, f.y - z.y);
          if (dd < z.r + 6 && dd > z.r - f.r && f.state !== 'dodge' && f.state !== 'trav') { const a = Math.atan2(f.y - z.y, f.x - z.x); f.x = z.x + Math.cos(a) * (z.r - f.r); f.y = z.y + Math.sin(a) * (z.r - f.r); }
        }
        if (d > z.r) continue;
        if (st.pull) { const a = Math.atan2(z.y - f.y, z.x - f.x); f.kvx += Math.cos(a) * st.pull; f.kvy += Math.sin(a) * st.pull; }
        if (st.push) { const a = Math.atan2(f.y - z.y, f.x - z.x); f.kvx += Math.cos(a) * st.push; f.kvy += Math.sin(a) * st.push; }
        if (st.slow) { f.status.slow = Math.max(f.status.slow || 0, 14); f.status.slowMul = st.slow; }
        if (st.lift && lt > 10 && !f.flags.unstoppable) { f.z = Math.min(26, f.z + 1.2); f.vz = 0; f.hitstun = Math.max(f.hitstun, 4); if (f.state !== 'hurt') f.hurt(6); }
        if (z.spec && (z.spec.power > 0 || z.spec.status) && lt % z.interval === 0) {
          const set = z.ticks > 1 ? this.newSet() : z.set;
          const kbAng = st.kbOut || z.ticks === 1 ? Math.atan2(f.y - z.y, f.x - z.x) : undefined;
          const first = !z.hitN;
          const sp = Object.assign({}, z.spec, { set, x: f.x, y: f.y - 10, kbAng, multi: z.ticks > 1, stun: z.ticks > 1 ? (first ? z.spec.stun : 0) : z.spec.stun, noFlinch: z.ticks > 1 && !first, keepSleep: st.keepSleep, zone: z, ranged: true });
          if (st.onceStatus && z.statusDone) sp.status = null;
          if (st.kb !== undefined && z.ticks === 1) sp.kb = st.kb;
          if (this.hit(z.owner, f, sp)) { z.hitN = (z.hitN || 0) + 1; if (sp.status && st.onceStatus) z.statusDone = true; }
        }
      }
      if (st.tickFn) st.tickFn(z, this, lt);
      if (lt >= z.ticks - 1) {
        z.dead = true;
        if (z.ticks > 1) this.ev({ e: 'zoneEnd', z });
        if (st.finisher) this.zones.push({ id: this.newSet(), owner: z.owner, x: z.x, y: z.y, r: st.finisher.r, t: 0, delay: 0, ticks: 1, interval: 1, spec: Object.assign({}, z.spec, { power: st.finisher.power, set: this.newSet(), stun: 24, kb: 5, heavy: true }), st: { kbOut: true, shake: 6 }, set: this.newSet(), burst: st.finisher.burst, moveId: z.moveId, type: z.type });
        if (st.freezeEnd) for (const f of this.fighters()) if (f !== z.owner && f.alive && Math.hypot(f.x - z.x, f.y - z.y) < z.r) this.tryStatus(f, { freeze: { chance: 1, ticks: st.freezeEnd } }, z.owner);
      }
    }
    if (this.zones.some((z) => z.dead)) this.zones = this.zones.filter((z) => !z.dead);
  }

  // ------------------------------------------------------------ trails (Suicune wind, Raikou volt, Moltres fire, Articuno mist, Ho-Oh rainbow)
  updateTrails() {
    if (!this.trails.length) return;
    for (const t of this.trails) {
      if (t.until <= this.tick) { t.dead = true; continue; }
      if (this.phase !== 'fight') continue;
      const ow = t.owner, o = ow.foe;
      if (t.kind === 'rainbow') { if (ow.alive && this.tick % 10 === 0 && Math.hypot(ow.x - t.x, ow.y - t.y) < t.r && this.tick - t.born > 20) this.heal(ow, ow.maxHp * 0.0035); continue; }
      if (!o || !o.alive || !o.onField || o.flags.intangible || Math.hypot(o.x - t.x, o.y - t.y) > t.r + o.r * 0.5) continue;
      if (t.kind === 'mist') { o.status.slow = Math.max(o.status.slow || 0, 10); o.status.slowMul = 0.75; }
      if ((t.kind === 'fire' || t.kind === 'volt') && (o.trailHitT || 0) <= this.tick) {
        o.trailHitT = this.tick + 30;
        this.hit(ow, o, { att: ow, power: t.kind === 'fire' ? 10 : 16, type: t.kind === 'fire' ? 'Fire' : 'Electric', cat: 'special', kb: 0.4, stun: t.kind === 'volt' ? 8 : 0, set: this.newSet(), status: t.kind === 'fire' ? { burn: 0.1 } : { para: 0.15 }, multi: true, x: o.x, y: o.y - 8, ranged: true });
      }
    }
    this.trails = this.trails.filter((t) => !t.dead);
  }
  // ------------------------------------------------------------ sweeping waves (Surf, Azure Bay)
  updateWaves() {
    if (!this.waves.length) return;
    for (const w of this.waves) {
      w.t++; w.x += w.vx;
      for (const f of this.fighters()) {
        if (!f.alive || !f.onField || f.flags.intangible || f.flags.submerged || w.owner === f) continue;
        if (Math.abs(f.x - w.x) < w.w / 2 + f.r && Math.abs(f.y - w.y) < w.h / 2) {
          f.kvx += Math.sign(w.vx) * (w.push || 0.9); f.kvy *= 0.9;
          if (w.spec && !w.owner.isEnv && w.owner.side !== f.side) this.hit(w.owner, f, Object.assign({}, w.spec, { set: w.set, x: f.x, y: f.y - 10, kbAng: w.vx > 0 ? 0 : Math.PI, ranged: true }));
        }
      }
      const b = this.bounds;
      if (w.x < b.x0 - 60 || w.x > b.x1 + 60) w.dead = true;
    }
    this.waves = this.waves.filter((w) => !w.dead);
  }
  // ------------------------------------------------------------ expanding rings (Sheer Cold)
  updateRings() {
    if (!this.rings.length) return;
    for (const r of this.rings) {
      r.t++; r.r += r.vr;
      for (const f of this.fighters()) {
        if (f === r.owner || !f.alive || !f.onField || f.flags.intangible) continue;
        const d = Math.hypot(f.x - r.x, f.y - r.y);
        if (Math.abs(d - r.r) < r.w / 2 + f.r) this.hit(r.owner, f, Object.assign({}, r.spec, { set: r.set, x: f.x, y: f.y - 10, kbAng: Math.atan2(f.y - r.y, f.x - r.x), ranged: true }));
      }
      if (r.r >= r.maxR) { r.dead = true; this.ev({ e: 'ringEnd', ring: r }); }
    }
    this.rings = this.rings.filter((r) => !r.dead);
  }

  // ------------------------------------------------------------ summons
  addWall(w) { w.id = this.newSet(); this.walls.push(w); this.ev({ e: 'wall', w }); }
  addDecoy(f, st) {
    const d = { owner: f, x: f.x, y: f.y, r: f.r, until: this.tick + (st.ticks || 120), kind: st.kind || 'log', dir: f.dir, id: this.newSet() };
    this.decoys.push(d); this.ev({ e: 'decoy', d });
  }
  addClones(f, st) {
    for (let i = 0; i < (st.n || 2); i++) {
      const a = f.aim + (i === 0 ? 1.3 : -1.3);
      const p = this.clampPoint(f.x + Math.cos(a) * 26, f.y + Math.sin(a) * 26, f.r);
      this.clones.push({ owner: f, x: p.x, y: p.y, r: f.r, until: this.tick + (st.ticks || 300), dir: f.dir, t: 0, mirrored: -1, slot: i, id: this.newSet() });
    }
    this.ev({ e: 'clones', f });
  }
  updateClones() {
    if (!this.clones.length) return;
    for (const c of this.clones) {
      c.t++;
      const f = c.owner, o = f.foe;
      if (!f.alive || !f.onField || c.until <= this.tick) { c.dead = true; this.ev({ e: 'clonePop', c }); continue; }
      const a = f.aim + (c.slot === 0 ? 1.4 : -1.4);
      const p = this.clampPoint(f.x + Math.cos(a) * 30, f.y + Math.sin(a) * 30, f.r);
      c.x += (p.x - c.x) * 0.18; c.y += (p.y - c.y) * 0.18;
      c.dir = f.dir;
      // copy the next attack weakly
      if (f.move && f.move.slot >= 0 && f.move.t === f.move.hitT && o && o.alive && c.mirrored !== f.move.set) {
        c.mirrored = f.move.set;
        const ang = Math.atan2(o.y - c.y, o.x - c.x);
        this.projs.push({ id: this.newSet(), owner: f, x: c.x, y: c.y, z: 10, vx: Math.cos(ang) * 5, vy: Math.sin(ang) * 5, speed: 5, r: 6, range: 170, travelled: 0, set: this.newSet(), spec: { att: f, power: 16, type: f.types[0], cat: 'special', kb: 1, stun: 6 }, fxName: 'Flame_Wheel|Water', fxFT: 2, t: 0, reflectable: true, big: 1, hitFx: 'Bubble_Pop_Blue' });
        this.ev({ e: 'cloneAttack', c });
      }
      if (o) for (const p2 of this.projs) if (p2.owner === o && !p2.dead && Math.hypot(p2.x - c.x, p2.y - c.y) < c.r + p2.r) { p2.dead = true; c.dead = true; this.ev({ e: 'clonePop', c }); }
    }
    this.clones = this.clones.filter((c) => !c.dead);
  }
  addTraps(f, st, m) {
    const o = f.foe; if (!o) return;
    for (let i = 0; i < (st.n || 3); i++) {
      const a = (i / (st.n || 3)) * TAU + this.rng();
      const p = this.clampPoint(o.x + Math.cos(a) * (st.spread || 40) * (0.5 + this.rng() * 0.5), o.y + Math.sin(a) * (st.spread || 40) * 0.6, 6);
      this.traps.push({ owner: f, x: p.x, y: p.y, r: 9, born: this.tick, until: this.tick + (st.ticks || 600), kind: st.trap || 'toxic', id: this.newSet(), spec: { att: f, power: st.power || 8, type: 'Poison', cat: 'physical', kb: 0.5, stun: 10, status: { poison: 1 } } });
    }
    this.ev({ e: 'traps', f });
  }
  addCoins(f, st) {
    for (let i = 0; i < (st.n || 6); i++) {
      const a = f.aim + (i - 2.5) * 0.35, d = 30 + this.rng() * 60;
      const p = this.clampPoint(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 4);
      this.coins.push({ owner: f, x: p.x, y: p.y, until: this.tick + 600 });
    }
  }
  updateTraps() {
    if (this.traps.length) {
      for (const t of this.traps) {
        if (t.until <= this.tick) { t.dead = true; continue; }
        const o = t.owner.foe;
        if (o && o.alive && o.onField && this.tick - t.born > 20 && !o.flags.airborne && !o.flags.intangible && this.env !== 'air' && !o.sp.levitate && Math.hypot(o.x - t.x, o.y - t.y) < t.r + o.r * 0.6) {
          t.dead = true; this.hit(t.owner, o, Object.assign({}, t.spec, { set: this.newSet(), x: t.x, y: t.y }));
          this.ev({ e: 'trapPop', t });
        }
      }
      this.traps = this.traps.filter((t) => !t.dead);
    }
    if (this.coins.length) {
      for (const c of this.coins) {
        if (c.until <= this.tick) { c.dead = true; continue; }
        const f = c.owner;
        if (f.alive && f.onField && Math.hypot(f.x - c.x, f.y - c.y) < f.r + 6) { c.dead = true; f.gainUlt(4); this.ev({ e: 'coin', f, x: c.x, y: c.y }); }
      }
      this.coins = this.coins.filter((c) => !c.dead);
    }
  }
}

// ---------------------------------------------------------------- geometry
export function pushOut(p, o, r) {
  if (o.type === 'circle') {
    const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), m = o.r + r;
    if (d < m) { const k = d || 0.01; return { x: o.x + dx / k * m, y: o.y + dy / k * m }; }
    return p;
  }
  const x0 = o.x0 - r, x1 = o.x1 + r, y0 = o.y0 - r, y1 = o.y1 + r;
  if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) {
    const dl = p.x - x0, dr = x1 - p.x, dt = p.y - y0, db = y1 - p.y, m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: x0, y: p.y }; if (m === dr) return { x: x1, y: p.y }; if (m === dt) return { x: p.x, y: y0 }; return { x: p.x, y: y1 };
  }
  return p;
}
function pushOutSeg(p, w, r) {
  const vx = w.x1 - w.x0, vy = w.y1 - w.y0, l2 = vx * vx + vy * vy;
  const u = clamp(((p.x - w.x0) * vx + (p.y - w.y0) * vy) / l2, 0, 1);
  const cx = w.x0 + vx * u, cy = w.y0 + vy * u, dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), m = w.th / 2 + r;
  if (d < m) { const k = d || 0.01; return { x: cx + dx / k * m, y: cy + dy / k * m }; }
  return p;
}
export function inObstacle(x, y, o, pad) {
  if (o.type === 'circle') return Math.hypot(x - o.x, y - o.y) < o.r + pad;
  return x > o.x0 - pad && x < o.x1 + pad && y > o.y0 - pad && y < o.y1 + pad;
}
