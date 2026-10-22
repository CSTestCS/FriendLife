// Resident voices.
//  * "speech": real text-to-speech through the browser/OS speech engine
//    (Windows' built-in voices in the desktop app). Each resident has their
//    own pitch, speed and voice — like Tomodachi Life's voice editor.
//  * "babble": cute synthesized gibberish syllables, pitched per resident.
//  * "off".

import { clamp, rand } from '../core/util.js';

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}♪♫]/gu;

export function speakableText(text) {
  return String(text || '').replace(EMOJI_RE, ' ').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function defaultVoice(gender) {
  const base = gender === 'f' ? 1.35 : gender === 'm' ? 0.8 : 1.1;
  return { pitch: +(base + rand(-0.2, 0.2)).toFixed(2), rate: +rand(0.9, 1.15).toFixed(2), voiceName: '', babble: +rand(0.8, 1.3).toFixed(2) };
}

export class VoiceEngine {
  constructor(audio) {
    this.audio = audio;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis || null : null;
    this.voices = [];
    this.speaking = 0;
    this.lastSpeaker = null;
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
   * mode: 'speech' | 'babble' | 'off'.  force: always speak (e.g. the voice test button).
   */
  speak(text, voice = {}, { mode = 'babble', force = false, volume = 1 } = {}) {
    const clean = speakableText(text);
    if (!clean || mode === 'off') return;
    if (mode === 'speech' && this.synth) {
      // don't build up a backlog of chatter: newest important line wins
      if (this.synth.speaking || this.synth.pending) {
        if (!force) return;
        this.synth.cancel();
      }
      const u = new SpeechSynthesisUtterance(clean);
      u.pitch = clamp(voice.pitch ?? 1, 0, 2);
      u.rate = clamp(voice.rate ?? 1, 0.3, 3);
      u.volume = clamp(volume * (this.audio?.volume ?? 1), 0, 1);
      const v = this.voices.find((x) => x.name === voice.voiceName) || this.pickDefault();
      if (v) u.voice = v;
      this.synth.speak(u);
      return;
    }
    this.babble(clean, voice, volume);
  }

  pickDefault() {
    const en = this.voices.filter((v) => /^en/i.test(v.lang));
    return en.find((v) => v.default) || en[0] || this.voices[0] || null;
  }

  stop() { this.synth?.cancel(); }

  /** Animal-Crossing-like syllable babble using WebAudio. */
  babble(text, voice, volume = 1) {
    const a = this.audio;
    if (!a?.ctx) return;
    const ctx = a.ctx;
    const letters = text.replace(/[^a-z]/gi, '').toLowerCase();
    const syll = Math.min(14, Math.max(2, Math.round(letters.length / 2.2)));
    const base = 170 * (voice.babble ?? 1) * (0.7 + (voice.pitch ?? 1) * 0.3);
    const step = 0.075 / clamp(voice.rate ?? 1, 0.5, 2);
    let t = ctx.currentTime + 0.01;
    const vowelF = { a: 800, e: 600, i: 400, o: 500, u: 350 };
    for (let i = 0; i < syll; i++) {
      const ch = letters[Math.min(letters.length - 1, Math.floor((i / syll) * letters.length))] || 'a';
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const f = base * (1 + ((ch.charCodeAt(0) % 7) - 3) * 0.04) * (i === syll - 1 && /\?/.test(text) ? 1.25 : 1);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.92, t + step);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = vowelF['aeiou'[(ch.charCodeAt(0) + i) % 5]] * (voice.babble ?? 1);
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * volume, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      o.connect(bp).connect(g).connect(a.master);
      o.start(t);
      o.stop(t + step);
      t += step * (0.9 + Math.random() * 0.3);
    }
  }
}
