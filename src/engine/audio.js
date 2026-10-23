// Procedural audio: rain/wind ambience, thunder, fight hits, UI blips and a
// gentle generated background tune. No audio files needed.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.musicOn = true;
    this.volume = 0.7;
    this.levels = { voice: 1, music: 1, ambient: 1 }; // separate volume channels
    this.musicTimer = 0;
    this.step = 0;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // channels: voices, music, ambient (weather + sound effects)
    this.voiceBus = this.ctx.createGain();
    this.ambientBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    for (const [k, bus] of [['voice', this.voiceBus], ['ambient', this.ambientBus], ['music', this.musicBus]]) {
      bus.gain.value = this.levels[k];
      bus.connect(this.master);
    }
    this.noise = this._noiseBuffer(2);
    // rain bed
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noise;
    rainSrc.loop = true;
    const rainF = this.ctx.createBiquadFilter();
    rainF.type = 'bandpass';
    rainF.frequency.value = 2500;
    rainF.Q.value = 0.5;
    rainSrc.connect(rainF).connect(this.rainGain).connect(this.ambientBus);
    rainSrc.start();
    // wind bed
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noise;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.5;
    this.windF = this.ctx.createBiquadFilter();
    this.windF.type = 'lowpass';
    this.windF.frequency.value = 400;
    windSrc.connect(this.windF).connect(this.windGain).connect(this.ambientBus);
    windSrc.start();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.12;
    this.musicGain.connect(this.musicBus);
  }

  _noiseBuffer(sec) {
    const len = this.ctx.sampleRate * sec;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = w * 0.6 + last * 3;
    }
    return buf;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  /** channel: 'voice' | 'music' | 'ambient' */
  setLevel(channel, v) {
    this.levels[channel] = v;
    const bus = { voice: this.voiceBus, music: this.musicBus, ambient: this.ambientBus }[channel];
    if (bus) bus.gain.value = v;
  }

  setWeather(rain, wind, snow) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain * 0.35, t, 0.5);
    this.windGain.gain.setTargetAtTime(Math.min(0.5, wind * 0.3 + snow * 0.08), t, 0.8);
    this.windF.frequency.setTargetAtTime(250 + wind * 600, t, 1);
  }

  _burst({ dur = 0.2, freq = 800, type = 'lowpass', gain = 0.5, q = 1, rate = 1 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.ambientBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  _tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.2, slide = 0, delay = 0, out = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.ambientBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  thunder(strength = 1) {
    if (!this.ctx) return;
    this._burst({ dur: 2.8 * strength, freq: 180, gain: 0.9 * strength, rate: 0.35 });
    this._burst({ dur: 0.4, freq: 1200, gain: 0.3 * strength, rate: 0.8 });
  }

  hit(heavy = false) {
    this._burst({ dur: heavy ? 0.25 : 0.12, freq: heavy ? 500 : 900, gain: heavy ? 0.7 : 0.45, rate: 0.8 });
    this._tone({ freq: heavy ? 110 : 160, dur: 0.15, type: 'sine', gain: 0.5, slide: -60 });
  }

  whoosh() { this._burst({ dur: 0.18, freq: 1500, type: 'bandpass', gain: 0.18, q: 2, rate: 1.5 }); }
  thud() { this._tone({ freq: 90, dur: 0.3, gain: 0.6, slide: -40 }); this._burst({ dur: 0.3, freq: 300, gain: 0.4 }); }
  splash() { this._burst({ dur: 0.35, freq: 900, type: 'lowpass', gain: 0.3, q: 0.7, rate: 1 }); }
  pop() { this._tone({ freq: 660, dur: 0.08, type: 'triangle', gain: 0.15, slide: 300 }); }
  blip() { this._tone({ freq: 520, dur: 0.06, type: 'square', gain: 0.05 }); }
  chime() { [784, 988, 1175].forEach((f, i) => this._tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.12, delay: i * 0.09 })); }
  sad() { [440, 392, 330].forEach((f, i) => this._tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.1, delay: i * 0.18 })); }
  angry() { this._tone({ freq: 140, dur: 0.25, type: 'sawtooth', gain: 0.08, slide: -40 }); }
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => this._tone({ freq: f, dur: 0.3, type: 'square', gain: 0.06, delay: i * 0.1 })); }
  talk() { this._tone({ freq: 300 + Math.random() * 400, dur: 0.05, type: 'square', gain: 0.025 }); }

  /** A tiny generative tune: pentatonic notes over a 4-chord loop. */
  updateMusic(dt, mood = 1, night = 0) {
    if (!this.ctx || !this.musicOn) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const tempo = night > 0.5 ? 0.62 : 0.42;
    this.musicTimer = tempo;
    const chords = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [4, 7, 11]];
    const chord = chords[Math.floor(this.step / 8) % chords.length];
    const base = night > 0.5 ? 196 : 262;
    const scale = [0, 2, 4, 7, 9, 12, 14];
    if (this.step % 4 === 0) {
      this._tone({ freq: base / 2 * 2 ** (chord[0] / 12), dur: tempo * 3.5, type: 'sine', gain: 0.09, out: this.musicGain });
    }
    if (Math.random() < 0.7) {
      const deg = Math.random() < 0.5 ? chord[Math.floor(Math.random() * 3)] : scale[Math.floor(Math.random() * scale.length)];
      this._tone({ freq: base * 2 ** (deg / 12), dur: tempo * 1.4, type: night > 0.5 ? 'sine' : 'triangle', gain: 0.07 * mood, out: this.musicGain });
    }
    this.step++;
  }

  setMusic(on) {
    this.musicOn = on;
  }
}
