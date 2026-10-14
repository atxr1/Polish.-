// Content registry shared by the sim, AI, renderer and UI.
// Sprite metas (animation timings, frames) are loaded at runtime (browser: fetch, harness: fs).
import { DEX, TYPECHART } from '../data/dex.js';

export const CONTENT = {
  species: {},   // id -> species def (see species.js)
  moves: {},     // id -> move def (see moves.js)
  trainers: {},  // id -> trainer def
  maps: {},      // id -> map def
  sprites: {},   // spriteId -> sprite meta {frames, anims, shadow, portraits}
  fx: {},        // particle name -> {file, fw, fh, frames, dirs, flip}
};

// --- type effectiveness (Showdown damageTaken codes: 0 neutral, 1 weak, 2 resist, 3 immune)
export function rawEffect(atkType, defTypes) {
  let m = 1;
  for (const d of defTypes) {
    const c = TYPECHART[d] && TYPECHART[d][atkType];
    if (c === 1) m *= 2; else if (c === 2) m *= 0.5; else if (c === 3) m *= 0;
  }
  return m;
}
// compressed for real time (brief section 7)
export function arenaEffect(raw) {
  if (raw === 0) return 0;
  if (raw >= 4) return 1.75;
  if (raw >= 2) return 1.5;
  if (raw <= 0.25) return 0.5;
  if (raw <= 0.5) return 0.7;
  return 1;
}

export function dexEntry(id) { return DEX[id]; }

// --- sprite animation helpers
const ANIM_FALLBACK = {
  Strike: ['Attack'], QuickStrike: ['Strike', 'Attack'], Punch: ['Strike', 'Attack'], Jab: ['Strike', 'Attack'],
  Kick: ['Strike', 'Attack'], Slam: ['Attack'], MultiStrike: ['Double', 'Attack'], MultiScratch: ['Double', 'Attack'],
  SpAttack: ['Shoot', 'Charge'], Shoot: ['SpAttack', 'Charge', 'Attack'], Emit: ['Shoot', 'Charge'],
  Pose: ['Rotate', 'Hop', 'Idle'], Faint: [], Swing: ['Attack'], Double: ['Attack'], Hop: ['Idle'],
  Rotate: ['Hop', 'Idle'], Charge: ['Idle'], RearUp: ['Charge', 'Hop'], Withdraw: ['Charge'], Float: ['Idle'],
  Hover: ['Idle'], Twirl: ['Rotate'], Dance: ['Rotate'], Shock: ['Hurt'], Sleep: ['Idle'], Walk: ['Idle'], Idle: ['Walk'],
  Hurt: ['Idle'], Tumble: ['Hurt'], Sink: ['Sleep'], LeapForth: ['Hop'], HitGround: ['Attack'], Rumble: ['Charge'],
  Shake: ['Charge'], Cringe: ['Hurt'], Pain: ['Hurt'], DeepBreath: ['Charge'], Ricochet: ['Rotate'], Appeal: ['Pose', 'Rotate'],
};
export function resolveAnim(meta, name) {
  if (!meta) return null;
  if (meta.anims[name]) return name;
  for (const alt of ANIM_FALLBACK[name] || []) if (meta.anims[alt]) return alt;
  return meta.anims.Idle ? 'Idle' : Object.keys(meta.anims)[0];
}
export function prepSprite(meta) {
  for (const a of Object.values(meta.anims)) {
    a.starts = []; let t = 0;
    for (const d of a.dur) { a.starts.push(t); t += d; }
    a.total = t; a.n = a.dur.length;
    a.hitT = a.hit !== undefined ? a.starts[Math.min(a.hit, a.n - 1)] : Math.floor(t * 0.45);
  }
  return meta;
}
export function frameIndexAt(a, t, loop) {
  if (loop) t = ((t % a.total) + a.total) % a.total;
  else if (t >= a.total) return a.n - 1;
  let k = 0;
  while (k + 1 < a.n && a.starts[k + 1] <= t) k++;
  return k;
}
