// Serpent body art (Gyarados, Rayquaza, Milotic): segments, fins and tail tips authored as pixel sprites in
// each species' own sprite palette, generated for 16 directions (direction-aware shading, belly band, crests).
// The head is cut from the species' real PMD sprite frames using the head offsets (see world.js).
// When the user's ChatGPT serpent sheets are present (assets/serpents/<id>.png, 3x2 grid), their pieces are
// used for segments and tails instead (processed by tools/serpent_sheets.py).
import { pixelSprite, hx, rotateNN, canvas, ctx2d } from './gfx.js';

const PAL = {
  gyarados: { out: '#000000', base: '#1F9FE7', dark: '#0067B7', light: '#7FCFFF', belly: '#F7E79F', bellyD: '#DFB767', fin: '#FFFFFF', finD: '#CFD7D7', mark: null, accent: '#9F0000' },
  rayquaza: { out: '#000000', base: '#5FB727', dark: '#278700', light: '#9FCF6F', belly: '#5FB727', bellyD: '#278700', fin: '#9F0000', finD: '#D73F00', mark: '#FFF700', markD: '#DFB700', accent: '#9F0000' },
  milotic: { out: '#000000', base: '#FFE79F', dark: '#DFAF67', light: '#FFFFFF', belly: '#FFE79F', bellyD: '#DFAF67', fin: '#FF87BF', finD: '#D73F00', mark: null, accent: '#1F9FE7', tailBlue: '#1F9FE7', tailBlueD: '#0067B7', tailRed: '#D73F00' },
};
const rgb = (h) => { const c = hx(h); c.push(255); return c; };
const cache = new Map();

// one body segment of radius r facing angle index d16 (0 = right, counter-clockwise steps of 22.5deg in y-down)
// mode: 'full' (outline + shading + fins/marks), 'fill' (shading only, no outline/fins: in-between body pieces),
// 'sil' (solid outline-colour disc: drawn under the fills so the body reads as one continuous tube)
export function segment(pal, r, d16, idx, nSeg, mode = 'full') {
  const tint = pal === 'milotic' && idx >= nSeg - 3;
  const key = `${pal}:${r}:${d16}:${mode === 'full' ? idx % 6 : 'x'}:${mode}:${tint}`;
  if (cache.has(key)) return cache.get(key);
  const P = PAL[pal], ang = d16 * Math.PI / 8, ca = Math.cos(ang), sa = Math.sin(ang);
  const R = Math.max(3, r), S = R * 2 + 5, o = S / 2;
  const side = Math.abs(ca);                   // how much of the flank (belly) faces the camera
  const out = rgb(P.out), base = rgb(P.base), dark = rgb(P.dark), light = rgb(P.light), belly = rgb(P.belly), bellyD = rgb(P.bellyD);
  const fin = rgb(P.fin), finD = rgb(P.finD), mark = P.mark ? rgb(P.mark) : null, markD = P.markD ? rgb(P.markD) : null;
  const full = mode === 'full';
  const hasFin = full && (pal === 'gyarados' ? idx % 2 === 0 && idx < nSeg - 2 : pal === 'rayquaza' ? idx % 3 === 1 : false);
  const hasMark = full && pal === 'rayquaza' && idx % 2 === 0;
  const scaleTint = tint;   // Milotic's cream turns to blue near the tail
  const img = pixelSprite(S, S, (x, y) => {
    const dx = x + 0.5 - o, dy = (y + 0.5 - o) * 1.12;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (mode === 'sil') return d > R + 0.5 ? null : out;
    if (mode === 'fill' && d > R - 0.6) return null;
    // dorsal fin (Gyarados: white crest pointing screen-up) / side fins (Rayquaza)
    if (hasFin && pal === 'gyarados') {
      const fy = -(R + 3) + Math.abs(dx * ca * 0.6) , fx = dx;
      if (dy < -R * 0.4 && dy > -R - 4 && Math.abs(fx) <= (dy + R + 4) * 0.5 && d > R - 1) return Math.abs(fx) >= (dy + R + 4) * 0.5 - 1 ? out : (fx > 0 ? finD : fin);
    }
    if (hasFin && pal === 'rayquaza') {
      // a pair of small red fins perpendicular to travel
      const px = -sa, py = ca; const along = dx * ca + dy * sa, across = dx * px + dy * py;
      if (Math.abs(along) < 2.5 && Math.abs(across) > R - 1 && Math.abs(across) < R + 4) return Math.abs(along) > 1.5 || Math.abs(across) > R + 3 ? out : (across > 0 ? fin : finD);
    }
    if (d > R + 0.5) return null;
    if (d > R - 0.6) return out;
    // shading: light from upper-left
    const nx = dx / R, ny = dy / R;
    const lum = -nx * 0.45 - ny * 0.75;
    let c = lum > 0.35 ? light : lum < -0.35 ? dark : base;
    if (scaleTint) c = lum > 0.2 ? rgb(P.tailBlue) : rgb(P.tailBlueD);
    // belly band on the lower flank when seen from the side
    if (ny > 1 - side * 0.65 && side > 0.3) c = ny > 0.85 ? bellyD : belly;
    // ring marking across the body (Rayquaza)
    if (hasMark) { const along = dx * ca + dy * sa; if (Math.abs(along) < 1.6 && ny < 0.8) c = Math.abs(along) < 0.8 ? mark : markD; }
    // Gyarados scale dots
    if (pal === 'gyarados' && (x * 3 + y * 5) % 11 === 0 && c === base) c = dark;
    return c;
  });
  cache.set(key, img);
  return img;
}

// tail tip authored facing right, pre-rotated to 16 directions on demand
const TAILS = {
  gyarados: ['..............kk', '...........kkwwk', '........kkkwwwk.', 'kkkk..kkwwwwwk..', 'kbbbkkwwwwwwk...', 'kBbbbkwwwwwwwk..', 'kBBbbbkwwwwgwwk.', 'kBbbbkwwwwgggwwk', 'kbbbkkwwwwwgwwk.', 'kkkk..kkwwwwwk..', '........kkkwwwk.', '...........kkwwk', '..............kk'],
  rayquaza: ['kkkk.........', 'kGggkk.......', 'kGgggrkk.....', 'kGggggrrkk...', 'kGgggggrrrkk.', 'kGggggrrkk...', 'kGgggrkk.....', 'kGggkk.......', 'kkkk.........'],
  milotic: ['......kkkkkk......', '....kkpppppkk.....', 'kkkkkpBbbbbppk....', 'kmmmkBbRbbRbbpk...', 'kmMmkbbbbbbbbbpk..', 'kMMmkBRbbRbbRbbpk.', 'kmMmkbbbbbbbbbbpk.', 'kmmmkBbRbbRbbbpk..', 'kkkkkpBbbbbbppk...', '....kkpppppkk.....', '......kkkkkk......'],
};
const TP = {
  k: [0, 0, 0, 255], w: rgb('#FFFFFF'), g: rgb('#CFD7D7'), b: rgb('#1F9FE7'), B: rgb('#0067B7'),
  G: rgb('#278700'), r: rgb('#9F0000'), p: rgb('#FF87BF'), R: rgb('#D73F00'), m: rgb('#FFE79F'), M: rgb('#DFAF67'),
};
const PALTAIL = { rayquaza: { g: rgb('#5FB727'), G: rgb('#278700'), r: rgb('#9F0000') } };
export function tail(pal, d16) {
  const key = `tail:${pal}:${d16}`;
  if (cache.has(key)) return cache.get(key);
  const rows = TAILS[pal];
  const p = Object.assign({}, TP, PALTAIL[pal] || {});
  const base = pixelSprite(rows[0].length, rows.length, (x, y) => { const ch = rows[y][x]; return ch === '.' ? null : p[ch]; });
  const img = d16 === 0 ? base : rotateNN(base, 0, 0, base.width, base.height, d16 * Math.PI / 8);
  cache.set(key, img);
  return img;
}

// pieces from the user's processed ChatGPT sheets: {segL, segS, tail} bitmaps (facing right)
const sheets = new Map();
export function setSheet(pal, pieces) { sheets.set(pal, pieces); }
export function sheetPiece(pal, which, d16) {
  const s = sheets.get(pal); if (!s || !s[which]) return null;
  const key = `sheet:${pal}:${which}:${d16}`;
  if (cache.has(key)) return cache.get(key);
  const src = s[which];
  const img = d16 === 0 || which !== 'tail' ? src : rotateNN(src, 0, 0, src.width, src.height, d16 * Math.PI / 8);
  cache.set(key, img);
  return img;
}
export function hasSheet(pal) { return sheets.has(pal); }
export { PAL as SERPENT_PAL };
