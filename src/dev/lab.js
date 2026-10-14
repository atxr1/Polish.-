// Developer lab (enabled with ?lab=1): drives battles step by step for automated checks — contact sheets of
// every move, map screenshots, traversal / serpent / Mega frame sequences, determinism and soak tests.
import { BattleScene } from '../modes/battle.js';
import { blankInput } from '../game/fighter.js';
import { SLOT_BUTTON } from '../ui/glyphs.js';
import { CONTENT } from '../game/content.js';

export function installLab(app) {
  const lab = {
    scene: null,
    async start(setup, o = {}) {
      if (lab.scene) lab.scene.destroy();
      app.clearScreen();
      setup.seed = setup.seed || 1;
      const sc = new BattleScene(app, setup, { finished: () => {}, quit: () => {}, restart: () => {} });
      await sc.load();
      sc.begin();
      sc.skipIntro && sc.skipIntro();
      document.querySelectorAll('.vs-layer').forEach((e) => e.remove());
      sc.manual = !!o.manual;
      lab.scene = sc;
      // manual: the lab steps the battle itself; a stub scene keeps the app loop from clearing the canvas
      if (o.manual) app.scene = { frame: () => {}, destroy: () => {}, done: false, state: 'lab' }; else app.scene = sc;
      // let the send-out finish
      lab.step(o.settle ?? 50);
      if (o.place) lab.place(o.place);
      return true;
    },
    place(p) {
      const S = lab.scene.S;
      for (let s = 0; s < 2; s++) { const f = S.activeOf(s); if (p[s]) { f.x = p[s].x; f.y = p[s].y; f.vx = f.vy = 0; if (f.serpent) f.serpent.reset(); } }
      for (let s = 0; s < 2; s++) { const f = S.activeOf(s), o = f.foe; f.faceAngle(Math.atan2(o.y - f.y, o.x - f.x)); }
    },
    // step n ticks; inputs: {side: partial input} applied each tick (or a function(tick) -> {side: input})
    step(n = 1, inputs) {
      const sc = lab.scene, S = sc.S;
      for (let i = 0; i < n; i++) {
        const hi = [null, null];
        const spec = typeof inputs === 'function' ? inputs(i) : inputs;
        for (let s = 0; s < 2; s++) {
          if (spec && spec[s]) { const b = blankInput(); Object.assign(b, spec[s]); if (spec[s].held) b.held = spec[s].held; hi[s] = b; }
          else if (sc.setup.sides[s].control === 'dummy') hi[s] = blankInput();
        }
        const evs = sc.match.step(hi);
        sc.consume(evs);
        sc.fx.update(S);
      }
      sc.render();
      return { tick: S.tick, phase: S.phase, hp: S.fighters().map((f) => f.hp) };
    },
    press(side, slot) { const inp = {}; inp[side] = { slot }; return lab.step(1, inp); },
    state() {
      const S = lab.scene.S;
      return { tick: S.tick, phase: S.phase, fighters: S.fighters().map((f) => ({ id: f.id, x: f.x, y: f.y, z: f.z, hp: f.hp, maxHp: f.maxHp, state: f.state, anim: f.anim.name, stamina: f.stamina, ult: f.ult, form: f.form, move: f.move && f.move.def.id, coil: f.serpent ? f.serpent.coil : null, segs: f.serpent ? f.serpent.segs.map((g) => [Math.round(g.x), Math.round(g.y)]) : null })), projs: S.projs.length, zones: S.zones.length, missing: [...app.gfx.missing] };
    },
    // crop of the world buffer (1 texel per world unit) around a world point
    capture(cx, cy, w, h) {
      const W = lab.scene.world, buf = W.buf;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(buf, Math.round(cx - W.cx - w / 2), Math.round(cy - W.cy - h / 2), w, h, 0, 0, w, h);
      return c.toDataURL('image/png');
    },
    view() { const W = lab.scene.world; return { cx: W.cx, cy: W.cy, w: W.w, h: W.h }; },
    setUlt(side, v) { lab.scene.S.activeOf(side).ult = v; },
    setStamina(side, v) { lab.scene.S.activeOf(side).stamina = v; },
    set(side, k, v) { lab.scene.S.activeOf(side)[k] = v; },
    hp(side, frac) { const f = lab.scene.S.activeOf(side); f.hp = Math.max(1, Math.round(f.maxHp * frac)); },
    stop() { if (lab.scene) lab.scene.destroy(); lab.scene = null; app.scene = null; },
    slots: SLOT_BUTTON,
  };
  window.__lab = lab;
  window.__labRoster = () => CONTENT.roster;
  const rangeOf = (id) => { const m = CONTENT.moves[id], r = (m.ai && m.ai.r) || [0, 60], k = m.ai && m.ai.kind; return k === 'heal' || k === 'buff' ? 26 : Math.max(14, Math.min(150, (r[0] + r[1]) / 2)); };
  window.__labInfo = () => { const f = lab.scene.S.activeOf(0), sp = f.sp; return { name: sp.name, moves: sp.kit.map((m) => CONTENT.moves[m].name), ult: CONTENT.moves[sp.ult].name, mega: sp.mega ? sp.mega.name : null, megaUlt: sp.mega ? CONTENT.moves[sp.mega.ult].name : null, ranges: sp.kit.map(rangeOf), ultRange: rangeOf(sp.ult), megaRange: sp.mega ? rangeOf(sp.mega.ult) : 0 }; };
  return lab;
}
