// Unified input: touch (via ui/touch.js), keyboard and Gamepad API all produce the same logical buttons.
// Logical buttons: cross circle square triangle L R start select up down left right, plus an analog stick.
const KEYMAP = {
  KeyI: 'triangle', KeyJ: 'square', KeyK: 'cross', KeyL: 'circle',
  Space: 'R', ShiftLeft: 'R', ShiftRight: 'R', KeyQ: 'L', KeyE: 'select', Escape: 'esc', Enter: 'start', KeyP: 'start',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyF: 'forme',
  Digit1: 'sw0', Digit2: 'sw1', Digit3: 'sw2', Backspace: 'circle',
};
const MOVEKEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
const BTN = ['cross', 'circle', 'square', 'triangle', 'L', 'R', 'start', 'select', 'up', 'down', 'left', 'right', 'forme', 'sw0', 'sw1', 'sw2', 'esc'];

export class Input {
  constructor() {
    this.keys = new Set(); this.touch = { mx: 0, my: 0, buttons: new Set() }; this.pad = { mx: 0, my: 0, buttons: new Set() };
    this.held = new Set(); this.prev = new Set(); this.pressed = new Set(); this.tapped = new Set();
    this.mx = 0; this.my = 0; this.source = 'touch'; this.listeners = [];
    this.repeatT = {}; this.padIndex = -1;
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/.test(e.target.type)))) return;
        if (KEYMAP[e.code] || MOVEKEYS[e.code]) e.preventDefault();
        if (!e.repeat && KEYMAP[e.code]) this.tapped.add(KEYMAP[e.code]);
        this.keys.add(e.code); this.source = 'keyboard';
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => this.keys.clear());
      window.addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; this.source = 'pad'; this.emit('pad', true); });
      window.addEventListener('gamepaddisconnected', () => { this.padIndex = -1; this.emit('pad', false); });
    }
  }
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((x) => x !== fn); }; }
  emit(type, v) { for (const l of this.listeners) l(type, v); }
  pollPad() {
    this.pad.buttons.clear(); this.pad.mx = 0; this.pad.my = 0;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads(); let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const map = [[0, 'cross'], [1, 'circle'], [2, 'square'], [3, 'triangle'], [4, 'L'], [6, 'L'], [5, 'R'], [7, 'R'], [8, 'select'], [9, 'start'], [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']];
    for (const [i, n] of map) if (b(i)) this.pad.buttons.add(n);
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    const l = Math.hypot(x, y);
    if (l < 0.18) { x = 0; y = 0; } else { const k = Math.min(1, (l - 0.18) / 0.82) / l; x *= k; y *= k; }
    this.pad.mx = x; this.pad.my = y;
    if (this.pad.buttons.size || l > 0.3) this.source = 'pad';
  }
  // call once per rendered frame
  poll() {
    this.pollPad();
    this.prev = this.held; this.held = new Set();
    for (const k of this.keys) { const n = KEYMAP[k]; if (n) this.held.add(n); }
    for (const n of this.touch.buttons) this.held.add(n);
    for (const n of this.pad.buttons) this.held.add(n);
    // a press counts even if it was released before this poll (very quick taps)
    this.pressed = new Set([...this.held].filter((n) => !this.prev.has(n)));
    for (const n of this.tapped) this.pressed.add(n);
    this.tapped.clear();
    let kx = 0, ky = 0;
    for (const k of this.keys) { const v = MOVEKEYS[k]; if (v) { kx += v[0]; ky += v[1]; } }
    const kl = Math.hypot(kx, ky); if (kl > 0) { kx /= kl; ky /= kl; }
    let mx = kx || this.pad.mx || this.touch.mx, my = ky || this.pad.my || this.touch.my;
    this.mx = mx; this.my = my;
    // menu navigation events (with key repeat for directions and stick)
    const nav = (dir, active) => {
      if (!active) { this.repeatT[dir] = 0; return; }
      const t = (this.repeatT[dir] || 0) + 1; this.repeatT[dir] = t;
      if (t === 1 || (t > 18 && t % 6 === 0)) this.emit('nav', dir);
    };
    const kArrow = (d) => this.held.has(d);
    nav('up', kArrow('up') || this.keys.has('KeyW') || this.pad.my < -0.6);
    nav('down', kArrow('down') || this.keys.has('KeyS') || this.pad.my > 0.6);
    nav('left', kArrow('left') || this.keys.has('KeyA') || this.pad.mx < -0.6);
    nav('right', kArrow('right') || this.keys.has('KeyD') || this.pad.mx > 0.6);
    for (const n of this.pressed) this.emit('press', n);
  }
  tap(n) { this.tapped.add(n); }
  isDown(n) { return this.held.has(n); }
  wasPressed(n) { return this.pressed.has(n); }
}
export { BTN };
