// App shell: canvas + integer-scale pixel view, main loop, DOM screens/overlays with spatial focus navigation
// (touch, keyboard and gamepad), sprite previews, audio unlock, visibility handling and the service worker.
import { registerContent } from './content/index.js';
import { CONTENT } from './game/content.js';
import { Gfx, loadJSON } from './render/gfx.js';
import { Audio } from './audio/audio.js';
import { Input } from './platform/input.js';
import { Store } from './saves/store.js';
import { Screens } from './ui/screens.js';
import { installLab } from './dev/lab.js';

import { VERSION } from './version.js';

class App {
  constructor() {
    registerContent();
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.layer = document.getElementById('layer');
    this.screensEl = document.getElementById('screens');
    this.overlaysEl = document.getElementById('overlays');
    this.gfx = new Gfx(); this.audio = new Audio(); this.input = new Input(); this.store = new Store();
    this.settings = this.store.read('settings');
    this.scene = null; this.view = {}; this.fps = 60; this.last = 0; this.spriteCanvases = new Set(); this.focusRoot = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    // turning the phone to portrait shows the rotate prompt — pause the battle behind it
    const portrait = window.matchMedia && window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    if (portrait) { const onPortrait = () => { if (portrait.matches && this.scene && this.scene.pause && (this.scene.state === 'fight' || this.scene.state === 'sendout')) this.scene.pause(); }; portrait.addEventListener ? portrait.addEventListener('change', onPortrait) : portrait.addListener(onPortrait); }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.audio.suspend(); if (this.scene && this.scene.pause && (this.scene.state === 'fight' || this.scene.state === 'sendout')) this.scene.pause(); }
      else this.audio.resume();
    });
    // first tap/key unlocks audio (iOS: create + resume inside the gesture)
    const unlock = () => { this.audio.unlock(); if (this.audio.wantMusic) { const m = this.audio.wantMusic; this.audio.wantMusic = null; this.audio.playMusic(m); } };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    // block pinch / double-tap zoom and long-press menus
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    // tappable button prompts
    document.addEventListener('click', (e) => {
      const p = e.target.closest && e.target.closest('.prompt-item.tap'); if (!p) return;
      if (p.dataset.g === 'circle' && this.backFn) { this.audio.play('menu_Cancel'); this.backFn(); }
      else if (p.dataset.g === 'cross' && this.focused && this.focusRoot && this.focusRoot.contains(this.focused)) { this.audio.play('menu_Confirm'); this.focused.click(); }
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    this.input.on((type, v) => this.onInput(type, v));
    this.screens = new Screens(this);
  }
  async start() {
    await Promise.all([this.gfx.init(), this.audio.init(), document.fonts ? Promise.all(['italic 700 16px "Barlow Condensed"', 'italic 800 16px "Barlow Condensed"', '700 12px "Barlow Condensed"', '600 14px "Barlow Semi Condensed"'].map((f) => document.fonts.load(f).catch(() => null))) : null]);
    this.credits = await loadJSON('./assets/fighters/_credits.json').catch(() => ({}));
    this.applySettings();
    // test hooks (URL only): ?test exposes the app, ?autoplay lets the CPU play your side, ?speed=N runs the sim N× faster
    const qp = new URLSearchParams(location.search);
    this.test = { autoplay: qp.has('autoplay'), speed: Math.max(1, Math.min(64, +qp.get('speed') || 1)) };
    if (qp.has('test')) window.__app = this;
    if (qp.has('lab')) { installLab(this); this.audio.unlock = () => {}; } else this.screens.title();
    requestAnimationFrame((t) => this.loop(t));
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  applySettings() { this.audio.setVolumes(this.settings.music, this.settings.sfx); this.audio.lowHpBeep = this.settings.lowHpBeep; document.documentElement.classList.toggle('reduced', !!this.settings.reducedMotion); }
  saveSettings() { this.store.write('settings', this.settings); this.applySettings(); }
  // ---------------------------------------------------------------- view: integer world scale
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const k = Math.max(2, Math.floor(ch / 220));
    this.view = { ctx: this.ctx, cw, ch, dpr, k, bw: Math.ceil(cw / k), bh: Math.ceil(ch / k) };
  }
  insets() {
    if (!this._probe) { this._probe = document.createElement('div'); this._probe.style.cssText = 'position:fixed;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none'; document.body.appendChild(this._probe); }
    const cs = getComputedStyle(this._probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  // ---------------------------------------------------------------- main loop
  loop(t) {
    const dt = this.last ? t - this.last : 16.7; this.last = t;
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, dt)) * 0.05;
    try {
      if (this.scene && !this.scene.done) this.scene.frame(dt);
      else { this.input.poll(); this.idleDraw(); }
      this.animateSprites(t);
    } catch (e) { this.crash(e); }
    requestAnimationFrame((tt) => this.loop(tt));
  }
  idleDraw() { const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#16122e'; c.fillRect(0, 0, this.view.cw, this.view.ch); }
  crash(e) {
    console.error(e);
    if (this._crashed) return; this._crashed = true;
    this.toast('Something went wrong: ' + (e && e.message) + '. Returning to the menu.');
    try { if (this.scene) this.scene.destroy(); } catch (e2) { /* ignore */ }
    this.scene = null;
    setTimeout(() => { this._crashed = false; this.screens.main(); }, 1200);
  }
  // ---------------------------------------------------------------- DOM helpers
  setScreen(html, opts = {}) {
    // inside the pause menu, sub-screens (Settings, Controls) render into the pause holder and keep the overlays
    const sub = this.subHolder && this.subHolder.isConnected ? this.subHolder : null;
    if (!sub) this.clearOverlays();
    this.screensEl.innerHTML = html;
    const el = this.screensEl.firstElementChild;
    if (sub) { sub.innerHTML = ''; sub.appendChild(el); this.screensEl.innerHTML = ''; }
    this.spriteCanvases.clear();
    this.paintSprites(el);
    this.focusRoot = el; this.backFn = opts.back || null;
    const first = opts.focus ? el.querySelector(opts.focus) : el.querySelector('.nav');
    this.focus(first);
    return el;
  }
  clearScreen() { this.screensEl.innerHTML = ''; this.focusRoot = null; this.spriteCanvases.clear(); }
  overlay(html, cls) { const d = document.createElement('div'); d.className = cls || ''; d.innerHTML = html; this.overlaysEl.appendChild(d); return d; }
  clearOverlays() { this.overlaysEl.innerHTML = ''; this.menuEl = null; }
  toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
  menu(kind, opts) { this.menuEl = this.screens.menu(kind, opts); this.prevFocusRoot = this.focusRoot; this.focusRoot = this.menuEl; this.focus(this.menuEl.querySelector('.nav')); this.backFn = opts.onResume || null; }
  closeMenu() { if (this.menuEl) this.menuEl.remove(); this.menuEl = null; this.focusRoot = this.prevFocusRoot || null; }
  // ---------------------------------------------------------------- focus navigation (pad / keyboard)
  focus(el) {
    if (!el) return;
    if (this.focused) this.focused.classList.remove('focus');
    this.focused = el; el.classList.add('focus');
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (el.dataset.hover) el.dispatchEvent(new Event('focusnav'));
  }
  onInput(type, v) {
    if (!this.focusRoot || (this.scene && !this.scene.done && !this.menuEl && this.scene.state !== 'results')) return;
    if (type === 'nav') this.navMove(v);
    if (type === 'press') {
      // a button labelled with this glyph (START "Fight now", □ "Change setup", △ "Abandon"/"Quit") wins first
      const keyed = v !== 'cross' && v !== 'circle' && this.focusRoot.querySelector && this.focusRoot.querySelector('[data-key="' + v + '"]');
      if (keyed) { this.audio.play('menu_Confirm'); keyed.click(); }
      else if (v === 'cross' || v === 'start') { if (this.focused && this.focusRoot.contains(this.focused)) { this.audio.play('menu_Confirm'); this.focused.click(); } }
      else if (v === 'circle' || v === 'esc') { if (this.backFn) { this.audio.play('menu_Cancel'); this.backFn(); } }
    }
  }
  navMove(dir) {
    const items = [...this.focusRoot.querySelectorAll('.nav')].filter((e) => e.offsetParent !== null && !e.disabled);
    if (!items.length) return;
    const cur = this.focused && items.includes(this.focused) ? this.focused : null;
    if (!cur) { this.focus(items[0]); return; }
    if (cur.tagName === 'INPUT' && cur.type === 'range' && (dir === 'left' || dir === 'right')) { cur.value = +cur.value + (dir === 'left' ? -0.1 : 0.1) * (cur.max - cur.min); cur.dispatchEvent(new Event('input')); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const e of items) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      const along = dx * v[0] + dy * v[1]; if (along <= 2) continue;
      const across = Math.abs(dx * v[1] - dy * v[0]);
      const s = along + across * 2.2;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) { this.audio.play('menu_Select', { vol: 0.5 }); this.focus(best); }
  }
  // ---------------------------------------------------------------- animated sprite previews in menus
  paintSprites(root) {
    if (!root) return;
    for (const c of root.querySelectorAll('canvas[data-sprite]')) {
      const id = c.dataset.sprite;
      this.gfx.loadFighter(id).then(() => { this.spriteCanvases.add(c); }).catch(() => {});
    }
  }
  animateSprites(t) {
    if (!this.spriteCanvases.size) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of this.spriteCanvases) {
      if (!c.isConnected) { this.spriteCanvases.delete(c); continue; }
      const meta = CONTENT.sprites[c.dataset.sprite], img = this.gfx.atlas.get(c.dataset.sprite);
      if (!meta || !img) continue;
      const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
      if (!W || !H) continue;
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, W, H);
      const an = meta.anims[c.dataset.anim || 'Idle'] || meta.anims.Idle || meta.anims.Walk;
      const tick = Math.floor(t / 16.67) % an.total;
      let k = 0; while (k + 1 < an.n && an.starts[k + 1] <= tick) k++;
      const dir = an.dirs === 1 ? 0 : +(c.dataset.dir || 0);
      const fr = meta.frames[an.f[k][dir] >= 0 ? an.f[k][dir] : an.f[k][0]];
      // integer scale that fits the canvas
      let maxH = 0, maxW = 0; for (const row of an.f) { const f2 = meta.frames[row[dir] >= 0 ? row[dir] : row[0]]; maxH = Math.max(maxH, f2[3]); maxW = Math.max(maxW, f2[2]); }
      const s = Math.max(1, Math.floor(Math.min(W / (maxW + 4), H / (maxH + 4))));
      const ox = Math.round(W / 2 - fr[4] * s), oy = Math.round(H - 4 * dpr - fr[5] * s + (fr[3] - fr[5]) * s * 0);
      x.drawImage(img, fr[0], fr[1], fr[2], fr[3], ox, Math.min(oy, H - fr[3] * s), fr[2] * s, fr[3] * s);
    }
  }
}

const app = new App();
window.__app = app;
app.start().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<div class="toast">Couldn't start: ${e.message}</div>`); });
export { app };
