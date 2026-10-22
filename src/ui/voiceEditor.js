// Voice editor: everything about how a resident sounds.
import { h, openModal } from './dom.js';
import { VOICE_PRESETS, VERBAL_TICS, BABBLE_WAVES, normVoice, stylizeLine } from '../engine/voice.js';
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
        const sl = (label, key, min, max, step = 0.01, hint = '') => {
          const out = h('b', {}, (+voice[key]).toFixed(2));
          return h('div', { class: 'trait', title: hint }, h('span', { class: 'lo' }, label),
            h('input', { type: 'range', min, max, step, value: voice[key], oninput: (e) => { voice[key] = +e.target.value; out.textContent = (+e.target.value).toFixed(2); changed(); } }), out);
        };
        // presets
        b.append(h('div', { class: 'lbl' }, 'Presets'), h('div', { class: 'row', style: { marginBottom: '10px' } },
          ...Object.entries(VOICE_PRESETS).map(([k, p]) => h('button', { class: 'small', onclick: () => { const { label, ...vals } = p; Object.assign(voice, vals); changed(); render(); speak('speech'); } }, p.label)),
          h('button', { class: 'small', onclick: () => {
            Object.assign(voice, { pitch: +(Math.random() * 1.6 + 0.3).toFixed(2), rate: +(Math.random() * 0.8 + 0.75).toFixed(2), intonation: +Math.random().toFixed(2), emotion: +Math.random().toFixed(2), babble: +(Math.random() * 1.3 + 0.6).toFixed(2), wave: pick(BABBLE_WAVES), formant: +(Math.random() * 1 + 0.6).toFixed(2), bSpeed: +(Math.random() * 0.9 + 0.7).toFixed(2), range: +Math.random().toFixed(2), vibrato: +(Math.random() * 0.5).toFixed(2), breath: +(Math.random() * 0.4).toFixed(2) });
            changed(); render(); speak('speech');
          } }, '🎲 Random')));

        const left = h('div', {});
        const right = h('div', {});
        b.append(h('div', { class: 'grid2' }, left, right));
        const voices = sim.voice.voiceList();
        left.append(h('h3', {}, '🗣️ Speech (text-to-speech)'),
          voices.length
            ? h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Voice'), selectEl([['', 'System default'], ...voices.map((v) => [v.name, `${v.name} (${v.lang})`])], voice.voiceName || '', (v) => { voice.voiceName = v; changed(); }))
            : h('div', { class: 'hint' }, 'No text-to-speech voices on this system; babble is used instead.'),
          sl('Pitch', 'pitch', 0.1, 2, 0.01, 'How high or low'),
          sl('Speed', 'rate', 0.5, 2, 0.01),
          sl('Volume', 'volume', 0.1, 1),
          sl('Intonation', 'intonation', 0, 1, 0.01, 'How much the pitch moves through a sentence (questions rise)'),
          sl('Emotion', 'emotion', 0, 1, 0.01, 'How much their mood changes their voice (happy = higher & faster, sad = lower & slower…)'),
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
          selectEl([['neutral', '😐 Neutral'], ['happy', '😊 Happy'], ['sad', '😢 Sad'], ['angry', '😠 Angry'], ['scared', '😨 Scared'], ['shy', '😳 Shy']], mood, (v) => { mood = v; }),
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
