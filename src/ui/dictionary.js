// Island dictionary: the words residents have been taught (Tomodachi-style).
// Words are used in conversations, jokes, insults and compliments. A
// pronunciation can be given for the text-to-speech voices.
import { h, openModal, toast } from './dom.js';
import { TERM_CATEGORIES } from '../sim/dialogue.js';

/** Small form: word + pronunciation. Resolves {text, say} or null. */
export function askWord(app, title, question) {
  return new Promise((resolve) => {
    let done = false;
    const word = h('input', { type: 'text', maxLength: 40, placeholder: 'Type a word or phrase', style: { width: '100%' } });
    const say = h('input', { type: 'text', maxLength: 60, placeholder: 'Pronunciation (optional, for voices)', style: { width: '100%' } });
    const ok = () => { if (!word.value.trim()) return toast('Type a word first.'); done = true; m.close(); resolve({ text: word.value.trim(), say: say.value.trim() }); };
    const m = openModal({
      title,
      body: (b) => {
        if (question) b.append(h('p', {}, h('b', {}, question)));
        b.append(h('div', { class: 'field' }, word), h('div', { class: 'field' }, say,
          h('div', { class: 'row' }, h('button', { class: 'small', onclick: () => app.sim.voice.speak(say.value || word.value, {}, { mode: app.sim.settings.voice === 'off' ? 'babble' : app.sim.settings.voice, force: true }) }, '🔊 Hear it'))));
        word.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
        setTimeout(() => word.focus(), 50);
      },
      foot: (f) => f.append(h('button', { onclick: () => m.close() }, 'Cancel'), h('button', { class: 'primary', onclick: ok }, 'Teach')),
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

export function openDictionary(app) {
  const sim = app.sim;
  const dl = sim.dialogue;
  const m = openModal({
    title: '📖 Island Dictionary',
    wide: true,
    body: (b) => {
      const render = () => {
        b.innerHTML = '';
        b.append(h('p', { class: 'hint' }, 'Residents use these words when they chat, joke, compliment and insult each other. They ask you to teach them new words (📖 bubbles), or add words here. Each category has a few built-in words until you add your own.'));
        const grid = h('div', { class: 'grid2' });
        for (const [cat, def] of Object.entries(TERM_CATEGORIES)) {
          const card = h('div', { class: 'card' });
          card.append(h('div', { class: 'row' }, h('b', {}, `${def.icon} ${def.label}`), h('span', { class: 'hint' }, `— ${def.ask}`),
            h('button', { class: 'small primary', style: { marginLeft: 'auto' }, onclick: async () => {
              const w = await askWord(app, `New word: ${def.label}`, `Something for “${def.ask}”`);
              if (w) { dl.addTerm(cat, w.text, w.say, null); render(); }
            } }, '＋')));
          const tags = h('div', { class: 'tagrow', style: { marginTop: '6px' } });
          const list = dl.terms[cat] || [];
          if (!list.length) tags.append(h('span', { class: 'hint' }, `built-in: ${def.defaults.slice(0, 3).join(', ')}…`));
          for (const t of list) {
            const by = t.by ? sim.byId(t.by)?.name : null;
            tags.append(h('span', { class: 'tag', title: `${t.say ? `Says: ${t.say}. ` : ''}${by ? `Taught to ${by}` : 'Added by you'}` },
              t.text, by ? h('span', { class: 'hint' }, ` (${by})`) : null,
              h('button', { class: 'small', title: 'Hear it', onclick: () => sim.voice.speak(t.say || t.text, {}, { mode: sim.settings.voice === 'off' ? 'babble' : sim.settings.voice, force: true }) }, '🔊'),
              h('button', { class: 'small', title: 'Remove', onclick: () => { dl.removeTerm(cat, t.id); render(); } }, '✕')));
          }
          card.append(tags);
          grid.append(card);
        }
        b.append(grid);
      };
      render();
    },
  });
  return m;
}
