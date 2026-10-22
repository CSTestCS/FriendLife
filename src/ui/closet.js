// Closet: personal alternate outfits for one resident. Each outfit can be an
// entirely different VRM model that belongs only to this resident (imported
// just for them), any character model from the library, or a copy of their
// current look. Tags make residents change automatically (rain coat when it
// rains, pyjamas at night, party outfit when dancing…).
import { h, openModal, toast, pickFiles, prompt, confirmBox, esc } from './dom.js';
import { select } from './creator.js';

export const OUTFIT_TAGS = [
  ['default', '⭐ Everyday'], ['sunny', '☀️ Sunny'], ['rain', '🌧️ Rain'], ['snow', '❄️ Snow'], ['night', '🌙 Night'], ['party', '🎉 Dancing'],
];

export function closetSection(app, res, rerender) {
  const sim = app.sim;
  const lib = sim.library;
  const wrap = h('div', {});
  const outfits = res.d.outfits || (res.d.outfits = []);
  const row = (label, sub, idx) => {
    const wearing = res.d.wearing === idx;
    return h('div', { class: 'rel-row', style: { gridTemplateColumns: '22px 1fr auto', cursor: 'default' } },
      h('span', {}, wearing ? '👗' : '▫️'),
      h('span', {}, h('b', {}, label), sub ? h('span', { class: 'hint' }, ` ${sub}`) : null),
      h('span', { class: 'row', style: { gap: '4px' } },
        wearing ? h('span', { class: 'tag good' }, 'wearing') : h('button', { class: 'small primary', onclick: async () => { toast(`Changing ${res.name}…`); await sim.changeOutfit(res, idx); sim.problems.newLook(res); rerender(); } }, 'Wear'),
        idx >= 0 ? h('button', { class: 'small', title: 'Edit', onclick: () => editOutfit(app, res, idx, rerender) }, '✏') : null,
      ));
  };
  const mainName = res.d.look.kind === 'vrm' ? lib.displayName(res.d.look.assetId) : 'Built-in doll';
  wrap.append(row('Main look', mainName, -1));
  outfits.forEach((o, i) => {
    const model = o.look.kind === 'vrm' ? lib.displayName(o.look.assetId) : 'doll';
    const tags = (o.tags || []).map((t) => OUTFIT_TAGS.find((x) => x[0] === t)?.[1].split(' ')[0]).join('');
    wrap.append(row(o.name, `${model} ${tags}`, i));
  });
  wrap.append(h('div', { class: 'row', style: { marginTop: '6px' } },
    h('button', { class: 'small blue', onclick: () => addOutfit(app, res, rerender) }, '＋ Add outfit'),
    h('label', { class: 'tag', title: 'Change outfits automatically based on weather/time tags' }, h('input', { type: 'checkbox', checked: res.d.autoOutfits !== false, onchange: (e) => { res.d.autoOutfits = e.target.checked; } }), ' Auto-change'),
  ));
  return wrap;
}

function addOutfit(app, res, rerender) {
  const sim = app.sim;
  const lib = sim.library;
  const m = openModal({
    title: `＋ New outfit for ${res.name}`,
    body: (b) => {
      b.append(h('p', { class: 'hint' }, 'An outfit can be a completely different VRoid model (e.g. the same character exported with other clothes or hairstyle). Models imported here belong only to this resident.'));
      b.append(h('div', { class: 'title-buttons' },
        h('button', { class: 'primary', onclick: async () => {
          const files = await pickFiles('.vrm', true);
          if (!files.length) return;
          m.close();
          for (const f of files) {
            try {
              const a = await lib.importFile(f, 'character');
              await lib.setMeta(a.id, { ...lib.getMeta(a.id), owner: res.id });
              res.d.outfits.push({ name: a.name, look: { kind: 'vrm', assetId: a.id, variantId: null }, outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags: [] });
            } catch (err) { toast(err.message); }
          }
          toast(`Added ${files.length} outfit(s) to ${res.name}'s closet.`);
          sim.problems.newLook(res);
          rerender();
        } }, `⬆ Import .vrm just for ${res.name}`),
        h('button', { onclick: () => { m.close(); pickFromLibrary(app, res, rerender); } }, '📦 Use a model from the Library'),
        h('button', { onclick: () => {
          const cur = res.appearance();
          res.d.outfits.push({ name: `Outfit ${res.d.outfits.length + 1}`, look: JSON.parse(JSON.stringify(cur.look || res.d.look)), outfit: cur.outfit ? JSON.parse(JSON.stringify(cur.outfit)) : null, custom: JSON.parse(JSON.stringify(cur.custom || {})), tags: [] });
          m.close();
          toast('Copied the current look — restyle it in the 👕 Wardrobe after wearing it.');
          sim.problems.newLook(res);
          rerender();
        } }, '⧉ Copy current look (then restyle it)'),
      ));
    },
    foot: false,
  });
}

function pickFromLibrary(app, res, rerender) {
  const lib = app.sim.library;
  const chars = lib.list('character').filter((c) => !lib.getMeta(c.id).owner || lib.getMeta(c.id).owner === res.id);
  const outfits = lib.list('outfit');
  let charId = chars[0]?.id || '';
  let outfitId = '';
  const m = openModal({
    title: 'Outfit from the Library',
    body: (b) => {
      if (!chars.length) { b.append(h('div', { class: 'empty' }, 'No character models in the Library yet.')); return; }
      b.append(
        h('div', { class: 'field' }, h('label', {}, 'Body / character model'), select(chars.map((c) => [c.id, lib.displayName(c.id)]), charId, (v) => { charId = v; })),
        h('div', { class: 'field' }, h('label', {}, 'Clothing overlay (optional)'), select([['', 'None'], ...outfits.map((o) => [o.id, lib.displayName(o.id)])], '', (v) => { outfitId = v; })),
      );
    },
    foot: (f) => f.append(h('button', { class: 'primary', onclick: () => {
      if (!charId) return m.close();
      res.d.outfits.push({ name: lib.displayName(charId), look: { kind: 'vrm', assetId: charId, variantId: null }, outfit: outfitId ? { assetId: outfitId, variantId: null, parts: null, hideBase: [] } : null, custom: { textures: {}, tints: {}, hidden: [] }, tags: [] });
      m.close();
      app.sim.problems.newLook(res);
      rerender();
    } }, 'Add')),
  });
}

function editOutfit(app, res, idx, rerender) {
  const sim = app.sim;
  const lib = sim.library;
  const o = res.d.outfits[idx];
  const m = openModal({
    title: `Outfit: ${o.name}`,
    body: (b) => {
      b.append(h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { type: 'text', value: o.name, oninput: (e) => { o.name = e.target.value || o.name; } })));
      if (o.look.kind === 'vrm') {
        const vars = lib.variants(o.look.assetId);
        b.append(h('div', { class: 'field' }, h('label', {}, `Model: ${lib.displayName(o.look.assetId)} — variant`),
          select([['', 'Default'], ...vars.map((v) => [v.id, v.name])], o.look.variantId || '', (v) => { o.look.variantId = v || null; })));
      }
      const tags = h('div', { class: 'tagrow' });
      for (const [k, label] of OUTFIT_TAGS) {
        tags.append(h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: (o.tags || []).includes(k), onchange: (e) => { o.tags = (o.tags || []).filter((t) => t !== k); if (e.target.checked) o.tags.push(k); } }), ` ${label}`));
      }
      b.append(h('div', { class: 'field' }, h('label', {}, 'Wear automatically when…'), tags));
    },
    foot: (f) => f.append(
      h('button', { class: 'danger', onclick: async () => {
        if (!(await confirmBox(`Remove “${o.name}” from ${res.name}'s closet?`, 'Remove'))) return;
        res.d.outfits.splice(idx, 1);
        if (res.d.wearing === idx) await sim.changeOutfit(res, -1, { quiet: true });
        else if (res.d.wearing > idx) res.d.wearing--;
        m.close();
        rerender();
      } }, '🗑 Remove'),
      h('button', { class: 'primary', onclick: async () => {
        m.close();
        if (res.d.wearing === idx) { res.avatarCache?.clear(); await res.buildAvatar(); }
        rerender();
      } }, 'Done'),
    ),
  });
}
