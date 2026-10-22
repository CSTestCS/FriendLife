// Wardrobe: re-texture, tint or hide any material slot of a resident's
// avatar or outfit, live. Save the result just for this resident, or as a
// named variant of the character / outfit asset so others can reuse it.
import { h, openModal, toast, pickFiles, prompt, esc } from './dom.js';

export function openWardrobe(app, res, onDone) {
  const sim = app.sim;
  const lib = sim.library;
  if (!res.avatar) return toast('Avatar still loading…');
  const ap = res.appearance(); // main look or the personal outfit being worn
  const before = JSON.stringify(ap.custom);
  // Work on the per-resident override layer, starting from the composed look so
  // variant values are visible and editable.
  const work = res.composeLook();
  let changed = false;

  const m = openModal({
    title: `👕 Wardrobe — ${res.name}${res.d.wearing >= 0 ? ` (${res.d.outfits[res.d.wearing]?.name})` : ''}`,
    wide: true,
    body: (b) => {
      const slotsBox = h('div', {});
      const head = h('div', { class: 'row', style: { marginBottom: '10px' } },
        h('button', { class: 'small blue', onclick: async () => {
          const files = await pickFiles('.png,.jpg,.jpeg,.webp');
          for (const f of files) { try { await lib.importFile(f, 'texture'); } catch (e) { toast(e.message); } }
          if (files.length) { toast(`Imported ${files.length} texture(s)`); render(); }
        } }, '⬆ Import texture'),
        h('button', { class: 'small', onclick: () => app.openCreator(res) }, '🔁 Change model / outfit…'),
        h('span', { class: 'hint' }, res.avatar.kind === 'vrm' ? 'VRoid textures use the model\'s UV layout — edit a texture exported from VRoid Studio and import it here.' : 'Doll slots accept any tiling texture or pattern.'),
      );
      b.append(head, slotsBox);
      const textures = () => lib.list('texture');
      const render = () => {
        slotsBox.innerHTML = '';
        slotsBox.append(h('div', { class: 'slot-row', style: { fontWeight: 800 } }, h('span', {}, 'Part'), h('span', {}, 'Texture'), h('span', {}, 'Tint'), h('span', {}, 'Hide')));
        const slots = res.avatar.materialSlots();
        let lastCat = null;
        for (const s of slots.sort((a, b) => (a.outfit ? 1 : 0) - (b.outfit ? 1 : 0) || a.category.localeCompare(b.category))) {
          if (s.category !== lastCat) { slotsBox.append(h('div', { class: 'lbl', style: { marginTop: '8px' } }, `${s.outfit ? 'Outfit · ' : ''}${s.category}`)); lastCat = s.category; }
          const texSel = h('select', { onchange: (e) => { if (e.target.value) work.textures[s.key] = e.target.value; else delete work.textures[s.key]; apply(); } },
            h('option', { value: '' }, 'Original'), ...textures().map((t) => h('option', { value: t.id, selected: work.textures[s.key] === t.id }, lib.displayName(t.id))));
          const tint = h('input', { type: 'color', value: work.tints[s.key] || '#ffffff', oninput: (e) => { work.tints[s.key] = e.target.value; if (e.target.value.toLowerCase() === '#ffffff') delete work.tints[s.key]; apply(); } });
          const hide = h('input', { type: 'checkbox', checked: work.hidden.includes(s.key), onchange: (e) => { work.hidden = work.hidden.filter((k) => k !== s.key); if (e.target.checked) work.hidden.push(s.key); apply(); } });
          slotsBox.append(h('div', { class: 'slot-row' }, h('span', { title: s.key }, s.label), texSel, h('span', {}, tint, ' ', h('button', { class: 'small', title: 'Reset tint', onclick: () => { delete work.tints[s.key]; tint.value = '#ffffff'; apply(); } }, '↺')), hide));
        }
      };
      render();
    },
    foot: (f) => {
      const isVrm = ap.look.kind === 'vrm' && ap.look.assetId;
      f.append(...[
        h('button', { onclick: () => { work.textures = {}; work.tints = {}; work.hidden = []; apply(); m.close(); openWardrobe(app, res, onDone); } }, 'Reset all'),
        isVrm ? h('button', { onclick: () => saveVariant('character') }, '💾 Save as character variant') : null,
        ap.outfit ? h('button', { onclick: () => saveVariant('outfit') }, '💾 Save as outfit variant') : null,
        h('button', { class: 'primary', onclick: () => { m.close(); } }, 'Done'),
      ].filter(Boolean));
    },
    onClose: () => {
      if (changed && JSON.stringify(ap.custom) !== before) {
        sim.gainXp(res, 10);
        onDone?.();
      }
    },
  });

  function apply() {
    changed = true;
    // everything edited lives in the resident's custom layer; variant selections are cleared
    // so what you see is exactly what is stored.
    ap.custom = JSON.parse(JSON.stringify(work));
    if (ap.look.kind === 'vrm') ap.look.variantId = null;
    if (ap.outfit) ap.outfit.variantId = null;
    res.applyLook();
  }

  async function saveVariant(kind) {
    const name = await prompt(`Name this ${kind} variant`, `${res.name}'s style`);
    if (!name) return;
    const isOutfit = kind === 'outfit';
    const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => isOutfit === k.startsWith('outfit:')).map(([k, v]) => [isOutfit ? k.slice(7) : k, v]));
    const look = {
      name,
      textures: pick(work.textures),
      tints: pick(work.tints),
      hidden: work.hidden.filter((k) => isOutfit === k.startsWith('outfit:')).map((k) => (isOutfit ? k.slice(7) : k)),
    };
    const assetId = isOutfit ? ap.outfit.assetId : ap.look.assetId;
    const v = await lib.saveVariant(assetId, look);
    // switch the resident to use the variant and drop the duplicated overrides
    if (isOutfit) ap.outfit.variantId = v.id; else ap.look.variantId = v.id;
    const keep = (k) => isOutfit !== k.startsWith('outfit:');
    ap.custom = {
      textures: Object.fromEntries(Object.entries(work.textures).filter(([k]) => keep(k))),
      tints: Object.fromEntries(Object.entries(work.tints).filter(([k]) => keep(k))),
      hidden: work.hidden.filter(keep),
    };
    await res.applyLook();
    toast(`Saved variant “${name}” — other residents can use it too.`);
  }
}
