// Tiny synthesized SFX — no audio files to ship.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.last = {};
  }

  ensure() {
    if (this.ctx || !this.enabled) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = .32 * (this.sfxVolume ?? 1);
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.enabled = false; }
    return this.ctx;
  }

  burst({ freq = 800, q = 1, dur = .12, gain = .4, type = 'lowpass', pitch = null }) {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * .5, dur + .05);
    if (pitch) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = pitch.type || 'sawtooth';
      o.frequency.setValueAtTime(pitch.from, t);
      o.frequency.exponentialRampToValueAtTime(pitch.to, t + dur);
      og.gain.setValueAtTime(pitch.gain || .15, t);
      og.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(og).connect(this.master);
      o.start(t); o.stop(t + dur + .05);
    }
  }

  throttle(key, gap) {
    const now = performance.now();
    if (now - (this.last[key] || 0) < gap) return false;
    this.last[key] = now;
    return true;
  }

  shot(kind) {
    if (!this.throttle(kind, kind === 'projectile' ? 55 : 30)) return;
    const presets = {
      projectile: { freq: 1400, q: .7, dur: .09, gain: .22 },
      pellets: { freq: 900, q: .5, dur: .22, gain: .45 },
      rail: { freq: 3000, q: 2, dur: .45, gain: .35, type: 'bandpass', pitch: { from: 1800, to: 120, gain: .12 } },
      beam: { freq: 2400, q: 6, dur: .1, gain: .08, type: 'bandpass', pitch: { from: 600, to: 560, type: 'square', gain: .04 } },
      arc: { freq: 4000, q: 3, dur: .25, gain: .25, type: 'highpass', pitch: { from: 90, to: 60, type: 'square', gain: .1 } },
      missile: { freq: 500, q: .8, dur: .5, gain: .25 },
      mortar: { freq: 200, q: 1, dur: .35, gain: .4, pitch: { from: 120, to: 40, type: 'sine', gain: .3 } },
    };
    this.burst(presets[kind] || presets.projectile);
  }

  boom(size = 1) {
    if (!this.throttle('boom', 60)) return;
    this.burst({ freq: 320, q: .6, dur: .9 * size, gain: .7 * Math.min(1.4, size), pitch: { from: 90, to: 28, type: 'sine', gain: .45 } });
  }

  setVolume(v) {
    this.sfxVolume = v;
    if (this.master) this.master.gain.value = .32 * v;
  }

  ui() { this.burst({ freq: 3000, q: 8, dur: .04, gain: .08, type: 'bandpass' }); }

  resume() { this.ensure()?.resume?.(); }
}
