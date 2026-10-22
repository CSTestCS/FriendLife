// Library: import and manage VRM characters, VRM outfits, textures and
// animations. Imported animations can replace built-in actions or be used as
// idle emotes. Textures can re-skin island surfaces.
import { h, openModal, toast, pickFiles, prompt, confirmBox, download, esc, choose } from './dom.js';
import { ASSET_TYPES, guessType } from '../core/library.js';
import { ACTION_LIST, BUILTIN_ANIMATIONS } from '../characters/builtinAnims.js';
import { fileExt } from '../core/util.js';
import { AnimationRegistry } from '../characters/registry.js';

export async function importFiles(app, files, forcedType) {
  const lib = app.sim.library;
  let count = 0;
  for (const file of files) {
    let type = forcedType || guessType(file.name);
    if (!type) { toast(`Can't import ${file.name} (unsupported type)`); continue; }
    if (fileExt(file.name) === 'vrm' && !forcedType) {
      type = await choose(`Import ${file.name}`, 'What is this VRM?', [
        { label: '🧍 A character', desc: 'Becomes a resident\'s body.', value: 'character', primary: true },
        { label: '👕 An outfit / parts', desc: 'Its clothes are fitted onto other residents.', value: 'outfit' },
      ]);
      if (!type) continue;
    }
    try {
      if (type === 'animation' && fileExt(file.name) === 'json') {
        const def = JSON.parse(await file.text());
        if (!def.keys && !def.tracks) throw new Error(`${file.name} is not a FriendLife animation (needs "keys" or "tracks").`);
      }
      const asset = await lib.importFile(file, type);
      if (type === 'animation') {
        const clip = await app.sim.registry.loadAsset(asset.id);
        if (!clip) { toast(`Imported ${asset.name}, but it failed to load: ${app.sim.registry.errors.get(asset.id)}`); continue; }
        const act = AnimationRegistry.guessAction(asset.name);
        const reg = app.sim.registry;
        if (act && !reg.actionMap[act]) {
          reg.actionMap[act] = asset.id;
          toast(`“${asset.name}” will be used for ${act} (change it in Library → Animations).`, 5000);
        }
      }
      count++;
      toast(`Imported ${ASSET_TYPES[type].label.replace(/s$/, '').toLowerCase()}: ${asset.name}`);
    } catch (err) {
      console.error(err);
      toast(`Import failed for ${file.name}: ${err.message}`);
    }
  }
  return count;
}

export function openLibrary(app, tab = 'character') {
  const sim = app.sim;
  const lib = sim.library;
  const reg = sim.registry;
  let current = tab;
  const urls = [];

  const m = openModal({
    title: '📦 Library',
    wide: true,
    body: (b) => {
      const tabs = h('div', { class: 'tabs' });
      const content = h('div', {});
      const tabBtns = Object.entries(ASSET_TYPES).map(([k, v]) => h('button', { class: k === current ? 'active' : '', onclick: () => { current = k; tabBtns.forEach((x) => x.classList.toggle('active', x.dataset.k === k)); render(); } }, v.label));
      tabBtns.forEach((btn, i) => { btn.dataset.k = Object.keys(ASSET_TYPES)[i]; });
      tabs.append(...tabBtns);
      b.append(tabs, content);

      const render = () => {
        content.innerHTML = '';
        const type = current;
        const def = ASSET_TYPES[type];
        const bar = h('div', { class: 'row', style: { marginBottom: '10px' } },
          h('button', { class: 'primary', onclick: async () => {
            const files = await pickFiles(def.exts.map((e) => `.${e}`).join(','));
            if (files.length && await importFiles(app, files, type)) render();
          } }, `⬆ Import ${def.exts.map((e) => `.${e}`).join(' / ')}`),
          lib.desktop ? h('button', { onclick: () => lib.desktop.openModsFolder(def.folder) }, '📂 Open mods folder') : null,
          h('button', { title: 'Adds a sample VRM mannequin, a VRM outfit and a .vrma dance so you can try every feature', onclick: async () => {
            try {
              const added = await lib.addSamples();
              for (const a of added) if (a.type === 'animation') await reg.loadAsset(a.id);
              toast(added.length ? `Added ${added.length} sample file(s).` : 'Samples are already in your library.');
              render();
            } catch (err) { toast(`Could not add samples: ${err.message}`); }
          } }, '🎁 Add sample content'),
          lib.desktop ? h('button', { onclick: async () => { await lib.scanMods(); await reg.loadAll(); render(); } }, '🔄 Rescan') : null,
          type === 'animation' ? h('button', { onclick: () => download('friendlife-animation-template.json', JSON.stringify(BUILTIN_ANIMATIONS.find((a) => a.name === 'wave'), null, 2)) }, '📄 JSON template') : null,
          type === 'animation' ? h('button', { onclick: () => { m.close(); app.openStudio(); } }, '🎬 Make one in the Studio') : null,
        );
        content.append(bar, h('div', { class: 'hint', style: { marginBottom: '10px' } }, HELP[type] + (lib.desktop ? ` Or drop files into the mods/${def.folder} folder next to FriendLife.exe.` : '')));
        const items = lib.list(type);
        if (!items.length) content.append(h('div', { class: 'empty' }, 'Nothing here yet. Import some files or drag & drop them onto the game window.'));
        for (const a of items) content.append(row(a));
      };

      const row = (a) => {
        const el = h('div', { class: 'asset-row' });
        const name = h('span', { class: 'nm', title: 'Click to rename', style: { cursor: 'text' }, onclick: async () => { const n = await prompt('Rename', lib.displayName(a.id)); if (n) { await lib.rename(a.id, n); render(); } } }, lib.displayName(a.id));
        if (a.type === 'texture') {
          const img = h('img', { class: 'thumb' });
          lib.getData(a.id).then((data) => { const u = URL.createObjectURL(new Blob([data])); urls.push(u); img.src = u; }).catch(() => {});
          el.append(img);
        } else el.append(h('span', { style: { fontSize: '24px' } }, { character: '🧍', outfit: '👕', animation: '🎞️' }[a.type]));
        const owner = lib.getMeta(a.id).owner ? sim.byId(lib.getMeta(a.id).owner) : null;
        if (owner) el.append(h('span', { class: 'badge', title: 'Personal outfit model' }, `👤 ${owner.name}'s`));
        el.append(name, h('span', { class: 'badge' }, a.source === 'mod' ? 'mods folder' : 'imported'), h('span', { class: 'badge' }, `${(a.size / 1024 / 1024).toFixed(1)} MB`));
        const grow = h('div', { class: 'grow' });
        el.append(grow);
        if (a.type === 'character') {
          grow.append(variantTags(a));
          el.append(h('button', { class: 'small primary', onclick: () => { m.close(); app.openCreator(null, { look: { kind: 'vrm', assetId: a.id, variantId: null } }); } }, '＋ New resident'));
          const users = sim.residents.filter((r) => r.d.look.assetId === a.id).map((r) => r.name);
          if (users.length) grow.append(h('div', { class: 'hint' }, `Used by ${users.join(', ')}`));
        }
        if (a.type === 'outfit') {
          grow.append(variantTags(a));
          if (sim.selected) el.append(h('button', { class: 'small primary', onclick: async () => { const r = sim.selected; r.d.outfit = { assetId: a.id, variantId: null, parts: null, hideBase: [] }; toast(`Dressing ${r.name}…`); await sim.rebuildAvatar(r); toast(`${r.name} is wearing ${lib.displayName(a.id)}.`); } }, `Dress ${sim.selected.name}`));
        }
        if (a.type === 'texture') {
          el.append(
            h('button', { class: 'small', onclick: () => app.setSurface('ground', a.id) }, 'Use for ground'),
            h('button', { class: 'small', onclick: () => app.setSurface('path', a.id) }, 'Use for paths'),
          );
        }
        if (a.type === 'animation') {
          const clip = reg.custom.get(a.id);
          const err = reg.errors.get(a.id);
          grow.append(h('div', { class: 'hint' }, err ? `⚠ ${err}` : clip ? `${clip.duration.toFixed(2)}s · ${a.ext.toUpperCase()}` : 'loading…'));
          const mapSel = h('select', { title: 'Use this animation instead of a built-in action', onchange: (e) => {
            for (const [k, v] of Object.entries(reg.actionMap)) if (v === a.id) delete reg.actionMap[k];
            if (e.target.value) reg.actionMap[e.target.value] = a.id;
            toast(e.target.value ? `“${lib.displayName(a.id)}” now plays for ${e.target.value}.` : 'Mapping removed.');
          } }, h('option', { value: '' }, 'Replace action: none'), ...ACTION_LIST.map((act) => h('option', { value: act, selected: reg.actionMap[act] === a.id }, `Replace: ${act}`)));
          const emote = h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: reg.emotes.has(a.id), onchange: (e) => { if (e.target.checked) reg.emotes.add(a.id); else reg.emotes.delete(a.id); } }), ' Idle emote');
          const loop = h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: clip ? clip.loop : true, onchange: async (e) => { await lib.setMeta(a.id, { ...lib.getMeta(a.id), loop: e.target.checked }); if (clip) clip.loop = e.target.checked; } }), ' Loop');
          el.append(...[mapSel, emote, loop,
            h('button', { class: 'small', disabled: !clip, onclick: () => {
              const r = sim.selected || sim.residents[0];
              if (!r || r.inside || r.engaged) return toast('Select a resident who is outside to preview.');
              r.clearPlan(); r.setPlan([{ kind: 'anim', anim: a.id, dur: Math.max(3, clip.duration * (clip.loop ? 2 : 1)) }]);
              toast(`${r.name} plays ${lib.displayName(a.id)}`);
            } }, '▶ Preview'),
            a.ext === 'json' ? h('button', { class: 'small', onclick: () => { m.close(); app.openStudio(a.id); } }, '✏ Edit') : null,
          ].filter(Boolean));
        }
        if (a.source !== 'mod') {
          el.append(h('button', { class: 'small danger', onclick: async () => {
            const users = sim.residents.filter((r) => r.d.look.assetId === a.id || r.d.outfit?.assetId === a.id);
            if (!(await confirmBox(`Delete ${lib.displayName(a.id)}?${users.length ? ` ${users.map((u) => u.name).join(', ')} will switch back to defaults.` : ''}`, 'Delete'))) return;
            await lib.remove(a.id);
            if (a.type === 'animation') reg.remove(a.id);
            if (a.type === 'texture') sim.textures.forget(a.id);
            for (const r of users) {
              if (r.d.look.assetId === a.id) r.d.look = { ...r.d.look, kind: 'doll', assetId: null, variantId: null };
              if (r.d.outfit?.assetId === a.id) r.d.outfit = null;
              await sim.rebuildAvatar(r);
            }
            render();
          } }, '🗑'));
        }
        return el;
      };

      const variantTags = (a) => {
        const vars = lib.variants(a.id);
        const box = h('div', { class: 'tagrow' });
        if (!vars.length) box.append(h('span', { class: 'hint' }, 'No variants yet — make some in the 👕 Wardrobe.'));
        for (const v of vars) {
          box.append(h('span', { class: 'tag' }, `🎨 ${v.name} `, h('button', { class: 'small', title: 'Rename', onclick: async () => { const n = await prompt('Variant name', v.name); if (n) { await lib.saveVariant(a.id, { ...v, name: n }); render(); } } }, '✏'),
            h('button', { class: 'small', title: 'Delete variant', onclick: async () => { await lib.deleteVariant(a.id, v.id); render(); } }, '✕')));
        }
        return box;
      };

      render();
    },
    onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  });
}

const HELP = {
  character: 'VRoid Studio: Export → VRM (0.x or 1.0). Each character can have many variants (texture swaps, tints, hidden parts).',
  outfit: 'Import a VRoid model wearing the clothes you want. Its Tops / Bottoms / Shoes / Accessory parts are fitted onto any resident\'s skeleton. Works best between VRoid models with similar body shapes.',
  texture: 'PNG / JPG images. Swap them onto avatar or outfit materials in the Wardrobe (use textures exported from VRoid Studio to keep the UV layout), or onto the island ground and paths.',
  animation: '.vrma (VRM Animation — e.g. from VRoid Hub, Blender VRM add-on, VRM Posing Desktop), .fbx from Mixamo (download as FBX, "Without Skin" is fine; tick "In Place" for walks/runs), or FriendLife JSON keyframe animations. Map them onto actions (walk, dance, punch…) or tick "Idle emote" so residents do them on their own.',
};
