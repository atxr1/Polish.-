// Fighter: one Pokémon on the field. Pure simulation (no DOM).
import { BALANCE } from '../content/balance.js';
import { clamp, lerp, angDiff, dirFromAngle } from '../core/util.js';
import { CONTENT, resolveAnim, frameIndexAt } from './content.js';
import { startMove, updateMove, TIER } from './mechanics.js';
import { TRAVERSALS, PASSIVES } from './traversal.js';
import { Serpent } from './serpent.js';

export const STAMINA_MAX = 100;
export const STAMINA_REGEN = 28 / 60;      // per tick
const STAMINA_DELAY = 24;                  // 0.4 s after a spend
export const DODGE = { cost: 12, cd: 21, ticks: 22, iframes: 13 };
export const ENV_MOVE = {
  ground: { accel: 0.24, drag: 0.80 },
  water: { accel: 0.085, drag: 0.94 },
  air: { accel: 0.13, drag: 0.90 },
};

export class Fighter {
  constructor(sim, speciesId, side, slot) {
    this.sim = sim; this.side = side; this.slot = slot;
    this.id = speciesId;
    this.sp = CONTENT.species[speciesId];
    if (!this.sp) throw new Error('unknown species ' + speciesId);
    this.T = this.sp.trav ? TRAVERSALS[this.sp.trav] : null;
    this.P = this.sp.passive ? PASSIVES[this.sp.passive] : null;
    this.tv = this.T && this.T.init ? this.T.init(this) : {};
    this.form = null;            // 'mega' when Mega Evolved, or a Deoxys forme id
    this.maxHp = 0; this.hp = 0;
    this.applyForm(null);
    this.hp = this.maxHp;
    this.x = 0; this.y = 0; this.z = 0; this.vz = 0;
    this.vx = 0; this.vy = 0; this.kvx = 0; this.kvy = 0;
    this.dir = side ? 6 : 2; this.aim = side ? Math.PI : 0;
    this.state = 'hidden'; this.st = 0;
    this.anim = { name: 'Idle', t: 0, speed: 1, loop: true };
    this.stamina = STAMINA_MAX; this.staminaWait = 0;
    this.cds = [0, 0, 0, 0]; this.dodgeCd = 0;
    this.ult = 0;
    this.status = {}; this.statusImmune = {}; this.buffs = [];
    this.flags = {};
    this.move = null; this.trav = null; this.hitstun = 0;
    this.input = blankInput();
    this.buf = { slot: -1, t: -99, dodge: -99, ult: -99 };
    this.lastHitBy = null; this.wallSlamT = 0;
    this.perfect = 0;            // perfect-dodge counter window ticks
    this.stats = { dealt: 0, taken: 0, hits: 0, se: 0, dodges: 0, perfect: 0, moves: 0, ults: 0, stamina: {}, movesUsed: {}, moveDmg: {} };
    this.serpent = this.sp.serpent ? new Serpent(this) : null;
    this.beams = [];
    this.enteredT = -999; this.lastDodgeT = -999;
    this.locoMode = 'walk';
  }

  // --- stats / forms
  applyForm(form) {
    this.form = form;
    const sp = this.sp;
    let base = sp.base, types = sp.types, sprite = sp.sprite, fo = null;
    if (form === 'mega' && sp.mega) { base = sp.mega.base; types = sp.mega.types; sprite = sp.mega.sprite; }
    else if (form && sp.formes && sp.formes[form]) { fo = sp.formes[form]; base = fo.base; sprite = fo.sprite; }
    this.fo = fo;
    this.base = base; this.types = types; this.spriteId = sprite;
    const hpBefore = this.maxHp, frac = hpBefore ? this.hp / hpBefore : 1;
    const bal = BALANCE[this.env + ':' + sp.id];
    this.bal = bal || null;
    this.maxHp = Math.round((260 + sp.base.hp * 1.3) * (sp.tune.hp || 1) * (bal ? bal.hp : 1) * (fo && fo.hpMul || 1) * (form === 'mega' ? 1.06 : 1));
    if (hpBefore) this.hp = Math.max(1, Math.round(this.maxHp * frac));
    this.speedBase = (1.3 + base.spe * 0.0072) * (sp.speedMul || 1) * (fo && fo.speedMul || 1);
    this.r = sp.radius;
    this.weightMul = sp.kbMul;
  }
  get meta() { return CONTENT.sprites[this.spriteId]; }
  get foe() { return this.sim.activeOf(1 - this.side); }
  get alive() { return this.hp > 0; }
  get onField() { return this.state !== 'hidden' && this.state !== 'recalled'; }
  get env() { return this.sim.env; }
  stat(name) {
    let v = this.base[name];
    for (const b of this.buffs) if (b.stat === name) v *= b.mul;
    if (name === 'atk' && this.status.burn) v *= 0.75;
    if ((name === 'atk' || name === 'spa') && this.flags.intimidated) v *= 0.9;
    return v;
  }
  dmgMul() { return (this.sp.tune.dmg || 1) * (this.bal ? this.bal.dmg : 1) * (this.fo && this.fo.dmgMul || 1) * (this.form === 'mega' ? 1.08 : 1); }
  armor() { let a = 1; if (this.T && this.T.armor) a *= this.T.armor(this); return a; }
  kbTaken() { return this.T && this.T.kbTaken ? this.T.kbTaken(this) : 1; }
  actSpeed() { return this.T && this.T.actSpeed ? this.T.actSpeed(this) : 1; }
  speedNow() {
    let s = this.speedBase;
    for (const b of this.buffs) if (b.stat === 'spe') s *= b.mul;
    if (this.status.para) s *= 0.6;
    if (this.status.slow) s *= this.status.slowMul || 0.6;
    if (this.sp.passive === 'speedboost') s *= 1 + Math.min(0.35, this.sim.fightTicks / 3600 * 0.35);
    if (this.T && this.T.speedMul) s *= this.T.speedMul(this);
    if (this.sim.feature && this.sim.feature.speedMul) s *= this.sim.feature.speedMul(this);
    return s;
  }
  addBuff(stat, mul, ticks, tag) {
    this.buffs = this.buffs.filter((b) => !(tag && b.tag === tag && b.stat === stat));
    this.buffs.push({ stat, mul, until: this.sim.tick + ticks, tag });
  }
  silenced() { return this.sim.zones.some((z) => z.st && z.st.silence && z.owner !== this && z.owner.side !== this.side && z.t >= z.delay); }
  hidden() { return (this.flags.invisible && !this.flags.revealed) || this.sim.inSmoke(this); }

  // --- animation
  setAnim(name, opts = {}) {
    const n = resolveAnim(this.meta, name);
    this.anim = { name: n, t: 0, speed: opts.speed ?? 1, loop: !!opts.loop, hold: opts.hold };
  }
  animDef(name) { const m = this.meta; return m && m.anims[resolveAnim(m, name || this.anim.name)]; }
  animFrame() {
    const a = this.animDef(); if (!a) return null;
    const k = frameIndexAt(a, this.anim.t, this.anim.loop);
    const d = a.dirs === 1 ? 0 : this.dir;
    const idx = a.f[k][d] >= 0 ? a.f[k][d] : a.f[k][0];
    return this.meta.frames[idx];
  }
  headPoint() { const fr = this.animFrame(); return fr ? { x: this.x + fr[6], y: this.y + fr[7] - this.z } : { x: this.x, y: this.y - 20 - this.z }; }
  centerPoint() { const fr = this.animFrame(); return fr ? { x: this.x + fr[8], y: this.y + fr[9] - this.z } : { x: this.x, y: this.y - 12 - this.z }; }

  // --- facing
  faceAngle(a) { this.aim = a; this.dir = dirFromAngle(a); }
  faceFoe(maxTurn = 9) {
    const o = this.foe; if (!o) return;
    const want = Math.atan2(o.y - this.y, o.x - this.x);
    this.aim += clamp(angDiff(this.aim, want), -maxTurn, maxTurn);
    this.dir = dirFromAngle(this.aim);
  }
  aimAtFoe() {
    const o = this.foe; if (!o) return this.aim;
    if (this.aiDecoy && this.aiDecoy.until > this.sim.tick) return Math.atan2(this.aiDecoy.y - this.y, this.aiDecoy.x - this.x);
    const t = this.sim.targetPointFor(this, o);
    return Math.atan2(t.y - this.y, t.x - this.x);
  }

  // --- resources
  canAfford(cost) { return this.stamina >= cost - 0.001; }
  spend(cost, what) {
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaWait = STAMINA_DELAY;
    if (what) this.stats.stamina[what] = (this.stats.stamina[what] || 0) + cost;
  }
  gainUlt(v) { if (!this.sim.rules.noUlt && this.alive) this.ult = clamp(this.ult + v, 0, 100); }

  canAct() { return (this.state === 'idle' || this.state === 'walk') && !this.status.sleep && !this.status.freeze && this.hitstun <= 0; }
  setState(s) { this.state = s; this.st = 0; }

  // --- per tick
  update() {
    const S = this.sim, inp = this.input, fighting = S.phase === 'fight';
    this.st++;
    for (let i = 0; i < 4; i++) if (this.cds[i] > 0) this.cds[i] -= (this.T && this.T.actSpeed ? this.T.actSpeed(this) : 1) > 1 ? 1.3 : 1;
    for (let i = 0; i < 4; i++) if (this.cds[i] < 0) this.cds[i] = 0;
    if (this.dodgeCd > 0) this.dodgeCd--;
    if (this.perfect > 0) this.perfect--;
    if (this.wallSlamT > 0) this.wallSlamT--;
    if (this.buffs.length) this.buffs = this.buffs.filter((b) => b.until > S.tick);
    for (const k in this.flags) if (typeof this.flags[k] === 'number' && this.flags[k] <= S.tick && k !== 'shieldHp' && k !== 'frontArc' && k !== 'absorbR' && k !== 'counterPow') delete this.flags[k];
    if (this.flags.shieldHp !== undefined && !(this.flags.shieldUntil > S.tick)) delete this.flags.shieldHp;
    this.updateStatus();
    if (this.T && this.T.tick) this.T.tick(this);
    if (this.P && this.P.tick && fighting) this.P.tick(this);
    // stamina regen (Double Stamina overtime doubles it; halved while attacking or hurt)
    if (this.staminaWait > 0) this.staminaWait--;
    else {
      let r = STAMINA_REGEN * (S.overtime ? 2 : 1);
      if (this.state === 'act' || this.state === 'hurt') r *= 0.5;
      this.stamina = Math.min(STAMINA_MAX, this.stamina + r);
    }
    if (fighting && this.alive) this.gainUlt(S.ultPassive);

    // aim noise and decoy targeting come in through the input so replays reproduce them
    this.aimErr = inp.aimErr || 0;
    if (inp.decoy) { const o = this.foe; let d = null; for (const x of S.decoys) if (o && x.owner === o) d = x; this.aiDecoy = d ? { x: d.x, y: d.y, until: S.tick + 2 } : null; } else this.aiDecoy = null;
    // buffered input (8-tick window)
    if (inp.slot >= 0) { this.buf.slot = inp.slot; this.buf.t = S.tick; }
    if (inp.dodge) this.buf.dodge = S.tick;
    if (inp.ult) this.buf.ult = S.tick;
    const wantSlot = S.tick - this.buf.t <= 8 ? this.buf.slot : -1;
    const wantDodge = S.tick - this.buf.dodge <= 8;
    const wantUlt = S.tick - this.buf.ult <= 8;

    if (this.hitstun > 0) this.hitstun--;
    // stun load: grows while staggered, drains twice as fast while free (see hurt())
    this.stunLoad = (this.state === 'hurt' || this.hitstun > 0) ? (this.stunLoad || 0) + 1 : Math.max(0, (this.stunLoad || 0) - 2);

    switch (this.state) {
      case 'idle': case 'walk': {
        if (!fighting) { this.locomote(0, 0); break; }
        if (this.status.sleep || this.status.freeze) { this.vx *= 0.7; this.vy *= 0.7; break; }
        if (inp.forme && this.sp.formes) S.formeChange(this);
        if (wantUlt && this.ult >= 100 && !this.silenced()) { this.buf.ult = -99; S.fireUltimate(this); break; }
        if (wantDodge && this.tryDodge()) { this.buf.dodge = -99; break; }
        if (wantSlot >= 0 && this.tryMove(wantSlot)) { this.buf.slot = -1; break; }
        let mx = inp.mx, my = inp.my;
        if (this.status.confuse) { const a = Math.atan2(my, mx) + Math.sin(S.tick / 9) * 1.2; const l = Math.hypot(mx, my); mx = Math.cos(a) * l; my = Math.sin(a) * l; }
        this.locomote(mx, my);
        break;
      }
      case 'act': {
        updateMove(this);
        if (this.state === 'act' && !(this.move && this.move.drive)) { this.vx *= 0.75; this.vy *= 0.75; }
        if (this.state === 'act' && wantDodge && this.move && this.move.t >= this.move.cancelT && !this.move.ult && this.tryDodge()) { this.buf.dodge = -99; }
        break;
      }
      case 'hurt': {
        this.vx *= 0.7; this.vy *= 0.7;
        if (this.hitstun <= 0 && this.z <= 0) { this.setState('idle'); this.setAnim(this.idleAnim(), { loop: true }); }
        break;
      }
      case 'dodge': {
        const k = 1 - this.st / DODGE.ticks, sp = 1.0 + 4.6 * k * k;
        this.vx = this.dodgeV.x * sp; this.vy = this.dodgeV.y * sp;
        if (this.st % 3 === 0) S.ev({ e: 'ghost', f: this });
        if (this.st >= DODGE.ticks) { this.setState('idle'); this.setAnim(this.idleAnim(), { loop: true }); this.vx *= 0.3; this.vy *= 0.3; }
        break;
      }
      case 'trav': {
        if (!this.T || this.T.update(this) === 'done') {
          this.trav = null;
          if (this.state === 'trav') { this.setState('idle'); this.setAnim(this.idleAnim(), { loop: true }); }
        }
        break;
      }
      case 'faint': case 'victory': case 'enter': case 'hidden': case 'recalled': case 'recalling':
        this.vx *= 0.85; this.vy *= 0.85;
        break;
    }
    this.integrate();
    this.anim.t += this.anim.speed;
    if (this.serpent) this.serpent.update();
  }

  idleAnim() {
    if (this.env === 'air' && this.meta && this.meta.anims.Walk && !this.sp.hoverIdle) return 'Walk';
    return 'Idle';
  }

  locomote(mx, my) {
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const E = ENV_MOVE[this.env] || ENV_MOVE.ground;
    const mode = this.T && this.T.locomote ? this.T.locomote(this, mx, my, E) : false;
    if (!mode) {
      let accel = E.accel * (this.sp.accelMul || 1);
      const sp = this.speedNow();
      if (this.serpent) accel = Math.max(accel, 0.32);
      this.vx = lerp(this.vx, mx * sp, accel);
      this.vy = lerp(this.vy, my * sp, accel);
      if (ml <= 0.1 && this.env !== 'ground') { this.vx *= E.drag; this.vy *= E.drag; }
    }
    this.locoMode = mode || 'walk';
    const v = Math.hypot(this.vx, this.vy);
    if (v > 0.22 && (ml > 0.1 || mode === 'spin' || mode === 'glide' || mode === 'hover')) {
      if (this.state !== 'walk') { this.state = 'walk'; this.st = 0; this.setAnim(mode === 'spin' ? 'Rotate' : 'Walk', { loop: true }); }
      const ang = this.serpent && ml > 0.1 ? Math.atan2(my, mx) : Math.atan2(this.vy, this.vx);
      if (mode !== 'spin') this.faceAngle(ang);
      this.anim.speed = clamp(v / this.speedBase, 0.6, 1.5);
    } else {
      if (this.state !== 'idle') { this.state = 'idle'; this.st = 0; this.setAnim(this.idleAnim(), { loop: true }); }
      if (this.sim.phase === 'fight' && this.st % 5 === 0) this.faceFoe(0.5);
    }
  }

  integrate() {
    const S = this.sim;
    let dx = this.vx + this.kvx, dy = this.vy + this.kvy;
    if (this.move && this.move.drive) { dx += this.move.drive.vx; dy += this.move.drive.vy; }
    const kdrag = this.env === 'air' ? 0.885 : this.env === 'water' ? 0.865 : 0.8;
    const kSpeed = Math.hypot(this.kvx, this.kvy);
    this.kvx *= kdrag; this.kvy *= kdrag;
    if (S.feature && S.feature.push) { const p = S.feature.push(this); if (p) { dx += p.x; dy += p.y; } }
    const res = S.collideBody(this, this.x + dx, this.y + dy);
    this.x = res.x; this.y = res.y;
    if (res.hit) {
      if (kSpeed > 3.2 && this.wallSlamT <= 0 && this.lastHitBy && S.phase === 'fight' && this.state === 'hurt') { this.wallSlamT = 40; S.wallSlam(this, kSpeed, res); }
      if (this.move && this.move.drive && this.move.drive.stopOnWall) { this.move.drive = null; this.move.wallHit = true; }
      if (this.T && this.T.onWall) this.T.onWall(this, res);
    }
    if (this.z > 0 || this.vz) {
      this.z += this.vz; this.vz -= 0.25;
      if (this.z <= 0) { this.z = 0; this.vz = 0; if (this.launched) { this.launched = false; S.ev({ e: 'landHard', f: this }); } }
    }
  }

  updateStatus() {
    const S = this.sim, s = this.status;
    for (const k of ['burn', 'poison', 'para', 'sleep', 'freeze', 'confuse', 'slow', 'healBlock']) {
      if (s[k] > 0) { s[k]--; if (s[k] === 0) { delete s[k]; if (k === 'sleep' || k === 'freeze') this.wakeUp(); } }
    }
    for (const k in this.statusImmune) if (this.statusImmune[k] <= S.tick) delete this.statusImmune[k];
    if (S.phase !== 'fight' || !this.alive) return;
    if (s.burn && S.tick % 30 === 0) S.dot(this, this.maxHp * 0.0075, 'burn');
    if (s.poison && S.tick % 30 === 0) S.dot(this, this.maxHp * (s.badPoison ? 0.014 : 0.01), 'poison');
    if (s.para && S.tick % 60 === 0 && S.rng() < 0.25) { this.hitstun = Math.max(this.hitstun, 18); if (this.move) S.endMove(this); S.ev({ e: 'paraJolt', f: this }); }
    if (s.sleep && S.tick % 30 === 0) { const o = this.foe; if (o && o.sp.passive === 'baddreams') S.dot(this, this.maxHp * 0.02, 'nightmare'); }
    if (this.seeded) {
      if (this.seeded.until <= S.tick || !this.seeded.by.alive) this.seeded = null;
      else if (S.tick % 30 === 0) { const d = Math.max(1, Math.round(this.maxHp * 0.012)); S.dot(this, d, 'seed'); if (this.seeded.by.onField) S.heal(this.seeded.by, d); }
    }
    if (this.sp.passive === 'sandstream' && S.tick % 60 === 0 && S.weather !== 'airlock') { const o = this.foe; if (o && o.alive && o.onField && !o.types.some((t) => t === 'Rock' || t === 'Ground' || t === 'Steel')) S.dot(o, o.maxHp * 0.006, 'sand'); }
  }
  wakeUp() {
    if (this.state === 'idle' || this.state === 'walk' || this.state === 'hurt') { this.setState('idle'); this.setAnim(this.idleAnim(), { loop: true }); }
  }

  tryMove(slot) {
    const mid = this.kit()[slot]; if (!mid) return false;
    const m = CONTENT.moves[mid];
    if (this.cds[slot] > 0) return false;
    if (this.silenced()) { this.sim.ev({ e: 'silenced', f: this }); return false; }
    const cost = m.cost;
    if (!this.canAfford(cost)) { this.sim.ev({ e: 'noStamina', f: this }); return false; }
    if (this.flags.invisible) { delete this.flags.invisible; this.sim.ev({ e: 'unrefract', f: this }); }
    this.stats.movesUsed[mid] = (this.stats.movesUsed[mid] || 0) + 1;
    if (this.status.confuse && this.sim.rng() < 0.15) {
      this.spend(cost * 0.5, mid); this.sim.selfHit(this); return true;
    }
    this.spend(cost, mid);
    this.cds[slot] = m.cd;
    this.stats.moves++;
    startMove(this, m, slot);
    return true;
  }
  kit() {
    if (this.form === 'mega' && this.sp.mega && this.sp.mega.kit) return this.sp.mega.kit;
    if (this.fo && this.fo.kit) return this.fo.kit;
    return this.sp.kit;
  }

  tryDodge() {
    if (this.dodgeCd > 0) return false;
    const T = this.T;
    const repl = T && (typeof T.replacesDodge === 'function' ? T.replacesDodge(this) : T.replacesDodge);
    if (repl) {
      if (!T.canStart(this)) return false;
      const cost = T.cost ?? DODGE.cost;
      if (!this.canAfford(cost)) { this.sim.ev({ e: 'noStamina', f: this }); return false; }
      this.spend(cost, 'trav'); this.dodgeCd = T.cd ?? DODGE.cd;
      if (this.move) this.sim.endMove(this);
      this.setState('trav'); T.start(this);
      if (this.state === 'trav' && !this.trav) this.trav = { t: 0 };
      this.stats.dodges++;
      return true;
    }
    if (!this.canAfford(DODGE.cost)) { this.sim.ev({ e: 'noStamina', f: this }); return false; }
    this.spend(DODGE.cost, 'dodge'); this.dodgeCd = DODGE.cd; this.stats.dodges++;
    if (this.move) this.sim.endMove(this);
    let dx = this.input.mx, dy = this.input.my;
    if (Math.hypot(dx, dy) < 0.3) {
      const o = this.foe, a = o ? Math.atan2(this.y - o.y, this.x - o.x) + (Math.PI / 2) * (this.side ? -1 : 1) : this.aim + Math.PI;
      dx = Math.cos(a); dy = Math.sin(a);
    }
    const l = Math.hypot(dx, dy); this.dodgeV = { x: dx / l, y: dy / l };
    this.setState('dodge'); this.setAnim('Hop', { speed: 1.4 });
    this.flags.invuln = this.sim.tick + DODGE.iframes;
    this.flags.dodgeIframe = this.sim.tick + DODGE.iframes;
    this.faceAngle(Math.atan2(dy, dx));
    this.lastDodgeT = this.sim.tick;
    this.sim.ev({ e: 'dodge', f: this });
    return true;
  }

  // hit reaction
  hurt(stun, fromAng, force) {
    if (this.state === 'faint' || (this.flags.unstoppable && !force)) return;
    // stun decay: a continuous hitstun chain longer than 0.75 s loses its stun, then the victim gets a short
    // window where hits still do damage but can't stagger it, so no combo locks anyone for long
    const now = this.sim.tick, load = this.stunLoad || 0;
    if (!force && this.flags.stunImmune > now) return;
    if (!force && load > 50) { stun = Math.round(stun * Math.max(0, 1 - (load - 50) / 30)); if (stun < 3) { this.flags.stunImmune = now + 40; this.stunLoad = 0; this.sim.ev({ e: 'breakout', f: this }); return; } }
    if (this.move) this.sim.endMove(this);
    if (this.state === 'trav') { if (this.T && this.T.interrupt) this.T.interrupt(this); this.trav = null; }
    this.flags.intangible = false;
    this.setState('hurt'); this.setAnim('Hurt');
    this.hitstun = Math.max(this.hitstun, stun);
    if (fromAng !== undefined) this.dir = dirFromAngle(fromAng + Math.PI);
  }
}

export function blankInput() { return { mx: 0, my: 0, slot: -1, held: [false, false, false, false], dodge: false, dodgeHeld: false, ult: false, forme: false, emote: -1, aimErr: 0, decoy: false, switchTo: -1, choose: -1 }; }
export { TIER };
