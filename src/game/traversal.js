// Unique traversal modules on top of the shared movement core.
// API per module (all optional):
//   init(f) -> per-fighter state object (f.tv)
//   tick(f)                 every tick (charges, trails, passive flags)
//   locomote(f, mx, my, E)  override movement physics; return true when handled
//   replacesDodge           true / function(f): R starts this traversal instead of the dodge roll
//   canStart(f), cost, cd   R requirements (stamina cost, cooldown ticks)
//   start(f), update(f) -> 'done', interrupt(f)
//   speedMul(f)             passive speed multiplier
//   ai                      hints for the CPU: {use: 'escape'|'engage'|'reposition'|'hold', range}
import { clamp, lerp, angDiff, TAU } from '../core/util.js';

const steer = (f) => {
  const l = Math.hypot(f.input.mx, f.input.my);
  if (l > 0.3) return Math.atan2(f.input.my, f.input.mx);
  const o = f.foe;
  return o ? Math.atan2(f.y - o.y, f.x - o.x) + (f.side ? -0.9 : 0.9) : f.aim + Math.PI;
};
const setIframes = (f, n) => { f.flags.invuln = f.sim.tick + n; f.flags.dodgeIframe = f.sim.tick + n; };
const endTrav = (f) => { f.flags.intangible = false; f.flags.burrowed = false; f.flags.submerged = false; f.flags.airborne = false; f.z = 0; };

function addTrail(f, kind, life, r) {
  const S = f.sim;
  if (f.tv.trailT && S.tick - f.tv.trailT < 5) return;
  const v = Math.hypot(f.vx, f.vy);
  if (v < 0.5) return;
  f.tv.trailT = S.tick;
  S.trails.push({ owner: f, kind, x: f.x, y: f.y, until: S.tick + life, born: S.tick, r: r || 12, ang: Math.atan2(f.vy, f.vx) });
}

export const TRAVERSALS = {
  // ------------------------------------------------------------ Garchomp: Dig burrow (Venture / Miner)
  dig: {
    replacesDodge: (f) => f.env === 'ground', cost: 18, cd: 70,
    ai: { use: 'engage', range: [40, 200] },
    canStart: (f) => f.env === 'ground',
    start(f) {
      const S = f.sim;
      f.trav = { t: 0, ang: steer(f) };
      f.flags.intangible = true; f.flags.burrowed = true;
      f.setAnim('Hop', { speed: 1.5 });
      S.fx('Dig', f, { at: 'feet', layer: 'front' }); S.sfx('DUN_Dig', f);
      S.ev({ e: 'burrow', f });
    },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const l = Math.hypot(f.input.mx, f.input.my);
      if (l > 0.3) tr.ang += clamp(angDiff(tr.ang, Math.atan2(f.input.my, f.input.mx)), -0.25, 0.25);
      const sp = f.speedBase * 2.0;
      f.vx = lerp(f.vx, Math.cos(tr.ang) * sp, 0.35); f.vy = lerp(f.vy, Math.sin(tr.ang) * sp, 0.35);
      f.faceAngle(tr.ang);
      if (tr.t % 4 === 0) S.fx('Puff_Brown', f, { at: 'feet', layer: 'back' });
      const o = f.foe;
      const under = o && o.alive && Math.hypot(o.x - f.x, o.y - f.y) < f.r + o.r - 2;
      if (tr.t >= 48 || (tr.t > 8 && f.input.dodge) || under) {
        endTrav(f);
        S.fx('Dig', f, { at: 'feet', layer: 'front' }); S.sfx('DUN_Dig', f); S.ev({ e: 'shake', amt: 3 });
        if (o && o.alive && Math.hypot(o.x - f.x, o.y - f.y) < f.r + o.r + 14) {
          S.hit(f, o, { att: f, power: 54, type: 'Ground', cat: 'physical', kb: 3, stun: 30, launch: 40, set: S.newSet(), heavy: true, x: o.x, y: o.y - 8, fx: 'Rock_Pieces' });
        }
        setIframes(f, 6);
        f.setAnim('Attack', {});
        return 'done';
      }
    },
    interrupt(f) { endTrav(f); },
  },
  // ------------------------------------------------------------ Greninja: water-running + Substitute blink
  ninja: {
    replacesDodge: true, cost: 14, cd: 40,
    ai: { use: 'escape', range: [0, 80] },
    canStart: () => true,
    locomote(f, mx, my, E) {
      if (f.env !== 'water') return false;
      // runs on the surface: ground-like snappy movement with splash steps
      const sp = f.speedNow() * 1.08;
      f.vx = lerp(f.vx, mx * sp, 0.26); f.vy = lerp(f.vy, my * sp, 0.26);
      if (Math.hypot(f.vx, f.vy) > 0.6 && f.sim.tick % 9 === 0) f.sim.ev({ e: 'splashStep', f });
      return 'snappy';
    },
    start(f) {
      const S = f.sim;
      S.addDecoy(f, { ticks: 150, kind: 'log' });
      const ang = steer(f);
      const p = S.clampPoint(f.x + Math.cos(ang) * 74, f.y + Math.sin(ang) * 74, f.r);
      S.ev({ e: 'blink', f, x0: f.x, y0: f.y, x1: p.x, y1: p.y, fx: 'Puff_White' });
      f.x = p.x; f.y = p.y; f.faceAngle(ang);
      setIframes(f, 12);
      f.setAnim('Hop', { speed: 1.6 });
      f.trav = { t: 0 };
      S.sfx('DUN_Double_Team', f);
    },
    update(f) { if (++f.trav.t >= 10) return 'done'; f.vx *= 0.6; f.vy *= 0.6; },
  },
  // ------------------------------------------------------------ Pikachu: Quick Attack zigzag (Tracer's Blink)
  quickzig: {
    replacesDodge: true, cost: 14, cd: 32,
    ai: { use: 'escape', range: [0, 120] },
    canStart: () => true,
    start(f) { f.trav = { t: 0, leg: 0, ang: steer(f) }; setIframes(f, 9); f.setAnim('Attack', { speed: 1.5 }); f.sim.sfx('DUN_Move_Start', f); f.sim.ev({ e: 'dodge', f }); f.lastDodgeT = f.sim.tick; },
    update(f) {
      const S = f.sim, tr = f.trav;
      if (tr.t % 8 === 0) {
        if (tr.leg >= 3) return 'done';
        const l = Math.hypot(f.input.mx, f.input.my);
        tr.ang = l > 0.3 ? Math.atan2(f.input.my, f.input.mx) : tr.ang + (tr.leg % 2 ? -0.9 : 0.9);
        tr.leg++; f.faceAngle(tr.ang);
      }
      tr.t++;
      f.vx = Math.cos(tr.ang) * 5.2; f.vy = Math.sin(tr.ang) * 5.2;
      if (tr.t % 2 === 0) S.fx('Spark', f, { at: 'center', layer: 'back', frameTime: 1 });
      if (tr.t % 3 === 0) S.ev({ e: 'ghost', f });
    },
  },
  // ------------------------------------------------------------ Starmie: pinball spin (Wrecking Ball)
  pinball: {
    replacesDodge: true, cost: 16, cd: 50,
    ai: { use: 'engage', range: [40, 220] },
    init: () => ({ bounceWalls: true }),
    canStart: () => true,
    locomote(f, mx, my) {
      const sp = f.speedNow() * 1.18;
      const l = Math.hypot(mx, my);
      if (l > 0.1) { f.vx += mx * 0.11; f.vy += my * 0.11; }
      const v = Math.hypot(f.vx, f.vy);
      if (v > sp) { f.vx *= sp / v; f.vy *= sp / v; }
      f.vx *= 0.992; f.vy *= 0.992;
      if (v > 0.3) f.faceAngle(Math.atan2(f.vy, f.vx));
      return v > 0.35 ? 'spin' : 'idle';
    },
    start(f) {
      const ang = steer(f);
      f.trav = { t: 0, set: f.sim.newSet() };
      f.vx = Math.cos(ang) * 5.4; f.vy = Math.sin(ang) * 5.4;
      setIframes(f, 8); f.setAnim('Rotate', { loop: true, speed: 2 });
      f.sim.sfx('DUN_Gust_Trap', f);
    },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const v = Math.hypot(f.vx, f.vy) || 1; f.vx = f.vx / v * 5.0; f.vy = f.vy / v * 5.0;
      if (tr.t % 3 === 0) S.fx('Gust', f, { at: 'center', layer: 'back' });
      const o = f.foe;
      if (o && tr.set && S.reach(o, f.x, f.y) < f.r + 2) { if (S.hit(f, o, { att: f, power: 32, type: 'Water', cat: 'physical', kb: 3.5, stun: 16, set: tr.set, x: o.x, y: o.y - 8, kbAng: Math.atan2(f.vy, f.vx), fx: 'Hydro_Cannon' })) tr.set = null; }
      if (tr.t >= 34) { f.vx *= 0.55; f.vy *= 0.55; return 'done'; }
    },
  },
  // ------------------------------------------------------------ Blastoise: shell slide (Wrecking Ball roll)
  shellslide: {
    replacesDodge: true, cost: 16, cd: 54,
    ai: { use: 'escape', range: [0, 200] },
    canStart: () => true,
    start(f) {
      f.trav = { t: 0, ang: steer(f), set: f.sim.newSet() };
      f.setAnim('Withdraw', { loop: false }); f.flags.unstoppable = f.sim.tick + 32;
      setIframes(f, 8);
      f.sim.sfx('DUN_Gust_Trap', f); f.sim.ev({ e: 'dodge', f });
    },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const l = Math.hypot(f.input.mx, f.input.my);
      if (l > 0.3) tr.ang += clamp(angDiff(tr.ang, Math.atan2(f.input.my, f.input.mx)), -0.06, 0.06);
      const sp = 4.4 * (1 - tr.t / 60);
      f.vx = Math.cos(tr.ang) * sp; f.vy = Math.sin(tr.ang) * sp;
      if (tr.t % 3 === 0) S.fx(f.env === 'water' ? 'Bubbles_Blue' : 'Puff_Brown', f, { at: 'feet', layer: 'back' });
      const o = f.foe;
      if (o && tr.set && S.reach(o, f.x, f.y) < f.r + 2) { if (S.hit(f, o, { att: f, power: 38, type: 'Water', cat: 'physical', kb: 4.5, stun: 18, set: tr.set, x: o.x, y: o.y - 8, kbAng: tr.ang, fx: 'Hit_Neutral' })) { tr.set = null; f.vx *= 0.3; } }
      if (tr.t >= 30) { f.flags.unstoppable = 0; return 'done'; }
    },
  },
  // ------------------------------------------------------------ Latios: jet flight, hold R to afterburn (Pharah)
  jet: {
    replacesDodge: true, cost: 8, cd: 20,
    ai: { use: 'chase', range: [120, 400] },
    canStart: (f) => f.stamina > 14,
    start(f) { f.trav = { t: 0, ang: steer(f) }; setIframes(f, 6); f.sim.sfx('DUN_Dragon_Rush', f); f.sim.ev({ e: 'jet', f, on: true }); },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const l = Math.hypot(f.input.mx, f.input.my);
      if (l > 0.3) tr.ang += clamp(angDiff(tr.ang, Math.atan2(f.input.my, f.input.mx)), -0.055, 0.055);
      const sp = f.speedBase * 2.15;
      f.vx = lerp(f.vx, Math.cos(tr.ang) * sp, 0.2); f.vy = lerp(f.vy, Math.sin(tr.ang) * sp, 0.2);
      f.faceAngle(tr.ang);
      f.stamina = Math.max(0, f.stamina - 0.5); f.staminaWait = 18;
      if (tr.t % 2 === 0) S.fx('Dragon_Pulse_Particle_Red', f, { at: 'center', layer: 'back', dirAng: tr.ang + Math.PI });
      if ((!f.input.dodgeHeld && tr.t > 6) || f.stamina <= 0 || tr.t > 240) { S.ev({ e: 'jet', f, on: false }); return 'done'; }
    },
  },
  // ------------------------------------------------------------ Latias: refraction stealth (Sombra)
  refraction: {
    replacesDodge: true, cost: 20, cd: 300,
    ai: { use: 'stealth', range: [0, 400] },
    canStart: () => true,
    start(f) { f.flags.invisible = f.sim.tick + 180; f.trav = { t: 0 }; f.sim.sfx('DUN_Light_Screen', f); f.sim.ev({ e: 'refract', f }); setIframes(f, 6); },
    update(f) { return ++f.trav.t >= 4 ? 'done' : undefined; },
  },
  // ------------------------------------------------------------ Darkrai: shadow drift (Wraith Form / Fade)
  shadowdrift: {
    replacesDodge: true, cost: 14, cd: 42,
    ai: { use: 'escape', range: [0, 120] },
    canStart: () => true,
    locomote(f, mx, my) {
      const sp = f.speedNow();
      f.vx = lerp(f.vx, mx * sp, 0.15); f.vy = lerp(f.vy, my * sp, 0.15);
      f.vx *= 0.98; f.vy *= 0.98;
      return 'glide';
    },
    start(f) { f.trav = { t: 0, ang: steer(f) }; f.flags.intangible = true; f.flags.shadow = true; f.sim.fx('Shadow_Sneak_Shadow', f, { at: 'feet' }); f.sim.sfx('DUN_Nightmare', f); f.sim.ev({ e: 'dodge', f }); f.lastDodgeT = f.sim.tick; },
    update(f) {
      const tr = f.trav; tr.t++;
      const l = Math.hypot(f.input.mx, f.input.my);
      if (l > 0.3) tr.ang = Math.atan2(f.input.my, f.input.mx);
      f.vx = Math.cos(tr.ang) * f.speedBase * 1.6; f.vy = Math.sin(tr.ang) * f.speedBase * 1.6;
      if (tr.t >= 30) { f.flags.intangible = false; f.flags.shadow = false; f.sim.fx('Shadow_Sneak_Hit', f, { at: 'center', layer: 'front' }); setIframes(f, 4); return 'done'; }
    },
    interrupt(f) { f.flags.intangible = false; f.flags.shadow = false; },
  },
  // ------------------------------------------------------------ Mewtwo: levitation + Teleport with 2 charges (Tracer)
  levitate: {
    replacesDodge: true, cost: 10, cd: 14,
    ai: { use: 'escape', range: [0, 100] },
    init: () => ({ charges: 2, rech: 0 }),
    tick(f) { const tv = f.tv; if (tv.charges < 2 && ++tv.rech >= 150) { tv.charges++; tv.rech = 0; } },
    locomote(f, mx, my) { const sp = f.speedNow(); f.vx = lerp(f.vx, mx * sp, 0.17); f.vy = lerp(f.vy, my * sp, 0.17); return 'float'; },
    canStart: (f) => f.tv.charges > 0,
    start(f) { blinkTeleport(f, 84); f.tv.charges--; },
    update(f) { return ++f.trav.t >= 8 ? 'done' : undefined; },
  },
  // ------------------------------------------------------------ Metagross: Magnet Rise juggernaut (Reinhardt's Charge feel)
  magnet: {
    replacesDodge: false,
    init: () => ({ ramT: 0, ramCd: 0 }),
    tick(f) {
      const S = f.sim, tv = f.tv;
      if (tv.ramCd > 0) tv.ramCd--;
      const v = Math.hypot(f.vx, f.vy), top = f.speedNow() * 1.4;
      const o = f.foe;
      if (v > top * 0.82 && o && o.alive && tv.ramCd <= 0 && f.canAct() && S.reach(o, f.x, f.y) < f.r + 4) {
        const ang = Math.atan2(f.vy, f.vx);
        if (S.hit(f, o, { att: f, power: 46, type: 'Steel', cat: 'physical', kb: 5, stun: 20, set: S.newSet(), heavy: true, x: o.x, y: o.y - 8, kbAng: ang, fx: 'Metal_Burst_Hit' })) { tv.ramCd = 70; f.vx *= 0.3; f.vy *= 0.3; S.ev({ e: 'shake', amt: 4 }); }
      }
    },
    locomote(f, mx, my) {
      const top = f.speedNow() * 1.4, v = Math.hypot(f.vx, f.vy);
      const l = Math.hypot(mx, my);
      // slow to start and turn, then very fast
      const accel = 0.035 + 0.075 * clamp(v / top, 0, 1);
      if (l > 0.1) {
        const want = Math.atan2(my, mx), cur = v > 0.2 ? Math.atan2(f.vy, f.vx) : want;
        const na = cur + clamp(angDiff(cur, want), -0.07, 0.07);
        const nv = Math.min(top, v + accel * 1.4);
        f.vx = Math.cos(na) * nv; f.vy = Math.sin(na) * nv;
        if (Math.abs(angDiff(cur, want)) > 2.2) { f.vx *= 0.9; f.vy *= 0.9; }
      } else { f.vx *= 0.93; f.vy *= 0.93; }
      if (Math.hypot(f.vx, f.vy) > 0.3) f.faceAngle(Math.atan2(f.vy, f.vx));
      return 'hover';
    },
  },
  // ------------------------------------------------------------ Hawlucha: rope bounce + aimed leap (Winston)
  ropes: {
    replacesDodge: true, cost: 16, cd: 45,
    ai: { use: 'engage', range: [60, 160] },
    init: () => ({ sling: 0 }),
    tick(f) { if (f.tv.sling > 0) f.tv.sling--; },
    speedMul: (f) => (f.tv.sling > 0 ? 1.65 : 1),
    onWall(f, hit) {
      if (f.state !== 'walk' || f.tv.sling > 0) return;
      const b = f.sim.bounds;
      if (f.x <= b.x0 + f.r + 0.5 || f.x >= b.x1 - f.r - 0.5) f.vx = -f.vx * 1.7;
      if (f.y <= b.y0 + f.r + 0.5 || f.y >= b.y1 - f.r - 0.5) f.vy = -f.vy * 1.7;
      f.tv.sling = 26; f.sim.ev({ e: 'rope', f }); f.sim.sfx('DUN_Gust_Trap', f);
    },
    canStart: () => true,
    start(f) {
      const S = f.sim;
      const l = Math.hypot(f.input.mx, f.input.my);
      const o = f.foe;
      let ang, d;
      if (l > 0.3) { ang = Math.atan2(f.input.my, f.input.mx); d = 96; } else if (o) { ang = Math.atan2(o.y - f.y, o.x - f.x); d = Math.min(110, Math.hypot(o.x - f.x, o.y - f.y)); } else { ang = f.aim; d = 80; }
      const dest = S.clampPoint(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d, f.r);
      f.trav = { t: 0, from: { x: f.x, y: f.y }, dest };
      f.faceAngle(ang); f.setAnim('Hop', { speed: 0.8 });
      setIframes(f, 16); f.flags.airborne = true;
      S.ev({ e: 'tele', x: dest.x, y: dest.y, r: 20, ticks: 26, name: 'target', owner: f });
    },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const k = tr.t / 26;
      f.x = tr.from.x + (tr.dest.x - tr.from.x) * k; f.y = tr.from.y + (tr.dest.y - tr.from.y) * k; f.z = Math.sin(k * Math.PI) * 40;
      f.vx = f.vy = 0;
      if (tr.t >= 26) {
        f.z = 0; f.flags.airborne = false;
        S.fx('Wood_Hammer_Smoke', f, { at: 'feet', layer: 'front' }); S.ev({ e: 'shake', amt: 2 });
        const o = f.foe;
        if (o && o.alive && S.reach(o, f.x, f.y) < 22) S.hit(f, o, { att: f, power: 26, type: 'Fighting', cat: 'physical', kb: 3, stun: 14, set: S.newSet(), x: o.x, y: o.y - 8 });
        return 'done';
      }
    },
    interrupt(f) { f.z = 0; f.flags.airborne = false; },
  },
  // ------------------------------------------------------------ Lugia: Dive (water) / wingbeat dash (air) (Moira's Fade)
  dive: {
    replacesDodge: true, cost: 16, cd: 60,
    ai: { use: 'escape', range: [0, 120] },
    canStart: () => true,
    start(f) {
      const S = f.sim;
      f.trav = { t: 0, ang: steer(f), mode: f.env === 'water' ? 'dive' : 'dash' };
      if (f.trav.mode === 'dive') { f.flags.intangible = true; f.flags.submerged = true; S.fx('Dive', f, { at: 'feet', layer: 'front' }); S.sfx('DUN_Dive', f); }
      else { setIframes(f, 12); f.setAnim('Hop', { speed: 1.4 }); S.sfx('DUN_Wing_Attack_2', f); f.sim.ev({ e: 'dodge', f }); f.lastDodgeT = S.tick; }
    },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const l = Math.hypot(f.input.mx, f.input.my);
      if (l > 0.3) tr.ang += clamp(angDiff(tr.ang, Math.atan2(f.input.my, f.input.mx)), -0.2, 0.2);
      if (tr.mode === 'dive') {
        const sp = f.speedBase * 1.35;
        f.vx = lerp(f.vx, Math.cos(tr.ang) * sp, 0.2); f.vy = lerp(f.vy, Math.sin(tr.ang) * sp, 0.2);
        if (tr.t % 6 === 0) S.fx('Bubbles_Blue', f, { at: 'feet', layer: 'back' });
        if (tr.t >= 60 || (tr.t > 10 && f.input.dodge)) { f.flags.intangible = false; f.flags.submerged = false; S.fx('Water_Spout_Splash', f, { at: 'feet', layer: 'front' }); S.sfx('DUN_Dive', f); setIframes(f, 6); return 'done'; }
      } else {
        const k = 1 - tr.t / 24, sp = 1.2 + 5 * k * k;
        f.vx = Math.cos(tr.ang) * sp; f.vy = Math.sin(tr.ang) * sp; f.faceAngle(tr.ang);
        if (tr.t % 3 === 0) S.ev({ e: 'ghost', f });
        if (tr.t % 4 === 0) S.fx('Gust_Wind', f, { at: 'center', layer: 'back' });
        if (tr.t >= 24) return 'done';
      }
    },
    interrupt(f) { f.flags.intangible = false; f.flags.submerged = false; },
  },
  // ------------------------------------------------------------ Suicune: north wind skim + speed trail (Lucio / Kitsune Rush)
  skim: {
    replacesDodge: false,
    init: () => ({ onTrail: false }),
    tick(f) {
      if (f.state === 'walk' || f.state === 'dodge') addTrail(f, 'wind', 120, 13);
      const S = f.sim; let on = false;
      for (const t of S.trails) if (t.owner === f && t.kind === 'wind' && S.tick - t.born > 20 && Math.hypot(t.x - f.x, t.y - f.y) < t.r) { on = true; break; }
      f.tv.onTrail = on;
    },
    speedMul: (f) => (f.tv.onTrail ? 1.3 : 1) * (f.env === 'water' ? 1.15 : 1),
    locomote(f, mx, my) {
      if (f.env !== 'water') return false;
      const sp = f.speedNow(); f.vx = lerp(f.vx, mx * sp, 0.2); f.vy = lerp(f.vy, my * sp, 0.2); return 'skim';
    },
  },
  // ------------------------------------------------------------ Empoleon: belly slide (penguin slide)
  bellyslide: {
    replacesDodge: true, cost: 12, cd: 40,
    ai: { use: 'engage', range: [40, 260] },
    canStart: () => true,
    start(f) {
      f.trav = { t: 0, ang: steer(f), set: f.sim.newSet(), max: f.env === 'water' || f.sim.map.ice ? 180 : 30 };
      setIframes(f, 8); f.setAnim('Hop', { speed: 0.6 });
      f.sim.sfx('DUN_Aqua_Tail', f); f.sim.ev({ e: 'dodge', f }); f.lastDodgeT = f.sim.tick;
    },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const l = Math.hypot(f.input.mx, f.input.my);
      if (l > 0.3) {
        const want = Math.atan2(f.input.my, f.input.mx);
        if (Math.abs(angDiff(tr.ang, want)) > 1.2 && tr.t > 8) return 'done';   // steer out
        tr.ang += clamp(angDiff(tr.ang, want), -0.05, 0.05);
      }
      const sp = tr.max > 30 ? 3.9 : 3.6 * (1 - tr.t / 40);
      f.vx = Math.cos(tr.ang) * sp; f.vy = Math.sin(tr.ang) * sp; f.faceAngle(tr.ang);
      if (tr.t % 4 === 0) S.fx(f.env === 'water' ? 'Bubbles_Blue' : 'Puff_White', f, { at: 'feet', layer: 'back' });
      const o = f.foe;
      if (o && tr.set && S.reach(o, f.x, f.y) < f.r + 2) { if (S.hit(f, o, { att: f, power: 34, type: 'Water', cat: 'physical', kb: 4, stun: 16, set: tr.set, x: o.x, y: o.y - 8, kbAng: tr.ang, fx: 'Aqua_Tail_Splash' })) tr.set = null; }
      if (tr.t >= tr.max || (tr.t > 10 && f.input.dodge)) return 'done';
    },
  },
  // ------------------------------------------------------------ Raikou: volt dash zigzag + damaging trail (Tracer)
  voltdash: {
    replacesDodge: true, cost: 20, cd: 72,
    ai: { use: 'engage', range: [60, 260] },
    canStart: () => true,
    start(f) { f.trav = { t: 0, base: steer(f), leg: 0 }; setIframes(f, 10); f.setAnim('QuickStrike', { speed: 1.4 }); f.sim.sfx('DUN_Spark', f); f.sim.ev({ e: 'dodge', f }); f.lastDodgeT = f.sim.tick; },
    update(f) {
      const S = f.sim, tr = f.trav; tr.t++;
      const l = Math.hypot(f.input.mx, f.input.my);
      if (l > 0.3) tr.base += clamp(angDiff(tr.base, Math.atan2(f.input.my, f.input.mx)), -0.12, 0.12);
      const leg = Math.floor((tr.t - 1) / 10);
      const ang = tr.base + (leg % 2 ? -0.6 : 0.6);
      f.vx = Math.cos(ang) * 5.8; f.vy = Math.sin(ang) * 5.8; f.faceAngle(ang);
      if (tr.t % 2 === 0) { S.trails.push({ owner: f, kind: 'volt', x: f.x, y: f.y, until: S.tick + 60, born: S.tick, r: 10, ang }); }
      if (tr.t % 3 === 0) S.ev({ e: 'ghost', f });
      if (tr.t >= 30) { f.vx *= 0.4; f.vy *= 0.4; return 'done'; }
    },
  },
  // ------------------------------------------------------------ Venusaur: Ingrain (Bastion turret mode), R roots / uproots
  ingrain: {
    replacesDodge: true, cost: 0, cd: 30,
    ai: { use: 'root', range: [90, 400] },
    init: () => ({ rooted: false }),
    canStart: () => true,
    tick(f) { if (f.tv.rooted && f.alive && f.sim.tick % 60 === 0 && f.sim.phase === 'fight') f.sim.heal(f, f.maxHp * 0.012); },
    locomote(f) { if (!f.tv.rooted) return false; f.vx *= 0.5; f.vy *= 0.5; f.faceFoe(0.2); return 'rooted'; },
    start(f) {
      f.tv.rooted = !f.tv.rooted; f.trav = { t: 0 };
      f.setAnim('Charge', {});
      f.sim.fx('Ingrain', f, { at: 'feet', layer: f.tv.rooted ? 'back' : 'front' }); f.sim.sfx('DUN_Ingrain', f);
      f.sim.ev({ e: 'ingrain', f, on: f.tv.rooted });
    },
    update(f) { return ++f.trav.t >= 10 ? 'done' : undefined; },
    armor: (f) => (f.tv.rooted ? 0.75 : 1), kbTaken: (f) => (f.tv.rooted ? 0.25 : 1), actSpeed: (f) => (f.tv.rooted ? 1.3 : 1),
  },
  // ------------------------------------------------------------ Sceptile: quick leaps
  leap: {
    replacesDodge: true, cost: 12, cd: 21,
    ai: { use: 'escape', range: [0, 100] },
    canStart: () => true,
    start(f) {
      const ang = steer(f);
      f.trav = { t: 0, ang }; setIframes(f, 15); f.flags.airborne = true;
      f.setAnim('Hop', { speed: 1.2 }); f.faceAngle(ang); f.sim.ev({ e: 'dodge', f }); f.lastDodgeT = f.sim.tick;
    },
    update(f) {
      const tr = f.trav; tr.t++;
      const k = 1 - tr.t / 22, sp = 1.3 + 5.6 * k * k;
      f.vx = Math.cos(tr.ang) * sp; f.vy = Math.sin(tr.ang) * sp; f.z = Math.sin(tr.t / 22 * Math.PI) * 18;
      if (tr.t % 4 === 0) f.sim.ev({ e: 'ghost', f });
      if (tr.t >= 22) { f.z = 0; f.flags.airborne = false; f.sim.fx('Puff_White', f, { at: 'feet' }); return 'done'; }
    },
    interrupt(f) { f.z = 0; f.flags.airborne = false; },
  },
  // ------------------------------------------------------------ Deoxys: Speed Forme gets Teleport blink charges (Tracer)
  deoxys: {
    replacesDodge: (f) => f.form === 'speed', cost: 10, cd: 14,
    ai: { use: 'escape', range: [0, 100] },
    init: () => ({ charges: 2, rech: 0 }),
    tick(f) { const tv = f.tv; if (tv.charges < 2 && ++tv.rech >= 120) { tv.charges++; tv.rech = 0; } },
    canStart: (f) => f.form === 'speed' && f.tv.charges > 0,
    start(f) { blinkTeleport(f, 96); f.tv.charges--; },
    update(f) { return ++f.trav.t >= 8 ? 'done' : undefined; },
    armor: (f) => (f.form === 'defense' ? 0.72 : 1),
  },
  // ------------------------------------------------------------ Gliscor: glides with momentum
  glide: {
    replacesDodge: false,
    locomote(f, mx, my) {
      const top = f.speedNow() * 1.2, l = Math.hypot(mx, my);
      if (l > 0.1) { f.vx += mx * 0.1; f.vy += my * 0.1; } else { f.vx *= 0.97; f.vy *= 0.97; }
      const v = Math.hypot(f.vx, f.vy);
      if (v > top) { f.vx *= top / v; f.vy *= top / v; }
      if (v > 0.3) f.faceAngle(Math.atan2(f.vy, f.vx));
      return 'glide';
    },
  },
};

// passive trails declared through species.passive
export const PASSIVES = {
  misttrail: { tick(f) { if (f.state === 'walk') addTrail(f, 'mist', 110, 13); } },
  firetrail: { tick(f) { if (f.state === 'walk') addTrail(f, 'fire', 110, 12); } },
  rainbowtrail: { tick(f) { if (f.state === 'walk') addTrail(f, 'rainbow', 150, 14); } },
};

function blinkTeleport(f, dist) {
  const S = f.sim, ang = steer(f);
  const p = S.clampPoint(f.x + Math.cos(ang) * dist, f.y + Math.sin(ang) * dist, f.r);
  S.ev({ e: 'blink', f, x0: f.x, y0: f.y, x1: p.x, y1: p.y, fx: 'Circle_Red_Out|Psychic' });
  S.sfx('DUN_Move_Start', f);
  f.x = p.x; f.y = p.y; f.vx *= 0.3; f.vy *= 0.3;
  setIframes(f, 10);
  f.trav = { t: 0 };
  f.lastDodgeT = S.tick;
  const o = f.foe; if (o) f.faceAngle(Math.atan2(o.y - f.y, o.x - f.x));
}
