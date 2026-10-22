// Prosody planner: turns a line of text + a resident's voice settings + their
// current mood into a pitch / speed / loudness "shape" for every word.
// Every voice backend (built-in synth, system text-to-speech, babble) plays
// the same plan, so Intonation and Emotion behave the same everywhere.
//
//  * Intonation (0–1): how much the melody moves. Higher values put accents on
//    more words, make the rises and falls bigger, stretch accented and
//    phrase-final words, split speech into shorter phrases with longer pauses,
//    and make questions rise / statements fall more steeply.
//  * Emotion (0–1): how strongly the mood colours the voice. Each mood has its
//    own overall pitch/speed/loudness and its own shape across the sentence
//    (happy bounces, sad sinks and slows, angry punches stressed words,
//    scared trembles and rushes, shy trails off…). With no particular mood it
//    adds lively, natural-sounding emphasis.

import { clamp, rand } from '../core/util.js';

const STOP = new Set(('a an the and or but so to of in on at for from with by as is am are was were be been being i im i\'m ' +
  'you you\'re he she it it\'s we they me my your his her its our their them this that these those do does did ' +
  'not no just oh um uh like yeah hey hi have has had will would can could should if then than there here what ' +
  'who how when up out into about all some any very too really').split(' '));

/** Mood personalities. p/r/g = overall pitch, speed, loudness at full emotion. */
const MOODS = {
  neutral: { p: 1, r: 1, g: 1, tremble: 0, pause: 0 },
  happy: { p: 1.22, r: 1.14, g: 1.08, tremble: 0, pause: -0.03 },
  love: { p: 1.14, r: 0.86, g: 0.95, tremble: 6, pause: 0.06 },
  sad: { p: 0.8, r: 0.74, g: 0.78, tremble: 18, pause: 0.16 },
  angry: { p: 0.92, r: 1.2, g: 1.3, tremble: 0, pause: -0.04 },
  scared: { p: 1.3, r: 1.28, g: 0.88, tremble: 40, pause: 0.02 },
  shy: { p: 1.08, r: 0.84, g: 0.68, tremble: 8, pause: 0.18 },
  hurt: { p: 0.88, r: 0.8, g: 0.85, tremble: 24, pause: 0.12 },
  smug: { p: 0.94, r: 0.86, g: 1.05, tremble: 0, pause: 0.05 },
};
export const MOOD_IDS = Object.keys(MOODS);

const syllables = (w) => Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length);
const mix = (m, e) => 1 + (m - 1) * e;

/**
 * Returns { pitch, rate, gain, tremble:{depth (cents), speed (Hz)}, words, chunks }.
 * words[i] = { text, syl, p0, p1, r, g } (p0→p1 = pitch glide across the word).
 * chunks = phrases to synthesize separately: { text, words, p, r, g, pauseAfter, final }.
 */
export function planProsody(text, voice = {}, mood = 'neutral') {
  const I = clamp(voice.intonation ?? 0.4, 0, 1);
  const E = clamp(voice.emotion ?? 0.6, 0, 1);
  const m = MOODS[mood] || MOODS.neutral;
  const Ex = E * 1.35; // top of the slider exaggerates
  const tokens = String(text).match(/\S+/g) || [];
  const n = tokens.length;
  const ending = (String(text).match(/[.!?…~]+\s*$/) || [''])[0];
  const question = ending.includes('?');
  const exclaim = ending.includes('!');

  // ---- words
  const words = tokens.map((tok, i) => {
    const core = tok.replace(/[^\p{L}\p{N}']/gu, '');
    const punct = (tok.match(/[,;:.!?…~-]+$/) || [''])[0];
    const content = (core.length >= 4 && !STOP.has(core.toLowerCase())) || /^[A-Z]{2,}$/.test(core) || /!/.test(punct);
    return { text: tok, core, punct, i, pos: n > 1 ? i / (n - 1) : 0.5, syl: syllables(core || 'a'), content, p0: 1, p1: 1, r: 1, g: 1, accent: 0, pause: 0 };
  });

  // ---- phrases: split at punctuation; more intonation = shorter phrases
  const maxLen = I > 0.25 ? Math.round(9 - 6 * I) : 99;
  const phrases = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (/[,;:.!?…~]/.test(w.punct) || cur.length >= maxLen) { phrases.push(cur); cur = []; }
  }
  if (cur.length) phrases.push(cur);

  // ---- accents: nucleus (last content word of each phrase) + more with intonation
  for (const ph of phrases) {
    const content = ph.filter((w) => w.content);
    const nucleus = content[content.length - 1] || ph[ph.length - 1];
    if (I > 0.03) nucleus.accent = rand(0.75, 1);
    for (const w of content) if (w !== nucleus && Math.random() < 0.15 + 0.85 * I) w.accent = rand(0.45, 0.9);
  }

  // ---- intonation shape
  phrases.forEach((ph, pi) => {
    const lastPhrase = pi === phrases.length - 1;
    ph.forEach((w, wi) => {
      // declination: sentences start higher and drift down (questions drift up)
      const decl = question ? 1 + I * 0.14 * (w.pos - 0.5) : 1 + I * 0.26 * (0.5 - w.pos);
      w.p0 *= decl; w.p1 *= decl;
      if (w.accent) {
        // rise into the stressed word, hold it a little longer and louder
        w.p0 *= 1 + I * 0.14 * w.accent;
        w.p1 *= 1 + I * 0.6 * w.accent;
        w.r *= 1 - I * 0.2 * w.accent;
        w.g *= 1 + I * 0.22 * w.accent;
      } else if (!w.content) {
        // little words are quicker and lower
        w.r *= 1 + I * 0.16;
        w.p0 *= 1 - I * 0.06; w.p1 *= 1 - I * 0.08;
        w.g *= 1 - I * 0.08;
      }
      // the word after an accent starts low (pitch reset)
      const prev = ph[wi - 1];
      if (prev?.accent) w.p0 *= 1 - I * 0.12 * prev.accent;
      // natural wobble
      const j = rand(-1, 1) * 0.07 * I;
      w.p0 *= 1 + j; w.p1 *= 1 + j * 0.6;
      w.r *= 1 + rand(-1, 1) * 0.1 * I;
      if (wi === ph.length - 1) {
        w.r *= 1 - I * 0.2; // phrase-final lengthening
        if (lastPhrase) {
          if (question) { w.p1 *= 1.08 + I * 0.62; w.p0 *= 1 + I * 0.08; } // question: big rise at the end
          else if (exclaim) { w.p0 *= 1 + I * 0.28; w.p1 *= 1 - I * 0.22; } // exclaim: high then drop
          else { w.p1 *= 1 - I * 0.34; } // statement: fall to the end
        } else {
          w.p1 *= 1 + I * 0.16; // "continuation" rise before a comma
        }
        w.pause = /[.!?]/.test(w.punct) ? 0.12 + 0.3 * I : /[…~]/.test(w.punct) ? 0.3 + 0.3 * I : /[,;:]/.test(w.punct) ? 0.06 + 0.22 * I : 0.01 + 0.05 * I;
      }
    });
  });

  // ---- emotion shape (per mood)
  const t = mood in MOODS ? mood : 'neutral';
  words.forEach((w, i) => {
    const pos = w.pos;
    switch (t) {
      case 'happy': { // bouncy up-down, brighter on stressed words, rising end
        const b = (i % 2 ? 1 : -0.7) * 0.2 * Ex;
        w.p0 *= 1 + b; w.p1 *= 1 + b * 0.5 + (w.accent ? 0.12 * Ex : 0);
        if (i === words.length - 1) w.p1 *= 1 + 0.16 * Ex;
        w.r *= 1 + 0.06 * Ex * (i % 2);
        break;
      }
      case 'love': { // dreamy sing-song arc, drawn out
        const arc = Math.sin(pos * Math.PI) * 0.18 * Ex;
        w.p0 *= 1 + arc; w.p1 *= 1 + arc + 0.1 * Ex;
        if (w.accent) w.r *= 1 - 0.22 * Ex;
        break;
      }
      case 'sad': { // sinks and slows down toward the end, fading
        w.p0 *= 1 - 0.2 * Ex * pos; w.p1 *= 1 - 0.26 * Ex * pos;
        w.r *= 1 - 0.2 * Ex * pos;
        w.g *= 1 - 0.32 * Ex * pos;
        w.pause += 0.08 * Ex;
        break;
      }
      case 'angry': { // hard punches on stressed words, clipped quick little words
        if (w.content) { w.p0 *= 1 + 0.22 * Ex; w.p1 *= 1 + 0.06 * Ex; w.g *= 1 + 0.3 * Ex; w.r *= 1 + 0.06 * Ex; }
        else { w.r *= 1 + 0.2 * Ex; w.p0 *= 1 - 0.06 * Ex; w.p1 *= 1 - 0.06 * Ex; }
        if (i === words.length - 1 && !question) w.p1 *= 1 - 0.2 * Ex;
        break;
      }
      case 'scared': { // shaky, rushing faster and higher as it goes
        const j = rand(-1, 1) * 0.14 * Ex;
        w.p0 *= 1 + j + 0.12 * Ex * pos; w.p1 *= 1 - j * 0.5 + 0.18 * Ex * pos;
        w.r *= 1 + 0.25 * Ex * pos;
        break;
      }
      case 'shy': { // hesitant start, trails off quieter and slower
        if (i === 0) w.pause += 0.2 * Ex;
        w.r *= 1 - 0.3 * Ex * pos;
        w.g *= 1 - 0.4 * Ex * pos;
        w.p1 *= 1 - 0.12 * Ex * pos;
        break;
      }
      case 'hurt': { // a sharp "ow" on the first word, then low and strained
        if (i === 0) { w.p0 *= 1 + 0.4 * Ex; w.p1 *= 1 + 0.1 * Ex; w.g *= 1 + 0.2 * Ex; w.pause += 0.12 * Ex; }
        else { w.p0 *= 1 - 0.1 * Ex; w.p1 *= 1 - 0.14 * Ex; w.r *= 1 - 0.12 * Ex; }
        break;
      }
      case 'smug': { // slow, drawn-out stressed words with a rise-fall
        if (w.accent || w.content) { w.r *= 1 - 0.32 * Ex; w.p0 *= 1 + 0.16 * Ex; w.p1 *= 1 - 0.14 * Ex; }
        break;
      }
      default: { // neutral: lively emphasis on a few words
        if (w.content && Math.random() < 0.5) { const e = rand(0.5, 1) * Ex; w.p1 *= 1 + 0.16 * e; w.p0 *= 1 + 0.05 * e; w.r *= 1 - 0.12 * e; w.g *= 1 + 0.1 * e; }
        w.p0 *= 1 + rand(-1, 1) * 0.05 * Ex;
        w.r *= 1 + rand(-1, 1) * 0.07 * Ex;
      }
    }
    w.pause = Math.max(0, w.pause + m.pause * E);
    w.p0 = clamp(w.p0, 0.45, 2.4); w.p1 = clamp(w.p1, 0.45, 2.4);
    w.r = clamp(w.r, 0.45, 2); w.g = clamp(w.g, 0.3, 1.8);
  });

  const chunks = phrases.map((ph, pi) => {
    const p = Math.exp(ph.reduce((s, w) => s + Math.log((w.p0 + w.p1) / 2), 0) / ph.length);
    const r = ph.reduce((s, w) => s + w.r * w.syl, 0) / ph.reduce((s, w) => s + w.syl, 0);
    const g = ph.reduce((s, w) => s + w.g, 0) / ph.length;
    return { text: ph.map((w) => w.text).join(' '), words: ph, p, r, g, pauseAfter: ph[ph.length - 1].pause, final: pi === phrases.length - 1 };
  });

  return {
    pitch: mix(m.p, Ex),
    rate: mix(m.r, Ex),
    gain: mix(m.g, E),
    tremble: { depth: m.tremble * Ex, speed: t === 'scared' ? 9 : 6 },
    question,
    words,
    chunks,
  };
}

/** Sample the plan at a position 0..1 through the line (used by babble). */
export function prosodyAt(plan, pos) {
  const ws = plan.words;
  if (!ws.length) return { p: 1, r: 1, g: 1, pause: 0 };
  const total = ws.reduce((s, w) => s + w.syl, 0);
  let acc = 0;
  for (const w of ws) {
    const span = w.syl / total;
    if (pos <= acc + span || w === ws[ws.length - 1]) {
      const f = clamp((pos - acc) / span, 0, 1);
      return { p: w.p0 + (w.p1 - w.p0) * f, r: w.r, g: w.g, word: w };
    }
    acc += span;
  }
  return { p: 1, r: 1, g: 1 };
}
