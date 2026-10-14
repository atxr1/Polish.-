// Touch controls: floating left stick, PSP-layout face buttons (with move label + stamina cost), R (dodge or
// traversal), L (Ultimate, glows when charged), START, emote, Deoxys forme button and a Poké Ball switch strip.
import { face, shoulder, pill, SLOT_BUTTON } from './glyphs.js';
import { CONTENT } from '../game/content.js';
import { TYPE_COLORS } from '../core/util.js';

export class TouchControls {
  constructor(root, input) {
    this.root = root; this.input = input; this.el = null; this.stick = null; this.visible = false; this.state = {};
    this.emoteOpen = false; this.onPause = null; this.onEmote = null; this.onSwitch = null; this.lastSig = '';
  }
  // live update from the pause menu's Settings
  applySettings(st) {
    if (!this.el) return;
    this.el.classList.toggle('lefty', !!st.leftHanded);
    this.el.style.setProperty('--tscale', st.touchSize || 1);
    this.el.style.setProperty('--topa', st.touchOpacity || 0.85);
  }
  mount(opts = {}) {
    this.unmount();
    const el = document.createElement('div');
    el.className = 'touch' + (opts.leftHanded ? ' lefty' : '');
    el.style.setProperty('--tscale', opts.size || 1);
    el.style.setProperty('--topa', opts.opacity || 0.85);
    el.innerHTML = `
      <div class="t-stickzone"><div class="t-stick"><div class="t-nub"></div></div></div>
      <div class="t-pad">
        ${SLOT_BUTTON.map((b, i) => `<button class="t-face t-${b}" data-btn="${b}" data-slot="${i}">${face(b, 46)}<span class="t-lbl"></span><span class="t-cost"></span><span class="t-cd"></span></button>`).join('')}
        <button class="t-sh t-R" data-btn="R">${shoulder('R', 30)}<span class="t-lbl">Dodge</span></button>
        <button class="t-sh t-L" data-btn="L">${shoulder('L', 30)}<span class="t-lbl">Ultimate</span></button>
        <button class="t-forme" data-btn="forme" hidden><span>Forme</span></button>
      </div>
      <div class="t-top">
        <button class="t-start" data-act="pause" aria-label="Pause">${pill('START', 24)}</button>
        <button class="t-emote" data-act="emote" aria-label="Emote">${pill('SELECT', 24)}<span class="t-elbl">Emote</span></button>
      </div>
      <div class="t-switch" hidden></div>
      <div class="t-emotes" hidden></div>`;
    this.root.appendChild(el);
    this.el = el; this.visible = true;
    const zone = el.querySelector('.t-stickzone'), stick = el.querySelector('.t-stick'), nub = el.querySelector('.t-nub');
    let sid = null, ox = 0, oy = 0;
    const R = 52;
    zone.addEventListener('pointerdown', (e) => {
      if (sid !== null) return;
      sid = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      const r = zone.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
      stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; stick.classList.add('on'); nub.style.transform = 'translate(-50%,-50%)';
      this.input.source = 'touch';
      e.preventDefault();
    });
    const move = (e) => {
      if (e.pointerId !== sid) return;
      const r = zone.getBoundingClientRect();
      let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy; const l = Math.hypot(dx, dy);
      if (l > R) { // drag the base along so the stick never "sticks" at the edge
        ox += dx * (1 - R / l); oy += dy * (1 - R / l); stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; dx *= R / l; dy *= R / l;
      }
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const k = Math.min(1, Math.hypot(dx, dy) / R), dead = 0.12;
      const a = Math.atan2(dy, dx), m = k < dead ? 0 : (k - dead) / (1 - dead);
      this.input.touch.mx = Math.cos(a) * m; this.input.touch.my = Math.sin(a) * m;
      e.preventDefault();
    };
    const up = (e) => { if (e.pointerId !== sid) return; sid = null; stick.classList.remove('on'); this.input.touch.mx = 0; this.input.touch.my = 0; };
    zone.addEventListener('pointermove', move); zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    for (const b of el.querySelectorAll('[data-btn]')) {
      const name = b.dataset.btn;
      const down = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ } if (this.emoteOpen && b.dataset.slot !== undefined) { this.pickEmote(+b.dataset.slot); return; } this.input.touch.buttons.add(name); this.input.tap(name); b.classList.add('down'); this.input.source = 'touch'; };
      const rel = () => { this.input.touch.buttons.delete(name); b.classList.remove('down'); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('lostpointercapture', rel);
    }
    el.querySelector('[data-act="pause"]').addEventListener('pointerdown', (e) => { e.preventDefault(); this.onPause && this.onPause(); });
    el.querySelector('[data-act="emote"]').addEventListener('pointerdown', (e) => { e.preventDefault(); this.toggleEmotes(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  unmount() { clearTimeout(this.emoteTimer); this.emoteOpen = false; if (this.el) this.el.remove(); this.el = null; this.visible = false; this.input.touch.buttons.clear(); this.input.touch.mx = 0; this.input.touch.my = 0; }
  show(on) { if (this.el) this.el.style.display = on ? '' : 'none'; if (!on) { this.input.touch.buttons.clear(); this.input.touch.mx = 0; this.input.touch.my = 0; } }
  toggleEmotes(force) {
    this.emoteOpen = force !== undefined ? force : !this.emoteOpen;
    const box = this.el && this.el.querySelector('.t-emotes'); if (!box) return;
    box.hidden = !this.emoteOpen;
    clearTimeout(this.emoteTimer);
    // the wheel closes by itself so the face buttons go back to attacking
    if (this.emoteOpen) this.emoteTimer = setTimeout(() => { this.toggleEmotes(false); this.onEmoteClose && this.onEmoteClose(); }, 2500);
    if (this.emoteOpen) {
      const names = ['Happy', 'Angry', 'Determined', 'Joyous'];
      box.innerHTML = names.map((n, i) => `<button class="t-emo" data-i="${i}">${face(SLOT_BUTTON[i], 22)}<span>${n}</span></button>`).join('');
      for (const b of box.querySelectorAll('.t-emo')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pickEmote(+b.dataset.i); });
    }
  }
  pickEmote(i) { this.toggleEmotes(false); this.onEmote && this.onEmote(i); }
  // per-frame sync with the fighter: labels, costs, affordability, cooldown sweep, Ultimate glow, switch strip
  update(S, side, trainerMode) {
    if (!this.el) return;
    const f = S.activeOf(side); if (!f) return;
    const kit = f.kit(), sig = [];
    for (let i = 0; i < 4; i++) {
      const m = CONTENT.moves[kit[i]]; const cd = f.cds[i] > 0 ? f.cds[i] / Math.max(1, m.cd) : 0;
      sig.push(m.id, f.stamina >= m.cost ? 1 : 0, Math.ceil(cd * 8));
    }
    sig.push(f.ult >= 100 ? 1 : 0, Math.floor(f.ult / 10), f.form, f.dodgeCd > 0 ? 1 : 0, f.sp.trav || '', f.tv && f.tv.charges, S.sides[side].switchCd > 0 ? 1 : 0, S.sides[side].team.map((t) => (t.alive ? 1 : 0) + (t === f ? 2 : 0)).join(''));
    const s = sig.join('|');
    if (s === this.lastSig) return;
    this.lastSig = s;
    const faces = this.el.querySelectorAll('.t-face');
    faces.forEach((b, i) => {
      const m = CONTENT.moves[kit[i]];
      b.querySelector('.t-lbl').textContent = m.name;
      b.querySelector('.t-cost').textContent = m.cost;
      b.style.setProperty('--tc', TYPE_COLORS[m.type]);
      const cd = f.cds[i] > 0 ? f.cds[i] / Math.max(1, m.cd) : 0;
      b.classList.toggle('dim', f.stamina < m.cost || cd > 0);
      b.querySelector('.t-cd').style.setProperty('--cd', (cd * 360).toFixed(0) + 'deg');
      b.classList.toggle('cooling', cd > 0);
    });
    const L = this.el.querySelector('.t-L');
    L.classList.toggle('ready', f.ult >= 100);
    L.style.setProperty('--ult', Math.min(100, f.ult) + '%');
    const canMega = f.sp.mega && f.form !== 'mega' && !S.sides[side].megaUsed;
    L.querySelector('.t-lbl').textContent = canMega ? (f.sp.mega.primal ? 'Primal' : 'Mega') : 'Ultimate';
    const Rb = this.el.querySelector('.t-R');
    const T = f.T, repl = T && (typeof T.replacesDodge === 'function' ? T.replacesDodge(f) : T.replacesDodge);
    Rb.querySelector('.t-lbl').textContent = repl ? TRAV_LABEL[f.sp.trav] || 'Move' : 'Dodge';
    Rb.classList.toggle('dim', f.dodgeCd > 0);
    const forme = this.el.querySelector('.t-forme'); forme.hidden = !f.sp.formes;
    const strip = this.el.querySelector('.t-switch');
    if (trainerMode) {
      strip.hidden = false;
      const sd = S.sides[side];
      strip.innerHTML = sd.team.map((t, i) => `<button class="t-ball ${t === f ? 'active' : ''} ${t.alive ? '' : 'fainted'}" data-i="${i}" ${t.alive && t !== f && sd.switchCd <= 0 ? '' : 'disabled'}><i></i><span>${t.sp.name}</span></button>`).join('');
      for (const b of strip.querySelectorAll('.t-ball')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!b.disabled) this.onSwitch && this.onSwitch(+b.dataset.i); });
    } else strip.hidden = true;
  }
}
export const TRAV_LABEL = { dig: 'Dig', ninja: 'Substitute', quickzig: 'Quick Atk', pinball: 'Spin', shellslide: 'Shell Slide', jet: 'Jet (hold)', refraction: 'Refract', shadowdrift: 'Shadow', levitate: 'Teleport', ropes: 'Leap', dive: 'Dive', bellyslide: 'Slide', voltdash: 'Volt Dash', ingrain: 'Root', leap: 'Leap', deoxys: 'Teleport' };
