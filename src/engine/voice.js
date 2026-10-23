// Resident voices.
//  * "speech" with the built-in synthesizer (default): eSpeak rendered in a
//    worker, then played through WebAudio so pitch can go far beyond what
//    system voices allow (about two octaves up or down), with the
//    intonation/emotion shape applied word by word.
//  * "speech" with a system voice: the OS text-to-speech engine (pitch is
//    limited to its 0–2 range); the shape is applied phrase by phrase.
//  * "babble": synthesized gibberish (Animal Crossing style) with its own
//    tone, waveform, vowel colour (formant), speed, pitch range, vibrato and
//    breathiness, following the same shape.
// Each resident can be set to auto / speech / babble / mute.

import { clamp, rand, chance, pick } from '../core/util.js';
import { planProsody, prosodyAt } from './prosody.js';

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}♪♫]/gu;

export function speakableText(text) {
  return String(text || '').replace(EMOJI_RE, ' ').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
}

export const BABBLE_WAVES = ['triangle', 'sine', 'square', 'sawtooth'];
export const PITCH_MIN = 0.25;
export const PITCH_MAX = 4;

/** Built-in synth voice types (eSpeak variants). */
export const SYNTH_VOICES = {
  m1: 'Male 1', m2: 'Male 2', m3: 'Male 3', m4: 'Male 4', m5: 'Male 5', m6: 'Male 6', m7: 'Male 7 (husky)',
  f1: 'Female 1', f2: 'Female 2', f3: 'Female 3', f4: 'Female 4', f5: 'Female 5 (breathy)',
  croak: 'Croaky', klatt: 'Retro 1', klatt2: 'Retro 2', klatt3: 'Retro 3', whisper: 'Whisper', whisperf: 'Whisper (female)',
};
export const SYNTH_ACCENTS = { 'en-us': 'American', en: 'British', 'en-rp': 'British (RP)', 'en-n': 'Northern English', 'en-wm': 'West Midlands', 'en-sc': 'Scottish' };

export const VOICE_PRESETS = {
  default: { label: 'Default', pitch: 1, rate: 1, intonation: 0.5, emotion: 0.6, babble: 1, wave: 'triangle', formant: 1, bSpeed: 1, range: 0.4, vibrato: 0, breath: 0 },
  cute: { label: 'Cute', pitch: 1.8, rate: 1.1, intonation: 0.75, emotion: 0.85, babble: 1.5, wave: 'triangle', formant: 1.3, bSpeed: 1.2, range: 0.7, vibrato: 0.1, breath: 0 },
  deep: { label: 'Deep', pitch: 0.5, rate: 0.9, intonation: 0.3, emotion: 0.4, babble: 0.6, wave: 'sine', formant: 0.7, bSpeed: 0.85, range: 0.25, vibrato: 0, breath: 0.1 },
  giant: { label: 'Giant', pitch: 0.25, rate: 0.8, intonation: 0.35, emotion: 0.5, babble: 0.45, wave: 'sawtooth', formant: 0.55, bSpeed: 0.7, range: 0.3, vibrato: 0.1, breath: 0.1 },
  robot: { label: 'Robot', pitch: 0.9, rate: 0.95, intonation: 0, emotion: 0, babble: 1, wave: 'square', formant: 1, bSpeed: 1, range: 0, vibrato: 0, breath: 0, synthVoice: 'klatt3' },
  squeaky: { label: 'Squeaky', pitch: 2.8, rate: 1.3, intonation: 0.8, emotion: 0.9, babble: 2, wave: 'sine', formant: 1.6, bSpeed: 1.5, range: 0.8, vibrato: 0.2, breath: 0 },
  chipmunk: { label: 'Chipmunk', pitch: 4, rate: 1.4, intonation: 0.9, emotion: 1, babble: 2.2, wave: 'triangle', formant: 1.9, bSpeed: 1.8, range: 0.9, vibrato: 0, breath: 0 },
  grandpa: { label: 'Elderly', pitch: 0.75, rate: 0.75, intonation: 0.55, emotion: 0.5, babble: 0.75, wave: 'triangle', formant: 0.85, bSpeed: 0.7, range: 0.3, vibrato: 0.6, breath: 0.3, synthVoice: 'croak' },
  whisper: { label: 'Whisper', pitch: 1.1, rate: 0.85, intonation: 0.35, emotion: 0.3, volume: 0.6, babble: 1, wave: 'sine', formant: 1.1, bSpeed: 0.8, range: 0.2, vibrato: 0, breath: 0.9 },
  hyper: { label: 'Hyper', pitch: 1.4, rate: 1.7, intonation: 1, emotion: 1, babble: 1.3, wave: 'square', formant: 1.2, bSpeed: 1.6, range: 0.9, vibrato: 0, breath: 0 },
  dramatic: { label: 'Dramatic', pitch: 0.9, rate: 0.82, intonation: 1, emotion: 1, babble: 0.9, wave: 'sawtooth', formant: 0.9, bSpeed: 0.9, range: 1, vibrato: 0.4, breath: 0.1 },
};

export const VERBAL_TICS = ['', 'nya', 'desu', 'dude', 'yo', 'ribbit', 'kupo', 'bro', 'darling', 'y\'know', 'teehee', 'ugh', 'oh my', 'dattebayo'];

const F_VOICES = ['f1', 'f2', 'f3', 'f4', 'f5'];
const M_VOICES = ['m1', 'm2', 'm3', 'm4', 'm6'];

export function defaultVoice(gender) {
  const fem = gender === 'f' || (gender !== 'm' && chance(0.5));
  return {
    ...VOICE_PRESETS.default,
    label: undefined,
    pitch: +rand(0.85, 1.2).toFixed(2),
    rate: +rand(0.9, 1.15).toFixed(2),
    intonation: +rand(0.35, 0.7).toFixed(2),
    babble: +((fem ? 1.25 : 0.85) + rand(-0.15, 0.15)).toFixed(2),
    volume: 1,
    engine: 'synth',
    synthVoice: pick(fem ? F_VOICES : M_VOICES),
    accent: chance(0.75) ? 'en-us' : pick(Object.keys(SYNTH_ACCENTS)),
    voiceName: '',
    mode: 'auto',
    tic: '',
    ticChance: 0.35,
    stutter: 0,
  };
}

/** Complete a voice object with defaults (older saves only had pitch/rate/babble). */
export function normVoice(v) {
  const d = VOICE_PRESETS.default;
  const out = { volume: 1, voiceName: '', mode: 'auto', tic: '', ticChance: 0.35, stutter: 0, engine: 'synth', accent: 'en-us', ...d, label: undefined, ...(v || {}) };
  if (!out.synthVoice) {
    // older saves: their pitch was tuned for system voices (women ~1.35);
    // pick a matching synth voice type and make the pitch relative to it
    if (out.pitch >= 1.2) { out.synthVoice = 'f2'; out.pitch = +(out.pitch / 1.35).toFixed(2); } else out.synthVoice = 'm3';
  }
  out.pitch = clamp(+out.pitch || 1, PITCH_MIN, PITCH_MAX);
  return out;
}

/** Apply verbal tics and stutters to a line the resident says (shown and spoken). */
export function stylizeLine(text, voice) {
  if (!text || !voice) return text;
  let out = text;
  if (voice.stutter > 0 && chance(voice.stutter)) {
    out = out.replace(/^(\W*)([A-Za-z])/, (m, pre, c) => `${pre}${c}-${c}`); // "I-I love cake"
  }
  if (voice.tic && chance(voice.ticChance ?? 0.35)) {
    const m = out.match(/^(.*?)([.!?…~]*)\s*$/s);
    if (m) out = `${m[1]}, ${voice.tic}${m[2] || '!'}`;
  }
  return out;
}


/** Talks to the built-in synthesizer (dist/speech.js) in a worker, or on the page as a fallback. */
class SynthClient {
  constructor(url = 'speech.js') {
    this.url = url;
    this.worker = null;
    this.fallback = null; // Promise<{render}>
    this.pending = new Map();
    this.seq = 0;
  }

  get supported() { return typeof window !== 'undefined'; }

  render(jobs) {
    if (this.fallback) return this.fallback.then((api) => api.render(jobs));
    if (!this.worker) this._startWorker();
    if (!this.worker) return this.render(jobs);
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject, jobs });
      this.worker.postMessage({ id, jobs });
    });
  }

  _startWorker() {
    try {
      this.worker = new Worker(this.url);
      this.worker.onmessage = (e) => {
        const { id, results, error } = e.data || {};
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (error) p.reject(new Error(error)); else p.resolve(results);
      };
      this.worker.onerror = (e) => {
        // workers can be blocked (e.g. some file:// setups): render on the page instead
        e.preventDefault?.();
        this.worker?.terminate();
        this.worker = null;
        this._useFallback();
        const waiting = [...this.pending.values()];
        this.pending.clear();
        for (const p of waiting) this.render(p.jobs).then(p.resolve, p.reject);
      };
    } catch {
      this.worker = null;
      this._useFallback();
    }
  }

  _useFallback() {
    if (this.fallback) return;
    this.fallback = new Promise((resolve, reject) => {
      if (window.FriendLifeSpeech) { resolve(window.FriendLifeSpeech); return; }
      const s = document.createElement('script');
      s.src = this.url;
      s.onload = () => (window.FriendLifeSpeech ? resolve(window.FriendLifeSpeech) : reject(new Error('speech engine missing')));
      s.onerror = () => reject(new Error('speech engine failed to load'));
      document.head.append(s);
    });
  }
}

/** espeak's own pitch setting covers ~0.67×–1.6×; measured: param ≈ 50 + 75·log2(ratio). */
const esPitchParam = (ratio) => clamp(Math.round(50 + 75 * Math.log2(ratio)), 0, 99);
const ES_MIN = 0.68;
const ES_MAX = 1.55;

export class VoiceEngine {
  constructor(audio) {
    this.audio = audio;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis || null : null;
    this.voices = [];
    this.builtin = new SynthClient();
    this.claims = new Map(); // key → token (latest line per speaker wins)
    this.playing = new Map(); // key → {nodes, end}
    this._n = 0;
    if (this.synth) {
      const load = () => { this.voices = this.synth.getVoices() || []; };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  get ttsAvailable() { return !!this.synth; }

  voiceList() {
    if (this.synth && !this.voices.length) this.voices = this.synth.getVoices() || [];
    return this.voices.map((v) => ({ name: v.name, lang: v.lang }));
  }

  /**
   * mode: 'speech' | 'babble' | 'off'. force: interrupt (e.g. voice test).
   * mood: resident mood ('happy', 'sad', 'angry'…) shapes the line by voice.emotion.
   * key: who is speaking (a new line from the same speaker replaces the old one).
   * Returns a promise for built-in speech (resolves when scheduled), otherwise undefined.
   */
  speak(text, voice = {}, { mode = 'babble', force = false, volume = 1, mood = null, key = null } = {}) {
    const clean = speakableText(text);
    const v = normVoice(voice);
    if (!clean || mode === 'off' || v.mode === 'mute') return;
    // a resident's own voice mode (speech / babble) wins over the global choice, except in explicit tests
    if (!force && (v.mode === 'speech' || v.mode === 'babble')) mode = v.mode;
    const plan = planProsody(clean, v, mood || 'neutral');
    if (mode === 'speech') {
      const useSystem = v.engine === 'system' && this.synth;
      if (!useSystem && this.audio?.ctx && this.builtin.supported) {
        return this.speakBuiltin(plan, v, { volume, force, key: force ? '__test' : key }).catch((err) => {
          console.warn('built-in speech failed, using fallback:', err);
          if (this.synth) this.speakSystem(plan, v, { volume, force }); else this.babble(clean, v, volume, plan);
        });
      }
      if (this.synth) { this.speakSystem(plan, v, { volume, force }); return; }
    }
    this.babble(clean, v, volume, plan);
  }

  /** The pitch/speed shape a line would get (for tests and tools). */
  plan(text, voice, mood = 'neutral') { return planProsody(speakableText(text), normVoice(voice), mood); }

  pickDefault() {
    const en = this.voices.filter((x) => /^en/i.test(x.lang));
    return en.find((x) => x.default) || en[0] || this.voices[0] || null;
  }

  stop() {
    this.synth?.cancel();
    for (const k of [...this.playing.keys()]) this._stopKey(k);
  }

  _stopKey(key) {
    const p = this.playing.get(key);
    if (!p) return;
    for (const n of p.nodes) { try { n.stop(); } catch { /* not started */ } }
    this.playing.delete(key);
  }

  /** System text-to-speech: one utterance per phrase with that phrase's pitch/speed. */
  speakSystem(plan, v, { volume = 1, force = false } = {}) {
    if (this.synth.speaking || this.synth.pending) {
      if (!force) return;
      this.synth.cancel();
    }
    const sysVoice = this.voices.find((x) => x.name === v.voiceName) || this.pickDefault();
    for (const c of plan.chunks) {
      const u = new SpeechSynthesisUtterance(c.text);
      u.pitch = clamp((v.pitch ?? 1) * plan.pitch * c.p, 0, 2);
      u.rate = clamp((v.rate ?? 1) * plan.rate * c.r, 0.3, 3);
      u.volume = clamp(volume * (v.volume ?? 1) * plan.gain * c.g * (this.audio?.volume ?? 1) * (this.audio?.levels?.voice ?? 1), 0, 1);
      if (sysVoice) u.voice = sysVoice;
      this.synth.speak(u);
    }
  }

  /** Built-in synth: render each phrase, then glide pitch word by word while it plays. */
  async speakBuiltin(plan, v, { volume = 1, force = false, key = null } = {}) {
    const a = this.audio;
    const ctx = a.ctx;
    const token = {};
    if (force) this.stop();
    if (key) this.claims.set(key, token);
    if (!force && this.playing.size >= 4 && !(key && this.playing.has(key))) return;

    const P = clamp(v.pitch ?? 1, PITCH_MIN, PITCH_MAX) * plan.pitch;
    const speechRate = clamp(v.rate ?? 1, 0.3, 3) * plan.rate;
    const jobs = plan.chunks.map((c) => {
      const want = P * c.p; // this phrase's pitch
      const es = clamp(want, ES_MIN, ES_MAX); // part done by the synth itself (keeps speed independent)
      const play = want / es; // the rest by playback rate (also speeds up / slows down)
      c.play = play;
      c.speedMul = speechRate * c.r;
      // non-final phrases end with a comma so the synth uses a "continuing" tune
      const text = c.final || /[,;:.!?…~]$/.test(c.text) ? c.text : `${c.text},`;
      return { text, pitch: esPitchParam(es), speed: (175 * c.speedMul) / play, variant: v.synthVoice || 'm3', accent: v.accent || 'en-us' };
    });
    const results = await this.builtin.render(jobs);
    if (key && this.claims.get(key) !== token) return; // a newer line from this speaker took over
    if (key) this._stopKey(key);

    const out = ctx.createGain();
    out.gain.value = clamp(volume * (v.volume ?? 1) * plan.gain, 0, 2) * 1.25;
    out.connect(a.voiceBus || a.master);
    const nodes = [];
    let t = ctx.currentTime + 0.03;
    const vib = (v.vibrato || 0) * 45 + plan.tremble.depth; // cents
    plan.chunks.forEach((c, i) => {
      const r = results[i];
      if (!r || !r.samples.length) return;
      const s = r.samples;
      // trim leading / trailing silence so phrases connect at our own pauses
      let lo = 0;
      let hi = s.length - 1;
      while (lo < hi && Math.abs(s[lo]) < 300) lo++;
      while (hi > lo && Math.abs(s[hi]) < 300) hi--;
      lo = Math.max(0, lo - Math.round(r.sampleRate * 0.01));
      hi = Math.min(s.length - 1, hi + Math.round(r.sampleRate * 0.03));
      const len = hi - lo + 1;
      if (len < 32) return;
      const buf = ctx.createBuffer(1, len, r.sampleRate);
      const ch = buf.getChannelData(0);
      for (let k = 0; k < len; k++) ch[k] = s[lo + k] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const D = len / r.sampleRate;
      const wsum = c.words.reduce((acc, w) => acc + w.syl + 0.4, 0);
      const k0 = c.play * (c.words[0].p0 / c.p);
      src.playbackRate.setValueAtTime(k0, t);
      g.gain.setValueAtTime(c.words[0].g / c.g, t);
      let tt = t;
      for (const w of c.words) {
        const d = (D * (w.syl + 0.4)) / wsum; // this word's share of the audio
        const a0 = c.play * (w.p0 / c.p);
        const a1 = c.play * (w.p1 / c.p);
        const dur = d / ((a0 + a1) / 2);
        const ease = Math.min(0.035, dur * 0.3);
        src.playbackRate.linearRampToValueAtTime(a0, tt + ease);
        src.playbackRate.linearRampToValueAtTime(a1, tt + dur);
        g.gain.linearRampToValueAtTime(clamp(w.g / c.g, 0.2, 2), tt + ease);
        tt += dur;
      }
      if (vib > 1) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = plan.tremble.depth > (v.vibrato || 0) * 45 ? plan.tremble.speed : 5.5;
        const lg = ctx.createGain();
        lg.gain.value = vib;
        lfo.connect(lg).connect(src.detune);
        lfo.start(t);
        lfo.stop(tt + 0.1);
        nodes.push(lfo);
      }
      src.connect(g).connect(out);
      src.start(t);
      src.stop(tt + 0.1);
      nodes.push(src);
      t = tt + c.pauseAfter;
    });
    const k = key || `line${++this._n}`;
    const entry = { nodes, end: t };
    this.playing.set(k, entry);
    const last = nodes[nodes.length - 1];
    if (last) last.onended = () => { if (this.playing.get(k) === entry) this.playing.delete(k); out.disconnect(); };
    else this.playing.delete(k);
    return { duration: t - ctx.currentTime };
  }

  /** Animal-Crossing-like syllable babble using WebAudio, following the line's shape. */
  babble(text, v, volume = 1, plan = planProsody(text, v, 'neutral')) {
    const a = this.audio;
    if (!a?.ctx) return;
    const ctx = a.ctx;
    const letters = text.replace(/[^a-z]/gi, '').toLowerCase();
    const syll = Math.min(18, Math.max(2, Math.round(letters.length / 2.2)));
    const P = clamp(v.pitch ?? 1, PITCH_MIN, PITCH_MAX) * plan.pitch;
    const base = 170 * (v.babble ?? 1) * P;
    const step0 = 0.075 / clamp((v.bSpeed ?? 1) * (v.rate ?? 1) * plan.rate, 0.3, 3);
    const range = clamp(v.range ?? 0.4, 0, 1);
    const wave = BABBLE_WAVES.includes(v.wave) ? v.wave : 'triangle';
    const formant = v.formant ?? 1;
    const vib = (v.vibrato || 0) + plan.tremble.depth / 60;
    const gainAll = volume * (v.volume ?? 1) * plan.gain;
    let t = ctx.currentTime + 0.01;
    const vowelF = { a: 800, e: 600, i: 400, o: 500, u: 350 };
    let lastWord = null;
    for (let i = 0; i < syll; i++) {
      const pr = prosodyAt(plan, syll > 1 ? i / (syll - 1) : 0.5);
      if (lastWord && pr.word !== lastWord) t += Math.min(0.5, lastWord.pause * 0.8);
      lastWord = pr.word;
      const step = step0 / clamp(pr.r, 0.4, 2);
      const ch = letters[Math.min(letters.length - 1, Math.floor((i / syll) * letters.length))] || 'a';
      const o = ctx.createOscillator();
      o.type = wave;
      // per-letter variation scaled by range, on top of the shared shape
      const f = clamp(base * pr.p * (1 + ((ch.charCodeAt(0) % 7) - 3) * 0.06 * range), 40, 4000);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.92, t + step);
      if (vib > 0.01) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 6 + vib * 3;
        const lg = ctx.createGain();
        lg.gain.value = f * 0.06 * Math.min(1.5, vib);
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + step);
      }
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = vowelF['aeiou'[(ch.charCodeAt(0) + i) % 5]] * formant;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      const tone = 0.16 * gainAll * pr.g * (1 - (v.breath ?? 0) * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      o.connect(bp).connect(g).connect(a.voiceBus || a.master);
      o.start(t);
      o.stop(t + step);
      // breathiness: a puff of filtered noise per syllable
      if (v.breath > 0.05 && a.noise) {
        const n = ctx.createBufferSource();
        n.buffer = a.noise;
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 2200 * formant;
        nf.Q.value = 0.8;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.12 * gainAll * v.breath, t + 0.015);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + step);
        n.connect(nf).connect(ng).connect(a.voiceBus || a.master);
        n.start(t, Math.random());
        n.stop(t + step);
      }
      t += step * (0.9 + Math.random() * 0.3);
    }
  }
}
