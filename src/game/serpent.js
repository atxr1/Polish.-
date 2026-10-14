// Serpent bodies (Gyarados, Rayquaza, Milotic): the head leads a chain of segments that follow the exact
// path the head traced, spaced by arc length, with a gentle side-to-side wave while moving. The body coils
// into the species' full sprite pose over 6 ticks when it stops or attacks, and uncoils when it moves.
import { clamp } from '../core/util.js';

const COIL_STEP = 1 / 6;

export class Serpent {
  constructor(f) {
    this.f = f;
    this.cfg = f.sp.serpent;
    this.n = this.cfg.segs;
    this.spacing = this.cfg.len / this.n;
    this.path = [];          // newest last: {x, y}
    this.segs = [];
    for (let i = 0; i < this.n; i++) this.segs.push({ x: 0, y: 0, ang: 0, r: 0, i });
    this.coil = 1; this.coilNow = false; this.phase = 0;
    this.moving = false;
  }
  reset() { this.path = [{ x: this.f.x, y: this.f.y }]; this.coil = 1; this.layout(); }
  radiusAt(i) {
    const c = this.cfg, k = i / Math.max(1, this.n - 1);
    return (c.width / 2) * (1 - k) + (c.tail / 2) * k;
  }
  update() {
    const f = this.f;
    const v = Math.hypot(f.vx + f.kvx, f.vy + f.kvy);
    const st = f.state;
    this.moving = (st === 'walk' || st === 'trav' || st === 'dodge') && v > 0.35 && f.alive;
    const wantCoil = !this.moving || this.coilNow || st === 'act' || st === 'hurt' || st === 'faint' || st === 'victory' || st === 'enter' || (f.move && f.move.drive);
    this.coil = clamp(this.coil + (wantCoil ? COIL_STEP : -COIL_STEP), 0, 1);
    if (this.coil >= 1) { this.path = [{ x: f.x, y: f.y }]; }
    const last = this.path[this.path.length - 1];
    if (!last || Math.hypot(f.x - last.x, f.y - last.y) >= 1) this.path.push({ x: f.x, y: f.y });
    // trim the path to what the body needs
    let total = 0;
    for (let i = this.path.length - 1; i > 0; i--) {
      total += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].y - this.path[i - 1].y);
      if (total > this.cfg.len * 1.3) { this.path.splice(0, i - 1); break; }
    }
    if (this.moving) this.phase += 0.22 * clamp(v / 1.5, 0.4, 1.6);
    this.layout();
  }
  layout() {
    const f = this.f, path = this.path, sp = this.spacing * (1 - this.coil);
    let pi = path.length - 1, acc = 0;
    let px = f.x, py = f.y;
    for (let s = 0; s < this.n; s++) {
      const want = (s + 1) * sp;
      // walk back along the path until accumulated arc length reaches `want`
      let x = px, y = py;
      while (pi > 0) {
        const a = path[pi], b = path[pi - 1];
        const seg = Math.hypot(a.x - b.x, a.y - b.y);
        if (acc + seg >= want) { const u = (want - acc) / (seg || 1); x = a.x + (b.x - a.x) * u; y = a.y + (b.y - a.y) * u; break; }
        acc += seg; pi--;
        x = path[pi].x; y = path[pi].y;
      }
      const g = this.segs[s];
      const prev = s === 0 ? { x: f.x, y: f.y } : this.segs[s - 1];
      const ang = Math.atan2(prev.y - y, prev.x - x);
      // lateral wave, stronger toward the middle of the body
      const amp = (this.moving ? 2.6 : 0) * (1 - this.coil) * Math.sin(Math.PI * (s + 1) / (this.n + 1));
      const w = Math.sin(this.phase - s * 0.85) * amp;
      g.x = x - Math.sin(ang) * w; g.y = y + Math.cos(ang) * w; g.ang = ang; g.r = this.radiusAt(s);
    }
  }
  // hurtbox: head plus the front third of the body (only while uncoiled)
  hurtCircles() {
    const out = [];
    if (this.coil > 0.5) return out;
    const k = Math.ceil(this.n / 3);
    for (let i = 0; i < k; i++) out.push({ x: this.segs[i].x, y: this.segs[i].y, r: this.segs[i].r * 0.85 });
    return out;
  }
  extent() { let m = 0; for (const s of this.segs) m = Math.max(m, Math.hypot(s.x - this.f.x, s.y - this.f.y)); return m; }
}
