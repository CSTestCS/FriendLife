// Resident voices.
//  * "speech": text-to-speech through the OS speech engine (Windows' built-in
//    voices in the desktop app). Per resident: voice, pitch, speed, volume,
//    intonation (pitch movement across a sentence) and emotion (mood changes
//    pitch/speed), plus verbal tics and stutters added to what they say.
//  * "babble": synthesized gibberish (Animal Crossing style) with its own
//    tone, waveform, vowel colour (formant), speed, pitch range, vibrato and
//    breathiness.
// Each resident can be set to auto / speech / babble / mute.

import { clamp, rand, chance } from '../core/util.js';

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}♪♫]/gu;

export function speakableText(text) {
  return String(text || '').replace(EMOJI_RE, ' ').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
}

export const BABBLE_WAVES = ['triangle', 'sine', 'square', 'sawtooth'];

export const VOICE_PRESETS = {
  default: { label: 'Default', pitch: 1, rate: 1, intonation: 0.4, emotion: 0.6, babble: 1, wave: 'triangle', formant: 1, bSpeed: 1, range: 0.4, vibrato: 0, breath: 0 },
  cute: { label: 'Cute', pitch: 1.6, rate: 1.1, intonation: 0.7, emotion: 0.8, babble: 1.5, wave: 'triangle', formant: 1.3, bSpeed: 1.2, range: 0.7, vibrato: 0.1, breath: 0 },
  deep: { label: 'Deep', pitch: 0.35, rate: 0.9, intonation: 0.25, emotion: 0.4, babble: 0.6, wave: 'sine', formant: 0.7, bSpeed: 0.85, range: 0.25, vibrato: 0, breath: 0.1 },
  robot: { label: 'Robot', pitch: 0.9, rate: 0.95, intonation: 0, emotion: 0, babble: 1, wave: 'square', formant: 1, bSpeed: 1, range: 0, vibrato: 0, breath: 0 },
  squeaky: { label: 'Squeaky', pitch: 2, rate: 1.35, intonation: 0.8, emotion: 0.9, babble: 2, wave: 'sine', formant: 1.6, bSpeed: 1.5, range: 0.8, vibrato: 0.2, breath: 0 },
  grandpa: { label: 'Elderly', pitch: 0.6, rate: 0.75, intonation: 0.5, emotion: 0.4, babble: 0.75, wave: 'triangle', formant: 0.85, bSpeed: 0.7, range: 0.3, vibrato: 0.6, breath: 0.3 },
  whisper: { label: 'Whisper', pitch: 1.1, rate: 0.85, intonation: 0.3, emotion: 0.3, volume: 0.5, babble: 1, wave: 'sine', formant: 1.1, bSpeed: 0.8, range: 0.2, vibrato: 0, breath: 0.9 },
  hyper: { label: 'Hyper', pitch: 1.3, rate: 1.6, intonation: 0.9, emotion: 1, babble: 1.3, wave: 'square', formant: 1.2, bSpeed: 1.6, range: 0.9, vibrato: 0, breath: 0 },
  dramatic: { label: 'Dramatic', pitch: 0.9, rate: 0.85, intonation: 1, emotion: 1, babble: 0.9, wave: 'sawtooth', formant: 0.9, bSpeed: 0.9, range: 1, vibrato: 0.4, breath: 0.1 },
};

export const VERBAL_TICS = ['', 'nya', 'desu', 'dude', 'yo', 'ribbit', 'kupo', 'bro', 'darling', 'y\'know', 'teehee', 'ugh', 'oh my', 'dattebayo'];

export function defaultVoice(gender) {
  const base = gender === 'f' ? 1.35 : gender === 'm' ? 0.8 : 1.1;
  return {
    ...VOICE_PRESETS.default,
    label: undefined,
    pitch: +(base + rand(-0.2, 0.2)).toFixed(2),
    rate: +rand(0.9, 1.15).toFixed(2),
    babble: +rand(0.8, 1.3).toFixed(2),
    volume: 1,
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
  return { volume: 1, voiceName: '', mode: 'auto', tic: '', ticChance: 0.35, stutter: 0, ...d, label: undefined, ...(v || {}) };
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

const MOOD_MOD = {
  happy: { pitch: 1.08, rate: 1.06, vol: 1 },
  love: { pitch: 1.1, rate: 0.98, vol: 1 },
  sad: { pitch: 0.88, rate: 0.85, vol: 0.85 },
  angry: { pitch: 0.95, rate: 1.15, vol: 1.15 },
  scared: { pitch: 1.15, rate: 1.2, vol: 0.9 },
  shy: { pitch: 1.05, rate: 0.9, vol: 0.75 },
  hurt: { pitch: 0.92, rate: 0.85, vol: 0.85 },
  smug: { pitch: 0.97, rate: 0.95, vol: 1 },
};

export class VoiceEngine {
  constructor(audio) {
    this.audio = audio;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis || null : null;
    this.voices = [];
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
   * mood: resident mood ('happy', 'sad', 'angry'…) shifts pitch/speed by voice.emotion.
   */
  speak(text, voice = {}, { mode = 'babble', force = false, volume = 1, mood = null } = {}) {
    const clean = speakableText(text);
    const v = normVoice(voice);
    if (!clean || mode === 'off' || v.mode === 'mute') return;
    // a resident's own voice mode (speech / babble) wins over the global choice, except in explicit tests
    if (!force && (v.mode === 'speech' || v.mode === 'babble')) mode = v.mode;
    const mm = MOOD_MOD[mood] || { pitch: 1, rate: 1, vol: 1 };
    const e = clamp(v.emotion ?? 0.6, 0, 1);
    const moodPitch = 1 + (mm.pitch - 1) * e;
    const moodRate = 1 + (mm.rate - 1) * e;
    const moodVol = 1 + (mm.vol - 1) * e;
    if (mode === 'speech' && this.synth) {
      if (this.synth.speaking || this.synth.pending) {
        if (!force) return;
        this.synth.cancel();
      }
      const sysVoice = this.voices.find((x) => x.name === v.voiceName) || this.pickDefault();
      // split into short phrases so intonation can move pitch through the sentence
      const chunks = v.intonation > 0.05 ? phrase(clean) : [clean];
      const question = /\?\s*$/.test(clean);
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        const last = i === chunks.length - 1;
        let contour = 1;
        if (chunks.length > 1) contour = 1 + Math.sin((i / (chunks.length - 1)) * Math.PI) * 0.18 * v.intonation + (Math.random() - 0.5) * 0.12 * v.intonation;
        if (last) contour *= question ? 1 + 0.25 * v.intonation : 1 - 0.1 * v.intonation;
        u.pitch = clamp((v.pitch ?? 1) * moodPitch * contour, 0, 2);
        u.rate = clamp((v.rate ?? 1) * moodRate, 0.3, 3);
        u.volume = clamp(volume * (v.volume ?? 1) * moodVol * (this.audio?.volume ?? 1), 0, 1);
        if (sysVoice) u.voice = sysVoice;
        this.synth.speak(u);
      });
      return;
    }
    this.babble(clean, v, volume * (v.volume ?? 1) * moodVol, moodPitch, moodRate);
  }

  pickDefault() {
    const en = this.voices.filter((x) => /^en/i.test(x.lang));
    return en.find((x) => x.default) || en[0] || this.voices[0] || null;
  }

  stop() { this.synth?.cancel(); }

  /** Animal-Crossing-like syllable babble using WebAudio. */
  babble(text, v, volume = 1, moodPitch = 1, moodRate = 1) {
    const a = this.audio;
    if (!a?.ctx) return;
    const ctx = a.ctx;
    const letters = text.replace(/[^a-z]/gi, '').toLowerCase();
    const syll = Math.min(16, Math.max(2, Math.round(letters.length / 2.2)));
    const base = 170 * (v.babble ?? 1) * (0.7 + (v.pitch ?? 1) * 0.3) * moodPitch;
    const step = 0.075 / clamp((v.bSpeed ?? 1) * (v.rate ?? 1) * moodRate, 0.4, 3);
    const range = clamp(v.range ?? 0.4, 0, 1);
    const wave = BABBLE_WAVES.includes(v.wave) ? v.wave : 'triangle';
    const formant = v.formant ?? 1;
    const question = /\?\s*$/.test(text);
    let t = ctx.currentTime + 0.01;
    const vowelF = { a: 800, e: 600, i: 400, o: 500, u: 350 };
    for (let i = 0; i < syll; i++) {
      const ch = letters[Math.min(letters.length - 1, Math.floor((i / syll) * letters.length))] || 'a';
      const o = ctx.createOscillator();
      o.type = wave;
      // pitch contour: per-letter variation scaled by range, rising at the end of questions
      let f = base * (1 + ((ch.charCodeAt(0) % 7) - 3) * 0.06 * range);
      if (i === syll - 1) f *= question ? 1 + 0.35 * range + 0.1 : 1 - 0.12 * range;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.92, t + step);
      if (v.vibrato > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 6 + v.vibrato * 3;
        const lg = ctx.createGain();
        lg.gain.value = f * 0.06 * v.vibrato;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + step);
      }
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = vowelF['aeiou'[(ch.charCodeAt(0) + i) % 5]] * formant;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      const tone = 0.16 * volume * (1 - (v.breath ?? 0) * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      o.connect(bp).connect(g).connect(a.master);
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
        ng.gain.exponentialRampToValueAtTime(0.12 * volume * v.breath, t + 0.015);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + step);
        n.connect(nf).connect(ng).connect(a.master);
        n.start(t, Math.random());
        n.stop(t + step);
      }
      t += step * (0.9 + Math.random() * 0.3);
    }
  }
}

function phrase(text) {
  const parts = text.split(/(?<=[,;:!?.])\s+/).flatMap((p) => {
    const words = p.split(' ');
    if (words.length <= 6) return [p];
    const out = [];
    for (let i = 0; i < words.length; i += 5) out.push(words.slice(i, i + 5).join(' '));
    return out;
  });
  return parts.filter(Boolean).slice(0, 6);
}
