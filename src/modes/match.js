// Match: runs a Sim with inputs from a human and/or CPUs, records every input so the deterministic sim can
// be replayed exactly (Play of the Match re-simulates from the start with the recorded inputs).
import { Sim } from '../game/sim.js';
import { AI } from '../game/ai.js';
import { blankInput } from '../game/fighter.js';

const encode = (i) => [Math.round(i.mx * 127), Math.round(i.my * 127), i.slot,
  (i.held[0] ? 1 : 0) | (i.held[1] ? 2 : 0) | (i.held[2] ? 4 : 0) | (i.held[3] ? 8 : 0) | (i.dodge ? 16 : 0) | (i.dodgeHeld ? 32 : 0) | (i.ult ? 64 : 0) | (i.forme ? 128 : 0) | (i.decoy ? 256 : 0),
  i.emote, Math.round((i.aimErr || 0) * 1000), i.switchTo, i.choose];
const decode = (a) => ({ mx: a[0] / 127, my: a[1] / 127, slot: a[2], held: [!!(a[3] & 1), !!(a[3] & 2), !!(a[3] & 4), !!(a[3] & 8)], dodge: !!(a[3] & 16), dodgeHeld: !!(a[3] & 32), ult: !!(a[3] & 64), forme: !!(a[3] & 128), decoy: !!(a[3] & 256), emote: a[4], aimErr: a[5] / 1000, switchTo: a[6], choose: a[7] });
const same = (a, b) => a && b && a.every((v, k) => v === b[k]);

export class Match {
  constructor(opts) {
    this.opts = opts;
    this.sim = new Sim(opts);
    this.sim.begin();
    this.ais = opts.sides.map((sd, i) => (sd.control === 'cpu' ? new AI(i, sd.level || 'normal', (opts.seed * 7919 + i * 104729) >>> 0) : null));
    this.log = { opts: JSON.parse(JSON.stringify(opts)), frames: [], startAt: -1 };
    this.prev = [null, null];
    this.emotes = [];
  }
  startFight() { this.log.startAt = this.sim.tick; this.sim.events.length = 0; this.sim.startFight(); this.pendingStart = this.sim.events.slice(); }
  // humanInputs: [input|null, input|null] for each side (null -> CPU or idle)
  step(humanInputs = []) {
    const S = this.sim;
    S.events.length = 0;
    const rec = [];
    for (let side = 0; side < 2; side++) {
      let inp = humanInputs[side] || null;
      if (!inp) inp = this.ais[side] ? this.ais[side].input(S) : blankInput();
      if (this.ais[side] && !humanInputs[side]) { const sw = this.ais[side].takeSwitch(); if (sw !== undefined) inp.switchTo = sw; }
      // the sim sees exactly what the log stores (stick axes in 1/127 steps, aim error in 1/1000), so the replay
      // re-simulates bit for bit; feeding it the raw floats made Play of the Match diverge
      const enc = encode(inp);
      this.apply(side, decode(enc));
      rec.push(same(enc, this.prev[side]) ? null : enc);
      this.prev[side] = enc;
    }
    this.log.frames.push(rec[0] || rec[1] ? rec : 0);
    S.step();
    return S.events;
  }
  apply(side, inp) { applyInput(this.sim, side, inp); }
}
// one input application for the live match and the replay, so both feed the sim identically
// (the active fighter is looked up after a switch or replacement, so the newcomer gets this frame's input)
function applyInput(S, side, inp) {
  if (inp.switchTo >= 0) S.requestSwitch(side, inp.switchTo);
  if (inp.choose >= 0) S.chooseReplacement(side, inp.choose);
  const f = S.activeOf(side);
  if (f) f.input = inp;
  if (inp.emote >= 0 && f && f.onField) S.ev({ e: 'emote', f, n: inp.emote });
}

// Re-simulate a finished match from its log. Returns a stepper positioned at `fromTick`.
export class Replay {
  constructor(log) {
    this.log = log;
    this.sim = new Sim(log.opts);
    this.sim.begin();
    this.i = 0; this.cur = [blankInput(), blankInput()];
  }
  stepOne() {
    const S = this.sim;
    S.events.length = 0;
    if (this.log.startAt === S.tick) S.startFight();
    const fr = this.log.frames[this.i++];
    for (let side = 0; side < 2; side++) {
      const enc = fr && fr[side];
      if (enc) this.cur[side] = decode(enc);
      applyInput(S, side, this.cur[side]);
    }
    S.step();
    return S.events;
  }
  fastForward(tick) { while (this.sim.tick < tick && this.i < this.log.frames.length) this.stepOne(); }
  get done() { return this.i >= this.log.frames.length; }
}
