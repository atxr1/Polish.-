// Effect system: consumes simulation events and keeps visual particles, streams, telegraphs, decals, damage
// numbers, afterimages, emotes and screen shake. Advances only on simulated ticks (freezes during hit-stop).
import { CONTENT } from '../game/content.js';

const TYPE_HIT = {
  Fire: 'Flamethrower', Water: 'Hydro_Cannon', Electric: 'Spark', Grass: 'Leaf_Storm_Hit', Ice: 'Ice_Shard_Hit', Fighting: 'Focus_Blast_Hit',
  Poison: 'Bubbles_Purple', Ground: 'Rock_Pieces', Flying: 'Gust_Wind', Psychic: 'Psycho_Shift_Hit', Bug: 'X_Scissor', Rock: 'Rock_Pieces',
  Ghost: 'Shadow_Force_Hit', Dragon: 'Circle_Purple_Out', Dark: 'Night_Slash_Hit', Steel: 'Metal_Burst_Hit', Fairy: 'Captivate_Sparkle', Normal: 'Hit_Neutral',
};

// charge flashes play once at full speed as in PMD (never held on screen), and glow sheets blend additively
const FLASH_ONCE = new Set(['Sky_Attack_Charge', 'Light_Ball_White', 'Light_Ball_Yellow']);
const GLOW = new Set(['Sky_Attack_Charge', 'Light_Ball_White', 'Light_Ball_Yellow', 'Draco_Meteor_Explosion', 'Healing_Wish_Hit', 'Charge_Up', 'Psycho_Shift_Charge']);
const BOTTOM_ANCHOR = { Stone_Edge: 14, Frenzy_Plant: 10, Fire_Column_Ranger: 6, Water_Column_Ranger: 6, Sky_Uppercut: 16 };

export class FX {
  constructor(gfx, opts = {}) {
    this.g = gfx; this.parts = []; this.streams = []; this.teles = []; this.decals = []; this.nums = []; this.ghosts = []; this.emotes = [];
    this.shakeAmt = 0; this.flash = 0; this.speedLines = 0; this.cheer = 0; this.impact = null; this.maxParts = opts.maxParts || 220;
    this.balls = []; this.beamsRecall = []; this.mega = null; this.texts = []; this.tick = 0;
  }
  clear() { this.parts.length = 0; this.streams.length = 0; this.teles.length = 0; this.nums.length = 0; this.ghosts.length = 0; this.emotes.length = 0; this.balls.length = 0; this.beamsRecall.length = 0; this.mega = null; }
  def(name) { return this.g.sheetDef(name); }
  // spawn a one-shot particle animation
  spawn(name, x, y, o = {}) {
    if (!name) return null;
    if (this.g.isBeam(name)) return null;
    const d = this.def(name); if (!d) return null;
    if (this.parts.length >= this.maxParts) this.parts.shift();
    const base = name.split('|')[0], flash = FLASH_ONCE.has(base);
    const ft = flash ? 1 : Math.max(1, o.frameTime || o.ft || 2);
    const ticks = flash ? 0 : o.ticks;
    const p = { name, x, y, z: o.z || 0, ang: o.ang ?? Math.PI / 2, t: 0, ft, n: d.n, life: ticks ? Math.max(ticks, d.n * ft) : d.n * ft, loop: !!ticks, glow: GLOW.has(base), follow: o.follow || null, ox: o.ox || 0, oy: o.oy || 0, layer: o.layer || 'front', scale: o.scale || 1, vx: o.vx || 0, vy: o.vy || 0 };
    // tall eruption sheets grow upward from the bottom edge of the frame: stand them on the ground point
    const ba = BOTTOM_ANCHOR[name.split('|')[0]]; if (ba !== undefined) p.z += d.fh / 2 - ba;
    this.parts.push(p);
    return p;
  }
  anchor(f, at, ev) {
    if (!f) return { x: ev.x, y: ev.y, z: ev.z || 0 };
    if (at === 'head') { const h = f.headPoint(); return { x: h.x, y: f.y, z: f.y - h.y }; }
    if (at === 'center') { const c = f.centerPoint(); return { x: c.x, y: f.y, z: f.y - c.y }; }
    if (at === 'front') { const d = ev.dist ?? 18, a = ev.dirAng ?? f.aim, c = f.centerPoint(); return { x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d * 0.8, z: f.y - c.y }; }
    return { x: f.x, y: f.y, z: 0 };
  }
  // ------------------------------------------------------------------ event intake
  consume(S, events, ctx) {
    for (const ev of events) {
      switch (ev.e) {
        case 'fx': {
          const a = this.anchor(ev.f, ev.at, ev);
          const p = this.spawn(ev.name, a.x + (ev.offset ? ev.offset.x : 0), a.y + (ev.offset ? ev.offset.y : 0), { z: a.z + (ev.z || 0), ang: ev.dirAng, frameTime: ev.frameTime, ticks: ev.ticks, follow: ev.follow ? ev.f : null, layer: ev.layer });
          if (p && ev.follow && ev.f) { p.ox = a.x - ev.f.x; p.oy = a.y - ev.f.y; p.at = ev.at; }
          break;
        }
        case 'stream': {
          const d = this.def(ev.name); if (!d) break;
          const sp = ev.speed || 6, life = Math.max(4, Math.round(ev.len / sp));
          const jitter = (Math.sin(this.tick * 12.9898 + ev.ang * 78.233) * 43758.5453) % 1 * 0.18;
          this.streams.push({ name: ev.name, x: ev.x0, y: ev.y0, z: ev.z, vx: Math.cos(ev.ang + jitter) * sp, vy: Math.sin(ev.ang + jitter) * sp, t: 0, life, ft: ev.ft || 2, n: d.n, ang: ev.ang });
          if (this.streams.length > 160) this.streams.shift();
          break;
        }
        case 'hit': {
          if (ev.statusOnly) break;
          const name = ev.fx || TYPE_HIT[ev.type] || 'Hit_Neutral';
          this.spawn(name, ev.x, ev.tgt.y, { z: ev.tgt.y - ev.y, layer: 'front' });
          if (ev.eff > 1 && !ev.multi) this.spawn('Hit_Super_Effective', ev.x, ev.tgt.y + 1, { z: ev.tgt.y - ev.y, layer: 'front' });
          if (ev.dmg > 0) this.number(ev.tgt, ev.dmg, ev.eff > 1 ? 'yellow' : ev.eff < 1 ? 'green' : 'yellow', ev.multi);
          if (ev.heavy && !ev.multi) { this.shake(ev.ult ? 7 : 4); if (ev.eff > 1 || ev.ult) this.speedLines = 7; this.cheer = Math.max(this.cheer, 50); }
          else if (!ev.multi) this.shake(1.5);
          if (S.env === 'water' && !ev.multi) this.spawn('Water_Spout_Splash', ev.tgt.x, ev.tgt.y, { layer: 'front' });
          break;
        }
        case 'heal': this.number(ev.f, ev.amt, 'blue'); this.spawn('Circle_Tiny_Yellow', ev.f.x, ev.f.y, { z: 12, follow: ev.f }); break;
        case 'dot': if (ev.kind !== 'sand' || this.tick % 2 === 0) this.number(ev.f, ev.dmg, 'green', true); break;
        case 'recoil': this.number(ev.f, ev.dmg, 'yellow', true); break;
        case 'tele': {
          if (ev.name === 'wave' || ev.name === 'gust') { this.teles.push({ kind: ev.name, t: 0, ticks: ev.ticks, dir: ev.dir, ang: ev.ang }); break; }
          this.teles.push({ x: ev.x, y: ev.y, r: ev.r, t: 0, ticks: ev.ticks, kind: ev.name, fall: ev.fall, zone: ev.zone, ref: ev });
          break;
        }
        case 'decal': this.decals.push({ kind: ev.kind, x: ev.x, y: ev.y, r: Math.min(60, ev.r), t: 0, life: 600, seed: (ev.x * 13 + ev.y * 7) | 0 }); if (this.decals.length > 24) this.decals.shift(); break;
        case 'shake': this.shake(ev.amt); break;
        case 'ghost': if (ev.f.animFrame()) this.ghosts.push({ f: ev.f, x: ev.f.x, y: ev.f.y, z: ev.f.z, frame: ev.f.animFrame(), sprite: ev.f.spriteId, t: 0 }); if (this.ghosts.length > 24) this.ghosts.shift(); break;
        case 'blink': this.spawn(ev.fx || 'Puff_White', ev.x0, ev.y0, { z: 10 }); this.spawn(ev.fx || 'Puff_White', ev.x1, ev.y1, { z: 10 }); break;
        case 'flash': this.flash = Math.max(this.flash, ev.n || 4); break;
        case 'breakout': this.text('Breakout!', ev.f.x, ev.f.y - 34, '#9fe8ff'); this.spawn('Circle_White_Out', ev.f.x, ev.f.y, { z: 12 }); break;
        case 'clash': this.spawn('Charge_Beam_Hit', ev.x, ev.y, { z: ev.z || 10 }); this.spawn('Captivate_Sparkle', ev.x, ev.y, { z: ev.z || 10 }); this.flash = 3; this.shake(3); this.text('CLASH!', ev.x, ev.y - 20, '#ffffff'); break;
        case 'perfect': this.spawn('Screen_Sparkle_RSE', ev.f.x, ev.f.y, { z: 14, follow: ev.f }); ctx && ctx.callout && ctx.callout('Perfect dodge!', '#ffe36e'); break;
        case 'perfectHit': this.spawn('Captivate_Sparkle', ev.f.x, ev.f.y, { z: 14 }); break;
        case 'wallSlam': this.spawn('Rock_Smash', ev.x, ev.y, { z: 6 }); this.spawn('Puff_Brown', ev.x, ev.y, { z: 2 }); this.shake(5); this.speedLines = 5; this.cheer = Math.max(this.cheer, 70); if (ev.dmg) this.number(ev.f, ev.dmg, 'yellow'); ctx && ctx.callout && ctx.callout('Wall slam!', '#ffb347'); break;
        case 'dodge': if (S.env === 'ground') this.spawn('Puff_White', ev.f.x, ev.f.y, { layer: 'back' }); else if (S.env === 'water') this.spawn('Bubbles_Blue', ev.f.x, ev.f.y, { layer: 'back' }); break;
        case 'splashStep': this.spawn('Water_Spout_Splash', ev.f.x, ev.f.y + 2, { layer: 'back', frameTime: 1 }); break;
        case 'land': this.spawn(S.env === 'water' ? 'Water_Spout_Splash' : 'Puff_Brown', ev.f.x, ev.f.y, { layer: 'back' }); if (ev.crowd) this.cheer = 160; break;
        case 'landHard': case 'faintLand': this.spawn(S.env === 'water' ? 'Water_Spout_Splash' : 'Puff_Brown', ev.f.x, ev.f.y, { layer: 'front' }); this.shake(2); break;
        case 'status': this.statusPop(ev.f, ev.kind); break;
        case 'buff': if (ev.stats) { const k = Object.keys(ev.stats)[0]; this.spawn({ atk: 'Stat_Red_Ring', spa: 'Stat_Pink_Ring', def: 'Stat_Blue_Ring', spd: 'Stat_Green_Ring', spe: 'Stat_Yellow_Ring' }[k] || 'Stat_Red_Ring', ev.f.x, ev.f.y, { follow: ev.f, layer: 'back' }); } break;
        case 'reflect': this.spawn('Screen_Sparkle_RSE', ev.x, ev.y, { z: 10 }); this.text('Reflect!', ev.f.x, ev.f.y - 34, '#bfe8ff'); break;
        case 'absorb': this.spawn('Bubble_Pop_Blue', ev.x, ev.y, { z: 10 }); break;
        case 'counter': this.spawn('Focus_Blast_Hit', ev.f.x, ev.f.y, { z: 14 }); ctx && ctx.callout && ctx.callout('Counter!', '#ff7b54'); break;
        case 'block': this.spawn('Metal_Burst_Hit', ev.f.x + Math.cos(ev.f.aim) * 10, ev.f.y + Math.sin(ev.f.aim) * 6, { z: 12 }); this.text('Blocked', ev.f.x, ev.f.y - 34, '#d8d8e8'); break;
        case 'evade': break;
        case 'protected': this.spawn('Protect', ev.f.x, ev.f.y, { z: 12, follow: ev.f }); break;
        case 'immune': this.text('No effect', ev.f.x, ev.f.y - 34, '#c8c8d8'); ctx && ctx.callout && ctx.callout('It doesn\'t affect ' + ev.f.sp.name + '…', '#c8c8d8'); break;
        case 'crit': ctx && ctx.callout && ctx.callout('A critical hit!', '#ffdd57'); break;
        case 'emote': this.emotes = this.emotes.filter((e) => e.f !== ev.f); this.emotes.push({ f: ev.f, n: ev.n, t: 0 }); break;
        case 'coin': this.spawn('Swift_RSE', ev.x, ev.y, { z: 4 }); break;
        case 'trapPop': this.spawn('Bubbles_Purple', ev.t.x, ev.t.y, { z: 2 }); break;
        case 'decoyPop': this.spawn('Puff_White', ev.d.x, ev.d.y, { z: 8 }); this.text('Substitute!', ev.d.x, ev.d.y - 24, '#ffffff'); break;
        case 'clonePop': this.spawn('Puff_White', ev.c.x, ev.c.y, { z: 8 }); break;
        case 'clones': this.spawn('Puff_White', ev.f.x, ev.f.y, { z: 8 }); break;
        case 'decoy': this.spawn('Puff_White', ev.d.x, ev.d.y, { z: 8 }); break;
        case 'fizzle': if (ev.fx) this.spawn(ev.fx, ev.x, ev.y, { z: ev.z || 0 }); else this.spawn('Puff_White', ev.x, ev.y, { z: ev.z || 0 }); break;
        case 'bounce': this.spawn('Captivate_Sparkle', ev.x, ev.y, { z: 8 }); break;
        case 'wallHit': this.spawn('Ice_Shard_Hit', ev.x, ev.y, { z: 8 }); break;
        case 'pin': this.cheer = Math.max(this.cheer, 40); break;
        case 'grab': this.spawn('Puff_White', ev.o.x, ev.o.y, { z: 6 }); break;
        case 'whiff': this.text('Missed!', ev.f.x, ev.f.y - 30, '#d8d8e8'); break;
        case 'crash': this.text('Crash!', ev.f.x, ev.f.y - 30, '#ff8a8a'); this.spawn('Puff_Brown', ev.f.x, ev.f.y); break;
        case 'bell': this.ringFx = { x: ev.x, y: ev.y, t: 0 }; this.shake(6); this.cheer = 60; break;
        case 'rift': this.spawn('Psycho_Cut_Hole', ev.x0, ev.y0, { z: 8 }); this.spawn('Psycho_Cut_Hole', ev.x1, ev.y1, { z: 8 }); break;
        case 'stagger': this.text('Staggered!', ev.f.x, ev.f.y - 34, '#ffe0a0'); break;
        case 'burrow': this.spawn('Dig', ev.f.x, ev.f.y, { layer: 'front' }); break;
        case 'revive': this.spawn('Healing_Wish_Hit', ev.by.x, ev.by.y, { z: 10 }); ctx && ctx.callout && ctx.callout(ev.f.sp.name + ' was revived!', '#ffe36e'); break;
        case 'seeded': this.spawn('Leech_Seed_Sprout', ev.f.x, ev.f.y, { z: 8, follow: ev.f }); break;
        case 'updraft': this.spawn('Gust', ev.f.x, ev.f.y, { z: 4, layer: 'back' }); break;
        case 'paraJolt': this.spawn('Spark', ev.f.x, ev.f.y, { z: 12, follow: ev.f }); break;
        case 'selfHit': this.text('Hurt itself in confusion!', ev.f.x, ev.f.y - 34, '#ffd0ff'); this.number(ev.f, ev.dmg, 'yellow'); break;
        case 'intimidate': this.spawn('Scary_Face', ev.o.x, ev.o.y, { z: 14 }); break;
        case 'cloneAttack': break;
        case 'faint': this.cheer = 140; this.shake(5); this.speedLines = 6; break;
        case 'victory': this.cheer = 220; break;
        case 'ingrain': break;
        case 'rope': this.cheer = Math.max(this.cheer, 30); break;
        case 'sendOut': {
          const B = S.bounds, from = ev.side === 0 ? { x: B.x0 - 24, y: (B.y0 + B.y1) / 2 + 30 } : { x: B.x1 + 24, y: (B.y0 + B.y1) / 2 - 30 };
          this.balls.push({ kind: 'throw', x: from.x, y: from.y, z: 10, x0: from.x, y0: from.y, x1: ev.f.x, y1: ev.f.y, t: 0, ticks: 14 + ev.delay, delay: ev.delay, open: false, f: ev.f });
          break;
        }
        case 'recallStart': {
          // red beam locks on while the Pokémon is still on the field (it can be hit during this)
          this.balls.push({ kind: 'beam', x: ev.f.x, y: ev.f.y, z: 0, t: 0, ticks: 18, f: ev.f, beamH: 0 });
          break;
        }
        case 'recall': {
          const fr = ev.f.animFrame();
          this.balls.push({ kind: 'recall', x: ev.f.x, y: ev.f.y, z: 0, t: 0, ticks: 20, f: ev.f, frame: fr, sprite: ev.f.spriteId, tx: ev.f.x, ty: ev.f.y, beam: true, beamH: 30 });
          break;
        }
        case 'mega': this.mega = { f: ev.f, t: 0, name: ev.name }; this.cheer = 200; break;
        case 'forme': this.spawn('Circle_Red_Out', ev.f.x, ev.f.y, { z: 12, follow: ev.f }); this.spawn('Light_Ball_White', ev.f.x, ev.f.y, { z: 12 }); break;
        case 'refract': this.spawn('Screen_Sparkle_RSE', ev.f.x, ev.f.y, { z: 12 }); break;
        case 'revealed': this.spawn('Sparkle_RSE', ev.f.x, ev.f.y, { z: 14 }); break;
      }
    }
  }
  number(f, v, font, small) {
    this.nums.push({ x: f.x + ((this.nums.length % 3) - 1) * 5, y: f.y, z: (f.y - f.headPoint().y) + 10, v: String(Math.round(v)), font, t: 0, small });
    if (this.nums.length > 24) this.nums.shift();
  }
  text(str, x, y, col) { this.texts.push({ str, x, y, col, t: 0 }); if (this.texts.length > 8) this.texts.shift(); }
  statusPop(f, kind) {
    const m = { burn: 'Burned', poison: 'Bubbles_Purple', para: 'Spark', sleep: 'Sleep_Z', freeze: 'Ice_Pieces', confuse: 'Lucky_Chant_Star_Yellow', slow: 'Bubbles_Blue' }[kind];
    if (m) this.spawn(m, f.x, f.y, { z: 14, follow: f });
  }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  // ------------------------------------------------------------------ advance one simulated tick
  update(S) {
    this.tick++;
    for (const p of this.parts) {
      p.t++;
      if (p.follow) { if (p.at === 'center' || p.at === 'head') { const a = this.anchor(p.follow, p.at, {}); p.x = a.x; p.y = a.y; p.z = a.z; } else { p.x = p.follow.x + p.ox; p.y = p.follow.y + p.oy; } }
      p.x += p.vx; p.y += p.vy;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const s of this.streams) { s.t++; s.x += s.vx; s.y += s.vy; }
    this.streams = this.streams.filter((s) => s.t < s.life);
    for (const t of this.teles) { t.t++; if (t.zone && t.zone.trackTarget) { t.x = t.zone.x; t.y = t.zone.y; } }
    this.teles = this.teles.filter((t) => t.t <= t.ticks + 2);
    for (const d of this.decals) d.t++;
    this.decals = this.decals.filter((d) => d.t < d.life);
    for (const n of this.nums) n.t++;
    this.nums = this.nums.filter((n) => n.t < 46);
    for (const g of this.ghosts) g.t++;
    this.ghosts = this.ghosts.filter((g) => g.t < 10);
    for (const e of this.emotes) e.t++;
    this.emotes = this.emotes.filter((e) => e.t < 110);
    for (const t of this.texts) t.t++;
    this.texts = this.texts.filter((t) => t.t < 50);
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - 0.35);
    if (this.flash > 0) this.flash--;
    if (this.speedLines > 0) this.speedLines--;
    if (this.cheer > 0) this.cheer--;
    if (this.ringFx) { this.ringFx.t++; if (this.ringFx.t > 40) this.ringFx = null; }
    for (const bl of this.balls) {
      bl.t++;
      if (bl.kind === 'throw') {
        const k = Math.min(1, Math.max(0, (bl.t - bl.delay) / 14));
        bl.x = bl.x0 + (bl.x1 - bl.x0) * k; bl.y = bl.y0 + (bl.y1 - bl.y0) * k; bl.z = 10 + Math.sin(k * Math.PI) * 26;
        if (k >= 1 && !bl.open) { bl.open = true; this.spawn('Light_Ball_White', bl.x1, bl.y1, { z: 10, frameTime: 1 }); this.spawn('Circle_White_Out', bl.x1, bl.y1, { z: 10 }); }
      } else if (bl.kind === 'recall') { bl.beamH = 30 + bl.t * 2; }
    }
    this.balls = this.balls.filter((bl) => bl.t < bl.ticks + 8);
    if (this.mega) { this.mega.t++; if (this.mega.t === 36) { this.spawn('Light_Ball_White', this.mega.f.x, this.mega.f.y, { z: 14, frameTime: 1 }); this.spawn('Circle_White_Out', this.mega.f.x, this.mega.f.y, { z: 14 }); } if (this.mega.t > 64) this.mega = null; }
  }
}
export { TYPE_HIT };
