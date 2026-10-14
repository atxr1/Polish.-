// CPU opponent. Produces the same logical input a player would. Obeys the same stamina rules.
// Difficulty changes only reaction time, decision quality and aggression — never stats.
import { clamp, angDiff, mulberry32, segDist } from '../core/util.js';
import { CONTENT, rawEffect, arenaEffect } from './content.js';
import { blankInput } from './fighter.js';

export const LEVELS = {
  easy: { react: 24, think: 18, aimErr: 0.22, dodge: 0.3, perfect: 0.1, aggro: 0.45, reserve: 0, ultDelay: 240, switchQ: 0.3, decoyFool: 0.75, holdFire: 0.45 },
  normal: { react: 14, think: 10, aimErr: 0.08, dodge: 0.58, perfect: 0.35, aggro: 0.68, reserve: 12, ultDelay: 60, switchQ: 0.65, decoyFool: 0.5, holdFire: 0.2 },
  hard: { react: 8, think: 6, aimErr: 0.02, dodge: 0.86, perfect: 0.7, aggro: 0.82, reserve: 14, ultDelay: 0, switchQ: 0.92, decoyFool: 0.25, holdFire: 0.05 },
};

// Usable range of a move as an edge-to-edge gap. Melee hit checks measure from the attacker's centre to the
// target's edge, so a big body (Tyranitar, a serpent's head) needs to be closer than the raw step range says.
const RANGE_CACHE = new Map();
export function aiRange(f, m) {
  const key = m.id + '|' + f.r;
  let r = RANGE_CACHE.get(key);
  if (!r) {
    const st = m.steps.find((x) => x.k === 'melee');
    if (st) r = [0, Math.max(6, (st.range || 26) + (st.lunge || 0) * 0.75 - f.r)];
    else r = m.ai.r;
    RANGE_CACHE.set(key, r);
  }
  return r;
}

export class AI {
  constructor(side, level, seed) {
    this.side = side; this.L = LEVELS[level] || LEVELS.normal; this.level = level;
    this.rng = mulberry32(seed >>> 0);
    this.plan = -1; this.nextThink = 0; this.strafe = 1; this.strafeT = 0;
    this.dodgeAt = -1; this.lastDodgePlan = -99; this.holdSlot = -1; this.holdUntil = 0;
    this.travHold = 0; this.ultReadyAt = -1; this.emoteAt = 600; this.wonEmote = false; this.lastHp = 1; this.lastSwitchThink = 0;
    this.state = 'neutral'; this.decoyUntil = -1; this.decoyPos = null; this.forceSlot = -1;
  }
  input(S) {
    const sd = S.sides[this.side], f = sd.active, inp = blankInput();
    // replacement first: during the replace phase the side's active Pokémon is the fainted one
    // (the choice goes out as an input like everything else the CPU does, so replays reproduce it)
    if (S.phase === 'replace' && f && f.state === 'recalled') { const c = this.chooseReplacement(S); if (c >= 0) inp.choose = c; return inp; }
    if (!f || !f.alive) return inp;
    // a happy emote after winning
    if (S.phase === 'ko' && S.koFinal && S.result && S.result.winner === this.side && !this.wonEmote && S.phaseT > 40 && f.onField) { this.wonEmote = true; inp.emote = 3; return inp; }
    if (S.phase !== 'fight' || !f.onField || f.state === 'enter') return inp;
    const o = f.foe; if (!o || !o.onField) return inp;
    const L = this.L;
    inp.aimErr = L.aimErr * (o.hidden() ? 3 : 1);
    const hiddenFoe = o.hidden() && f.sp.passive !== 'aura' && !o.flags.revealed;
    const react = Math.round(L.react * (hiddenFoe ? 1.6 : 1));
    const tgt = S.targetPointFor(f, o);
    // Substitute decoy: the CPU can fall for it
    if (S.decoys.length && this.decoyUntil < S.tick) { const d = S.decoys.find((x) => x.owner === o && S.tick - (x.until - 150) < 4); if (d && this.rng() < L.decoyFool) { this.decoyUntil = S.tick + 50; this.decoyPos = { x: d.x, y: d.y }; } }
    const fooled = this.decoyUntil >= S.tick && S.decoys.some((x) => x.owner === o);
    if (fooled) inp.decoy = true;
    const tx = fooled ? this.decoyPos.x : tgt.x, ty = fooled ? this.decoyPos.y : tgt.y;
    const dx = tx - f.x, dy = ty - f.y, dist = Math.hypot(dx, dy), gap = dist - f.r - o.r;
    const toFoe = Math.atan2(dy, dx);

    // ---------------------------------------------------------------- threats -> dodge
    const threat = this.threat(S, f, o);
    if (threat && f.canAct() && this.dodgeAt < 0 && S.tick - this.lastDodgePlan > 20) {
      this.lastDodgePlan = S.tick;
      if (this.rng() < L.dodge && f.stamina >= 12 && f.dodgeCd <= 0) {
        const perfect = this.rng() < L.perfect;
        const when = perfect ? S.tick + Math.max(react, threat.t - 5) : S.tick + react;
        if (when < S.tick + threat.t + 2) { this.dodgeAt = when; this.dodgeAng = threat.away; }
      } else if (threat.kind === 'proj' || threat.kind === 'beam') {
        // defensive moves instead (Barrier, Mirror Coat, Protect, Iron Defense, Mist)
        const ds = this.findDefense(f, threat);
        if (ds >= 0 && this.rng() < L.dodge) { this.forceSlot = ds; this.forceAt = S.tick + react; }
      }
    }
    if (this.dodgeAt >= 0 && S.tick >= this.dodgeAt) {
      this.dodgeAt = -1;
      if (f.canAct() || (f.state === 'act' && f.move && f.move.t >= f.move.cancelT)) {
        inp.dodge = true; inp.dodgeHeld = true;
        const a = this.dodgeAng ?? toFoe + Math.PI / 2;
        inp.mx = Math.cos(a); inp.my = Math.sin(a);
        return inp;
      }
    }
    if (this.forceSlot >= 0 && S.tick >= this.forceAt) { const s = this.forceSlot; this.forceSlot = -1; if (f.canAct()) { inp.slot = s; inp.held[s] = true; this.holdSlot = s; this.holdUntil = S.tick + 50; return inp; } }
    if (this.holdSlot >= 0) { if (S.tick < this.holdUntil && f.state === 'act' && threat) inp.held[this.holdSlot] = true; else this.holdSlot = -1; }

    // ---------------------------------------------------------------- think: pick a plan
    if (S.tick >= this.nextThink) {
      this.nextThink = S.tick + L.think + Math.floor(this.rng() * 4);
      this.plan = this.pickMove(S, f, o, gap, hiddenFoe);
      if (--this.strafeT <= 0) { this.strafe = this.rng() < 0.5 ? -1 : 1; this.strafeT = 8 + Math.floor(this.rng() * 10); }
      this.thinkSwitch(S, f, o);
      // emotes: after a big hit, when low on HP
      if (S.tick >= this.emoteAt && this.rng() < 0.3) {
        const hpf = f.hp / f.maxHp;
        if (hpf < 0.25 || (o.hp / o.maxHp < this.lastFoeHp - 0.18)) { inp.emote = hpf < 0.25 ? 3 : 0; this.emoteAt = S.tick + 900; }
      }
      this.lastFoeHp = o.hp / o.maxHp;
    }

    // ---------------------------------------------------------------- ultimate
    if (f.ult >= 100 && f.canAct()) {
      if (this.ultReadyAt < 0) this.ultReadyAt = S.tick + L.ultDelay + Math.floor(this.rng() * 30);
      const um = this.ultMove(f);
      const megaFirst = f.sp.mega && f.form !== 'mega' && !S.sides[f.side].megaUsed;
      const ur = um && um.ai ? aiRange(f, um) : null;
      const inRange = ur && gap >= ur[0] - 10 && gap <= ur[1];
      if (S.tick >= this.ultReadyAt && (megaFirst || inRange || this.rng() < 0.01)) { inp.ult = true; this.ultReadyAt = -1; return inp; }
    }

    // ---------------------------------------------------------------- traversal use
    const T = f.T;
    if (T && T.ai && f.canAct() && f.dodgeCd <= 0) {
      const use = T.ai.use, repl = typeof T.replacesDodge === 'function' ? T.replacesDodge(f) : T.replacesDodge;
      if (repl && (T.cost ?? 12) + L.reserve <= f.stamina && T.canStart(f)) {
        let go = false;
        if (use === 'engage' && gap > T.ai.range[0] && gap < T.ai.range[1] && this.wantsClose(f) && this.rng() < 0.04 * L.aggro) go = true;
        if (use === 'chase' && gap > 150 && this.rng() < 0.05) go = true;
        if (use === 'stealth' && gap > 90 && this.rng() < 0.015) go = true;
        if (use === 'root') { const rooted = f.tv.rooted; const far = gap > 110; if ((!rooted && far && this.rng() < 0.03) || (rooted && gap < 60 && this.rng() < 0.08)) go = true; }
        if (go) { inp.dodge = true; inp.dodgeHeld = true; this.travHold = use === 'chase' ? 40 + Math.floor(this.rng() * 50) : 0; const a = use === 'chase' || use === 'engage' ? toFoe : toFoe + Math.PI / 2 * this.strafe; inp.mx = Math.cos(a); inp.my = Math.sin(a); return inp; }
      }
    }
    if (this.travHold > 0 && f.state === 'trav') { this.travHold--; inp.dodgeHeld = true; inp.mx = Math.cos(toFoe); inp.my = Math.sin(toFoe); return inp; }
    if (f.state === 'trav') { inp.mx = Math.cos(toFoe); inp.my = Math.sin(toFoe); return inp; }

    // ---------------------------------------------------------------- attack
    if (this.plan >= 0 && f.canAct()) {
      const m = CONTENT.moves[f.kit()[this.plan]];
      const [r0, r1] = aiRange(f, m);
      const ok = gap >= r0 - 6 && gap <= r1 + 4;
      const facing = Math.abs(angDiff(f.aim, toFoe)) < 1.2 || m.ai.kind !== 'melee';
      if (ok && facing && f.cds[this.plan] <= 0 && f.canAct()) {
        inp.slot = this.plan; inp.held[this.plan] = true;
        if (m.hold) { this.holdSlot = this.plan; this.holdUntil = S.tick + 40 + Math.floor(this.rng() * 40); }
        this.plan = -1;
        return inp;
      }
    }

    // ---------------------------------------------------------------- movement
    let want = this.preferredRange(f, o);
    if (f.stamina < 26 && L.reserve > 0 && !(o.state === 'hurt' || o.status.sleep || o.status.freeze)) want = Math.max(want, 120);
    let mx = 0, my = 0;
    const nx = dx / (dist || 1), ny = dy / (dist || 1);
    const err = gap - want;
    const radial = clamp(err / 40, -1, 1) * (err > 0 ? 0.6 + 0.4 * L.aggro : 1);
    mx += nx * radial; my += ny * radial;
    const sw = 0.55 + (Math.abs(err) < 30 ? 0.35 : 0);
    mx += -ny * sw * this.strafe; my += nx * sw * this.strafe;
    // walls
    const b = S.bounds, m2 = 34;
    if (f.x < b.x0 + m2) mx += (b.x0 + m2 - f.x) / m2 * 1.3; if (f.x > b.x1 - m2) mx -= (f.x - (b.x1 - m2)) / m2 * 1.3;
    if (f.y < b.y0 + m2) my += (b.y0 + m2 - f.y) / m2 * 1.3; if (f.y > b.y1 - m2) my -= (f.y - (b.y1 - m2)) / m2 * 1.3;
    for (const ob of S.obstacles) { const cx = ob.type === 'circle' ? ob.x : (ob.x0 + ob.x1) / 2, cy = ob.type === 'circle' ? ob.y : (ob.y0 + ob.y1) / 2, rr = ob.type === 'circle' ? ob.r : Math.max(ob.x1 - ob.x0, ob.y1 - ob.y0) / 2; const d = Math.hypot(f.x - cx, f.y - cy); if (d < rr + f.r + 24) { mx += (f.x - cx) / d * 1.2; my += (f.y - cy) / d * 1.2; } }
    // hazards: telegraphed strikes, enemy zones, map hazards
    for (const z of S.zones) {
      if (z.owner === f || z.owner.side === f.side || (z.spec && !(z.spec.power > 0) && !z.spec.status && !(z.st && (z.st.pull || z.st.slow)))) continue;
      const d = Math.hypot(f.x - z.x, f.y - z.y);
      if (d < z.r + f.r + 10) { const k = 1.6 * (1 - d / (z.r + f.r + 10)) + 0.4; mx += (f.x - z.x) / (d || 1) * k * 2; my += (f.y - z.y) / (d || 1) * k * 2; }
    }
    if (S.feature) {
      for (const h of S.feature.hazards || []) { const d = Math.hypot(f.x - h.x, f.y - h.y); if (d < h.r + f.r + 12) { mx += (f.x - h.x) / (d || 1) * 1.8; my += (f.y - h.y) / (d || 1) * 1.8; } }
      if (this.rng() < 0.6) for (const bo of S.feature.boosts || []) { const d = Math.hypot(f.x - bo.x, f.y - bo.y); if (d < 90 && d > 8 && bo.kind !== 'portal') { mx += (bo.x - f.x) / d * 0.25; my += (bo.y - f.y) / d * 0.25; } }
    }
    for (const t of S.traps) if (t.owner !== f) { const d = Math.hypot(f.x - t.x, f.y - t.y); if (d < 26) { mx += (f.x - t.x) / (d || 1) * 1.2; my += (f.y - t.y) / (d || 1) * 1.2; } }
    for (const c of S.coins) if (c.owner === f) { const d = Math.hypot(f.x - c.x, f.y - c.y); if (d < 70) { mx += (c.x - f.x) / (d || 1) * 0.5; my += (c.y - f.y) / (d || 1) * 0.5; } }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    inp.mx = mx; inp.my = my;
    return inp;
  }

  // ---------------------------------------------------------------- helpers
  ultMove(f) { return CONTENT.moves[(f.form === 'mega' && f.sp.mega && f.sp.mega.ult) || f.sp.ult]; }
  wantsClose(f) { const k = f.kit().map((id) => CONTENT.moves[id].ai.kind); return k.filter((x) => x === 'melee' || x === 'dash' || x === 'leap' || x === 'grab').length >= 2; }
  preferredRange(f, o) {
    if (this.plan >= 0) { const m = CONTENT.moves[f.kit()[this.plan]]; const [a, b] = aiRange(f, m); return clamp((a + Math.min(b, 170)) / 2, 0, 150); }
    const kinds = f.kit().map((id) => CONTENT.moves[id].ai.kind);
    const close = kinds.filter((k) => k === 'melee' || k === 'grab').length;
    return close >= 2 ? 22 : close === 1 ? 70 : 115;
  }
  effOf(m, o) {
    let raw = rawEffect(m.type, o.types);
    if (m.dual) raw *= rawEffect(m.dual, o.types);
    if (m.type === 'Ground' && (o.sp.levitate || o.sim.env === 'air')) raw = 0;
    return arenaEffect(raw);
  }
  pickMove(S, f, o, gap, hiddenFoe) {
    const L = this.L, kit = f.kit();
    let best = -1, bestScore = 0.05;
    const hpf = f.hp / f.maxHp, foeVuln = o.state === 'hurt' || o.status.sleep || o.status.freeze || (o.state === 'act' && o.move && o.move.t > o.move.hitT + 2);
    for (let i = 0; i < 4; i++) {
      const m = CONTENT.moves[kit[i]]; if (!m) continue;
      if (f.cds[i] > 0 && f.cds[i] > 20) continue;
      const k = m.ai.kind;
      const reserve = foeVuln ? 0 : L.reserve;
      if (f.stamina < m.cost + reserve && !(m.cost <= f.stamina && foeVuln)) continue;
      const eff = m.power > 0 || k === 'proj' ? this.effOf(m, o) : 1;
      if (eff === 0 && m.power > 0 && this.rng() > L.holdFire) continue;   // avoid "No effect"
      const [r0, r1] = aiRange(f, m);
      const fit = gap < r0 ? Math.max(0, 1 - (r0 - gap) / 50) : gap > r1 ? Math.max(0, 1 - (gap - r1) / 90) : 1;
      let s = 0;
      const dmgValue = (m.power || 0) * eff / Math.max(10, m.cost) * (m.cat === 'special' ? f.base.spa : f.base.atk) / 100;
      switch (k) {
        case 'melee': case 'dash': case 'grab': case 'leap': case 'line': case 'cone':
          s = dmgValue * fit * (0.7 + L.aggro * 0.6) * (foeVuln ? 1.5 : 1); break;
        case 'proj': case 'beam': case 'lob':
          s = dmgValue * fit * (0.85 - Math.min(0.5, gap / 600)) * (hiddenFoe ? 0.5 : 1) * (foeVuln ? 1.3 : 1); break;
        case 'area': case 'zone':
          s = (dmgValue + 0.15) * fit * (o.status.slow || foeVuln ? 1.4 : 0.85); break;
        case 'buff': { const has = f.buffs.some((b) => b.tag === m.id); s = has ? 0 : (gap > 110 ? 0.9 : 0.25) * (hpf > 0.35 ? 1 : 0.4); break; }
        case 'heal': { const z = S.zones.some((z2) => z2.owner === f && z2.moveId === m.id); s = z ? 0 : hpf < 0.55 ? (1 - hpf) * 2 * (gap > 80 || foeVuln ? 1 : 0.4) : 0; break; }
        case 'defend': case 'reflect': case 'absorb': case 'counter': s = 0; break;   // used reactively
        case 'wall': s = gap > 90 && f.stamina > 50 ? 0.3 : 0; break;
        case 'trap': s = S.traps.filter((t) => t.owner === f).length < 3 ? 0.5 * fit : 0; break;
        case 'smoke': s = hpf < 0.6 && gap < 120 ? 0.5 : 0.08; break;
        case 'blink': s = dmgValue * (gap < r1 ? 1 : 0) * (0.8 + L.aggro * 0.4); break;
        default: s = dmgValue * fit;
      }
      // status-only moves (Hypnosis, Sleep Powder, Glare, Will-O-Wisp...): worth it when the foe is clean
      if (!(m.power > 0) && m.status && (k === 'proj' || k === 'cone' || k === 'area' || k === 'lob')) {
        const st = m.status, has = (st.sleep && (o.status.sleep || o.statusImmune.sleep)) || (st.para && o.status.para) || (st.burn && o.status.burn) || (st.poison && o.status.poison) || (st.confuse && o.status.confuse);
        s = has ? 0 : 0.7 * fit * (gap < 140 ? 1 : 0.6);
      }
      if (m.status && (m.status.sleep || m.status.para) && (o.status.sleep || o.status.para || o.statusImmune.sleep)) s *= 0.3;
      if (k === 'proj' && m.status && m.status.sleep && o.statusImmune.sleep) s = 0;
      s *= 0.8 + this.rng() * (0.4 + (1 - L.aggro) * 0.4);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }
  findDefense(f, threat) {
    const kit = f.kit();
    for (let i = 0; i < 4; i++) {
      const m = CONTENT.moves[kit[i]];
      if (!m || f.cds[i] > 0 || f.stamina < m.cost) continue;
      const k = m.ai.kind;
      if ((k === 'reflect' && threat.kind === 'proj' && threat.special) || k === 'absorb' && threat.kind === 'proj' || k === 'defend') return i;
      if (k === 'counter' && threat.kind === 'melee') return i;
    }
    return -1;
  }
  threat(S, f, o) {
    // incoming projectiles: closest approach within 24 ticks
    for (const p of S.projs) {
      if (p.owner.side === f.side || p.lob) continue;
      const rvx = p.vx - f.vx, rvy = p.vy - f.vy, rx = f.x - p.x, ry = f.y - p.y;
      const vv = rvx * rvx + rvy * rvy || 1e-6;
      const t = clamp((rx * rvx + ry * rvy) / vv, 0, 24);
      const cx = p.x + rvx * t - f.x, cy = p.y + rvy * t - f.y;
      if (Math.hypot(cx, cy) < p.r + f.r + 6 && t > 0) {
        const a = Math.atan2(p.vy, p.vx) + Math.PI / 2 * (this.rng() < 0.5 ? 1 : -1);
        return { kind: 'proj', t: Math.round(t), away: a, special: p.reflectable };
      }
    }
    // enemy move about to connect
    if (o.state === 'act' && o.move && o.move.t < o.move.hitT) {
      const m = o.move.def, k = m.ai ? m.ai.kind : 'melee';
      const gap = Math.hypot(o.x - f.x, o.y - f.y) - f.r - o.r;
      const reach = m.ai ? m.ai.r[1] + 20 : 60;
      if (gap < reach && k !== 'buff' && k !== 'heal' && k !== 'defend' && k !== 'reflect') {
        const a = Math.atan2(f.y - o.y, f.x - o.x) + (this.rng() < 0.5 ? 1 : -1) * 1.2;
        return { kind: k === 'proj' || k === 'beam' ? k : 'melee', t: o.move.hitT - o.move.t, away: a, special: m.cat === 'special' };
      }
    }
    // beams sweeping toward me
    for (const r of o.beams || []) if (segDist(f.x, f.y, r.x0, r.y0, r.x1, r.y1) < r.w / 2 + f.r + 10) return { kind: 'beam', t: 2, away: r.ang + Math.PI / 2 };
    // telegraphed strike under me
    for (const z of S.zones) if (z.owner !== f && z.owner.side !== f.side && z.t < z.delay && z.delay - z.t < 20 && Math.hypot(f.x - z.x, f.y - z.y) < z.r + f.r) return { kind: 'area', t: z.delay - z.t, away: Math.atan2(f.y - z.y, f.x - z.x) };
    return null;
  }
  matchup(S, f, o) {
    // + is good for f
    let best = 0;
    for (const id of f.kit()) { const m = CONTENT.moves[id]; if (m.power > 0) best = Math.max(best, this.effOf(m, o)); }
    let worst = 0;
    for (const id of o.kit()) { const m = CONTENT.moves[id]; if (m.power > 0) worst = Math.max(worst, this.effOf(m, f)); }
    return best - worst;
  }
  thinkSwitch(S, f, o) {
    if (S.format !== 'trainer' || S.tick - this.lastSwitchThink < 90) return;
    this.lastSwitchThink = S.tick;
    const sd = S.sides[this.side];
    if (sd.switchCd > 0 || !f.canAct()) return;
    const cur = this.matchup(S, f, o), hpf = f.hp / f.maxHp;
    let best = -1, bestScore = cur + (hpf < 0.25 ? -0.6 : 0) + 0.45;
    sd.team.forEach((x, i) => {
      if (x === f || !x.alive) return;
      const sc = this.matchup(S, x, o) + (x.hp / x.maxHp) * 0.3;
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    if (best >= 0 && this.rng() < this.L.switchQ * 0.5) this.wantSwitch = best;
  }
  takeSwitch() { const s = this.wantSwitch; this.wantSwitch = undefined; return s; }
  chooseReplacement(S) {
    const sd = S.sides[this.side];
    if (sd.pendingSwitch >= 0) return -1;
    if (this.replaceDelay === undefined) this.replaceDelay = S.tick + 40 + Math.floor(this.rng() * 40);
    if (S.tick < this.replaceDelay) return -1;
    this.replaceDelay = undefined;
    const o = S.activeOf(1 - this.side);
    let best = -1, bestScore = -99;
    sd.team.forEach((x, i) => { if (!x.alive) return; const sc = (o ? this.matchup(S, x, o) : 0) + x.hp / x.maxHp * 0.4 + (this.rng() - 0.5) * (1 - this.L.switchQ); if (sc > bestScore) { bestScore = sc; best = i; } });
    return best;
  }
}
