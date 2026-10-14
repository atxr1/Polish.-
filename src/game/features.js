// One interactive feature per map (Overwatch-style environmental play). Each factory receives the sim and
// returns hooks: update(), push(f), speedMul(f), collide(f,p), onProj(p), onProjEnd(p), onSlam(f).
// Every feature exposes `hazards` / `boosts` (circles the AI reads) and `view` state for the renderer.
import { clamp } from '../core/util.js';

const cfgOf = (S) => S.map.featureCfg || {};

export const FEATURES = {
  // Bell Tower: hitting the bronze bell rings out a shockwave that staggers anyone close to it
  bell(S) {
    const c = cfgOf(S);
    const F = { hazards: [], boosts: [], view: { ringT: -999, cd: 0 }, bell: { x: c.x, y: c.y, x0: c.x - c.w / 2, x1: c.x + c.w / 2 } };
    const ring = (by) => {
      if (F.view.cd > 0 || S.phase !== 'fight') return;
      F.view.cd = 300; F.view.ringT = S.tick;
      S.ev({ e: 'bell', x: c.x, y: c.y }); S.ev({ e: 'shake', amt: 6 });
      const cx = c.x, cy = S.bounds.y0 + 34;
      for (const f of S.fighters()) {
        if (!f.alive || !f.onField || f.flags.intangible) continue;
        const d = Math.hypot(f.x - cx, f.y - cy);
        if (d < c.r) { const a = Math.atan2(f.y - cy, f.x - cx); f.kvx += Math.cos(a) * 3.2; f.kvy += Math.sin(a) * 3.2; if (!f.flags.unstoppable) f.hurt(28, a); S.ev({ e: 'stagger', f }); }
      }
    };
    const nearBell = (x, y) => x > F.bell.x0 && x < F.bell.x1 && y < S.bounds.y0 + 16;
    F.update = () => { if (F.view.cd > 0) F.view.cd--; };
    F.onProjEnd = (p) => { if (nearBell(p.x, p.y)) ring(p.owner); };
    F.onSlam = (f) => { if (nearBell(f.x, f.y - f.r)) ring(f.lastHitBy); };
    F.onProj = (p) => { if (nearBell(p.x, p.y) && p.y < S.bounds.y0 + 6) ring(p.owner); };
    return F;
  },
  // Mt. Chimney: telegraphed lava vents erupt at the edges
  vents(S) {
    const c = cfgOf(S);
    const F = { hazards: [], boosts: [], view: { vents: c.vents.map((v) => ({ x: v.x, y: v.y, state: 'idle', t: 0 })) } };
    let next = 180;
    F.update = () => {
      if (S.phase !== 'fight') return;
      if (--next <= 0) {
        next = 200 + Math.floor(S.rng() * 120);
        const n = S.overtime ? 3 : 2;
        const idle = F.view.vents.filter((v) => v.state === 'idle');
        for (let i = 0; i < n && idle.length; i++) { const v = idle.splice(Math.floor(S.rng() * idle.length), 1)[0]; v.state = 'tele'; v.t = 0; S.ev({ e: 'tele', x: v.x, y: v.y, r: 30, ticks: 70, name: 'lava' }); }
      }
      F.hazards.length = 0;
      for (const v of F.view.vents) {
        v.t++;
        if (v.state === 'tele') { F.hazards.push({ x: v.x, y: v.y, r: 36 }); if (v.t >= 70) { v.state = 'erupt'; v.t = 0; erupt(v); } }
        else if (v.state === 'erupt') { F.hazards.push({ x: v.x, y: v.y, r: 32 }); if (v.t >= 40) { v.state = 'idle'; v.t = 0; } }
      }
    };
    function erupt(v) {
      S.ev({ e: 'sfx', id: 'DUN_Lava_Plume', x: v.x });
      S.zones.push({ id: S.newSet(), owner: S.ENV, x: v.x, y: v.y, r: 30, t: 0, delay: 0, ticks: 40, interval: 20, spec: { att: S.ENV, power: 34, type: 'Fire', cat: 'special', kb: 3.5, stun: 18, status: { burn: 0.4 }, heavy: true, fx: 'Lava_Plume_Fire' }, st: { kbOut: true, shake: 3 }, set: S.newSet(), burst: 'Eruption', fx: 'Lava_Plume_Fire', fxFT: 2, moveId: 'vent', type: 'Fire' });
    }
    return F;
  },
  // Spear Pillar: a pair of space-time rift portals link two spots
  rift(S) {
    const c = cfgOf(S);
    const P = c.portals;
    const F = { hazards: [], boosts: [], view: { portals: P, pulse: 0 } };
    const cd = new Map();
    F.update = () => {
      F.view.pulse++;
      if (S.phase !== 'fight') return;
      for (const f of S.fighters()) {
        if (!f.alive || !f.onField || f.flags.airborne || (cd.get(f) || 0) > S.tick) continue;
        for (let i = 0; i < 2; i++) {
          const p = P[i], q = P[1 - i];
          if (Math.hypot(f.x - p.x, f.y - p.y) < 11) {
            const a = Math.atan2(f.vy, f.vx) || 0;
            const dest = S.clampPoint(q.x + Math.cos(a) * 20, q.y + Math.sin(a) * 20, f.r);
            S.ev({ e: 'rift', f, x0: f.x, y0: f.y, x1: dest.x, y1: dest.y });
            f.x = dest.x; f.y = dest.y; if (f.serpent) f.serpent.reset();
            cd.set(f, S.tick + 90);
            break;
          }
        }
      }
      for (const pr of S.projs) {
        if (pr.lob || pr.rifted > S.tick) continue;
        for (let i = 0; i < 2; i++) {
          const p = P[i], q = P[1 - i];
          if (Math.hypot(pr.x - p.x, pr.y - p.y) < 10) { pr.x = q.x + pr.vx * 4; pr.y = q.y + pr.vy * 4; pr.rifted = S.tick + 30; S.ev({ e: 'rift', proj: true, x0: p.x, y0: p.y, x1: q.x, y1: q.y }); break; }
        }
      }
    };
    F.boosts = P.map((p) => ({ x: p.x, y: p.y, r: 14, kind: 'portal' }));
    return F;
  },
  // Cerulean Gym: pool inlets push swimmers
  inlets(S) {
    const c = cfgOf(S);
    const F = { hazards: [], boosts: [], view: { inlets: c.inlets.map((v) => Object.assign({ on: false, t: 0 }, v)) } };
    let cycle = 0;
    F.update = () => {
      cycle++;
      const phase = Math.floor(cycle / 300) % 2;   // alternate pairs every 5 s
      for (const [i, v] of F.view.inlets.entries()) {
        const on = (i % 2) === phase;
        if (on !== v.on) { v.on = on; v.t = 0; if (on) S.ev({ e: 'inlet', v }); }
        v.t++;
      }
    };
    F.push = (f) => {
      if (f.flags.submerged || f.state === 'enter') return null;
      let px = 0, py = 0;
      for (const v of F.view.inlets) {
        if (!v.on) continue;
        const dx = f.x - v.x, dy = f.y - v.y;
        // current runs along v.dx/v.dy in a band
        const along = dx * v.dx + dy * v.dy, across = Math.abs(-dx * v.dy + dy * v.dx);
        if (along > 0 && along < v.len && across < v.w) { const k = 1 - along / v.len; px += v.dx * 0.9 * k; py += v.dy * 0.9 * k; }
      }
      return px || py ? { x: px, y: py } : null;
    };
    return F;
  },
  // Whirl Islands: the whirlpool current pulls toward the center
  whirlpool(S) {
    const c = cfgOf(S);
    const F = { hazards: [], boosts: [], view: { x: c.x, y: c.y, r: c.r, spin: 0 } };
    F.update = () => { F.view.spin += 0.02; };
    F.push = (f) => {
      if (f.flags.submerged || f.state === 'enter') return null;
      const dx = c.x - f.x, dy = c.y - f.y, d = Math.hypot(dx, dy);
      if (d > c.r || d < 4) return null;
      const k = (1 - d / c.r) * 0.55 + 0.1, pulse = 0.85 + 0.15 * Math.sin(S.tick / 40);
      return { x: (dx / d * 0.45 - dy / d * 0.55) * k * pulse, y: (dy / d * 0.45 + dx / d * 0.55) * k * pulse };
    };
    F.hazards = [{ x: c.x, y: c.y, r: 26 }];
    return F;
  },
  // Sootopolis: rain showers come and go, boosting Water moves
  rain(S) {
    const F = { hazards: [], boosts: [], view: { state: 'dry', t: 0 } };
    let t = 0;
    F.update = () => {
      if (S.phase !== 'fight') return;
      t++;
      const v = F.view;
      if (v.state === 'dry' && t >= 600) { v.state = 'gather'; t = 0; S.ev({ e: 'announce', text: 'Clouds gather over the crater…' }); }
      else if (v.state === 'gather' && t >= 120) { v.state = 'rain'; t = 0; S.setWeather('rain', 480, null); }
      else if (v.state === 'rain' && t >= 480) { v.state = 'dry'; t = 0; }
      v.t = t;
    };
    return F;
  },
  // Azure Bay: waves sweep across
  waves(S) {
    const F = { hazards: [], boosts: [], view: { tele: null } };
    let t = 0, dir = 1;
    F.update = () => {
      if (S.phase !== 'fight') return;
      t++;
      if (t === 360) { dir = S.rng() < 0.5 ? 1 : -1; F.view.tele = { dir, t: 0 }; S.ev({ e: 'tele', name: 'wave', dir, ticks: 70 }); }
      if (F.view.tele) F.view.tele.t++;
      if (t === 430) {
        const b = S.bounds;
        const w = { id: S.newSet(), owner: S.ENV, x: dir > 0 ? b.x0 - 30 : b.x1 + 30, y: (b.y0 + b.y1) / 2, vx: dir * 3.1, h: b.y1 - b.y0 + 30, w: 26, push: 0.75, t: 0, env: true };
        S.waves.push(w); S.ev({ e: 'wave', wave: w }); F.view.tele = null; t = 0;
      }
    };
    return F;
  },
  // Kanto Skies: wind lanes give a speed boost
  windlanes(S) {
    const c = cfgOf(S), b = S.bounds;
    const F = { hazards: [], boosts: [], view: { lanes: [] } };
    const make = () => {
      F.view.lanes = c.lanes.map((y, i) => ({ y: b.y0 + (b.y1 - b.y0) * y, h: 34, dir: (i + Math.floor(S.tick / 720)) % 2 ? -1 : 1 }));
      F.boosts = F.view.lanes.map((l) => ({ x: (b.x0 + b.x1) / 2, y: l.y, r: 60, kind: 'lane', lane: l }));
    };
    make();
    F.update = () => { if (S.tick % 720 === 0) { make(); S.ev({ e: 'windShift' }); } };
    const laneOf = (f) => F.view.lanes.find((l) => Math.abs(f.y - l.y) < l.h / 2);
    F.speedMul = (f) => { const l = laneOf(f); if (!l) return 1; const along = Math.sign(f.vx) === l.dir; return Math.abs(f.vx) > 0.3 ? (along ? 1.35 : 0.85) : 1; };
    F.push = (f) => { const l = laneOf(f); return l && f.state !== 'enter' ? { x: l.dir * 0.28, y: 0 } : null; };
    return F;
  },
  // Sky Pillar: drifting updraft columns lift fighters: faster, and their next hit is stronger
  updrafts(S) {
    const c = cfgOf(S), b = S.bounds;
    const cols = c.cols.map((p, i) => ({ x: b.x0 + (b.x1 - b.x0) * p[0], y: b.y0 + (b.y1 - b.y0) * p[1], r: 26, vx: i % 2 ? -0.18 : 0.18, vy: i % 2 ? 0.11 : -0.11 }));
    const F = { hazards: [], boosts: cols.map((c2) => Object.assign(c2, { kind: 'updraft' })), view: { cols } };
    F.update = () => {
      for (const col of cols) {
        col.x += col.vx; col.y += col.vy;
        if (col.x < b.x0 + 40 || col.x > b.x1 - 40) col.vx = -col.vx;
        if (col.y < b.y0 + 40 || col.y > b.y1 - 40) col.vy = -col.vy;
      }
      if (S.phase !== 'fight') return;
      for (const f of S.fighters()) {
        if (!f.alive || !f.onField) continue;
        const inside = cols.some((col) => Math.hypot(f.x - col.x, f.y - col.y) < col.r);
        if (inside) { if (!(f.tv.updraft > S.tick)) S.ev({ e: 'updraft', f }); f.tv.updraft = S.tick + 90; }
      }
    };
    F.speedMul = (f) => (f.tv.updraft > S.tick ? 1.3 : 1);
    return F;
  },
  // Dragonspiral Tower: snow gusts push fighters
  gusts(S) {
    const F = { hazards: [], boosts: [], view: { state: 'calm', t: 0, ang: 0 } };
    let t = 0;
    F.update = () => {
      if (S.phase !== 'fight') return;
      const v = F.view; t++;
      if (v.state === 'calm' && t >= 330) { v.state = 'tele'; t = 0; v.ang = Math.floor(S.rng() * 4) * Math.PI / 2 + (S.rng() - 0.5) * 0.5; S.ev({ e: 'tele', name: 'gust', ang: v.ang, ticks: 60 }); }
      else if (v.state === 'tele' && t >= 60) { v.state = 'gust'; t = 0; S.ev({ e: 'gust', ang: v.ang }); }
      else if (v.state === 'gust' && t >= 80) { v.state = 'calm'; t = 0; }
      v.t = t;
    };
    F.push = (f) => (F.view.state === 'gust' && f.state !== 'enter' && !f.flags.intangible ? { x: Math.cos(F.view.ang) * 0.85, y: Math.sin(F.view.ang) * 0.85 } : null);
    return F;
  },
  // Lumiose Skyline: Prism Tower's sweeping beacon reveals invisible fighters
  beacon(S) {
    const c = cfgOf(S);
    const F = { hazards: [], boosts: [], view: { x: c.x, y: c.y, ang: 0, w: 0.16 } };
    F.update = () => {
      F.view.ang = (F.view.ang + 0.016) % (Math.PI * 2);
      for (const f of S.fighters()) {
        if (!f.onField) continue;
        const a = Math.atan2(f.y - c.y, f.x - c.x);
        let d = a - F.view.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < F.view.w) { if (f.hidden() && !(f.flags.revealed > S.tick)) S.ev({ e: 'revealed', f }); f.flags.revealed = S.tick + 45; }
      }
    };
    return F;
  },
};
export const FEATURE_INFO = {
  bell: 'Hit the bronze bell to ring a staggering shockwave.',
  vents: 'Lava vents erupt at the edges after a glow.',
  rift: 'Two space-time rifts link the arena.',
  inlets: 'Pool inlets push swimmers along.',
  whirlpool: 'The whirlpool drags everything toward the center.',
  rain: 'Rain showers come and go, boosting Water moves.',
  waves: 'Waves sweep across the bay.',
  windlanes: 'Wind lanes speed up anyone flying with them.',
  updrafts: 'Updrafts boost speed and the next hit.',
  gusts: 'Snow gusts shove fighters across the sky.',
  beacon: 'Prism Tower\'s beacon reveals hidden fighters.',
};
export { clamp };
