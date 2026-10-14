// World renderer. Draws the battle into an offscreen buffer at 1 pixel per world unit with the camera snapped
// to whole pixels, then the caller upscales that buffer to the screen with nearest-neighbour at an integer
// scale. Everything here is bitmap pixel art: sprite frames, PMD particle sheets, pre-rotated beam pieces and
// the authored sprites from pixelart.js / serpentArt.js. (Vector UI lives in ui/hud.js.)
import { canvas, ctx2d, dir16 } from './gfx.js';
import * as PX from './pixelart.js';
import * as SA from './serpentArt.js';
import { CONTENT } from '../game/content.js';

const AIR_LIFT = 18;
const MAP_PAD = 72;         // mirrored strip above and below the painting (camera can look past the edge)          // how high flyers hover above their shadows
const FLOATERS = new Set(['weezing', 'mewtwo', 'latios', 'latias', 'darkrai', 'deoxys', 'metagross', 'starmie']);

export class World {
  constructor(gfx, fx) {
    this.g = gfx; this.fx = fx;
    this.buf = null; this.b = null; this.w = 0; this.h = 0;
    this.cam = { x: 0, y: 0, tx: 0, ty: 0, init: false };
    this.mapImg = null; this.map = null; this.cheerImg = null;
    this.clouds = []; this.weather = []; this.amb = []; this.t = 0;
    this.settings = { pixelBars: false, hitboxes: false };
    this.focusSide = 0;
  }
  resize(w, h) {
    if (this.buf && this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.buf = canvas(w, h); this.b = ctx2d(this.buf);
  }
  setMap(map, img, cheerImg) {
    this.map = map; this.mapImg = img; this.cheerImg = cheerImg || null; this.cam.init = false;
    this.mapPad = img ? mirrorPad(img, MAP_PAD) : null;
    this.clouds = []; this.amb = [];
    const [W, H] = map.size;
    const nCloud = map.fx && map.fx.clouds ? map.fx.clouds : 0;
    for (let layer = 0; layer < nCloud; layer++) for (let i = 0; i < 5; i++) this.clouds.push({ layer, x: (i * 173 + layer * 97) % W, y: (i * 89 + layer * 61) % H, v: (i + layer * 3) % 5, sp: 0.08 + layer * 0.07 });
  }
  // ------------------------------------------------------------------ camera
  updateCamera(S, snap) {
    const [MW, MH] = this.map.size;
    const fs = S.fighters().filter((f) => f.onField || f.state === 'faint');
    let tx = MW / 2, ty = MH / 2;
    if (fs.length === 2) {
      const me = S.activeOf(this.focusSide);
      const o = S.activeOf(1 - this.focusSide);
      tx = me.x * 0.58 + o.x * 0.42; ty = me.y * 0.58 + o.y * 0.42 - 10;
    } else if (fs.length === 1) { tx = fs[0].x; ty = fs[0].y - 10; }
    tx -= this.w / 2; ty -= this.h / 2;
    // keep the camera on the arena (plus a margin) so mirrored map padding rarely shows
    const P = this.map.play, m = 56;
    let lox = Math.max(0, P.x0 - m), hix = Math.min(MW - this.w, P.x1 + m - this.w);
    if (lox > hix) { lox = hix = Math.max(0, Math.min(MW - this.w, (P.x0 + P.x1) / 2 - this.w / 2)); }
    let loy = Math.max(0, P.y0 - m - 30), hiy = Math.min(MH - this.h, P.y1 + m - this.h);
    if (loy > hiy) { loy = hiy = Math.max(0, Math.min(MH - this.h, (P.y0 + P.y1) / 2 - this.h / 2)); }
    // keep the fighters out from under the HUD bands (panels on top, stamina gauge at the bottom): the camera may
    // look past the map edge for that, over a mirrored strip of the painting
    const sT = this.safeTop || 0, sB = this.safeBottom || 0;
    if (fs.length && (sT || sB)) {
      let top = Infinity, bot = -Infinity;
      for (const f of fs) { top = Math.min(top, f.y - 46); bot = Math.max(bot, f.y + 8); }
      if (top < ty + sT) ty = top - sT;
      if (bot > ty + this.h - sB) ty = Math.max(top - sT, bot - (this.h - sB));
      loy = Math.min(loy, P.y0 - 46 - sT); hiy = Math.max(hiy, P.y1 + 8 + sB - this.h);
    }
    tx = Math.max(lox, Math.min(hix, tx)); ty = Math.max(loy, Math.min(hiy, ty));
    if (MW < this.w) tx = (MW - this.w) / 2;
    if (MH < this.h && !(this.safeTop || this.safeBottom)) ty = (MH - this.h) / 2;
    if (!this.cam.init || snap) { this.cam.x = tx; this.cam.y = ty; this.cam.init = true; }
    else { this.cam.x += (tx - this.cam.x) * 0.12; this.cam.y += (ty - this.cam.y) * 0.12; }
  }
  // ------------------------------------------------------------------ main draw
  draw(S, opts = {}) {
    const b = this.b, g = this.g, fx = this.fx;
    this.adv = S.tick !== this.t; this.t = S.tick;   // animation clock = sim tick (frame-rate independent)
    this.updateCamera(S, opts.snap);
    let sx = 0, sy = 0;
    if (fx.shakeAmt > 0.5) { const a = Math.ceil(fx.shakeAmt); sx = ((this.t * 7) % (2 * a + 1)) - a; sy = ((this.t * 5) % (2 * a + 1)) - a; }
    const cx = Math.round(this.cam.x) + sx, cy = Math.round(this.cam.y) + sy;
    this.cx = cx; this.cy = cy;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
    b.fillStyle = '#0c0a18'; b.fillRect(0, 0, this.w, this.h);
    b.setTransform(1, 0, 0, 1, -cx, -cy);
    // map (air maps scroll slower: far-below parallax)
    if (this.mapImg) {
      const src = this.mapPad || this.mapImg, off = this.mapPad ? MAP_PAD : 0;
      if (S.env === 'air') { const px = Math.round(cx * 0.15), py = Math.round(cy * 0.15); b.drawImage(src, px, py - off); }
      else b.drawImage(src, 0, -off);
    }
    if (this.cheerImg && fx.cheer > 0 && (this.t >> 3) % 2 === 0) b.drawImage(this.cheerImg, 0, 0);
    this.drawWaterSurface(S);
    this.drawDecals();
    const lift = S.env === 'air' ? AIR_LIFT : 0;
    this.lift = lift;
    if (S.env === 'air') this.drawClouds(0);
    // shadows sit on the terrain; everything else in the air shares one raised collision plane
    for (const f of S.fighters()) if (!f.serpent || f.serpent.coil >= 1 || S.env !== 'air') this.drawShadow(S, f);
    for (const p of S.projs) if (p.lob) b.drawImage(PX.shadow(10, 4), Math.round(p.x - 5), Math.round(p.y - 2 + (lift ? 6 : 0)));
    b.setTransform(1, 0, 0, 1, -cx, -cy - lift);
    this.drawFeature(S, 'under');
    this.drawTrails(S);
    this.drawZones(S);
    this.drawTeles(S, 'ground');
    this.drawTraps(S);
    this.drawParts('back');
    // depth-sorted entities
    const items = [];
    for (const f of S.fighters()) {
      if (f.serpent && f.serpent.coil < 1 && (f.state === 'walk' || f.state === 'trav' || f.state === 'dodge' || f.serpent.coil > 0)) this.serpentItems(S, f, items);
      else items.push({ y: f.y, draw: () => this.drawFighter(S, f) });
      if (f.flags.front && f.onField) { const d = f.r + 7; items.push({ y: f.y + Math.sin(f.aim) * d * 0.6 + 0.2, draw: () => this.drawSteelWall(S, f, d) }); }
    }
    for (const c of S.clones) items.push({ y: c.y, draw: () => this.drawClone(S, c) });
    for (const d of S.decoys) items.push({ y: d.y, draw: () => b.drawImage(PX.SPR.log(), Math.round(d.x - 8), Math.round(d.y - 14)) });
    for (const w of S.walls) items.push({ y: (w.y0 + w.y1) / 2, draw: () => this.drawWall(w) });
    for (const p of S.projs) items.push({ y: p.y + 2, draw: () => this.drawProj(S, p) });
    for (const gh of fx.ghosts) items.push({ y: gh.y - 0.5, draw: () => this.drawGhost(S, gh) });
    for (const bl of fx.balls) items.push({ y: bl.y, draw: () => this.drawBall(bl) });
    items.sort((a, c) => a.y - c.y);
    for (const it of items) it.draw();
    this.drawWaves(S);
    this.drawRings(S);
    this.drawStreams();
    this.drawBeams(S);
    this.drawParts('front');
    this.drawTeles(S, 'air');
    this.drawFeature(S, 'over');
    b.setTransform(1, 0, 0, 1, -cx, -cy);
    if (S.env === 'air') { this.drawClouds(1); this.drawClouds(2); }
    this.drawWeather(S);
    this.drawAmbient(S);
    b.setTransform(1, 0, 0, 1, -cx, -cy - lift);
    this.drawMega(S);
    this.drawBarriersAndIcons(S);
    this.drawNumbers();
    this.drawEmotes(S, opts.portraits);
    if (this.settings.hitboxes) this.drawHitboxes(S);
    b.setTransform(1, 0, 0, 1, 0, 0);
    // screen-space pixel effects in the buffer: flash and anime speed lines
    if (fx.speedLines > 0) b.drawImage(PX.speedLines(this.w, this.h, fx.speedLines % 3), 0, 0);
    if (fx.flash > 0) { b.globalAlpha = 0.5; b.fillStyle = '#ffffff'; b.fillRect(0, 0, this.w, this.h); b.globalAlpha = 1; }
    return this.buf;
  }
  // world -> screen helpers for the HUD
  toScreen(x, y) { return { x: x - this.cx, y: y - this.cy }; }
  onScreen(x, y, m = 0) { return x - this.cx > -m && x - this.cx < this.w + m && y - this.cy > -m && y - this.cy < this.h + m; }

  // ------------------------------------------------------------------ fighters
  hover(S, f) {
    let z = f.z;
    if (S.env === 'air' && f.state !== 'faint') z += ((this.t >> 4) % 2);
    else if (S.env === 'air' && f.state === 'faint') z -= Math.round(AIR_LIFT * (f.fall || 0));
    else if (FLOATERS.has(f.id) && S.env === 'ground' && f.state !== 'faint') z += 3 + ((this.t >> 4) % 2);
    return z;
  }
  drawShadow(S, f) {
    if (!f.onField && f.state !== 'faint') return;
    if (f.flags.burrowed || f.flags.submerged) { this.b.drawImage(PX.shadow(f.r * 2.2, f.r), Math.round(f.x - f.r * 1.1), Math.round(f.y - f.r / 2)); return; }
    const m = f.meta; const w = m ? Math.max(10, m.shadow * 7 + 8) : 16;
    if (S.env === 'water') return;        // the waterline replaces the shadow
    const air = S.env === 'air';
    const sw = air ? w * 0.75 : w, sh = air ? w * 0.3 : w * 0.38;
    const oy = air ? 6 : 0;
    if (f.hidden() && f.side !== this.focusSide && !f.flags.revealed) return;
    this.b.drawImage(PX.shadow(sw, sh, air ? 0.4 : 0.55), Math.round(f.x - sw / 2), Math.round(f.y - sh / 2 + oy));
  }
  frameRect(f, fr) { return { sx: fr[0], sy: fr[1], w: fr[2], h: fr[3], ax: fr[4], ay: fr[5] }; }
  drawFighter(S, f) {
    const b = this.b, g = this.g;
    if (f.state === 'hidden' || f.state === 'recalled') return;
    if (f.state === 'enter' && f.enterT > 14) return;          // still inside the Poké Ball
    if (f.flags.hidden) return;                                // offscreen leap
    if (f.flags.burrowed) { this.drawMound(S, f); return; }
    if (f.flags.submerged) return;
    const fr = f.animFrame(); if (!fr) return;
    const atlas = g.atlas.get(f.spriteId); if (!atlas) return;
    const r = this.frameRect(f, fr);
    const z = this.hover(S, f);
    let x = Math.round(f.x - r.ax), y = Math.round(f.y - r.ay - z);
    let src = atlas;
    const mg = this.fx.mega && this.fx.mega.f === f ? this.fx.mega : null;
    if (mg && mg.t < 36 && (mg.t < 24 || (mg.t >> 1) % 2)) src = g.whiteAtlas(f.spriteId) || atlas;
    else if (S.tick < (f.flashT || 0)) src = g.whiteAtlas(f.spriteId) || atlas;
    else if (f.status.freeze) src = g.tintAtlas(f.spriteId, '#9fe8ff', 'frz') || atlas;
    else if (f.flags.shadow) src = g.tintAtlas(f.spriteId, '#120a20', 'shd') || atlas;
    else if (f.perfect > 0 && (this.t >> 2) % 2) src = g.tintAtlas(f.spriteId, '#fff3a0', 'prf') || atlas;
    const hidden = f.hidden() && !f.flags.revealed;
    if (hidden) {
      if (f.side !== this.focusSide && f.foe && f.foe.sp.passive !== 'aura') {
        if ((this.t >> 1) % 3) return;        // faint shimmer only
        b.globalAlpha = 0.2; x += (this.t >> 2) % 2;
      } else b.globalAlpha = 0.45;
    }
    if (f.state === 'enter') { b.globalAlpha = Math.min(b.globalAlpha, 0.5 + (14 - f.enterT) / 28); src = g.whiteAtlas(f.spriteId) || atlas; }
    // water: hide the lowest rows behind an animated waterline
    if (S.env === 'water' && f.state !== 'faint' && !(f.z > 4)) {
      const sink = 5 + ((this.t >> 4) % 2);
      const visH = Math.max(1, r.h - Math.max(0, Math.round(sink - (r.h - r.ay))));
      b.drawImage(src, r.sx, r.sy, r.w, visH, x, y + ((this.t >> 5) % 2), r.w, visH);
      this.waterline(f.x, f.y - z + ((this.t >> 5) % 2) - Math.max(0, sink - (r.h - r.ay)) + (r.h - r.ay) - 1, r.w);
    } else if (S.env === 'water' && f.state === 'faint') {
      const sinkPx = Math.round((f.sink || 0) * r.h * 0.9) + 5;
      const visH = Math.max(0, r.h - sinkPx);
      if (visH > 0) b.drawImage(src, r.sx, r.sy, r.w, visH, x, y, r.w, visH);
      if (this.adv && this.t % 6 === 0 && f.sink < 1) this.fx.spawn('Bubbles_Blue', f.x, f.y, { layer: 'front' });
      this.waterline(f.x, y + visH, r.w);
    } else b.drawImage(src, r.sx, r.sy, r.w, r.h, x, y, r.w, r.h);
    b.globalAlpha = 1;
    if (this.settings.pixelBars && f.onField && f.alive) {
      const frac = f.hp / f.maxHp, col = frac > 0.5 ? '#48d860' : frac > 0.2 ? '#f0c030' : '#f04040';
      b.drawImage(PX.miniBar(20, frac, col), Math.round(f.x - 10), y - 6);
    }
  }
  waterline(cx, y, w) {
    const b = this.b, k = (this.t >> 3) % 4;
    const ww = Math.round(w * 0.8);
    for (let i = 0; i < ww; i++) {
      const px = Math.round(cx - ww / 2 + i), wave = ((i + k) % 6 < 3) ? 0 : 1;
      b.fillStyle = (i + k) % 5 === 0 ? '#ffffff' : '#bfefff';
      b.fillRect(px, Math.round(y) + wave, 1, 1);
    }
  }
  drawSteelWall(S, f, d) {
    const w = PX.steelWall(dir16(f.aim), (this.t >> 2) % 11, Math.round(d));
    const x = f.x, y = f.y - this.hover(S, f);
    this.b.drawImage(w.img, Math.round(x - w.ax), Math.round(y - w.ay));
  }
  drawMound(S, f) {
    const b = this.b, k = (this.t >> 2) % 3;
    b.drawImage(PX.dustPuff(1), Math.round(f.x - 2), Math.round(f.y - 4 - k));
    const s = PX.shadow(18, 8, 0.7); b.drawImage(s, Math.round(f.x - 9), Math.round(f.y - 4));
    b.fillStyle = '#8a6030'; b.fillRect(Math.round(f.x - 6), Math.round(f.y - 4), 12, 3);
    b.fillStyle = '#c09050'; b.fillRect(Math.round(f.x - 4), Math.round(f.y - 6), 8, 2);
    b.fillStyle = '#e0c080'; b.fillRect(Math.round(f.x - 2 + k), Math.round(f.y - 7), 3, 1);
  }
  drawGhost(S, gh) {
    const atlas = this.g.tintAtlas(gh.sprite, '#ffffff', 'gh'); if (!atlas) return;
    const fr = gh.frame; if (!fr) return;
    if (gh.t % 2) return;
    this.b.globalAlpha = gh.t < 4 ? 0.5 : 0.25;
    const z = gh.z;
    this.b.drawImage(atlas, fr[0], fr[1], fr[2], fr[3], Math.round(gh.x - fr[4]), Math.round(gh.y - fr[5] - z), fr[2], fr[3]);
    this.b.globalAlpha = 1;
  }
  drawClone(S, c) {
    const f = c.owner, fr = f.animFrame(); if (!fr) return;
    const atlas = this.g.tintAtlas(f.spriteId, '#5aa0ff', 'clone'); if (!atlas) return;
    if ((this.t + c.slot) % 9 === 0) return;
    this.b.globalAlpha = 0.75;
    this.b.drawImage(atlas, fr[0], fr[1], fr[2], fr[3], Math.round(c.x - fr[4]), Math.round(c.y - fr[5]), fr[2], fr[3]);
    this.b.globalAlpha = 1;
  }
  // serpent: tail -> segments -> head, depth sorted with the rest of the scene
  serpentItems(S, f, items) {
    const sp = f.serpent, pal = f.sp.serpent.pal, n = sp.n;
    const air = S.env === 'air', water = S.env === 'water';
    const z = air ? ((this.t >> 4) % 2) : 0;
    const hidden = f.hidden() && !f.flags.revealed && f.side !== this.focusSide;
    if (hidden) return;
    // continuous body: each main segment draws the stretch back to the previous joint as overlapping discs —
    // silhouettes first, fills on top — then its own full piece (fins, markings), so only the outer edge is outlined
    for (let i = n - 1; i >= 0; i--) {
      const s = sp.segs[i];
      const r = Math.round(s.r);
      const d = dir16(s.ang);
      const last = i === n - 1;
      const prev = i === 0 ? { x: f.x, y: f.y, r: s.r } : sp.segs[i - 1];
      items.push({ y: s.y - 0.01 * i, draw: () => {
        const b = this.b;
        const flash = S.tick < (f.flashT || 0);
        const put = (img, x, y, rr) => {
          const ox = Math.round(x - img.width / 2), oy = Math.round(y - img.height / 2 - rr * 0.6 - z);
          if (water) { const vis = Math.ceil(img.height * 0.62); b.drawImage(img, 0, 0, img.width, vis, ox, oy + 2, img.width, vis); return { ox, oy, vis }; }
          b.drawImage(img, ox, oy); return null;
        };
        if (air) b.drawImage(PX.shadow(r * 2, r * 0.8, 0.35), Math.round(s.x - r), Math.round(s.y - r * 0.4 + 6 + AIR_LIFT));
        if (flash) b.globalAlpha = 0.6;
        if (last) {
          const img = SA.sheetPiece(pal, 'tail', (d + 8) % 16) || SA.tail(pal, (d + 8) % 16);
          const w = put(img, s.x, s.y, r);
          if (w) this.waterline(s.x, w.oy + 2 + w.vis, img.width);
        } else {
          const sheet = SA.sheetPiece(pal, i < n / 2 ? 'segL' : 'segS', d);
          if (sheet) { const w = put(sheet, s.x, s.y, r); if (w) this.waterline(s.x, w.oy + 2 + w.vis, sheet.width); }
          else {
            const dist = Math.hypot(prev.x - s.x, prev.y - s.y), k = Math.max(1, Math.floor(dist / 3.5));
            const pts = [];
            for (let j = 1; j < k; j++) { const u = j / k; pts.push({ x: s.x + (prev.x - s.x) * u, y: s.y + (prev.y - s.y) * u, r: Math.round(s.r + ((prev.r || s.r) - s.r) * u) }); }
            for (const q of pts) put(SA.segment(pal, q.r, d, i, n, 'sil'), q.x, q.y, q.r);
            for (const q of pts) put(SA.segment(pal, q.r, d, i, n, 'fill'), q.x, q.y, q.r);
            const img = SA.segment(pal, r, d, i, n, 'full');
            const w = put(img, s.x, s.y, r);
            if (w) this.waterline(s.x, w.oy + 2 + w.vis, img.width + 4);
          }
        }
        if (this.adv && water && (this.t + i * 5) % 30 === 0 && sp.moving) this.fx.spawn('Bubbles_Blue', s.x, s.y, { layer: 'back' });
        b.globalAlpha = 1;
      } });
    }
    // head: cut from the real sprite frame above the neck line
    items.push({ y: f.y + 0.5, draw: () => this.drawSerpentHead(S, f, z) });
  }
  drawSerpentHead(S, f, z) {
    const b = this.b, sp = f.serpent;
    const fr = f.animFrame(); if (!fr) return;
    let src = this.g.atlas.get(f.spriteId); if (!src) return;
    if (S.tick < (f.flashT || 0)) src = this.g.whiteAtlas(f.spriteId) || src;
    const r = this.frameRect(f, fr);
    const cut = Math.max(6, Math.min(r.h, Math.round(r.ay + fr[7] + f.sp.serpent.headCut)));
    const seg0 = sp.segs[0];
    const neckY = f.y - (seg0 ? seg0.r * 0.6 : 6) - z;
    const k = sp.coil;
    // while uncoiling the head is lowered to sit on the chain; fully coiled it is the whole sprite
    const x = Math.round(f.x - r.ax);
    const y = Math.round(neckY - cut + 4 * k);
    const h = Math.round(cut + (r.h - cut) * k);
    if (S.env === 'water') {
      b.drawImage(src, r.sx, r.sy, r.w, Math.min(h, cut + 2), x, y, r.w, Math.min(h, cut + 2));
    } else b.drawImage(src, r.sx, r.sy, r.w, h, x, y, r.w, h);
  }
  // ------------------------------------------------------------------ projectiles / beams / streams
  drawProj(S, p) {
    const b = this.b, g = this.g;
    if (!p.fxName) { b.drawImage(PX.SPR.ball(), Math.round(p.x - 4), Math.round(p.y - 4 - p.z)); return; }
    const d = g.sheetDef(p.fxName); if (!d) return;
    let k = Math.floor(p.t / (p.fxFT || 3)) % (p.frames ? p.frames.length : d.n);
    if (p.frames) k = p.frames[k];
    const ang = Math.atan2(p.vy, p.vx);
    let fr;
    if (p.rot !== undefined) fr = g.rotFrame(p.fxName, k, ang - p.rot);   // art drawn travelling at angle p.rot
    else if (d.layout === 'None' && !p.spin && (p.roll || p.reflectable === undefined)) fr = g.frame(p.fxName, k, ang);
    else if (d.layout === 'None' && p.directional) fr = g.rotFrame(p.fxName, k, ang);
    else fr = g.frame(p.fxName, k, ang);
    if (!fr) return;
    const s = 1;   // giant projectiles use pre-drawn Scale2x/Scale3x sheets, never runtime scaling
    const dx = Math.round(p.x - fr.w * s / 2), dy = Math.round(p.y - p.z - fr.h * s / 2);
    if (p.chainLine) {
      const o = p.owner, n = Math.floor(Math.hypot(p.x - o.x, p.y - o.y) / 5);
      for (let i = 1; i < n; i++) { const u = i / n; b.drawImage(PX.chain(i % 2), Math.round(o.x + (p.x - o.x) * u - 2), Math.round(o.y + (p.y - o.y) * u - 12)); }
    }
    b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, dx, dy, fr.w * s, fr.h * s);
  }
  drawStreams() {
    const b = this.b, g = this.g;
    for (const s of this.fx.streams) {
      const k = Math.min(s.n - 1, Math.floor(s.t / s.ft) % s.n);
      const fr = g.frame(s.name, k, s.ang); if (!fr) continue;
      b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(s.x - fr.w / 2), Math.round(s.y - s.z - fr.h / 2), fr.w, fr.h);
    }
  }
  drawBeams(S) {
    const b = this.b, g = this.g;
    for (const f of S.fighters()) for (const r of f.beams) {
      if (!r.name || !g.isBeam(r.name)) continue;
      const bdef = g.beams.get(r.name.split('|')[0]); if (!bdef) continue;
      const frame = Math.floor(r.t / 3) % bdef.def.frames;
      const ang = r.ang, len = r.len, z = r.z;
      const body = g.beamPiece(r.name, 'Body', frame, ang);
      if (body) {
        const step = 6;
        for (let d = 6; d < len - 4; d += step) {
          const x = r.x0 + Math.cos(ang) * d, y = r.y0 + Math.sin(ang) * d - z;
          b.drawImage(body.img, Math.round(x - body.w / 2), Math.round(y - body.h / 2));
        }
      }
      const head = g.beamPiece(r.name, 'Head', frame, ang);
      if (head && head.w > 2) b.drawImage(head.img, Math.round(r.x0 - head.w / 2), Math.round(r.y0 - z - head.h / 2));
      const tail = g.beamPiece(r.name, 'Tail', frame, ang);
      if (tail && tail.w > 2) b.drawImage(tail.img, Math.round(r.x1 - tail.w / 2), Math.round(r.y1 - z - tail.h / 2));
    }
  }
  drawParts(layer) {
    const b = this.b, g = this.g;
    for (const p of this.fx.parts) {
      if (p.layer !== layer) continue;
      const k = p.loop ? Math.floor(p.t / p.ft) % p.n : Math.min(p.n - 1, Math.floor(p.t / p.ft));
      const fr = g.frame(p.name, k, p.ang); if (!fr) continue;
      if (p.glow) { b.globalCompositeOperation = 'lighter'; b.globalAlpha = 0.8; }
      b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(p.x - fr.w / 2), Math.round(p.y - p.z - fr.h / 2), fr.w, fr.h);
      if (p.glow) { b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1; }
    }
  }
  // ------------------------------------------------------------------ zones, telegraphs, traps, trails
  drawZones(S) {
    const b = this.b, g = this.g;
    for (const z of S.zones) {
      if (z.t < z.delay || !z.fx) { if (z.st && z.st.smoke && z.t >= z.delay) this.drawSmoke(z); continue; }
      if (z.st && z.st.smoke) { this.drawSmoke(z); continue; }
      const lt = z.t - z.delay;
      if (z.r >= 400) {
        // arena-wide field (Nightmare Field): a dim veil over the play area and the effect scattered across it
        const bd = S.bounds, fade = Math.min(1, lt / 20, (z.ticks - lt) / 20);
        b.globalAlpha = 0.28 * fade; b.fillStyle = '#140a28'; b.fillRect(bd.x0 - 40, bd.y0 - 40, bd.x1 - bd.x0 + 80, bd.y1 - bd.y0 + 80); b.globalAlpha = 1;
        const d = g.sheetDef(z.fx); if (!d) continue;
        for (let i = 0; i < 14; i++) {
          const u = ((i * 0.618034) % 1), v = ((i * 0.381966 + 0.13) % 1);
          const x = bd.x0 + 20 + u * (bd.x1 - bd.x0 - 40) + Math.sin((lt + i * 40) * 0.02) * 6, y = bd.y0 + 16 + v * (bd.y1 - bd.y0 - 32);
          const fr = g.frame(z.fx, (Math.floor(lt / (z.fxFT || 2)) + i * 3) % d.n); if (!fr) continue;
          b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(x - fr.w / 2), Math.round(y - fr.h / 2), fr.w, fr.h);
        }
        continue;
      }
      for (const name of z.st && z.st.zoneFx2 ? [z.st.zoneFx2, z.fx] : [z.fx]) {
        const d = g.sheetDef(name); if (!d) continue;
        const ft = z.fxFT || 2;
        const k = Math.floor(lt / ft) % d.n;
        // tile larger zones with several copies so the effect fills the area
        const copies = z.r > d.fw * 0.75 ? Math.min(7, Math.ceil(z.r / (d.fw * 0.45))) : 1;
        for (let i = 0; i < copies; i++) {
          const a = i === 0 ? 0 : (i / (copies - 1)) * Math.PI * 2 + lt * 0.01, rr = i === 0 ? 0 : z.r * 0.55;
          const fr2 = g.frame(name, (k + i * 2) % d.n);
          if (!fr2) continue;
          const x = z.x + Math.cos(a) * rr, y = z.y + Math.sin(a) * rr * 0.7 + (z.st && z.st.zoneDy || 0);
          b.drawImage(fr2.img, fr2.sx, fr2.sy, fr2.w, fr2.h, Math.round(x - fr2.w / 2), Math.round(y - fr2.h / 2), fr2.w, fr2.h);
        }
      }
      if (z.st && z.st.decal === 'lava') b.drawImage(PX.lavaPool(z.r, (lt >> 3) % 4), Math.round(z.x - z.r), Math.round(z.y - z.r / 2));
      if (z.st && (z.st.trap || z.st.pull)) b.drawImage(PX.ring(z.r, z.st.trap ? '#ff8a3c' : '#9ad8ff', 1, 12, (lt >> 2) % 2), Math.round(z.x - z.r - 1), Math.round(z.y - z.r - 1));
    }
  }
  drawSmoke(z) {
    const b = this.b, g = this.g;
    const lt = z.t - z.delay;
    const name = z.fx || 'Smoke_Black';
    const d = g.sheetDef(name); if (!d) return;
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + lt * 0.004, rr = (i % 3) * z.r * 0.33;
      const k = (Math.floor(lt / 6) + i) % d.n;
      const fr = g.frame(name, Math.min(d.n - 1, 2 + (k % Math.max(1, d.n - 3)))); if (!fr) continue;
      b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(z.x + Math.cos(a) * rr - fr.w / 2), Math.round(z.y + Math.sin(a) * rr * 0.6 - fr.h / 2 - 8), fr.w, fr.h);
    }
  }
  drawTeles(S, pass) {
    const b = this.b;
    for (const t of this.fx.teles) {
      if (t.kind === 'wave' || t.kind === 'gust') { if (pass === 'air') this.drawEnvTele(S, t); continue; }
      if (pass === 'ground') {
        if (t.kind === 'shadow') { const k = Math.min(3, Math.floor(t.t / t.ticks * 4)); b.drawImage(PX.diveShadow(t.r, k), Math.round(t.x - t.r), Math.round(t.y - t.r / 2)); continue; }
        const img = PX.teleMarker(t.r, t.kind, (t.t >> 2) % 4);
        if (t.ticks - t.t < 16 && (t.t >> 1) % 2) continue;   // blink just before impact
        b.drawImage(img, Math.round(t.x - img.width / 2), Math.round(t.y - img.height / 2));
        if (S.env === 'ground' && t.kind !== 'target' && t.t > 6) b.drawImage(PX.crack(Math.min(30, t.r), (t.x | 0) + (t.y | 0)), Math.round(t.x - Math.min(30, t.r) - 1), Math.round(t.y - Math.min(30, t.r) - 1));
      } else if (t.fall && t.ticks - t.t < 18 && t.ticks - t.t >= 0) {
        // falling object in the last 18 ticks: meteor streak or lightning column
        const k = 18 - (t.ticks - t.t);
        if (this.g.isBeam(t.fall)) {
          const bdef = this.g.beams.get(t.fall.split('|')[0]);
          // the bolt: the Body sheet holds square, vertically tileable bolt frames; stack whole frames down to the target
          if (bdef && k > 12) {
            const fw = bdef.body.height, nfr = Math.max(1, Math.floor(bdef.body.width / fw)), fi = (k + (t.x | 0)) % nfr;
            for (let y = t.y - fw * 7; y < t.y - fw + 4; y += fw) b.drawImage(bdef.body, fi * fw, 0, fw, fw, Math.round(t.x - fw / 2), Math.round(y), fw, fw);
          }
        } else {
          const yy = t.y - (18 - k) * 12, xx = t.x - (18 - k) * 6;
          if (/Meteor/.test(t.fall)) {
            // a glowing meteor diving in along the streak sheet's diagonal
            const m = PX.meteor((this.t >> 1) % 4, false);
            b.drawImage(m.img, Math.round(xx - m.ax), Math.round(yy - m.ay));
          } else {
            const d = this.g.sheetDef(t.fall); if (!d) continue;
            const fr = this.g.frame(t.fall, Math.floor(k / 2) % d.n, Math.PI / 2 + 0.6); if (!fr) continue;
            b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(xx - fr.w / 2), Math.round(yy - fr.h / 2), fr.w, fr.h);
            if (t.fall === 'Eruption_Rocks') { const m = PX.meteor((this.t >> 1) % 4, true); b.drawImage(m.img, Math.round(xx - m.ax), Math.round(yy - m.ay)); }
          }
        }
      }
    }
  }
  drawEnvTele(S, t) {
    const b = this.b, B = S.bounds;
    if (t.kind === 'wave') {
      const x = t.dir > 0 ? B.x0 + 4 : B.x1 - 18;
      if ((t.t >> 2) % 2) for (let y = B.y0 + 6; y < B.y1; y += 18) b.drawImage(PX.chevron(t.dir > 0 ? 0 : 1), x, y);
    } else {
      for (let i = 0; i < 14; i++) { const x = B.x0 + ((i * 53 + t.t * 3) % (B.x1 - B.x0)), y = B.y0 + ((i * 37) % (B.y1 - B.y0)); b.drawImage(PX.streak(18, i % 3), Math.round(x), Math.round(y)); }
    }
  }
  drawTraps(S) {
    const b = this.b;
    for (const t of S.traps) b.drawImage(PX.SPR.spike(), Math.round(t.x - 3), Math.round(t.y - 3));
    for (const c of S.coins) b.drawImage(PX.SPR.coin((this.t >> 3) % 2), Math.round(c.x - 2), Math.round(c.y - 3));
  }
  drawTrails(S) {
    const b = this.b;
    for (const t of S.trails) {
      const age = S.tick - t.born, life = t.until - t.born, k = (age >> 2) % 3;
      if (age > life - 20 && (age >> 1) % 2) continue;
      let img;
      if (t.kind === 'wind') img = PX.streak(10, k);
      else if (t.kind === 'volt') { const fr = this.g.frame('Spark', 2 + (k % 2)); if (fr) b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(t.x - fr.w / 2), Math.round(t.y - fr.h / 2), fr.w, fr.h); continue; }
      else if (t.kind === 'fire') img = PX.ember(k);
      else if (t.kind === 'mist') img = PX.snowFlake(k % 2);
      else if (t.kind === 'rainbow') img = PX.SPR.star();
      if (!img) continue;
      b.drawImage(img, Math.round(t.x - img.width / 2 + (t.kind === 'rainbow' ? ((age >> 3) % 3) - 1 : 0)), Math.round(t.y - img.height / 2));
      if (t.kind === 'fire' && age % 9 === 0) { /* flicker */ }
    }
  }
  drawWall(w) {
    const b = this.b, n = Math.max(2, Math.round(Math.hypot(w.x1 - w.x0, w.y1 - w.y0) / 9));
    for (let i = 0; i <= n; i++) { const u = i / n; b.drawImage(PX.wallTile(i % 3), Math.round(w.x0 + (w.x1 - w.x0) * u - 6), Math.round(w.y0 + (w.y1 - w.y0) * u - 14)); }
  }
  drawWaves(S) {
    const b = this.b;
    for (const w of S.waves) {
      const left = w.vx < 0, band = PX.surfBand((this.t >> 2) % 6, left);
      for (let y = w.y - w.h / 2; y < w.y + w.h / 2; y += 24) b.drawImage(band, Math.round(left ? w.x - 4 : w.x - 44), Math.round(y));
      if (this.adv && this.t % 4 === 0) this.fx.spawn('Water_Spout_Splash', w.x, w.y + ((this.t * 37) % w.h) - w.h / 2, { layer: 'front' });
    }
  }
  drawRings(S) {
    const b = this.b;
    const g = this.g, d = g.sheetDef('Ice_Pieces');
    for (const r of S.rings) {
      const img = PX.ring(Math.round(r.r), '#c8f4ff', 2, 24, (this.t >> 2) % 2); b.drawImage(img, Math.round(r.x - r.r - 1), Math.round(r.y - r.r - 1));
      // ice crystals riding the expanding front
      if (!d) continue;
      const n = Math.max(8, Math.round(Math.PI * 2 * r.r / 16));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + r.r * 0.004, fr = g.frame('Ice_Pieces', (i + (this.t >> 2)) % d.n); if (!fr) continue;
        b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(r.x + Math.cos(a) * r.r - fr.w / 2), Math.round(r.y + Math.sin(a) * r.r - fr.h / 2), fr.w, fr.h);
      }
    }
  }
  drawDecals() {
    const b = this.b;
    for (const d of this.fx.decals) {
      const fade = d.t > d.life - 120 ? 0.35 : d.t > d.life - 240 ? 0.65 : 1;
      b.globalAlpha = fade;
      const img = d.kind === 'crack' ? PX.crack(d.r * 0.8, d.seed) : PX.scorch(d.r * 0.7, d.seed);
      b.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height / 2));
    }
    b.globalAlpha = 1;
  }
  // ------------------------------------------------------------------ environment
  drawWaterSurface(S) {
    if (S.env !== 'water') return;
    const b = this.b, B = S.bounds, k = (this.t >> 4) % 4;
    // animated ripple rings and current glints over the open water
    for (let i = 0; i < 16; i++) {
      const x = B.x0 + ((i * 97 + k * 13) % (B.x1 - B.x0)), y = B.y0 + ((i * 61 + (i % 3) * 29) % (B.y1 - B.y0));
      b.drawImage(PX.ripple(4 + (i % 3) * 2, (k + i) % 4), Math.round(x), Math.round(y));
    }
    for (const f of S.fighters()) {
      if (!f.onField) continue;
      const v = Math.hypot(f.vx, f.vy);
      if (this.adv && v > 0.6 && this.t % 6 === 0) this.fx.spawn('Bubbles_Blue', f.x - f.vx * 4, f.y - f.vy * 4, { layer: 'back', frameTime: 3 });
      b.drawImage(PX.ripple(Math.round(f.r * 0.9 + ((this.t >> 3) % 3)), (this.t >> 3) % 4), Math.round(f.x - f.r - 2), Math.round(f.y - f.r / 2 - 2));
    }
  }
  drawClouds(layer) {
    const b = this.b;
    for (const c of this.clouds) {
      if (c.layer !== layer) continue;
      if (this.adv) c.x += c.sp; const [W, H] = this.map.size;
      if (c.x > W + 80) c.x = -90;
      const img = PX.cloud(c.v, layer === 2 ? 1.1 : layer === 1 ? 0.9 : 0.8);
      const par = layer === 2 ? 0.25 : layer === 1 ? 0.1 : 0;
      if (layer >= 1) { if (c.v % 2 === 1 && layer === 2) continue; b.globalAlpha = layer === 2 ? 0.32 : 0.45; }
      b.drawImage(img, Math.round(c.x - this.cx * par), Math.round(c.y - this.cy * par));
      b.globalAlpha = 1;
    }
  }
  drawWeather(S) {
    const b = this.b;
    const raining = S.weatherOn ? S.weatherOn('rain') : false;
    const snow = this.map.fx && this.map.fx.overlay === 'Snow' || S.zones.some((z) => z.st && z.st.overlay === 'Snow');
    if (raining) for (let i = 0; i < 60; i++) { const x = this.cx + ((i * 37 + this.t * 3) % this.w), y = this.cy + ((i * 53 + this.t * 7) % this.h); b.drawImage(PX.rainDrop(), x, y); }
    if (snow) for (let i = 0; i < 40; i++) { const x = this.cx + ((i * 41 + this.t) % this.w), y = this.cy + ((i * 67 + (this.t >> 1)) % this.h); b.drawImage(PX.snowFlake(i % 2), x, y); }
    if (S.fighters().some((f) => f.sp.passive === 'sandstream' && f.onField) && S.env !== 'air') for (let i = 0; i < 40; i++) { const x = this.cx + ((i * 47 + this.t * 4) % this.w), y = this.cy + ((i * 71 + this.t) % this.h); b.drawImage(PX.dustPuff(i % 2), x, y); }
  }
  drawAmbient(S) {
    const b = this.b, kind = this.map.fx && this.map.fx.ambient;
    const n = 18;
    for (let i = 0; i < n; i++) {
      const x = this.cx + ((i * 73 + this.t * (i % 3 + 1) * 0.5) % this.w), y = this.cy + ((i * 41 + this.t * (kind === 'embers' ? -0.6 : 0.5)) % this.h + this.h) % this.h;
      let img = null;
      if (kind === 'leaves') img = PX.leaf(i + (this.t >> 4));
      else if (kind === 'embers') img = PX.ember(i + (this.t >> 3));
      else if (kind === 'sparkles') { if ((this.t + i * 7) % 40 < 20) img = PX.sparkle((this.t >> 3) + i); }
      if (img) b.drawImage(img, Math.round(x), Math.round(y));
    }
  }
  drawFeature(S, pass) {
    const F = S.feature; if (!F) return;
    const b = this.b, v = F.view, k = (this.t >> 3) % 4;
    switch (S.map.feature) {
      case 'bell': if (pass === 'over' && this.fx.ringFx) { const r = 8 + this.fx.ringFx.t * 2.4; const img = PX.ring(Math.round(r), '#ffe9a0', 2, 0, 0); b.drawImage(img, Math.round(F.bell.x - r - 1), Math.round(S.bounds.y0 + 34 - r - 1)); } break;
      case 'vents': if (pass === 'under') for (const vt of v.vents) { if (vt.state === 'tele') { if ((vt.t >> 2) % 2) b.drawImage(PX.ventGlow(k), Math.round(vt.x - 10), Math.round(vt.y - 5)); } else if (vt.state === 'idle' && (this.t + vt.x) % 90 < 4) b.drawImage(PX.ember(k), Math.round(vt.x), Math.round(vt.y - 6)); } break;
      case 'rift': if (pass === 'under') for (const p of v.portals) b.drawImage(PX.portal((this.t >> 3) % 8), Math.round(p.x - 12), Math.round(p.y - 12)); break;
      case 'inlets': if (pass === 'under') for (const it of v.inlets) if (it.on) for (let i = 0; i < 6; i++) { const u = ((this.t * 1.5 + i * 28) % it.len); b.drawImage(PX.streak(8, i % 3), Math.round(it.x + it.dx * u - 4), Math.round(it.y + it.dy * u + ((i % 3) - 1) * 6)); } break;
      case 'whirlpool': if (pass === 'under') { b.drawImage(PX.whirl(70, (this.t >> 2) % 18), Math.round(v.x - 70), Math.round(v.y - 35)); b.drawImage(PX.whirl(34, ((this.t >> 2) + 9) % 18), Math.round(v.x - 34), Math.round(v.y - 17)); } break;
      case 'updrafts': if (pass === 'under') for (const c of v.cols) b.drawImage(PX.updraft((this.t >> 2) % 10), Math.round(c.x - 26), Math.round(c.y - 15)); break;
      case 'windlanes': if (pass === 'under') for (const l of v.lanes) for (let i = 0; i < 8; i++) { const x = S.bounds.x0 + ((i * 60 + this.t * 1.2 * l.dir) % (S.bounds.x1 - S.bounds.x0) + (S.bounds.x1 - S.bounds.x0)) % (S.bounds.x1 - S.bounds.x0); b.drawImage(PX.chevron(l.dir > 0 ? 0 : 1), Math.round(x), Math.round(l.y - 2 + (i % 3) * 8 - 8)); } break;
      case 'gusts': if (pass === 'over' && v.state === 'gust') for (let i = 0; i < 24; i++) { const u = (i * 47 + this.t * 6) % 600; const x = this.cx + ((Math.cos(v.ang) * u + i * 31) % this.w + this.w) % this.w, y = this.cy + ((Math.sin(v.ang) * u + i * 23) % this.h + this.h) % this.h; b.drawImage(PX.snowFlake(1), Math.round(x), Math.round(y)); } break;
      case 'beacon': if (pass === 'over') { const img = PX.beaconRay(240, (this.t >> 2) % 5); const len = 240, a = v.ang; for (let d = 0; d < len; d += 6) { const x = v.x + Math.cos(a) * d, y = v.y + Math.sin(a) * d; if ((d / 6) % 2) continue; b.globalAlpha = 0.5; b.drawImage(PX.sparkle(1), Math.round(x - 1), Math.round(y - 1)); } b.globalAlpha = 1; } break;
      case 'rain': if (pass === 'over' && v.state === 'gather' && (this.t >> 3) % 2) { b.globalAlpha = 0.18; b.fillStyle = '#203050'; b.fillRect(this.cx, this.cy, this.w, this.h); b.globalAlpha = 1; } break;
    }
  }
  // ------------------------------------------------------------------ overlays: barriers, status icons, numbers, emotes
  drawBarriersAndIcons(S) {
    const b = this.b, g = this.g;
    for (const f of S.fighters()) {
      if (!f.onField || f.flags.hidden || f.flags.burrowed || f.flags.submerged) continue;
      const z = this.hover(S, f), hp = f.headPoint();
      const top = Math.round(hp.y - z - 10);
      const loop = (name, ft = 3, oy = 0) => { const d = g.sheetDef(name); if (!d) return; const fr = g.frame(name, Math.floor(this.t / ft) % d.n, f.aim); if (fr) b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(f.x - fr.w / 2), Math.round(f.y - z - fr.h / 2 - 10 + oy), fr.w, fr.h); };
      if (f.flags.protect) loop('Protect', 2);

      // screens are translucent panels in front of the body, as in the handheld games
      if (f.flags.reflect) { b.globalAlpha = (this.t >> 1) % 2 ? 0.5 : 0.42; loop(f.flags.reflectAll ? 'Screen_RSE_Gray' : f.id === 'starmie' ? 'Screen_RSE_Yellow' : 'Screen_RSE_Pink', 3, 4); b.globalAlpha = 1; }
      if (f.flags.absorb) {
        const R = f.flags.absorbR || 30, img = PX.ring(R, '#e8f8ff', 1, 16, (this.t >> 3) % 2); b.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - z - 10 - img.height / 2));
        // drifting mist puffs around the bubble
        const sd = g.sheetDef('Smoke_White');
        if (sd) { b.globalAlpha = 0.55; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + this.t * 0.03, fr = g.frame('Smoke_White', Math.min(sd.n - 1, 2 + ((i + (this.t >> 3)) % Math.max(1, sd.n - 3)))); if (fr) b.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(f.x + Math.cos(a) * R * 0.8 - fr.w / 2), Math.round(f.y - z - 10 + Math.sin(a) * R * 0.6 - fr.h / 2), fr.w, fr.h); } b.globalAlpha = 1; }
      }
      if (f.flags.counter) loop('Charge_Up', 2);
      if (f.flags.shieldHp > 0) { const img = PX.ring(f.r + 6, '#a8e8ff', 1, 10, (this.t >> 3) % 2); b.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - z - 10 - img.height / 2)); }
      if (f.tv && f.tv.rooted) loop('Ingrain', 4, 14);
      if (f.flags.unstoppable && (this.t >> 2) % 2) { const img = PX.ring(f.r + 4, '#ffb050', 1, 0, 0); b.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - z - 10 - img.height / 2)); }
      // status icon above the head
      const s = f.status;
      const icon = s.sleep ? PX.SPR.sleep() : s.freeze ? PX.SPR.freeze() : s.para ? PX.SPR.para() : s.burn ? PX.SPR.burn() : s.poison ? PX.SPR.poison() : s.confuse ? PX.SPR.confuse() : s.slow ? PX.SPR.slow() : f.silenced() ? PX.SPR.silence() : null;
      if (icon && !(f.hidden() && f.side !== this.focusSide)) b.drawImage(icon, Math.round(f.x - 3), top - ((this.t >> 4) % 2));
      if (this.adv && s.sleep && this.t % 40 === 0) this.fx.spawn('Sleep_Z', f.x + 6, f.y, { z: f.y - hp.y + z + 4 });
    }
  }
  drawNumbers() {
    const b = this.b, g = this.g;
    for (const n of this.fx.nums) {
      const rise = Math.min(14, n.t * 0.8) + (n.t > 30 ? (n.t - 30) * 0.2 : 0);
      if (n.t > 38 && n.t % 2) continue;
      const font = n.font === 'blue' ? 'blue' : n.font === 'green' ? 'green' : 'yellow';
      const w = g.textWidth(n.v, font);
      g.drawText(b, n.v, n.x - w / 2, n.y - n.z - rise, font);
    }
    for (const t of this.fx.texts) {
      if (t.t > 40 && t.t % 2) continue;
      const w = g.textWidth(t.str, 'text');
      g.drawText(b, t.str, t.x - w / 2, t.y - Math.min(8, t.t * 0.5), 'text');
    }
  }
  drawEmotes(S, portraits) {
    const b = this.b;
    for (const e of this.fx.emotes) {
      const f = e.f; if (!f.onField) continue;
      const pimg = this.g.portraits.get(f.spriteId) || this.g.portraits.get(f.sp.sprite); if (!pimg) continue;
      const meta = CONTENT.sprites[f.spriteId] || CONTENT.sprites[f.sp.sprite];
      const names = (meta && meta.portraits) || [];
      const want = ['Happy', 'Angry', 'Determined', 'Joyous'][e.n] || 'Normal';
      let idx = names.indexOf(want); if (idx < 0) idx = names.indexOf('Normal'); if (idx < 0) idx = 0;
      const bub = PX.bubble(42, 42);
      const hp = f.headPoint(), z = this.hover(S, f);
      const pop = e.t < 4 ? 4 - e.t : 0;
      const x = Math.round(f.x - bub.width / 2), y = Math.round(hp.y - z - bub.height - 6 + pop);
      if (e.t > 96 && e.t % 2) continue;
      b.drawImage(bub, x, y);
      b.drawImage(pimg, idx * 40, 0, 40, 40, x + 3, y + 1, 40, 40);
    }
  }
  drawHitboxes(S) {
    const b = this.b;
    b.fillStyle = 'rgba(255,0,0,0.5)';
    for (const f of S.fighters()) { b.fillRect(Math.round(f.x - f.r), Math.round(f.y), f.r * 2, 1); b.fillRect(Math.round(f.x), Math.round(f.y - f.r), 1, f.r * 2); if (f.serpent) for (const c of f.serpent.hurtCircles()) b.fillRect(Math.round(c.x - c.r), Math.round(c.y), c.r * 2, 1); }
    b.fillStyle = 'rgba(0,255,255,0.6)';
    for (const p of S.projs) b.fillRect(Math.round(p.x - p.r), Math.round(p.y), p.r * 2, 1);
    b.fillStyle = 'rgba(255,255,0,0.35)';
    for (const o of S.obstacles) { if (o.type === 'circle') b.fillRect(Math.round(o.x - o.r), Math.round(o.y - 1), o.r * 2, 2); else b.fillRect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0); }
    const B = S.bounds; b.fillStyle = 'rgba(255,255,255,0.4)'; b.fillRect(B.x0, B.y0, B.x1 - B.x0, 1); b.fillRect(B.x0, B.y1, B.x1 - B.x0, 1); b.fillRect(B.x0, B.y0, 1, B.y1 - B.y0); b.fillRect(B.x1, B.y0, 1, B.y1 - B.y0);
  }
  drawBall(bl) {
    const b = this.b;
    if (bl.kind === 'recall') {
      // the Pokémon turns into red light and is drawn back up the beam
      const fr = bl.frame, atlas = this.g.tintAtlas(bl.sprite, '#ff2030', 'recall');
      if (fr && atlas && bl.t < 14 && (bl.t >> 1) % 2 === 0) { b.globalAlpha = 1 - bl.t / 16; b.drawImage(atlas, fr[0], fr[1], fr[2], fr[3], Math.round(bl.x - fr[4]), Math.round(bl.y - fr[5]), fr[2], fr[3]); b.globalAlpha = 1; }
      const h = Math.min(160, Math.round(bl.beamH || 30)); const rb = PX.recallBeam(h, (this.t >> 2) % 4); b.drawImage(rb, Math.round(bl.x - 4), Math.round(bl.y - h));
      return;
    }
    if (bl.kind === 'beam') {
      const f = bl.f; if (!f || !f.onField) return;
      const h = Math.min(160, 30 + bl.t * 8), rb = PX.recallBeam(h, (this.t >> 2) % 4);
      b.drawImage(rb, Math.round(f.x - 4), Math.round(f.y - h));
      return;
    }
    if (bl.t < bl.delay) return;
    if (bl.open && bl.t > bl.ticks) return;
    const img = bl.open ? PX.SPR.ballOpen() : PX.SPR.ball();
    b.drawImage(img, Math.round(bl.x - 4), Math.round(bl.y - bl.z - 4));
  }
  drawMega(S) {
    const m = this.fx.mega; if (!m) return;
    const f = m.f, b = this.b, z = this.hover(S, f) + 14;
    if (m.t < 40) for (let i = 0; i < 3; i++) { const r = ((m.t * 3 + i * 14) % 42) + 6; const img = PX.rainbowRing(r); b.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - z - img.height / 2)); }
    if (m.t < 36 && (m.t >> 2) % 2) { const img = PX.ring(10 + (m.t >> 1), '#ffffff', 2, 0, 0); b.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - z - img.height / 2)); }
  }
}
// the painting with a vertically mirrored strip above and below it (exact pixel copies, no scaling)
function mirrorPad(img, P) {
  const W = img.width, H = img.height, c = canvas(W, H + 2 * P), x = ctx2d(c);
  x.drawImage(img, 0, P);
  const t = Math.min(P, H);
  x.save(); x.translate(0, P); x.scale(1, -1); x.drawImage(img, 0, 0, W, t, 0, 0, W, t); x.restore();
  x.save(); x.translate(0, P + H); x.scale(1, -1); x.drawImage(img, 0, H - t, W, t, 0, -t, W, t); x.restore();
  return c;
}
