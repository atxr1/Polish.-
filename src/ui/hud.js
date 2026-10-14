// Battle HUD: broadcast-style panels drawn as crisp vector UI at device resolution over the pixel world.
// Panels: live sprite portrait with Ultimate ring, name, type chips, segmented HP bar (10% ticks, green/yellow/
// red, smooth drain + lagging chunk, exact numbers), status badges, Poké Ball team indicators, timer plate
// (Double Stamina / Sudden Death), the central stamina gauge with move-cost notches, callouts and announcer.
import { TYPE_COLORS } from '../core/util.js';
import { CONTENT } from '../game/content.js';
// HUD gradients are rebuilt only when their geometry or colours change (not every frame)
const GRADS = new Map();
function grad(c, x0, y0, x1, y1, ...stops) {
  const k = x0 + ',' + y0 + ',' + x1 + ',' + y1 + ',' + stops.join(';');
  let g = GRADS.get(k);
  if (!g) { if (GRADS.size > 96) GRADS.clear(); g = c.createLinearGradient(x0, y0, x1, y1); for (const [p, col] of stops) g.addColorStop(p, col); GRADS.set(k, g); }
  return g;
}

const F_COND = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", sans-serif';
const COL = { night: '#16122e', dusk: '#2b2252', plate: '#1d1838', orange: '#ff8a3d', gold: '#ffd25a', red: '#e8333c', green: '#5fd36b', yellow: '#f5c542', hpRed: '#ff4d4d', cream: '#fff6e6', dim: '#b9b0d6', stam: '#62d2ff' };
const STATUS_BADGE = { burn: ['BRN', '#ee7a30'], poison: ['PSN', '#a048b0'], para: ['PAR', '#e8c020'], sleep: ['SLP', '#8a8aa8'], freeze: ['FRZ', '#60c8e8'], confuse: ['CNF', '#e070c0'], slow: ['SLW', '#5a8ad8'] };

export class HUD {
  constructor(gfx) { this.g = gfx; this.disp = new Map(); this.callouts = []; this.announce = []; this.moveCalls = [null, null]; this.t = 0; this.potm = false; }
  reset() { this.disp.clear(); this.callouts.length = 0; this.announce.length = 0; this.moveCalls = [null, null]; }
  callout(text, color = COL.cream) {
    const same = this.callouts.find((x) => x.text === text);
    if (same) { same.t = Math.min(same.t, 10); return; }
    this.callouts.push({ text, color, t: 0 }); if (this.callouts.length > 2) this.callouts.shift();
  }
  say(text, sub, ticks = 120, style = 'banner') { this.announce = this.announce.filter((a) => a.style !== style || style === 'banner'); this.announce.push({ text, sub, t: 0, ticks, style }); if (this.announce.length > 2) this.announce.shift(); }
  moveCall(side, name, type, ult) { this.moveCalls[side] = { name, type, ult, t: 0 }; }
  consume(S, events, me) {
    for (const ev of events) {
      if (ev.e === 'moveCall') this.moveCall(ev.f.side, ev.name, ev.type, ev.ult);
      else if (ev.e === 'hit' && !ev.multi && !ev.statusOnly && ev.dmg > 0) { if (ev.eff >= 1.75) this.callout('It\'s extremely effective!', COL.gold); else if (ev.eff > 1) this.callout('It\'s super effective!', COL.gold); else if (ev.eff < 1) this.callout('It\'s not very effective…', COL.dim); }
      else if (ev.e === 'overtime') this.say('Double Stamina!', 'Stamina regenerates twice as fast', 150, 'banner');
      else if (ev.e === 'sudden') this.say('Sudden death!', 'The next hit wins', 150, 'banner');
      else if (ev.e === 'mega') this.say(ev.f.sp.name + (ev.primal ? ' underwent Primal Reversion!' : ' Mega Evolved!'), ev.name, 150, 'banner');
      else if (ev.e === 'forme') this.callout('Deoxys changed to ' + (ev.forme === 'normal' ? 'Normal Forme' : ev.f.sp.formes[ev.forme].name) + '!', COL.gold);
      else if (ev.e === 'status') this.callout(statusLine(ev.f, ev.kind), COL.cream);
      else if (ev.e === 'weather' && ev.kind === 'rain') this.callout('It started to rain!', '#9fd0ff');
      else if (ev.e === 'airlock') this.callout('The effects of weather disappeared.', COL.dim);
      else if (ev.e === 'intimidate') this.callout(ev.f.sp.name + '\'s Intimidate cuts ' + ev.o.sp.name + '\'s attack!', COL.cream);
      else if (ev.e === 'faintText') this.say(ev.f.sp.name + (ev.f.side === me ? ' fainted!' : ' is unable to battle!'), null, 110, 'faint');
      else if (ev.e === 'timeup') this.say('Time!', null, 120, 'banner');
      else if (ev.e === 'ultimate') this.callout(ev.f.sp.name + ' used its Ultimate!', COL.gold);
      else if (ev.e === 'revealed') this.callout(ev.f.sp.name + ' was revealed!', COL.gold);
      else if (ev.e === 'announce') this.callout(ev.text, '#cfe3ff');
    }
  }
  // ------------------------------------------------------------------------------------------------- draw
  draw(c, S, view) {
    // view: {w, h (css px), dpr, me (player side), insets {l,r,t,b}, world (World), controls (bool), trainerMode}
    const dt = this.lastTick === undefined || S.tick < this.lastTick ? 1 : Math.min(240, S.tick - this.lastTick);
    this.lastTick = S.tick; this.dt = dt; this.t += dt;
    c.save();
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.textBaseline = 'alphabetic';
    const L = view.insets.l + 10, R = view.w - view.insets.r - 10, T = view.insets.t + 6;
    const pw = Math.min(300, (R - L) * 0.38);
    const me = view.me, o = 1 - me;
    // panels fade back when a fighter is underneath them so the action is never hidden
    const W = view.world, kk = (view.scale || 1) / view.dpr;
    const under = (x, y, w, h) => W && S.fighters().some((f) => {
      if (!f.onField || f.state === 'hidden') return false;
      const p = W.toScreen(f.x, f.y), sx = p.x * kk, bot = (p.y + 4) * kk, top = (p.y - 44) * kk;
      return sx > x - 12 && sx < x + w + 12 && bot > y && top < y + h;
    });
    this.fade = this.fade || [1, 1, 1];
    const ease = (i, occ) => { this.fade[i] += ((occ ? 0.35 : 1) - this.fade[i]) * Math.min(1, 0.25 * this.dt); return this.fade[i]; };
    const sw = Math.min(320, view.w * 0.34) + 30, sy = view.h - view.insets.b - (view.controls ? 26 : 18) - 22;
    c.globalAlpha = ease(0, under(L, T, pw, 64)); this.panel(c, S, me, L, T, pw, false, view);
    c.globalAlpha = ease(1, under(R - pw, T, pw, 64)); this.panel(c, S, o, R - pw, T, pw, true, view);
    c.globalAlpha = 1;
    this.timer(c, S, view.w / 2, T);
    if (!this.potm) {
      c.globalAlpha = ease(2, under(view.w / 2 - sw / 2, sy, sw, 50));
      this.stamina(c, S, me, view);
      c.globalAlpha = 1;
      this.offscreen(c, S, view);
    }
    this.moveBanners(c, S, view, L, R, T, pw);
    this.drawCallouts(c, view);
    this.drawAnnounce(c, view);
    if (this.potm) this.potmBanner(c, view);
    c.restore();
  }
  hpDisp(f) {
    let d = this.disp.get(f);
    if (!d) { d = { hp: f.hp, lag: f.hp, hold: 0, ult: f.ult }; this.disp.set(f, d); }
    for (let i = 1; i < Math.min(30, this.dt || 1); i++) this.hpStep(f, d);
    return this.hpStep(f, d);
  }
  hpStep(f, d) {
    if (f.hp < d.hp) { d.hp = Math.max(f.hp, d.hp - Math.max(0.6, (d.hp - f.hp) * 0.18)); d.hold = 30; }
    else if (f.hp > d.hp) d.hp = Math.min(f.hp, d.hp + Math.max(0.6, (f.hp - d.hp) * 0.12));
    if (d.hold > 0) d.hold--; else if (d.lag > d.hp) d.lag = Math.max(d.hp, d.lag - Math.max(0.8, (d.lag - d.hp) * 0.08));
    if (d.lag < d.hp) d.lag = d.hp;
    d.ult += (f.ult - d.ult) * 0.2;
    return d;
  }
  panel(c, S, side, x, y, w, mirror, view) {
    const sd = S.sides[side]; if (!sd) return;
    const f = sd.active && sd.active.state !== 'recalled' ? sd.active : sd.team.find((t) => t.alive) || sd.team[0];
    const h = 58, d = this.hpDisp(f);
    const accent = TYPE_COLORS[f.types[0]] || COL.orange;
    const sk = 10;                           // parallelogram slant
    // plate
    c.save();
    c.beginPath();
    if (!mirror) { c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w - sk, y + h); c.lineTo(x, y + h); }
    else { c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x + sk, y + h); }
    c.closePath();
    const gr = grad(c, 0, y, 0, y + h, [0, '#2e2658ee'], [1, '#141028ee']);
    c.fillStyle = gr; c.fill();
    c.lineWidth = 1; c.strokeStyle = '#ffffff22'; c.stroke();
    // type-colored accent edge
    c.fillStyle = accent;
    if (!mirror) c.fillRect(x, y, 4, h); else c.fillRect(x + w - 4, y, 4, h);
    c.restore();
    // portrait well with ultimate ring
    const pr = 23, pcx = mirror ? x + w - 6 - pr - 4 : x + 8 + pr, pcy = y + h / 2;
    c.save();
    c.beginPath(); c.arc(pcx, pcy, pr, 0, Math.PI * 2); c.fillStyle = '#0d0a1c'; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#3a3264'; c.stroke();
    const uf = Math.min(1, d.ult / 100);
    if (uf > 0) { c.beginPath(); c.arc(pcx, pcy, pr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * uf); c.strokeStyle = uf >= 1 ? (this.t >> 3) % 2 ? COL.gold : '#fff2b8' : '#c9a6ff'; c.lineWidth = 4; c.stroke(); }
    if (uf >= 1) { c.shadowColor = COL.gold; c.shadowBlur = 10; c.beginPath(); c.arc(pcx, pcy, pr + 2, 0, Math.PI * 2); c.strokeStyle = COL.gold + '88'; c.lineWidth = 1.5; c.stroke(); c.shadowBlur = 0; }
    c.beginPath(); c.arc(pcx, pcy, pr - 2.5, 0, Math.PI * 2); c.clip();
    this.livePortrait(c, f, pcx, pcy, pr);
    c.restore();
    const canMega = f.sp.mega && f.form !== 'mega' && !sd.megaUsed;
    if (canMega) this.tag(c, pcx, pcy + pr + 1, f.sp.mega.primal ? 'PRIMAL' : 'MEGA', uf >= 1 ? COL.gold : '#c9a6ff');
    // name + chips
    const tx = mirror ? x + 14 : x + 8 + pr * 2 + 10, tw = w - pr * 2 - 32;
    c.font = `italic 700 17px ${F_COND}`; c.fillStyle = COL.cream; c.textAlign = 'left';
    let name = f.sp.name + (f.form === 'mega' ? ' ★' : '');
    c.fillText(name, tx, y + 18);
    let cx = tx + c.measureText(name).width + 6;
    for (const t of f.types) cx = this.chip(c, cx, y + 7, t) + 3;
    // status badges
    let bx = mirror ? tx : x + w - sk - 4;
    const badges = [];
    for (const k of Object.keys(STATUS_BADGE)) if (f.status[k]) badges.push(STATUS_BADGE[k]);
    if (f.seeded) badges.push(['SEED', '#58b038']);
    if (f.status.healBlock) badges.push(['NOHEAL', '#c04a4a']);
    if (f.alive && f.silenced()) badges.push(['SILENT', '#6a58a0']);
    c.font = `700 9px ${F_COND}`;
    let by = y + 7;
    if (!mirror) { bx = x + w - sk - 4; for (const [lbl, col] of badges) { const bw = c.measureText(lbl).width + 8; bx -= bw + 2; this.badge(c, bx, by, bw, lbl, col); } }
    else { bx = x + w - pr * 2 - 22; for (const [lbl, col] of badges) { const bw = c.measureText(lbl).width + 8; bx -= bw + 2; this.badge(c, bx, by, bw, lbl, col); } }
    // HP bar
    const hbX = tx, hbY = y + 25, hbW = tw - 8, hbH = 11;
    this.hpBar(c, hbX, hbY, hbW, hbH, f, d);
    // numbers + team balls
    c.font = `700 12px ${F_COND}`; c.fillStyle = COL.cream; c.textAlign = 'right';
    c.fillText(`${Math.ceil(d.hp)} / ${f.maxHp}`, hbX + hbW, hbY + hbH + 13);
    c.textAlign = 'left';
    if (S.format === 'trainer') this.balls(c, sd, hbX, hbY + hbH + 4);
    else { c.fillStyle = COL.dim; c.font = `600 11px ${F_COND}`; c.fillText(f.sp.role, hbX, hbY + hbH + 13); }
    // opponent's slim stamina bar under its panel
    if (side !== view.me) {
      const sx = x + sk + 6, sy = y + h + 3, sw = w - sk - 12;
      c.fillStyle = '#0d0a1caa'; c.fillRect(sx, sy, sw, 4);
      c.fillStyle = COL.stam; c.fillRect(sx, sy, sw * f.stamina / 100, 4);
    }
  }
  livePortrait(c, f, cx, cy, r) {
    const g = this.g, atlas = g.atlas.get(f.spriteId), fr = f.animFrame && f.animFrame();
    if (!atlas || !fr) return;
    const s = fr[3] > 48 || fr[2] > 56 ? 1 : 2;
    c.imageSmoothingEnabled = false;
    const hx = fr[6], hy = fr[7];
    const dx = cx - (fr[4] + hx) * s, dy = cy - (fr[5] + hy) * s + 4;
    c.drawImage(atlas, fr[0], fr[1], fr[2], fr[3], Math.round(dx), Math.round(dy), fr[2] * s, fr[3] * s);
  }
  chip(c, x, y, type) {
    c.font = `700 9px ${F_COND}`;
    const w = c.measureText(type.toUpperCase()).width + 8;
    c.fillStyle = TYPE_COLORS[type] || '#888'; roundRect(c, x, y, w, 12, 3); c.fill();
    c.fillStyle = '#10101a'; c.textAlign = 'left'; c.fillText(type.toUpperCase(), x + 4, y + 9.5);
    return x + w;
  }
  badge(c, x, y, w, lbl, col) { c.fillStyle = col; roundRect(c, x, y, w, 12, 3); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(lbl, x + 4, y + 9.5); }
  tag(c, x, y, lbl, col) { c.font = `italic 800 10px ${F_COND}`; const w = c.measureText(lbl).width + 10; c.fillStyle = col; roundRect(c, x - w / 2, y - 6, w, 12, 6); c.fill(); c.fillStyle = '#1a1030'; c.textAlign = 'center'; c.fillText(lbl, x, y + 3.5); c.textAlign = 'left'; }
  hpBar(c, x, y, w, h, f, d) {
    const frac = Math.max(0, d.hp / f.maxHp), lag = Math.max(0, d.lag / f.maxHp);
    const col = frac > 0.5 ? COL.green : frac > 0.2 ? COL.yellow : COL.hpRed;
    c.save();
    roundRect(c, x - 2, y - 2, w + 4, h + 4, (h + 4) / 2); c.fillStyle = '#05040c'; c.fill();
    roundRect(c, x, y, w, h, h / 2); c.save(); c.clip();
    c.fillStyle = '#2a2440'; c.fillRect(x, y, w, h);
    c.fillStyle = '#ffe9e9'; c.fillRect(x, y, w * lag, h);          // lagging pale chunk = recent damage
    const gr = grad(c, 0, y, 0, y + h, [0, lighten(col)], [0.55, col], [1, darken(col)]);
    c.fillStyle = gr; c.fillRect(x, y, w * frac, h);
    if (frac <= 0.2 && frac > 0) { const pulse = 0.35 + 0.35 * Math.sin(this.t / 5); c.fillStyle = `rgba(255,80,80,${pulse})`; c.fillRect(x, y, w * frac, h); }
    c.fillStyle = '#ffffff40'; c.fillRect(x, y + 1, w * frac, 2);
    // tick marks every 10%
    c.fillStyle = '#05040c99';
    for (let i = 1; i < 10; i++) c.fillRect(Math.round(x + w * i / 10), y, i === 5 ? 2 : 1, h);
    c.restore();
    if (frac <= 0.2 && frac > 0) { c.shadowColor = COL.hpRed; c.shadowBlur = 8 + 6 * Math.sin(this.t / 5); roundRect(c, x - 2, y - 2, w + 4, h + 4, (h + 4) / 2); c.strokeStyle = '#ff6a6a88'; c.lineWidth = 1; c.stroke(); c.shadowBlur = 0; }
    c.restore();
  }
  balls(c, sd, x, y) {
    for (let i = 0; i < sd.team.length; i++) {
      const f = sd.team[i], cx = x + 6 + i * 15, cy = y + 6, active = f === sd.active, dead = !f.alive;
      c.save();
      c.beginPath(); c.arc(cx, cy, 5.5, 0, Math.PI * 2);
      c.fillStyle = dead ? '#3a3a46' : '#f4f4f4'; c.fill();
      c.beginPath(); c.arc(cx, cy, 5.5, Math.PI, 0); c.fillStyle = dead ? '#55555f' : COL.red; c.fill();
      c.fillStyle = '#111'; c.fillRect(cx - 5.5, cy - 0.8, 11, 1.6);
      c.beginPath(); c.arc(cx, cy, 1.8, 0, Math.PI * 2); c.fillStyle = dead ? '#3a3a46' : '#fff'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#111'; c.stroke();
      if (dead) { c.strokeStyle = '#111'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - 3, cy - 4); c.lineTo(cx, cy - 1); c.lineTo(cx - 1, cy + 2); c.lineTo(cx + 2, cy + 5); c.stroke(); }
      if (active) { c.beginPath(); c.arc(cx, cy, 7.5, 0, Math.PI * 2); c.strokeStyle = COL.gold; c.lineWidth = 1.5; c.stroke(); }
      c.restore();
    }
  }
  timer(c, S, cx, y) {
    const secs = Math.ceil(S.timeLeft / 60);
    const mm = Math.floor(secs / 60), ss = secs % 60;
    const txt = S.format === 'trainer' ? `${mm}:${String(ss).padStart(2, '0')}` : String(secs);
    const ot = S.overtime || S.sudden;
    const w = ot ? 128 : 66, h = 34;
    c.save();
    c.beginPath(); c.moveTo(cx - w / 2 - 8, y); c.lineTo(cx + w / 2 + 8, y); c.lineTo(cx + w / 2, y + h); c.lineTo(cx - w / 2, y + h); c.closePath();
    const gr = ot ? grad(c, 0, y, 0, y + h, [0, S.sudden ? '#b0202c' : '#ff9a3c'], [1, S.sudden ? '#5a0a14' : '#b8461a']) : grad(c, 0, y, 0, y + h, [0, '#3a2f6e'], [1, '#17122e']);
    c.fillStyle = gr; c.fill(); c.lineWidth = 1.5; c.strokeStyle = ot ? '#ffe0a0' : '#8a7ad8'; c.stroke();
    c.textAlign = 'center'; c.fillStyle = COL.cream;
    c.font = `italic 800 ${ot ? 15 : 24}px ${F_COND}`;
    if (ot) { c.fillText(txt, cx, y + 15); c.font = `italic 800 10px ${F_COND}`; c.fillStyle = (this.t >> 4) % 2 ? '#fff' : COL.gold; c.fillText(S.sudden ? 'SUDDEN DEATH' : 'DOUBLE STAMINA', cx, y + 28); }
    else c.fillText(txt, cx, y + 25);
    c.restore();
  }
  // the central stamina gauge, between the stick and the buttons
  stamina(c, S, side, view) {
    const f = S.activeOf(side); if (!f || !f.onField) return;
    const w = Math.min(320, view.w * 0.34), h = 14, x = view.w / 2 - w / 2, y = view.h - view.insets.b - (view.controls ? 26 : 18);
    c.save();
    c.beginPath(); c.moveTo(x - 10, y - 6); c.lineTo(x + w + 10, y - 6); c.lineTo(x + w + 2, y + h + 6); c.lineTo(x - 2, y + h + 6); c.closePath();
    c.fillStyle = '#0d0a1ccc'; c.fill(); c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.stroke();
    roundRect(c, x, y, w, h, 4); c.fillStyle = '#211b3c'; c.fill();
    const k = f.stamina / 100;
    const gr = grad(c, x, 0, x + w, 0, [0, S.overtime ? '#ffb347' : '#3aa8ff'], [1, S.overtime ? '#ffe36e' : '#8ef0ff']);
    c.save(); roundRect(c, x, y, w, h, 4); c.clip();
    c.fillStyle = gr; c.fillRect(x, y, w * k, h);
    c.fillStyle = '#ffffff35'; c.fillRect(x, y + 1, w * k, 3);
    for (let i = 1; i < 10; i++) { c.fillStyle = '#0d0a1c66'; c.fillRect(Math.round(x + w * i / 10), y, 1, h); }
    c.restore();
    // move cost notches: one marker per move at its cost, dimmed when unaffordable
    const kit = f.kit();
    const btn = ['✕', '□', '△', '○'], bc = ['#6ea8ff', '#ff7ad9', '#3ddc97', '#ff5a6a'];
    for (let i = 0; i < 4; i++) {
      const m = CONTENT.moves[kit[i]]; if (!m) continue;
      const nx = x + w * m.cost / 100, ok = f.stamina >= m.cost && f.cds[i] <= 0;
      c.fillStyle = ok ? bc[i] : '#55506a';
      c.beginPath(); c.moveTo(nx, y - 1); c.lineTo(nx - 4, y - 7 - i * 0); c.lineTo(nx + 4, y - 7); c.closePath(); c.fill();
    }
    c.font = `italic 700 11px ${F_COND}`; c.fillStyle = COL.cream; c.textAlign = 'left';
    c.fillText('STAMINA', x, y + h + 13 > view.h - 2 ? y - 9 : y - 9);
    c.textAlign = 'right'; c.fillText(String(Math.floor(f.stamina)), x + w, y - 9);
    c.restore();
  }
  offscreen(c, S, view) {
    const W = view.world; if (!W) return;
    const o = S.activeOf(1 - view.me); if (!o || !o.onField) return;
    if (o.hidden() && !o.flags.revealed && S.activeOf(view.me) && S.activeOf(view.me).sp.passive !== 'aura') return;   // stealth: no arrow
    if (W.onScreen(o.x, o.y - 10, -6)) return;
    const p = W.toScreen(o.x, o.y - 10), k = view.scale / view.dpr;
    const sx = p.x * k, sy = p.y * k;
    const cx = view.w / 2, cy = view.h / 2, a = Math.atan2(sy - cy, sx - cx);
    const ex = Math.max(30, Math.min(view.w - 30, sx)), ey = Math.max(80, Math.min(view.h - 60, sy));
    c.save(); c.translate(ex, ey); c.rotate(a);
    c.beginPath(); c.moveTo(12, 0); c.lineTo(-6, -8); c.lineTo(-2, 0); c.lineTo(-6, 8); c.closePath();
    c.fillStyle = COL.red; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
  moveBanners(c, S, view, L, R, T, pw) {
    for (let s = 0; s < 2; s++) {
      const mc = this.moveCalls[s]; if (!mc) continue;
      mc.t += this.dt;
      if (mc.t > 70) { this.moveCalls[s] = null; continue; }
      const mine = s === view.me;
      const slide = Math.min(1, mc.t / 6), out = mc.t > 60 ? (mc.t - 60) / 10 : 0;
      c.save(); c.globalAlpha = 1 - out;
      c.font = `italic 800 ${mc.ult ? 19 : 16}px ${F_COND}`;
      const tw = c.measureText(mc.name).width + 30, h = mc.ult ? 26 : 22;
      const y = T + 96;
      const x = mine ? L - 20 + 20 * slide : R - tw + 20 - 20 * slide;
      const col = TYPE_COLORS[mc.type] || COL.orange;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + tw, y); c.lineTo(x + tw - 10, y + h); c.lineTo(x - 10, y + h); c.closePath();
      c.fillStyle = mc.ult ? COL.gold : '#0d0a1ce6'; c.fill();
      c.fillStyle = col; c.fillRect(mine ? x - 4 : x + tw - 8, y, 4, h);
      c.fillStyle = mc.ult ? '#1a1030' : COL.cream; c.textAlign = 'left'; c.fillText(mc.name, x + 10, y + h - 6);
      c.restore();
    }
  }
  drawCallouts(c, view) {
    let y = view.insets.t + 108;   // below the timer and the START / SELECT buttons, centred between the move banners
    for (const co of this.callouts) {
      co.t += this.dt;
      const a = co.t > 80 ? Math.max(0, 1 - (co.t - 80) / 15) : 1;
      c.save(); c.globalAlpha = a;
      c.font = `italic 700 14px ${F_COND}`; c.textAlign = 'center';
      const tw = c.measureText(co.text).width + 24;
      c.fillStyle = '#0d0a1caa'; c.beginPath(); c.moveTo(view.w / 2 - tw / 2 + 5, y - 15); c.lineTo(view.w / 2 + tw / 2 + 5, y - 15); c.lineTo(view.w / 2 + tw / 2 - 5, y + 5); c.lineTo(view.w / 2 - tw / 2 - 5, y + 5); c.closePath(); c.fill();
      c.fillStyle = co.color; c.fillText(co.text, view.w / 2, y);
      c.restore();
      y += 22;
    }
    this.callouts = this.callouts.filter((co) => co.t < 95);
  }
  drawAnnounce(c, view) {
    for (const a of this.announce) {
      a.t += this.dt;
      const k = Math.min(1, a.t / 8), out = a.t > a.ticks - 12 ? (a.t - (a.ticks - 12)) / 12 : 0;
      c.save(); c.globalAlpha = 1 - out;
      const y = a.style === 'faint' ? view.h * 0.62 : view.h * 0.46;
      const bh = a.sub ? 58 : 44;
      // broadcast banner: full-width slanted strip sliding in from the right
      const off = (1 - k) * view.w;
      c.beginPath(); c.moveTo(off - 20, y - bh / 2); c.lineTo(view.w + off + 20, y - bh / 2); c.lineTo(view.w + off, y + bh / 2); c.lineTo(off - 40, y + bh / 2); c.closePath();
      const gr = grad(c, 0, y - bh / 2, 0, y + bh / 2, [0, a.style === 'faint' ? '#2b2252ee' : '#ff8a3dee'], [1, a.style === 'faint' ? '#16122eee' : '#c0471aee']);
      c.fillStyle = gr; c.fill();
      c.fillStyle = COL.gold; c.fillRect(off, y - bh / 2, view.w, 2); c.fillRect(off, y + bh / 2 - 2, view.w, 2);
      c.textAlign = 'center'; c.fillStyle = COL.cream;
      c.font = `italic 800 ${a.style === 'faint' ? 24 : 28}px ${F_COND}`;
      c.fillText(a.text, view.w / 2 + off, y + (a.sub ? 2 : 10));
      if (a.sub) { c.font = `600 13px ${F_COND}`; c.fillStyle = '#ffe9cf'; c.fillText(a.sub, view.w / 2 + off, y + 21); }
      c.restore();
    }
    this.announce = this.announce.filter((a) => a.t < a.ticks);
  }
  potmBanner(c, view) {
    c.save();
    c.font = `italic 800 22px ${F_COND}`; c.textAlign = 'left';
    const txt = 'PLAY OF THE MATCH', tw = c.measureText(txt).width + 40, x = view.insets.l + 14, y = view.h - view.insets.b - 52;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + tw, y); c.lineTo(x + tw - 12, y + 34); c.lineTo(x - 12, y + 34); c.closePath();
    c.fillStyle = COL.gold; c.fill(); c.fillStyle = '#1a1030'; c.fillText(txt, x + 14, y + 25);
    if ((this.t >> 4) % 2) { c.fillStyle = COL.red; c.beginPath(); c.arc(x + tw + 10, y + 17, 5, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
}
function statusLine(f, k) {
  const n = f.sp.name;
  return { burn: `${n} was burned!`, poison: `${n} was poisoned!`, para: `${n} is paralyzed!`, sleep: `${n} fell asleep!`, freeze: `${n} was frozen solid!`, confuse: `${n} became confused!`, slow: `${n} was slowed!` }[k] || `${n} is affected!`;
}
export function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}
function lighten(h) { return mix(h, '#ffffff', 0.35); }
function darken(h) { return mix(h, '#000000', 0.3); }
function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export { COL, F_COND };
