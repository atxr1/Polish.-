// Authored pixel sprites, generated once into bitmaps: shadows, telegraph markers, rings, ripples, decals,
// status icons, Poké Balls, the Substitute log, clouds, confetti, speed lines, emote bubbles, rain and snow.
// No runtime vector shapes: every one of these writes individual pixels and is cached.
import { gridSprite, pixelSprite, hx, canvas, ctx2d } from './gfx.js';

const C = (h, a = 255) => { const c = hx(h); c.push(a); return c; };
const cache = new Map();
const memo = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };
let rs = 12345;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

// dithered pixel ellipse shadow
export function shadow(w, h, dark = 0.55) {
  w = Math.max(4, Math.round(w)); h = Math.max(2, Math.round(h));
  return memo(`sh${w}x${h}:${dark}`, () => pixelSprite(w, h, (x, y) => {
    const nx = (x + 0.5 - w / 2) / (w / 2), ny = (y + 0.5 - h / 2) / (h / 2), d = nx * nx + ny * ny;
    if (d > 1) return null;
    if (d > 0.62 && (x + y) % 2) return null;      // dithered rim
    return [10, 8, 20, Math.round(255 * dark)];
  }));
}
// midpoint-circle ring (pixel outline), optional dash pattern phase
export function ring(r, col, thick = 1, dash = 0, phase = 0) {
  r = Math.max(2, Math.round(r));
  return memo(`ring${r}:${col}:${thick}:${dash}:${phase}`, () => {
    const s = r * 2 + 3, c = C(col);
    return pixelSprite(s, s, (x, y) => {
      const dx = x - r - 1, dy = y - r - 1, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r + 0.5 || d < r - thick + 0.5) return null;
      if (dash) { const a = Math.atan2(dy, dx), seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * dash * 2 + phase) % 2; if (seg) return null; }
      return c;
    });
  });
}
// telegraph target marker: dashed ring + corner ticks + center cross; 4 animation frames
export function teleMarker(r, kind, frame) {
  const pal = { target: ['#ff4040', '#ffd0d0'], meteor: ['#a070ff', '#e8d8ff'], bolt: ['#ffe040', '#fffad0'], fire: ['#ff8030', '#ffe0b0'], water: ['#40a0ff', '#d0f0ff'], ice: ['#80e0ff', '#f0ffff'], psychic: ['#ff60b0', '#ffe0f0'], poison: ['#b050d0', '#f0d0ff'], dragon: ['#7048f0', '#e0d8ff'], ground: ['#c09050', '#fff0c8'], lava: ['#ff5020', '#ffd080'], shadow: ['#202030', '#606080'] }[kind] || ['#ff4040', '#ffd0d0'];
  r = Math.max(6, Math.round(r));
  return memo(`tele${r}:${kind}:${frame}`, () => {
    const s = r * 2 + 5, o = r + 2, a = C(pal[0]), b = C(pal[1]), dk = [20, 10, 20, 200];
    return pixelSprite(s, s, (x, y) => {
      const dx = x - o, dy = y - o, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r + 0.5 && d > r - 1.5) {
        const ang = Math.atan2(dy, dx), seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 16 + frame) % 2;
        return seg ? (d > r - 0.5 ? dk : null) : (d > r - 0.5 ? a : b);
      }
      if (d < r - 2 && d > r - 3.5 && (x + y + frame) % 4 === 0) return a;
      // center cross
      if ((Math.abs(dx) <= 3 && dy === 0) || (Math.abs(dy) <= 3 && dx === 0)) return Math.abs(dx) + Math.abs(dy) <= 1 ? b : a;
      return null;
    });
  });
}
// shadow telegraph for dives from offscreen: dithered dark disk that pulses
export function diveShadow(r, k) {
  r = Math.max(6, Math.round(r));
  return memo(`dive${r}:${k}`, () => pixelSprite(r * 2 + 1, r + 1, (x, y) => {
    const nx = (x - r) / r, ny = (y - r / 2) / (r / 2), d = nx * nx + ny * ny;
    if (d > 1) return null;
    if (d > 0.5 && (x + y + k) % 2) return null;
    return [8, 6, 16, 150 + k * 20];
  }));
}
// water ripple ring (flattened)
export function ripple(r, k) {
  r = Math.max(3, Math.round(r));
  return memo(`rip${r}:${k}`, () => pixelSprite(r * 2 + 3, r + 3, (x, y) => {
    const nx = (x - r - 1) / r, ny = (y - (r + 2) / 2) / (r / 2), d = Math.sqrt(nx * nx + ny * ny);
    if (Math.abs(d - 1) > 1.2 / r) return null;
    if ((x + k) % 3 === 0) return null;
    return [236, 252, 255, 220 - k * 40];
  }));
}
// ground crack decal
export function crack(r, seed) {
  r = Math.round(r); seed = ((seed | 0) % 16 + 16) % 16;   // 16 variants per size keeps the cache bounded
  return memo(`crack${r}:${seed}`, () => {
    rs = seed * 7919 + 13;
    const s = r * 2 + 2, c = canvas(s, s), x = ctx2d(c), d = x.createImageData(s, s);
    const put = (px, py, col) => { px |= 0; py |= 0; if (px < 0 || py < 0 || px >= s || py >= s) return; const o = (py * s + px) * 4; d.data[o] = col[0]; d.data[o + 1] = col[1]; d.data[o + 2] = col[2]; d.data[o + 3] = col[3]; };
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd() * 0.6, px = r + 1, py = r + 1;
      const len = r * (0.55 + rnd() * 0.45);
      for (let t = 0; t < len; t++) {
        a += (rnd() - 0.5) * 0.5; px += Math.cos(a); py += Math.sin(a) * 0.7;
        put(px, py, [28, 18, 14, 230]); put(px + 1, py, [70, 50, 36, 140]);
        if (rnd() < 0.08) { let b = a + (rnd() < 0.5 ? 0.8 : -0.8), qx = px, qy = py; for (let u = 0; u < len / 4; u++) { qx += Math.cos(b); qy += Math.sin(b) * 0.7; put(qx, qy, [28, 18, 14, 200]); } }
      }
    }
    x.putImageData(d, 0, 0); return c;
  });
}
export function scorch(r, seed) {
  r = Math.round(r); seed = ((seed | 0) % 16 + 16) % 16;
  return memo(`scorch${r}:${seed}`, () => { rs = seed * 31 + 7; return pixelSprite(r * 2, r, (x, y) => {
    const nx = (x - r) / r, ny = (y - r / 2) / (r / 2), d = nx * nx + ny * ny + (rnd() - 0.5) * 0.25;
    if (d > 1) return null;
    if (d > 0.6 && (x + y) % 2) return null;
    return d < 0.3 ? [20, 14, 12, 200] : [40, 28, 22, 150];
  }); });
}
export function lavaPool(r, k) {
  r = Math.round(r);
  return memo(`lava${r}:${k}`, () => pixelSprite(r * 2, r + 2, (x, y) => {
    const nx = (x - r) / r, ny = (y - r / 2 - 1) / (r / 2), d = nx * nx + ny * ny;
    if (d > 1) return null;
    if (d > 0.75) return [90, 20, 10, 255];
    const w = Math.sin((x + k * 2) * 0.7) + Math.cos((y + k) * 0.9);
    return w > 0.8 ? [255, 220, 90, 255] : w > -0.3 ? [255, 120, 30, 255] : [210, 60, 20, 255];
  }));
}

// -------------------------------------------------------------------- string-grid sprites
const P = {
  k: C('#181820'), w: C('#f8f8f8'), r: C('#e83838'), R: C('#a01c24'), g: C('#c8c8d0'), G: C('#80808c'), y: C('#ffd840'), Y: C('#c89010'),
  o: C('#ff8a30'), b: C('#4890f0'), B: C('#2050a8'), c: C('#a8f0ff'), p: C('#b060d0'), P: C('#702a80'), n: C('#8a5a30'), N: C('#5a3818'),
  t: C('#c89060'), l: C('#60c060'), L: C('#2a7a20'), z: C('#d8e8ff'), m: C('#ff60a0'),
};
export const SPR = {
  ball: () => memo('ball', () => gridSprite([
    '..kkkk..', '.krrrrk.', 'krrrrwrk', 'kkkwwkkk', 'kkwkkwkk', 'kgwwwwgk', '.kggggk.', '..kkkk..'], P)),
  ballOpen: () => memo('ballOpen', () => gridSprite([
    '.krrrrk.', 'krrrrrrk', 'kkkkkkkk', '........', '........', 'kkkkkkkk', 'kggwwggk', '.kggggk.'], P)),
  log: () => memo('log', () => gridSprite([
    '....NNNNNNNN....', '..NNnnnnnnnnNN..', '.NnnnnnNnnnnnnN.', 'NnnnNnnnnnnNnnnN', 'NnnnnnnnNnnnnnnN', 'NttnnnnnnnnnnnnN',
    'NtNtnnnNnnnnnnnN', 'NttnnnnnnnnNnnnN', '.NnnnnnnnnnnnnN.', '..NNnnnnnnnnNN..', '....NNNNNNNN....'], P)),
  coin: (k) => memo('coin' + k, () => gridSprite(k ? ['.kk.', 'kyYk', 'kyYk', '.kk.'] : ['.kkk.', 'kyyYk', 'kyYYk', 'kyyYk', '.kkk.'], P)),
  spike: () => memo('spike', () => gridSprite(['...k...', '..kpk..', '.kpPpk.', 'kpPkPpk', '.kkkkk.'], P)),
  // status icons (7x7)
  burn: () => memo('i-burn', () => gridSprite(['...o...', '..oo...', '.ooyo..', '.oyyo..', 'ooyyyo.', 'oyyyyo.', '.oooo..'], P)),
  para: () => memo('i-para', () => gridSprite(['...yy..', '..yy...', '.yyyyy.', '...yy..', '..yy...', '.yy....', 'y......'], P)),
  poison: () => memo('i-pois', () => gridSprite(['..pp...', '.pPPp..', '.pPPp..', '..pp.p.', '....pPp', '.p...p.', 'pPp....'], P)),
  sleep: () => memo('i-sleep', () => gridSprite(['zzzz...', '...z...', '..z....', '.z.....', 'zzzzzz.', '....z..', '...zzz.'], P)),
  freeze: () => memo('i-frz', () => gridSprite(['...c...', '.c.c.c.', '..ccc..', 'ccczccc', '..ccc..', '.c.c.c.', '...c...'], P)),
  confuse: () => memo('i-conf', () => gridSprite(['.y...y.', 'yyy.yyy', '.y...y.', '...y...', '..yyy..', '...y...', '.......'], P)),
  slow: () => memo('i-slow', () => gridSprite(['.......', '..bbb..', '.bBBBb.', 'bBbbbBb', '.bBBBb.', '..bbb..', '.......'], P)),
  silence: () => memo('i-sil', () => gridSprite(['.kkkkk.', 'kpppppk', 'kpkkkpk', 'kppppPk', '.kkkkk.', '..k....', '.k.....'], P)),
  heart: () => memo('i-heart', () => gridSprite(['.mm.mm.', 'mmmmmmm', 'mmmmmmm', '.mmmmm.', '..mmm..', '...m...'], P)),
  star: () => memo('i-star', () => gridSprite(['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'], P)),
  // emote speech bubble 9-slice parts are built by bubble(w,h)
};
export function bubble(w, h) {
  return memo(`bub${w}x${h}`, () => {
    const W = w + 4, H = h + 8;
    return pixelSprite(W, H, (x, y) => {
      const inBox = x >= 0 && x < W && y < H - 5;
      if (inBox) {
        const edge = x === 0 || x === W - 1 || y === 0 || y === H - 6;
        const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 6);
        if (corner) return null;
        return edge ? [24, 24, 32, 255] : [252, 252, 244, 255];
      }
      // tail
      const tx = Math.floor(W / 2) - 3, ty = y - (H - 5);
      if (x >= tx + ty && x <= tx + 5 - ty && ty < 5) return x === tx + ty || x === tx + 5 - ty || ty === 4 ? [24, 24, 32, 255] : [252, 252, 244, 255];
      return null;
    });
  });
}
// pixel clouds (several variants, 2-tone shading, outline-free like PMD sky)
export function cloud(v, scale = 1) {
  return memo(`cloud${v}:${scale}`, () => {
    rs = 97 + v * 131;
    const blobs = [], n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) blobs.push([rnd() * 46 * scale, rnd() * 10 * scale, (7 + rnd() * 9) * scale]);
    const W = Math.ceil(70 * scale), H = Math.ceil(36 * scale);
    return pixelSprite(W, H, (x, y) => {
      let inside = false, top = false;
      for (const [bx, by, r] of blobs) {
        const dx = x - bx - 12 * scale, dy = y - by - 12 * scale;
        if (dx * dx + dy * dy * 1.6 < r * r) { inside = true; if (dy < -r * 0.25) top = true; }
      }
      if (!inside) return null;
      return top ? [250, 252, 255, 235] : (x + y) % 2 ? [214, 224, 240, 225] : [226, 232, 246, 225];
    });
  });
}
export function confetti(k) {
  k = ((k % 12) + 12) % 12;
  const cols = ['#ff5050', '#ffd040', '#50a0ff', '#60d060', '#ff80d0', '#ffffff'];
  return memo('conf' + k, () => gridSprite([k % 2 ? 'aa' : 'a.', 'aa', k % 3 ? '.a' : 'aa'], { a: C(cols[k % cols.length]) }));
}
// impact speed lines (anime frames): radial pixel streaks, 3 frames, sized to the view
export function speedLines(w, h, frame) {
  return memo(`sl${w}x${h}:${frame}`, () => {
    rs = 4242 + frame * 77;
    const c = canvas(w, h), x = ctx2d(c), d = x.createImageData(w, h), cx = w / 2, cy = h / 2;
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r0 = Math.min(w, h) * (0.32 + rnd() * 0.18), r1 = Math.max(w, h) * 0.75;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let r = r0; r < r1; r += 1) {
        const px = Math.round(cx + ca * r), py = Math.round(cy + sa * r);
        if (px < 0 || py < 0 || px >= w || py >= h) break;
        const o = (py * w + px) * 4; const wht = (i % 3 !== 0);
        d.data[o] = wht ? 255 : 30; d.data[o + 1] = wht ? 255 : 20; d.data[o + 2] = wht ? 255 : 40; d.data[o + 3] = 200;
      }
    }
    x.putImageData(d, 0, 0); return c;
  });
}
// recall beam (red light column), stepped frames
export function recallBeam(h, k) {
  return memo(`rb${h}:${k}`, () => pixelSprite(9, h, (x, y) => {
    const core = Math.abs(x - 4) <= (k % 2 ? 1 : 2);
    if (Math.abs(x - 4) > 3) return null;
    if ((y + k * 3) % 7 === 0 && !core) return null;
    return core ? [255, 200, 200, 255] : [230, 40, 50, 210];
  }));
}
// Mega Evolution rainbow ring frame
export function rainbowRing(r) {
  r = Math.round(r);
  return memo(`rr${r}`, () => {
    const cols = [[255, 80, 80], [255, 170, 60], [255, 240, 80], [90, 220, 110], [80, 170, 255], [170, 110, 255]];
    const s = r * 2 + 3;
    return pixelSprite(s, s, (x, y) => {
      const dx = x - r - 1, dy = y - r - 1, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r + 0.5 || d < r - 3.5) return null;
      const a = Math.atan2(dy, dx), k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 6;
      const c = cols[k]; return [c[0], c[1], c[2], 255];
    });
  });
}
// tiny pixel HP bar over fighters (optional setting)
export function miniBar(w, frac, col) {
  const q = Math.round(frac * (w - 2));
  return memo(`mb${w}:${q}:${col}`, () => pixelSprite(w, 3, (x, y) => {
    if (y === 0 || y === 2 || x === 0 || x === w - 1) return [16, 16, 24, 255];
    return x - 1 < q ? C(col) : [60, 60, 70, 255];
  }));
}
// wind streak / gust line
export function streak(len, k) {
  return memo(`stk${len}:${k}`, () => pixelSprite(len, 2, (x, y) => (((x + k * 3) % 9) < 6 ? (y === 0 ? [255, 255, 255, 170] : [200, 220, 255, 110]) : null)));
}
export function rainDrop() { return memo('rain', () => gridSprite(['c', 'c', 'z'], P)); }
export function snowFlake(k) { return memo('snow' + k, () => gridSprite(k ? ['.z.', 'zwz', '.z.'] : ['w'], P)); }
export function leaf(k) { return memo('leaf' + k, () => gridSprite(k % 2 ? ['.oo', 'oro', 'Ro.'] : ['oo.', 'oRo', '.ro'], P)); }
export function ember(k) { return memo('ember' + k, () => gridSprite(k % 2 ? ['y'] : ['o', 'o'], P)); }
export function sparkle(k) { return memo('spk' + k, () => gridSprite(k % 2 ? ['.w.', 'wcw', '.w.'] : ['c'], P)); }
// bell (Bell Tower feature) shockwave ring frames reuse ring(); vent glow
export function ventGlow(k) {
  return memo('vent' + k, () => pixelSprite(20, 10, (x, y) => {
    const nx = (x - 10) / 10, ny = (y - 5) / 5, d = nx * nx + ny * ny;
    if (d > 1) return null;
    if (d > 0.55 && (x + y + k) % 2) return null;
    return d < 0.25 ? [255, 230, 120, 255] : [255, 110, 40, 220];
  }));
}
// space-time rift portal: concentric dashed rings in Dialga/Palkia colours
export function portal(k) {
  return memo('portal' + k, () => {
    const s = 25;
    return pixelSprite(s, s, (x, y) => {
      const dx = x - 12, dy = (y - 12) * 1.3, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 12) return null;
      const a = Math.atan2(dy, dx) + k * 0.4, band = Math.floor(d / 3);
      const spiral = Math.floor((a / (Math.PI * 2)) * 6 + d * 0.35 + k) % 2;
      if (d < 3) return [255, 255, 255, 255];
      return spiral ? (band % 2 ? [110, 140, 255, 230] : [250, 130, 210, 230]) : (d > 10 ? null : [40, 30, 90, 180]);
    });
  });
}
// updraft column (swirl of light pixels), wind lane chevrons, whirlpool spiral
export function updraft(k) {
  return memo('upd' + k, () => pixelSprite(52, 30, (x, y) => {
    const nx = (x - 26) / 26, ny = (y - 15) / 15, d = nx * nx + ny * ny;
    if (d > 1) return null;
    const a = Math.atan2(ny, nx) * 3 + d * 6 - k * 0.6;
    return Math.sin(a) > 0.75 ? [240, 250, 255, 170] : null;
  }));
}
export function chevron(k) { return memo('chev' + k, () => gridSprite(['w...', '.w..', '..w.', '.w..', 'w...'].map((r) => (k ? r.split('').reverse().join('') : r)), { w: [255, 255, 255, 160] })); }
export function whirl(r, k) {
  return memo(`whirl${r}:${k}`, () => pixelSprite(r * 2, r, (x, y) => {
    const nx = (x - r) / r, ny = (y - r / 2) / (r / 2), d = Math.sqrt(nx * nx + ny * ny);
    if (d > 1) return null;
    const a = Math.atan2(ny, nx) + d * 7 - k * 0.35;
    const s = Math.sin(a * 2);
    if (s > 0.85) return [200, 240, 255, Math.round(150 * (1 - d) + 60)];
    if (s < -0.9 && d < 0.5) return [10, 40, 70, 120];
    return null;
  }));
}
export function waveCrest(h, k) {
  return memo(`crest${h}:${k}`, () => pixelSprite(14, h, (x, y) => {
    const off = Math.round(Math.sin((y + k * 2) * 0.35) * 2);
    const xx = x - off;
    if (xx < 3 || xx > 12) return null;
    if (xx > 10) return [255, 255, 255, 230];
    if (xx > 7) return [160, 220, 255, 200];
    return (y + k) % 4 ? [60, 140, 230, 150] : [255, 255, 255, 160];
  }));
}
export function beaconRay(len, k) {
  return memo(`beacon${len}:${k}`, () => pixelSprite(len, 9, (x, y) => {
    const w = 1 + Math.floor(x / len * 4);
    if (Math.abs(y - 4) > w) return null;
    if ((x + k) % 5 === 0) return null;
    return Math.abs(y - 4) <= w / 2 ? [255, 236, 170, 120] : [255, 200, 110, 70];
  }));
}
export function dustPuff(k) { return memo('dust' + k, () => gridSprite(k ? ['.gg.', 'gGGg', '.gg.'] : ['g'], { g: C('#c8b090', 200), G: C('#a08a68', 200) })); }
export function chain(k) { return memo('chain' + k, () => gridSprite(['.ww.', 'w..w', '.ww.'], { w: k ? C('#d0d0e0') : C('#a0a0b0') })); }
export function wallTile(k) {
  return memo('icewall' + k, () => pixelSprite(12, 16, (x, y) => {
    if (x === 0 || x === 11 || y === 0) return [40, 90, 120, 255];
    const hi = (x + y + k) % 7 === 0 || (x === 2 && y < 12);
    return hi ? [240, 255, 255, 255] : y < 6 ? [170, 230, 250, 240] : [110, 190, 230, 240];
  }));
}
// Iron Defense: a curved steel shield standing on an arc around the fighter on the aimed side (16 directions),
// extruded upward in 2.5D with a lit rim, riveted face, shimmer and outline. Faces turned toward the camera are lit.
// Returns { img, ax, ay } where (ax, ay) is the fighter's foot point inside the image.
export function steelWall(d16, k, R = 18) {
  return memo(`steel${d16}:${k}:${R}`, () => {
    const a = d16 * Math.PI / 8, H = 20, cols = [];
    const n = 26;
    for (const rr of [R, R + 1, R + 2]) for (let i = 0; i <= n; i++) {
      const ph = a + (i / n - 0.5) * 2.1;
      cols.push({ x: Math.round(Math.cos(ph) * rr), y: Math.round(Math.sin(ph) * rr * 0.6), ny: Math.sin(ph), nx: Math.cos(ph), i, edge: i === 0 || i === n, outer: rr === R + 2 });
    }
    cols.sort((p, q) => p.y - q.y || (p.outer ? 1 : 0) - (q.outer ? 1 : 0));
    const xs = cols.map((p) => p.x), ys = cols.map((p) => p.y);
    const x0 = Math.min(...xs) - 2, y0 = Math.min(...ys) - H - 2, x1 = Math.max(...xs) + 3, y1 = Math.max(...ys) + 3;
    const W = x1 - x0, Ht = y1 - y0, buf = new Map();
    const ol = C('#1c2030'), hi = C('#f4f8ff'), lt = C('#c8d0e0'), md = C('#96a0b6'), dk = C('#5a6278'), rv = C('#eef2fc');
    for (const c of cols) {
      const lit = c.outer && c.ny > -0.2;              // outward face turned toward the camera
      for (let h = 0; h <= H; h++) {
        let col;
        if (h === H || h === 0 || c.edge) col = h === H - 1 ? hi : ol;
        else if (h === H - 1) col = hi;
        else if (lit) col = h < 3 ? dk : h > H - 4 ? lt : (c.nx > 0.55 ? lt : md);
        else col = h > H - 3 ? lt : dk;
        if (lit && !c.edge && h > 2 && h < H - 2 && (c.i + h + k * 2) % 11 === 0) col = hi;        // shimmer
        if (lit && !c.edge && c.i % 6 === 3 && (h === 5 || h === H - 6)) col = rv;                  // rivets
        buf.set((c.y - h - y0) * W + (c.x - x0), col);
      }
    }
    const img = pixelSprite(W, Ht, (x, y) => {
      const v = buf.get(y * W + x); if (v) return v;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (x + dx < 0 || x + dx >= W) continue; if (buf.get((y + dy) * W + (x + dx))) return ol; }
      return null;
    });
    return { img, ax: -x0, ay: -y0 };
  });
}
// Surf: a vertically tileable band of breaking wave (24 tall), front edge at the right; flip for leftward waves.
// Back: dithered spray fading out; body: deep blue with moving highlight streaks; front: light water and a foam lip.
export function surfBand(k, flip) {
  return memo(`surf${k}:${flip}`, () => pixelSprite(48, 24, (x0, y) => {
    const x = flip ? 47 - x0 : x0;
    const lip = 41 + Math.round(Math.sin((y + k * 3) * 0.52) * 2 + Math.sin((y * 2 + k * 5) * 0.21));
    if (x > lip + 2) return null;
    if (x > lip) return [255, 255, 255, 255];                                     // foam lip
    if (x > lip - 3) return (y + k) % 3 ? [200, 240, 255, 255] : [255, 255, 255, 255];
    if (x > lip - 8) return [110, 196, 250, 240];
    if (x < 12) {                                                                 // trailing spray, dithered
      if ((x + y + k) % 2 || x < (y * 7 + k * 3) % 9) return null;
      return [120, 190, 245, 150];
    }
    const streak = ((y * 5 + x * 2 - k * 4) % 23 + 23) % 23 < 2;
    if (streak) return [180, 228, 255, 230];
    return x < 18 ? [44, 118, 214, 190] : [36, 104, 206, 230];
  }));
}
// Falling meteor (Draco Meteor, Meteor Shower): rocky core with a hot rim and a tapering dragon-hued trail that
// points back up-left along the fall. 4 flicker frames. Anchor = core centre at (ax, ay).
export function meteor(k, hot = false) {
  return memo(`meteor${k}:${hot}`, () => {
    const W = 40, H = 56, cx = 29, cy = 44;
    const trail = hot ? ['#fff4c0', '#ffd040', '#ff8020', '#c03010'] : ['#fff4ff', '#f0b0ff', '#a060ff', '#4830c0'];
    const img = pixelSprite(W, H, (x, y) => {
      const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 4.8) return (dx + dy + k) % 3 === 0 ? C('#4a3428') : C(hot ? '#7a4a30' : '#6a4a6a');
      if (d <= 6.2) return C(hot ? '#ffe070' : '#ffb0f0');
      if (d <= 7.6 && (x + y + k) % 2) return C(hot ? '#ff9030' : '#c070ff', 200);
      // trail along (-0.45, -0.89): distance along the trail and across it
      const along = -(dx * -0.45 + dy * -0.89) * -1, across = Math.abs(dx * 0.89 - dy * 0.45);
      if (along < 5 || along > 48) return null;
      const width = 4.8 * (1 - (along - 5) / 45);
      if (across > width) return null;
      if ((x * 3 + y + k) % 5 === 0) return null;                        // sparkle gaps
      const band = Math.min(3, Math.floor((along - 5) / 11));
      return C(trail[band], band < 2 ? 255 : 200);
    });
    return { img, ax: cx, ay: cy };
  });
}
