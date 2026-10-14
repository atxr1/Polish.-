// WebAudio mixer: PMD battle sounds, PSP effects, PMD music with seamless loop points, per-map ambience,
// music ducking, Double Stamina speed-up, low-HP beep. Context is created and resumed inside the first tap.
import { buildSamples, SAMPLE_RATE } from './zzfx.js';

const BASE = './assets/audio/';
const ZZ = {
  slam: [1.6, 0, 70, 0.01, 0.12, 0.45, 4, 0.6, -2, 0, 0, 0, 0, 1.2, 0, 0.2, 0, 0.6, 0.04],
  whoosh: [1, 0, 300, 0.02, 0.05, 0.3, 4, 0.1, -10, 0, 0, 0, 0, 2.4],
  beep: [0.5, 0, 880, 0, 0.04, 0.05, 1],
  tick: [0.6, 0, 1200, 0, 0.02, 0.04, 1],
  go: [1, 0, 523, 0.02, 0.18, 0.3, 1, 1, 0, 0, 260, 0.08],
  coin: [0.6, 0, 1500, 0, 0.03, 0.12, 1, 1, 0, 0, 600, 0.04],
  cheerSwell: [0.5, 0, 400, 0.2, 0.6, 0.6, 4, 0.3, 0, 0, 0, 0, 0, 3],
};

export class Audio {
  constructor() {
    this.ctx = null; this.ready = false; this.manifest = null;
    this.buffers = new Map(); this.loading = new Map();
    this.vol = { music: 0.7, sfx: 0.85 }; this.lowHpBeep = true;
    this.music = null; this.musicName = null; this.rate = 1;
    this.amb = null; this.ambName = null; this.playing = new Map();
    this.duckUntil = 0; this.muted = false;
  }
  async init() { this.manifest = await (await fetch(BASE + 'manifest.json')).json(); }
  // must be called from a user gesture (tap / key / button)
  unlock() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* not supported */ }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
      this.duckGain = this.ctx.createGain(); this.duckGain.connect(this.musicGain);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = 0.35; this.ambGain.connect(this.sfxGain);
      this.applyVolumes();
      // a silent buffer started inside the gesture fully unlocks iOS
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      for (const [k, p] of Object.entries(ZZ)) this.buffers.set('zz_' + k, this.makeZz(p));
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.ready = true;
  }
  makeZz(p) { const s = buildSamples(...p); const b = this.ctx.createBuffer(1, s.length, SAMPLE_RATE); b.copyToChannel(s, 0); return b; }
  applyVolumes() { if (!this.ctx) return; this.musicGain.gain.value = this.muted ? 0 : this.vol.music * 0.8; this.sfxGain.gain.value = this.muted ? 0 : this.vol.sfx; }
  setVolumes(music, sfx) { this.vol.music = music; this.vol.sfx = sfx; this.applyVolumes(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  async load(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    if (this.loading.has(url)) return this.loading.get(url);
    const p = (async () => {
      try {
        const r = await fetch(url); const ab = await r.arrayBuffer();
        if (!this.ctx) { this.loading.delete(url); return null; }
        const buf = await this.ctx.decodeAudioData(ab);
        this.buffers.set(url, buf); return buf;
      } catch (e) { return null; } finally { this.loading.delete(url); }
    })();
    this.loading.set(url, p);
    return p;
  }
  sfxUrl(id) { const f = this.manifest && this.manifest.sfx[id]; return f ? BASE + 'sfx/' + f : null; }
  async preload(ids) { if (!this.ctx) return; await Promise.all(ids.map((id) => { const u = this.sfxUrl(id); return u ? this.load(u) : null; })); }
  play(id, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const buf = id.startsWith('zz_') ? this.buffers.get(id) : this.buffers.get(this.sfxUrl(id));
    if (!buf) { const u = this.sfxUrl(id); if (u) this.load(u); return; }
    const n = this.playing.get(id) || 0; if (n >= 3) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = this.ctx.createGain(); g.gain.value = o.vol ?? 1;
    let node = g;
    if (o.pan !== undefined && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
    src.connect(g); node.connect(this.sfxGain);
    src.start();
    this.playing.set(id, n + 1);
    src.onended = () => this.playing.set(id, Math.max(0, (this.playing.get(id) || 1) - 1));
  }
  // ---------------------------------------------------------------- music
  async playMusic(name, o = {}) {
    if (!this.ctx || !this.manifest) { this.wantMusic = name; return; }
    if (this.musicName === name && this.music) return;
    const def = this.manifest.music[name]; if (!def) return;
    this.musicName = name;
    const buf = await this.load(BASE + 'music/' + def.file);
    if (!buf || this.musicName !== name) return;
    this.stopMusic(0.4);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    src.loop = o.loop !== false;
    src.loopStart = def.loopStart; src.loopEnd = Math.min(def.loopEnd, buf.duration);
    src.playbackRate.value = this.rate;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.duckGain);
    src.connect(g); src.start();
    g.gain.setTargetAtTime(1, this.ctx.currentTime, 0.15);
    this.music = { src, g, name };
  }
  stopMusic(fade = 0.5) {
    if (!this.music || !this.ctx) { this.music = null; return; }
    const m = this.music; this.music = null;
    m.g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    setTimeout(() => { try { m.src.stop(); } catch (e) { /* already stopped */ } }, fade * 1000 + 100);
  }
  musicOff() { this.musicName = null; this.stopMusic(0.6); }
  setRate(r) { this.rate = r; if (this.music) this.music.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.3); }
  duck(amount = 0.35, ms = 900) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(amount, t, 0.05);
    this.duckGain.gain.setTargetAtTime(1, t + ms / 1000, 0.25);
  }
  // ---------------------------------------------------------------- ambience (looped crowd/water + filtered-noise beds)
  async ambience(kind, env) {
    if (!this.ctx) return;
    if (this.ambName === kind) return;
    this.stopAmbience();
    this.ambName = kind;
    const crowd = env === 'water' ? 'psp_water_crowd' : env === 'air' ? 'psp_air_crowd' : 'psp_ground_crowd';
    const url = this.sfxUrl(crowd); const buf = url ? await this.load(url) : null;
    const nodes = [];
    const out = this.ctx.createGain(); out.gain.value = 1; out.connect(this.ambGain);
    if (buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; const g = this.ctx.createGain(); g.gain.value = kind === 'stadium' ? 0.55 : 0.25; s.connect(g); g.connect(out); s.start(); nodes.push(s); this.crowdGain = g; }
    // filtered noise bed shaped per location
    const shape = { stadium: [400, 0.05], wind_chimes: [1800, 0.08], lava: [140, 0.22], mountain_wind: [900, 0.12], pool: [2400, 0.06], cave_water: [700, 0.12], lake: [1200, 0.06], sea: [500, 0.16], high_wind: [700, 0.18], blizzard: [1200, 0.2], city_wind: [600, 0.12] }[kind] || [800, 0.08];
    const len = this.ctx.sampleRate * 3, nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = nb.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    const ns = this.ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = shape[0];
    const ng = this.ctx.createGain(); ng.gain.value = shape[1];
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = this.ctx.createGain(); lg.gain.value = shape[1] * 0.6; lfo.connect(lg); lg.connect(ng.gain); lfo.start();
    ns.connect(f); f.connect(ng); ng.connect(out); ns.start();
    nodes.push(ns, lfo);
    this.amb = { nodes, out };
  }
  stopAmbience() { if (this.amb) { for (const n of this.amb.nodes) { try { n.stop(); } catch (e) { /* ignore */ } } this.amb.out.disconnect(); } this.amb = null; this.ambName = null; this.crowdGain = null; }
  crowd(level) { if (this.crowdGain && this.ctx) this.crowdGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.2); }
}
