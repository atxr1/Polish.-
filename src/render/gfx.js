// Graphics cache: fighter atlases, PMD particle/beam sheets (type palette swaps, pre-rendered rotations),
// fonts, maps and procedurally authored pixel sprites. Everything drawn in the world is a bitmap at 1 texel
// per world unit; rotations are pre-rendered once (nearest-neighbour) and never done per frame.
import { CONTENT, prepSprite } from '../game/content.js';

export const BASE = './assets/';
const imgCache = new Map();
export function loadImage(url) {
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image failed: ' + url));
    im.src = url;
  });
  imgCache.set(url, p);
  return p;
}
export async function loadJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error('fetch failed ' + url); return r.json(); }
export function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && !globalThis.__noOffscreen) { const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h)); return c; }
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c;
}
export function ctx2d(c) { const x = c.getContext('2d', { willReadFrequently: false }); x.imageSmoothingEnabled = false; return x; }

// ---------------------------------------------------------------------------------- type ramps (palette swap)
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const TYPE_RAMPS = Object.fromEntries(Object.entries({
  Normal: ['#4a4a3a', '#7a7a5a', '#a8a878', '#d0d0a8', '#f4f4e0'], Fire: ['#6a1a00', '#c03a10', '#ee7a30', '#f8b848', '#fff0a0'],
  Water: ['#102a6a', '#2050b0', '#3a80e8', '#78b8f8', '#d0f0ff'], Electric: ['#6a5000', '#b89000', '#f0d020', '#f8f070', '#ffffd0'],
  Grass: ['#0a4010', '#2a7a20', '#58b038', '#98d860', '#e0ffb0'], Ice: ['#205870', '#4a98b8', '#80d0e0', '#b8f0f0', '#f0ffff'],
  Fighting: ['#501010', '#902020', '#c84030', '#e88060', '#ffd0b0'], Poison: ['#3a1040', '#702a80', '#a048b0', '#d080e0', '#f8d0ff'],
  Ground: ['#4a3010', '#8a6030', '#c09050', '#e0c080', '#fff0c8'], Flying: ['#303870', '#5868b0', '#8898e0', '#b8c8f8', '#f0f4ff'],
  Psychic: ['#601040', '#b02870', '#f05898', '#f8a0c8', '#ffe8f4'], Bug: ['#2a3a00', '#5a7010', '#90a820', '#c0d050', '#f0f8a0'],
  Rock: ['#3a3010', '#6a5a28', '#a08a48', '#c8b878', '#f0e8c0'], Ghost: ['#20183a', '#403070', '#6a58a0', '#9888c8', '#d8d0f8'],
  Dragon: ['#200a60', '#4020b0', '#7048f0', '#a088f8', '#e0d8ff'], Dark: ['#181010', '#382820', '#604838', '#907060', '#d0b8a0'],
  Steel: ['#303040', '#606070', '#9898a8', '#c8c8d8', '#f8f8ff'], Fairy: ['#602040', '#b05080', '#e088b0', '#f8b8d0', '#fff0f8'],
}).map(([k, v]) => [k, v.map(hx)]));

function recolorCanvas(src, ramp) {
  const c = canvas(src.width, src.height), x = ctx2d(c);
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0) continue;
    const L = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / 255;
    if (L < 0.1) continue;   // keep dark outlines
    const k = Math.min(4, Math.floor((L - 0.1) / 0.9 * 5));
    const r = ramp[k]; a[i] = r[0]; a[i + 1] = r[1]; a[i + 2] = r[2];
  }
  x.putImageData(d, 0, 0);
  return c;
}
// nearest-neighbour rotation of a bitmap (pre-render only)
export function rotateNN(src, sx, sy, sw, sh, ang) {
  const s = canvas(sw, sh), sxx = ctx2d(s); sxx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  const sd = sxx.getImageData(0, 0, sw, sh).data;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const W = Math.ceil(Math.abs(sw * ca) + Math.abs(sh * sa)) | 1, H = Math.ceil(Math.abs(sw * sa) + Math.abs(sh * ca)) | 1;
  const c = canvas(W, H), x = ctx2d(c), out = x.createImageData(W, H), od = out.data;
  const cx = (sw - 1) / 2, cy = (sh - 1) / 2, ox = (W - 1) / 2, oy = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const dx = xx - ox, dy = y - oy;
    const u = Math.round(cx + dx * ca + dy * sa), v = Math.round(cy - dx * sa + dy * ca);
    if (u < 0 || v < 0 || u >= sw || v >= sh) continue;
    const si = (v * sw + u) * 4, di = (y * W + xx) * 4;
    od[di] = sd[si]; od[di + 1] = sd[si + 1]; od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
  }
  x.putImageData(out, 0, 0);
  return c;
}
function flipCanvas(src, sx, sy, sw, sh) { const c = canvas(sw, sh), x = ctx2d(c); x.translate(sw, 0); x.scale(-1, 1); x.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh); return c; }
function quarter(src, sx, sy, sw, sh, q) {
  if (q === 0) { const c = canvas(sw, sh); ctx2d(c).drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh); return c; }
  const W = q % 2 ? sh : sw, H = q % 2 ? sw : sh, c = canvas(W, H), x = ctx2d(c);
  x.translate(W / 2, H / 2); x.rotate(q * Math.PI / 2); x.drawImage(src, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  return c;
}

// PMDO particle direction order (Dir8 rows): Down, DownLeft, Left, UpLeft, Up, UpRight, Right, DownRight
export const pmdoDir8 = (a) => ((Math.round((a - Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8;
export const dir16 = (a) => ((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16;

// ---------------------------------------------------------------------------------- the graphics store
export class Gfx {
  constructor() {
    this.fx = null; this.fxImg = new Map(); this.variants = new Map(); this.beams = new Map();
    this.atlas = new Map(); this.white = new Map(); this.maps = new Map(); this.portraits = new Map();
    this.fonts = null; this.fontImg = {}; this.trainers = new Map(); this.px = new Map();
    this.missing = new Set();
  }
  async init() {
    this.fx = await loadJSON(BASE + 'fx/manifest.json');
    this.fonts = await loadJSON(BASE + 'ui/fonts.json');
    for (const [k, v] of Object.entries(this.fonts)) this.fontImg[k] = await loadImage(BASE + 'ui/' + v.file);
  }
  // ----------------------------------------------- fighters
  async loadFighter(id) {
    if (this.atlas.has(id)) return;
    const [meta, img] = await Promise.all([CONTENT.sprites[id] ? Promise.resolve(null) : loadJSON(BASE + 'fighters/' + id + '.json'), loadImage(BASE + 'fighters/' + id + '.png')]);
    if (meta) CONTENT.sprites[id] = prepSprite(meta);
    this.atlas.set(id, img);
    const m = CONTENT.sprites[id];
    if (m.portraits && m.portraits.length) { try { this.portraits.set(id, await loadImage(BASE + 'fighters/' + id + '-portraits.png')); } catch (e) { /* no portrait */ } }
  }
  // optional serpent body sheets (processed ChatGPT art): assets/serpents/<pal>.json lists piece rects in <pal>.png
  async loadSerpentSheet(pal) {
    if (this.serpentTried && this.serpentTried.has(pal)) return null;
    (this.serpentTried = this.serpentTried || new Set()).add(pal);
    try {
      if (!this.serpentIndex) this.serpentIndex = loadJSON(BASE + 'serpents/index.json').catch(() => ({ sheets: [] }));
      const idx = await this.serpentIndex; if (!idx.sheets.includes(pal)) return null;
      const meta = await loadJSON(BASE + 'serpents/' + pal + '.json'), img = await loadImage(BASE + 'serpents/' + pal + '.png');
      const out = {};
      for (const [k, r] of Object.entries(meta.pieces)) { const c = canvas(r[2], r[3]); ctx2d(c).drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); out[k] = c; }
      return out;
    } catch (e) { return null; }
  }
  async loadPortraits(id) { if (this.portraits.has(id)) return; try { this.portraits.set(id, await loadImage(BASE + 'fighters/' + id + '-portraits.png')); } catch (e) { this.portraits.set(id, null); } }
  // per-match caches: white/tinted atlas copies are as large as the atlases, rotated effect frames add up over a session
  releaseMatchCaches() { this.white.clear(); if (this.px.size > 1200) this.px.clear(); }
  whiteAtlas(id) {
    if (this.white.has(id)) return this.white.get(id);
    const img = this.atlas.get(id); if (!img) return null;
    const c = canvas(img.width, img.height), x = ctx2d(c);
    x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    this.white.set(id, c); return c;
  }
  tintAtlas(id, color, key) {
    const k = id + '|' + key;
    if (this.white.has(k)) return this.white.get(k);
    const img = this.atlas.get(id); if (!img) return null;
    const c = canvas(img.width, img.height), x = ctx2d(c);
    x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.55; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    this.white.set(k, c); return c;
  }
  // ----------------------------------------------- particles
  async loadSheet(name) {
    const base = name.split('|')[0];
    const def = this.fx.particles[base];
    if (!def) { this.missing.add(base); return null; }
    if (!this.fxImg.has(base)) this.fxImg.set(base, loadImage(BASE + 'fx/' + def.file).then((im) => { this.fxImg.set(base, im); return im; }));
    const r = this.fxImg.get(base);
    return r instanceof Promise ? r : Promise.resolve(r);
  }
  async loadBeam(name) {
    const base = name.split('|')[0];
    if (this.beams.has(base)) return;
    const def = this.fx.beams[base]; if (!def) { this.missing.add('beam:' + base); return; }
    const [head, body, tail] = await Promise.all(['Head', 'Body', 'Tail'].map((p) => loadImage(BASE + 'fx/beam_' + base + '/' + p + '.png')));
    this.beams.set(base, { def, head, body, tail });
  }
  sheetDef(name) { return this.fx.particles[name.split('|')[0]]; }
  isBeam(name) { return !!(name && this.fx.beams[name.split('|')[0]]); }
  // the source bitmap of a sheet (palette-swapped when the name carries "|Type")
  sheetImg(name) {
    const [base, type] = name.split('|');
    const im = this.fxImg.get(base);
    if (!im || im instanceof Promise) return null;
    if (!type) return im;
    const key = base + '|' + type;
    let v = this.variants.get(key);
    if (!v) { v = recolorCanvas(im, TYPE_RAMPS[type] || TYPE_RAMPS.Normal); this.variants.set(key, v); }
    return v;
  }
  // a single frame oriented toward `ang`, as {img, sx, sy, w, h} ready to draw centered
  frame(name, k, ang = Math.PI / 2) {
    const def = this.sheetDef(name); if (!def) return null;
    const img = this.sheetImg(name); if (!img) return null;
    k = Math.max(0, Math.min(def.n - 1, k));
    const fw = def.fw, fh = def.fh;
    switch (def.layout) {
      case 'Dir8': return { img, sx: k * fw, sy: pmdoDir8(ang) * fh, w: fw, h: fh };
      case 'Dir5': {
        const d = pmdoDir8(ang);
        if (d <= 4) return { img, sx: k * fw, sy: d * fh, w: fw, h: fh };
        return this.cached(name + '#m' + (8 - d) + ':' + k, () => flipCanvas(img, k * fw, (8 - d) * fh, fw, fh));
      }
      case 'Dir2': {
        const d = pmdoDir8(ang), row = d % 2, q = Math.floor(d / 2);
        if (q === 0) return { img, sx: k * fw, sy: row * fh, w: fw, h: fh };
        return this.cached(name + '#q' + d + ':' + k, () => quarter(img, k * fw, row * fh, fw, fh, q));
      }
      case 'Flip': {
        if (Math.cos(ang) >= -0.01) return { img, sx: k * fw, sy: 0, w: fw, h: fh };
        return this.cached(name + '#f:' + k, () => flipCanvas(img, k * fw, 0, fw, fh));
      }
      case 'Dir1': {
        const d = dir16(ang - Math.PI / 2);
        if (d === 0) return { img, sx: k * fw, sy: 0, w: fw, h: fh };
        return this.cached(name + '#r' + d + ':' + k, () => rotateNN(img, k * fw, 0, fw, fh, d * Math.PI / 8));
      }
      default: return { img, sx: k * fw, sy: 0, w: fw, h: fh };
    }
  }
  // rotated frame (for projectiles that carry no direction rows but must point along their path)
  rotFrame(name, k, ang) {
    const def = this.sheetDef(name); if (!def) return null;
    const img = this.sheetImg(name); if (!img) return null;
    k = Math.max(0, Math.min(def.n - 1, k));
    const d = dir16(ang);
    if (d === 0) return { img, sx: k * def.fw, sy: 0, w: def.fw, h: def.fh };
    return this.cached(name + '#R' + d + ':' + k, () => rotateNN(img, k * def.fw, 0, def.fw, def.fh, d * Math.PI / 8));
  }
  cached(key, make) {
    let c = this.px.get(key);
    if (!c) { const cv = make(); c = { img: cv, sx: 0, sy: 0, w: cv.width, h: cv.height }; this.px.set(key, c); }
    return c;
  }
  // beam pieces rotated to 16 directions; base art points up (head at the user end)
  beamPiece(name, part, frame, ang) {
    const [base, type] = name.split('|');
    const b = this.beams.get(base); if (!b) return null;
    const key = 'B' + name + part + frame + ':' + dir16(ang + Math.PI / 2);
    return this.cached(key, () => {
      let src = b[part.toLowerCase()];
      const nf = b.def.frames;
      const pw = Math.max(1, Math.floor(src.width / nf)), ph = src.height;
      let sx = (frame % nf) * pw;
      // body: a 1-px slice stacked into a 12-px tile
      let tile;
      if (part === 'Body') { tile = canvas(pw, 12); const tx = ctx2d(tile); for (let y = 0; y < 12; y++) tx.drawImage(src, sx, 0, pw, 1, 0, y, pw, 1); }
      else { tile = canvas(pw, ph); ctx2d(tile).drawImage(src, sx, 0, pw, ph, 0, 0, pw, ph); }
      if (type) tile = recolorCanvas(tile, TYPE_RAMPS[type] || TYPE_RAMPS.Normal);
      const d = dir16(ang + Math.PI / 2);
      return d === 0 ? tile : rotateNN(tile, 0, 0, tile.width, tile.height, d * Math.PI / 8);
    });
  }
  // ----------------------------------------------- maps, trainers
  async loadMap(id) { if (!this.maps.has(id)) this.maps.set(id, await loadImage(BASE + 'maps/' + id + '.png')); return this.maps.get(id); }
  async loadTrainer(id) { if (!this.trainers.has(id)) this.trainers.set(id, await loadImage(BASE + 'trainers/' + id + '.png')); return this.trainers.get(id); }
  // ----------------------------------------------- PMD pixel font (world text)
  textWidth(str, font = 'text') {
    const F = this.fonts[font]; let w = 0;
    for (const ch of str) { const g = F.glyphs[ch.codePointAt(0)] || F.glyphs[63]; w += (g ? g[1] : 4) + (font === 'text' ? 0 : 0); }
    return w;
  }
  drawText(x2, str, x, y, font = 'text') {
    const F = this.fonts[font], img = this.fontImg[font]; if (!F || !img) return;
    let cx = Math.round(x);
    for (const ch of str) {
      const g = F.glyphs[ch.codePointAt(0)];
      if (!g) { cx += 4; continue; }
      x2.drawImage(img, g[0], 0, g[1], g[2], cx, Math.round(y), g[1], g[2]);
      cx += g[1];
    }
  }
}

// ---------------------------------------------------------------------------------- authored pixel sprites
// String-grid sprites: each char indexes a palette; '.' is transparent.
export function gridSprite(rows, pal) {
  const h = rows.length, w = rows[0].length, c = canvas(w, h), x = ctx2d(c), d = x.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    const ch = rows[y][i]; if (ch === '.' || ch === ' ') continue;
    const col = pal[ch]; if (!col) continue;
    const o = (y * w + i) * 4; d.data[o] = col[0]; d.data[o + 1] = col[1]; d.data[o + 2] = col[2]; d.data[o + 3] = col[3] ?? 255;
  }
  x.putImageData(d, 0, 0); return c;
}
// procedural: write pixels with a callback (x, y) -> [r,g,b,a] | null
export function pixelSprite(w, h, fn) {
  const c = canvas(w, h), x = ctx2d(c), d = x.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    const col = fn(i, y); if (!col) continue;
    const o = (y * w + i) * 4; d.data[o] = col[0]; d.data[o + 1] = col[1]; d.data[o + 2] = col[2]; d.data[o + 3] = col[3] ?? 255;
  }
  x.putImageData(d, 0, 0); return c;
}
export { hx };
