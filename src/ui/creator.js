// Create / edit a resident: name, personality, avatar (built-in doll or an
// imported VRM + variant), outfit (another VRM's clothing parts) and size.
import { h, openModal, toast, pickFiles, esc } from './dom.js';
import { TRAITS, personalityLabel, FOODS, CATCHPHRASES, DOLL_PALETTES } from '../sim/data.js';
import { newResidentData, randomTraits, randomDoll } from '../sim/resident.js';
import { defaultVoice } from '../engine/voice.js';
import { openVoiceEditor } from './voiceEditor.js';
import { HAIR_STYLES, BOTTOM_STYLES, DOLL_DEFAULTS } from '../characters/rig.js';
import { Avatar } from '../characters/avatar.js';
import { parseVRM, disposeVRM } from '../characters/loaders.js';

export async function outfitParts(library, assetId) {
  const meta = library.getMeta(assetId);
  if (meta.parts) return meta.parts;
  const vrm = await parseVRM(await library.getData(assetId));
  const parts = Avatar.listParts(vrm);
  disposeVRM(vrm);
  await library.setMeta(assetId, { ...library.getMeta(assetId), parts });
  return parts;
}

export function openCreator(app, res = null, preset = {}) {
  const sim = app.sim;
  const lib = sim.library;
  const editing = !!res;
  const d = res ? JSON.parse(JSON.stringify(res.d)) : { ...newResidentData(sim.randomName()), ...preset };
  if (!d.look.doll) d.look.doll = randomDoll(d.gender);

  const m = openModal({
    title: editing ? `Edit ${d.name}` : 'New Resident',
    wide: true,
    body: (b) => {
      const left = h('div', {});
      const right = h('div', {});
      b.append(h('div', { class: 'grid2' }, left, right));

      // --- identity
      left.append(
        h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { type: 'text', value: d.name, maxLength: 20, oninput: (e) => { d.name = e.target.value; } })),
        h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', {}, 'Gender'), select([['m', 'Male'], ['f', 'Female'], ['x', 'Non-binary']], d.gender, (v) => { d.gender = v; })),
          h('div', { class: 'field', style: { flex: 1 } }, h('label', {}, 'Catchphrase'), h('input', { type: 'text', value: d.catchphrase, list: 'cps', oninput: (e) => { d.catchphrase = e.target.value; } }),
            h('datalist', { id: 'cps' }, ...CATCHPHRASES.map((c) => h('option', { value: c })))),
        ),
      );

      // --- personality
      const pLabel = h('b', {}, personalityLabel(d.traits));
      const traitBox = h('div', {});
      const renderTraits = () => {
        traitBox.innerHTML = '';
        for (const t of TRAITS) {
          traitBox.append(h('div', { class: 'trait' }, h('span', { class: 'lo' }, t.lo),
            h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: d.traits[t.key], oninput: (e) => { d.traits[t.key] = +e.target.value; pLabel.textContent = personalityLabel(d.traits); } }),
            h('span', { class: 'hi' }, t.hi)));
        }
      };
      renderTraits();
      left.append(h('div', { class: 'field' }, h('label', {}, 'Personality: ', pLabel),
        traitBox, h('div', {}, h('button', { class: 'small', onclick: () => { d.traits = randomTraits(); renderTraits(); pLabel.textContent = personalityLabel(d.traits); } }, '🎲 Randomize')),
        h('div', { class: 'hint' }, 'Temper & kindness drive arguments and fights. Sociability drives chatting. Confidence affects fighting and confessing.')));

      // --- voice
      d.voice ||= defaultVoice(d.gender);
      const vbox = h('div', { class: 'card', style: { marginBottom: '10px' } },
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Name pronunciation'), h('input', { type: 'text', value: d.sayName || '', placeholder: d.name, style: { flex: 1 }, oninput: (e) => { d.sayName = e.target.value; } })),
        h('div', { class: 'row' },
          h('button', { class: 'small primary', onclick: () => openVoiceEditor(app, d.voice, { name: d.sayName || d.name, catchphrase: d.catchphrase }) }, '🎙️ Voice editor…'),
          h('button', { class: 'small', onclick: () => { sim.audio.start(); sim.voice.speak(`Hi! I'm ${d.sayName || d.name}! ${d.catchphrase}`, d.voice, { mode: 'speech', force: true }); } }, '🔊 Test')),
        h('div', { class: 'hint' }, 'Pitch, speed, intonation, emotion, presets, verbal tics, babble tone…'));
      left.append(h('div', { class: 'field' }, h('label', {}, 'Voice'), vbox));

      // --- foods
      const foodOpts = FOODS.map((f) => [f.id, `${f.icon} ${f.name}`]);
      left.append(h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', {}, 'Favourite food'), select(foodOpts, d.favFood, (v) => { d.favFood = v; })),
        h('div', { class: 'field' }, h('label', {}, 'Hated food'), select(foodOpts, d.hatedFood, (v) => { d.hatedFood = v; })),
      ));

      // --- appearance
      const appearance = h('div', {});
      right.append(h('div', { class: 'field' }, h('label', {}, 'Appearance'),
        h('div', { class: 'row' },
          h('button', { class: d.look.kind === 'doll' ? 'active' : '', onclick: () => { d.look.kind = 'doll'; renderAppearance(); } }, '🧸 Built-in doll'),
          h('button', { class: d.look.kind === 'vrm' ? 'active' : '', onclick: () => { d.look.kind = 'vrm'; renderAppearance(); } }, '🧍 VRoid / VRM model'),
        )), appearance);

      const renderAppearance = () => {
        [...right.querySelectorAll('.field > .row > button')].slice(0, 2).forEach((btn, i) => btn.classList.toggle('active', (i === 0) === (d.look.kind === 'doll')));
        appearance.innerHTML = '';
        if (d.look.kind === 'doll') {
          const doll = d.look.doll;
          for (const key of ['skin', 'hair', 'top', 'bottom', 'shoes']) {
            const row = h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', { class: 'lbl', style: { width: '60px' } }, key));
            const picker = h('input', { type: 'color', value: doll[key], oninput: (e) => { doll[key] = e.target.value; } });
            for (const c of DOLL_PALETTES[key]) row.append(h('span', { class: 'swatch', style: { background: c }, onclick: () => { doll[key] = c; picker.value = c; } }));
            row.append(picker);
            appearance.append(row);
          }
          appearance.append(h('div', { class: 'row' },
            h('div', { class: 'field' }, h('label', {}, 'Hair'), select(HAIR_STYLES.map((s) => [s, s]), doll.hairStyle, (v) => { doll.hairStyle = v; })),
            h('div', { class: 'field' }, h('label', {}, 'Bottoms'), select(BOTTOM_STYLES.map((s) => [s, s]), doll.bottomStyle, (v) => { doll.bottomStyle = v; })),
          ));
          appearance.append(slider('Height', doll.height ?? 1, 0.8, 1.2, (v) => { doll.height = v; }), slider('Build', doll.build ?? 1, 0.8, 1.25, (v) => { doll.build = v; }));
          appearance.append(h('button', { class: 'small', onclick: () => { d.look.doll = randomDoll(d.gender); renderAppearance(); } }, '🎲 Random look'));
        } else {
          const chars = lib.list('character').filter((c) => !lib.getMeta(c.id).owner || lib.getMeta(c.id).owner === d.id);
          if (!chars.length) {
            appearance.append(h('div', { class: 'card' }, h('p', {}, 'No VRM characters imported yet.'), importBtn('character', () => renderAppearance())));
            return;
          }
          if (!d.look.assetId || !lib.get(d.look.assetId)) d.look.assetId = chars[0].id;
          appearance.append(h('div', { class: 'field' }, h('label', {}, 'Character model (.vrm)'),
            h('div', { class: 'row' }, select(chars.map((c) => [c.id, lib.displayName(c.id)]), d.look.assetId, (v) => { d.look.assetId = v; d.look.variantId = null; renderAppearance(); }), importBtn('character', () => renderAppearance()))));
          const vars = lib.variants(d.look.assetId);
          appearance.append(h('div', { class: 'field' }, h('label', {}, 'Variant'),
            select([['', 'Default'], ...vars.map((v) => [v.id, v.name])], d.look.variantId || '', (v) => { d.look.variantId = v || null; }),
            h('div', { class: 'hint' }, 'Variants are texture swaps / colour tints / hidden parts saved from the 👕 Wardrobe.')));
        }
        appearance.append(slider('Size', d.scale ?? 1, 0.75, 1.25, (v) => { d.scale = v; }));
        renderOutfit();
      };

      // --- outfit
      const outfitBox = h('div', {});
      right.append(h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, 'Outfit (clothing from another VRM)'), outfitBox));
      const renderOutfit = async () => {
        outfitBox.innerHTML = '';
        const outfits = lib.list('outfit');
        const row = h('div', { class: 'row' }, select([['', 'None (model\'s own clothes)'], ...outfits.map((o) => [o.id, lib.displayName(o.id)])], d.outfit?.assetId || '', (v) => {
          d.outfit = v ? { assetId: v, variantId: null, parts: null, hideBase: [] } : null;
          renderOutfit();
        }), importBtn('outfit', () => renderOutfit()));
        outfitBox.append(row);
        if (!d.outfit) {
          outfitBox.append(h('div', { class: 'hint' }, 'Import a VRoid model wearing the clothes you want as an "Outfit". Its Tops/Bottoms/Shoes/Accessory parts are fitted onto this resident.'));
          return;
        }
        const vars = lib.variants(d.outfit.assetId);
        outfitBox.append(h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'lbl' }, 'Variant'),
          select([['', 'Default'], ...vars.map((v) => [v.id, v.name])], d.outfit.variantId || '', (v) => { d.outfit.variantId = v || null; })));
        const partsEl = h('div', { class: 'hint' }, 'Reading outfit parts…');
        outfitBox.append(partsEl);
        try {
          const parts = await outfitParts(lib, d.outfit.assetId);
          const chosen = new Set(d.outfit.parts || Avatar.defaultOutfitParts(parts));
          partsEl.innerHTML = '<div class="lbl">Parts to wear</div>';
          const list = h('div', { class: 'tagrow' });
          for (const p of parts) {
            const cb = h('input', { type: 'checkbox', checked: chosen.has(p.key), onchange: (e) => { if (e.target.checked) chosen.add(p.key); else chosen.delete(p.key); d.outfit.parts = [...chosen]; } });
            list.append(h('label', { class: 'tag' }, cb, ` ${p.category}: ${p.key.replace(/^N\d+_\d+_\d+_/, '').slice(0, 28)}`));
          }
          partsEl.append(list);
          d.outfit.parts = [...chosen];
          partsEl.append(h('div', { class: 'hint' }, 'Tip: in the Wardrobe you can hide the model\'s own clothing parts so they don\'t poke through.'));
        } catch (err) {
          partsEl.textContent = `Could not read outfit: ${err.message}`;
        }
      };

      function importBtn(type, after) {
        return h('button', { class: 'small blue', onclick: async () => {
          const files = await pickFiles('.vrm', false);
          if (!files.length) return;
          try {
            const a = await lib.importFile(files[0], type);
            if (type === 'character') { d.look.assetId = a.id; d.look.variantId = null; }
            else d.outfit = { assetId: a.id, variantId: null, parts: null, hideBase: [] };
            toast(`Imported ${a.name}`);
            after();
          } catch (err) { toast(err.message); }
        } }, '⬆ Import .vrm');
      }

      renderAppearance();
    },
    foot: (f) => {
      f.append(h('button', { onclick: () => m.close() }, 'Cancel'), h('button', { class: 'primary', onclick: save }, editing ? '💾 Save' : '🏡 Move in!'));
    },
  });

  async function save() {
    if (!d.name.trim()) return toast('Give them a name!');
    m.close();
    if (editing) {
      const avatarChanged = JSON.stringify([res.d.look, res.d.outfit, res.d.scale]) !== JSON.stringify([d.look, d.outfit, d.scale]);
      const renamed = res.d.name !== d.name;
      Object.assign(res.d, { voice: d.voice, sayName: d.sayName, name: d.name, gender: d.gender, catchphrase: d.catchphrase, traits: d.traits, favFood: d.favFood, hatedFood: d.hatedFood, look: d.look, outfit: d.outfit, scale: d.scale });
      if (renamed) { sim.island.renameHouse(sim.island.houseOf(res.id), d.name); sim.rooms?.refreshHalls(); }
      if (avatarChanged) {
        toast('Updating look…');
        await sim.rebuildAvatar(res);
        sim.problems.newLook(res);
      }
      sim.emit('residents');
      sim.emit('resident', res);
    } else {
      const r = await sim.addResident(d);
      sim.select(r);
    }
  }
}

function select(options, value, onChange) {
  const s = h('select', { onchange: (e) => onChange(e.target.value) });
  for (const [v, label] of options) s.append(h('option', { value: v, selected: v === value }, label));
  return s;
}

function slider(label, value, min, max, onChange) {
  const out = h('b', {}, value.toFixed(2));
  return h('div', { class: 'trait' }, h('span', { class: 'lo' }, label), h('input', { type: 'range', min, max, step: 0.01, value, oninput: (e) => { onChange(+e.target.value); out.textContent = (+e.target.value).toFixed(2); } }), out);
}

export { select, slider };
