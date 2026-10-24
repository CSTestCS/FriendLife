// Closet: personal alternate outfits for one resident. Each outfit can be an
// entirely different VRM model that belongs only to this resident (imported
// just for them), any character model from the library, or a copy of their
// current look. Tags make residents change automatically (rain coat when it
// rains, pyjamas at night, party outfit when dancing…).
import { h, openModal, toast, pickFiles, prompt, confirmBox, esc } from './dom.js';
import { select } from './creator.js';
import { OUTFIT_TAGS, PERCEPTIONS, outfitMeta } from '../sim/outfits.js';

export { OUTFIT_TAGS };

const tagIcons = (meta) => (meta?.tags || []).map((t) => OUTFIT_TAGS.find((x) => x[0] === t)?.[1].split(' ')[0]).join('');
const percIcons = (meta) => {
  const p = meta?.perception || {};
  const s = (p.self || []).map((t) => PERCEPTIONS[t]?.icon).join('');
  const o = (p.others || []).map((t) => PERCEPTIONS[t]?.icon).join('');
  return s || o ? ` · feels ${s || '–'} / looks ${o || '–'}` : '';
};

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
        wearing ? h('span', { class: 'tag good' }, 'wearing') : h('button', { class: 'small primary', onclick: () => {
          // clothes live in the wardrobe at home: they go there to change
          res.d.manualUntil = sim.clock + 180;
          if (sim.goChange(res, { index: idx, stay: res.inside === res.homeKey })) toast(`${res.name} heads to their wardrobe to change.`);
          else toast(`${res.name} can't change right now.`);
          sim.problems.newLook(res);
          rerender();
        } }, 'Wear'),
        idx >= 0 || outfits.length ? h('button', { class: 'small', title: 'Edit settings', onclick: () => editOutfit(app, res, idx, rerender) }, '✏') : null,
      ));
  };
  const mainName = res.d.look.kind === 'vrm' ? lib.displayName(res.d.look.assetId) : 'Built-in doll';
  const main = outfitMeta(res, -1);
  wrap.append(row(main.name || 'Main look', `${mainName} ${tagIcons(main)}${percIcons(main)}`, -1));
  outfits.forEach((o, i) => {
    const model = o.look.kind === 'vrm' ? lib.displayName(o.look.assetId) : 'doll';
    wrap.append(row(o.name, `${model} ${tagIcons(o)}${percIcons(o)}`, i));
  });
  if (res.d.mishap) wrap.append(h('div', { class: 'hint' }, `👗 Mishap: ${res.d.mishap.type}${res.d.mishap.owned ? ' (owning it 😎)' : ''}`));
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
  const isMain = idx < 0;
  const o = outfitMeta(res, idx);
  o.perception ||= { self: [], others: [] };
  const m = openModal({
    title: isMain ? `Main look: ${res.name}` : `Outfit: ${o.name}`,
    wide: true,
    body: (b) => {
      if (!isMain) {
        b.append(h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { type: 'text', value: o.name, oninput: (e) => { o.name = e.target.value || o.name; } })));
        if (o.look.kind === 'vrm') {
          const vars = lib.variants(o.look.assetId);
          b.append(h('div', { class: 'field' }, h('label', {}, `Model: ${lib.displayName(o.look.assetId)} — variant`),
            select([['', 'Default'], ...vars.map((v) => [v.id, v.name])], o.look.variantId || '', (v) => { o.look.variantId = v || null; })));
        }
      } else {
        b.append(h('p', { class: 'hint' }, 'Settings for the resident\'s main look (change the look itself in ✏️ Edit or 👕 Wardrobe).'),
          h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { type: 'text', value: o.name || 'Main look', oninput: (e) => { o.name = e.target.value || 'Main look'; } })));
      }
      const checks = (list, arr, set) => {
        const row = h('div', { class: 'tagrow' });
        for (const [k, label] of list) {
          row.append(h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: arr().includes(k), onchange: (e) => { const next = arr().filter((t) => t !== k); if (e.target.checked) next.push(k); set(next); } }), ` ${label}`));
        }
        return row;
      };
      b.append(h('div', { class: 'hint' }, 'Special names: an outfit called “Underwear” can be changed into anywhere (everything else needs the wardrobe at home). “Underwear” or anything with “Incomplete” in its name shows underwear when worn in public — people notice.'));
      o.tags ||= [];
      b.append(h('div', { class: 'field' }, h('label', {}, 'Wear automatically when…'),
        checks(OUTFIT_TAGS, () => o.tags, (v) => { o.tags = v; }),
        h('div', { class: 'hint' }, 'Activities (swimming, sleeping, working…) come first, then being at home / visiting, then weather & time of day, then out and about, then everyday. If several outfits fit at that level (say one for rain and one for the evening), they pick one at random.')));
      const percList = Object.entries(PERCEPTIONS).map(([k, p]) => [k, `${p.icon} ${p.label}`]);
      b.append(
        h('div', { class: 'field' }, h('label', {}, `How ${res.name} feels wearing it`), checks(percList, () => o.perception.self, (v) => { o.perception.self = v; })),
        h('div', { class: 'field' }, h('label', {}, 'How everyone else sees it'), checks(percList, () => o.perception.others, (v) => { o.perception.others = v; })),
        h('div', { class: 'hint' }, 'Feelings change their mood and confidence (powerful hits harder in fights, embarrassing makes them shy). Others react when they see it — compliments, flustered crushes, laughing, keeping their distance… The two can disagree!'),
      );
    },
    foot: (f) => f.append(...[
      isMain ? null : h('button', { class: 'danger', onclick: async () => {
        if (!(await confirmBox(`Remove “${o.name}” from ${res.name}'s closet?`, 'Remove'))) return;
        res.d.outfits.splice(idx, 1);
        if (res.d.wearing === idx) await sim.changeOutfit(res, -1, { quiet: true, force: true });
        else if (res.d.wearing > idx) res.d.wearing--;
        m.close();
        rerender();
      } }, '🗑 Remove'),
      h('button', { class: 'primary', onclick: async () => {
        m.close();
        if (!isMain && res.d.wearing === idx) { res.avatarCache?.clear(); await res.buildAvatar(); }
        rerender();
      } }, 'Done'),
    ].filter(Boolean)),
  });
}
