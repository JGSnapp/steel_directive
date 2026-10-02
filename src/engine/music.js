// Procedural soundtrack: a small step sequencer on WebAudio, one theme per
// arena plus a menu theme. No audio files, no licensing. Intensity (0..1)
// adds drums and layers as the fight heats up.

const THEMES = {
  menu: { bpm: 88, root: 45, prog: [0, 5, 3, 6], pad: .9, arp: .35, bass: .35, drums: 0, wave: 'triangle', arpPattern: [0, 2, 4, 7, 4, 2] },
  foundry: { bpm: 126, root: 40, prog: [0, 0, 5, 6], pad: .35, arp: .25, bass: 1, drums: 1, wave: 'sawtooth', arpPattern: [0, 7, 0, 3], dist: true },
  whiteout: { bpm: 100, root: 38, prog: [0, 3, 5, 4], pad: .8, arp: .55, bass: .55, drums: .6, wave: 'triangle', arpPattern: [0, 4, 7, 11, 7, 4] },
  neon: { bpm: 118, root: 42, prog: [0, 5, 2, 6], pad: .55, arp: .8, bass: .9, drums: .9, wave: 'square', arpPattern: [0, 3, 7, 10, 12, 10, 7, 3] },
  citadel: { bpm: 108, root: 36, prog: [0, 5, 6, 4], pad: 1, arp: .4, bass: .8, drums: .8, wave: 'sawtooth', arpPattern: [0, 7, 12, 7], toms: true },
  ring: { bpm: 66, root: 33, prog: [0, 5, 0, 1], pad: 1, arp: .25, bass: .45, drums: .35, wave: 'triangle', arpPattern: [0, 3, 7, 3] },
};
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.enabled = (() => { try { return localStorage.getItem('sd.music') !== 'off'; } catch { return true; } })();
    this.volume = .6;
    this.theme = null;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  init() {
    const ctx = this.audio.ensure();
    if (!ctx || this.out) return ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? this.volume : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    // Make-up gain after the compressor so the soundtrack sits level with the effects.
    const makeup = ctx.createGain(); makeup.gain.value = 2.2;
    this.out.connect(comp).connect(makeup).connect(ctx.destination);
    // Feedback delay for the arpeggio.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = .28;
    const fb = ctx.createGain(); fb.gain.value = .32;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(this.out);
    return ctx;
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('sd.music', this.enabled ? 'on' : 'off'); } catch { /* ignore */ }
    if (this.out) this.out.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.audio.ctx.currentTime, .3);
    return this.enabled;
  }

  play(name) {
    if (this.theme === THEMES[name]) return;
    const ctx = this.init();
    if (!ctx) return;
    // Crossfade by dipping the master for a beat.
    this.out.gain.setTargetAtTime(0, ctx.currentTime, .15);
    setTimeout(() => {
      this.theme = THEMES[name] || THEMES.menu;
      this.step = 0;
      this.nextTime = ctx.currentTime + .05;
      if (this.enabled) this.out.gain.setTargetAtTime(this.volume, ctx.currentTime, .6);
    }, 450);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  // 0..1 from the volume slider (0 also mutes).
  setVolume(v) {
    this.volume = .9 * v;
    this.enabled = v > 0;
    if (this.out) this.out.gain.setTargetAtTime(this.volume, this.audio.ctx.currentTime, .1);
  }

  setIntensity(v) { this.targetIntensity = Math.max(0, Math.min(1, v)); }

  sting(win) {
    const ctx = this.init();
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + .05;
    const notes = win ? [0, 4, 7, 12] : [0, -2, -5, -9];
    notes.forEach((n, i) => this.tone(t + i * .16, freq(57 + n), .7, win ? 'sawtooth' : 'triangle', .2, 1800));
  }

  schedule() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.theme || ctx.state !== 'running') return;
    this.intensity += (this.targetIntensity - this.intensity) * .02;
    const sixteenth = 60 / this.theme.bpm / 4;
    while (this.nextTime < ctx.currentTime + .12) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t, dur) {
    const th = this.theme, I = this.intensity;
    const bar = Math.floor(step / 16), s = step % 16;
    const deg = th.prog[bar % th.prog.length];
    const chordRoot = th.root + MINOR[deg % 7] + (deg >= 7 ? 12 : 0);
    const chord = [0, 2, 4].map(k => th.root + MINOR[(deg + k) % 7] + Math.floor((deg + k) / 7) * 12);
    // Pad: whole-bar chord.
    if (s === 0 && th.pad) chord.forEach(n => this.pad(t, freq(n + 12), dur * 16, th.pad * (.5 + I * .3)));
    // Bass: eighths, octave jumps when intense.
    if (th.bass && s % 2 === 0) {
      const n = chordRoot - 12 + (I > .5 && s % 8 === 6 ? 12 : 0);
      this.tone(t, freq(n), dur * 1.8, th.dist ? 'sawtooth' : 'square', .3 * th.bass, 300 + I * 900);
    }
    // Arpeggio through the delay.
    if (th.arp && (I > .25 || s % 2 === 0)) {
      const pat = th.arpPattern;
      const n = chordRoot + 12 + pat[s % pat.length];
      this.tone(t, freq(n), dur * .9, th.wave, .16 * th.arp, 2600, true);
    }
    // Drums ramp in with intensity.
    const d = th.drums * Math.min(1, .25 + I * 1.1);
    if (d > 0) {
      if (s % 4 === 0 && (I > .2 || s % 8 === 0)) this.kick(t, .9 * d);
      if ((s === 4 || s === 12) && I > .3) this.noise(t, .18, 1800, 'bandpass', .35 * d);
      if (I > .45 && s % 2 === 1) this.noise(t, .04, 7000, 'highpass', .12 * d);
      if (th.toms && I > .6 && s >= 13) this.tone(t, freq(chordRoot - 5 - (s - 13) * 3), .2, 'sine', .25 * d, 600);
    }
  }

  tone(t, f, len, type, vol, cutoff, delayed = false) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .01);
    g.gain.exponentialRampToValueAtTime(.0005, t + len);
    o.connect(lp).connect(g).connect(this.out);
    if (delayed) g.connect(this.delay);
    o.start(t); o.stop(t + len + .05);
  }

  pad(t, f, len, vol) {
    const ctx = this.audio.ctx;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.09 * vol, t + len * .3);
    g.gain.linearRampToValueAtTime(0, t + len);
    lp.connect(g).connect(this.out);
    for (const det of [-7, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + len + .05);
    }
  }

  kick(t, vol) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + .12);
    g.gain.setValueAtTime(.8 * vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + .3);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + .32);
  }

  noise(t, len, f, type, vol) {
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * .4, t);
    g.gain.exponentialRampToValueAtTime(.001, t + len);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t, Math.random() * .5, len + .02);
  }
}

// Offline render of a theme to a 16-bit WAV (base64), used by tools/record to
// put the soundtrack under recorded videos. `curve(t)` gives intensity 0..1.
export async function renderThemeWav(name, seconds, curve = () => .5) {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const noise = ctx.createBuffer(1, rate, rate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const fake = { ctx, noise, ensure: () => ctx };
  const m = new Music(fake);
  m.enabled = true;
  m.init();
  m.out.gain.value = .55;
  m.theme = THEMES[name] || THEMES.menu;
  const sixteenth = 60 / m.theme.bpm / 4;
  for (let step = 0, t = .05; t < seconds; step++, t += sixteenth) {
    m.intensity = curve(t);
    m.playStep(step % 64, t, sixteenth);
  }
  const buf = await ctx.startRendering();
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  let bin = '';
  const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
