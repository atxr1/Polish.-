// Move execution: a move is data (content/moves.js) made of timed steps that call these mechanics.
// Mechanics library: melee arc, lunge, dash/charge (ramp, pin, chain, homing), projectiles (single,
// multi, spread, homing, bounce, boomerang, lob, pull), beams and streams, line eruptions, areas and
// persistent zones (pull, slow, heal), delayed telegraphed strikes, cones, walls, blinks, leaps,
// grabs, summons, buffs, barriers and a few named special behaviours.
import { clamp, angDiff, dirFromAngle, segDist, TAU } from '../core/util.js';
import { CONTENT } from './content.js';

export const TIER = {
  light: { cost: 12, cd: 0, recover: 4, startup: 12 },
  medium: { cost: 22, cd: 27, recover: 7, startup: 15 },
  heavy: { cost: 35, cd: 96, recover: 10, startup: 20 },
  sig: { cost: 50, cd: 210, recover: 14, startup: 24 },
  ult: { cost: 0, cd: 0, recover: 12, startup: 24 },
};

// ---------------------------------------------------------------- move lifecycle
export function startMove(f, m, slot) {
  const S = f.sim;
  f.setState('act');
  const animDef = f.animDef(m.anim);
  const wind = m.windup ? m.windup.t : 0;
  const startup = Math.max(wind + 4, Math.round((m.startup ?? TIER[m.tier].startup) / (f.actSpeed ? f.actSpeed() : 1)));
  const animHit = animDef ? animDef.hitT : 8;
  const animLen = animDef ? animDef.total : 24;
  const pre = Math.max(1, startup - wind);                 // ticks from body-anim start to contact
  const s1 = animHit > 0 ? Math.min(1.6, animHit / pre) : 0; // anim speed before contact (0 = hold first frame)
  let lastStep = 0;
  for (const st of m.steps) lastStep = Math.max(lastStep, (typeof st.at === 'number' ? st.at : 0) + (st.busy || 0));
  const after = Math.max(4, animLen - animHit);
  const end = startup + Math.max(after, lastStep) + (m.recover ?? TIER[m.tier].recover);
  f.move = { def: m, slot, t: 0, hitT: startup, end, cancelT: startup + (m.cancelAfter ?? 8), fired: new Set(), set: S.newSet(), drive: null, ult: m.tier === 'ult', s1, wind };
  f.aim = f.aimAtFoe() + (f.aimErr ? (S.rng() - 0.5) * 2 * f.aimErr : 0);
  f.faceAngle(f.aim);
  if (m.windup) { f.setAnim(m.windup.anim || 'Charge', { loop: true }); if (m.windup.fx) S.fx(m.windup.fx, f, { at: 'center', follow: true, ticks: m.windup.t, layer: 'front' }); }
  else f.setAnim(m.anim, { speed: s1 });
  if (m.sfxStart) S.sfx(m.sfxStart, f);
  S.ev({ e: 'moveCall', f, name: m.name, type: m.type, ult: m.tier === 'ult', tier: m.tier, id: m.id });
  if (m.tier === 'sig' || m.tier === 'ult') S.ev({ e: 'portrait', f, mood: 'Determined' });
}

export function updateMove(f) {
  const S = f.sim, mv = f.move, m = mv && mv.def;
  if (!mv) { f.setState('idle'); return; }
  mv.t++;
  if (m.windup && mv.t === mv.wind) f.setAnim(m.anim, { speed: mv.s1 });
  if (mv.t === mv.hitT) { f.anim.speed = 1; if (m.sfx) S.sfx(m.sfx, f); }
  if (mv.t < mv.hitT) {
    // keep facing the target during startup (auto-aim)
    const want = f.aimAtFoe(); const turn = m.track || 0.12;
    f.aim += clamp(angDiff(f.aim, want), -turn, turn); f.dir = dirFromAngle(f.aim);
  }
  for (let i = 0; i < m.steps.length; i++) {
    const st = m.steps[i];
    if (!mv.fired.has(i) && mv.t >= mv.hitT + (typeof st.at === 'number' ? st.at : 0)) {
      mv.fired.add(i);
      if (st.if && !st.if(f, S)) continue;
      runStep(f, st, m);
      if (!f.move) return;   // a step can end the move (e.g. blink into a wall)
    }
  }
  if (mv.drive) { mv.drive.t--; if (mv.drive.t <= 0) mv.drive = null; }
  // held moves (Iron Defense): end when released or out of stamina
  if (m.hold && mv.t > mv.hitT && mv.holding) {
    const held = f.input.held && f.input.held[mv.slot];
    f.stamina = Math.max(0, f.stamina - (mv.drain || 0.3)); f.staminaWait = 24;
    if (!held || f.stamina <= 0) { delete f.flags.front; mv.holding = false; mv.end = mv.t + 6; }
    else mv.end = Math.max(mv.end, mv.t + 2);
  }
  if (mv.t >= mv.end) S.endMove(f);
}

// ---------------------------------------------------------------- helpers
export function spec(f, m, st, extra) {
  const ult = m.tier === 'ult';
  return Object.assign({
    att: f, power: st.power ?? m.power, type: st.type || m.type, cat: m.cat === 'status' ? 'special' : m.cat, kb: st.kb ?? 2, stun: st.stun ?? 14,
    set: st.newSet ? f.sim.newSet() : f.move ? f.move.set : f.sim.newSet(), status: st.status || m.status, fx: st.hitFx || m.hitFx, ult, moveId: m.id,
    drain: st.drain, multi: !!st.multi, heavy: st.heavy ?? (m.tier === 'heavy' || m.tier === 'sig' || ult),
    crit: m.crit || 0, superVs: m.superVs, dual: m.dual, launch: st.launch, defDown: st.defDown, contact: m.cat === 'physical',
  }, extra || {});
}
function originPoint(f, at) {
  if (at === 'head') return f.headPoint();
  if (at === 'center') return f.centerPoint();
  return { x: f.x, y: f.y };
}
function aimPoint(f, st) {
  const o = f.foe;
  if (st.where === 'target' && o) { const t = f.sim.targetPointFor(f, o); return { x: t.x, y: t.y }; }
  if (st.where === 'lead' && o) return { x: o.x + o.vx * (st.lead || 20), y: o.y + o.vy * (st.lead || 20) };
  if (st.where === 'self') return { x: f.x, y: f.y };
  const d = st.dist ?? 60;
  return { x: f.x + Math.cos(f.aim) * d, y: f.y + Math.sin(f.aim) * d };
}

// ---------------------------------------------------------------- step dispatch
export function runStep(f, st, m) {
  const S = f.sim;
  if (st.sfx) S.sfx(st.sfx, f);
  if (st.fx && st.k !== 'cone') S.fx(st.fx, f, { at: st.fxAt || 'center', dirAng: f.aim, follow: st.fxFollow, ticks: st.fxTicks, frameTime: st.fxFrameTime, offset: st.fxOffset, layer: st.fxLayer || 'front' });
  switch (st.k) {
    case 'melee': return melee(f, st, m);
    case 'dash': return dash(f, st, m);
    case 'proj': return projectile(f, st, m);
    case 'beam': return beam(f, st, m);
    case 'area': return area(f, st, m);
    case 'strikes': return strikes(f, st, m);
    case 'line': return line(f, st, m);
    case 'cone': return cone(f, st, m);
    case 'buff': return buff(f, st, m);
    case 'barrier': return barrier(f, st, m);
    case 'wall': return wall(f, st, m);
    case 'blink': return blink(f, st, m);
    case 'leap': return leap(f, st, m);
    case 'grab': return grab(f, st, m);
    case 'summon': return summon(f, st, m);
    case 'fn': return typeof st.fn === 'string' ? SPECIALS[st.fn](f, S, m, st) : st.fn(f, S, m, st);
    case 'fxonly':
      // optional ring of copies around the user (big area Ultimates)
      if (st.ring) for (let i = 0; i < st.ring; i++) { const a = f.aim + i * TAU / st.ring, rr = st.ringR || 40; f.sim.later(i * (st.ringGap || 0), () => f.sim.fxAt(st.ringFx || st.fx, f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.7, { z: 0, layer: 'front' })); }
      return;
    default: throw new Error('unknown step ' + st.k);
  }
}

// melee: arc in front, optional lunge, multiple hits
function melee(f, st, m) {
  const S = f.sim;
  if (st.lunge) f.move.drive = { vx: Math.cos(f.aim) * st.lunge / (st.lungeT || 6), vy: Math.sin(f.aim) * st.lunge / (st.lungeT || 6), t: st.lungeT || 6, stopOnWall: true };
  const hits = st.hits || 1, interval = st.interval || 5, active = st.active || 6, range = st.range || 26, arc = st.arc || 1.9;
  const set = f.move.set;
  if (st.swipe) S.fx(st.swipe, f, { at: 'front', dist: range * 0.6, dirAng: f.aim, frameTime: st.swipeFT || 2, layer: 'front' });
  let landed = 0;
  S.act(f, {
    ticks: hits > 1 ? interval * (hits - 1) + active : active, bound: true, n: 0,
    update(a) {
      const o = f.foe; if (!o || !o.alive) return;
      const per = hits > 1 ? Math.floor((a.t - 1) / interval) : 0;
      if (per >= hits || a.n > per) return;
      if (hits > 1 && per > 0 && (a.t - 1) % interval === 0 && st.swipe) S.fx(st.swipe, f, { at: 'front', dist: range * 0.6, dirAng: f.aim, frameTime: 2, layer: 'front' });
      const d = S.reach(o, f.x, f.y);
      const ang = Math.atan2(o.y - f.y, o.x - f.x);
      if (d <= range && Math.abs(angDiff(f.aim, ang)) <= arc / 2 + 0.25) {
        let power = (st.power ?? m.power);
        if (st.rampHits) power *= 1 + st.rampHits * landed;
        if (st.stacking) { const k = f.tv.swipeStack = (S.tick - (f.tv.swipeT || -999) < 120) ? Math.min(5, (f.tv.swipeStack || 0) + 1) : 0; f.tv.swipeT = S.tick; power *= 1 + 0.22 * k; }
        let status = undefined;
        if (st.fakeout) { if (S.tick - (f.enteredT || -999) < 90 || S.tick - (f.lastDodgeT || -999) < 60) status = { flinch: { chance: 1, ticks: 40 } }; }
        const sp = spec(f, m, st, { set: hits > 1 ? S.newSet() : set, x: o.x, y: o.y - 10, kbAng: f.aim, power, multi: hits > 1 && per < hits - 1, stun: hits > 1 && per > 0 ? 6 : st.stun ?? 14, noFlinch: hits > 1 && per > 0 && per < hits - 1 });
        if (status) sp.status = Object.assign({}, sp.status || {}, status);
        if (S.hit(f, o, sp)) { a.n = per + 1; landed++; if (st.onHit) st.onHit(f, o, S); }
      }
    },
  });
}

// dash: drive the fighter forward with a body hitbox (Dragon Rush, Flare Blitz, Extreme Speed, Mach Punch)
function dash(f, st, m) {
  const S = f.sim;
  let ang = f.aim;
  const ticks = st.ticks || 12, dist = st.dist || 100, start = { x: f.x, y: f.y };
  let speedMul = 1;
  const setDrive = (t) => { f.move.drive = { vx: Math.cos(ang) * dist / ticks * speedMul, vy: Math.sin(ang) * dist / ticks * speedMul, t: t ?? ticks, stopOnWall: !st.pin }; };
  setDrive();
  if (st.invuln) { f.flags.invuln = S.tick + ticks; }
  if (st.unstoppable) f.flags.unstoppable = S.tick + ticks + 4;
  f.flags.dashing = S.tick + ticks;
  let chain = st.chain || 1;
  const total = st.chain ? ticks * st.chain + 10 * (st.chain - 1) + 8 : ticks;
  f.move.end = Math.max(f.move.end, f.move.t + total + (m.recover ?? 8));
  let hitAny = false;
  S.act(f, {
    ticks: total, bound: true, carried: false, hitOnce: false, pause: 0,
    update(a) {
      const o = f.foe; if (!o) return;
      if (a.pause > 0) { a.pause--; if (a.pause === 0) { ang = Math.atan2(o.y - f.y, o.x - f.x); f.faceAngle(ang); a.hitOnce = false; f.move.set = S.newSet(); setDrive(); if (st.invuln) f.flags.invuln = S.tick + ticks; } return; }
      if (!f.move.drive && !a.carried) { if (chain > 1 && st.chain) { chain--; a.pause = 8; } return; }
      if (st.trail && a.t % (st.trailGap || 3) === 0) S.fx(st.trail, f, { at: 'center', dirAng: ang, frameTime: st.trailFT || 2, layer: 'back' });
      if (st.homing && f.move.drive && !a.carried) { const want = Math.atan2(o.y - f.y, o.x - f.x); ang += clamp(angDiff(ang, want), -st.homing, st.homing); const sp = dist / ticks * speedMul; f.move.drive.vx = Math.cos(ang) * sp; f.move.drive.vy = Math.sin(ang) * sp; f.faceAngle(ang); }
      if (a.carried) {
        o.x = f.x + Math.cos(ang) * (f.r + o.r - 2); o.y = f.y + Math.sin(ang) * (f.r + o.r - 2); o.hitstun = Math.max(o.hitstun, 4);
        const b = S.bounds; const atWall = o.x < b.x0 + o.r + 1 || o.x > b.x1 - o.r - 1 || o.y < b.y0 + o.r + 1 || o.y > b.y1 - o.r - 1 || S.touchingObstacle(o);
        if (f.move.wallHit || atWall || !f.move.drive) finishCarry(atWall || f.move.wallHit);
        return;
      }
      if (a.hitOnce && !st.pierce) return;
      if (S.reach(o, f.x, f.y) <= (st.hitR || f.r + 8)) {
        const travelled = Math.hypot(f.x - start.x, f.y - start.y);
        const rampMul = st.ramp ? 1 + st.ramp * travelled / 100 : 1;
        let power = (st.power ?? m.power) * rampMul;
        if (st.rollout) power *= 1 + 0.35 * Math.min(4, f.tv.rollout || 0);
        const sp = spec(f, m, st, { x: o.x, y: o.y - 10, kbAng: ang, power, kb: st.pin ? 0 : st.kb ?? 4, stun: st.pin ? 40 : st.stun ?? 18 });
        if (S.hit(f, o, sp)) {
          a.hitOnce = true; hitAny = true;
          if (!f.move) return;   // countered / interrupted
          if (st.onHit) st.onHit(f, o, S);
          if (st.recoil) S.selfDamage(f, f.maxHp * st.recoil * 0.25, true);
          if (st.resetOnHit && f.move.slot >= 0) f.cds[f.move.slot] = 0;
          if (st.rollout) f.tv.rollout = Math.min(4, (f.tv.rollout || 0) + 1);
          if (st.pin) { a.carried = true; o.hurt(70, ang); f.move.drive.t = Math.max(f.move.drive.t, 14); f.move.drive.stopOnWall = true; S.ev({ e: 'pin', f, o }); }
          else if (st.bounceBack) { ang += Math.PI; f.faceAngle(ang + Math.PI); f.move.drive = { vx: Math.cos(ang) * st.bounceBack / 10, vy: Math.sin(ang) * st.bounceBack / 10, t: 10 }; }
          else if (st.stopOnHit !== false) { f.move.drive = null; f.kvx -= Math.cos(ang) * 1.2; f.kvy -= Math.sin(ang) * 1.2; }
          if (chain > 1 && st.chain && !st.pin) { chain--; a.pause = 10; f.move.drive = { vx: -Math.cos(ang) * 2.2, vy: -Math.sin(ang) * 2.2, t: 8 }; }
        }
      }
      function finishCarry(slam) {
        a.carried = false; f.move.drive = null;
        S.hit(f, o, spec(f, m, st, { set: S.newSet(), x: o.x, y: o.y - 10, power: (st.slamPower || m.power * 0.6) * (slam ? 1.6 : 1), kb: 3.5, stun: 24, kbAng: ang, heavy: true }));
        if (slam) { S.ev({ e: 'wallSlam', f: o, x: o.x, y: o.y, dmg: 0 }); S.ev({ e: 'shake', amt: 7 }); }
      }
    },
    end(a) {
      if (!hitAny && st.rollout) f.tv.rollout = 0;
      if (st.recoil && !hitAny) {} // no recoil on a miss
    },
  });
}

// projectile(s)
function projectile(f, st, m) {
  const S = f.sim;
  const n = st.count || 1, spread = st.spread ?? 0.25;
  // launch height: between the mouth and the body centre, so shots read as aimed at the target's body
  const from = originPoint(f, st.from || 'head'), mid = originPoint(f, 'center');
  const z = Math.max(4, st.from ? f.y - from.y : Math.round((f.y - from.y) * 0.45 + (f.y - mid.y) * 0.55));
  const sharedSet = S.newSet();
  for (let i = 0; i < n; i++) {
    const delay = (st.gap || 0) * i;
    const fire = () => {
      if (!f.alive) return;
      let ang = st.track === false ? f.aim : f.aimAtFoe();
      if (st.ring) ang = f.aim + i * spread + (st.ringOffset || 0);
      else if (n > 1 && !st.gap) ang += (i - (n - 1) / 2) * spread;
      if (st.jitter) ang += (S.rng() - 0.5) * st.jitter;
      if (st.gap && n > 1 && st.spread && !st.jitter) ang += (i - (n - 1) / 2) * st.spread;
      let sp = st.speed || 4;
      const startD = st.startDist ?? f.r;
      const pspec = spec(f, m, st, { set: st.newSetEach ? S.newSet() : sharedSet });
      // multi-hit volleys (every pellet can connect): the pellets before the last don't interrupt the target (light
      // moves always, others unless they set their own stun), so a spray can't stun-lock from range; the last pellet
      // flinches and rolls the side effect once. Spread shots whose pellets share one hit keep the move's full stun,
      // knockback and side effect on every pellet, since only one of them can connect.
      if (n > 1 && st.newSetEach) {
        // the pellet that carries the flinch: the final one of a stream, the centre one of a fan
        const last = i === (st.gap ? n - 1 : (n - 1) >> 1);
        if (!last && (st.stun === undefined || m.tier === 'light')) { pspec.noFlinch = true; pspec.multi = true; }
        else if (st.stun === undefined) pspec.stun = 10;
        if (st.kb === undefined) pspec.kb = last ? 1.6 : 0.6;
        if (!last && !st.statusEach) pspec.status = null;
      }
      if (st.speedScale) { const v = Math.hypot(f.vx, f.vy) / f.speedBase; pspec.power = (st.power ?? m.power) * (1 + 1.3 * clamp(v, 0, 1.3)); }
      const p = {
        id: S.newSet(), owner: f, x: f.x + Math.cos(ang) * startD, y: f.y + Math.sin(ang) * startD, z: st.z ?? z,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, speed: sp, r: st.r || 7, range: st.range || 220, travelled: 0,
        homing: st.homing || 0, bounce: st.bounce || 0, pierce: !!st.pierce, boomerang: !!st.boomerang, returning: false,
        pull: st.pull, pullIn: st.pullIn, reflectable: st.reflectable ?? m.cat === 'special', fxName: st.sprite, fxFT: st.spriteFT || 3, trail: st.trail, trailGap: st.trailGap || 4,
        hitFx: st.hitFx || m.hitFx, set: pspec.set, spec: pspec, lob: st.lob, t: 0, onHit: st.onHit, onEnd: st.onEnd, spin: st.spin, big: st.giant ? 2 : 1,
        multiHit: st.multiHit || 0, hitCount: 0, dropCoin: st.dropCoin, chainLine: st.chainLine, roll: st.roll, type: st.type || m.type, moveId: m.id,
        frames: st.spriteFrames, rot: st.rot, trailDz: st.trailDz,
      };
      if (st.lob) { const o = f.foe; const tx = o ? o.x : p.x, ty = o ? o.y : p.y; const d = Math.min(p.range, Math.hypot(tx - p.x, ty - p.y)); const a2 = Math.atan2(ty - p.y, tx - p.x); p.lobT = Math.max(12, Math.round(d / sp)); p.lobFrom = { x: p.x, y: p.y }; p.lobTo = S.clampPoint(p.x + Math.cos(a2) * d, p.y + Math.sin(a2) * d, 4); }
      S.projs.push(p);
      if (st.castFx) S.fx(st.castFx, f, { at: 'head', dirAng: ang, layer: 'front' });
      if (st.eachSfx && i > 0) S.sfx(st.eachSfx, f);
    };
    if (delay) S.later(delay, () => { if ((f.state === 'act' && f.move && f.move.def === m) || st.persist) fire(); }); else fire();
  }
  if (st.gap && n > 1) f.move.end = Math.max(f.move.end, f.move.t + st.gap * (n - 1) + 6);
}

// beam / stream: a ray from the user, damaging along its length (Flamethrower, Solar Beam, Hydro Pump, Aurora Beam)
function beam(f, st, m) {
  const S = f.sim;
  const ticks = st.ticks || 30, interval = st.interval || 8;
  f.move.end = Math.max(f.move.end, f.move.t + ticks + (m.recover ?? 8));
  let len = 0, ang = f.aim + (st.side || 0) * 0.4, hitsLanded = 0, nextHit = 1;
  const set = st.newSet ? S.newSet() : null;
  const ray = { x0: 0, y0: 0, x1: 0, y1: 0, w: st.width || 12, z: 8, ang, len: 0, name: st.beam, stream: st.stream, ft: st.streamFT || 2, t: 0, ticks, id: S.newSet() };
  f.beams = f.beams || [];
  f.beams.push(ray);
  S.act(f, {
    ticks, bound: true, beam: true,
    update(a) {
      ray.t = a.t;
      if (st.track) { const want = f.aimAtFoe(); ang += clamp(angDiff(ang, want), -st.track, st.track); if (!st.side) f.faceAngle(ang); }
      if (st.sweep) ang += st.sweep;
      len = Math.min(st.len || 140, len + (st.grow || 16));
      const o0 = originPoint(f, st.from || 'head');
      const x0 = f.x + Math.cos(ang) * (f.r * 0.7), y0 = f.y + Math.sin(ang) * (f.r * 0.7);
      let x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      if (!st.pierceWalls) { const cut = S.rayCut(x0, y0, x1, y1); if (cut < 1) { x1 = x0 + (x1 - x0) * cut; y1 = y0 + (y1 - y0) * cut; } }
      Object.assign(ray, { x0, y0, x1, y1, z: Math.max(4, f.y - o0.y), ang, len: Math.hypot(x1 - x0, y1 - y0) });
      if (st.recoil) { f.kvx -= Math.cos(ang) * st.recoil * 0.22; f.kvy -= Math.sin(ang) * st.recoil * 0.22; }
      if (st.stream && a.t % (st.streamGap || 2) === 0) S.ev({ e: 'stream', f, name: st.stream, ang, len: ray.len, x0, y0, z: ray.z, ft: st.streamFT || 2, speed: st.streamSpeed || 6 });
      const o = f.foe;
      // the beam grows from the mouth: it hits as soon as it reaches the target, then at most once per interval
      if (o && o.alive && a.t >= nextHit) {
        if (S.reachSeg(o, x0, y0, x1, y1) <= ray.w / 2) {
          nextHit = a.t + interval;
          const ramp = st.ramp ? 1 + st.ramp * hitsLanded : 1;
          const sp = spec(f, m, st, { set: set ? S.newSet() : S.newSet(), x: o.x, y: o.y - 10, kbAng: ang, power: (st.power ?? m.power) * ramp, kb: st.kb ?? 0.8, stun: hitsLanded === 0 ? st.stun ?? 10 : 0, multi: ticks > interval, status: hitsLanded === 0 ? st.status || m.status : null, noFlinch: hitsLanded > 0 });
          if (S.hit(f, o, sp)) hitsLanded++;
        }
      }
    },
    end() { const i = f.beams.indexOf(ray); if (i >= 0) f.beams.splice(i, 1); },
  });
}

// area: instant burst or lingering zone, at self / target / aim point, optional telegraph delay
function area(f, st, m) {
  const S = f.sim;
  const p = aimPoint(f, st);
  const z = {
    id: S.newSet(), owner: f, x: p.x, y: p.y, r: st.r || 40, t: 0, delay: st.delay || 0, ticks: st.ticks || 1, interval: st.interval || 15,
    follow: st.follow ? f : null, spec: spec(f, m, st, { set: S.newSet() }), st, hitN: 0, set: S.newSet(), fx: st.zoneFx, fxFT: st.zoneFT,
    tele: st.tele, burst: st.burst, moveId: m.id, type: st.type || m.type,
  };
  S.zones.push(z);
  if (z.delay && st.tele) S.ev({ e: 'tele', x: z.x, y: z.y, r: z.r, ticks: z.delay, name: st.tele, owner: f });
  return z;
}

// strikes: N delayed area hits around/at the target (Thunder, Draco Meteor shower)
function strikes(f, st, m) {
  const S = f.sim, o = f.foe; if (!o) return;
  const n = st.n || 3, set = st.oneHit ? S.newSet() : null;
  const hpMul = st.hpScale ? 0.55 + 0.75 * (f.hp / f.maxHp) : 1;
  for (let i = 0; i < n; i++) {
    let x = o.x, y = o.y;
    if (st.pattern === 'random') { const b = S.bounds; x = b.x0 + 20 + S.rng() * (b.x1 - b.x0 - 40); y = b.y0 + 20 + S.rng() * (b.y1 - b.y0 - 40); if (i % 3 === 0) { x = o.x + (S.rng() - 0.5) * 60; y = o.y + (S.rng() - 0.5) * 40; } }
    else if (st.pattern === 'mixed' && i > 0) { x += (S.rng() - 0.5) * (st.spread || 120); y += (S.rng() - 0.5) * (st.spread || 120) * 0.7; }
    if (st.pattern === 'lead') { x += o.vx * 18 * (i + 1); y += o.vy * 18 * (i + 1); }
    const b = S.bounds;
    x = clamp(x, b.x0 + 10, b.x1 - 10); y = clamp(y, b.y0 + 10, b.y1 - 10);
    const delay = (st.delay || 40) + i * (st.gap || 12);
    const sp = spec(f, m, st, { set: set || S.newSet(), power: (st.power ?? m.power) * hpMul });
    const zs = { id: S.newSet(), owner: f, x, y, r: st.r || 26, t: 0, delay, ticks: 1, interval: 1, spec: sp, st, set: sp.set, burst: st.burst, fall: st.fall, tele: st.tele, moveId: m.id, type: st.type || m.type };
    if (st.pattern === 'lead' || st.track) zs.trackTarget = { o, until: delay - 16 };
    S.zones.push(zs);
    S.ev({ e: 'tele', x, y, r: zs.r, ticks: delay, name: st.tele || 'target', fall: st.fall, zone: zs, owner: f });
  }
}

// line: sequential eruptions along the aim (Stone Edge, Frenzy Plant)
function line(f, st, m) {
  const S = f.sim, set = S.newSet();
  const ang = f.aimAtFoe(), n = st.n || 6;
  for (let i = 0; i < n; i++) {
    const d = (st.start || 26) + i * (st.step || 22);
    const x = f.x + Math.cos(ang) * d, y = f.y + Math.sin(ang) * d;
    if (!S.inBounds(x, y, 4) || S.pointBlocked(x, y)) break;
    const sp = spec(f, m, st, { set });
    const zs = { id: S.newSet(), owner: f, x, y, r: st.r || 16, t: 0, delay: i * (st.gap || 3), ticks: st.linger || 1, interval: 999, spec: sp, st, set, burst: st.burst, tele: null, moveId: m.id, type: m.type, root: st.root };
    S.zones.push(zs);
  }
}

// cone: instant wedge in front (Glare, Roar, Heat Wave)
function cone(f, st, m) {
  const S = f.sim, o = f.foe;
  S.fx(st.fx, f, { at: 'front', dist: (st.range || 90) * 0.45, dirAng: f.aim, layer: 'front' });
  if (st.wave) for (let i = 1; i <= 4; i++) S.later(i * 3, () => S.ev({ e: 'stream', f, name: st.wave, ang: f.aim + (S.rng() - 0.5) * (st.arc || 1.4), len: st.range || 100, x0: f.x, y0: f.y, z: 8, ft: 2, speed: 5 }));
  if (!o || !o.alive) return;
  const d = S.reach(o, f.x, f.y), a = Math.atan2(o.y - f.y, o.x - f.x);
  if (d <= (st.range || 90) && Math.abs(angDiff(f.aim, a)) <= (st.arc || 1.4) / 2 + 0.15) {
    S.hit(f, o, spec(f, m, st, { x: o.x, y: o.y - 10, kbAng: a, ranged: true }));
  }
}

function buff(f, st, m) {
  const S = f.sim;
  for (const [stat, mul] of Object.entries(st.stats || {})) f.addBuff(stat, mul, st.ticks || 360, m.id);
  if (st.heal && !f.status.healBlock) S.heal(f, f.maxHp * st.heal);
  if (st.regen) S.act(f, { ticks: st.ticks || 240, bound: false, update(a) { if (a.t % 30 === 0 && !f.status.healBlock && f.alive) S.heal(f, f.maxHp * st.regen); } });
  if (st.cleanse) for (const k of ['burn', 'poison', 'para', 'confuse', 'slow']) delete f.status[k];
  if (st.shield) { f.flags.shieldHp = (f.flags.shieldHp || 0) + f.maxHp * st.shield; f.flags.shieldUntil = S.tick + (st.ticks || 360); }
  if (st.unstoppable) f.flags.unstoppable = S.tick + st.unstoppable;
  if (st.teamHeal) S.healBench(f.side, st.teamHeal);
  S.ev({ e: 'buff', f, stats: st.stats, heal: st.heal });
}

function barrier(f, st, m) {
  const S = f.sim, ticks = st.ticks || 60;
  const k = st.kind;
  if (k === 'front') {
    f.flags.front = S.tick + ticks; f.flags.frontArc = st.arc || 2.2;
    if (st.held) { f.move.holding = true; f.move.drain = st.drain || 0.3; }
    f.move.end = Math.max(f.move.end, f.move.t + (st.held ? 12 : ticks));
  }
  if (k === 'reflect') { f.flags.reflect = S.tick + ticks; f.flags.reflectAll = !!st.all; }
  if (k === 'absorb') { f.flags.absorb = S.tick + ticks; f.flags.absorbR = st.r || 30; }
  if (k === 'protect') { f.flags.invuln = S.tick + ticks; f.flags.protect = S.tick + ticks; f.move.end = Math.max(f.move.end, f.move.t + ticks); }
  if (k === 'counter') { f.flags.counter = S.tick + ticks; f.flags.counterPow = st.power ?? m.power; f.move.end = Math.max(f.move.end, f.move.t + ticks); }
  if (st.heal) S.heal(f, f.maxHp * st.heal);
  S.ev({ e: 'barrier', f, kind: k, ticks, fx: st.barrierFx });
}

function wall(f, st, m) {
  const S = f.sim;
  const d = st.dist || 40, ang = f.aimAtFoe(), len = st.len || 70, th = st.thick || 10;
  const cx = f.x + Math.cos(ang) * d, cy = f.y + Math.sin(ang) * d;
  const px = -Math.sin(ang), py = Math.cos(ang);
  S.addWall({ x0: cx - px * len / 2, y0: cy - py * len / 2, x1: cx + px * len / 2, y1: cy + py * len / 2, th, until: S.tick + (st.ticks || 180), sprite: st.sprite || 'Ice_Pieces', owner: f, hp: 6, ang });
}

function blink(f, st, m) {
  const S = f.sim, o = f.foe;
  let ang = f.aim;
  const x0 = f.x, y0 = f.y;
  if (st.to === 'input' && Math.hypot(f.input.mx, f.input.my) > 0.3) ang = Math.atan2(f.input.my, f.input.mx);
  let p;
  if (st.to === 'behind' && o) {
    const a2 = Math.atan2(o.y - f.y, o.x - f.x);
    p = S.clampPoint(o.x + Math.cos(a2) * (o.r + f.r + 4), o.y + Math.sin(a2) * (o.r + f.r + 4), f.r);
  } else if (st.to === 'front' && o) {
    const a2 = Math.atan2(f.y - o.y, f.x - o.x);
    const dd = Math.min(Math.hypot(o.x - f.x, o.y - f.y) - (o.r + f.r), st.dist || 40);
    p = S.clampPoint(f.x - Math.cos(a2) * Math.max(0, dd), f.y - Math.sin(a2) * Math.max(0, dd), f.r);
  } else p = S.clampPoint(f.x + Math.cos(ang) * (st.dist || 70), f.y + Math.sin(ang) * (st.dist || 70), f.r);
  f.x = p.x; f.y = p.y;
  if (o) { f.aim = Math.atan2(o.y - f.y, o.x - f.x); f.faceAngle(f.aim); }
  S.ev({ e: 'blink', f, x0, y0, x1: p.x, y1: p.y, fx: st.blinkFx });
}

// leap: jump to a point (or offscreen) and land with a shockwave (Flying Press, Dragon Ascent, Fly, Sky Attack)
function leap(f, st, m) {
  const S = f.sim, o = f.foe;
  const ticks = st.ticks || 30;
  const tx = o ? o.x : f.x, ty = o ? o.y : f.y;
  const d = Math.min(st.range || 140, Math.hypot(tx - f.x, ty - f.y));
  const ang = Math.atan2(ty - f.y, tx - f.x);
  const dest = S.clampPoint(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d, f.r);
  const from = { x: f.x, y: f.y };
  f.flags.invuln = S.tick + Math.round(ticks * (st.invulnFrac ?? 0.75));
  f.move.end = Math.max(f.move.end, f.move.t + ticks + (st.recover ?? 14));
  const tele = { e: 'tele', x: dest.x, y: dest.y, r: st.landR || 34, ticks, name: st.tele || 'target', owner: f };
  S.ev(tele);
  let cur = { x: dest.x, y: dest.y };
  S.act(f, {
    ticks, bound: true,
    update(a) {
      const k = a.t / ticks;
      if (st.track && o && k < 0.8) { cur = S.clampPoint(cur.x + clamp(o.x - cur.x, -2.2, 2.2), cur.y + clamp(o.y - cur.y, -2.2, 2.2), f.r); tele.x = cur.x; tele.y = cur.y; }
      f.x = from.x + (cur.x - from.x) * k; f.y = from.y + (cur.y - from.y) * k;
      f.z = st.offscreen ? (k < 0.4 ? k / 0.4 * 300 : k > 0.75 ? (1 - k) / 0.25 * 300 : 300) : Math.sin(k * Math.PI) * (st.apex || 40);
      f.flags.airborne = true;
      if (st.offscreen) f.flags.hidden = k > 0.25 && k < 0.85;
    },
    end(a) {
      f.z = 0; f.flags.airborne = false; f.flags.hidden = false;
      if (a.t < ticks - 1) return;   // interrupted
      f.x = cur.x; f.y = cur.y;
      const zsp = spec(f, m, st, { set: S.newSet() });
      if (st.knockdown) zsp.stun = st.knockdown;
      const zone = { id: S.newSet(), owner: f, x: f.x, y: f.y, r: st.landR || 34, t: 0, delay: 0, ticks: 1, interval: 1, spec: zsp, st: { kb: st.kb ?? 4.5, kbOut: true }, set: zsp.set, burst: st.landFx, moveId: m.id, type: m.type };
      S.zones.push(zone);
      S.ev({ e: 'shake', amt: st.shake || 5 });
      S.ev({ e: 'land', f, r: zone.r, crowd: st.crowdPop });
      if (st.missRecoil) S.later(1, () => { if (!zone.hitAny) { S.selfDamage(f, f.maxHp * st.missRecoil); S.ev({ e: 'crash', f }); } });
    },
  });
}

// grab: seize a nearby target, lift, slam (Sky Drop) — grabs ignore barriers
function grab(f, st, m) {
  const S = f.sim, o = f.foe; if (!o) return;
  if (st.lunge) { f.x += Math.cos(f.aim) * Math.min(st.lunge, Math.max(0, Math.hypot(o.x - f.x, o.y - f.y) - f.r - o.r)); f.y += Math.sin(f.aim) * Math.min(st.lunge, Math.max(0, Math.hypot(o.x - f.x, o.y - f.y) - f.r - o.r)); }
  const d = S.reach(o, f.x, f.y);
  if (d > (st.range || 30) || o.flags.intangible || o.flags.hidden || o.state === 'dodge' && o.flags.invuln) { S.ev({ e: 'whiff', f }); return; }
  const lift = st.lift || 40;
  o.hurt(lift + 20, f.aim, true);
  f.move.end = Math.max(f.move.end, f.move.t + lift + 14);
  S.ev({ e: 'grab', f, o });
  S.act(f, {
    ticks: lift, bound: true,
    update(a) { const k = a.t / lift; f.z = Math.sin(Math.min(1, k * 1.2) * Math.PI / 2) * 60 * (k < 0.85 ? 1 : (1 - k) / 0.15); o.x = f.x + Math.cos(f.aim) * 6; o.y = f.y + 1; o.z = f.z + 4; o.hitstun = Math.max(o.hitstun, 6); },
    end(a) { f.z = 0; o.z = 0; if (a.t < lift - 1) return; S.hit(f, o, spec(f, m, st, { set: S.newSet(), x: o.x, y: o.y - 6, power: st.slamPower ?? m.power, kb: 3, stun: 26, heavy: true, ignoreBarrier: true })); S.ev({ e: 'shake', amt: 6 }); S.fxAt('Rock_Smash', o.x, o.y, {}); },
  });
}

function summon(f, st, m) {
  const S = f.sim;
  if (st.kind === 'clones') S.addClones(f, st);
  else if (st.kind === 'decoy') S.addDecoy(f, st);
  else if (st.kind === 'spikes') S.addTraps(f, st, m);
  else if (st.kind === 'coins') S.addCoins(f, st);
}

// ---------------------------------------------------------------- named special behaviours
export const SPECIALS = {
  // Leech Seed: plant a draining seed on the target
  leechseed(p, o, S) { if (o.types.includes('Grass')) { S.ev({ e: 'immune', f: o, att: p.owner, type: 'Grass' }); return; } o.seeded = { by: p.owner, until: S.tick + 360 }; S.ev({ e: 'seeded', f: o }); },
  // Entei's Lava Plume leaves molten pools around it
  lavapools(f, S, m) {
    for (let i = 0; i < 4; i++) {
      const a = f.aim + i * (TAU / 4) + 0.6, p = S.clampPoint(f.x + Math.cos(a) * 44, f.y + Math.sin(a) * 44, 8);
      S.zones.push({ id: S.newSet(), owner: f, x: p.x, y: p.y, r: 16, t: 0, delay: 4, ticks: 240, interval: 30, spec: spec(f, m, { power: 12, stun: 0, kb: 0.3, status: { burn: 0.2 } }, { set: S.newSet(), multi: true }), st: { decal: 'lava' }, set: S.newSet(), fx: 'Lava_Plume_Fire', fxFT: 3, moveId: m.id, type: 'Fire' });
    }
  },
  // Suicune's Surf: a huge wave sweeping across the arena
  surfwave(f, S, m) {
    const b = S.bounds, o = f.foe, dirX = o && o.x < f.x ? -1 : 1;
    const wave = { id: S.newSet(), owner: f, x: dirX > 0 ? b.x0 - 20 : b.x1 + 20, y: (b.y0 + b.y1) / 2, vx: dirX * 3.4, h: b.y1 - b.y0 + 40, w: 34, set: S.newSet(), t: 0, spec: spec(f, m, { kb: 0, stun: 26 }, { set: S.newSet() }) };
    S.waves.push(wave);
    S.ev({ e: 'wave', wave });
    f.move.end = Math.max(f.move.end, f.move.t + 20);
  },
  // Ho-Oh: revive a fainted teammate (trainer battles) or a Sacred Fire inferno
  rebirth(f, S, m) {
    const sd = S.sides[f.side];
    // one revive per match (later Ultimates are the Sacred Fire inferno), never the same Pokémon twice
    const fallen = sd.rebirthUsed ? null : sd.team.find((x) => x !== f && !x.alive && !x.revived);
    if (S.format === 'trainer' && fallen) {
      sd.rebirthUsed = true;
      if (fallen.form === 'mega') fallen.applyForm(null); // fainting ended the Mega Evolution
      fallen.hp =Math.round(fallen.maxHp * 0.5); fallen.state = 'hidden'; fallen.status = {}; fallen.revived = true;
      S.ev({ e: 'revive', f: fallen, by: f });
      S.fx('Healing_Wish_Hit', f, { at: 'center' });
    } else {
      const inf = CONTENT.moves.sacredinferno;
      for (const st of inf.steps) runStep(f, st, inf);
    }
  },
  // Deoxys: the Ultimate depends on the current forme
  formeboost(f, S, m) {
    const id = 'pb_' + (f.form || 'normal');
    const mm = CONTENT.moves[id];
    for (const st of mm.steps) runStep(f, st, mm);
  },
  // Gyarados Thrash: 4 s unstoppable rampage of homing lunges, then confusion
  thrash(f, S, m) {
    f.flags.unstoppable = S.tick + 240;
    f.move.end = Math.max(f.move.end, f.move.t + 250);
    let n = 0;
    S.act(f, {
      ticks: 240, bound: true, next: 0,
      update(a) {
        const o = f.foe; if (!o) return;
        if (a.t >= a.next) {
          a.next = a.t + 30; n++;
          const ang = Math.atan2(o.y - f.y, o.x - f.x); f.faceAngle(ang); f.aim = ang;
          f.move.drive = { vx: Math.cos(ang) * 4.2, vy: Math.sin(ang) * 4.2, t: 16, stopOnWall: true };
          f.setAnim(n % 2 ? 'Attack' : 'Strike', {}); a.hitSet = S.newSet();
          if (n === 1) { S.sfx('DUN_Rage', f); S.fx('Rage', f, { at: 'center', layer: 'back' }); } else S.sfx('DUN_Attack', f);
          S.fx('Puff_White', f, { at: 'feet', layer: 'back' });
        }
        if (a.hitSet && S.reach(o, f.x, f.y) <= f.r + 14) {
          if (S.hit(f, o, spec(f, m, {}, { set: a.hitSet, x: o.x, y: o.y - 10, kbAng: f.aim, kb: 3.5, stun: 16 }))) a.hitSet = null;
        }
      },
      end() { if (f.alive) { f.status.confuse = 150; S.ev({ e: 'status', f, kind: 'confuse' }); } },
    });
  },
  // Lapras Sheer Cold: a slowly expanding freezing ring
  sheercold(f, S, m) {
    const ring = { id: S.newSet(), owner: f, x: f.x, y: f.y, r: 10, vr: 1.6, maxR: 170, w: 14, set: S.newSet(), spec: spec(f, m, { kb: 1, stun: 10 }, { set: S.newSet() }), t: 0, fx: 'Sheer_Cold_Front' };
    S.rings.push(ring); S.ev({ e: 'ring', ring });
  },
  // Starmie Hydro Pump vortex: jets spinning in every direction
  vortex(f, S, m) {
    f.move.end = Math.max(f.move.end, f.move.t + 120);
    for (let k = 0; k < 4; k++) {
      const st = { len: 170, width: 12, ticks: 110, interval: 10, beam: 'Column_Blue', stream: 'Water_Spout_Drop', streamFT: 3, streamGap: 4, sweep: 0.045, kb: 1.4, stun: 8 };
      const save = f.aim; f.aim = save + k * Math.PI / 2; beam(f, st, m); f.aim = save;
    }
    f.flags.unstoppable = S.tick + 110;
  },
  // Kyogre / Milotic: heavy rain boosts Water moves for a while
  rainfield(f, S, m) { S.setWeather('rain', 600, f); },
  // Mist Ball bursts into a mist cloud that hides Latias
  mistcloud(p, S) {
    const f = p.owner;
    S.zones.push({ id: S.newSet(), owner: f, x: p.x, y: p.y, r: 46, t: 0, delay: 0, ticks: 210, interval: 999, spec: null, st: { smoke: true }, set: S.newSet(), fx: 'Smoke_White', fxFT: 3, moveId: 'mistball', type: 'Psychic' });
  },
};
export { beam as beamStep, area as areaStep };
