// Tiny synthesised sound kit, no audio files. The AudioContext is only
// created after the first click, so browsers never block it.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _ready() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _noise(seconds) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gain, t, peak, attack, release) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  // the "tss-crack" of a can opening
  crack() {
    const ctx = this._ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    const click = ctx.createBufferSource();
    click.buffer = this._noise(0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const cg = ctx.createGain();
    this._env(cg, t, 0.9, 0.002, 0.04);
    click.connect(hp).connect(cg).connect(this.master);
    click.start(t);

    const hiss = ctx.createBufferSource();
    hiss.buffer = this._noise(1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(6000, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.8);
    const hg = ctx.createGain();
    this._env(hg, t + 0.02, 0.45, 0.03, 0.75);
    hiss.connect(bp).connect(hg).connect(this.master);
    hiss.start(t + 0.02);
  }

  riser(seconds) {
    const ctx = this._ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(5000, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + seconds * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.08);
    lp.connect(g).connect(this.master);
    [0, 7].forEach((detune) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(620, t + seconds);
      o.detune.value = detune * 3;
      o.connect(lp);
      o.start(t);
      o.stop(t + seconds + 0.1);
    });
  }

  whoosh(seconds) {
    const ctx = this._ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise(seconds);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + seconds * 0.5);
    bp.frequency.exponentialRampToValueAtTime(500, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + seconds * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }

  boom() {
    const ctx = this._ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.9);
    const g = ctx.createGain();
    this._env(g, t, 0.9, 0.01, 1.1);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.3);
    this.sparkle(0.12);
  }

  sparkle(delay = 0) {
    const ctx = this._ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    [1568, 2093, 2637, 3136].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t + i * 0.06, 0.12, 0.005, 0.4);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.5);
    });
  }
}
