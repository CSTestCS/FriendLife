// Voice editor: everything about how a resident sounds.
import { h, openModal } from './dom.js';
import { VOICE_PRESETS, VERBAL_TICS, BABBLE_WAVES, SYNTH_VOICES, SYNTH_ACCENTS, PITCH_MIN, PITCH_MAX, normVoice, stylizeLine } from '../engine/voice.js';
import { pick } from '../core/util.js';

const SAMPLE_LINES = [
  'Hi! I\'m {name}! {catch}',
  'Have you ever tried strawberry cake? It\'s amazing!',
  'Do you think ghosts are real?',
  'I can\'t believe it! This is the best day ever!',
  'Hmph. Leave me alone.',
];

/** Edits `voice` in place. ctx = {name, catchphrase}. onChange called after edits. */
export function openVoiceEditor(app, voice, ctx = {}, onChange) {
  const sim = app.sim;
  Object.assign(voice, normVoice(voice));
  let testText = SAMPLE_LINES[0].replace('{name}', ctx.name || 'a resident').replace('{catch}', ctx.catchphrase || '');
  let mood = 'neutral';
  const m = openModal({
    title: `🎙️ Voice — ${ctx.name || 'resident'}`,
    wide: true,
    body: (b) => {
      const render = () => {
        b.innerHTML = '';
        const changed = () => onChange?.(voice);
        // pitch uses a log scale so ×0.25 … ×4 are equally easy to reach
        const pitchSlider = () => {
          const fmt = (x) => `×${x.toFixed(2)}`;
          const out = h('b', {}, fmt(+voice.pitch));
          const warn = h('span', { class: 'hint' }, voice.engine === 'system' && voice.pitch > 2 ? ' system voices stop at ×2' : '');
          return h('div', { class: 'trait', title: 'How high or low. Built-in voice: ×0.25 (giant) to ×4 (chipmunk).' }, h('span', { class: 'lo' }, 'Pitch'),
            h('input', { type: 'range', min: Math.log2(PITCH_MIN), max: Math.log2(PITCH_MAX), step: 0.01, value: Math.log2(voice.pitch), oninput: (e) => {
              voice.pitch = +(2 ** +e.target.value).toFixed(2);
              out.textContent = fmt(voice.pitch);
              warn.textContent = voice.engine === 'system' && voice.pitch > 2 ? ' system voices stop at ×2' : '';
              changed();
            }, onchange: () => speak('speech') }), out, warn);
        };
        const sl = (label, key, min, max, step = 0.01, hint = '') => {
          const out = h('b', {}, (+voice[key]).toFixed(2));
          return h('div', { class: 'trait', title: hint }, h('span', { class: 'lo' }, label),
            h('input', { type: 'range', min, max, step, value: voice[key], oninput: (e) => { voice[key] = +e.target.value; out.textContent = (+e.target.value).toFixed(2); changed(); }, onchange: () => { if (['rate', 'intonation', 'emotion'].includes(key)) speak('speech'); } }), out);
        };
        // presets
        b.append(h('div', { class: 'lbl' }, 'Presets'), h('div', { class: 'row', style: { marginBottom: '10px' } },
          ...Object.entries(VOICE_PRESETS).map(([k, p]) => h('button', { class: 'small', onclick: () => { const { label, ...vals } = p; Object.assign(voice, vals); if (k === 'whisper') voice.synthVoice = /^f/.test(voice.synthVoice) ? 'whisperf' : 'whisper'; changed(); render(); speak('speech'); } }, p.label)),
          h('button', { class: 'small', onclick: () => {
            Object.assign(voice, { pitch: +(2 ** (Math.random() * 3.2 - 1.6)).toFixed(2), synthVoice: pick(Object.keys(SYNTH_VOICES)), rate: +(Math.random() * 0.8 + 0.75).toFixed(2), intonation: +Math.random().toFixed(2), emotion: +Math.random().toFixed(2), babble: +(Math.random() * 1.3 + 0.6).toFixed(2), wave: pick(BABBLE_WAVES), formant: +(Math.random() * 1 + 0.6).toFixed(2), bSpeed: +(Math.random() * 0.9 + 0.7).toFixed(2), range: +Math.random().toFixed(2), vibrato: +(Math.random() * 0.5).toFixed(2), breath: +(Math.random() * 0.4).toFixed(2) });
            changed(); render(); speak('speech');
          } }, '🎲 Random')));

        const left = h('div', {});
        const right = h('div', {});
        b.append(h('div', { class: 'grid2' }, left, right));
        const voices = sim.voice.voiceList();
        const engineBtn = (k, l, title) => h('button', { class: `small ${voice.engine === k ? 'active' : ''}`, title, onclick: () => { voice.engine = k; changed(); render(); speak('speech'); } }, l);
        left.append(h('h3', {}, '🗣️ Speech'),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Engine'),
            engineBtn('synth', '🎛️ Built-in', 'Built-in synthesizer: extreme pitch (×0.25–×4) and full intonation / emotion'),
            voices.length ? engineBtn('system', '💻 System voice', 'Your computer\'s text-to-speech voices: more natural, pitch limited to ×2') : null),
          voice.engine === 'system' && voices.length
            ? h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Voice'), selectEl([['', 'System default'], ...voices.map((v) => [v.name, `${v.name} (${v.lang})`])], voice.voiceName || '', (v) => { voice.voiceName = v; changed(); speak('speech'); }))
            : h('div', { class: 'row' },
              h('span', { class: 'lbl' }, 'Voice'), selectEl(Object.entries(SYNTH_VOICES), voice.synthVoice || 'm3', (v) => { voice.synthVoice = v; changed(); speak('speech'); }),
              h('span', { class: 'lbl' }, 'Accent'), selectEl(Object.entries(SYNTH_ACCENTS), voice.accent || 'en-us', (v) => { voice.accent = v; changed(); speak('speech'); })),
          pitchSlider(),
          sl('Speed', 'rate', 0.4, 2.5),
          sl('Volume', 'volume', 0.1, 1),
          sl('Intonation', 'intonation', 0, 1, 0.01, 'How much pitch and speed move through a sentence: more stressed words, bigger rises and falls, longer pauses (questions rise, statements fall)'),
          sl('Emotion', 'emotion', 0, 1, 0.01, 'How strongly their mood shapes the voice (happy bounces higher, sad sinks and slows, angry punches words, scared trembles…)'),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Uses'),
            ...[['auto', 'Island setting'], ['speech', 'Always speech'], ['babble', 'Always babble'], ['mute', 'Silent']].map(([k, l]) => h('button', { class: `small ${voice.mode === k ? 'active' : ''}`, onclick: () => { voice.mode = k; changed(); render(); } }, l))),
        );
        right.append(h('h3', {}, '🎶 Babble'),
          sl('Tone', 'babble', 0.4, 2.2),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Wave'), ...BABBLE_WAVES.map((w) => h('button', { class: `small ${voice.wave === w ? 'active' : ''}`, onclick: () => { voice.wave = w; changed(); render(); speak('babble'); } }, w))),
          sl('Vowel colour', 'formant', 0.5, 2, 0.01, 'Formant: lower sounds rounder, higher sounds brighter'),
          sl('Babble speed', 'bSpeed', 0.5, 2),
          sl('Pitch range', 'range', 0, 1),
          sl('Vibrato', 'vibrato', 0, 1),
          sl('Breathiness', 'breath', 0, 1),
        );
        b.append(h('h3', {}, '💬 Speech quirks'), h('div', { class: 'row' },
          h('span', { class: 'lbl' }, 'Verbal tic'),
          h('input', { type: 'text', value: voice.tic || '', placeholder: 'e.g. nya, dude, desu', list: 'tics', maxLength: 16, style: { width: '150px' }, oninput: (e) => { voice.tic = e.target.value.trim(); changed(); } }),
          h('datalist', { id: 'tics' }, ...VERBAL_TICS.filter(Boolean).map((t) => h('option', { value: t }))),
        ), sl('Tic how often', 'ticChance', 0, 1), sl('Stutter', 'stutter', 0, 1, 0.01, 'Chance to stutter at the start of a line'));

        b.append(h('h3', {}, '🔊 Test'), h('div', { class: 'row' },
          h('input', { type: 'text', value: testText, style: { flex: 1, minWidth: '240px' }, oninput: (e) => { testText = e.target.value; } }),
          selectEl([['neutral', '😐 Neutral'], ['happy', '😊 Happy'], ['love', '😍 In love'], ['sad', '😢 Sad'], ['angry', '😠 Angry'], ['scared', '😨 Scared'], ['shy', '😳 Shy'], ['hurt', '🤕 Hurt'], ['smug', '😏 Smug']], mood, (v) => { mood = v; speak('speech'); }),
          h('button', { class: 'small primary', onclick: () => speak('speech') }, '🗣️ Speak'),
          h('button', { class: 'small', onclick: () => speak('babble') }, '🎶 Babble'),
          h('button', { class: 'small', onclick: () => { testText = pick(SAMPLE_LINES).replace('{name}', ctx.name || 'a resident').replace('{catch}', ctx.catchphrase || ''); render(); } }, '🎲 Line'),
        ));
      };
      render();
    },
    foot: (f) => f.append(h('button', { class: 'primary', onclick: () => m.close() }, 'Done')),
  });

  function speak(mode) {
    sim.audio.start();
    sim.voice.speak(stylizeLine(testText, voice), voice, { mode, force: true, mood });
  }
  return m;
}

function selectEl(options, value, onChange) {
  const s = h('select', { onchange: (e) => onChange(e.target.value) });
  for (const [v, label] of options) s.append(h('option', { value: v, selected: v === value }, label));
  return s;
}
